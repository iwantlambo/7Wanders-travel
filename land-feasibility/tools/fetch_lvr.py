# -*- coding: utf-8 -*-
"""
fetch_lvr.py — 下載內政部實價登錄開放資料（本期＋近幾季），整理成 tools/build_lvr.py 的輸入格式。

資料來源（免費、免登入，政府資料開放授權條款）：
    本期：  https://plvr.land.moi.gov.tw/Download?type=zip&fileName=lvr_landcsv.zip
    季別：  https://plvr.land.moi.gov.tw/DownloadSeason?season=115S2&type=zip&fileName=lvr_landcsv.zip
    每個壓縮檔內有各縣市的 {代碼}_lvr_land_a.csv（不動產買賣）、_b.csv（預售屋買賣）、_c.csv（租賃）。

輸出（給 build_lvr.py）：
    <out>/{縣市代碼}/{行政區}.json   {county, district, cols, sale, presale, land, park}
    <out>/index.json                 {built, sources, counties: {代碼: {name, sale, presale, land, park, from, to}}}
    每筆紀錄的欄位見 COLS；單價為元／坪，建物面積已扣除有價車位的面積，總價已扣除車位價格。

用法：
    python3 tools/fetch_lvr.py --out .lvr-data --cache .lvr-cache --seasons 8
    python3 tools/fetch_lvr.py --out .lvr-data --from-dir 已下載的壓縮檔或解壓目錄（離線測試用）

季別資料發布後不再變動，下載過的季別存在 --cache，下次直接使用；本期每次重新下載。
資料筆數明顯不足時（例如網站改版、下載到錯誤頁面）以非零碼結束，GitHub Actions 就不會提交殘缺資料。
只用 Python 標準函式庫。
"""
import argparse
import csv
import io
import json
import os
import re
import ssl
import subprocess
import sys
import time
import zipfile
from datetime import date, datetime, timedelta, timezone

BASE = "https://plvr.land.moi.gov.tw"
SQM = 0.3025  # 平方公尺 → 坪
TW = timezone(timedelta(hours=8))
COUNTIES = {"A": "臺北市", "B": "臺中市", "C": "基隆市", "D": "臺南市", "E": "高雄市", "F": "新北市",
            "G": "宜蘭縣", "H": "桃園市", "I": "嘉義市", "J": "新竹縣", "K": "苗栗縣", "M": "南投縣",
            "N": "彰化縣", "O": "新竹市", "P": "雲林縣", "Q": "嘉義縣", "T": "屏東縣", "U": "花蓮縣",
            "V": "臺東縣", "W": "金門縣", "X": "澎湖縣", "Z": "連江縣"}
COLS = ["addr", "date", "floor", "tfloor", "btype", "age", "area", "unit", "total", "parkPrice",
        "pkBundled", "landPing", "remark", "extra", "multi"]

# 非常規交易（不動產估價技術規則第23條所稱情況特殊者）：備註含下列字樣者不採用
UNUSUAL = ["親友", "親屬", "二親等", "關係人", "特殊關係", "員工", "受僱", "法拍", "拍賣", "強制執行", "急買", "急賣",
           "債權債務", "贈與", "遺產", "共有物分割", "瑕疵", "凶宅", "含增建", "毛胚", "非市場"]
BUILDING_TYPES = ["住宅大樓", "華廈", "公寓", "透天厝", "套房", "店面", "辦公商業大樓", "廠辦", "工廠", "倉庫", "農舍"]
ZH_DIGIT = {"零": 0, "〇": 0, "一": 1, "二": 2, "兩": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}

# 最少筆數：低於這個數字視為下載或格式出錯，整批不採用
MIN_SALE_TOTAL = 60000
MIN_PRESALE_TOTAL = 15000
MIN_SALE_BIG6 = 2000   # 六都各自的成屋買賣筆數下限


# ---------------------------------------------------------------- 下載

