/* 數字與單位格式化 */
window.TD = window.TD || {};
(function (TD) {
  'use strict';
  var PING = 3.3057851239669;   // 1 坪 = 3.3058 平方公尺

  function n(v, d) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    d = (d === undefined) ? 0 : d;
    return Number(v).toLocaleString('zh-Hant-TW', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function pct(v, d) { if (!isFinite(v)) return '—'; return n(v * 100, d === undefined ? 1 : d) + '%'; }

  // 金額：輸入一律為「元」，輸出自動選擇 萬 / 億
  function moneyParts(v) {
    if (v === null || v === undefined || !isFinite(v)) return { t: '—', u: '' };
    var a = Math.abs(v);
    if (a >= 1e8) return { t: n(v / 1e8, 2), u: '億元' };
    if (a >= 1e4) return { t: n(v / 1e4, 0), u: '萬元' };
    return { t: n(v, 0), u: '元' };
  }
  function money(v) { var p = moneyParts(v); return p.t + ' ' + p.u; }
  function moneyWan(v) { return n(v / 1e4, 0) + ' 萬'; }

  // 面積：內部一律以 平方公尺 儲存
  function area(m2, units, d) {
    if (!isFinite(m2)) return '—';
    if (units === 'm2') return n(m2, d === undefined ? 1 : d) + ' ㎡';
    return n(m2 / PING, d === undefined ? 1 : d) + ' 坪';
  }
  function areaNum(m2, units) { return units === 'm2' ? m2 : m2 / PING; }
  function areaUnit(units) { return units === 'm2' ? '㎡' : '坪'; }

  // 單價：內部以 元/坪 儲存（台灣交易慣例）
  function unitPrice(perPing) { return n(perPing / 1e4, 1) + ' 萬/坪'; }

  function months(m) { if (!isFinite(m)) return '—'; return n(m, 0) + ' 個月'; }
  function dateStr(ts) {
    var d = ts ? new Date(ts) : new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  TD.PING = PING;
  TD.fmt = { n: n, pct: pct, money: money, moneyParts: moneyParts, moneyWan: moneyWan,
             area: area, areaNum: areaNum, areaUnit: areaUnit, unitPrice: unitPrice,
             months: months, dateStr: dateStr, esc: esc, m2ToPing: function (v) { return v / PING; },
             pingToM2: function (v) { return v * PING; } };
})(window.TD);
