/* M4 容積獎勵組合最佳化：以位元遮罩列舉每個制度的獎勵子集合，算封頂後成數與淨效益並排序。*/
window.TD = window.TD || {};
(function (TD) {
  'use strict';

  TD.engine = TD.engine || {};

  /* ------------------------------------------------------------------
     設計說明（複核者請先讀）

     1. 制度（regime）互斥三選一：都更 UR、危老 HR、不走更新／危老 NONE。
        對每個制度列舉其 allows 清單的**所有子集合**（含空集合＝只走制度不申請獎勵），
        先用 bonus.requires 過濾掉不符前提的項目（制度限定、基地面積、屋齡）。
     2. 封頂：bucket 'regime' 的合計以 regime.capOfBase 封頂；'tdr' 以 _meta.tdrCapOfBase
        另計；'outside' 依 SPEC **不封頂**（但種子資料另記一個暫設上限，超過會在
        option.outsideNote 標示，因為「不封頂」是本系統的計算約定，不是法規事實）。
     3. 封頂造成的縮減，在同一個 bucket 內按各項成數比例分攤，
        因此被砍掉的容積不會被收取取得成本 —— 這是刻意的：付錢買沒拿到的容積是錯的。
     4. netGain = 增加可售坪 × 預估單價 − 取得成本 − 時程成本。
        時程成本 = 前置月數 × 估計總成本 × 建融年利率 ÷ 12，是機會成本近似值，不是現金流量表。
        前置月數 = regime.baseMonths ＋ 各獎勵項目的 monthsAdd（跨制度比較必須把制度本身的
        審議時間算進去，否則都更會因為「獎勵成數大」而永遠贏，那是危險的排序）。
     5. **不符制度前提（基地面積、屋齡）的制度，其組合仍會列出**（使用者需要看到為什麼不行），
        但標 feasible:false、排在所有可行組合之後，且不會被選為 best。
     6. 第一次被呼叫時 ctx.m6 不存在，單價用 TD.data.cost 的保守預設；
        pipeline 會在 m6 之後再呼叫一次覆蓋本結果。
     7. 所有成數與上限都是種子資料，**最終成數由主管機關審議決定**。
        本模組只用來排序「值不值得做」，不能當作核准的預期。
     8. 純函式：不碰 document、不碰 localStorage、不發任何網路請求。
     ------------------------------------------------------------------ */

  var ITEM_CAP = 16;        /* 單一制度最多列舉的項目數（2^16 = 65,536 個子集合）*/
  var OPTION_KEEP = 200;    /* 單一制度最多保留的組合數，超過只留 netGain 前段
                               （現行種子資料每個制度最多 7 項＝128 組，不會觸發） */
  var PCT_DP = 6;           /* 成數對外一律四捨五入到小數 6 位，避免浮點雜訊 0.42000000000000004 */
  var EPS = 1e-12;
  var RISK_W = { low: 1, mid: 2, high: 3 };

  /* ---------------- 小工具 ---------------- */

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function numOr(v, d) { return isNum(v) ? v : d; }
  function hasOwn(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function n(v, d) { return TD.fmt.n(v, d === undefined ? 1 : d); }
  function pctStr(v) { return TD.fmt.pct(v, 1); }
  function money(v) { return TD.fmt.money(v); }

  /* 列舉迴圈裡的百分比用這個：TD.fmt 走 toLocaleString，單次約 60 微秒，
     在 2^n 個組合裡呼叫會讓每次重算多花上百毫秒，打字就會卡。
     百分比不需要千分位，輸出與 TD.fmt.pct(v,1) 相同；極端值才退回房內格式化。*/
  function pctFast(v) {
    if (!isNum(v)) return '—';
    if (Math.abs(v) >= 10) return TD.fmt.pct(v, 1);
    return (v * 100).toFixed(1) + '%';
  }

  function lawStr(lawName, article) {
    var nm = (lawName === null || lawName === undefined || lawName === '') ? '（法規名稱待查）' : String(lawName);
    if (article && article !== '待查') return nm + ' ' + article;
    return nm + '（條號待查）';
  }

  function normIds(arr) {
    var out = [], i, v;
    if (!arr || !arr.length) return out;
    for (i = 0; i < arr.length; i++) {
      v = arr[i];
      if (typeof v !== 'string' || v === '') continue;
      if (out.indexOf(v) < 0) out.push(v);
    }
    return out;
  }

  /* 集合相等（忽略順序） */
  function sameSet(a, b) {
    var i, sa, sb;
    if (!a || !b || a.length !== b.length) return false;
    sa = a.slice().sort(); sb = b.slice().sort();
    for (i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false;
    return true;
  }

  function bucketOf(b) {
    var bk = b.bucket;
    if (bk === 'regime' || bk === 'tdr' || bk === 'outside') return bk;
    return 'regime';   /* 未知 bucket 一律從嚴，併入制度上限封頂 */
  }

  function riskLabelOf(w) {
    if (!isNum(w) || w <= 0) return '無';
    if (w < 1.5) return '低';
    if (w < 2.5) return '中';
    return '高';
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

  /* ---------------- 主函式 ---------------- */

  function m4(p, ctx) {
    p = p || {};
    ctx = ctx || {};

    var parcel = p.parcel || {};
    var cfg = p.m4 || {};
    var pctOv = cfg.pctOverrides || {};
    var picked = normIds(cfg.picked);
    var wantRegime = cfg.regime ? String(cfg.regime) : '';

    var notes = [];

    var bd = (TD.data && TD.data.bonus) ? TD.data.bonus : null;
    var meta = (bd && bd._meta) ? bd._meta : {};
    var regimes = (bd && bd.regimes) ? bd.regimes : [];
    var bonusList = (bd && bd.bonuses) ? bd.bonuses : [];
    var cost = (TD.data && TD.data.cost) ? TD.data.cost : {};

    var tdrCap = numOr(meta.tdrCapOfBase, 0);
    var outsideHint = isNum(meta.outsideCapOfBase) ? meta.outsideCapOfBase : null;

    function findBonus(id) {
      var i;
      if (bd && typeof bd.bonusById === 'function') return bd.bonusById(id);
      for (i = 0; i < bonusList.length; i++) if (bonusList[i].id === id) return bonusList[i];
      return null;
    }

    /* ---- 沒有目錄就老實回報，不要硬掰一個組合出來 ---- */
    if (!regimes.length) {
      notes.push('TD.data.bonus.regimes 為空，無法列舉任何容積獎勵組合。請檢查 js/data/bonus.js 是否載入。');
      return {
        options: [], best: null, chosen: null,
        pct: TD.V('m4.pct', null, 'unv', '容積獎勵目錄（未載入）', '', '獎勵目錄不存在，成數待查。'),
        bonusFloorM2: TD.V('m4.bonusFloorM2', null, 'unv', '容積獎勵目錄（未載入）', '', '獎勵目錄不存在，無法計算。'),
        totalFloorM2: TD.V('m4.totalFloorM2', null, 'unv', '容積獎勵目錄（未載入）', '', '獎勵目錄不存在，無法計算。'),
        notes: notes
      };
    }

    /* ---- 基準容積（M4 的分母，全部成數都是「占基準容積」）---- */

    var base = 0;
    if (ctx.m3 && isNum(TD.raw(ctx.m3.baseFloorM2)) && TD.raw(ctx.m3.baseFloorM2) > 0) {
      base = TD.raw(ctx.m3.baseFloorM2);
    } else {
      notes.push('取不到 M3 的基準容積樓地板面積（為 0 或待查），獎勵樓地板、取得成本與淨效益一律以 0 計算；'
               + '組合清單仍會列出讓你看得到選項，但排序沒有意義。請先補齊基地面積與分區容積率。');
    }

    /* ---- 基地面積與屋齡：用來過濾前提 ---- */

    var siteM2 = 0;
    if (ctx.m3 && isNum(ctx.m3.areaM2Used) && ctx.m3.areaM2Used > 0) siteM2 = ctx.m3.areaM2Used;
    else if (ctx.m1 && isNum(TD.raw(ctx.m1.areaM2)) && TD.raw(ctx.m1.areaM2) > 0) siteM2 = TD.raw(ctx.m1.areaM2);
    else siteM2 = sumParcelArea(parcel.numbers);

    var ageYears = numOr(parcel.buildingAgeYears, 0);
    var existingFloorM2 = numOr(parcel.existingFloorM2, 0);

    /* ---- 預估單價：有 M6 就用 M6，第一次呼叫用保守預設 ---- */

    var price = 0, priceFrom = '';
    if (ctx.m6 && isNum(TD.raw(ctx.m6.unitPricePing)) && TD.raw(ctx.m6.unitPricePing) > 0) {
      price = TD.raw(ctx.m6.unitPricePing);
      priceFrom = 'M6 收入模型';
      notes.push('預估單價採 M6 收入模型：' + TD.fmt.unitPrice(price) + '（本次為 pipeline 的第二次呼叫，已覆蓋第一次的保守預設）。');
    } else {
      price = numOr(cost.fallbackUnitPricePing, numOr(cost.defaultUnitPricePing, 0));
      priceFrom = 'TD.data.cost.fallbackUnitPricePing（保守預設）';
      notes.push('ctx.m6 尚不存在（本模組第一次被呼叫），預估單價暫採 TD.data.cost 的保守預設 '
               + TD.fmt.unitPrice(price) + '；pipeline 會在 M6 算出單價後再呼叫一次覆蓋本結果。'
               + '這一輪的排序只供粗估，不要據此對外報告。');
      if (price <= 0) notes.push('TD.data.cost 的保守預設單價為 0 或缺漏，所有組合的收益一律 0，排序無意義。');
    }

    /* ---- 可售率：把「增加的容積」換成「增加的可售坪」---- */

    var sellRatio = TD.math.clamp(numOr((p.m5 || {}).sellRatio, 0.95), 0.05, 1);
    /* 免計容積係數要與 m5 一致，否則「增加可售坪」會系統性低估約 exemptRatio。
       m5 的可售坪 = 容積樓地板 ×（1 + 免計比例）× 可售率，
       m4 少乘一項的話 netGain 低估約 3 成 —— 而時程成本沒有同步縮小，
       偏誤在各制度間不等量（UR baseMonths 36 對 HR 18），跨制度排序會被壓低。 */
    var exemptRatio = TD.math.clamp(numOr((p.m5 || {}).exemptRatio, 0.30), 0, 0.8);
    notes.push('增加可售坪 = 增加容積樓地板 ÷ ' + n(TD.PING, 4) + ' ×（1 + 免計容積比例 '
             + pctStr(exemptRatio) + '）× 可售率 ' + pctStr(sellRatio)
             + '（兩個比率都取自 p.m5，與 M5 的可售坪同一套算法，兩邊不會打架）。'
             + '正式評估仍以 M5 的量體試算為準：免計容積是逐項計算的結果，這裡用單一比例概括。');
    notes.push('取得成本的計價基礎是「不含免計容積的增加可售坪」'
             + '（增加容積樓地板 ÷ ' + n(TD.PING, 4) + ' × 可售率 ' + pctStr(sellRatio)
             + '，欄位 gainPingForCost），與 TD.data.bonus 的 costPerGainedPing／costRateOfPrice '
             + '所標的單位一致，刻意不隨免計容積放大 —— 容積移轉的購入代價是按移入的容積計，'
             + '不是按陽台雨遮算的。因此 netGain 的收入面與成本面用的是兩個不同的坪數，'
             + '兩者都列在 options 裡供複核。');

    /* ---- 營建單價與建融利率：用來估時程成本 ---- */

    var m7in = p.m7 || {};
    var cRows = (cost.construction && cost.construction.rows) ? cost.construction.rows : [];
    var perPing = null, ci, keyUsed = '';
    if (isNum(m7in.constructionPerPingOverride) && m7in.constructionPerPingOverride > 0) {
      perPing = m7in.constructionPerPingOverride;
      keyUsed = '使用者覆寫營建單價';
    } else {
      keyUsed = m7in.constructionKey ? String(m7in.constructionKey) : 'rc25';
      for (ci = 0; ci < cRows.length; ci++) if (cRows[ci].id === keyUsed && isNum(cRows[ci].perPing)) perPing = cRows[ci].perPing;
      if (!isNum(perPing) && cRows.length && isNum(cRows[0].perPing)) {
        perPing = cRows[0].perPing;
        keyUsed = cRows[0].id + '（查無 ' + (m7in.constructionKey || 'rc25') + '，退回第一列）';
      }
    }
    if (!isNum(perPing)) perPing = 0;

    var finance = cost.finance || {};
    var rate = isNum(m7in.constRate) ? m7in.constRate : numOr(finance.constRate, 0);

    notes.push('時程成本 = 前置月數 × 估計總成本 × 建融年利率 ' + pctStr(rate) + ' ÷ 12。'
             + '前置月數 = 制度 baseMonths ＋ 各獎勵項目 monthsAdd；估計總成本以「總樓地板 × 營建單價 '
             + money(perPing) + '／坪（' + keyUsed + '）＋ 本組合取得成本」粗估，'
             + '因為 pipeline 在本模組之後才跑 M7，此時還沒有真正的成本模型。'
             + '這是資金被卡住的機會成本近似值，不是現金流量表；正式數字見 M7／M8。');

    /* ---- 各項成數：pctOverrides 優先，TDR 另接受 p.m4.tdrPct ---- */

    var usedOverrides = [];

    function itemPct(b) {
      if (hasOwn(pctOv, b.id) && isNum(pctOv[b.id])) {
        if (usedOverrides.indexOf(b.id) < 0) usedOverrides.push(b.id);
        return { v: pctOv[b.id], from: 'p.m4.pctOverrides.' + b.id };
      }
      /* SPEC 的 project 結構另有 m4.tdrPct，視為容積移轉成數的專用覆寫欄位 */
      if (b.id === 'TDR' && isNum(cfg.tdrPct) && cfg.tdrPct > 0) {
        if (usedOverrides.indexOf('TDR') < 0) usedOverrides.push('TDR');
        return { v: cfg.tdrPct, from: 'p.m4.tdrPct' };
      }
      return { v: numOr(b.pctTypical, 0), from: '種子資料 pctTypical' };
    }

    /* ---- 取得成本 ----
       金額一律 costPerGainedPing × 增加可售坪 ＋ costRateOfPrice × 單價 × 增加可售坪
       （資料契約 _meta.costBasis 就是這條式子；種子資料每個項目只會用到其中一項，
       但兩項都算，才不會有人改了資料卻被靜靜漏掉）。
       算式**說明文字**只跟項目與單價有關、與組合無關，所以在列舉前先算好一份快取：
       在 2^n 的迴圈裡做字串格式化會讓每次重算多花上百毫秒。*/

    var unknownCostTypes = [];
    var basisCache = {};

    function costBasisOf(b) {
      var t, per, ofPrice, s;
      if (hasOwn(basisCache, b.id)) return basisCache[b.id];
      t = b.costType || 'none';
      per = numOr(b.costPerGainedPing, 0);
      ofPrice = numOr(b.costRateOfPrice, 0);
      if (t === 'none') {
        s = 'none｜無直接可貨幣化的取得成本（代價寫在 tradeoff 欄，那一欄才是重點）';
      } else if (t === 'purchase') {
        s = 'purchase｜向市場購買容積（或繳代金）：售價 ' + money(price) + '／坪 × ' + pctStr(ofPrice)
          + ' × 增加可售坪數' + (per > 0 ? '，另加 ' + money(per) + '／增加坪' : '')
          + '。此比率為市場行情估值，非法規數字，簽約前必須實際詢價。';
      } else if (t === 'donation') {
        s = 'donation｜捐地／公益設施興建與點交成本：' + money(per) + '／增加坪'
          + (ofPrice > 0 ? '，另加售價 × ' + pctStr(ofPrice) : '') + '。設施種類與規模由主管機關指定。';
      } else if (t === 'design') {
        s = 'design｜設計與認證增量成本：' + money(per) + '／增加坪'
          + (ofPrice > 0 ? '，另加售價 × ' + pctStr(ofPrice) : '') + '。含標章申請與第三方評定費用。';
      } else {
        if (unknownCostTypes.indexOf(b.id) < 0) unknownCostTypes.push(b.id);
        s = '未知 costType「' + t + '」，取得成本以 0 計，須人工補算';
      }
      basisCache[b.id] = s;
      return s;
    }

    function itemCostAmount(b, gainPing) {
      var t = b.costType || 'none';
      if (t === 'none') return 0;
      if (t !== 'purchase' && t !== 'donation' && t !== 'design') return 0;   /* 未知型別不猜金額 */
      return numOr(b.costPerGainedPing, 0) * gainPing + numOr(b.costRateOfPrice, 0) * price * gainPing;
    }

    /* ---- 估計總成本（時程成本的本金） ---- */

    function estTotalCost(totalFloorM2, acq) {
      var c;
      if (ctx.m7 && isNum(TD.raw(ctx.m7.totalCostExLand)) && TD.raw(ctx.m7.totalCostExLand) > 0) {
        return TD.raw(ctx.m7.totalCostExLand) + acq;
      }
      c = (totalFloorM2 / TD.PING) * perPing;
      return (isNum(c) ? c : 0) + acq;
    }

    /* ---- 過濾某制度可用的獎勵項目 ---- */

    function eligibleItems(regime) {
      var out = [], dropped = [], allows = regime.allows || [], i, b, req, why;
      for (i = 0; i < allows.length; i++) {
        b = findBonus(allows[i]);
        if (!b) { dropped.push({ id: allows[i], reason: '獎勵目錄查無此 id' }); continue; }
        req = b.requires || {};
        why = null;
        if (req.regimes && req.regimes.length && req.regimes.indexOf(regime.id) < 0) {
          why = '本項僅適用於 ' + req.regimes.join('／') + ' 制度';
        } else if (isNum(req.minSiteM2) && req.minSiteM2 > 0 && siteM2 < req.minSiteM2) {
          why = '基地面積 ' + n(siteM2, 2) + ' ㎡ 未達本項門檻 ' + n(req.minSiteM2, 0) + ' ㎡（種子值，待查證）';
        } else if (isNum(req.minAgeYears) && req.minAgeYears > 0 && ageYears < req.minAgeYears) {
          why = '屋齡 ' + n(ageYears, 0) + ' 年未達本項門檻 ' + n(req.minAgeYears, 0) + ' 年（種子值，待查證）';
        }
        if (why) dropped.push({ id: b.id, name: b.name, reason: why });
        else out.push(b);
      }
      return { items: out, dropped: dropped };
    }

    /* ---- 制度前提（不影響列舉，只影響 feasible 與排序） ---- */

    function regimePrereq(regime) {
      var pre = regime.prereq || {}, out = { feasible: true, notes: [] };
      if (isNum(pre.minSiteM2) && pre.minSiteM2 > 0 && siteM2 < pre.minSiteM2) {
        out.feasible = false;
        out.notes.push('基地面積 ' + n(siteM2, 2) + ' ㎡ 未達門檻 ' + n(pre.minSiteM2, 0) + ' ㎡（種子值，待查證）');
      }
      if (isNum(pre.minAgeYears) && pre.minAgeYears > 0 && ageYears < pre.minAgeYears) {
        out.feasible = false;
        out.notes.push('既有建物屋齡 ' + n(ageYears, 0) + ' 年未達門檻 ' + n(pre.minAgeYears, 0) + ' 年（種子值，待查證）');
      }
      if (regime.id !== 'NONE' && existingFloorM2 <= 0) {
        out.notes.push('謄本未載既有合法建築物樓地板面積（existingFloorM2 為 0）：'
                     + '素地或未辦建物登記者，屋齡與原建築容積的認定須人工查證。');
      }
      if (pre.consentNote) out.notes.push('同意比例（本系統無法判定，須人工確認）：' + pre.consentNote);
      if (regime.altCapNote) out.notes.push('上限另有擇高規定：' + regime.altCapNote);
      return out;
    }

    /* ---- 建立一個組合 ---- */

    function buildOption(regime, sel, feasible, prereqNotes) {
      var i, b, pi, bk, raws = [], sums = { regime: 0, tdr: 0, outside: 0 }, scale, itemsOut = [],
          regimeCap, regimeEff, tdrEff, outsideEff, pctRaw, pctFinal, capped, capParts, capNote,
          bonusFloor, totalFloor, gainPing, gainPingForCost, costTotal = 0, itemMonths = 0,
          wsum = 0, wacc = 0,
          effPct, itemGain, itemGainForCost, c, est, timeCost, revenue, netGain, itemRisk, outsideNote;

      for (i = 0; i < sel.length; i++) {
        b = sel[i];
        pi = itemPct(b);
        bk = bucketOf(b);
        raws.push({ b: b, pct: numOr(pi.v, 0), from: pi.from, bucket: bk });
        sums[bk] += numOr(pi.v, 0);
      }

      regimeCap = numOr(regime.capOfBase, 0);
      regimeEff = Math.min(sums.regime, regimeCap);
      tdrEff = Math.min(sums.tdr, tdrCap);
      outsideEff = sums.outside;                 /* 依 SPEC 不封頂 */

      capped = (regimeEff < sums.regime - EPS) || (tdrEff < sums.tdr - EPS);

      /* 先封頂、再修掉浮點雜訊，後面的樓地板與坪數都從修過的成數算，畫面與算式才對得起來。
         上限值本身小數位很少（0.5／0.3），四捨五入到 6 位不會讓封頂後的成數超過上限。*/
      regimeEff = TD.math.round(regimeEff, PCT_DP);
      tdrEff = TD.math.round(tdrEff, PCT_DP);
      outsideEff = TD.math.round(outsideEff, PCT_DP);

      pctRaw = TD.math.round(sums.regime + sums.tdr + sums.outside, PCT_DP);
      pctFinal = TD.math.round(regimeEff + tdrEff + outsideEff, PCT_DP);
      capParts = [];
      if (regimeEff < sums.regime - EPS) {
        capParts.push('制度型獎勵合計 ' + pctFast(sums.regime) + ' 超過「' + regime.name + '」上限 '
                    + pctFast(regimeCap) + '，已封頂，砍掉 ' + pctFast(sums.regime - regimeEff) + '（占基準容積）');
      }
      if (tdrEff < sums.tdr - EPS) {
        capParts.push('容積移轉 ' + pctFast(sums.tdr) + ' 超過移入上限 ' + pctFast(tdrCap)
                    + '，已封頂，砍掉 ' + pctFast(sums.tdr - tdrEff));
      }
      capNote = capParts.length
        ? capParts.join('；') + '。上限值為種子資料（verified:false），實際上限須依個案都市計畫書與當年度獎勵辦法查證；'
          + '被砍掉的部分不計收益、也不計取得成本。'
        : '';

      outsideNote = '';
      if (outsideEff > 0 && outsideHint !== null && outsideEff > outsideHint + EPS) {
        outsideNote = '本組合 bucket 為 outside 的項目合計 ' + pctFast(outsideEff)
                    + '，超過種子資料暫設上限 ' + pctFast(outsideHint)
                    + '。依 SPEC，outside 不併入制度上限封頂，本系統未對其封頂，'
                    + '但真正上限訂在建築技術規則與各該都市計畫書，必須逐案查證後改寫資料檔。';
      }

      bonusFloor = base * pctFinal;
      totalFloor = base * (1 + pctFinal);
      /* 兩個坪數，用途不同，都要輸出：
         gainPingForCost 是成本計價基礎（不含免計容積，與 bonus 資料的單位一致）；
         gainPing 是收入基礎的「增加可售坪」，含免計容積，與 m5.sellablePing 同一套算法。 */
      gainPingForCost = (bonusFloor / TD.PING) * sellRatio;
      gainPing = gainPingForCost * (1 + exemptRatio);

      /* 同一 bucket 內按比例分攤封頂後的成數 */
      scale = {
        regime: sums.regime > EPS ? regimeEff / sums.regime : 0,
        tdr: sums.tdr > EPS ? tdrEff / sums.tdr : 0,
        outside: 1
      };

      for (i = 0; i < raws.length; i++) {
        b = raws[i].b;
        effPct = raws[i].pct * scale[raws[i].bucket];
        itemGainForCost = (base * effPct / TD.PING) * sellRatio;
        itemGain = itemGainForCost * (1 + exemptRatio);
        c = { amount: itemCostAmount(b, itemGainForCost), basis: costBasisOf(b) };
        costTotal += c.amount;
        itemMonths += numOr(b.monthsAdd, 0);
        wsum += effPct;
        wacc += effPct * (RISK_W[b.risk] || 2);
        itemsOut.push({
          id: b.id,
          name: b.name,
          pct: TD.math.round(effPct, PCT_DP),
          costTotal: c.amount,
          monthsAdd: numOr(b.monthsAdd, 0),
          risk: b.risk || 'mid',
          law: lawStr(b.lawName, b.article),
          tradeoff: b.tradeoff || '',
          /* 加項欄位（SPEC 未列，供 UI 與複核抽屜用） */
          pctRaw: TD.math.round(raws[i].pct, PCT_DP),
          pctFrom: raws[i].from,
          bucket: raws[i].bucket,
          costType: b.costType || 'none',
          costBasis: c.basis,
          gainPing: itemGain,
          gainPingForCost: itemGainForCost,
          lawName: b.lawName || '',
          article: b.article || '待查',
          note: b.note || ''
        });
      }

      est = estTotalCost(totalFloor, costTotal);
      var months = numOr(regime.baseMonths, 0) + itemMonths;
      timeCost = months * est * rate / 12;
      revenue = gainPing * price;
      netGain = revenue - costTotal - timeCost;
      if (!isNum(netGain)) netGain = 0;

      itemRisk = wsum > EPS ? wacc / wsum : 0;

      return {
        id: regime.id + ':' + (itemsOut.length ? itemsOut.map(function (x) { return x.id; }).join('+') : 'BASE'),
        regimeId: regime.id,
        regimeName: regime.name,
        itemIds: itemsOut.map(function (x) { return x.id; }),
        items: itemsOut,
        pctRaw: pctRaw,
        pct: pctFinal,
        capped: capped,
        capNote: capNote,
        tdrPct: tdrEff,
        bonusFloorM2: bonusFloor,
        totalFloorM2: totalFloor,
        costTotal: costTotal,
        monthsAdd: months,
        riskScore: TD.math.round((RISK_W[regime.baseRisk] || 2) + itemRisk, 2),
        gainPing: gainPing,
        gainPingForCost: gainPingForCost,
        netGain: netGain,

        /* ---- 加項欄位 ---- */
        feasible: !!feasible,
        prereqNotes: prereqNotes || [],
        regimePct: regimeEff,
        outsidePct: outsideEff,
        outsideNote: outsideNote,
        baseMonths: numOr(regime.baseMonths, 0),
        itemMonthsAdd: itemMonths,
        revenue: revenue,
        timeCost: timeCost,
        estTotalCost: est,
        riskLabel: '制度 ' + riskLabelOf(RISK_W[regime.baseRisk] || 2) + '／獎勵 ' + riskLabelOf(itemRisk),
        regimeLaw: lawStr(regime.lawName, regime.article)
      };
    }

    /* ---- 逐制度列舉 ---- */

    var options = [], r, regime, elig, items, pre, k, total, mask, bit, sel, rOpts, i, j;
    var truncated = [], hasOutside = false;

    for (r = 0; r < regimes.length; r++) {
      regime = regimes[r];
      elig = eligibleItems(regime);
      items = elig.items;
      pre = regimePrereq(regime);

      if (elig.dropped.length) {
        for (j = 0; j < elig.dropped.length; j++) {
          notes.push('「' + regime.name + '」不列入 ' + elig.dropped[j].id
                   + (elig.dropped[j].name ? '（' + elig.dropped[j].name + '）' : '')
                   + '：' + elig.dropped[j].reason + '。');
        }
      }
      if (!pre.feasible) {
        notes.push('「' + regime.name + '」不符前提：' + pre.notes.join('；')
                 + '。其組合仍列出供比較，但標為不可行、排在可行組合之後，也不會被選為最佳方案。'
                 + '若門檻查證後與種子值不同，請改寫 js/data/bonus.js。');
      }

      /* 項目數上限保護：超過 ITEM_CAP 時，先算各項單獨的 netGain，只留前段 */
      if (items.length > ITEM_CAP) {
        var scored = [];
        for (i = 0; i < items.length; i++) {
          scored.push({ b: items[i], g: buildOption(regime, [items[i]], pre.feasible, pre.notes).netGain });
        }
        scored.sort(function (a, b2) { return b2.g - a.g; });
        var kept = [], droppedIds = [];
        for (i = 0; i < scored.length; i++) {
          if (i < ITEM_CAP) kept.push(scored[i].b); else droppedIds.push(scored[i].b.id);
        }
        items = kept;
        truncated.push('「' + regime.name + '」可用獎勵項目 ' + (kept.length + droppedIds.length)
                     + ' 項超過列舉上限 ' + ITEM_CAP + ' 項，已依各項單獨 netGain 只保留前 ' + ITEM_CAP
                     + ' 項，未納入列舉者：' + droppedIds.join('、')
                     + '。這是效能截斷，不是法規判斷，被截掉的項目可能在特定組合下更有利，請人工複核。');
      }

      k = items.length;
      total = 1 << k;
      rOpts = [];
      for (mask = 0; mask < total; mask++) {
        sel = [];
        for (bit = 0; bit < k; bit++) if (mask & (1 << bit)) sel.push(items[bit]);
        rOpts.push(buildOption(regime, sel, pre.feasible, pre.notes));
      }
      rOpts.sort(function (a, b2) { return b2.netGain - a.netGain; });

      /* 組合數上限保護：只留 netGain 前段，但使用者當前選的那一組一定留著 */
      if (rOpts.length > OPTION_KEEP) {
        var head = rOpts.slice(0, OPTION_KEEP), mine = null;
        if (wantRegime === regime.id) {
          for (i = 0; i < rOpts.length; i++) if (sameSet(rOpts[i].itemIds, picked)) { mine = rOpts[i]; break; }
        }
        if (mine && head.indexOf(mine) < 0) head.push(mine);
        truncated.push('「' + regime.name + '」共 ' + rOpts.length + ' 種組合，超過保留上限 ' + OPTION_KEEP
                     + '，只保留 netGain 前段（使用者目前選定的組合一定保留）。這是效能截斷，不是法規判斷。');
        rOpts = head;
      }

      for (i = 0; i < rOpts.length; i++) {
        if (rOpts[i].outsidePct > 0) hasOutside = true;
        options.push(rOpts[i]);
      }
    }

    /* ---- 排序：可行者優先，再依 netGain 由大到小；同分時風險低、時程短者優先 ---- */

    options.sort(function (a, b2) {
      if (a.feasible !== b2.feasible) return a.feasible ? -1 : 1;
      if (b2.netGain !== a.netGain) return b2.netGain - a.netGain;
      if (a.riskScore !== b2.riskScore) return a.riskScore - b2.riskScore;
      return a.monthsAdd - b2.monthsAdd;
    });

    if (truncated.length) for (i = 0; i < truncated.length; i++) notes.push(truncated[i]);
    if (unknownCostTypes.length) {
      notes.push('以下獎勵項目的 costType 不在 none／design／purchase／donation 之內，取得成本以 0 計，'
               + '會高估淨效益，請補算：' + unknownCostTypes.join('、') + '。');
    }
    if (usedOverrides.length) {
      notes.push('以下項目的成數採使用者覆寫值（p.m4.pctOverrides 或 p.m4.tdrPct），未使用種子資料：'
               + usedOverrides.join('、') + '。');
    }
    if (hasOutside) {
      notes.push('bucket 為 outside 的項目（開放空間／綜合設計、大眾運輸導向）依 SPEC 不併入制度上限封頂，'
               + '本模組也未對其封頂；但種子資料 _meta.outsideCapOfBase 記載暫設合計上限 '
               + (outsideHint === null ? '（未設）' : pctStr(outsideHint))
               + '，真正上限訂在建築技術規則與各該都市計畫書，必須逐案查證。');
    }

    /* ---- best 與 chosen ---- */

    var best = null;
    for (i = 0; i < options.length; i++) if (options[i].feasible) { best = options[i]; break; }
    if (!best && options.length) best = options[0];

    var chosen = null, regimeExists = false;
    for (i = 0; i < regimes.length; i++) if (regimes[i].id === wantRegime) regimeExists = true;

    if (wantRegime) {
      for (i = 0; i < options.length; i++) {
        if (options[i].regimeId === wantRegime && sameSet(options[i].itemIds, picked)) { chosen = options[i]; break; }
      }
    }

    if (!chosen) {
      if (!wantRegime) {
        notes.push('p.m4.regime 未設定，已改用淨效益最佳組合（' + (best ? best.id : '無') + '）作為 chosen。');
      } else if (!regimeExists) {
        notes.push('p.m4.regime 為「' + wantRegime + '」，但獎勵目錄查無此制度，已改用淨效益最佳組合（'
                 + (best ? best.id : '無') + '）作為 chosen。');
      } else {
        /* 找得出是哪幾個勾選項目被前提擋掉，就說清楚，不要只說「找不到」 */
        var eligIds = [], badPicks = [], regObj = null;
        for (i = 0; i < regimes.length; i++) if (regimes[i].id === wantRegime) regObj = regimes[i];
        if (regObj) {
          elig = eligibleItems(regObj);
          for (i = 0; i < elig.items.length; i++) eligIds.push(elig.items[i].id);
          for (i = 0; i < picked.length; i++) if (eligIds.indexOf(picked[i]) < 0) badPicks.push(picked[i]);
        }
        notes.push('使用者勾選的組合（' + wantRegime + '：' + (picked.length ? picked.join('+') : '無獎勵')
                 + '）不在可列舉的組合內'
                 + (badPicks.length ? '，被前提擋掉的項目：' + badPicks.join('、') : '')
                 + '，已改用淨效益最佳組合（' + (best ? best.id : '無') + '）作為 chosen。'
                 + '畫面上的成數不是你勾的那一組，請確認。');
      }
      chosen = best;
    }

    if (chosen && !chosen.feasible) {
      notes.push('目前選定的組合不符制度前提（' + chosen.regimeName + '：' + chosen.prereqNotes.join('；')
               + '）。下游的量體、收入與出價上限都是在「這個制度真的能用」的假設下算出來的，'
               + '前提沒解決之前，那些數字只是假設值。門檻本身是種子資料，也可能是門檻寫錯，兩邊都要查。');
    }
    /* 差額小於一元就不提：基準容積為 0 時每個組合的淨效益都是 0，提了只是雜訊 */
    if (chosen && best && chosen !== best && best.netGain - chosen.netGain > 1) {
      notes.push('目前選定組合（' + chosen.id + '，淨效益 ' + money(chosen.netGain) + '）'
               + '不是淨效益最佳組合（' + best.id + '，' + money(best.netGain) + '），差額 '
               + money(best.netGain - chosen.netGain) + '。差額是「以本系統的種子成數與保守單價估算」的結果，'
               + '不是應該照做的建議：審議風險、時程風險與 tradeoff 欄寫的代價都沒有反映在這個數字裡。');
    }

    /* ---- 對外 V 值：一律取 chosen（下游 M5 量體要用使用者選定的組合，不是最佳組合） ---- */

    var chosenPct = chosen ? chosen.pct : null;
    var chosenBonus = chosen ? chosen.bonusFloorM2 : null;
    var chosenTotal = chosen ? chosen.totalFloorM2 : null;

    var srcStr = chosen
      ? chosen.regimeLaw + '；獎勵細目見各項法源（' + (chosen.itemIds.length ? chosen.itemIds.join('、') : '未申請獎勵') + '）'
      : '容積獎勵目錄';

    var pctNote = '種子資料（verified:false），最終成數由主管機關審議決定，不是算出來的。'
                + (chosen && chosen.capped ? '本組合已封頂：' + chosen.capNote : '')
                + (chosen && chosen.outsideNote ? chosen.outsideNote : '')
                + (chosen && !chosen.feasible ? '本組合不符制度前提：' + chosen.prereqNotes.join('；') + '。' : '');

    var pctFormula = chosen
      ? '獎勵合計 = 制度型 ' + pctStr(chosen.regimePct) + '（上限 '
        + pctStr(numOr((function () {
            var g, rg = null;
            for (g = 0; g < regimes.length; g++) if (regimes[g].id === chosen.regimeId) rg = regimes[g];
            return rg ? numOr(rg.capOfBase, 0) : 0;
          })(), 0))
        + '）＋ 容積移轉 ' + pctStr(chosen.tdrPct) + '（上限 ' + pctStr(tdrCap) + '）'
        + '＋ 不併入上限項目 ' + pctStr(chosen.outsidePct)
        + '；未封頂前合計 ' + pctStr(chosen.pctRaw)
      : '';

    return {
      options: options,
      best: best,
      chosen: chosen,
      pct: TD.V('m4.pct', chosenPct, 'unv', srcStr, pctFormula, pctNote),
      bonusFloorM2: TD.V('m4.bonusFloorM2', chosenBonus, 'unv', srcStr,
                         '獎勵樓地板 = 基準容積 ' + n(base, 2) + ' ㎡ × 獎勵合計 '
                         + (isNum(chosenPct) ? pctStr(chosenPct) : '—'),
                         '約 ' + (isNum(chosenBonus) ? n(chosenBonus / TD.PING, 1) + ' 坪' : '—')
                       + '；其中可售部分以可售率 ' + pctStr(sellRatio) + ' 估為 '
                       + (chosen ? n(chosen.gainPing, 1) + ' 坪' : '—') + '。' + pctNote),
      totalFloorM2: TD.V('m4.totalFloorM2', chosenTotal, 'unv', srcStr,
                         '容積樓地板合計 = 基準容積 ' + n(base, 2) + ' ㎡ × (1 ＋ '
                         + (isNum(chosenPct) ? pctStr(chosenPct) : '—') + ')',
                         '僅為「容積樓地板」，不含免計容積項目（陽台、雨遮、機電、停車空間等），'
                       + '總樓地板與可售坪見 M5。' + pctNote),
      notes: notes,

      /* ---- 加項欄位 ---- */
      unitPricePingUsed: price,
      unitPriceFrom: priceFrom,
      sellRatioUsed: sellRatio,
      baseFloorM2Used: base,
      tdrCapOfBase: tdrCap,
      optionCount: options.length,
      chosenIsBest: !!(chosen && best && chosen === best),
      topOptions: options.slice(0, 3)
    };
  }

  TD.engine.m4 = m4;
})(window.TD);
