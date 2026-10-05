/* M1 土地基本資訊擷取：整理使用者輸入的地號資料，並以純正則解析使用者貼上的土地與建物登記謄本（第一類或第二類）文字。*/
window.TD = window.TD || {};
(function (TD) {
  'use strict';

  TD.engine = TD.engine || {};

  var PING = TD.PING || 3.3057851239669;

  /* --------------------------------------------------------------------------
     謄本來源前提（SPEC 第 7 節 m1）

     謄本分三類（土地登記規則第24條之1）：第一類顯示全部資料，限登記名義人等申請；
     第二類任何人均得申請（含全國地政電子謄本系統線上申請），隱匿出生日期、部分姓名、
     部分統一編號、債務人及債務額比例與設定義務人，**但限制登記、非自然人之姓名及統一編號
     不隱匿**；權利範圍、登記原因與日期、他項權利種類與擔保債權總金額也都完整顯示。
     買方評估土地時通常只拿得到第二類，因此兩類都要能解析：遮蔽的姓名（王＊明）是正常的，
     不是解析失敗。系統完全離線、不連網、不代為查調，只解析使用者貼上的文字。

     解析原則（原則一「不對稱精度陷阱」的具體落實）：
     1. 純正則，逐行比對。**抓不到就放進 unparsed，絕對不猜。**
     2. found 記錄每個欄位是從第幾行、哪一段原文抓到的，讓使用者可以自己核對。
     3. 使用者輸入與謄本解析結果不一致時，不自動覆蓋任何一邊，只出 warning 請人工判斷。
     -------------------------------------------------------------------------- */

  var DEED_PREMISE = '來源為使用者貼上的土地與建物登記謄本文字（第一類或第二類皆可；第二類任何人均可於全國地政電子謄本系統線上申請，'
                   + '姓名與統一編號部分遮蔽，但限制登記、非自然人名稱、權利範圍、登記原因與他項權利完整顯示）。'
                   + '本系統不連網、不代為查調，解析結果一律須與謄本逐欄核對。';
  /* 第二類謄本的遮蔽字元：＊、*、○、〇、◯、Ｏ、●、＃ */
  var MASK_RE = /[＊*○〇◯Ｏ●＃]/;
  var INPUT_SRC = '使用者於本模組輸入之地號資料';

  var MAX_LINES = 20000;     // 解析行數上限；超過會在 unparsed 明講被截斷，不默默吞掉

  /* 他項權利種類（SPEC 指定要抓的五種） */
  var RIGHT_TYPES = ['抵押權', '地上權', '典權', '耕作權', '不動產役權'];
  /* 限制登記（SPEC 指定要抓的四種） */
  var RESTRICT_TYPES = ['查封', '假扣押', '假處分', '預告登記'];

  /* ===================== 基礎工具 ===================== */

  function isArr(v) { return Object.prototype.toString.call(v) === '[object Array]'; }
  function isObj(v) { return !!v && typeof v === 'object' && !isArr(v); }

  function str(v) { return (v === null || v === undefined) ? '' : String(v); }
  function trim(s) { return str(s).replace(/^[\s　]+/, '').replace(/[\s　]+$/, ''); }
  // 物件自有屬性個數（ES5，不用 Object.keys().length 以外的語法糖）
  function keyCount(o) {
    var n = 0, k;
    if (!o || typeof o !== 'object') return 0;
    for (k in o) { if (Object.prototype.hasOwnProperty.call(o, k)) n++; }
    return n;
  }

  // 取有限數字；取不到回 dflt（絕不回 NaN）
  function numOf(v, dflt) {
    if (v === null || v === undefined || v === '') return dflt;
    var n = Number(v);
    return isFinite(n) ? n : dflt;
  }

  function escRe(ch) { return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // 把標籤字串轉成「字與字之間容許夾空白」的正則來源：「地號」→「地\s*號」，
  // 這樣才吃得到謄本常見的「地　　號：」全形空白排版。
  function lab(s) {
    var a = [], i;
    for (i = 0; i < s.length; i++) a.push(escRe(s.charAt(i)));
    return a.join('\\s*');
  }

  // 只認真正的漢字，不含【】（）等符號
  function isCJK(ch) { return /[㐀-䶿一-鿿豈-﫿]/.test(ch); }

  /* 行正規化：全形空白→半形空白、全形標點→半形、全形數字與英文字母→半形。
     刻意**不**動全形括號內的中文、不動假名（m2 要靠假名判斷日治時期名義人）。 */
  function normLine(s) {
    var out = str(s);
    out = out.replace(/　/g, ' ');                                  // 全形空白
    out = out.replace(/：/g, ':').replace(/；/g, ';');          // 全形冒號、分號
    out = out.replace(/[，、]/g, ',');                          // 全形逗號、頓號
    out = out.replace(/（/g, '(').replace(/）/g, ')');          // 全形括號
    out = out.replace(/[．。]/g, '.');                          // 全形句點
    out = out.replace(/[－‐‑‒–—―−]/g, '-'); // 各種破折號與全形減號
    out = out.replace(/／/g, '/');                                  // 全形斜線
    out = out.replace(/[０-９Ａ-Ｚａ-ｚ]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);            // 全形數字與英文字母
    });
    return trim(out);
  }

  // 去掉所有空白的版本，用來做「這一行有沒有這個標籤」的判斷
  function compact(s) { return str(s).replace(/[\s　]+/g, ''); }

  /* 在一行（已正規化）中取出某個標籤的值。
     - 標籤字之間容許夾空白；冒號在正規化階段已統一為半角，且**必須存在**（沒有冒號寧可抓不到）。
     - 標籤前一個字若是漢字，代表這其實是另一個更長的標籤
       （「共同擔保地號」之於「地號」、「設定權利範圍」之於「權利範圍」、「總面積」之於「面積」），一律不採用。
     - 值的結尾切在「連續兩個以上空白」處，因為謄本常把多個欄位排在同一行
       （「登記日期：… 　　登記原因：…」）。英文住址只有單一空白，不會被切斷。 */
  function fieldValue(line, label) {
    var re = new RegExp(lab(label) + '\\s*:\\s*', 'g');
    var m, rest, cut;
    while ((m = re.exec(line)) !== null) {
      if (m.index > 0 && isCJK(line.charAt(m.index - 1))) continue;
      rest = line.slice(m.index + m[0].length);
      cut = rest.search(/\s{2,}/);
      if (cut >= 0) rest = rest.slice(0, cut);
      rest = trim(rest);
      if (rest !== '') return rest;
    }
    return null;
  }

  /* ===================== 值的解讀 ===================== */

  // 「418.00 平方公尺」「1,180.60 ㎡」→ 418 / 1180.6；抓不到回 null
  function parseAreaM2(text) {
    var m = str(text).match(/(\d[\d,]*(?:\.\d+)?)\s*(?:平方公尺|㎡|m2|M2)/);
    if (!m) return null;
    var v = Number(m[1].replace(/,/g, ''));
    return isFinite(v) ? v : null;
  }

  /* 權利範圍：「全部」→ 1/1；「48分之7」→ 7/48（前為分母、後為分子）；「1/2」→ 1/2。
     「公同共有」只是關係，不是數字，另以 joint 旗標記錄。抓不到分數一律回 null。 */
  function parseShare(text) {
    var s = str(text), m, a, b, out;
    out = { text: trim(s), num: null, denom: null, value: null, joint: /公同共有/.test(s), whole: false };
    if (/全部/.test(s)) { out.num = 1; out.denom = 1; out.value = 1; out.whole = true; return out; }
    m = s.match(/(\d[\d,]*)\s*分\s*之\s*(\d[\d,]*)/);
    if (m) {
      b = Number(m[1].replace(/,/g, ''));     // 分母
      a = Number(m[2].replace(/,/g, ''));     // 分子
    } else {
      m = s.match(/(\d[\d,]*)\s*\/\s*(\d[\d,]*)/);
      if (m) { a = Number(m[1].replace(/,/g, '')); b = Number(m[2].replace(/,/g, '')); }
    }
    if (m && isFinite(a) && isFinite(b) && b > 0) {
      out.num = a; out.denom = b; out.value = a / b;
    }
    return out;
  }

  // 「新臺幣 36,000,000 元整」→ 36000000。沒有「元」時仍取數字，但回報 loose，由呼叫端決定是否列入 unparsed。
  function parseAmount(text) {
    var s = str(text), m = s.match(/(\d[\d,]*(?:\.\d+)?)/);
    if (!m) return { value: null, loose: false };
    var v = Number(m[1].replace(/,/g, ''));
    if (!isFinite(v)) return { value: null, loose: false };
    if (/[億萬千]/.test(s)) return { value: v, loose: true };   // 「三千萬」「1億2千萬」這類寫法不換算，交人工
    return { value: v, loose: !/元/.test(s) };
  }

  // 從「大安段三小段 0123-0000」取出地號與段名
  function parseParcelNo(text) {
    var s = trim(text), m = s.match(/(\d{1,7})(?:\s*[-之]\s*(\d{1,7}))?\s*$/);
    if (!m) return null;
    var no = m[2] === undefined ? m[1] : (m[1] + '-' + m[2]);
    return { no: no, section: trim(s.slice(0, m.index)) };
  }

  /* 後綴寫法的地號：實際的第一類謄本頁首是「大安區　建國段　0123-0000地號」，
     地號兩字在數字後面、而且沒有冒號，fieldValue 一律抓不到。土地標示部本身
     也沒有另一個「地號：」欄位，所以只認冒號寫法等於永遠解析不出標的地號。
     回傳 {no, section} 或 null。
     「共同擔保地號」與「基地坐落：…地號」另有欄位處理，這裡排除掉，
     免得把擔保品或建物基地誤認成本案標的。 */
  function parcelSuffix(line) {
    var s = str(line), m, before;
    m = s.match(/地\s*號/);
    if (!m) return null;
    if (/地\s*號\s*:/.test(s)) return null;                 // 冒號寫法交給 fieldValue
    before = s.slice(0, m.index);
    if (/共同擔保|基地坐落|坐落|擔保|建號/.test(before)) return null;
    return parseParcelNo(before);
  }

  /* 謄本的空欄位會印成「（空白）」「(空白)」「空白」「無」「－」，這些不是值。
     把它們當成有值，會讓使用分區被填成「空白」，再跟使用者輸入的分區互比而發出
     假警示 —— 假警示會讓人開始不信任所有警示，比沒有警示更糟。 */
  function isBlankMark(s) {
    var t = compact(s).replace(/[()（）\[\]【】]/g, '');
    return t === '' || t === '空白' || t === '無' || t === '-' || t === '--'
        || t === '－' || t === '不適用' || t === 'N/A';
  }

  // 「民國073年07月12日」→ 西元 1984
  function rocYearToAD(text) {
    var m = str(text).match(/民國\s*(\d{1,3})\s*年/);
    if (!m) return null;
    var y = Number(m[1]);
    return isFinite(y) && y > 0 ? y + 1911 : null;
  }

  // 姓名清理：去掉尾巴的括號註記與統一編號欄位
  function cleanName(text) {
    var s = trim(text);
    s = s.replace(/\([^)]*\)\s*$/, '');
    s = s.replace(/[,，;；].*$/, '');
    return trim(s);
  }

  /* ===================== parseDeed ===================== */

  /* TD.engine.parseDeed(text)
     →  { numbers:[{no,areaM2,share,...}], owners:[{name,share,addr,...}],
           rights:[{type,holder,amount,...}], zone, found:{}, unparsed:[],
           restrictions:[], building:{}, totals:{}, notes:[], lineCount }

     found 的每個鍵都是陣列，元素為 { value, line, raw }：
       value = 解析後的值（字串或數字）、line = 第幾行（1 起算）、raw = 該行原文（未正規化，截斷 240 字）。
     這是為了讓使用者可以逐行回頭核對紙本謄本，是原則一的具體落實。 */
  function parseDeed(text) {
    var src = str(text);
    var res = {
      numbers: [], owners: [], rights: [], restrictions: [],
      zone: '', zoneText: '',
      building: { no: '', areaM2: null, areaFrom: '', floorsAbove: null, floorsBelow: null,
                  floorsFrom: '', completionAD: null, use: '', material: '' },
      section: '', printedAt: '', office: '',
      totals: { areaM2: null, ownerCount: 0, shareDenomMax: null, jointCount: 0, rightAmount: null },
      found: {}, unparsed: [], notes: [], lineCount: 0, deedClass: null, maskedOwners: 0
    };

    if (trim(src) === '') {
      res.unparsed.push('全文：未提供謄本文字。第二類謄本任何人都可以在全國地政電子謄本系統（ep.land.nat.gov.tw）線上申請，'
                      + '把完整文字貼進本欄即可；本系統不連網、不代為查調。');
      return res;
    }

    var rawLines = src.split(/\r\n|\r|\n/);
    var lines = [], i;
    if (rawLines.length > MAX_LINES) {
      res.unparsed.push('全文：謄本文字共 ' + rawLines.length + ' 行，超過本模組的 ' + MAX_LINES
        + ' 行上限，只解析了前 ' + MAX_LINES + ' 行。請分批貼上，或確認是否誤貼了其他文件。');
    }
    for (i = 0; i < rawLines.length && i < MAX_LINES; i++) {
      lines.push({
        no: i + 1,
        raw: trim(rawLines[i]).slice(0, 240),
        norm: normLine(rawLines[i]),
        cmp: compact(normLine(rawLines[i]))
      });
    }
    res.lineCount = lines.length;
    var cmpAll = compact(src);
    if (/第二類/.test(cmpAll)) res.deedClass = 2;
    else if (/第三類/.test(cmpAll)) res.deedClass = 3;
    else if (/第一類/.test(cmpAll)) res.deedClass = 1;

    /* --- found 記錄器 --- */
    function put(key, value, ln) {
      if (!res.found[key]) res.found[key] = [];
      if (res.found[key].length >= 400) return;           // 極長謄本的保險，避免記憶體爆掉
      res.found[key].push({ value: value, line: ln.no, raw: ln.raw });
    }
    function bad(ln, fieldName, valueText) {
      res.unparsed.push('第 ' + ln.no + ' 行：' + fieldName + '取到值但無法解讀（' + trim(valueText) + '）。原文：' + ln.raw);
    }

    /* --- 逐行狀態 --- */
    var section = 'land';      // 'land' | 'building'：目前在土地部分還是建物部分
    var part = 'none';         // 'none' | 'mark' | 'owner' | 'rights'：標示部／所有權部／他項權利部
    var curParcel = null;      // 目前 numbers 的最後一筆（標示部用）
    var ownerParcelNo = '';    // 所有權部標頭括號裡的地號
    var curOwner = null;
    var curRight = null;
    var pendingCause = '';     // 登記原因通常排在所有權人之前，先記著給下一位所有權人
    var ln, v, sh, ar, pn, am, j, k, mm, negRe1, negRe2, neg, dup;

    for (i = 0; i < lines.length; i++) {
      ln = lines[i];
      if (ln.cmp === '') continue;

      /* ---- 段落切換 ---- */
      if (ln.cmp.indexOf('建物') >= 0 && (ln.cmp.indexOf('標示部') >= 0 || ln.cmp.indexOf('所有權部') >= 0 || ln.cmp.indexOf('他項權利部') >= 0)) {
        section = 'building';
      } else if (ln.cmp.indexOf('土地') >= 0 && (ln.cmp.indexOf('標示部') >= 0 || ln.cmp.indexOf('所有權部') >= 0 || ln.cmp.indexOf('他項權利部') >= 0)) {
        section = 'land';
      }
      if (ln.cmp.indexOf('他項權利部') >= 0) { part = 'rights'; curRight = null; curOwner = null; }
      else if (ln.cmp.indexOf('所有權部') >= 0) { part = 'owner'; curOwner = null; curRight = null; }
      else if (ln.cmp.indexOf('標示部') >= 0) { part = 'mark'; curOwner = null; curRight = null; }

      // 所有權部標頭括號內的地號：【土地所有權部】（大安段三小段 0123-0000）
      if (part === 'owner' && ln.cmp.indexOf('所有權部') >= 0) {
        mm = ln.norm.match(/\(([^)]*)\)/);
        if (mm) {
          pn = parseParcelNo(mm[1]);
          if (pn) { ownerParcelNo = pn.no; put('ownerParcelNo', pn.no, ln); }
        }
      }

      /* ---- 謄本本身的後設資料 ---- */
      v = fieldValue(ln.norm, '列印時間');
      if (v !== null && res.printedAt === '') { res.printedAt = v; put('printedAt', v, ln); }
      v = fieldValue(ln.norm, '資料管轄機關');
      if (v !== null && res.office === '') { res.office = v; put('office', v, ln); }

      /* ---- 地號（只在標示部或段落未知時新增一筆，避免把「共同擔保地號」當成標的）----
         兩種寫法都要吃：「地　號：0123-0000」（冒號）與頁首的「建國段 0123-0000地號」（後綴）。
         謄本每一頁的頁首都會重印同一個地號，所以一律依地號去重，同一筆只留一列。 */
      v = fieldValue(ln.norm, '地號');
      pn = null;
      if (v !== null) {
        pn = parseParcelNo(v);
        if (!pn) bad(ln, '地號', v);
      } else {
        pn = parcelSuffix(ln.norm);
      }
      if (pn && section === 'land' && part !== 'rights') {
        dup = null;
        for (j = 0; j < res.numbers.length; j++) {
          if (res.numbers[j].no === pn.no
              && (pn.section === '' || res.numbers[j].section === '' || res.numbers[j].section === pn.section)) {
            dup = res.numbers[j];
            break;
          }
        }
        if (dup) {
          curParcel = dup;                                  // 頁首重印，不新增一筆
          if (dup.section === '' && pn.section !== '') dup.section = pn.section;
        } else {
          curParcel = { no: pn.no, areaM2: null, share: '', section: pn.section, line: ln.no, ownerShares: [] };
          res.numbers.push(curParcel);
          put('no', pn.no, ln);
          if (pn.section !== '') put('section', pn.section, ln);
        }
        if (pn.section !== '' && res.section === '') res.section = pn.section;
      }

      // 共同擔保地號：只記錄，不當成本案標的
      v = fieldValue(ln.norm, '共同擔保地號');
      if (v !== null) put('jointCollateral', v, ln);

      /* ---- 建物總面積（權威值，優先於層次面積與附屬建物面積）----
         「建物總面積：」的「總面積」前一個字是漢字，fieldValue 的長標籤保護會擋掉，
         所以必須單獨列出這個標籤，否則建物總面積永遠抓不到，
         接著就會被同一段裡「附屬建物用途：陽台　面積：8.20平方公尺」的陽台面積佔位，
         把一棟 106 ㎡ 的房子記成 8 ㎡。 */
      v = fieldValue(ln.norm, '建物總面積');
      if (v === null) v = fieldValue(ln.norm, '總面積');
      if (v !== null) {
        ar = parseAreaM2(v);
        if (ar === null) bad(ln, '建物總面積', v);
        else {
          res.building.areaM2 = ar;
          res.building.areaFrom = 'total';
          put('buildingTotalAreaM2', ar, ln);
        }
      }

      /* ---- 層次面積（區分所有建物的主建物面積，記錄供人工核對，不當成建物總面積） ---- */
      v = fieldValue(ln.norm, '層次面積');
      if (v !== null) {
        ar = parseAreaM2(v);
        if (ar !== null) put('buildingFloorAreaM2', ar, ln);
      }

      /* ---- 面積 ---- */
      v = fieldValue(ln.norm, '面積');
      if (v !== null && ln.cmp.indexOf('現值') < 0 && ln.cmp.indexOf('單價') < 0) {
        ar = parseAreaM2(v);
        if (ar === null) {
          bad(ln, '面積', v);
        } else if (section === 'building') {
          if (ln.cmp.indexOf('附屬建物') >= 0) {
            put('buildingAnnexAreaM2', ar, ln);          // 陽台、雨遮等附屬建物，不是建物總面積
          } else {
            if (res.building.areaFrom !== 'total') {
              res.building.areaM2 = ar;
              res.building.areaFrom = 'area';
            }
            put('buildingAreaM2', ar, ln);
          }
        } else if (curParcel && curParcel.areaM2 === null) {
          curParcel.areaM2 = ar;
          put('areaM2', ar, ln);
        } else {
          put('areaM2', ar, ln);
          res.notes.push('第 ' + ln.no + ' 行的面積 ' + ar + ' 平方公尺前面沒有對應的地號欄位，未併入地號清單，請人工確認屬於哪一筆地號。');
        }
      }

      /* ---- 使用分區（土地謄本常常沒有這一欄，正式的分區要看土地使用分區證明書） ---- */
      /* 實際謄本的「使用分區」欄位對都市土地一律印「（空白）」（那一欄是給非都市土地用的），
         真正的都市計畫分區印在「都市土地使用分區」那一欄。先試長標籤、再試短標籤，
         而且「（空白）」這種空欄位標記一律視為沒抓到。 */
      if (res.zoneText === '') {
        v = fieldValue(ln.norm, '都市土地使用分區');
        if (v === null || isBlankMark(v)) v = fieldValue(ln.norm, '都市計畫使用分區');
        if (v === null || isBlankMark(v)) v = fieldValue(ln.norm, '非都市土地使用分區');
        if (v === null || isBlankMark(v)) v = fieldValue(ln.norm, '使用分區');
        if (v !== null && !isBlankMark(v)) {
          res.zoneText = v;
          mm = v.match(/\(([^)]{1,8})\)/);
          res.zone = mm ? trim(mm[1]) : v;
          put('zone', res.zone, ln);
        }
      }

      /* ---- 登記原因（先記著，給下一位所有權人） ---- */
      v = fieldValue(ln.norm, '登記原因');
      if (v !== null) { pendingCause = v; put('cause', v, ln); }

      /* ---- 所有權人 ---- */
      v = fieldValue(ln.norm, '所有權人');
      if (v !== null && part !== 'rights') {
        curOwner = {
          name: cleanName(v), share: '', addr: '', parcelNo: ownerParcelNo || (curParcel ? curParcel.no : ''),
          shareNum: null, shareDenom: null, shareValue: null, joint: /公同共有/.test(v),
          cause: pendingCause, line: ln.no, target: section
        };
        curOwner.masked = MASK_RE.test(curOwner.name);
        if (curOwner.name === '') { bad(ln, '所有權人姓名', v); }
        else {
          res.owners.push(curOwner); put('owner', curOwner.name, ln);
          if (curOwner.masked) res.maskedOwners++;
        }
        pendingCause = '';
      }

      // 公同共有人名單：刻意不併進 owners，避免與所有權人欄位重複計算人數
      v = fieldValue(ln.norm, '公同共有人');
      if (v !== null) {
        put('jointOwner', v, ln);
        res.notes.push('第 ' + ln.no + ' 行偵測到公同共有人名單（' + v + '）。實際權利人數可能多於「所有權人」欄位所列，'
                     + '須以繼承系統表與戶籍資料核對，本系統不代為查調。');
      }

      /* ---- 住址（用未去空白的正規化文字，英文住址才不會被黏成一團） ---- */
      v = fieldValue(ln.norm, '住址');
      if (v !== null) {
        put('addr', v, ln);
        if (curOwner && curOwner.addr === '') curOwner.addr = v;
        else if (curRight && part === 'rights') { if (!curRight.addr) curRight.addr = v; }
      }

      /* ---- 統一編號（只記錄有無，不記內容；謄本上本來就是遮罩的） ---- */
      v = fieldValue(ln.norm, '統一編號');
      if (v !== null) put('uniformId', v, ln);

      /* ---- 權利範圍 ---- */
      v = fieldValue(ln.norm, '權利範圍');
      if (v !== null) {
        sh = parseShare(v);
        put('share', sh.text, ln);
        if (part === 'rights' && curRight) {
          curRight.scope = sh.text;
        } else if (curOwner) {
          curOwner.share = sh.text;
          curOwner.shareNum = sh.num;
          curOwner.shareDenom = sh.denom;
          curOwner.shareValue = sh.value;
          if (sh.joint) curOwner.joint = true;
          if (sh.value === null) bad(ln, '權利範圍（無法換算成分數）', v);
          if (sh.denom !== null) {
            if (res.totals.shareDenomMax === null || sh.denom > res.totals.shareDenomMax) res.totals.shareDenomMax = sh.denom;
          }
          if (curOwner.parcelNo) {
            for (j = 0; j < res.numbers.length; j++) {
              if (res.numbers[j].no === curOwner.parcelNo) res.numbers[j].ownerShares.push(sh.text);
            }
          }
        } else if (sh.value === null) {
          bad(ln, '權利範圍', v);
        }
      }
      v = fieldValue(ln.norm, '設定權利範圍');
      if (v !== null) { put('rightScope', v, ln); if (curRight) curRight.scope = v; }

      /* ---- 他項權利 ----
         使用者只貼他項權利那幾列（沒帶「他項權利部」標頭）是很常見的用法。
         只靠標頭切段落的話，抵押權與擔保債權總金額會整段抓不到；債權額是估算
         「買下來要先清償多少」的關鍵數字，寧可多解析一段，也不能默默漏掉。
         「權利種類」只出現在他項權利部，看到它就視為已進入該段落。 */
      if (part !== 'rights' && fieldValue(ln.norm, '權利種類') !== null) {
        part = 'rights';
        curOwner = null;
      }

      if (part === 'rights') {
        v = fieldValue(ln.norm, '權利種類');
        if (v !== null) {
          curRight = { type: trim(v), holder: '', amount: null, amountText: '', scope: '', addr: '', target: section, line: ln.no };
          res.rights.push(curRight);
          put('rightType', curRight.type, ln);
        } else if (/^登記次序/.test(ln.cmp) && (curRight === null || curRight.type !== '')) {
          curRight = { type: '', holder: '', amount: null, amountText: '', scope: '', addr: '', target: section, line: ln.no };
          res.rights.push(curRight);
        }
        if (curRight && curRight.type === '') {
          for (k = 0; k < RIGHT_TYPES.length; k++) {
            if (ln.cmp.indexOf(RIGHT_TYPES[k]) >= 0) { curRight.type = RIGHT_TYPES[k]; put('rightType', RIGHT_TYPES[k], ln); break; }
          }
        }
        v = fieldValue(ln.norm, '權利人');
        if (v === null) v = fieldValue(ln.norm, '他項權利人');
        if (v !== null && curRight && curRight.holder === '') { curRight.holder = cleanName(v); put('rightHolder', curRight.holder, ln); }

        v = fieldValue(ln.norm, '擔保債權總金額');
        if (v === null) v = fieldValue(ln.norm, '權利價值');
        if (v === null) v = fieldValue(ln.norm, '債權金額');
        if (v !== null) {
          am = parseAmount(v);
          if (am.value === null) {
            bad(ln, '權利價值／擔保債權總金額', v);
          } else {
            put('amount', am.value, ln);
            if (curRight) { curRight.amount = am.value; curRight.amountText = trim(v); }
            if (res.totals.rightAmount === null) res.totals.rightAmount = 0;
            res.totals.rightAmount += am.value;
            if (am.loose) {
              res.unparsed.push('第 ' + ln.no + ' 行：權利價值「' + trim(v) + '」的單位不明確（沒有「元」或含萬／億等中文單位），'
                              + '系統取到的數字是 ' + am.value + '，請人工確認實際金額。原文：' + ln.raw);
            }
          }
        }
      }

      /* 擔保債權總金額落在他項權利段落之外（例如只貼了一行）：金額照記，但不猜屬於哪個權利，
         照 SPEC「抓不到的欄位放進 unparsed，不要猜」處理。 */
      if (part !== 'rights') {
        v = fieldValue(ln.norm, '擔保債權總金額');
        if (v === null) v = fieldValue(ln.norm, '權利價值');
        if (v === null) v = fieldValue(ln.norm, '債權金額');
        if (v !== null) {
          am = parseAmount(v);
          if (am.value === null) {
            bad(ln, '權利價值／擔保債權總金額', v);
          } else {
            put('amount', am.value, ln);
            res.unparsed.push('第 ' + ln.no + ' 行取到擔保債權總金額 ' + am.value
                            + ' 元，但該行不在他項權利段落內，無法判斷屬於哪一項權利，未併入 rights。原文：' + ln.raw);
          }
        }
      }

      /* ---- 他項權利種類的全文掃描（結構解析失敗時的保險，m2 也吃這一份） ---- */
      for (k = 0; k < RIGHT_TYPES.length; k++) {
        if (ln.cmp.indexOf(RIGHT_TYPES[k]) >= 0) put('rightMention', RIGHT_TYPES[k], ln);
      }

      /* ---- 限制登記：查封／假扣押／假處分／預告登記 ----
         否定句（「限制登記事項：查無查封、假扣押、假處分及預告登記」）會標成 negated=true，
         由 m2 決定要不要亮燈。系統不替使用者判斷否定句，只標示不確定。
         比對窗開到 30 字是為了吃得下「查無 A、B、C 及 D」的列舉寫法；句號與分號會中斷窗口，
         另外只要同一行出現法院、囑託、案號等字樣，就視為真的有登記，不套用否定判斷。 */
      for (k = 0; k < RESTRICT_TYPES.length; k++) {
        if (ln.cmp.indexOf(RESTRICT_TYPES[k]) < 0) continue;
        negRe1 = new RegExp('(查無|均無|尚無|並無|無)[^。.;；]{0,30}' + RESTRICT_TYPES[k]);
        negRe2 = new RegExp(RESTRICT_TYPES[k] + '[^。.;；]{0,20}(查無|均無|尚無|並無|無)');
        neg = (negRe1.test(ln.cmp) || negRe2.test(ln.cmp)) && !/法院|囑託|案號|字第|執行處|債權人/.test(ln.cmp);
        res.restrictions.push({ type: RESTRICT_TYPES[k], negated: neg, line: ln.no, raw: ln.raw });
        put('restriction', RESTRICT_TYPES[k] + (neg ? '（文字疑為否定句）' : ''), ln);
      }

      /* ---- 建物 ---- */
      v = fieldValue(ln.norm, '建號');
      if (v !== null) {
        pn = parseParcelNo(v);
        if (res.building.no === '') res.building.no = pn ? pn.no : trim(v);
        put('buildingNo', pn ? pn.no : trim(v), ln);
        section = 'building';
      }
      v = fieldValue(ln.norm, '地上建物建號');
      if (v !== null) put('buildingNoOnLand', trim(v), ln);
      v = fieldValue(ln.norm, '基地坐落');
      if (v !== null) put('buildingSite', trim(v), ln);
      v = fieldValue(ln.norm, '主要用途');
      if (v !== null) { res.building.use = v; put('buildingUse', v, ln); }
      v = fieldValue(ln.norm, '主要建材');
      if (v !== null) { res.building.material = v; put('buildingMaterial', v, ln); }
      v = fieldValue(ln.norm, '層數');
      if (v !== null) {
        put('buildingFloors', v, ln);
        mm = v.match(/地上\s*(\d{1,3})\s*層/);
        if (mm) res.building.floorsAbove = Number(mm[1]);
        mm = v.match(/地下\s*(\d{1,3})\s*層/);
        if (mm) res.building.floorsBelow = Number(mm[1]);
        /* 謄本的層數欄位通常只印總層數（「層　數：０１２層」，正規化後是「012層」），
           不分地上地下。只認「地上N層／地下N層」會把這種正常寫法當成解析失敗。 */
        if (res.building.floorsAbove === null && res.building.floorsBelow === null) {
          mm = v.match(/(\d{1,3})\s*層/);
          if (mm) {
            res.building.floorsAbove = Number(mm[1]);
            res.building.floorsFrom = 'total';
            res.notes.push('第 ' + ln.no + ' 行的層數「' + trim(v) + '」未區分地上與地下，'
                         + '系統當成地上 ' + Number(mm[1]) + ' 層、地下層數未知，請人工確認有無地下室。');
          } else {
            bad(ln, '層數', v);
          }
        }
      }
      v = fieldValue(ln.norm, '建築完成日期');
      if (v !== null) {
        put('completionDate', v, ln);
        ar = rocYearToAD(v);
        if (ar === null) bad(ln, '建築完成日期（無法取得民國年）', v);
        else res.building.completionAD = ar;
      }
    }

    /* ---- 合計與結構性缺漏 ---- */
    var totalArea = null;
    for (i = 0; i < res.numbers.length; i++) {
      if (res.numbers[i].areaM2 !== null) totalArea = (totalArea === null ? 0 : totalArea) + res.numbers[i].areaM2;
    }
    res.totals.areaM2 = totalArea;
    res.totals.ownerCount = res.owners.length;
    for (i = 0; i < res.owners.length; i++) if (res.owners[i].joint) res.totals.jointCount++;

    // 單一所有權人且權利範圍為全部時，才敢把地號的 share 填成 1/1；其餘一律留空，由使用者指定標的
    for (i = 0; i < res.numbers.length; i++) {
      if (res.numbers[i].ownerShares.length === 1 && /全部|^1分之1$|^1\/1$/.test(compact(res.numbers[i].ownerShares[0]))) {
        res.numbers[i].share = '1/1';
      } else if (res.numbers[i].ownerShares.length > 1) {
        res.unparsed.push('地號 ' + res.numbers[i].no + ' 有 ' + res.numbers[i].ownerShares.length
          + ' 筆權利範圍（' + res.numbers[i].ownerShares.join('、') + '）。系統無法判斷哪一位是本案標的，'
          + '該筆的 share 留空，請自行指定。');
      }
    }

    if (!res.numbers.length) res.unparsed.push('全文：未偵測到地號（「地　號：0123-0000」或頁首「建國段 0123-0000地號」兩種寫法都會抓）。地號與面積是後續所有計算的基礎，請確認貼上的是完整謄本文字。');
    if (totalArea === null) res.unparsed.push('全文：未偵測到「面積：… 平方公尺」，土地面積無法解析。');
    if (!res.owners.length) res.unparsed.push('全文：未偵測到「所有權人」欄位。第一類、第二類謄本都有這一欄（第二類姓名部分遮蔽，例如「王＊明」），'
                                           + '請確認貼上的是含所有權部的完整謄本。');
    if (res.deedClass === null && res.maskedOwners > 0) res.deedClass = 2;
    if (res.deedClass === 2 || res.maskedOwners > 0) {
      res.notes.push('偵測為第二類謄本（所有權人姓名部分遮蔽 ' + res.maskedOwners + ' 位）。第二類仍完整顯示權利範圍、登記原因與日期、'
                   + '限制登記、他項權利與擔保債權總金額，以及祭祀公業、神明會、公司等非自然人名稱，產權判讀可照常進行；'
                   + '無法判讀的只有自然人的完整姓名與住址（未辦繼承與海外共有人須由地政士另以第一類或戶籍資料確認）。');
    }
    if (res.zoneText === '') res.notes.push('謄本文字未載使用分區。土地登記謄本本來就常常沒有這一欄，正式的分區應以土地使用分區證明書或地政圖資為準，請人工填入。');
    if (res.printedAt === '') res.notes.push('未偵測到「列印時間」，無法確認謄本新舊。產權狀態隨時會變，建議使用一個月內申請的謄本。');
    for (i = 0; i < res.owners.length; i++) {
      if (res.owners[i].shareValue === null) {
        res.unparsed.push('所有權人「' + res.owners[i].name + '」（第 ' + res.owners[i].line + ' 行）沒有解析出可換算的權利範圍'
          + (res.owners[i].joint ? '（登記為公同共有，謄本上本來就可能不標分數）' : '') + '，同意比例無法自動計算。');
      }
    }
    for (i = 0; i < res.rights.length; i++) {
      if (res.rights[i].type === '') {
        res.unparsed.push('第 ' + res.rights[i].line + ' 行起的他項權利未取到「權利種類」，請人工確認是抵押權、地上權、典權、耕作權或不動產役權。');
      }
      if (res.rights[i].amount === null) {
        res.unparsed.push('他項權利（' + (res.rights[i].type || '種類未知') + '，第 ' + res.rights[i].line
          + ' 行起）未取到權利價值或擔保債權總金額，無法估算需清償的債權。');
      }
    }

    return res;
  }

  /* ===================== 海外住址判讀（m2 也會用到，掛在 TD.engine 供共用） ===================== */

  var OVERSEAS_WORDS = ['美國', '日本', '加拿大', '澳洲', '澳大利亞', '紐西蘭', '英國', '法國', '德國', '荷蘭', '瑞士', '瑞典',
                        '西班牙', '義大利', '奧地利', '比利時', '新加坡', '馬來西亞', '印尼', '泰國', '越南', '菲律賓',
                        '韓國', '南韓', '緬甸', '柬埔寨', '印度', '巴西', '阿根廷', '墨西哥', '南非', '香港', '澳門',
                        '大陸地區', '中國大陸', '巴拿馬', '沙烏地', '杜拜', '阿聯'];
  var EN_ADDR_RE = /\b(?:street|st\.|road|rd\.|avenue|ave\.|boulevard|blvd|drive|dr\.|lane|court|ct\.|suite|apt|apartment|floor|p\.?o\.?\s*box|u\.?s\.?a|usa|canada|australia|japan|singapore|england|london|california|texas|new\s+york|ontario|vancouver|sydney|tokyo)\b/i;

  // 回傳觸發的關鍵詞（字串），沒有就回 null
  function overseasHit(addr) {
    var s = str(addr), i;
    if (s === '') return null;
    for (i = 0; i < OVERSEAS_WORDS.length; i++) if (s.indexOf(OVERSEAS_WORDS[i]) >= 0) return OVERSEAS_WORDS[i];
    var m = s.match(EN_ADDR_RE);
    if (m) return m[0];
    // 整行幾乎都是英文與數字，且含逗號，視為英文住址
    if (/,/.test(s) && /[A-Za-z]{3,}/.test(s) && s.replace(/[^一-鿿]/g, '').length <= 2) return '英文住址';
    return null;
  }

  /* ===================== m1 主體 ===================== */

  function m1(p, ctx) {
    p = isObj(p) ? p : {};
    var pc = isObj(p.parcel) ? p.parcel : {};
    var rows = isArr(pc.numbers) ? pc.numbers : [];
    var warnings = [];
    var missing = [];
    var i, r;

    /* ---- 面積合計（以使用者輸入的地號面積為準） ---- */
    var areaM2 = 0, areaRows = 0, parcelRows = 0, formulaBits = [], ownedM2 = 0, ownedKnown = true;
    for (i = 0; i < rows.length; i++) {
      r = isObj(rows[i]) ? rows[i] : {};
      var a = numOf(r.areaM2, 0);
      var hasNo = trim(r.no) !== '';
      if (hasNo || a > 0) parcelRows++;
      if (a > 0) {
        areaM2 += a;
        areaRows++;
        formulaBits.push((trim(r.no) === '' ? '（未填地號）' : r.no) + ' ' + a + ' ㎡');
        var sh = parseShare(r.share);
        if (sh.value === null) { ownedKnown = false; } else { ownedM2 += a * sh.value; }
      }
    }

    var areaConf = areaM2 > 0 ? 'input' : 'low';
    var areaNote = areaM2 > 0
      ? '面積以地政事務所核發之土地登記謄本標示部為準；本值為使用者輸入，須與謄本逐筆核對。'
      : '尚未輸入任何地號面積，後續容積、量體、財務計算都會失真。';
    var vArea = TD.V('m1.areaM2', areaM2, areaConf, INPUT_SRC + '（應以土地登記謄本標示部核對）',
                     '面積合計 = ' + (formulaBits.length ? formulaBits.join(' + ') : '（無輸入）'), areaNote);
    var vAreaPing = TD.V('m1.areaPing', areaM2 / PING, areaConf, INPUT_SRC,
                         areaM2 + ' ㎡ ÷ ' + PING + ' = ' + (areaM2 / PING).toFixed(2) + ' 坪',
                         '坪為交易慣用單位，法定文件一律以平方公尺為準，換算誤差請以平方公尺回推。');
    var vCount = TD.V('m1.parcelCount', parcelRows, parcelRows > 0 ? 'input' : 'low', INPUT_SRC,
                      '有填地號或面積的列數 = ' + parcelRows,
                      '多筆地號要確認是否相鄰、是否同一使用分區、有無夾雜他人土地或既成道路。');

    /* ---- 分區與基地情境（各段共用，見 js/engine/site.js） ---- */
    var site = TD.engine.siteOf ? TD.engine.siteOf(p) : null;
    var city = trim(pc.city), district = trim(pc.district), zoneName = '';
    var zoneCode = (site && site.zoneInput) ? site.zoneInput : trim(pc.zone);   /* 有分區證明書時為證明書上的分區 */
    var zoneSrc = '', zoneArticle = '';
    if (site && site.zone) {
      zoneName = str(site.zone.name);
      zoneSrc = str(site.zone.src);
      zoneArticle = str(site.zone.article);
      if (site.zone.mappedFrom) {
        warnings.push('分區「' + site.zone.mappedFrom + '」在' + city + '的分區表中以「' + site.zone.name + '」計算'
                    + '（' + city + '的住宅區、商業區不分種別時，以該市通則與細部計畫值計）。');
      }
    } else if (zoneCode !== '') {
      warnings.push('分區「' + zoneCode + '」不在' + (city || '本縣市') + '的分區表內，請改選清單中的分區，或在左側直接輸入建蔽率與容積率。');
    }
    if (site && site.useConflict) warnings.push(site.useConflict);

    /* ---- 謄本解析 ---- */
    var deedText = str(pc.deedText);
    var parsed = trim(deedText) === '' ? null : parseDeed(deedText);
    /* SPEC 第 7 節：deed.parsed 是**布林值**（有沒有解析成功），
       完整的解析結果放在 deed.detail，下游要細節時取 deed.detail。 */
    /* parsed 只有「真的抓到東西」才算成功。只要 deedText 非空就回 true 的話，
       貼一串亂碼也會讓報告印出「已解析使用者貼上的謄本文字」，那是假裝算得出來。 */
    var parsedOk = !!(parsed && (
      (parsed.numbers && parsed.numbers.length) ||
      (parsed.owners && parsed.owners.length) ||
      (parsed.rights && parsed.rights.length) ||
      (parsed.found && keyCount(parsed.found) > 0)
    ));
    if (parsed && !parsedOk) {
      warnings.push('貼上的文字不像土地登記謄本：地號、面積、權利範圍、所有權人與他項權利'
                  + '一個欄位都沒有抓到。請確認貼的是地政事務所核發的謄本全文（含標示部、'
                  + '所有權部與他項權利部），否則 m2 的產權地雷判讀完全無效。');
    }
    var deed = {
      parsed: parsedOk,
      detail: parsed,
      found: parsed ? parsed.found : {},
      unparsed: parsed ? parsed.unparsed.slice(0) : ['全文：尚未貼上謄本文字。'],
      hasText: trim(deedText) !== '',
      lineCount: parsed ? parsed.lineCount : 0
    };
    if (parsed) {
      for (i = 0; i < parsed.notes.length; i++) warnings.push('謄本解析：' + parsed.notes[i]);
    } else {
      warnings.push('尚未貼上登記謄本文字。產權地雷與所有權人結構無從判讀；'
                  + '第二類謄本任何人都可在全國地政電子謄本系統線上申請，貼上全文即可判讀。本系統不連網、不代為查調。');
    }

    /* ---- 使用者輸入與謄本的交叉核對（不自動覆蓋，只出警示） ---- */
    var cross = { deedAreaM2: null, deedOwnerCount: null, deedShareDenomMax: null, deedZone: '', diffs: [] };
    if (parsed) {
      cross.deedAreaM2 = parsed.totals.areaM2;
      cross.deedOwnerCount = parsed.totals.ownerCount;
      cross.deedShareDenomMax = parsed.totals.shareDenomMax;
      cross.deedZone = parsed.zone;

      if (cross.deedAreaM2 !== null && areaM2 > 0) {
        var diff = Math.abs(cross.deedAreaM2 - areaM2);
        if (diff > Math.max(0.5, areaM2 * 0.005)) {
          cross.diffs.push('面積：輸入合計 ' + areaM2 + ' ㎡，謄本解析合計 ' + cross.deedAreaM2 + ' ㎡，差 ' + Math.round(diff * 100) / 100 + ' ㎡。');
          warnings.push('輸入的地號面積合計（' + areaM2 + ' ㎡）與謄本解析結果（' + cross.deedAreaM2
                      + ' ㎡）不一致，系統不自動更正，請逐筆核對是哪一筆地號抄錯。');
        }
      }
      if (cross.deedOwnerCount !== null && cross.deedOwnerCount > 0 && numOf(pc.ownerCount, 0) > 0
          && cross.deedOwnerCount !== numOf(pc.ownerCount, 0)) {
        cross.diffs.push('所有權人數：輸入 ' + numOf(pc.ownerCount, 0) + ' 人，謄本解析 ' + cross.deedOwnerCount + ' 人。');
        warnings.push('輸入的所有權人數（' + numOf(pc.ownerCount, 0) + ' 人）與謄本解析結果（' + cross.deedOwnerCount
                    + ' 人）不一致。公同共有人名單、多筆地號的重複所有權人都會造成差異，請人工確認後再算同意門檻。');
      }
      if (cross.deedShareDenomMax !== null && numOf(pc.shareDenomMax, 0) > 0
          && cross.deedShareDenomMax > numOf(pc.shareDenomMax, 0)) {
        cross.diffs.push('最大持分分母：輸入 ' + numOf(pc.shareDenomMax, 0) + '，謄本解析 ' + cross.deedShareDenomMax + '。');
        warnings.push('謄本解析出的最大持分分母（' + cross.deedShareDenomMax + '）大於輸入值（'
                    + numOf(pc.shareDenomMax, 0) + '），持分細碎程度可能被低估。');
      }
      /* 謄本印的是分區全名（「第三種商業區」），使用者輸入的是代碼（「商三」），
         兩者字面本來就不一樣。只比代碼會讓正確的輸入也跳警示，所以要一併比對
         分區資料表裡的全名；兩邊都對不上才是真的有疑問。 */
      if (cross.deedZone !== '' && zoneCode !== ''
          && compact(cross.deedZone).indexOf(compact(zoneCode)) < 0
          && (zoneName === '' || compact(cross.deedZone).indexOf(compact(zoneName)) < 0)) {
        warnings.push('謄本上的使用分區文字「' + cross.deedZone + '」與輸入的分區「' + zoneCode
                    + (zoneName === '' ? '' : '（' + zoneName + '）')
                    + '」看起來不一樣，請以土地使用分區證明書為準。');
      }
    }

    /* ---- 人與持分 ---- */
    var ownerCountIn = numOf(pc.ownerCount, 0);
    var ownerCountEff = ownerCountIn > 0 ? ownerCountIn : (cross.deedOwnerCount || 0);
    var vOwners = TD.V('m1.ownerCount', ownerCountEff, ownerCountEff > 0 ? 'input' : 'low',
                       INPUT_SRC + (cross.deedOwnerCount ? '；謄本所有權部解析為 ' + cross.deedOwnerCount + ' 人' : ''),
                       ownerCountIn > 0 ? '使用者輸入 ' + ownerCountIn + ' 人' : '無輸入，改用謄本解析人數 ' + ownerCountEff + ' 人',
                       '公同共有人、未辦繼承的全體繼承人常常不會全部出現在所有權人欄位，實際要談的人數通常更多。' + DEED_PREMISE);

    var denomIn = numOf(pc.shareDenomMax, 0);
    var denomEff = Math.max(denomIn, cross.deedShareDenomMax || 0);
    var vDenom = TD.V('m1.shareDenomMax', denomEff, denomEff > 0 ? 'input' : 'low',
                      INPUT_SRC + (cross.deedShareDenomMax ? '；謄本權利範圍解析最大分母 ' + cross.deedShareDenomMax : ''),
                      '取輸入值（' + denomIn + '）與謄本解析值（' + (cross.deedShareDenomMax === null ? '無' : cross.deedShareDenomMax) + '）的較大者',
                      '分母越大代表持分越細碎，整合成本與時間成正比上升；分母達 1000 以上在 m2 會亮黃燈。');

    /* ---- 臨路與基地形狀 ---- */
    var roadWidth = numOf(pc.roadWidth, 0);
    var roadDflt = (TD.engine && TD.engine.DEFAULT_ROAD_M) || 8;
    var vRoad = TD.V('m1.roadWidth', roadWidth > 0 ? roadWidth : roadDflt, roadWidth > 0 ? 'input' : 'low', INPUT_SRC,
                     roadWidth > 0 ? '正面路寬 = ' + roadWidth + ' 公尺（使用者輸入）'
                                   : '未輸入，暫以 ' + roadDflt + ' 公尺（都市計畫地區最常見之計畫道路寬度）試算',
                     '路寬決定畸零地標準、容積上限與高度比，必須以建築線指定圖或都市計畫道路寬度為準，'
                   + '現場目測的路寬常把人行道與退縮地算進去，會高估。');

    var siteWidth = numOf(pc.siteWidth, 0);
    var siteDepth = numOf(pc.siteDepth, 0);
    var corner = !!pc.corner;

    /* ---- 完整度 ---- */
    var checks = [
      { ok: city !== '', label: '縣市' },
      { ok: district !== '', label: '行政區' },
      { ok: trim(pc.section) !== '' || (parsed && parsed.section !== ''), label: '段小段' },
      { ok: parcelRows > 0 && areaRows > 0, label: '地號與面積' },
      { ok: areaM2 > 0, label: '面積合計大於零' },
      { ok: zoneName !== '', label: '使用分區（且在分區表內）' },
      { ok: roadWidth > 0, label: '正面路寬' },
      { ok: siteWidth > 0 && siteDepth > 0, label: '基地寬度與深度' },
      { ok: ownerCountEff > 0, label: '所有權人數' },
      { ok: deed.hasText, label: '登記謄本文字' },
      { ok: !!(parsed && parsed.owners.length), label: '謄本解析出所有權人（第一類或第二類）' },
      { ok: !!(parsed && parsed.totals.areaM2 !== null), label: '謄本解析出面積' }
    ];
    var okCount = 0;
    for (i = 0; i < checks.length; i++) {
      if (checks[i].ok) okCount++; else missing.push(checks[i].label);
    }
    var score = checks.length ? okCount / checks.length : 0;

    if (!deed.hasText) missing.push('（缺謄本文字時，m2 產權判讀一律視為未完成）');

    /* ---- 輸入面積的「本案持分面積」：地主版會用到 ---- */
    var vOwned = TD.V('m1.areaOwnedM2', ownedKnown ? ownedM2 : null, 'low',
                      INPUT_SRC + '（parcel.numbers[].share）',
                      '各筆面積 × 該筆權利範圍之和',
                      ownedKnown
                        ? '這是「本案標的持分所對應的面積」，不是可建築基地面積。容積計算一律用全筆面積，'
                        + '持分面積只用來看地主自己實際擁有多少。share 欄的語義（本案標的在該地號的權利範圍）須人工確認。'
                        : '有地號的 share 欄無法換算成分數（例如「公同共有」），持分面積算不出來，已回傳 null 而非 0。');

    return {
      areaM2: vArea,
      areaPing: vAreaPing,
      parcelCount: vCount,
      city: city,
      district: district,
      zoneCode: zoneCode,
      zoneName: zoneName,
      roadWidth: vRoad,
      corner: corner,
      siteWidth: siteWidth,
      siteDepth: siteDepth,
      ownerCount: vOwners,
      shareDenomMax: vDenom,
      completeness: { score: score, scorePct: Math.round(score * 100), okCount: okCount, total: checks.length, missing: missing },
      deed: deed,
      warnings: warnings,

      /* 以下為契約之外的附加欄位（不改任何既有欄位名稱），供 UI 與 m2 取用 */
      section: trim(pc.section) || (parsed ? parsed.section : ''),
      roadCount: numOf(pc.roadCount, 1),
      areaOwnedM2: vOwned,
      zoneSource: zoneSrc,
      zoneArticle: zoneArticle,
      parcels: rows.map(function (row) {
        var rr = isObj(row) ? row : {};
        var a2 = numOf(rr.areaM2, 0);
        return { no: trim(rr.no), areaM2: a2, areaPing: a2 / PING, share: str(rr.share) };
      }),
      crosscheck: cross,
      premise: DEED_PREMISE,
      site: site,
      deedClass: parsed ? parsed.deedClass : null
    };
  }

  TD.engine.m1 = m1;
  TD.engine.parseDeed = parseDeed;
  /* 共用給 m2 的小工具，避免兩邊各寫一份判斷邏輯 */
  TD.engine.deedUtil = {
    normLine: normLine,
    compact: compact,
    fieldValue: fieldValue,
    parseShare: parseShare,
    parseAmount: parseAmount,
    overseasHit: overseasHit,
    RIGHT_TYPES: RIGHT_TYPES,
    RESTRICT_TYPES: RESTRICT_TYPES
  };
})(window.TD);
