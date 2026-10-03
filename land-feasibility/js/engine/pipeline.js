/* pipeline：依序串起 m1～m8，逐模組容錯，最後套用使用者覆寫並算出複核閘門。*/
window.TD = window.TD || {};
(function (TD) {
  'use strict';

  TD.engine = TD.engine || {};

  /* ------------------------------------------------------------------
     設計說明（複核者請先讀）

     1. 執行順序：
          m1 → m2 → m3 → m4(粗估) → m5 → m6 → m4(重算並覆蓋) →〔組合改變時 m5 → m6 重算〕→ m7 → m8
        m4 跑兩次：第一次直接讀本區實價登錄的預售單價；m6 算出採用單價後（可能是使用者輸入或匯入案例）
        再跑一次覆蓋。第二次選出的組合若與第一次不同，量體與收入要跟著重算，否則下游會用到舊組合的容積。
     2. **任何模組丟例外都不能讓畫面掛掉**：每個模組各自包 try/catch，
        失敗時 ctx.mN = { error:'訊息' } 並繼續跑後面的模組。
        下游模組本身就設計成「上游缺值時安全降級」，所以中斷一個不會讓整串變成 NaN。
     3. 覆寫是在**所有模組跑完之後**才套用（SPEC 第 6 節末）：走訪整棵結果樹，
        遇到 key 命中 p.overrides 的 V 就換值、把 conf 改 'input'、在 note 前面
        記下原值。模組本身不需要知道覆寫這件事。
        注意：覆寫是**事後改值**，不會回頭重算下游。這是 SPEC 指定的行為，
        UI 必須讓使用者看得出來「這個數字被改過，但它的下游沒有跟著重算」。
     4. ctx.gate 依 SPEC 第 8.4 節算：todo 是 conf 為 low／unv 且 p.reviews[key]
        未標 done 的數量。total 是「需複核項目總數」（也就是 done + todo），
        另附 valueTotal 為全部 V 的數量，避免 UI 想顯示兩種分母時得自己數。
     5. 純函式：不碰 document、不碰 localStorage、不發任何網路請求。
        p 沒傳進來時用一個空物件跑，不去讀 TD.store（引擎層不碰儲存層）。
     ------------------------------------------------------------------ */

  /* 走訪覆寫樹與收集值時的保護上限，避免使用者匯入的怪資料讓遞迴爆掉 */
  var MAX_DEPTH = 40;
  var MAX_NODES = 200000;

  function isObj(o) { return !!o && typeof o === 'object'; }
  function isArr(o) { return Object.prototype.toString.call(o) === '[object Array]'; }
  function hasOwn(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }

  function errMsg(e) {
    if (!e) return '未知錯誤';
    if (e.message) return String(e.message);
    return String(e);
  }

  /* 把一個模組包起來跑：失敗只寫進 ctx.mN.error，不往外丟 */
  function step(ctx, key, fn2, p, errors) {
    var r;
    if (typeof fn2 !== 'function') {
      ctx[key] = { error: key + ' 模組未載入（TD.engine.' + key + ' 不是函式），請檢查 index.html 的 script 清單。' };
      errors.push(key + '：模組未載入');
      return ctx[key];
    }
    try {
      r = fn2(p, ctx);
    } catch (e) {
      ctx[key] = { error: key + ' 計算時發生例外：' + errMsg(e) };
      errors.push(key + '：' + errMsg(e));
      return ctx[key];
    }
    if (!isObj(r)) {
      ctx[key] = { error: key + ' 沒有回傳物件（回傳 ' + (typeof r) + '），視為計算失敗。' };
      errors.push(key + '：回傳值不是物件');
      return ctx[key];
    }
    ctx[key] = r;
    return r;
  }

  /* ---------------- 覆寫：走訪整棵樹，命中 p.overrides 的 V 就換值 ---------------- */

  function fmtOld(v) {
    if (v === null || v === undefined) return '（無值）';
    if (typeof v === 'number') {
      if (!isFinite(v)) return '（非有限數）';
      return (TD.fmt && TD.fmt.n) ? TD.fmt.n(v, Math.abs(v) >= 1000 ? 0 : 4) : String(v);
    }
    return String(v);
  }

  function applyOverrides(node, ov, applied, seen, depth, counter) {
    if (depth > MAX_DEPTH || counter.n > MAX_NODES) return;
    if (!isObj(node)) return;
    if (seen.indexOf(node) >= 0) return;
    seen.push(node);
    counter.n += 1;

    if (TD.isV(node)) {
      if (hasOwn(ov, node.key)) {
        var nv = ov[node.key];
        if (typeof nv === 'number' && isFinite(nv)) {
          if (applied.indexOf(node.key) < 0) applied.push(node.key);
          node.note = '使用者覆寫，原值 ' + fmtOld(node.v)
                    + '（原信心 ' + String(node.conf) + '）。'
                    + '覆寫只改這一格的數值，不會回頭重算下游：'
                    + '依賴這個數字的模組仍然使用原值，請一併確認。'
                    + (node.note ? '｜原備註：' + node.note : '');
          node.v = nv;
          node.conf = 'input';
        }
      }
      return;   /* V 是葉節點，不再往下走 */
    }

    var i, keys;
    if (isArr(node)) {
      for (i = 0; i < node.length; i++) applyOverrides(node[i], ov, applied, seen, depth + 1, counter);
      return;
    }
    keys = Object.keys(node);
    for (i = 0; i < keys.length; i++) {
      if (typeof node[keys[i]] === 'function') continue;
      applyOverrides(node[keys[i]], ov, applied, seen, depth + 1, counter);
    }
  }

  /* ---------------- 複核閘門 ---------------- */

  function buildGate(results, p) {
    var gate = { total: 0, done: 0, todo: 0, blocking: [], valueTotal: 0, dupKeys: [] };
    if (!TD.collectValues) return gate;

    var vals;
    try { vals = TD.collectValues(results); } catch (e) { return gate; }
    if (!isArr(vals)) return gate;

    var reviews = (p && isObj(p.reviews)) ? p.reviews : {};
    var seenKeys = {}, i, v, r, key;

    for (i = 0; i < vals.length; i++) {
      v = vals[i];
      if (!v) continue;
      key = String(v.key === undefined ? '' : v.key);
      if (hasOwn(seenKeys, key)) {
        /* 同一個 key 出現兩次：通常是模組把同一個 V 物件放進兩個欄位，
           或兩個模組撞 key。前者無害，後者會讓複核紀錄互相蓋掉，所以列出來。*/
        if (gate.dupKeys.indexOf(key) < 0) gate.dupKeys.push(key);
        continue;
      }
      seenKeys[key] = true;
      gate.valueTotal += 1;

      if (!TD.needsReview(v)) continue;
      gate.total += 1;
      r = reviews[key];
      if (r && r.status === 'done') {
        gate.done += 1;
      } else {
        gate.todo += 1;
        gate.blocking.push({
          key: key,
          src: v.src ? String(v.src) : '待查',
          note: v.note ? String(v.note) : '需人工複核',
          conf: v.conf
        });
      }
    }
    return gate;
  }

  /* 深層走訪一份結果，把其中每個 V 的 key 由 from 前綴換成 to 前綴，回傳一份新的結構。
     原物件完全不動（呼叫端還要用原 key 的版本當退路）。
     只處理純資料樹（物件／陣列／V／純量），深度上限 8 層防止意外的循環參照。 */
  function rekeyV(node, from, to, depth) {
    var out, i, k;
    depth = depth || 0;
    if (depth > 8 || node === null || typeof node !== 'object') return node;
    if (TD.isV(node)) {
      out = {};
      for (k in node) { if (Object.prototype.hasOwnProperty.call(node, k)) out[k] = node[k]; }
      if (typeof out.key === 'string' && out.key.indexOf(from) === 0) {
        out.key = to + out.key.slice(from.length);
      }
      return out;
    }
    if (Object.prototype.toString.call(node) === '[object Array]') {
      out = [];
      for (i = 0; i < node.length; i++) out.push(rekeyV(node[i], from, to, depth + 1));
      return out;
    }
    out = {};
    for (k in node) {
      if (Object.prototype.hasOwnProperty.call(node, k)) out[k] = rekeyV(node[k], from, to, depth + 1);
    }
    return out;
  }

  /* ---------------- 主函式 ---------------- */

  function run(p) {
    p = isObj(p) ? p : {};

    var ctx = {};
    var errors = [];
    var notes = [];
    var eng = TD.engine;

    /* ---- 1. 依序跑模組 ---- */

    step(ctx, 'm1', eng.m1, p, errors);
    step(ctx, 'm2', eng.m2, p, errors);
    step(ctx, 'm3', eng.m3, p, errors);

    /* m4 第一次：ctx.m6 還不存在，單價用 TD.data.cost 的保守預設 */
    var first = step(ctx, 'm4', eng.m4, p, errors);
    /* 粗估結果的 V key 必須改前綴（m4.pct → m4rough.pct）：
       SPEC 第 3 節要求 key 全域唯一，兩份同 key 會讓 TD.ui.findValue 靠走訪順序才碰巧命中、
       p.overrides['m4.pct'] 同時改寫兩處、勾一次「已複核」等於複核兩個數。
       first 本身保持原 key 不動，因為第二次呼叫失敗時 ctx.m4 要退回它。 */
    ctx.m4Rough = rekeyV(first, 'm4.', 'm4rough.');
    notes.push('容積獎勵跑兩次：第一次以本區實價登錄預售單價排序，第二次以收入段採用的單價重算並覆蓋。');

    step(ctx, 'm5', eng.m5, p, errors);
    step(ctx, 'm6', eng.m6, p, errors);

    /* m4 第二次：用 m6 的單價重算，覆蓋第一次的結果 */
    var second = step(ctx, 'm4', eng.m4, p, errors);
    if (second && second.error && first && !first.error) {
      /* 重算失敗就退回粗估版，總比整段沒有獎勵組合好；但一定要說出來 */
      ctx.m4 = first;
      notes.push('容積獎勵第二次計算失敗（' + second.error + '），已退回第一次的結果。');
    } else if (second && !second.error && first && !first.error && first.chosen && second.chosen
               && first.chosen.id !== second.chosen.id) {
      /* 組合改變：量體與收入依新組合重算 */
      step(ctx, 'm5', eng.m5, p, errors);
      step(ctx, 'm6', eng.m6, p, errors);
      notes.push('以收入段單價重算後，容積獎勵組合由「' + first.chosen.id + '」改為「' + second.chosen.id + '」，量體與收入已依新組合重算。');
    }

    step(ctx, 'm7', eng.m7, p, errors);
    step(ctx, 'm8', eng.m8, p, errors);

    /* ---- 2. 套用使用者覆寫（SPEC 第 6 節末）---- */

    var ov = isObj(p.overrides) ? p.overrides : {};
    var applied = [];
    var ovKeys = Object.keys(ov);
    if (ovKeys.length) {
      var results = { m1: ctx.m1, m2: ctx.m2, m3: ctx.m3, m4: ctx.m4, m4Rough: ctx.m4Rough,
                      m5: ctx.m5, m6: ctx.m6, m7: ctx.m7, m8: ctx.m8 };
      try {
        applyOverrides(results, ov, applied, [], 0, { n: 0 });
      } catch (e) {
        notes.push('套用使用者覆寫時發生例外（' + errMsg(e) + '），部分覆寫可能未生效，請重新整理後再試。');
      }
      var missed = [], mi;
      for (mi = 0; mi < ovKeys.length; mi++) if (applied.indexOf(ovKeys[mi]) < 0) missed.push(ovKeys[mi]);
      if (applied.length) {
        notes.push('已套用 ' + applied.length + ' 項使用者覆寫：' + applied.join('、')
                 + '。覆寫只改該格數值（conf 轉為 input），不會回頭重算下游。');
      }
      if (missed.length) {
        notes.push('以下覆寫的 key 在本次計算結果中找不到對應的數值，未生效：' + missed.join('、')
                 + '。可能是該模組本次算不出來、key 拼錯，或該欄位已改名。');
      }
    }

    /* ---- 3. 複核閘門（覆寫之後才算，因為覆寫會把 conf 變成 input）---- */

    var gateSrc = { m1: ctx.m1, m2: ctx.m2, m3: ctx.m3, m4: ctx.m4,
                    m5: ctx.m5, m6: ctx.m6, m7: ctx.m7, m8: ctx.m8 };
    ctx.gate = buildGate(gateSrc, p);
    if (ctx.gate.dupKeys && ctx.gate.dupKeys.length) {
      notes.push('偵測到重複的數值 key（同一個 key 出現多次，複核紀錄會互相覆蓋）：'
               + ctx.gate.dupKeys.join('、') + '。請回報給對應模組修正。');
    }

    /* ---- 4. 收尾：ctx 帶 p 與 units ---- */

    ctx.p = p;
    ctx.units = (p.units === 'm2') ? 'm2' : 'ping';

    ctx.errors = errors;
    ctx.notes = notes;
    ctx.ranAt = (function () { try { return Date.now(); } catch (e) { return 0; } })();
    ctx.ok = errors.length === 0;

    return ctx;
  }

  TD.engine.run = run;
  /* 匯出給測試與 UI 用的小工具（不是 SPEC 契約的一部分） */
  TD.engine.pipelineUtil = { applyOverrides: applyOverrides, buildGate: buildGate };
})(window.TD);
