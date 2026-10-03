/* m5 量體試算：由基準容積與獎勵比例推估樓地板、可售坪、戶數、車位、層數與高度。體積估算，不是建築設計。*/
window.TD = window.TD || {};
(function (TD) {
  'use strict';

  TD.engine = TD.engine || {};

  /* ------------------------------------------------------------------
     本模組的定位（寫程式前先讀）

     這裡算出來的每一個數字都是「體積估算」：把容積乘上幾個比率，反推出
     可售坪、戶數、車位與層數。它回答的是「這塊地值不值得花錢請建築師畫」，
     不是「這塊地可以怎麼蓋」。

     因此 SPEC 第 7 節明訂：本模組所有 V 的信心不得高於 'low'，
     且必須輸出固定的 legalWarning。不要因為算式看起來很確定就調高信心，
     算式確定不代表前提成立：建築線、退縮、開挖率、基地形狀、屋突與
     細部計畫但書都沒有進到這個算式裡。
     ------------------------------------------------------------------ */

  /* SPEC 指定的固定警語，一字不可改 */
  var LEGAL_WARNING = '本項為初步判斷，不具法律效力，須由開業建築師簽證。'
                    + '本系統賣的是『值不值得找建築師』，不是『不用找建築師』。';

  var SRC_VOL    = '基準容積見 m3（臺北市土地使用分區管制自治條例，條號待查）；獎勵比例見 m4';
  var SRC_EXEMPT = '建築技術規則建築設計施工編 免計容積項目（條號待查）';
  var SRC_PARAM  = '使用者輸入之規劃假設，非法規值';
  var SRC_PARK   = '停車空間應設數量：臺北市建築管理自治條例／建築技術規則（條號待查），檢核見 m3 parking';
  var SRC_FLOORS = '建築面積＝基地面積 × 建蔽率（見 m3）；層數為平均攤算，非建築設計';

  /* ===================== 小工具（純計算，不碰 DOM） ===================== */

  function ping() { return (TD && TD.PING) ? TD.PING : 3.3057851239669; }

  // 取數字：V 包裝值與裸數字都安全，非有限數一律回傳 null（不回傳 NaN）
  function num(v) {
    var x = TD.raw(v);
    return (typeof x === 'number' && isFinite(x)) ? x : null;
  }
  function posNum(v) { var x = num(v); return (x !== null && x > 0) ? x : null; }

  function fnum(v, d) {
    if (v === null || v === undefined || typeof v !== 'number' || !isFinite(v)) return '—';
    if (TD.fmt && TD.fmt.n) return TD.fmt.n(v, d === undefined ? 1 : d);
    return String(v);
  }
  function fpct(v, d) {
    if (v === null || typeof v !== 'number' || !isFinite(v)) return '—';
    if (TD.fmt && TD.fmt.pct) return TD.fmt.pct(v, d === undefined ? 1 : d);
    return String(v * 100) + '%';
  }
  // 乘除加：任一為 null 就整串回傳 null，避免 NaN 流到畫面上
  function mul(a, b) { return (a === null || b === null) ? null : a * b; }
  function add(a, b) { return (a === null || b === null) ? null : a + b; }
  function m2ToPing(v) { return v === null ? null : v / ping(); }

  // 讀使用者輸入的規劃參數；非數字回落預設、超出範圍夾住，兩種情況都寫進 notes
  function param(obj, key, dflt, lo, hi, label, notes) {
    var v = (obj && typeof obj[key] === 'number' && isFinite(obj[key])) ? obj[key] : null;
    if (v === null) {
      notes.push(label + '（m5.' + key + '）未輸入或不是數字，已回落預設值 ' + dflt + '，請確認。');
      return dflt;
    }
    if (v < lo || v > hi) {
      var c = Math.max(lo, Math.min(hi, v));
      notes.push(label + '（m5.' + key + '）輸入 ' + v + ' 超出合理範圍 ' + lo + '～' + hi
                 + '，已夾為 ' + c + '；這是輸入疑義，不是計算結果，請回頭確認。');
      return c;
    }
    return v;
  }

  // 分區種子資料（建蔽率、容積率、停車換算）；查不到回傳 null，不猜
  function zoneRec(p) {
    var parcel = p.parcel || {};
    var z = (TD.data && TD.data.zoning) ? TD.data.zoning : null;
    if (!z || !z.cities) return null;
    var c = z.cities[parcel.city];
    if (!c || !c.zones) return null;
    return c.zones[parcel.zone] || null;
  }
  function cityRec(p) {
    var parcel = p.parcel || {};
    var z = (TD.data && TD.data.zoning) ? TD.data.zoning : null;
    if (!z || !z.cities) return null;
    return z.cities[parcel.city] || null;
  }

  // 基地面積回落來源：m1 沒給就把地號面積加總（不做持分折算，持分處理是 m1 的責任）
  function parcelAreaM2(p) {
    var rows = (p.parcel && p.parcel.numbers) || [], t = 0, i, a;
    for (i = 0; i < rows.length; i++) {
      a = rows[i] ? rows[i].areaM2 : null;
      if (typeof a === 'number' && isFinite(a) && a > 0) t += a;
    }
    return t > 0 ? t : null;
  }

  /* ===================== 法定應設車位數 ===================== */

  /* 法定應設車位數。兩個來源都算，取較大者：

       (a) m3 的停車檢核結果。**注意 m3 是以「基準容積」樓地板算的**（m3 自己的 note 也寫明
           「此數字只用了基準容積，請以 M5 的總樓地板面積重算後為準」），所以直接採用會漏掉
           容積獎勵增加的樓地板對應的車位。
       (b) 以分區種子資料的換算標準，用本模組算出來的**容積樓地板**（已含獎勵）回推。

     取大者是從嚴：應設車位數少算會同時低估地下室面積與車位收入，屬於「看起來比較好賺」
     的方向，正是原則一要防的錯。兩個來源的數字寫進 notes，讓複核者看得出差在哪。

     (a) 一律只讀 m3 檢核的結構化欄位 c.valueNum，**絕不從 c.value／c.requirement 的
     人話字串撈數字**。requirement 寫的是比例（「每 150 ㎡ 樓地板設一位」），
     撈出來會被當成數量（150 位），憑空生出上億的車位收入與地下室成本。
     m3 算不出來時 valueNum 為 null，這裡就必須是 null。*/
  function parkingRequired(ctx, p, volFloorM2, notes) {
    var checks = (ctx.m3 && ctx.m3.checks) || [], i, c, v;
    var fromM3 = null, m3Status = '';

    for (i = 0; i < checks.length; i++) {
      c = checks[i];
      if (!c || c.id !== 'parking') continue;
      m3Status = c.status || '—';
      v = num(c.valueNum);
      if (v !== null && v >= 0) {
        fromM3 = Math.ceil(v);
      } else {
        notes.push('m3 停車檢核沒有給出結構化的應設車位數（status：' + m3Status
                   + '，valueNum 為 null），代表 m3 自己也算不出來。'
                   + '本模組不從檢核說明文字撈數字（那是比例不是數量），改以分區種子資料回推，'
                   + '若種子資料也缺就回 null，請人工複核。');
      }
      break;
    }

    var city = cityRec(p);
    var perM2 = (city && city.parking && typeof city.parking.residentialPerM2 === 'number'
                 && isFinite(city.parking.residentialPerM2) && city.parking.residentialPerM2 > 0)
               ? city.parking.residentialPerM2 : null;
    var fromSeed = null;
    if (perM2 !== null && volFloorM2 !== null && volFloorM2 > 0) {
      fromSeed = Math.ceil(volFloorM2 / perM2);
    }

    if (fromM3 === null && fromSeed === null) {
      notes.push('無法推估法定應設車位數（m3 未提供可用數字，且分區停車換算種子資料缺漏），'
                 + '車位數僅以戶數計，地下室面積因此可能低估。');
      return { stalls: null, from: 'none', fromM3: null, fromSeed: null };
    }

    if (fromM3 !== null && fromSeed !== null) {
      if (fromSeed > fromM3) {
        notes.push('法定應設車位數：m3 檢核（以基準容積計）為 ' + fnum(fromM3, 0)
                   + ' 位，以含獎勵的容積樓地板 ' + fnum(volFloorM2, 0) + ' ㎡ ÷ 每 '
                   + fnum(perM2, 0) + ' ㎡／位（條號待查）回推為 ' + fnum(fromSeed, 0)
                   + ' 位，取較大者 ' + fnum(fromSeed, 0) + ' 位。'
                   + '差額來自 m3 只用了基準容積、沒有把容積獎勵增加的樓地板算進去。'
                   + '應設基礎究竟為容積樓地板或總樓地板各縣市認定不同，須以建築師的停車空間計算書為準。');
        return { stalls: fromSeed, from: 'seed>m3', fromM3: fromM3, fromSeed: fromSeed };
      }
      notes.push('法定應設車位數取 m3 停車檢核（status：' + m3Status + '）的 ' + fnum(fromM3, 0)
                 + ' 位；以含獎勵的容積樓地板回推為 ' + fnum(fromSeed, 0)
                 + ' 位，不高於 m3，故以 m3 為準。');
      return { stalls: fromM3, from: 'm3', fromM3: fromM3, fromSeed: fromSeed };
    }

    if (fromM3 !== null) {
      notes.push('法定應設車位數取自 m3 停車檢核（status：' + m3Status + '）：' + fnum(fromM3, 0)
                 + ' 位。分區停車換算種子資料缺漏，無法用含獎勵的容積樓地板交叉驗算，'
                 + '而 m3 是以基準容積計算的，這個數字可能低估，請人工複核。');
      return { stalls: fromM3, from: 'm3', fromM3: fromM3, fromSeed: null };
    }

    notes.push('法定應設車位數以種子資料回推：住宅每 ' + fnum(perM2, 0) + ' ㎡ 樓地板設一位（條號待查），'
               + '以含獎勵的容積樓地板 ' + fnum(volFloorM2, 0) + ' ㎡ 計算，得 ' + fnum(fromSeed, 0) + ' 位。'
               + '應設基礎究竟為容積樓地板或總樓地板各縣市認定不同，此處取容積樓地板，'
               + '屬保守假設，須以建築師計算書為準。');
    return { stalls: fromSeed, from: 'seed', fromM3: null, fromSeed: fromSeed };
  }

  /* ===================== 主體 ===================== */

  function m5(p, ctx) {
    p = p || {};
    ctx = ctx || {};
    var s = p.m5 || {};
    var m1 = ctx.m1 || {};
    var m3 = ctx.m3 || {};
    var m4 = ctx.m4 || {};
    var notes = [];
    var PING = ping();

    /* ---- 規劃參數（全部是使用者假設，不是法規值）---- */
    var exemptRatio       = param(s, 'exemptRatio', 0.30, 0, 0.8, '免計容積比例', notes);
    var sellRatio         = param(s, 'sellRatio', 0.95, 0.5, 1, '可售率', notes);
    var publicRatio       = param(s, 'publicRatio', 0.33, 0, 0.6, '公設比', notes);
    var avgUnitPing       = param(s, 'avgUnitPing', 35, 8, 200, '平均每戶坪數', notes);
    var basementPerStallM2 = param(s, 'basementPerStallM2', 40, 20, 80, '每車位地下室樓地板', notes);
    var floorHeightM      = param(s, 'floorHeightM', 3.2, 2.6, 6, '樓層高度', notes);

    /* ---- 上游數值：基地面積、建蔽率、基準容積樓地板、獎勵比例 ---- */
    var siteAreaM2 = posNum(m1.areaM2);
    if (siteAreaM2 === null) {
      siteAreaM2 = parcelAreaM2(p);
      if (siteAreaM2 !== null) notes.push('m1 未提供基地面積，已改用地號面積加總 ' + fnum(siteAreaM2, 1) + ' ㎡（未折算持分）。');
    }

    /* 這裡一律用 num() 加明確的 !== null 判斷，不用 posNum()。
       兩者的差別是「0」：posNum(0) 回 null，會讓使用者把容積率或建蔽率覆寫成 0
       的意思被當成「m3 沒給值」，然後悄悄換成分區種子值，替一塊零容積的地
       算出十幾億的出價上限。零就是零，必須照著算下去並在 notes 說明不可建。 */
    var zr = zoneRec(p);
    var bcr = num(m3.bcr);
    if (bcr === null && zr && typeof zr.bcr === 'number' && isFinite(zr.bcr) && zr.bcr > 0) {
      bcr = zr.bcr;
      notes.push('m3 未提供建蔽率，已改用分區種子資料 ' + fpct(bcr, 0) + '（未查證）。');
    }
    if (bcr === 0) {
      notes.push('建蔽率為 0（m3 或使用者覆寫的結果），建築面積因此為 0，'
                 + '層數與高度無法計算。本模組照 0 算，不替換成種子值。');
    }
    var far = num(m3.far);
    if (far === null && zr && typeof zr.far === 'number' && isFinite(zr.far) && zr.far > 0) far = zr.far;

    var baseFloorM2 = num(m3.baseFloorM2);
    if (baseFloorM2 === null) {
      baseFloorM2 = mul(siteAreaM2, far);
      if (baseFloorM2 !== null) {
        notes.push('m3 未提供基準容積樓地板，已以「基地面積 × 容積率」自行回推 '
                   + fnum(baseFloorM2, 0) + ' ㎡，請以 m3 的檢討結果為準。');
      } else {
        notes.push('缺少基準容積樓地板與可回推的基地面積或容積率，量體無法估算；'
                   + '請先在 m1／m3 補上基地面積與分區。');
      }
    }
    if (baseFloorM2 === 0) {
      notes.push('基準容積樓地板為 0（容積率或基地面積為 0），這塊地在目前的輸入下不可建：'
                 + '可售坪、戶數、車位與車位收入一律為 0，不是「算不出來」。'
                 + '若這不是你的意思，請回 m3 檢查容積率與基地面積的覆寫值。');
    }

    var bonusPct = num(m4.pct);
    if (bonusPct === null && m4.chosen) bonusPct = num(m4.chosen.pct);
    if (bonusPct === null) {
      bonusPct = 0;
      notes.push('尚未取得 m4 的容積獎勵比例，本次以 0% 計（等於只算基準容積）；'
                 + 'pipeline 正常執行時 m4 會在 m5 之前算好，若此註記出現在正式報告請視為錯誤。');
    }

    /* ---- 樓地板 ---- */
    var volFloorM2    = mul(baseFloorM2, 1 + bonusPct);          // 容積樓地板
    var exemptFloorM2 = mul(volFloorM2, exemptRatio);            // 免計容積樓地板
    var grossFloorM2  = add(volFloorM2, exemptFloorM2);          // 總建築樓地板（地上）

    /* ---- 可售坪與主建物坪 ---- */
    var sellablePing = m2ToPing(mul(grossFloorM2, sellRatio));
    var mainPing     = mul(sellablePing, 1 - publicRatio);

    /* ---- 戶數：以可售住宅坪除平均每戶坪數，無條件捨去 ---- */
    var unitsCount = null;
    if (sellablePing !== null && avgUnitPing > 0) unitsCount = Math.floor(sellablePing / avgUnitPing);

    /* ---- 車位：法定應設與戶數取大者 ---- */
    var req = parkingRequired(ctx, p, volFloorM2, notes);
    var stalls = null;
    if (req.stalls !== null && unitsCount !== null) stalls = Math.max(req.stalls, unitsCount);
    else if (req.stalls !== null) stalls = req.stalls;
    else if (unitsCount !== null) stalls = unitsCount;
    if (stalls !== null && unitsCount !== null && req.stalls !== null) {
      notes.push('車位數取「法定應設 ' + fnum(req.stalls, 0) + ' 位」與「一戶一位 ' + fnum(unitsCount, 0)
                 + ' 位」之較大者，得 ' + fnum(stalls, 0) + ' 位。這是銷售慣例的假設（一戶至少配一位），'
                 + '不是法規要求；機械車位與平面車位的單價與所需樓地板差異很大，本模組不分型式。');
    }

    var basementM2 = mul(stalls, basementPerStallM2);

    /* ---- 層數與高度：**總樓地板**除建築面積，無條件進位 ----
       要蓋起來的是總樓地板（容積樓地板 ＋ 免計容積樓地板），不是容積樓地板；
       m7 的營建成本基礎也是總樓地板。用容積樓地板會少算約 exemptRatio 的層數，
       使用者依 floorsAbove 挑營建單價級距（rc12／rc25／src25up）會挑到便宜的那一級，
       m3 的高度比與日照人工複核也會拿到偏低的高度。 */
    var buildAreaM2 = num(m3.buildAreaM2);
    if (buildAreaM2 === null) {
      buildAreaM2 = mul(siteAreaM2, bcr);
      if (buildAreaM2 !== null) notes.push('m3 未提供建築面積，已以「基地面積 × 建蔽率」回推 ' + fnum(buildAreaM2, 1) + ' ㎡。');
    }
    var floorsAbove = null, volFloors = null;
    if (buildAreaM2 !== null && buildAreaM2 > 0) {
      if (grossFloorM2 !== null) floorsAbove = Math.ceil(grossFloorM2 / buildAreaM2);
      if (volFloorM2 !== null) volFloors = Math.ceil(volFloorM2 / buildAreaM2);
    }
    var heightM = mul(floorsAbove, floorHeightM);
    if (floorsAbove !== null && volFloors !== null && floorsAbove !== volFloors) {
      notes.push('實際樓層數 ' + fnum(floorsAbove, 0) + ' 層是以總樓地板 ' + fnum(grossFloorM2, 0)
                 + ' ㎡ ÷ 建築面積 ' + fnum(buildAreaM2, 1) + ' ㎡ 計；'
                 + '若只用容積樓地板 ' + fnum(volFloorM2, 0) + ' ㎡ 會得到 ' + fnum(volFloors, 0)
                 + ' 層（欄位 volFloors），那是「容積層數」，不是要蓋的層數。'
                 + '挑營建單價級距（rc12／rc25／src25up）與判斷高度比、日照時請用實際樓層數。');
    }

    /* ---- 固定提醒：這些是本模組「明知沒算」的事，必須逐條寫出來 ---- */
    notes.push('本模組是體積估算（量體概算），不是建築設計：只把容積乘上幾個比率反推坪數與層數，'
               + '沒有排平面、沒有檢核法規細節，實際可建量體須由開業建築師依實測地籍圖核算。');
    notes.push('未考慮建築線指定：臨路退縮、指定建築線、騎樓地與無遮簷人行道、都市設計審議的退縮與開放空間要求，'
               + '都會直接縮小可建築範圍，進而減少每層面積與可售坪。');
    notes.push('未考慮法定開挖率與基地形狀限制：地下室面積是以車位數乘每車位樓地板反推，'
               + '沒有檢核開挖率上限、基地寬深比、畸零地、鄰地保護與防火間隔造成的無法貼建，'
               + '狹長或不規則基地的實際車位數與地下室面積常低於此估算。');
    notes.push('免計容積比例、可售率、公設比、平均每戶坪數四項都是使用者假設值；'
               + '任一項移動 5%，可售坪與戶數即明顯位移，這是本模組最大的不確定來源。');
    notes.push('層數與高度為平均攤算（假設每層均達滿建蔽），未扣除屋突、機電設備層與夾層，'
               + '也未檢核高度比、日照、航高與消防雲梯車限制，這些在 m3 一律標為需人工複核。');
    notes.push('本版假設全案為住宅使用；若規劃含店面、事務所或旅館，可售坪的組成、'
               + '公設比、車位應設標準與單價都要另行拆分重算。');

    /* ---- 輸出：所有 V 的信心一律 'low'，SPEC 明訂不得更高 ---- */
    var C = 'low';

    var out = {
      volFloorM2: TD.V('m5.volFloorM2', volFloorM2, C, SRC_VOL,
        '容積樓地板 = 基準容積樓地板 ' + fnum(baseFloorM2, 0) + ' ㎡ ×（1 + 獎勵 ' + fpct(bonusPct, 1) + '）',
        '基準容積來自 m3 的分區容積率（種子資料未查證），獎勵比例來自 m4 的組合，兩者都須逐項複核法源。'),

      exemptFloorM2: TD.V('m5.exemptFloorM2', exemptFloorM2, C, SRC_EXEMPT,
        '免計容積樓地板 = 容積樓地板 ' + fnum(volFloorM2, 0) + ' ㎡ × 免計比例 ' + fpct(exemptRatio, 1),
        '免計容積實務上是機電設備、陽台、梯廳與屋突逐項計算後的結果，這裡用單一比例概括，'
        + '誤差可達數個百分點；機電免計另有上限規定（條號待查）。'),

      grossFloorM2: TD.V('m5.grossFloorM2', grossFloorM2, C, SRC_EXEMPT,
        '總建築樓地板（地上）= 容積樓地板 ' + fnum(volFloorM2, 0) + ' ㎡ + 免計容積樓地板 ' + fnum(exemptFloorM2, 0) + ' ㎡',
        '此為地上樓地板，不含地下室（見 basementM2）。m7 計算營建成本時地上與地下單價不同，請勿混用。'),

      basementM2: TD.V('m5.basementM2', basementM2, C, SRC_PARAM,
        '地下室樓地板 = 車位數 ' + fnum(stalls, 0) + ' 位 × 每位 ' + fnum(basementPerStallM2, 0) + ' ㎡',
        '每車位樓地板含車道、機房與必要空間的概估值；開挖層數、擋土工法與地質未納入，'
        + '地下室單價對此面積高度敏感。'),

      sellablePing: TD.V('m5.sellablePing', sellablePing, C, SRC_PARAM,
        '可售坪 = 總建築樓地板 ' + fnum(grossFloorM2, 0) + ' ㎡ × 可售率 ' + fpct(sellRatio, 1) + ' ÷ ' + fnum(PING, 4) + ' ㎡/坪',
        '可售率是扣除無法登記或無法計價部分後的比例，屬假設值。車位面積不計入可售坪，'
        + '車位收入在 m6 另計，請勿重複計算。'),

      mainPing: TD.V('m5.mainPing', mainPing, C, SRC_PARAM,
        '主建物坪 = 可售坪 ' + fnum(sellablePing, 1) + ' 坪 ×（1 − 公設比 ' + fpct(publicRatio, 1) + '）',
        '公設比為假設值；公設比上升會讓同樣可售坪的實際使用面積下降，影響去化速度與單價，'
        + '本模組未把這個回饋關係算進單價。'),

      publicRatio: TD.V('m5.publicRatio', publicRatio, C, SRC_PARAM,
        '公設比 = 使用者輸入 ' + fpct(publicRatio, 1),
        '台北市新案公設比常見區間約三成上下，但與規劃、消防與車道配置直接相關，'
        + '須以建築師平面圖核算，不可沿用預設值對外報價。'),

      unitsCount: TD.V('m5.unitsCount', unitsCount, C, SRC_PARAM,
        '戶數 = 可售住宅坪 ' + fnum(sellablePing, 1) + ' 坪 ÷ 平均每戶 ' + fnum(avgUnitPing, 1) + ' 坪（無條件捨去）',
        '此處的平均每戶坪數以「權狀坪（含公設）」理解；若使用者輸入的是主建物坪，戶數會被高估約三成。'
        + '戶數同時決定車位數下限與去化月數，是牽動最廣的一個假設。'),

      stalls: TD.V('m5.stalls', stalls, C, SRC_PARK,
        '車位數 = max（法定應設 ' + fnum(req.stalls, 0) + ' 位, 戶數 ' + fnum(unitsCount, 0) + ' 位）',
        '應設車位的計算基礎、可否以機械式替代、以及增設車位獎勵，各縣市與個案認定不同，'
        + '須由建築師出具停車空間計算書。'),

      floorsAbove: TD.V('m5.floorsAbove', floorsAbove, C, SRC_FLOORS,
        '地上層數 = 總樓地板 ' + fnum(grossFloorM2, 0) + ' ㎡ ÷ 建築面積 ' + fnum(buildAreaM2, 1) + ' ㎡（無條件進位）',
        '用總樓地板（含免計容積）而不是容積樓地板：要蓋起來的是總樓地板，m7 的營建成本基礎也是它。'
        + '只用容積樓地板會得到 ' + fnum(volFloors, 0) + ' 層（欄位 volFloors），那是容積層數不是實際層數。'
        + '實務上不會每層都滿建蔽，且一樓常做退縮、店面或車道，層數通常仍高於此估算；'
        + '層數一變，營建單價級距（m7 的 rc12／rc25／src25up）也要跟著換。'),

      volFloors: TD.V('m5.volFloors', volFloors, C, SRC_FLOORS,
        '容積層數 = 容積樓地板 ' + fnum(volFloorM2, 0) + ' ㎡ ÷ 建築面積 ' + fnum(buildAreaM2, 1) + ' ㎡（無條件進位）',
        '這不是實際樓層數，只是容積換算成的層數，供對照用。'
        + '選營建單價級距、判斷高度比與日照一律用 floorsAbove（實際樓層數）。'),

      heightM: TD.V('m5.heightM', heightM, C, SRC_FLOORS,
        '高度 = 地上層數 ' + fnum(floorsAbove, 0) + ' 層 × 樓層高度 ' + fnum(floorHeightM, 2) + ' 公尺',
        '未加計屋突、女兒牆與機房；未檢核高度比、日照、航高與消防搶救限制，'
        + '這些項目在 m3 一律為人工複核。'),

      notes: notes,
      legalWarning: LEGAL_WARNING,

      /* 以下為供 m6／m7／UI 取用的裸數值（不包 V，避免重複進入複核閘門） */
      siteAreaM2: siteAreaM2,
      baseFloorM2: baseFloorM2,
      bonusPct: bonusPct,
      buildAreaM2: buildAreaM2,
      parkingRequired: req.stalls,
      parkingFrom: req.from,
      parkingFromM3: req.fromM3,
      parkingFromSeed: req.fromSeed,
      params: {
        exemptRatio: exemptRatio, sellRatio: sellRatio, publicRatio: publicRatio,
        avgUnitPing: avgUnitPing, basementPerStallM2: basementPerStallM2, floorHeightM: floorHeightM
      }
    };

    return out;
  }

  TD.engine.m5 = m5;
})(window.TD);
