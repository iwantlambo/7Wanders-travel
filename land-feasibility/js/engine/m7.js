/* m7 成本模型：由量體與總銷推算土地以外的開發成本，並產出逐月營建支出曲線供 m8 回推土地價。 */
window.TD = window.TD || {};
(function (TD) {
  'use strict';

  TD.engine = TD.engine || {};

  var PING = TD.PING || 3.3057851239669;
  var SRC_SEED = '種子資料 TD.data.cost（verified:false）';

  /* ------------------------------------------------------------------
     小工具：一律容錯。m7 排在 m5、m6 之後，但契約要求任一模組壞掉時
     pipeline 仍要跑完，所以這裡對 ctx 的每個欄位都假設「可能不存在」。
     ------------------------------------------------------------------ */

  function raw(x) { return TD.raw ? TD.raw(x) : x; }

  function num(x, dflt) {
    var v = raw(x);
    if (v === null || v === undefined || v === '') return dflt;
    v = Number(v);
    return isFinite(v) ? v : dflt;
  }

  // p.m7 的欄位為 null 代表「沿用 TD.data.cost 預設」，不是 0（SPEC 第 6 節）
  function pref(src, key, dflt) {
    if (!src) return dflt;
    var v = src[key];
    if (v === null || v === undefined || v === '') return dflt;
    v = Number(v);
    return isFinite(v) ? v : dflt;
  }

  function clampInt(v, lo, hi) {
    v = Math.round(num(v, lo));
    if (!isFinite(v)) v = lo;
    return Math.max(lo, Math.min(hi, v));
  }

  function fn(v, d) { return TD.fmt ? TD.fmt.n(v, d) : String(v); }
  function fpct(v, d) { return TD.fmt ? TD.fmt.pct(v, d === undefined ? 2 : d) : String(v * 100) + '%'; }
  function toPing(m2) { return m2 / PING; }

  function findById(list, id) {
    var i;
    if (!list || !list.length) return null;
    for (i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
    return null;
  }

  /* ------------------------------------------------------------------
     時程：TD.data.cost.schedule 的註記明寫「都更與危老的審議期不含在此，
     應由 m4 的 regime.baseMonths 與 monthsAdd 另行加計」。
     這裡直接讀 TD.data.bonus（而不是 m4 輸出的 monthsAdd，因為契約沒說
     那個欄位是否已含 regime.baseMonths，避免重複計算），自行加總：
       planMonthsEff = max(規劃請照期, 制度基本作業月) + 各獎勵項目加計月
     presaleStartMonth 隨請照期後移以維持相對關係，再夾到請照完成月之後
     （預售屋須先領得建造執照，建照未到手不得收訂簽開）。
     ------------------------------------------------------------------ */
  function resolveRegime(p, ctx) {
    var bonus = (TD.data && TD.data.bonus) || {};
    var chosen = (ctx.m4 && ctx.m4.chosen) || null;
    var regimeId = (chosen && chosen.regimeId) || (p.m4 && p.m4.regime) || 'NONE';
    var itemIds = (chosen && chosen.itemIds) || (p.m4 && p.m4.picked) || [];
    var regime = findById(bonus.regimes, regimeId);
    var add = 0, i, b;
    for (i = 0; i < itemIds.length; i++) {
      b = findById(bonus.bonuses, itemIds[i]);
      if (b) add += num(b.monthsAdd, 0);
    }
    return {
      regimeId: regimeId,
      regimeName: (regime && regime.name) || regimeId,
      baseMonths: num(regime && regime.baseMonths, 0),
      bonusMonthsAdd: add,
      itemIds: itemIds
    };
  }

  /* ------------------------------------------------------------------
     總銷：優先用 m6 的結果；m6 不存在或為 0 時以保守單價粗估，
     並在 notes 說明這是回落值（不要拿去對外報告）。
     ------------------------------------------------------------------ */
  function resolveSales(p, ctx, cost, notes) {
    var m6 = ctx.m6 || {};
    var m5 = ctx.m5 || {};
    var total = num(m6.totalSales, null);
    var sellablePing = num(m5.sellablePing, 0);
    var stalls = num(m5.stalls, 0);
    var unitPrice = num(m6.unitPricePing, null);
    if (total !== null && total > 0) {
      return { totalSales: total, estimated: false, source: 'ctx.m6.totalSales',
               unitPricePing: unitPrice, sellablePing: sellablePing, stalls: stalls };
    }
    var fallbackPrice = num(cost.fallbackUnitPricePing, num(cost.defaultUnitPricePing, 0));
    var est = sellablePing * fallbackPrice + stalls * num(cost.parkingPricePerStall, 0);
    if (est > 0) {
      notes.push('ctx.m6 尚未產出總銷，軟成本與稅費改以保守單價 ' + fn(fallbackPrice, 0)
        + ' 元/坪 × 可售 ' + fn(sellablePing, 1) + ' 坪 ＋ 車位 ' + fn(stalls, 0)
        + ' 個粗估總銷 ' + fn(est, 0) + ' 元。此為回落值，不可用於對外報告。');
    } else {
      notes.push('ctx.m6 與 ctx.m5 都沒有可用的總銷或可售坪，以總銷 0 計算，'
        + '軟成本與稅費因此為 0，整份成本表不可採信。');
    }
    return { totalSales: est, estimated: true, source: '回落：可售坪 × TD.data.cost.fallbackUnitPricePing',
             unitPricePing: fallbackPrice, sellablePing: sellablePing, stalls: stalls };
  }

  /* ================================================================== */
  function m7(p, ctx) {
    p = p || {};
    ctx = ctx || {};
    var notes = [];
    var cost = (TD.data && TD.data.cost) || {};
    var con = cost.construction || {};
    var finD = cost.finance || {};
    var softD = cost.soft || {};
    var schD = cost.schedule || {};
    var m7p = p.m7 || {};
    var m5 = ctx.m5 || {};
    var items = [];
    var i;

    /* ---- 1. 單價 ---- */
    var rows = con.rows || [];
    var key = m7p.constructionKey || 'rc25';
    var row = findById(rows, key);
    if (!row) {
      row = rows.length ? rows[0] : { id: 'none', label: '（無營建單價種子資料）', perPing: 0, low: 0, high: 0 };
      notes.push('找不到營建單價代碼「' + key + '」，已回落到「' + row.label + '」，請到設定頁重新選擇。');
    }
    var hasOverride = (m7p.constructionPerPingOverride !== null && m7p.constructionPerPingOverride !== undefined
                       && isFinite(Number(m7p.constructionPerPingOverride)));
    var perPing = hasOverride ? Number(m7p.constructionPerPingOverride) : num(row.perPing, 0);
    var perPingLow = num(row.low, perPing);
    var perPingHigh = num(row.high, perPing);
    var basementPerPing = num(con.basementPerPing, 0);
    var demoPerPing = num(con.demolitionPerPing, 0);
    var conSrc = con.source ? ('TD.data.cost.construction／' + con.source) : SRC_SEED;

    /* ---- 2. 比率與時程 ---- */
    var landLTV = pref(m7p, 'landLTV', num(finD.landLTV, 0.5));
    var landRate = pref(m7p, 'landRate', num(finD.landRate, 0.028));
    var constLTV = pref(m7p, 'constLTV', num(finD.constLTV, 0.7));
    var constRate = pref(m7p, 'constRate', num(finD.constRate, 0.026));
    var sgaRate = pref(m7p, 'sgaRate', num(softD.sgaRate, 0.03));
    var marketingRate = pref(m7p, 'marketingRate', num(softD.marketingRate, 0.05));
    var designRate = pref(m7p, 'designRate', num(softD.designRate, 0.025));
    var taxRateOther = pref(m7p, 'taxRateOther', num(softD.taxRateOther, 0.01));
    var profitTaxRate = pref(m7p, 'profitTaxRate', num(softD.profitTaxRate, 0.20));

    var planMonths = clampInt(pref(m7p, 'planMonths', num(schD.planMonths, 12)), 0, 120);
    var buildMonths = clampInt(pref(m7p, 'buildMonths', num(schD.buildMonths, 30)), 1, 180);
    var handoverMonths = clampInt(pref(m7p, 'handoverMonths', num(schD.handoverMonths, 6)), 0, 60);
    var presaleStartMonth = clampInt(pref(m7p, 'presaleStartMonth', num(schD.presaleStartMonth, 9)), 0, 180);

    var reg = resolveRegime(p, ctx);
    var planMonthsEff = Math.max(planMonths, reg.baseMonths) + reg.bonusMonthsAdd;
    var presaleStartEff = Math.max(0, presaleStartMonth + (planMonthsEff - planMonths));
    if (planMonthsEff !== planMonths) {
      notes.push('規劃請照期 ' + planMonths + ' 個月已依制度「' + reg.regimeName + '」基本作業 '
        + reg.baseMonths + ' 個月與獎勵項目加計 ' + reg.bonusMonthsAdd + ' 個月，調整為 '
        + planMonthsEff + ' 個月（取較長者再加計）；預售啟動月同步後移至第 ' + presaleStartEff
        + ' 月，維持與開工日的相對關係。審議期實際長短因個案差異極大，須人工複核。');
    }
    /* 預售不得早於建照取得：預售屋須先領得建造執照並辦理預售屋買賣定型化契約備查，
       建照未到手就收訂簽開是違規的，也會讓現金流提前入帳、虛增出價上限。
       這裡一律把預售啟動月夾到請照完成月（planMonthsEff）之後。 */
    if (presaleStartEff < planMonthsEff) {
      notes.push('預售啟動月原為第 ' + presaleStartEff + ' 月，早於請照完成月第 ' + planMonthsEff
        + ' 月。預售屋須先領得建造執照，因此已夾到第 ' + planMonthsEff + ' 月。'
        + '若要改，請把 p.m7.presaleStartMonth 設為不小於規劃請照期 ' + planMonths + ' 的值。');
      presaleStartEff = planMonthsEff;
    }

    /* ---- 3. 面積 ---- */
    var aboveM2 = num(m5.grossFloorM2, null);
    if (aboveM2 === null) {
      aboveM2 = num(m5.volFloorM2, null);
      if (aboveM2 === null) {
        aboveM2 = 0;
        notes.push('ctx.m5 沒有樓地板面積（grossFloorM2／volFloorM2 皆缺），營建成本以 0 計，'
          + '請先完成 m5 量體試算，否則整份成本表無意義。');
      } else {
        notes.push('ctx.m5.grossFloorM2 不存在，改以 volFloorM2 當作地上樓地板，'
          + '免計容積部分（陽台、雨遮、機電）的營建成本因此被低估。');
      }
    }
    var basementM2 = num(m5.basementM2, 0);
    var demoM2 = num(p.parcel && p.parcel.existingFloorM2, 0);
    var abovePing = toPing(aboveM2);
    var basementPing = toPing(basementM2);
    var demoPing = toPing(demoM2);

    /* ---- 4. 總銷（軟成本與稅費的基礎）---- */
    var salesBasis = resolveSales(p, ctx, cost, notes);
    var totalSales = salesBasis.totalSales;

    /* ---- 5. 營建成本 = 地上 + 地下 + 拆除 ---- */
    var aboveCost = abovePing * perPing;
    var basementCost = basementPing * basementPerPing;
    var demoCost = demoPing * demoPerPing;
    var hardCost = aboveCost + basementCost + demoCost;

    items.push({ id: 'conAbove', label: '營建工程（地上）', amount: aboveCost,
      basis: '地上樓地板 ' + fn(abovePing, 1) + ' 坪 × ' + fn(perPing, 0) + ' 元/坪（'
        + row.label + (hasOverride ? '，使用者覆寫單價' : '') + '）',
      conf: hasOverride ? 'input' : 'unv',
      src: hasOverride ? '使用者輸入 p.m7.constructionPerPingOverride' : conSrc });

    items.push({ id: 'conBasement', label: '營建工程（地下室）', amount: basementCost,
      basis: '地下樓地板 ' + fn(basementPing, 1) + ' 坪 × ' + fn(basementPerPing, 0) + ' 元/坪',
      conf: 'unv', src: conSrc });

    items.push({ id: 'demolition', label: '拆除工程', amount: demoCost,
      basis: demoPing > 0
        ? '既有建物樓地板 ' + fn(demoPing, 1) + ' 坪 × ' + fn(demoPerPing, 0) + ' 元/坪'
        : '素地或未填既有建物樓地板（parcel.existingFloorM2 = 0），拆除以 0 計',
      conf: 'unv', src: conSrc });

    /* ---- 6. 軟成本 = 設計監造（依營建）+ 管銷 + 廣告銷售（依總銷）---- */
    var designCost = hardCost * designRate;
    var sgaCost = totalSales * sgaRate;
    var marketingCost = totalSales * marketingRate;

    items.push({ id: 'design', label: '設計監造', amount: designCost,
      basis: '營建成本 ' + fn(hardCost, 0) + ' 元 × 設計監造率 ' + fpct(designRate, 2),
      conf: 'unv', src: SRC_SEED + '（soft.designRate）' });

    items.push({ id: 'sga', label: '管銷費用', amount: sgaCost,
      basis: '總銷 ' + fn(totalSales, 0) + ' 元 × 管銷率 ' + fpct(sgaRate, 2)
        + (salesBasis.estimated ? '（總銷為回落粗估值）' : ''),
      conf: 'unv', src: SRC_SEED + '（soft.sgaRate）' });

    items.push({ id: 'marketing', label: '廣告銷售（含代銷佣金）', amount: marketingCost,
      basis: '總銷 ' + fn(totalSales, 0) + ' 元 × 廣告銷售率 ' + fpct(marketingRate, 2)
        + '。包銷與純代銷差異可達兩個百分點以上',
      conf: 'unv', src: SRC_SEED + '（soft.marketingRate）' });

    /* 容積獎勵取得成本（容積移轉購買、公益設施捐贈）：歸在軟成本，避免四項小計加不回總數 */
    var bonusCost = num(ctx.m4 && ctx.m4.chosen && ctx.m4.chosen.costTotal, 0);
    if (bonusCost > 0) {
      items.push({ id: 'bonusCost', label: '容積獎勵取得成本', amount: bonusCost,
        basis: 'm4 選定組合（' + reg.regimeName + '：' + (reg.itemIds.join('、') || '無')
          + '）的取得成本合計，含容積移轉購買與公益設施捐贈',
        conf: 'unv', src: 'ctx.m4.chosen.costTotal（TD.data.bonus 種子參數）' });
      notes.push('容積獎勵取得成本 ' + fn(bonusCost, 0) + ' 元已計入軟成本小計，'
        + '以免四項小計加不回 totalCostExLand；報表若要單列，請直接取 items 裡的 bonusCost。');
    }
    var softCost = designCost + sgaCost + marketingCost + bonusCost;

    /* ---- 7. 逐月營建支出曲線（m8 會用）----
       地上與地下依 S 曲線動撥，拆除全部落在開工第一個月。合計等於營建成本。 */
    var curve = TD.math.sCurve(buildMonths);
    var monthlyCostCurve = [];
    var spreadBase = aboveCost + basementCost;
    for (i = 0; i < buildMonths; i++) {
      monthlyCostCurve.push(curve[i] * spreadBase + (i === 0 ? demoCost : 0));
    }

    /* ---- 8. 建融利息（只算建融；土融利息在 m8 隨土地價一起算）----
       期中平均餘額慣例：本月利息 = （月初餘額 + 本月動撥 ÷ 2）× 年利率 ÷ 12。 */
    var bal = 0, financeCost = 0, draw;
    for (i = 0; i < buildMonths; i++) {
      draw = monthlyCostCurve[i] * constLTV;
      financeCost += (bal + draw / 2) * constRate / 12;
      bal += draw;
    }
    var peakLoan = bal;

    items.push({ id: 'finance', label: '建築融資利息', amount: financeCost,
      basis: '依 S 曲線動撥 ' + buildMonths + ' 個月，成數 ' + fpct(constLTV, 1)
        + '，年利率 ' + fpct(constRate, 2) + '，逐月（月初餘額 ＋ 本月動撥 ÷ 2）× 年利率 ÷ 12 累計；'
        + '動撥高峰餘額 ' + fn(peakLoan, 0) + ' 元',
      conf: 'unv', src: SRC_SEED + '（finance.constLTV／constRate）' });

    /* ---- 9. 稅費（簡化）---- */
    var taxCost = totalSales * taxRateOther;
    var taxNote = '本項只含以總銷比率粗估的其他稅費規費。土地增值稅、房地合一稅、'
      + '銷售房屋的營業稅與印花稅、未分配盈餘加徵一律未細算；'
      + '利潤稅（profitTaxRate ' + fpct(profitTaxRate, 1) + '）在 m8 以稅後淨利處理，不重複計入本項。'
      + '實際稅負依交易架構（買地自建、合建分屋、信託）差異極大，必須由會計師試算確認。';

    items.push({ id: 'taxOther', label: '其他稅費規費', amount: taxCost,
      basis: '總銷 ' + fn(totalSales, 0) + ' 元 × 其他稅費率 ' + fpct(taxRateOther, 2),
      conf: 'unv', src: SRC_SEED + '（soft.taxRateOther）' });

    /* ---- 10. 合計 ---- */
    var totalExLandExFinance = hardCost + softCost + taxCost;
    var totalExLand = totalExLandExFinance + financeCost;

    notes.push('totalCostExLand 不含土地價、不含土地融資利息（土地價是 m8 的待解變數）、'
      + '不含利潤稅。m8 的月現金流會自行依 monthlyCostCurve 重算建融利息，'
      + '請勿再把 financeCost 加進 m8 的成本，否則利息會重複計算兩次。');
    notes.push('營建單價合理區間 ' + fn(perPingLow, 0) + '～' + fn(perPingHigh, 0)
      + ' 元/坪，本次採用 ' + fn(perPing, 0) + ' 元/坪。單價上下緣約 ±'
      + fn(Math.max(perPingHigh - perPing, perPing - perPingLow) / (perPing || 1) * 100, 0)
      + '%，比 m8 敏感度預設的 ±10% 更寬，實際報價務必回填。');
    notes.push('全部成本參數來自 TD.data.cost 種子資料，verified:false，'
      + '信心一律標 unv；上線前須接政府電子採購網決標資料與銀行實際報價。');

    var costSrc = SRC_SEED;
    var fml = '營建 ' + fn(hardCost, 0) + ' ＋ 軟成本 ' + fn(softCost, 0)
      + ' ＋ 建融利息 ' + fn(financeCost, 0) + ' ＋ 稅費 ' + fn(taxCost, 0)
      + ' ＝ ' + fn(totalExLand, 0) + ' 元';

    return {
      items: items,

      constructionCost: TD.V('m7.constructionCost', hardCost, 'unv', conSrc,
        '地上 ' + fn(aboveCost, 0) + ' ＋ 地下室 ' + fn(basementCost, 0) + ' ＋ 拆除 ' + fn(demoCost, 0)
        + ' ＝ ' + fn(hardCost, 0) + ' 元',
        '單價為種子資料，且樓地板面積來自 m5 的初步量體（未經建築師簽證），兩層不確定相乘。'),

      softCost: TD.V('m7.softCost', softCost, 'unv', SRC_SEED,
        '設計監造 ' + fn(designCost, 0) + ' ＋ 管銷 ' + fn(sgaCost, 0) + ' ＋ 廣告銷售 '
        + fn(marketingCost, 0) + (bonusCost > 0 ? ' ＋ 容積獎勵取得 ' + fn(bonusCost, 0) : '')
        + ' ＝ ' + fn(softCost, 0) + ' 元',
        '管銷與廣告銷售以總銷比率估算，屬粗估法；大案的規模經濟會讓比率明顯下降。'),

      financeCost: TD.V('m7.financeCost', financeCost, 'unv', SRC_SEED + '（finance）',
        '建融：S 曲線動撥 ' + buildMonths + ' 個月 × 成數 ' + fpct(constLTV, 1)
        + ' × 年利率 ' + fpct(constRate, 2) + ' ÷ 12，逐月期中平均餘額累計 ＝ ' + fn(financeCost, 0) + ' 元',
        '只含建融。土地融資利息在 m8 隨土地價一起算，不在此。利率與成數受選擇性信用管制影響，須以核貸條件取代。'),

      taxCost: TD.V('m7.taxCost', taxCost, 'unv', SRC_SEED + '（soft.taxRateOther）',
        '總銷 ' + fn(totalSales, 0) + ' × ' + fpct(taxRateOther, 2) + ' ＝ ' + fn(taxCost, 0) + ' 元',
        taxNote),

      totalCostExLand: TD.V('m7.totalCostExLand', totalExLand, 'unv', costSrc, fml,
        '不含土地價、土融利息與利潤稅。任一項成本參數改變都會直接位移 m8 的出價上限。'),

      monthlyCostCurve: monthlyCostCurve,
      notes: notes,

      /* ---- 以下為契約欄位之外的附加輸出，供 m8 與 UI 取用（見 docs/NOTES-m7.md）---- */
      params: {
        constructionKey: row.id, constructionLabel: row.label,
        perPing: perPing, perPingLow: perPingLow, perPingHigh: perPingHigh,
        basementPerPing: basementPerPing, demolitionPerPing: demoPerPing,
        landLTV: landLTV, landRate: landRate, constLTV: constLTV, constRate: constRate,
        sgaRate: sgaRate, marketingRate: marketingRate, designRate: designRate,
        taxRateOther: taxRateOther, profitTaxRate: profitTaxRate,
        parkingPricePerStall: num(cost.parkingPricePerStall, 0)
      },
      schedule: {
        planMonths: planMonths, planMonthsEff: planMonthsEff,
        buildMonths: buildMonths, handoverMonths: handoverMonths,
        presaleStartMonth: presaleStartMonth, presaleStartEff: presaleStartEff,
        regimeId: reg.regimeId, regimeName: reg.regimeName,
        regimeBaseMonths: reg.baseMonths, bonusMonthsAdd: reg.bonusMonthsAdd,
        completionMonth: planMonthsEff + buildMonths,
        horizon: planMonthsEff + buildMonths + handoverMonths + 1
      },
      areas: {
        aboveGroundM2: aboveM2, aboveGroundPing: abovePing,
        basementM2: basementM2, basementPing: basementPing,
        demolitionM2: demoM2, demolitionPing: demoPing
      },
      raws: {
        conAbove: aboveCost, conBasement: basementCost, demolition: demoCost, hard: hardCost,
        design: designCost, sga: sgaCost, marketing: marketingCost, bonusCost: bonusCost,
        soft: softCost, finance: financeCost, peakConstLoan: peakLoan, taxOther: taxCost,
        totalExLand: totalExLand, totalExLandExFinance: totalExLandExFinance
      },
      salesBasis: salesBasis
    };
  }

  TD.engine.m7 = m7;
})(window.TD);
