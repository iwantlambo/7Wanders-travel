/* 受測值包裝：每個對外數字都帶信心等級與法源，供原則一「標示不確定、強制人工複核」使用。*/
window.TD = window.TD || {};
(function (TD) {
  'use strict';

  var LEVELS = {
    high:  { label: '高',   cls: 'c-high', desc: '直接來自法規明文或使用者輸入的硬資料，不需複核。' },
    mid:   { label: '中',   cls: 'c-mid',  desc: '由公開資料推算，方法穩定但輸入可能過期，建議抽查。' },
    low:   { label: '低',   cls: 'c-low',  desc: '假設驅動或樣本不足，結論對假設敏感，必須人工複核。' },
    unv:   { label: '待查證', cls: 'c-unv', desc: '種子資料，尚未與法規原文或官方來源逐字核對，上線前必須查證。' },
    input: { label: '輸入', cls: 'c-input', desc: '使用者自行輸入或覆寫的值。' }
  };

  // V(key, value, conf, src, formula, note)
  function V(key, value, conf, src, formula, note) {
    return { __v: true, key: key, v: value, conf: conf || 'mid', src: src || '', formula: formula || '', note: note || '' };
  }
  function isV(o) { return !!(o && o.__v); }
  function raw(o) { return isV(o) ? o.v : o; }

  // 走訪整個計算結果，蒐集所有需要複核的值
  function collect(node, out, seen) {
    out = out || []; seen = seen || [];
    if (!node || typeof node !== 'object') return out;
    if (seen.indexOf(node) >= 0) return out; seen.push(node);
    if (isV(node)) { out.push(node); return out; }
    if (Array.isArray(node)) { node.forEach(function (x) { collect(x, out, seen); }); return out; }
    Object.keys(node).forEach(function (k) { collect(node[k], out, seen); });
    return out;
  }

  function needsReview(v) { return v.conf === 'low' || v.conf === 'unv'; }

  TD.LEVELS = LEVELS;
  TD.V = V;
  TD.isV = isV;
  TD.raw = raw;
  TD.collectValues = collect;
  TD.needsReview = needsReview;
})(window.TD);
