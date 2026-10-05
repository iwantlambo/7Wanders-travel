/* 基地情境：把使用者輸入與分區資料整理成各段計算共用的一份基地條件（分區、產品類型、臨路、寬深），缺漏時採明示的預設值。*/
window.TD = window.TD || {};
(function (TD) {
  'use strict';

  TD.engine = TD.engine || {};

  /* ------------------------------------------------------------------
     為什麼要有這一段

     舊版各段各自查分區、各自假設產品類型，於是工業區的地拿住宅大樓的單價去算，
     法規檢討說「算不出來」、收入卻照住宅算——同一塊地在不同段被當成不同的東西。
     這裡統一決定一次：分區數值（含新北市依行政區與路寬調整的容積率）、
     允不允許住宅、產品類型、正面路寬與基地寬深。
     使用者沒填的欄位一律採「明示的預設值」並在 assumed 清單裡寫明，
     下游用 assumed 決定信心等級，畫面上會標「預設」讓人知道要回頭補。
     純函式：不碰 DOM、不碰儲存。
     ------------------------------------------------------------------ */

  var DEFAULT_ROAD_M = 8;          /* 未輸入路寬時的預設：都市計畫地區最常見的計畫道路寬度 */
  var PRODUCTS = ['住宅大樓', '華廈', '透天厝', '廠辦', '辦公商業大樓', '店面'];

  /* 各產品的量體與銷售參數（使用者可在進階假設覆寫）
       exemptRatio  地上免計容積比例：地上總樓地板 = 容積樓地板 ×（1＋exemptRatio）。
                    陽臺與梯廳合計上限為各層 15%（建技規則第162條），屋突約 3～5%，地上機電約 2～3%。
       sellRatio    可售係數：可售坪（不含車位）÷ 容積樓地板坪。業界「銷坪係數」約 1.55～1.6 倍（含車位）；
                    扣掉地下室車位登記面積後約 1.25 倍（容積 ＋ 陽臺梯廳 ≤15% ＋ 屋突 3～5% ＋ 機電與地下室公設約 5%）。
       publicRatio  公設比（只用於換算主建物坪，供對照）。
       avgUnitPing  平均每戶坪數（不含車位）；有本區預售案例時改用案例中位數。
       stallsPerUnit 每戶配車位數；有本區預售資料時改用「附車位成交比例」。
       basement     是否設地下室（透天厝通常一樓車庫、不開挖）。*/
  var PRODUCT_PARAMS = {
    '住宅大樓': { exemptRatio: 0.23, sellRatio: 1.25, publicRatio: 0.33, avgUnitPing: 28, floorHeightM: 3.3,
                  parkingCat: '2', absorbPerMonth: 4, stallsPerUnit: 0.8, basement: true, label: '住宅大樓（11 層以上）' },
    '華廈': { exemptRatio: 0.21, sellRatio: 1.22, publicRatio: 0.28, avgUnitPing: 25, floorHeightM: 3.2,
              parkingCat: '2', absorbPerMonth: 3, stallsPerUnit: 0.6, basement: true, label: '華廈（10 層以下）' },
    '透天厝': { exemptRatio: 0.10, sellRatio: 1.05, publicRatio: 0.05, avgUnitPing: 50, floorHeightM: 3.4,
                parkingCat: '2', absorbPerMonth: 2, stallsPerUnit: 1, basement: false, label: '透天厝' },
    '廠辦': { exemptRatio: 0.20, sellRatio: 1.25, publicRatio: 0.38, avgUnitPing: 90, floorHeightM: 4.2,
              parkingCat: '4', absorbPerMonth: 3, stallsPerUnit: 1, basement: true, label: '廠辦（工業用）' },
    '辦公商業大樓': { exemptRatio: 0.20, sellRatio: 1.22, publicRatio: 0.38, avgUnitPing: 60, floorHeightM: 3.8,
                      parkingCat: '1', absorbPerMonth: 2, stallsPerUnit: 0.5, basement: true, label: '辦公商業大樓' },
    '店面': { exemptRatio: 0.12, sellRatio: 1.12, publicRatio: 0.20, avgUnitPing: 40, floorHeightM: 4.2,
              parkingCat: '1', absorbPerMonth: 1, stallsPerUnit: 0.3, basement: true, label: '店面' }
  };

  /* 工業區變更（都市計畫個案變更）：新北市都市計畫工業區變更審議原則（112.5.16 修正）。
     回饋比例（捐地或折算代金）：變更為住宅區 37%、商業區 40.5%；變更後容積率高於內政部都委會
     第 662 次會議決議標準者，住宅區提高為 40%、商業區 44%（新北市另加 3%／3.5%）。
     本系統一律採較高者試算（新北市主要計畫區住宅區 300%、商業區 440% 皆高於標準），
     以回饋後剩餘土地 × 新分區容積率計算基準容積；都市計畫變更審議期以 36 個月計。*/
  var REZONE = {
    res: { zone: '住宅區', label: '工業區變更為住宅區', ratio: 0.40, months: 36,
           law: '新北市都市計畫工業區變更審議原則；都市計畫工業區檢討變更審議規範' },
    com: { zone: '商業區', label: '工業區變更為商業區', ratio: 0.44, months: 36,
           law: '新北市都市計畫工業區變更審議原則；都市計畫工業區檢討變更審議規範' }
  };

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function str(v) { return (v === null || v === undefined) ? '' : String(v); }
  function trim(s) { return str(s).replace(/^[\s　]+/, '').replace(/[\s　]+$/, ''); }

  function areaOf(numbers) {
    var t = 0, i, a;
    if (!numbers || !numbers.length) return 0;
    for (i = 0; i < numbers.length; i++) {
      a = numbers[i] ? Number(numbers[i].areaM2) : 0;
      if (isFinite(a) && a > 0) t += a;
    }
    return t;
  }

  /* 分區查表：先查原鍵與別名（證明書寫全名「第三種住宅區之一」時改查簡稱「住三之一」）；
     查不到時依字首退到住宅區／商業區（非臺北市的縣市沒有「住三」這種代碼）*/
  function zoneOf(city, zone, district, roadWidth) {
    var Zd = TD.data && TD.data.zoning, CU = TD.engine.certUtil;
    if (!Zd || typeof Zd.lookup !== 'function') return null;
    var s = trim(zone).replace(/\((?:特|再|核|中|新)\)$/, '');
    var z = Zd.lookup(city, s, district, roadWidth);
    if (z) return z;
    if (CU && CU.shortName && CU.shortName(s)) {
      z = Zd.lookup(city, CU.shortName(s), district, roadWidth);
      if (z) return z;
    }
    if (/用地$|保留地$/.test(s)) return null;
    if (/住/.test(s)) z = Zd.lookup(city, '住宅區', district, roadWidth);
    else if (/商/.test(s)) z = Zd.lookup(city, '商業區', district, roadWidth);
    else if (/工/.test(s)) z = Zd.lookup(city, '乙種工業區', district, roadWidth);
    if (z) z.mappedFrom = s;
    return z;
  }

  /* 依分區與強度推定產品：工業區→廠辦；住宅區、商業區→住宅大樓（低強度改華廈或透天）*/
  function autoProduct(z) {
    if (!z) return '住宅大樓';
    if (!z.allowRes) return z.product || '廠辦';
    if (z.product === '透天厝' || z.product === '華廈') return z.product;
    if (isNum(z.far) && z.far <= 1.2) return '華廈';
    return '住宅大樓';
  }

  /* 證明書上的分區不在內建分區表時（公共設施用地、產業專用區、各縣市特殊分區），
     以證明書為準建一份分區資料：建蔽率與容積率由法規檢討改用證明書所載數值。*/
  function certZone(name) {
    var CU = TD.engine.certUtil, cls = (CU && CU.clsOf) ? CU.clsOf(name) : '其他';
    return { name: name, cls: cls, bcr: null, far: null, conf: 'input', src: '土地使用分區證明書',
             note: '「' + name + '」不在內建分區表，建蔽率、容積率與允許用途以分區證明書與該細部計畫為準。',
             allowRes: (cls === '住' || cls === '商'), product: (cls === '工') ? '廠辦' : '住宅大樓',
             verified: false, article: '', key: name, farReason: '', fromCert: true };
  }

  /* 證明書逐筆地號的分區對照：整筆為公共設施用地者（道路、公園…）不得建築，面積自基準容積扣除；
     部分為公共設施用地者無法自動切分，只出警示。*/
  function publicLandOf(cert, numbers) {
    var CU = TD.engine.certUtil, out = { whole: [], partial: [], wholeM2: 0, missing: [] }, i, j, pz, no, row, allPub, anyPub;
    if (!cert || !CU) return out;
    var mine = {};
    for (i = 0; numbers && i < numbers.length; i++) {
      row = numbers[i] || {};
      no = CU.canonNo(row.no);
      if (no) mine[no] = Number(row.areaM2) > 0 ? Number(row.areaM2) : 0;
    }
    for (i = 0; i < cert.parcelZones.length; i++) {
      pz = cert.parcelZones[i];
      allPub = true; anyPub = false;
      for (j = 0; j < pz.zones.length; j++) {
        if (CU.clsOf(pz.zones[j]) === '公') anyPub = true; else allPub = false;
      }
      if (!anyPub) continue;
      if (allPub && Object.prototype.hasOwnProperty.call(mine, pz.no)) {
        out.whole.push({ no: pz.no, areaM2: mine[pz.no], zone: pz.zones.join('、'), line: pz.line });
        out.wholeM2 += mine[pz.no];
      } else {
        out.partial.push({ no: pz.no, zone: pz.zones.join('、'), line: pz.line });
      }
    }
    for (i = 0; i < cert.parcels.length; i++) if (!Object.prototype.hasOwnProperty.call(mine, cert.parcels[i])) out.missing.push(cert.parcels[i]);
    return out;
  }

  /* 這個欄位的值是不是「自動研究」填進來的（使用者之後改過就不算）*/
  function researchFilled(p, path, cur) {
    var r = p && p.research && p.research.result, list = (r && Object.prototype.toString.call(r.applied) === '[object Array]') ? r.applied : [], i;
    for (i = 0; i < list.length; i++) {
      if (list[i] && list[i].path === path && isNum(Number(cur)) && Number(list[i].value) === Number(cur)) return true;
    }
    return false;
  }

  function siteOf(p) {
    p = p || {};
    var pc = p.parcel || {};
    var city = trim(pc.city), district = trim(pc.district), zoneSel = trim(pc.zone), zoneIn = zoneSel;
    var assumed = [];

    /* 分區證明書／細部計畫條文：有貼上時，使用分區與各項強度以證明書為準（左欄下拉不採用）*/
    var cert = null, zoneFrom = 'select';
    if (TD.engine.parseCert && trim(pc.certText)) {
      try { cert = TD.engine.parseCert(pc.certText, { zone: zoneSel }); } catch (e) { cert = null; }
      if (cert && cert.zone) { zoneIn = cert.zone; zoneFrom = 'cert'; }
    }
    var cp = (cert && cert.pick) ? cert.pick : {};

    var roadIn = Number(pc.roadWidth);
    var roadWidth = (isFinite(roadIn) && roadIn > 0) ? roadIn : DEFAULT_ROAD_M;
    if (!(isFinite(roadIn) && roadIn > 0)) {
      assumed.push('正面路寬未輸入，暫以 ' + DEFAULT_ROAD_M + ' 公尺（都市計畫地區最常見之計畫道路寬度）試算');
    }

    var z = zoneOf(city, zoneIn, district, (isFinite(roadIn) && roadIn > 0) ? roadIn : null);
    if (!z && zoneFrom === 'cert') z = certZone(cert.zone);
    var siteM2 = areaOf(pc.numbers);

    /* 工業區變更：分區換成新分區（容積率依行政區），基準容積以回饋後剩餘土地計 */
    var rz = null, rzIn = trim(pc.rezone), origZone = z;
    if (z && z.cls === '工' && Object.prototype.hasOwnProperty.call(REZONE, rzIn)) {
      var def = REZONE[rzIn];
      var nz = zoneOf(city, def.zone, district, (isFinite(roadIn) && roadIn > 0) ? roadIn : null);
      if (nz) {
        rz = { type: rzIn, label: def.label, ratio: def.ratio, months: def.months, law: def.law,
               fromZone: z.name, toZone: nz.name, keptM2: siteM2 * (1 - def.ratio),
               note: def.label + '：回饋 ' + Math.round(def.ratio * 100) + '%（捐地或折算代金），以剩餘 '
                   + Math.round((1 - def.ratio) * 100) + '% 土地 × ' + nz.name + '容積率 ' + Math.round(nz.far * 100)
                   + '% 計算基準容積；須符合新北市都市發展暨工業區變更策略、以街廓為原則，審議約 3 年以上，核准與否由都委會決定。' };
        z = nz;
      }
    }

    /* 基地寬深：有輸入用輸入；沒有就以正方形估算，並記入 assumed */
    var w = Number(pc.siteWidth), d = Number(pc.siteDepth), shapeAssumed = false;
    if (!(isFinite(w) && w > 0) || !(isFinite(d) && d > 0)) {
      shapeAssumed = true;
      if (siteM2 > 0) {
        if (isFinite(w) && w > 0) d = siteM2 / w;
        else if (isFinite(d) && d > 0) w = siteM2 / d;
        else { w = Math.sqrt(siteM2); d = w; }
        assumed.push('基地寬深未輸入，以面積 ' + Math.round(siteM2) + ' ㎡ 推估約寬 ' + Math.round(w * 10) / 10
                   + ' 公尺 × 深 ' + Math.round(d * 10) / 10 + ' 公尺');
      } else { w = 0; d = 0; }
    }
    var frontIn = Number(pc.frontageM);
    var frontage = (isFinite(frontIn) && frontIn > 0) ? frontIn : w;

    var prodIn = trim(pc.productType);
    var product = (PRODUCTS.indexOf(prodIn) >= 0) ? prodIn : autoProduct(z);
    var productAuto = PRODUCTS.indexOf(prodIn) < 0;
    var useConflict = '';
    if (z && z.cls === '公') {
      useConflict = '分區證明書所載「' + z.name + '」為公共設施用地，不得作一般建築開發；'
                  + '公共設施保留地可評估捐贈作為容積移轉送出基地或等待徵收。';
    } else if (z && !z.allowRes && (product === '住宅大樓' || product === '華廈' || product === '透天厝')) {
      useConflict = z.name + '不得作住宅使用（' + (z.src || '各該都市計畫') + '），產品「' + product
                  + '」與分區不符；除非完成都市計畫變更，否則請改用廠辦或其他許可用途試算。';
    }

    /* 捷運場站距離：使用者輸入 > 證明書（「周邊 500 公尺範圍內」取 500 公尺，偏保守）*/
    var mrtIn = isFinite(Number(pc.mrtDistanceM)) && Number(pc.mrtDistanceM) > 0 ? Number(pc.mrtDistanceM) : null;
    var mrt = mrtIn, mrtFrom = mrtIn !== null ? (researchFilled(p, 'parcel.mrtDistanceM', mrtIn) ? 'research' : 'input') : '';
    if (mrt === null && cp.mrt && isNum(cp.mrt.v)) { mrt = cp.mrt.v; mrtFrom = 'cert'; }
    var hLimit = null;
    if (cp.heightLimitM && isNum(cp.heightLimitM.v)) hLimit = cp.heightLimitM.v;

    return {
      city: city, district: district, zoneInput: zoneIn, zoneSelected: zoneSel, zoneFrom: zoneFrom,
      cert: cert, certPick: cert ? cp : null, publicLand: publicLandOf(cert, pc.numbers),
      heightLimitM: hLimit, floorLimit: (cp.floorLimit && isNum(cp.floorLimit.v)) ? cp.floorLimit.v : null,
      excavRatio: (cp.excavRatio && isNum(cp.excavRatio.v)) ? cp.excavRatio.v : null,
      parkingRule: cp.parking || null, minSiteM2: (cp.minSiteM2 && isNum(cp.minSiteM2.v)) ? cp.minSiteM2.v : null,
      urDesignated: !!cp.urDesignated, tdrBanned: !!cp.tdrBanned, mrtFrom: mrtFrom,
      roadFromResearch: (isFinite(roadIn) && roadIn > 0) ? researchFilled(p, 'parcel.roadWidth', roadIn) : false,
      ageFromResearch: researchFilled(p, 'parcel.buildingAgeYears', Number(pc.buildingAgeYears)),
      zone: z, zoneFound: !!z, zoneCls: z ? z.cls : '',
      origZone: origZone, rezone: rz, rezoneable: !!(origZone && origZone.cls === '工'),
      allowRes: z ? !!z.allowRes : true,
      product: product, productAuto: productAuto, params: PRODUCT_PARAMS[product] || PRODUCT_PARAMS['住宅大樓'],
      useConflict: useConflict,
      siteM2: siteM2,
      roadWidth: roadWidth, roadWidthInput: (isFinite(roadIn) && roadIn > 0) ? roadIn : null,
      roadCount: isFinite(Number(pc.roadCount)) && Number(pc.roadCount) > 0 ? Number(pc.roadCount) : 1,
      corner: !!pc.corner,
      siteWidth: w, siteDepth: d, shapeAssumed: shapeAssumed, frontageM: frontage,
      northZone: trim(pc.northZone) || 'same',
      mrtDistanceM: mrt,
      hrStatus: trim(pc.hrStatus) || 'auto',
      buildingAgeYears: isFinite(Number(pc.buildingAgeYears)) ? Number(pc.buildingAgeYears) : 0,
      existingFloorM2: isFinite(Number(pc.existingFloorM2)) ? Number(pc.existingFloorM2) : 0,
      assumed: assumed
    };
  }

  TD.engine.siteOf = siteOf;
  TD.engine.productParams = PRODUCT_PARAMS;
  TD.engine.products = PRODUCTS;
  TD.engine.DEFAULT_ROAD_M = DEFAULT_ROAD_M;
  TD.engine.REZONE = REZONE;
})(window.TD);
