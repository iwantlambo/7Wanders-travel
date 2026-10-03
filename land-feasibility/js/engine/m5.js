/* M5 量體試算：依產品類型推估容積與地上總樓地板、可售坪、戶數、法定與銷售車位、地下室層數、樓層數與高度，並以建技規則第164條檢核高度。*/
window.TD = window.TD || {};
(function (TD) {
  'use strict';

  TD.engine = TD.engine || {};

  /* ------------------------------------------------------------------
     本模組的定位

     量體概算：把法定容積（基準 ＋ 獎勵）依產品類型的係數換算成可售坪、戶數、車位與層數。
     係數有出處（建技規則第162條免計上限、業界銷坪係數、本區實價登錄的戶型與附車位比例），
     但仍不是建築設計：實際平面、梯廳位置與車道配置由建築師排定後，可售坪通常在 ±5% 內位移。
     ------------------------------------------------------------------ */

  var LEGAL_WARNING = '本項為初步判斷，不具法律效力，須由開業建築師簽證。';
  var BT = '建築技術規則建築設計施工編';

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function num(v) { var x = TD.raw(v); return isNum(x) ? x : null; }
  function f(v, d) { return isNum(v) ? TD.fmt.n(v, d === undefined ? 1 : d) : '—'; }
  function fp(v, d) { return isNum(v) ? TD.fmt.pct(v, d === undefined ? 1 : d) : '—'; }

  /* 使用者覆寫 > 自動值；覆寫值超出合理範圍時夾住並記錄 */
  function pick(obj, key, auto, lo, hi, label, notes) {
    var v = obj && isNum(obj[key]) ? obj[key] : null;
    if (v === null) return { v: auto, input: false };
    if (v < lo || v > hi) {
      var c = Math.max(lo, Math.min(hi, v));
      notes.push(label + '輸入 ' + v + ' 超出合理範圍 ' + lo + '～' + hi + '，已夾為 ' + c + '。');
      return { v: c, input: true };
    }
    return { v: v, input: true };
  }

  function m5(p, ctx) {
    p = p || {};
    ctx = ctx || {};
    var s = p.m5 || {};
    var m3 = ctx.m3 || {}, m4 = ctx.m4 || {};
    var notes = [];
    var PING = TD.PING;
    var site = m3.site || (TD.engine.siteOf ? TD.engine.siteOf(p) : { params: {}, assumed: [] });
    var prm = site.params || {};
    var mkt = TD.engine.market;

    /* ---- 參數：使用者覆寫 > 本區實價登錄 > 產品預設 ---- */
    var exemptP = pick(s, 'exemptRatio', isNum(prm.exemptRatio) ? prm.exemptRatio : 0.22, 0, 0.6, '地上免計容積比例', notes);
    var sellP = pick(s, 'sellRatio', isNum(prm.sellRatio) ? prm.sellRatio : 1.2, 0.8, 1.8, '可售係數', notes);
    var pubP = pick(s, 'publicRatio', isNum(prm.publicRatio) ? prm.publicRatio : 0.33, 0, 0.6, '公設比', notes);
    var fhP = pick(s, 'floorHeightM', isNum(prm.floorHeightM) ? prm.floorHeightM : 3.3, 2.8, 6, '樓層高度', notes);
    var perStallP = pick(s, 'basementPerStallM2', 40, 25, 60, '每車位地下室樓地板', notes);

    var us = mkt ? mkt.unitSize(site.city, site.district, site.product) : null;
    var unitAuto = us ? us.ping : (isNum(prm.avgUnitPing) ? prm.avgUnitPing : 30);
    var unitP = pick(s, 'avgUnitPing', unitAuto, 5, 400, '平均每戶坪數', notes);
    var unitFrom = unitP.input ? '使用者輸入' : (us ? us.from : site.product + '常見戶型（本區查無足夠預售案例）');

    var sr = mkt ? mkt.stallRatio(site.city, site.district, site.product) : null;
    var stallRatio = sr ? sr.ratio : (isNum(prm.stallsPerUnit) ? prm.stallsPerUnit : 0.8);
    var stallRatioFrom = sr ? sr.from : site.product + '常見配置（每戶 ' + stallRatio + ' 位）';

    var exemptRatio = exemptP.v, sellRatio = sellP.v, publicRatio = pubP.v, floorH = fhP.v, avgUnitPing = unitP.v;

    /* ---- 上游 ---- */
    var siteM2 = isNum(m3.areaM2Used) ? m3.areaM2Used : (site.siteM2 || 0);
    var bcr = num(m3.bcr), base = num(m3.baseFloorM2), buildAreaM2 = num(m3.buildAreaM2);
    var bonusPct = num(m4.pct);
    if (bonusPct === null) bonusPct = (m4.chosen && isNum(m4.chosen.pct)) ? m4.chosen.pct : 0;
    var baseKnown = base !== null;
    if (!baseKnown) {
      notes.push('缺基準容積（基地面積或容積率未填），量體無法估算。');
      base = 0;
    }

    /* ---- 樓地板與可售 ---- */
    var volFloorM2 = base * (1 + bonusPct);
    var exemptFloorM2 = volFloorM2 * exemptRatio;
    var grossFloorM2 = volFloorM2 + exemptFloorM2;
    var sellablePing = volFloorM2 / PING * sellRatio;
    var mainPing = sellablePing * (1 - publicRatio);
    var unitsCount = (sellablePing > 0 && avgUnitPing > 0) ? Math.max(1, Math.floor(sellablePing / avgUnitPing)) : 0;

    /* ---- 停車：法定（第59條）與銷售需要（每戶配車位）取大 ---- */
    var pk = TD.data.zoning && TD.data.zoning.parking59;
    var cat = pk ? pk.cat[prm.parkingCat || '2'] : null;
    var stallsLegal = (cat && volFloorM2 > 0) ? Math.max(0, Math.ceil((volFloorM2 - cat.exemptM2) / cat.perM2)) : 0;
    var stallsMarket = Math.ceil(unitsCount * stallRatio);
    var stalls = Math.max(stallsLegal, stallsMarket);

    /* ---- 地下室：每位車位樓地板（含車道、坡道與機房分攤）× 車位數；開挖面積以建蔽率＋10% 為原則 ---- */
    var excavRatio = Math.min(0.8, (isNum(bcr) ? bcr : 0.6) + 0.1);
    var perLevelM2 = siteM2 * excavRatio;
    var basementM2 = 0, basementLevels = 0;
    if (prm.basement !== false && stalls > 0) {
      basementM2 = stalls * perStallP.v;
      basementLevels = perLevelM2 > 0 ? Math.ceil(basementM2 / perLevelM2) : 0;
    }

    /* ---- 樓層與高度比（第164條）：在基地內試排「標準層 × 層數」，找放得下總樓地板的配置 ---- */
    var plateMax = isNum(buildAreaM2) ? buildAreaM2 : 0;
    var sw = site.siteWidth, sd = site.siteDepth, sb = isNum(m3.setbackFrontM) ? m3.setbackFrontM : 0;
    var Lf = site.frontageM > 0 ? site.frontageM : sw;
    var fit = (TD.engine.heightFit && plateMax > 0 && sw > 0 && sd > 0 && grossFloorM2 > 0)
      ? TD.engine.heightFit({ Sw: site.roadWidth, Dfront: sb, W: sw, Dsite: sd, L: Lf, plateMax: plateMax,
                              gross: grossFloorM2, floorH: floorH, groundExtra: 1.5 }) : null;
    var plate = plateMax, floorsAbove = plateMax > 0 ? Math.ceil(grossFloorM2 / plateMax) : null;
    var hStatus = 'pass', hNote = '', capped = false, cfg = null;
    if (fit && fit.fit) {
      cfg = fit.cfg;
      plate = cfg.plate; floorsAbove = cfg.floors;
      hNote = '高度比（第164條）：標準層 ' + f(plate, 0) + ' ㎡、臨路面寬 ' + f(cfg.B, 1) + ' m、距建築線 ' + f(cfg.D, 1)
            + ' m，' + floorsAbove + ' 層約 ' + f(floorsAbove * floorH + 1.5, 1) + ' m，在容許高度 ' + f(cfg.H, 1) + ' m 內'
            + (cfg.plateRatio < 1 ? '（標準層縮為建蔽率面積的 ' + Math.round(cfg.plateRatio * 100) + '% 以爭取高度）' : '') + '。';
      if (cfg.plateRatio < 1 || cfg.widthRatio < 1) hStatus = 'warn';
    } else if (fit && !fit.fit && fit.best && fit.best.usable > 0) {
      hStatus = 'fail';
      var ub = fit.best, ratio = Math.min(1, ub.usable / grossFloorM2);
      hNote = '高度比（第164條）：面前道路 ' + f(site.roadWidth, 1) + ' m，基地內任何配置最多約 ' + ub.floors + ' 層（'
            + f(ub.H, 1) + ' m），只能用到約 ' + fp(ratio, 0) + ' 的容積，已依此縮減量體。合併臨接較寬道路之鄰地、'
            + '加大退縮或降低樓層高度可改善。';
      volFloorM2 *= ratio; exemptFloorM2 *= ratio; grossFloorM2 *= ratio;
      sellablePing *= ratio; mainPing *= ratio;
      unitsCount = (sellablePing > 0 && avgUnitPing > 0) ? Math.max(1, Math.floor(sellablePing / avgUnitPing)) : 0;
      stallsLegal = (cat && volFloorM2 > 0) ? Math.max(0, Math.ceil((volFloorM2 - cat.exemptM2) / cat.perM2)) : 0;
      stallsMarket = Math.ceil(unitsCount * stallRatio);
      stalls = Math.max(stallsLegal, stallsMarket);
      if (prm.basement !== false && stalls > 0) {
        basementM2 = stalls * perStallP.v;
        basementLevels = perLevelM2 > 0 ? Math.ceil(basementM2 / perLevelM2) : 0;
      }
      plate = ub.plate; floorsAbove = ub.floors;
      capped = true;
    }
    if (floorsAbove !== null && floorsAbove >= 6 && prm.basement !== false && basementLevels < 1 && perLevelM2 > 0) {
      basementLevels = 1;
      basementM2 = Math.max(basementM2, perLevelM2);
      notes.push('地上 6 層以上須附建防空避難設備（' + BT + '第140條），實務上以地下室兼作停車空間，已至少計入一層地下室 '
               + f(basementM2, 0) + ' ㎡。');
    }
    var heightM = floorsAbove !== null ? floorsAbove * floorH + 1.5 : null;
    var hBlock = isNum(m3.heightMaxBlockM) ? m3.heightMaxBlockM : null;
    var hTower = isNum(m3.heightMaxTowerM) ? m3.heightMaxTowerM : null;
    if (hNote) notes.push(hNote);

    var assumedConf = site.assumed && site.assumed.length ? 'low' : 'mid';
    if (site.assumed && site.assumed.length) {
      notes.push('層數、高度與地下室依推估的基地寬深與路寬計算（' + site.assumed.join('；') + '），補上實際值會自動重算。');
    }
    notes.push('可售坪 ＝ 容積樓地板 × 可售係數 ' + f(sellRatio, 2) + '（不含車位；業界銷坪係數含車位約 1.55～1.6 倍，'
             + '扣除車位登記面積後約 1.2 倍）。車位另以「每位單價」計收入。');

    if (!baseKnown) {
      /* 沒有基準容積就沒有量體：一律回 null，不用 0 冒充「算出來是零」 */
      volFloorM2 = null; exemptFloorM2 = null; grossFloorM2 = null; sellablePing = null; mainPing = null;
      unitsCount = null; stalls = null; stallsLegal = null; stallsMarket = null; basementM2 = null; basementLevels = null;
      floorsAbove = null; heightM = null;
    }
    var C = 'mid';
    var volSrc = '基準容積（法規檢討）×（1＋容積獎勵）';
    var out = {
      volFloorM2: TD.V('m5.volFloorM2', volFloorM2, C, volSrc,
        '容積樓地板 = 基準容積 ' + f(base, 1) + ' ㎡ ×（1 ＋ 獎勵 ' + fp(bonusPct, 1) + '）' + (capped ? ' × 高度比可用比例' : ''),
        capped ? '受第164條高度比限制，已縮減。' : '依法定容積計算。'),

      exemptFloorM2: TD.V('m5.exemptFloorM2', exemptFloorM2, exemptP.input ? 'input' : C,
        BT + '第162條（陽臺、梯廳各不超過該層 10%、合計 15%）、屋突與地上機電',
        '地上免計容積 = 容積樓地板 ' + f(volFloorM2, 0) + ' ㎡ × ' + fp(exemptRatio, 0),
        site.product + '常見值；陽臺與梯廳上限為各層 15%，屋突約 3～5%，地上機電約 2～3%。'),

      grossFloorM2: TD.V('m5.grossFloorM2', grossFloorM2, C, volSrc + '＋地上免計容積',
        '地上總樓地板 = 容積樓地板 ' + f(volFloorM2, 0) + ' ＋ 免計 ' + f(exemptFloorM2, 0) + ' ㎡',
        '營建成本以此面積（地上）與地下室面積分別計價。'),

      basementM2: TD.V('m5.basementM2', basementM2, C,
        '車位數 × 每位地下室樓地板；開挖面積以法定建蔽率加 10% 為原則',
        prm.basement === false ? site.product + '不設地下室（車位設於一樓）'
          : '地下室 = 車位 ' + f(stalls, 0) + ' 位 × ' + f(perStallP.v, 0) + ' ㎡（含車道、坡道與機房分攤）→ '
            + basementLevels + ' 層（每層可開挖約 ' + f(perLevelM2, 0) + ' ㎡ ＝ 基地 × ' + fp(excavRatio, 0) + '）',
        '地下室每層開挖面積受開挖率、鄰房保護與地質影響。'),

      sellablePing: TD.V('m5.sellablePing', sellablePing, sellP.input ? 'input' : C,
        '容積樓地板 × 可售係數（' + site.product + '）',
        '可售坪 = 容積樓地板 ' + f(volFloorM2 / PING, 1) + ' 坪 × ' + f(sellRatio, 2),
        '不含車位面積（實價登錄單價亦已扣除車位）；車位收入另計。'),

      mainPing: TD.V('m5.mainPing', mainPing, pubP.input ? 'input' : C, '可售坪 ×（1 − 公設比）',
        '主建物與附屬建物 = 可售坪 ' + f(sellablePing, 1) + ' × （1 − ' + fp(publicRatio, 0) + '）',
        '公設比為' + site.product + '常見值，供換算室內實際使用面積。'),

      publicRatio: TD.V('m5.publicRatio', publicRatio, pubP.input ? 'input' : C, site.product + '常見公設比',
        '公設比 ' + fp(publicRatio, 0), '新北、臺北新建大樓公設比多在 30～38%。'),

      unitsCount: TD.V('m5.unitsCount', unitsCount, unitP.input ? 'input' : C, unitFrom,
        '戶數 = 可售坪 ' + f(sellablePing, 1) + ' ÷ 每戶 ' + f(avgUnitPing, 1) + ' 坪（無條件捨去）',
        '戶數決定銷售車位數與去化月數。'),

      stalls: TD.V('m5.stalls', stalls, C, BT + '第59條；' + stallRatioFrom,
        '車位 = max（法定 ' + f(stallsLegal, 0) + ' 位, 戶數 ' + f(unitsCount, 0) + ' × ' + f(stallRatio, 2) + ' ＝ ' + f(stallsMarket, 0) + ' 位）',
        (cat ? '法定：' + cat.label + '，容積樓地板 ' + f(volFloorM2, 0) + ' ㎡ 扣除 ' + cat.exemptM2 + ' ㎡ 後每 ' + cat.perM2 + ' ㎡ 一位，零數設一位。' : '')
        + '銷售需要以本區預售成交中附車位的比例推估。細部計畫另有較嚴規定者從其規定。'),

      floorsAbove: TD.V('m5.floorsAbove', floorsAbove, assumedConf, '地上總樓地板 ÷ 標準層面積',
        '地上層數 = ' + f(grossFloorM2, 0) + ' ㎡ ÷ 標準層 ' + f(plate, 0) + ' ㎡（無條件進位）',
        '標準層面積取建蔽率面積與退縮後可建範圍之較小者。'),

      volFloors: TD.V('m5.volFloors', (plate > 0 && volFloorM2 !== null) ? Math.ceil(volFloorM2 / plate) : null, assumedConf, '容積樓地板 ÷ 標準層面積',
        '容積層數 = ' + f(volFloorM2, 0) + ' ㎡ ÷ ' + f(plate, 0) + ' ㎡', '僅供對照；實際層數見地上層數。'),

      heightM: TD.V('m5.heightM', heightM, assumedConf, BT + '第164條（高度檢核）',
        '高度 = ' + f(floorsAbove, 0) + ' 層 × ' + f(floorH, 1) + ' m ＋ 一樓挑高 1.5 m',
        hNote || '未含屋突與女兒牆。'),

      notes: notes,
      legalWarning: LEGAL_WARNING,

      /* 裸值（供 m6／m7／UI） */
      product: site.product,
      siteAreaM2: siteM2,
      baseFloorM2: base,
      bonusPct: bonusPct,
      buildAreaM2: buildAreaM2,
      plateM2: plate,
      basementLevels: basementLevels,
      excavRatio: excavRatio,
      parkingRequired: stallsLegal,
      stallsLegal: stallsLegal,
      stallsMarket: stallsMarket,
      stallRatio: stallRatio,
      stallRatioFrom: stallRatioFrom,
      avgUnitPingFrom: unitFrom,
      heightCheck: { status: hStatus, note: hNote, limitBlockM: hBlock, limitTowerM: hTower, capped: capped, cfg: cfg,
                     limitM: cfg ? cfg.H : (fit && fit.best ? fit.best.H : null) },
      params: {
        exemptRatio: exemptRatio, sellRatio: sellRatio, publicRatio: publicRatio,
        avgUnitPing: avgUnitPing, basementPerStallM2: perStallP.v, floorHeightM: floorH
      }
    };
    return out;
  }

  TD.engine.m5 = m5;
})(window.TD);
