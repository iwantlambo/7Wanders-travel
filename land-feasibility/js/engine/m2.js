/* M2 產權地雷預警：從謄本文字找出真正會殺死案子的產權瑕疵，並算土地法第34條之1第1項的處分門檻。*/
window.TD = window.TD || {};
(function (TD) {
  'use strict';

  TD.engine = TD.engine || {};

  /* --------------------------------------------------------------------------
     這個模組的存在理由

     容積算錯會少賺，產權看錯會整案報廢。祭祀公業、未辦繼承、日治時期名義人、
     限制登記這幾種瑕疵，不是「打折處理」的問題，是「這塊地現在根本不能賣」的問題。
     因此本模組的輸出刻意寫得很具體：每個旗標都要回答三件事
       1. reason      為什麼觸發（引用謄本上觸發的那一行原文與行號，讓使用者自己核對）
       2. resolvable  可不可解（不可解代表現在的申請人單方面處理不了）
       3. advice      要找誰、大概要多久

     信心等級（SPEC 第 7 節）：土地法第34條之1第1項的門檻計算是法規明文，標 high；
     其餘旗標全部是謄本文字比對，會有誤判也會有漏判，一律標 low。

     絕不做的事：
     - 不因為「謄本裡沒有出現關鍵字」就下「產權乾淨」的結論。沒有謄本文字時一律亮黃燈。
     - 不自動消除偵測到的旗標。manualFlags 只能加旗標，不能消旗標。
     -------------------------------------------------------------------------- */

  var RANK = { green: 1, amber: 2, red: 3 };
  var MAX_QUOTE = 90;          // 引用原文的長度上限
  var MAX_HITS = 4;            // 同一個旗標最多引用幾行
  var MAX_LINES = 20000;       // 掃描行數上限，與 m1 一致

  /* ===================== 基礎工具 ===================== */

  function isArr(v) { return Object.prototype.toString.call(v) === '[object Array]'; }
  function isObj(v) { return !!v && typeof v === 'object' && !isArr(v); }
  function str(v) { return (v === null || v === undefined) ? '' : String(v); }
  function trim(s) { return str(s).replace(/^[\s　]+/, '').replace(/[\s　]+$/, ''); }
  function numOf(v, dflt) {
    if (v === null || v === undefined || v === '') return dflt;
    var n = Number(v);
    return isFinite(n) ? n : dflt;
  }
  function rawOf(v, dflt) {
    var x = (TD && TD.raw) ? TD.raw(v) : v;
    return numOf(x, dflt);
  }
  function util() { return (TD.engine && TD.engine.deedUtil) ? TD.engine.deedUtil : null; }
  function compact(s) {
    var u = util();
    return u ? u.compact(u.normLine(s)) : str(s).replace(/[\s　]+/g, '');
  }
  function cut(s) {
    var t = trim(s);
    return t.length > MAX_QUOTE ? t.slice(0, MAX_QUOTE) + '…' : t;
  }

  // 法規標籤：能對上 laws.js 的 key 就取官方名稱與條號，對不上就用傳入的名稱，條號一律「待查」
  function lawOf(key, fallbackName, fallbackArticle) {
    var ref = (TD.data && TD.data.lawRef) ? TD.data.lawRef(key) : null;
    var name = ref ? ref.name : str(fallbackName);
    var article = ref ? ref.article : str(fallbackArticle || '待查');
    if (name === '' || name === '待查') return { key: null, name: '待查', article: '待查', text: '法源待查' };
    return {
      key: ref ? key : null, name: name, article: article,
      text: name + (article && article !== '待查' ? ' ' + article : '（條號待查）')
    };
  }

  /* ===================== 旗標定義 ===================== */

  /* advice 一律寫「找誰、要做什麼、大概多久」。時間是實務經驗值，不是法定期間，
     所以旗標的 conf 一律 low，UI 必須顯示為需人工複核。 */
  var DEF = {
    ancestral: {
      label: '祭祀公業／神明會名義',
      level: 'red', resolvable: true,
      lawKey: null, lawName: '祭祀公業條例、地籍清理條例', article: '待查',
      advice: '找熟悉祭祀公業的地政士＋律師。要先調派下員名冊、規約與管理人登記，處分須依規約或派下員大會決議，'
            + '未成立法人者還要先辦法人登記或依地籍清理程序處理。實務上 6 個月到 2 年以上，'
            + '常見卡點是派下員找不齊或決議門檻不足。在取得合法處分決議之前，簽任何買賣或合建契約都是無效風險。'
    },
    intestate: {
      label: '未辦繼承／公同共有',
      level: 'red', resolvable: true,
      lawKey: 'CIVIL_CODE', lawName: '民法（物權編共有、繼承編）', article: '待查',
      advice: '找地政士辦繼承登記：需要全體繼承人的戶籍資料與繼承系統表，先把公同共有變成分別共有，'
            + '否則處分原則上要全體同意。3 到 18 個月；有繼承人在國外、失聯、或已有第二代再轉繼承的，會拉到數年。'
            + '同時請地政士確認有無逾期未辦繼承被列冊管理的問題。'
    },
    japanese: {
      label: '日治時期名義人',
      level: 'red', resolvable: false,
      lawKey: null, lawName: '地籍清理條例', article: '待查',
      advice: '找地政士與律師，走權利人申報與公告程序。關鍵風險是：逾期無人申報的土地可能由地政機關代為標售，'
            + '結果不是現在的申請人能控制的。時程以年計且結果不確定，因此標為「不可解」——'
            + '不是永遠不能解，而是不能由本案單方面解決，在清理完成前不應簽有約束力的契約，也不應據此出價。'
    },
    overseas: {
      label: '海外共有人',
      level: 'amber', resolvable: true,
      lawKey: 'LAND_REG_RULES', lawName: '土地登記規則', article: '待查',
      advice: '找地政士處理授權書的驗證：海外共有人須出具經駐外館處或當地公證認證的授權書，'
            + '另有身分證明、稅務扣繳與匯款問題。單一共有人約 1 到 3 個月；人數多、時區分散或失聯時，'
            + '這一項會變成整案最主要的時程瓶頸。談判前先確認每一位的所在地與聯絡狀況。'
    },
    fragmented: {
      label: '持分細碎',
      level: 'amber', resolvable: true,
      lawKey: 'LAND_ACT_34_1', lawName: '土地法 第34條之1', article: '第34條之1第1項',
      advice: '請地政士調閱全部所有權人清冊與住址，先算土地法第34條之1的門檻，再編整合預算與時程。'
            + '持分細碎案的談判成本實務上常被低估三到五倍（找人、說服、價格不一致、最後一位的溢價），'
            + '建議在取得完整共有人名冊之前不要定案出價。'
    },
    encumbrance: {
      label: '他項權利與限制登記',
      level: 'green', resolvable: true,
      lawKey: 'LAND_REG_RULES', lawName: '土地登記規則', article: '待查',
      advice: '請地政士就每一筆他項權利確認塗銷方式與成本。'
    },
    noDeed: {
      label: '尚未提供謄本（產權未檢查）',
      level: 'amber', resolvable: true,
      lawKey: 'LAND_REG_RULES', lawName: '土地登記規則', article: '第24條之1',
      advice: '第二類謄本任何人都可以申請（土地登記規則第24條之1）：在全國地政電子謄本系統（ep.land.nat.gov.tw）'
            + '以地號線上申請土地與建物登記謄本，或到任一地政事務所臨櫃申請，幾分鐘就拿得到。'
            + '第二類會遮蔽自然人的部分姓名與統一編號，但權利範圍、登記原因與日期、限制登記（查封、假扣押、假處分、預告登記）、'
            + '他項權利與擔保債權總金額、祭祀公業與公司等非自然人名稱都完整顯示，足以判讀主要產權地雷。'
            + '把謄本全文貼進左欄「謄本」即可；第一類（含完整姓名與住址）限所有權人申請，簽約前再請賣方提供。'
    }
  };

  /* ===================== 謄本掃描 ===================== */

  function toLines(text) {
    var arr = str(text).split(/\r\n|\r|\n/), out = [], i;
    for (i = 0; i < arr.length && i < MAX_LINES; i++) {
      if (trim(arr[i]) === '') continue;
      out.push({ no: i + 1, raw: trim(arr[i]).slice(0, 240), cmp: compact(arr[i]) });
    }
    return out;
  }

  // 找出含任一關鍵詞的行，最多回傳 MAX_HITS 筆
  function scan(lines, words) {
    var out = [], i, k;
    for (i = 0; i < lines.length && out.length < MAX_HITS; i++) {
      for (k = 0; k < words.length; k++) {
        if (lines[i].cmp.indexOf(words[k]) >= 0) { out.push({ word: words[k], line: lines[i] }); break; }
      }
    }
    return out;
  }

  // 正則版掃描（假名偵測用）
  function scanRe(lines, re) {
    var out = [], i, m;
    for (i = 0; i < lines.length && out.length < MAX_HITS; i++) {
      m = lines[i].cmp.match(re);
      if (m) out.push({ word: m[0], line: lines[i] });
    }
    return out;
  }

  // 把命中結果寫成「第 N 行「原文」」的引用字串；同一行只引用一次
  function quote(hits) {
    var parts = [], seen = [], i;
    for (i = 0; i < hits.length; i++) {
      if (seen.indexOf(hits[i].line.no) >= 0) continue;
      seen.push(hits[i].line.no);
      parts.push('第 ' + hits[i].line.no + ' 行「' + cut(hits[i].line.raw) + '」');
    }
    return parts.join('；');
  }

  function words(hits) {
    var seen = [], i;
    for (i = 0; i < hits.length; i++) if (seen.indexOf(hits[i].word) < 0) seen.push(hits[i].word);
    return seen.join('、');
  }

  /* ===================== 旗標組裝 ===================== */

  function mkFlag(id, def, level, reason, advice, resolvable) {
    var law = lawOf(def.lawKey, def.lawName, def.article);
    return {
      id: id,
      label: def.label,
      level: level,
      reason: reason,
      resolvable: resolvable,
      advice: advice,
      law: law.text,                 // 字串（法規名稱＋條號），UI 可直接印
      lawRef: law,                   // 結構化版本：{key, name, article, text}
      conf: 'low',                   // 純文字比對，一律低信心，必須人工複核
      manual: false
    };
  }

  /* ===================== 土地法第34條之1第1項 ===================== */

  var EPS = 1e-9;

  /* 第1項：共有人數過半**且**應有部分合計過半；或應有部分合計**逾**三分之二者，人數不予計算。
     「過半」「逾」都是嚴格大於，剛好二分之一、剛好三分之二都不成立，所以比較時加 EPS。 */
  function consentOf(p, ownerCountEff, notes) {
    var c = (isObj(p.m2) && isObj(p.m2.consent)) ? p.m2.consent : {};
    var owners = numOf(c.owners, 0);
    var agree = numOf(c.agreeOwners, 0);
    var share = numOf(c.shareAgree, 0);
    var law = lawOf('LAND_ACT_34_1', '土地法 第34條之1', '第34條之1第1項');
    var src = ownerCountEff > 0 ? 'M1 所有權人數' : '';

    if (owners <= 0 && ownerCountEff > 0) {
      owners = ownerCountEff;
      notes.push('m2.consent.owners 未填，暫以 M1 的所有權人數 ' + ownerCountEff + ' 人計算門檻，請確認共有人總數。');
    }
    if (agree > owners && owners > 0) {
      notes.push('同意人數（' + agree + '）大於共有人總數（' + owners + '），已以總數計；請檢查輸入。');
      agree = owners;
    }

    var shareBad = false;
    if (share > 1 + EPS) {
      shareBad = true;
      notes.push('m2.consent.shareAgree 應為 0 到 1 的小數（0.62 代表 62%），目前輸入 ' + share
               + '。系統不自行換算，已把應有部分比例視為「無法判定」，門檻一律不通過，請改填小數。');
    }
    if (share < 0) { shareBad = true; notes.push('m2.consent.shareAgree 為負數，已視為無法判定。'); }

    var ownerRatio = owners > 0 ? agree / owners : null;
    var shareRatio = shareBad ? null : share;

    var minOwnersForHalf = owners > 0 ? Math.floor(owners / 2) + 1 : null;   // 嚴格過半所需的最少人數
    var ownerHalfOk = (owners > 0) && (agree * 2 > owners);
    var shareHalfOk = (shareRatio !== null) && (shareRatio > 0.5 + EPS);
    var byHalf = !!(ownerHalfOk && shareHalfOk);
    var byTwoThirds = (shareRatio !== null) && (shareRatio > (2 / 3) + EPS);
    var pass = byHalf || byTwoThirds;

    var needOwners = null, needShare = null, needShareHalf = null, needShareTwoThirds = null;
    if (owners > 0) needOwners = pass ? 0 : Math.max(0, minOwnersForHalf - agree);
    if (shareRatio !== null) {
      needShareHalf = Math.max(0, 0.5 - shareRatio);
      needShareTwoThirds = Math.max(0, (2 / 3) - shareRatio);
      // 還差的應有部分 = 下一道必須跨過的門檻：
      // 應有部分還沒過半 → 至少要先過半；已過半但人數不足 → 要衝到逾三分之二才能不計人數。
      needShare = pass ? 0 : (needShareHalf > 0 ? needShareHalf : needShareTwoThirds);
    }

    var method = '';
    if (byHalf && byTwoThirds) method = '第1項前段（人數過半且應有部分過半）與後段（應有部分逾三分之二）都成立';
    else if (byHalf) method = '第1項前段：共有人數過半且應有部分合計過半';
    else if (byTwoThirds) method = '第1項後段：應有部分合計逾三分之二，人數不予計算';
    else if (owners <= 0 && shareRatio === null) method = '資料不足，無法判斷';
    else method = '尚未達第1項任一門檻';

    var needNote = pass ? '目前已達處分門檻，但同意書、通知與提存等程序仍須依法辦理。'
      : '兩條路任一成立即可：（一）人數過半＋應有部分過半，（二）應有部分逾三分之二，人數不計。'
      + 'needOwners 只計前段的「人數」那一項，前段還要同時滿足應有部分過半；'
      + 'needShare 是還要再取得的應有部分比例（應有部分尚未過半時是離過半的差距，已過半但人數不足時是離三分之二的差距）。';

    return {
      ownerRatio: ownerRatio,
      shareRatio: shareRatio,
      byHalf: byHalf,
      byTwoThirds: byTwoThirds,
      pass: pass,
      method: method,
      needOwners: needOwners,
      needShare: needShare,

      /* 附加欄位（不改契約既有欄名） */
      owners: owners,
      agreeOwners: agree,
      shareAgree: shareBad ? null : share,
      minOwnersForHalf: minOwnersForHalf,
      ownerHalfOk: ownerHalfOk,
      shareHalfOk: shareHalfOk,
      needShareHalf: needShareHalf,
      needShareTwoThirds: needShareTwoThirds,
      ownerSource: src,
      conf: 'high',                 // 法規明文的門檻計算

      /* SPEC 第 7 節：土地法第34條之1第1項的門檻是法規明文，必須以 conf:'high' 呈現。
         全系統只有這兩個數字真正來自法條原文，是唯一可以高信心呈現的東西；
         如果它在畫面上跟種子猜測長得一樣，徽章的訊號價值就被稀釋了。
         既有的 ownerRatio／shareRatio／pass 等裸欄位一律保留原型別不動（下游在讀），
         這裡另掛四個 V 給 UI 用。 */
      thresholdHalfV: TD.V('m2.consentThresholdHalf', 0.5, 'high', law.text,
        '第1項前段：共有人數過半（> 1/2）且應有部分合計過半（> 1/2）',
        '「過半」是嚴格大於，剛好二分之一不成立。公同共有另有準用規定（條項待查）。'),
      thresholdTwoThirdsV: TD.V('m2.consentThresholdTwoThirds', 2 / 3, 'high', law.text,
        '第1項後段：應有部分合計逾三分之二（> 2/3）者，人數不予計算',
        '「逾」是嚴格大於，剛好三分之二不成立。'),
      ownerRatioV: TD.V('m2.consentOwnerRatio', ownerRatio, 'input',
        '使用者輸入之同意人數 ÷ 共有人總數' + (src ? '（共有人總數來自 ' + src + '）' : ''),
        (owners > 0 ? agree + ' 人 ÷ ' + owners + ' 人' : '共有人總數未知，無法計算'),
        '人數比例本身由輸入推算；共有人總數與同意人數須以謄本所有權部清冊逐人核對。'),
      shareRatioV: TD.V('m2.consentShareRatio', shareRatio, 'input',
        '使用者輸入之同意人應有部分合計',
        (shareRatio === null ? '輸入不是 0～1 的小數，視為無法判定'
                             : '應有部分合計 ' + shareRatio),
        '應有部分須逐筆加總謄本上的權利範圍分數，不可用人數比例替代。'),

      law: law.text,
      lawRef: law,
      needNote: needNote,
      note: '「過半」與「逾」都是嚴格大於，剛好二分之一或剛好三分之二不算通過。'
          + '公同共有另有準用規定（條項待查），其潛在應有部分如何認定須由地政士確認。'
          + '本欄只計算門檻是否成立，不代表程序已合法完成；優先承買權、通知與提存等仍須逐項辦理。'
    };
  }

  /* ===================== 手動旗標 ===================== */

  /* p.m2.manualFlags：使用者手動標記的旗標。
     刻意設計成**只能加、不能消**：偵測到的旗標不會因為手動設定而消失，
     要說明已排除請寫 p.m2.resolvedNotes，並在複核紀錄留下依據。 */
  function applyManual(p, flags, notes) {
    var mf = (isObj(p.m2) && isObj(p.m2.manualFlags)) ? p.m2.manualFlags : {};
    var keys = Object.keys(mf), i, j, k, v, found, def, level;
    for (i = 0; i < keys.length && i < 60; i++) {
      k = keys[i];
      v = mf[k];
      if (!v) continue;                                   // false / 0 / '' / null 一律視為「沒有標記」
      found = null;
      for (j = 0; j < flags.length; j++) if (flags[j].id === k) { found = flags[j]; break; }
      if (found) {
        found.manual = true;
        found.reason += '（使用者另行手動標記本項）';
        if (isObj(v) && typeof v.reason === 'string' && v.reason !== '') found.reason += '使用者備註：' + v.reason;
        if (isObj(v) && RANK[v.level] && RANK[v.level] > RANK[found.level]) found.level = v.level;
        if (isObj(v) && v.resolvable === false) found.resolvable = false;
        continue;
      }
      def = DEF[k];
      if (!def) {
        level = (isObj(v) && RANK[v.level]) ? v.level : 'amber';
        def = {
          label: (isObj(v) && typeof v.label === 'string' && v.label !== '') ? v.label
               : (typeof v === 'string' && v !== '' ? v : '手動標記：' + k),
          level: level, resolvable: true, lawKey: null, lawName: '待查', article: '待查',
          advice: '使用者手動標記的項目，系統沒有對應的判斷規則。請在此補上要找誰處理與預估時程，並留下複核紀錄。'
        };
      }
      var reason = (isObj(v) && typeof v.reason === 'string' && v.reason !== '') ? v.reason
                 : (typeof v === 'string' && v !== '' ? v : '使用者在 M2 手動標記此項；系統未在謄本文字中偵測到對應字樣。');
      var f = mkFlag(k, def, (isObj(v) && RANK[v.level]) ? v.level : def.level,
                     reason, (isObj(v) && typeof v.advice === 'string' && v.advice !== '') ? v.advice : def.advice,
                     (isObj(v) && v.resolvable === false) ? false : true);
      f.manual = true;
      flags.push(f);
      notes.push('旗標「' + f.label + '」來自使用者手動標記，不是系統從謄本判讀出來的。');
    }
  }

  /* ===================== m2 主體 ===================== */

  function m2(p, ctx) {
    p = isObj(p) ? p : {};
    ctx = isObj(ctx) ? ctx : {};
    var pc = isObj(p.parcel) ? p.parcel : {};
    var text = str(pc.deedText);
    var notes = [];
    var flags = [];
    var i, k, hits, reason, advice;

    /* ---- 取得 M1 的解析結果；M1 掛掉時自己重解一次，不讓 m2 跟著失效 ---- */
    var m1 = isObj(ctx.m1) ? ctx.m1 : null;
    /* m1.deed.parsed 是布林旗標；解析結果本體在 m1.deed.detail */
    var parsed = (m1 && isObj(m1.deed) && isObj(m1.deed.detail)) ? m1.deed.detail : null;
    if (!parsed && trim(text) !== '' && TD.engine.parseDeed) {
      parsed = TD.engine.parseDeed(text);
      notes.push('未取得 M1 的謄本解析結果，M2 已自行重新解析一次。');
    }
    var owners = (parsed && isArr(parsed.owners)) ? parsed.owners : [];
    var lines = toLines(text);
    if (parsed && (parsed.deedClass === 2 || parsed.maskedOwners > 0)) {
      notes.push('本次判讀依第二類謄本：祭祀公業、神明會、公司等非自然人名稱、限制登記、他項權利、權利範圍與登記原因都完整可讀；'
               + '自然人姓名與住址部分遮蔽，因此「海外共有人」與「未辦繼承人數」只能從登記原因與公同共有記載推斷，'
               + '簽約前請賣方提供第一類謄本或由地政士複核。');
    }

    var ownerCountEff = rawOf(m1 ? m1.ownerCount : null, 0);
    if (ownerCountEff <= 0) ownerCountEff = owners.length;
    if (ownerCountEff <= 0) ownerCountEff = numOf(pc.ownerCount, 0);

    var denomMax = rawOf(m1 ? m1.shareDenomMax : null, 0);
    if (denomMax <= 0) denomMax = numOf(pc.shareDenomMax, 0);
    if (parsed && numOf(parsed.totals.shareDenomMax, 0) > denomMax) denomMax = numOf(parsed.totals.shareDenomMax, 0);

    /* ---- 沒有謄本文字：一律黃燈，絕不因為「找不到關鍵字」就報綠燈 ---- */
    if (trim(text) === '') {
      flags.push(mkFlag('noDeed', DEF.noDeed, 'amber',
        '未提供登記謄本文字，系統還沒有檢查祭祀公業、公同共有／未辦繼承、日治時期名義人、限制登記與他項權利。'
        + '這是「還沒查」，不是「沒問題」；貼上第二類謄本（線上即可申請）就能完成判讀。',
        DEF.noDeed.advice, true));
    } else if (compact(text).length < 60) {
      flags.push(mkFlag('noDeed', DEF.noDeed, 'amber',
        '謄本文字只有 ' + compact(text).length + ' 個字（第 1 行「' + cut(lines.length ? lines[0].raw : text) + '」），'
        + '不足以判讀產權。多半只貼了片段，請貼上完整謄本全文（含所有權部與他項權利部）。',
        DEF.noDeed.advice, true));
    }

    /* ---- 1. 祭祀公業／神明會（SPEC：名稱含「祭祀公業」「神明會」「管理人」→ 紅） ---- */
    var ancWords = ['祭祀公業', '神明會', '管理人'];
    var ancNames = [];
    for (i = 0; i < owners.length; i++) {
      for (k = 0; k < ancWords.length; k++) {
        if (str(owners[i].name).indexOf(ancWords[k]) >= 0) { ancNames.push(owners[i].name + '（第 ' + owners[i].line + ' 行）'); break; }
      }
    }
    hits = scan(lines, ancWords);
    if (ancNames.length || hits.length) {
      reason = '謄本出現「' + (hits.length ? words(hits) : ancWords.join('／')) + '」字樣：'
             + (ancNames.length ? '所有權人名稱為 ' + ancNames.join('、') + '。' : '')
             + (hits.length ? quote(hits) + '。' : '');
      if (!ancNames.length && words(hits) === '管理人') {
        reason += '注意：只命中「管理人」三個字，這也可能是公同共有管理人、破產管理人或建物管理單位，'
                + '不一定是祭祀公業或神明會。系統不替你判斷，請看原文那一行是誰。';
      }
      reason += '祭祀公業與神明會的土地，處分權不在單一個人手上，談成價格也可能無法過戶。';
      flags.push(mkFlag('ancestral', DEF.ancestral, 'red', reason, DEF.ancestral.advice, DEF.ancestral.resolvable));
    }

    /* ---- 2. 未辦繼承／公同共有（SPEC：含「公同共有」或（含「繼承」且所有權人 > 3）→ 紅） ---- */
    var jointHits = scan(lines, ['公同共有']);
    var inheritHits = scan(lines, ['繼承']);
    var byJoint = jointHits.length > 0;
    var byInherit = inheritHits.length > 0 && ownerCountEff > 3;
    if (byJoint || byInherit) {
      reason = '';
      if (byJoint) {
        reason += '謄本出現「公同共有」：' + quote(jointHits) + '。公同共有的處分原則上要全體同意，'
                + '一個人不同意就動不了，通常代表繼承登記沒有辦完。';
      }
      if (byInherit) {
        reason += (reason ? ' ' : '') + '謄本出現「繼承」登記原因且所有權人達 ' + ownerCountEff + ' 人（超過 3 人）：'
                + quote(inheritHits) + '。人數越多越可能是一代或兩代沒有分割完的繼承案。';
      }
      if (parsed && numOf(parsed.totals.jointCount, 0) > 0) {
        reason += ' 解析出 ' + parsed.totals.jointCount + ' 位所有權人登記為公同共有。';
      }
      if (parsed && parsed.found && isArr(parsed.found.jointOwner) && parsed.found.jointOwner.length) {
        reason += ' 謄本另列有公同共有人名單（第 ' + parsed.found.jointOwner[0].line + ' 行），'
                + '實際要談的人數可能多於所有權人欄位所列。';
      }
      flags.push(mkFlag('intestate', DEF.intestate, 'red', reason, DEF.intestate.advice, DEF.intestate.resolvable));
    }

    /* ---- 3. 日治時期名義人（SPEC：含「昭和」「大正」「明治」或日文假名 → 紅） ---- */
    var eraHits = scan(lines, ['昭和', '大正', '明治']);
    var kanaHits = scanRe(lines, /[ぁ-ゖァ-ヺｦ-ﾝ]+/);
    if (eraHits.length || kanaHits.length) {
      reason = '';
      if (eraHits.length) reason += '謄本出現日本年號「' + words(eraHits) + '」：' + quote(eraHits) + '。';
      if (kanaHits.length) reason += (reason ? ' ' : '') + '謄本出現日文假名「' + words(kanaHits) + '」：' + quote(kanaHits) + '。';
      reason += ' 日治時期登記的名義人（含會社、組合、日本人姓名）在光復後多半沒有完成權利清理，'
              + '現在的登記名義人可能已經不是真正的權利人。這是最容易讓整案報廢的一種瑕疵。'
              + '（誤判提醒：「大正」「明治」也可能只是路名或公司名，請看引用的原文那一行。）';
      flags.push(mkFlag('japanese', DEF.japanese, 'red', reason, DEF.japanese.advice, DEF.japanese.resolvable));
    }

    /* ---- 4. 海外共有人（SPEC：住址含國名或英文地址 → 黃） ---- */
    var u = util();
    var oversea = [];
    for (i = 0; i < owners.length && oversea.length < MAX_HITS; i++) {
      var hitWord = u ? u.overseasHit(owners[i].addr) : null;
      if (hitWord) oversea.push({ name: owners[i].name, line: owners[i].line, word: hitWord, addr: cut(owners[i].addr) });
    }
    if (!oversea.length && parsed && parsed.found && isArr(parsed.found.addr)) {
      for (i = 0; i < parsed.found.addr.length && oversea.length < MAX_HITS; i++) {
        var w2 = u ? u.overseasHit(parsed.found.addr[i].value) : null;
        if (w2) oversea.push({ name: '（未對上所有權人）', line: parsed.found.addr[i].line, word: w2, addr: cut(parsed.found.addr[i].value) });
      }
    }
    if (oversea.length) {
      var bits = [];
      for (i = 0; i < oversea.length; i++) {
        bits.push(oversea[i].name + '（第 ' + oversea[i].line + ' 行，命中「' + oversea[i].word + '」）住址「' + oversea[i].addr + '」');
      }
      reason = '偵測到共有人住址在海外：' + bits.join('；') + '。'
             + '海外共有人不是不能處理，但每一份文件都要跨國認證，時程與失聯風險都由對方決定。';
      flags.push(mkFlag('overseas', DEF.overseas, 'amber', reason, DEF.overseas.advice, DEF.overseas.resolvable));
    }

    /* ---- 5. 持分細碎（SPEC：shareDenomMax >= 1000 或 ownerCount >= 10 → 黃） ---- */
    if (denomMax >= 1000 || ownerCountEff >= 10) {
      var why = [];
      if (denomMax >= 1000) why.push('最大持分分母 ' + denomMax + '（門檻 1000）');
      if (ownerCountEff >= 10) why.push('所有權人 ' + ownerCountEff + ' 人（門檻 10 人）');
      reason = why.join('、') + '。'
             + '持分細碎的實務意義是：土地法第34條之1的人數門檻要一個一個去湊，'
             + '最後幾位共有人知道自己是關鍵，價格會跳。'
             + (parsed && isArr(parsed.found.share) ? '謄本共解析出 ' + parsed.found.share.length + ' 筆權利範圍記載。' : '');
      flags.push(mkFlag('fragmented', DEF.fragmented, 'amber', reason, DEF.fragmented.advice, DEF.fragmented.resolvable));
    }

    /* ---- 6. 他項權利與限制登記 ----
       SPEC：查封／假扣押／假處分／預告登記 → 紅；單純抵押權 → 綠但註記。
       另外把地上權、典權、耕作權、不動產役權判為黃：這些用益物權會限制土地使用與改建，
       塗銷需權利人同意並可能要補償，比單純抵押權嚴重，但不像限制登記那樣直接凍結處分。 */
    var restrictWords = (u ? u.RESTRICT_TYPES : ['查封', '假扣押', '假處分', '預告登記']);
    var restrictHits = [], restrictNegated = [];
    if (parsed && isArr(parsed.restrictions)) {
      for (i = 0; i < parsed.restrictions.length; i++) {
        var rr = parsed.restrictions[i];
        var item = { word: rr.type, line: { no: rr.line, raw: rr.raw, cmp: compact(rr.raw) } };
        if (rr.negated) { if (restrictNegated.length < MAX_HITS) restrictNegated.push(item); }
        else if (restrictHits.length < MAX_HITS) restrictHits.push(item);
      }
    } else {
      restrictHits = scan(lines, restrictWords);
    }

    var mortHits = scan(lines, ['抵押權']);
    var useRightHits = scan(lines, ['地上權', '典權', '耕作權', '不動產役權']);
    var amountText = '';
    if (parsed && isArr(parsed.rights)) {
      var amts = [];
      for (i = 0; i < parsed.rights.length; i++) {
        if (parsed.rights[i].amount !== null) {
          amts.push((parsed.rights[i].type || '他項權利') + ' ' + (TD.fmt ? TD.fmt.money(parsed.rights[i].amount) : parsed.rights[i].amount));
        }
      }
      if (amts.length) amountText = '謄本記載的權利價值：' + amts.join('、')
        + '（抵押權欄位寫的是擔保債權「總金額」，那是最高限額，不等於實際未償餘額，須向債權人查實際餘額）。';
    }

    // 不管亮哪一種燈，其他他項權利的存在都要寫進 reason，不可以因為燈號分支而漏掉
    var extra = '';
    if (restrictHits.length && useRightHits.length) {
      extra += ' 同一份謄本另有用益性他項權利「' + words(useRightHits) + '」：' + quote(useRightHits) + '，拆除重建前須一併處理。';
    }
    if ((restrictHits.length || restrictNegated.length || useRightHits.length) && mortHits.length) {
      extra += ' 另設定有抵押權：' + quote(mortHits) + '，交割時須以價金代償並同時塗銷。';
    }

    if (restrictHits.length) {
      reason = '偵測到限制登記「' + words(restrictHits) + '」：' + quote(restrictHits) + '。'
             + '限制登記期間土地不能移轉也不能設定，任何買賣或合建的時程都要等它塗銷。' + extra + amountText;
      advice = '查封／假扣押／假處分須由執行法院撤銷或債權人撤回；預告登記須請求權人同意塗銷。'
             + '請律師先調執行案號、債權人與實際債權餘額，算出清償或和解成本，再回頭談土地價格。'
             + '實務 3 到 12 個月，塗銷前不要付任何不可回收的價金。';
      flags.push(mkFlag('encumbrance', DEF.encumbrance, 'red', reason, advice, true));
    } else if (restrictNegated.length) {
      reason = '謄本出現限制登記關鍵詞，但文字疑為否定寫法（例如「查無查封」）：' + quote(restrictNegated) + '。'
             + '系統無法確定到底有沒有限制登記，所以標黃而不是標綠——這種不確定必須由人來看，不能由字串比對決定。' + extra + amountText;
      advice = '請直接看紙本謄本的「限制登記事項」與「其他登記事項」欄逐字確認，或請地政士重新調閱一份最新謄本。約 1 天。';
      flags.push(mkFlag('encumbrance', DEF.encumbrance, 'amber', reason, advice, true));
    } else if (useRightHits.length) {
      reason = '偵測到用益性他項權利「' + words(useRightHits) + '」：' + quote(useRightHits) + '。'
             + '這類權利會限制土地的實際使用與改建，拆除重建前必須先塗銷或等存續期間屆滿。' + extra + amountText;
      advice = '請律師確認存續期間、地租與補償條件，並評估塗銷所需的對價；'
             + '同時請建築師確認在權利未塗銷前是否根本無法申請建照。'
             + '時程與金額由權利人決定，是價格談判的重點，不要當成小事。';
      flags.push(mkFlag('encumbrance', DEF.encumbrance, 'amber', reason, advice, true));
    } else if (mortHits.length) {
      reason = '偵測到抵押權設定：' + quote(mortHits) + '。'
             + '抵押權不阻斷交易，是可以用價金處理的常態負擔，因此判為綠燈，但必須註記。' + amountText;
      advice = '交割時以價金代償並同時辦理塗銷，由地政士排代償、塗銷與過戶的同日程序。'
             + '務必向債權銀行取得實際未償餘額與清償違約金（謄本只寫最高限額）。約 1 到 4 週。';
      flags.push(mkFlag('encumbrance', DEF.encumbrance, 'green', reason, advice, true));
    }

    /* ---- 使用者手動旗標（只加不消） ---- */
    applyManual(p, flags, notes);

    /* ---- 燈號彙總 ---- */
    var level = 'green', blocked = false, red = 0, amber = 0, green = 0;
    for (i = 0; i < flags.length; i++) {
      if (RANK[flags[i].level] > RANK[level]) level = flags[i].level;
      if (flags[i].level === 'red') { red++; if (flags[i].resolvable === false) blocked = true; }
      else if (flags[i].level === 'amber') amber++;
      else green++;
    }
    // 依嚴重度排序，紅燈排前面，讓 UI 與簡報直接取前幾筆就是最要命的
    flags.sort(function (a, b) { return RANK[b.level] - RANK[a.level]; });

    var consent = consentOf(p, ownerCountEff, notes);

    /* ---- 摘要（字串型 V；conf 一律 low，逼使用者複核） ---- */
    var redLabels = [], amberLabels = [];
    for (i = 0; i < flags.length; i++) {
      if (flags[i].level === 'red' && redLabels.length < 5) redLabels.push(flags[i].label);
      else if (flags[i].level === 'amber' && amberLabels.length < 5) amberLabels.push(flags[i].label);
    }
    var head = level === 'red' ? '紅燈' : (level === 'amber' ? '黃燈' : '綠燈');
    var sumText = head + '：';
    if (!flags.length) {
      sumText += '謄本文字未偵測到祭祀公業、未辦繼承、日治時期名義人、海外共有人、持分細碎或限制登記等字樣。'
               + '這只代表「這幾組關鍵字沒出現」，不代表產權乾淨，仍須由地政士做完整產權調查。';
    } else if (level === 'red') {
      sumText += '偵測到 ' + red + ' 項可能讓交易無法成立的瑕疵（' + redLabels.join('、') + '）'
               + (amber ? '，另有 ' + amber + ' 項需處理事項（' + amberLabels.join('、') + '）' : '') + '。先解產權再談價格；'
               + (blocked ? '其中有「本案無法單方面解決」的項目，目前不建議出價。' : '這些項目可解，但要把時間與費用算進出價。');
    } else if (level === 'amber') {
      sumText += '偵測到 ' + amber + ' 項需處理事項（' + amberLabels.join('、') + '）。可處理，但會拉長時程與折價幅度。';
    } else {
      sumText += '未偵測到阻斷性瑕疵' + (green ? '（有 ' + green + ' 項一般負擔需在交割時處理）' : '') + '，仍建議由地政士複核。';
    }
    sumText += ' 土地法第34條之1第1項：' + (consent.pass ? '已達門檻（' + consent.method + '）' : consent.method) + '。';

    var summary = TD.V('m2.summary', sumText, 'low',
      lawOf('LAND_REG_RULES', '土地登記規則', '待查').text + '；' + lawOf('LAND_ACT_34_1', '土地法 第34條之1', '第34條之1第1項').text,
      '燈號 = 所有旗標中最嚴重者（紅 > 黃 > 綠）；blocked = 有紅燈且該紅燈不可解',
      '本判讀是謄本文字的關鍵字比對，會誤判也會漏判，不能取代地政士與律師的產權調查。'
      + '沒有謄本文字時一律黃燈，系統不會因為找不到關鍵字而報綠燈。');

    return {
      level: level,
      flags: flags,
      consent: consent,
      summary: summary,
      blocked: blocked,

      /* 附加欄位（不改契約既有欄名） */
      summaryText: sumText,
      counts: { red: red, amber: amber, green: green, total: flags.length },
      hasDeedText: trim(text) !== '',
      ownerCountUsed: ownerCountEff,
      shareDenomMaxUsed: denomMax,
      resolvedNotes: str(isObj(p.m2) ? p.m2.resolvedNotes : ''),
      notes: notes
    };
  }

  TD.engine.m2 = m2;
})(window.TD);
