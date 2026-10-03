/* tools/smoke.js —— 二十項斷言。
   1～8 是 SPEC 第 9 節的前八項；
   9～11 原本查三個客戶版本的頭條數字與投影片，版本機制已移除，改查
   m8.stress（四項齊全、判定合法）、m8.walkAway（非 NaN 且不高於出價上限）
   與 m8.scenarios（三情境齊全、樂觀優於保守）；
   12 無謄本時整條鏈安全降級、13 m6 拒絕估價時 m8 不得生出出價上限、
   14 V 的 key 全域唯一、15 交屋期越長出價上限越低、
   16 容積率覆寫為 0 時不得回落種子值、17 停車檢核算不出來時不得生出車位數、
   18 專案結構不得再帶 edition 欄位（去版本化的迴歸防線）。
   19 報告層必須組得出來且含免責聲明（曾因少傳一個參數整層變白磚）、
   20 渲染後的介面文字不得出現模組代號、NaN，空專案不得以 0 冒充算不出來。
   13～20 都是對抗審查抓到的真實錯誤留下的迴歸防線，不要放寬。
   零相依，直接 node tools/smoke.js。
   做法：假一個 global.window，依序載入 js/lib → js/data → js/engine，
   用 TD.store.sample() 跑 TD.engine.run(p)，逐項印 PASS／FAIL。
   全過 exit 0，任一項 FAIL 或載入失敗 exit 1。 */

'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');

/* ---- 假瀏覽器環境：只給 window，其他一律不給。
       引擎層若偷用 document／localStorage／fetch 會直接在這裡爆掉，
       這是刻意的：SPEC 第 1 節第 7 款要求引擎是純函式。 ---- */
global.window = global.window || {};

var LOAD = [
  'js/lib/fmt.js',
  'js/lib/value.js',
  'js/lib/math.js',
  'js/lib/store.js',
  'js/data/laws.js',
  'js/data/zoning.js',
  'js/data/bonus.js',
  'js/data/cost.js',
  'js/data/comps.js',
  'js/engine/m1.js',
  'js/engine/m2.js',
  'js/engine/m3.js',
  'js/engine/m4.js',
  'js/engine/m5.js',
  'js/engine/m6.js',
  'js/engine/m7.js',
  'js/engine/m8.js',
  'js/engine/pipeline.js'
];

/* ---- 介面層（js/ui/*.js）另外載入：引擎的斷言不需要它，
       第 19、20 項才需要。它們在頂層不碰 document，所以在 Node 下載得起來。---- */
var UI_LOAD = [
  'js/ui/common.js',
  'js/ui/inputs.js',
  'js/ui/results.js',
  'js/ui/details.js',
  'js/ui/report.js'
];
var uiLoaded = false;

function loadUiOnce() {
  if (uiLoaded) return;
  uiLoaded = true;
  var i, abs, code;
  for (i = 0; i < UI_LOAD.length; i++) {
    abs = path.join(ROOT, UI_LOAD[i]);
    if (!fs.existsSync(abs)) throw new Error('介面檔不存在：' + UI_LOAD[i]);
    code = fs.readFileSync(abs, 'utf8');
    vm.runInThisContext(code, { filename: abs });
  }
}

function loadAll() {
  var i, rel, abs, code;
  for (i = 0; i < LOAD.length; i++) {
    rel = LOAD[i];
    abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      console.log('LOAD FAIL  ' + rel + ' —— 檔案不存在');
      process.exit(1);
    }
    code = fs.readFileSync(abs, 'utf8');
    try {
      vm.runInThisContext(code, { filename: abs });
    } catch (e) {
      console.log('LOAD FAIL  ' + rel + ' —— ' + (e && e.message ? e.message : e));
      if (e && e.stack) console.log(e.stack);
      process.exit(1);
    }
  }
}

/* ---- 斷言小工具 ---- */

var passCount = 0;
var failCount = 0;

function report(no, title, ok, detail) {
  if (ok) {
    passCount++;
    console.log('PASS  ' + no + '. ' + title + (detail ? '  —— ' + detail : ''));
  } else {
    failCount++;
    console.log('FAIL  ' + no + '. ' + title + (detail ? '  —— ' + detail : ''));
  }
}

function check(no, title, fn) {
  var r;
  try {
    r = fn();
  } catch (e) {
    report(no, title, false, '斷言執行時丟出例外：' + (e && e.message ? e.message : e)
      + (e && e.stack ? '\n' + e.stack : ''));
    return;
  }
  if (r === true) { report(no, title, true, ''); return; }
  if (r && r.ok === true) { report(no, title, true, r.detail || ''); return; }
  report(no, title, false, (r && r.detail) ? r.detail : '斷言不成立');
}

function isNum(v) { return typeof v === 'number' && isFinite(v); }
function fmtNum(v) {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'number' && !isFinite(v)) return String(v);
  if (typeof v === 'number') return String(Math.round(v * 1e6) / 1e6);
  return String(v);
}

/* ================================================================= */

loadAll();

var TD = global.window.TD;
if (!TD) { console.log('LOAD FAIL  window.TD 不存在'); process.exit(1); }
if (!TD.engine || typeof TD.engine.run !== 'function') {
  console.log('LOAD FAIL  TD.engine.run 不是函式');
  process.exit(1);
}
if (!TD.store || typeof TD.store.sample !== 'function') {
  console.log('LOAD FAIL  TD.store.sample 不是函式');
  process.exit(1);
}

