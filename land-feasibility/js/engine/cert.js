/* 土地使用分區證明書與細部計畫條文解析：從貼上的文字抓出使用分區、建蔽率、容積率、退縮、高度、開挖率、停車標準與附帶條件，法規檢討優先採用。*/
window.TD = window.TD || {};
(function (TD) {
  'use strict';

  TD.engine = TD.engine || {};

  /* ------------------------------------------------------------------
     為什麼要有這一段

     內建的分區表只能給「通案值」：新北市住宅區容積率依細部計畫而不同、
     臺北市有「之一」「（特）」等細分區、各細部計畫另訂退縮、停車與開挖率，
     還有回饋、捐地、都市設計審議等附帶條件。這些只有該地號的
     「土地使用分區證明書」與細部計畫土地使用分區管制要點寫得清楚。

     使用者把證明書（或細部計畫條文）整段貼上，這裡逐行抓出：
       使用分區（含「部分○○區、部分道路用地」）、各地號的分區、
       建蔽率、容積率（含面前道路未達 8 公尺的折減規定）、臨路退縮、
       高度與層數限制、開挖率、停車標準、最小開發規模、捷運場站距離、
       是否位於更新地區、容積移轉接受基地限制，以及附帶條件。
     每一項都留原文行號，抓不到就明講抓不到，不猜。

     細部計畫條文常一次列出多個分區（「住宅區建蔽率 50%、容積率 300%；
     商業區 70%、440%」），所以每個數值都記下「屬於哪個分區」，
     最後依證明書上的使用分區（或左欄選的分區）挑出本案適用的那一組。

     純函式：不碰 DOM、不碰儲存、不發任何網路請求。
     ------------------------------------------------------------------ */

  var MAX_LINES = 600;

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function str(v) { return (v === null || v === undefined) ? '' : String(v); }
  function trim(s) { return str(s).replace(/^[\s　]+/, '').replace(/[\s　]+$/, ''); }
  function compact(s) { return str(s).replace(/[\s　]+/g, ''); }
  function hasOwn(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }

  /* 行正規化：全形數字與英文字母、全形標點轉半形；句號保留（用來切句）*/
  function norm(s) {
    var out = str(s);
    out = out.replace(/　/g, ' ');
    out = out.replace(/[０-９Ａ-Ｚａ-ｚ]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0); });
    out = out.replace(/[％﹪]/g, '%').replace(/：/g, ':').replace(/；/g, ';').replace(/，/g, ',');
    out = out.replace(/（/g, '(').replace(/）/g, ')').replace(/．/g, '.').replace(/／/g, '/');
    out = out.replace(/[－‐‑‒–—―−]/g, '-').replace(/[～〜]/g, '~');
    out = out.replace(/平方米/g, '平方公尺').replace(/㎡/g, '平方公尺').replace(/([0-9])\s*[mM]2(?![0-9])/g, '$1平方公尺');
    out = out.replace(/台(北|中|南|東)/g, '臺$1');
    return trim(out);
  }

  /* 中文數字：「二百一十」→ 210、「六十」→ 60、「四」→ 4、「三點五」→ 3.5；全為阿拉伯數字時直接轉 */
  var ZD = { '零': 0, '〇': 0, '○': 0, '一': 1, '壹': 1, '二': 2, '貳': 2, '兩': 2, '三': 3, '參': 3,
             '四': 4, '肆': 4, '五': 5, '伍': 5, '六': 6, '陸': 6, '七': 7, '柒': 7, '八': 8, '捌': 8, '九': 9, '玖': 9 };
  var ZU = { '十': 10, '拾': 10, '百': 100, '佰': 100, '千': 1000, '仟': 1000 };

  function zhNum(s) {
    var t = compact(s), dot = t.indexOf('點'), ip = dot >= 0 ? t.slice(0, dot) : t, fp = dot >= 0 ? t.slice(dot + 1) : '';
    var total = 0, cur = 0, i, ch, hasUnit = false, digits = '', v, dec;
    if (t === '') return null;
    if (/^[0-9]+(\.[0-9]+)?$/.test(t)) return Number(t);
    for (i = 0; i < ip.length; i++) {
      ch = ip.charAt(i);
      if (hasOwn(ZD, ch)) { cur = ZD[ch]; digits += String(ZD[ch]); }
      else if (hasOwn(ZU, ch)) { hasUnit = true; total += (cur || 1) * ZU[ch]; cur = 0; }
      else return null;
    }
    v = hasUnit ? total + cur : (digits === '' ? 0 : Number(digits));
    if (fp) {
      dec = '';
      for (i = 0; i < fp.length; i++) {
        ch = fp.charAt(i);
        if (!hasOwn(ZD, ch)) return null;
        dec += String(ZD[ch]);
      }
      v = Number(String(v) + '.' + dec);
    }
    return isFinite(v) ? v : null;
  }

  var ZH_DIGITS = '零〇○一二兩三四五六七八九十百千點壹貳參肆伍陸柒捌玖拾佰仟';
  var NUM_SRC = '([0-9]+(?:\\.[0-9]+)?|[' + ZH_DIGITS + ']+)';
  var METER_SRC = '\\s*(?:公尺|米|[mM](?![a-zA-Z0-9]))';

  /* 數字（阿拉伯或中文）→ 數值 */
  function numOf(s) {
    var t = compact(s).replace(/,/g, '');
    if (/^[0-9]+(\.[0-9]+)?$/.test(t)) return Number(t);
    return zhNum(t);
  }

  /* 找第一個百分比：「60%」「百分之六十」「百分之 60」→ 0.6 */
  var PCT_RE = new RegExp('([0-9]+(?:\\.[0-9]+)?)\\s*%|百分之\\s*([0-9]+(?:\\.[0-9]+)?|[' + ZH_DIGITS + ']+)');
  function pctIn(seg) {
    var m = PCT_RE.exec(seg), n;
    if (!m) return null;
    n = m[1] !== undefined ? Number(m[1]) : numOf(m[2]);
    if (!isNum(n)) return null;
    return { v: n / 100, idx: m.index, len: m[0].length, text: m[0] };
  }

  /* ---------------- 分區名稱 ---------------- */

  var FACILITY = '道路|公園|綠地|廣場|兒童遊樂場|停車場|學校|文小|文中|文高|文大|機關|市場|變電所|自來水事業|污水處理廠|'
               + '垃圾處理場|體育場|運動場|醫療衛生|社教|加油站|鐵路|捷運系統|捷運|高速公路|河道|溝渠|排水|堤防|港埠|墓地|'
               + '殯儀館|郵政|電信|消防|警察|抽水站|人行步道|綠帶|園道|公用事業|公共設施|水溝|灌溉|鄰里公園|兒童遊戲場';
  var MARK = '(?:\\((?:特|再|核|中|新)\\))?';
  var ZONE_SRC = '(第[一二三四五12345]種(?:住宅|商業|工業)區(?:之[一二三四1234])?' + MARK
               + '|[甲乙丙特]種工業區|零星工業區|科技產業專用區|產業專用區|一般工業區'
               + '|住宅區' + MARK + '|商業區' + MARK + '|工業區'
               + '|行政區|文教區|農業區|保護區|保存區|風景區|倉庫區|河川區|宗教專用區|宗教區|醫療專用區|加油站專用區'
               + '|電信專用區|郵政專用區|再發展區|特定專用區|社會福利專用區|社福專用區|港埠專用區|車站專用區'
               + '|住[一二三四](?:之[一二])?' + MARK + '|商[一二三四]' + MARK + '|工[二三]'
               + '|(?:' + FACILITY + ')用地|公共設施保留地)';
  function zoneRe() { return new RegExp(ZONE_SRC, 'g'); }

  function clsOf(name) {
    var s = str(name);
    if (/用地$|保留地$/.test(s)) return '公';
    if (/住宅|^住[一二三四]/.test(s)) return '住';
    if (/商業|^商[一二三四]/.test(s)) return '商';
    if (/工業|產業|倉庫|^工[二三]/.test(s)) return '工';
    if (/農業/.test(s)) return '農';
    if (/保護|保存|河川/.test(s)) return '保';
    return '其他';
  }

  /* 「第三種住宅區之一」→「住三之一」；「第二種商業區」→「商二」：臺北市分區表用簡稱 */
  var CN_ORD = { '一': '一', '二': '二', '三': '三', '四': '四', '五': '五', '1': '一', '2': '二', '3': '三', '4': '四', '5': '五' };
  function shortName(name) {
    var m = /^第([一二三四五12345])種(住宅|商業|工業)區(?:之([一二三四1234]))?/.exec(str(name));
    if (!m) return '';
    return { '住宅': '住', '商業': '商', '工業': '工' }[m[2]] + CN_ORD[m[1]] + (m[3] ? '之' + CN_ORD[m[3]] : '');
  }

  function markOf(name) { var m = /\((特|再|核|中|新)\)$/.exec(str(name)); return m ? m[1] : ''; }
  function stripMark(name) { return str(name).replace(/\((?:特|再|核|中|新)\)$/, ''); }

  /* 兩個分區名稱的相符程度：3 同一分區、2 同類且其一為總稱（住宅區 vs 第三種住宅區）、1 只是同類、0 不同 */
  function zoneMatch(a, b) {
    var x = stripMark(a), y = stripMark(b), sx, sy, cx, cy;
    if (!x || !y) return 0;
    if (x === y) return 3;
    sx = shortName(x) || x; sy = shortName(y) || y;
    if (sx === sy) return 3;
    cx = clsOf(x); cy = clsOf(y);
    if (cx !== cy) return 0;
    if (/^(住宅區|商業區|工業區)$/.test(x) || /^(住宅區|商業區|工業區)$/.test(y)) return 2;
    return 1;
  }

  /* 一段文字中出現的分區（依出現順序；同一分區的全名與簡稱只算一次）；partial 表示前面寫「部分」*/
  function zonesIn(seg) {
    var re = zoneRe(), m, out = [], before, i, dup;
    while ((m = re.exec(seg)) !== null) {
      before = seg.slice(Math.max(0, m.index - 3), m.index);
      /* 「非住宅區」「鄰接住宅區」「北側住宅區」不是本基地的分區 */
      if (/非$|鄰接$|鄰近$|北側$|相鄰$|毗鄰$|臨接$|周邊$/.test(before)) continue;
      dup = false;
      for (i = 0; i < out.length; i++) if (zoneMatch(out[i].name, m[1]) === 3 && markOf(out[i].name) === markOf(m[1])) dup = true;
      if (dup) continue;
      out.push({ name: m[1], idx: m.index, partial: /部分$|部份$/.test(before) });
    }
    return out;
  }

  /* ---------------- 地號 ---------------- */

  /* 地號標準化：「01428-0000」→「1428」、「1430-0002」→「1430-2」*/
  function canonNo(s) {
    var m = /^\s*0*([0-9]{1,5})(?:\s*[-之]\s*0*([0-9]{1,4}))?\s*$/.exec(str(s).replace(/地號/g, ''));
    if (!m) return '';
    var sub = m[2] ? Number(m[2]) : 0;
    return String(Number(m[1])) + (sub > 0 ? '-' + sub : '');
  }

  /* 一行中的地號：「1428、1428-1地號」「地號:1430-2」「幸福段 1428」*/
  function parcelsIn(line) {
    var out = [], seen = {}, m, re, list, i;
    function add(x) { var c = canonNo(x); if (c && !seen[c]) { seen[c] = true; out.push(c); } }
    re = /((?:[0-9]{1,5}(?:-[0-9]{1,4})?\s*[,、及與]\s*)*[0-9]{1,5}(?:-[0-9]{1,4})?)\s*(?:等\s*[0-9一二三四五六七八九十]+\s*筆\s*)?地號/g;
    while ((m = re.exec(line)) !== null) {
      list = m[1].split(/[,、及與]/);
      for (i = 0; i < list.length; i++) add(list[i]);
    }
    re = /地號\s*:?\s*((?:[0-9]{1,5}(?:-[0-9]{1,4})?\s*[,、及與]?\s*)+)/g;
    while ((m = re.exec(line)) !== null) {
      list = m[1].split(/[,、及與\s]+/);
      for (i = 0; i < list.length; i++) if (trim(list[i])) add(list[i]);
    }
    /* 「幸福段1428」「大安段三小段 0123-0000」：段名後面緊接的數字就是地號 */
    re = /段\s*([0-9]{1,5}(?:-[0-9]{1,4})?)(?![0-9.%])/g;
    while ((m = re.exec(line)) !== null) add(m[1]);
    return out;
  }

  /* ---------------- 句子與條件 ---------------- */

  function sentences(text) {
    var out = [], parts = text.split(/[。;]/), i;
    for (i = 0; i < parts.length; i++) if (trim(parts[i])) out.push(parts[i]);
    return out;
  }

  /* 條件子句：「面前道路未達 8 公尺者」「基地面積達 2,000 平方公尺以上者」——其後的數值不是通案值 */
  var COND_RE = /(未達|未滿|以上|以下|超過|不足)[^,。;]{0,24}?者|(?:如|若|倘)[^,。;]{0,24}?(?:者|時)/;
  var NARROW_RE = new RegExp('道路[^,。;]{0,8}?未(?:達|滿)\\s*' + NUM_SRC + METER_SRC);

  /* 數值前面出現這些字，代表是在講獎勵、移轉或倍數，不是本分區的建蔽率／容積率 */
  var NOT_RATIO = /(獎勵|移轉|增額|加給|移入|折減|調降|提高|倍|基準容積之|上限之|乘以)/;

  function ratioItems(s) {
    var out = [], m, re, seg, next, pc, mid, pre;
    m = /建蔽率\s*(?:及|與|、|,|和|\/)\s*容積率[^%0-9百]{0,14}?([0-9]+(?:\.[0-9]+)?)\s*%[^%0-9百]{1,10}?([0-9]+(?:\.[0-9]+)?)\s*%/.exec(s);
    if (m) {
      out.push({ kind: 'bcr', v: Number(m[1]) / 100, idx: m.index });
      out.push({ kind: 'far', v: Number(m[2]) / 100, idx: m.index });
      return out;
    }
    re = /(建蔽率|容積率)/g;
    while ((m = re.exec(s)) !== null) {
      pre = s.slice(Math.max(0, m.index - 6), m.index);
      if (/(獎勵|移轉|增額|加給|移入)/.test(pre)) continue;
      seg = s.slice(m.index + 3);
      next = seg.search(/建蔽率|容積率/);
      if (next >= 0) seg = seg.slice(0, next);
      seg = seg.slice(0, 30);
      pc = pctIn(seg);
      if (!pc) continue;
      mid = seg.slice(0, pc.idx);
      if (NOT_RATIO.test(mid)) continue;
      if (/(獎勵|移轉)/.test(seg.slice(pc.idx + pc.len, pc.idx + pc.len + 4))) continue;
      out.push({ kind: m[1] === '建蔽率' ? 'bcr' : 'far', v: pc.v, idx: m.index });
    }
    return out;
  }

  /* 表格列：「住宅區 50% 300%」「幸福段 1428 乙種工業區 60% 210%」——
     一行有分區名與兩個百分比、沒有建蔽率／容積率字樣、也不是在講回饋或獎勵比例 */
  function tableRow(line, order) {
    if (/建蔽率|容積率|回饋|捐贈|獎勵|代金|比例|折算|負擔|%\s*~|~\s*[0-9]/.test(line)) return null;
    var zs = zonesIn(line), re = /([0-9]+(?:\.[0-9]+)?)\s*%/g, m, ps = [], bcr, far;
    if (!zs.length) return null;
    while ((m = re.exec(line)) !== null) ps.push(Number(m[1]) / 100);
    if (ps.length < 2) return null;
    bcr = order === 'far' ? ps[1] : ps[0];
    far = order === 'far' ? ps[0] : ps[1];
    if (!(bcr > 0 && bcr <= 1) || !(far > 0 && far <= 20) || far < bcr) return null;
    return { zones: zs, bcr: bcr, far: far };
  }

  /* ---------------- 條件類別 ---------------- */

  var COND_CATS = [
    { cat: '開發義務', re: /附帶條件|回饋|捐贈|捐地|代金|整體開發|市地重劃|區段徵收|開發許可|自願捐贈/ },
    { cat: '都市設計審議', re: /都市設計審議|都審|景觀審議|都市設計準則/ },
    { cat: '公共設施用地', re: /公共設施保留地|既成道路|現有巷道|道路用地|公園用地|綠地用地|廣場用地|兒童遊樂場用地|學校用地|機關用地|停車場用地/ },
    { cat: '禁限建', re: /禁建|限建|航高|飛航|機場|軍事|高速公路|電塔|高壓電/ },
    { cat: '環境與地質', re: /土壤液化|斷層|地質敏感|山坡地|順向坡|淹水|洪氾|地下水管制|水源|水質水量保護/ },
    { cat: '文化資產', re: /古蹟|歷史建築|文化資產|文化景觀|遺址|紀念建築|聚落建築群/ },
    { cat: '都市更新', re: /更新地區|更新單元|應實施更新|策略性再開發|都市更新計畫/ },
    { cat: '使用限制', re: /不得作住宅|不得作為住宅|限作|僅得作|不得為下列|使用組別|允許使用項目/ }
  ];

  /* 「是否位於都市設計審議範圍：否」這類是／否欄位，值為否時不是條件 */
  function saysNo(se) {
    var t = se.replace(/\s/g, '');
    return /是否[^:]{0,24}:(?:否|無)/.test(t) || /:(?:否|無|免)$/.test(t) || /(?:非屬|不屬|未位於|不位於|非位於)/.test(t);
  }

  function addCond(res, seen, cat, sentence, L) {
    var key = cat + '|' + L.no;
    if (seen[key]) return;
    seen[key] = true;
    res.conditions.push({ cat: cat, text: trim(sentence).slice(0, 140), line: L.no, raw: L.raw });
  }

  /* 停車標準：
       「每戶應設置一部停車位」→ perUnit 1
       「樓地板面積每 100 平方公尺設置一部」→ perM2 100
       「250 平方公尺以下者應設置一部，超過部分每 150 平方公尺增設一部」→ exemptM2 250、first 1、perM2 150 */
  function parkingRule(se) {
    var out = { perUnit: null, perM2: null, exemptM2: 0, first: 0, text: trim(se).slice(0, 120) }, m, t;
    m = new RegExp('每(?:一)?戶[^。;]{0,10}?(?:設置?|留設|配置)[^0-9' + ZH_DIGITS + '。;]{0,3}' + NUM_SRC + '\\s*(?:部|輛|位|個)').exec(se);
    if (m) out.perUnit = numOf(m[1]);
    m = /每(?:增加|超過)?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*平方公尺[^。;]{0,16}?(?:增設|設置|設|留設)\s*(?:一|1)\s*(?:部|輛|位)/.exec(se);
    if (m) out.perM2 = Number(m[1].replace(/,/g, ''));
    t = /([0-9][0-9,]*(?:\.[0-9]+)?)\s*平方公尺以下(?:者)?[^。;]{0,10}?(免設|應?設置?\s*(?:一|1)\s*(?:部|輛|位))/.exec(se);
    if (t) {
      out.exemptM2 = Number(t[1].replace(/,/g, ''));
      out.first = /免設/.test(t[2]) ? 0 : 1;
    }
    if (!isNum(out.perUnit) && !isNum(out.perM2)) return null;
    return out;
  }

  /* 依停車標準算法定車位；資料不足時回 null（呼叫端退回建技規則第59條）*/
  function certParking(rule, floorM2, units) {
    if (!rule) return null;
    var a = null, b = null, over;
    if (isNum(rule.perM2) && rule.perM2 > 0 && isNum(floorM2) && floorM2 > 0) {
      if (rule.exemptM2 > 0) {
        over = Math.max(0, floorM2 - rule.exemptM2);
        a = (rule.first || 0) + Math.ceil(over / rule.perM2);
      } else {
        a = Math.ceil(floorM2 / rule.perM2);
      }
    }
    if (isNum(rule.perUnit) && rule.perUnit > 0 && isNum(units) && units > 0) b = Math.ceil(units * rule.perUnit);
    if (a === null && b === null) return null;
    return Math.max(a || 0, b || 0);
  }

  /* ---------------- 主函式 ---------------- */

  /* parseCert(text, opt)
       opt：{ zone（左欄選的分區，證明書沒寫使用分區時用來挑細部計畫裡的那一組）}
     → { hasText, kind, city, zones, zone, zonePartial, zoneMark, parcels, parcelZones, plan,
         ratios, narrow, setbacks, heights, conditions, unparsed, pick（本案適用值）, rows（介面對照表）} */
  function parseCert(text, opt) {
    opt = opt || {};
    var src = str(text);
    var res = {
      hasText: trim(src) !== '', kind: '', city: '', zones: [], zone: '', zoneLine: null, zoneRaw: '',
      zonePartial: false, zoneMark: '', parcels: [], parcelZones: [], plan: '', planLine: null,
      ratios: [], setbacks: [], heights: [], narrow: [], excav: null, parking: null, minSite: null,
      mrt: null, urDesignated: false, urLine: null, tdrBanned: false, tdrLine: null,
      conditions: [], unparsed: [], pick: null, rows: [], lineCount: 0, found: 0
    };
    if (!res.hasText) return res;

    var rawLines = src.split(/\r\n|\r|\n/), lines = [], i, j, k;
    for (i = 0; i < rawLines.length && i < MAX_LINES; i++) {
      lines.push({ no: i + 1, raw: trim(rawLines[i]).slice(0, 240), n: norm(rawLines[i]) });
    }
    res.lineCount = lines.length;
    var all = compact(src);
    if (/證明書/.test(all)) res.kind = '分區證明書';
    else if (/管制要點|土管要點|細部計畫|都市計畫書/.test(all)) res.kind = '細部計畫條文';
    else res.kind = '其他文字';
    var cm = /(臺北市|新北市|桃園市|臺中市|臺南市|高雄市|基隆市|新竹市|新竹縣|苗栗縣|彰化縣|南投縣|雲林縣|嘉義市|嘉義縣|屏東縣|宜蘭縣|花蓮縣|臺東縣|澎湖縣|金門縣|連江縣)/
      .exec(norm(src.slice(0, 3000)));
    if (cm) res.city = cm[1];

    var order = 'bcr';          /* 表格欄序：先建蔽率或先容積率 */
    var ctxZones = null;        /* 標題行（「（一）住宅區」）設定的分區脈絡 */
    var seenCond = {};
    var L, s, used, zm, zs, pm, pn, tr, ss, se, szs, condM, iC, nm, iN, its, it, zfor, after, fi, hasLater;
    var sm, sx, mv, sKind, sb2, hm, hv, isFloors, em, ev, pr, ms, mv2, tm, tv, exact;

    function zoneFor(idx) {
      var before = [], q, grp, r, gap;
      for (q = 0; q < szs.length; q++) if (szs[q].idx < idx && clsOf(szs[q].name) !== '公') before.push(szs[q]);
      if (!before.length) return ctxZones;
      /* 取緊鄰關鍵字前的那一串（以頓號、及、與連接的視為同一組）*/
      grp = [before[before.length - 1]];
      for (r = before.length - 2; r >= 0; r--) {
        gap = se.slice(before[r].idx + before[r].name.length, grp[0].idx);
        if (/^\s*(?:[,、及與和]|或)\s*$/.test(gap)) grp.unshift(before[r]); else break;
      }
      return grp;
    }

    for (i = 0; i < lines.length; i++) {
      L = lines[i];
      s = L.n;
      if (!s) continue;
      used = false;

      /* 表頭欄序 */
      if (/建蔽率/.test(s) && /容積率/.test(s) && !/[0-9]\s*%|百分之/.test(s)) {
        order = s.indexOf('容積率') < s.indexOf('建蔽率') ? 'far' : 'bcr';
        used = true;
      }

      /* 使用分區欄位 */
      zm = /(?:土地)?使用分區(?:\([^)]{0,14}\))?(?:或公共設施用地)?(?:名稱|別)?\s*:\s*(.+)$/.exec(s)
        || /^分區(?:別|名稱)?\s*:\s*(.+)$/.exec(s);
      if (zm) {
        zs = zonesIn(zm[1]);
        for (j = 0; j < zs.length; j++) addZone(res, zs[j], L);
        if (zs.length) used = true;
      }

      /* 都市計畫名稱 */
      if (!res.plan) {
        pm = /(?:都市計畫|細部計畫|計畫)(?:名稱|區)\s*:\s*(.+)$/.exec(s)
          || /[「『]([^」』]{2,60}(?:都市計畫|細部計畫|通盤檢討)[^」』]{0,30})[」』]/.exec(s);
        if (pm) { res.plan = trim(pm[1]).slice(0, 80); res.planLine = L.no; used = true; }
      }

      /* 地號與該行的分區 */
      pn = parcelsIn(s);
      zs = zonesIn(s);
      if (!pn.length && zs.length) {
        /* 表格列「1428 乙種工業區」：行首數字緊接分區名 */
        var lead = /^([0-9]{1,5}(?:-[0-9]{1,4})?)\s+(?=[^0-9%])/.exec(s);
        if (lead && s.indexOf(zs[0].name) > 0 && canonNo(lead[1])) pn = [canonNo(lead[1])];
      }
      if (pn.length) {
        for (j = 0; j < pn.length; j++) if (res.parcels.indexOf(pn[j]) < 0) res.parcels.push(pn[j]);
        if (zs.length) {
          for (j = 0; j < pn.length; j++) {
            res.parcelZones.push({ no: pn[j], zones: namesOf(zs), partial: zs.length > 1 || zs[0].partial || /部分|部份/.test(s),
                                   line: L.no, raw: L.raw });
          }
          if (!zm) for (j = 0; j < zs.length; j++) addZone(res, { name: zs[j].name, partial: false }, L, true);
        }
        used = true;
      }

      /* 標題行設定分區脈絡：短、只有分區名、沒有數字 */
      if (zs.length && s.length <= 24 && !/[0-9]|百分之/.test(s) && !zm && !pn.length) ctxZones = zs;

      /* 表格列 */
      tr = tableRow(s, order);
      if (tr) {
        res.ratios.push({ kind: 'bcr', v: tr.bcr, zones: tr.zones, line: L.no, raw: L.raw });
        res.ratios.push({ kind: 'far', v: tr.far, zones: tr.zones, line: L.no, raw: L.raw });
        used = true;
      }

      ss = sentences(s);
      for (k = 0; k < ss.length; k++) {
        se = ss[k];
        szs = zonesIn(se);
        condM = COND_RE.exec(se);
        iC = condM ? condM.index : -1;
        nm = NARROW_RE.exec(se);
        iN = nm ? nm.index : -1;

        /* 建蔽率／容積率 */
        if (!tr) {
          its = ratioItems(se);
          for (j = 0; j < its.length; j++) {
            it = its[j];
            if (it.kind === 'bcr' ? !(it.v > 0 && it.v <= 1) : !(it.v > 0 && it.v <= 20)) continue;
            zfor = zoneFor(it.idx);
            if (nm && it.kind === 'far' && iN < it.idx) {
              res.narrow.push({ roadLt: numOf(nm[1]), far: it.v, zones: zfor, line: L.no, raw: L.raw });
              used = true;
              continue;
            }
            if (iC >= 0 && iC < it.idx) {
              addCond(res, seenCond, '依條件之強度規定', se, L);
              used = true;
              continue;
            }
            res.ratios.push({ kind: it.kind, v: it.v, zones: zfor, line: L.no, raw: L.raw });
            used = true;
          }
          /* 「容積率：210%（面前道路寬度未達 8 公尺者為 200%）」：關鍵字在前、窄路條件在後 */
          if (nm && /容積率/.test(se) && its.length) {
            hasLater = false; fi = null;
            for (j = 0; j < its.length; j++) {
              if (its[j].idx > iN) hasLater = true;
              if (its[j].kind === 'far' && its[j].idx < iN) fi = its[j];
            }
            after = pctIn(se.slice(iN));
            if (after && !hasLater && fi && after.v > 0 && after.v <= 20 && Math.abs(after.v - fi.v) > 1e-9) {
              res.narrow.push({ roadLt: numOf(nm[1]), far: after.v, zones: zoneFor(fi.idx), line: L.no, raw: L.raw });
            }
          }
        }

        /* 「基地面積達 2,000 平方公尺以上者，容積率得提高 10%」：獎勵或條件式提高，列為條件交人工判斷 */
        if (/容積|建蔽/.test(se) && /(提高|獎勵|增加|增額|加給)/.test(se) && pctIn(se)) {
          addCond(res, seenCond, '容積獎勵或條件式提高', se, L);
          used = true;
        }

        /* 退縮：「自道路境界線退縮 4 公尺」「前院深度 3 公尺」「留設 4 公尺無遮簷人行道」*/
        if (/退縮|前院|後院|側院|人行道/.test(se)) {
          var nBefore = res.setbacks.length;
          sm = new RegExp('(退縮(?:建築)?|前院(?:深度)?|後院(?:深度)?|側院(?:寬度)?|無遮簷人行道|人行道)'
                        + '[^0-9' + ZH_DIGITS + '。;]{0,16}?' + NUM_SRC + METER_SRC, 'g');
          while ((sx = sm.exec(se)) !== null) {
            mv = numOf(sx[2]);
            if (!isNum(mv) || mv <= 0 || mv > 30) continue;
            sKind = /後院/.test(sx[1]) ? 'rear' : (/側院/.test(sx[1]) ? 'side' : 'front');
            if (sKind === 'front' && /鄰地境界線|側面|後面|後側|側邊/.test(se.slice(Math.max(0, sx.index - 14), sx.index + sx[0].length))) sKind = 'side';
            res.setbacks.push({ kind: sKind, v: mv, zones: zoneFor(sx.index), line: L.no, raw: L.raw });
          }
          if (res.setbacks.length === nBefore) {
            sb2 = new RegExp(NUM_SRC + '\\s*(?:公尺|米)[^。;,]{0,6}?(?:退縮|之?無遮簷人行道|人行道)').exec(se);
            if (sb2 && isNum(numOf(sb2[1])) && numOf(sb2[1]) > 0 && numOf(sb2[1]) <= 30) {
              res.setbacks.push({ kind: 'front', v: numOf(sb2[1]), zones: zoneFor(sb2.index), line: L.no, raw: L.raw });
            }
          }
          if (res.setbacks.length > nBefore) used = true;
        }

        /* 高度與層數限制（日照條文的 21 公尺不算；日照由法規檢討另依建技規則第39條之1 計算）*/
        if (/日照|冬至/.test(se)) used = true;
        if (/高度|限高|層數|樓層數|航高/.test(se) && !/日照|冬至|高度比/.test(se)) {
          hm = new RegExp('(?:高度|限高|航高)[^0-9' + ZH_DIGITS + '。;]{0,14}?(?:不得超過|不得大於|不得逾|以|為|上限|限制|最高)'
                        + '[^0-9' + ZH_DIGITS + '。;]{0,6}?' + NUM_SRC + '\\s*(公尺|米|[mM](?![a-zA-Z0-9])|層)').exec(se)
            || new RegExp('限高\\s*' + NUM_SRC + '\\s*(公尺|米|[mM](?![a-zA-Z0-9])|層)').exec(se)
            || new RegExp('(?:層數|樓層數)[^0-9' + ZH_DIGITS + '。;]{0,10}?(?:不得超過|不得大於|以|為|上限)[^0-9' + ZH_DIGITS + '。;]{0,4}?'
                        + '([0-9]+|[' + ZH_DIGITS + ']+)\\s*(層)').exec(se);
          if (hm) {
            hv = numOf(hm[1]);
            isFloors = hm[2] === '層';
            if (isNum(hv) && hv > 0 && ((isFloors && hv <= 120) || (!isFloors && hv >= 3 && hv <= 600))) {
              res.heights.push({ v: hv, unit: isFloors ? '層' : 'm', zones: zoneFor(hm.index),
                                 cond: iC >= 0 && iC < hm.index, line: L.no, raw: L.raw });
              used = true;
            }
          }
        }

        /* 開挖率 */
        if (/開挖/.test(se) && !res.excav) {
          em = /開挖(?:率|面積|範圍)?[^%。;]{0,20}?([0-9]+(?:\.[0-9]+)?)\s*%/.exec(se);
          if (em) {
            ev = Number(em[1]) / 100;
            if (/法定空地/.test(em[0])) addCond(res, seenCond, '開挖限制', se, L);
            else if (ev > 0 && ev <= 1) res.excav = { v: ev, line: L.no, raw: L.raw };
            used = true;
          }
        }

        /* 停車標準（細部計畫另有規定者從其規定）*/
        if (/停車/.test(se) && !res.parking) {
          pr = parkingRule(se);
          if (pr) { pr.line = L.no; pr.raw = L.raw; res.parking = pr; used = true; }
        }

        /* 最小開發規模 */
        if (!res.minSite) {
          ms = /(?:最小(?:開發|建築)?(?:基地)?(?:規模|面積)|(?:開發|建築)(?:基地)?(?:規模|面積)(?:應|須|不得小於|至少))[^0-9。;]{0,12}?([0-9][0-9,]*(?:\.[0-9]+)?)\s*平方公尺(?![^,。;]{0,6}者)/.exec(se);
          if (ms) {
            mv2 = Number(ms[1].replace(/,/g, ''));
            if (isNum(mv2) && mv2 >= 50) { res.minSite = { v: mv2, line: L.no, raw: L.raw }; used = true; }
          }
        }

        /* 捷運場站距離：「距捷運三重站約 350 公尺」是實際距離；「場站周邊 500 公尺範圍內」是上限 */
        if (/捷運|車站|場站|TOD/.test(se) && !res.mrt) {
          tm = /距(?:離)?[^。;]{0,16}?(?:捷運|車站|場站)[^。;0-9]{0,16}?(?:約)?\s*([0-9]+)\s*(?:公尺|米)/.exec(se);
          exact = !!tm;
          if (!tm) tm = /(?:捷運|車站|場站|站)[^。;]{0,24}?([0-9]+)\s*(?:公尺|米|[mM](?![a-zA-Z0-9]))\s*(?:範圍|以內|內|半徑)/.exec(se);
          if (tm) {
            tv = Number(tm[1]);
            if (tv > 0 && tv <= 2000 && !saysNo(se)) { res.mrt = { v: tv, exact: exact, line: L.no, raw: L.raw }; used = true; }
          }
        }

        /* 容積移轉接受基地限制 */
        if (/容積移轉/.test(se) && /不得|禁止|排除|不適用/.test(se) && /接受|移入/.test(se)) {
          res.tdrBanned = true;
          res.tdrLine = L.no;
          addCond(res, seenCond, '容積移轉限制', se, L);
          used = true;
        }

        /* 附帶條件與其他提醒 */
        for (j = 0; j < COND_CATS.length; j++) {
          if (!COND_CATS[j].re.test(se)) continue;
          if (saysNo(se)) { used = true; continue; }
          if (COND_CATS[j].cat === '公共設施用地' && !/保留地|既成道路|現有巷道|部分|部份|夾雜/.test(se) && !pn.length) continue;
          if (COND_CATS[j].cat === '都市更新' && /更新地區|應實施更新/.test(se)) {
            res.urDesignated = true;
            if (!res.urLine) res.urLine = L.no;
          }
          addCond(res, seenCond, COND_CATS[j].cat, se, L);
          used = true;
        }
      }

      /* 有關鍵字但什麼都沒抓到：列入未解析，交人工（標題行與「五、退縮建築：」這類小標不算）*/
      if (!used && /建蔽|容積|退縮|高度|停車|開挖|回饋|捐贈|附帶|限建/.test(s)
          && !(/證明書|管制要點|細部計畫$/.test(s) && !/[0-9]/.test(s)) && !(s.length <= 14 && /:$/.test(s))) {
        res.unparsed.push('第 ' + L.no + ' 行：' + L.raw);
      }
    }

    /* ---------------- 主要分區 ---------------- */
    var main = null;
    for (i = 0; i < res.zones.length; i++) {
      if (!res.zones[i].fromRow && clsOf(res.zones[i].name) !== '公') { main = res.zones[i]; break; }
    }
    if (!main) for (i = 0; i < res.zones.length; i++) {
      if (clsOf(res.zones[i].name) !== '公') { main = res.zones[i]; break; }
    }
    if (!main && res.zones.length) main = res.zones[0];
    if (main) {
      res.zone = main.name;
      res.zoneLine = main.line;
      res.zoneRaw = main.raw;
      res.zoneMark = markOf(main.name);
      for (i = 0; i < res.zones.length; i++) if (res.zones[i].partial || (clsOf(res.zones[i].name) === '公' && res.zones.length > 1)) res.zonePartial = true;
    }

    for (i = 0; i < res.conditions.length; i++) {
      if (res.conditions[i].cat === '公共設施用地' && /部分|部份|夾雜/.test(res.conditions[i].text)) res.zonePartial = true;
    }

    /* ---------------- 本案適用值 ---------------- */
    res.pick = pickFor(res, res.zone || trim(opt.zone));
    res.rows = rowsOf(res);
    res.found = res.rows.length + res.conditions.length;
    return res;
  }

  function namesOf(zs) { var out = [], i; for (i = 0; i < zs.length; i++) out.push(zs[i].name); return out; }

  function addZone(res, z, L, fromRow) {
    var i;
    for (i = 0; i < res.zones.length; i++) {
      if (res.zones[i].name === z.name) {
        if (z.partial) res.zones[i].partial = true;
        if (!fromRow) res.zones[i].fromRow = false;
        return;
      }
    }
    res.zones.push({ name: z.name, partial: !!z.partial, line: L.no, raw: L.raw, fromRow: !!fromRow });
  }

  /* 從各數值清單挑出「屬於本案分區」的那一筆：同分區 > 同類總稱 > 沒標分區的通則 > 只是同類 */
  function bestFor(list, target, pred) {
    var best = null, bestS = -1, i, j, s, it, zs;
    for (i = 0; i < list.length; i++) {
      it = list[i];
      if (pred && !pred(it)) continue;
      zs = it.zones || null;
      if (!zs || !zs.length) s = 1.5;
      else {
        s = 0;
        for (j = 0; j < zs.length; j++) s = Math.max(s, target ? zoneMatch(zs[j].name, target) : 1);
        if (s === 0) continue;
      }
      if (s > bestS) { best = it; bestS = s; }
    }
    return best;
  }

  function pickFor(res, target) {
    var bcr = bestFor(res.ratios, target, function (x) { return x.kind === 'bcr'; });
    var far = bestFor(res.ratios, target, function (x) { return x.kind === 'far'; });
    var sbF = bestFor(res.setbacks, target, function (x) { return x.kind === 'front'; });
    var sbS = bestFor(res.setbacks, target, function (x) { return x.kind !== 'front'; });
    var ht = bestFor(res.heights, target, function (x) { return !x.cond; });
    var nr = bestFor(res.narrow, target, null);
    return {
      target: target || '',
      bcr: bcr ? { v: bcr.v, line: bcr.line, raw: bcr.raw } : null,
      far: far ? { v: far.v, line: far.line, raw: far.raw } : null,
      narrow: nr ? { roadLt: nr.roadLt, far: nr.far, line: nr.line, raw: nr.raw } : null,
      setbackFrontM: sbF ? { v: sbF.v, line: sbF.line, raw: sbF.raw } : null,
      setbackSideM: sbS ? { v: sbS.v, kind: sbS.kind, line: sbS.line, raw: sbS.raw } : null,
      heightLimitM: (ht && ht.unit === 'm') ? { v: ht.v, line: ht.line, raw: ht.raw } : null,
      floorLimit: (ht && ht.unit === '層') ? { v: ht.v, line: ht.line, raw: ht.raw } : null,
      excavRatio: res.excav,
      parking: res.parking,
      minSiteM2: res.minSite,
      mrt: res.mrt,
      urDesignated: res.urDesignated ? { v: true, line: res.urLine } : null,
      tdrBanned: res.tdrBanned ? { v: true, line: res.tdrLine } : null
    };
  }

  function pct(v) { return Math.round(v * 1000) / 10 + '%'; }

  /* 介面用的對照表：欄位、抓到的值、原文行號 */
  function rowsOf(res) {
    var r = [], p = res.pick || {}, i, zs = [], pt;
    for (i = 0; i < res.zones.length; i++) zs.push((res.zones[i].partial ? '部分' : '') + res.zones[i].name);
    if (res.zone) r.push({ k: 'zone', label: '使用分區', value: zs.length ? zs.join('、') : res.zone, line: res.zoneLine, raw: res.zoneRaw });
    if (res.parcelZones.length > 1 || (res.parcelZones.length === 1 && res.parcelZones[0].partial)) {
      var pz = [];
      for (i = 0; i < res.parcelZones.length && i < 12; i++) {
        pz.push(res.parcelZones[i].no + ' ' + (res.parcelZones[i].partial && res.parcelZones[i].zones.length > 1 ? '部分' : '')
              + res.parcelZones[i].zones.join('、部分'));
      }
      r.push({ k: 'parcelZones', label: '各地號分區', value: pz.join('；'), line: null, raw: '' });
    }
    if (res.plan) r.push({ k: 'plan', label: '都市計畫', value: res.plan, line: res.planLine, raw: '' });
    if (res.parcels.length) r.push({ k: 'parcels', label: '地號', value: res.parcels.join('、'), line: null, raw: '' });
    if (p.bcr) r.push({ k: 'bcr', label: '建蔽率', value: pct(p.bcr.v), line: p.bcr.line, raw: p.bcr.raw, num: p.bcr.v });
    if (p.far) r.push({ k: 'far', label: '容積率', value: pct(p.far.v), line: p.far.line, raw: p.far.raw, num: p.far.v });
    if (p.narrow) r.push({ k: 'narrow', label: '窄路容積率', value: '面前道路未達 ' + p.narrow.roadLt + ' m：' + pct(p.narrow.far), line: p.narrow.line, raw: p.narrow.raw });
    if (p.setbackFrontM) r.push({ k: 'setback', label: '臨路退縮', value: p.setbackFrontM.v + ' m', line: p.setbackFrontM.line, raw: p.setbackFrontM.raw, num: p.setbackFrontM.v });
    if (p.setbackSideM) r.push({ k: 'setbackSide', label: p.setbackSideM.kind === 'rear' ? '後院' : '側院或鄰地退縮', value: p.setbackSideM.v + ' m', line: p.setbackSideM.line, raw: p.setbackSideM.raw });
    if (p.heightLimitM) r.push({ k: 'height', label: '高度限制', value: p.heightLimitM.v + ' m', line: p.heightLimitM.line, raw: p.heightLimitM.raw, num: p.heightLimitM.v });
    if (p.floorLimit) r.push({ k: 'floors', label: '層數限制', value: p.floorLimit.v + ' 層', line: p.floorLimit.line, raw: p.floorLimit.raw, num: p.floorLimit.v });
    if (p.excavRatio) r.push({ k: 'excav', label: '開挖率', value: pct(p.excavRatio.v), line: p.excavRatio.line, raw: p.excavRatio.raw, num: p.excavRatio.v });
    if (p.parking) {
      pt = [];
      if (isNum(p.parking.perUnit)) pt.push('每戶 ' + p.parking.perUnit + ' 位');
      if (isNum(p.parking.perM2)) {
        pt.push((p.parking.exemptM2 ? p.parking.exemptM2 + ' ㎡ 以下' + (p.parking.first ? '設 1 位' : '免設') + '，超過部分' : '')
              + '每 ' + p.parking.perM2 + ' ㎡ 1 位');
      }
      r.push({ k: 'parking', label: '停車標準', value: pt.join('；'), line: p.parking.line, raw: p.parking.raw });
    }
    if (p.minSiteM2) r.push({ k: 'minSite', label: '最小開發規模', value: p.minSiteM2.v + ' ㎡', line: p.minSiteM2.line, raw: p.minSiteM2.raw, num: p.minSiteM2.v });
    if (p.mrt) r.push({ k: 'mrt', label: '捷運場站', value: (p.mrt.exact ? '距離約 ' : '周邊 ') + p.mrt.v + ' m' + (p.mrt.exact ? '' : ' 範圍內'), line: p.mrt.line, raw: p.mrt.raw, num: p.mrt.v });
    if (p.urDesignated) r.push({ k: 'ur', label: '更新地區', value: '位於劃定之更新地區', line: p.urDesignated.line, raw: '' });
    if (p.tdrBanned) r.push({ k: 'tdr', label: '容積移轉', value: '不得作為接受基地', line: p.tdrBanned.line, raw: '' });
    return r;
  }

  TD.engine.parseCert = parseCert;
  TD.engine.certParking = certParking;
  TD.engine.certUtil = { zhNum: zhNum, numOf: numOf, pctIn: pctIn, canonNo: canonNo, zonesIn: zonesIn,
                         zoneMatch: zoneMatch, clsOf: clsOf, shortName: shortName, markOf: markOf, norm: norm,
                         parcelsIn: parcelsIn, parkingRule: parkingRule };
})(window.TD);
