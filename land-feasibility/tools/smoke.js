/* tools/smoke.js —— 三十二項斷言。
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
   21～28 是 2026-10 使用者回報（新北市三重區幸福段、乙種工業區 5 筆 1,618 ㎡）留下的防線：
   比價不得再拿大安區、工業區不得當住宅估、不得預設危老、行政區要能選、
   第二類謄本要能判讀、介面不得出現「待查證」「算不出來」。
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

/* 載入順序以 index.html 的 script 清單為準（介面層與 main.js 除外），
   避免測試載入的檔案與網站實際載入的不同步。實價登錄行情檔是網站依縣市延遲載入的，
   這裡直接載入示範專案（臺北市 A）與回報案例（新北市 F）兩個縣市。*/
var LOAD = (function () {
  var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  var m = html.match(/src="(js\/[^"]+)"/g) || [], out = [], i, rel;
  for (i = 0; i < m.length; i++) {
    rel = m[i].slice(5, -1);
    if (rel.indexOf('js/ui/') === 0 || rel === 'js/main.js') continue;
    out.push(rel);
  }
  out.push('js/data/lvr/A.js', 'js/data/lvr/F.js');
  return out;
})();

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

console.log('=== smoke：三十二項斷言 ===');
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

/* ---- 2. m4.options 非空，且 chosen.pct 不超過該制度各桶上限之和（有總額上限者不超過總額）---- */
check(2, 'ctx.m4.options 非空，且 chosen.pct 不超過制度上限', function () {
  var m4 = ctx.m4;
  if (!m4 || m4.error) return { ok: false, detail: 'm4 未產出：' + (m4 && m4.error) };
  if (!m4.options || !m4.options.length) return { ok: false, detail: 'options 長度為 0' };
  var chosen = m4.chosen;
  if (!chosen) return { ok: false, detail: 'chosen 為空' };
  var regime = TD.data.bonus.regimeById(chosen.regimeId);
  if (!regime) return { ok: false, detail: '找不到 chosen.regimeId = ' + chosen.regimeId + ' 的制度' };
  var caps = regime.caps || {}, k, cap = 0;
  for (k in caps) if (Object.prototype.hasOwnProperty.call(caps, k) && k !== 'total') cap += caps[k];
  if (isNum(caps.total)) cap = Math.min(cap, caps.total);
  if (!isNum(chosen.pct)) return { ok: false, detail: 'chosen.pct = ' + fmtNum(chosen.pct) };
  if (chosen.pct > cap + 1e-9) return { ok: false, detail: 'chosen.pct ' + fmtNum(chosen.pct) + ' 超過上限 ' + fmtNum(cap) };
  return { ok: true, detail: 'options ' + m4.options.length + ' 組，chosen ' + chosen.id + ' pct ' + fmtNum(chosen.pct) + ' ≤ ' + fmtNum(cap) };
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

/* ---- 10. 建議出價非 NaN，且不高於出價上限（走人價）----
   走人價＝出價上限：超過就該離桌；建議出價是保留緩衝的談判目標，必須更低。 */
check(10, 'ctx.m8.bidTarget 非 NaN，且不高於 ctx.m8.landCap（走人價）', function () {
  var m8 = ctx.m8;
  if (!m8 || m8.error) return { ok: false, detail: 'm8 未產出：' + (m8 && m8.error) };
  if (!TD.isV(m8.bidTarget)) return { ok: false, detail: 'bidTarget 不是 V 包裝值' };
  var w = raw(m8.bidTarget), cap = raw(m8.landCap);
  if (!isNum(w)) return { ok: false, detail: 'bidTarget 為 ' + fmtNum(w) + '（本案應算得出來）' };
  if (!isNum(cap)) return { ok: false, detail: 'landCap 為 ' + fmtNum(cap) + '，無法比較' };
  if (w > cap + 1e-6) return { ok: false, detail: 'bidTarget ' + fmtNum(Math.round(w)) + ' 高於 landCap ' + fmtNum(Math.round(cap)) };
  return { ok: true, detail: '建議出價 ' + fmtNum(Math.round(w)) + ' ≤ 走人價 ' + fmtNum(Math.round(cap)) };
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

/* 暫時拿掉某縣市的行情檔（模擬網站上行情檔尚未載入或載入失敗），跑完再放回去 */
function withoutLvr(city, fn) {
  var L = TD.data.lvr, keep = L.counties[city];
  delete L.counties[city];
  try { return fn(); } finally { if (keep) L.counties[city] = keep; }
}

/* ---- 13. 迴歸防線：沒有任何行情資料時，不准用預設單價編出出價上限 ----
   曾出現的錯：沒有比較案例時以保守預設單價回落粗估總銷，m8 再拿它回推出一個
   看起來很精確的土地出價上限。正確行為是整條鏈一路降級成 null，並說明要補什麼。 */
check(13, '無行情資料（行情檔未載入、無匯入案例、無指定單價）時，單價、出價上限與建議出價一律為 null', function () {
  var c4 = withoutLvr('臺北市', function () { return TD.engine.run(TD.store.sample()); });
  var bad = [];
  if (!c4.m6 || c4.m6.error) return { ok: false, detail: 'm6 未產出：' + (c4.m6 && c4.m6.error) };
  if (raw(c4.m6.unitPricePing) !== null) bad.push('m6.unitPricePing 應為 null，實際 ' + fmtNum(raw(c4.m6.unitPricePing)));
  var heads = [['m8.landCap', c4.m8 && c4.m8.landCap], ['m8.landCapPerPing', c4.m8 && c4.m8.landCapPerPing],
               ['m8.bidTarget', c4.m8 && c4.m8.bidTarget]];
  var i, hv;
  for (i = 0; i < heads.length; i++) {
    hv = raw(heads[i][1]);
    if (hv !== null && hv !== undefined) bad.push(heads[i][0] + ' 應為 null，實際 ' + fmtNum(hv));
  }
  if (!c4.m8 || !c4.m8.notes || !c4.m8.notes.length) bad.push('m8 未在 notes 說明為何算不出來');
  if (bad.length) return { ok: false, detail: bad.join('；') };
  return { ok: true, detail: '無行情時整條鏈降級為 null，m8 附 ' + c4.m8.notes.length + ' 則說明' };
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

/* ---- 17. 迴歸防線：分區查不到（沒有容積率）時，m5 不得生出車位數或車位收入 ----
   曾出現的錯：m5 從檢核說明文字撈數字，把「每 150 ㎡ 設一位」讀成「150 個車位」。 */
check(17, '分區不在分區表（無容積率）時，停車檢核不得為 pass，m5 不得生出車位與車位收入', function () {
  var pp = TD.store.sample();
  pp.parcel.zone = '商九';
  var cc;
  try { cc = TD.engine.run(pp); } catch (e) { return { ok: false, detail: 'run() 丟例外' }; }
  var chk = null, i, list = (cc.m3 && cc.m3.checks) || [];
  for (i = 0; i < list.length; i++) if (list[i] && list[i].id === 'parking') chk = list[i];
  if (!chk) return { ok: false, detail: 'm3 沒有 parking 檢核' };
  var bad = [];
  if (chk.status === 'pass') bad.push('未知分區時 parking 竟為 pass');
  if (chk.valueNum !== null) bad.push('m3 parking.valueNum 應為 null，實際 ' + fmtNum(chk.valueNum));
  if (raw(cc.m5.stalls)) bad.push('m5.stalls 應為 0，實際 ' + fmtNum(raw(cc.m5.stalls)));
  if (raw(cc.m6 && cc.m6.parkingRevenue)) bad.push('m6.parkingRevenue 應為 0 或 null，實際 ' + fmtNum(raw(cc.m6.parkingRevenue)));
  if (bad.length) return { ok: false, detail: bad.join('；') };
  return { ok: true, detail: '查無容積率時車位為 0、沒有憑空生出車位收入' };
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
  /* 拿掉行情檔：總銷算不出來，成本的比率項會被引擎用回落粗估總銷推出金額 */
  var noComps = TD.store.sample();
  cases.push({ name: '無比價資料', p: noComps, ctx: withoutLvr('臺北市', function () { return TD.engine.run(noComps); }) });

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

/* ================= 21～28：2026-10 使用者回報案例的防線 ================= */

function caseP(zone, extra) {
  var q = TD.store.defaults();
  q.name = '幸福段1428';
  q.parcel.city = '新北市'; q.parcel.district = '三重區'; q.parcel.section = '幸福段';
  q.parcel.numbers = [{ no: '1428', areaM2: 201, share: '1/1' }, { no: '1428-1', areaM2: 78, share: '1/1' },
                      { no: '1430-2', areaM2: 488, share: '1/1' }, { no: '1430-3', areaM2: 838, share: '1/1' },
                      { no: '1430-4', areaM2: 13, share: '1/1' }];
  q.parcel.zone = zone;
  if (extra) extra(q);
  return q;
}
var pCase = caseP('乙種工業區');
var cCase = TD.engine.run(pCase);

/* ---- 21. 乙種工業區不得當住宅估，也不得預設危老 ---- */
check(21, '新北市三重區乙種工業區：產品為廠辦、建蔽 60%／容積 210%，素地不採危老或都更', function () {
  var bad = [], site = cCase.m3 && cCase.m3.site;
  if (!site) return { ok: false, detail: 'm3.site 不存在' };
  if (site.product !== '廠辦') bad.push('產品應為廠辦，實際 ' + site.product);
  if (raw(cCase.m3.bcr) !== 0.6) bad.push('建蔽率應為 0.6，實際 ' + fmtNum(raw(cCase.m3.bcr)));
  if (raw(cCase.m3.far) !== 2.1) bad.push('容積率應為 2.1，實際 ' + fmtNum(raw(cCase.m3.far)));
  var ch = cCase.m4 && cCase.m4.chosen;
  if (!ch) bad.push('m4.chosen 為空');
  else if (ch.regimeId === 'HR' || ch.regimeId === 'UR') bad.push('素地卻採用 ' + ch.regimeName);
  var regs = (cCase.m4 && cCase.m4.regimes) || [], i, hr = null;
  for (i = 0; i < regs.length; i++) if (regs[i].id === 'HR') hr = regs[i];
  if (!hr || hr.feasible) bad.push('危老在素地應判為不可行並列出原因');
  if (bad.length) return { ok: false, detail: bad.join('；') };
  return { ok: true, detail: site.product + '，' + ch.regimeName + ' ' + fmtNum(ch.pct) };
});

/* ---- 22. 比價只用本區實價登錄，不得再出現其他行政區（曾拿大安區比三重區）---- */
check(22, '比價案例全部來自新北市三重區，單價落在 25～80 萬／坪', function () {
  var m6 = cCase.m6, bad = [];
  if (!m6 || m6.method !== 'district') return { ok: false, detail: 'm6.method 應為 district，實際 ' + (m6 && m6.method) };
  var comps = m6.comps || [], i;
  if (!comps.length) bad.push('沒有比價案例');
  for (i = 0; i < comps.length; i++) if (comps[i].district !== '三重區') { bad.push('出現其他行政區案例：' + comps[i].district); break; }
  var price = raw(m6.unitPricePing);
  if (!(price >= 250000 && price <= 800000)) bad.push('單價 ' + fmtNum(price) + ' 不在合理區間');
  if (bad.length) return { ok: false, detail: bad.join('；') };
  return { ok: true, detail: comps.length + ' 筆三重區廠辦預售，單價 ' + fmtNum(Math.round(price)) };
});

/* ---- 23. 出價上限每坪不得高於本區同分區土地成交的第 75 百分位（曾算出 234.7 萬／坪）---- */
check(23, '幸福段出價上限每坪為正，且不高於三重區工業區土地行情第 75 百分位', function () {
  var per = raw(cCase.m8 && cCase.m8.landCapPerPing), bm = cCase.m8 && cCase.m8.benchmark;
  if (!isNum(per) || per <= 0) return { ok: false, detail: 'landCapPerPing = ' + fmtNum(per) };
  if (!bm || !isNum(bm.p75)) return { ok: false, detail: '缺本區土地行情' };
  if (per > bm.p75) return { ok: false, detail: '每坪 ' + fmtNum(Math.round(per)) + ' 高於行情 75 百分位 ' + fmtNum(bm.p75) };
  return { ok: true, detail: '每坪 ' + fmtNum(Math.round(per)) + '；行情中位 ' + fmtNum(bm.p50) + '、75 百分位 ' + fmtNum(bm.p75) };
});

/* ---- 24. 營建成本為 2026 年行情（地上每坪至少 15 萬），且計入營業稅 ---- */
check(24, '營建單價每坪 15 萬以上、地下室單價高於地上，且成本含營業稅', function () {
  var m7 = cCase.m7, bad = [];
  if (!m7 || !m7.params) return { ok: false, detail: 'm7 未產出' };
  if (!(m7.params.perPing >= 150000)) bad.push('地上營建單價 ' + fmtNum(m7.params.perPing));
  if (!(m7.params.basementPerPing > m7.params.perPing)) bad.push('地下室單價未高於地上');
  if (!(m7.raws.businessTax > 0)) bad.push('營業稅為 ' + fmtNum(m7.raws.businessTax));
  if (bad.length) return { ok: false, detail: bad.join('；') };
  return { ok: true, detail: '地上 ' + fmtNum(Math.round(m7.params.perPing)) + '、地下 ' + fmtNum(Math.round(m7.params.basementPerPing))
    + '、營業稅 ' + fmtNum(Math.round(m7.raws.businessTax)) };
});

/* ---- 25. 行政區清單與行情檔齊全；新北市住宅區容積率依行政區與路寬 ---- */
check(25, '22 縣市 368 鄉鎮市區、每縣市都有行情檔；三重區住宅區 300%，路寬 6 m 降為 200%', function () {
  var dd = TD.data.districts, bad = [], n = 0, i;
  if (!dd || dd.counties.length !== 22) bad.push('縣市數 ' + (dd ? dd.counties.length : 0));
  for (i = 0; dd && i < dd.counties.length; i++) {
    n += dd.list(dd.counties[i]).length;
    if (!fs.existsSync(path.join(ROOT, 'js/data/lvr/' + dd.codeOf[dd.counties[i]] + '.js'))) bad.push(dd.counties[i] + ' 缺行情檔');
  }
  if (n !== 368) bad.push('鄉鎮市區數 ' + n);
  if (!dd.has('新北市', '三重區')) bad.push('新北市沒有三重區');
  var cRes = TD.engine.run(caseP('住宅區'));
  if (raw(cRes.m3.far) !== 3.0) bad.push('三重區住宅區容積率 ' + fmtNum(raw(cRes.m3.far)));
  var cNar = TD.engine.run(caseP('住宅區', function (q) { q.parcel.roadWidth = 6; }));
  if (raw(cNar.m3.far) !== 2.0) bad.push('路寬 6 m 時容積率 ' + fmtNum(raw(cNar.m3.far)));
  if (bad.length) return { ok: false, detail: bad.join('；') };
  return { ok: true, detail: '22 縣市、' + n + ' 區；三重住宅區 300%／窄路 200%' };
});

/* ---- 26. 第二類謄本（姓名、統編隱匿）要能判讀 ---- */
check(26, '第二類謄本：辨識為第二類，面積、權利範圍與抵押權照常判讀，不因隱匿而亮紅燈', function () {
  var txt = ['土地登記第二類謄本（地號全部）', '新北市三重區幸福段　１４２８地號',
    '＊＊＊＊＊＊ 土地標示部 ＊＊＊＊＊＊', '面積：＊＊＊＊＊２０１．００平方公尺',
    '＊＊＊＊＊＊ 土地所有權部 ＊＊＊＊＊＊', '（０００１）登記次序：０００１', '登記日期：民國０９５年０３月０２日　登記原因：買賣',
    '所有權人：林＊＊', '統一編號：Ａ１２＊＊＊＊＊＊＊', '權利範圍：＊＊＊＊２分之１＊＊＊＊',
    '（０００２）登記次序：０００２', '所有權人：陳＊＊', '權利範圍：＊＊＊＊２分之１＊＊＊＊',
    '＊＊＊＊＊＊ 土地他項權利部 ＊＊＊＊＊＊', '權利種類：最高限額抵押權', '擔保債權總金額：新臺幣＊＊＊３，６００，０００元正'].join('\n');
  var q = caseP('乙種工業區', function (x) { x.parcel.numbers = [{ no: '1428', areaM2: 201, share: '1/1' }]; x.parcel.deedText = txt; });
  var c = TD.engine.run(q), bad = [];
  if (c.m1.deedClass !== 2) bad.push('deedClass 應為 2，實際 ' + fmtNum(c.m1.deedClass));
  if (!c.m1.deed || !c.m1.deed.found || !c.m1.deed.found.share) bad.push('沒有解析出權利範圍');
  if (c.m2.level === 'red') bad.push('第二類謄本被判紅燈');
  if (bad.length) return { ok: false, detail: bad.join('；') };
  return { ok: true, detail: '第二類，產權燈號 ' + c.m2.level };
});

/* ---- 27. 法規檢討不得再有「算不出來」：每一項都要有計算結果 ---- */
check(27, '法規檢討每一項的狀態為 通過／不通過／注意／提醒，沒有人工待補', function () {
  var list = (cCase.m3 && cCase.m3.checks) || [], i, bad = [], ok = ['pass', 'fail', 'warn', 'info', 'na'];
  if (list.length < 9) bad.push('檢核項目只有 ' + list.length + ' 項');
  for (i = 0; i < list.length; i++) if (ok.indexOf(list[i].status) < 0) bad.push(list[i].id + ' 狀態 ' + list[i].status);
  if (bad.length) return { ok: false, detail: bad.join('；') };
  return { ok: true, detail: list.map(function (x) { return x.id + '=' + x.status; }).join('、') };
});

/* ---- 28. 介面文字不得出現「待查證」「算不出來」 ---- */
check(28, '示範專案與幸福段案例的介面與報告不出現「待查證」「算不出來」', function () {
  loadUiOnce();
  function allOpen() { return true; }
  var bad = [], list = [[p, ctx, '示範專案'], [pCase, cCase, '幸福段']], i, h;
  for (i = 0; i < list.length; i++) {
    h = TD.ui.renderInputs(list[i][1], list[i][0], allOpen) + TD.ui.renderResults(list[i][1], list[i][0], allOpen)
      + TD.ui.renderDetails(list[i][1], list[i][0], allOpen) + TD.ui.reportHtml(list[i][1], list[i][0]);
    if (h.indexOf('待查證') >= 0) bad.push(list[i][2] + ' 出現「待查證」');
    if (h.indexOf('算不出來') >= 0) bad.push(list[i][2] + ' 出現「算不出來」');
  }
  if (bad.length) return { ok: false, detail: bad.join('；') };
  return { ok: true, detail: '兩個專案的介面與報告都沒有' };
});

/* ================= 29～32：2026-10-05 工業區都更、變更與研究行情 ================= */

/* ---- 29. 工業區變更為住宅區：以回饋 40% 後的剩餘土地 × 住宅區容積率計算，產品改住宅，土地仍比工業區行情 ---- */
check(29, '工業區變更為住宅區：基準容積 = 面積 × 60% × 300%、產品住宅大樓、審議加 36 個月、土地比較仍用工業區行情', function () {
  var c = TD.engine.run(caseP('乙種工業區', function (q) { q.parcel.rezone = 'res'; })), bad = [];
  var want = 1618 * 0.6 * 3.0, got = raw(c.m3.baseFloorM2);
  if (!(Math.abs(got - want) < 1e-6)) bad.push('基準容積 ' + fmtNum(got) + '，應為 ' + fmtNum(want));
  if (c.m3.site.product !== '住宅大樓') bad.push('產品 ' + c.m3.site.product);
  if (!(c.m7.schedule.planMonthsEff >= 36 + 12)) bad.push('規劃期 ' + c.m7.schedule.planMonthsEff + ' 個月，未加計都市計畫變更審議');
  var lm = c.m6.market && c.m6.market.land;
  if (!lm || !/工業區/.test(lm.label)) bad.push('土地行情不是工業區：' + (lm && lm.label));
  if (bad.length) return { ok: false, detail: bad.join('；') };
  return { ok: true, detail: '基準容積 ' + fmtNum(Math.round(got)) + ' ㎡、規劃期 ' + c.m7.schedule.planMonthsEff + ' 個月、出價上限每坪 '
    + fmtNum(Math.round(raw(c.m8.landCapPerPing))) };
});

/* ---- 30. 研究行情：同產品單價與土地成交優先於實價登錄中位數 ---- */
check(30, '研究行情：廠辦 52-62 取 57 萬、土地 70 萬，看不懂的行要回報', function () {
  var c = TD.engine.run(caseP('乙種工業區', function (q) {
    q.m6.researchText = '廠辦, 新案A, 52-62, 2026-06, 報導\n土地, TOYOTA 三重舊廠, 70, 2025-10, ETtoday\n看不懂的一行';
  })), bad = [];
  if (c.m6.method !== 'research') bad.push('m6.method 應為 research，實際 ' + c.m6.method);
  if (raw(c.m6.unitPricePing) !== 570000) bad.push('單價 ' + fmtNum(raw(c.m6.unitPricePing)));
  if (!c.m8.benchmark || c.m8.benchmark.perPing !== 700000) bad.push('土地行情 ' + fmtNum(c.m8.benchmark && c.m8.benchmark.perPing));
  if (!c.m6.research || c.m6.research.errors.length !== 1) bad.push('應回報 1 行看不懂');
  if (bad.length) return { ok: false, detail: bad.join('；') };
  return { ok: true, detail: '採用研究行情，出價上限每坪 ' + fmtNum(Math.round(raw(c.m8.landCapPerPing))) };
});

/* ---- 31. 新北都更：二箭基準容積加給依基地規模與路寬，TOD 可併入都更 ---- */
check(31, '新北都更二箭：2,000 ㎡ 以上臨 20 m 路加給 10%，未達 2,000 ㎡ 不適用；都更可列入 TOD', function () {
  var bad = [];
  function urItem(c, id) {
    var regs = c.m4.regimes || [], i, j;
    for (i = 0; i < regs.length; i++) if (regs[i].id === 'UR') for (j = 0; j < regs[i].items.length; j++) if (regs[i].items[j].id === id) return regs[i].items[j];
    return null;
  }
  var big = TD.engine.run(caseP('乙種工業區', function (q) {
    q.parcel.numbers = [{ no: '1', areaM2: 2400, share: '1/1' }]; q.parcel.roadWidth = 20; q.parcel.buildingAgeYears = 50;
    q.parcel.existingFloorM2 = 2000; q.parcel.mrtDistanceM = 250;
  }));
  var nb = urItem(big, 'NTP_BASE'), tod = urItem(big, 'TOD');
  if (!nb || nb.pct !== 0.1) bad.push('2,400 ㎡ 臨 20 m 路的二箭應為 10%，實際 ' + fmtNum(nb && nb.pct));
  if (!tod || !(tod.pct > 0)) bad.push('距站 250 m 的都更應可申請 TOD 增額容積');
  var small = urItem(cCase, 'NTP_BASE');
  if (!small || small.applicable) bad.push('1,618 ㎡ 不應適用二箭');
  if (bad.length) return { ok: false, detail: bad.join('；') };
  return { ok: true, detail: '二箭 10%、TOD ' + fmtNum(tod.pct) };
});

/* ---- 32. 大面積舊廠房房地交易列為地價參考（例：三重溪尾街 TOYOTA 舊廠 2025-10，約 67 萬／坪）---- */
check(32, '三重區土地行情附大面積舊建物房地交易，含 2025-10 溪尾街一筆、每坪地價 60～75 萬', function () {
  var lm = cCase.m6.market && cCase.m6.market.land, od = lm && lm.oldDeals ? lm.oldDeals : [], i, hit = null;
  for (i = 0; i < od.length; i++) if (od[i].addr === '溪尾街' && od[i].ym === 202510) hit = od[i];
  if (!hit) return { ok: false, detail: '找不到溪尾街 2025-10 的交易（共 ' + od.length + ' 筆）' };
  if (!(hit.unitPricePing >= 600000 && hit.unitPricePing <= 750000)) return { ok: false, detail: '每坪地價 ' + fmtNum(hit.unitPricePing) };
  return { ok: true, detail: '溪尾街 ' + hit.areaPing + ' 坪、總價 ' + hit.totalWan + ' 萬、每坪 ' + fmtNum(hit.unitPricePing) };
});

/* ================================================================= */

console.log('');
console.log('=== 結果：' + passCount + ' PASS / ' + failCount + ' FAIL ===');
if (failCount > 0) {
  console.log('（修的時候請改真正的錯，不要放寬斷言。）');
  process.exit(1);
}
process.exit(0);