var raw = TD.raw;
var p = TD.store.sample();
var ctx = TD.engine.run(p);

/* 模組錯誤先印出來：斷言失敗時通常根因在這裡 */
if (ctx.errors && ctx.errors.length) {
  console.log('');
  console.log('!! 模組層錯誤（pipeline 已容錯但結果不完整）：');
  var ei;
  for (ei = 0; ei < ctx.errors.length; ei++) console.log('   - ' + ctx.errors[ei]);
  console.log('');
}

console.log('=== smoke：二十項斷言 ===');
console.log('示範專案：' + p.name);

/* ---- 1. m3.baseFloorM2 為正，且等於面積 × 容積率 ---- */
check(1, 'ctx.m3.baseFloorM2 為正且等於 面積 × 容積率', function () {
  var m3 = ctx.m3;
  if (!m3 || m3.error) return { ok: false, detail: 'm3 未產出：' + (m3 && m3.error) };
  var base = raw(m3.baseFloorM2), far = raw(m3.far), area = m3.areaM2Used;
  if (!isNum(base) || base <= 0) return { ok: false, detail: 'baseFloorM2 = ' + fmtNum(base) };
  if (!isNum(far) || !isNum(area)) {
    return { ok: false, detail: 'far = ' + fmtNum(far) + '、areaM2Used = ' + fmtNum(area) };
  }
  var want = area * far;
  if (Math.abs(base - want) > Math.max(1e-6, Math.abs(want) * 1e-9)) {
    return { ok: false, detail: 'baseFloorM2 ' + fmtNum(base) + ' ≠ 面積 ' + fmtNum(area)
      + ' × 容積率 ' + fmtNum(far) + ' = ' + fmtNum(want) };
  }
  return { ok: true, detail: fmtNum(area) + ' ㎡ × ' + fmtNum(far) + ' = ' + fmtNum(base) + ' ㎡' };
});

/* ---- 2. m4.options 非空，且 chosen.pct <= regime.capOfBase + tdrCap + 1e-9 ---- */
check(2, 'ctx.m4.options 非空，且 chosen.pct 不超過制度上限 ＋ 容積移轉上限', function () {
  var m4 = ctx.m4;
  if (!m4 || m4.error) return { ok: false, detail: 'm4 未產出：' + (m4 && m4.error) };
  if (!m4.options || !m4.options.length) return { ok: false, detail: 'options 長度為 0' };
  var chosen = m4.chosen;
  if (!chosen) return { ok: false, detail: 'chosen 為空' };
  var bd = TD.data.bonus, i, regime = null;
  for (i = 0; i < bd.regimes.length; i++) if (bd.regimes[i].id === chosen.regimeId) regime = bd.regimes[i];
  if (!regime) return { ok: false, detail: '找不到 chosen.regimeId = ' + chosen.regimeId + ' 的制度' };
  var cap = (isNum(regime.capOfBase) ? regime.capOfBase : 0)
          + (isNum(bd._meta.tdrCapOfBase) ? bd._meta.tdrCapOfBase : 0);
  if (!isNum(chosen.pct)) return { ok: false, detail: 'chosen.pct = ' + fmtNum(chosen.pct) };
  if (chosen.pct > cap + 1e-9) {
    return { ok: false, detail: 'chosen.pct ' + fmtNum(chosen.pct) + ' 超過上限 ' + fmtNum(cap)
      + '（制度 ' + regime.id + ' capOfBase ' + fmtNum(regime.capOfBase)
      + ' ＋ tdrCap ' + fmtNum(bd._meta.tdrCapOfBase) + '）' };
  }
  return { ok: true, detail: 'options ' + m4.options.length + ' 組，chosen ' + chosen.id
    + ' pct ' + fmtNum(chosen.pct) + ' ≤ ' + fmtNum(cap) };
});

/* ---- 3. m5.sellablePing > 0 ---- */
check(3, 'ctx.m5.sellablePing 為正', function () {
  var m5 = ctx.m5;
  if (!m5 || m5.error) return { ok: false, detail: 'm5 未產出：' + (m5 && m5.error) };
  var v = raw(m5.sellablePing);
  if (!isNum(v) || v <= 0) return { ok: false, detail: 'sellablePing = ' + fmtNum(v) };
  return { ok: true, detail: fmtNum(Math.round(v * 10) / 10) + ' 坪' };
});

/* ---- 4. m6.unitPricePing 為正 ---- */
check(4, 'ctx.m6.unitPricePing 為正', function () {
  var m6 = ctx.m6;
  if (!m6 || m6.error) return { ok: false, detail: 'm6 未產出：' + (m6 && m6.error) };
  var v = raw(m6.unitPricePing);
  if (!isNum(v) || v <= 0) return { ok: false, detail: 'unitPricePing = ' + fmtNum(v) };
  return { ok: true, detail: fmtNum(Math.round(v)) + ' 元/坪（方法 ' + m6.method + '，n = ' + m6.n + '）' };
});

