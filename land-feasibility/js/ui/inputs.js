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
    var out = [], cities = (TD.data && TD.data.zoning && TD.data.zoning.cities) ? TD.data.zoning.cities : {};
    var ks = Object.keys(cities), i;
    for (i = 0; i < ks.length; i++) {
      if (ks[i].charAt(0) === '_') continue;          /* _template 不是縣市 */
      out.push({ v: ks[i], t: ks[i] });
    }
    if (!out.length) out.push({ v: '臺北市', t: '臺北市' });
    return out;
  }

  function zoneOptions(p) {
    var city = (p && p.parcel && p.parcel.city) || '';
    var cities = (TD.data && TD.data.zoning && TD.data.zoning.cities) ? TD.data.zoning.cities : {};
    var node = hasOwn(cities, city) ? cities[city] : null;
    var zones = (node && isObj(node.zones)) ? node.zones : null;
    var out = [], ks, i, cur = (p && p.parcel && p.parcel.zone) || '';
    if (zones) {
      ks = Object.keys(zones);
      for (i = 0; i < ks.length; i++) {
        if (ks[i].charAt(0) === '（') continue;        /* 範本檔的佔位鍵 */
        out.push({ v: ks[i], t: ks[i] + '　' + (zones[ks[i]].name || '') });
      }
    }
    /* 目前分區不在清單裡也一定列出來，否則 select 會靜默換掉使用者的值 */
    for (i = 0; i < out.length; i++) if (out[i].v === cur) return out;
    if (cur) out.unshift({ v: cur, t: cur + '　（此縣市種子資料無此分區）' });
    return out;
  }

  /* 目前縣市與分區在種子資料裡的建蔽率／容積率。查不到一律回 null，不頂替。*/
  function seededRatios(p) {
    var city = (p && p.parcel && p.parcel.city) || '';
    var zone = (p && p.parcel && p.parcel.zone) || '';
    var cities = (TD.data && TD.data.zoning && TD.data.zoning.cities) ? TD.data.zoning.cities : {};
    var node = hasOwn(cities, city) ? cities[city] : null;
    var zs = (node && isObj(node.zones)) ? node.zones : null;
    var z = (zs && hasOwn(zs, zone)) ? zs[zone] : null;
    return { bcr: (z && typeof z.bcr === 'number') ? z.bcr : null,
             far: (z && typeof z.far === 'number') ? z.far : null };
  }

  /* 建蔽率／容積率：種子資料沒有的分區（工業區、臺北市以外的縣市）由此輸入。
     留白時採用種子值；種子值也沒有時，整條鏈維持「尚無法計算」。*/
  function ratioRow(p) {
    var s = seededRatios(p), h = '';
    var hasSeed = (s.bcr !== null && s.far !== null);
    h += row('', f('建蔽率 %', 'm3.overrides.bcr', {
        type: 'pct', min: 0, max: 100,
        placeholder: s.bcr === null ? '必填' : String(TD.math.round(s.bcr * 100, 1)),
        hint: s.bcr === null ? '本系統未建檔，請輸入' : '留白採用種子值'
      })
      + f('容積率 %', 'm3.overrides.far', {
        type: 'pct', min: 0, max: 2000,
        placeholder: s.far === null ? '必填' : String(TD.math.round(s.far * 100, 1)),
        hint: s.far === null ? '本系統未建檔，請輸入' : '留白採用種子值'
      }));
    if (!hasSeed) {
      h += '<p class="legal">此分區沒有種子數值。請查該縣市土地使用分區管制規定與該基地的都市計畫'
         + '、細部計畫後填入；未填前不會產出基準容積與出價上限。</p>';
    }
    return h;
  }

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
    h += row('three', f('縣市', 'parcel.city', { options: cityOptions() })
      + f('行政區', 'parcel.district', { type: 'text' })
      + f('段小段', 'parcel.section', { type: 'text' }));
    h += parcelRows(p);
    h += row('one', f('使用分區', 'parcel.zone', { options: zoneOptions(p) }));
    h += ratioRow(p);
    h += row('three', f('臨路寬度 m', 'parcel.roadWidth', { type: 'num', min: 0 })
      + f('臨路條數', 'parcel.roadCount', { type: 'num', min: 0, step: '1' })
      + '<div class="field"><span class="field-label">角地</span>'
      + '<label class="checkline"><input type="checkbox" data-bind="parcel.corner" data-type="bool">'
      + '<span>是</span></label></div>');
    h += row('', f('基地寬 m', 'parcel.siteWidth', { type: 'num', min: 0 })
      + f('基地深 m', 'parcel.siteDepth', { type: 'num', min: 0 }));
    h += row('', f('所有權人數', 'parcel.ownerCount', { type: 'num', min: 0, step: '1' })
      + f('最大持分分母', 'parcel.shareDenomMax', { type: 'num', min: 1, step: '1' }));
    h += row('', f('既有建物屋齡 年', 'parcel.buildingAgeYears', { type: 'num', min: 0, step: '1' })
      + f('既有建物樓地板 ㎡', 'parcel.existingFloorM2', { type: 'num', min: 0 }));
    return h;
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
    h += '<div class="field"><span class="field-label">第一類謄本全文</span>'
       + '<textarea data-bind="parcel.deedText" rows="6"></textarea></div>';
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
    var out = [], i;
    for (i = 0; i < rs.length; i++) out.push({ v: rs[i].id, t: rs[i].name });
    if (!out.length) out.push({ v: 'NONE', t: '不走更新／危老' });
    return out;
  }

  function regimeOf(id) {
    var rs = (TD.data && TD.data.bonus && isArr(TD.data.bonus.regimes)) ? TD.data.bonus.regimes : [];
    var i;
    for (i = 0; i < rs.length; i++) if (rs[i].id === id) return rs[i];
    return null;
  }

  var COST_TYPE_ZH = { design: '設計與工程', donation: '捐贈或提供', purchase: '購買移入容積', none: '無直接成本' };

  function costText(b) {
    var t = COST_TYPE_ZH[b.costType] || b.costType || '—';
    if (isNum(b.costPerGainedPing) && b.costPerGainedPing > 0) {
      t += ' ' + TD.fmt.n(b.costPerGainedPing / 1e4, 1) + ' 萬/增加坪';
    } else if (isNum(b.costRateOfPrice) && b.costRateOfPrice > 0) {
      t += ' 房價 ' + TD.fmt.n(b.costRateOfPrice * 100, 0) + '%';
    }
    return t;
  }

  function regimeBody(ctx, p) {
    var h = '';
    var regId = (p && p.m4 && p.m4.regime) || 'NONE';
    var reg = regimeOf(regId);
    var picked = (p && p.m4 && isArr(p.m4.picked)) ? p.m4.picked : [];
    var all = (TD.data && TD.data.bonus && isArr(TD.data.bonus.bonuses)) ? TD.data.bonus.bonuses : [];
    var allows = (reg && isArr(reg.allows)) ? reg.allows : [];

    h += row('', f('制度', 'm4.regime', { options: regimeOptions() })
      + f('容積移轉成數 %', 'm4.tdrPct', { type: 'pct', min: 0, max: 100, step: '0.5' }));

    var rows = [], i, b;
    for (i = 0; i < all.length; i++) {
      b = all[i];
      if (allows.indexOf(b.id) < 0) continue;
      rows.push({
        on: '<input type="checkbox" data-act="pickToggle" data-id="' + esc(b.id) + '"'
          + (picked.indexOf(b.id) >= 0 ? ' checked' : '') + '>',
        name: b.name,
        pct: '<input type="number" data-bind="m4.pctOverrides.' + esc(b.id) + '" data-type="pct"'
          + ' data-min="0" data-max="100" step="0.5" style="width:62px;height:24px"'
          + ' placeholder="' + esc(TD.fmt.n(b.pctTypical * 100, 1)) + '">',
        cost: costText(b),
        months: isNum(b.monthsAdd) ? b.monthsAdd + ' 月' : '—',
        tradeoff: b.tradeoff || ''
      });
    }

    h += U().table([
      { k: 'on', label: '', html: true },
      { k: 'name', label: '獎勵項目' },
      { k: 'pct', label: '成數 %', html: true, align: 'r' },
      { k: 'cost', label: '取得成本' },
      { k: 'months', label: '時程', align: 'r' },
      { k: 'tradeoff', label: '代價', render: function (v) {
        return '<span class="legal" title="' + esc(String(v || '')) + '">' + esc(cut(v, 18)) + '</span>';
      } }
    ], rows, { empty: '此制度沒有可用的獎勵項目。' });

    h += '<div class="inline" style="margin-top:6px">'
       + '<button type="button" class="btn btn-sm" data-act="applyBest">套用最佳組合</button>';
    if (ctx && ctx.m4 && isObj(ctx.m4.best)) {
      h += '<span class="legal">' + esc(ctx.m4.best.regimeName || '') + '　'
         + esc(TD.fmt.pct(ctx.m4.best.pct, 1)) + '　淨效益 '
         + esc(U().moneyShort(ctx.m4.best.netGain)) + '元</span>';
    }
    h += '</div>';
    return h;
  }

  /* ------------------------------------------------------------------
     4. 進階假設
     ------------------------------------------------------------------ */

  function constructionOptions() {
    var rows = (TD.data && TD.data.cost && TD.data.cost.construction
      && isArr(TD.data.cost.construction.rows)) ? TD.data.cost.construction.rows : [];
    var out = [], i;
    for (i = 0; i < rows.length; i++) out.push({ v: rows[i].id, t: rows[i].label });
    if (!out.length) out.push({ v: 'rc25', t: 'RC 13～25層 住宅' });
    return out;
  }

  function advBody(ctx, p) {
    var h = '';

    h += grp('量體', row('', f('免計容積比 %', 'm5.exemptRatio', { type: 'pct', min: 0, max: 100 })
      + f('銷坪率 %', 'm5.sellRatio', { type: 'pct', min: 0, max: 100 }))
      + row('', f('公設比 %', 'm5.publicRatio', { type: 'pct', min: 0, max: 80 })
        + f('平均每戶 坪', 'm5.avgUnitPing', { type: 'num', min: 1 }))
      + row('', f('每車位樓地板 ㎡', 'm5.basementPerStallM2', { type: 'num', min: 1 })
        + f('層高 m', 'm5.floorHeightM', { type: 'num', min: 1 })));

    h += grp('售價', '<label class="checkline">'
      + '<input type="checkbox" data-bind="m6.useSampleComps" data-type="bool">'
      + '<span>使用示範比價資料</span></label>'
      + row('one', f('人工指定單價 元/坪', 'm6.manualUnitPricePing', { type: 'num', min: 0, step: '1000' }))
      + row('', f('預售溢價 %', 'm6.presalePremium', { type: 'pct', min: -50, max: 100 })
        + f('每月去化 戶', 'm6.absorbPerMonth', { type: 'num', min: 0.1 }))
      + '<div class="field"><span class="field-label">成交資料 CSV'
      + '<span class="hint">單價,坪數,屋齡,樓層,距離m</span></span>'
      + '<textarea id="compsCsv" rows="3" placeholder="1618000,42.5,3,12,180"></textarea></div>'
      + '<div class="inline"><button type="button" class="btn btn-sm" data-act="compsCsv">套用 CSV</button>'
      + '<button type="button" class="btn btn-sm btn-ghost" data-act="compsClear">清除自訂案例</button>'
      + '<span class="legal">自訂 ' + esc(TD.fmt.n((p && p.m6 && isArr(p.m6.comps)) ? p.m6.comps.length : 0, 0))
      + ' 筆</span></div>');

    h += grp('成本', row('', f('營建類型', 'm7.constructionKey', { options: constructionOptions() })
      + f('營建單價 元/坪', 'm7.constructionPerPingOverride', { type: 'num', min: 0, step: '1000' }))
      + row('', f('土融成數 %', 'm7.landLTV', { type: 'pct', min: 0, max: 100 })
        + f('土融利率 %', 'm7.landRate', { type: 'pct', min: 0, max: 30, step: '0.01' }))
      + row('', f('建融成數 %', 'm7.constLTV', { type: 'pct', min: 0, max: 100 })
        + f('建融利率 %', 'm7.constRate', { type: 'pct', min: 0, max: 30, step: '0.01' }))
      + row('three', f('管銷 %', 'm7.sgaRate', { type: 'pct', min: 0, max: 30 })
        + f('廣告 %', 'm7.marketingRate', { type: 'pct', min: 0, max: 30 })
        + f('設計監造 %', 'm7.designRate', { type: 'pct', min: 0, max: 30 }))
      + row('', f('其他稅費 %', 'm7.taxRateOther', { type: 'pct', min: 0, max: 30 })
        + f('利潤稅率 %', 'm7.profitTaxRate', { type: 'pct', min: 0, max: 60 })));

    h += grp('時程與目標', row('', f('規劃期 月', 'm7.planMonths', { type: 'num', min: 0, step: '1' })
      + f('工期 月', 'm7.buildMonths', { type: 'num', min: 1, step: '1' }))
      + row('', f('交屋期 月', 'm7.handoverMonths', { type: 'num', min: 0, step: '1' })
        + f('預售起始 月', 'm7.presaleStartMonth', { type: 'num', min: 0, step: '1' }))
      + row('', f('目標 IRR %', 'm8.targetIrr', { type: 'pct', min: 0, max: 100, step: '0.5' })
        + f('目標淨利率 %', 'm8.targetMargin', { type: 'pct', min: 0, max: 100, step: '0.5' })));

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

  function regimeSub(p) {
    var reg = regimeOf((p && p.m4 && p.m4.regime) || '');
    return reg ? reg.name : '未選';
  }

  function deedSub(ctx, p) {
    var n = (p && p.parcel && p.parcel.deedText) ? String(p.parcel.deedText).length : 0;
    if (!n) return '未貼上';
    var deed = (ctx && ctx.m1 && isObj(ctx.m1.deed)) ? ctx.m1.deed : null;
    return TD.fmt.n(n, 0) + ' 字' + (deed && deed.parsed === false ? '　未解析' : '');
  }

  function advSub(p) {
    var manual = (p && p.m6 && isNum(p.m6.manualUnitPricePing) && p.m6.manualUnitPricePing > 0)
      ? '人工單價' : '';
    var custom = (p && p.m6 && isArr(p.m6.comps) && p.m6.comps.length) ? '自訂比價' : '';
    var t = [manual, custom].join(manual && custom ? '　' : '');
    return t;
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
    var picked = (p && p.m4 && isArr(p.m4.picked)) ? p.m4.picked.length : 0;
    var h = '';
    h += fixedSec('in-site', '基地', areaSub(ctx, p), siteBody(ctx, p));
    h += U().sec('in-deed', '謄本', deedBody(ctx, p), open('in-deed', false),
      { sub: deedSub(ctx, p) });
    h += U().sec('in-regime', '開發方式', regimeBody(ctx, p), open('in-regime', false),
      { sub: regimeSub(p) + '　' + picked + ' 項' });
    h += U().sec('in-adv', '進階假設', advBody(ctx, p), open('in-adv', false),
      { sub: advSub(p) });
    return h;
  }

  TD.ui.renderInputs = renderInputs;
  TD.ui.deedFields = DEED_FIELDS;
})(window.TD);
