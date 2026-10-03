/* 數值工具：最小平方迴歸、IRR、二分求解、動撥曲線、敏感度。純計算，不依賴外部套件。*/
window.TD = window.TD || {};
(function (TD) {
  'use strict';

  function sum(a) { return a.reduce(function (s, x) { return s + x; }, 0); }
  function mean(a) { return a.length ? sum(a) / a.length : 0; }
  function sd(a) { if (a.length < 2) return 0; var m = mean(a); return Math.sqrt(sum(a.map(function (x) { return (x - m) * (x - m); })) / (a.length - 1)); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function round(v, d) { var p = Math.pow(10, d || 0); return Math.round(v * p) / p; }
  function quantile(arr, q) {
    if (!arr.length) return NaN;
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var pos = (s.length - 1) * q, base = Math.floor(pos), rest = pos - base;
    return s[base + 1] !== undefined ? s[base] + rest * (s[base + 1] - s[base]) : s[base];
  }

  /* ---- 解線性方程組（高斯消去 + 部分樞軸）---- */
  function solveLinear(A, b) {
    var n = A.length, i, j, k, M = A.map(function (r, idx) { return r.slice().concat([b[idx]]); });
    for (i = 0; i < n; i++) {
      var p = i;
      for (j = i + 1; j < n; j++) if (Math.abs(M[j][i]) > Math.abs(M[p][i])) p = j;
      if (Math.abs(M[p][i]) < 1e-12) return null;             // 奇異矩陣，樣本共線
      var t = M[i]; M[i] = M[p]; M[p] = t;
      for (j = i + 1; j < n; j++) {
        var f = M[j][i] / M[i][i];
        for (k = i; k <= n; k++) M[j][k] -= f * M[i][k];
      }
    }
    var x = new Array(n);
    for (i = n - 1; i >= 0; i--) {
      var s = M[i][n];
      for (j = i + 1; j < n; j++) s -= M[i][j] * x[j];
      x[i] = s / M[i][i];
    }
    return x;
  }

  /* ---- 多元線性迴歸（OLS，正規方程）----
     X: 樣本 × 變數（不含截距），y: 應變數。回傳係數、R²、殘差標準差。*/
  function ols(X, y) {
    if (!X.length || X.length !== y.length) return null;
    var n = X.length, p = X[0].length + 1, i, j, k;
    if (n <= p) return null;                                   // 自由度不足
    var Z = X.map(function (r) { return [1].concat(r); });
    var XtX = [], Xty = [];
    for (i = 0; i < p; i++) {
      XtX.push(new Array(p).fill(0)); Xty.push(0);
      for (k = 0; k < n; k++) Xty[i] += Z[k][i] * y[k];
    }
    for (i = 0; i < p; i++) for (j = 0; j < p; j++) for (k = 0; k < n; k++) XtX[i][j] += Z[k][i] * Z[k][j];
    var beta = solveLinear(XtX, Xty);
    if (!beta) return null;
    var fit = Z.map(function (r) { return sum(r.map(function (v, idx) { return v * beta[idx]; })); });
    var res = y.map(function (v, idx) { return v - fit[idx]; });
    var ybar = mean(y);
    var ssTot = sum(y.map(function (v) { return (v - ybar) * (v - ybar); }));
    var ssRes = sum(res.map(function (v) { return v * v; }));
    var r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
    var se = Math.sqrt(ssRes / Math.max(1, n - p));
    return { beta: beta, r2: r2, adjR2: 1 - (1 - r2) * (n - 1) / Math.max(1, n - p), se: se, n: n, p: p,
             predict: function (row) { return beta[0] + sum(row.map(function (v, idx) { return v * beta[idx + 1]; })); } };
  }

  /* ---- 現金流 ---- */
  function npv(rate, flows) {                                   // flows[0] 於 t=0
    return flows.reduce(function (s, cf, t) { return s + cf / Math.pow(1 + rate, t); }, 0);
  }
  // 月現金流的月報酬率；無號變化則回傳 null
  function irrMonthly(flows) {
    var hasPos = flows.some(function (v) { return v > 0; }), hasNeg = flows.some(function (v) { return v < 0; });
    if (!hasPos || !hasNeg) return null;
    var lo = -0.99, hi = 1.0, fLo = npv(lo, flows), fHi = npv(hi, flows), i;
    if (fLo * fHi > 0) return null;
    for (i = 0; i < 200; i++) {
      var mid = (lo + hi) / 2, f = npv(mid, flows);
      if (f * fLo > 0) { lo = mid; fLo = f; } else { hi = mid; }
      if (Math.abs(hi - lo) < 1e-10) break;
    }
    return (lo + hi) / 2;
  }
  function annualize(mr) { return mr === null ? null : Math.pow(1 + mr, 12) - 1; }

  /* ---- 單調函數二分求解：找 x 使 f(x)=target ---- */
  function bisect(f, lo, hi, target, iter) {
    target = target || 0; iter = iter || 90;
    var fLo = f(lo) - target, fHi = f(hi) - target, i, mid, fm;
    if (!isFinite(fLo) || !isFinite(fHi)) return null;
    if (fLo * fHi > 0) return null;
    for (i = 0; i < iter; i++) {
      mid = (lo + hi) / 2; fm = f(mid) - target;
      if (!isFinite(fm)) return null;
      if (fm * fLo > 0) { lo = mid; fLo = fm; } else { hi = mid; }
    }
    return (lo + hi) / 2;
  }

  /* ---- 營建動撥 S 曲線：n 期權重，合計 1 ---- */
  function sCurve(n, steep) {
    steep = steep || 6;
    var w = [], i, t, v, prev = 0, cum = [];
    for (i = 1; i <= n; i++) { t = i / n; v = 1 / (1 + Math.exp(-steep * (t - 0.5))); cum.push(v); }
    var a = cum[0] - 1 / (1 + Math.exp(steep * 0.5)), lo = 1 / (1 + Math.exp(steep * 0.5)), hi = cum[n - 1];
    for (i = 0; i < n; i++) { var norm = (cum[i] - lo) / (hi - lo); w.push(norm - prev); prev = norm; }
    var s = sum(w);
    return w.map(function (x) { return x / s; });
  }

  /* ---- 去化曲線：總戶數依月銷速度分配，回傳每月成交戶數 ---- */
  function absorption(units, perMonth, startMonth, horizon) {
    var arr = new Array(horizon).fill(0), left = units, m;
    for (m = startMonth; m < horizon && left > 0; m++) {
      var q = Math.min(perMonth, left); arr[m] = q; left -= q;
    }
    return { curve: arr, unsold: left, soldOutMonth: left > 0 ? null : arr.reduce(function (acc, v, i) { return v > 0 ? i : acc; }, startMonth) };
  }

  TD.math = { sum: sum, mean: mean, sd: sd, clamp: clamp, round: round, quantile: quantile,
              solveLinear: solveLinear, ols: ols, npv: npv, irrMonthly: irrMonthly, annualize: annualize,
              bisect: bisect, sCurve: sCurve, absorption: absorption };
})(window.TD);
