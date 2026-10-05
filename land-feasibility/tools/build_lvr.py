# -*- coding: utf-8 -*-
"""
build_lvr.py — 把內政部實價登錄開放資料整理成本系統內建的「各行政區行情」資料檔。

輸入：按行政區整理好的 JSON（data/{縣市代碼}/{行政區}.json，欄位見 COLS），
      來源為內政部不動產成交案件實際資訊資料供應系統 (plvr.land.moi.gov.tw)
      之季別與本期開放資料（成屋買賣 A 檔、預售屋 B 檔），已排除備註含親友、
      員工、特殊關係等非常規交易，單價已扣除車位價格與車位面積。
輸出：js/data/lvr/{縣市代碼}.js —— 每縣市一檔，瀏覽器以 <script> 載入，不連網。

用法：python3 tools/build_lvr.py <輸入 data 目錄> <輸出 js/data/lvr 目錄>
只用 Python 標準函式庫。
"""
import json, os, re, sys, statistics as st
from datetime import date

SRC = sys.argv[1] if len(sys.argv) > 1 else "data"
OUT = sys.argv[2] if len(sys.argv) > 2 else "js/data/lvr"
SQM = 0.3025

CODE_NAME = {"A": "臺北市", "B": "臺中市", "C": "基隆市", "D": "臺南市", "E": "高雄市", "F": "新北市",
             "G": "宜蘭縣", "H": "桃園市", "I": "嘉義市", "J": "新竹縣", "K": "苗栗縣", "M": "南投縣",
             "N": "彰化縣", "O": "新竹市", "P": "雲林縣", "Q": "嘉義縣", "T": "屏東縣", "U": "花蓮縣",
             "V": "臺東縣", "W": "金門縣", "X": "澎湖縣", "Z": "連江縣"}

# 預售（B 檔）與新成屋（A 檔、屋齡五年內）採用的建物型態
PRE_TYPES = ["住宅大樓", "華廈", "透天厝", "廠辦", "辦公商業大樓", "店面", "套房"]
NEW_TYPES = ["住宅大樓", "華廈", "透天厝", "公寓"]
OLD_TYPES = ["住宅大樓", "華廈", "透天厝", "公寓"]
LAND_ZONES = ["住", "商", "工", "公保", "農", "其他"]

K_PRE = 36       # 每區每型態保留的預售案例數
K_PER_PROJ = 4   # 同一建案最多取幾筆，避免單一建案主導
K_NEW = 24       # 新成屋案例數
K_LAND = 20      # 土地案例數


def ym(d):
    return int(d) // 100   # 20250315 -> 202503


def road(addr, district):
    """只留到路名，不留門牌號碼。"""
    a = (addr or "").strip()
    for p in ("臺北市", "台北市", "新北市", "桃園市", "臺中市", "台中市", "臺南市", "台南市", "高雄市"):
        if a.startswith(p):
            a = a[len(p):]
    if district and a.startswith(district):
        a = a[len(district):]
    m = re.match(r"^(.*?(?:路|街|大道|段|巷|道))(?=[0-9０-９一二三四五六七八九十之和、 ]|$)", a)
    if m:
        a = m.group(1)
        a = re.sub(r"\d+巷$", "", a)
    a = re.split(r"[0-9０-９]", a)[0]
    return a[:14]


def section(addr):
    m = re.match(r"^(.*?段)", addr or "")
    return (m.group(1) if m else (addr or ""))[:10]


