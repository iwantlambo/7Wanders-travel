/* M7 成本模型：依產品與層數選 2026 年營建單價，算出地上、地下、拆除、軟成本、營業稅與其他稅費、建融利息，並產出逐月營建支出曲線供 M8 回推土地價。*/
window.TD = window.TD || {};
(function (TD) {
  'use strict';

  TD.engine = TD.engine || {};

  var PING = TD.PING || 3.3057851239669;

  function raw(x) { return TD.raw ? TD.raw(x) : x; }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function num(x, d) { var v = raw(x); return isNum(v) ? v : d; }
  function pref(src, key, d) { return (src && isNum(src[key])) ? src[key] : d; }
  function clampInt(v, lo, hi) { return Math.max(lo, Math.min(hi, Math.round(v))); }
  function fn(v, d) { return isNum(v) ? TD.fmt.n(v, d || 0) : '—'; }
  function fpct(v, d) { return isNum(v) ? TD.fmt.pct(v, d === undefined ? 1 : d) : '—'; }
  function wan(v) { return isNum(v) ? TD.fmt.n(v / 1e4, 1) + ' 萬' : '—'; }

  function findById(list, id) {
    var i;
    for (i = 0; list && i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
    return null;
  }

  /* 制度審議月數：制度基本作業月數與規劃請照期取長，再加各獎勵項目的加計月數 */
  function resolveRegime(p, ctx) {
    var bonus = TD.data.bonus || {};
    var chosen = (ctx.m4 && ctx.m4.chosen) || null;
    var regimeId = (chosen && chosen.regimeId) || 'NONE';
    var regime = bonus.regimeById ? bonus.regimeById(regimeId) : null;
    var add = 0, i, items = (chosen && chosen.items) || [];
    for (i = 0; i < items.length; i++) add += num(items[i].monthsAdd, 0);
    return { regimeId: regimeId, regimeName: (regime && regime.name) || regimeId,
             baseMonths: num(regime && regime.baseMonths, 12), bonusMonthsAdd: add,
             itemIds: (chosen && chosen.itemIds) || [] };
  }

  function m7(p, ctx) {
    p = p || {};
    ctx = ctx || {};
    var notes = [];
    var cost = TD.data.cost || {};
    var con = cost.construction || {};
    var finD = cost.finance || {}, softD = cost.soft || {}, schD = cost.schedule || {};
    var m7p = p.m7 || {};
    var m5 = ctx.m5 || {}, m6 = ctx.m6 || {};
    var site = (ctx.m3 && ctx.m3.site) || (TD.engine.siteOf ? TD.engine.siteOf(p) : {});
    var product = m5.product || site.product || '住宅大樓';
    var items = [], i;

    /* ---- 1. 營建單價 ---- */
    var floorsAbove = num(m5.floorsAbove, 12);
    var basementLevels = num(m5.basementLevels, 1);
    var cityF = cost.cityFactorOf ? cost.cityFactorOf(site.city) : 1;
    var key = m7p.constructionKey || 'auto';
    var row = (key !== 'auto') ? findById(con.rows, key) : null;
    var autoRow = cost.rowFor ? cost.rowFor(product, floorsAbove) : (con.rows || [])[0];
    if (!row) row = autoRow;
    var hasOverride = isNum(m7p.constructionPerPingOverride) && m7p.constructionPerPingOverride > 0;
    var curvePer = (key === 'auto' && cost.perPingOf) ? cost.perPingOf(product, floorsAbove) : row.perPing;
    var perPing = hasOverride ? m7p.constructionPerPingOverride : curvePer * cityF;
    var perPingLow = row.low * cityF, perPingHigh = row.high * cityF;
    var basementPerPing = num(con.basementPerPing, 320000) * cityF;
    var demoPerPing = num(con.demolitionPerPing, 8000);
    var conSrc = con.source || '2026 年營建行情';
    var rowDesc = row.label + (cityF !== 1 ? '，' + site.city + '係數 ' + cityF : '')
                + (key === 'auto' ? '（依產品「' + product + '」與地上 ' + fn(floorsAbove) + ' 層，由 2026 年行情曲線內插）' : '（使用者指定級距）');

    /* ---- 2. 財務與比率 ---- */
    var industrial = site.zoneCls === '工';
    var landLTV = pref(m7p, 'landLTV', industrial ? num(finD.landLTVIndustrial, 0.6) : num(finD.landLTV, 0.5));
    var landRate = pref(m7p, 'landRate', num(finD.landRate, 0.03));
    var constLTV = pref(m7p, 'constLTV', num(finD.constLTV, 0.7));
    var constRate = pref(m7p, 'constRate', num(finD.constRate, 0.028));
    var sgaRate = pref(m7p, 'sgaRate', num(softD.sgaRate, 0.03));
    var marketingRate = pref(m7p, 'marketingRate', num(softD.marketingRate, 0.045));
    var designRate = pref(m7p, 'designRate', num(softD.designRate, 0.03));
    var taxRateOther = pref(m7p, 'taxRateOther', num(softD.taxRateOther, 0.008));
    var profitTaxRate = pref(m7p, 'profitTaxRate', num(softD.profitTaxRate, 0.20));
    var businessTaxRate = num(softD.businessTaxRate, 0.05);
    var housePortion = num(softD.housePortion, 0.35);

    /* ---- 3. 時程 ---- */
    var buildAuto = cost.buildMonthsOf ? cost.buildMonthsOf(floorsAbove, basementLevels) : 30;
    var planMonths = clampInt(pref(m7p, 'planMonths', num(schD.planMonths, 12)), 0, 120);
    var buildMonths = clampInt(pref(m7p, 'buildMonths', isNum(schD.buildMonths) ? schD.buildMonths : buildAuto), 6, 120);
    var handoverMonths = clampInt(pref(m7p, 'handoverMonths', num(schD.handoverMonths, 6)), 0, 36);
    var presaleStartMonth = clampInt(pref(m7p, 'presaleStartMonth', num(schD.presaleStartMonth, 12)), 0, 180);
    var reg = resolveRegime(p, ctx);
    var planMonthsEff = Math.max(planMonths, reg.baseMonths) + reg.bonusMonthsAdd;
    var presaleStartEff = Math.max(planMonthsEff, presaleStartMonth + (planMonthsEff - planMonths));
    if (planMonthsEff !== planMonths) {
      notes.push('規劃請照期依「' + reg.regimeName + '」作業 ' + reg.baseMonths + ' 個月與獎勵加計 ' + reg.bonusMonthsAdd
               + ' 個月，調整為 ' + planMonthsEff + ' 個月；預售自第 ' + presaleStartEff + ' 月起（須先取得建造執照）。');
    }

    /* ---- 4. 面積 ---- */
    var aboveM2 = num(m5.grossFloorM2, 0);
    var basementM2 = num(m5.basementM2, 0);
    var demoM2 = num(site.existingFloorM2, 0);
    var abovePing = aboveM2 / PING, basementPing = basementM2 / PING, demoPing = demoM2 / PING;
    if (!(aboveM2 > 0)) notes.push('量體段沒有地上樓地板（基地面積或容積率未填），營建成本為 0。');

    /* ---- 5. 總銷（軟成本與稅費基礎） ---- */
    var totalSales = num(m6.totalSales, 0);
    var salesEstimated = false;
    if (!(totalSales > 0)) {
      var fb = num(cost.fallbackUnitPricePing, 600000);
      totalSales = num(m5.sellablePing, 0) * fb;
      salesEstimated = true;
      if (totalSales > 0) notes.push('收入段尚未產出總銷，軟成本暫以保守單價 ' + wan(fb) + '／坪 估算。');
    }

    /* ---- 6. 營建 ---- */
    var aboveCost = abovePing * perPing;
    var basementCost = basementPing * basementPerPing;
    var demoCost = demoPing * demoPerPing;
    var hardCost = aboveCost + basementCost + demoCost;
    var conConf = hasOverride ? 'input' : 'mid';

    items.push({ id: 'conAbove', label: '營建工程（地上）', amount: aboveCost, conf: conConf,
      basis: '地上樓地板 ' + fn(abovePing, 1) + ' 坪 × ' + wan(perPing) + '／坪（' + (hasOverride ? '使用者輸入單價' : rowDesc) + '）',
      src: hasOverride ? '使用者輸入' : conSrc });
    items.push({ id: 'conBasement', label: '營建工程（地下室）', amount: basementCost, conf: 'mid',
      basis: '地下室 ' + fn(basementPing, 1) + ' 坪（' + fn(basementLevels) + ' 層）× ' + wan(basementPerPing) + '／坪（含開挖、擋土與止水）',
      src: conSrc });
    items.push({ id: 'demolition', label: '拆除工程', amount: demoCost, conf: demoPing > 0 ? 'mid' : 'high',
      basis: demoPing > 0 ? '既有建物 ' + fn(demoPing, 1) + ' 坪 × ' + wan(demoPerPing) + '／坪' : '素地（未填既有建物面積），無拆除費',
      src: conSrc });

    /* ---- 7. 軟成本 ---- */
    var designCost = hardCost * designRate;
    var sgaCost = totalSales * sgaRate;
    var marketingCost = totalSales * marketingRate;
    var bonusCost = num(ctx.m4 && ctx.m4.chosen && ctx.m4.chosen.costTotal, 0);
    items.push({ id: 'design', label: '設計監造', amount: designCost, conf: 'mid',
      basis: '營建 ' + TD.fmt.money(hardCost) + ' × ' + fpct(designRate, 1), src: softD.source || '' });
    items.push({ id: 'sga', label: '管銷費用', amount: sgaCost, conf: 'mid',
      basis: '總銷 ' + TD.fmt.money(totalSales) + ' × ' + fpct(sgaRate, 1) + (salesEstimated ? '（總銷為暫估）' : ''), src: softD.source || '' });
    items.push({ id: 'marketing', label: '廣告銷售（含代銷）', amount: marketingCost, conf: 'mid',
      basis: '總銷 × ' + fpct(marketingRate, 1), src: softD.source || '' });
    if (bonusCost > 0) {
      items.push({ id: 'bonusCost', label: '容積獎勵取得成本', amount: bonusCost, conf: 'mid',
        basis: reg.regimeName + '：' + (reg.itemIds.join('、') || '—') + '（容積價購、捐贈樓地板或標章增量）', src: '容積獎勵段' });
    }
    var softCost = designCost + sgaCost + marketingCost + bonusCost;

    /* ---- 8. 營建支出曲線與建融利息 ---- */
    var curve = TD.math.sCurve(buildMonths);
    var monthlyCostCurve = [], spreadBase = aboveCost + basementCost;
    for (i = 0; i < buildMonths; i++) monthlyCostCurve.push(curve[i] * spreadBase + (i === 0 ? demoCost : 0));
    var bal = 0, financeCost = 0, draw;
    for (i = 0; i < buildMonths; i++) {
      draw = monthlyCostCurve[i] * constLTV;
      financeCost += (bal + draw / 2) * constRate / 12;
      bal += draw;
    }
    items.push({ id: 'finance', label: '建築融資利息', amount: financeCost, conf: 'mid',
      basis: '施工 ' + buildMonths + ' 個月依 S 曲線動撥，成數 ' + fpct(constLTV, 0) + '、年利率 ' + fpct(constRate, 2),
      src: finD.source || '' });

    /* ---- 9. 稅費 ---- */
    var businessTax = totalSales * housePortion * businessTaxRate / (1 + businessTaxRate);
    var otherTax = totalSales * taxRateOther;
    var taxCost = businessTax + otherTax;
    items.push({ id: 'businessTax', label: '營業稅（房屋部分）', amount: businessTax, conf: 'mid',
      basis: '總銷 × 房屋部分 ' + fpct(housePortion, 0) + ' × 5% ÷ 1.05（售價含稅；土地免徵）',
      src: '加值型及非加值型營業稅法第8條、第10條；營業稅法施行細則第21條' });
    items.push({ id: 'taxOther', label: '其他稅費規費', amount: otherTax, conf: 'mid',
      basis: '總銷 × ' + fpct(taxRateOther, 1) + '（印花稅、開發期間地價稅、規費、代書與保險）', src: softD.source || '' });

    var totalExLandExFinance = hardCost + softCost + taxCost;
    var totalExLand = totalExLandExFinance + financeCost;

    notes.push('營建單價 ' + wan(perPing) + '／坪（合理區間 ' + wan(perPingLow) + '～' + wan(perPingHigh) + '），地下室 '
             + wan(basementPerPing) + '／坪；有實際發包報價時請在左欄「成本」覆寫。');
    notes.push('土地融資成數 ' + fpct(landLTV, 0) + (industrial ? '（工業區土地不在央行住商用地購地貸款五成上限內，銀行常見六成）'
             : '（央行選擇性信用管制：購買住宅區、商業區土地貸款最高五成）') + '，年利率 ' + fpct(landRate, 2) + '。');
    notes.push('利潤稅（營利事業所得稅 ' + fpct(profitTaxRate, 0) + '）在出價段以稅後淨利處理；土地增值稅由賣方負擔，未計入。');

    var fml = '營建 ' + TD.fmt.money(hardCost) + ' ＋ 軟成本 ' + TD.fmt.money(softCost) + ' ＋ 建融利息 '
            + TD.fmt.money(financeCost) + ' ＋ 稅費 ' + TD.fmt.money(taxCost) + ' ＝ ' + TD.fmt.money(totalExLand);

    return {
      items: items,
      constructionCost: TD.V('m7.constructionCost', hardCost, conConf, conSrc,
        '地上 ' + TD.fmt.money(aboveCost) + ' ＋ 地下室 ' + TD.fmt.money(basementCost) + ' ＋ 拆除 ' + TD.fmt.money(demoCost),
        rowDesc + '；' + (row.note || '')),
      softCost: TD.V('m7.softCost', softCost, 'mid', softD.source || '',
        '設計監造 ' + TD.fmt.money(designCost) + ' ＋ 管銷 ' + TD.fmt.money(sgaCost) + ' ＋ 廣告銷售 ' + TD.fmt.money(marketingCost)
        + (bonusCost > 0 ? ' ＋ 容積獎勵取得 ' + TD.fmt.money(bonusCost) : ''), '業界常見比率。'),
      financeCost: TD.V('m7.financeCost', financeCost, 'mid', finD.source || '',
        '建融：' + buildMonths + ' 個月 S 曲線動撥 × ' + fpct(constLTV, 0) + ' × ' + fpct(constRate, 2),
        '土地融資利息在出價段隨土地價一起算。'),
      taxCost: TD.V('m7.taxCost', taxCost, 'mid', '營業稅法；' + (softD.source || ''),
        '營業稅 ' + TD.fmt.money(businessTax) + ' ＋ 其他稅費 ' + TD.fmt.money(otherTax), '不含營利事業所得稅（出價段另計）。'),
      totalCostExLand: TD.V('m7.totalCostExLand', totalExLand, conConf === 'input' ? 'mid' : 'mid', conSrc, fml,
        '不含土地價、土融利息與營利事業所得稅。'),
      monthlyCostCurve: monthlyCostCurve,
      notes: notes,

      params: {
        constructionKey: row.id, constructionLabel: row.label, constructionAuto: key === 'auto', product: product,
        perPing: perPing, perPingLow: perPingLow, perPingHigh: perPingHigh, cityFactor: cityF,
        basementPerPing: basementPerPing, demolitionPerPing: demoPerPing,
        landLTV: landLTV, landRate: landRate, constLTV: constLTV, constRate: constRate,
        sgaRate: sgaRate, marketingRate: marketingRate, designRate: designRate,
        taxRateOther: taxRateOther, profitTaxRate: profitTaxRate,
        businessTaxRate: businessTaxRate, housePortion: housePortion,
        parkingPricePerStall: num(m6.parkingPricePerStall, 0)
      },
      schedule: {
        planMonths: planMonths, planMonthsEff: planMonthsEff,
        buildMonths: buildMonths, buildMonthsAuto: buildAuto, handoverMonths: handoverMonths,
        presaleStartMonth: presaleStartMonth, presaleStartEff: presaleStartEff,
        regimeId: reg.regimeId, regimeName: reg.regimeName,
        regimeBaseMonths: reg.baseMonths, bonusMonthsAdd: reg.bonusMonthsAdd,
        completionMonth: planMonthsEff + buildMonths,
        horizon: planMonthsEff + buildMonths + handoverMonths + 1
      },
      areas: {
        aboveGroundM2: aboveM2, aboveGroundPing: abovePing,
        basementM2: basementM2, basementPing: basementPing, basementLevels: basementLevels,
        demolitionM2: demoM2, demolitionPing: demoPing
      },
      raws: {
        conAbove: aboveCost, conBasement: basementCost, demolition: demoCost, hard: hardCost,
        design: designCost, sga: sgaCost, marketing: marketingCost, bonusCost: bonusCost,
        soft: softCost, finance: financeCost, peakConstLoan: bal,
        businessTax: businessTax, taxOther: otherTax, tax: taxCost,
        totalExLand: totalExLand, totalExLandExFinance: totalExLandExFinance
      },
      salesBasis: { totalSales: totalSales, estimated: salesEstimated }
    };
  }

  TD.engine.m7 = m7;
})(window.TD);