/* ---- 5. m8.landCap 為正且小於 m6.totalSales ---- */
check(5, 'ctx.m8.landCap 為正，且小於 ctx.m6.totalSales', function () {
  var m8 = ctx.m8, m6 = ctx.m6;
  if (!m8 || m8.error) return { ok: false, detail: 'm8 未產出：' + (m8 && m8.error) };
  var cap = raw(m8.landCap), sales = raw(m6 && m6.totalSales);
  if (!isNum(cap) || cap <= 0) return { ok: false, detail: 'landCap = ' + fmtNum(cap) };
  if (!isNum(sales) || sales <= 0) return { ok: false, detail: 'totalSales = ' + fmtNum(sales) };
  if (!(cap < sales)) {
    return { ok: false, detail: 'landCap ' + fmtNum(cap) + ' 未小於 totalSales ' + fmtNum(sales) };
  }
  return { ok: true, detail: 'landCap ' + fmtNum(Math.round(cap)) + ' < totalSales '
    + fmtNum(Math.round(sales)) + '（占 ' + fmtNum(Math.round(cap / sales * 1000) / 10) + '%）' };
});

/* ---- 6. 單調性：提高 targetIrr 會讓 landCap 下降 ---- */
var ctxHi = null;
check(6, '提高 p.m8.targetIrr 會讓 landCap 下降（單調性）', function () {
  var base = raw(ctx.m8 && ctx.m8.landCap);
  if (!isNum(base) || base <= 0) return { ok: false, detail: '基準 landCap = ' + fmtNum(base) + '，無法比較' };
  var p2 = TD.store.sample();
  p2.m8.targetIrr = p.m8.targetIrr + 0.10;
  p2.m8.targetMargin = 0;            /* 只測 IRR 條件的單調性，避免被淨利率條件綁死 */
  var pLo = TD.store.sample();
  pLo.m8.targetMargin = 0;
  var ctxLo = TD.engine.run(pLo);
  ctxHi = TD.engine.run(p2);
  var lo = raw(ctxLo.m8 && ctxLo.m8.landCap);
  var hi = raw(ctxHi.m8 && ctxHi.m8.landCap);
  if (!isNum(lo)) return { ok: false, detail: 'targetIrr ' + fmtNum(pLo.m8.targetIrr) + ' 時 landCap = ' + fmtNum(lo) };
  if (hi === null) {
    return { ok: true, detail: 'targetIrr ' + fmtNum(p2.m8.targetIrr)
      + ' 時已無解（null），比 ' + fmtNum(Math.round(lo)) + ' 更嚴格，符合單調性' };
  }
  if (!isNum(hi)) return { ok: false, detail: '提高後 landCap = ' + fmtNum(hi) + '（不是數字也不是 null）' };
  if (!(hi < lo)) {
    return { ok: false, detail: 'targetIrr ' + fmtNum(pLo.m8.targetIrr) + ' → ' + fmtNum(Math.round(lo))
      + '，targetIrr ' + fmtNum(p2.m8.targetIrr) + ' → ' + fmtNum(Math.round(hi)) + '，未下降' };
  }
  return { ok: true, detail: 'targetIrr ' + fmtNum(pLo.m8.targetIrr) + ' → ' + fmtNum(Math.round(lo))
    + '；targetIrr ' + fmtNum(p2.m8.targetIrr) + ' → ' + fmtNum(Math.round(hi)) };
});

/* ---- 7. 敏感度 price 的 loCap < hiCap ---- */
check(7, '敏感度 price 的 loCap < hiCap', function () {
  var m8 = ctx.m8;
  if (!m8 || m8.error) return { ok: false, detail: 'm8 未產出' };
  var s = m8.sensitivity, i, it = null;
  if (!s || !s.length) return { ok: false, detail: 'sensitivity 為空' };
  for (i = 0; i < s.length; i++) if (s[i].id === 'price') it = s[i];
  if (!it) return { ok: false, detail: '找不到 id 為 price 的敏感度項目' };
  if (!isNum(it.loCap) || !isNum(it.hiCap)) {
    return { ok: false, detail: 'loCap = ' + fmtNum(it.loCap) + '、hiCap = ' + fmtNum(it.hiCap) };
  }
  if (!(it.loCap < it.hiCap)) {
    return { ok: false, detail: 'loCap ' + fmtNum(it.loCap) + ' 未小於 hiCap ' + fmtNum(it.hiCap) };
  }
  return { ok: true, detail: '售價 −10% → ' + fmtNum(Math.round(it.loCap))
    + '；+10% → ' + fmtNum(Math.round(it.hiCap)) + '，擺動 ' + fmtNum(Math.round(it.swing)) };
});

/* ---- 8. gate.total > 0 ---- */
check(8, 'ctx.gate.total > 0', function () {
  var g = ctx.gate;
  if (!g) return { ok: false, detail: 'ctx.gate 不存在' };
  if (!isNum(g.total) || g.total <= 0) return { ok: false, detail: 'gate.total = ' + fmtNum(g.total) };
  if (g.done + g.todo !== g.total) {
    return { ok: false, detail: 'done ' + g.done + ' ＋ todo ' + g.todo + ' ≠ total ' + g.total };
  }
  return { ok: true, detail: '需複核 ' + g.total + ' 項（已複核 ' + g.done + '、待複核 ' + g.todo
    + '），全部數值 ' + g.valueTotal + ' 項' };
});

