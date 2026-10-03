/* M4 容積獎勵：依基地條件判斷各開發制度可不可行，列舉可行獎勵組合、依法封頂，以淨效益排序並自動採用最佳可行組合。*/
window.TD = window.TD || {};
(function (TD) {
  'use strict';

  TD.engine = TD.engine || {};

  /* ------------------------------------------------------------------
     設計說明（複核者請先讀）

     1. 制度互斥：一般建照 NONE、產業獎勵 IND（工業區立體化）、危老 HR、都更 UR。
        每個制度先檢查前提（分區、屋齡、基地面積、既有建物），不符者列出原因、
        組合仍算出來供比較，但標 feasible:false，不會被自動採用。
     2. 每個獎勵項目的成數：
        固定成數（pct）直接取法定值；依基地條件計算者（綜合設計、TOD、新增投資、
        危老規模、都更規模、建物狀態、原容積）呼叫 TD.data.bonus.calc 算出，
        算出 0 代表本案不適用，連同理由列在 regimes[].items 裡。
     3. 封頂：依制度的 caps 分桶封頂（危老 1.3 倍＋時程規模 10%、都更 1.5 倍、
        綜合設計 1.2 倍、產業獎勵 20%／捐贈 30%／合計 50%、容積移轉 30% 或 40%），
        同桶超過上限時按各項成數比例縮減，被砍掉的部分不計收益也不計取得成本。
     4. 淨效益（未扣土地）＝ 增加可售坪 × 預售單價 ＋ 增加車位收入
                              − 增加樓地板的營建費 − 隨收入比例的軟成本與稅費
                              − 取得成本（容積價購、捐贈樓地板、標章設計增量）
                              − 時程成本（比一般建照多出來的月數 × 估計總投入 × 年利率 ÷ 12）
        容積價購的單價取自實價登錄：同區同分區土地成交中位數 ÷ 容積率 × 0.9。
     5. 自動模式（p.m4.regime = 'AUTO'，預設）：採用「可行、且不含高風險項目」的組合中
        淨效益最高者；淨效益都不為正時採用不申請獎勵的一般建照。
        使用者在排行點選或勾選項目後，改為指定制度與項目。
     6. 純函式：不碰 document、不碰 localStorage、不發任何網路請求。
     ------------------------------------------------------------------ */

  var PCT_DP = 6;
  var EPS = 1e-9;
  var RISK_W = { low: 1, mid: 2, high: 3 };
  var RISK_LABEL = { low: '低', mid: '中', high: '高' };
  var MAX_ITEMS = 12;          /* 單一制度最多列舉 2^12 = 4,096 組 */

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function numOr(v, d) { return isNum(v) ? v : d; }
  function hasOwn(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function isArr(v) { return Object.prototype.toString.call(v) === '[object Array]'; }
  function n(v, d) { return TD.fmt.n(v, d === undefined ? 1 : d); }
  function pct1(v) { return isNum(v) ? (Math.abs(v) >= 10 ? TD.fmt.pct(v, 1) : (v * 100).toFixed(1) + '%') : '—'; }
  function money(v) { return TD.fmt.money(v); }
  function wan(v) { return isNum(v) ? n(v / 1e4, 1) + ' 萬' : '—'; }
  function rnd(v) { return TD.math.round(v, PCT_DP); }

  function lawStr(lawName, article) {
    var nm = lawName ? String(lawName) : '';
    return article ? nm + ' ' + article : nm;
  }

  function normIds(arr) {
    var out = [], i;
    if (!isArr(arr)) return out;
    for (i = 0; i < arr.length; i++) if (typeof arr[i] === 'string' && arr[i] && out.indexOf(arr[i]) < 0) out.push(arr[i]);
    return out;
  }

  function sameSet(a, b) {
    var i, sa, sb;
    if (!a || !b || a.length !== b.length) return false;
    sa = a.slice().sort(); sb = b.slice().sort();
    for (i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false;
    return true;
  }

  /* ---------------- 市場參數：預售單價、土地行情、營建單價（m6 尚未跑時直接讀實價登錄） ---------------- */

  function marketOf(p, ctx, site) {
    var out = { price: null, priceFrom: '', landPerPing: null, landFrom: '', parkingPrice: null };
    var L = TD.data && TD.data.lvr;
    if (ctx.m6 && isNum(TD.raw(ctx.m6.presalePricePing)) && TD.raw(ctx.m6.presalePricePing) > 0) {
      out.price = TD.raw(ctx.m6.presalePricePing);
      out.priceFrom = '收入段採用之預售單價';
      if (isNum(ctx.m6.parkingPricePerStall)) out.parkingPrice = ctx.m6.parkingPricePerStall;
    } else if (L && L.rec && TD.engine.lvrPrice) {
      var pr = TD.engine.lvrPrice(site.city, site.district, site.product);
      if (pr && isNum(pr.p50)) { out.price = pr.p50; out.priceFrom = pr.label; }
      if (pr && isNum(pr.parking)) out.parkingPrice = pr.parking;
    }
    if (!isNum(out.price)) {
      out.price = numOr(TD.data.cost && TD.data.cost.fallbackUnitPricePing, 600000);
      out.priceFrom = '尚無本區實價登錄資料，暫以保守單價試算';
    }
    if (TD.engine.lvrLand) {
      var ld = TD.engine.lvrLand(site.city, site.district, site.zoneCls);
      if (ld && isNum(ld.perPing)) { out.landPerPing = ld.perPing; out.landFrom = ld.label; out.landConf = ld.conf; }
    }
    return out;
  }

  /* ---------------- 主函式 ---------------- */

  function m4(p, ctx) {
    p = p || {};
    ctx = ctx || {};

    var cfg = p.m4 || {};
    var pctOv = cfg.pctOverrides || {};
    var picked = normIds(cfg.picked);
    var wantRegime = cfg.regime ? String(cfg.regime) : 'AUTO';
    var auto = (wantRegime === 'AUTO' || wantRegime === '');
    var notes = [];

    var bd = TD.data && TD.data.bonus;
    var regimes = (bd && bd.regimes) || [];
    var CALC = (bd && bd.calc) || {};
    var cost = TD.data.cost || {};
    var m3 = ctx.m3 || {};
    var site = m3.site || (TD.engine.siteOf ? TD.engine.siteOf(p) : null) || { params: {}, assumed: [] };
    var prm = site.params || {};

    if (!regimes.length) {
      notes.push('容積獎勵目錄未載入，無法列舉組合（請檢查 index.html 是否載入 js/data/bonus.js）。');
      return {
        options: [], best: null, chosen: null, regimes: [],
        pct: TD.V('m4.pct', 0, 'mid', '容積獎勵目錄（未載入）', '獎勵 0%', '目錄未載入，以不申請獎勵計算。'),
        bonusFloorM2: TD.V('m4.bonusFloorM2', 0, 'mid', '容積獎勵目錄（未載入）', '0', ''),
        totalFloorM2: TD.V('m4.totalFloorM2', TD.raw(m3.baseFloorM2), 'mid', '基準容積', '', ''),
        notes: notes
      };
    }

    var base = isNum(TD.raw(m3.baseFloorM2)) && TD.raw(m3.baseFloorM2) > 0 ? TD.raw(m3.baseFloorM2) : 0;
    var siteM2 = isNum(m3.areaM2Used) && m3.areaM2Used > 0 ? m3.areaM2Used : numOr(site.siteM2, 0);
    var bcr = numOr(TD.raw(m3.bcr), 0), far = numOr(TD.raw(m3.far), 0);
    if (!(base > 0)) notes.push('基準容積為 0（基地面積或容積率未填），獎勵樓地板一律為 0。');

    /* ---- 量體與成本參數（與量體段、成本段同一套） ---- */
    var m5in = p.m5 || {};
    var sellRatio = isNum(m5in.sellRatio) && m5in.sellRatio > 0 ? m5in.sellRatio : numOr(prm.sellRatio, 1.2);
    var exemptRatio = isNum(m5in.exemptRatio) && m5in.exemptRatio >= 0 ? m5in.exemptRatio : numOr(prm.exemptRatio, 0.22);
    var mk = marketOf(p, ctx, site);
    var price = mk.price;
    var m7in = p.m7 || {};
    var cityF = cost.cityFactorOf ? cost.cityFactorOf(site.city) : 1;
    var perPingFixed = (isNum(m7in.constructionPerPingOverride) && m7in.constructionPerPingOverride > 0)
      ? m7in.constructionPerPingOverride : null;
    var basePerPing = numOr(cost.construction && cost.construction.basementPerPing, 320000) * cityF;
    var mkt = TD.engine.market;
    var us = mkt ? mkt.unitSize(site.city, site.district, site.product) : null;
    var sr = mkt ? mkt.stallRatio(site.city, site.district, site.product) : null;
    var unitPing = isNum(m5in.avgUnitPing) ? m5in.avgUnitPing : (us ? us.ping : numOr(prm.avgUnitPing, 30));
    var stallRatio = sr ? sr.ratio : numOr(prm.stallsPerUnit, 0.8);
    var perStallM2 = isNum(m5in.basementPerStallM2) ? m5in.basementPerStallM2 : 40;
    var pk59 = TD.data.zoning && TD.data.zoning.parking59 ? TD.data.zoning.parking59.cat[prm.parkingCat || '2'] : null;
    var plate = isNum(TD.raw(m3.buildAreaM2)) ? TD.raw(m3.buildAreaM2) : 0;
    if (site.siteWidth > 0 && site.siteDepth > 0) {
      plate = Math.min(plate, site.siteWidth * Math.max(0, site.siteDepth - numOr(m3.setbackFrontM, 0)));
    }
    var perLevel = numOr(site.siteM2, 0) * Math.min(0.8, numOr(TD.raw(m3.bcr), 0.6) + 0.1);

    /* 整棟概估（與量體段、成本段同一套規則）：用來算「多一份容積」對整棟營建費、地下室與車位的影響 */
    function project(volM2) {
      var gross = volM2 * (1 + exemptRatio);
      var floors = plate > 0 ? Math.ceil(gross / plate) : 12;
      var per = perPingFixed !== null ? perPingFixed
              : (cost.perPingOf ? cost.perPingOf(site.product, floors) : 250000) * cityF;
      var sell = volM2 / TD.PING * sellRatio;
      var units = unitPing > 0 ? Math.floor(sell / unitPing) : 0;
      var legal = (pk59 && volM2 > 0) ? Math.max(0, Math.ceil((volM2 - pk59.exemptM2) / pk59.perM2)) : 0;
      var stalls = Math.max(legal, Math.ceil(units * stallRatio));
      var bm2 = prm.basement === false ? 0 : stalls * perStallM2;
      if (prm.basement !== false && floors >= 6) bm2 = Math.max(bm2, perLevel);
      return { gross: gross, floors: floors, perPing: per, hard: gross / TD.PING * per + bm2 / TD.PING * basePerPing,
               stalls: stalls, sell: sell };
    }
    var proj0 = project(base);
    var hardPerPing = proj0.perPing;
    var soft = cost.soft || {};
    /* 隨收入比例的支出：管銷、廣告銷售、其他稅費與營業稅（房屋部分約占售價四成） */
    var revenueLeak = numOr(soft.sgaRate, 0.03) + numOr(soft.marketingRate, 0.045) + numOr(soft.taxRateOther, 0.008)
                    + 0.4 * numOr(soft.businessTaxRate, 0.05) / (1 + numOr(soft.businessTaxRate, 0.05));
    var designRate = numOr(soft.designRate, 0.03);
    var rate = isNum(m7in.landRate) ? m7in.landRate : numOr(cost.finance && cost.finance.landRate, 0.03);

    /* 容積價購單價（每坪容積樓地板）：同區同分區土地成交中位數 ÷ 容積率。
       查無土地行情時，以預售單價的三成五作為樓地板地價（雙北新案土地成本約占總銷三至四成）。*/
    var landPerFaPing = null, landPerFaFrom = '';
    var byPrice = price * sellRatio * 0.35;
    if (isNum(mk.landPerPing) && far > 0 && mk.landConf !== 'low') {
      landPerFaPing = mk.landPerPing / far;
      landPerFaFrom = mk.landFrom + ' ' + wan(mk.landPerPing) + '／坪 ÷ 容積率 ' + pct1(far);
    } else if (isNum(mk.landPerPing) && far > 0) {
      landPerFaPing = Math.max(mk.landPerPing / far, byPrice);
      landPerFaFrom = '本區土地成交多為小面積交易，取「行情 ÷ 容積率」與「預售單價 × 可售係數 × 35%」之較高者';
    } else {
      landPerFaPing = byPrice;
      landPerFaFrom = '本區查無同分區土地成交，以預售單價 × 可售係數 × 35% 估樓地板地價';
    }

    /* 估計總投入（時程成本的本金）：基準量體營建費 ＋ 土地行情 */
    var landBench = isNum(mk.landPerPing) ? mk.landPerPing * siteM2 / TD.PING : landPerFaPing * base / TD.PING;
    var estInvest = proj0.hard + landBench;

    var calcCtx = {
      siteM2: siteM2, bcr: bcr, far: far, baseFloorM2: base, zoneCls: site.zoneCls, roadWidth: site.roadWidth,
      frontageM: site.frontageM, hrStatus: site.hrStatus, buildingAgeYears: site.buildingAgeYears,
      existingFloorM2: site.existingFloorM2, mrtDistanceM: site.mrtDistanceM, city: site.city,
      urDesignated: !!cfg.urDesignated,
      hardCostEst: proj0.hard
    };

    /* ---- 制度前提 ---- */
    function regimePrereq(rg) {
      var pre = rg.prereq || {}, why = [], warn = [];
      if (pre.zoneCls && site.zoneCls !== pre.zoneCls) why.push('限' + (pre.zoneCls === '工' ? '工業區' : pre.zoneCls) + '（本案為' + (site.zone ? site.zone.name : '未選分區') + '）');
      if (isNum(pre.maxFar) && far > pre.maxFar + EPS) why.push('基準容積率 ' + pct1(far) + ' 超過 ' + pct1(pre.maxFar));
      if (pre.excludeCities && pre.excludeCities.indexOf(site.city) >= 0) why.push(site.city + '未適用本方案');
      if (pre.needBuilding && !(site.buildingAgeYears > 0) && !(site.existingFloorM2 > 0)
          && ['danger', 'lowest', 'old30'].indexOf(site.hrStatus) < 0) {
        why.push('基地上沒有既有合法建築物的資料（左欄「既有建物屋齡」為 0）；素地不適用');
      } else if (isNum(pre.minAgeYears) && site.buildingAgeYears < pre.minAgeYears
                 && ['danger', 'lowest'].indexOf(site.hrStatus) < 0) {
        why.push('既有建物屋齡 ' + n(site.buildingAgeYears, 0) + ' 年未達 ' + pre.minAgeYears + ' 年，且未經評估為危險建築');
      }
      if (isNum(pre.minSiteM2) && siteM2 < pre.minSiteM2) why.push('基地 ' + n(siteM2, 0) + ' ㎡ 未達更新單元常見門檻 ' + pre.minSiteM2 + ' ㎡');
      if (pre.deadline) warn.push('申請期限 ' + pre.deadline.replace(/-/g, '/'));
      if (pre.consent) warn.push(pre.consent);
      return { feasible: why.length === 0, why: why, warn: warn };
    }

    /* ---- 單項成數：覆寫 > 計算 > 法定值 ---- */
    function itemPct(b) {
      var r;
      if (hasOwn(pctOv, b.id) && isNum(pctOv[b.id])) return { pct: Math.max(0, pctOv[b.id]), why: '使用者指定成數', input: true };
      if (b.id === 'TDR' && isNum(cfg.tdrPct) && cfg.tdrPct > 0) return { pct: cfg.tdrPct, why: '使用者指定容積移轉成數', input: true };
      if (b.calc && typeof CALC[b.calc] === 'function') {
        r = CALC[b.calc](calcCtx) || { pct: 0, why: '' };
        return { pct: numOr(r.pct, 0), why: r.why || '', input: false };
      }
      return { pct: numOr(b.pct, 0), why: '法定成數', input: false };
    }

    function itemBlocked(b, rg) {
      var req = b.requires || {};
      if (req.regimes && req.regimes.indexOf(rg.id) < 0) return '僅適用' + req.regimes.join('／');
      if (req.zoneCls && req.zoneCls.indexOf(site.zoneCls) < 0) return '本案分區不適用';
      if (req.cities && req.cities.indexOf(site.city) < 0) return '僅適用' + req.cities.join('、');
      if (req.products && req.products.indexOf(site.product) < 0) return '僅適用' + req.products.join('、') + '產品';
      if (isNum(req.minOwners) && numOr((p.parcel || {}).ownerCount, 1) < req.minOwners) return '更新前門牌戶未達 ' + req.minOwners + ' 戶';
      return '';
    }

    /* ---- 取得成本 ---- */
    function itemCost(b, effPct, totalFloorM2) {
      var faPing = base * effPct / TD.PING, c = 0, basis = '';
      if (b.cost === 'design') {
        var hard = project(totalFloorM2).hard;
        c = hard * numOr(b.costRateOfHard, 0);
        basis = '設計與標章增量 = 估計營建費 ' + money(hard) + ' × ' + pct1(numOr(b.costRateOfHard, 0));
      } else if (b.cost === 'purchase') {
        c = faPing * landPerFaPing * numOr(b.landRatio, 1);
        basis = '容積價購 = 增加容積 ' + n(faPing, 1) + ' 坪 × 樓地板地價 ' + wan(landPerFaPing) + '／坪 × ' + numOr(b.landRatio, 1)
              + '（' + landPerFaFrom + '）';
      } else if (b.cost === 'donate') {
        c = faPing * (1 + exemptRatio) * hardPerPing * numOr(b.buildRatio, 1);
        basis = '捐贈樓地板 = 獎勵容積 ' + n(faPing, 1) + ' 坪 ×（1＋免計 ' + pct1(exemptRatio) + '）× 營建單價 '
              + wan(hardPerPing) + '／坪 × ' + numOr(b.buildRatio, 1) + '（多蓋一份送一份）';
      } else {
        basis = '無直接取得成本（代價見「取捨」）';
      }
      return { amount: c, basis: basis };
    }

    /* ---- 一個組合 ---- */
    function buildOption(rg, sel, pre) {
      var caps = rg.caps || {}, sums = {}, i, b, bk, raw = [], scale = {}, capped = false, capParts = [];
      for (i = 0; i < sel.length; i++) {
        b = sel[i].b; bk = b.bucket || 'reg';
        sums[bk] = (sums[bk] || 0) + sel[i].pct;
        raw.push({ b: b, pct: sel[i].pct, why: sel[i].why, input: sel[i].input, bucket: bk });
      }
      /* 1) 分桶封頂（容積移轉在都更地區上限 40%） */
      var effSum = {}, k, cap, total = 0, rawTotal = 0;
      for (k in sums) {
        if (!hasOwn(sums, k)) continue;
        cap = hasOwn(caps, k) ? caps[k] : null;
        if (k === 'reg' && rg.id === 'HR' && site.existingFloorM2 > 0 && base > 0) {
          cap = Math.max(cap, site.existingFloorM2 * 1.15 / base - 1);   /* 1.3 倍基準容積或 1.15 倍原建築容積 */
        }
        effSum[k] = (cap === null || cap === undefined) ? sums[k] : Math.min(sums[k], cap);
        if (effSum[k] < sums[k] - EPS) {
          capped = true;
          capParts.push(bucketName(k) + '合計 ' + pct1(sums[k]) + ' 超過上限 ' + pct1(cap) + '，已封頂');
        }
        rawTotal += sums[k];
      }
      /* 2) 制度總額上限（產業獎勵含容積移轉合計 50%） */
      for (k in effSum) if (hasOwn(effSum, k)) total += effSum[k];
      if (isNum(caps.total) && total > caps.total + EPS) {
        var f = caps.total / total;
        for (k in effSum) if (hasOwn(effSum, k)) effSum[k] *= f;
        capParts.push('獎勵合計 ' + pct1(total) + ' 超過制度總額上限 ' + pct1(caps.total) + '，已等比例縮減');
        capped = true;
        total = caps.total;
      }
      for (k in sums) if (hasOwn(sums, k)) scale[k] = sums[k] > EPS ? effSum[k] / sums[k] : 0;

      total = rnd(total);
      var bonusFloor = base * total, totalFloor = base * (1 + total);
      var items = [], costTotal = 0, months = numOr(rg.baseMonths, 0), wsum = 0, wacc = 0, maxRisk = 'low', tdrEff = 0;
      for (i = 0; i < raw.length; i++) {
        b = raw[i].b;
        var eff = rnd(raw[i].pct * scale[raw[i].bucket]);
        var c = itemCost(b, eff, totalFloor);
        costTotal += c.amount;
        months += numOr(b.monthsAdd, 0);
        wsum += eff; wacc += eff * (RISK_W[b.risk] || 2);
        if ((RISK_W[b.risk] || 2) > (RISK_W[maxRisk] || 1)) maxRisk = b.risk;
        if (raw[i].bucket === 'tdr') tdrEff += eff;
        items.push({
          id: b.id, name: b.name, pct: eff, pctRaw: rnd(raw[i].pct), pctWhy: raw[i].why, pctInput: raw[i].input,
          bucket: raw[i].bucket, costType: b.cost || 'none', costTotal: c.amount, costBasis: c.basis,
          monthsAdd: numOr(b.monthsAdd, 0), risk: b.risk || 'mid', riskLabel: RISK_LABEL[b.risk] || '中',
          law: lawStr(b.lawName, b.article), lawName: b.lawName || '', article: b.article || '',
          tradeoff: b.tradeoff || '', note: b.note || '',
          gainPing: base * eff / TD.PING * sellRatio
        });
      }

      /* 淨效益（未扣土地）：整棟有獎勵與沒獎勵兩種量體相減 */
      var gainFaPing = bonusFloor / TD.PING;
      var gainSellPing = gainFaPing * sellRatio;
      var proj1 = project(totalFloor);
      var parkAdd = (proj1.stalls - proj0.stalls) * numOr(mk.parkingPrice, 0);
      var revenue = gainSellPing * price + parkAdd;
      var hardAdd = (proj1.hard - proj0.hard) * (1 + designRate);
      var leak = revenue * revenueLeak;
      var extraMonths = Math.max(0, months - 12);
      var timeCost = extraMonths * (estInvest + costTotal) * rate / 12;
      var netGain = revenue - hardAdd - leak - costTotal - timeCost;
      var itemRisk = wsum > EPS ? wacc / wsum : 0;

      return {
        id: rg.id + ':' + (items.length ? items.map(function (x) { return x.id; }).join('+') : 'BASE'),
        regimeId: rg.id, regimeName: rg.name, regimeLaw: lawStr(rg.lawName, rg.article),
        itemIds: items.map(function (x) { return x.id; }), items: items,
        pctRaw: rnd(rawTotal), pct: total, capped: capped,
        capNote: capParts.length ? capParts.join('；') + '。被砍掉的部分不計收益也不計取得成本。' : '',
        tdrPct: rnd(tdrEff), regimePct: rnd(total - tdrEff), outsidePct: 0, outsideNote: '',
        bonusFloorM2: bonusFloor, totalFloorM2: totalFloor,
        gainPing: gainSellPing, gainPingForCost: gainFaPing,
        revenue: revenue, hardAdd: hardAdd, leak: leak, costTotal: costTotal,
        baseMonths: numOr(rg.baseMonths, 0), itemMonthsAdd: months - numOr(rg.baseMonths, 0), monthsAdd: months,
        timeCost: timeCost, estTotalCost: estInvest + costTotal, netGain: netGain,
        floors: proj1.floors, stallsAdd: proj1.stalls - proj0.stalls, parkAdd: parkAdd,
        riskScore: TD.math.round((RISK_W[rg.baseRisk] || 2) + itemRisk, 2), maxItemRisk: maxRisk,
        riskLabel: '制度 ' + (RISK_LABEL[rg.baseRisk] || '中') + '／獎勵 ' + (itemRisk > 0 ? (itemRisk < 1.5 ? '低' : itemRisk < 2.5 ? '中' : '高') : '無'),
        feasible: pre.feasible, prereqNotes: pre.why.concat(pre.warn), infeasibleWhy: pre.why
      };
    }

    function bucketName(k) {
      return { reg: '制度型獎勵', extra: '時程與規模獎勵', open: '綜合設計', tod: 'TOD 增額容積', tdr: '容積移轉',
               ind: '產業獎勵（投資、能源、總部）', indDon: '捐贈產業空間' }[k] || k;
    }

    /* ---- 逐制度列舉 ---- */
    var options = [], regimeSummary = [], r, rg, pre, i, j;
    for (r = 0; r < regimes.length; r++) {
      rg = regimes[r];
      pre = regimePrereq(rg);
      var allows = rg.allows || [], elig = [], itemRows = [];
      for (i = 0; i < allows.length; i++) {
        var b = bd.bonusById(allows[i]);
        if (!b) continue;
        var blocked = itemBlocked(b, rg);
        var ip = blocked ? { pct: 0, why: blocked, input: false } : itemPct(b);
        var ok = !blocked && ip.pct > EPS;
        itemRows.push({ id: b.id, name: b.name, pct: rnd(ip.pct), applicable: ok, why: ip.why || blocked,
                        risk: b.risk, riskLabel: RISK_LABEL[b.risk] || '中', law: lawStr(b.lawName, b.article),
                        tradeoff: b.tradeoff || '', note: b.note || '' });
        if (ok) elig.push({ b: b, pct: ip.pct, why: ip.why, input: ip.input });
      }
      if (elig.length > MAX_ITEMS) elig = elig.slice(0, MAX_ITEMS);
      var total = 1 << elig.length, mask, bit, sel, rOpts = [];
      for (mask = 0; mask < total; mask++) {
        sel = [];
        for (bit = 0; bit < elig.length; bit++) if (mask & (1 << bit)) sel.push(elig[bit]);
        rOpts.push(buildOption(rg, sel, pre));
      }
      for (j = 0; j < rOpts.length; j++) options.push(rOpts[j]);
      regimeSummary.push({ id: rg.id, name: rg.name, feasible: pre.feasible, why: pre.why, warn: pre.warn,
                           note: rg.note || '', law: lawStr(rg.lawName, rg.article), items: itemRows,
                           baseMonths: numOr(rg.baseMonths, 0), caps: rg.caps || {} });
      if (!pre.feasible && rg.id !== 'NONE') {
        notes.push('「' + rg.name + '」不可行：' + pre.why.join('；') + '。');
      }
    }

    /* 排序：可行優先 → 淨效益高 → 風險低 → 月數短 */
    options.sort(function (a, b2) {
      if (a.feasible !== b2.feasible) return a.feasible ? -1 : 1;
      if (Math.abs(b2.netGain - a.netGain) > 1) return b2.netGain - a.netGain;
      if (a.riskScore !== b2.riskScore) return a.riskScore - b2.riskScore;
      return a.monthsAdd - b2.monthsAdd;
    });

    /* best：可行、不含高風險項目、淨效益最高；都不為正時取一般建照不申請獎勵 */
    var best = null, baseline = null;
    for (i = 0; i < options.length; i++) {
      if (options[i].id === 'NONE:BASE') baseline = options[i];
      if (!best && options[i].feasible && options[i].maxItemRisk !== 'high') best = options[i];
    }
    if (best && best.netGain <= 0 && baseline) best = baseline;
    if (!best) best = baseline || options[0] || null;

    var chosen = null;
    if (!auto) {
      for (i = 0; i < options.length; i++) {
        if (options[i].regimeId === wantRegime && sameSet(options[i].itemIds, picked)) { chosen = options[i]; break; }
      }
      if (!chosen) {
        notes.push('指定的組合（' + wantRegime + '：' + (picked.length ? picked.join('、') : '不申請獎勵')
                 + '）在本案條件下不成立（項目不適用或成數為 0），已改用自動選出的最佳組合。');
      }
    }
    if (!chosen) chosen = best;

    if (chosen && !chosen.feasible) {
      notes.push('目前指定的「' + chosen.regimeName + '」前提不成立：' + chosen.infeasibleWhy.join('；')
               + '。下游量體與出價以此組合試算，僅供比較，不能據以出價。');
    }
    if (chosen && best && chosen !== best && best.netGain - chosen.netGain > 1) {
      notes.push('目前採用的組合淨效益 ' + money(chosen.netGain) + '，低於自動最佳組合「' + best.regimeName + '：'
               + (best.itemIds.length ? best.itemIds.join('＋') : '不申請獎勵') + '」的 ' + money(best.netGain) + '。');
    }
    notes.push('淨效益已扣除增加樓地板的營建費、隨收入比例的管銷廣告稅費、取得成本與多出來的審議月數利息；'
             + '預售單價 ' + wan(price) + '／坪（' + mk.priceFrom + '），營建單價 ' + wan(hardPerPing) + '／坪。');

    /* ---- 對外 V 值 ---- */
    var cPct = chosen ? chosen.pct : 0;
    var anyInput = false;
    if (chosen) for (i = 0; i < chosen.items.length; i++) if (chosen.items[i].pctInput) anyInput = true;
    var conf = anyInput ? 'input' : 'mid';
    var srcStr = chosen ? chosen.regimeLaw + (chosen.itemIds.length ? '；' + chosen.items.map(function (x) { return x.law; }).join('；') : '') : '';
    var how = auto ? '自動採用可行組合中淨效益最高者' : '使用者指定';
    var pctFormula = chosen
      ? (chosen.items.length
        ? chosen.items.map(function (x) { return x.name + ' ' + pct1(x.pct); }).join(' ＋ ') + ' ＝ ' + pct1(cPct)
          + (chosen.capped ? '（封頂前 ' + pct1(chosen.pctRaw) + '）' : '')
        : '不申請容積獎勵（' + chosen.regimeName + '）')
      : '';
    var pctNote = how + '。成數為法規所定額度，實際核給以主管機關審議為準'
                + (chosen && chosen.capped ? '；' + chosen.capNote : '') + '。';

    return {
      options: options,
      best: best,
      chosen: chosen,
      regimes: regimeSummary,
      auto: auto,
      pct: TD.V('m4.pct', cPct, conf, srcStr || '不申請容積獎勵', pctFormula, pctNote),
      bonusFloorM2: TD.V('m4.bonusFloorM2', base * cPct, conf, srcStr || '不申請容積獎勵',
                         '獎勵樓地板 = 基準容積 ' + n(base, 1) + ' ㎡ × ' + pct1(cPct),
                         '約 ' + n(base * cPct / TD.PING, 1) + ' 坪。' + pctNote),
      totalFloorM2: TD.V('m4.totalFloorM2', base * (1 + cPct), conf, srcStr || '基準容積',
                         '容積樓地板合計 = 基準容積 ' + n(base, 1) + ' ㎡ ×（1 ＋ ' + pct1(cPct) + '）',
                         '僅為容積樓地板，不含陽台、梯廳、機電與停車等免計容積；總樓地板與可售坪見量體段。'),
      notes: notes,

      unitPricePingUsed: price,
      unitPriceFrom: mk.priceFrom,
      landPerFaPing: landPerFaPing,
      landPerFaFrom: landPerFaFrom,
      hardPerPingUsed: hardPerPing,
      sellRatioUsed: sellRatio,
      baseFloorM2Used: base,
      tdrCapOfBase: (TD.data.bonus._meta || {}).tdrCapOfBase,
      optionCount: options.length,
      chosenIsBest: !!(chosen && best && chosen === best),
      topOptions: options.slice(0, 3)
    };
  }

  TD.engine.m4 = m4;
})(window.TD);
