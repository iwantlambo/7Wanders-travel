/* 可列印報告：由頂列「報告」按鈕開啟，覆蓋在主畫面上，Esc 或按鈕關閉。
   列印時只印這一層（見 assets/app.css 的 @media print）。免責聲明一律保留。*/
window.TD = window.TD || {};
(function (TD) {
  'use strict';

  TD.report = TD.report || {};

  var LAYER_ID = 'reportLayer';

  function isObj(o) { return !!o && typeof o === 'object'; }
  function isArr(o) { return Object.prototype.toString.call(o) === '[object Array]'; }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function U() { return TD.ui; }
  function esc(s) { return TD.ui.esc(s); }

  var DISCLAIMER = '本報告為初步判斷，不具法律效力。量體與法規檢討須由開業建築師簽證；'
    + '產權須由地政士或律師確認；售價與土地行情取自內政部實價登錄開放資料（內建資料的交易期間見比價明細），'
    + '營建成本為 2026 年第三季行情，正式出價前請以最新實價登錄與發包報價更新。'
    + '所有運算於使用者本機瀏覽器內完成，資料不上傳任何伺服器。';

  function h2(t) { return '<h2>' + esc(t) + '</h2>'; }
  function raw(x) { try { return TD.raw(x); } catch (e) { return null; } }
  function rawNum(x) { var v = raw(x); return isNum(v) ? v : null; }

  /* ------------------------------------------------------------------ 壓力測試判定門檻
     判定門檻是本系統自訂的，不是銀行授信準則。對外文件裡「通過」兩個字有重量，
     門檻定義必須跟著表格一起出去。*/

  function stressSection(ctx, p) {
    /* 門檻定義已由 stressBlock 自己帶出來（右欄與報告同一份），這裡不再重複一次 */
    return U().resultsUtil.stressBlock(ctx, p);
  }

  /* ------------------------------------------------------------------ 出價（走人價與建議出價）
     走人價＝出價上限：超過就達不到報酬目標的最高地價；建議出價＝再保留 3 個百分點報酬緩衝的談判目標。
     三個損益兩平緩衝放在同一節：它們回答的是同一個問題——還剩多少餘裕。*/

  function bidSection(ctx, p) {
    var m8 = (ctx && isObj(ctx.m8)) ? ctx.m8 : null;
    if (!m8 || m8.error) return '<p class="legal">財務計算未完成，出價尚無法計算。</p>';
    var cap = rawNum(m8.landCap), bid = rawNum(m8.bidTarget);
    var rows = [];
    rows.push({ k: '走人價（出價上限，土地總價）', v: m8.landCap, fmt: 'money' });
    rows.push({ k: '建議出價（談判目標）', v: m8.bidTarget, fmt: 'money' });
    if (bid !== null && cap !== null) {
      rows.push({ k: '保留的議價空間', v: cap - bid, fmt: 'money', plain: true });
    }
    if (isObj(m8.benchmark)) {
      rows.push({ k: '本區同分區土地行情（每坪）', v: m8.benchmark.perPing, fmt: 'unitPrice', plain: true,
        sub: m8.benchmark.label });
    }
    var h = U().kv(rows, { p: p });
    h += '<p class="legal">建議出價依據：<b>' + U().zhEsc(m8.bidFrom || '—') + '</b></p>';
    if (isObj(m8.benchmark) && m8.benchmark.verdict) h += '<p class="legal">' + U().zhEsc(m8.benchmark.verdict) + '</p>';

    var be = isObj(m8.breakeven) ? m8.breakeven : null;
    if (!be) return h;
    h += U().kv([
      { k: '售價可跌幅度（損益兩平）', v: be.priceDropPct, fmt: 'pct', d: 1 },
      { k: '營建成本可漲幅度（損益兩平）', v: be.costRisePct, fmt: 'pct', d: 1 },
      { k: '利率可升幅度 個百分點（損益兩平）', v: be.rateRisePct, fmt: 'pp', d: 2 }
    ], { p: p });
    return h;
  }

  /* ------------------------------------------------------------------ 逐項複核清單 */

  function reviewTable(ctx, p) {
    var gate = (ctx && isObj(ctx.gate)) ? ctx.gate : null;
    if (!gate || !isArr(gate.blocking) || !gate.blocking.length) {
      return '<p class="legal">沒有待複核的數值。</p>';
    }
    var reviews = (p && isObj(p.reviews)) ? p.reviews : {};
    var rows = [], i, b, done;
    for (i = 0; i < gate.blocking.length; i++) {
      b = gate.blocking[i];
      done = !!(reviews[b.key] && reviews[b.key].status === 'done');
      rows.push({
        on: '<input type="checkbox" data-act="reviewRow" data-vkey="' + esc(b.key) + '"'
          + (done ? ' checked' : '') + '>',
        name: esc(U().label(b.key)) + U().badge(b.conf),
        src: b.src,
        note: b.note
      });
    }
    return U().table([
      { k: 'on', label: '已複核', html: true },
      { k: 'name', label: '數值', html: true },
      { k: 'src', label: '來源', render: function (v) { return U().zhEsc(v); } },
      { k: 'note', label: '備註', render: function (v) {
        var t = U().zh(v);
        return '<span class="legal">' + esc(t.length > 90 ? t.slice(0, 90) + '…' : t) + '</span>';
      } }
    ], rows, { p: p });
  }

  /* ------------------------------------------------------------------ 覆寫紀錄 */

  function overrideTable(p) {
    var ov = (p && isObj(p.overrides)) ? p.overrides : {};
    var rows = [], k;
    for (k in ov) {
      if (!Object.prototype.hasOwnProperty.call(ov, k) || !isNum(ov[k])) continue;
      rows.push({ name: U().label(k), value: ov[k] });
    }
    if (!rows.length) return '<p class="legal">沒有顯示覆寫。</p>';
    return U().table([
      { k: 'name', label: '數值' },
      { k: 'value', label: '覆寫值', fmt: 'n', d: 2, align: 'r', plain: true }
    ], rows, { p: p });
  }

  /* ------------------------------------------------------------------ 報告本文 */

  function reportHtml(ctx, p) {
    var R = U().resultsUtil, D = U().detailsUtil;
    var name = (p && p.name) ? String(p.name) : '未命名專案';
    var parcel = (p && isObj(p.parcel)) ? p.parcel : {};
    var h = '';

    h += '<h1>' + esc(name) + '</h1>';
    h += '<p class="legal">' + esc((parcel.city || '') + (parcel.district || '') + ' ' + (parcel.section || ''))
       + '　輸出時間 ' + esc(TD.fmt.dateStr()) + '</p>';

    h += R.heroBlock(ctx, p);

    h += h2('一頁摘要');
    h += R.summaryBlock(ctx, p);

    h += h2('風險與待確認');
    h += R.riskBlock(ctx, p);

    h += h2('敏感度');
    h += R.sensitivityBlock(ctx, p);

    h += h2('壓力測試');
    h += stressSection(ctx, p);

    h += h2('出價：走人價與建議出價');
    h += bidSection(ctx, p);

    h += h2('法規檢討明細');
    h += D.regBlock(ctx, p);

    h += h2('容積獎勵組合排行');
    h += D.bonusBlock(ctx, p);

    h += h2('量體明細');
    h += D.massBlock(ctx, p);

    h += h2('比價明細（實價登錄）');
    h += D.compsBlock(ctx, p);

    h += h2('土地行情（實價登錄）');
    h += D.landBlock(ctx, p);

    h += h2('成本結構');
    h += D.costBlock(ctx, p);

    h += h2('現金流');
    h += D.cashBlock(ctx, p, function () { return true; });   /* 報告不收合，逐月明細一律展開 */

    h += h2('逐項複核');
    h += reviewTable(ctx, p);

    h += h2('顯示覆寫紀錄');
    h += overrideTable(p);

    h += h2('免責聲明');
    h += '<p class="legal">' + esc(DISCLAIMER) + '</p>';
    return h;
  }

  /* ------------------------------------------------------------------ 開關 */

  function layer(create) {
    if (typeof document === 'undefined') return null;
    var el = document.getElementById(LAYER_ID);
    if (!el && create) {
      el = document.createElement('div');
      el.id = LAYER_ID;
      el.className = 'report-layer';
      el.setAttribute('aria-label', '可列印報告');
      /* 這一層是滿版不透明的。先設 hidden 再掛上去：組報告內容時若丟例外，
         也不會在畫面上留下一塊吃掉所有點擊的白磚。*/
      el.hidden = true;
      document.body.appendChild(el);
    }
    return el;
  }

  function isOpen() {
    var el = layer(false);
    return !!(el && !el.hidden);
  }

  /* 組內容時任何一段丟例外，就把整層收掉並回報失敗，讓呼叫端的訊息看得見。
     絕不留下一個空白的滿版遮罩。*/
  function open(ctx, p) {
    var el = layer(true);
    if (!el) return false;
    var inner;
    try {
      inner = reportHtml(ctx, p);
    } catch (err) {
      close();
      throw err;
    }
    el.innerHTML = '<div class="report-bar no-print">'
      + '<button type="button" class="btn btn-sm" data-act="print">列印／另存 PDF</button>'
      + '<button type="button" class="btn btn-sm btn-ghost" data-act="reportClose" '
      + 'style="margin-left:auto">關閉 ✕</button></div>'
      + '<div class="report-inner">' + inner + '</div>';
    el.hidden = false;
    try { document.body.className = (document.body.className + ' reporting').replace(/^\s+/, ''); } catch (e) {}
    try { el.scrollTop = 0; } catch (e2) {}
    return true;
  }

  function close() {
    var el = layer(false);
    if (el) { el.hidden = true; el.innerHTML = ''; }
    if (typeof document !== 'undefined' && document.body) {
      try {
        document.body.className = String(document.body.className).replace(/\s*reporting\s*/g, ' ')
          .replace(/^\s+|\s+$/g, '');
      } catch (e) {}
    }
    return true;
  }

  TD.report.html = reportHtml;
  TD.report.open = open;
  TD.report.close = close;
  TD.report.isOpen = isOpen;
  TD.report.disclaimer = DISCLAIMER;

  /* 契約的入口名稱在 TD.ui 這一層；TD.report.* 保留，main.js 兩邊都能叫。*/
  TD.ui = TD.ui || {};
  TD.ui.openReport = open;
  TD.ui.closeReport = close;
  TD.ui.reportOpen = isOpen;
  TD.ui.reportHtml = reportHtml;
})(window.TD);