/* ---- 9. m8.stress 四項齊全，判定合法 ----
   壓力測試是「這個案子撐不撐得住」的唯一量化答案，四項少一項、
   或判定跑出「通過／警示／不通過」以外的字，介面就會靜默漏掉風險。 */
check(9, 'ctx.m8.stress 四項齊全，每項 verdict 為 通過／警示／不通過 之一且淨利率與 IRR 非 NaN', function () {
  var m8 = ctx.m8;
  if (!m8 || m8.error) return { ok: false, detail: 'm8 未產出：' + (m8 && m8.error) };
  var s = m8.stress;
  if (!s || s.length !== 4) {
    return { ok: false, detail: 'stress 應有四項，實際 ' + (s ? s.length : 'undefined') + ' 項' };
  }
  var OK = ['通過', '警示', '不通過'];
  var i, it, bad = [], detail = [];
  for (i = 0; i < s.length; i++) {
    it = s[i];
    if (!it || typeof it.id !== 'string' || it.id === '') { bad.push('第 ' + (i + 1) + ' 項缺 id'); continue; }
    if (typeof it.label !== 'string' || it.label === '') bad.push(it.id + ' 缺 label');
    if (OK.indexOf(it.verdict) < 0) bad.push(it.id + ' 的 verdict 為 ' + fmtNum(it.verdict) + '（不在三種判定內）');
    if (typeof it.margin === 'number' && !isFinite(it.margin)) bad.push(it.id + ' 的 margin 為 ' + String(it.margin));
    if (typeof it.irr === 'number' && !isFinite(it.irr)) bad.push(it.id + ' 的 irr 為 ' + String(it.irr));
    detail.push(it.id + '=' + String(it.verdict));
  }
  if (bad.length) return { ok: false, detail: bad.join('；') };
  return { ok: true, detail: detail.join('、') };
});

/* ---- 10. m8.walkAway 非 NaN，且不高於出價上限 ----
   走人價是「超過這個價就該離桌」的數字，比出價上限更嚴格，
   算出一個比上限還高的走人價等於沒有底線。 */
check(10, 'ctx.m8.walkAway 非 NaN，且不高於 ctx.m8.landCap', function () {
  var m8 = ctx.m8;
  if (!m8 || m8.error) return { ok: false, detail: 'm8 未產出：' + (m8 && m8.error) };
  if (!TD.isV(m8.walkAway)) return { ok: false, detail: 'walkAway 不是 V 包裝值' };
  var w = raw(m8.walkAway), cap = raw(m8.landCap);
  if (typeof w === 'number' && !isFinite(w)) return { ok: false, detail: 'walkAway 為 ' + String(w) };
  if (!isNum(w)) return { ok: false, detail: 'walkAway 為 ' + fmtNum(w) + '（本案應算得出來）' };
  if (!isNum(cap)) return { ok: false, detail: 'landCap 為 ' + fmtNum(cap) + '，無法比較' };
  if (w > cap + 1e-6) {
    return { ok: false, detail: 'walkAway ' + fmtNum(Math.round(w)) + ' 高於 landCap ' + fmtNum(Math.round(cap)) };
  }
  return { ok: true, detail: 'walkAway ' + fmtNum(Math.round(w)) + ' ≤ landCap ' + fmtNum(Math.round(cap))
    + '（' + (m8.walkAwayFrom ? String(m8.walkAwayFrom).slice(0, 40) : '來源未填') + '…）' };
});

/* ---- 11. m8.scenarios 三情境齊全，樂觀的上限高於保守 ----
   三個情境用同一份現金流重算，方向錯了（保守比樂觀還能出價）
   代表情境參數接錯線，那比不準危險得多。 */
check(11, 'ctx.m8.scenarios 三情境齊全、base 為選用，且樂觀的 landCap 高於保守', function () {
  var m8 = ctx.m8;
  if (!m8 || m8.error) return { ok: false, detail: 'm8 未產出：' + (m8 && m8.error) };
  var s = m8.scenarios;
  if (!s || s.length !== 3) {
    return { ok: false, detail: 'scenarios 應有三項，實際 ' + (s ? s.length : 'undefined') + ' 項' };
  }
  var byId = {}, i, it, bad = [];
  for (i = 0; i < s.length; i++) {
    it = s[i];
    if (!it || typeof it.id !== 'string') { bad.push('第 ' + (i + 1) + ' 項缺 id'); continue; }
    byId[it.id] = it;
    if (typeof it.landCap === 'number' && !isFinite(it.landCap)) bad.push(it.id + '.landCap 為 ' + String(it.landCap));
  }
  var need = ['opt', 'base', 'con'], j;
  for (j = 0; j < need.length; j++) if (!byId[need[j]]) bad.push('缺情境 ' + need[j]);
  if (bad.length) return { ok: false, detail: bad.join('；') };
  if (byId.base.selected !== true) bad.push('base 的 selected 應為 true');
  var lo = byId.con.landCap, hi = byId.opt.landCap;
  if (!isNum(lo) || !isNum(hi)) bad.push('保守／樂觀的 landCap 至少一項算不出來：' + fmtNum(lo) + '、' + fmtNum(hi));
  else if (!(hi > lo)) bad.push('樂觀 ' + fmtNum(Math.round(hi)) + ' 未高於保守 ' + fmtNum(Math.round(lo)));
  if (bad.length) return { ok: false, detail: bad.join('；') };
  return { ok: true, detail: '保守 ' + fmtNum(Math.round(lo)) + ' < 基準 '
    + fmtNum(Math.round(byId.base.landCap)) + ' < 樂觀 ' + fmtNum(Math.round(hi)) };
});

