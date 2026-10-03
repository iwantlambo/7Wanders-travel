/* 啟動、綁定、重算、左右兩欄渲染、頂列選單（UI-V2 第 2、7 節）。
   單一頁面：沒有路由、沒有檢視註冊表、沒有版本切換。*/
window.TD = window.TD || {};
(function (TD) {
  'use strict';

  /* ==================================================================
     這支檔案只做五件事：

     1. 啟動：載入目前專案 → TD.engine.run → 畫左欄輸入與右欄結果。
     2. 自動雙向綁定：帶 data-bind 的輸入元件由這裡統一接管
        （讀值填入 → 變更寫回 TD.store.set → 重算 → 重繪）。
        數字與下拉用 change 觸發，textarea 用 focusout，避免每打一個字就整條重算。
        重繪後還原捲動位置、焦點欄位與游標位置，否則使用者打字會被打斷。
     3. 委派：data-act → TD.actions[名稱]；.num[data-vkey] → TD.ui.openDrawer。
        只認 .num 這個 class：抽屜內容本身外層帶 data-vkey，若一律往上找
        data-vkey，在抽屜裡點一下就會重開抽屜、把還沒存的複核備註洗掉。
     4. 收合狀態：區塊展開與否存在 localStorage（不是專案資料，不進 project）。
     5. 頂列：專案切換、新專案、單位、報告、⋯選單
        （匯出／匯入／匯出全部／複製／示範／刪除／資料版本／覆寫與複核紀錄）。
        後兩項是小視窗，沿用抽屜的樣式，不另做一套。

     錯誤保護：渲染各自包 try/catch，失敗只換成一張錯誤框，不會變白畫面；
     window.onerror 也接起來顯示在畫面上。引擎重算失敗時保留上一份 ctx，
     並在畫面上明講「你看到的是上一次的結果」。
     ================================================================== */

  TD.actions = TD.actions || {};

  var SEC_KEY = 'tdev.v2.sections';

  var S = {
    p: null,        /* 目前專案 */
    ctx: null,      /* 最近一次成功的計算結果 */
    sec: {},        /* 區塊收合狀態 */
    runError: null,
    gerr: [],
    booted: false,
    inputTimer: null   /* 打字重算的 debounce 計時器 */
  };

  function isArr(x) { return Object.prototype.toString.call(x) === '[object Array]'; }
  function isObj(x) { return !!x && typeof x === 'object'; }
  function hasOwn(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function byId(id) { return document.getElementById(id); }
  function trim(s) { return String(s === null || s === undefined ? '' : s).replace(/^\s+|\s+$/g, ''); }

  function esc(s) {
    if (TD.ui && TD.ui.esc) return TD.ui.esc(s);
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function errText(e) {
    if (!e) return '未知錯誤';
    if (e.message) return String(e.message);
    return String(e);
  }

  function stackHead(e) {
    if (!e || !e.stack) return '';
    var lines = String(e.stack).split('\n'), i;
    for (i = 0; i < lines.length; i++) {
      if (trim(lines[i]) && lines[i].indexOf(errText(e)) < 0) return trim(lines[i]);
    }
    return trim(lines[0] || '');
  }

  function upAttr(el, attr) {
    while (el && el !== document) {
      if (el.getAttribute && el.getAttribute(attr) !== null) return el;
      el = el.parentNode;
    }
    return null;
  }

  function upCls(el, cls) {
    while (el && el !== document) {
      if (el.className && typeof el.className === 'string'
          && (' ' + el.className + ' ').indexOf(' ' + cls + ' ') >= 0) return el;
      el = el.parentNode;
    }
    return null;
  }

  function isFormEl(el) {
    if (!el || !el.tagName) return false;
    var t = el.tagName.toLowerCase();
    return t === 'input' || t === 'select' || t === 'textarea';
  }

  function say(msg) { try { window.alert(msg); } catch (e) {} }
  function ask(msg) { try { return !!window.confirm(msg); } catch (e) { return false; } }

  /* ===================== 1. 收合狀態（localStorage） ===================== */

  function secLoad() {
    var txt = null;
    try { txt = window.localStorage ? window.localStorage.getItem(SEC_KEY) : null; } catch (e) { txt = null; }
    if (!txt) return {};
    try {
      var o = JSON.parse(txt);
      return isObj(o) ? o : {};
    } catch (e2) { return {}; }
  }

  function secSave() {
    try { if (window.localStorage) window.localStorage.setItem(SEC_KEY, JSON.stringify(S.sec)); }
    catch (e) {}
  }

  /* 回傳 undefined 代表使用者沒設過，由渲染端決定預設 */
  function secIsOpen(id) {
    return hasOwn(S.sec, id) ? !!S.sec[id] : undefined;
  }

  /* ===================== 2. 全域錯誤保護 ===================== */

  var GERR_MAX = 5;

  function gerrHtml() {
    var h = '', i;
    for (i = 0; i < S.gerr.length; i++) {
      h += '<div class="note bad">未攔截的錯誤：' + esc(S.gerr[i].msg)
         + (S.gerr[i].at ? '　' + esc(S.gerr[i].at) : '') + '</div>';
    }
    return h;
  }

  function pushGErr(msg, at) {
    if (S.gerr.length >= GERR_MAX) return;
    S.gerr.push({ msg: String(msg || '未知錯誤'), at: String(at || '') });
    var host = byId('paneOut');
    if (host && host.insertAdjacentHTML) {
      try {
        host.insertAdjacentHTML('afterbegin',
          '<div class="note bad">未攔截的錯誤：' + esc(msg) + (at ? '　' + esc(at) : '') + '</div>');
      } catch (e) {}
    }
  }

  function installGlobalError() {
    window.onerror = function (msg, url, line, col, err) {
      var at = (url ? String(url).split('/').pop() : '') + (line ? ':' + line : '') + (col ? ':' + col : '');
      if (err && err.stack) at = at + '｜' + stackHead(err);
      pushGErr(msg, at);
      return false;
    };
    if (window.addEventListener) {
      window.addEventListener('unhandledrejection', function (ev) {
        var r = ev && ev.reason;
        pushGErr('未處理的非同步錯誤：' + errText(r), r ? stackHead(r) : '');
      }, false);
    }
  }

  /* ===================== 3. 重算與重繪 ===================== */

  function recalc() {
    S.runError = null;
    if (!TD.engine || typeof TD.engine.run !== 'function') {
      S.runError = '計算引擎未載入，請檢查 index.html 的 script 清單。';
    } else {
      try { S.ctx = TD.engine.run(S.p); }
      catch (e) {
        S.runError = '重算時發生例外：' + errText(e)
          + '。畫面顯示的是上一次成功的計算結果，不是目前輸入算出來的，請勿據此決策。';
      }
    }
    if (TD.ui && TD.ui.setProject) { try { TD.ui.setProject(S.p); } catch (e2) {} }
  }

  /* 重繪前記下焦點欄位與游標（用 data-bind 或 id 比對還原） */
  function captureFocus() {
    var a, o = null;
    try { a = document.activeElement; } catch (e) { return null; }
    if (!a || !a.getAttribute) return null;
    var sel = a.getAttribute('data-bind');
    if (sel) o = { q: '[data-bind="' + sel + '"]' };
    else if (a.id) o = { q: '#' + a.id };
    if (!o) return null;
    try { o.start = a.selectionStart; o.end = a.selectionEnd; }
    catch (e2) { o.start = null; o.end = null; }   /* type=number 讀 selectionStart 會丟例外 */
    return o;
  }

  function restoreFocus(o) {
    if (!o) return;
    var el;
    try { el = document.querySelector(o.q); } catch (e) { el = null; }
    if (!el) return;
    try { el.focus(); } catch (e2) { return; }
    if (o.start === null || o.start === undefined) return;
    try { if (el.setSelectionRange) el.setSelectionRange(o.start, o.end); } catch (e3) {}
  }

  function errorBox(title, detail) {
    return '<div class="note bad">' + esc(title) + '</div><pre>' + esc(detail) + '</pre>';
  }

  function render() {
    var paneIn = byId('paneIn'), paneOut = byId('paneOut');
    if (!paneIn || !paneOut) return;

    var focus = captureFocus();
    var sx = 0, sy = 0, inTop = 0;
    try { sx = window.pageXOffset || 0; sy = window.pageYOffset || 0; } catch (e) {}
    try { inTop = paneIn.scrollTop || 0; } catch (e2) {}

    var hIn;
    try { hIn = TD.ui.renderInputs(S.ctx, S.p, secIsOpen); }
    catch (e3) { hIn = errorBox('輸入欄位渲染失敗：' + errText(e3), stackHead(e3)); }

    var hOut = gerrHtml();
    if (S.runError) hOut += '<div class="note bad">' + esc(S.runError) + '</div>';
    if (S.ctx && isArr(S.ctx.errors) && S.ctx.errors.length) {
      hOut += '<div class="note warn">有部分計算失敗，其餘照常計算：'
            + esc(TD.ui.zh(S.ctx.errors.join('；'))) + '</div>';
    }
    try { hOut += TD.ui.renderResults(S.ctx, S.p, secIsOpen); }
    catch (e4) { hOut += errorBox('結果渲染失敗：' + errText(e4), stackHead(e4)); }
    try { hOut += TD.ui.renderDetails(S.ctx, S.p, secIsOpen); }
    catch (e5) { hOut += errorBox('明細渲染失敗：' + errText(e5), stackHead(e5)); }

    paneIn.innerHTML = hIn;
    paneOut.innerHTML = hOut;

    syncBinds(document);
    restoreFocus(focus);

    try { paneIn.scrollTop = inTop; } catch (e6) {}
    try { window.scrollTo(sx, sy); } catch (e7) {}
  }

  function refresh() {
    recalc();
    render();
    renderProjectSelect();
    if (TD.report && TD.report.isOpen && TD.report.isOpen()) {
      try { TD.report.open(S.ctx, S.p); } catch (e) {}
    }
  }

  TD.recalc = function () { refresh(); };
  TD.render = function () { render(); };

  /* ===================== 4. 頂列 ===================== */

  function renderProjectSelect() {
    var sel = byId('projectSelect');
    if (!sel || !S.p) return;
    var rows = [];
    try { rows = TD.store.list() || []; } catch (e) { rows = []; }
    var h = '', i, found = false;
    for (i = 0; i < rows.length; i++) {
      if (rows[i].id === S.p.id) found = true;
      h += '<option value="' + esc(rows[i].id) + '">' + esc(rows[i].name || '未命名') + '</option>';
    }
    if (!found) h = '<option value="' + esc(S.p.id) + '">' + esc(S.p.name || '未命名') + '</option>' + h;
    sel.innerHTML = h;
    try { sel.value = S.p.id; } catch (e2) {}
  }

  /* 面積單位在 ⋯ 選單裡（UI-V2 第 7 節）。目前生效的那一項前面掛一個 ✓。*/
  function renderUnitSelect() {
    var m2 = !!(S.p && S.p.units === 'm2');
    var a = document.querySelector('[data-act="unitPing"]');
    var b = document.querySelector('[data-act="unitM2"]');
    if (a) a.innerHTML = esc((m2 ? '　' : '✓ ') + '面積單位：坪');
    if (b) b.innerHTML = esc((m2 ? '✓ ' : '　') + '面積單位：平方公尺');
  }

  function setUnits(u) {
    var v = (u === 'm2') ? 'm2' : 'ping';
    menuClose();
    if (!S.p) return;
    try { TD.store.set(S.p, 'units', v); } catch (e) { S.p.units = v; }
    refresh();
    renderUnitSelect();
  }

  TD.actions.unitPing = function () { setUnits('ping'); };
  TD.actions.unitM2 = function () { setUnits('m2'); };

  function menuClose() { var m = byId('menu'); if (m) m.hidden = true; }
  function closeDrawer() { if (TD.ui && TD.ui.closeDrawer) TD.ui.closeDrawer(); }
  function drawerIsOpen() { return !!(TD.ui && TD.ui.drawerOpen && TD.ui.drawerOpen()); }
  function reportIsOpen() { return !!(TD.report && TD.report.isOpen && TD.report.isOpen()); }

  /* ===================== 5. 自動雙向綁定 ===================== */

  function round6(x) { return Math.round(x * 1e6) / 1e6; }

  /* 專案內部值 → 畫面值 */
  function bindFormat(type, val) {
    if (type === 'bool') return !!val;
    if (val === null || val === undefined) return '';
    if (type === 'pct') return isNum(val) ? String(round6(val * 100)) : '';
    if (type === 'num') return isNum(val) ? String(val) : '';
    if (type === 'json') {
      try { return JSON.stringify(val, null, 2); } catch (e) { return ''; }
    }
    if (typeof val === 'object') {
      try { return JSON.stringify(val); } catch (e2) { return ''; }
    }
    return String(val);
  }

  /* 畫面值 → 專案內部值。
     數字欄位留白一律寫回 null：null 代表「沿用預設」，不是 0。*/
  function bindParse(type, el) {
    var s, n;
    if (type === 'bool') return { ok: true, value: !!el.checked };
    s = trim(el.value);
    if (type === 'num' || type === 'pct') {
      if (s === '') return { ok: true, value: null };
      n = Number(s.replace(/,/g, ''));
      if (!isFinite(n)) return { ok: false, error: '必須是數字' };
      if (type === 'pct') n = round6(n / 100);
      return { ok: true, value: n };
    }
    if (type === 'json') {
      if (s === '') return { ok: true, value: null };
      try { return { ok: true, value: JSON.parse(s) }; }
      catch (e) { return { ok: false, error: '不是合法的 JSON' }; }
    }
    return { ok: true, value: el.value };
  }

  /* data-min / data-max：pct 欄位的界線可能寫成內部小數（0.3）或畫面百分比（30），
     用「絕對值 ≤ 1 視為內部小數」判斷，兩種寫法都夾得住。*/
  function boundOf(el, attr, type) {
    var a = el.getAttribute(attr);
    if (a === null || trim(a) === '') return null;
    var b = Number(a);
    if (!isFinite(b)) return null;
    if (type === 'pct' && Math.abs(b) > 1) b = b / 100;
    return b;
  }

  function syncBinds(root) {
    if (!root || !root.querySelectorAll || !S.p) return;
    var list = root.querySelectorAll('[data-bind]');
    var i, el, path, type, val, out;
    for (i = 0; i < list.length; i++) {
      el = list[i];
      path = el.getAttribute('data-bind');
      if (!path) continue;
      type = el.getAttribute('data-type') || 'text';
      val = undefined;
      try { val = TD.store.get(S.p, path); } catch (e) { val = undefined; }
      out = bindFormat(type, val);
      if (type === 'bool') el.checked = !!out;
      else if (String(el.value) !== String(out)) el.value = out;
    }
  }

  function writeBind(el) {
    var path = el.getAttribute('data-bind');
    var type = el.getAttribute('data-type') || 'text';
    if (!path || !S.p) return false;

    var parsed = bindParse(type, el);
    if (!parsed.ok) {
      say('「' + path + '」' + (parsed.error || '輸入格式不正確') + '，這次的修改沒有寫入。');
      syncBinds(document);
      return false;
    }

    var value = parsed.value, mn, mx;
    if (isNum(value)) {
      mn = boundOf(el, 'data-min', type);
      mx = boundOf(el, 'data-max', type);
      if (mn !== null) value = Math.max(mn, value);
      if (mx !== null) value = Math.min(mx, value);
    }

    var before;
    try { before = TD.store.get(S.p, path); } catch (e) { before = undefined; }
    if (before === value) { syncBinds(document); return false; }

    try { TD.store.set(S.p, path, value); }
    catch (e2) { say('寫入「' + path + '」失敗：' + errText(e2)); return false; }
    return true;
  }

  /* ===================== 6. 事件委派 ===================== */

  function dispatchAct(el) {
    var name = el.getAttribute('data-act');
    var fn = TD.actions ? TD.actions[name] : null;
    if (typeof fn !== 'function') { say('尚未實作的動作：' + name); return; }
    try { fn(el, S.ctx, S.p); }
    catch (e) { say('動作「' + name + '」執行失敗：' + errText(e)); }
  }

  function onChange(ev) {
    /* change 一定晚於 input：把還沒到期的打字重算取消，不要重算兩次 */
    if (S.inputTimer) {
      try { window.clearTimeout(S.inputTimer); } catch (e0) {}
      S.inputTimer = null;
    }
    var el = upAttr(ev.target, 'data-bind');
    if (el) {
      if (el.tagName && el.tagName.toLowerCase() === 'textarea') return;
      if (writeBind(el)) refresh();
      return;
    }
    el = upAttr(ev.target, 'data-act');
    if (el && isFormEl(el) && el.tagName.toLowerCase() !== 'textarea') dispatchAct(el);
  }

  /* 打字時就重算（UI-V2 第 1 節第 3 款「輸入一改右邊立刻重算」）。
     200ms 之後才算：整條鏈跑一次不便宜，逐鍵重算會卡。
     重繪由 refresh() 內的 captureFocus／restoreFocus 保住焦點與游標。
     textarea（謄本）不走這裡，仍然等失焦。*/
  var INPUT_DELAY = 200;

  function onInput(ev) {
    if (ev && ev.isComposing) return;          /* 中文輸入組字中，不打斷 */
    var el = upAttr(ev.target, 'data-bind');
    if (!el || !el.tagName) return;
    var tag = el.tagName.toLowerCase();
    if (tag === 'textarea' || tag === 'select') return;
    var type = el.getAttribute('data-type') || 'text';
    if (type === 'bool' || type === 'json') return;

    var path = el.getAttribute('data-bind');
    if (!path) return;
    if (S.inputTimer) { try { window.clearTimeout(S.inputTimer); } catch (e) {} }
    S.inputTimer = window.setTimeout(function () {
      S.inputTimer = null;
      var live;
      try { live = document.querySelector('[data-bind="' + path + '"]'); } catch (e2) { live = null; }
      if (!live) return;
      if (writeBind(live)) refresh();
    }, INPUT_DELAY);
  }

  /* textarea 專用：謄本很長，打一個字就重算整條鏈太浪費 */
  function onFocusOut(ev) {
    var el = upAttr(ev.target, 'data-bind');
    if (el) {
      if (!el.tagName || el.tagName.toLowerCase() !== 'textarea') return;
      if (writeBind(el)) refresh();
      return;
    }
    el = upAttr(ev.target, 'data-act');
    if (el && el.tagName && el.tagName.toLowerCase() === 'textarea') dispatchAct(el);
  }

  function onClick(ev) {
    var t = ev.target, el;

    var menu = byId('menu');
    if (menu && !menu.hidden) {
      if (t !== byId('btnMenu') && !upCls(t, 'menu')) menu.hidden = true;
    }

    if (t === byId('drawerBackdrop')) { closeDrawer(); return; }

    el = upAttr(t, 'data-act');
    if (el) {
      if (isFormEl(el)) return;          /* 表單元件走 change／focusout */
      dispatchAct(el);
      return;
    }

    /* 只有 .num 這一格會開明細抽屜 */
    el = upCls(t, 'num');
    if (el && el.getAttribute && el.getAttribute('data-vkey') && TD.ui && TD.ui.openDrawer) {
      try { TD.ui.openDrawer(el.getAttribute('data-vkey'), S.ctx, S.p); }
      catch (e) { say('開啟數值明細失敗：' + errText(e)); }
    }
  }

  function onKeyDown(ev) {
    var key = ev.key || '';
    if ((ev.ctrlKey || ev.metaKey) && (key === 'p' || key === 'P')) {
      if (ev.preventDefault) ev.preventDefault();
      openReportThenPrint();
      return;
    }
    if (key !== 'Escape' && key !== 'Esc') return;
    if (drawerIsOpen()) { closeDrawer(); return; }
    if (reportIsOpen()) { TD.report.close(); return; }
    var menu = byId('menu');
    if (menu && !menu.hidden) menu.hidden = true;
  }

  /* ===================== 7. 動作 ===================== */

  function safeName(s) {
    var v = String(s === null || s === undefined ? '' : s).replace(/[\\\/:*?"<>|\s]+/g, '_');
    return v.slice(0, 40) || '未命名';
  }

  function stamp() {
    return (TD.fmt && TD.fmt.dateStr) ? TD.fmt.dateStr() : String(new Date().getFullYear());
  }

  /* 匯出：Blob + createObjectURL，完全在本機，不上傳 */
  function download(filename, text) {
    var blob, url, a;
    try { blob = new Blob([text], { type: 'application/json;charset=utf-8' }); }
    catch (e) { say('這個瀏覽器不支援檔案匯出。'); return; }
    try { url = URL.createObjectURL(blob); }
    catch (e2) { say('無法建立下載連結：' + errText(e2)); return; }
    a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    try { a.click(); } catch (e3) { say('瀏覽器擋下了自動下載，請改用「檔案 → 另存」。'); }
    document.body.removeChild(a);
    window.setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e4) {} }, 5000);
  }

  function doPrint() {
    menuClose();
    closeDrawer();
    try { window.print(); } catch (e) { say('列印失敗：' + errText(e)); }
  }

  /* 報告層。TD.ui.openReport 是給頂列與外部呼叫的對外名稱，
     內部仍然走 report.js 的 TD.report.open，兩者是同一件事。*/
  function openReport() {
    menuClose();
    closeDrawer();
    if (!TD.report || typeof TD.report.open !== 'function') { say('報告功能未載入（js/ui/report.js）。'); return false; }
    try { return TD.report.open(S.ctx, S.p); }
    catch (e) { say('開啟報告失敗：' + errText(e)); return false; }
  }

  TD.ui = TD.ui || {};
  TD.ui.openReport = function () { return openReport(); };

  /* 列印一律先把報告層打開：直接列印會印出操作介面，不是給人看的東西 */
  /* 報告層沒開起來就不要列印：@media print 會把介面與頁尾免責聲明一起藏掉，
     印出來會是一張沒有免責聲明的紙。*/
  function openReportThenPrint() {
    if (!openReport()) return;
    try { window.print(); } catch (e) { say('列印失敗：' + errText(e)); }
  }

  function persist() {
    try { TD.store.save(S.p); } catch (e) { say('儲存失敗：' + errText(e)); }
  }

  TD.actions.print = function () { doPrint(); };
  TD.actions.recalc = function () { refresh(); };

  TD.actions.secToggle = function (el) {
    var id = el.getAttribute('data-sec');
    if (!id) return;
    var cur = secIsOpen(id);
    if (cur === undefined) cur = el.getAttribute('aria-expanded') === 'true';
    S.sec[id] = !cur;
    secSave();
    render();
  };

  TD.actions.report = function () { openReport(); };
  TD.actions.reportClose = function () { if (TD.report) TD.report.close(); };

  /* ===================== 7b. 小視窗（沿用抽屜） ===================== */

  /* 資料版本與紀錄兩張表都塞進 #drawer，樣式共用，不另做一層浮層。
     不寫 data-vkey，避免被當成數值明細抽屜。*/
  function openPanel(title, bodyHtml) {
    var el = byId('drawer'), bd = byId('drawerBackdrop');
    if (!el) { say('找不到視窗容器（#drawer）。'); return; }
    el.innerHTML = '<div class="inline"><h3>' + esc(title) + '</h3>'
      + '<button type="button" class="btn btn-sm btn-ghost" data-act="drawerClose"'
      + ' style="margin-left:auto">關閉 ✕</button></div>'
      + (bodyHtml || '');
    el.removeAttribute('data-vkey');
    el.hidden = false;
    if (bd) bd.hidden = false;
    try { el.scrollTop = 0; } catch (e) {}
  }

  function keysOf(o) {
    var out = [], k;
    if (!isObj(o)) return out;
    for (k in o) { if (hasOwn(o, k)) out.push(k); }
    out.sort();
    return out;
  }

  function labelOf(k) {
    return (TD.ui && TD.ui.label) ? TD.ui.label(k) : String(k);
  }

  function badge(conf) {
    return (TD.ui && TD.ui.badge) ? TD.ui.badge(conf) : '';
  }

  function nStr(v, d) {
    if (!isNum(v)) return '—';
    return (TD.fmt && TD.fmt.n) ? TD.fmt.n(v, d === undefined ? 2 : d) : String(v);
  }

  function whenStr(at) {
    if (!isNum(at) || at <= 0) return '—';
    return (TD.fmt && TD.fmt.dateStr) ? TD.fmt.dateStr(at) : String(at);
  }

  /* ---- 資料版本：各份種子資料的 _meta ---- */

  var DATA_SETS = [
    { k: 'laws', t: '法規索引' },
    { k: 'zoning', t: '土地使用分區' },
    { k: 'bonus', t: '容積獎勵目錄' },
    { k: 'cost', t: '成本與財務參數' },
    { k: 'comps', t: '比較交易案例' }
  ];

  function dataMetaHtml() {
    var rows = [], i, set, meta, m;
    for (i = 0; i < DATA_SETS.length; i++) {
      set = DATA_SETS[i];
      m = (TD.data && isObj(TD.data[set.k])) ? TD.data[set.k] : null;
      meta = (m && isObj(m._meta)) ? m._meta : null;
      if (!meta) {
        rows.push({ name: set.t, asOf: '—', state: '<span class="num plain">未附版本資訊</span>', src: '—' });
        continue;
      }
      rows.push({
        name: set.t,
        asOf: meta.asOf ? String(meta.asOf) : '—',
        state: (meta.verified === true) ? '已查證' : badge('unv'),
        src: meta.source ? String(meta.source) : '—'
      });
    }
    return TD.ui.table([
      { k: 'name', label: '資料' },
      { k: 'asOf', label: '版本日期' },
      { k: 'state', label: '狀態', html: true },
      { k: 'src', label: '來源' }
    ], rows, { empty: '沒有載入任何種子資料。', scrollX: false });
  }

  /* ---- 覆寫與複核紀錄：逐列可清除 ---- */

  function recordsHtml(p) {
    var ov = (isObj(p) && isObj(p.overrides)) ? p.overrides : {};
    var rv = (isObj(p) && isObj(p.reviews)) ? p.reviews : {};
    var ovRows = [], rvRows = [], ks, i, k, r;

    ks = keysOf(ov);
    for (i = 0; i < ks.length; i++) {
      k = ks[i];
      if (!isNum(ov[k])) continue;
      ovRows.push({
        name: labelOf(k), val: nStr(ov[k], 2),
        act: '<button type="button" class="btn btn-sm" data-act="ovDrop" data-k="'
           + esc(k) + '">清除</button>'
      });
    }

    ks = keysOf(rv);
    for (i = 0; i < ks.length; i++) {
      k = ks[i];
      r = rv[k];
      if (!isObj(r)) continue;
      rvRows.push({
        name: labelOf(k),
        state: (r.status === 'done') ? '已複核' : '待複核',
        note: r.note ? String(r.note) : '—',
        at: whenStr(r.at),
        act: '<button type="button" class="btn btn-sm" data-act="rvDrop" data-k="'
           + esc(k) + '">清除</button>'
      });
    }

    var h = '<div class="grp"><h3>顯示覆寫</h3>';
    h += TD.ui.table([
      { k: 'name', label: '項目' },
      { k: 'val', label: '覆寫值', align: 'r' },
      { k: 'act', label: '', html: true, align: 'r' }
    ], ovRows, { empty: '沒有覆寫。', scrollX: false });
    h += '</div>';

    h += '<div class="grp"><h3>人工複核</h3>';
    h += TD.ui.table([
      { k: 'name', label: '項目' },
      { k: 'state', label: '狀態' },
      { k: 'note', label: '備註' },
      { k: 'at', label: '時間' },
      { k: 'act', label: '', html: true, align: 'r' }
    ], rvRows, { empty: '沒有複核紀錄。', scrollX: false });
    h += '</div>';

    return h;
  }

  function reopenRecords() { openPanel('覆寫與複核紀錄', recordsHtml(S.p)); }

  TD.actions.dataMeta = function () {
    menuClose();
    openPanel('資料版本', dataMetaHtml());
  };

  TD.actions.records = function () {
    menuClose();
    reopenRecords();
  };

  TD.actions.ovDrop = function (el) {
    var k = el.getAttribute('data-k');
    if (!k) return;
    TD.ui.clearOverride(S.p, k);
    persist();
    refresh();
    reopenRecords();
  };

  TD.actions.rvDrop = function (el) {
    var k = el.getAttribute('data-k');
    if (!k) return;
    TD.ui.setReview(S.p, k, false, '');
    persist();
    refresh();
    reopenRecords();
  };

  /* ---- 地號列 ---- */

  function parcelList() {
    var rows = (S.p && S.p.parcel && isArr(S.p.parcel.numbers)) ? S.p.parcel.numbers : [];
    var out = [], i;
    for (i = 0; i < rows.length; i++) {
      out.push({ no: rows[i].no, areaM2: rows[i].areaM2, share: rows[i].share });
    }
    return out;
  }

  TD.actions.addParcel = function () {
    var rows = parcelList();
    rows.push({ no: '', areaM2: 0, share: '1/1' });
    TD.store.set(S.p, 'parcel.numbers', rows);
    refresh();
  };

  TD.actions.delParcel = function (el) {
    var i = Number(el.getAttribute('data-i'));
    var rows = parcelList();
    if (!isNum(i) || i < 0 || i >= rows.length || rows.length <= 1) return;
    rows.splice(i, 1);
    TD.store.set(S.p, 'parcel.numbers', rows);
    refresh();
  };

  /* ---- 謄本解析結果套用 ---- */

  function deedOf() {
    return (S.ctx && S.ctx.m1 && isObj(S.ctx.m1.deed)) ? S.ctx.m1.deed : null;
  }

  function firstFound(deed, k) {
    var list = (deed && isObj(deed.found) && isArr(deed.found[k])) ? deed.found[k] : [];
    return list.length ? list[0].value : null;
  }

  function thisYear() {
    try { return new Date().getFullYear(); } catch (e) { return 0; }
  }

  /* 回傳 true 代表真的寫進去了 */
  function applyDeedField(f) {
    var deed = deedOf();
    if (!deed) return false;
    var detail = isObj(deed.detail) ? deed.detail : {};
    var totals = isObj(detail.totals) ? detail.totals : {};
    var building = isObj(detail.building) ? detail.building : {};
    var v, nos, areas, rows, i, y;

    if (f === 'section') {
      v = firstFound(deed, 'section');
      if (!v) return false;
      TD.store.set(S.p, 'parcel.section', String(v));
      return true;
    }
    if (f === 'zone') {
      v = detail.zone || firstFound(deed, 'zone');
      if (!v) return false;
      TD.store.set(S.p, 'parcel.zone', String(v));
      return true;
    }
    if (f === 'areaM2') {
      nos = (isObj(deed.found) && isArr(deed.found.no)) ? deed.found.no : [];
      areas = (isObj(deed.found) && isArr(deed.found.areaM2)) ? deed.found.areaM2 : [];
      if (!areas.length) return false;
      rows = parcelList();
      var out = [];
      for (i = 0; i < areas.length; i++) {
        out.push({
          no: nos[i] ? String(nos[i].value) : (rows[i] ? rows[i].no : ''),
          areaM2: isNum(areas[i].value) ? areas[i].value : 0,
          share: rows[i] ? rows[i].share : '1/1'
        });
      }
      TD.store.set(S.p, 'parcel.numbers', out);
      return true;
    }
    if (f === 'owner') {
      v = isNum(totals.ownerCount) ? totals.ownerCount : null;
      if (v === null) return false;
      TD.store.set(S.p, 'parcel.ownerCount', v);
      return true;
    }
    if (f === 'share') {
      v = isNum(totals.shareDenomMax) ? totals.shareDenomMax : null;
      if (v === null) return false;
      TD.store.set(S.p, 'parcel.shareDenomMax', v);
      return true;
    }
    if (f === 'buildingTotalAreaM2') {
      v = isNum(building.areaM2) ? building.areaM2 : firstFound(deed, 'buildingTotalAreaM2');
      if (!isNum(v)) return false;
      TD.store.set(S.p, 'parcel.existingFloorM2', v);
      return true;
    }
    if (f === 'completionDate') {
      y = isNum(building.completionAD) ? building.completionAD : null;
      if (y === null) return false;
      v = thisYear() - y;
      if (!isNum(v) || v < 0) return false;
      TD.store.set(S.p, 'parcel.buildingAgeYears', v);
      return true;
    }
    return false;
  }

  TD.actions.applyDeedField = function (el) {
    var f = el.getAttribute('data-f');
    if (!f) return;
    if (!applyDeedField(f)) { say('這一欄沒有可套用的值。'); return; }
    refresh();
  };

  TD.actions.applyDeedAll = function () {
    var list = (TD.ui && isArr(TD.ui.deedFields)) ? TD.ui.deedFields : [];
    var i, n = 0;
    for (i = 0; i < list.length; i++) {
      if (!list[i].apply) continue;
      if (applyDeedField(list[i].k)) n++;
    }
    if (!n) { say('沒有可套用的解析結果。'); return; }
    refresh();
  };

  TD.actions.clearDeed = function () {
    if (!ask('清空謄本全文？')) return;
    TD.store.set(S.p, 'parcel.deedText', '');
    refresh();
  };

  /* ---- 開發方式 ---- */

  TD.actions.pickToggle = function (el) {
    var id = el.getAttribute('data-id');
    if (!id) return;
    var cur = (S.p && S.p.m4 && isArr(S.p.m4.picked)) ? S.p.m4.picked.slice(0) : [];
    var at = cur.indexOf(id);
    if (el.checked && at < 0) cur.push(id);
    else if (!el.checked && at >= 0) cur.splice(at, 1);
    TD.store.set(S.p, 'm4.picked', cur);
    refresh();
  };

  TD.actions.applyBest = function () {
    var best = (S.ctx && S.ctx.m4 && isObj(S.ctx.m4.best)) ? S.ctx.m4.best : null;
    if (!best) { say('目前沒有可行的獎勵組合。'); return; }
    if (best.regimeId) TD.store.set(S.p, 'm4.regime', best.regimeId);
    if (isArr(best.itemIds)) TD.store.set(S.p, 'm4.picked', best.itemIds.slice(0));
    if (isNum(best.tdrPct)) TD.store.set(S.p, 'm4.tdrPct', best.tdrPct);
    refresh();
  };

  /* ---- 比價資料 CSV ---- */

  /* 一行一筆：單價,坪數,屋齡,樓層,距離m。缺格就留 0，不猜。*/
  function parseComps(text) {
    var lines = String(text || '').split(/\r?\n/), out = [], i, parts, n;
    for (i = 0; i < lines.length; i++) {
      if (!trim(lines[i])) continue;
      parts = lines[i].split(/[,\t]/);
      n = Number(trim(parts[0]).replace(/,/g, ''));
      if (!isFinite(n) || n <= 0) continue;
      out.push({
        id: 'u' + (out.length + 1), addr: '自訂 ' + (out.length + 1), district: '',
        unitPricePing: n,
        areaPing: Number(trim(parts[1] || '0')) || 0,
        ageYears: Number(trim(parts[2] || '0')) || 0,
        floor: Number(trim(parts[3] || '0')) || 0,
        totalFloors: 0,
        distanceM: Number(trim(parts[4] || '0')) || 0,
        year: 0, type: ''
      });
    }
    return out;
  }

  TD.actions.compsCsv = function () {
    var ta = byId('compsCsv');
    if (!ta) return;
    var rows = parseComps(ta.value);
    if (!rows.length) { say('沒有讀到任何一筆可用的成交資料（第一欄必須是單價）。'); return; }
    TD.store.set(S.p, 'm6.comps', rows);
    TD.store.set(S.p, 'm6.useSampleComps', false);
    refresh();
  };

  TD.actions.compsClear = function () {
    TD.store.set(S.p, 'm6.comps', []);
    refresh();
  };

  /* ---- 專案 ---- */

  TD.actions['export'] = function () {
    var txt;
    try { txt = TD.store.exportJSON(S.p); } catch (e) { say('匯出失敗：' + errText(e)); return; }
    download('土地評估_' + safeName(S.p.name) + '_' + stamp() + '.json', txt);
    menuClose();
  };

  TD.actions.exportAll = function () {
    var txt;
    try { txt = TD.store.exportAllJSON(); } catch (e) { say('匯出失敗：' + errText(e)); return; }
    download('土地評估_全部專案_' + stamp() + '.json', txt);
    menuClose();
  };

  TD.actions['import'] = function () {
    menuClose();
    var fi = byId('fileInput');
    if (fi) fi.click(); else say('找不到檔案選擇元件。');
  };

  TD.actions.duplicate = function () {
    menuClose();
    var copy;
    try { copy = TD.store.duplicate(S.p.id); } catch (e) { say('複製失敗：' + errText(e)); return; }
    if (!copy) { say('複製失敗：找不到目前專案。'); return; }
    try { TD.store.setCurrent(copy.id); } catch (e2) {}
    loadCurrent();
  };

  TD.actions.sample = function () {
    menuClose();
    if (!ask('載入示範專案？這會另外建立一個新專案，不會覆蓋目前的專案。')) return;
    var s;
    try { s = TD.store.sample(); TD.store.save(s); TD.store.setCurrent(s.id); }
    catch (e) { say('載入示範專案失敗：' + errText(e)); return; }
    loadCurrent();
  };

  TD.actions.newProject = function () { newProject(); };

  TD.actions.reset = function () {
    menuClose();
    var name = (S.p && S.p.name) || '未命名';
    if (!ask('刪除專案「' + name + '」？此動作無法復原。')) return;
    if (!ask('再確認一次：真的要永久刪除「' + name + '」嗎？建議先匯出備份。')) return;
    try { TD.store.remove(S.p.id); } catch (e) { say('刪除失敗：' + errText(e)); return; }
    loadCurrent();
  };

  /* ---- 抽屜：覆寫與複核 ----
     overrides／reviews 的 key 本身含小數點（例如 m3.far），
     不能走 TD.store.set 的點號路徑（會被切成巢狀物件），
     所以改用 TD.ui 的純資料寫入工具，再整份 save。*/

  function drawerNow() {
    var st = (TD.ui && TD.ui.drawerState) ? TD.ui.drawerState() : null;
    if (!st || !st.vkey) { say('抽屜已關閉，這次操作沒有生效。'); return null; }
    return st;
  }

  function drawerReopen(key) {
    if (key && TD.ui && TD.ui.openDrawer) {
      try { TD.ui.openDrawer(key, S.ctx, S.p); } catch (e) {}
    }
  }

  TD.actions.ovInput = function () { return; };

  TD.actions.ovApply = function () {
    var st = drawerNow();
    if (!st) return;
    if (st.overrideValue === null) { say('請先輸入一個數字，或改按「清除覆寫」。'); return; }
    TD.ui.applyOverride(S.p, st.vkey, st.overrideValue);
    persist();
    refresh();
    drawerReopen(st.vkey);
  };

  TD.actions.ovClear = function () {
    var st = drawerNow();
    if (!st) return;
    TD.ui.clearOverride(S.p, st.vkey);
    persist();
    refresh();
    drawerReopen(st.vkey);
  };

  TD.actions.reviewToggle = function () {
    var st = drawerNow();
    if (!st) return;
    TD.ui.setReview(S.p, st.vkey, st.reviewed, st.reviewNote);
    persist();
    refresh();
    drawerReopen(st.vkey);
  };

  TD.actions.reviewNote = function () {
    var st = drawerNow();
    if (!st) return;
    TD.ui.setReview(S.p, st.vkey, st.reviewed, st.reviewNote);
    persist();
    refresh();
    /* 備註在 textarea 失焦時寫入，不重開抽屜，免得游標被搶走 */
  };

  /* 報告裡的逐項複核核取方塊 */
  TD.actions.reviewRow = function (el) {
    var k = el.getAttribute('data-vkey');
    if (!k) return;
    var prev = (S.p && isObj(S.p.reviews) && S.p.reviews[k]) ? S.p.reviews[k].note : '';
    TD.ui.setReview(S.p, k, !!el.checked, prev);
    persist();
    refresh();
  };

  /* ===================== 8. 頂列互動 ===================== */

  function newProject() {
    var name;
    try { name = window.prompt('新專案名稱', '未命名地號 ' + stamp()); } catch (e) { name = null; }
    if (name === null) return;
    try { TD.store.create(trim(name) || ('未命名地號 ' + stamp())); }
    catch (e2) { say('建立專案失敗：' + errText(e2)); return; }
    loadCurrent();
  }

  function bindTopbar() {
    var sel = byId('projectSelect');
    if (sel) {
      sel.onchange = function () {
        try { TD.store.setCurrent(sel.value); } catch (e) {}
        loadCurrent();
      };
    }

    var nb = byId('btnNewProject');
    if (nb) nb.onclick = function () { newProject(); };

    var rb = byId('btnReport');
    if (rb) rb.onclick = function () { TD.ui.openReport(); };

    var mb = byId('btnMenu');
    if (mb) {
      mb.onclick = function (ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        var menu = byId('menu');
        if (menu) menu.hidden = !menu.hidden;
      };
    }

    var fi = byId('fileInput');
    if (fi) {
      fi.onchange = function () {
        var file = fi.files && fi.files[0];
        if (!file) return;
        var rd;
        try { rd = new FileReader(); }
        catch (e) { say('這個瀏覽器不支援讀取檔案。'); return; }
        rd.onload = function () {
          var res;
          try { res = TD.store.importJSON(String(rd.result || '')); }
          catch (e2) { say('匯入失敗：' + errText(e2)); fi.value = ''; return; }
          fi.value = '';
          if (!res || !res.ok) { say('匯入失敗：' + ((res && res.error) || '未知原因')); return; }
          say('已匯入 ' + res.count + ' 個專案：' + (res.names || []).join('、')
            + ((res.warnings && res.warnings.length) ? '\n\n注意：\n' + res.warnings.join('\n') : ''));
          loadCurrent();
        };
        rd.onerror = function () { say('讀取檔案失敗。'); fi.value = ''; };
        rd.readAsText(file, 'utf-8');
      };
    }
  }

  /* ===================== 9. 啟動 ===================== */

  function loadCurrent() {
    try { S.p = TD.store.current(); }
    catch (e) {
      S.p = (TD.store && TD.store.defaults) ? TD.store.defaults() : null;
      say('讀取專案失敗，已改用一份空白專案：' + errText(e));
    }
    if (!S.p) { say('專案儲存層無法提供專案，介面無法啟動。'); return; }
    if (S.p.units !== 'm2') S.p.units = 'ping';

    closeDrawer();
    if (TD.report && TD.report.close) TD.report.close();
    recalc();
    renderProjectSelect();
    renderUnitSelect();
    render();

    if (TD.store && TD.store.persistent === false) {
      var host = byId('paneOut');
      if (host && host.insertAdjacentHTML) {
        try {
          host.insertAdjacentHTML('afterbegin', '<div class="note bad">'
            + '瀏覽器儲存無法使用，目前是記憶體模式：重新整理就會遺失，請立刻匯出專案 JSON。</div>');
        } catch (e2) {}
      }
    }
  }

  function boot() {
    if (S.booted) return;
    S.booted = true;

    installGlobalError();
    S.sec = secLoad();

    if (!TD.store || typeof TD.store.current !== 'function') {
      var host = byId('paneOut');
      if (host) {
        host.innerHTML = '<div class="note bad">儲存層未載入（js/lib/store.js），介面無法啟動。'
          + '請確認 index.html 的 script 清單完整且順序為 lib → data → engine → ui → main。</div>';
      }
      return;
    }

    document.addEventListener('click', onClick, false);
    document.addEventListener('change', onChange, false);
    document.addEventListener('input', onInput, false);
    document.addEventListener('focusout', onFocusOut, false);
    document.addEventListener('keydown', onKeyDown, false);

    bindTopbar();
    loadCurrent();
  }

  /* 對外（測試用；不是契約的一部分） */
  TD.app = { boot: boot, refresh: refresh, recalc: recalc, render: render, state: S,
    parseComps: parseComps };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, false);
  } else {
    boot();
  }
})(window.TD);