def ssl_context():
    ctx = ssl.create_default_context()
    # 政府憑證鏈缺 Subject Key Identifier 時，Python 3.13 的嚴格模式會拒絕；只關閉這一項，其餘驗證照常
    if hasattr(ssl, "VERIFY_X509_STRICT"):
        ctx.verify_flags &= ~ssl.VERIFY_X509_STRICT
    return ctx


def download(url, tries=3):
    from urllib.request import Request, urlopen
    last = None
    for i in range(tries):
        try:
            req = Request(url, headers={"User-Agent": "Mozilla/5.0 (land-feasibility data refresh)"})
            with urlopen(req, context=ssl_context(), timeout=240) as r:
                data = r.read()
        except Exception as e:  # 退回系統 curl（憑證庫不同）
            last = e
            try:
                p = subprocess.run(["curl", "-sSfL", "--max-time", "300", "-A", "Mozilla/5.0", url],
                                   capture_output=True, timeout=330)
                data = p.stdout if p.returncode == 0 else b""
                if p.returncode != 0:
                    last = RuntimeError(p.stderr.decode("utf-8", "ignore").strip())
            except Exception as e2:
                last = e2
                data = b""
        if data[:2] == b"PK":
            return data
        time.sleep(5 * (i + 1))
    raise RuntimeError("下載失敗或內容不是 ZIP：%s（%s）" % (url, last))


def recent_seasons(n, today=None):
    t = today or datetime.now(TW).date()
    y, q = t.year - 1911, (t.month - 1) // 3 + 1
    out = []
    for _ in range(n):
        q -= 1
        if q < 1:
            q, y = 4, y - 1
        out.append("%dS%d" % (y, q))
    return out


# ---------------------------------------------------------------- 解析工具

def zh_int(s):
    s = (s or "").strip()
    if not s:
        return None
    if s.isdigit():
        return int(s)
    total, cur = 0, 0
    for ch in s:
        if ch in ZH_DIGIT:
            cur = ZH_DIGIT[ch]
        elif ch == "十":
            total += (cur or 1) * 10
            cur = 0
        elif ch == "百":
            total += (cur or 1) * 100
            cur = 0
        else:
            return None
    return total + cur


def floor_no(text):
    """「十二層」→12、「地下一層」→-1、「三層，四層」取第一個；看不懂回 None。"""
    t = (text or "").strip()
    if not t:
        return None
    first = re.split(r"[，,、]", t)[0]
    neg = "地下" in first
    core = re.sub(r"地下|地上|層|樓|之.*|全", "", first).strip()
    n = zh_int(core)
    if n is None:
        return None
    return -n if neg else n


def roc_date(text, today):
    """民國年月日（1150915 或 115/09/15）→ date；月份或日為 0 時以 1 計；明顯在未來的資料不採用。"""
    s = re.sub(r"\D", "", text or "")
    if len(s) < 5:
        return None
    s = s.zfill(7) if len(s) >= 6 else s.zfill(5) + "01"
    try:
        d = date(int(s[:3]) + 1911, int(s[3:5]) or 1, int(s[5:7]) or 1)
    except ValueError:
        return None
    if (d - today).days > 31:
        return None
    return d


def to_num(x):
    try:
        return float(str(x).replace(",", "").strip())
    except (TypeError, ValueError):
        return 0.0


def btype(text, use=""):
    t = text or ""
    if "農舍" in (use or "") or ("農業用" in (use or "") and "透天" in t):
        return "農舍"
    for b in BUILDING_TYPES:
        if b in t:
            return b
    return "其他"


def multi_flag(text):
    """交易筆棟數「土地2建物2車位0」：建物 2 棟（戶）以上為多戶合計，單價不宜直接比較。"""
    m = re.search(r"建物(\d+)", text or "")
    return 1 if (m and int(m.group(1)) > 1) else 0