/* ---- 12. 清空 deedText 後整條鏈不得丟例外（缺資料要能安全降級）---- */
check(12, '清空 p.parcel.deedText 後 run() 不丟例外，且能安全降級', function () {
  var p3 = TD.store.sample();
  p3.parcel.deedText = '';
  var c3;
  try {
    c3 = TD.engine.run(p3);
  } catch (e) {
    return { ok: false, detail: 'run() 丟出例外：' + (e && e.message ? e.message : e)
      + (e && e.stack ? '\n' + e.stack : '') };
  }
  if (!c3) return { ok: false, detail: 'run() 沒有回傳 ctx' };
  /* 缺謄本時，m1/m2 仍要有結果（只是信心低、warnings 多），不可整個 error 掉 */
  var bad = [];
  if (!c3.m1 || c3.m1.error) bad.push('m1 失敗：' + (c3.m1 && c3.m1.error));
  if (!c3.m2 || c3.m2.error) bad.push('m2 失敗：' + (c3.m2 && c3.m2.error));
  if (c3.m1 && c3.m1.deed && c3.m1.deed.parsed !== false) {
    bad.push('無謄本時 m1.deed.parsed 應為 false，實際為 ' + fmtNum(c3.m1.deed.parsed));
  }
  if (!c3.gate || !isNum(c3.gate.total)) bad.push('gate 未算出');
  /* 下游財務鏈不吃謄本，應照常算得出出價上限 */
  var cap = raw(c3.m8 && c3.m8.landCap);
  if (!(cap === null || isNum(cap))) bad.push('m8.landCap 為 ' + fmtNum(cap) + '（應為數字或 null，不得是 NaN）');
  if (bad.length) return { ok: false, detail: bad.join('；') };
  return { ok: true, detail: 'm1 警示 ' + ((c3.m1.warnings && c3.m1.warnings.length) || 0)
    + ' 則、m2 燈號 ' + c3.m2.level + '、m8.landCap ' + fmtNum(cap === null ? null : Math.round(cap)) };
});

/* ---- 13. 迴歸防線：m6 拒絕估價時，m8 不准生出出價上限 ----
   曾出現的錯：m6 因為沒有任何比較案例而明確拒絕估價（unitPricePing 為 null），
   m7 卻用 TD.data.cost 的保守預設單價回落粗估出一個總銷，m8 再拿它回推出
   一個六億多、看起來很精確的土地出價上限。那是用編出來的收入算出來的數字，
   違反原則一。正確行為是整條鏈一路降級成 null，而不是補一個數字。 */
check(13, 'm6 拒絕估價（無比較案例）時，m8.landCap／landCapPerPing／walkAway 一律為 null，不得生出數字', function () {
  var p4 = TD.store.sample();
  p4.m6.useSampleComps = false;
  p4.m6.comps = [];
  var c4;
  try {
    c4 = TD.engine.run(p4);
  } catch (e) {
    return { ok: false, detail: 'run() 丟出例外：' + (e && e.message ? e.message : e) };
  }
  var bad = [];
  if (!c4.m6 || c4.m6.error) return { ok: false, detail: 'm6 未產出：' + (c4.m6 && c4.m6.error) };
  if (raw(c4.m6.unitPricePing) !== null) {
    bad.push('前提不成立：無樣本時 m6.unitPricePing 應為 null，實際 ' + fmtNum(raw(c4.m6.unitPricePing)));
  }
  var cap = raw(c4.m8 && c4.m8.landCap);
  if (cap !== null) bad.push('m8.landCap 應為 null，實際 ' + fmtNum(cap) + '（用回落單價編出來的收入回推，不可接受）');
  /* 出價上限算不出來時，由它派生的每坪單價與走人價也必須一路 null。
     這裡曾經是三個客戶版本的頭條數字，版本機制移除後改守這兩個派生值。 */
  var heads = [['m8.landCapPerPing', c4.m8 && c4.m8.landCapPerPing],
               ['m8.walkAway', c4.m8 && c4.m8.walkAway]];
  var i, hv;
  for (i = 0; i < heads.length; i++) {
    hv = raw(heads[i][1]);
    if (hv !== null) bad.push(heads[i][0] + ' 應為 null，實際 ' + fmtNum(hv));
  }
  if (!c4.m8 || !c4.m8.notes || !c4.m8.notes.length) bad.push('m8 未在 notes 說明為何算不出來');
  if (bad.length) return { ok: false, detail: bad.join('；') };
  return { ok: true, detail: '無樣本時整條鏈一路降級為 null，m8 附 ' + c4.m8.notes.length + ' 則說明' };
});

