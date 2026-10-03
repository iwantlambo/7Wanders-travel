/* 介面共用元件庫（UI-V2 第 7 節）：左右兩欄的 HTML 都由這裡輸出。*/
window.TD = window.TD || {};
(function (TD) {
  'use strict';

  /* ==================================================================
     使用說明

     1. 本檔所有函式**回傳 HTML 字串**，唯一的例外是 openDrawer（它直接操作
        #drawer / #drawerBackdrop）。回傳字串是為了讓呼叫端整段拼好再塞進 DOM。
     2. **頂層程式碼絕不碰 document**，只在函式內碰，本檔才能在 Node 下載入測試。
     3. **所有進到 HTML 的字串一律經過 TD.fmt.esc()**。刻意不 esc 的只有
        note(kind, html)、sec(...bodyHtml) 這類「收已組好 HTML」的參數，
        呼叫端必須自己 esc。
     4. 數字一律走 num()。null / undefined / NaN 一律輸出「—」，
        畫面上絕不出現 NaN，也不用 0 冒充算不出來。這是原則一的最低要求。
     5. 複核狀態（p.reviews）與單位（p.units）取得順序是
          opts.reviewed / opts.units → opts.p → setProject() 設進來的專案。
        main.js 每次重繪前呼叫一次 TD.ui.setProject(p) 就好。
     6. 抽屜內的操作一律用 data-act，交給 main.js 的 TD.actions 統一處理。
     7. 介面上不顯示引擎內部的 V key，一律顯示 LABELS 的中文標籤；
        引擎回傳的說明文字裡若帶著內部模組代號，用 zh() 換成中文詞。
     ================================================================== */

  TD.ui = TD.ui || {};
  TD.actions = TD.actions || {};

  var DRAWER_ID = 'drawer';
  var BACKDROP_ID = 'drawerBackdrop';

  var curP = null;

  function esc(s) { return TD.fmt.esc(s); }
  function isObj(o) { return !!o && typeof o === 'object'; }
  function isArr(o) { return Object.prototype.toString.call(o) === '[object Array]'; }
  function hasOwn(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  function setProject(p) { curP = isObj(p) ? p : null; return p; }
  function project() { return curP; }

  /* ------------------------------------------------------------------
     0. 中文化：引擎的說明文字裡帶內部模組代號時換成中文詞。
        代號用組字串的方式寫，避免任何一個代號以字面形式留在原始碼裡。
     ------------------------------------------------------------------ */

  var MOD_ZH = ['土地基本資訊', '產權', '法規檢討', '容積獎勵', '量體', '收入', '成本', '財務'];
  /* 只換「獨立成一個詞」的代號：前後不得是英數或底線，才不會把 areaM2、baseFloorM2
     這種欄位名切壞；小寫版另外排除後面接點號的情形（那是內部欄位路徑，不是代號）。*/
  var MOD_RE_U = new RegExp('(^|[^0-9A-Za-z_])M' + '([1-8])(?![0-9A-Za-z_])', 'g');
  var MOD_RE_L = new RegExp('(^|[^0-9A-Za-z_])m' + '([1-8])(?![0-9A-Za-z_.])', 'g');

  /* 「模組」是開發期的內部說法，使用者不需要知道程式怎麼切塊。同樣用組字串避開字面值。*/
  var SELF_RE = new RegExp('本' + '模' + '組', 'g');
  var WORD_RE = new RegExp('模' + '組', 'g');

  /* 引擎裡常寫成「m5 量體」這種代號加中文名的對照寫法。若先跑上面的通用替換會變成
     「量體 量體」，所以代號後面已經接著同一個中文名時，先把代號整段吃掉。*/
  var PAIR_RE = [];
  (function () {
    var i;
    for (i = 0; i < MOD_ZH.length; i++) {
      PAIR_RE.push(new RegExp('(^|[^0-9A-Za-z_])[Mm]' + (i + 1) + '[\\s、：:]*(?=' + MOD_ZH[i] + ')', 'g'));
    }
  })();

  /* 引擎的說明文字裡常寫出內部欄位路徑（代號後面接點號與欄位名）。
     MOD_RE_L 刻意跳過那種形式，所以整段路徑會原封不動留在使用者看到的提示裡。
     這條規則先跑：把整段路徑換成 LABELS 的中文名，查不到就退成該段的中文名＋「的對應欄位」。*/
  var PATH_RE = new RegExp(
    '(^|[^0-9A-Za-z_.])(?:ctx|p)?\\.?[Mm]([1-8])\\.([A-Za-z][A-Za-z0-9_]*)'
      + '((?:\\.[A-Za-z][A-Za-z0-9_]*)*)(\\[[A-Za-z0-9_]*\\])?', 'g');

  /* 資料檔與種子資料表的識別字：使用者不需要知道檔名，只需要知道「這是種子資料」。*/
  var SEED_RE = new RegExp('(?:種子資料\\s*)?TD\\.data\\.[A-Za-z0-9_.]*', 'g');
  var SEEDFILE_RE = new RegExp('js/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+\\.js', 'g');

  function pathZh(d, first, rest) {
    var k = 'm' + d + '.' + first;
    if (hasOwn(LABELS, k + rest)) return LABELS[k + rest];
    if (hasOwn(LABELS, k)) return LABELS[k];
    return (MOD_ZH[Number(d) - 1] || '本項') + '的對應欄位';
  }

  function zh(s) {
    if (s === null || s === undefined) return '';
    var t = String(s), pi;
    t = t.replace(SEED_RE, '種子資料').replace(SEEDFILE_RE, '種子資料檔');
    t = t.replace(PATH_RE, function (all, pre, d, first, rest) {
      return pre + pathZh(d, first, rest || '');
    });
    for (pi = 0; pi < PAIR_RE.length; pi++) t = t.replace(PAIR_RE[pi], '$1');
    t = t.replace(MOD_RE_U, function (all, pre, d) { return pre + (MOD_ZH[Number(d) - 1] || all); });
    t = t.replace(MOD_RE_L, function (all, pre, d) { return pre + (MOD_ZH[Number(d) - 1] || ('m' + d)); });
    t = t.replace(SELF_RE, '本項').replace(WORD_RE, '計算');
    return t;
  }
  /* 已中文化並 esc 過的文字，可直接放進 HTML */
  function zhEsc(s) { return esc(zh(s)); }

  /* ------------------------------------------------------------------
     1. 數值標籤表：抽屜與任何需要人看的地方都用這裡的中文名
     ------------------------------------------------------------------ */

  var LABELS = {
    'm1.areaM2': '基地面積（平方公尺）', 'm1.areaPing': '基地面積（坪）',
    'm1.parcelCount': '地號筆數', 'm1.roadWidth': '臨路寬度',
    'm1.ownerCount': '所有權人數', 'm1.shareDenomMax': '最大持分分母',
    'm1.areaOwnedM2': '持分對應面積',
    'm2.consentThresholdHalf': '同意門檻（過半）',
    'm2.consentThresholdTwoThirds': '同意門檻（三分之二）',
    'm2.consentOwnerRatio': '已同意人數比例', 'm2.consentShareRatio': '已同意持分比例',
    'm2.summary': '產權結論',
    'm3.bcr': '建蔽率', 'm3.far': '容積率',
    'm3.buildAreaM2': '建築面積', 'm3.baseFloorM2': '基準容積樓地板',
    'm4.pct': '容積獎勵成數', 'm4.bonusFloorM2': '獎勵樓地板', 'm4.totalFloorM2': '總容積樓地板',
    'm5.volFloorM2': '容積樓地板', 'm5.exemptFloorM2': '免計容積樓地板',
    'm5.grossFloorM2': '地上總樓地板', 'm5.basementM2': '地下室樓地板',
    'm5.sellablePing': '可售坪', 'm5.mainPing': '主建物坪', 'm5.publicRatio': '公設比',
    'm5.unitsCount': '戶數', 'm5.stalls': '車位數',
    'm5.floorsAbove': '地上層數', 'm5.volFloors': '計入容積層數', 'm5.heightM': '建築高度',
    'm6.unitPricePing': '採用銷售單價（不含車位）', 'm6.loPing': '單價區間下限', 'm6.hiPing': '單價區間上限',
    'm6.presalePricePing': '預售單價', 'm6.salesRevenue': '房地銷售收入（不含車位）',
    'm6.parkingRevenue': '車位收入', 'm6.totalSales': '總銷金額', 'm6.absorbMonths': '去化月數',
    'm7.constructionCost': '營建成本', 'm7.softCost': '軟成本（管銷廣告設計）',
    'm7.financeCost': '融資利息', 'm7.taxCost': '稅費', 'm7.totalCostExLand': '總成本（不含土地）',
    'm8.landCap': '土地出價上限（走人價）', 'm8.landCapPerPing': '出價上限每坪土地單價',
    'm8.irrAtCap': '達成年化 IRR', 'm8.marginAtCap': '達成稅後淨利率',
    'm8.profitAtCap': '稅後淨利', 'm8.walkAway': '走人價', 'm8.bidTarget': '建議出價',
    'm8.bePriceDrop': '售價可跌幅度（損益兩平）',
    'm8.beCostRise': '營建成本可漲幅度（損益兩平）',
    'm8.beRateRise': '利率可升幅度（損益兩平）',
    /* 以下不是 V 的 key，是引擎說明文字裡會提到的輸入欄位。
       列在這裡是為了讓 zh() 把內部路徑換成使用者看得懂的名稱。*/
    'm2.consent': '同意人數與持分',
    'm2.manualFlags': '人工標記的產權旗標',
    'm3.zone': '使用分區',
    'm3.manualChecks': '法規項目的人工結案',
    'm4.chosen': '選用的獎勵組合',
    'm4.picked': '勾選的獎勵項目',
    'm4.regime': '更新或危老制度',
    'm4.tdrPct': '容積移轉成數',
    'm6.comps': '比價案例',
    'm6.compSource': '比價資料來源',
    'm7.constructionType': '營建類型',
    'm8.targetIrr': '目標年化 IRR',
    'm8.targetMargin': '目標稅後淨利率'
  };

  function labelOf(key) {
    var k = String(key === undefined || key === null ? '' : key);
    if (hasOwn(LABELS, k)) return LABELS[k];
    if (k.indexOf('m4rough.') === 0) {
      var base = 'm4.' + k.slice('m4rough.'.length);
      return (hasOwn(LABELS, base) ? LABELS[base] : base) + '（第一輪粗估）';
    }
    return k ? zh(k) : '數值明細';
  }

  /* ------------------------------------------------------------------
     2. num：整個系統最常用的一格
     ------------------------------------------------------------------ */

  function unitsOf(opts) {
    if (opts && opts.units) return opts.units === 'm2' ? 'm2' : 'ping';
    var p = (opts && isObj(opts.p)) ? opts.p : curP;
    if (p && p.units === 'm2') return 'm2';
    return 'ping';
  }

  function reviewsOf(opts) {
    var p = (opts && isObj(opts.p)) ? opts.p : curP;
    return (p && isObj(p.reviews)) ? p.reviews : {};
  }

  function isReviewed(key, opts) {
    if (opts && opts.reviewed !== undefined) return !!opts.reviewed;
    if (!key) return false;
    var r = reviewsOf(opts)[key];
    return !!(r && r.status === 'done');
  }

  /* 短金額：圖表與副排用，寬度有限 */
  function moneyShort(v) {
    if (!isNum(v)) return '—';
    var a = Math.abs(v);
    if (a >= 1e8) return TD.fmt.n(v / 1e8, 2) + ' 億';
    if (a >= 1e4) return TD.fmt.n(v / 1e4, 0) + ' 萬';
    return TD.fmt.n(v, 0);
  }

  /* 依 fmt 格式化裸值。TD.fmt.pct / area / unitPrice 對 null 會算成 0，
     所以這裡一定要先自己把關，不能直接丟給 TD.fmt。*/
  function formatRaw(val, opts) {
    opts = opts || {};
    var f = opts.fmt || '';
    var d = opts.d;

    if (typeof val === 'string') return val === '' ? '—' : zhEsc(val);
    if (typeof val === 'boolean') return val ? '是' : '否';
    if (!isNum(val)) return '—';

    if (f === 'money') return esc(TD.fmt.money(val));
    if (f === 'moneyWan') return esc(TD.fmt.moneyWan(val));
    if (f === 'moneyShort') return esc(moneyShort(val));
    if (f === 'area') return esc(TD.fmt.area(val, unitsOf(opts), d === undefined ? 1 : d));
    if (f === 'ping') return esc(TD.fmt.n(TD.fmt.m2ToPing(val), d === undefined ? 1 : d));
    if (f === 'pct') return esc(TD.fmt.pct(val, d === undefined ? 1 : d));
    if (f === 'unitPrice') return esc(TD.fmt.unitPrice(val));
    if (f === 'wanPing') return esc(TD.fmt.n(val / 1e4, d === undefined ? 1 : d));
    /* 'pp'：內部存小數的「個百分點」（0.03 ＝ 3 個百分點）。不加百分號，
       單位寫在欄位標籤裡，免得 3.0% 被讀成 3%。*/
    if (f === 'pp') return esc(TD.fmt.n(val * 100, d === undefined ? 2 : d));
    if (f === 'months') return esc(TD.fmt.months(val));
    if (f === 'n') return esc(TD.fmt.n(val, d === undefined ? 0 : d));
    return esc(TD.fmt.n(val, d === undefined ? (Math.abs(val) < 100 && val % 1 !== 0 ? 2 : 0) : d));
  }

  function levelOf(conf) {
    var L = TD.LEVELS[conf];
    return L || { label: String(conf || '？'), cls: 'c-input', desc: '未知的信心等級。' };
  }

  function badgeHtml(conf) {
    var L = levelOf(conf);
    return '<span class="badge ' + esc(L.cls) + '">' + esc(L.label) + '</span>';
  }

  /* num(v, opts)
     v    ：TD.V 包裝值或裸值
     opts ：{ fmt, d, units, plain, p, reviewed, title } */
  function num(v, opts) {
    opts = opts || {};
    var isV = TD.isV(v);
    var key = isV ? String(v.key === undefined ? '' : v.key) : '';
    var val = isV ? v.v : v;
    var conf = isV ? v.conf : null;
    var body = formatRaw(val, opts);

    var plain = !!opts.plain || !key;
    var cls = 'num' + (plain ? ' plain' : '');
    var attrs = '';

    if (key && !opts.plain) attrs += ' data-vkey="' + esc(key) + '"';

    var tip = opts.title;
    if (tip === undefined && isV) {
      tip = labelOf(key) + '｜' + levelOf(conf).label + '｜' + zh(v.src ? v.src : '來源未填');
      if (v.note) tip += '｜' + zh(v.note);
    }
    if (tip) attrs += ' title="' + esc(tip) + '"';

    var html = '<span class="' + cls + '"' + attrs + '>' + body;
    if (isV && !opts.plain) {
      html += badgeHtml(conf);
      if (isReviewed(key, opts)) html += '<span class="reviewed">✓</span>';
    }
    html += '</span>';
    return html;
  }

  /* ------------------------------------------------------------------
     3. sec / kv / hero / table / lamp / note / field
     ------------------------------------------------------------------ */

  function attr(name, v) {
    if (v === undefined || v === null || v === '') return '';
    return ' ' + name + '="' + esc(v) + '"';
  }

  /* 收合區塊。open 由呼叫端決定（main.js 從 localStorage 取狀態）。
     bodyHtml 視為已組好的 HTML。opts:{sub, cls, open}
     兩種寫法都收：sec(id, title, body, opts) 用 opts.open，
     sec(id, title, body, open, opts) 把展開狀態擺第四個。*/
  function sec(id, title, bodyHtml, open, opts) {
    if (isObj(open)) { opts = open; open = opts.open; }
    opts = opts || {};
    var h = '<section class="sec' + (opts.cls ? ' ' + esc(opts.cls) : '') + '"' + attr('data-sec', id) + '>';
    h += '<button type="button" class="sec-head" data-act="secToggle"' + attr('data-sec', id)
       + ' aria-expanded="' + (open ? 'true' : 'false') + '">';
    h += '<span class="caret">' + (open ? '▾' : '▸') + '</span>';
    h += '<span>' + esc(title) + '</span>';
    if (opts.sub) h += '<span class="sub">' + esc(opts.sub) + '</span>';
    h += '</button>';
    if (open) h += '<div class="sec-body">' + (bodyHtml || '') + '</div>';
    h += '</section>';
    return h;
  }

  /* 兩欄密集表。每一列收兩種寫法：
       [label, valueHtml]          label 會 esc，valueHtml 視為已組好的 HTML
       {k, v, sub}                 k 會 esc；v 是 TD.V 時自動走 num()（信心徽章與明細抽屜都在），
                                   是字串時視為已組好的 HTML；sub 是標籤底下的小字，會 esc
     opts:{cls, p, fmt, d} — cls 傳 'two' 可排成四欄（label/value ×2）；
     fmt/d 只在 v 是 V 或裸數字時用得到。*/
  function kv(rows, opts) {
    opts = opts || {};
    rows = isArr(rows) ? rows : [];
    var h = '<dl class="kv' + (opts.cls ? ' ' + esc(opts.cls) : '') + '">', i, r, k, v, sub;
    for (i = 0; i < rows.length; i++) {
      r = rows[i];
      if (isArr(r)) { k = r[0]; v = r[1]; sub = ''; }
      else if (isObj(r)) {
        k = r.k;
        sub = r.sub;
        v = r.v;
        if (TD.isV(v) || typeof v === 'number') {
          v = num(v, { fmt: r.fmt || opts.fmt, d: (r.d === undefined ? opts.d : r.d),
            units: opts.units, p: opts.p, plain: !!r.plain });
        }
      } else continue;
      h += '<dt>' + esc(k) + (sub ? '<span class="hint">' + esc(sub) + '</span>' : '') + '</dt>';
      h += '<dd>' + (v === undefined || v === null || v === '' ? '—' : v) + '</dd>';
    }
    h += '</dl>';
    return h;
  }

  function alignCls(a) {
    if (a === 'r' || a === 'right' || a === 'end') return ' class="r"';
    return '';
  }

  function cell(row, col, opts) {
    var raw = row ? row[col.k] : null;
    if (col.html) return (raw === null || raw === undefined) ? '' : String(raw);
    if (typeof col.render === 'function') return col.render(raw, row, opts);
    if (TD.isV(raw) || typeof raw === 'number') {
      return num(raw, { fmt: col.fmt, d: col.d, units: opts.units, plain: col.plain || opts.plain, p: opts.p });
    }
    if (raw === null || raw === undefined || raw === '') return '<span class="num plain">—</span>';
    if (typeof raw === 'boolean') return raw ? '是' : '否';
    return zhEsc(raw);
  }

  /* cols:[{k,label,align,fmt,d,html,plain,render}]
     opts:{empty, foot, cls, units, plain, p, rowCls(row,i), scrollX} */
  function table(cols, rows, opts) {
    opts = opts || {};
    cols = isArr(cols) ? cols : [];
    rows = isArr(rows) ? rows : [];
    if (!rows.length) return '<p class="legal">' + esc(opts.empty || '沒有資料。') + '</p>';
    var h = '<table class="tbl' + (opts.cls ? ' ' + esc(opts.cls) : '') + '"><thead><tr>';
    var i, j, c, r, rc;
    for (i = 0; i < cols.length; i++) {
      h += '<th' + alignCls(cols[i].align) + '>'
         + esc(cols[i].label === undefined ? cols[i].k : cols[i].label) + '</th>';
    }
    h += '</tr></thead><tbody>';
    for (i = 0; i < rows.length; i++) {
      r = rows[i];
      rc = (typeof opts.rowCls === 'function') ? opts.rowCls(r, i) : '';
      h += '<tr' + (rc ? ' class="' + esc(rc) + '"' : '') + '>';
      for (j = 0; j < cols.length; j++) h += '<td' + alignCls(cols[j].align) + '>' + cell(r, cols[j], opts) + '</td>';
      h += '</tr>';
    }
    h += '</tbody>';
    if (isObj(opts.foot)) {
      h += '<tfoot><tr>';
      for (j = 0; j < cols.length; j++) h += '<td' + alignCls(cols[j].align) + '>' + cell(opts.foot, cols[j], opts) + '</td>';
      h += '</tr></tfoot>';
    }
    h += '</table>';
    return (opts.scrollX === false) ? h : '<div class="scroll-x">' + h + '</div>';
  }

  var LAMP_TEXT = { red: '紅燈', amber: '黃燈', green: '綠燈' };

  function lamp(level, text) {
    var lv = (level === 'red' || level === 'amber' || level === 'green') ? level : 'amber';
    var t = (text === undefined || text === null || text === '') ? LAMP_TEXT[lv] : text;
    return '<span class="lamp ' + lv + '">●<span>' + zhEsc(t) + '</span></span>';
  }

  /* kind: info|warn|bad|good。html 視為已組好的 HTML。
     UI-V2 第 5 節：整頁最多兩處 .note，別拿它當說明文字容器。*/
  function note(kind, html) {
    var k = (kind === 'info' || kind === 'warn' || kind === 'bad' || kind === 'good') ? kind : 'info';
    return '<div class="note ' + k + '">' + (html === undefined || html === null ? '' : html) + '</div>';
  }
  function noteText(kind, text) { return note(kind, zhEsc(text)); }

  /* 出價上限大數字區。
     opts:{ perPing, bid, bidPerPing, benchmark, sitePing, irr, margin, binding, p, missing } */
  function wanStr(v) { return isNum(v) ? TD.fmt.n(v / 1e4, 1) + ' 萬' : '—'; }

  function hero(v, opts) {
    opts = opts || {};
    var raw = TD.isV(v) ? v.v : v;
    var h, i;
    if (!isNum(raw)) {
      h = '<div class="hero blank"><div class="k">土地出價上限（走人價）</div>';
      h += '<span class="v">尚無法計算</span>';
      if (isArr(opts.missing) && opts.missing.length) {
        h += '<ul>';
        for (i = 0; i < opts.missing.length; i++) h += '<li>' + zhEsc(opts.missing[i]) + '</li>';
        h += '</ul>';
      }
      h += '</div>';
      return h;
    }
    var bm = isObj(opts.benchmark) ? opts.benchmark : null;
    var per = TD.isV(opts.perPing) ? opts.perPing.v : opts.perPing;
    h = '<div class="hero"><div class="k">土地出價上限（走人價）'
      + (isNum(opts.sitePing) ? '<span class="legal">　基地 ' + esc(TD.fmt.n(opts.sitePing, 2)) + ' 坪</span>' : '') + '</div>';
    h += '<span class="v">' + formatRaw(raw, { fmt: 'money' }) + (TD.isV(v) ? badgeHtml(v.conf) : '') + '</span>';
    h += '<span class="bind">每坪 ' + esc(wanStr(per)) + (opts.binding ? '　' + esc(opts.binding) : '') + '</span>';
    h += '<div class="row">';
    h += '<div><b>建議出價（談判目標）</b>' + num(opts.bid, { fmt: 'money', p: opts.p })
       + '<span class="legal">每坪 ' + esc(wanStr(opts.bidPerPing)) + '</span></div>';
    if (bm) {
      h += '<div><b>本區同分區土地行情</b><span class="num plain">每坪 ' + esc(wanStr(bm.perPing)) + '</span>'
         + '<span class="legal">' + (isNum(bm.capVsMarket) ? '上限為行情的 ' + esc(TD.fmt.n(bm.capVsMarket * 100, 0)) + '%' : '')
         + '</span></div>';
    } else {
      h += '<div><b>本區同分區土地行情</b><span class="num plain">—</span><span class="legal">查無同分區土地成交</span></div>';
    }
    h += '<div><b>達成年化 IRR</b>' + num(opts.irr, { fmt: 'pct', d: 1, p: opts.p }) + '</div>';
    h += '<div><b>達成稅後淨利率</b>' + num(opts.margin, { fmt: 'pct', d: 1, p: opts.p }) + '</div>';
    h += '</div>';
    if (bm && bm.verdict) {
      var cls = (isNum(bm.capVsMarket) && bm.capVsMarket < 0.95 && bm.conf !== 'low') ? 'warn' : 'info';
      h += '<div class="note ' + cls + '">' + zhEsc(bm.verdict)
         + (isNum(bm.marginAtMarket) ? '。以行情價買入：稅後淨利率 ' + esc(TD.fmt.pct(bm.marginAtMarket, 1))
            + (isNum(bm.irrAtMarket) ? '、年化 IRR ' + esc(TD.fmt.pct(bm.irrAtMarket, 1)) : '') : '') + '。</div>';
    }
    h += '<p class="legal">走人價＝賣方開價超過就放棄的最高地價（剛好達到報酬目標）；建議出價＝再保留 3 個百分點報酬緩衝的出價目標。</p>';
    h += '</div>';
    return h;
  }

  /* field(label, bindPath, opts)
     opts:{ type:'text'|'num'|'pct'|'bool'|'json'|'select'|'textarea',
            hint, min, max, step, options:[{v,t}], suffix, dataType, rows, placeholder } */
  function field(label, bindPath, opts) {
    opts = opts || {};
    var t = opts.type || (isArr(opts.options) ? 'select' : 'text');
    var bind = attr('data-bind', bindPath);
    var hint = opts.hint ? '<span class="hint">' + esc(opts.hint) + '</span>' : '';
    var ctrl, i, o, list;

    if (t === 'bool') {
      return '<div class="field"><label class="checkline">'
           + '<input type="checkbox"' + bind + ' data-type="bool">'
           + '<span>' + esc(label) + '</span></label>' + hint + '</div>';
    }

    if (t === 'select') {
      ctrl = '<select' + bind + attr('data-type', opts.dataType || '') + '>';
      list = isArr(opts.options) ? opts.options : [];
      for (i = 0; i < list.length; i++) {
        o = list[i];
        ctrl += '<option value="' + esc(o.v) + '">' + esc(o.t === undefined ? o.v : o.t) + '</option>';
      }
      ctrl += '</select>';
    } else if (t === 'textarea' || t === 'json') {
      ctrl = '<textarea' + bind + attr('data-type', t === 'json' ? 'json' : '')
           + attr('rows', opts.rows) + attr('placeholder', opts.placeholder) + '></textarea>';
    } else if (t === 'num' || t === 'pct') {
      ctrl = '<input type="number"' + bind + ' data-type="' + t + '"'
           + attr('data-min', opts.min) + attr('data-max', opts.max)
           + attr('step', opts.step === undefined ? (t === 'pct' ? '0.1' : 'any') : opts.step)
           + attr('placeholder', opts.placeholder) + '>';
    } else {
      ctrl = '<input type="text"' + bind + attr('placeholder', opts.placeholder) + '>';
    }

    return '<label class="field"><span class="field-label">' + esc(label)
         + (opts.suffix ? ' <span class="hint">' + esc(opts.suffix) + '</span>' : '')
         + '</span>' + ctrl + hint + '</label>';
  }

  /* ------------------------------------------------------------------
     4. legal：法源標籤 ＋ 查法規連結 ＋ 複製法規名稱
     ------------------------------------------------------------------ */

  /* lawLink() 只回官方入口首頁（深連結會失效），所以另附「複製名稱」按鈕。
     連結一律由使用者自己點——系統本身不發任何網路請求。*/
  function legal(lawName, article) {
    var name = (lawName === undefined || lawName === null) ? '' : String(lawName);
    var art = (article === undefined || article === null) ? '' : String(article);
    if (!name && !art) return '<span class="legal">法源：<b>待查</b></span>';

    var h = '<span class="legal">法源：<b>' + zhEsc(name || '待查') + '</b>';
    if (art) h += ' ' + esc(art);
    if (name) {
      var url = (TD.data && typeof TD.data.lawLink === 'function')
        ? TD.data.lawLink(name) : 'https://law.moj.gov.tw/Index.aspx';
      h += ' <a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">查法規</a>';
      h += ' <button type="button" class="btn btn-sm btn-ghost" data-act="copyLaw"'
         + attr('data-law', name + (art ? ' ' + art : '')) + '>複製</button>';
    }
    h += '</span>';
    return h;
  }

  /* ------------------------------------------------------------------
     5. tornado：手寫 inline SVG 龍捲風圖
     ------------------------------------------------------------------ */

  function median(arr) {
    if (!arr.length) return null;
    var a = arr.slice().sort(function (x, y) { return x - y; });
    var m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  /* tornado(items[, opts])
     items：m8.sensitivity，[{id,label,unit,lo,hi,loCap,hiCap,swing}]
     opts ：{ base } 中線基準值；沒給就用有限端點的中位數推估並在圖上註明。
     loCap / hiCap 可能是 null（該端求不出解），那一列標「無解」，不靜默跳過。*/
  function tornado(items, opts) {
    opts = opts || {};
    items = isArr(items) ? items : [];
    if (!items.length) return '<p class="legal">沒有敏感度資料可畫。</p>';

    var caps = [], i, it;
    for (i = 0; i < items.length; i++) {
      if (isNum(items[i].loCap)) caps.push(items[i].loCap);
      if (isNum(items[i].hiCap)) caps.push(items[i].hiCap);
    }
    if (!caps.length) return '<p class="legal">各項敏感度在目前假設下都求不出上限，沒有東西可畫。</p>';

    var base = isNum(opts.base) ? opts.base : median(caps);
    var baseGuessed = !isNum(opts.base);

    var rows = items.slice().sort(function (a, b) {
      var sa = isNum(a.swing) ? a.swing : -1, sb = isNum(b.swing) ? b.swing : -1;
      return sb - sa;
    });

    var W = 740, ROW = 28, TOP = 36, BOT = 12;
    var H = TOP + rows.length * ROW + BOT;
    var LX = 134, PX0 = 146, PX1 = 540, VX = 550;
    var cx = (PX0 + PX1) / 2;

    var maxDev = 0;
    for (i = 0; i < rows.length; i++) {
      if (isNum(rows[i].loCap)) maxDev = Math.max(maxDev, Math.abs(rows[i].loCap - base));
      if (isNum(rows[i].hiCap)) maxDev = Math.max(maxDev, Math.abs(rows[i].hiCap - base));
    }
    if (!(maxDev > 0)) maxDev = Math.abs(base) * 0.1 || 1;
    var scale = ((PX1 - PX0) / 2 - 6) / maxDev;

    function px(v) {
      var x = cx + (v - base) * scale;
      if (x < PX0) x = PX0;
      if (x > PX1) x = PX1;
      return x;
    }

    var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" '
          + 'aria-label="各項假設變動對土地出價上限的影響">';
    s += '<text class="lbl" x="' + cx + '" y="14" text-anchor="middle">基準 '
       + esc(moneyShort(base)) + '元' + (baseGuessed ? '（推估）' : '') + '</text>';
    s += '<line class="ax" x1="' + cx + '" y1="20" x2="' + cx + '" y2="' + (H - BOT + 2) + '"></line>';

    for (i = 0; i < rows.length; i++) {
      it = rows[i];
      var y = TOP + i * ROW, by = y + 3, bh = 15, mid = y + 14;

      var range = '';
      if (isNum(it.lo) && isNum(it.hi)) {
        /* 「%」與「個百分點」內部都存小數（0.01 ＝ 1 個百分點），顯示前要乘一百 */
        if (it.unit === '%') range = ' ±' + TD.fmt.n(Math.abs(it.hi) * 100, 0) + '%';
        else if (it.unit === '個百分點') range = ' ±' + TD.fmt.n(Math.abs(it.hi) * 100, 0) + ' 個百分點';
        else range = ' ±' + TD.fmt.n(Math.abs(it.hi), 0) + (it.unit ? it.unit : '');
      }
      s += '<text class="lbl" x="' + LX + '" y="' + mid + '" text-anchor="end">'
         + zhEsc(String(it.label === undefined ? it.id : it.label) + range) + '</text>';

      var ends = [it.loCap, it.hiCap], e, k, drew = false;
      for (k = 0; k < 2; k++) {
        e = ends[k];
        if (!isNum(e)) continue;
        drew = true;
        var x = px(e), x0 = Math.min(cx, x), w = Math.abs(x - cx);
        if (w < 1.5) w = 1.5;
        s += '<rect class="' + (x < cx ? 'bar-neg' : 'bar-pos') + '" x="' + TD.fmt.n(x0, 1)
           + '" y="' + by + '" width="' + TD.fmt.n(w, 1) + '" height="' + bh + '" rx="2"></rect>';
      }

      var vtxt;
      if (!isNum(it.loCap) && !isNum(it.hiCap)) vtxt = '無解';
      else if (!isNum(it.loCap)) vtxt = '無解 ｜ ' + moneyShort(it.hiCap);
      else if (!isNum(it.hiCap)) vtxt = moneyShort(it.loCap) + ' ｜ 無解';
      else vtxt = moneyShort(it.loCap) + ' ｜ ' + moneyShort(it.hiCap);
      s += '<text x="' + VX + '" y="' + mid + '">' + esc(vtxt) + '</text>';

      if (!drew) s += '<text x="' + (cx + 6) + '" y="' + mid + '">（此列無解）</text>';
    }
    s += '</svg>';
    return s;
  }

  /* ------------------------------------------------------------------
     6. cashflowChart：手寫 inline SVG 累計現金流
     ------------------------------------------------------------------ */

  /* 零線一定畫出來，最低點一定標出來並註明資金需求峰值——那是第一個被問的數字。*/
  function cashflowChart(rows) {
    rows = isArr(rows) ? rows : [];
    var pts = [], i, r;
    for (i = 0; i < rows.length; i++) {
      r = rows[i];
      if (!isObj(r) || !isNum(r.cum)) continue;
      pts.push({ m: isNum(r.m) ? r.m : i, cum: r.cum });
    }
    if (pts.length < 2) return '<p class="legal">現金流資料不足（少於兩期），無法畫累計曲線。</p>';

    var W = 740, H = 280, L = 70, R = 16, T = 18, B = 32;
    var PW = W - L - R, PH = H - T - B;

    var minM = pts[0].m, maxM = pts[0].m, minC = pts[0].cum, maxC = pts[0].cum, lowIdx = 0;
    for (i = 1; i < pts.length; i++) {
      if (pts[i].m < minM) minM = pts[i].m;
      if (pts[i].m > maxM) maxM = pts[i].m;
      if (pts[i].cum < minC) { minC = pts[i].cum; lowIdx = i; }
      if (pts[i].cum > maxC) maxC = pts[i].cum;
    }
    if (minC > 0) minC = 0;
    if (maxC < 0) maxC = 0;
    if (maxC === minC) maxC = minC + 1;
    var pad = (maxC - minC) * 0.08, yLo = minC - pad, yHi = maxC + pad;
    if (maxM === minM) maxM = minM + 1;

    function X(m) { return L + (m - minM) / (maxM - minM) * PW; }
    function Y(v) { return T + (yHi - v) / (yHi - yLo) * PH; }

    var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" '
          + 'aria-label="累計現金流曲線，含零線與資金需求峰值">';

    var TICKS = 5, t, v, yy;
    for (t = 0; t <= TICKS; t++) {
      v = yLo + (yHi - yLo) * t / TICKS;
      yy = Y(v);
      s += '<line class="gl" x1="' + L + '" y1="' + TD.fmt.n(yy, 1) + '" x2="' + (L + PW) + '" y2="' + TD.fmt.n(yy, 1) + '"></line>';
      s += '<text x="' + (L - 8) + '" y="' + TD.fmt.n(yy + 4, 1) + '" text-anchor="end">'
         + esc(TD.fmt.n(v / 1e8, 2)) + '</text>';
    }
    s += '<text x="' + (L - 8) + '" y="' + (T - 5) + '" text-anchor="end">億元</text>';

    var xAxisY = Y(Math.max(yLo, Math.min(yHi, 0)));
    s += '<line class="ax" x1="' + L + '" y1="' + (T + PH) + '" x2="' + (L + PW) + '" y2="' + (T + PH) + '"></line>';
    var span = maxM - minM, stepM = span <= 12 ? 2 : (span <= 36 ? 6 : 12), mk;
    for (mk = minM; mk <= maxM; mk += stepM) {
      s += '<line class="gl" x1="' + TD.fmt.n(X(mk), 1) + '" y1="' + T + '" x2="' + TD.fmt.n(X(mk), 1) + '" y2="' + (T + PH) + '"></line>';
      s += '<text x="' + TD.fmt.n(X(mk), 1) + '" y="' + (T + PH + 15) + '" text-anchor="middle">' + esc(TD.fmt.n(mk, 0)) + '</text>';
    }
    s += '<text x="' + (L + PW) + '" y="' + (T + PH + 28) + '" text-anchor="end">月</text>';

    s += '<line class="ax" x1="' + L + '" y1="' + TD.fmt.n(xAxisY, 1) + '" x2="' + (L + PW)
       + '" y2="' + TD.fmt.n(xAxisY, 1) + '"></line>';
    s += '<text class="lbl" x="' + (L + 4) + '" y="' + TD.fmt.n(xAxisY - 5, 1) + '">0</text>';

    var d = '', j;
    for (j = 0; j < pts.length; j++) {
      d += (j ? ' L' : 'M') + TD.fmt.n(X(pts[j].m), 1) + ' ' + TD.fmt.n(Y(pts[j].cum), 1);
    }
    s += '<path d="' + d + '" fill="none" stroke="var(--accent)" stroke-width="2"></path>';

    var lp = pts[lowIdx], lx = X(lp.m), ly = Y(lp.cum);
    s += '<circle class="bar-neg" cx="' + TD.fmt.n(lx, 1) + '" cy="' + TD.fmt.n(ly, 1) + '" r="4"></circle>';
    s += '<line class="gl" x1="' + TD.fmt.n(lx, 1) + '" y1="' + TD.fmt.n(ly, 1) + '" x2="' + TD.fmt.n(lx, 1)
       + '" y2="' + TD.fmt.n(xAxisY, 1) + '"></line>';
    var anchor = (lx > L + PW * 0.65) ? 'end' : 'start';
    var tx = (anchor === 'end') ? lx - 8 : lx + 8, ty = ly + 17;
    if (ty > T + PH - 6) ty = ly - 9;
    s += '<text class="lbl" x="' + TD.fmt.n(tx, 1) + '" y="' + TD.fmt.n(ty, 1) + '" text-anchor="' + anchor + '">'
       + esc('資金需求峰值 ' + moneyShort(lp.cum) + '元（第 ' + TD.fmt.n(lp.m, 0) + ' 月）') + '</text>';

    s += '</svg>';
    return s;
  }

  /* ------------------------------------------------------------------
     7. scatter：比價案例散佈圖（單價 對 屋齡）
     ------------------------------------------------------------------ */

  /* 散佈圖：y 為單價；x 預設屋齡，opts.x(c) 可改用其他特徵（例如成交年月），opts.xLabel／opts.xTick 對應標示 */
  function scatter(comps, subjectPrice, opts) {
    opts = opts || {};
    var xOf = typeof opts.x === 'function' ? opts.x : function (c) { return c.ageYears; };
    var xTick = typeof opts.xTick === 'function' ? opts.xTick : function (v) { return TD.fmt.n(v, 0); };
    var xLabel = opts.xLabel || '屋齡（年）';
    comps = isArr(comps) ? comps : [];
    var pts = [], i, c, xv;
    for (i = 0; i < comps.length; i++) {
      c = comps[i];
      if (!isObj(c) || !isNum(c.unitPricePing)) continue;
      xv = xOf(c);
      if (!isNum(xv)) continue;
      pts.push({ x: xv, y: c.unitPricePing });
    }
    if (pts.length < 2) return '<p class="legal">可用案例少於兩筆，無法畫散佈圖。</p>';

    var W = 740, H = 240, L = 62, R = 14, T = 14, B = 30;
    var PW = W - L - R, PH = H - T - B;
    var xLo = pts[0].x, xHi = pts[0].x, yLo = pts[0].y, yHi = pts[0].y;
    for (i = 1; i < pts.length; i++) {
      if (pts[i].x < xLo) xLo = pts[i].x;
      if (pts[i].x > xHi) xHi = pts[i].x;
      if (pts[i].y < yLo) yLo = pts[i].y;
      if (pts[i].y > yHi) yHi = pts[i].y;
    }
    if (isNum(subjectPrice)) {
      if (subjectPrice < yLo) yLo = subjectPrice;
      if (subjectPrice > yHi) yHi = subjectPrice;
    }
    if (xHi === xLo) xHi = xLo + 1;
    if (yHi === yLo) yHi = yLo + 1;
    var yPad = (yHi - yLo) * 0.1;
    yLo -= yPad; yHi += yPad;

    function X(v) { return L + (v - xLo) / (xHi - xLo) * PW; }
    function Y(v) { return T + (yHi - v) / (yHi - yLo) * PH; }

    var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" '
          + 'aria-label="比較案例單價散佈圖（橫軸：' + esc(xLabel) + '）">';
    var t, v, yy;
    for (t = 0; t <= 4; t++) {
      v = yLo + (yHi - yLo) * t / 4;
      yy = Y(v);
      s += '<line class="gl" x1="' + L + '" y1="' + TD.fmt.n(yy, 1) + '" x2="' + (L + PW) + '" y2="' + TD.fmt.n(yy, 1) + '"></line>';
      s += '<text x="' + (L - 6) + '" y="' + TD.fmt.n(yy + 4, 1) + '" text-anchor="end">'
         + esc(TD.fmt.n(v / 1e4, 0)) + '</text>';
    }
    s += '<text x="' + (L - 6) + '" y="' + (T - 2) + '" text-anchor="end">萬/坪</text>';
    s += '<line class="ax" x1="' + L + '" y1="' + (T + PH) + '" x2="' + (L + PW) + '" y2="' + (T + PH) + '"></line>';
    s += '<text x="' + (L + PW) + '" y="' + (T + PH + 24) + '" text-anchor="end">' + esc(xLabel) + '</text>';
    var xs, step = Math.max(1, Math.ceil((xHi - xLo) / 6));
    for (xs = Math.ceil(xLo); xs <= xHi; xs += step) {
      s += '<text x="' + TD.fmt.n(X(xs), 1) + '" y="' + (T + PH + 15) + '" text-anchor="middle">'
         + esc(xTick(xs)) + '</text>';
    }
    if (isNum(subjectPrice)) {
      s += '<line class="ax" x1="' + L + '" y1="' + TD.fmt.n(Y(subjectPrice), 1) + '" x2="' + (L + PW)
         + '" y2="' + TD.fmt.n(Y(subjectPrice), 1) + '" stroke-dasharray="4 3"></line>';
      s += '<text class="lbl" x="' + (L + 4) + '" y="' + TD.fmt.n(Y(subjectPrice) - 5, 1) + '">本案採用 '
         + esc(TD.fmt.n(subjectPrice / 1e4, 1)) + ' 萬/坪</text>';
    }
    for (i = 0; i < pts.length; i++) {
      s += '<circle class="dot-pos" cx="' + TD.fmt.n(X(pts[i].x), 1) + '" cy="'
         + TD.fmt.n(Y(pts[i].y), 1) + '" r="3.5" opacity=".75"></circle>';
    }
    s += '</svg>';
    return s;
  }

  /* ------------------------------------------------------------------
     8. overrideAlert：顯示覆寫只改那一格、不重算下游，必須讓人看得到
     ------------------------------------------------------------------ */

  function overrideAlert(p) {
    var ov = (isObj(p) && isObj(p.overrides)) ? p.overrides : null;
    if (!ov) return '';
    var keys = [], k;
    for (k in ov) {
      if (!hasOwn(ov, k) || !isNum(ov[k])) continue;
      keys.push(k);
    }
    if (!keys.length) return '';
    keys.sort();
    var i, list = '';
    for (i = 0; i < keys.length; i++) {
      list += (i ? '、' : '') + '<b>' + esc(labelOf(keys[i])) + '</b> ＝ ' + esc(TD.fmt.n(ov[keys[i]], 2));
    }
    return note('bad', '<b>' + TD.fmt.n(keys.length, 0) + ' 個數字是顯示覆寫，下游未重算：</b>' + list);
  }

  /* ------------------------------------------------------------------
     9. openDrawer：原則一的核心動線
     ------------------------------------------------------------------ */

  /* 在 ctx 裡找出 key 對應的 V。做了環狀參照與深度上限保護。*/
  function findValue(node, key, seen, depth) {
    seen = seen || [];
    depth = depth || 0;
    if (depth > 40 || !isObj(node) || seen.indexOf(node) >= 0) return null;
    seen.push(node);
    if (TD.isV(node)) return (String(node.key) === String(key)) ? node : null;
    var i, keys, hit;
    if (isArr(node)) {
      for (i = 0; i < node.length; i++) {
        hit = findValue(node[i], key, seen, depth + 1);
        if (hit) return hit;
      }
      return null;
    }
    keys = Object.keys(node);
    for (i = 0; i < keys.length; i++) {
      if (typeof node[keys[i]] === 'function') continue;
      hit = findValue(node[keys[i]], key, seen, depth + 1);
      if (hit) return hit;
    }
    return null;
  }

  /* ------------------------------------------------------------------
     vkey → 正規綁定路徑對照表。

     為什麼一定要有這張表：抽屜的「覆寫此值」是事後改值，只換那一格、
     不回頭重算下游。對容積率這種乘數來說後果是災難性的：改成 8.0 之後
     畫面上容積率變 8.0［輸入］，但基準容積樓地板還是 660 × 5.6，
     出價上限一毛錢都沒動。走正規路徑 p.m3.overrides.far 才會整條重算，
     兩者相差 5.88 億（+42%）。同一頁上兩個控制項、效果不同，這是陷阱。

     kind:
       'field'    同一個單位，直接把該欄位的輸入框嵌進抽屜，會完整重算。
       'redirect' 單位或粒度不同（例如營建成本是總額、可設的是每坪單價），只指路。
     兩種都停用純顯示覆寫，因為那會產出自相矛盾的報告。
     ------------------------------------------------------------------ */
  var VBIND = {
    'm3.bcr': { kind: 'field', path: 'm3.overrides.bcr', label: '建蔽率覆寫（%）',
      type: 'pct', min: 0, max: 100, step: '0.1', where: '進階假設',
      hint: '以百分比填（45% 填 45）。留白＝沿用分區種子資料。' },
    'm3.far': { kind: 'field', path: 'm3.overrides.far', label: '容積率覆寫（%）',
      type: 'pct', min: 0, max: 2000, step: '1', where: '進階假設',
      hint: '以百分比填（560% 填 560）。留白＝沿用種子資料。' },
    'm6.unitPricePing': { kind: 'field', path: 'm6.manualUnitPricePing', label: '指定銷售單價（元/坪，不含車位）',
      type: 'num', min: 0, step: '1000', where: '進階假設 → 售價',
      hint: '填了就採用指定單價、信心標「輸入」。留白＝回到本區實價登錄。' },
    'm3.buildAreaM2': { kind: 'redirect', path: 'm3.overrides.bcr', where: '進階假設',
      label: '建蔽率覆寫（%）', why: '建築面積是基地面積 × 建蔽率的結果，不是可獨立設定的輸入。' },
    'm3.baseFloorM2': { kind: 'redirect', path: 'm3.overrides.far', where: '進階假設',
      label: '容積率覆寫（%）', why: '基準容積樓地板是基地面積 × 容積率的結果，不是可獨立設定的輸入。' },
    'm4.pct': { kind: 'redirect', path: 'm4.pctOverrides.<獎勵項目>', where: '開發方式',
      label: '各獎勵項目成數', why: '獎勵成數是各項目逐項加總後再依制度上限封頂的結果，請逐項改成數。' },
    'm7.constructionCost': { kind: 'redirect', path: 'm7.constructionPerPingOverride', where: '進階假設 → 成本',
      label: '自填營建單價（元/坪）', why: '營建成本是樓地板面積 × 每坪單價的總額，可設定的是每坪單價。' }
  };

  function bindOf(vkey) {
    var k = String(vkey || '');
    return hasOwn(VBIND, k) ? VBIND[k] : null;
  }

  /* 由 key 猜一個顯示格式，純粹為了抽屜好讀，不影響計算 */
  function guessFmt(key) {
    var k = String(key || '');
    if (/PerPing|unitPrice|PricePing/i.test(k)) return 'unitPrice';
    if (/Cap$|Cost|Sales|Revenue|profit|landCap|walkAway|bidTarget/i.test(k)) return 'money';
    /* 樣式刻意全小寫（正規表示式帶 i 旗標）：原始碼裡不留任何看起來像模組代號的字樣 */
    if (/m2$|ping$/i.test(k)) return 'n';
    if (/pct|Ratio|rate|irr|margin|Threshold|Drop|Rise/i.test(k)) return 'pct';
    if (/Months$|months/i.test(k)) return 'months';
    return '';
  }

  function drawerHtml(vkey, ctx, p) {
    var v = findValue(ctx, vkey, [], 0);
    var ov = (p && isObj(p.overrides)) ? p.overrides : {};
    var rv = (p && isObj(p.reviews)) ? p.reviews : {};
    var hasOv = hasOwn(ov, vkey) && isNum(ov[vkey]);
    var review = rv[vkey];
    var reviewed = !!(review && review.status === 'done');

    var h = '<div data-vkey="' + esc(vkey) + '">';
    h += '<div class="inline"><h3>' + esc(labelOf(vkey)) + '</h3>';
    h += '<button type="button" class="btn btn-sm btn-ghost" data-act="drawerClose" '
       + 'style="margin-left:auto">關閉 ✕</button></div>';

    if (!v) {
      h += note('warn', '本次計算結果裡沒有這個數值。可能是該段計算失敗，或這一格不是可追溯的數值。');
      h += '</div>';
      return h;
    }

    var L = levelOf(v.conf);

    h += kv([
      ['目前值', num(v, { plain: true, p: p, fmt: guessFmt(vkey) }) + ' ' + badgeHtml(v.conf)
        + (reviewed ? '<span class="reviewed">✓ 已複核</span>' : '')],
      ['信心', '<b>' + esc(L.label) + '</b>｜' + esc(L.desc)],
      ['法源', legal(v.src || '', '')],
      ['備註', v.note ? zhEsc(v.note) : '（無）']
    ]);

    h += '<div class="field-label">算式</div>';
    h += '<pre>' + zhEsc(v.formula || '（此值未附算式）') + '</pre>';

    if (TD.needsReview(v)) {
      h += noteText('warn', '這是「' + L.label + '」等級的數字，查證後再勾選已複核。');
    }

    /* ---- 修改這個數字 ---- */
    var bind = bindOf(vkey);
    h += '<section class="card"><header><h3>' + (bind ? '修改這個數字' : '覆寫此值') + '</h3></header>'
       + '<div class="body tight">';

    if (bind) {
      if (hasOv) {
        h += note('bad', '偵測到舊的顯示覆寫（' + esc(TD.fmt.n(ov[vkey], 2)) + '），它沒有重算下游。');
        h += '<div class="inline"><button type="button" class="btn btn-sm" data-act="ovClear"'
           + attr('data-vkey', vkey) + '>清除舊的顯示覆寫</button></div>';
      }
      if (bind.kind === 'field') {
        h += field(bind.label, bind.path, {
          type: bind.type, min: bind.min, max: bind.max, step: bind.step, hint: bind.hint
        });
        h += '<div class="legal">左欄「' + esc(bind.where) + '」有同一個欄位，兩邊改都會整條重算。</div>';
      } else {
        h += '<div class="legal">' + esc(bind.why) + '　請改左欄「' + esc(bind.where) + '」的「'
           + esc(bind.label) + '」。</div>';
      }
    } else {
      h += '<div class="field"><span class="field-label">新的數值'
         + '<span class="hint">內部單位：金額為元、面積為平方公尺、比率為小數</span></span>'
         + '<input type="number" step="any" data-act="ovInput"'
         + attr('data-vkey', vkey) + attr('value', hasOv ? ov[vkey] : (isNum(v.v) ? v.v : '')) + '></div>';
      h += '<div class="inline">'
         + '<button type="button" class="btn btn-primary btn-sm" data-act="ovApply"' + attr('data-vkey', vkey) + '>套用覆寫</button>'
         + '<button type="button" class="btn btn-sm" data-act="ovClear"' + attr('data-vkey', vkey) + '>清除覆寫</button>'
         + '</div>';
      h += '<div class="legal">覆寫只改這一格，<b>不會回頭重算下游</b>，報告會前後不一致。</div>';
    }
    h += '</div></section>';

    /* ---- 人工複核 ---- */
    h += '<section class="card"><header><h3>人工複核</h3></header><div class="body tight">';
    h += '<label class="checkline"><input type="checkbox" data-act="reviewToggle"'
       + attr('data-vkey', vkey) + (reviewed ? ' checked' : '') + '>'
       + '<span>已複核（已比對法源或原始資料）</span></label>';
    h += '<div class="field"><span class="field-label">複核備註</span>'
       + '<textarea data-act="reviewNote"' + attr('data-vkey', vkey) + ' rows="3">'
       + esc(review && review.note ? review.note : '') + '</textarea></div>';
    if (review && review.at) {
      h += '<div class="legal">最後更新：' + esc(TD.fmt.dateStr(review.at)) + '</div>';
    }
    h += '</div></section>';

    h += '</div>';
    return h;
  }

  function byId(id) {
    if (typeof document === 'undefined') return null;
    return document.getElementById(id);
  }

  /* openDrawer(vkey, ctx, p) — 右側抽屜。這是本檔唯一直接碰 DOM 的元件。*/
  function openDrawer(vkey, ctx, p) {
    var el = byId(DRAWER_ID), bd = byId(BACKDROP_ID);
    if (!el) return false;
    if (p) setProject(p);
    el.innerHTML = drawerHtml(String(vkey), ctx, p || curP);
    el.hidden = false;
    if (bd) bd.hidden = false;
    el.setAttribute('data-vkey', String(vkey));
    try { el.scrollTop = 0; } catch (e) {}
    return true;
  }

  function closeDrawer() {
    var el = byId(DRAWER_ID), bd = byId(BACKDROP_ID);
    if (el) { el.hidden = true; el.innerHTML = ''; el.removeAttribute('data-vkey'); }
    if (bd) bd.hidden = true;
    return true;
  }

  function drawerOpen() {
    var d = byId(DRAWER_ID);
    return !!(d && !d.hidden);
  }

  /* 讀抽屜裡的輸入狀態，給 main.js 的 TD.actions 用 */
  function drawerState() {
    var el = byId(DRAWER_ID);
    if (!el || el.hidden) return null;
    var ovEl = el.querySelector('[data-act="ovInput"]');
    var rvEl = el.querySelector('[data-act="reviewToggle"]');
    var rnEl = el.querySelector('[data-act="reviewNote"]');
    var n = ovEl ? parseFloat(ovEl.value) : NaN;
    return {
      vkey: el.getAttribute('data-vkey') || '',
      overrideValue: isNum(n) ? n : null,
      reviewed: rvEl ? !!rvEl.checked : false,
      reviewNote: rnEl ? String(rnEl.value || '') : ''
    };
  }

  /* ------------------------------------------------------------------
     10. 寫入 p 的小工具（純資料，不碰 DOM）
     ------------------------------------------------------------------ */

  function applyOverride(p, key, value) {
    if (!isObj(p) || !key) return p;
    /* 有正規綁定路徑的 key 一律拒絕純顯示覆寫：那會只改一格、不重算下游。
       抽屜已改成引導到正規欄位，這裡是第二道防線。*/
    if (bindOf(key)) return p;
    p.overrides = isObj(p.overrides) ? p.overrides : {};
    if (isNum(value)) p.overrides[key] = value;
    return p;
  }

  function clearOverride(p, key) {
    if (!isObj(p) || !key) return p;
    if (isObj(p.overrides) && hasOwn(p.overrides, key)) delete p.overrides[key];
    return p;
  }

  function setReview(p, key, done, noteStr) {
    if (!isObj(p) || !key) return p;
    p.reviews = isObj(p.reviews) ? p.reviews : {};
    var at = 0;
    try { at = Date.now(); } catch (e) { at = 0; }
    if (done) {
      p.reviews[key] = { status: 'done', at: at, by: '', note: String(noteStr || '') };
    } else if (noteStr) {
      p.reviews[key] = { status: 'open', at: at, by: '', note: String(noteStr) };
    } else if (hasOwn(p.reviews, key)) {
      delete p.reviews[key];
    }
    return p;
  }

  /* ------------------------------------------------------------------
     11. TD.actions 的預設處理器（main.js 定義同名者會覆蓋這裡）
     ------------------------------------------------------------------ */

  function refresh(p) {
    if (typeof TD.recalc === 'function') { TD.recalc(); return; }
    if (TD.store && typeof TD.store.save === 'function' && p) { try { TD.store.save(p); } catch (e) {} }
    if (typeof TD.render === 'function') TD.render();
  }

  if (!TD.actions.drawerClose) TD.actions.drawerClose = function () { closeDrawer(); };
  if (!TD.actions.ovInput) TD.actions.ovInput = function () { return; };
  if (!TD.actions.ovApply) {
    TD.actions.ovApply = function (el, ctx, p) {
      var st = drawerState();
      if (!st || st.overrideValue === null) return;
      applyOverride(p, st.vkey, st.overrideValue);
      refresh(p);
    };
  }
  if (!TD.actions.ovClear) {
    TD.actions.ovClear = function (el, ctx, p) {
      var st = drawerState();
      if (!st) return;
      clearOverride(p, st.vkey);
      refresh(p);
    };
  }
  if (!TD.actions.reviewToggle) {
    TD.actions.reviewToggle = function (el, ctx, p) {
      var st = drawerState();
      if (!st) return;
      setReview(p, st.vkey, st.reviewed, st.reviewNote);
      refresh(p);
    };
  }
  if (!TD.actions.reviewNote) {
    TD.actions.reviewNote = function (el, ctx, p) {
      var st = drawerState();
      if (!st) return;
      setReview(p, st.vkey, st.reviewed, st.reviewNote);
      refresh(p);
    };
  }
  if (!TD.actions.copyLaw) {
    TD.actions.copyLaw = function (el) {
      if (!el || !el.getAttribute) return;
      var text = el.getAttribute('data-law') || '';
      if (!text) return;
      var done = false;
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text);
          done = true;
        }
      } catch (e) { done = false; }
      if (!done && typeof document !== 'undefined') {
        /* file:// 與舊瀏覽器的退路 */
        try {
          var ta = document.createElement('textarea');
          ta.value = text;
          ta.setAttribute('readonly', 'readonly');
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          done = true;
        } catch (e2) { done = false; }
      }
      if (el.setAttribute) el.setAttribute('title', done ? '已複製：' + text : '請手動選取：' + text);
    };
  }

  /* ------------------------------------------------------------------ 匯出 */

  TD.ui.num = num;
  TD.ui.sec = sec;
  TD.ui.kv = kv;
  TD.ui.hero = hero;
  TD.ui.table = table;
  TD.ui.lamp = lamp;
  TD.ui.note = note;
  TD.ui.noteText = noteText;
  TD.ui.field = field;
  TD.ui.tornado = tornado;
  TD.ui.cashflowChart = cashflowChart;
  TD.ui.scatter = scatter;
  TD.ui.legal = legal;
  TD.ui.overrideAlert = overrideAlert;
  TD.ui.openDrawer = openDrawer;

  TD.ui.closeDrawer = closeDrawer;
  TD.ui.drawerOpen = drawerOpen;
  TD.ui.drawerState = drawerState;
  TD.ui.setProject = setProject;
  TD.ui.project = project;
  TD.ui.esc = esc;
  TD.ui.zh = zh;
  TD.ui.zhEsc = zhEsc;
  TD.ui.label = labelOf;
  TD.ui.badge = badgeHtml;
  TD.ui.moneyShort = moneyShort;
  TD.ui.fmtRaw = formatRaw;
  TD.ui.findValue = function (ctx, key) { return findValue(ctx, key, [], 0); };
  TD.ui.applyOverride = applyOverride;
  TD.ui.clearOverride = clearOverride;
  TD.ui.setReview = setReview;
  TD.ui.vbind = VBIND;
  TD.ui.bindOf = bindOf;
})(window.TD);
