/* 右欄結果（UI-V2 第 4 節 ①～⑤）：出價上限、一頁摘要、風險與待確認、敏感度、壓力測試。
   本檔只回傳 HTML 字串，不碰 document、不自行掛事件；按鈕一律 data-act，數字一律 TD.ui.num。 */
window.TD = window.TD || {};
(function (TD) {
  'use strict';

  TD.ui = TD.ui || {};
  TD.actions = TD.actions || {};

  /* ------------------------------------------------------------------
     設計說明（複核者請先讀）

     1. 原則一：每個數字都經過 TD.ui.num，帶信心徽章與可點開的明細抽屜。
        算不出來的一律顯示「—」或「尚無法計算」，**不用 0 或 NaN 冒充**，
        也不補預設值。出價上限算不出來時，逐項列出缺什麼。
     2. 對 ctx 的每一層都做存在性檢查：pipeline 任何一段失敗只會讓該段變成
        { error: '...' }，右欄必須照樣畫得出來。
     3. 介面文字不出現引擎內部的代號與開發期的內部說法（見 common.js 的 zh()）。
        引擎回傳的說明文字（m3 的 note、m2 的 reason）可能帶內部代號與欄位路徑，
        一律先過 TD.ui.zh()；checkall.sh 第 8d 關會 grep 這幾個檔案的原始碼。
     4. 壓力測試沒有結果時整塊不輸出（見 renderResults），不顯示空表。
     ------------------------------------------------------------------ */

  function isObj(o) { return !!o && typeof o === 'object'; }
  function isArr(o) { return Object.prototype.toString.call(o) === '[object Array]'; }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function U() { return TD.ui; }
  function esc(s) { return TD.ui.esc(s); }
  function raw(x) { try { return TD.raw(x); } catch (e) { return null; } }
  function rawNum(x) { var v = raw(x); return isNum(v) ? v : null; }

  /* 裸數字也走 num()：保留 tabular-nums 與「—」的統一處理，不直接把數值串進 HTML */
  function plainNum(v, fmt, d) { return U().num(v, { fmt: fmt || 'n', d: d, plain: true }); }

  function clip(s, n) {
    var t = String(s === null || s === undefined ? '' : s);
    return t.length > n ? t.slice(0, n) + '…' : t;
  }
  /* 引擎的長說明：截短放進表格，完整內容掛 title，讓人滑過去就看到 */
  function small(s, n) {
    var t = U().zh(s);
    return '<span class="legal" title="' + esc(t) + '">' + esc(clip(t, n)) + '</span>';
  }
  function subTitle(text) {
    return '<div class="field-label" style="margin:10px 0 3px">' + esc(text) + '</div>';
  }

  /* ------------------------------------------------------------------
     ① 出價上限
     ------------------------------------------------------------------ */

  /* 算不出出價上限時，把缺的東西逐項列出來。不猜、不補預設值、不顯示 0。 */
  function missingList(ctx) {
    var out = [];
    if (!isObj(ctx)) return ['尚未執行計算'];
    var m1 = ctx.m1, m3 = ctx.m3, m5 = ctx.m5, m6 = ctx.m6, m7 = ctx.m7;

    if (!isObj(m1) || m1.error || rawNum(m1.areaM2) === null || rawNum(m1.areaM2) <= 0) {
      out.push('基地面積（地號與面積）');
    }
    if (!isObj(m3) || m3.error) {
      out.push('法規檢討結果');
    } else {
      if (rawNum(m3.far) === null) out.push('使用分區容積率');
      if (rawNum(m3.bcr) === null) out.push('使用分區建蔽率');
    }
    if (!isObj(m5) || m5.error || rawNum(m5.sellablePing) === null || rawNum(m5.sellablePing) <= 0) {
      out.push('可售坪（量體）');
    }
    if (!isObj(m6) || m6.error || rawNum(m6.unitPricePing) === null) {
      out.push('銷售單價（實價登錄或指定單價）');
    }
    if (!isObj(m7) || m7.error || rawNum(m7.totalCostExLand) === null) {
      out.push('成本假設');
    }

    if (!out.length) {
      /* 上游都在，但求解本身失敗：把引擎第一則說明原文帶出來，不要含糊帶過 */
      var t = (isObj(ctx.m8) && isArr(ctx.m8.notes)) ? ctx.m8.notes : [];
      if (isObj(ctx.m8) && ctx.m8.error) out.push(clip(U().zh(ctx.m8.error), 90));
      else if (t.length) out.push(clip(U().zh(t[0]), 90));
      else out.push('目標報酬條件下求不出解');
    }
    return out;
  }

  /* 哪一條在綁：比較 IRR 條件與淨利率條件回推出來的上限，較小的那條是有效約束。
     引擎另有 targets.binding（同一套比較），兩者不一致時以這裡現算的為準。 */
  function bindingText(ctx) {
    var m8 = (isObj(ctx) && isObj(ctx.m8)) ? ctx.m8 : null;
    if (!m8) return '';
    var byIrr = rawNum(m8.landCapByIrr);
    var byMargin = rawNum(m8.landCapByMargin);
    if (byIrr !== null && byMargin !== null) {
      return (byIrr <= byMargin) ? 'IRR 條件在綁' : '淨利率條件在綁';
    }
    if (byIrr !== null) return 'IRR 條件在綁';
    if (byMargin !== null) return '淨利率條件在綁';
    var tg = isObj(m8.targets) ? m8.targets : null;
    if (tg && tg.binding === 'irr') return 'IRR 條件在綁';
    if (tg && tg.binding === 'margin') return '淨利率條件在綁';
    return '';
  }

  function heroBlock(ctx, p) {
    var m8 = (isObj(ctx) && isObj(ctx.m8)) ? ctx.m8 : null;
    if (!m8 || m8.error || rawNum(m8.landCap) === null) {
      return U().hero(null, { missing: missingList(ctx) });
    }
    var sitePing = (isObj(ctx.m1) && rawNum(ctx.m1.areaPing) !== null) ? rawNum(ctx.m1.areaPing) : null;
    return U().hero(m8.landCap, {
      p: p,
      perPing: m8.landCapPerPing,
      bid: m8.bidTarget,
      bidPerPing: m8.bidTargetPerPing,
      benchmark: m8.benchmark,
      sitePing: sitePing,
      irr: m8.irrAtCap,
      margin: m8.marginAtCap,
      binding: bindingText(ctx)
    });
  }

  /* ------------------------------------------------------------------
     ② 一頁摘要
     ------------------------------------------------------------------ */

  function lampCell(ctx) {
    var m2 = (isObj(ctx) && isObj(ctx.m2)) ? ctx.m2 : null;
    if (!m2 || m2.error) return '<span class="legal">尚無法計算</span>';
    var t = '未偵測到阻斷旗標';
    if (m2.level === 'red') t = '有紅旗';
    else if (m2.level === 'amber') t = '有黃旗';
    if (m2.blocked) t = '有無法單方面解決的紅旗';
    return U().lamp(m2.level, t);
  }

  /* 上游算不出來時，引擎的下游欄位會回落成 0（m4 的獎勵樓地板、m7 的總成本都是）。
     那個 0 不是「不用錢」「沒有獎勵」，是算不出來。介面層必須把它擋成 null，
     讓 num() 走「—」與算不出來的信心等級。引擎不動，守門做在這裡。*/
  function guard(v, driver) {
    var d = rawNum(driver);
    return (d === null || d <= 0) ? null : v;
  }
  /* 擋掉之後的那一格：不留信心徽章（沒算出來的東西不該有信心等級），
     缺什麼寫在 title 裡。*/
  function why(reason) { return U().num(null, { plain: true, title: reason }); }

  /* 總成本（不含地）有兩個驅動值：
     地上總樓地板決定營建各項，總銷決定管銷／廣告／稅費的比率項。
     任一個缺，總成本就是算不出來——引擎會用回落粗估總銷推出一個金額，
     那是預設值填補，不得在摘要裡呈現成已算出的數字。*/
  var BASE_WHY = '缺基準容積，算不出來';

  function costWhy(ctx) {
    var m5 = (isObj(ctx) && isObj(ctx.m5)) ? ctx.m5 : {};
    var floor = rawNum(m5.grossFloorM2);
    if (floor === null || floor <= 0) return '缺地上總樓地板，算不出來';
    return '缺總銷，管銷與稅費比率項算不出來';
  }

  function costGuard(ctx, v) {
    var m5 = (isObj(ctx) && isObj(ctx.m5)) ? ctx.m5 : {};
    var m6 = (isObj(ctx) && isObj(ctx.m6)) ? ctx.m6 : {};
    var floor = rawNum(m5.grossFloorM2);
    if (floor === null || floor <= 0) return null;
    if (rawNum(m6.totalSales) === null) return null;
    return v;
  }
  /* 明細層（details.js 的成本結構）套用同一條規則，摘要與明細不會互相矛盾 */
  TD.ui.costComputable = function (ctx) { return costGuard(ctx, true) === true; };
  TD.ui.costWhy = costWhy;

  function summaryBlock(ctx, p) {
    var m3 = (isObj(ctx) && isObj(ctx.m3)) ? ctx.m3 : {};
    var m4 = (isObj(ctx) && isObj(ctx.m4)) ? ctx.m4 : {};
    var m5 = (isObj(ctx) && isObj(ctx.m5)) ? ctx.m5 : {};
    var m6 = (isObj(ctx) && isObj(ctx.m6)) ? ctx.m6 : {};
    var m7 = (isObj(ctx) && isObj(ctx.m7)) ? ctx.m7 : {};
    var m8 = (isObj(ctx) && isObj(ctx.m8)) ? ctx.m8 : {};
    function n(v, fmt, d) { return U().num(v, { fmt: fmt, d: d, p: p }); }
    var site = isObj(m3.site) ? m3.site : {};
    var base = m3.baseFloorM2;
    var mk = isObj(m6.market) ? m6.market : {};
    var rs = isObj(mk.resale) ? mk.resale : null;
    var chosen = isObj(m4.chosen) ? m4.chosen : null;
    var bm = isObj(m8.benchmark) ? m8.benchmark : null;

    var rows = [
      ['產權', lampCell(ctx)],
      ['分區／產品', esc((site.zone ? site.zone.name : (site.zoneInput || '—')) + '／' + (site.product || '—'))],
      ['建蔽率', n(m3.bcr, 'pct', 1)],
      ['容積率', n(m3.far, 'pct', 1)],
      ['基準容積 坪', n(m3.baseFloorM2, 'ping', 1)],
      ['容積獎勵', (guard(m4.pct, base) === null ? why(BASE_WHY) : n(m4.pct, 'pct', 1))
        + (chosen ? '<span class="legal">　' + esc(chosen.regimeName) + '</span>' : '')],
      ['總容積 坪', guard(m4.totalFloorM2, base) === null ? why(BASE_WHY) : n(m4.totalFloorM2, 'ping', 1)],
      ['可售坪（不含車位）', n(m5.sellablePing, 'n', 1)],
      ['戶數／車位', n(m5.unitsCount, 'n', 0) + ' ／ ' + n(m5.stalls, 'n', 0)],
      ['地上／地下層數', n(m5.floorsAbove, 'n', 0) + ' ／ ' + plainNum(isNum(m5.basementLevels) ? m5.basementLevels : null, 'n', 0)],
      ['預售單價 萬/坪', n(m6.presalePricePing, 'wanPing', 1)],
      ['新成屋行情 萬/坪', rs && rs.newer ? plainNum(rs.newer.p50, 'wanPing', 1) + '<span class="legal">　' + esc(rs.type) + '，屋齡 5 年內 ' + esc(String(rs.newer.n)) + ' 筆</span>'
        : (rs && rs.all ? plainNum(rs.all.p50, 'wanPing', 1) + '<span class="legal">　全部成屋</span>' : why('本區查無成屋成交'))],
      ['車位單價 萬/位', plainNum(isNum(m6.parkingPricePerStall) ? m6.parkingPricePerStall : null, 'wanPing', 0)],
      ['營建單價 萬/坪', plainNum(isObj(m7.params) && isNum(m7.params.perPing) ? m7.params.perPing : null, 'wanPing', 1)
        + '<span class="legal">　地下室 ' + esc(isObj(m7.params) && isNum(m7.params.basementPerPing) ? TD.fmt.n(m7.params.basementPerPing / 1e4, 1) : '—') + '</span>'],
      ['總銷', n(m6.totalSales, 'money')],
      ['總成本（不含地）', costGuard(ctx, m7.totalCostExLand) === null
        ? why(costWhy(ctx)) : n(m7.totalCostExLand, 'money')],
      ['稅後淨利', n(m8.profitAtCap, 'money')],
      ['本區土地行情 萬/坪', bm ? plainNum(bm.perPing, 'wanPing', 1) + '<span class="legal">　' + esc(String(bm.n)) + ' 筆</span>'
        : why('本區查無同分區土地成交')]
    ];
    return U().kv(rows, { cls: 'two' });
  }

  /* ------------------------------------------------------------------
     ③ 風險與待確認
     ------------------------------------------------------------------ */

  function consentLine(m2) {
    if (!m2 || m2.error || !isObj(m2.consent)) return '';
    var c = m2.consent;
    var h = '<span class="legal">同意門檻 ' + (c.pass ? '已達' : '未達');
    if (isNum(c.ownerRatio) || isNum(c.shareRatio)) {
      h += '　人數 ' + U().num(isNum(c.ownerRatio) ? c.ownerRatio : null, { fmt: 'pct', d: 0, plain: true })
         + '　持分 ' + U().num(isNum(c.shareRatio) ? c.shareRatio : null, { fmt: 'pct', d: 0, plain: true });
    }
    h += '</span>';
    return h;
  }

  /* 產權：燈號＋旗標逐列（名稱／原因／可不可解） */
  function ownershipRows(ctx, p) {
    var m2 = (isObj(ctx) && isObj(ctx.m2)) ? ctx.m2 : null;
    var h = '<div class="inline">' + lampCell(ctx) + consentLine(m2) + '</div>';
    var flags = (m2 && isArr(m2.flags)) ? m2.flags : [];
    h += U().table([
      { k: 'label', label: '產權項目' },
      { k: 'level', label: '燈號', render: function (v) { return U().lamp(v, ''); } },
      { k: 'reason', label: '原因', render: function (v) { return small(v, 46); } },
      { k: 'resolvable', label: '可解', render: function (v) { return v === false ? '難解' : '可解'; } }
    ], flags, { empty: '沒有偵測到產權旗標。', p: p });
    return h;
  }

  /* 法規：不通過（fail）與注意（warn）逐列，附算出來的數值與處理方式 */
  function legalRows(ctx, p) {
    var m3 = (isObj(ctx) && isObj(ctx.m3)) ? ctx.m3 : null;
    var checks = (m3 && isArr(m3.checks)) ? m3.checks : [];
    var open = [], i, c;
    for (i = 0; i < checks.length; i++) {
      c = checks[i];
      if (!isObj(c)) continue;
      if (c.status === 'warn' || c.status === 'fail') open.push(c);
    }
    var m5 = (isObj(ctx) && isObj(ctx.m5)) ? ctx.m5 : null;
    if (m5 && isObj(m5.heightCheck) && (m5.heightCheck.status === 'fail' || m5.heightCheck.status === 'warn') && m5.heightCheck.note) {
      open.push({ label: '高度比（含獎勵量體）', status: m5.heightCheck.status, value: '', note: m5.heightCheck.note });
    }
    return U().table([
      { k: 'label', label: '項目' },
      { k: 'status', label: '狀態', render: function (v) {
        if (v === 'fail') return U().lamp('red', '不通過');
        return U().lamp('amber', '注意');
      } },
      { k: 'note', label: '計算結果與處理', render: function (v, r) {
        var t = (r && r.value ? r.value + '：' : '') + (v || (r && r.requirement) || '');
        return small(t, 70);
      } }
    ], open, { empty: '法規檢討全部通過（細部計畫但書請以分區證明書核對）。', p: p });
  }

  /* 資料：需複核與未複核數量＋開啟報告逐項確認 */
  function gateRows(ctx, p) {
    var gate = (isObj(ctx) && isObj(ctx.gate)) ? ctx.gate : null;
    if (!gate) return '<p class="legal">尚無法計算：本次沒有取得複核資料。</p>';

    var total = isNum(gate.total) ? gate.total : null;
    var done = isNum(gate.done) ? gate.done : null;
    var todo = isNum(gate.todo) ? gate.todo : null;
    var blocking = isArr(gate.blocking) ? gate.blocking : [];

    var h = '';
    if (isNum(total) && total > 0 && isNum(done)) {
      h += '<div class="bar"><i style="width:' + esc(TD.fmt.n(done / total * 100, 0)) + '%"></i></div>';
    }
    h += U().kv([
      ['需複核', plainNum(total, 'n', 0)],
      ['已複核', plainNum(done, 'n', 0)],
      ['未複核', plainNum(todo, 'n', 0)]
    ], { cls: 'two' });
    h += '<div class="inline" style="margin-top:6px">'
      + '<button type="button" class="btn btn-sm" data-act="openReport">開啟報告逐項確認</button>'
      + '</div>';
    return h;
  }

  function riskBlock(ctx, p) {
    var h = ownershipRows(ctx, p);
    h += subTitle('法規注意事項');
    h += legalRows(ctx, p);
    h += subTitle('資料複核');
    h += gateRows(ctx, p);
    return h;
  }

  /* ------------------------------------------------------------------
     ④ 敏感度
     ------------------------------------------------------------------ */

  /* 「%」與「個百分點」在引擎內都存小數（0.10 ＝ 10%），顯示前要乘一百 */
  function rangeHtml(it) {
    if (!isObj(it) || !isNum(it.lo) || !isNum(it.hi)) return '<span class="num plain">—</span>';
    var mag = Math.abs(it.hi);
    if (it.unit === '%') return '±' + plainNum(mag * 100, 'n', 0) + '%';
    if (it.unit === '個百分點') return '±' + plainNum(mag * 100, 'n', 0) + ' 個百分點';
    return '±' + plainNum(mag, 'n', 0) + (it.unit ? esc(it.unit) : '');
  }

  function rangeRows(items) {
    var out = [], i, it;
    for (i = 0; i < items.length; i++) {
      it = items[i];
      if (!isObj(it)) continue;
      out.push({
        label: it.label || it.id,
        range: rangeHtml(it),
        loCap: isNum(it.loCap) ? it.loCap : null,
        hiCap: isNum(it.hiCap) ? it.hiCap : null,
        swing: isNum(it.swing) ? it.swing : null
      });
    }
    return out;
  }

  function sensitivityBlock(ctx, p) {
    var m8 = (isObj(ctx) && isObj(ctx.m8)) ? ctx.m8 : null;
    if (!m8 || m8.error || !isArr(m8.sensitivity) || !m8.sensitivity.length) {
      return '<p class="legal">尚無法計算：沒有敏感度結果。</p>';
    }
    var base = rawNum(m8.landCap);
    var h = U().tornado(m8.sensitivity, base === null ? {} : { base: base });
    h += U().table([
      { k: 'label', label: '項目' },
      { k: 'range', label: '變動', html: true },
      { k: 'loCap', label: '低端', fmt: 'money', align: 'r', plain: true },
      { k: 'hiCap', label: '高端', fmt: 'money', align: 'r', plain: true },
      { k: 'swing', label: '擺動', fmt: 'money', align: 'r', plain: true }
    ], rangeRows(m8.sensitivity), { p: p });
    return h;
  }

  /* ------------------------------------------------------------------
     ⑤ 壓力測試
     ------------------------------------------------------------------ */

  function verdictHtml(v) {
    var t = String(v === undefined || v === null ? '' : v);
    if (t === '不通過') return U().lamp('red', '不通過');
    if (t === '警示') return U().lamp('amber', '警示');
    if (t === '通過') return U().lamp('green', '通過');
    return U().lamp('amber', t || '無法判定');
  }

  /* 沒有壓力測試結果時回空字串，由 renderResults 整塊不輸出（不顯示空表） */
  function stressBlock(ctx, p) {
    var m8 = (isObj(ctx) && isObj(ctx.m8)) ? ctx.m8 : null;
    if (!m8 || m8.error || !isArr(m8.stress) || !m8.stress.length) return '';
    var h = U().table([
      { k: 'label', label: '情境' },
      { k: 'delta', label: '變動', render: function (v) { return small(v, 28); } },
      { k: 'margin', label: '稅後淨利率', fmt: 'pct', d: 1, align: 'r', plain: true },
      { k: 'irr', label: '年化 IRR', fmt: 'pct', d: 2, align: 'r', plain: true },
      { k: 'verdict', label: '判定', render: function (v) { return verdictHtml(v); } }
    ], m8.stress, {
      p: p,
      rowCls: function (r) { return (isObj(r) && r.verdict === '不通過') ? 'bad' : ''; }
    });
    /* 「通過」兩個字有重量，門檻是本系統自訂的，必須跟著表格一起出現 */
    if (m8.stressRule) h += '<p class="legal">' + U().zhEsc(m8.stressRule) + '</p>';
    return h;
  }

  /* ------------------------------------------------------------------
     區塊標題右側的小字：一眼看出哪一塊需要動作
     ------------------------------------------------------------------ */

  function stressSub(ctx) {
    var s = (isObj(ctx) && isObj(ctx.m8) && isArr(ctx.m8.stress)) ? ctx.m8.stress : [];
    var bad = 0, warn = 0, unknown = 0, i;
    for (i = 0; i < s.length; i++) {
      if (!isObj(s[i])) continue;
      if (s[i].verdict === '不通過') bad += 1;
      else if (s[i].verdict === '警示') warn += 1;
      else if (s[i].verdict !== '通過') unknown += 1;
    }
    if (!s.length) return '';
    if (bad) return bad + ' 項不通過';
    if (warn) return warn + ' 項警示';
    if (unknown) return unknown + ' 項無法判定';
    return s.length + ' 項全過';
  }

  function riskSub(ctx) {
    var m2 = (isObj(ctx) && isObj(ctx.m2)) ? ctx.m2 : null;
    var m3 = (isObj(ctx) && isObj(ctx.m3)) ? ctx.m3 : null;
    var g = (isObj(ctx) && isObj(ctx.gate)) ? ctx.gate : null;
    var parts = [];
    if (m2 && !m2.error && isObj(m2.counts)) {
      if (m2.counts.red) parts.push('紅旗 ' + m2.counts.red);
      if (m2.counts.amber) parts.push('黃旗 ' + m2.counts.amber);
    }
    if (m3 && !m3.error && isNum(m3.failCount) && m3.failCount > 0) parts.push('法規不通過 ' + m3.failCount);
    if (m3 && !m3.error && isNum(m3.warnCount) && m3.warnCount > 0) parts.push('法規注意 ' + m3.warnCount);
    if (g && isNum(g.todo) && g.todo > 0) parts.push('未複核 ' + g.todo);
    return parts.join('　');
  }

  /* 掃全陣列取擺動最大者。不能只取第一個有 swing 的項目：
     引擎目前恰好遞減排列，順序一變這行字就說謊（龍捲風圖自己另有排序）。*/
  function sensSub(ctx) {
    var s = (isObj(ctx) && isObj(ctx.m8) && isArr(ctx.m8.sensitivity)) ? ctx.m8.sensitivity : [];
    var i, best = null, bestSwing = -1, w;
    for (i = 0; i < s.length; i++) {
      if (!isObj(s[i]) || !isNum(s[i].swing)) continue;
      w = Math.abs(s[i].swing);
      if (w > bestSwing) { bestSwing = w; best = s[i]; }
    }
    if (!best) return '';
    return '最敏感：' + U().zh(String(best.label || best.id));
  }

  /* ------------------------------------------------------------------
     組裝：renderResults(ctx, p[, isOpen])
     isOpen 由 main.js 傳入（記住收合狀態）；沒傳就全部展開。
     ------------------------------------------------------------------ */

  function renderResults(ctx, p, isOpen) {
    function open(id, dflt) {
      if (typeof isOpen !== 'function') return !!dflt;
      var v = isOpen(id);
      return (v === undefined || v === null) ? !!dflt : !!v;
    }

    var h = heroBlock(ctx, p);

    /* 顯示覆寫沒有重算下游，這件事必須看得到 */
    var alert = U().overrideAlert(p);
    if (alert) h += alert;

    /* 摘要的面積一律以坪表示（見 docs/UI-V2.md 第 4 節 ②），不隨 ⋯ 選單的單位切換，
       所以標題右側標明單位；⋯ 選單的單位只影響下方明細。*/
    h += U().sec('out-sum', '一頁摘要', summaryBlock(ctx, p), open('out-sum', true),
      { sub: '固定以坪表示' });
    h += U().sec('out-risk', '風險與待確認', riskBlock(ctx, p), open('out-risk', true),
      { sub: riskSub(ctx) });
    h += U().sec('out-sens', '敏感度', sensitivityBlock(ctx, p), open('out-sens', true),
      { sub: sensSub(ctx) });

    var stress = stressBlock(ctx, p);
    if (stress) {
      h += U().sec('out-stress', '壓力測試', stress, open('out-stress', true), { sub: stressSub(ctx) });
    }
    return h;
  }

  /* 報告按鈕的動作。main.js 若已定義同名處理器則以它為準（這裡只是退路，
     讓右欄按鈕在 main.js 之外的載入順序下也不會變成「尚未實作的動作」）。*/
  if (!TD.actions.openReport) {
    TD.actions.openReport = function () {
      if (TD.ui && typeof TD.ui.openReport === 'function') { TD.ui.openReport(); return; }
      if (typeof TD.actions.report === 'function') { TD.actions.report(); return; }
      if (TD.report && typeof TD.report.open === 'function') {
        try { TD.report.open(); } catch (e) {}
      }
    };
  }

  TD.ui.renderResults = renderResults;
  /* 報告層（report.js）重用同樣的區塊，維持這些名稱 */
  TD.ui.resultsUtil = {
    missingList: missingList,
    bindingText: bindingText,
    heroBlock: heroBlock,
    summaryBlock: summaryBlock,
    riskBlock: riskBlock,
    sensitivityBlock: sensitivityBlock,
    stressBlock: stressBlock
  };
})(window.TD);