/* ---- 14. SPEC 第 3 節：V 的 key 全域唯一 ----
   曾出現的錯：pipeline 把 m4 的粗估結果留在 ctx.m4Rough，它與正式的 ctx.m4
   共用 m4.pct／m4.bonusFloorM2／m4.totalFloorM2 三個 key。後果是
   TD.ui.findValue 靠走訪順序才碰巧命中正式值、p.overrides 同時改寫兩處、
   勾一次「已複核」等於複核兩個數，而閘門計數靠去重才剛好對得上。
   key 撞號是靜默的錯，所以在這裡守。 */
check(14, 'TD.collectValues(ctx) 的每一個 key 都唯一（SPEC 第 3 節）', function () {
  var vals;
  try { vals = TD.collectValues(ctx) || []; }
  catch (e) { return { ok: false, detail: 'collectValues 丟出例外：' + (e && e.message ? e.message : e) }; }
  var cnt = {}, i, k, dup = [];
  for (i = 0; i < vals.length; i++) {
    k = String(vals[i] && vals[i].key === undefined ? '' : vals[i].key);
    cnt[k] = (cnt[k] || 0) + 1;
  }
  for (k in cnt) {
    if (!Object.prototype.hasOwnProperty.call(cnt, k)) continue;
    if (cnt[k] > 1) dup.push(k + ' ×' + cnt[k]);
  }
  if (!vals.length) return { ok: false, detail: 'collectValues 回傳空陣列' };
  if (dup.length) return { ok: false, detail: '重複的 key：' + dup.join('、') };
  return { ok: true, detail: vals.length + ' 個 V，key 全部唯一' };
});

/* ---- 15. 迴歸防線：交屋期越長，出價上限必須越低 ----
   曾出現的錯：交屋尾款 85% 固定收在完工月，handoverMonths 只進 horizon 不進時點，
   於是「交屋期拉長」反而讓出價上限上升（管銷總額還被往後攤，報酬更好看）。
   預設 6 個月就高估 7,255 萬。方向錯的模型比不準的模型危險得多。 */
check(15, '交屋期（m7.handoverMonths）拉長時，m8.landCap 單調下降', function () {
  var hs = [0, 6, 12, 24], caps = [], i, pp, cc, v;
  for (i = 0; i < hs.length; i++) {
    pp = TD.store.sample();
    pp.m7.handoverMonths = hs[i];
    try { cc = TD.engine.run(pp); }
    catch (e) { return { ok: false, detail: 'handoverMonths = ' + hs[i] + ' 時 run() 丟例外' }; }
    v = raw(cc.m8 && cc.m8.landCap);
    if (!isNum(v)) return { ok: false, detail: 'handoverMonths = ' + hs[i] + ' 時 landCap = ' + fmtNum(v) };
    caps.push(v);
  }
  for (i = 1; i < caps.length; i++) {
    if (!(caps[i] < caps[i - 1])) {
      return { ok: false, detail: '交屋期 ' + hs[i - 1] + ' → ' + hs[i] + ' 個月時出價上限由 '
        + fmtNum(Math.round(caps[i - 1])) + ' 變成 ' + fmtNum(Math.round(caps[i]))
        + '（未下降；交屋越晚、尾款越晚收、利息壓越久，上限必須變低）' };
    }
  }
  var txt = [], j;
  for (j = 0; j < hs.length; j++) txt.push(hs[j] + '月→' + fmtNum(Math.round(caps[j])));
  return { ok: true, detail: txt.join('、') };
});

/* ---- 16. 迴歸防線：容積率被覆寫為 0 時不得生出出價上限 ----
   曾出現的錯：m5 用 posNum() 把 0 當成「缺值」，於是把使用者明確設為 0 的容積率
   悄悄換成分區種子值 5.6，替一塊零容積的地算出 13.7 億出價上限。
   0 是一個值，不是缺值。 */
check(16, 'p.m3.overrides.far = 0 時，量體與出價上限一律為 0／null，不得回落種子值', function () {
  var pp = TD.store.sample();
  pp.m3.overrides.far = 0;
  var cc;
  try { cc = TD.engine.run(pp); } catch (e) { return { ok: false, detail: 'run() 丟例外' }; }
  var bad = [];
  if (raw(cc.m3.far) !== 0) bad.push('m3.far 應為 0，實際 ' + fmtNum(raw(cc.m3.far)));
  if (raw(cc.m3.baseFloorM2) !== 0) bad.push('m3.baseFloorM2 應為 0，實際 ' + fmtNum(raw(cc.m3.baseFloorM2)));
  if (raw(cc.m5.volFloorM2) !== 0) {
    bad.push('m5.volFloorM2 應為 0（不得回落分區種子值），實際 ' + fmtNum(raw(cc.m5.volFloorM2)));
  }
  var cap = raw(cc.m8 && cc.m8.landCap);
  if (cap !== null && cap !== 0) bad.push('m8.landCap 應為 null 或 0，實際 ' + fmtNum(cap));
  if (bad.length) return { ok: false, detail: bad.join('；') };
  return { ok: true, detail: '零容積一路傳下去，landCap = ' + fmtNum(cap) };
});

/* ---- 17. 迴歸防線：m3 停車檢核算不出來時，m5 不得從說明文字撈數字 ----
   曾出現的錯：m5 用 firstNumber(c.requirement) 把「每 150 ㎡ 設一位」讀成「150 個車位」，
   憑空生出 3.75 億車位收入與 4 億地下室成本。比例被當成數量。 */
