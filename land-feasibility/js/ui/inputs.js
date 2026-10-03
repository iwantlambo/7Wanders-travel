/* 左欄輸入（UI-V2 第 3 節）：基地、謄本、開發方式、進階假設。
   回傳 HTML 字串，由 main.js 塞進 #paneIn；欄位一律用 data-bind 交給 main.js 綁定，
   按鈕一律 data-act 交給 TD.actions（處理器定義在 main.js，本檔不自己接事件）。*/
window.TD = window.TD || {};
(function (TD) {
  'use strict';

  TD.ui = TD.ui || {};
  /* 本檔目前不需要自訂動作；容器仍防禦式取得，日後要加 TD.actions.xxx 就直接掛上。
     注意：main.js 在本檔之後載入，同名處理器會被 main.js 覆寫，不要在這裡重複定義。*/
  TD.actions = TD.actions || {};

  function isObj(o) { return !!o && typeof o === 'object'; }
  function isArr(o) { return Object.prototype.toString.call(o) === '[object Array]'; }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function hasOwn(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }

  function U() { return TD.ui; }
  function esc(s) { return TD.ui.esc(s); }
  function f(label, path, opts) { return TD.ui.field(label, path, opts); }

  function row(cls, inner) { return '<div class="fieldrow' + (cls ? ' ' + cls : '') + '">' + inner + '</div>'; }
  function grp(title, inner) {
    return '<div class="grp">' + (title ? '<h3>' + esc(title) + '</h3>' : '') + inner + '</div>';
  }
  function cut(s, n) {
    var t = String(s === null || s === undefined ? '' : s);
    return t.length > n ? t.slice(0, n) + '…' : t;
  }

  /* ------------------------------------------------------------------
     1. 基地
     ------------------------------------------------------------------ */

  function cityOptions() {
    var dd = TD.data && TD.data.districts, out = [], i;
    var list = (dd && isArr(dd.counties)) ? dd.counties : [];
    for (i = 0; i < list.length; i++) out.push({ v: list[i], t: list[i] });
    if (!out.length) out.push({ v: '新北市', t: '新北市' });
    return out;
  }

  /* 行政區：依縣市列出全部鄉鎮市區（22 縣市 368 區）。目前值不在清單中時加一列提示，不靜默換掉。*/
  function districtOptions(p) {
    var city = (p && p.parcel && p.parcel.city) || '';
    var cur = (p && p.parcel && p.parcel.district) || '';
    var dd = TD.data && TD.data.districts;
    var list = (dd && dd.list) ? dd.list(city) : [], out = [{ v: '', t: '請選擇行政區' }], i;
    for (i = 0; i < list.length; i++) out.push({ v: list[i], t: list[i] });
    if (cur && list.indexOf(cur) < 0) out.push({ v: cur, t: cur + '（不屬於' + city + '）' });
    return out;
  }

  function zoneOptions(p) {
    var city = (p && p.parcel && p.parcel.city) || '';
    var cities = (TD.data && TD.data.zoning && TD.data.zoning.cities) ? TD.data.zoning.cities : {};
    var node = hasOwn(cities, city) ? cities[city] : null;
    var zones = (node && isObj(node.zones)) ? node.zones : null;
    var out = [], ks, i, cur = (p && p.parcel && p.parcel.zone) || '', z, t;
    if (zones) {
      ks = Object.keys(zones);
      for (i = 0; i < ks.length; i++) {
        z = zones[ks[i]];
        t = (ks[i] === z.name ? ks[i] : ks[i] + '　' + z.name);
        if (isNum(z.bcr) && isNum(z.far)) t += '（' + Math.round(z.bcr * 100) + '%／' + Math.round(z.far * 100) + '%）';
        out.push({ v: ks[i], t: t });
      }
    }
    for (i = 0; i < out.length; i++) if (out[i].v === cur) return out;
    if (cur) out.unshift({ v: cur, t: cur + '　（' + (city || '此縣市') + '沒有這個分區，請改選）' });
    return out;
  }

  /* 目前縣市、行政區與分區查到的建蔽率／容積率（新北市依行政區與路寬調整容積率）。*/
  function seededRatios(p) {
    var pc = (p && p.parcel) || {};
    var Zd = TD.data && TD.data.zoning;
    var road = isNum(pc.roadWidth) && pc.roadWidth > 0 ? pc.roadWidth : null;
    var z = (Zd && Zd.lookup) ? Zd.lookup(pc.city, pc.zone, pc.district, road) : null;
    return { bcr: (z && isNum(z.bcr)) ? z.bcr : null, far: (z && isNum(z.far)) ? z.far : null,
             reason: z ? (z.farReason || '') : '' };
  }

  function ratioRow(p) {
    var s = seededRatios(p), h = '';
    h += row('', f('建蔽率 %', 'm3.overrides.bcr', {
        type: 'pct', min: 0, max: 100,
        placeholder: s.bcr === null ? '請輸入' : String(TD.math.round(s.bcr * 100, 1)),
        hint: s.bcr === null ? '依分區證明書輸入' : '留白＝法定 ' + TD.math.round(s.bcr * 100, 1) + '%'
      })
      + f('容積率 %', 'm3.overrides.far', {
        type: 'pct', min: 0, max: 2000,
        placeholder: s.far === null ? '請輸入' : String(TD.math.round(s.far * 100, 1)),
        hint: s.far === null ? '依分區證明書輸入' : '留白＝法定 ' + TD.math.round(s.far * 100, 1) + '%'
      }));
    if (s.reason) h += '<p class="legal">' + esc(s.reason) + '</p>';
    if (s.bcr === null || s.far === null) {
      h += '<p class="legal">此分區沒有通案數值，請依土地使用分區證明書填入建蔽率與容積率。</p>';
    }
    return h;
  }

  function productOptions() {
    var out = [{ v: 'auto', t: '依分區自動判定' }], list = (TD.engine && TD.engine.products) || [], i;
    var prm = (TD.engine && TD.engine.productParams) || {};
    for (i = 0; i < list.length; i++) out.push({ v: list[i], t: (prm[list[i]] && prm[list[i]].label) || list[i] });
    return out;
  }

  var NORTH_OPTS = [
    { v: 'same', t: '與本基地同分區' }, { v: '住', t: '住宅區' }, { v: '商', t: '商業區' },
    { v: '工', t: '工業區' }, { v: '道路', t: '道路或永久性空地' }, { v: '其他', t: '其他分區' }
  ];
  var HR_OPTS = [
    { v: 'auto', t: '依屋齡推定' }, { v: 'danger', t: '危險建築（限期拆除）' },
    { v: 'lowest', t: '耐震評估未達最低等級' }, { v: 'old30', t: '30 年以上、耐震能力不足' }, { v: 'none', t: '非危老' }
  ];

  /* 地號列：地號／面積／權利範圍＋刪除鈕。欄寬固定，數字欄不被地號擠掉。*/
  var PARCEL_GRID = 'grid-template-columns:minmax(0,1fr) 82px 64px 26px;align-items:end';

  function parcelRows(p) {
    var rows = (p && p.parcel && isArr(p.parcel.numbers)) ? p.parcel.numbers : [];
    var h = '', i;
    for (i = 0; i < rows.length; i++) {
      h += '<div class="fieldrow" style="' + PARCEL_GRID + '">';
      h += f('地號', 'parcel.numbers.' + i + '.no', { type: 'text' });
      h += f('面積 ㎡', 'parcel.numbers.' + i + '.areaM2', { type: 'num', min: 0 });
      h += f('權利範圍', 'parcel.numbers.' + i + '.share', { type: 'text' });
      h += '<button type="button" class="btn btn-sm btn-ghost" data-act="delParcel" data-i="' + i + '"'
         + ' title="刪除這一列"' + (rows.length <= 1 ? ' disabled' : '') + '>✕</button>';
      h += '</div>';
    }
    h += '<div class="inline"><button type="button" class="btn btn-sm" data-act="addParcel">＋ 地號</button></div>';
    return h;
  }

  function siteBody(ctx, p) {
    var h = '';
    var site = (ctx && ctx.m3 && isObj(ctx.m3.site)) ? ctx.m3.site : null;
    h += row('three', f('縣市', 'parcel.city', { options: cityOptions() })
      + f('行政區', 'parcel.district', { options: districtOptions(p) })
      + f('段小段', 'parcel.section', { type: 'text', placeholder: '例：幸福段' }));
    h += lvrStatus(p);
    h += parcelRows(p);
    h += row('', f('使用分區', 'parcel.zone', { options: zoneOptions(p) })
      + f('產品類型', 'parcel.productType', { options: productOptions() }));
    if (site && site.productAuto) {
      h += '<p class="legal">自動判定為「' + esc(site.product) + '」'
         + (site.allowRes ? '' : '（' + esc(site.zone ? site.zone.name : '本分區') + '不得作住宅使用）') + '。</p>';
    }
    if (site && site.useConflict) h += U().noteText('bad', site.useConflict);
    h += ratioRow(p);
    h += row('three', f('面前道路寬 m', 'parcel.roadWidth', { type: 'num', min: 0, placeholder: '8' })
      + f('臨路長度 m', 'parcel.frontageM', { type: 'num', min: 0 })
      + f('臨路條數', 'parcel.roadCount', { type: 'num', min: 0, step: '1' }));
    h += row('three', f('基地寬 m', 'parcel.siteWidth', { type: 'num', min: 0 })
      + f('基地深 m', 'parcel.siteDepth', { type: 'num', min: 0 })
      + f('臨路退縮 m', 'm3.setbackFrontM', { type: 'num', min: 0, placeholder: placeholderSetback(p) }));
    h += row('', f('北側鄰地分區', 'parcel.northZone', { options: NORTH_OPTS })
      + f('距捷運／鐵路站 m', 'parcel.mrtDistanceM', { type: 'num', min: 0, placeholder: '未輸入' }));
    if (site && site.assumed && site.assumed.length) {
      h += '<p class="legal">未填欄位暫用預設：' + esc(site.assumed.join('；')) + '。</p>';
    }
    h += row('', f('所有權人數', 'parcel.ownerCount', { type: 'num', min: 0, step: '1' })
      + f('最大持分分母', 'parcel.shareDenomMax', { type: 'num', min: 1, step: '1' }));
    h += row('three', f('既有建物屋齡 年', 'parcel.buildingAgeYears', { type: 'num', min: 0, step: '1' })
      + f('既有建物樓地板 ㎡', 'parcel.existingFloorM2', { type: 'num', min: 0 })
      + f('危老評估', 'parcel.hrStatus', { options: HR_OPTS }));
    return h;
  }

  function placeholderSetback(p) {
    var city = (p && p.parcel && p.parcel.city) || '';
    var c = TD.data && TD.data.zoning && TD.data.zoning.cities ? TD.data.zoning.cities[city] : null;
    return (c && c.setback && isNum(c.setback.frontM)) ? String(c.setback.frontM) : '0';
  }

  /* 實價登錄資料檔的載入狀態（由 main.js 依縣市延遲載入） */
  function lvrStatus(p) {
    var city = (p && p.parcel && p.parcel.city) || '';
    var st = (TD.app && TD.app.lvrState) ? TD.app.lvrState(city) : '';
    var L = TD.data && TD.data.lvr, m = (L && L.meta) ? L.meta(city) : null;
    if (m) return '<p class="legal">已載入' + esc(city) + '實價登錄行情（' + esc(m.from) + '～' + esc(m.to) + '）。</p>';
    if (st === 'loading') return '<p class="legal">正在載入' + esc(city) + '實價登錄行情…</p>';
    if (st === 'failed') return U().noteText('warn', city + '實價登錄行情檔載入失敗，比價暫用保守單價；請確認網站檔案完整後重新整理。');
    return '';
  }

  /* ------------------------------------------------------------------
     2. 謄本
     ------------------------------------------------------------------ */

  /* 解析結果對照表：欄位 → 中文標籤、可否寫回 parcel。
     apply 為 true 的欄位才有［套用］鈕，也才會被「全部套用」掃到
     （main.js 的 TD.actions.applyDeedAll 讀的就是這張表）。*/
  var DEED_FIELDS = [
    { k: 'section', label: '段小段', apply: true },
    { k: 'no', label: '地號', apply: false },
    { k: 'areaM2', label: '面積 ㎡', apply: true },
    { k: 'zone', label: '使用分區', apply: true },
    { k: 'owner', label: '所有權人', apply: true },
    { k: 'share', label: '權利範圍', apply: true },
    { k: 'jointOwner', label: '公同共有人', apply: false },
    { k: 'rightType', label: '他項權利種類', apply: false },
    { k: 'amount', label: '擔保債權金額', apply: false },
    { k: 'buildingTotalAreaM2', label: '建物總面積 ㎡', apply: true },
    { k: 'completionDate', label: '建築完成日期', apply: true },
    { k: 'buildingFloors', label: '建物層數', apply: false },
    { k: 'office', label: '管轄機關', apply: false },
    { k: 'printedAt', label: '謄本列印時間', apply: false }
  ];

  var UNPARSED_SHOW = 8;      /* 未解析清單只列前幾則，其餘收成一行計數 */

  function joinValues(list) {
    var out = [], i, v;
    for (i = 0; i < list.length && i < 4; i++) {
      v = list[i] ? list[i].value : null;
      if (v === null || v === undefined || v === '') continue;
      out.push(typeof v === 'number' ? TD.fmt.n(v, 2) : String(v));
    }
    if (list.length > 4) out.push('…另 ' + (list.length - 4) + ' 筆');
    return out.join('、');
  }

  function deedTable(deed) {
    var found = isObj(deed.found) ? deed.found : {};
    var rows = [], i, d, list;
    for (i = 0; i < DEED_FIELDS.length; i++) {
      d = DEED_FIELDS[i];
      list = isArr(found[d.k]) ? found[d.k] : [];
      if (!list.length) continue;
      rows.push({
        label: d.label,
        value: joinValues(list),
        raw: (list[0] && list[0].raw) ? String(list[0].raw) : '',
        line: (list[0] && isNum(list[0].line)) ? list[0].line : null,
        act: d.apply
          ? '<button type="button" class="btn btn-sm" data-act="applyDeedField" data-f="' + esc(d.k) + '">套用</button>'
          : ''
      });
    }
    if (!rows.length) return '';
    return U().table([
      { k: 'label', label: '欄位' },
      { k: 'value', label: '抓到的值' },
      { k: 'raw', label: '原文', render: function (v, r) {
        return '<span class="legal" title="' + esc(String(v || '')) + '">'
             + (r.line ? '第 ' + r.line + ' 行 ' : '') + esc(cut(v, 16)) + '</span>';
      } },
      { k: 'act', label: '', html: true }
    ], rows, { empty: '' });
  }

  /* 未解析清單：抓不到就明講抓不到，不補預設值。列太多只顯示前幾則。*/
  function unparsedList(deed) {
    var un = isArr(deed.unparsed) ? deed.unparsed : [];
    if (!un.length) return '';
    var h = '<div class="field-label" style="margin-top:8px">未解析　'
          + '<span class="hint">' + esc(TD.fmt.n(un.length, 0)) + ' 則</span></div>';
    h += '<ul class="legal" style="margin:2px 0 0;padding-left:16px">';
    var i, n = Math.min(un.length, UNPARSED_SHOW);
    for (i = 0; i < n; i++) h += '<li title="' + esc(U().zh(un[i])) + '">' + U().zhEsc(cut(U().zh(un[i]), 64)) + '</li>';
    if (un.length > n) h += '<li>…另 ' + esc(TD.fmt.n(un.length - n, 0)) + ' 則</li>';
    h += '</ul>';
    return h;
  }

  function deedBody(ctx, p) {
    var h = '';
    h += '<div class="field"><span class="field-label">謄本全文<span class="hint">第一類、第二類皆可</span></span>'
       + '<textarea data-bind="parcel.deedText" rows="6" placeholder="貼上地政電子謄本文字（含標示部、所有權部、他項權利部）"></textarea></div>';
    var dc = (ctx && ctx.m1) ? ctx.m1.deedClass : null;
    if (dc === 2) {
      h += '<p class="legal">已辨識為第二類謄本：所有權人姓名與統一編號部分隱匿、不顯示出生日期與債務人。'
         + '面積、權利範圍、他項權利種類與擔保金額仍可判讀；持分與共有判斷照常進行，人別查核須另取得同意或委託地政士。</p>';
    }
    h += '<div class="inline" style="margin:6px 0">'
       + '<button type="button" class="btn btn-sm" data-act="recalc">解析</button>'
       + '<button type="button" class="btn btn-sm" data-act="applyDeedAll">全部套用</button>'
       + '<button type="button" class="btn btn-sm btn-ghost" data-act="clearDeed">清空</button>'
       + '</div>';

    var deed = (ctx && ctx.m1 && isObj(ctx.m1.deed)) ? ctx.m1.deed : null;
    if (!deed || !deed.hasText) return h;

    h += deedTable(deed);
    h += unparsedList(deed);
    return h;
  }

  /* ------------------------------------------------------------------
     3. 開發方式
     ------------------------------------------------------------------ */

  function regimeOptions() {
    var rs = (TD.data && TD.data.bonus && isArr(TD.data.bonus.regimes)) ? TD.data.bonus.regimes : [];
    var out = [{ v: 'AUTO', t: '自動：採用可行的最佳組合' }], i;
    for (i = 0; i < rs.length; i++) out.push({ v: rs[i].id, t: rs[i].name });
    return out;
  }

  function regimeOf(id) {
    var rs = (TD.data && TD.data.bonus && isArr(TD.data.bonus.regimes)) ? TD.data.bonus.regimes : [];
    var i;
    for (i = 0; i < rs.length; i++) if (rs[i].id === id) return rs[i];
    return null;
  }

  function pctText(v) { return isNum(v) ? TD.fmt.n(v * 100, 1) + '%' : '—'; }

  /* 開發方式：各制度可不可行（含原因）＋目前制度的獎勵項目（可勾選、可改成數） */
  function regimeBody(ctx, p) {
    var h = '';
    var m4 = (ctx && isObj(ctx.m4) && !ctx.m4.error) ? ctx.m4 : null;
    var chosen = (m4 && isObj(m4.chosen)) ? m4.chosen : null;
    var regs = (m4 && isArr(m4.regimes)) ? m4.regimes : [];
    var picked = chosen ? chosen.itemIds : [];

    h += row('', f('開發制度', 'm4.regime', { options: regimeOptions() })
      + f('容積移轉成數 %', 'm4.tdrPct', { type: 'pct', min: 0, max: 40, step: '1', placeholder: '法定上限' }));

    if (chosen) {
      h += '<p class="legal">目前採用' + (m4.auto ? '（自動）' : '') + '：<b>' + esc(chosen.regimeName) + '</b>　'
         + (chosen.items.length ? esc(chosen.items.map(function (x) { return x.name + ' ' + pctText(x.pct); }).join('＋'))
            + '　合計 <b>' + esc(pctText(chosen.pct)) + '</b>' : '不申請容積獎勵')
         + '　淨效益 ' + esc(U().moneyShort(chosen.netGain)) + '元</p>';
    }

    /* 各制度可行性 */
    var i, j, r, it, rows = [];
    for (i = 0; i < regs.length; i++) {
      r = regs[i];
      rows.push({
        name: r.name,
        ok: r.feasible ? U().lamp('green', '可行') : U().lamp('red', '不可行'),
        why: r.feasible ? (r.warn && r.warn.length ? r.warn[0] : '前提成立') : r.why.join('；')
      });
    }
    if (rows.length) {
      h += U().table([
        { k: 'name', label: '制度' },
        { k: 'ok', label: '', html: true },
        { k: 'why', label: '原因', render: function (v) {
          return '<span class="legal" title="' + esc(String(v || '')) + '">' + esc(cut(v, 30)) + '</span>';
        } }
      ], rows, { empty: '' });
    }

    /* 目前制度的獎勵項目 */
    var curReg = chosen ? chosen.regimeId : '';
    var rs = null;
    for (i = 0; i < regs.length; i++) if (regs[i].id === curReg) rs = regs[i];
    if (rs) {
      var items = [];
      for (j = 0; j < rs.items.length; j++) {
        it = rs.items[j];
        items.push({
          on: '<input type="checkbox" data-act="pickToggle" data-reg="' + esc(rs.id) + '" data-id="' + esc(it.id) + '"'
            + (picked.indexOf(it.id) >= 0 ? ' checked' : '') + (it.applicable ? '' : ' disabled') + '>',
          name: it.name,
          pct: '<input type="number" data-bind="m4.pctOverrides.' + esc(it.id) + '" data-type="pct"'
            + ' data-min="0" data-max="100" step="0.5" style="width:58px;height:24px"'
            + ' placeholder="' + esc(TD.fmt.n(it.pct * 100, 1)) + '">',
          why: it.applicable ? it.why : '不適用：' + it.why,
          risk: it.riskLabel
        });
      }
      h += '<div class="field-label" style="margin-top:8px">' + esc(rs.name) + '的獎勵項目</div>';
      h += U().table([
        { k: 'on', label: '', html: true },
        { k: 'name', label: '項目' },
        { k: 'pct', label: '成數 %', html: true, align: 'r' },
        { k: 'why', label: '依據', render: function (v) {
          return '<span class="legal" title="' + esc(String(v || '')) + '">' + esc(cut(v, 22)) + '</span>';
        } },
        { k: 'risk', label: '風險' }
      ], items, { empty: '此制度沒有獎勵項目。' });
    }

    h += '<div class="inline" style="margin-top:6px">'
       + '<button type="button" class="btn btn-sm" data-act="applyBest">改回自動最佳組合</button>'
       + '</div>';
    return h;
  }

  /* ------------------------------------------------------------------
     4. 進階假設
     ------------------------------------------------------------------ */

  function constructionOptions() {
    var rows = (TD.data && TD.data.cost && TD.data.cost.construction
      && isArr(TD.data.cost.construction.rows)) ? TD.data.cost.construction.rows : [];
    var out = [{ v: 'auto', t: '自動（依產品與層數，2026 年行情）' }], i;
    for (i = 0; i < rows.length; i++) {
      out.push({ v: rows[i].id, t: rows[i].label + '　' + TD.fmt.n(rows[i].perPing / 1e4, 1) + ' 萬/坪' });
    }
    return out;
  }

  var SRC_OPTS = [{ v: 'district', t: '本區實價登錄（內建）' }, { v: 'custom', t: '匯入的成交案例' }];

  /* 進階假設的 placeholder 一律顯示「目前自動帶入的值」，留白就沿用它 */
  function autoVal(ctx, seg, key, scale, d) {
    var o = ctx && ctx[seg], v = null;
    if (o && isObj(o.params) && isNum(o.params[key])) v = o.params[key];
    else if (o && isNum(o[key])) v = o[key];
    if (v === null) return '';
    return TD.fmt.n(v * (scale || 1), d === undefined ? 1 : d).replace(/,/g, '');
  }

  function advBody(ctx, p) {
    var h = '';
    var m6 = ctx && ctx.m6;

    h += grp('量體', row('', f('免計容積比 %', 'm5.exemptRatio', { type: 'pct', min: 0, max: 60, placeholder: autoVal(ctx, 'm5', 'exemptRatio', 100, 0) })
      + f('可售係數（倍）', 'm5.sellRatio', { type: 'num', min: 0.8, max: 1.8, step: '0.01', placeholder: autoVal(ctx, 'm5', 'sellRatio', 1, 2) }))
      + row('', f('公設比 %', 'm5.publicRatio', { type: 'pct', min: 0, max: 60, placeholder: autoVal(ctx, 'm5', 'publicRatio', 100, 0) })
        + f('平均每戶 坪', 'm5.avgUnitPing', { type: 'num', min: 5, placeholder: autoVal(ctx, 'm5', 'avgUnitPing', 1, 1) }))
      + row('', f('每車位地下室 ㎡', 'm5.basementPerStallM2', { type: 'num', min: 25, max: 60 })
        + f('樓層高度 m', 'm5.floorHeightM', { type: 'num', min: 2.8, max: 6, step: '0.1', placeholder: autoVal(ctx, 'm5', 'floorHeightM', 1, 1) }))
      + '<p class="legal">可售係數＝可售坪（不含車位）÷ 容積樓地板坪；業界「銷坪係數」含車位約 1.55～1.6 倍。</p>');

    h += grp('售價', row('', f('比價資料', 'm6.compSource', { options: SRC_OPTS })
        + f('指定單價 元/坪', 'm6.manualUnitPricePing', { type: 'num', min: 0, step: '1000', placeholder: '留白＝依比價' }))
      + row('three', f('預售溢價 %', 'm6.presalePremium', { type: 'pct', min: -50, max: 100, placeholder: '0' })
        + f('每月去化 戶', 'm6.absorbPerMonth', { type: 'num', min: 0.1, placeholder: (m6 && isNum(m6.absorbPerMonth)) ? TD.fmt.n(m6.absorbPerMonth, 1) : '' })
        + f('車位單價 元', 'm6.parkingPricePerStall', { type: 'num', min: 0, step: '10000', placeholder: (m6 && isNum(m6.parkingPricePerStall)) ? String(Math.round(m6.parkingPricePerStall)) : '' }))
      + '<div class="field"><span class="field-label">匯入成交案例'
      + '<span class="hint">內政部實價登錄下載的 CSV 原檔，或每行「單價元/坪,坪數,屋齡,樓層,距離m」</span></span>'
      + '<textarea id="compsCsv" rows="3" placeholder="鄉鎮市區,交易標的,土地位置建物門牌,…（實價登錄 CSV 含表頭整份貼上）"></textarea></div>'
      + '<div class="inline"><button type="button" class="btn btn-sm" data-act="compsCsv">匯入並採用</button>'
      + '<button type="button" class="btn btn-sm btn-ghost" data-act="compsClear">清除匯入案例</button>'
      + '<span class="legal">已匯入 ' + esc(TD.fmt.n((p && p.m6 && isArr(p.m6.comps)) ? p.m6.comps.length : 0, 0))
      + ' 筆</span></div>');

    h += grp('成本', row('', f('營建單價級距', 'm7.constructionKey', { options: constructionOptions() })
      + f('營建單價 元/坪', 'm7.constructionPerPingOverride', { type: 'num', min: 0, step: '1000',
          placeholder: (ctx && ctx.m7 && ctx.m7.params && isNum(ctx.m7.params.perPing)) ? String(Math.round(ctx.m7.params.perPing)) : '' }))
      + row('', f('土融成數 %', 'm7.landLTV', { type: 'pct', min: 0, max: 100, placeholder: autoVal(ctx, 'm7', 'landLTV', 100, 0) })
        + f('土融利率 %', 'm7.landRate', { type: 'pct', min: 0, max: 30, step: '0.01', placeholder: autoVal(ctx, 'm7', 'landRate', 100, 2) }))
      + row('', f('建融成數 %', 'm7.constLTV', { type: 'pct', min: 0, max: 100, placeholder: autoVal(ctx, 'm7', 'constLTV', 100, 0) })
        + f('建融利率 %', 'm7.constRate', { type: 'pct', min: 0, max: 30, step: '0.01', placeholder: autoVal(ctx, 'm7', 'constRate', 100, 2) }))
      + row('three', f('管銷 %', 'm7.sgaRate', { type: 'pct', min: 0, max: 30, placeholder: autoVal(ctx, 'm7', 'sgaRate', 100, 1) })
        + f('廣告銷售 %', 'm7.marketingRate', { type: 'pct', min: 0, max: 30, placeholder: autoVal(ctx, 'm7', 'marketingRate', 100, 1) })
        + f('設計監造 %', 'm7.designRate', { type: 'pct', min: 0, max: 30, placeholder: autoVal(ctx, 'm7', 'designRate', 100, 1) }))
      + row('', f('其他稅費 %', 'm7.taxRateOther', { type: 'pct', min: 0, max: 30, placeholder: autoVal(ctx, 'm7', 'taxRateOther', 100, 1) })
        + f('營所稅率 %', 'm7.profitTaxRate', { type: 'pct', min: 0, max: 60, placeholder: autoVal(ctx, 'm7', 'profitTaxRate', 100, 0) })));

    var sch = (ctx && ctx.m7 && isObj(ctx.m7.schedule)) ? ctx.m7.schedule : {};
    h += grp('時程與報酬目標', row('', f('規劃請照 月', 'm7.planMonths', { type: 'num', min: 0, step: '1', placeholder: isNum(sch.planMonths) ? String(sch.planMonths) : '' })
      + f('工期 月', 'm7.buildMonths', { type: 'num', min: 6, step: '1', placeholder: isNum(sch.buildMonths) ? String(sch.buildMonths) : '' }))
      + row('', f('交屋期 月', 'm7.handoverMonths', { type: 'num', min: 0, step: '1', placeholder: isNum(sch.handoverMonths) ? String(sch.handoverMonths) : '' })
        + f('預售起始 月', 'm7.presaleStartMonth', { type: 'num', min: 0, step: '1', placeholder: isNum(sch.presaleStartMonth) ? String(sch.presaleStartMonth) : '' }))
      + row('', f('目標年化 IRR %', 'm8.targetIrr', { type: 'pct', min: 0, max: 100, step: '0.5' })
        + f('目標稅後淨利率 %', 'm8.targetMargin', { type: 'pct', min: 0, max: 100, step: '0.5' })));

    return h;
  }

  /* ------------------------------------------------------------------
     組裝
     ------------------------------------------------------------------ */

  /* 基地永遠展開，所以不套 TD.ui.sec（那會給出一顆按不動的收合鈕）。
     版面與其他三塊一致：空的 caret 佔位讓標題對齊。*/
  function fixedSec(id, title, sub, bodyHtml) {
    var h = '<section class="sec" data-sec="' + esc(id) + '">';
    h += '<div class="sec-head" style="cursor:default"><span class="caret"></span>'
       + '<span>' + esc(title) + '</span>';
    if (sub) h += '<span class="sub">' + esc(sub) + '</span>';
    h += '</div><div class="sec-body">' + bodyHtml + '</div></section>';
    return h;
  }

  function areaSub(ctx, p) {
    var a = (ctx && ctx.m1 && ctx.m1.areaM2) ? TD.raw(ctx.m1.areaM2) : null;
    if (!isNum(a) || a <= 0) return '未填面積';
    var u = (p && p.units === 'm2') ? 'm2' : 'ping';
    return TD.fmt.area(a, u, 1) + '　' + ((p && p.parcel && p.parcel.zone) || '');
  }

  function regimeSub(ctx, p) {
    var m4 = (ctx && isObj(ctx.m4)) ? ctx.m4 : null;
    if (m4 && isObj(m4.chosen)) return m4.chosen.regimeName + '　' + pctText(m4.chosen.pct) + (m4.auto ? '（自動）' : '');
    var reg = regimeOf((p && p.m4 && p.m4.regime) || '');
    return reg ? reg.name : '自動';
  }

  function deedSub(ctx, p) {
    var n = (p && p.parcel && p.parcel.deedText) ? String(p.parcel.deedText).length : 0;
    if (!n) return '未貼上';
    var deed = (ctx && ctx.m1 && isObj(ctx.m1.deed)) ? ctx.m1.deed : null;
    return TD.fmt.n(n, 0) + ' 字' + (deed && deed.parsed === false ? '　未解析' : '');
  }

  function advSub(p) {
    var parts = [];
    if (p && p.m6 && isNum(p.m6.manualUnitPricePing) && p.m6.manualUnitPricePing > 0) parts.push('指定單價');
    if (p && p.m6 && p.m6.compSource === 'custom') parts.push('匯入案例');
    if (p && p.m7 && isNum(p.m7.constructionPerPingOverride)) parts.push('指定營建單價');
    return parts.length ? parts.join('　') : '依實價登錄與 2026 年行情自動帶入';
  }

  /* renderInputs(ctx, p, isOpen)
     isOpen(id) 由 main.js 提供（收合狀態存在 localStorage，讀寫都在 main.js 包 try/catch）；
     沒傳時退回各區塊的預設值，本檔不自己碰 localStorage。*/
  function renderInputs(ctx, p, isOpen) {
    function open(id, dflt) {
      if (typeof isOpen !== 'function') return !!dflt;
      var v;
      try { v = isOpen(id); } catch (e) { v = undefined; }
      return (v === undefined || v === null) ? !!dflt : !!v;
    }
    var h = '';
    h += fixedSec('in-site', '基地', areaSub(ctx, p), siteBody(ctx, p));
    h += U().sec('in-deed', '謄本', deedBody(ctx, p), open('in-deed', false),
      { sub: deedSub(ctx, p) });
    h += U().sec('in-regime', '開發方式與容積獎勵', regimeBody(ctx, p), open('in-regime', false),
      { sub: regimeSub(ctx, p) });
    h += U().sec('in-adv', '進階假設', advBody(ctx, p), open('in-adv', false),
      { sub: advSub(p) });
    return h;
  }

  TD.ui.renderInputs = renderInputs;
  TD.ui.deedFields = DEED_FIELDS;
})(window.TD);
