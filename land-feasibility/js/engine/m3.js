/* M3 法規檢討：查分區建蔽率與容積率，並依建築技術規則、建築法與地方規定逐項計算畸零地、臨路、退縮、高度比、日照、防火間隔、停車與分區用途。*/
window.TD = window.TD || {};
(function (TD) {
  'use strict';

  TD.engine = TD.engine || {};

  /* ------------------------------------------------------------------
     設計說明（複核者請先讀）

     1. 每一項檢核都依法規條文「算出來」，結果只有五種：
        'pass' 通過、'fail' 不通過、'warn' 注意（算得出來，但結果需要設計手段或另行確認）、
        'na' 不適用、'info' 提醒（細部計畫但書這類只能看計畫書的事項，列出要核對的清單）。
        舊版的「算不出來（manual）」已取消：缺輸入時採明示的預設值（例如路寬 8 公尺、
        以面積推估寬深），信心降為 low 並在說明寫清楚，使用者補上實際值就會重算。
     2. 法規數值的信心：法規明文 'high'；地方常見值或預設 'mid'；用了預設輸入 'low'。
     3. 檢核用的「預估高度」以基準容積、產品樓層高度與建蔽率估算（量體段之後才有含獎勵的
        實際層數，量體段會再用同一套規則檢核一次）。
     4. 純函式：不碰 document、不碰 localStorage、不發任何網路請求。
     ------------------------------------------------------------------ */

  var LABELS = {
    zoneUse: '分區允許用途',
    oddLot: '畸零地',
    roadWidth: '臨路寬度',
    setback: '退縮',
    heightRatio: '高度比',
    sunlight: '日照',
    fireGap: '防火間隔',
    parking: '停車',
    detailPlan: '細部計畫但書'
  };

  var BT = '建築技術規則建築設計施工編';

  /* ---------------- 小工具 ---------------- */

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function hasOwn(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function n(v, d) { return TD.fmt.n(v, d === undefined ? 1 : d); }
  function pctStr(v) { return TD.fmt.pct(v, 1); }
  function pingOf(m2) { return m2 / TD.PING; }

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
      conf: conf || 'mid'
    };
  }

  /* 使用者把某一項人工結案：p.m3.manualChecks[id] = 'pass'|'fail'|'warn'|'na' 或 {status,note,by} */
  function applyManualDecision(chk, val) {
    var st = null, note = '', by = '';
    if (val === undefined || val === null || val === '' || val === false) return chk;
    if (val === true) st = 'pass';
    else if (typeof val === 'string') st = val;
    else if (typeof val === 'object') { st = val.status; note = val.note ? String(val.note) : ''; by = val.by ? String(val.by) : ''; }
    if (['pass', 'fail', 'warn', 'na', 'info'].indexOf(st) < 0) return chk;
    chk.autoStatus = chk.status;
    chk.autoNote = chk.note;
    chk.status = st;
    chk.conf = 'input';
    chk.note = '使用者人工判定為「' + st + '」' + (by ? '（複核人：' + by + '）' : '') + (note ? '：' + note : '') + '。'
             + '系統原判定為「' + chk.autoStatus + '」，原說明：' + chk.autoNote;
    return chk;
  }

  /* §164：實施容積管制地區之高度。整排臨路建築（面寬＝臨路長度 L）時，
     陰影面積限制 L×(H/3.6−D) ≤ L×Sw/2 → H ≤ 3.6 ×（D ＋ Sw/2）；
     陰影不得超過道路對側境界線 → H ≤ 3.6 ×（Sw ＋ D）。兩者取小。
     建築物臨路面寬 B 小於 L（塔樓）時，面積限制放寬為 H ≤ 3.6 ×（D ＋ L×Sw/(2B)）。*/
  function hMax164(Sw, D, L, B) {
    if (!(Sw > 0)) return null;
    var dd = Math.max(0, D || 0);
    var ratio = (L > 0 && B > 0) ? Math.max(0.5, L / (2 * B)) : 0.5;
    return Math.min(3.6 * (Sw + dd), 3.6 * (dd + Sw * ratio));
  }

  /* 高度比配置試算：在基地內找一個「標準層面積 × 層數」放得下總樓地板、又滿足第164條的配置。
     依序嘗試：標準層取建蔽率面積（逐步縮小到四成）、臨路面寬取基地寬的 100%／80%／60%，
     量體一律盡量往後退（D 越大，容許高度越高；前方留作法定空地）。
     回傳第一個放得下的配置（最接近滿建蔽、最省成本），或放不下時可用到的最大總樓地板。
     o：{ Sw 路寬, Dfront 臨路退縮, W 基地寬, Dsite 基地深, L 臨路長, plateMax 建蔽率面積, gross 需要的地上總樓地板,
          floorH 樓層高, groundExtra 一樓加高 } */
  function heightFit(o) {
    var plates = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4], widths = [1, 0.8, 0.6], i, j, P, B, depth, D, H, nMax, n;
    var best = { usable: 0 }, first = null;
    if (!(o.Sw > 0) || !(o.W > 0) || !(o.Dsite > 0) || !(o.plateMax > 0)) return null;
    for (i = 0; i < plates.length && !first; i++) {
      P = o.plateMax * plates[i];
      for (j = 0; j < widths.length; j++) {
        B = Math.min(o.W, o.L > 0 ? o.L : o.W) * widths[j];
        depth = P / B;
        if (depth > o.Dsite - o.Dfront + 1e-9) continue;
        D = Math.max(o.Dfront, o.Dsite - depth);
        H = hMax164(o.Sw, D, o.L > 0 ? o.L : o.W, B);
        nMax = Math.max(0, Math.floor((H - o.groundExtra) / o.floorH));
        n = Math.ceil(o.gross / P);
        if (nMax * P > best.usable) best = { usable: nMax * P, plate: P, B: B, D: D, H: H, floors: nMax };
        if (n <= nMax) { first = { plate: P, B: B, D: D, H: H, floors: n, plateRatio: plates[i], widthRatio: widths[j] }; break; }
      }
    }
    return { fit: !!first, cfg: first, best: best,
             hFront: hMax164(o.Sw, o.Dfront, o.L > 0 ? o.L : o.W, Math.min(o.W, o.L > 0 ? o.L : o.W)) };
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

    var site = (ctx.m1 && ctx.m1.site) ? ctx.m1.site : (TD.engine.siteOf ? TD.engine.siteOf(p) : null);
    if (!site) site = { city: '', district: '', zone: null, assumed: [], siteM2: 0, roadWidth: 8, params: {} };
    var z = site.zone;
    var city = site.city, zoneCode = site.zoneInput;
    var cityData = (TD.data && TD.data.zoning && TD.data.zoning.cities && hasOwn(TD.data.zoning.cities, city))
      ? TD.data.zoning.cities[city] : null;

    if (!cityData) notes.push('查無「' + (city || '（未填縣市）') + '」的分區資料，請先選擇縣市。');
    else if (!z) notes.push('分區「' + (zoneCode || '（未填）') + '」不在' + city + '的分區表內，請改選清單中的分區，或直接輸入建蔽率與容積率。');

    /* ---- 面積 ---- */
    var areaM2 = null, areaSrc = '';
    if (ctx.m1 && isNum(TD.raw(ctx.m1.areaM2)) && TD.raw(ctx.m1.areaM2) > 0) { areaM2 = TD.raw(ctx.m1.areaM2); areaSrc = '地號面積合計'; }
    else if (site.siteM2 > 0) { areaM2 = site.siteM2; areaSrc = '地號面積合計'; }
    if (!isNum(areaM2) || areaM2 <= 0) {
      areaM2 = null;
      notes.push('基地面積為 0，建築面積與基準容積無法計算。請先在左欄填入地號面積（以謄本標示部為準）。');
    }

    /* ---- 建蔽率／容積率 ---- */
    var zSrc = z ? (z.src || (cityData ? cityData.lawName : '')) : '';
    var zConf = z ? (z.conf || 'mid') : 'mid';
    var bcrV, farV, bcrIsInput = false, farIsInput = false;

    if (isNum(ov.bcr)) {
      bcrIsInput = true;
      bcrV = TD.V('m3.bcr', ov.bcr, 'input', '使用者輸入（依土地使用分區證明書）', '建蔽率 = 使用者輸入',
                  '已覆蓋分區表數值' + (z && isNum(z.bcr) ? '（分區表 ' + pctStr(z.bcr) + '）' : '') + '。');
    } else if (z && isNum(z.bcr)) {
      bcrV = TD.V('m3.bcr', z.bcr, zConf, zSrc, '建蔽率 = ' + city + '「' + z.name + '」', z.note);
    } else {
      bcrV = TD.V('m3.bcr', null, 'input', '使用者輸入', '建蔽率 = 請輸入',
                  '本分區沒有通案建蔽率，請依土地使用分區證明書於左側輸入。');
    }

    if (isNum(ov.far)) {
      farIsInput = true;
      farV = TD.V('m3.far', ov.far, 'input', '使用者輸入（依土地使用分區證明書）', '容積率 = 使用者輸入',
                  '已覆蓋分區表數值' + (z && isNum(z.far) ? '（分區表 ' + pctStr(z.far) + '）' : '') + '。');
    } else if (z && isNum(z.far)) {
      farV = TD.V('m3.far', z.far, zConf, zSrc,
                  '容積率 = ' + city + '「' + z.name + '」' + (z.farReason ? '（' + z.farReason + '）' : ''), z.note);
    } else {
      farV = TD.V('m3.far', null, 'input', '使用者輸入', '容積率 = 請輸入',
                  '本分區沒有通案容積率，請依土地使用分區證明書於左側輸入。');
    }

    var bcr = TD.raw(bcrV);
    var far = TD.raw(farV);

    var buildAreaM2 = (isNum(areaM2) && isNum(bcr)) ? areaM2 * bcr : null;
    var baseFloorM2 = (isNum(areaM2) && isNum(far)) ? areaM2 * far : null;

    var buildAreaV = TD.V('m3.buildAreaM2', buildAreaM2, bcrIsInput ? 'input' : zConf,
                          bcrIsInput ? '使用者輸入之建蔽率 × 基地面積' : zSrc,
                          '建築面積上限 = 基地面積 ' + n(areaM2, 2) + ' ㎡ × 建蔽率 ' + (isNum(bcr) ? pctStr(bcr) : '—'),
                          '法定上限；退縮、法定空地位置與車道出入口會讓實際配置略小，見本表「退縮」。');
    var baseFloorV = TD.V('m3.baseFloorM2', baseFloorM2, farIsInput ? 'input' : zConf,
                          farIsInput ? '使用者輸入之容積率 × 基地面積' : zSrc,
                          '基準容積樓地板 = 基地面積 ' + n(areaM2, 2) + ' ㎡ × 容積率 ' + (isNum(far) ? pctStr(far) : '—'),
                          '約 ' + (isNum(baseFloorM2) ? n(pingOf(baseFloorM2), 1) + ' 坪' : '—')
                        + '；不含容積獎勵與免計容積。');

    var assumedNote = site.assumed && site.assumed.length ? '（' + site.assumed.join('；') + '）' : '';
    var roadConf = site.roadWidthInput ? 'high' : 'low';
    var shapeConf = site.shapeAssumed ? 'low' : 'high';
    var prm = site.params || {};
    var floorH = isNum(prm.floorHeightM) ? prm.floorHeightM : 3.3;

    /* 預估高度：基準容積 ×（1＋免計比例）÷ 建築面積，取整層 × 樓層高度（一樓另加 1 公尺） */
    var estFloors = (isNum(baseFloorM2) && isNum(buildAreaM2) && buildAreaM2 > 0)
      ? Math.ceil(baseFloorM2 * (1 + (isNum(prm.exemptRatio) ? prm.exemptRatio : 0.3)) / buildAreaM2) : null;
    var estH = isNum(estFloors) ? estFloors * floorH + 1.5 : null;

    /* ================= 1. 分區允許用途 ================= */
    if (z) {
      if (site.useConflict) {
        checks.push(mk('zoneUse', 'fail', site.product + '（' + z.name + '）', z.name + '允許使用項目', zSrc,
          site.useConflict, zConf));
      } else {
        checks.push(mk('zoneUse', 'pass', site.product + (site.productAuto ? '（依分區自動判定）' : '（使用者指定）'),
          z.name + '允許使用項目', zSrc,
          (z.allowRes ? z.name + '可作住宅使用。' : z.name + '不得作住宅使用，以' + site.product + '試算（比價亦採同類產品）。')
          + (z.cls === '工' ? '工業區建物限工業、產業與其必要附屬設施使用，一般事務所等一般商業設施有面積比例限制。' : ''),
          zConf));
      }
    }

    /* ================= 2. 畸零地（建築法第44條；保守門檻） ================= */
    var odd = cityData && cityData.oddLot ? cityData.oddLot : (TD.data.zoning ? TD.data.zoning.oddConservative : null);
    var oddLaw = '建築法第44條、第45條；' + city + '畸零地使用規則（自治條例）附表';
    var sw = site.siteWidth, sd = site.siteDepth;
    if (!(sw > 0) || !(sd > 0)) {
      checks.push(mk('oddLot', 'warn', '缺面積', '基地寬度與深度達畸零地最小標準', oddLaw,
        '尚未輸入地號面積，無法推估基地寬深。', 'low'));
    } else if (sw >= odd.minWidth && sd >= odd.minDepth) {
      checks.push(mk('oddLot', 'pass', '寬 ' + n(sw, 1) + ' m × 深 ' + n(sd, 1) + ' m',
        '寬 ≥ ' + odd.minWidth + ' m、深 ≥ ' + odd.minDepth + ' m（全國最嚴標準，達到即非畸零地）', oddLaw,
        odd.note + (site.shapeAssumed ? '寬深為依面積推估' + assumedNote + '，不規則地形請輸入實際寬深。' : ''), shapeConf));
    } else if (sw < 3 || sd < 12) {
      checks.push(mk('oddLot', 'fail', '寬 ' + n(sw, 1) + ' m × 深 ' + n(sd, 1) + ' m',
        '各縣市住宅區最小寬度約 3～5 公尺、深度 12～20 公尺', oddLaw,
        '寬度未達 3 公尺或深度未達 12 公尺，在所有縣市都屬畸零地：非與鄰地協議調整地形或合併使用，不得建築（建築法第44條），'
        + '協議不成得申請調處（第45條）。' + (site.shapeAssumed ? '寬深為推估值，請輸入實際寬深。' : ''), shapeConf));
    } else {
      checks.push(mk('oddLot', 'warn', '寬 ' + n(sw, 1) + ' m × 深 ' + n(sd, 1) + ' m',
        '依' + city + '畸零地使用規則附表（依分區與正面路寬 ' + n(site.roadWidth, 0) + ' m 分級）', oddLaw,
        '未達全國最嚴標準（寬 7 公尺、深 20 公尺），但高於各縣市最低標準；請以' + city + '畸零地使用規則附表核對該分區與路寬級距的最小寬深。'
        + (site.shapeAssumed ? '寬深為推估值。' : ''), shapeConf));
    }

    /* ================= 3. 臨路寬度（建築法第42條、第48條） ================= */
    var rw = site.roadWidth;
    var roadLaw = '建築法第42條、第48條；' + BT + '第1條第36款（道路之定義）';
    var roadNote = '路寬決定容積率級距（新北市細部計畫：未達 8 公尺者住宅區 200%、商業區 320%）、高度比與車道出入口，'
                 + '以都市計畫道路寬度或指定建築線圖為準。' + (site.roadWidthInput ? '' : assumedNote);
    if (rw >= 8) {
      checks.push(mk('roadWidth', 'pass', '面前道路 ' + n(rw, 1) + ' m' + (site.roadCount >= 2 ? '（' + site.roadCount + ' 面臨路）' : ''),
        '臨接計畫道路並與建築線相連接；8 公尺以上不受窄路容積折減', roadLaw, roadNote, roadConf, rw));
    } else if (rw >= 6) {
      checks.push(mk('roadWidth', 'warn', '面前道路 ' + n(rw, 1) + ' m',
        '6 公尺以上未達 8 公尺：可建築，但容積率可能折減、車道與消防救災動線受限', roadLaw, roadNote, roadConf, rw));
    } else {
      checks.push(mk('roadWidth', 'warn', '面前道路 ' + n(rw, 1) + ' m',
        '未達 6 公尺：多屬現有巷道，須申請指定建築線並可能退讓至一定寬度', roadLaw,
        roadNote + '窄巷基地常見後果：退縮加大、車道無法設置、消防救災動線不符而降低量體。', roadConf, rw));
    }

    /* ================= 4. 退縮（細部計畫土管要點；建築法第48條但書） ================= */
    var sbCity = cityData && cityData.setback ? cityData.setback : { frontM: 0, note: '' };
    var sbFront = isNum(cfg.setbackFrontM) && cfg.setbackFrontM >= 0 ? cfg.setbackFrontM : (isNum(sbCity.frontM) ? sbCity.frontM : 0);
    var sbIsInput = isNum(cfg.setbackFrontM) && cfg.setbackFrontM >= 0;
    var sbLaw = '建築法第48條（都市細部計畫規定須退縮建築時從其規定）；' + city + '各該細部計畫土地使用分區管制要點';
    var depthAvail = (sd > 0) ? sd - sbFront : null;
    var footNeed = buildAreaM2;
    var footCap = (sw > 0 && isNum(depthAvail)) ? sw * Math.max(0, depthAvail) : null;
    if (isNum(footNeed) && isNum(footCap)) {
      var fits = footCap >= footNeed * 0.999;
      checks.push(mk('setback', fits ? 'pass' : 'warn',
        '臨路退縮 ' + n(sbFront, 1) + ' m（' + (sbIsInput ? '使用者輸入' : '預設') + '）',
        '退縮後可建範圍 ' + n(footCap, 0) + ' ㎡ ' + (fits ? '≥' : '<') + ' 建蔽率面積 ' + n(footNeed, 0) + ' ㎡',
        sbLaw,
        (fits ? '退縮後仍容得下法定建築面積，量體不受影響；退縮部分多可計入法定空地。'
              : '退縮後放不下全部建築面積，每層面積須縮小、層數增加（量體段會依此估算）。')
        + (sbCity.note || '') + (site.shapeAssumed ? '基地寬深為推估值。' : ''),
        sbIsInput ? 'input' : 'mid', sbFront));
    } else {
      checks.push(mk('setback', 'warn', '臨路退縮 ' + n(sbFront, 1) + ' m', '依細部計畫退縮規定', sbLaw,
        '缺基地面積或建蔽率，無法檢核退縮後的可建範圍。' + (sbCity.note || ''), 'low', sbFront));
    }

    /* ================= 5. 高度比（建技規則第164條，實施容積管制地區） ================= */
    var hLaw = BT + '第164條（實施容積管制地區，第166條排除第14條之高度限制）';
    var Lf = site.frontageM > 0 ? site.frontageM : sw;
    var hBlock = hMax164(rw, sbFront, Lf, Lf);
    var hTower = hMax164(rw, sbFront, Lf, Lf * 0.6);
    var fitBase = (isNum(baseFloorM2) && isNum(buildAreaM2)) ? heightFit({
      Sw: rw, Dfront: sbFront, W: sw, Dsite: sd, L: Lf, plateMax: buildAreaM2,
      gross: baseFloorM2 * (1 + (isNum(prm.exemptRatio) ? prm.exemptRatio : 0.22)), floorH: floorH, groundExtra: 1.5
    }) : null;
    var hRear = (fitBase && fitBase.best && isNum(fitBase.best.H)) ? fitBase.best.H : null;
    if (!isNum(hBlock)) {
      checks.push(mk('heightRatio', 'warn', '缺路寬', 'H ≤ 3.6 ×（Sw ＋ D）且陰影面積 ≤ L × Sw ÷ 2', hLaw, '請輸入面前道路寬度。', 'low'));
    } else {
      var hv = (fitBase && fitBase.cfg)
        ? '約 ' + n(fitBase.cfg.floors * floorH + 1.5, 1) + ' m ≤ 容許 ' + n(fitBase.cfg.H, 1) + ' m'
        : '臨路整排容許 ' + n(hBlock, 1) + ' m';
      var hReq = '§164：各部分高度 H ≤ 3.6 ×（面前道路寬 Sw ＋ 該部分至建築線距離 D），且 3.6：1 斜率陰影面積 ≤ 臨路長 L × Sw ÷ 2'
               + '（Sw ' + n(rw, 1) + ' m、L ' + n(Lf, 1) + ' m）';
      var hNote2;
      if (!fitBase) {
        checks.push(mk('heightRatio', 'warn', hv, hReq, hLaw, '缺基地面積或建蔽率，無法試排配置。', 'low', hBlock));
      } else if (fitBase.fit && fitBase.cfg) {
        var c0 = fitBase.cfg;
        var atFront = c0.D <= sbFront + 0.5 && c0.plateRatio === 1 && c0.widthRatio === 1;
        hNote2 = '以基準容積試排：標準層 ' + n(c0.plate, 0) + ' ㎡（建蔽率面積的 ' + Math.round(c0.plateRatio * 100) + '%）、臨路面寬 '
               + n(c0.B, 1) + ' m、距建築線 ' + n(c0.D, 1) + ' m，' + c0.floors + ' 層約 ' + n(c0.floors * floorH + 1.5, 1)
               + ' m，在容許高度 ' + n(c0.H, 1) + ' m 內。'
               + (atFront ? '' : '量體需往後退、前方留作法定空地（實務常見配置）。')
               + '量體段會以含獎勵的總樓地板再試排一次。基地對側為永久性空地時陰影面積得加倍。'
               + (site.roadWidthInput ? '' : assumedNote);
        checks.push(mk('heightRatio', 'pass', hv, hReq, hLaw, hNote2, roadConf, c0.H));
      } else {
        var ub = fitBase.best;
        var usableRatio = ub.usable > 0 ? ub.usable / (baseFloorM2 * (1 + (isNum(prm.exemptRatio) ? prm.exemptRatio : 0.22))) : 0;
        hNote2 = '路寬 ' + n(rw, 1) + ' m 下，基地內任何配置的容許高度都不足以放下基準容積：最多約 ' + ub.floors + ' 層、可用約 '
               + pctStr(usableRatio) + '。須合併臨接較寬道路的鄰地、加大退縮或降低樓層高度。' + (site.roadWidthInput ? '' : assumedNote);
        checks.push(mk('heightRatio', 'warn', hv, hReq, hLaw, hNote2, roadConf, ub.H));
      }
    }

    /* ================= 6. 日照（建技規則第39條之1） ================= */
    var sunLaw = BT + '第39條之1';
    if (fitBase && fitBase.cfg) estH = fitBase.cfg.floors * floorH + 1.5;
    var north = site.northZone === 'same' ? (z ? z.cls : '') : site.northZone;
    var northIsProtected = (north === '住' || north === '商');
    var northLabel = { '住': '住宅區', '商': '商業區', '工': '工業區', '道路': '道路或永久性空地', '其他': '其他分區' }[north] || '未知';
    if (isNum(estH) && estH <= 21) {
      checks.push(mk('sunlight', 'pass', '預估高度約 ' + n(estH, 1) + ' m', '高度超過 21 公尺之部分須使鄰近住宅區或商業區基地冬至日有 1 小時以上有效日照',
        sunLaw, '建築物高度未超過 21 公尺，第39條之1 不適用。', 'high'));
    } else if (!northIsProtected) {
      checks.push(mk('sunlight', 'pass', '北側鄰地：' + northLabel + (site.northZone === 'same' ? '（與本基地同分區，推定）' : ''),
        '保護對象為鄰近之住宅區或商業區基地', sunLaw,
        '北側鄰地非住宅區或商業區，第39條之1 之日照檢討不適用。若北側實際為住宅區，請在左欄「北側鄰地分區」改選。',
        site.northZone === 'same' ? 'mid' : 'input'));
    } else {
      checks.push(mk('sunlight', 'warn', '預估高度約 ' + (isNum(estH) ? n(estH, 1) : '—') + ' m；北側鄰地：' + northLabel,
        '冬至日使北側鄰地有 1 小時以上有效日照，或符合免檢討條件', sunLaw,
        '須檢討日照。免檢討條件（擇一）：（一）單幢且投影於北向面寬不超過 10 公尺；（二）外牆自北向境界線退縮 6 公尺以上且北向面寬合計不超過 20 公尺；'
        + '（三）本基地與北側鄰地均為商業區並留設 3 公尺以上院落。規劃上通常以北側退縮 6 公尺、控制北向面寬處理，量體影響有限。',
        'high'));
    }

    /* ================= 7. 防火間隔（建技規則第110條） ================= */
    var fireLaw = BT + '第110條（防火構造建築物）';
    checks.push(mk('fireGap', 'pass', '防火構造（RC／SRC）', '自境界線退縮未達 1.5 m 之外牆 1 小時防火時效；1.5～3 m 半小時；避難層出入口留設 1.5 m 避難通路至道路',
      fireLaw,
      '防火構造建築物不強制退縮防火間隔，貼近境界線的外牆與開口改以防火時效處理（臨接 6 公尺以上道路側免）；'
      + '避難層出入口應留設淨寬 1.5 公尺避難通路接至道路，可兼作防火間隔。對量體影響僅在側牆開窗與立面設計。'
      + (rw < 6 ? '本案面前道路未達 6 公尺，臨路側亦適用第110條。' : ''), 'high'));

    /* ================= 8. 停車（建技規則第59條） ================= */
    var pk = TD.data.zoning && TD.data.zoning.parking59 ? TD.data.zoning.parking59 : null;
    var catId = prm.parkingCat || '2';
    var cat = pk && pk.cat ? pk.cat[catId] : null;
    var parkLaw = BT + '第59條（都市計畫內區域）；都市計畫書另有規定者從其規定';
    if (!cat || !isNum(baseFloorM2)) {
      checks.push(mk('parking', 'warn', '缺基準容積', '依用途類別換算法定停車位', parkLaw, '缺基地面積或容積率。', 'low'));
    } else {
      var stalls = Math.max(0, Math.ceil((baseFloorM2 - cat.exemptM2) / cat.perM2));
      checks.push(mk('parking', 'pass', '以基準容積計，法定應設 ' + n(stalls, 0) + ' 位',
        cat.label + '：' + cat.exemptM2 + ' ㎡ 以下免設，超過部分每 ' + cat.perM2 + ' ㎡ 設一位，零數設一位', parkLaw,
        '算式：（基準容積樓地板 ' + n(baseFloorM2, 0) + ' ㎡ − ' + cat.exemptM2 + ' ㎡）÷ ' + cat.perM2 + ' ＝ ' + n(stalls, 0) + ' 位。'
        + '量體段會以含獎勵的樓地板重算，並取「法定應設」與「每戶一位」較大者作為銷售車位數。'
        + '部分細部計畫訂有較嚴標準（例如每 100～120 ㎡ 一位或每戶一位），請以分區證明書所附規定為準。'
        + '停車空間依第162條不計入容積。', 'high', stalls));
    }

    /* ================= 9. 細部計畫但書（提醒） ================= */
    checks.push(mk('detailPlan', 'info', '分區證明書與細部計畫土管要點',
      '個案實際管制以該地號之土地使用分區證明書、都市計畫書及細部計畫土地使用分區管制要點為準',
      '都市計畫法第22條、第32條；建築法第48條',
      '本表已套用' + (city || '該縣市') + '的通案規定' + (z && z.farReason ? '（' + z.farReason + '）' : '')
      + '。申請分區證明書時請一併核對：（1）建蔽率、容積率是否另訂；（2）退縮與無遮簷人行道寬度；（3）停車空間是否加嚴；'
      + '（4）有無附帶條件（回饋、捐地、整體開發）；（5）是否位於都市設計審議範圍；（6）有無公共設施保留地或既成道路夾雜。',
      'mid'));

    /* ---- 人工判定 ---- */
    var i;
    for (i = 0; i < checks.length; i++) {
      if (hasOwn(manualChecks, checks[i].id)) applyManualDecision(checks[i], manualChecks[checks[i].id]);
    }

    var blockers = [], warnCount = 0, failCount = 0;
    for (i = 0; i < checks.length; i++) {
      if (checks[i].status === 'fail') { blockers.push(checks[i].label); failCount++; }
      if (checks[i].status === 'warn') warnCount++;
    }
    if (blockers.length) notes.push('不通過：' + blockers.join('、') + '。解決前本案量體與出價上限只是假設值。');
    if (site.assumed && site.assumed.length) notes.push('以下欄位使用預設值試算：' + site.assumed.join('；') + '。補上實際值會自動重算。');
    notes.push('法規檢討為初步判斷，不具法律效力，須由開業建築師簽證；分區、退縮與但書以主管機關核發文件為準。');

    return {
      bcr: bcrV,
      far: farV,
      buildAreaM2: buildAreaV,
      baseFloorM2: baseFloorV,
      zoneSource: (zSrc || '分區資料') + '｜' + (city || '（未填縣市）') + ' ' + (z ? z.name : (zoneCode || '（未填分區）'))
                + (z && z.farReason ? '｜' + z.farReason : ''),
      checks: checks,
      blockers: blockers,
      manualCount: 0,
      warnCount: warnCount,
      failCount: failCount,

      zoneRef: {
        city: city, zoneCode: zoneCode, zoneName: z ? z.name : '', lawName: zSrc, article: '',
        verified: !!(z && (z.conf === 'high' || z.conf === 'mid')), found: !!z, note: z ? z.note : '',
        cls: z ? z.cls : '', allowRes: z ? z.allowRes : true
      },
      areaM2Used: areaM2,
      areaSource: areaSrc,
      setbackFrontM: sbFront,
      heightMaxBlockM: hBlock,
      heightMaxTowerM: hTower,
      heightMaxRearM: hRear,
      heightFitBase: fitBase,
      estFloors: estFloors,
      site: site,
      notes: notes
    };
  }

  TD.engine.m3 = m3;
  TD.engine.hMax164 = hMax164;
  TD.engine.heightFit = heightFit;
})(window.TD);