def q(vals, p):
    if not vals:
        return None
    s = sorted(vals)
    pos = (len(s) - 1) * p
    lo = int(pos)
    hi = min(lo + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (pos - lo)


def stats(vals, recent=None):
    """[n, p25, p50, p75, n近12月, p50近12月]，單價四捨五入到百元。"""
    if not vals:
        return None
    r = [len(vals), round(q(vals, .25), -2), round(q(vals, .5), -2), round(q(vals, .75), -2)]
    if recent is not None:
        r += [len(recent), round(q(recent, .5), -2) if recent else None]
    return r


def main():
    idx = json.load(open(os.path.join(SRC, "index.json"), encoding="utf-8"))
    built = idx.get("built", "")
    os.makedirs(OUT, exist_ok=True)
    summary = {}
    for code, cname in CODE_NAME.items():
        cdir = os.path.join(SRC, code)
        if not os.path.isdir(cdir):
            continue
        maxdate = 0
        mindate = 99999999
        dists = {}
        for fn in sorted(os.listdir(cdir)):
            if not fn.endswith(".json"):
                continue
            d = json.load(open(os.path.join(cdir, fn), encoding="utf-8"))
            C = d["cols"]
            ix = {k: i for i, k in enumerate(C)}
            g = lambda r, k: r[ix[k]]
            dname = d["district"]
            for k in ("sale", "presale", "land", "park"):
                for r in d.get(k, []):
                    maxdate = max(maxdate, g(r, "date"))
                    mindate = min(mindate, g(r, "date"))
            dists[dname] = (d, g)
        if not dists:
            continue
        # 近 12 個月的起點（以資料最晚交易月往回推）
        y, m = maxdate // 10000, (maxdate // 100) % 100
        cut12 = (y - 1) * 10000 + m * 100
        out = {}
        for dname, (d, g) in dists.items():
            rec = {"n": [len(d.get("sale", [])), len(d.get("presale", [])), len(d.get("land", [])), len(d.get("park", []))],
                   "s": {}, "c": {}}
            # ---- 預售 ----
            pre = [r for r in d.get("presale", []) if not g(r, "multi")]
            for t in PRE_TYPES:
                rows = [r for r in pre if g(r, "btype") == t and g(r, "unit") and g(r, "area") and g(r, "area") >= 5]
                if not rows:
                    continue
                vals = [g(r, "unit") for r in rows]
                rec12 = [g(r, "unit") for r in rows if g(r, "date") >= cut12]
                rec["s"]["P" + t] = stats(vals, rec12)
                # 車位：預售含車位者的車位總價（多數為一位）
                pk = [g(r, "parkPrice") for r in rows if g(r, "parkPrice") and 2e5 <= g(r, "parkPrice") <= 1.2e7]
                if pk:
                    rec["s"]["KP" + t] = [len(pk), round(q(pk, .25), -4), round(q(pk, .5), -4), round(q(pk, .75), -4)]
                # 去化速度：各建案「成交筆數 ÷ 首末成交月份跨距」，取建案中位數（成交 10 筆以上的建案）
                byp = {}
                for r in rows:
                    proj = (g(r, "extra") or "").split(" ")[0][:16]
                    if proj:
                        byp.setdefault(proj, []).append(g(r, "date"))
                rates = []
                for ds in byp.values():
                    if len(ds) < 10:
                        continue
                    a, b = min(ds), max(ds)
                    span = (b // 10000 - a // 10000) * 12 + ((b // 100) % 100 - (a // 100) % 100) + 1
                    rates.append(len(ds) / max(span, 1))
                if rates:
                    rec["s"]["A" + t] = [len(rates), round(st.median(rates), 1), round(q(rates, .25), 1), round(q(rates, .75), 1)]
                # 案例：依日期新到舊，同一建案最多 K_PER_PROJ 筆
                rows.sort(key=lambda r: -g(r, "date"))
                per = {}
                picked = []
                for r in rows:
                    proj = (g(r, "extra") or "").split(" ")[0][:16]
                    if per.get(proj, 0) >= K_PER_PROJ:
                        continue
                    per[proj] = per.get(proj, 0) + 1
                    picked.append([ym(g(r, "date")), road(g(r, "addr"), dname), g(r, "floor"), g(r, "tfloor"),
                                   round(g(r, "area"), 1), round(g(r, "unit") / 100), proj])
                    if len(picked) >= K_PRE:
                        break
                rec["c"]["P" + t] = picked
            # ---- 成屋（新成屋屋齡五年內／全部） ----
            sale = [r for r in d.get("sale", []) if not g(r, "multi")]
            for t in NEW_TYPES:
                rows = [r for r in sale if g(r, "btype") == t and g(r, "age") is not None and g(r, "age") <= 5
                        and g(r, "unit") and g(r, "area") and g(r, "area") >= 5]
                if rows:
                    vals = [g(r, "unit") for r in rows]
                    rec["s"]["N" + t] = stats(vals, [g(r, "unit") for r in rows if g(r, "date") >= cut12])
                    rows.sort(key=lambda r: -g(r, "date"))
                    rec["c"]["N" + t] = [[ym(g(r, "date")), road(g(r, "addr"), dname), g(r, "floor"), g(r, "tfloor"),
                                          round(g(r, "area"), 1), round(g(r, "unit") / 100), g(r, "age")]
                                         for r in rows[:K_NEW]]
            for t in OLD_TYPES:
                rows = [r for r in sale if g(r, "btype") == t and g(r, "unit")]
                if rows:
                    vals = [g(r, "unit") for r in rows]
                    ages = [g(r, "age") for r in rows if g(r, "age") is not None]
                    s = stats(vals)
                    s.append(round(st.median(ages), 1) if ages else None)
                    rec["s"]["O" + t] = s
            # ---- 土地（元／坪土地） ----
            land = d.get("land", [])
            for z in LAND_ZONES:
                rows = [r for r in land if g(r, "btype") == z and g(r, "unit") and g(r, "area") and g(r, "area") >= 3]
                if not rows:
                    continue
                vals = [g(r, "unit") for r in rows]
                big = [g(r, "unit") for r in rows if g(r, "area") >= 100]
                s = stats(vals, [g(r, "unit") for r in rows if g(r, "date") >= cut12])
                s += [len(big), round(q(big, .5), -2) if big else None]
                rec["s"]["L" + z] = s
                rows.sort(key=lambda r: (-(g(r, "area") >= 30), -g(r, "date")))
                rec["c"]["L" + z] = [[ym(g(r, "date")), section(g(r, "addr")), round(g(r, "area"), 1),
                                      round(g(r, "unit") / 100), (g(r, "extra") or "")[:18]]
                                     for r in rows[:K_LAND]]
            # ---- 大面積舊建物房地交易（土地 300 坪以上、屋齡 30 年以上）：以總價 ÷ 土地坪數作為地價參考 ----
            # 舊廠房、舊透天整宗出售時，建物殘值很低，成交價幾乎就是地價（例：三重溪尾街 TOYOTA 舊廠）。
            # 開放資料的成屋檔沒有使用分區欄位，因此只列為參考案例，不併入分區土地中位數。
            # 整宗舊廠房多為多筆地號、多棟建物合併登記，因此這裡包含開放資料標記為多筆的交易
            big = [r for r in d.get("sale", []) if (g(r, "landPing") or 0) >= 300 and (g(r, "age") or 0) >= 30 and g(r, "total")]
            big.sort(key=lambda r: -g(r, "date"))
            if big:
                rec["c"]["X"] = [[ym(g(r, "date")), road(g(r, "addr"), dname), round(g(r, "landPing"), 1),
                                  round(g(r, "total") / g(r, "landPing") / 100), round(g(r, "age") or 0),
                                  round(g(r, "area") or 0, 1), round(g(r, "total") / 1e4)]
                                 for r in big[:12]]
            # ---- 單獨車位交易（元／位） ----
            park = d.get("park", [])
            for t in ("坡道平面", "坡道機械", "升降平面", "升降機械", "塔式車位", "一樓平面"):
                vals = [g(r, "unit") for r in park if g(r, "btype") == t and g(r, "unit")]
                if vals:
                    rec["s"]["K" + t] = [len(vals), round(q(vals, .25), -4), round(q(vals, .5), -4), round(q(vals, .75), -4)]
            out[dname] = rec
        meta = {"code": code, "county": cname, "built": built,
                "from": "%04d-%02d" % (mindate // 10000, (mindate // 100) % 100),
                "to": "%04d-%02d" % (maxdate // 10000, (maxdate // 100) % 100),
                "recentFrom": "%04d-%02d" % (cut12 // 10000, (cut12 // 100) % 100)}
        js = ("/* " + cname + " 實價登錄行情（由 tools/build_lvr.py 產生，請勿手改）。\n"
              "   來源：內政部不動產成交案件實際資訊資料供應系統開放資料（成屋買賣、預售屋買賣），\n"
              "   交易期間 " + meta["from"] + " ～ " + meta["to"] + "，資料整理日 " + built + "。\n"
              "   單價已扣除車位價格與車位面積；已排除親友、員工等特殊交易與多戶合併交易。*/\n"
              "window.TD = window.TD || {};\n(function (TD) {\n  'use strict';\n"
              "  TD.data = TD.data || {};\n  TD.data.lvr = TD.data.lvr || { counties: {} };\n"
              "  TD.data.lvr.counties[" + json.dumps(cname, ensure_ascii=False) + "] = "
              + json.dumps({"meta": meta, "d": out}, ensure_ascii=False, separators=(",", ":"))
              + ";\n})(window.TD);\n")
        path = os.path.join(OUT, code + ".js")
        with open(path, "w", encoding="utf-8") as f:
            f.write(js)
        summary[code] = (cname, len(out), os.path.getsize(path))
    tot = 0
    for code, (n, k, sz) in summary.items():
        tot += sz
        print(code, n, k, "districts", round(sz / 1024), "KB")
    print("total", round(tot / 1024), "KB")


if __name__ == "__main__":
    main()