check(17, 'm3 停車檢核為 manual（valueNum 為 null）時，m5 不得生出車位數', function () {
  var pp = TD.store.sample();
  pp.parcel.zone = '商九';                       /* 種子資料沒有這個分區 → far/bcr 查不到 */
  var cc;
  try { cc = TD.engine.run(pp); } catch (e) { return { ok: false, detail: 'run() 丟例外' }; }
  var chk = null, i, list = (cc.m3 && cc.m3.checks) || [];
  for (i = 0; i < list.length; i++) if (list[i] && list[i].id === 'parking') chk = list[i];
  if (!chk) return { ok: false, detail: 'm3 沒有 parking 檢核' };
  if (chk.status === 'pass') return { ok: false, detail: '前提不成立：未知分區時 parking 竟為 pass' };
  var bad = [];
  if (chk.valueNum !== null) bad.push('m3 parking.valueNum 應為 null，實際 ' + fmtNum(chk.valueNum));
  if (cc.m5.parkingRequired !== null) {
    bad.push('m5.parkingRequired 應為 null，實際 ' + fmtNum(cc.m5.parkingRequired)
      + '（八成是從 requirement 字串撈到了「每 150 ㎡」的 150）');
  }
  if (raw(cc.m6 && cc.m6.parkingRevenue)) {
    bad.push('m6.parkingRevenue 應為 null 或 0，實際 ' + fmtNum(raw(cc.m6.parkingRevenue)));
  }
  if (bad.length) return { ok: false, detail: bad.join('；') };
  return { ok: true, detail: 'm3 說算不出來，m5 就回 null，沒有憑空生出車位收入' };
});

/* ---- 18. 去版本化的迴歸防線：專案結構與結果樹都不得再帶 edition ----
   A／B／C 三個客戶版本已整條移除。專案結構裡殘留一個版本欄位、或結果樹裡
   殘留一個版本節點，介面就會再長出一個沒人維護的分支，
   也會讓匯入的舊檔案悄悄帶回版本行為。 */
check(18, 'TD.store.defaults() 不含 edition 欄位，且 ctx 不含 ed 節點', function () {
  var d;
  try { d = TD.store.defaults(); }
  catch (e) { return { ok: false, detail: 'defaults() 丟出例外：' + (e && e.message ? e.message : e) }; }
  var bad = [];
  if (Object.prototype.hasOwnProperty.call(d, 'edition')) bad.push('defaults() 仍有 edition 欄位');
  var s = TD.store.sample();
  if (Object.prototype.hasOwnProperty.call(s, 'edition')) bad.push('sample() 仍有 edition 欄位');
  /* 這裡刻意用方括號取值：checkall.sh 會 grep 整個專案，禁止再出現點號形式的
     版本欄位取用，測試本身不該成為那條規則的例外。 */
  if (ctx['ed'] !== undefined) bad.push('結果樹仍有版本節點（型別 ' + (typeof ctx['ed']) + '）');
  /* 匯入舊檔案時，版本欄位必須被丟掉而不是沿用 */
  var adopted = TD.store.adopt({ parcel: {}, edition: 'B' }, []);
  if (adopted && adopted['edition'] !== undefined) bad.push('adopt() 把舊檔案的版本欄位帶進來了');
  if (bad.length) return { ok: false, detail: bad.join('；') };
  return { ok: true, detail: '專案結構與結果樹都沒有版本欄位' };
});


/* ---- 19. 報告層必須組得出來，且一定帶著免責聲明 ----
   審查抓到的真實錯誤：report.js 呼叫 details.js 的 cashBlock 少傳一個參數，
   reportHtml 整段丟例外，頂列「報告」按鈕按下去只留一塊滿版白色遮罩。
   當時 checkall 全綠、smoke 全過，因為沒有任何一項會實際渲染報告。這一項就是那條防線。*/
check(19, 'TD.ui.reportHtml(ctx, p) 不丟例外、含免責聲明且無 NaN', function () {
  loadUiOnce();
  if (!TD.ui || typeof TD.ui.reportHtml !== 'function') {
    return { ok: false, detail: 'TD.ui.reportHtml 不是函式（js/ui/report.js 沒載入或沒掛上去）' };
  }
  var h;
  try { h = TD.ui.reportHtml(ctx, p); }
  catch (e) { return { ok: false, detail: 'reportHtml 丟出例外：' + (e && e.message ? e.message : e) }; }
  var bad = [];
  if (typeof h !== 'string' || h.length < 2000) bad.push('報告內容過短（' + (h ? h.length : 0) + ' 字）');
  if (h.indexOf('免責') < 0) bad.push('報告沒有免責聲明');
  if (h.indexOf('NaN') >= 0) bad.push('報告裡出現 NaN');
  if (h.indexOf('undefined') >= 0) bad.push('報告裡出現 undefined');
  /* 逐月明細是 cashBlock 的第三個參數決定的，報告版一律展開 */
  if (h.indexOf('逐月明細') < 0) bad.push('報告缺逐月明細區塊');
  if (bad.length) return { ok: false, detail: bad.join('；') };
  return { ok: true, detail: '報告 ' + h.length + ' 字，含免責聲明與逐月明細' };
});

