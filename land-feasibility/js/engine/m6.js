/* M6 收入模型：以本區同產品的實價登錄預售成交推估銷售單價（或使用者匯入的成交案例迴歸、或直接輸入），乘可售坪與車位算出總銷與去化月數。*/
window.TD = window.TD || {};
(function (TD) {
  'use strict';

  TD.engine = TD.engine || {};

  /* ------------------------------------------------------------------
     三條路徑

       district  預設：內建實價登錄（本區、同產品型態的預售屋成交），取近 12 個月中位數；
                 本區樣本不足退全市，全市也沒有再以住宅大樓單價乘產品係數推估。
       custom    使用者匯入的成交案例（實價登錄 CSV 或手動）：樣本 8 筆以上做特徵價格迴歸
                 （ln 單價對屋齡、樓層、面積、距離、成交時間），否則逐筆調整後加權。
       manual    使用者直接輸入單價。

     單價一律是「元／坪，不含車位」，與實價登錄的「單價（已扣車位）」同口徑；
     車位以「每位單價 × 車位數」另計，兩者相加為總銷。
     ------------------------------------------------------------------ */

  var MIN_N_HEDONIC = 8;
  var ADJ = { agePerYear: -0.006, floorPerLevel: 0.008, areaPerPing: -0.0015, distPerM: -0.0002, perMonth: 0.002 };
  var ADJ_CAP = 0.35;

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function num(v) { var x = TD.raw(v); return isNum(x) ? x : null; }
  function f(v, d) { return isNum(v) ? TD.fmt.n(v, d === undefined ? 1 : d) : '—'; }
  function fp(v, d) { return isNum(v) ? TD.fmt.pct(v, d === undefined ? 1 : d) : '—'; }
  function wan(v) { return isNum(v) ? TD.fmt.n(v / 1e4, 1) + ' 萬' : '—'; }
  function signPct(v) { return isNum(v) ? (v >= 0 ? '＋' : '−') + Math.abs(v * 100).toFixed(1) + '%' : '—'; }
  function ymStr(ym) { return isNum(ym) ? Math.floor(ym / 100) + '/' + ('0' + (ym % 100)).slice(-2) : ''; }

  /* 成交年月（yyyymm）距今月數 */
  function monthsAgo(ym, nowYm) {
    if (!isNum(ym) || !isNum(nowYm)) return 0;
    return (Math.floor(nowYm / 100) - Math.floor(ym / 100)) * 12 + (nowYm % 100) - (ym % 100);
  }

  /* ---------------- 使用者匯入案例 ---------------- */

  function usable(src) {
    var out = [], skipped = 0, i, r;
    if (Object.prototype.toString.call(src) !== '[object Array]') return { rows: out, skipped: 0 };
    for (i = 0; i < src.length; i++) {
      r = src[i];
      if (!r || !isNum(r.unitPricePing) || r.unitPricePing <= 0 || !isNum(r.areaPing) || r.areaPing <= 0) { skipped++; continue; }
      out.push({
        id: r.id || ('c' + (i + 1)), addr: r.addr || '', district: r.district || '', type: r.type || '',
        year: isNum(r.year) ? r.year : null, ym: isNum(r.ym) ? r.ym : (isNum(r.year) ? r.year * 100 + 6 : null),
        unitPricePing: r.unitPricePing, areaPing: r.areaPing,
        ageYears: isNum(r.ageYears) ? r.ageYears : 0, floor: isNum(r.floor) ? r.floor : 0,
        totalFloors: isNum(r.totalFloors) ? r.totalFloors : null, distanceM: isNum(r.distanceM) ? r.distanceM : 0
      });
    }
    return { rows: out, skipped: skipped };
  }

  var VARS = [
    { key: 'ageYears', name: '屋齡', per: 1, phrase: '屋齡每增加一年' },
    { key: 'floor', name: '樓層', per: 1, phrase: '樓層每上升一層' },
    { key: 'areaPing', name: '面積', per: 1, phrase: '面積每增加一坪' },
    { key: 'distanceM', name: '距離', per: 100, phrase: '距離每增加 100 公尺' },
    { key: 'mAgo', name: '成交時間', per: 12, phrase: '成交時間每早一年' }
  ];

  function hedonic(rows, sub, notes) {
    var used = [], j, i, lo, hi, X = [], y = [];
    for (j = 0; j < VARS.length; j++) {
      lo = Infinity; hi = -Infinity;
      for (i = 0; i < rows.length; i++) { lo = Math.min(lo, rows[i][VARS[j].key]); hi = Math.max(hi, rows[i][VARS[j].key]); }
      if (hi - lo > 1e-9) used.push(VARS[j]);
    }
    if (rows.length < Math.max(MIN_N_HEDONIC, used.length + 4)) return null;
    for (i = 0; i < rows.length; i++) {
      X.push(used.map(function (v) { return rows[i][v.key]; }));
      y.push(Math.log(rows[i].unitPricePing));
    }
    var fit = TD.math.ols(X, y);
    if (!fit) return null;
    var srow = used.map(function (v) { return sub[v.key]; });
    var pred = fit.predict(srow);
    if (!isFinite(pred)) return null;
    var drivers = used.map(function (v, k) {
      return { name: v.name, coef: fit.beta[k + 1], effect: v.phrase + '，單價約變動 ' + signPct(Math.exp(fit.beta[k + 1] * v.per) - 1) };
    });
    var comps = rows.map(function (r) {
      var fv = fit.predict(used.map(function (v) { return r[v.key]; }));
      var fpv = isFinite(fv) ? Math.exp(fv) : null;
      return compOut(r, { fitPrice: fpv, residPct: fpv ? r.unitPricePing / fpv - 1 : null });
    });
    if (fit.r2 < 0.5) notes.push('迴歸 R² 僅 ' + f(fit.r2, 2) + '，樣本解釋力偏低，建議補樣本。');
    return { price: Math.exp(pred), lo: Math.exp(pred - 1.645 * fit.se), hi: Math.exp(pred + 1.645 * fit.se),
             r2: fit.r2, n: fit.n, drivers: drivers, comps: comps };
  }

  function weighted(rows, sub) {
    var comps = [], ws = 0, ps = 0, adj = [], i, r, rate, price, w;
    for (i = 0; i < rows.length; i++) {
      r = rows[i];
      rate = (sub.ageYears - r.ageYears) * ADJ.agePerYear + (sub.floor - r.floor) * ADJ.floorPerLevel
           + (sub.areaPing - r.areaPing) * ADJ.areaPerPing + (sub.distanceM - r.distanceM) * ADJ.distPerM
           + r.mAgo * ADJ.perMonth;
      rate = Math.max(-ADJ_CAP, Math.min(ADJ_CAP, rate));
      price = r.unitPricePing * (1 + rate);
      w = 1 / (1 + Math.max(0, r.distanceM) / 300) / (1 + r.mAgo / 24);
      ws += w; ps += price * w; adj.push(price);
      comps.push(compOut(r, { adjRate: rate, adjPrice: price, weight: w }));
    }
    if (!comps.length || ws <= 0) return null;
    for (i = 0; i < comps.length; i++) comps[i].weightPct = comps[i].weight / ws;
    var pr = ps / ws;
    return { price: pr, lo: Math.min(TD.math.quantile(adj, 0.25), pr), hi: Math.max(TD.math.quantile(adj, 0.75), pr),
             r2: null, n: comps.length, comps: comps,
             drivers: [
               { name: '屋齡', coef: ADJ.agePerYear, effect: '屋齡每差一年調整 ' + signPct(ADJ.agePerYear) },
               { name: '樓層', coef: ADJ.floorPerLevel, effect: '樓層每差一層調整 ' + signPct(ADJ.floorPerLevel) },
               { name: '面積', coef: ADJ.areaPerPing, effect: '面積每差一坪調整 ' + signPct(ADJ.areaPerPing) },
               { name: '成交時間', coef: ADJ.perMonth, effect: '成交時間每早一個月調升 ' + signPct(ADJ.perMonth) }
             ] };
  }

  function compOut(r, extra) {
    var o = {
      id: r.id, addr: r.addr, district: r.district, type: r.type, year: r.year, ym: r.ym, ymLabel: ymStr(r.ym),
      unitPricePing: r.unitPricePing, areaPing: r.areaPing, ageYears: r.ageYears, floor: r.floor,
      totalFloors: r.totalFloors, distanceM: r.distanceM, project: r.project || '',
      ageAdj: null, floorAdj: null, areaAdj: null, distAdj: null,
      adjRate: null, adjPrice: null, weight: null, weightPct: null, fitPrice: null, residPct: null
    }, k;
    for (k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) o[k] = extra[k];
    return o;
  }

  /* ---------------- 主函式 ---------------- */

  function m6(p, ctx) {
    p = p || {};
    ctx = ctx || {};
    var s = p.m6 || {};
    var notes = [];
    var m5 = ctx.m5 || {};
    var site = (ctx.m3 && ctx.m3.site) || (TD.engine.siteOf ? TD.engine.siteOf(p) : { params: {} });
    var prm = site.params || {};
    var mkt = TD.engine.market;
    var city = site.city, district = site.district, product = site.product;
    var lvr = TD.data && TD.data.lvr;
    var lvrLoaded = !!(lvr && lvr.loaded && lvr.loaded(city));
    var nowYm = (lvrLoaded && lvr.meta(city)) ? Number(String(lvr.meta(city).to).replace('-', '')) : 202609;

    /* ---- 本區行情（無論走哪條路徑都列出供對照） ---- */
    var pre = (mkt && lvrLoaded) ? mkt.presale(city, district, product) : null;
    var resale = (mkt && lvrLoaded) ? mkt.resale(city, district, product) : null;
    /* 土地行情以「原分區」查（工業區變更試算時，買的仍是工業區土地） */
    var landZoneCls = (site.origZone && site.origZone.cls) ? site.origZone.cls : site.zoneCls;
    var landLvr = (mkt && lvrLoaded) ? mkt.land(city, district, landZoneCls) : null;
    var land = landLvr;

    /* ---- 研究行情：使用者查到的新案單價與土地成交，優先於實價登錄中位數 ---- */
    var rsch = (mkt && mkt.parseResearch) ? mkt.parseResearch(s.researchText) : { items: [], errors: [] };
    var rPrice = mkt ? mkt.researchFor(rsch.items, product) : [];
    var rLand = mkt ? mkt.researchFor(rsch.items, 'land') : [];
    if (rsch.errors.length) notes.push('研究行情：' + rsch.errors.join('；'));
    function rStats(list) {
      var v = list.map(function (x) { return x.price; }).sort(function (a, b) { return a - b; });
      return { n: v.length, p25: v[0], p50: mkt.median(v), p75: v[v.length - 1] };
    }
    /* 全部來自自動研究（Claude 網路搜尋）時信心為「中」：數字有來源但未經人工核對；有任何一筆是使用者自己輸入的，視為已核對 */
    function allAuto(list) {
      var q;
      if (!list.length) return false;
      for (q = 0; q < list.length; q++) if (!list[q].auto) return false;
      return true;
    }
    function rLabel(list) {
      return allAuto(list) ? '自動研究（Claude 網路搜尋 ' + list.length + ' 筆，須點開來源核對）' : '研究行情（使用者輸入 ' + list.length + ' 筆）';
    }
    if (rLand.length) {
      var rl = rStats(rLand);
      land = { perPing: rl.p50, p25: rl.p25, p50: rl.p50, p75: rl.p75, n: rl.n, scope: 'research', conf: allAuto(rLand) ? 'mid' : 'input',
               label: rLabel(rLand) + '：' + rLand.map(function (x) { return x.name; }).join('、')
                    + (landLvr ? '；實價登錄同區同分區 ' + wan(landLvr.perPing) + '／坪' : ''),
               comps: rLand.map(function (x) { return { ym: x.ym, addr: x.name, areaPing: null, unitPricePing: x.price,
                                                        zoneText: '研究：' + (x.src || '使用者輸入'), district: district }; })
                        .concat(landLvr && landLvr.comps ? landLvr.comps : []),
               lvr: landLvr, oldDeals: landLvr ? landLvr.oldDeals : [] };
    }

    var manual = isNum(s.manualUnitPricePing) && s.manualUnitPricePing > 0 ? s.manualUnitPricePing : null;
    var source = s.compSource === 'custom' ? 'custom' : 'district';
    var method = '', res = null, conf = 'mid', srcPrice = '', formula = '', noteP = '', isPresaleBasis = false;

    var sub = s.subject || {};
    var floorsAbove = num(m5.floorsAbove);
    var subject = {
      ageYears: isNum(sub.ageYears) ? sub.ageYears : 0,
      floor: isNum(sub.floor) ? sub.floor : (floorsAbove ? Math.max(2, Math.round(floorsAbove * 0.6)) : 8),
      areaPing: isNum(sub.areaPing) ? sub.areaPing : (m5.params && isNum(m5.params.avgUnitPing) ? m5.params.avgUnitPing : 30),
      distanceM: isNum(sub.distanceM) ? sub.distanceM : 0,
      mAgo: 0
    };

    if (manual !== null) {
      method = 'manual';
      conf = 'input';
      res = { price: manual, lo: manual, hi: manual, r2: null, n: 0, drivers: [], comps: [] };
      srcPrice = '使用者直接輸入之單價';
      formula = '單價 = 使用者輸入 ' + wan(manual) + '／坪';
      noteP = '使用者指定單價（不含車位）。下方本區實價登錄行情僅供對照。';
    } else if (rPrice.length) {
      method = 'research';
      conf = allAuto(rPrice) ? 'mid' : 'input';
      var rp = rStats(rPrice);
      res = { price: rp.p50, lo: Math.min.apply(null, rPrice.map(function (x) { return x.lo; })),
              hi: Math.max.apply(null, rPrice.map(function (x) { return x.hi; })), r2: null, n: rp.n, drivers: [],
              comps: rPrice.map(function (x, k) {
                return compOut({ id: 'r' + (k + 1), addr: x.src || '使用者輸入', district: district, type: product + '（研究）',
                                 year: x.ym ? Math.floor(x.ym / 100) : null, ym: x.ym, unitPricePing: x.price, areaPing: null,
                                 ageYears: 0, floor: null, totalFloors: null, distanceM: null, project: x.name }, {});
              }).concat(pre && pre.comps ? pre.comps.map(function (c, k) {
                return compOut({ id: 'p' + (k + 1), addr: c.addr, district: c.district, type: product + '（實價登錄）',
                                 year: Math.floor(c.ym / 100), ym: c.ym, unitPricePing: c.unitPricePing, areaPing: c.areaPing,
                                 ageYears: 0, floor: c.floor, totalFloors: c.totalFloors, distanceM: null, project: c.project }, {});
              }) : []) };
      srcPrice = rLabel(rPrice) + '：' + rPrice.map(function (x) { return x.name; }).join('、');
      formula = '單價 = 研究行情中位數 ' + wan(rp.p50) + '／坪（' + rPrice.map(function (x) { return x.name + ' ' + wan(x.price); }).join('、') + '）';
      noteP = (allAuto(rPrice) ? '採用自動研究找到的新案行情（來源與網址見左欄「自動研究」，請點開核對）；本區實價登錄'
                               : '採用你輸入的新案行情（通常比實價登錄中位數新）；本區實價登錄')
            + (pre ? '同產品預售中位數 ' + wan(pre.point) + '／坪，供對照。' : '查無同產品預售。');
    } else if (source === 'custom') {
      var u = usable(s.comps);
      if (u.skipped) notes.push('匯入案例中有 ' + u.skipped + ' 筆缺單價或面積，已略過。');
      for (var i = 0; i < u.rows.length; i++) u.rows[i].mAgo = monthsAgo(u.rows[i].ym, nowYm);
      if (u.rows.length) {
        res = hedonic(u.rows, subject, notes);
        if (res) {
          method = 'hedonic';
          formula = '單價 = exp(迴歸預測)，樣本 ' + res.n + ' 筆，R² ' + f(res.r2, 2) + '；區間為 90% 預測區間';
        } else {
          res = weighted(u.rows, subject);
          method = 'weighted';
          formula = '單價 = Σ(案例單價 ×（1＋調整率）× 權重) ÷ Σ 權重，樣本 ' + res.n + ' 筆';
          notes.push('匯入案例 ' + u.rows.length + ' 筆，未達迴歸所需樣本，改用逐筆調整加權。');
        }
        srcPrice = '使用者匯入之成交案例（' + u.rows.length + ' 筆）';
        noteP = '若匯入的是成屋案例，預售單價請在「預售溢價」輸入新案相對成屋的價差。';
        conf = res.n >= 8 ? 'mid' : 'low';
      } else {
        notes.push('選擇了「匯入案例」但沒有可用案例，改用本區實價登錄。');
        source = 'district';
      }
    }

    if (!res && source === 'district') {
      if (pre) {
        method = 'district';
        isPresaleBasis = true;
        conf = pre.conf;
        res = { price: pre.point, lo: pre.p25, hi: pre.p75, r2: null, n: pre.n, drivers: [],
                comps: (pre.comps || []).map(function (c, k) {
                  return compOut({ id: 'p' + (k + 1), addr: c.addr, district: c.district,
                                   type: (pre.scope === 'proxy' ? '住宅大樓' : product) + '（預售）',
                                   year: Math.floor(c.ym / 100), ym: c.ym, unitPricePing: c.unitPricePing, areaPing: c.areaPing,
                                   ageYears: 0, floor: c.floor, totalFloors: c.totalFloors, distanceM: null, project: c.project }, {});
                }) };
        srcPrice = pre.label;
        formula = '單價 = ' + (pre.recent ? '近 12 個月' : '全期間') + '預售成交單價中位數 ' + wan(pre.point) + '／坪'
                + '（四分位 ' + wan(pre.p25) + '～' + wan(pre.p75) + '）';
        noteP = '取自內政部實價登錄預售屋成交（單價已扣車位），與本案銷售同為預售、同產品型態，不另加預售溢價。'
              + (pre.scope === 'proxy' ? '本區沒有' + product + '樣本，係以住宅大樓單價換算，信心較低。' : '');
      } else {
        /* 沒有任何行情資料：不拿預設單價編收入（那會編出一個看似精確的出價上限），單價回 null */
        method = 'none';
        conf = 'mid';
        res = { price: null, lo: null, hi: null, r2: null, n: 0, drivers: [], comps: [] };
        srcPrice = lvrLoaded ? '本區與全市查無' + product + '成交' : '實價登錄行情檔尚未載入';
        formula = '尚無單價';
        noteP = lvrLoaded ? '請在「進階假設 → 售價」匯入成交案例或直接輸入單價。'
                          : '行情檔載入後會自動重算；若一直無法載入，請在「進階假設 → 售價」直接輸入單價。';
        notes.push(noteP);
      }
    }

    var price = res.price;
    var premium = isNum(s.presalePremium) ? Math.max(-0.5, Math.min(1, s.presalePremium)) : 0;
    var presalePrice = isNum(price) ? price * (1 + premium) : null;

    /* ---- 車位、去化 ---- */
    var pk = mkt ? mkt.parking(city, district, product) : null;
    var stallPrice = isNum(s.parkingPricePerStall) && s.parkingPricePerStall > 0 ? s.parkingPricePerStall : (pk ? pk.price : null);
    var stallFrom = isNum(s.parkingPricePerStall) && s.parkingPricePerStall > 0 ? '使用者輸入' : (pk ? pk.from : '');
    var stallConf = isNum(s.parkingPricePerStall) && s.parkingPricePerStall > 0 ? 'input' : (pk ? pk.conf : 'low');
    var ab = (mkt && lvrLoaded) ? mkt.absorb(city, district, product) : null;
    var absorbPerMonth = isNum(s.absorbPerMonth) && s.absorbPerMonth > 0 ? s.absorbPerMonth
      : (ab ? ab.perMonth : (isNum(prm.absorbPerMonth) ? prm.absorbPerMonth : 4));
    var absorbFrom = isNum(s.absorbPerMonth) && s.absorbPerMonth > 0 ? '使用者輸入' : (ab ? ab.from : product + '常見去化速度');
    var absorbConf = isNum(s.absorbPerMonth) && s.absorbPerMonth > 0 ? 'input' : (ab ? ab.conf : 'low');

    var sellablePing = num(m5.sellablePing), stalls = num(m5.stalls), units = num(m5.unitsCount);
    var salesRevenue = (sellablePing !== null && isNum(presalePrice)) ? sellablePing * presalePrice : null;
    var parkingRevenue = (salesRevenue !== null && stalls !== null && isNum(stallPrice)) ? stalls * stallPrice : null;
    var totalSales = salesRevenue !== null ? salesRevenue + (parkingRevenue || 0) : null;
    var absorbMonths = (units !== null && absorbPerMonth > 0) ? Math.ceil(units / absorbPerMonth) : null;

    /* ---- 行情對照說明 ---- */
    if (resale && resale.newer) {
      notes.push('對照：本區新成屋（屋齡 5 年內）' + resale.type + '中位數 ' + wan(resale.newer.p50) + '／坪（' + resale.newer.n + ' 筆）'
               + (resale.all ? '，全部成屋中位數 ' + wan(resale.all.p50) + '／坪（屋齡中位數 ' + f(resale.all.ageMed, 0) + ' 年）' : '') + '。');
    }
    if (method !== 'district' && pre && isNum(presalePrice)) {
      notes.push('對照：本區' + product + '預售中位數 ' + wan(pre.point) + '／坪，本案採用 ' + wan(presalePrice)
               + '／坪（' + signPct(presalePrice / pre.point - 1) + '）。');
    }
    if (premium !== 0) notes.push('已加預售溢價 ' + fp(premium, 1) + '。');

    var confSales = conf === 'input' ? 'mid' : conf;
    return {
      method: method,
      n: res.n,
      r2: res.r2,
      unitPricePing: TD.V('m6.unitPricePing', price, conf, srcPrice, formula, noteP),
      loPing: TD.V('m6.loPing', res.lo, conf, srcPrice,
                   method === 'district' ? '本區預售成交第 25 百分位' : '區間下界', '出價請參考下界情境（保守）。'),
      hiPing: TD.V('m6.hiPing', res.hi, conf, srcPrice,
                   method === 'district' ? '本區預售成交第 75 百分位' : '區間上界', '高樓層、景觀戶與大坪數會落在上半部。'),
      presalePricePing: TD.V('m6.presalePricePing', presalePrice, conf, srcPrice,
                   '預售單價 = ' + wan(price) + ' ×（1 ＋ ' + fp(premium, 1) + '）',
                   isPresaleBasis ? '單價本身即為預售成交，預售溢價預設 0%。' : '單價來源非預售成交時，可輸入預售溢價。'),
      salesRevenue: TD.V('m6.salesRevenue', salesRevenue, confSales, '可售坪 × 預售單價',
                   '房地銷售 = 可售坪 ' + f(sellablePing, 1) + ' 坪 × ' + wan(presalePrice) + '／坪', '不含車位。'),
      parkingRevenue: TD.V('m6.parkingRevenue', parkingRevenue, stallConf, stallFrom,
                   '車位收入 = ' + f(stalls, 0) + ' 位 × ' + wan(stallPrice) + '／位', '車位價依本區實價登錄（預售屋附車位或單獨車位交易）。'),
      totalSales: TD.V('m6.totalSales', totalSales, confSales, '房地銷售 ＋ 車位收入',
                   '總銷 = ' + TD.fmt.money(salesRevenue || 0) + ' ＋ ' + TD.fmt.money(parkingRevenue || 0),
                   '帳面總銷（含營業稅），營業稅、代銷與管銷在成本段扣除。'),
      absorbMonths: TD.V('m6.absorbMonths', absorbMonths, absorbConf, absorbFrom,
                   '去化月數 = 戶數 ' + f(units, 0) + ' ÷ 每月 ' + f(absorbPerMonth, 1) + ' 戶（無條件進位）',
                   '以本區同產品預售建案的每月成交速度推估。'),
      drivers: res.drivers,
      comps: res.comps,
      notes: notes,

      compSource: method === 'research' ? srcPrice : (method === 'manual' ? '使用者指定單價'
                  : (source === 'custom' ? '使用者匯入案例' : (pre ? pre.label : '（無）'))),
      compIsSample: false,
      compSkipped: 0,
      priceScope: pre ? pre.scope : '',
      presalePremium: premium,
      absorbPerMonth: absorbPerMonth,
      absorbFrom: absorbFrom,
      parkingPricePerStall: stallPrice,
      parkingFrom: stallFrom,
      subject: subject,
      sellablePing: sellablePing,
      stalls: stalls,
      unitsCount: units,
      product: product,
      research: { items: rsch.items, errors: rsch.errors, priceN: rPrice.length, landN: rLand.length },
      market: { presale: pre, resale: resale, land: land, landLvr: landLvr, parking: pk, absorb: ab, loaded: lvrLoaded,
                meta: lvrLoaded ? lvr.meta(city) : null }
    };
  }

  TD.engine.m6 = m6;
})(window.TD);
