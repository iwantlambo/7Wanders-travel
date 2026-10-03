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

  /* 分區查表：先查原鍵與別名；查不到時依字首退到住宅區／商業區（非臺北市的縣市沒有「住三」這種代碼）*/
  function zoneOf(city, zone, district, roadWidth) {
    var Zd = TD.data && TD.data.zoning;
    if (!Zd || typeof Zd.lookup !== 'function') return null;
    var z = Zd.lookup(city, zone, district, roadWidth);
    if (z) return z;
    var s = trim(zone);
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

  function siteOf(p) {
    p = p || {};
    var pc = p.parcel || {};
    var city = trim(pc.city), district = trim(pc.district), zoneIn = trim(pc.zone);
    var assumed = [];

    var roadIn = Number(pc.roadWidth);
    var roadWidth = (isFinite(roadIn) && roadIn > 0) ? roadIn : DEFAULT_ROAD_M;
    if (!(isFinite(roadIn) && roadIn > 0)) {
      assumed.push('正面路寬未輸入，暫以 ' + DEFAULT_ROAD_M + ' 公尺（都市計畫地區最常見之計畫道路寬度）試算');
    }

    var z = zoneOf(city, zoneIn, district, (isFinite(roadIn) && roadIn > 0) ? roadIn : null);
    var siteM2 = areaOf(pc.numbers);

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
    if (z && !z.allowRes && (product === '住宅大樓' || product === '華廈' || product === '透天厝')) {
      useConflict = z.name + '不得作住宅使用（' + (z.src || '各該都市計畫') + '），產品「' + product
                  + '」與分區不符；除非完成都市計畫變更，否則請改用廠辦或其他許可用途試算。';
    }

    return {
      city: city, district: district, zoneInput: zoneIn,
      zone: z, zoneFound: !!z, zoneCls: z ? z.cls : '',
      allowRes: z ? !!z.allowRes : true,
      product: product, productAuto: productAuto, params: PRODUCT_PARAMS[product] || PRODUCT_PARAMS['住宅大樓'],
      useConflict: useConflict,
      siteM2: siteM2,
      roadWidth: roadWidth, roadWidthInput: (isFinite(roadIn) && roadIn > 0) ? roadIn : null,
      roadCount: isFinite(Number(pc.roadCount)) && Number(pc.roadCount) > 0 ? Number(pc.roadCount) : 1,
      corner: !!pc.corner,
      siteWidth: w, siteDepth: d, shapeAssumed: shapeAssumed, frontageM: frontage,
      northZone: trim(pc.northZone) || 'same',
      mrtDistanceM: isFinite(Number(pc.mrtDistanceM)) && Number(pc.mrtDistanceM) > 0 ? Number(pc.mrtDistanceM) : null,
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
})(window.TD);
