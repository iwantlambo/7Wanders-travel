/* 市場行情：從內建的實價登錄資料（TD.data.lvr）取本區同產品的預售單價、成屋單價、車位價、去化速度與同分區土地行情。*/
window.TD = window.TD || {};
(function (TD) {
  'use strict';

  TD.engine = TD.engine || {};

  /* ------------------------------------------------------------------
     取值順序（每一步都在 label 裡寫清楚用了哪一層）

       1. 本行政區、同產品型態，樣本 8 筆以上：近 12 個月樣本夠（8 筆以上）用近 12 個月中位數，否則用全期間中位數。
       2. 本區樣本不足 → 全縣市同產品合併（以筆數加權）。
       3. 全縣市也沒有該產品 → 以本區住宅大樓預售單價乘產品係數推估（信心降為 low）。
       4. 縣市資料檔尚未載入或查無資料 → 回 null，由呼叫端退回保守預設並說明。

     純函式：不碰 DOM、不發網路請求；資料檔由 js/main.js 依縣市延遲載入。
     ------------------------------------------------------------------ */

  var MIN_N = 8;
  var RES_TYPES = ['住宅大樓', '華廈', '透天厝', '套房'];
  /* 查無同產品樣本時，以住宅大樓預售單價推估的係數（雙北 2024～2026 預售實價登錄的區內中位數比值概略值） */
  var PROXY = { '華廈': 0.95, '透天厝': 1.0, '廠辦': 0.55, '辦公商業大樓': 0.9, '店面': 1.15, '套房': 1.0 };

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function hasOwn(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function wan(v) { return isNum(v) ? TD.fmt.n(v / 1e4, 1) + ' 萬' : '—'; }

  function L() { return TD.data && TD.data.lvr && TD.data.lvr.rec ? TD.data.lvr : null; }

  function period(city) {
    var m = L() ? L().meta(city) : null;
    return m ? (m.from + '～' + m.to) : '';
  }

  function median(arr) {
    if (!arr.length) return null;
    var s = arr.slice().sort(function (a, b) { return a - b; }), k = Math.floor(s.length / 2);
    return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
  }

  /* 統計值挑點估計：近 12 個月樣本足夠用近 12 個月，否則用全期間 */
  function pointOf(st) {
    if (!st) return null;
    if (isNum(st.p50_12) && st.n12 >= MIN_N) return { v: st.p50_12, recent: true };
    return { v: st.p50, recent: false };
  }

  /* ---------------- 預售與成屋 ---------------- */

  function presale(city, district, product) {
    var lv = L();
    if (!lv || !lv.loaded(city)) return null;
    var r = lv.rec(city, district);
    var key = 'P' + product, st = r ? lv.stat(r.rec, key) : null, scope = '', label = '', comps = [], pt, conf = 'mid';
    var placeName = r ? (r.scope === 'city' ? city : city + district) : city;

    if (st && st.n >= MIN_N) {
      scope = r.scope;
      pt = pointOf(st);
      comps = lv.comps(r.rec, key, r.name);
      label = placeName + ' ' + product + ' 預售實價登錄 ' + st.n + ' 筆（' + period(city) + '）'
            + (pt.recent ? '，近 12 個月 ' + st.n12 + ' 筆中位數' : '，全期間中位數');
    } else {
      var pool = lv.pool(city, key, null);
      if (pool && pool.stat.n >= MIN_N) {
        scope = 'county';
        st = pool.stat;
        pt = { v: st.p50, recent: false };
        comps = pool.comps;
        label = city + '全市 ' + product + ' 預售實價登錄 ' + st.n + ' 筆（本區僅 ' + (r && lv.stat(r.rec, key) ? lv.stat(r.rec, key).n : 0)
              + ' 筆，樣本不足改用全市；' + period(city) + '）';
        conf = 'low';
      } else if (resaleProxy(city, district, product)) {
        return resaleProxy(city, district, product);
      } else if (product !== '住宅大樓' && hasOwn(PROXY, product)) {
        var base = presale(city, district, '住宅大樓');
        if (!base) return null;
        var f = PROXY[product];
        return {
          product: product, scope: 'proxy', conf: 'low', recent: false,
          n: 0, p25: base.p25 * f, p50: base.p50 * f, p75: base.p75 * f, point: base.point * f,
          label: placeName + '查無' + product + '預售樣本，以住宅大樓預售中位數 ' + wan(base.point) + ' × 產品係數 ' + f + ' 推估',
          comps: base.comps, baseProduct: '住宅大樓'
        };
      } else {
        return null;
      }
    }
    return {
      product: product, scope: scope, conf: conf, recent: pt.recent,
      n: st.n, n12: st.n12 || 0, p25: st.p25, p50: st.p50, p75: st.p75, point: pt.v,
      label: label, comps: comps
    };
  }

  /* 預售樣本不足時，以本區新成屋（屋齡五年內）或全部成屋單價代替（僅住宅產品；信心 low） */
  function resaleProxy(city, district, product) {
    var lv = L(), r, st, k, keys;
    if (RES_TYPES.indexOf(product) < 0 || product === '套房') return null;
    r = lv.rec(city, district);
    if (!r) return null;
    keys = ['N' + product, 'O' + product];
    for (k = 0; k < keys.length; k++) {
      st = lv.stat(r.rec, keys[k]);
      if (st && st.n >= MIN_N) {
        return {
          product: product, scope: 'resale', conf: 'low', recent: false,
          n: st.n, p25: st.p25, p50: st.p50, p75: st.p75, point: st.p50,
          label: (r.scope === 'city' ? city : city + district) + '查無足夠' + product + '預售成交，以'
               + (k === 0 ? '新成屋（屋齡 5 年內）' : '成屋') + '實價登錄 ' + st.n + ' 筆中位數代替（新案通常較高，可輸入預售溢價）',
          comps: lv.comps(r.rec, 'N' + product, r.name)
        };
      }
    }
    return null;
  }

  /* 新成屋（屋齡五年內）與全部成屋：只供對照（買方比較的是周邊成屋） */
  function resale(city, district, product) {
    var lv = L();
    if (!lv || !lv.loaded(city)) return null;
    var r = lv.rec(city, district);
    if (!r) return null;
    var t = (RES_TYPES.indexOf(product) >= 0 && product !== '套房') ? product : '住宅大樓';
    var nw = lv.stat(r.rec, 'N' + t), old = lv.stat(r.rec, 'O' + t);
    return {
      type: t,
      newer: nw ? { n: nw.n, p25: nw.p25, p50: nw.p50, p75: nw.p75, n12: nw.n12, p50_12: nw.p50_12 } : null,
      all: old ? { n: old.n, p25: old.p25, p50: old.p50, p75: old.p75, ageMed: old.ageMed } : null,
      comps: lv.comps(r.rec, 'N' + t, r.name)
    };
  }

  /* ---------------- 車位、去化、坪數 ---------------- */

  function parking(city, district, product) {
    var lv = L(), cost = TD.data.cost || {};
    var fb = cost.parkingFallback || {};
    var fallback = hasOwn(fb, city) ? fb[city] : fb._default;
    if (!lv || !lv.loaded(city)) return { price: fallback, from: city + '車位概略價（尚未載入實價登錄）', conf: 'low', n: 0 };
    var r = lv.rec(city, district), st, keys = [], i;
    /* 住宅產品用同型態預售附車位價；非住宅（廠辦、辦公、店面）常見一案多位或裝卸車位合併登錄，改用標準車位行情 */
    if (RES_TYPES.indexOf(product) >= 0) keys.push('KP' + product);
    keys.push('KP住宅大樓', 'K坡道平面');
    for (i = 0; r && i < keys.length; i++) {
      st = lv.stat(r.rec, keys[i]);
      if (st && st.n >= 5) {
        return { price: st.p50, p25: st.p25, p75: st.p75, n: st.n, conf: 'mid',
                 from: (r.scope === 'city' ? city : city + district) + (keys[i].charAt(1) === 'P' ? ' 預售屋附車位' : ' 單獨車位交易（坡道平面）')
                     + ' 中位數，' + st.n + ' 筆' + (keys[i] !== 'KP' + product && RES_TYPES.indexOf(product) < 0 ? '（以一般車位行情計）' : '') };
      }
    }
    var pool = lv.pool(city, 'KP住宅大樓', null);
    if (pool && pool.stat.n >= 5) {
      return { price: pool.stat.p50, p25: pool.stat.p25, p75: pool.stat.p75, n: pool.stat.n, conf: 'low',
               from: city + '全市預售屋附車位中位數（本區樣本不足），' + pool.stat.n + ' 筆' };
    }
    return { price: fallback, from: city + '車位概略價（查無實價登錄車位樣本）', conf: 'low', n: 0 };
  }

  /* 去化：各建案每月成交筆數的中位數（實價登錄預售屋，成交 10 筆以上的建案） */
  function absorb(city, district, product) {
    var lv = L();
    if (!lv || !lv.loaded(city)) return null;
    var r = lv.rec(city, district), a = r && r.rec.s ? r.rec.s['A' + product] : null;
    if (a && a[0] >= 3) {
      return { perMonth: a[1], p25: a[2], p75: a[3], projects: a[0], conf: 'mid',
               from: (r.scope === 'city' ? city : city + district) + ' ' + product + ' 預售建案 ' + a[0] + ' 案之每月成交筆數中位數' };
    }
    var d = lv.counties[city].d || {}, k, tw = 0, tv = 0, tp = 0;
    for (k in d) {
      if (!hasOwn(d, k) || !d[k].s || !d[k].s['A' + product]) continue;
      a = d[k].s['A' + product];
      tw += a[0]; tv += a[1] * a[0]; tp += a[0];
    }
    if (tp >= 3) {
      return { perMonth: Math.round(tv / tw * 10) / 10, projects: tp, conf: 'low',
               from: city + '全市 ' + product + ' 預售建案 ' + tp + ' 案之每月成交筆數（本區建案不足 3 案）' };
    }
    return null;
  }

  /* 平均每戶坪數（不含車位）：本區同產品預售案例的中位數 */
  function unitSize(city, district, product) {
    var pr = presale(city, district, product);
    if (!pr || !pr.comps || pr.scope === 'proxy') return null;
    var a = [], i;
    for (i = 0; i < pr.comps.length; i++) if (isNum(pr.comps[i].areaPing) && pr.comps[i].areaPing > 3) a.push(pr.comps[i].areaPing);
    if (a.length < 5) return null;
    return { ping: Math.round(median(a) * 10) / 10, n: a.length, from: '本區' + product + '預售案例坪數中位數（' + a.length + ' 筆，不含車位）' };
  }

  /* 每戶配車位比例：預售成交中附車位者的比例 */
  function stallRatio(city, district, product) {
    var lv = L();
    if (!lv || !lv.loaded(city)) return null;
    var r = lv.rec(city, district);
    if (!r) return null;
    var p = lv.stat(r.rec, 'P' + product), k = lv.stat(r.rec, 'KP' + product);
    if (!p || p.n < MIN_N) return null;
    var ratio = Math.max(0.3, Math.min(1.2, (k ? k.n : 0) / p.n));
    return { ratio: Math.round(ratio * 100) / 100, from: '本區' + product + '預售成交 ' + p.n + ' 筆中附車位 ' + (k ? k.n : 0) + ' 筆' };
  }

  /* ---------------- 土地 ---------------- */

  function zoneKey(cls) { return (cls === '住' || cls === '商' || cls === '工') ? cls : '其他'; }

  function land(city, district, zoneCls) {
    var lv = L();
    if (!lv || !lv.loaded(city)) return null;
    var r = lv.rec(city, district), key = 'L' + zoneKey(zoneCls), st = r ? lv.stat(r.rec, key) : null;
    var place = r ? (r.scope === 'city' ? city : city + district) : city;
    var zl = { '住': '住宅區', '商': '商業區', '工': '工業區', '其他': '其他分區' }[zoneKey(zoneCls)];
    if (st && st.n >= 3) {
      var v, how, conf = 'mid', comps = lv.comps(r.rec, key, r.name), mid = [], i;
      for (i = 0; i < comps.length; i++) if (comps[i].areaPing >= 30) mid.push(comps[i].unitPricePing);
      if (st.nBig >= 3 && isNum(st.p50Big)) { v = st.p50Big; how = '百坪以上 ' + st.nBig + ' 筆中位數'; }
      else if (mid.length >= 3) { v = median(mid); how = '30 坪以上 ' + mid.length + ' 筆中位數'; }
      else {
        v = (st.n12 >= 5 && isNum(st.p50_12)) ? st.p50_12 : st.p50;
        how = '中位數；成交多為 30 坪以下的小面積或持分交易，與整宗開發用地不可比，僅供參考';
        conf = 'low';
      }
      return { perPing: v, p25: st.p25, p50: st.p50, p75: st.p75, n: st.n, scope: r.scope, conf: conf,
               label: place + zl + '土地實價登錄 ' + st.n + ' 筆（' + period(city) + '），' + how, comps: comps,
               oldDeals: lv.comps(r.rec, 'X', r.name) };
    }
    var pool = lv.pool(city, key, null);
    if (pool && pool.stat.n >= 5) {
      return { perPing: pool.stat.p50, p25: pool.stat.p25, p50: pool.stat.p50, p75: pool.stat.p75, n: pool.stat.n,
               scope: 'county', conf: 'low',
               label: city + '全市' + zl + '土地實價登錄 ' + pool.stat.n + ' 筆中位數（本區樣本不足）', comps: pool.comps,
               oldDeals: r ? lv.comps(r.rec, 'X', r.name) : [] };
    }
    return null;
  }

  /* ---------------- 研究行情（使用者查到的新案、成交，逐行輸入） ----------------
     每行：類別, 名稱, 單價（萬／坪，可寫 77-88 取中間值）, 年月（可省）, 來源（可省）
     類別：住宅（預售住宅大樓）、華廈、透天、廠辦、辦公、店面、土地。
     例：住宅, 悅田吾澍, 77-88, 2026-09, 樂居
         土地, TOYOTA 三重舊廠（溪尾街）, 70, 2025-10, ETtoday 房產雲 */
  var KIND = [
    [/土地|工業地|乙工|素地|地價/, 'land'],
    [/廠辦|科技大樓|智慧廠/, '廠辦'],
    [/辦公|商辦/, '辦公商業大樓'],
    [/店面|店舖|店鋪/, '店面'],
    [/華廈/, '華廈'],
    [/透天/, '透天厝'],
    [/住宅|預售|新案|大樓|住家/, '住宅大樓']
  ];

  function toNumZh(t) {
    return String(t).replace(/[０-９．]/g, function (c) { return c === '．' ? '.' : String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
  }

  function parseResearch(text) {
    var lines = String(text || '').split(/\r?\n/), out = [], errors = [], i, raw, parts, kind, k, nums, price, ym, m;
    for (i = 0; i < lines.length; i++) {
      raw = toNumZh(lines[i]).replace(/^[\s　]+|[\s　]+$/g, '');
      if (!raw || raw.charAt(0) === '#') continue;
      parts = raw.split(/\s*[,，、\t]\s*/);
      kind = null;
      for (k = 0; k < KIND.length; k++) if (KIND[k][0].test(parts[0] || '')) { kind = KIND[k][1]; break; }
      nums = (parts[2] || '').match(/\d+(?:\.\d+)?/g);
      if (!kind || !nums) { errors.push('第 ' + (i + 1) + ' 行看不懂：「' + lines[i] + '」'); continue; }
      price = nums.length >= 2 ? (Number(nums[0]) + Number(nums[1])) / 2 : Number(nums[0]);
      if (price < 10000) price = price * 1e4;          /* 寫萬元／坪 */
      ym = null;
      m = (parts[3] || '').match(/(\d{2,4})\D+(\d{1,2})/);
      if (m) { var y = Number(m[1]); if (y < 1911) y += 1911; ym = y * 100 + Number(m[2]); }
      out.push({ kind: kind === 'land' ? 'land' : 'price', product: kind === 'land' ? '' : kind,
                 name: parts[1] || '', price: price, lo: nums.length >= 2 ? Number(nums[0]) * (Number(nums[0]) < 10000 ? 1e4 : 1) : price,
                 hi: nums.length >= 2 ? Number(nums[1]) * (Number(nums[1]) < 10000 ? 1e4 : 1) : price,
                 ym: ym, src: parts.slice(4).join('、'), line: i + 1 });
    }
    return { items: out, errors: errors };
  }

  function researchFor(items, product) {
    var out = [], i;
    for (i = 0; i < items.length; i++) {
      if (product === 'land' ? items[i].kind === 'land' : (items[i].kind === 'price' && items[i].product === product)) out.push(items[i]);
    }
    return out;
  }

  /* ---------------- 便捷介面（m4 用） ---------------- */

  TD.engine.lvrPrice = function (city, district, product) {
    var pr = presale(city, district, product);
    if (!pr) return null;
    var pk = parking(city, district, product);
    return { p50: pr.point, label: pr.label, parking: pk ? pk.price : null };
  };
  TD.engine.lvrLand = land;

  TD.engine.market = {
    presale: presale, resale: resale, parking: parking, absorb: absorb, unitSize: unitSize,
    stallRatio: stallRatio, land: land, proxy: PROXY, MIN_N: MIN_N,
    parseResearch: parseResearch, researchFor: researchFor, median: median
  };
})(window.TD);
