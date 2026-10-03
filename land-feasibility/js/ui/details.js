/* 右欄明細（UI-V2 第 4 節 ⑥）：六個收合區塊，預設全部收合，展開狀態記在 localStorage。

   規則（違反就是壞掉）：
   1. 每個數字一律走 TD.ui.num，信心徽章與明細抽屜都保留；裸數字不直接塞 HTML。
   2. 上游算不出來時寫「尚無法計算：缺什麼」，絕不用 0 或 NaN 冒充，也不補預設值。
   3. 引擎回傳的說明字串一律經過 TD.ui.zh（把內部代號換成中文詞）再 esc。
   4. 不寫說明性文字：只留欄位標籤、單位、數字、徽章、法源字串與短欄位。
   5. 圖表全部手寫 inline SVG，不引任何外部套件。
   6. 收合狀態由 main.js 傳進來的 isOpen 決定；沒傳時自己讀 localStorage（包 try/catch）。*/
window.TD = window.TD || {};
(function (TD) {
  'use strict';

  TD.ui = TD.ui || {};
  TD.actions = TD.actions || {};

  /* 與 main.js 共用同一個收合狀態鍵，兩邊讀到的是同一份。*/
  var SEC_KEY = 'tdev.v2.sections';

  function isObj(o) { return !!o && typeof o === 'object'; }
  function isArr(o) { return Object.prototype.toString.call(o) === '[object Array]'; }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function hasOwn(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function U() { return TD.ui; }
  function esc(s) { return TD.ui.esc(s); }
  function zh(s) { return TD.ui.zh(s); }
  function raw(x) { try { return TD.raw(x); } catch (e) { return null; } }
  function rawNum(x) { var v = raw(x); return isNum(v) ? v : null; }
  function f(v, d) { return isNum(v) ? TD.fmt.n(v, d === undefined ? 0 : d) : '—'; }
  function dash() { return '<span class="num plain">—</span>'; }

  function clip(s, n) {
    var t = zh(s === null || s === undefined ? '' : s);
    return t.length > n ? t.slice(0, n) + '…' : t;
  }
  /* 長字串收成一行，全文掛在 title 上，不讓表格被說明文字撐開 */
  function small(s, n) {
    var t = zh(s === null || s === undefined ? '' : s);
    if (!t) return dash();
    return '<span class="legal" title="' + esc(t) + '">' + esc(clip(t, n)) + '</span>';
  }
  function line(s) { return '<p class="legal">' + esc(zh(s)) + '</p>'; }
  function blank(what) { return '<p class="legal">尚無法計算：' + esc(zh(what)) + '</p>'; }

  /* 取第一句：引擎的警語常有兩三句，介面上只留一行 */
  function firstSentence(s) {
    var t = zh(s === null || s === undefined ? '' : s);
    var i = t.indexOf('。');
    return (i > 0) ? t.slice(0, i + 1) : t;
  }

  /* 取 ctx 的某一段；沒有或那段算失敗就回 null，理由另外給 */
  function seg(ctx, key) {
    if (!isObj(ctx)) return null;
    var s = ctx[key];
    if (!isObj(s) || s.error) return null;
    return s;
  }
  function segWhy(ctx, key, name) {
    if (!isObj(ctx)) return '尚未執行計算';
    var s = ctx[key];
    if (!isObj(s)) return name + '未產出';
    if (s.error) return name + '計算失敗（' + clip(s.error, 60) + '）';
    return name + '未產出';
  }

  /* ------------------------------------------------------------------
     收合狀態
     ------------------------------------------------------------------ */

  function secRead() {
    var txt = null, o;
    try { txt = (typeof window !== 'undefined' && window.localStorage) ? window.localStorage.getItem(SEC_KEY) : null; }
    catch (e) { txt = null; }
    if (!txt) return {};
    try { o = JSON.parse(txt); } catch (e2) { return {}; }
    return isObj(o) ? o : {};
  }

  /* 預設全部收合：沒設過就是 false */
  function opener(isOpen) {
    var saved = (typeof isOpen === 'function') ? null : secRead();
    return function (id) {
      var v;
      if (typeof isOpen === 'function') {
        v = isOpen(id);
        return (v === undefined || v === null) ? false : !!v;
      }
      return hasOwn(saved, id) ? !!saved[id] : false;
    };
  }

  /* ------------------------------------------------------------------
     1. 法規檢討明細
     ------------------------------------------------------------------ */

  var ST_ZH = { pass: '通過', fail: '不通過', manual: '算不出來', na: '不適用' };

  function statusCell(v) {
    var s = String(v === null || v === undefined ? '' : v);
    if (s === 'pass') return U().lamp('green', ST_ZH.pass);
    if (s === 'fail') return U().lamp('red', ST_ZH.fail);
    if (s === 'manual') return U().lamp('amber', ST_ZH.manual);
    if (s === 'na') return '<span class="tag">' + esc(ST_ZH.na) + '</span>';
    return '<span class="tag">' + esc(s ? zh(s) : '未判定') + '</span>';
  }

  function regBlock(ctx, p) {
    var m3 = seg(ctx, 'm3');
    if (!m3) return blank(segWhy(ctx, 'm3', '法規檢討'));

    var h = U().kv([
      ['建蔽率', U().num(m3.bcr, { fmt: 'pct', d: 1, p: p })],
      ['容積率', U().num(m3.far, { fmt: 'pct', d: 1, p: p })],
      ['建築面積', U().num(m3.buildAreaM2, { fmt: 'area', d: 1, p: p })],
      ['基準容積', U().num(m3.baseFloorM2, { fmt: 'area', d: 1, p: p })]
    ], { cls: 'two' });

    h += U().table([
      { k: 'label', label: '項目' },
      { k: 'status', label: '狀態', render: function (v) { return statusCell(v); } },
      { k: 'value', label: '數值', render: function (v) { return small(v, 24); } },
      { k: 'requirement', label: '規定', render: function (v) { return small(v, 34); } },
      { k: 'law', label: '法源', render: function (v) { return small(v, 24); } },
      { k: 'note', label: '備註', render: function (v, r) {
        var t = (v === null || v === undefined) ? '' : String(v);
        if (!t && r && r.status === 'manual') {
          t = (r.requirement ? String(r.requirement) + '：' : '') + '需要圖資或建築師計算書才算得出來。';
        }
        return small(t, 46);
      } }
    ], isArr(m3.checks) ? m3.checks : [], { p: p, empty: '沒有檢核項目。' });

    if (m3.zoneSource) h += line('分區依據 ' + clip(m3.zoneSource, 72));
    return h;
  }

  /* ------------------------------------------------------------------
     2. 容積獎勵組合排行（前 8 名，可點列套用）
     ------------------------------------------------------------------ */

  function itemNames(o) {
    var list = isArr(o && o.items) ? o.items : [];
    var out = [], i;
    for (i = 0; i < list.length; i++) out.push(String(list[i].name || list[i].id || ''));
    return out.join('、');
  }

  function capCell(o) {
    if (!o || !o.capped) return dash();
    var cut = (isNum(o.pctRaw) && isNum(o.pct)) ? (o.pctRaw - o.pct) : null;
    var tip = o.capNote ? ' title="' + esc(clip(o.capNote, 220)) + '"' : '';
    if (cut === null) return '<span class="tag"' + tip + '>封頂</span>';
    return '<span class="tag"' + tip + '>封頂 −' + esc(TD.fmt.n(cut * 100, 1)) + '%</span>';
  }

  function bonusBlock(ctx, p) {
    var m4 = seg(ctx, 'm4');
    if (!m4) return blank(segWhy(ctx, 'm4', '容積獎勵'));
    var opts = isArr(m4.options) ? m4.options : [];
    if (!opts.length) return blank('沒有可列舉的獎勵組合');

    var feasible = 0, i;
    for (i = 0; i < opts.length; i++) if (opts[i] && opts[i].feasible) feasible += 1;

    var chosenId = (isObj(m4.chosen) && m4.chosen.id) ? String(m4.chosen.id) : '';
    var top = opts.slice(0, 8);
    var ranked = top.length;

    /* 目前選用的組合可能排不進前 8：一定要補在最後一列，否則畫面上看不出自己選了什麼。*/
    var inTop = false;
    for (i = 0; i < top.length; i++) if (chosenId && String(top[i].id) === chosenId) inTop = true;
    if (chosenId && !inTop && isObj(m4.chosen)) top = top.concat([m4.chosen]);

    /* 取得成本與淨效益都是「基準容積 × 成數」推出來的。基準容積算不出來時
       這兩欄一律標成算不出來，不能讓引擎回落的 0 元看起來像真的免費。*/
    var base = rawNum(m4.baseFloorM2Used);
    var moneyOk = (base !== null && base > 0);

    var h = line('共 ' + f(feasible) + ' 組可行組合，以下為淨效益前 ' + f(ranked) + ' 名'
               + (top.length > ranked ? '，末列為目前選用' : ''));
    if (!moneyOk) h += line('缺基準容積樓地板，取得成本與淨效益算不出來');

    /* 整列可點，所以這張表自己組：TD.ui.table 只能給列加 class，給不了 data-act。*/
    h += '<div class="scroll-x"><table class="tbl"><thead><tr>'
       + '<th>制度</th><th>項目</th><th class="r">獎勵</th><th>封頂</th>'
       + '<th class="r">取得成本</th><th class="r">時程</th><th class="r">淨效益</th><th></th>'
       + '</tr></thead><tbody>';

    var o, id, names, sel;
    for (i = 0; i < top.length; i++) {
      o = top[i];
      id = String(o.id || '');
      sel = (id && id === chosenId);
      names = itemNames(o);

      h += '<tr' + (sel ? ' class="sel"' : '') + ' data-act="applyBonusOption" data-id="' + esc(id)
         + '" style="cursor:pointer">';
      h += '<td>' + esc(zh(o.regimeName || o.regimeId || ''))
         + (o.feasible === false ? ' <span class="tag">不符前提</span>' : '')
         + ((sel && i >= ranked) ? ' <span class="tag">目前選用</span>' : '') + '</td>';
      h += '<td>' + (names ? small(names, 20) : '<span class="legal">不加獎勵</span>') + '</td>';
      h += '<td class="r">' + U().num(o.pct, { fmt: 'pct', d: 1, p: p }) + '</td>';
      h += '<td>' + capCell(o) + '</td>';
      h += '<td class="r">' + (moneyOk ? U().num(o.costTotal, { fmt: 'money', p: p }) : dash()) + '</td>';
      h += '<td class="r">' + U().num(o.monthsAdd, { fmt: 'months', p: p }) + '</td>';
      h += '<td class="r">' + (moneyOk ? U().num(o.netGain, { fmt: 'money', p: p }) : dash()) + '</td>';
      h += '<td>' + (sel ? '<span class="tag">已選用</span>' : '<span class="legal">套用</span>') + '</td>';
      h += '</tr>';
    }
    h += '</tbody></table></div>';
    return h;
  }

  /* 點列套用：把該組合寫回專案的制度與獎勵項目，整條重算。
     main.js 沒有同名處理器，這裡是唯一實作。*/
  if (!TD.actions.applyBonusOption) {
    TD.actions.applyBonusOption = function (el, ctx, p) {
      if (!el || !el.getAttribute || !isObj(p)) return;
      var id = el.getAttribute('data-id');
      var list = (isObj(ctx) && isObj(ctx.m4) && isArr(ctx.m4.options)) ? ctx.m4.options : [];
      var hit = null, i;
      for (i = 0; i < list.length; i++) {
        if (String(list[i].id) === String(id)) { hit = list[i]; break; }
      }
      if (!hit || !TD.store || typeof TD.store.set !== 'function') return;
      if (hit.regimeId) TD.store.set(p, 'm4.regime', hit.regimeId);
      if (isArr(hit.itemIds)) TD.store.set(p, 'm4.picked', hit.itemIds.slice(0));
      if (isNum(hit.tdrPct)) TD.store.set(p, 'm4.tdrPct', hit.tdrPct);
      if (typeof TD.recalc === 'function') TD.recalc();
      else if (typeof TD.render === 'function') TD.render();
    };
  }

  /* ------------------------------------------------------------------
     3. 量體明細（含樓層堆疊示意）
     ------------------------------------------------------------------ */

  /* 樓層堆疊：地上逐層、地下逐層，寬度依每層面積。層數太多只畫前段並註明。*/
  function floorStack(mass) {
    var floors = rawNum(mass.floorsAbove);
    var buildArea = rawNum(mass.buildAreaM2);
    var basementM2 = rawNum(mass.basementM2);
    var height = rawNum(mass.heightM);
    if (floors === null || floors <= 0) return blank('缺地上層數，畫不出樓層堆疊');
    if (buildArea === null || buildArea <= 0) return blank('缺建築面積，畫不出樓層堆疊');

    var bLevels = (basementM2 !== null && basementM2 > 0) ? Math.ceil(basementM2 / buildArea) : 0;
    var drawAbove = Math.min(floors, 24);
    var drawBelow = Math.min(bLevels, 4);

    var W = 740, T = 22, X0 = 168, WF = 300;
    var fh = Math.max(4, Math.min(13, Math.floor(250 / (drawAbove + drawBelow + 1))));
    var rowH = fh + 2;
    var groundY = T + drawAbove * rowH;
    var H = groundY + drawBelow * rowH + 34;

    var perB = (bLevels > 0 && basementM2 !== null) ? basementM2 / bLevels : 0;
    var ratio = (perB > 0) ? perB / buildArea : 1;
    if (ratio < 0.6) ratio = 0.6;
    if (ratio > 1.6) ratio = 1.6;
    var WB = WF * ratio;

    var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" '
          + 'aria-label="樓層堆疊示意：地上層數、地下層數與每層面積">';

    var i, y;
    for (i = 0; i < drawAbove; i++) {
      y = groundY - (i + 1) * rowH + 2;
      s += '<rect class="bar-pos" x="' + X0 + '" y="' + y + '" width="' + TD.fmt.n(WF, 0)
         + '" height="' + fh + '" rx="1" opacity="' + (0.5 + 0.5 * (i / Math.max(1, drawAbove - 1))) + '"></rect>';
    }
    for (i = 0; i < drawBelow; i++) {
      y = groundY + i * rowH + 2;
      s += '<rect class="bar-neg" x="' + X0 + '" y="' + y + '" width="' + TD.fmt.n(WB, 0)
         + '" height="' + fh + '" rx="1" opacity=".45"></rect>';
    }

    s += '<line class="ax" x1="' + (X0 - 14) + '" y1="' + groundY + '" x2="' + (X0 + Math.max(WF, WB) + 14)
       + '" y2="' + groundY + '"></line>';

    var lx = X0 - 22, rx = X0 + Math.max(WF, WB) + 22;
    s += '<text class="lbl" x="' + lx + '" y="' + (T + Math.max(12, drawAbove * rowH / 2)) + '" text-anchor="end">'
       + esc('地上 ' + f(floors) + ' 層') + '</text>';
    if (floors > drawAbove) {
      s += '<text x="' + lx + '" y="' + (T + Math.max(12, drawAbove * rowH / 2) + 14) + '" text-anchor="end">'
         + esc('圖示前 ' + f(drawAbove) + ' 層') + '</text>';
    }
    s += '<text x="' + lx + '" y="' + (groundY + 12) + '" text-anchor="end">±0</text>';
    if (bLevels > 0) {
      s += '<text class="lbl" x="' + lx + '" y="' + (groundY + drawBelow * rowH / 2 + 16) + '" text-anchor="end">'
         + esc('地下 ' + f(bLevels) + ' 層') + '</text>';
    }
    s += '<text x="' + rx + '" y="' + (T + 10) + '">' + esc('每層 ' + f(buildArea, 0) + ' ㎡') + '</text>';
    if (height !== null) s += '<text x="' + rx + '" y="' + (T + 26) + '">' + esc('高度 ' + f(height, 1) + ' m') + '</text>';
    if (bLevels > 0 && basementM2 !== null) {
      s += '<text x="' + rx + '" y="' + (groundY + 14) + '">' + esc('地下 ' + f(basementM2, 0) + ' ㎡') + '</text>';
    }
    s += '</svg>';
    return s;
  }

  function massBlock(ctx, p) {
    var m5 = seg(ctx, 'm5');
    if (!m5) return blank(segWhy(ctx, 'm5', '量體'));
    function n(v, fmt, d) { return U().num(v, { fmt: fmt, d: d, p: p }); }

    var h = U().kv([
      ['容積樓地板', n(m5.volFloorM2, 'area', 1)],
      ['免計容積', n(m5.exemptFloorM2, 'area', 1)],
      ['地上總樓地板', n(m5.grossFloorM2, 'area', 1)],
      ['地下室', n(m5.basementM2, 'area', 1)],
      ['可售坪', n(m5.sellablePing, 'n', 1)],
      ['主建物坪', n(m5.mainPing, 'n', 1)],
      ['公設比', n(m5.publicRatio, 'pct', 1)],
      ['戶數', n(m5.unitsCount, 'n', 0)],
      ['車位數', n(m5.stalls, 'n', 0)],
      ['法定應設車位', isNum(m5.parkingRequired) ? esc(f(m5.parkingRequired)) : dash()],
      ['地上層數', n(m5.floorsAbove, 'n', 0)],
      ['建築高度 m', n(m5.heightM, 'n', 1)]
    ], { cls: 'two' });

    h += floorStack(m5);
    if (m5.legalWarning) h += U().noteText('warn', firstSentence(m5.legalWarning));
    return h;
  }

  /* ------------------------------------------------------------------
     4. 比價明細（方法一行、drivers、案例表、散佈圖）
     ------------------------------------------------------------------ */

  var METHOD_ZH = { hedonic: '特徵價格回歸', weighted: '加權比價', manual: '人工指定', median: '中位數' };

  function methodLine(m6) {
    var t = '方法 ' + (METHOD_ZH[m6.method] || (m6.method ? String(m6.method) : '—'));
    if (isNum(m6.n)) t += ' ｜ n=' + f(m6.n);
    if (isNum(m6.r2)) t += ' ｜ R² ' + TD.fmt.n(m6.r2, 3);
    if (isNum(m6.se)) t += ' ｜ 殘差標準差 ' + TD.fmt.n(m6.se, 3);
    return line(t);
  }

  function compsBlock(ctx, p) {
    var m6 = seg(ctx, 'm6');
    if (!m6) return blank(segWhy(ctx, 'm6', '售價比價'));
    function n(v, fmt, d) { return U().num(v, { fmt: fmt, d: d, p: p }); }

    var h = methodLine(m6);
    if (m6.compIsSample) h += line('案例來源 ' + clip(m6.compSource, 44) + '，不是實價登錄');
    else if (m6.compSource) h += line('案例來源 ' + clip(m6.compSource, 44));
    if (isNum(m6.compSkipped) && m6.compSkipped > 0) h += line('欄位不全未採用 ' + f(m6.compSkipped) + ' 筆');

    h += U().kv([
      ['成屋單價', n(m6.unitPricePing, 'unitPrice')],
      ['單價區間', n(m6.loPing, 'unitPrice') + ' ～ ' + n(m6.hiPing, 'unitPrice')],
      ['預售單價', n(m6.presalePricePing, 'unitPrice')],
      ['房屋銷售收入', n(m6.salesRevenue, 'money')],
      ['車位收入', n(m6.parkingRevenue, 'money')],
      ['總銷', n(m6.totalSales, 'money')],
      ['去化月數', n(m6.absorbMonths, 'months')],
      ['每月去化戶數', isNum(m6.absorbPerMonth) ? esc(f(m6.absorbPerMonth, 1)) : dash()]
    ], { cls: 'two' });

    h += U().scatter(m6.comps, rawNum(m6.unitPricePing));

    h += U().table([
      { k: 'name', label: '變數' },
      { k: 'coef', label: '係數', align: 'r', fmt: 'n', d: 4, plain: true },
      { k: 'effect', label: '影響', render: function (v) { return small(v, 44); } }
    ], isArr(m6.drivers) ? m6.drivers : [], { p: p, empty: '沒有變數影響可列。' });

    h += '<div class="tall">' + U().table([
      { k: 'addr', label: '位置', render: function (v) { return small(v, 18); } },
      { k: 'type', label: '類型' },
      { k: 'unitPricePing', label: '單價', fmt: 'unitPrice', align: 'r', plain: true },
      { k: 'areaPing', label: '坪', fmt: 'n', d: 1, align: 'r', plain: true },
      { k: 'ageYears', label: '屋齡', align: 'r' },
      { k: 'floor', label: '樓層', align: 'r' },
      { k: 'distanceM', label: '距離 m', align: 'r' },
      { k: 'adjPrice', label: '調整後單價', fmt: 'unitPrice', align: 'r', plain: true },
      { k: 'weightPct', label: '權重', fmt: 'pct', d: 1, align: 'r', plain: true },
      { k: 'residPct', label: '殘差', fmt: 'pct', d: 1, align: 'r', plain: true }
    ], isArr(m6.comps) ? m6.comps : [], { p: p, empty: '沒有比較案例。' }) + '</div>';

    return h;
  }

  /* ------------------------------------------------------------------
     5. 成本結構（逐項表＋合計列＋S 曲線）
     ------------------------------------------------------------------ */

  /* 營建支出 S 曲線：柱為當月動撥、線為累計占比。common.js 沒有這支，寫在這裡。*/
  function sCurveChart(curve) {
    var pts = [], i, v;
    for (i = 0; i < (isArr(curve) ? curve.length : 0); i++) {
      v = curve[i];
      if (!isNum(v)) continue;
      pts.push(v);
    }
    if (pts.length < 2) return blank('營建支出曲線少於兩期，畫不出 S 曲線');

    var total = 0, maxV = 0;
    for (i = 0; i < pts.length; i++) {
      total += pts[i];
      if (pts[i] > maxV) maxV = pts[i];
    }
    if (!(maxV > 0) || !(total > 0)) return blank('營建支出全為零，沒有曲線可畫');

    var W = 740, H = 210, L = 62, R = 44, T = 14, B = 28;
    var PW = W - L - R, PH = H - T - B;
    var n = pts.length, bw = Math.max(2, (PW / n) * 0.7);

    function X(i2) { return L + (i2 + 0.5) * (PW / n); }
    function YB(v2) { return T + (1 - v2 / maxV) * PH; }

    var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" '
          + 'aria-label="營建支出逐月動撥與累計占比 S 曲線">';

    var t, yy;
    for (t = 0; t <= 2; t++) {
      yy = T + PH - (PH * t / 2);
      s += '<line class="gl" x1="' + L + '" y1="' + TD.fmt.n(yy, 1) + '" x2="' + (L + PW)
         + '" y2="' + TD.fmt.n(yy, 1) + '"></line>';
      s += '<text x="' + (L - 6) + '" y="' + TD.fmt.n(yy + 4, 1) + '" text-anchor="end">'
         + esc(TD.fmt.n(maxV * t / 2 / 1e4, 0)) + '</text>';
      s += '<text x="' + (L + PW + 6) + '" y="' + TD.fmt.n(yy + 4, 1) + '">'
         + esc(TD.fmt.n(t * 50, 0) + '%') + '</text>';
    }
    s += '<text x="' + (L - 6) + '" y="' + (T - 3) + '" text-anchor="end">萬元</text>';
    s += '<text x="' + (L + PW + 6) + '" y="' + (T - 3) + '">累計</text>';

    for (i = 0; i < n; i++) {
      s += '<rect class="bar-pos" x="' + TD.fmt.n(X(i) - bw / 2, 1) + '" y="' + TD.fmt.n(YB(pts[i]), 1)
         + '" width="' + TD.fmt.n(bw, 1) + '" height="' + TD.fmt.n(T + PH - YB(pts[i]), 1)
         + '" rx="1" opacity=".65"></rect>';
    }

    var cum = 0, d = '';
    for (i = 0; i < n; i++) {
      cum += pts[i];
      d += (i ? ' L' : 'M') + TD.fmt.n(X(i), 1) + ' ' + TD.fmt.n(T + (1 - cum / total) * PH, 1);
    }
    s += '<path d="' + d + '" fill="none" stroke="var(--accent-ink)" stroke-width="2"></path>';

    s += '<line class="ax" x1="' + L + '" y1="' + (T + PH) + '" x2="' + (L + PW) + '" y2="' + (T + PH) + '"></line>';
    var step = n <= 12 ? 2 : (n <= 36 ? 6 : 12), mk;
    for (mk = 0; mk < n; mk += step) {
      s += '<text x="' + TD.fmt.n(X(mk), 1) + '" y="' + (T + PH + 15) + '" text-anchor="middle">'
         + esc(f(mk + 1)) + '</text>';
    }
    s += '<text x="' + (L + PW) + '" y="' + (T + PH + 26) + '" text-anchor="end">開工後第 N 月</text>';
    s += '</svg>';
    return s;
  }

  function costBlock(ctx, p) {
    var m7 = seg(ctx, 'm7');
    if (!m7) return blank(segWhy(ctx, 'm7', '成本'));
    var items = isArr(m7.items) ? m7.items : [];
    /* 成本逐項全是「樓地板 × 單價」或「總銷 × 比率」。樓地板算不出來時引擎會得到 0 元，
       那不是「不用錢」，是算不出來，不能照樣顯示。*/
    var floorM2 = rawNum(ctx && ctx.m5 && ctx.m5.grossFloorM2);
    if (floorM2 === null || floorM2 <= 0) return blank('缺地上總樓地板（量體），成本逐項算不出來');
    var totalSales = rawNum(ctx && ctx.m6 && ctx.m6.totalSales);

    function shareCell(v, r) {
      var amt = rawNum(r && r.amount);
      if (amt === null || totalSales === null || totalSales <= 0) return dash();
      return U().num(amt / totalSales, { fmt: 'pct', d: 1, plain: true, p: p });
    }

    var sum = 0, allNum = items.length > 0, i, a;
    for (i = 0; i < items.length; i++) {
      a = rawNum(items[i] && items[i].amount);
      if (a === null) { allNum = false; continue; }
      sum += a;
    }

    /* 管銷／廣告／稅費是「總銷 × 比率」。總銷算不出來時引擎改用回落粗估總銷，
       那是預設值填補：逐項可以照引擎的 basis 誠實列出，但合計不得呈現成已算出的金額。*/
    var costOk = !TD.ui.costComputable || TD.ui.costComputable(ctx);
    var totalV = m7.totalCostExLand;
    var foot = {
      label: '合計（不含土地）',
      amount: costOk ? totalV : null,
      basis: costOk ? '' : (TD.ui.costWhy ? TD.ui.costWhy(ctx) : '算不出來'),
      src: '',
      conf: (costOk && TD.isV(totalV)) ? totalV.conf : null
    };

    var h = U().table([
      { k: 'label', label: '項目' },
      { k: 'amount', label: '金額', fmt: 'money', align: 'r' },
      { k: 'share', label: '占總銷', align: 'r', render: shareCell },
      { k: 'basis', label: '計算基礎', render: function (v) { return small(v, 40); } },
      { k: 'src', label: '來源', render: function (v) { return small(v, 26); } },
      { k: 'conf', label: '信心', render: function (v) { return v ? U().badge(v) : dash(); } }
    ], items, { p: p, empty: '沒有成本項目。', foot: foot });

    if (!costOk) h += line(TD.ui.costWhy ? TD.ui.costWhy(ctx) : '總成本算不出來');

    var totalRaw = costOk ? rawNum(totalV) : null;
    if (allNum && totalRaw !== null && Math.abs(sum - totalRaw) > 1) {
      h += line('逐項合計 ' + U().moneyShort(sum) + '元 與總成本 ' + U().moneyShort(totalRaw)
              + '元 不一致，差額 ' + U().moneyShort(sum - totalRaw) + '元');
    }

    h += sCurveChart(m7.monthlyCostCurve);
    return h;
  }

  /* ------------------------------------------------------------------
     6. 現金流（累計曲線＋逐月表，逐月表另收一層）
     ------------------------------------------------------------------ */

  /* isOpenFn 可以不給（報告層就不給）：一律過 opener() 包一層，
     缺參數時退回 localStorage／預設收合，絕不直接呼叫可能不存在的函式。*/
  function cashBlock(ctx, p, isOpenFn) {
    var openFn = opener(isOpenFn);
    var m8 = seg(ctx, 'm8');
    if (!m8) return blank(segWhy(ctx, 'm8', '財務'));
    var rows = isArr(m8.cashflow) ? m8.cashflow : [];
    if (!rows.length) return blank('沒有逐月現金流（出價上限求不出解時不產生現金流）');

    var h = '';
    if (isObj(m8.atCap)) {
      h += U().kv([
        ['資金需求峰值（權益）', U().num(m8.atCap.peakEquity, { fmt: 'money', plain: true, p: p })],
        ['利息總額', U().num(m8.atCap.interestTotal, { fmt: 'money', plain: true, p: p })],
        ['完銷月', isNum(m8.atCap.soldOutMonth) ? esc(f(m8.atCap.soldOutMonth)) : dash()],
        ['期末未售', isNum(m8.atCap.unsoldAtEnd) ? esc(f(m8.atCap.unsoldAtEnd)) : dash()]
      ], { cls: 'two' });
    }

    h += U().cashflowChart(rows);

    var cols = isArr(m8.cashflowCols) ? m8.cashflowCols : [];
    var out = [], i, c;
    for (i = 0; i < cols.length; i++) {
      c = cols[i];
      out.push({
        k: c.k, label: c.label,
        align: (c.k === 'm') ? '' : 'r',
        fmt: (c.k === 'm') ? 'n' : 'moneyShort',
        plain: true
      });
    }
    var tbl = out.length
      ? '<div class="tall">' + U().table(out, rows, { p: p }) + '</div>'
      : blank('缺逐月欄位定義');

    h += U().sec('d-cash-rows', '逐月明細', tbl, openFn('d-cash-rows'),
                 { cls: 'flat', sub: f(rows.length) + ' 期' });
    return h;
  }

  /* ------------------------------------------------------------------ 組裝 */

  function regSub(ctx) {
    var m3 = seg(ctx, 'm3');
    if (!m3) return '';
    var checks = isArr(m3.checks) ? m3.checks : [];
    var fail = 0, manual = 0, i;
    for (i = 0; i < checks.length; i++) {
      if (checks[i].status === 'fail') fail += 1;
      else if (checks[i].status === 'manual') manual += 1;
    }
    var parts = [];
    if (fail) parts.push('不通過 ' + f(fail));
    if (manual) parts.push('算不出來 ' + f(manual));
    if (!parts.length) parts.push('共 ' + f(checks.length) + ' 項');
    return parts.join('　');
  }

  function bonusSub(ctx) {
    var m4 = seg(ctx, 'm4');
    if (!m4) return '';
    var pct = rawNum(m4.pct);
    return (pct === null) ? '' : '選用 ' + TD.fmt.pct(pct, 1);
  }

  function massSub(ctx) {
    var m5 = seg(ctx, 'm5');
    if (!m5) return '';
    var sp = rawNum(m5.sellablePing);
    return (sp === null) ? '' : '可售 ' + f(sp, 1) + ' 坪';
  }

  function compsSub(ctx) {
    var m6 = seg(ctx, 'm6');
    if (!m6) return '';
    var up = rawNum(m6.unitPricePing);
    return (up === null) ? '' : TD.fmt.unitPrice(up);
  }

  /* 收合標題右側的數字：與 costBlock 走同一條閘門，
     否則使用者第一眼看到的就是一個展開後才被否認的假數字。*/
  function costSub(ctx) {
    var m7 = seg(ctx, 'm7');
    if (!m7) return '';
    if (TD.ui.costComputable && !TD.ui.costComputable(ctx)) return '';
    var floorM2 = rawNum(ctx && ctx.m5 && ctx.m5.grossFloorM2);
    if (floorM2 === null || floorM2 <= 0) return '';
    var t = rawNum(m7.totalCostExLand);
    return (t === null) ? '' : U().moneyShort(t) + '元';
  }

  function cashSub(ctx) {
    var m8 = seg(ctx, 'm8');
    if (!m8 || !isObj(m8.atCap)) return '';
    var pk = rawNum(m8.atCap.peakEquity);
    return (pk === null) ? '' : '峰值 ' + U().moneyShort(pk) + '元';
  }

  /* renderDetails(ctx, p[, isOpen])
     isOpen 由 main.js 傳進來；沒傳就自己讀 localStorage。預設全部收合。*/
  function renderDetails(ctx, p, isOpen) {
    var open = opener(isOpen);
    var h = '';
    h += U().sec('d-reg', '法規檢討明細', regBlock(ctx, p), open('d-reg'), { sub: regSub(ctx) });
    h += U().sec('d-bonus', '容積獎勵組合排行', bonusBlock(ctx, p), open('d-bonus'), { sub: bonusSub(ctx) });
    h += U().sec('d-mass', '量體明細', massBlock(ctx, p), open('d-mass'), { sub: massSub(ctx) });
    h += U().sec('d-comps', '比價明細', compsBlock(ctx, p), open('d-comps'), { sub: compsSub(ctx) });
    h += U().sec('d-cost', '成本結構', costBlock(ctx, p), open('d-cost'), { sub: costSub(ctx) });
    h += U().sec('d-cash', '現金流', cashBlock(ctx, p, open), open('d-cash'), { sub: cashSub(ctx) });
    return h;
  }

  TD.ui.renderDetails = renderDetails;
  TD.ui.detailsUtil = {
    regBlock: regBlock, bonusBlock: bonusBlock, massBlock: massBlock,
    compsBlock: compsBlock, costBlock: costBlock, cashBlock: cashBlock,
    floorStack: floorStack, sCurveChart: sCurveChart
  };
})(window.TD);
