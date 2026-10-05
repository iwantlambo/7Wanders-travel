/* 自動研究的介面：左欄設定、進度與結果，右欄「公開資料查核」表與報告段落。執行與資料處理在 js/lib/research.js。*/
window.TD = window.TD || {};
(function (TD) {
  'use strict';

  TD.ui = TD.ui || {};

  function isObj(o) { return !!o && typeof o === 'object'; }
  function isArr(o) { return Object.prototype.toString.call(o) === '[object Array]'; }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function U() { return TD.ui; }
  function esc(s) { return TD.ui.esc(s); }
  function cut(s, n) {
    var t = String(s === null || s === undefined ? '' : s);
    return t.length > n ? t.slice(0, n) + '…' : t;
  }
  function f(label, path, opts) { return TD.ui.field(label, path, opts); }
  function row(cls, inner) { return '<div class="fieldrow' + (cls ? ' ' + cls : '') + '">' + inner + '</div>'; }

  var ST = { match: '相符', differs: '不符', unknown: '查無' };
  var CHECK_ZH = {
    zoning: '建蔽率與容積率', presale: '本案產品新案單價', resPresale: '同區住宅新案單價', land: '同區土地行情',
    parking: '車位價', absorb: '去化速度', construction: '營建單價', finance: '融資條件', bonus: '容積獎勵與開發制度',
    tod: '距捷運站距離', road: '面前道路寬度'
  };
  var FACT_ZH = { mrtDistanceM: '距捷運／鐵路站', roadWidthM: '面前道路寬', buildingAgeYears: '既有建物屋齡', note: '其他' };
  var EFFORT_OPTS = [{ v: 'medium', t: '標準（建議）' }, { v: 'high', t: '深入（較慢、費用約加倍）' }];

  function resultOf(p) { return (p && p.research && isObj(p.research.result)) ? p.research.result : null; }
  function stateOf() { return (TD.app && TD.app.researchState) ? TD.app.researchState() : { running: false, log: [], error: '' }; }

  /* 網址只接受 http(s)，一律跳脫；另開分頁且不帶來源頁資訊 */
  function link(url, text) {
    var u = String(url || '');
    if (!/^https?:\/\/[^\s"'<>]+$/i.test(u)) return esc(text || '—');
    return '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(cut(text || u, 24)) + '</a>';
  }
  function seenMark(x) {
    if (!x || !x.url) return '<span class="tag">無網址</span>';
    return x.seen ? '<span class="tag" title="這個網址出現在本次搜尋或讀取的結果中">已比對</span>'
                  : '<span class="tag" title="這個網址沒有出現在本次實際搜尋到的結果中，請特別確認">未比對</span>';
  }
  function statusHtml(s) {
    if (s === 'match') return U().lamp('green', ST.match);
    if (s === 'differs') return U().lamp('amber', ST.differs);
    return '<span class="tag">' + esc(ST.unknown) + '</span>';
  }
  function whenStr(at) {
    if (!isNum(at) || at <= 0) return '';
    try {
      var d = new Date(at);
      function two(n) { return (n < 10 ? '0' : '') + n; }
      return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()) + ' ' + two(d.getHours()) + ':' + two(d.getMinutes());
    } catch (e) { return ''; }
  }
  function checkLabel(r, c) {
    var labels = isArr(r.checkLabels) ? r.checkLabels : [], i;
    for (i = 0; i < labels.length; i++) if (labels[i] && labels[i].id === c.id) return labels[i].label;
    return CHECK_ZH[c.id] || c.id;
  }
  function checkOurs(r, c) {
    var labels = isArr(r.checkLabels) ? r.checkLabels : [], i;
    for (i = 0; i < labels.length; i++) if (labels[i] && labels[i].id === c.id) return labels[i].ours;
    return '';
  }

  /* ------------------------------------------------------------------
     左欄
     ------------------------------------------------------------------ */

  function keyBlock() {
    var R = TD.research, h = '';
    if (!R) return '';
    if (R.key()) {
      h += '<div class="inline" style="margin:4px 0">'
         + '<span class="legal">金鑰：' + esc(R.keyMask()) + '（' + (R.keyRemembered() ? '已記住在這台電腦' : '只用於這次開啟') + '）</span>'
         + '<button type="button" class="btn btn-sm btn-ghost" data-act="researchKeyForget">清除金鑰</button></div>';
      return h;
    }
    h += '<div class="field"><span class="field-label">Anthropic API 金鑰'
       + '<span class="hint"><a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">取得金鑰</a></span></span>'
       + '<input type="password" id="researchKey" autocomplete="off" spellcheck="false" placeholder="sk-ant-…"></div>';
    h += '<div class="inline" style="margin:4px 0">'
       + '<label class="checkline"><input type="checkbox" id="researchRemember"><span>記住在這台電腦</span></label>'
       + '<button type="button" class="btn btn-sm" data-act="researchKeySave">使用這把金鑰</button></div>';
    h += '<p class="legal">金鑰只存在這個瀏覽器，不會寫進專案或匯出檔；沒勾「記住」時，關閉分頁就消失。</p>';
    return h;
  }

  function logBlock(st) {
    var log = isArr(st.log) ? st.log : [], h = '', i, e, icon;
    if (!log.length) return '';
    var ICON = { search: '搜尋', fetch: '讀取', filter: '篩選', note: '說明', submit: '完成', status: '狀態' };
    h += '<ul class="legal" id="researchLog" style="margin:4px 0 0;padding-left:16px;max-height:150px;overflow:auto">';
    for (i = Math.max(0, log.length - 14); i < log.length; i++) {
      e = log[i];
      icon = ICON[e.type] || '';
      h += '<li><b>' + esc(icon) + '</b>　' + esc(cut(e.text, 90)) + '</li>';
    }
    h += '</ul>';
    return h;
  }

  /* wide＝報告與右欄（欄位分開）；窄的左欄把類別、年月併進名稱，來源與比對併成一欄 */
  function pricesTable(r, wide) {
    var rows = [], i, x;
    var list = isArr(r.prices) ? r.prices : [];
    for (i = 0; i < list.length; i++) {
      x = list[i];
      rows.push({
        cat: x.product, name: x.name, price: x.low === x.high ? String(x.low) : x.low + '～' + x.high,
        ym: x.ym || '—', src: link(x.url, x.source || '—'), seen: seenMark(x), note: x.note
      });
    }
    if (!rows.length) return '<p class="legal">沒有找到可用的價格資料。</p>';
    if (wide) {
      return U().table([
        { k: 'cat', label: '類別' },
        { k: 'name', label: '名稱' },
        { k: 'price', label: '萬／坪', align: 'r' },
        { k: 'ym', label: '年月' },
        { k: 'note', label: '說明', render: function (v) { return '<span class="legal">' + esc(cut(v, 60)) + '</span>'; } },
        { k: 'src', label: '來源', html: true },
        { k: 'seen', label: '', html: true }
      ], rows, { empty: '' });
    }
    return U().table([
      { k: 'name', label: '名稱', render: function (v, rr) {
        return '<span title="' + esc(rr.note || '') + '">' + esc(cut(v, 14)) + '</span><br><span class="legal">'
             + esc(rr.cat + '・' + rr.ym) + '</span>';
      } },
      { k: 'price', label: '萬／坪', align: 'r' },
      { k: 'src', label: '來源', render: function (v, rr) { return v + '<br>' + rr.seen; } }
    ], rows, { empty: '' });
  }

  function factsList(r) {
    var list = isArr(r.facts) ? r.facts : [], h = '', i, x;
    if (!list.length) return '';
    h += '<ul class="legal" style="margin:2px 0 0;padding-left:16px">';
    for (i = 0; i < list.length; i++) {
      x = list[i];
      h += '<li>' + esc(FACT_ZH[x.field] || x.field) + '：' + esc(cut(x.value, 40)) + (x.note ? '（' + esc(cut(x.note, 50)) + '）' : '')
         + '　' + link(x.url, x.source || '—') + ' ' + seenMark(x) + '</li>';
    }
    h += '</ul>';
    return h;
  }

  function appliedLine(r) {
    var ap = isArr(r.applied) ? r.applied : [], parts = [], i;
    for (i = 0; i < ap.length; i++) parts.push(ap[i].label + ' ' + ap[i].value);
    var n = isArr(r.prices) ? r.prices.length : 0;
    return '已寫入下方「研究行情」' + n + ' 筆（自動研究區塊，可修改或刪除）'
         + (parts.length ? '；已填入空白欄位：' + parts.join('、') : '') + '。';
  }

  function usageLine(r) {
    var u = isObj(r.usage) ? r.usage : null;
    var parts = [];
    if (r.at) parts.push(whenStr(r.at));
    if (r.model) parts.push(r.model);
    if (u) parts.push('搜尋 ' + (u.searches || 0) + ' 次、讀取 ' + (u.fetches || 0) + ' 頁');
    if (isNum(r.costUsd)) parts.push('約 US$' + r.costUsd.toFixed(2) + '（依公告牌價估算）');
    return parts.join('｜');
  }

  function researchBody(ctx, p) {
    var R = TD.research, st = stateOf(), r = resultOf(p), h = '';
    if (!R) return '<p class="legal">自動研究元件未載入。</p>';
    h += '<p class="legal">按「開始研究」後，Claude 會上網搜尋周邊新案、土地成交與政策，逐項查核本系統的假設並附來源網址。'
       + '價格寫進下方「研究行情」（信心標為中），空白的距捷運站、路寬、屋齡會自動填入；分區與容積率仍以你貼上的分區證明書為準。'
       + '需要你自己的 Anthropic API 金鑰，費用由你的帳戶支付（通常每次約 1～3 美元，完成後顯示實際用量）。</p>';
    h += keyBlock();
    h += row('', f('附近路段或地標', 'research.locHint', { type: 'text', placeholder: '例：溪尾街、捷運三重站附近' })
      + f('研究深度', 'research.effort', { options: EFFORT_OPTS }));
    h += f('一併送出地號（較準確，但地號會傳給 Anthropic）', 'research.includeNo', { type: 'bool' });

    var sending = '';
    try { sending = R.brief(ctx, p).sent.join('；'); } catch (e) { sending = ''; }
    if (sending) h += '<p class="legal">會送出：' + esc(cut(sending, 220)) + '。不送謄本全文與所有權人。</p>';

    h += '<div class="inline" style="margin:6px 0">';
    if (st.running) {
      h += '<button type="button" class="btn btn-sm" disabled>研究中…</button>'
         + '<button type="button" class="btn btn-sm btn-ghost" data-act="researchStop">停止</button>';
    } else {
      h += '<button type="button" class="btn btn-sm"' + (R.key() ? '' : ' disabled title="請先輸入金鑰"') + ' data-act="researchStart">開始研究</button>';
      if (r) h += '<button type="button" class="btn btn-sm btn-ghost" data-act="researchUndo">移除自動研究結果</button>';
    }
    h += '</div>';
    h += logBlock(st);
    if (st.error) h += U().noteText('bad', '自動研究失敗：' + st.error);

    if (r) {
      h += '<div class="field-label" style="margin-top:8px">最近一次結果　<span class="hint">' + esc(usageLine(r)) + '</span></div>';
      if (r.summary) h += '<p class="legal">' + esc(r.summary) + '</p>';
      h += '<p class="legal">' + esc(appliedLine(r)) + '</p>';
      h += pricesTable(r);
      h += factsList(r);
      h += '<p class="legal">逐項查核結果在右欄「風險與待確認 → 公開資料查核」。AI 搜尋可能讀錯或過時，數字請點開來源核對；'
         + '「未比對」表示該網址沒有出現在本次實際搜尋到的結果中。</p>';
    }

    h += '<details style="margin-top:6px"><summary class="legal">進階：API 端點</summary>'
       + '<div class="field"><span class="field-label">端點網址<span class="hint">公司以代理伺服器轉送時才需要，留白＝api.anthropic.com</span></span>'
       + '<input type="text" id="researchBase" spellcheck="false" placeholder="https://api.anthropic.com" value="' + esc(R.base()) + '"></div>'
       + '<div class="inline"><button type="button" class="btn btn-sm btn-ghost" data-act="researchBaseSave">儲存端點</button></div></details>';
    return h;
  }

  function researchSub(ctx, p) {
    var st = stateOf(), r = resultOf(p), R = TD.research;
    if (st.running) return '研究中…';
    if (r) {
      var c = { match: 0, differs: 0, unknown: 0 }, i, list = isArr(r.checks) ? r.checks : [];
      for (i = 0; i < list.length; i++) if (Object.prototype.hasOwnProperty.call(c, list[i].status)) c[list[i].status]++;
      return '相符 ' + c.match + '・不符 ' + c.differs + '・查無 ' + c.unknown;
    }
    return (R && R.key()) ? '已設定金鑰，尚未研究' : '需要 Anthropic API 金鑰';
  }

  /* ------------------------------------------------------------------
     右欄與報告：公開資料查核表
     ------------------------------------------------------------------ */

  function checksTable(ctx, p, full) {
    var r = resultOf(p);
    if (!r) return '<p class="legal">尚未以公開資料查核。左欄「自動研究」可用你的 Anthropic API 金鑰讓 Claude 上網查核單價、土地行情、成本與獎勵假設。</p>';
    var list = isArr(r.checks) ? r.checks : [], rows = [], i, c;
    for (i = 0; i < list.length; i++) {
      c = list[i];
      rows.push({ item: checkLabel(r, c), ours: checkOurs(r, c), st: c.status, found: c.found + (c.note ? '（' + c.note + '）' : ''),
                  src: link(c.url, c.source || '—'), seen: seenMark(c) });
    }
    var h = '<p class="legal">' + esc(usageLine(r)) + '</p>';
    h += U().table([
      { k: 'item', label: '項目' },
      { k: 'ours', label: '本系統', render: function (v) { return '<span class="legal" title="' + esc(v) + '">' + esc(cut(v, full ? 80 : 26)) + '</span>'; } },
      { k: 'st', label: '查核', render: function (v) { return statusHtml(v); } },
      { k: 'found', label: '公開資料', render: function (v) { return '<span class="legal" title="' + esc(v) + '">' + esc(cut(v, full ? 160 : 44)) + '</span>'; } },
      { k: 'src', label: '來源', html: true },
      { k: 'seen', label: '', html: true }
    ], rows, { empty: '沒有查核結果。', rowCls: function (rr) { return rr && rr.st === 'differs' ? 'bad' : ''; } });
    return h;
  }

  function reportSection(ctx, p) {
    var r = resultOf(p), h = '';
    if (!r) return '<p class="legal">本案尚未以自動研究查核公開資料。</p>';
    if (r.summary) h += '<p>' + esc(r.summary) + '</p>';
    h += '<p class="legal">逐項查核結果見「風險與待確認 → 公開資料查核」。</p>';
    h += pricesTable(r, true);
    h += factsList(r);
    h += '<p class="legal">以上由 Claude 依當次網路搜尋整理，可能讀錯或過時；每筆附來源，決策前請逐筆核對原始資料。</p>';
    return h;
  }

  TD.ui.researchBody = researchBody;
  TD.ui.researchSub = researchSub;
  TD.ui.researchChecks = checksTable;
  TD.ui.researchReport = reportSection;
})(window.TD);