def zone_class(urban, nonurban, remark):
    """土地交易的分區類別：住／商／工／公保（公共設施保留地）／農／保護／非都市／其他。"""
    z = (urban or "").strip()
    if "公共設施保留地" in (remark or ""):
        return "公保"
    if not z:
        return "非都市" if (nonurban or "").strip() else "其他"
    for keys, cls in ((("保護區", "保育區", "保存區", "風景區"), "保護"),
                      (("住宅", "住"), "住"), (("商業", "商"), "商"),
                      (("工業", "產業", "工"), "工"), (("農業", "農"), "農")):
        for k in keys:
            if k in z:
                return cls
    return "其他"


def read_csv_bytes(raw):
    for enc in ("utf-8-sig", "utf-8", "cp950", "big5"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        return []
    rows = list(csv.reader(io.StringIO(text)))
    if not rows:
        return []
    head = [h.strip().replace("﻿", "") for h in rows[0]]
    start = 1
    # 第二列是英文欄名（The villages and towns urban district, ...）
    if len(rows) > 1 and rows[1] and re.match(r"^[A-Za-z]", (rows[1][0] or "").strip()):
        start = 2
    out = []
    for r in rows[start:]:
        if len(r) < 6:
            continue
        out.append(dict(zip(head, r)))
    return out


def get(r, *keys):
    for k in keys:
        if k in r and r[k] is not None:
            return r[k]
    return ""


def building_record(r, d, total, extra):
    """房地與預售共用：扣除有價車位的面積與價格後算單價（元／坪）。"""
    area_m2 = to_num(get(r, "建物移轉總面積平方公尺", "建物移轉總面積"))
    park_m2 = to_num(get(r, "車位移轉總面積(平方公尺)", "車位移轉總面積平方公尺"))
    park_price = to_num(get(r, "車位總價元"))
    has_park = bool(get(r, "車位類別").strip()) or park_m2 > 0
    area = (area_m2 - (park_m2 if park_price > 0 else 0)) * SQM
    if area <= 3:
        return None
    unit = (total - park_price) / area
    if not (5e3 < unit < 1e7):
        return None
    done = roc_date(get(r, "建築完成年月"), d + timedelta(days=3650))
    age = round(max(0.0, (d - done).days / 365.25), 1) if done else None
    return [get(r, "土地位置建物門牌").strip(), int(d.strftime("%Y%m%d")), floor_no(get(r, "移轉層次")),
            floor_no(get(r, "總樓層數")), btype(get(r, "建物型態"), get(r, "主要用途")), age, round(area, 2), round(unit),
            round(total), round(park_price), 1 if (has_park and park_price == 0) else 0,
            round(to_num(get(r, "土地移轉總面積平方公尺")) * SQM, 2), get(r, "備註")[:40], extra,
            multi_flag(get(r, "交易筆棟數"))]


def unusual(remark):
    return any(k in (remark or "") for k in UNUSUAL)


class Store:
    """依縣市、行政區累積紀錄；以「編號」去重（同一案件出現在本期與季別時只留一筆）。"""

    def __init__(self):
        self.data = {}   # code -> district -> kind -> {id: rec}
        self.seen = set()

    def put(self, code, dist, kind, sid, rec):
        key = (code, kind, sid)
        if key in self.seen:
            return
        self.seen.add(key)
        self.data.setdefault(code, {}).setdefault(dist or "其他", {}).setdefault(kind, {})[sid] = rec


def parse_a(rows, code, store, today):
    for r in rows:
        target = get(r, "交易標的")
        remark = get(r, "備註")
        if unusual(remark):
            continue
        d = roc_date(get(r, "交易年月日"), today)
        total = to_num(get(r, "總價元"))
        if not d or total <= 0:
            continue
        dist = get(r, "鄉鎮市區").strip()
        sid = get(r, "編號").strip() or "%s|%s|%s" % (get(r, "土地位置建物門牌"), d, total)
        if target == "土地":
            ping = to_num(get(r, "土地移轉總面積平方公尺")) * SQM
            if ping < 1 or "道路用地" in remark or "政府機關標讓售" in remark:
                continue
            zone_text = get(r, "都市土地使用分區").strip()
            rec = [get(r, "土地位置建物門牌").strip(), int(d.strftime("%Y%m%d")), None, None,
                   zone_class(zone_text, get(r, "非都市土地使用分區"), remark), None, round(ping, 2), round(total / ping),
                   round(total), 0, 0, round(ping, 2), remark[:40], zone_text, 0]
            store.put(code, dist, "land", sid, rec)
        elif target == "車位":
            m = re.search(r"車位(\d+)", get(r, "交易筆棟數"))
            n = int(m.group(1)) if m else 1
            if n < 1 or n > 3:
                continue
            per = total / n
            if not (5e4 < per < 8e6):
                continue
            kind = get(r, "車位類別").strip() or "其他"
            rec = [get(r, "土地位置建物門牌").strip(), int(d.strftime("%Y%m%d")), floor_no(get(r, "移轉層次")),
                   floor_no(get(r, "總樓層數")), kind, None,
                   round(to_num(get(r, "車位移轉總面積(平方公尺)", "車位移轉總面積平方公尺")) * SQM / n, 2),
                   round(per), round(total), 0, 0, 0, remark[:40], kind, 0]
            store.put(code, dist, "park", sid, rec)
        elif "建物" in target:
            rec = building_record(r, d, total, "")
            if rec:
                store.put(code, dist, "sale", sid, rec)


def parse_b(rows, code, store, today):
    for r in rows:
        if get(r, "解約情形").strip():
            continue
        if unusual(get(r, "備註")) or "建物" not in get(r, "交易標的"):
            continue
        d = roc_date(get(r, "交易年月日"), today)
        total = to_num(get(r, "總價元"))
        if not d or total <= 0:
            continue
        extra = (get(r, "建案名稱").strip() + " " + get(r, "棟及號").strip()).strip()[:40]
        rec = building_record(r, d, total, extra)
        if rec:
            sid = get(r, "編號").strip() or "%s|%s|%s" % (extra, d, total)
            store.put(code, get(r, "鄉鎮市區").strip(), "presale", sid, rec)


def parse_zip(data, store, today):
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for name in z.namelist():
            base = name.split("/")[-1].lower()
            m = re.match(r"^([a-z])_lvr_land_([ab])\.csv$", base)
            if not m:
                continue
            code = m.group(1).upper()
            if code not in COUNTIES:
                continue
            rows = read_csv_bytes(z.read(name))
            if m.group(2) == "a":
                parse_a(rows, code, store, today)
            else:
                parse_b(rows, code, store, today)


def zips_from_dir(path):
    """離線測試：讀一個目錄裡的 .zip，或已解壓的 *_lvr_land_[ab].csv（包成記憶體中的 zip）。"""
    out = []
    for fn in sorted(os.listdir(path)):
        full = os.path.join(path, fn)
        if fn.lower().endswith(".zip"):
            out.append((fn, open(full, "rb").read()))
    csvs = [fn for fn in sorted(os.listdir(path)) if re.match(r"^[a-z]_lvr_land_[ab]\.csv$", fn.lower())]
    if csvs:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            for fn in csvs:
                z.write(os.path.join(path, fn), fn)
        out.append(("csv-dir", buf.getvalue()))
    return out


# ---------------------------------------------------------------- 主程式

def main():
    ap = argparse.ArgumentParser(description="下載並整理實價登錄開放資料")
    ap.add_argument("--out", required=True, help="輸出目錄（build_lvr.py 的輸入）")
    ap.add_argument("--cache", default=".lvr-cache", help="季別壓縮檔快取目錄")
    ap.add_argument("--seasons", type=int, default=8, help="下載近幾季歷史資料（不含本期）")
    ap.add_argument("--no-current", action="store_true", help="不下載本期資料")
    ap.add_argument("--from-dir", help="不連網，改讀這個目錄裡的 zip 或 csv（測試用）")
    ap.add_argument("--min-check", default="on", choices=["on", "off"], help="筆數下限檢查（測試小資料時關閉）")
    a = ap.parse_args()

    today = datetime.now(TW).date()
    store = Store()
    sources = []

    if a.from_dir:
        for name, data in zips_from_dir(a.from_dir):
            parse_zip(data, store, today)
            sources.append(name)
    else:
        os.makedirs(a.cache, exist_ok=True)
        if not a.no_current:
            print("下載本期資料…", flush=True)
            data = download(BASE + "/Download?type=zip&fileName=lvr_landcsv.zip")
            parse_zip(data, store, today)
            sources.append("cur_" + today.strftime("%Y%m%d"))
        for s in recent_seasons(a.seasons, today):
            path = os.path.join(a.cache, s + ".zip")
            if os.path.exists(path) and os.path.getsize(path) > 1000:
                data = open(path, "rb").read()
                print("季別 %s（快取）" % s, flush=True)
            else:
                print("下載季別 %s…" % s, flush=True)
                try:
                    data = download(BASE + "/DownloadSeason?season=%s&type=zip&fileName=lvr_landcsv.zip" % s)
                except RuntimeError as e:
                    print("  略過 %s：%s" % (s, e), flush=True)   # 剛結束的季別可能尚未發布
                    continue
                with open(path, "wb") as f:
                    f.write(data)
            parse_zip(data, store, today)
            sources.append(s)

    os.makedirs(a.out, exist_ok=True)
    index = {"built": datetime.now(TW).strftime("%Y-%m-%d %H:%M"), "sources": sources, "counties": {}}
    tot_sale = tot_pre = 0
    problems = []
    for code, cname in COUNTIES.items():
        dists = store.data.get(code, {})
        cdir = os.path.join(a.out, code)
        os.makedirs(cdir, exist_ok=True)
        cinfo = {"name": cname, "sale": 0, "presale": 0, "land": 0, "park": 0, "from": None, "to": None, "districts": {}}
        for dname, kinds in sorted(dists.items()):
            rec = {"county": cname, "district": dname, "cols": COLS}
            counts = {}
            for kind in ("sale", "presale", "land", "park"):
                rows = sorted(kinds.get(kind, {}).values(), key=lambda r: r[1])
                rec[kind] = rows
                counts[kind] = len(rows)
                cinfo[kind] += len(rows)
                for r in rows:
                    cinfo["from"] = r[1] if cinfo["from"] is None else min(cinfo["from"], r[1])
                    cinfo["to"] = r[1] if cinfo["to"] is None else max(cinfo["to"], r[1])
            cinfo["districts"][dname] = counts
            safe = re.sub(r"[\\/:*?\"<>|]", "_", dname)
            with open(os.path.join(cdir, safe + ".json"), "w", encoding="utf-8") as f:
                json.dump(rec, f, ensure_ascii=False, separators=(",", ":"))
        index["counties"][code] = cinfo
        tot_sale += cinfo["sale"]
        tot_pre += cinfo["presale"]
        print("%s %s：成屋 %d、預售 %d、土地 %d、車位 %d" % (code, cname, cinfo["sale"], cinfo["presale"], cinfo["land"], cinfo["park"]))
        if code in ("A", "B", "D", "E", "F", "H") and cinfo["sale"] < MIN_SALE_BIG6:
            problems.append("%s 成屋買賣只有 %d 筆" % (cname, cinfo["sale"]))
    with open(os.path.join(a.out, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=1)

    if tot_sale < MIN_SALE_TOTAL:
        problems.append("全國成屋買賣只有 %d 筆（下限 %d）" % (tot_sale, MIN_SALE_TOTAL))
    if tot_pre < MIN_PRESALE_TOTAL:
        problems.append("全國預售屋買賣只有 %d 筆（下限 %d）" % (tot_pre, MIN_PRESALE_TOTAL))
    print("合計：成屋 %d、預售 %d；來源 %s" % (tot_sale, tot_pre, "、".join(sources)))
    if problems and a.min_check == "on":
        print("資料筆數異常，不採用這批資料：" + "；".join(problems), file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
