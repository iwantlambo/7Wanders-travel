/* M8 財務回推：以月現金流與二分法，從報酬目標反解土地出價上限（走人價）與建議出價，並與本區土地成交行情比較，附敏感度、損益兩平、情境與壓力測試。 */
window.TD = window.TD || {};
(function (TD) {
  'use strict';

  TD.engine = TD.engine || {};

  var PING = TD.PING || 3.3057851239669;
  var SRC = '月現金流回推（輸入：量體段可售坪與車位、收入段實價登錄單價、成本段 2026 年營建行情與融資條件）';

  /* ---- 小工具 ---- */
  function raw(x) { return TD.raw ? TD.raw(x) : x; }

  function num(x, dflt) {
    var v = raw(x);
    if (v === null || v === undefined || v === '') return dflt;
    v = Number(v);
    return isFinite(v) ? v : dflt;
  }

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  function fn(v, d) { return TD.fmt ? TD.fmt.n(v, d) : String(v); }
  function fmoney(v) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    return TD.fmt ? TD.fmt.money(v) : String(v);
  }
  function fpct(v, d) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    return TD.fmt ? TD.fmt.pct(v, d === undefined ? 2 : d) : String(v * 100) + '%';
  }
  function zeros(n) { var a = [], i; for (i = 0; i < n; i++) a.push(0); return a; }

  /* 逐期折現的 NPV：與 TD.math.npv 同義，但用連乘代替 Math.pow。
     m8 的求解要跑上千次現金流，這裡是熱點，差別在使用者感覺得到的重算延遲。 */
  function npvFast(r, flows) {
    var s = 0, df = 1, i, k = 1 / (1 + r);
    if (!isFinite(k)) return NaN;
    for (i = 0; i < flows.length; i++) { s += flows[i] * df; df *= k; }
    return isFinite(s) ? s : NaN;
  }

  /* ------------------------------------------------------------------
     月報酬率：先用契約指定的 TD.math.irrMonthly，並驗算 NPV 是否真的歸零。
     開發案的現金流常是「前段大額流出 → 交屋月大額流入 → 末段小額流出
     （餘屋管銷、利潤稅）」。末期為負會讓 NPV 在 −99% 與 +100% 兩端同號，
     irrMonthly 因此回 null（不是沒有解，是固定區間夾不到）。
     這時自己找根：NPV(0) > 0 就往正的方向找第一個變號點（開發案有意義的
     報酬率必在 0 以上）；NPV(0) ≤ 0 才往負的方向找。折現率趨近 −100% 時
     末期負值被放大所產生的那個數學根不是報酬率，一律不取。
     只變號一次的正常現金流，兩種解法會得到同一個值，不會跳動。
     ------------------------------------------------------------------ */
  function irrOfFlows(flows) {
    var i, scale = 0, chk, r, step, prevR, prev, cur, lo = null, hi = null, x;
    for (i = 0; i < flows.length; i++) scale += Math.abs(flows[i]);
    if (!(scale > 0)) return null;

    var mr = TD.math.irrMonthly(flows);
    if (mr !== null && isFinite(mr) && mr > -0.999) {
      chk = npvFast(mr, flows);
      if (isFinite(chk) && Math.abs(chk) < scale * 1e-6) return mr;   // 驗算通過才採用
    }

    var n0 = npvFast(0, flows);
    if (!isFinite(n0)) return null;
    if (n0 === 0) return 0;

    prevR = 0; prev = n0; step = 0.005;
    if (n0 > 0) {
      for (i = 0; i < 90; i++) {                 // 往上找：步長逐步放大，通常十幾步就夾到
        r = prevR + step; step *= 1.3;
        cur = npvFast(r, flows);
        if (!isFinite(cur)) break;
        if (prev * cur < 0) { lo = prevR; hi = r; break; }
        prevR = r; prev = cur;
      }
    } else {
      for (i = 0; i < 90; i++) {                 // 往下找：報酬率為負的情形
        r = prevR - step; step *= 1.2;
        if (r <= -0.999) break;
        cur = npvFast(r, flows);
        if (!isFinite(cur)) break;
        if (prev * cur < 0) { lo = r; hi = prevR; break; }
        prevR = r; prev = cur;
      }
    }
    if (lo === null) return null;
    x = TD.math.bisect(function (rr) { return npvFast(rr, flows); }, lo, hi, 0, 60);
    return (x === null || !isFinite(x)) ? null : x;
  }

  /* 敏感度五項的固定定義（id 不可改）。lo／hi 是「參數的變動量」，不是結果。 */
  function sensDefs() {
    return [
      { id: 'price', label: '售價', unit: '%', lo: -0.10, hi: 0.10,
        mk: function (d) { return { priceMul: 1 + d }; },
        desc: '售價 ±10%，重算出價上限' },
      { id: 'cost', label: '營建成本', unit: '%', lo: -0.10, hi: 0.10,
        mk: function (d) { return { costMul: 1 + d }; },
        desc: '營建成本 ±10%（成本上升會壓低出價上限，所以 loCap 大於 hiCap）' },
      { id: 'rate', label: '利率', unit: '個百分點', lo: -0.01, hi: 0.01,
        mk: function (d) { return { rateAdd: d }; },
        desc: '土融與建融利率同時 ±1 個百分點' },
      { id: 'schedule', label: '工期', unit: '個月', lo: -6, hi: 6,
        mk: function (d) { return { monthsAdd: d }; },
        desc: '施工期 ±6 個月（交屋月與計息期間一併位移）' },
      { id: 'absorb', label: '去化速度', unit: '%', lo: -0.30, hi: 0.30,
        mk: function (d) { return { absorbMul: 1 + d }; },
        desc: '月銷戶數 ±30%（影響收款時點與利息，不影響總銷）' }
    ];
  }

  function emptySens() {
    var defs = sensDefs(), out = [], i;
    for (i = 0; i < defs.length; i++) {
      out.push({ id: defs[i].id, label: defs[i].label, unit: defs[i].unit,
                 lo: defs[i].lo, hi: defs[i].hi, loCap: null, hiCap: null, swing: null,
                 note: '無法求解，' + defs[i].desc });
    }
    return out;
  }

  /* 壓力測試四項的固定定義（id 不可改）。opts 直接餵給 run()，一律真的重算，不做線性外推。 */
  function stressDefs() {
    return [
      { id: 'rate', label: '利率 +2 個百分點', delta: '+0.02（土融與建融同時）', o: { rateAdd: 0.02 } },
      { id: 'price', label: '售價 −15%', delta: '×0.85', o: { priceMul: 0.85 } },
      { id: 'schedule', label: '工期 +9 個月', delta: '+9 個月（交屋月與計息期間一併後移）', o: { monthsAdd: 9 } },
      { id: 'absorb', label: '去化 −40%', delta: '×0.60（月銷戶數）', o: { absorbMul: 0.6 } }
    ];
  }

  /* 判定門檻為本系統自訂，不是銀行授信準則：
       不通過：稅後淨利率 ≤ 0，或 IRR 無解／為負
       警示  ：淨利率或年化 IRR 低於目標值的一半
       通過  ：其餘 */
  var STRESS_RULE = '不通過：稅後淨利率 ≤ 0 或年化 IRR 無解／為負；'
                  + '警示：淨利率或年化 IRR 低於目標值的一半；其餘為通過。門檻為本系統自訂。';

  function verdictOf(margin, irr, targetMargin, targetIrr) {
    if (margin === null || margin <= 0) return '不通過';
    if (irr === null || irr < 0) return '不通過';
    if (margin < targetMargin / 2) return '警示';
    if (irr < targetIrr / 2) return '警示';
    return '通過';
  }

  function emptyStress(reason) {
    var defs = stressDefs(), out = [], i;
    for (i = 0; i < defs.length; i++) {
      out.push({ id: defs[i].id, label: defs[i].label, delta: defs[i].delta,
                 margin: null, irr: null, verdict: '無法判定', note: reason });
    }
    return out;
  }

  /* 前置條件不足時的降級輸出：欄位齊全、數值一律 null，絕不回 NaN。 */
  function degraded(reason) {
    function nullV(key) { return TD.V(key, null, 'mid', SRC, '無法計算', reason); }
    return {
      landCap: nullV('m8.landCap'),
      landCapPerPing: nullV('m8.landCapPerPing'),
      landCapByIrr: null,
      landCapByMargin: null,
      irrAtCap: nullV('m8.irrAtCap'),
      marginAtCap: nullV('m8.marginAtCap'),
      profitAtCap: nullV('m8.profitAtCap'),
      cashflow: [],
      sensitivity: emptySens(),
      stress: emptyStress(reason),
      walkAway: null,
      bidTarget: nullV('m8.bidTarget'),
      bidTargetPerPing: null,
      bidFrom: '無法計算',
      bidIrrTarget: null,
      bidStatus: null,
      benchmark: null,
      stressRule: STRESS_RULE,
      breakeven: {
        priceDropPct: nullV('m8.bePriceDrop'),
        costRisePct: nullV('m8.beCostRise'),
        rateRisePct: nullV('m8.beRateRise')
      },
      scenarios: [
        { id: 'opt', label: '樂觀', landCap: null, irr: null, margin: null, selected: false, note: reason },
        { id: 'base', label: '基準', landCap: null, irr: null, margin: null, selected: true, note: reason },
        { id: 'con', label: '保守', landCap: null, irr: null, margin: null, selected: false, note: reason }
      ],
      notes: [reason],
      cashflowCols: [],
      targets: null, schedule: null, atCap: null
    };
  }

  /* ==================================================================
     prepare(p, ctx)：把 m5／m6／m7 的結果收斂成一組財務參數，並回傳
     run(L, opts) 月現金流函式與求解器。
     另掛在 TD.engine.m8prepare，供外部（UI 與測試）以同一份現金流重算用
     （這樣 ctx 內只放純資料，不放函式）。
     ================================================================== */
  function prepare(p, ctx) {
    p = p || {};
    ctx = ctx || {};
    var setupNotes = [];
    var m7r = ctx.m7 || {};
    var m5 = ctx.m5 || {};
    var m6 = ctx.m6 || {};
    var m8p = p.m8 || {};

    if (!m7r.raws || !m7r.params || !m7r.schedule) {
      return { ok: false, reason: 'ctx.m7 沒有可用的成本結果（raws／params／schedule 缺一），'
        + '無法回推土地價。請先確認 m7 成本模型跑得出來。' };
    }
    var rw = m7r.raws, par = m7r.params, sch = m7r.schedule;

    /* ---- 售價與總銷 ---- */
    /* 總銷一律只認 m6 的輸出。
       m7 的 salesBasis 有一條「回落粗估」路徑（m6 沒給總銷時，用 TD.data.cost 的保守單價
       乘可售坪），那條路徑是為了讓**成本表**的管銷與廣告銷售有個基數，不是為了餵給 m8。
       m8 若拿它回推出價上限，等於用一個種子預設單價編出收入，再從編出來的收入算出
       一個看起來很精確的土地出價上限 —— 這正是原則一（不對稱精度陷阱）禁止的事：
       m6 明講「沒有可用樣本，本模組拒絕估算單價」時，m8 也必須拒絕，回 null 並說明原因，
       而不是替它生一個數字。 */
    var totalSales = num(m6.totalSales, null);
    if (totalSales === null || !(totalSales > 0)) {
      var why = '';
      if (!ctx.m6 || m6.error) {
        why = 'ctx.m6 收入模型沒有產出（' + (m6.error || '模組未執行') + '）';
      } else if (num(m6.unitPricePing, null) === null) {
        why = 'ctx.m6 判定沒有可用的比較案例，已明確拒絕估算單價';
      } else {
        why = 'ctx.m6.totalSales 為 ' + String(m6.totalSales === undefined ? 'undefined' : TD.raw(m6.totalSales));
      }
      return { ok: false, reason: '沒有可採信的總銷（' + why + '），因此不回推土地出價上限。'
        + 'm7 的成本表另有一條用保守單價的回落估算，那是為了讓管銷與廣告銷售有基數，'
        + '不可拿來當收入回推出價：那會用一個種子預設單價編出收入，再從編出來的收入'
        + '算出一個看起來很精確的出價上限。請先匯入實價登錄比較案例，'
        + '或在 m6.manualUnitPricePing 直接輸入你自己負責的單價。' };
    }
    if (m7r.salesBasis && m7r.salesBasis.estimated) {
      setupNotes.push('注意：m7 成本表裡的管銷與廣告銷售是用回落粗估的總銷算的，'
        + '與 m8 這裡採用的 m6 總銷不是同一個數字，成本面因此偏離，請以 m6 產出後重算為準。');
    }

    /* ---- 戶數與去化 ---- */
    var units = num(m5.unitsCount, null);
    if (units === null || units <= 0) {
      var sellablePing = num(m5.sellablePing, 0);
      var avgUnit = num(p.m5 && p.m5.avgUnitPing, 35);
      units = avgUnit > 0 ? Math.round(sellablePing / avgUnit) : 0;
      if (!(units > 0)) units = 1;
      setupNotes.push('ctx.m5.unitsCount 不可用，戶數以可售坪 ÷ 平均單坪推估為 ' + units
        + ' 戶；去化曲線因此只是形狀正確，數量未經量體確認。');
    }
    var absorbPerMonth = num(m6.absorbPerMonth, num(p.m6 && p.m6.absorbPerMonth, 4));
    if (!(absorbPerMonth > 0)) {
      absorbPerMonth = 4;
      setupNotes.push('每月去化戶數不是正數，已回落為每月 4 戶。');
    }

    /* ---- 成本與財務參數（一律取自 m7，確保兩個模組用同一組數字）---- */
    var curveBase = num(rw.conAbove, 0) + num(rw.conBasement, 0);   // 依 S 曲線攤的營建
    var demoCost = num(rw.demolition, 0);                            // 拆除落在開工第一個月
    var bonusCost = num(rw.bonusCost, 0);                            // 容積獎勵取得成本
    var designRate = num(par.designRate, 0.025);
    var sgaRate = num(par.sgaRate, 0.03);
    var marketingRate = num(par.marketingRate, 0.05);
    var taxRateOther = num(par.taxRateOther, 0.01);
    var profitTaxRate = num(par.profitTaxRate, 0.20);
    var businessTaxRate = num(par.businessTaxRate, 0.05);
    var housePortion = num(par.housePortion, 0.35);
    var landLTV = num(par.landLTV, 0.5);
    var landRate = num(par.landRate, 0.028);
    var constLTV = num(par.constLTV, 0.7);
    var constRate = num(par.constRate, 0.026);

    var planMonths = Math.max(0, Math.round(num(sch.planMonthsEff, num(sch.planMonths, 12))));
    var buildMonthsBase = Math.max(1, Math.round(num(sch.buildMonths, 30)));
    var handoverMonths = Math.max(0, Math.round(num(sch.handoverMonths, 6)));
    var presaleStart = Math.max(0, Math.round(num(sch.presaleStartEff, num(sch.presaleStartMonth, 9))));

    /* 未受任何衝擊的時程長度，只用來把管銷總額換算成月費率（見 run 內的 sgaPerMonth） */
    var baseHorizon = planMonths + buildMonthsBase + handoverMonths + 1;

    /* 報酬門檻不得為負：負門檻等於「允許賠錢買地」，會讓 landCap 超過
       「總銷 − 總成本」，建議出一個必然虧損的價格。夾到 0 並寫進 notes。 */
    var targetIrrRaw = num(m8p.targetIrr, 0.15);
    var targetMarginRaw = num(m8p.targetMargin, 0.15);
    var targetIrr = targetIrrRaw < 0 ? 0 : targetIrrRaw;
    var targetMargin = targetMarginRaw < 0 ? 0 : targetMarginRaw;
    if (targetIrr !== targetIrrRaw) {
      setupNotes.push('p.m8.targetIrr 為負（' + fpct(targetIrrRaw, 2)
        + '），已夾為 0%。負的報酬門檻等於允許賠錢買地，出價上限會超過「總銷 − 總成本」。');
    }
    if (targetMargin !== targetMarginRaw) {
      setupNotes.push('p.m8.targetMargin 為負（' + fpct(targetMarginRaw, 2)
        + '），已夾為 0%。負的淨利率門檻等於允許賠錢買地。');
    }

    /* ----------------------------------------------------------------
       月現金流。opts 可調：priceMul 售價、costMul 營建成本、
       rateAdd 利率加點、monthsAdd 工期增減、absorbMul 去化速度。
       符號：流出為負、流入為正。
       土融與建融的動撥與清償都在流量裡淨額處理，所以 net 是權益現金流，
       Σnet 恰等於稅後淨利（本金一借一還相消），IRR 因此是權益 IRR。
       ---------------------------------------------------------------- */
    var curveCache = {};
    function curveFor(n) {                       // 同一工期的 S 曲線只算一次
      var k = 'n' + n;
      if (!curveCache[k]) curveCache[k] = TD.math.sCurve(n);
      return curveCache[k];
    }

    function run(L, o, skipIrr) {
      o = o || {};
      L = num(L, 0);
      var priceMul = num(o.priceMul, 1);
      var costMul = num(o.costMul, 1);
      var rateAdd = num(o.rateAdd, 0);
      var monthsAdd = num(o.monthsAdd, 0);
      var absorbMul = num(o.absorbMul, 1);

      var build = Math.max(1, Math.round(buildMonthsBase + monthsAdd));
      var completionM = planMonths + build;               // 完工月（取得使照）
      /* 交屋結案月：完工之後還要驗屋、對保、辦貸與過戶，尾款 85% 收在這個月。
         handoverMonths 的語意與 js/data/cost.js 一致（完工到交屋結案期），
         交屋期越長，尾款收得越晚、利息壓越久，出價上限必須下降。 */
      var doneM = completionM + handoverMonths;
      var horizon = doneM + 1;                            // 陣列長度，含第 0 月
      var R = totalSales * priceMul;

      var hardSpread = curveBase * costMul;
      var demoC = demoCost * costMul;
      var design = (hardSpread + demoC) * designRate;
      /* 管銷是「每月固定費率 × 月數」，不是一筆總額往後攤。
         若寫成總額 ÷ horizon，工期一拉長只是把同一筆錢往後遞延，
         NPV 反而變好、IRR 上升，工期敏感度會出現錯誤的方向。
         基準月費率以未受衝擊的時程（baseHorizon）反推，
         因此基準情境下 sga 總額仍等於 m7 的 totalSales × sgaRate，兩模組不打架。 */
      var sgaPerMonth = baseHorizon > 0 ? (R * sgaRate) / baseHorizon : 0;
      var sga = sgaPerMonth * horizon;
      var marketing = R * marketingRate;
      /* 其他稅費規費 ＋ 營業稅（只就房屋部分課徵，售價含稅） */
      var businessTax = R * housePortion * businessTaxRate / (1 + businessTaxRate);
      var taxOther = R * taxRateOther + businessTax;

      var conSpend = zeros(horizon), softOut = zeros(horizon), taxOut = zeros(horizon);
      var salesIn = zeros(horizon), landFlow = zeros(horizon), conFlow = zeros(horizon);
      var interest = zeros(horizon);
      var i, m, frac;

      /* 營建支出：S 曲線動撥，拆除全部在開工第一個月 */
      var curve = curveFor(build);
      for (i = 0; i < build; i++) {
        conSpend[planMonths + i] += curve[i] * hardSpread + (i === 0 ? demoC : 0);
      }

      /* 設計監造：四成攤在規劃請照期，六成隨施工進度 */
      if (planMonths > 0) {
        for (i = 0; i < planMonths; i++) softOut[i] += design * 0.4 / planMonths;
      } else {
        softOut[0] += design * 0.4;
      }
      for (i = 0; i < build; i++) softOut[planMonths + i] += curve[i] * design * 0.6;

      /* 容積獎勵取得成本：攤在請照前（容積移轉須於申請建照前完成） */
      if (bonusCost > 0) {
        if (planMonths > 0) {
          for (i = 0; i < planMonths; i++) softOut[i] += bonusCost / planMonths;
        } else {
          softOut[0] += bonusCost;
        }
      }

      /* 管銷：每月固定費率，攤在全期（總額已隨月數等比放大） */
      for (m = 0; m < horizon; m++) softOut[m] += sgaPerMonth;

      /* 去化與收款：簽約月收 15%（訂簽開），交屋月收其餘 85%；交屋後才成交者一次收足 */
      var perMonth = Math.max(0.05, absorbPerMonth * absorbMul);
      var start = Math.max(0, Math.min(horizon - 1, presaleStart));
      var ab = TD.math.absorption(units, perMonth, start, horizon);
      var sold = ab.curve.slice();
      var unsold = num(ab.unsold, 0);
      if (unsold > 0) sold[horizon - 1] += unsold;    // 期末仍未完銷者一律認在最後一個月（見 notes）
      for (m = 0; m < horizon; m++) {
        if (!sold[m]) continue;
        frac = sold[m] / units;
        softOut[m] += marketing * frac;               // 廣告銷售隨簽約進度付
        if (m <= doneM) {
          salesIn[m] += R * frac * 0.15;
          salesIn[doneM] += R * frac * 0.85;
        } else {
          salesIn[m] += R * frac;
        }
      }

      /* 其他稅費規費隨收款進度 */
      for (m = 0; m < horizon; m++) taxOut[m] += R > 0 ? taxOther * (salesIn[m] / R) : 0;

      /* 土地與融資：t0 付自備款，土融按月計息、交屋月清償；建融隨動撥計息、交屋月清償 */
      var landBal = L * landLTV;
      var constBal = 0, draw, iLand, iCon;
      landFlow[0] -= L * (1 - landLTV);
      for (m = 0; m < horizon; m++) {
        draw = conSpend[m] * constLTV;
        if (conSpend[m] > 0) conFlow[m] -= (conSpend[m] - draw);
        iLand = landBal * (landRate + rateAdd) / 12;
        iCon = (constBal + draw / 2) * (constRate + rateAdd) / 12;   // 期中平均餘額，與 m7 同慣例
        constBal += draw;
        interest[m] -= (iLand + iCon);
        if (m === doneM) {
          landFlow[m] -= landBal; landBal = 0;
          conFlow[m] -= constBal; constBal = 0;
        }
      }
      if (landBal > 0) { landFlow[horizon - 1] -= landBal; landBal = 0; }
      if (constBal > 0) { conFlow[horizon - 1] -= constBal; constBal = 0; }

      /* 稅前淨利就是稅前所有流量之和（本金一借一還相消），再算簡化利潤稅 */
      var pretax = 0;
      for (m = 0; m < horizon; m++) {
        pretax += landFlow[m] + conFlow[m] + salesIn[m] + interest[m] - softOut[m] - taxOut[m];
      }
      var profitTax = pretax > 0 ? pretax * profitTaxRate : 0;
      var profit = pretax - profitTax;

      var rows = [], flows = [], cum = 0, net, tx, interestTotal = 0, deficit = 0;
      for (m = 0; m < horizon; m++) {
        tx = -(taxOut[m] + (m === horizon - 1 ? profitTax : 0));
        net = landFlow[m] + conFlow[m] + salesIn[m] + interest[m] - softOut[m] + tx;
        cum += net;
        interestTotal += -interest[m];
        if (cum < deficit) deficit = cum;
        flows.push(net);
        rows.push({ m: m, land: landFlow[m], construction: conFlow[m], soft: -softOut[m],
                    sales: salesIn[m], interest: interest[m], tax: tx, net: net, cum: cum });
      }

      var mr = skipIrr ? null : irrOfFlows(flows);
      var irr = (mr === null) ? null : TD.math.annualize(mr);

      return {
        rows: rows, flows: flows,
        revenue: R, pretax: pretax, profitTax: profitTax, profit: profit,
        margin: R > 0 ? profit / R : null,
        irr: irr, monthlyIrr: mr, irrSkipped: !!skipIrr,
        interestTotal: interestTotal, peakEquity: -deficit,
        buildMonths: build, doneM: doneM, horizon: horizon,
        unsoldAtEnd: unsold, soldOutMonth: ab.soldOutMonth,
        costDetail: { hard: hardSpread + demoC, design: design, sga: sga,
                      marketing: marketing, bonusCost: bonusCost, taxOther: taxOther, businessTax: businessTax }
      };
    }

    function irrOf(L, o) { var r = run(L, o); return r.irr === null ? NaN : r.irr; }
    function marginOf(L, o) { var r = run(L, o, true); return r.margin === null ? NaN : r.margin; }

    /* ----------------------------------------------------------------
       對 L 求解。上界「總銷 × 0.8」，下界 0。
       f(0) 已低於目標 → 不可行（連免費的地都達不到目標），回 null。
       f(上界) 仍高於目標 → 解超出搜尋範圍，以上界表示並標註。
       任何算不出來的情形都回 null，絕不回 NaN。
       ---------------------------------------------------------------- */
    var hiBound = totalSales * 0.8;

    function solveOne(f, target) {
      var hi = hiBound, tries = 0, f0, fH, x;
      if (!(hi > 0)) return { v: null, status: 'nosales' };
      f0 = f(0);
      if (!isFinite(f0)) return { v: null, status: 'error' };
      fH = f(hi);
      while (!isFinite(fH) && tries < 20) { hi = hi * 0.7; fH = f(hi); tries++; }
      if (!isFinite(fH)) return { v: null, status: 'error', at0: f0 };
      if (f0 < target) return { v: null, status: 'infeasible', at0: f0 };
      if (fH > target) return { v: hi, status: 'above', at0: f0 };
      x = TD.math.bisect(f, 0, hi, target, 44);
      if (x === null || !isFinite(x)) return { v: null, status: 'error', at0: f0 };
      return { v: x, status: 'ok', at0: f0 };
    }

    /* 兩個條件取小。任一條件「連土地零元都達不到」時，landCap 一律 null，
       不拿另一條件的數字充當上限（那會嚴重高估，屬於原則一要防的錯）。 */
    function capOf(o) {
      var rIrr = solveOne(function (L) { return irrOf(L, o); }, targetIrr);
      var rMar = solveOne(function (L) { return marginOf(L, o); }, targetMargin);
      /* clamped：回傳的 cap 其實是搜尋上界（狀態 above），不是真正的解。
         這個身分必須傳出去，否則敏感度兩端都被夾在同一個上界、swing 變 0，
         龍捲風圖會誤報「什麼都不敏感」。 */
      var cap = null, clamped = false;
      if (rIrr.status !== 'infeasible' && rMar.status !== 'infeasible') {
        if (rIrr.v !== null && rMar.v !== null) {
          cap = Math.min(rIrr.v, rMar.v);
          clamped = (cap === rIrr.v && rIrr.status === 'above')
                 || (cap === rMar.v && rMar.status === 'above');
        } else if (rIrr.v !== null) {
          cap = rIrr.v; clamped = rIrr.status === 'above';
        } else if (rMar.v !== null) {
          cap = rMar.v; clamped = rMar.status === 'above';
        }
      }
      return { cap: cap, clamped: clamped, irr: rIrr, margin: rMar };
    }

    return {
      ok: true, notes: setupNotes, run: run, capOf: capOf, solveOne: solveOne,
      totalSales: totalSales, units: units, absorbPerMonth: absorbPerMonth,
      hiBound: hiBound, targetIrr: targetIrr, targetMargin: targetMargin,
      planMonths: planMonths, buildMonths: buildMonthsBase,
      handoverMonths: handoverMonths, presaleStart: presaleStart,
      baseHorizon: baseHorizon, sgaRate: sgaRate,
      landLTV: landLTV, landRate: landRate, constLTV: constLTV, constRate: constRate,
      profitTaxRate: profitTaxRate, taxRateOther: taxRateOther,
      businessTaxRate: businessTaxRate, housePortion: housePortion
    };
  }

  /* ================================================================== */
  function m8(p, ctx) {
    p = p || {};
    ctx = ctx || {};
    var mdl = prepare(p, ctx);
    if (!mdl.ok) return degraded(mdl.reason);

    var notes = mdl.notes.slice();
    var m8p = p.m8 || {};
    var targetIrr = mdl.targetIrr, targetMargin = mdl.targetMargin;

    /* ---- 1. 基準求解 ---- */
    var base = mdl.capOf({});
    var byIrr = base.irr.v;
    var byMargin = base.margin.v;
    var landCap = base.cap;
    var capClamped = base.clamped === true;    // landCap 只是搜尋上界，不是真解
    if (capClamped) {
      notes.push('出價上限落在搜尋上界（總銷 × 0.8 ＝ ' + fmoney(mdl.hiBound)
        + '），這不是真正的解。土地佔總銷八成以上在實務上幾乎不可能，'
        + '幾乎一定是總銷、成本或報酬門檻填錯了。'
        + '因此敏感度、損益兩平與三情境的上限一律回 null，不拿上界本身充當答案。');
    }

    /* 每個 null 都要有理由 */
    function explain(which, r, target) {
      if (r.status === 'ok') return;
      if (r.status === 'infeasible') {
        notes.push('以' + which + '目標 ' + fpct(target, 1) + ' 回推不出土地價：即使土地成本為零，'
          + which + '也只有 ' + fpct(r.at0, 2) + '，低於目標。這代表在目前的售價、成本與時程假設下'
          + '本案不可行，因此 landCap 直接回 null，不拿另一個條件的數字充當上限（那會嚴重高估）。');
      } else if (r.status === 'above') {
        notes.push('以' + which + '目標 ' + fpct(target, 1) + ' 回推的解超出搜尋上界（總銷 × 0.8 ＝ '
          + fmoney(mdl.hiBound) + '），已用上界表示。土地佔總銷八成以上在實務上幾乎不可能，'
          + '請先檢查總銷或成本是不是填錯了。');
      } else if (r.status === 'error') {
        notes.push('以' + which + '目標回推時，搜尋區間內算不出有效數值'
          + (which === '年化 IRR' ? '（現金流沒有正負號變化，IRR 無解）' : '')
          + '，該欄回 null。');
      } else {
        notes.push('以' + which + '目標回推失敗（狀態 ' + r.status + '），該欄回 null。');
      }
    }
    explain('年化 IRR', base.irr, targetIrr);
    explain('稅後淨利率', base.margin, targetMargin);

    /* ---- 2. 上限價下的現金流與績效 ---- */
    var capForFlow = landCap === null ? 0 : landCap;
    if (landCap === null) {
      notes.push('出價上限無解，下方現金流以土地成本 0 呈現，只供檢視成本與收款結構，'
        + '不是可出價的方案。');
    }
    var atCap = mdl.run(capForFlow, {});

    /* 基地面積（坪）→ 每坪出價上限 */
    var sitePing = num(ctx.m1 && ctx.m1.areaPing, null);
    if (sitePing === null) {
      var siteM2 = num(ctx.m1 && ctx.m1.areaM2, null);
      if (siteM2 === null) {
        siteM2 = 0;
        var nums = (p.parcel && p.parcel.numbers) || [];
        for (var k = 0; k < nums.length; k++) siteM2 += num(nums[k] && nums[k].areaM2, 0);
      }
      sitePing = siteM2 / PING;
    }
    var perPingCap = (landCap !== null && sitePing > 0) ? landCap / sitePing : null;
    if (landCap !== null && !(sitePing > 0)) {
      notes.push('基地面積為 0，無法換算每坪出價上限（landCapPerPing 回 null）。');
    }

    /* ---- 3. 敏感度：五項固定 id，任一端求解失敗照樣列出 ---- */
    var defs = sensDefs(), sensitivity = [], di, d, rLo, rHi, loCap, hiCap, item;
    for (di = 0; di < defs.length; di++) {
      d = defs[di];
      rLo = mdl.capOf(d.mk(d.lo));
      rHi = mdl.capOf(d.mk(d.hi));
      /* 任一端被夾在搜尋上界就不算解：回 null，不回上界本身。
         否則兩端同為上界時 swing 會變 0，看起來像「這一項完全不敏感」。 */
      loCap = rLo.clamped ? null : rLo.cap;
      hiCap = rHi.clamped ? null : rHi.cap;
      item = { id: d.id, label: d.label, unit: d.unit, lo: d.lo, hi: d.hi,
               loCap: loCap, hiCap: hiCap,
               swing: (loCap === null || hiCap === null) ? null : Math.abs(hiCap - loCap),
               note: d.desc };
      if (rLo.clamped || rHi.clamped) {
        item.note = d.desc + '；其中一端的解超出搜尋上界（總銷 × 0.8），敏感度不可用，已回 null。';
      } else if (loCap === null || hiCap === null) {
        item.note = d.desc + '；其中一端在該假設下求不出上限（已標 null，沒有靜默丟掉）。';
      }
      sensitivity.push(item);
    }
    sensitivity.sort(function (a, b) {
      if (a.swing === null && b.swing === null) return 0;
      if (a.swing === null) return 1;
      if (b.swing === null) return -1;
      return b.swing - a.swing;
    });
    if (sensitivity.length && sensitivity[0].swing !== null) {
      notes.push('敏感度最大的是「' + sensitivity[0].label + '」，出價上限擺動 '
        + fmoney(sensitivity[0].swing) + '。這一項的假設如果錯，出價上限就錯，請優先查證。');
    }

    /* ---- 4. 損益兩平：在出價上限之下，各變數要惡化多少淨利才歸零 ---- */
    function beSolve(f, lo, hi) {
      var x = TD.math.bisect(f, lo, hi, 0, 40);
      return (x === null || !isFinite(x)) ? null : x;
    }
    var bePrice = null, beCost = null, beRate = null;
    if (capClamped) {
      notes.push('出價上限只是搜尋上界而非真解，因此損益兩平三項一律 null'
        + '（以上界計算的容錯空間沒有意義）。');
    } else if (landCap !== null) {
      bePrice = beSolve(function (dd) { return mdl.run(landCap, { priceMul: 1 - dd }, true).profit; }, 0, 0.9);
      beCost = beSolve(function (rr) { return mdl.run(landCap, { costMul: 1 + rr }, true).profit; }, 0, 3);
      beRate = beSolve(function (aa) { return mdl.run(landCap, { rateAdd: aa }, true).profit; }, 0, 0.30);
      if (bePrice === null) notes.push('售價損益兩平點落在搜尋區間（0 ～ −90%）之外，回 null。');
      if (beCost === null) notes.push('營建成本損益兩平點落在搜尋區間（0 ～ +300%）之外，回 null。');
      if (beRate === null) notes.push('利率損益兩平點落在搜尋區間（0 ～ +30 個百分點）之外，回 null。');
    } else {
      notes.push('出價上限無解，因此損益兩平三項一律 null。');
    }

    /* ---- 5. 情境：opt／base／con ---- */
    var scDefs = [
      { id: 'opt', label: '樂觀（售價 +5%、營建 −5%）', o: { priceMul: 1.05, costMul: 0.95 } },
      { id: 'base', label: '基準（照目前假設）', o: { priceMul: 1, costMul: 1 } },
      { id: 'con', label: '保守（售價 −10%、營建 +5%）', o: { priceMul: 0.90, costMul: 1.05 } }
    ];
    var scenarios = [], si, sd, sRes, sCap, sRun, sL;
    for (si = 0; si < scDefs.length; si++) {
      sd = scDefs[si];
      sRes = mdl.capOf(sd.o);
      sCap = sRes.clamped ? null : sRes.cap;      // 夾在上界者不當成解
      sL = (landCap !== null) ? landCap : (sCap === null ? 0 : sCap);
      sRun = mdl.run(sL, sd.o);
      scenarios.push({
        id: sd.id, label: sd.label, landCap: sCap,
        irr: sRun.irr, margin: sRun.margin,
        selected: (m8p.scenario || 'base') === sd.id,
        note: (sRes.clamped ? 'landCap 的解超出搜尋上界（總銷 × 0.8），已回 null；' : 'landCap 是本情境自己重算的上限；')
          + 'irr 與 margin 是「仍以 ' + fmoney(sL)
          + ' 買地、但世界變成本情境」的結果，用來看抗壓性。'
      });
    }

    /* ---- 5b. 壓力測試四項：以出價上限承作，只改一項假設後重跑同一份月現金流 ----
       用的是同一個 run()，不是把基準結果線性外推。 */
    var stress = [], stDefs = stressDefs(), stI, stD, stR, stM, stIrr, stV, stRan;
    var stressL = landCap;
    for (stI = 0; stI < stDefs.length; stI++) {
      stD = stDefs[stI];
      stM = null; stIrr = null; stRan = false;
      if (stressL !== null) {
        try {
          stR = mdl.run(stressL, stD.o);
          stM = isNum(stR.margin) ? stR.margin : null;
          stIrr = isNum(stR.irr) ? stR.irr : null;
          stRan = true;
        } catch (eS) { stM = null; stIrr = null; stRan = false; }
      }
      stV = stRan ? verdictOf(stM, stIrr, targetMargin, targetIrr) : '無法判定';
      stress.push({
        id: stD.id, label: stD.label, delta: stD.delta,
        margin: stM, irr: stIrr, verdict: stV,
        note: (stressL === null)
          ? '出價上限無解，本項無法重算。'
          : '以土地成本 ' + fmoney(stressL) + ' 承作，只改本項假設後重算稅後淨利率與權益 IRR。'
      });
    }
    notes.push('四項壓力測試都以土地成本等於出價上限的最壞承作條件重算（' + STRESS_RULE + '）。'
      + '出價上限的定義就是「基準情境剛好打到目標報酬」的價格，所以任何不利情境都必然低於目標值，'
      + '「通過」只代表仍有正報酬與正淨利，不代表仍達成目標。要看達標與否請把土地成本改為實際議定價後重算。');

    /* ---- 5c. 建議出價：IRR 門檻再加 3 個百分點後回推的土地價（談判起價，保留緩衝） ----
       名詞：出價上限 ＝ 走人價。超過這個價格就達不到報酬目標，應該放棄（walk away）。
             建議出價 ＝ 比走人價低、保留 3 個百分點 IRR 緩衝的價格，作為談判的出價目標。*/
    var BID_IRR_ADD = 0.03;
    var bidIrrTarget = targetIrr + BID_IRR_ADD, bidMarginTarget = targetMargin + BID_IRR_ADD;
    var bidTarget = null, bidFrom = '', bidStatus = null, rbI = null, rbM = null;
    try {
      rbI = mdl.solveOne(function (L) { var rr = mdl.run(L, {}); return (rr && isNum(rr.irr)) ? rr.irr : NaN; }, bidIrrTarget);
      rbM = mdl.solveOne(function (L) { var rr = mdl.run(L, {}, true); return (rr && isNum(rr.margin)) ? rr.margin : NaN; }, bidMarginTarget);
    } catch (eW) { rbI = null; rbM = null; }
    bidStatus = (rbI && rbM) ? rbI.status + '/' + rbM.status : 'error';
    if (rbI && rbM && rbI.status === 'ok' && rbM.status === 'ok' && isNum(rbI.v) && isNum(rbM.v)) {
      bidTarget = Math.min(rbI.v, rbM.v, landCap === null ? Infinity : landCap);
      bidFrom = '年化 IRR ' + fpct(bidIrrTarget, 0) + '、稅後淨利率 ' + fpct(bidMarginTarget, 0)
              + '（各比目標多 3 個百分點）回推的土地價';
    }
    if (bidTarget === null && landCap !== null) {
      var conCap = null, ci;
      for (ci = 0; ci < scenarios.length; ci++) {
        if (scenarios[ci].id === 'con' && isNum(scenarios[ci].landCap)) conCap = scenarios[ci].landCap;
      }
      if (conCap !== null && conCap < landCap) {
        bidTarget = conCap;
        bidFrom = '加嚴 3 個百分點回推無解，改用保守情境（售價 −10%、營建 +5%）的上限';
      } else {
        bidTarget = landCap * 0.9;
        bidFrom = '以走人價的九成作為談判起價（加嚴回推無解）';
      }
    }
    if (landCap === null) { bidTarget = null; bidFrom = '出價上限無解，不提供建議出價'; }

    /* ---- 5d. 與本區同分區土地成交行情比較 ---- */
    var mland = (ctx.m6 && ctx.m6.market && ctx.m6.market.land) ? ctx.m6.market.land : null;
    var benchmark = null;
    if (mland && isNum(mland.perPing) && sitePing > 0) {
      var mTotal = mland.perPing * sitePing;
      var atM = null;
      try { atM = mdl.run(mTotal, {}); } catch (eM) { atM = null; }
      var ratio = (perPingCap !== null) ? perPingCap / mland.perPing : null;
      var lowQ = mland.conf === 'low';
      var verdict = ratio === null ? '出價上限無解'
        : lowQ ? '本區同分區土地成交多為小面積或持分交易，行情僅供參考（出價上限為行情的 ' + TD.fmt.n(ratio * 100, 0) + '%）'
        : ratio >= 1.05 ? '出價上限高於市場行情：依目前假設，以市價買入仍可達到報酬目標'
        : ratio >= 0.95 ? '出價上限約等於市場行情：以市價買入剛好達到報酬目標，沒有緩衝'
        : '出價上限低於市場行情：以市價買入達不到報酬目標，須提高售價、降低成本或爭取更多容積';
      benchmark = {
        perPing: mland.perPing, p25: mland.p25, p50: mland.p50, p75: mland.p75, n: mland.n, label: mland.label, conf: mland.conf,
        comps: mland.comps || [], totalAtMarket: mTotal, capVsMarket: ratio, verdict: verdict,
        irrAtMarket: atM ? atM.irr : null, marginAtMarket: atM ? atM.margin : null, profitAtMarket: atM ? atM.profit : null
      };
      notes.push('本區土地行情 ' + TD.fmt.n(mland.perPing / 1e4, 1) + ' 萬／坪（' + mland.label + '）；' + verdict
        + (atM && isNum(atM.margin) ? '。以行情價 ' + fmoney(mTotal) + ' 買入時稅後淨利率 ' + fpct(atM.margin, 1)
          + (isNum(atM.irr) ? '、年化 IRR ' + fpct(atM.irr, 1) : '') : '') + '。');
    }

    /* ---- 6. 固定備註：每一條都是會讓人誤判的簡化，一定要寫出來 ---- */
    notes.push('出價上限（走人價）＝ 同時滿足「年化 IRR ≥ ' + fpct(targetIrr, 1) + '」與「稅後淨利 ÷ 總銷 ≥ '
      + fpct(targetMargin, 1) + '」的最大土地總價，兩者取小；賣方開價高於此數就應放棄。'
      + '建議出價是再保留 ' + fpct(BID_IRR_ADD, 0) + ' IRR 緩衝的談判目標。報酬目標可在左欄「報酬目標」調整。');
    notes.push('IRR 是權益 IRR（土融與建融的動撥、計息與清償都已在現金流內淨額處理），'
      + '不是無槓桿 IRR；成數或利率一改，IRR 會明顯位移。');
    notes.push('稅：營業稅以售價中房屋部分 ' + fpct(mdl.housePortion, 0) + ' 課 5%（土地免徵）；'
      + '其他稅費規費以總銷 ' + fpct(mdl.taxRateOther, 1) + ' 計；營利事業所得稅以稅前淨利 × '
      + fpct(mdl.profitTaxRate, 0) + ' 計（所得稅法第24條之5，虧損不退稅）。'
      + '土地增值稅由賣方負擔；未分配盈餘加徵 5% 視股利政策另計。');
    notes.push('土地款假設 t0 一次付清、自備 ' + fpct(1 - mdl.landLTV, 0) + '，土融 '
      + fpct(mdl.landLTV, 0) + ' 自 t0 起按月計息、交屋月一次清償。'
      + '實務上土地款常分期（簽約、完稅、過戶），分期會讓 IRR 變好，本模型偏保守。');
    notes.push('建融依 S 曲線動撥，利息用期中平均餘額（月初餘額 ＋ 本月動撥 ÷ 2）× 年利率 ÷ 12。');
    notes.push('收款假設：簽約當月收 15%（訂、簽、開），交屋月收其餘 85%，'
      + '交屋後才成交者一次收足 100%。實際訂簽開比例與工程期款依契約而異。');
    if (atCap.unsoldAtEnd > 0) {
      notes.push('以每月 ' + fn(mdl.absorbPerMonth, 1) + ' 戶去化，到期末（第 '
        + atCap.doneM + ' 月交屋結案）仍有 ' + fn(atCap.unsoldAtEnd, 1) + ' 戶未售出。'
        + '本模型把未完銷的部分一律認在最後一個月收足，實務上餘屋會繼續壓利息與管銷，'
        + '因此這裡的出價上限對去化不佳的情形偏樂觀，請一併看「去化速度」那一項敏感度。');
    }
    notes.push('時程：規劃請照 ' + mdl.planMonths + ' 個月（已含制度審議與獎勵加計）＋ 施工 '
      + mdl.buildMonths + ' 個月，完工於第 ' + (mdl.planMonths + mdl.buildMonths)
      + ' 月，再加交屋結案期 ' + mdl.handoverMonths + ' 個月，尾款 85% 收在第 '
      + (mdl.planMonths + mdl.buildMonths + mdl.handoverMonths) + ' 月，預售自第 '
      + mdl.presaleStart + ' 月起。交屋期越長，尾款收得越晚、利息壓越久，出價上限越低。');
    notes.push('管銷以「每月費率 × 月數」計（月費率由總銷 × ' + fpct(mdl.sgaRate, 2)
      + ' ÷ 基準月數 ' + mdl.baseHorizon + ' 反推），因此工期一拉長管銷總額同步上升，'
      + '不是把同一筆總額往後遞延。');
    notes.push('出價上限是依本案假設回推的開發商可負擔地價，不是估價報告；量體須經建築師檢討、'
      + '單價與成本請以最新實價登錄與發包報價更新後再定案。');

    /* ---- 7. 組裝輸出 ---- */
    var capFormula = 'IRR 條件 ' + (byIrr === null ? '無解' : fmoney(byIrr))
      + '、淨利率條件 ' + (byMargin === null ? '無解' : fmoney(byMargin))
      + '，取小者 ＝ ' + (landCap === null ? '無解' : fmoney(landCap))
      + '（二分法，區間 0 ～ 總銷 × 0.8 ＝ ' + fmoney(mdl.hiBound) + '）';
    var softAtCap = atCap.costDetail.design + atCap.costDetail.sga
      + atCap.costDetail.marketing + atCap.costDetail.bonusCost;

    return {
      landCap: TD.V('m8.landCap', landCap, 'mid', SRC, capFormula,
        '出價上限＝走人價：土地總價（不含契稅、代書與仲介費）超過此數，就達不到設定的報酬目標，應該放棄。'
        + '它是上游量體、單價與成本假設相乘的結果，請搭配敏感度與本區土地行情一起看。'),

      landCapPerPing: TD.V('m8.landCapPerPing', perPingCap, 'mid', SRC,
        (perPingCap === null) ? '無法計算'
          : fmoney(landCap) + ' ÷ 基地 ' + fn(sitePing, 2) + ' 坪 ＝ ' + fn(perPingCap, 0) + ' 元/坪',
        '換算每坪只是方便與行情比較，實際出價仍以總價與付款條件談。'),

      landCapByIrr: byIrr,
      landCapByMargin: byMargin,

      irrAtCap: TD.V('m8.irrAtCap', atCap.irr, 'mid', SRC,
        atCap.irr === null ? '現金流沒有正負號變化，IRR 無解'
          : '土地價 ' + fmoney(capForFlow) + ' 下，月 IRR ' + fpct(atCap.monthlyIrr, 3)
            + ' 年化 ＝ ' + fpct(atCap.irr, 2),
        '權益 IRR。兩個條件哪一個較緊，這裡就會等於那個目標值，另一個會比目標寬鬆。'),

      marginAtCap: TD.V('m8.marginAtCap', atCap.margin, 'mid', SRC,
        atCap.margin === null ? '總銷為 0，無法計算'
          : '稅後淨利 ' + fmoney(atCap.profit) + ' ÷ 總銷 ' + fmoney(atCap.revenue)
            + ' ＝ ' + fpct(atCap.margin, 2),
        '稅後淨利率。稅只含簡化利潤稅，未含土增稅與房地合一稅。'),

      profitAtCap: TD.V('m8.profitAtCap', atCap.profit, 'mid', SRC,
        '總銷 ' + fmoney(atCap.revenue) + ' − 土地 ' + fmoney(capForFlow)
        + ' − 營建 ' + fmoney(atCap.costDetail.hard) + ' − 軟成本 ' + fmoney(softAtCap)
        + ' − 利息 ' + fmoney(atCap.interestTotal)
        + ' − 稅費 ' + fmoney(atCap.costDetail.taxOther + atCap.profitTax)
        + ' ＝ ' + fmoney(atCap.profit) + '（等於現金流累計期末值）',
        '以出價上限成交時的稅後淨利。峰值自有資金需求約 ' + fmoney(atCap.peakEquity)
        + '，這筆錢要先準備好，否則工程會停。'),

      cashflow: atCap.rows,
      sensitivity: sensitivity,

      breakeven: {
        priceDropPct: TD.V('m8.bePriceDrop', bePrice, 'mid', SRC,
          bePrice === null ? '無解'
            : '出價上限下，售價下跌 ' + fpct(bePrice, 1) + ' 時稅後淨利歸零',
          '售價的安全邊際。低於 10% 代表幾乎沒有容錯空間。'),
        costRisePct: TD.V('m8.beCostRise', beCost, 'mid', SRC,
          beCost === null ? '無解'
            : '出價上限下，營建成本上漲 ' + fpct(beCost, 1) + ' 時稅後淨利歸零',
          '營建成本的安全邊際。發包時點與物價指數是主要風險來源。'),
        rateRisePct: TD.V('m8.beRateRise', beRate, 'mid', SRC,
          beRate === null ? '無解'
            : '出價上限下，土建融利率同時上升 ' + fn(beRate * 100, 2) + ' 個百分點時稅後淨利歸零',
          '單位是「個百分點」的小數（0.03 ＝ 3 個百分點）。利率風險通常小於售價風險，'
          + '但升息常與售價下跌同時發生，兩者要一起看。')
      },

      scenarios: scenarios,

      stress: stress,

      walkAway: null,
      bidTarget: TD.V('m8.bidTarget', bidTarget, 'mid', SRC,
        '建議出價 = ' + (bidFrom || '無法計算'),
        '談判時的出價目標：比走人價（出價上限）低，IRR 與淨利率各保留 3 個百分點緩衝吸收假設誤差。'),
      bidTargetPerPing: (bidTarget !== null && sitePing > 0) ? bidTarget / sitePing : null,
      benchmark: benchmark,

      notes: notes,

      /* ---- 契約欄位之外的附加輸出（見 docs/NOTES-m8.md）---- */
      cashflowCols: [
        { k: 'm', label: '月' }, { k: 'land', label: '土地' }, { k: 'construction', label: '營建' },
        { k: 'soft', label: '軟成本' }, { k: 'sales', label: '銷售收款' },
        { k: 'interest', label: '利息' }, { k: 'tax', label: '稅費' },
        { k: 'net', label: '淨流量' }, { k: 'cum', label: '累計' }
      ],
      targets: {
        targetIrr: targetIrr, targetMargin: targetMargin, hiBound: mdl.hiBound,
        irrStatus: base.irr.status, marginStatus: base.margin.status,
        binding: (byIrr !== null && byMargin !== null)
          ? (byIrr <= byMargin ? 'irr' : 'margin')
          : (byIrr !== null ? 'irr' : (byMargin !== null ? 'margin' : null))
      },
      schedule: {
        planMonths: mdl.planMonths, buildMonths: mdl.buildMonths,
        handoverMonths: mdl.handoverMonths, presaleStartMonth: mdl.presaleStart,
        completionMonth: mdl.planMonths + mdl.buildMonths,
        handoverMonth: atCap.doneM, horizon: atCap.horizon
      },
      capClamped: capClamped,
      stressRule: STRESS_RULE,
      bidFrom: bidFrom,
      bidIrrTarget: bidIrrTarget,
      bidMarginTarget: bidMarginTarget,
      bidStatus: bidStatus,
      atCap: {
        landPrice: capForFlow, revenue: atCap.revenue, pretax: atCap.pretax,
        profitTax: atCap.profitTax, profit: atCap.profit, interestTotal: atCap.interestTotal,
        peakEquity: atCap.peakEquity, unsoldAtEnd: atCap.unsoldAtEnd,
        soldOutMonth: atCap.soldOutMonth, units: mdl.units, totalSales: mdl.totalSales
      }
    };
  }

  TD.engine.m8 = m8;
  TD.engine.m8prepare = prepare;   // 供外部以同一份現金流重算（ctx 內不放函式）
})(window.TD);
