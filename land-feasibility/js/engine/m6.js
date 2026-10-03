/* m6 收入模型：由比較交易案例推估單價（特徵價格迴歸或加權比價），再乘可售坪與車位算總銷。*/
window.TD = window.TD || {};
(function (TD) {
  'use strict';

  TD.engine = TD.engine || {};

  /* ------------------------------------------------------------------
     三條路徑，選哪一條由樣本決定，不由方便決定

       manual    使用者直接輸入單價 → conf 'input'，本模組不做任何推估
       hedonic   有效樣本 >= 8 筆且 OLS 有解 → ln(單價) 對屋齡／樓層／面積／距離迴歸
       weighted  樣本不足或迴歸無解 → 逐筆調整後加權平均，信心降一級

     兩件事必須誠實標出來：
     1. 內建 comps 是合成示範資料（comps.js 的 _meta.synthetic = true）。
        只要用到它，單價信心一律降到 'unv'，因為這個數字不是市場資料推出來的。
     2. 加權比價的調整率是假設值，不是迴歸結果。drivers 會把這件事寫在句子裡。

     總銷需要 m5 的可售坪與車位數。m6 被單獨呼叫（ctx.m5 不存在）時，
     只輸出單價相關欄位，總銷、車位收入與去化月數一律 null，不丟例外。
     ------------------------------------------------------------------ */

  /* 加權比價法的調整率：全部是假設值，不是任何官方或迴歸來源 */
  var ADJ = {
    agePerYear: -0.005,     // 屋齡每差一年
    floorPerLevel: 0.010,   // 樓層每差一層
    areaPerPing: -0.002,    // 面積每差一坪
    distPerM: -0.00020      // 距離每差一公尺
  };
  var ADJ_CAP = 0.35;       // 單筆調整率上限 ±35%，避免遠距或極端樣本主導結果
  var DIST_W0 = 300;        // 權重半衰參數：權重 = 1 ÷（1 + 距離 ÷ 300）
  var MIN_N_HEDONIC = 8;    // SPEC 指定的迴歸最低樣本數

  var SRC_HED  = '比較交易案例特徵價格迴歸（hedonic），樣本來源見下';
  var SRC_WGT  = '比較交易案例加權比價，調整率為本系統假設值，無法源';
  var SRC_MAN  = '使用者直接輸入之單價';
  var SRC_PARK = 'TD.data.cost.parkingPricePerStall 種子值（未查證）';

  /* ===================== 小工具 ===================== */

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
  // 帶正負號的百分比（人話用）：＋1.1% / −0.8%
  function signPct(v, d) {
    if (v === null || typeof v !== 'number' || !isFinite(v)) return '—';
    d = (d === undefined) ? 1 : d;
    return (v >= 0 ? '＋' : '−') + Math.abs(v * 100).toFixed(d) + '%';
  }
  function mul(a, b) { return (a === null || b === null) ? null : a * b; }
  function add(a, b) { return (a === null || b === null) ? null : a + b; }

  /* 信心等級比較：回傳較差的那一個（input 視同 mid 的位階，只代表來源是人輸入的） */
  var RANK = { high: 0, mid: 1, input: 1, low: 2, unv: 3 };
  function rank(c) { return (RANK[c] === undefined) ? 2 : RANK[c]; }
  function worse(a, b) { return rank(a) >= rank(b) ? a : b; }

  function toNum(v, dflt) { return (typeof v === 'number' && isFinite(v)) ? v : dflt; }

  // 只做對照、不參與計算的樣本列（manual 路徑用）
  function plainComps(rows) {
    var out = [], i, r;
    for (i = 0; i < rows.length; i++) {
      r = rows[i];
      out.push({
        id: r.id, addr: r.addr, district: r.district, type: r.type, year: r.year,
        unitPricePing: r.unitPricePing, areaPing: r.areaPing, ageYears: r.ageYears,
        floor: r.floor, distanceM: r.distanceM,
        ageAdj: null, floorAdj: null, areaAdj: null, distAdj: null,
        adjRate: null, adjPrice: null, weight: null, weightPct: null,
        fitPrice: null, residPct: null
      });
    }
    return out;
  }

  /* ===================== 樣本整理 ===================== */

  // 只收四個自變數與單價都齊全的列；缺項不補值、不猜，直接算進 skipped
  function usableRows(src) {
    var out = [], skipped = 0, i, r;
    if (!src || Object.prototype.toString.call(src) !== '[object Array]') return { rows: out, skipped: 0 };
    for (i = 0; i < src.length; i++) {
      r = src[i];
      if (!r || typeof r !== 'object') { skipped++; continue; }
      if (!(typeof r.unitPricePing === 'number' && isFinite(r.unitPricePing) && r.unitPricePing > 0)) { skipped++; continue; }
      if (!(typeof r.areaPing === 'number' && isFinite(r.areaPing) && r.areaPing > 0)) { skipped++; continue; }
      if (!(typeof r.ageYears === 'number' && isFinite(r.ageYears))) { skipped++; continue; }
      if (!(typeof r.floor === 'number' && isFinite(r.floor))) { skipped++; continue; }
      if (!(typeof r.distanceM === 'number' && isFinite(r.distanceM))) { skipped++; continue; }
      out.push({
        id: r.id || ('c' + (i + 1)), addr: r.addr || '', district: r.district || '',
        type: r.type || '', year: toNum(r.year, null),
        unitPricePing: r.unitPricePing, areaPing: r.areaPing, ageYears: r.ageYears,
        floor: r.floor, totalFloors: toNum(r.totalFloors, null), distanceM: r.distanceM
      });
    }
    return { rows: out, skipped: skipped };
  }

  function pickComps(s, notes) {
    var useSample = (s.useSampleComps === undefined) ? true : !!s.useSampleComps;
    var src, label, isSample;
    if (useSample) {
      src = (TD.data && TD.data.comps) ? TD.data.comps.rows : null;
      label = '內建合成示範資料（js/data/comps.js）';
      isSample = true;
      if (!src) notes.push('設定為使用內建範例比較案例，但 TD.data.comps 不存在或格式不符，樣本數為 0。');
    } else {
      src = s.comps;
      label = '使用者匯入之比較案例（m6.comps）';
      isSample = false;
    }
    var u = usableRows(src);
    if (u.skipped > 0) {
      notes.push('比較案例有 ' + u.skipped + ' 筆因缺少單價、面積、屋齡、樓層或距離而被略過，未補任何預設值。');
    }
    if (isSample && u.rows.length) {
      notes.push('本次單價使用內建合成示範資料，不是實價登錄。'
                 + '因此無論用哪個方法，單價信心一律標為「待查證」（unv）：'
                 + '這個數字可以用來看流程，不能用來出價或對外報告。請在 m6 匯入真實成交資料後重算。');
    }
    return { rows: u.rows, skipped: u.skipped, label: label, isSample: isSample };
  }

  /* ===================== hedonic 特徵價格迴歸 ===================== */

  var VARS = [
    { key: 'ageYears', name: '屋齡',       per: 1,   phrase: '屋齡每增加一年' },
    { key: 'floor',    name: '樓層',       per: 1,   phrase: '樓層每上升一層' },
    { key: 'areaPing', name: '面積',       per: 1,   phrase: '面積每增加一坪' },
    { key: 'distanceM', name: '與標的距離', per: 100, phrase: '與標的距離每增加 100 公尺' }
  ];

  function subjectRow(sub) {
    return [toNum(sub.ageYears, 0), toNum(sub.floor, 8), toNum(sub.areaPing, 35), toNum(sub.distanceM, 0)];
  }

  // 檢查標的的四個特徵是否落在樣本範圍內；外插要降信心並說清楚
  function extrapolation(rows, sub) {
    var srow = subjectRow(sub), out = [], i, j, k, v, lo, hi;
    for (j = 0; j < VARS.length; j++) {
      k = VARS[j].key; lo = null; hi = null;
      for (i = 0; i < rows.length; i++) {
        v = rows[i][k];
        if (lo === null || v < lo) lo = v;
        if (hi === null || v > hi) hi = v;
      }
      if (lo === null) continue;
      if (srow[j] < lo || srow[j] > hi) {
        out.push(VARS[j].name + '（標的 ' + fnum(srow[j], 1) + '，樣本 ' + fnum(lo, 1) + '～' + fnum(hi, 1) + '）');
      }
    }
    return out;
  }

  function runHedonic(rows, sub, notes) {
    if (!TD.math || !TD.math.ols) return null;
    var X = [], y = [], i;
    for (i = 0; i < rows.length; i++) {
      X.push([rows[i].ageYears, rows[i].floor, rows[i].areaPing, rows[i].distanceM]);
      y.push(Math.log(rows[i].unitPricePing));
    }
    var fit = TD.math.ols(X, y);
    if (!fit) return null;
    var srow = subjectRow(sub);
    var pred = fit.predict(srow);
    if (!isFinite(pred)) return null;
    var price = Math.exp(pred);
    var lo = Math.exp(pred - 1.96 * fit.se);
    var hi = Math.exp(pred + 1.96 * fit.se);
    if (!isFinite(price) || price <= 0) return null;

    // drivers：把係數翻成人話。對數模型的係數要先 exp 再減 1 才是百分比變動。
    var drivers = [], j, coef, chg;
    for (j = 0; j < VARS.length; j++) {
      coef = fit.beta[j + 1];
      chg = Math.exp(coef * VARS[j].per) - 1;
      drivers.push({
        name: VARS[j].name,
        coef: coef,
        effect: VARS[j].phrase + '，單價約變動 ' + signPct(chg, 1)
      });
    }

    // 逐筆配適值與殘差，供 UI 檢查有沒有離群樣本在拉結果
    var comps = [], f, fp;
    for (i = 0; i < rows.length; i++) {
      f = fit.predict([rows[i].ageYears, rows[i].floor, rows[i].areaPing, rows[i].distanceM]);
      fp = isFinite(f) ? Math.exp(f) : null;
      comps.push({
        id: rows[i].id, addr: rows[i].addr, district: rows[i].district, type: rows[i].type, year: rows[i].year,
        unitPricePing: rows[i].unitPricePing, areaPing: rows[i].areaPing, ageYears: rows[i].ageYears,
        floor: rows[i].floor, distanceM: rows[i].distanceM,
        ageAdj: null, floorAdj: null, areaAdj: null, distAdj: null,
        adjRate: null, adjPrice: null, weight: null, weightPct: null,
        fitPrice: fp, residPct: (fp && fp > 0) ? (rows[i].unitPricePing / fp - 1) : null
      });
    }

    var ex = extrapolation(rows, sub);
    if (ex.length) {
      notes.push('標的在 ' + ex.join('、') + ' 落在樣本範圍之外，屬外插推估；'
                 + '迴歸在樣本外的行為沒有保證，信心已降一級。');
    }
    if (fit.r2 < 0.6) {
      notes.push('迴歸 R² 僅 ' + fnum(fit.r2, 2) + '，樣本對單價的解釋力偏低；'
                 + '區間寬度已反映殘差標準差，但建議補樣本或改用加權比價交叉驗證。');
    }
    notes.push('迴歸設定：應變數為 ln(單價)，自變數為屋齡、樓層、面積、距離四項，'
               + '未控制建物型態、屋況與裝潢、成交年度與有無車位，這些遺漏變數會落進殘差，'
               + '使區間看起來比真實不確定窄。');

    return {
      price: price, lo: lo, hi: hi, r2: fit.r2, se: fit.se, n: fit.n,
      drivers: drivers, comps: comps, extrapolated: ex.length > 0
    };
  }

  /* ===================== 加權比價 ===================== */

  function runWeighted(rows, sub, notes) {
    var srow = subjectRow(sub);
    var sAge = srow[0], sFloor = srow[1], sArea = srow[2], sDist = srow[3];
    var comps = [], wsum = 0, psum = 0, adjList = [], i, r, a, f, ar, d, rate, capped, price, w;

    for (i = 0; i < rows.length; i++) {
      r = rows[i];
      a  = (sAge - r.ageYears) * ADJ.agePerYear;
      f  = (sFloor - r.floor) * ADJ.floorPerLevel;
      ar = (sArea - r.areaPing) * ADJ.areaPerPing;
      d  = (sDist - r.distanceM) * ADJ.distPerM;
      rate = a + f + ar + d;
      capped = false;
      if (rate > ADJ_CAP) { rate = ADJ_CAP; capped = true; }
      if (rate < -ADJ_CAP) { rate = -ADJ_CAP; capped = true; }
      price = r.unitPricePing * (1 + rate);
      w = 1 / (1 + Math.max(0, r.distanceM) / DIST_W0);
      wsum += w; psum += price * w;
      adjList.push(price);
      comps.push({
        id: r.id, addr: r.addr, district: r.district, type: r.type, year: r.year,
        unitPricePing: r.unitPricePing, areaPing: r.areaPing, ageYears: r.ageYears,
        floor: r.floor, distanceM: r.distanceM,
        ageAdj: a, floorAdj: f, areaAdj: ar, distAdj: d,
        adjRate: rate, adjPrice: price, weight: w, weightPct: null,
        fitPrice: null, residPct: null, capped: capped
      });
    }
    if (!comps.length || wsum <= 0) return null;

    for (i = 0; i < comps.length; i++) comps[i].weightPct = comps[i].weight / wsum;

    var priceOut = psum / wsum;
    var q25 = (TD.math && TD.math.quantile) ? TD.math.quantile(adjList, 0.25) : null;
    var q75 = (TD.math && TD.math.quantile) ? TD.math.quantile(adjList, 0.75) : null;
    var lo = (q25 !== null && isFinite(q25)) ? Math.min(q25, priceOut) : null;
    var hi = (q75 !== null && isFinite(q75)) ? Math.max(q75, priceOut) : null;

    var anyCapped = false;
    for (i = 0; i < comps.length; i++) if (comps[i].capped) anyCapped = true;
    if (anyCapped) {
      notes.push('有樣本的合計調整率超過 ±' + fpct(ADJ_CAP, 0) + '，已夾住；'
                 + '調整率被夾住通常代表該樣本與標的條件差太遠，建議直接剔除而不是調整。');
    }

    var drivers = [
      { name: '屋齡', coef: ADJ.agePerYear,
        effect: '屋齡每增加一年，單價假設調整 ' + signPct(ADJ.agePerYear, 1) + '（假設值，非迴歸結果）' },
      { name: '樓層', coef: ADJ.floorPerLevel,
        effect: '樓層每上升一層，單價假設調整 ' + signPct(ADJ.floorPerLevel, 1) + '（假設值，非迴歸結果）' },
      { name: '面積', coef: ADJ.areaPerPing,
        effect: '面積每增加一坪，單價假設調整 ' + signPct(ADJ.areaPerPing, 1) + '（假設值，非迴歸結果）' },
      { name: '與標的距離', coef: ADJ.distPerM,
        effect: '與標的距離每增加 100 公尺，單價假設調整 ' + signPct(ADJ.distPerM * 100, 1) + '（假設值，非迴歸結果）' }
    ];

    notes.push('加權比價的四項調整率是本系統寫死的假設值，沒有法源也沒有迴歸支持；'
               + '權重採「1 ÷（1 + 距離 ÷ ' + DIST_W0 + '公尺）」，距離越近權重越高。'
               + '區間取調整後樣本的四分位距（必要時擴張以涵蓋點估計），不是統計信賴區間。');

    return { price: priceOut, lo: lo, hi: hi, r2: null, se: null, n: comps.length,
             drivers: drivers, comps: comps, extrapolated: false };
  }

  /* ===================== 主體 ===================== */

  function m6(p, ctx) {
    p = p || {};
    ctx = ctx || {};
    var s = p.m6 || {};
    var sub = s.subject || {};
    var notes = [];

    var presalePremium = toNum(s.presalePremium, 0.08);
    if (presalePremium < -0.5 || presalePremium > 1) {
      notes.push('預售溢價率 ' + fpct(presalePremium, 1) + ' 超出合理範圍，已夾為 −50%～100% 之內，請確認輸入。');
      presalePremium = Math.max(-0.5, Math.min(1, presalePremium));
    }
    var absorbPerMonth = toNum(s.absorbPerMonth, 8);

    var picked = pickComps(s, notes);
    var rows = picked.rows;

    /* ---- 選路徑 ---- */
    var manual = (typeof s.manualUnitPricePing === 'number' && isFinite(s.manualUnitPricePing)
                  && s.manualUnitPricePing > 0) ? s.manualUnitPricePing : null;

    var method, res, conf, srcPrice, formulaPrice, notePrice;

    if (manual !== null) {
      method = 'manual';
      res = { price: manual, lo: manual, hi: manual, r2: null, se: null, n: rows.length,
              drivers: [], comps: plainComps(rows), extrapolated: false };
      conf = 'input';
      srcPrice = SRC_MAN;
      formulaPrice = '單價 = 使用者直接輸入 ' + fnum(manual, 0) + ' 元/坪';
      notePrice = '使用者指定單價，本模組未做任何推估，也沒有區間可言（上下界等於輸入值）。'
                + '請自行確認這個數字的來源與時點；若要系統推估，請清空 m6.manualUnitPricePing。';
      notes.push('已採用使用者輸入的單價，比較案例僅供對照，未參與計算。');
    } else {
      res = null;
      if (rows.length >= MIN_N_HEDONIC) {
        res = runHedonic(rows, sub, notes);
        if (res) {
          method = 'hedonic';
          conf = res.extrapolated ? 'low' : 'mid';
          srcPrice = SRC_HED + '：' + picked.label;
          formulaPrice = '單價 = exp( 迴歸預測值 )，樣本 ' + res.n + ' 筆，R² ' + fnum(res.r2, 2)
                       + '；區間 = exp( 預測 ± 1.96 × 殘差標準差 ' + fnum(res.se, 3) + ' )';
          notePrice = '迴歸只控制屋齡、樓層、面積、距離四項；'
                    + '建物型態、屋況、成交時點與車位有無都沒有控制，實際不確定性大於此區間。';
        } else {
          notes.push('有效樣本 ' + rows.length + ' 筆已達 ' + MIN_N_HEDONIC
                     + ' 筆門檻，但最小平方迴歸無解（變數共線或自由度不足），改走加權比價法，信心降一級。');
        }
      } else {
        notes.push('有效比較案例僅 ' + rows.length + ' 筆，未達迴歸所需的 ' + MIN_N_HEDONIC
                   + ' 筆，改走加權比價法，信心降一級。樣本越少，點估計對單筆樣本越敏感。');
      }
      if (!res) {
        res = runWeighted(rows, sub, notes);
        if (res) {
          method = 'weighted';
          conf = 'low';
          srcPrice = SRC_WGT + '：' + picked.label;
          formulaPrice = '單價 = Σ( 樣本單價 ×（1 + 調整率 ）× 權重 ) ÷ Σ 權重，樣本 ' + res.n + ' 筆';
          notePrice = '調整率為假設值而非市場推估，且未做成交時點調整（物價與房價指數尚未接入）；'
                    + '此法在樣本少時只能當量級參考，不能當估價結論。';
        } else {
          method = 'weighted';
          conf = 'unv';
          res = { price: null, lo: null, hi: null, r2: null, se: null, n: 0,
                  drivers: [], comps: [], extrapolated: false };
          srcPrice = '無可用樣本';
          formulaPrice = '無法計算：沒有任何一筆可用的比較案例';
          notePrice = '沒有可用樣本，本模組拒絕估算單價。請匯入實價登錄資料，'
                    + '或在 m6.manualUnitPricePing 直接輸入你自己負責的單價。';
          notes.push('沒有任何可用的比較案例，單價與總銷一律為空值，不以任何預設數字填補。'
                     + '這是刻意的：在這個領域，填一個看起來合理的數字比留白危險得多。');
        }
      }
    }

    // 合成示範資料只能撐到「待查證」，不論方法多漂亮
    if (picked.isSample && rows.length && method !== 'manual') conf = worse(conf, 'unv');

    var price = (res.price !== null && isFinite(res.price) && res.price > 0) ? res.price : null;
    var loP = (res.lo !== null && isFinite(res.lo) && res.lo > 0) ? res.lo : null;
    var hiP = (res.hi !== null && isFinite(res.hi) && res.hi > 0) ? res.hi : null;

    /* ---- 預售單價 ---- */
    var presalePrice = (price === null) ? null : price * (1 + presalePremium);
    var confPresale = worse(conf, 'low');   // 溢價率是假設值，不可能比 low 好

    /* ---- 量體：m5 不存在時只回單價，不丟例外 ---- */
    var hasM5 = !!ctx.m5;
    var m5 = ctx.m5 || {};
    var sellablePing = hasM5 ? posNum(m5.sellablePing) : null;
    var stalls = hasM5 ? num(m5.stalls) : null;
    var unitsCount = hasM5 ? num(m5.unitsCount) : null;
    if (!hasM5) {
      notes.push('未取得 m5 量體結果（本模組被單獨呼叫），因此只輸出單價；'
                 + '總銷、車位收入與去化月數一律為空值。');
    } else if (sellablePing === null) {
      notes.push('m5 未算出可售坪，銷售收入與總銷無法計算；請先處理 m5 的缺漏（通常是基地面積或分區未填）。');
    }

    var stallPrice = null;
    if (TD.data && TD.data.cost && typeof TD.data.cost.parkingPricePerStall === 'number'
        && isFinite(TD.data.cost.parkingPricePerStall)) {
      stallPrice = TD.data.cost.parkingPricePerStall;
    } else if (stalls !== null) {
      notes.push('TD.data.cost.parkingPricePerStall 缺漏，車位收入無法計算。');
    }

    var salesRevenue = mul(sellablePing, presalePrice);
    var parkingRevenue = mul(stalls, stallPrice);
    var totalSales = add(salesRevenue, parkingRevenue);
    if (salesRevenue !== null && parkingRevenue === null) {
      totalSales = salesRevenue;
      notes.push('總銷未含車位收入（車位數或車位單價缺漏），實際總銷會高於此數字。');
    }

    var absorbMonths = null;
    if (unitsCount !== null && absorbPerMonth > 0) absorbMonths = Math.ceil(unitsCount / absorbPerMonth);
    else if (unitsCount !== null && absorbPerMonth <= 0) {
      notes.push('每月去化戶數輸入為 ' + absorbPerMonth + '，無法計算去化月數；請輸入大於 0 的數字。');
    }

    notes.push('車位收入以單一車位單價乘車位數概估，未分平面／機械、未分坡道／升降，'
               + '也未扣除自用或無法銷售的車位；m5 的車位數本身也是估算。');
    notes.push('本模組算的是「總銷」，不是「可收現金」：折讓、車位搭售、代銷佣金與去化不如預期'
               + '都會讓實收低於此數，成本面在 m7，回推出價在 m8。');

    var confSales = worse(confPresale, 'low');
    var confPark = worse(conf, 'unv');      // 車位單價是未查證的種子值
    var confTotal = worse(confSales, (parkingRevenue === null ? confSales : confPark));

    return {
      method: method,
      n: res.n,
      r2: res.r2,

      unitPricePing: TD.V('m6.unitPricePing', price, conf, srcPrice, formulaPrice, notePrice),

      loPing: TD.V('m6.loPing', loP, conf, srcPrice,
        (method === 'hedonic') ? '區間下界 = exp( 預測 − 1.96 × 殘差標準差 )'
        : (method === 'weighted' ? '區間下界 = 調整後樣本第 25 百分位（必要時取點估計）'
                                 : '區間下界 = 使用者輸入值（未提供區間）'),
        '區間只反映本模組看得到的變異；政策、利率與供給面的轉折不在裡面。'),

      hiPing: TD.V('m6.hiPing', hiP, conf, srcPrice,
        (method === 'hedonic') ? '區間上界 = exp( 預測 + 1.96 × 殘差標準差 )'
        : (method === 'weighted' ? '區間上界 = 調整後樣本第 75 百分位（必要時取點估計）'
                                 : '區間上界 = 使用者輸入值（未提供區間）'),
        '出價決策請用下界，不要用上界；用上界出價等於把全部誤差當成利潤。'),

      presalePricePing: TD.V('m6.presalePricePing', presalePrice, confPresale,
        '成屋單價（見 m6.unitPricePing）× 使用者輸入之預售溢價率',
        '預售單價 = 單價 ' + fnum(price, 0) + ' 元/坪 ×（1 + 預售溢價 ' + fpct(presalePremium, 1) + '）',
        '預售溢價是假設值：市場轉弱時預售價可能低於成屋價（溢價為負），'
        + '此時應把這個欄位改成負數重算，不要沿用預設 8%。'),

      salesRevenue: TD.V('m6.salesRevenue', salesRevenue, confSales,
        'm5 可售坪 × 預售單價',
        '銷售收入 = 可售坪 ' + fnum(sellablePing, 1) + ' 坪 × 預售單價 ' + fnum(presalePrice, 0) + ' 元/坪',
        '可售坪來自 m5 的量體估算（信心 low），單價來自 m6；兩個估算相乘，誤差是相乘不是相加。'),

      parkingRevenue: TD.V('m6.parkingRevenue', parkingRevenue, confPark,
        SRC_PARK,
        '車位收入 = 車位數 ' + fnum(stalls, 0) + ' 位 × 每位 ' + fnum(stallPrice, 0) + ' 元',
        '種子值不分車位型式與區位；台北市精華區平面車位與機械車位可以差一倍以上，須以實際銷售策略取代。'),

      totalSales: TD.V('m6.totalSales', totalSales, confTotal,
        'm6 銷售收入 + m6 車位收入',
        '總銷 = 銷售收入 ' + fnum(salesRevenue, 0) + ' 元 + 車位收入 ' + fnum(parkingRevenue, 0) + ' 元',
        '這是帳面總銷（未扣折讓與佣金），m8 以此回推土地出價上限，'
        + '因此總銷高估多少，出價上限就跟著高估多少。'),

      absorbMonths: TD.V('m6.absorbMonths', absorbMonths, worse(conf, 'low'),
        '使用者輸入之每月去化戶數（假設值，非市場統計）',
        '去化月數 = 戶數 ' + fnum(unitsCount, 0) + ' 戶 ÷ 每月 ' + fnum(absorbPerMonth, 1) + ' 戶（無條件進位）',
        '假設等速去化，未考慮開案熱銷期與尾盤長尾；去化拉長會同時推高融資利息與管銷，'
        + '在 m8 的敏感度中 absorb 一項就是在測這件事。'),

      drivers: res.drivers,
      comps: res.comps,
      notes: notes,

      /* 供 UI／m7／m8 取用的裸值（不包 V，避免重複進入複核閘門） */
      compSource: picked.label,
      compIsSample: picked.isSample,
      compSkipped: picked.skipped,
      presalePremium: presalePremium,
      absorbPerMonth: absorbPerMonth,
      parkingPricePerStall: stallPrice,
      subject: { ageYears: toNum(sub.ageYears, 0), floor: toNum(sub.floor, 8),
                 areaPing: toNum(sub.areaPing, 35), distanceM: toNum(sub.distanceM, 0) },
      sellablePing: sellablePing,
      stalls: stalls,
      unitsCount: unitsCount
    };
  }

  TD.engine.m6 = m6;
})(window.TD);
