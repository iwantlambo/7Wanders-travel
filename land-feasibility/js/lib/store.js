/* 專案儲存層：project 結構、點號路徑存取、audit 紀錄、localStorage（失敗自動退回記憶體）與 JSON 匯出入。*/
window.TD = window.TD || {};
(function (TD) {
  'use strict';

  var K_PROJECTS = 'tdev.v1.projects';   // localStorage：專案陣列
  var K_CURRENT  = 'tdev.v1.current';    // localStorage：目前專案 id
  var SCHEMA = 2;                        // 目前 project 結構版本（2：2026-10 版，新增產品類型、實價登錄比價等欄位）
  var AUDIT_MAX = 500;                   // audit 只留最近 N 筆，避免儲存空間爆掉
  var BAD_KEYS = ['__proto__', 'constructor', 'prototype'];  // 匯入資料一律擋掉的鍵名

  var store = {};
  store.persistent = true;               // 一旦 localStorage 讀寫失敗即轉為 false（記憶體模式）
  store.schema = SCHEMA;
  store.keys = { projects: K_PROJECTS, current: K_CURRENT };

  /* ===================== 基礎工具 ===================== */

  function isArr(v) { return Object.prototype.toString.call(v) === '[object Array]'; }
  function isObj(v) { return !!v && typeof v === 'object' && !isArr(v); }
  function isIndexKey(k) { return /^[0-9]+$/.test(k); }

  var seq = 0;
  // 時間戳記：優先用 Date.now()（store 屬 lib 層，可用瀏覽器 API）；無 Date 時退回遞增序號，保證排序仍成立
  function now(at) {
    seq++;
    if (typeof at === 'number' && isFinite(at)) return at;
    try { if (typeof Date !== 'undefined' && Date.now) return Date.now(); } catch (e) { /* 忽略 */ }
    return seq;
  }

  function newId() {
    var t = 0;
    try { if (typeof Date !== 'undefined' && Date.now) t = Date.now(); } catch (e) { t = 0; }
    seq++;
    return 'p_' + t.toString(36) + '_' + Math.floor(Math.random() * 1679616).toString(36) + seq.toString(36);
  }

  // 只複製純資料（物件／陣列／字串／數字／布林），深度與長度設上限，並擋掉危險鍵名
  function plainCopy(v, depth) {
    depth = depth || 0;
    if (depth > 8) return null;
    if (v === null || v === undefined) return null;
    var t = typeof v;
    if (t === 'number') return isFinite(v) ? v : null;
    if (t === 'string' || t === 'boolean') return v;
    if (t !== 'object') return null;                       // function 等一律丟掉
    var i, out;
    if (isArr(v)) {
      out = [];
      for (i = 0; i < v.length && i < 2000; i++) out.push(plainCopy(v[i], depth + 1));
      return out;
    }
    out = {};
    var ks = Object.keys(v);
    for (i = 0; i < ks.length && i < 500; i++) {
      if (BAD_KEYS.indexOf(ks[i]) >= 0) continue;
      out[ks[i]] = plainCopy(v[ks[i]], depth + 1);
    }
    return out;
  }

  function sameValue(a, b) {
    if (a === b) return true;
    if (a === null || b === null || a === undefined || b === undefined) return false;
    if (typeof a !== 'object' || typeof b !== 'object') return false;
    try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; }
  }

  /* --- 型別取值：匯入的 JSON 不受信任，一律經過這幾個函式 --- */
  function takeStr(src, key, dflt) {
    var v = src ? src[key] : undefined;
    if (typeof v === 'string') return v;
    if (typeof v === 'number' && isFinite(v)) return String(v);
    return dflt;
  }
  function takeNum(src, key, dflt) {
    var v = src ? src[key] : undefined;
    if (typeof v === 'number' && isFinite(v)) return v;
    if (typeof v === 'string' && v !== '' && isFinite(Number(v))) return Number(v);
    return dflt;
  }
  // null 代表「沿用預設」，與 0 意義不同，必須保留
  function takeNumOrNull(src, key) {
    var v = src ? src[key] : undefined;
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number' && isFinite(v)) return v;
    if (typeof v === 'string' && isFinite(Number(v))) return Number(v);
    return null;
  }
  function takeBool(src, key, dflt) {
    var v = src ? src[key] : undefined;
    if (typeof v === 'boolean') return v;
    if (v === 1 || v === '1' || v === 'true') return true;
    if (v === 0 || v === '0' || v === 'false') return false;
    return dflt;
  }
  function takeStrArr(src, key, dflt) {
    var v = src ? src[key] : undefined, out = [], i;
    if (!isArr(v)) return dflt;
    for (i = 0; i < v.length && i < 200; i++) if (typeof v[i] === 'string') out.push(v[i]);
    return out;
  }
  // 自由鍵名的對照表（overrides、reviews、manualFlags…）：鍵照抄，值只收純資料
  function takeMap(src, key) {
    var v = src ? src[key] : undefined, out = {}, ks, i;
    if (!isObj(v)) return out;
    ks = Object.keys(v);
    for (i = 0; i < ks.length && i < 1000; i++) {
      if (BAD_KEYS.indexOf(ks[i]) >= 0) continue;
      out[ks[i]] = plainCopy(v[ks[i]], 0);
    }
    return out;
  }
  function takeNumMap(src, key) {
    var v = src ? src[key] : undefined, out = {}, ks, i, n;
    if (!isObj(v)) return out;
    ks = Object.keys(v);
    for (i = 0; i < ks.length && i < 1000; i++) {
      if (BAD_KEYS.indexOf(ks[i]) >= 0) continue;
      n = takeNum(v, ks[i], null);
      if (n !== null) out[ks[i]] = n;
    }
    return out;
  }

  /* ===================== localStorage 包裝（全程 try/catch） ===================== */

  function ls() {
    try {
      if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
      if (typeof window !== 'undefined' && window && window.localStorage) return window.localStorage;
    } catch (e) { /* 隱私模式或被封鎖 */ }
    return null;
  }
  function lsGet(k) {
    var s = ls();
    if (!s) { store.persistent = false; return null; }
    try { return s.getItem(k); } catch (e) { store.persistent = false; return null; }
  }
  function lsSet(k, val) {
    var s = ls();
    if (!s) { store.persistent = false; return false; }
    try { s.setItem(k, val); return true; } catch (e) { store.persistent = false; return false; }
  }

  // 記憶體快取：persistent 為 false 時，整個系統就靠這份跑（重新整理即消失，UI 應提示使用者匯出）
  var mem = { projects: null, current: null };

  function readAll() {
    if (mem.projects) return mem.projects;
    var arr = [], txt = lsGet(K_PROJECTS), parsed, i;
    if (txt) {
      try { parsed = JSON.parse(txt); } catch (e) { parsed = null; store.persistent = false; }
      if (isArr(parsed)) {
        for (i = 0; i < parsed.length; i++) if (isObj(parsed[i])) arr.push(adopt(parsed[i], []));
      }
    }
    mem.projects = arr;
    return arr;
  }

  function writeAll(arr) {
    mem.projects = arr;
    var txt;
    try { txt = JSON.stringify(arr); } catch (e) { store.persistent = false; return false; }
    return lsSet(K_PROJECTS, txt);
  }

  function readCurrentId() {
    if (mem.current !== null) return mem.current;
    var v = lsGet(K_CURRENT);
    mem.current = (typeof v === 'string' && v) ? v : '';
    return mem.current;
  }

  function writeCurrentId(id) {
    mem.current = id || '';
    lsSet(K_CURRENT, mem.current);
    return mem.current;
  }

  function indexOfId(arr, id) {
    var i;
    for (i = 0; i < arr.length; i++) if (arr[i] && arr[i].id === id) return i;
    return -1;
  }

  /* ===================== project 預設結構（SPEC 第 6 節，欄位不可增刪改名） ===================== */

  function defaults() {
    var t = now();
    return {
      id: newId(), name: '', createdAt: t, updatedAt: t, schema: SCHEMA,
      units: 'ping',
      parcel: {
        city: '新北市', district: '', section: '',
        numbers: [{ no: '', areaM2: 0, share: '1/1' }],
        zone: '住宅區', productType: 'auto',
        roadWidth: null, roadCount: 1, corner: false, frontageM: null, siteWidth: null, siteDepth: null,
        northZone: 'same', mrtDistanceM: null,
        ownerCount: 1, shareDenomMax: 1, buildingAgeYears: 0, existingFloorM2: 0, hrStatus: 'auto',
        deedText: '', notes: ''
      },
      m2: { manualFlags: {}, consent: { owners: 0, agreeOwners: 0, shareAgree: 0 }, resolvedNotes: '' },
      m3: { overrides: { bcr: null, far: null }, manualChecks: {}, setbackFrontM: null },
      /* regime 'AUTO'：自動採用淨效益最高的可行組合；使用者點選排行或勾選項目後改為指定制度 */
      m4: { regime: 'AUTO', picked: [], pctOverrides: {}, tdrPct: null },
      /* m5 欄位為 null 代表「依產品類型自動帶入」，不是 0 */
      m5: {
        exemptRatio: null, sellRatio: null, publicRatio: null, avgUnitPing: null,
        basementPerStallM2: 40, floorHeightM: null
      },
      m6: {
        comps: [], compSource: 'district',
        subject: { ageYears: 0, floor: null, areaPing: null, distanceM: 0 },
        presalePremium: null, absorbPerMonth: null, manualUnitPricePing: null, parkingPricePerStall: null
      },
      m7: {
        constructionKey: 'auto', constructionPerPingOverride: null,
        landLTV: null, landRate: null, constLTV: null, constRate: null,
        sgaRate: null, marketingRate: null, designRate: null, taxRateOther: null, profitTaxRate: null,
        planMonths: null, buildMonths: null, handoverMonths: null, presaleStartMonth: null
      },
      m8: { targetIrr: 0.15, targetMargin: 0.15, scenario: 'base' },
      reviews: {},
      overrides: {},
      audit: []
    };
  }

  /* ===================== 不受信任資料的收編：只複製已知欄位 ===================== */

  function adoptNumbers(src, warn) {
    var rows = src ? src.numbers : null, out = [], i, r;
    if (!isArr(rows)) {
      if (rows !== undefined && rows !== null) warn.push('parcel.numbers 不是陣列，已改用一筆空白地號');
      return [{ no: '', areaM2: 0, share: '1/1' }];
    }
    for (i = 0; i < rows.length && i < 200; i++) {
      r = rows[i];
      if (!isObj(r)) continue;
      out.push({ no: takeStr(r, 'no', ''), areaM2: takeNum(r, 'areaM2', 0), share: takeStr(r, 'share', '1/1') });
    }
    if (!out.length) out.push({ no: '', areaM2: 0, share: '1/1' });
    return out;
  }

  function adoptComps(src, warn) {
    var rows = src ? src.comps : null, out = [], i, r;
    if (!isArr(rows)) return out;
    for (i = 0; i < rows.length && i < 500; i++) {
      r = rows[i];
      if (!isObj(r)) continue;
      out.push({
        id: takeStr(r, 'id', 'c' + (i + 1)), addr: takeStr(r, 'addr', ''), district: takeStr(r, 'district', ''),
        unitPricePing: takeNum(r, 'unitPricePing', 0), areaPing: takeNum(r, 'areaPing', 0),
        ageYears: takeNum(r, 'ageYears', 0), floor: takeNum(r, 'floor', 0),
        totalFloors: takeNum(r, 'totalFloors', 0), distanceM: takeNum(r, 'distanceM', 0),
        year: takeNum(r, 'year', 0), type: takeStr(r, 'type', ''),
        ym: takeNum(r, 'ym', 0), project: takeStr(r, 'project', ''), presale: takeBool(r, 'presale', false)
      });
    }
    if (out.length !== (isArr(rows) ? rows.length : 0)) warn.push('m6.comps 有非物件的項目已被略過');
    return out;
  }

  function adoptReviews(src) {
    var v = src ? src.reviews : null, out = {}, ks, i, r;
    if (!isObj(v)) return out;
    ks = Object.keys(v);
    for (i = 0; i < ks.length && i < 2000; i++) {
      if (BAD_KEYS.indexOf(ks[i]) >= 0) continue;
      r = v[ks[i]];
      if (!isObj(r)) continue;
      out[ks[i]] = {
        status: takeStr(r, 'status', 'done'), at: takeNum(r, 'at', 0),
        by: takeStr(r, 'by', ''), note: takeStr(r, 'note', '')
      };
    }
    return out;
  }

  function adoptAudit(src) {
    var v = src ? src.audit : null, out = [], i, r, start;
    if (!isArr(v)) return out;
    start = Math.max(0, v.length - AUDIT_MAX);           // 只留最近的
    for (i = start; i < v.length; i++) {
      r = v[i];
      if (!isObj(r)) continue;
      out.push({ at: takeNum(r, 'at', 0), path: takeStr(r, 'path', ''), from: plainCopy(r.from, 0), to: plainCopy(r.to, 0) });
    }
    return out;
  }

  // 把任意來源物件收編成合法 project：以 defaults() 為底，逐欄位取值，缺的就留預設
  function adopt(src, warn) {
    warn = warn || [];
    var p = defaults();
    if (!isObj(src)) { warn.push('匯入項目不是物件，已改用空白專案'); return p; }

    var sch = takeNum(src, 'schema', null);
    if (sch === null) warn.push('缺少 schema 欄位，已視為第 ' + SCHEMA + ' 版並以預設值補齊');
    else if (sch > SCHEMA) warn.push('資料 schema 為第 ' + sch + ' 版，高於本程式的第 ' + SCHEMA + ' 版，無法辨識的欄位已忽略');
    else if (sch < SCHEMA) warn.push('資料 schema 為第 ' + sch + ' 版，已升級為第 ' + SCHEMA + ' 版，缺少的欄位以預設值補齊');
    p.schema = SCHEMA;

    p.id = takeStr(src, 'id', p.id) || p.id;
    p.name = takeStr(src, 'name', '');
    p.createdAt = takeNum(src, 'createdAt', p.createdAt);
    p.updatedAt = takeNum(src, 'updatedAt', p.updatedAt);
    /* 舊檔案帶的 edition 欄位（A／B／C 客戶版本）已取消：只複製已知欄位，因此直接忽略，不報錯。 */
    p.units = takeStr(src, 'units', 'ping');
    if (['ping', 'm2'].indexOf(p.units) < 0) p.units = 'ping';

    var s = isObj(src.parcel) ? src.parcel : {};
    p.parcel.city = takeStr(s, 'city', '新北市');
    p.parcel.district = takeStr(s, 'district', '');
    p.parcel.section = takeStr(s, 'section', '');
    p.parcel.numbers = adoptNumbers(s, warn);
    p.parcel.zone = takeStr(s, 'zone', '住宅區');
    p.parcel.productType = takeStr(s, 'productType', 'auto');
    p.parcel.roadWidth = takeNumOrNull(s, 'roadWidth');
    if (p.parcel.roadWidth === 0) p.parcel.roadWidth = null;
    p.parcel.roadCount = takeNum(s, 'roadCount', 1);
    p.parcel.corner = takeBool(s, 'corner', false);
    p.parcel.frontageM = takeNumOrNull(s, 'frontageM');
    if (p.parcel.frontageM === 0) p.parcel.frontageM = null;
    p.parcel.siteWidth = takeNumOrNull(s, 'siteWidth');
    if (p.parcel.siteWidth === 0) p.parcel.siteWidth = null;
    p.parcel.siteDepth = takeNumOrNull(s, 'siteDepth');
    if (p.parcel.siteDepth === 0) p.parcel.siteDepth = null;
    p.parcel.northZone = takeStr(s, 'northZone', 'same');
    p.parcel.mrtDistanceM = takeNumOrNull(s, 'mrtDistanceM');
    if (p.parcel.mrtDistanceM === 0) p.parcel.mrtDistanceM = null;
    p.parcel.ownerCount = takeNum(s, 'ownerCount', 1);
    p.parcel.shareDenomMax = takeNum(s, 'shareDenomMax', 1);
    p.parcel.buildingAgeYears = takeNum(s, 'buildingAgeYears', 0);
    p.parcel.existingFloorM2 = takeNum(s, 'existingFloorM2', 0);
    p.parcel.hrStatus = takeStr(s, 'hrStatus', 'auto');
    p.parcel.deedText = takeStr(s, 'deedText', '');
    p.parcel.notes = takeStr(s, 'notes', '');

    s = isObj(src.m2) ? src.m2 : {};
    p.m2.manualFlags = takeMap(s, 'manualFlags');
    var cs = isObj(s.consent) ? s.consent : {};
    p.m2.consent = {
      owners: takeNum(cs, 'owners', 0),
      agreeOwners: takeNum(cs, 'agreeOwners', 0),
      shareAgree: takeNum(cs, 'shareAgree', 0)
    };
    p.m2.resolvedNotes = takeStr(s, 'resolvedNotes', '');

    s = isObj(src.m3) ? src.m3 : {};
    var ov = isObj(s.overrides) ? s.overrides : {};
    p.m3.overrides = { bcr: takeNumOrNull(ov, 'bcr'), far: takeNumOrNull(ov, 'far') };
    p.m3.manualChecks = takeMap(s, 'manualChecks');
    p.m3.setbackFrontM = takeNumOrNull(s, 'setbackFrontM');

    s = isObj(src.m4) ? src.m4 : {};
    p.m4.regime = takeStr(s, 'regime', 'AUTO');
    p.m4.picked = takeStrArr(s, 'picked', []);
    p.m4.pctOverrides = takeNumMap(s, 'pctOverrides');
    p.m4.tdrPct = takeNumOrNull(s, 'tdrPct');
    if (p.m4.tdrPct === 0) p.m4.tdrPct = null;

    s = isObj(src.m5) ? src.m5 : {};
    p.m5.exemptRatio = takeNumOrNull(s, 'exemptRatio');
    p.m5.sellRatio = takeNumOrNull(s, 'sellRatio');
    p.m5.publicRatio = takeNumOrNull(s, 'publicRatio');
    p.m5.avgUnitPing = takeNumOrNull(s, 'avgUnitPing');
    p.m5.basementPerStallM2 = takeNum(s, 'basementPerStallM2', 40);
    p.m5.floorHeightM = takeNumOrNull(s, 'floorHeightM');

    s = isObj(src.m6) ? src.m6 : {};
    p.m6.comps = adoptComps(s, warn);
    p.m6.compSource = takeStr(s, 'compSource', 'district');
    if (['district', 'custom'].indexOf(p.m6.compSource) < 0) p.m6.compSource = 'district';
    var sub = isObj(s.subject) ? s.subject : {};
    p.m6.subject = {
      ageYears: takeNum(sub, 'ageYears', 0), floor: takeNumOrNull(sub, 'floor'),
      areaPing: takeNumOrNull(sub, 'areaPing'), distanceM: takeNum(sub, 'distanceM', 0)
    };
    p.m6.presalePremium = takeNumOrNull(s, 'presalePremium');
    p.m6.absorbPerMonth = takeNumOrNull(s, 'absorbPerMonth');
    p.m6.manualUnitPricePing = takeNumOrNull(s, 'manualUnitPricePing');
    p.m6.parkingPricePerStall = takeNumOrNull(s, 'parkingPricePerStall');

    s = isObj(src.m7) ? src.m7 : {};
    p.m7.constructionKey = takeStr(s, 'constructionKey', 'auto');
    p.m7.constructionPerPingOverride = takeNumOrNull(s, 'constructionPerPingOverride');
    var m7nulls = ['landLTV', 'landRate', 'constLTV', 'constRate', 'sgaRate', 'marketingRate',
                   'designRate', 'taxRateOther', 'profitTaxRate', 'planMonths', 'buildMonths',
                   'handoverMonths', 'presaleStartMonth'];
    for (var i7 = 0; i7 < m7nulls.length; i7++) p.m7[m7nulls[i7]] = takeNumOrNull(s, m7nulls[i7]);

    s = isObj(src.m8) ? src.m8 : {};
    p.m8.targetIrr = takeNum(s, 'targetIrr', 0.15);
    p.m8.targetMargin = takeNum(s, 'targetMargin', 0.15);
    p.m8.scenario = takeStr(s, 'scenario', 'base');
    if (['opt', 'base', 'con'].indexOf(p.m8.scenario) < 0) p.m8.scenario = 'base';

    p.reviews = adoptReviews(src);
    p.overrides = takeNumMap(src, 'overrides');
    p.audit = adoptAudit(src);

    if (sch !== null && sch < 2) migrateV1(src, p, warn);
    return p;
  }

  /* ---- 第 1 版 → 第 2 版 ----
     第 1 版的幾個「預設值」本身就是錯誤數字的來源，舊專案帶著它們進新版會繼續算錯：
       m4 預設危老（綠建築＋耐震 12%），不管基地有沒有符合危老的建物；
       m6 預售溢價 8% 疊在成屋單價上，新版改用實價登錄的預售單價，再加 8% 就重複計算；
       m7 營建級距固定 rc25（17 萬元／坪），新版依產品與層數自動選 2026 年行情；
       m5、m6 的量體與去化參數是住宅的固定值，新版依產品類型自動帶入。
     只有「仍等於舊預設值」的欄位才換掉；使用者自己改過的值一律保留。*/
  function migrateV1(src, p, warn) {
    var s4 = isObj(src.m4) ? src.m4 : {}, s5 = isObj(src.m5) ? src.m5 : {}, s6 = isObj(src.m6) ? src.m6 : {};
    var s7 = isObj(src.m7) ? src.m7 : {}, changed = [];
    var picked = isArr(s4.picked) ? s4.picked.slice().sort().join(',') : '';
    if ((s4.regime === 'HR' || s4.regime === undefined) && (picked === 'GREEN,SEISMIC' || picked === '')) {
      p.m4.regime = 'AUTO'; p.m4.picked = []; changed.push('容積獎勵改為自動採用可行的最佳組合');
    }
    if (s6.presalePremium === 0.08 || s6.presalePremium === undefined) { p.m6.presalePremium = null; changed.push('預售溢價改為自動（預售樣本 0%）'); }
    if (s6.absorbPerMonth === 8 || s6.absorbPerMonth === undefined) p.m6.absorbPerMonth = null;
    if (isObj(s6.subject)) {
      if (s6.subject.floor === 8) p.m6.subject.floor = null;
      if (s6.subject.areaPing === 35) p.m6.subject.areaPing = null;
    }
    if (s6.useSampleComps === false && isArr(s6.comps) && s6.comps.length) p.m6.compSource = 'custom';
    else p.m6.compSource = 'district';
    if (['rc12', 'rc25', 'src25up', undefined].indexOf(s7.constructionKey) >= 0) { p.m7.constructionKey = 'auto'; changed.push('營建單價改為依產品與層數自動選 2026 年行情'); }
    var olds = { exemptRatio: 0.30, sellRatio: 0.95, publicRatio: 0.33, avgUnitPing: 35, floorHeightM: 3.2 }, k;
    for (k in olds) { if (hasOwnKey(olds, k) && (s5[k] === olds[k] || s5[k] === undefined)) p.m5[k] = null; }
    if (changed.length) warn.push('已依新版調整舊預設值：' + changed.join('；') + '。');
  }

  function hasOwnKey(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  /* ===================== 點號路徑存取 ===================== */

  function parsePath(path) {
    if (typeof path !== 'string' || path === '') return null;
    var parts = path.split('.'), out = [], i;
    for (i = 0; i < parts.length; i++) {
      if (parts[i] === '' || BAD_KEYS.indexOf(parts[i]) >= 0) return null;   // 擋掉原型污染
      out.push(parts[i]);
    }
    return out;
  }

  // get(p,'parcel.numbers.0.areaM2') → 值；路徑不存在回傳 undefined，不丟例外
  function get(p, path) {
    var parts = parsePath(path), cur = p, i;
    if (!parts || !isObj(p)) return undefined;
    for (i = 0; i < parts.length; i++) {
      if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  /* ------------------------------------------------------------------
     路徑白名單：這些節點底下的 key 是動態的（由使用者或引擎產生），
     不可能出現在 defaults() 裡，所以不檢查。其餘路徑一律要能在 defaults()
     的同層結構裡找到，否則視為打錯字。

     為什麼要檢查：data-bind 打錯一個字（m6.presalePremiumX）原本會靜默新增
     一個沒人讀的欄位，使用者以為改了、畫面卻毫無反應，連錯誤都沒有。
     這是「看起來有在算，其實沒有」的一種，違反原則一。
     ------------------------------------------------------------------ */
  var DYNAMIC_PATHS = [
    'overrides', 'reviews', 'audit',
    'm2.manualFlags', 'm3.manualChecks', 'm4.pctOverrides', 'm4.picked',
    'parcel.numbers', 'm6.comps'
  ];

  function isDynamicPrefix(parts, upto) {
    var i, j, pre;
    for (i = 0; i < DYNAMIC_PATHS.length; i++) {
      pre = DYNAMIC_PATHS[i].split('.');
      if (pre.length > upto) continue;
      for (j = 0; j < pre.length; j++) { if (parts[j] !== pre[j]) break; }
      if (j === pre.length) return true;
    }
    return false;
  }

  /* pathKnown(path) → true 代表這個路徑在 defaults() 的結構裡（或落在動態容器底下）。
     供 set() 與測試用；不丟例外。 */
  function pathKnown(path) {
    var parts = parsePath(path);
    if (!parts || !parts.length) return false;
    var d, i, k;
    try { d = defaults(); } catch (e) { return true; }      // 取不到預設結構就不擋
    for (i = 0; i < parts.length; i++) {
      k = parts[i];
      if (isDynamicPrefix(parts, i)) return true;            // 已進入動態容器，底下不檢查
      if (d === null || d === undefined || typeof d !== 'object') return false;
      if (isArr(d)) {
        if (!isIndexKey(k)) return false;
        d = d.length ? d[0] : undefined;                     // 用第 0 筆當樣板
        if (d === undefined) return true;                    // 空陣列：無樣板可比，放行
        continue;
      }
      if (!Object.prototype.hasOwnProperty.call(d, k)) return false;
      d = d[k];
    }
    return true;
  }

  // set(p,path,value[,at]) → 寫入、記 audit、更新 updatedAt、落地儲存，回傳 p
  function set(p, path, value, at) {
    var parts = parsePath(path);
    if (!isObj(p) || !parts) return p;
    /* 不在 defaults() 結構裡的路徑一律拒絕寫入，並留下一筆 audit，
       讓打錯的 data-bind 至少會留下痕跡，而不是靜默無效。 */
    if (!pathKnown(path)) {
      if (!isArr(p.audit)) p.audit = [];
      p.audit.push({ at: now(at), path: String(path),
        from: null, to: plainCopy(value, 0),
        warn: '路徑不在專案結構（TD.store.defaults()）內，已拒絕寫入。'
            + '通常是 data-bind 打錯字；請對照 SPEC 第 6 節的 project 結構。' });
      if (p.audit.length > AUDIT_MAX) p.audit = p.audit.slice(p.audit.length - AUDIT_MAX);
      return p;
    }
    var cur = p, i, k, from, last;
    for (i = 0; i < parts.length - 1; i++) {
      k = parts[i];
      if (cur[k] === null || cur[k] === undefined || typeof cur[k] !== 'object') {
        cur[k] = isIndexKey(parts[i + 1]) ? [] : {};      // 中途缺節點就依下一段是否為索引決定建陣列或物件
      }
      cur = cur[k];
    }
    last = parts[parts.length - 1];
    from = cur[last];
    if (sameValue(from, value)) return p;                  // 沒變就不留 audit
    cur[last] = value;
    if (!isArr(p.audit)) p.audit = [];
    p.updatedAt = now(at);
    p.audit.push({ at: p.updatedAt, path: path, from: plainCopy(from, 0), to: plainCopy(value, 0) });
    if (p.audit.length > AUDIT_MAX) p.audit = p.audit.slice(p.audit.length - AUDIT_MAX);
    persist(p);
    return p;
  }

  /* ===================== 專案清單操作 ===================== */

  function persist(p) {
    if (!isObj(p) || !p.id) return false;
    var all = readAll(), idx = indexOfId(all, p.id);
    if (idx >= 0) all[idx] = p; else all.push(p);
    return writeAll(all);
  }

  function list() {
    var all = readAll(), out = [], i;
    for (i = 0; i < all.length; i++) {
      out.push({ id: all[i].id, name: all[i].name, updatedAt: all[i].updatedAt });
    }
    out.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
    return out;
  }

  function load(id) {
    if (!id) return null;
    var all = readAll(), idx = indexOfId(all, id);
    return idx >= 0 ? all[idx] : null;                      // 回傳快取內的同一個物件，UI 改它即改到儲存的那份
  }

  function save(p, at) {
    if (!isObj(p)) return null;
    if (!p.id) p.id = newId();
    p.updatedAt = now(at);
    persist(p);
    return p;
  }

  function create(name, at) {
    var p = defaults();
    p.name = (typeof name === 'string' && name) ? name : ('新專案 ' + (readAll().length + 1));
    p.createdAt = now(at);
    p.updatedAt = p.createdAt;
    persist(p);
    setCurrent(p.id);
    return p;
  }

  function remove(id) {
    var all = readAll(), idx = indexOfId(all, id);
    if (idx < 0) return false;
    all.splice(idx, 1);
    writeAll(all);
    if (readCurrentId() === id) writeCurrentId(all.length ? all[0].id : '');
    return true;
  }

  function duplicate(id, at) {
    var src = load(id);
    if (!src) return null;
    var copy = adopt(src, []);
    copy.id = newId();
    copy.name = (src.name || '未命名') + '（複本）';
    copy.createdAt = now(at);
    copy.updatedAt = copy.createdAt;
    persist(copy);
    return copy;
  }

  function setCurrent(id) {
    writeCurrentId(id || '');
    return readCurrentId();
  }

  function currentId() { return readCurrentId(); }

  // 目前專案；完全沒有資料時以 sample() 建立一份示範專案
  function current() {
    var id = readCurrentId(), p = id ? load(id) : null;
    if (p) return p;
    var all = readAll();
    if (all.length) { setCurrent(all[0].id); return all[0]; }
    var s = sample();
    persist(s);
    setCurrent(s.id);
    return s;
  }

  /* ===================== 匯出入 ===================== */

  function exportJSON(p) {
    try { return JSON.stringify(p || current(), null, 2); } catch (e) { return '{}'; }
  }

  function exportAllJSON() {
    try { return JSON.stringify(readAll(), null, 2); } catch (e) { return '[]'; }
  }

  // 吃單一專案物件、專案陣列，或 {projects:[...]} 包裝；回傳 {ok,count,ids,names,warnings,error}
  function importJSON(text) {
    var res = { ok: false, count: 0, ids: [], names: [], warnings: [], error: null };
    if (typeof text !== 'string' || text.replace(/^\s+|\s+$/g, '') === '') {
      res.error = '匯入內容為空'; return res;
    }
    var data;
    try { data = JSON.parse(text); } catch (e) {
      res.error = 'JSON 格式錯誤：' + ((e && e.message) ? e.message : '無法解析'); return res;
    }
    var rows = [];
    if (isArr(data)) rows = data;
    else if (isObj(data) && isArr(data.projects)) rows = data.projects;
    else if (isObj(data)) rows = [data];
    if (!rows.length) { res.error = '檔案內沒有可匯入的專案'; return res; }

    var all = readAll(), i, w, p;
    for (i = 0; i < rows.length && i < 200; i++) {
      if (!isObj(rows[i])) { res.warnings.push('第 ' + (i + 1) + ' 筆不是物件，已略過'); continue; }
      w = [];
      /* 任意物件都被 adopt() 補成合法專案，所以 {"foo":1} 也會「匯入成功」。
         那會讓使用者以為匯入了自己的案子，其實拿到一份全新的空專案。
         必要節點一個都沒有時直接判定不是本系統的專案檔。 */
      if (!isObj(rows[i].parcel) && !isObj(rows[i].m8) && !isObj(rows[i].m7)
          && !isObj(rows[i].m6) && !isObj(rows[i].m5)) {
        res.warnings.push('第 ' + (i + 1) + ' 筆缺少 parcel／m5／m6／m7／m8 全部的節點，'
          + '不像本系統匯出的專案檔，已略過（若確定要匯入請先補上 parcel 節點）。');
        continue;
      }
      if (!isObj(rows[i].parcel)) {
        w.push('缺少 parcel 節點（地號、面積、分區），已以預設值補齊，匯入後必須重新輸入基地資料');
      }
      p = adopt(rows[i], w);
      if (indexOfId(all, p.id) >= 0) {                       // id 撞號就改號，不覆蓋既有專案
        res.warnings.push('專案「' + (p.name || p.id) + '」的 id 與既有專案重複，已另存為新專案');
        p.id = newId();
      }
      if (!p.name) p.name = '匯入專案 ' + (i + 1);
      if (w.length) res.warnings.push('專案「' + p.name + '」：' + w.join('；'));
      all.push(p);
      res.ids.push(p.id);
      res.names.push(p.name);
      res.count++;
    }
    writeAll(all);
    if (res.count) { res.ok = true; setCurrent(res.ids[0]); }
    else if (!res.error) res.error = '沒有任何一筆可以匯入';
    return res;
  }

  /* ===================== 示範專案 ===================== */

  /* 擬真第一類土地暨建物登記謄本（示範用，非真實謄本）。
     前提：使用者或其客戶本人持證件到地政事務所臨櫃申請第一類謄本，
     因此含完整所有權人姓名、住址與他項權利債權額；本系統不連網、不代為查調。
     內容刻意含「權利範圍 48分之7」「公同共有」「抵押權」與海外住址，供 M1 解析與 M2 旗標偵測取用；
     不含查封／假扣押／假處分／預告登記字樣，避免示範案被誤判為限制登記。 */
  function sampleDeedText() {
    var L = [];
    L.push('（示範用，非真實謄本。以下為模擬第一類土地暨建物登記謄本之格式與用語，地號、姓名、住址、金額均為虛構，僅供介面與解析測試。）');
    L.push('本謄本係申請人持身分證明文件親自向地政事務所臨櫃申請之第一類謄本，含所有權人完整姓名、住址及他項權利債權額。本系統不連網、不代為查調。');
    L.push('');
    L.push('臺北市大安區大安段三小段　土地登記第一類謄本');
    L.push('列印時間：民國115年09月20日10時24分　　資料管轄機關：臺北市大安地政事務所');
    L.push('');
    L.push('【土地標示部】');
    L.push('登記日期：民國072年03月15日　　登記原因：分割轉載');
    L.push('地　　號：大安段三小段 0123-0000');
    L.push('面　　積：418.00 平方公尺');
    L.push('都市計畫使用分區：第三種商業區（商三）');
    L.push('公告土地現值：每平方公尺 新臺幣 1,050,000 元（115年01月）');
    L.push('地上建物建號：大安段三小段 01234-000');
    L.push('');
    L.push('登記日期：民國072年03月15日　　登記原因：分割轉載');
    L.push('地　　號：大安段三小段 0124-0000');
    L.push('面　　積：242.00 平方公尺');
    L.push('都市計畫使用分區：第三種商業區（商三）');
    L.push('公告土地現值：每平方公尺 新臺幣 1,020,000 元（115年01月）');
    L.push('');
    L.push('【土地所有權部】（大安段三小段 0123-0000）');
    L.push('（1）登記次序：0001　　登記原因：買賣　　登記日期：民國081年11月03日');
    L.push('　　所有權人：王大明');
    L.push('　　統一編號：A128');
    L.push('　　住　　址：臺北市大安區信義路四段○○號5樓');
    L.push('　　權利範圍：2分之1');
    L.push('（2）登記次序：0002　　登記原因：繼承　　登記日期：民國104年06月18日');
    L.push('　　所有權人：王美玲');
    L.push('　　住　　址：臺北市大安區復興南路二段○○號12樓之3');
    L.push('　　權利範圍：4分之1');
    L.push('（3）登記次序：0003　　登記原因：贈與　　登記日期：民國097年02月27日');
    L.push('　　所有權人：林淑芬');
    L.push('　　住　　址：新北市板橋區文化路一段○○號8樓');
    L.push('　　權利範圍：4分之1');
    L.push('');
    L.push('【土地所有權部】（大安段三小段 0124-0000）');
    L.push('（1）登記次序：0001　　登記原因：買賣　　登記日期：民國086年09月12日');
    L.push('　　所有權人：陳文雄');
    L.push('　　住　　址：臺北市大安區和平東路三段○○號3樓');
    L.push('　　權利範圍：48分之7');
    L.push('（2）登記次序：0002　　登記原因：繼承　　登記日期：民國099年04月08日');
    L.push('　　所有權人：陳李秀英　（公同共有）');
    L.push('　　公同共有人：陳李秀英、陳建宏');
    L.push('　　住　　址：臺北市大安區和平東路三段○○號3樓');
    L.push('　　權利範圍：公同共有 48分之17');
    L.push('　　其他登記事項：繼承登記未完全辦竣，公同共有關係尚未消滅');
    L.push('（3）登記次序：0003　　登記原因：買賣　　登記日期：民國092年12月01日');
    L.push('　　所有權人：張志偉');
    L.push('　　住　　址：1500 Wilshire Blvd, Los Angeles, CA 90017, U.S.A.（美國加利福尼亞州）');
    L.push('　　權利範圍：48分之24');
    L.push('');
    L.push('【土地他項權利部】');
    L.push('登記次序：0001-000　　權利種類：抵押權　　登記日期：民國108年05月06日');
    L.push('　　權利人：○○商業銀行股份有限公司');
    L.push('　　債務人兼義務人：王大明');
    L.push('　　擔保債權總金額：新臺幣 36,000,000 元整');
    L.push('　　擔保債權種類及範圍：金錢借貸契約、票據、保證');
    L.push('　　存續期間：不定期　　清償日期：依各個契約約定');
    L.push('　　設定權利範圍：王大明所有 2分之1');
    L.push('　　共同擔保地號：大安段三小段 0123-0000、0124-0000');
    L.push('');
    L.push('【建物登記第一類謄本　建物標示部】');
    L.push('建　　號：大安段三小段 01234-000');
    L.push('基地坐落：大安段三小段 0123-0000');
    L.push('建物門牌：臺北市大安區信義路四段○○號');
    L.push('主要用途：商業用　　主要建材：鋼筋混凝土造');
    L.push('層　　數：地上5層、地下1層');
    L.push('建築完成日期：民國073年07月12日（至115年約屋齡42年）');
    L.push('總面積：1,180.60 平方公尺');
    L.push('');
    L.push('限制登記事項：無。');
    L.push('（謄本到此結束）');
    return L.join('\n');
  }

  /* 示範專案：臺北市大安區、商三、660 平方公尺（兩筆地號）、臨 12 米路、角地、
     既有建物屋齡 42 年、所有權人 6 人、最大持分分母 48。基地 22m × 30m。
     售價以大安區實價登錄預售屋行情推估，營建與融資用 2026 年行情。*/
  function sample(at) {
    var p = defaults();
    var t = now(at);
    p.name = '示範案：臺北市大安區 商三 660 ㎡（兩筆地號）';
    p.createdAt = t;
    p.updatedAt = t;
    p.units = 'ping';

    p.parcel.city = '臺北市';
    p.parcel.district = '大安區';
    p.parcel.section = '大安段三小段';
    p.parcel.numbers = [
      { no: '0123-0000', areaM2: 418.00, share: '1/1' },
      { no: '0124-0000', areaM2: 242.00, share: '7/48' }
    ];
    p.parcel.zone = '商三';
    p.parcel.roadWidth = 12;
    p.parcel.roadCount = 2;          // 角地，兩面臨路
    p.parcel.corner = true;
    p.parcel.siteWidth = 22;
    p.parcel.siteDepth = 30;
    p.parcel.ownerCount = 6;
    p.parcel.shareDenomMax = 48;
    p.parcel.buildingAgeYears = 42;
    p.parcel.existingFloorM2 = 1180.60;
    p.parcel.deedText = sampleDeedText();
    p.parcel.notes = '示範資料。基地面積、臨路寬度、既有建物面積均取自上方模擬謄本，正式評估前須以地政事務所核發之最新謄本與地籍圖逐筆核對。';

    // 同意門檻：6 人中 4 人同意、應有部分合計 62%（土地法第34條之1第1項的兩條路徑都要看）
    p.m2.consent = { owners: 6, agreeOwners: 4, shareAgree: 0.62 };
    p.m2.resolvedNotes = '公同共有與海外共有人尚未處理，示範用途請勿視為已排除。';

    p.m4.regime = 'AUTO';                                // 自動採用可行的最佳組合（屋齡 42 年，危老可行）
    p.m4.picked = [];
    p.m4.tdrPct = null;

    p.m6.compSource = 'district';                        // 臺北市大安區實價登錄（預售屋）
    p.m6.subject = { ageYears: 0, floor: null, areaPing: null, distanceM: 0 };

    p.m7.constructionKey = 'auto';
    p.m8.targetIrr = 0.15;
    p.m8.targetMargin = 0.15;
    p.m8.scenario = 'base';
    return p;
  }

  /* ===================== 對外介面 ===================== */

  store.defaults = defaults;
  store.sample = sample;
  store.sampleDeedText = sampleDeedText;
  store.list = list;
  store.load = load;
  store.current = current;
  store.currentId = currentId;
  store.save = save;
  store.create = create;
  store.remove = remove;
  store.duplicate = duplicate;
  store.setCurrent = setCurrent;
  store.get = get;
  store.set = set;
  store.exportJSON = exportJSON;
  store.exportAllJSON = exportAllJSON;
  store.importJSON = importJSON;
  store.adopt = adopt;              // 供匯入與相容處理使用；只複製已知欄位
  store.pathKnown = pathKnown;      // 供 UI 與測試檢查 data-bind 路徑是否存在

  TD.store = store;
})(window.TD);
