/* 實價登錄行情的取用工具：各縣市資料檔（js/data/lvr/*.js）載入後，依行政區取統計值與比較案例。*/
window.TD = window.TD || {};
(function (TD) {
  'use strict';
  TD.data = TD.data || {};

  /* --------------------------------------------------------------------------
     資料來源與結構

     各縣市一檔（js/data/lvr/{代碼}.js，由 tools/build_lvr.py 自內政部實價登錄
     開放資料產生），內容掛在 TD.data.lvr.counties[縣市名] = { meta, d }。
     d[行政區] = { n:[成屋筆數, 預售筆數, 土地筆數, 車位筆數], s:{統計}, c:{案例} }

     統計鍵（s）：
       'P'+型態   預售屋單價（元／坪，已扣車位）：[n, p25, p50, p75, 近12月n, 近12月p50]
       'N'+型態   新成屋（屋齡五年內）單價：同上
       'O'+型態   全部成屋單價：[n, p25, p50, p75, 屋齡中位數]
       'L'+分區   土地單價（元／坪土地，分區類：住、商、工、公保、農、其他）：
                  [n, p25, p50, p75, 近12月n, 近12月p50, 百坪以上n, 百坪以上p50]
       'KP'+型態  預售屋附車位之車位價（元／位）：[n, p25, p50, p75]
       'K'+類別   單獨車位交易（元／位）：[n, p25, p50, p75]
     案例鍵（c）：
       'P'+型態   [交易年月yyyymm, 路名, 樓層, 總樓層, 坪數, 單價/100, 建案]
       'N'+型態   [交易年月, 路名, 樓層, 總樓層, 坪數, 單價/100, 屋齡]
       'L'+分區   [交易年月, 地段, 坪數, 單價/100, 使用分區原文]
       'X'        大面積舊建物房地交易（土地 300 坪以上、屋齡 30 年以上）：
                  [交易年月, 路名, 土地坪數, 總價÷土地坪數/100, 屋齡, 建物坪數, 總價（萬）]

     本檔只做取用與合併，不含任何資料，也不碰 DOM（載入由 js/main.js 負責）。
     -------------------------------------------------------------------------- */

  var L = TD.data.lvr = TD.data.lvr || { counties: {} };
  if (!L.counties) L.counties = {};

  L._meta = {
    title: '實價登錄行情（各縣市行政區）',
    asOf: '2026-10-02',
    verified: true,
    source: '內政部不動產成交案件實際資訊資料供應系統開放資料（成屋買賣、預售屋買賣、土地與車位交易），'
          + '交易期間約 2024 年 4 月至 2026 年 9 月；已排除親友、員工、特殊關係與多戶合併交易，單價扣除車位',
    note: '統計值與案例由 tools/build_lvr.py 產生。行情會變動，建議每季重新產生一次。'
  };

  function hasOwn(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function isArr(v) { return Object.prototype.toString.call(v) === '[object Array]'; }

  L.loaded = function (county) { return hasOwn(L.counties, county); };

  L.meta = function (county) {
    return hasOwn(L.counties, county) ? L.counties[county].meta : null;
  };

  /* 取行政區紀錄。新竹市、嘉義市在開放資料中不分區，查不到行政區時退回以縣市名為鍵的紀錄。
     回傳 { rec, scope:'district'|'city', name } 或 null。*/
  L.rec = function (county, district) {
    if (!hasOwn(L.counties, county)) return null;
    var d = L.counties[county].d || {};
    if (district && hasOwn(d, district)) return { rec: d[district], scope: 'district', name: district };
    if (hasOwn(d, county)) return { rec: d[county], scope: 'city', name: county };
    return null;
  };

  /* 統計陣列 → 物件；查無回 null */
  L.stat = function (rec, key) {
    var s = (rec && rec.s && hasOwn(rec.s, key)) ? rec.s[key] : null;
    if (!isArr(s) || !s.length) return null;
    var head = key.charAt(0), out = { key: key, n: s[0], p25: s[1], p50: s[2], p75: s[3] };
    if (head === 'P' || head === 'N' || head === 'L') { out.n12 = s[4]; out.p50_12 = s[5]; }
    if (head === 'L') { out.nBig = s[6]; out.p50Big = s[7]; }
    if (head === 'O') out.ageMed = s[4];
    if (key.indexOf('KP') === 0) { out.n12 = null; }
    return out;
  };

  /* 案例陣列 → 物件陣列（單價還原成元／坪）。*/
  L.comps = function (rec, key, district) {
    var c = (rec && rec.c && hasOwn(rec.c, key)) ? rec.c[key] : null, out = [], i, r, head = key.charAt(0);
    if (!isArr(c)) return out;
    for (i = 0; i < c.length; i++) {
      r = c[i];
      if (head === 'X') {
        out.push({ ym: r[0], addr: r[1], areaPing: r[2], unitPricePing: r[3] * 100, ageYears: r[4], buildingPing: r[5],
                   totalWan: r[6], district: district || '', zoneText: '房地整宗（屋齡 ' + r[4] + ' 年）' });
      } else if (head === 'L') {
        out.push({ ym: r[0], addr: r[1], areaPing: r[2], unitPricePing: r[3] * 100, zoneText: r[4], district: district || '' });
      } else {
        out.push({ ym: r[0], addr: r[1], floor: r[2], totalFloors: r[3], areaPing: r[4], unitPricePing: r[5] * 100,
                   project: head === 'P' ? (r[6] || '') : '', ageYears: head === 'N' ? r[6] : 0,
                   presale: head === 'P', district: district || '' });
      }
    }
    return out;
  };

  /* 全縣市合併（行政區樣本不足時的備援）：統計值以筆數加權合併中位數的近似，
     案例取各區最新者合併。回傳 { stat, comps, districts }。*/
  L.pool = function (county, key, exclude) {
    if (!hasOwn(L.counties, county)) return null;
    var d = L.counties[county].d || {}, k, s, n = 0, w50 = 0, w25 = 0, w75 = 0, comps = [], dl = [];
    for (k in d) {
      if (!hasOwn(d, k) || k === exclude) continue;
      s = L.stat(d[k], key);
      if (!s || !s.n) continue;
      n += s.n; w50 += s.p50 * s.n; w25 += s.p25 * s.n; w75 += s.p75 * s.n;
      dl.push(k);
      comps = comps.concat(L.comps(d[k], key, k).slice(0, 6));
    }
    if (!n) return null;
    comps.sort(function (a, b) { return b.ym - a.ym; });
    return { stat: { key: key, n: n, p25: Math.round(w25 / n), p50: Math.round(w50 / n), p75: Math.round(w75 / n) },
             comps: comps.slice(0, 40), districts: dl };
  };

  /* 依縣市名取資料檔代碼（js/data/lvr/{代碼}.js） */
  L.codeOf = function (county) {
    var dd = TD.data.districts;
    return (dd && dd.codeOf && hasOwn(dd.codeOf, county)) ? dd.codeOf[county] : null;
  };
})(window.TD);