/* ---- 20. 渲染後的介面文字不得出現模組代號或「模組」二字 ----
   契約 UI-V2 第 8 節第 3 款。原始碼 grep 擋不住組字串（common.js 的 zh() 就是組字串寫的），
   所以真正的防線是把 HTML 產生出來再掃。同時擋 NaN／undefined／0 冒充的回歸：
   空專案的摘要必須是「—」，不得出現「0 元」這種憑空生出的數字。*/
check(20, '渲染後的介面文字沒有代號、沒有 NaN，空專案不以 0 冒充', function () {
  loadUiOnce();
  var need = ['renderInputs', 'renderResults', 'renderDetails'];
  var i;
  for (i = 0; i < need.length; i++) {
    if (!TD.ui || typeof TD.ui[need[i]] !== 'function') {
      return { ok: false, detail: 'TD.ui.' + need[i] + ' 不是函式' };
    }
  }
  function allOpen() { return true; }
  function full(c, pr) {
    return TD.ui.renderInputs(c, pr, allOpen) + TD.ui.renderResults(c, pr, allOpen)
      + TD.ui.renderDetails(c, pr, allOpen) + TD.ui.reportHtml(c, pr);
  }
  /* 可見文字：去掉標籤，再把 title／aria-label 的內容補回來（提示也是使用者看得到的） */
  function visible(h) {
    var body = h.replace(/<[^>]*>/g, ' ');
    var attrs = h.match(/(?:title|aria-label|alt)="[^"]*"/g);
    return body + ' ' + (attrs ? attrs.join(' ') : '');
  }

  var empty = TD.store.defaults();
  var cases = [
    { name: '示範專案', p: p, ctx: ctx },
    { name: '空專案', p: empty, ctx: TD.engine.run(empty) }
  ];
  /* 關掉示範比價：總銷算不出來，成本的比率項會被引擎用回落粗估總銷推出金額 */
  var noComps = TD.store.sample();
  noComps.m6 = noComps.m6 || {};
  noComps.m6.useSampleComps = false;
  noComps.m6.comps = [];
  cases.push({ name: '無比價資料', p: noComps, ctx: TD.engine.run(noComps) });

  /* 代號樣式與「模組」二字都用組字串寫，避免字面值留在本檔裡被自己的 grep 抓到 */
  var MOD_RE = new RegExp('(^|[^0-9A-Za-z_])' + 'M' + '[1-8]' + '([^0-9A-Za-z_]|$)');
  var WORD = '模' + '組';
  var DOT = '\\.';
  var PATH_RE = new RegExp('(?:ctx|p)?' + DOT + '?[Mm][1-8]' + DOT + '[A-Za-z][A-Za-z0-9_' + DOT + ']*');

  var bad = [], k, h, txt;
  for (k = 0; k < cases.length; k++) {
    try { h = full(cases[k].ctx, cases[k].p); }
    catch (e) { bad.push(cases[k].name + ' 渲染丟例外：' + (e && e.message ? e.message : e)); continue; }
    txt = visible(h);
    if (MOD_RE.test(txt)) bad.push(cases[k].name + ' 出現模組代號');
    if (txt.indexOf(WORD) >= 0) bad.push(cases[k].name + ' 出現「' + WORD + '」二字');
    if (txt.indexOf('NaN') >= 0) bad.push(cases[k].name + ' 出現 NaN');
    if (txt.indexOf('undefined') >= 0) bad.push(cases[k].name + ' 出現 undefined');
    if (txt.indexOf('[object Object]') >= 0) bad.push(cases[k].name + ' 出現 [object Object]');
    if (PATH_RE.test(txt)) bad.push(cases[k].name + ' 洩漏內部欄位路徑 ' + txt.match(PATH_RE)[0]);
    if (txt.indexOf('TD.data.') >= 0) bad.push(cases[k].name + ' 洩漏種子資料表名稱');
  }

  /* 原則一：空專案的一頁摘要不得用 0 冒充算不出來 */
  var sumEmpty = TD.ui.resultsUtil.summaryBlock(cases[1].ctx, cases[1].p);
  var plain = sumEmpty.replace(/<[^>]*>/g, '|');
  if (plain.indexOf('0 元') >= 0) bad.push('空專案的摘要出現「0 元」（以 0 冒充算不出來）');
  if (plain.indexOf('|0.0|') >= 0) bad.push('空專案的摘要出現「0.0」（以 0 冒充算不出來）');
  /* 無比價資料時總成本不得呈現成已算出的金額（引擎用回落粗估總銷推出來的） */
  var sumNoComps = TD.ui.resultsUtil.summaryBlock(cases[2].ctx, cases[2].p).replace(/<[^>]*>/g, '|');
  if (/總成本（不含地）\|[0-9]/.test(sumNoComps)) {
    bad.push('無比價資料時摘要的總成本仍印出金額（上游總銷算不出來）');
  }

  if (bad.length) return { ok: false, detail: bad.join('；') };
  return { ok: true, detail: cases.length + ' 種專案狀態的渲染輸出都乾淨，摘要沒有以 0 冒充' };
});

/* ================================================================= */

console.log('');
console.log('=== 結果：' + passCount + ' PASS / ' + failCount + ' FAIL ===');
if (failCount > 0) {
  console.log('（修的時候請改真正的錯，不要放寬斷言。）');
  process.exit(1);
}
process.exit(0);
