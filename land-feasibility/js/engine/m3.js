/* M3 法規檢討：查分區基準強度（建蔽率、容積率），並逐項檢核；無圖資算不出來的一律標 manual。*/
window.TD = window.TD || {};
(function (TD) {
  'use strict';

  TD.engine = TD.engine || {};

  /* ------------------------------------------------------------------
     設計說明（複核者請先讀）

     1. 本模組只做兩件事：
        (a) 由 parcel.city + parcel.zone 查 TD.data.zoning 取建蔽率 bcr 與容積率 far，
            算出建築面積上限與基準容積樓地板面積；
        (b) 列出必做檢核，逐項回答「算不算得出來、算出來是什麼、算不出來缺什麼資料」。
     2. 信心等級：種子資料來的數值一律 'unv'（待查證）；使用者覆寫（p.m3.overrides）標 'input'。
        這不是保守美學，是 SPEC 原則一：算錯一次的損失遠大於算對五十次省下的時間。
     3. check.status 的語意：
        'pass'   依現有輸入與種子資料，這一項算得出來且通過；
        'fail'   算得出來且不通過，標題會進 blockers；
        'manual' **無圖資或無法源數值，算不出來**。note 必須寫明「需要什麼資料才算得出來」；
        'na'     本案不適用。
     4. 日照、防火間隔、退縮、高度比、細部計畫但書在沒有圖資的情況下一律 'manual'。
        **假裝算得出來是這個產品最危險的失敗模式**，不要為了畫面好看把它們寫成 pass。
     5. 使用者可用 p.m3.manualChecks[id] 把 manual 項目人工結案（見 applyManualDecision），
        系統本身**絕不**自動把 manual 改成 pass。
     6. 本模組是純函式：不碰 document、不碰 localStorage、不發任何網路請求。
     ------------------------------------------------------------------ */

  /* 本系統自訂的保守門檻，**不是法規數字**。命名刻意帶 ASSUMED，讓複核者一眼看得出來。*/
  var ASSUMED_MIN_ROAD_M = 6;

  /* 檢核項目的固定標題（blockers 收集的就是這些標題） */
  var LABELS = {
    oddLot: '畸零地',
    roadWidth: '臨路寬度',
    setback: '退縮',
    heightRatio: '高度比',
    sunlight: '日照',
    fireGap: '防火間隔',
    parking: '停車',
    detailPlan: '細部計畫但書'
  };

  /* ---------------- 小工具 ---------------- */

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function numOr(v, d) { return isNum(v) ? v : d; }
  function hasOwn(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function n(v, d) { return TD.fmt.n(v, d === undefined ? 1 : d); }
  function pctStr(v) { return TD.fmt.pct(v, 1); }
  function pingOf(m2) { return m2 / TD.PING; }

  /* 法源字串：條號填不出來就明寫「條號待查」，不得拼一個看起來像條號的東西出來 */
  function lawStr(lawName, article) {
    var nm = (lawName === null || lawName === undefined || lawName === '') ? '（法規名稱待查）' : String(lawName);
    if (article && article !== '待查') return nm + ' ' + article;
    return nm + '（條號待查）';
  }

  function sumParcelArea(numbers) {
    var t = 0, i, a;
    if (!numbers || !numbers.length) return 0;
    for (i = 0; i < numbers.length; i++) {
      a = numbers[i] ? numbers[i].areaM2 : null;
      if (isNum(a)) t += a;
    }
    return t;
  }

  /* 建立一筆檢核。
     valueNum 是給下游模組（m5）讀的結構化數值，只有「真的算出來」時才填，
     算不出來一律 null。value／requirement 是給人看的字串，下游模組不得從裡面撈數字：
     requirement 寫的是比例（例如「每 150 ㎡ 設一位」），撈出來會被當成數量（150 位）。 */
  function mk(id, status, value, requirement, law, note, conf, valueNum) {
    return {
      id: id,
      label: LABELS[id] || id,
      status: status,
      value: value,
      valueNum: (typeof valueNum === 'number' && isFinite(valueNum)) ? valueNum : null,
      requirement: requirement,
      law: law,
      note: note,
      conf: conf || 'unv'
    };
  }

  /* 畸零地對照表取列：rows 由小到大，取第一個 roadWidthMax >= 正面路寬 者；
     roadWidthMax 為 null 代表「以上皆是」。*/
  function pickOddRow(rows, roadWidth) {
    var i, r;
    if (!rows || !rows.length) return null;
    for (i = 0; i < rows.length; i++) {
      r = rows[i];
      if (r.roadWidthMax === null || r.roadWidthMax === undefined) return r;
      if (roadWidth <= r.roadWidthMax) return r;
    }
    return rows[rows.length - 1];
  }

  /* 把某一列的適用路寬區間寫成人看得懂的字串，供 requirement 使用 */
  function oddRowRange(rows, idx) {
    var lo = 0, r = rows[idx];
    if (idx > 0 && isNum(rows[idx - 1].roadWidthMax)) lo = rows[idx - 1].roadWidthMax;
    if (r.roadWidthMax === null || r.roadWidthMax === undefined) return '路寬 ' + n(lo, 0) + ' 公尺以上';
    if (idx === 0) return '路寬 ' + n(r.roadWidthMax, 0) + ' 公尺以下';
    return '路寬 ' + n(lo, 0) + ' 至 ' + n(r.roadWidthMax, 0) + ' 公尺';
  }

  function indexOfRow(rows, row) {
    var i;
    for (i = 0; i < rows.length; i++) if (rows[i] === row) return i;
    return -1;
  }

  /* 使用者把 manual 項目人工結案：p.m3.manualChecks[id] 接受
       'pass' / 'fail' / 'na' / 'manual'
       { status:'pass', note:'已請建築師套繪確認', by:'王小明' }
       true（相容 checkbox 型 UI，視為 'pass'）
     一律把系統原判定留在 autoStatus / autoNote，conf 改 'input'，
     並在 note 開頭寫明是「使用者人工判定」，不讓人誤以為是系統算出來的。*/
  function applyManualDecision(chk, val) {
    var st = null, note = '', by = '';
    if (val === undefined || val === null || val === '' || val === false) return chk;
    if (val === true) st = 'pass';
    else if (typeof val === 'string') st = val;
    else if (typeof val === 'object') {
      st = val.status;
      note = val.note ? String(val.note) : '';
      by = val.by ? String(val.by) : '';
    }
    if (st !== 'pass' && st !== 'fail' && st !== 'na' && st !== 'manual') return chk;
    chk.autoStatus = chk.status;
    chk.autoNote = chk.note;
    chk.status = st;
    chk.conf = 'input';
    chk.note = '使用者人工判定為「' + st + '」'
             + (by ? '（複核人：' + by + '）' : '')
             + (note ? '：' + note : '') + '。'
             + '系統原判定為「' + chk.autoStatus + '」，原說明：' + chk.autoNote;
    return chk;
  }

  /* ---------------- 主函式 ---------------- */

  function m3(p, ctx) {
    p = p || {};
    ctx = ctx || {};

    var parcel = p.parcel || {};
    var cfg = p.m3 || {};
    var ov = cfg.overrides || {};
    var manualChecks = cfg.manualChecks || {};

    var notes = [];
    var checks = [];

    /* ---- 分區查表 ---- */

    var city = parcel.city ? String(parcel.city) : '';
    var zoneCode = parcel.zone ? String(parcel.zone) : '';

    var zoning = (TD.data && TD.data.zoning) ? TD.data.zoning : null;
    var cities = (zoning && zoning.cities) ? zoning.cities : {};
    var cityData = null;
    /* 以底線開頭的 key（_template）是擴充範本，不是真的縣市 */
    if (city && city.charAt(0) !== '_' && hasOwn(cities, city)) cityData = cities[city];

    var zones = (cityData && cityData.zones) ? cityData.zones : {};
    var zoneData = (zoneCode && hasOwn(zones, zoneCode)) ? zones[zoneCode] : null;

    var cityLawName = cityData ? (cityData.lawName || '') : '';
    var zoneArticle = zoneData ? (zoneData.article || '待查') : '待查';
    var zoneName = zoneData ? (zoneData.name || zoneCode) : '';
    var zoneSrc = lawStr(cityLawName || '土地使用分區管制規定（縣市法規待查）', zoneArticle);

    if (!cityData) {
      notes.push('查無「' + (city || '（未填縣市）') + '」的分區種子資料。本專案 MVP 只建置臺北市，'
               + '其他縣市請複製 TD.data.zoning.cities._template 後逐格填寫；未填之前建蔽率與容積率一律為待查。');
    } else if (!zoneData) {
      notes.push('查無「' + city + ' / ' + (zoneCode || '（未填分區）') + '」的分區種子資料。'
               + '分區代碼應以土地使用分區證明書或地籍圖資為準，代碼寫法不同（例如「住三」與「第三種住宅區」）也會查不到。');
    }

    /* ---- 面積：優先用 m1 的解析結果，其次才自己加總地號 ---- */

    var areaM2 = null, areaSrc = '';
    if (ctx.m1 && isNum(TD.raw(ctx.m1.areaM2))) {
      areaM2 = TD.raw(ctx.m1.areaM2);
      areaSrc = 'M1 土地基本資訊';
    } else {
      areaM2 = sumParcelArea(parcel.numbers);
      areaSrc = 'parcel.numbers 加總';
    }
    if (!isNum(areaM2) || areaM2 <= 0) {
      areaM2 = null;
      notes.push('基地面積為 0 或取不到，建築面積與基準容積無法計算。請先在 M1 填入地號面積（以地政事務所核發之謄本為準）。');
    }

    /* ---- 建蔽率 / 容積率 ---- */

    var Z_NOTE = '種子資料尚未與法規原文逐字核對（verified:false），且個案仍可能受都市計畫書、'
               + '細部計畫、都市設計審議、航高或保護區規定另訂較嚴限制。這一格是本系統最該被查證的數字之一。';

    var bcrV, farV, bcrIsInput = false, farIsInput = false;

    if (isNum(ov.bcr)) {
      bcrIsInput = true;
      bcrV = TD.V('m3.bcr', ov.bcr, 'input', '使用者輸入（p.m3.overrides.bcr）',
                  '建蔽率 = 使用者覆寫值',
                  '使用者自行輸入，已覆蓋分區種子資料' + (zoneData && isNum(zoneData.bcr) ? '（種子值 ' + pctStr(zoneData.bcr) + '）' : '') + '。請確認來源為該基地之土地使用分區證明或都市計畫書。');
    } else if (zoneData && isNum(zoneData.bcr)) {
      bcrV = TD.V('m3.bcr', zoneData.bcr, 'unv', zoneSrc,
                  '建蔽率 = 分區種子資料查表（' + city + ' / ' + zoneCode + '）',
                  Z_NOTE);
    } else {
      bcrV = TD.V('m3.bcr', null, 'unv', zoneSrc,
                  '建蔽率 = 分區種子資料查表（查無資料）',
                  '查無此分區的建蔽率種子資料，屬「待查」不是 0。請人工查閱' + (cityLawName || '該縣市土地使用分區管制規定') + '附表後，'
                  + '填入 p.m3.overrides.bcr 或補進 js/data/zoning.js。');
    }

    if (isNum(ov.far)) {
      farIsInput = true;
      farV = TD.V('m3.far', ov.far, 'input', '使用者輸入（p.m3.overrides.far）',
                  '容積率 = 使用者覆寫值',
                  '使用者自行輸入，已覆蓋分區種子資料' + (zoneData && isNum(zoneData.far) ? '（種子值 ' + pctStr(zoneData.far) + '）' : '') + '。請確認來源為該基地之土地使用分區證明或都市計畫書。');
    } else if (zoneData && isNum(zoneData.far)) {
      farV = TD.V('m3.far', zoneData.far, 'unv', zoneSrc,
                  '容積率 = 分區種子資料查表（' + city + ' / ' + zoneCode + '）',
                  Z_NOTE);
    } else {
      farV = TD.V('m3.far', null, 'unv', zoneSrc,
                  '容積率 = 分區種子資料查表（查無資料）',
                  '查無此分區的容積率種子資料，屬「待查」不是 0。請人工查閱' + (cityLawName || '該縣市土地使用分區管制規定') + '附表後，'
                  + '填入 p.m3.overrides.far 或補進 js/data/zoning.js。');
    }

    var bcr = TD.raw(bcrV);
    var far = TD.raw(farV);

    /* ---- 建築面積上限與基準容積樓地板面積 ---- */

    var buildAreaM2 = (isNum(areaM2) && isNum(bcr)) ? areaM2 * bcr : null;
    var baseFloorM2 = (isNum(areaM2) && isNum(far)) ? areaM2 * far : null;

    var buildAreaV = TD.V('m3.buildAreaM2', buildAreaM2, bcrIsInput ? 'input' : 'unv',
                          bcrIsInput ? '使用者輸入之建蔽率 × 基地面積（' + areaSrc + '）' : zoneSrc,
                          '建築面積上限 = 基地面積 ' + n(areaM2, 2) + ' ㎡ × 建蔽率 ' + (isNum(bcr) ? pctStr(bcr) : '待查'),
                          '這是「法定建蔽率上限」，不是實際可配置的建築面積。退縮、防火間隔、'
                        + '法定空地留設位置與地下室開挖範圍都會讓實際配置小於此值；'
                        + '角地、基地面積未達一定規模者另有建蔽率放寬或加嚴規定（條號待查）。');

    var baseFloorV = TD.V('m3.baseFloorM2', baseFloorM2, farIsInput ? 'input' : 'unv',
                          farIsInput ? '使用者輸入之容積率 × 基地面積（' + areaSrc + '）' : zoneSrc,
                          '基準容積樓地板面積 = 基地面積 ' + n(areaM2, 2) + ' ㎡ × 容積率 ' + (isNum(far) ? pctStr(far) : '待查'),
                          '僅為「基準容積」，不含容積獎勵（見 M4）與免計容積項目（見 M5）。'
                        + '約 ' + (isNum(baseFloorM2) ? n(pingOf(baseFloorM2), 1) + ' 坪' : '—') + '。'
                        + '個案若受細部計畫另訂容積、或位於容積移轉接受基地上限管制範圍，數字會不同。');

    /* ================= 檢核一：畸零地（可真的算） ================= */

    var odd = (cityData && cityData.oddLot) ? cityData.oddLot : null;
    var oddRows = (odd && odd.rows) ? odd.rows : [];
    var oddLaw = lawStr(odd ? odd.lawName : '畸零地使用規則（縣市法規待查）', odd ? odd.article : '待查')
               + '；種子資料另註記併同建築法第44條至第46條（條號引自種子資料註記，待查證）';

    var roadWidth = numOr(parcel.roadWidth, 0);
    var siteWidth = numOr(parcel.siteWidth, 0);
    var siteDepth = numOr(parcel.siteDepth, 0);
    var isCorner = !!parcel.corner || numOr(parcel.roadCount, 1) >= 2;

    /* 畸零地判定的共通警語：本系統只吃手動輸入的寬深，讀不到地籍圖 */
    var ODD_CAVEAT = '本表為種子值，區間切點與最小寬深數值都可能與現行規定不同（verified:false）。'
                   + '本系統只吃使用者手動輸入的基地寬度與深度，不讀地籍圖，'
                   + '因此不規則地形、三角地、袋地、多筆地號合併後的實際輪廓一律須人工複核；'
                   + (isCorner ? '本案為角地／兩面臨路，角地之最小寬深認定另有規定（條號待查），本表未涵蓋，務必人工確認。'
                               : '若實際為角地或兩面臨路，認定方式另有規定（條號待查）。');

    if (!oddRows.length) {
      checks.push(mk('oddLot', 'manual', '無法判定',
        '基地寬度與深度須達該縣市畸零地使用規則之最小標準',
        oddLaw,
        '本縣市的畸零地最小寬深對照表尚未建置（rows 為空），算不出來。'
        + '需要：該縣市「畸零地使用規則」之最小寬度／最小深度對照表（依正面路寬分級），'
        + '補進 js/data/zoning.js 的 oddLot.rows 後才能判定。' + ODD_CAVEAT, 'unv'));
    } else if (roadWidth <= 0 || siteWidth <= 0 || siteDepth <= 0) {
      checks.push(mk('oddLot', 'manual',
        '基地寬 ' + (siteWidth > 0 ? n(siteWidth, 1) + ' m' : '未輸入')
        + ' × 深 ' + (siteDepth > 0 ? n(siteDepth, 1) + ' m' : '未輸入')
        + '，正面路寬 ' + (roadWidth > 0 ? n(roadWidth, 1) + ' m' : '未輸入'),
        '基地寬度與深度須達該縣市畸零地使用規則之最小標準',
        oddLaw,
        '缺輸入，算不出來。需要：正面路寬、基地寬度、基地深度三項，'
        + '且應以地籍圖（或地籍圖謄本）實測值為準，不要用目測或成交資料推估。' + ODD_CAVEAT, 'unv'));
    } else {
      var row = pickOddRow(oddRows, roadWidth);
      var rowIdx = indexOfRow(oddRows, row);
      var needW = numOr(row.minWidth, 0);
      var needD = numOr(row.minDepth, 0);
      var okW = siteWidth >= needW;
      var okD = siteDepth >= needD;
      var shortParts = [];
      if (!okW) shortParts.push('寬度不足 ' + n(needW - siteWidth, 2) + ' m');
      if (!okD) shortParts.push('深度不足 ' + n(needD - siteDepth, 2) + ' m');
      checks.push(mk('oddLot', (okW && okD) ? 'pass' : 'fail',
        '基地寬 ' + n(siteWidth, 1) + ' m × 深 ' + n(siteDepth, 1) + ' m',
        '正面路寬 ' + n(roadWidth, 1) + ' m（適用級距：' + oddRowRange(oddRows, rowIdx) + '）→ '
        + '最小寬度 ' + n(needW, 1) + ' m、最小深度 ' + n(needD, 1) + ' m',
        oddLaw,
        ((okW && okD)
          ? '依種子對照表，寬度與深度均達標，非畸零地。'
          : '未達標準（' + shortParts.join('；') + '）。'
            + '畸零地非經與鄰地協議合併使用或依法申請調處，不得單獨建築；'
            + '這一項會直接決定這塊地能不能自己蓋，是最不能算錯的檢核之一。')
        + ODD_CAVEAT, 'unv'));
    }

    /* ================= 檢核二：臨路寬度（可真的算，但門檻是自訂保守值） ================= */

    var roadLaw = '建築法（條號待查）／建築技術規則建築設計施工編（條號待查）';
    var ROAD_ASSUMED_NOTE = '' + n(ASSUMED_MIN_ROAD_M, 0) + ' 公尺是本系統自訂的保守門檻，不是法規數字，'
                          + '法規門檻（含現有巷道、私設通路、基地臨接道路長度之規定）條號待查。'
                          + '能否建築最終以該管主管建築機關「指定建築線」的結果為準，本系統不讀圖資、不代為查調。';

    if (roadWidth <= 0) {
      checks.push(mk('roadWidth', 'manual', '未輸入',
        '基地須臨接經指定建築線之道路（或合法之現有巷道／私設通路）',
        roadLaw,
        '未輸入正面路寬，算不出來。需要：正面（計畫）道路寬度、是否為計畫道路或現有巷道、'
        + '指定建築線圖說，以及基地臨接道路之長度。' + ROAD_ASSUMED_NOTE, 'unv'));
    } else if (roadWidth < ASSUMED_MIN_ROAD_M) {
      checks.push(mk('roadWidth', 'manual', '正面路寬 ' + n(roadWidth, 1) + ' m',
        '臨接道路寬度 ≧ ' + n(ASSUMED_MIN_ROAD_M, 0) + ' 公尺（本系統保守門檻，非法規數字）',
        roadLaw,
        '路寬偏窄，無法逕行判定。需要：該道路是否為都市計畫道路、是否屬既成道路或現有巷道、'
        + '有無退縮建築或拓寬計畫、指定建築線結果，以及是否須與鄰地共同留設通路。'
        + '窄路案常見的實際後果是退縮加大、車道無法設置、消防救災動線不符而必須降低量體。'
        + ROAD_ASSUMED_NOTE, 'unv'));
    } else {
      checks.push(mk('roadWidth', 'pass', '正面路寬 ' + n(roadWidth, 1) + ' m'
        + (isCorner ? '（角地／兩面臨路 ' + n(numOr(parcel.roadCount, 1), 0) + ' 面）' : ''),
        '臨接道路寬度 ≧ ' + n(ASSUMED_MIN_ROAD_M, 0) + ' 公尺（本系統保守門檻，非法規數字）',
        roadLaw,
        '路寬達本系統保守門檻，畸零地級距亦據此判定。'
        + ROAD_ASSUMED_NOTE
        + '另注意：路寬同時影響高度比與退縮，兩項均須另行核算（見本表高度比、退縮）。', 'unv'));
    }

    /* ================= 檢核三：退縮（無圖資一律 manual） ================= */

    var setback = (cityData && cityData.setback) ? cityData.setback : null;
    var setbackLaw = lawStr(setback ? setback.lawName : (cityLawName || '土地使用分區管制規定（縣市法規待查）'),
                            setback ? setback.article : '待查');

    checks.push(mk('setback', 'manual',
      (setback && isNum(setback.frontM)) ? ('種子值前院退縮 ' + n(setback.frontM, 1) + ' m（仍須以圖資核實）') : '未知（無圖資）',
      '依該基地細部計畫、都市設計審議規範與指定建築線指定之退縮',
      setbackLaw,
      '無圖資無法計算，這一項不會自動變成 pass。需要：'
      + '(1) 該基地所屬都市計畫書與細部計畫書之退縮規定；'
      + '(2) 都市設計審議規範（量體、立面、開放空間、無遮簷人行道）；'
      + '(3) 指定建築線圖說與是否臨計畫道路；'
      + '(4) 有無騎樓、無遮簷人行道或人行道退縮要求；'
      + '(5) 鄰地現況與既有建築線。'
      + 'zoning.setback.frontM 為 null 代表「未知」，不是「不必退縮」——引擎不會把 null 當成 0。'
      + '退縮直接吃掉建築面積與一樓店面價值，是量體試算最常被低估的一項。', 'unv'));

    /* ================= 檢核四：高度比（缺管制數值一律 manual） ================= */

    var floorsHint = (isNum(far) && isNum(bcr) && bcr > 0) ? (far / bcr) : null;

    checks.push(mk('heightRatio', 'manual', '無法計算（缺高度比管制數值與圖資）',
      '建築物高度受前面道路寬度之高度比（斜線）管制，並受都市設計審議與航高限制',
      '建築技術規則建築設計施工編（條號待查）',
      '本專案種子資料未收錄高度比／斜線管制數值，算不出來。需要：'
      + '(1) 建築技術規則之高度比與前面道路寬度換算規定（條號與比值待查）；'
      + '(2) 基地前面道路寬度與是否臨接二條以上道路；'
      + '(3) 該區都市設計審議之高度上限；'
      + '(4) 航高限制（松山機場周邊、飛航管制區）與有無保護區、山坡地限制；'
      + '(5) 日照與高度比擇一從嚴時的判定基礎。'
      + (isNum(floorsHint) ? '（僅供概念參考：容積率 ' + pctStr(far) + ' ÷ 建蔽率 ' + pctStr(bcr)
          + ' ≈ 滿建蔽 ' + n(floorsHint, 1) + ' 層，這只是算術比值，不是可蓋樓層數，'
          + '實際樓層數由 M5 依樓高與免計容積另行試算。）' : ''), 'unv'));

    /* ================= 檢核五：日照（無圖資一律 manual） ================= */

    checks.push(mk('sunlight', 'manual', '無法計算（無鄰地與方位圖資）',
      '依建築技術規則之日照（鄰棟間隔）規定，並受都市設計審議規範拘束',
      '建築技術規則建築設計施工編（條號待查）',
      '無圖資無法計算。需要：'
      + '(1) 鄰地現況圖與鄰棟建築物之位置、高度、開口方向；'
      + '(2) 基地方位與座標（日照分析需真北方位）；'
      + '(3) 冬至日有效日照時數分析（須由建築師以專業軟體計算）；'
      + '(4) 該區都市設計審議對日照與棟距的額外要求；'
      + '(5) 擬定之建築配置圖與量體分棟方式。'
      + '日照不合會直接改變配置與可售坪效，且是鄰損與陳情的主要來源之一。'
      + '本系統沒有圖資，任何「日照通過」的結論都是假的。', 'unv'));

    /* ================= 檢核六：防火間隔（無圖資一律 manual） ================= */

    checks.push(mk('fireGap', 'manual', '無法計算（無配置圖與鄰地建物位置）',
      '依建築技術規則之防火間隔、防火構造與開口部規定',
      '建築技術規則建築設計施工編（條號待查）',
      '無圖資無法計算。需要：'
      + '(1) 擬定之建築配置圖（外牆位置與退縮距離）；'
      + '(2) 鄰地現況圖與鄰地建築物外牆、開口部位置；'
      + '(3) 建築物用途組別、樓層數與防火構造、防火區劃設計；'
      + '(4) 有無共同壁、合建或既存違建貼鄰之情形。'
      + '須由開業建築師依規則核算，本系統只負責提醒這一項會影響可建範圍。', 'unv'));

    /* ================= 檢核七：停車（可真的算） ================= */

    var parking = (cityData && cityData.parking) ? cityData.parking : null;
    var perM2 = parking ? parking.residentialPerM2 : null;
    var parkingLaw = lawStr(parking ? parking.lawName : '建築管理自治條例（縣市法規待查）', parking ? parking.article : '待查')
                   + '；併同建築技術規則建築設計施工編停車空間規定（條號待查），兩者從嚴適用';
    var PARK_CAVEAT = '各縣市另有加嚴規定，地方自治條例與建築技術規則從嚴適用；'
                    + '不同用途組別（辦公、零售、旅館）門檻不同，種子資料 officePerM2／retailPerM2 為 null，'
                    + '代表尚未查到，引擎不得自行猜值。'
                    + '另：機械車位、裝卸位、機車停車位、停車空間免計容積之計算方式與獎勵車位規定均另有規範（條號待查）。'
                    + '本項僅算「應設數量」，能否配置得下要看基地寬深、車道迴轉半徑與地下室開挖層數，'
                    + '那是建築師的工作。';

    if (!isNum(perM2) || perM2 <= 0) {
      checks.push(mk('parking', 'manual', '無法計算（缺換算標準）',
        '每一定樓地板面積應設置一停車空間',
        parkingLaw,
        '本縣市的停車換算標準尚未建置（residentialPerM2 為 null 或 0），算不出來。'
        + '需要：該縣市建築管理自治條例與建築技術規則之停車空間附表。' + PARK_CAVEAT, 'unv'));
    } else if (!isNum(baseFloorM2) || baseFloorM2 <= 0) {
      checks.push(mk('parking', 'manual', '無法計算（缺基準容積樓地板面積）',
        '每 ' + n(perM2, 0) + ' ㎡ 樓地板面積設置一停車空間（住宅用途種子值）',
        parkingLaw,
        '基準容積樓地板面積算不出來（缺基地面積或容積率），因此應設車位數也算不出來。'
        + '請先補齊地號面積與分區。' + PARK_CAVEAT, 'unv'));
    } else {
      var stalls = Math.ceil(baseFloorM2 / perM2);
      checks.push(mk('parking', 'pass',
        '以基準容積計，應設 ' + n(stalls, 0) + ' 個停車空間',
        '每 ' + n(perM2, 0) + ' ㎡ 樓地板面積設置一停車空間（住宅用途種子值）',
        parkingLaw,
        '算式：基準容積樓地板 ' + n(baseFloorM2, 2) + ' ㎡ ÷ ' + n(perM2, 0) + ' ㎡／位，'
        + '不足一位者以一位計，得 ' + n(stalls, 0) + ' 位。'
        + '此數字只用了基準容積；容積獎勵（M4）與免計容積（M5）會讓樓地板增加，應設車位數隨之上升，'
        + '請以 M5 的總樓地板面積重算後為準。' + PARK_CAVEAT, 'unv', stalls));
    }

    /* ================= 檢核八：細部計畫但書（無計畫書一律 manual） =================
       SPEC 第 7 節列的必做 id 是七項，這一項是加項：細部計畫但書與附帶條件是
       SPEC 明文點名「最危險」的類別之一，漏掉一條但書就可能讓整個案子做錯決策，
       因此獨立成一列，強迫使用者去把計畫書調出來看。*/

    checks.push(mk('detailPlan', 'manual', '無法判定（未取得都市計畫書與細部計畫書）',
      '個案實際管制以該基地都市計畫書、細部計畫書及其附帶條件（但書）為準',
      lawStr('都市計畫法', '待查') + '；併同該基地都市計畫書與細部計畫書（個案文件，無條號）',
      '本系統不連網、不讀計畫書，這一項永遠算不出來。需要：'
      + '(1) 該基地所屬都市計畫書（主要計畫）與細部計畫書全文，特別是「但書」與附帶條件；'
      + '(2) 通盤檢討與個案變更的最新公告版本（分區之「之一」「之二」多由此指定）；'
      + '(3) 土地使用分區（管制）要點與都市設計審議原則；'
      + '(4) 有無捐地、回饋、開發許可、聯合開發或整體開發地區之限制；'
      + '(5) 有無公共設施保留地、既成道路、禁限建範圍。'
      + '種子資料給的是「分區基準值」，但書與個案條件只能人工查。'
      + '這一項沒查就出價，是這個產業最貴的錯誤。', 'unv'));

    /* ---- 套用使用者的人工判定 ---- */

    var i;
    for (i = 0; i < checks.length; i++) {
      if (hasOwn(manualChecks, checks[i].id)) applyManualDecision(checks[i], manualChecks[checks[i].id]);
    }

    /* ---- blockers 與 manualCount ---- */

    var blockers = [], manualCount = 0;
    for (i = 0; i < checks.length; i++) {
      if (checks[i].status === 'fail') blockers.push(checks[i].label);
      if (checks[i].status === 'manual') manualCount += 1;
    }

    notes.push('本表 ' + checks.length + ' 項檢核中有 ' + manualCount + ' 項為 manual（算不出來，需人工補資料）。'
             + 'manual 不等於通過，也不等於不通過；把 manual 當成 pass 是本系統最危險的誤用。');
    if (blockers.length) {
      notes.push('已出現 ' + blockers.length + ' 項不通過：' + blockers.join('、')
               + '。這些項目在解決前，本案的量體與出價上限都只是假設值。');
    }
    notes.push('法規檢討結果不具法律效力，須由開業建築師簽證；分區、退縮與但書須以主管機關核發文件為準。');

    return {
      bcr: bcrV,
      far: farV,
      buildAreaM2: buildAreaV,
      baseFloorM2: baseFloorV,
      zoneSource: zoneSrc + '｜' + (city || '（未填縣市）') + ' ' + (zoneCode || '（未填分區）')
                + (zoneName ? '（' + zoneName + '）' : '')
                + '｜種子資料 verified:' + String(!!(zoneData && zoneData.verified)),
      checks: checks,
      blockers: blockers,
      manualCount: manualCount,

      /* ---- 以下為加項欄位（SPEC 未列，供 UI 與 M4／M5 取用，不影響契約） ---- */
      zoneRef: {
        city: city, zoneCode: zoneCode, zoneName: zoneName,
        lawName: cityLawName, article: zoneArticle,
        verified: !!(zoneData && zoneData.verified),
        found: !!zoneData,
        note: zoneData ? (zoneData.note || '') : ''
      },
      areaM2Used: areaM2,
      areaSource: areaSrc,
      notes: notes
    };
  }

  TD.engine.m3 = m3;
})(window.TD);
