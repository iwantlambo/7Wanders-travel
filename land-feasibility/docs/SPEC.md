# 建置契約 SPEC.md

這份檔案是**唯一權威**。所有程式檔案必須照這裡的介面寫，不得自行更改欄位名稱、函式簽章或檔案位置。
若覺得契約有錯，照契約寫完，另在 `docs/NOTES-<你的檔名>.md` 留下疑問，不要擅自改。

術語一律繁體中文。程式碼註解繁體中文，識別字英文。

---

## 0. 產品定位（寫程式前先讀）

**輸入一個地號，輸出「這塊地我最多能出多少錢」，以及這個數字的信心區間與風險標記。**

現況是開發部要花三到七天、跨建築師與財務兩邊，好地在這段時間內早被搶走。目標是壓到幾小時內給出可決策的初判。速度在這個產業直接等於錢。

三條設計原則，違反任何一條的程式碼都不可接受：

1. **不對稱精度陷阱**：九成正確在這個領域不是好成績，是危險。漏掉一條但書、一塊畸零地，就可能讓幾億的案子做錯決策。因此介面必須是「標示不確定、強制人工複核」，不是給一個乾淨的答案。每個數字旁邊掛信心等級與法源出處。這是產品規格，不是加分項。
2. **護城河在髒活不在模型**：資料層要寫得讓人容易逐條擴充與查證，不是寫得聰明。
3. **利益衝突是架構問題不是承諾問題**：系統**完全在使用者的瀏覽器內運算，不連任何伺服器、不發任何網路請求**。這是架構層面的保證，也是建商版唯一能成立的形式。

---

## 1. 執行環境（硬性限制，違反即不可用）

1. **純靜態**：沒有建置步驟、沒有 npm、沒有打包器。使用者解壓縮後可直接雙擊 `index.html` 開啟，也可整包上傳任何靜態主機。
2. **不可使用 ES Module**（`import` / `export` / `type="module"`），因為 `file://` 下會被 CORS 擋掉。一律用傳統 `<script>` 與全域命名空間。
3. **不可使用 `fetch()` 讀取本地 JSON**，同上理由。所有資料以 `.js` 檔寫成，直接掛到 `window.TD.data`。
4. **不可引入任何外部 CDN**（字型、圖表庫、框架一律不用）。圖表用手寫 inline SVG。
5. **完全離線：整個專案不得出現任何 `fetch`、`XMLHttpRequest`、`WebSocket`、`navigator.sendBeacon` 或第三方 script。** 唯一允許的對外連結是 `<a href>` 的法規查詢連結，且必須由使用者自己點。
6. **語法限 ES5 風格**：`var` / `function`，不要用箭頭函式、`let`/`const`、樣板字串、解構、`class`、選擇性鏈結。全檔一致。字串串接用 `+`。
7. **引擎層（`js/engine/*.js`）必須是純函式**：不得觸碰 `document`、`localStorage`、`alert`。只吃資料、吐資料。這是為了能在 Node 下測試。
8. UI 層（`js/ui/*.js`）才可以碰 DOM。
9. 每個檔案結尾必須能通過 `node --check <file>`。

檔案開頭一律：

```js
/* <一行中文說明> */
window.TD = window.TD || {};
(function (TD) {
  'use strict';
  // ...
})(window.TD);
```

---

## 2. 已經寫好、不要重寫的檔案

| 檔案 | 提供 |
|---|---|
| `js/lib/fmt.js` | `TD.PING`、`TD.fmt.{n,pct,money,moneyParts,moneyWan,area,areaNum,areaUnit,unitPrice,months,dateStr,esc,m2ToPing,pingToM2}` |
| `js/lib/value.js` | `TD.V(key,value,conf,src,formula,note)`、`TD.isV`、`TD.raw`、`TD.collectValues`、`TD.needsReview`、`TD.LEVELS` |
| `js/lib/math.js` | `TD.math.{sum,mean,sd,clamp,round,quantile,solveLinear,ols,npv,irrMonthly,annualize,bisect,sCurve,absorption}` |
| `index.html` | 版面骨架與 script 載入順序（新增檔案必須同步加進去） |
| `assets/app.css` | 全部樣式類別，見第 8 節 |

`TD.math.ols(X, y)` 回傳 `{beta, r2, adjR2, se, n, p, predict(row)}`，樣本不足或共線時回傳 `null`。
`TD.math.bisect(f, lo, hi, target)` 在 `f(lo)-target` 與 `f(hi)-target` 同號時回傳 `null`。
`TD.math.irrMonthly(flows)` 吃月現金流陣列（`flows[0]` 在 t=0），回傳月報酬率或 `null`；再用 `TD.math.annualize()` 年化。

---

## 3. 數值包裝 V()

**所有要顯示給使用者看的數字，一律用 `TD.V()` 包起來。** 這是原則一的技術實作，不是可選項。

```js
TD.V('m3.far', 5.6, 'unv', '臺北市土地使用分區管制自治條例 第10條',
     '容積率 = 分區種子資料查表', '種子資料尚未與法規原文逐字核對');
```

- `key`：全域唯一，格式 `模組.欄位`，例如 `m3.far`、`m6.unitPrice`、`m8.landCap`。UI 用它做複核紀錄與抽屜錨點。
- `conf`：`'high'` | `'mid'` | `'low'` | `'unv'`（待查證）| `'input'`（使用者輸入）。
- `src`：法源或資料來源，寫得出條號就寫條號。
- `formula`：算式文字，讓複核者能手算驗證。
- `note`：要人工注意什麼。

取值一律 `TD.raw(x)`，它對包裝值與裸數字都安全。

**信心等級的判準**（請照此標，不要全部寫 `mid`）：
- `high`：法規明文的固定數字、或使用者剛輸入的硬資料。
- `mid`：由公開資料以穩定方法推算。
- `low`：假設驅動、樣本不足、對輸入高度敏感。
- `unv`：本專案附的種子資料，尚未與官方來源核對過。**所有 `js/data/*.js` 內的法規數值預設都是 `unv`。**

---

## 4. 全域命名空間

```
TD.fmt / TD.V / TD.raw / TD.math                          已完成
TD.data.zoning / bonus / cost / comps / laws / editions   第 5 節
TD.store                                                  第 6 節
TD.engine.m1..m8 / TD.engine.edition / TD.engine.run      第 7 節
TD.ui.* / TD.views / TD.actions / TD.present              第 8 節
```

---

## 5. 資料層契約（`js/data/*.js`）

每個檔案把資料掛上 `TD.data.<名稱>`，並附 `_meta`：

```js
TD.data.zoning = {
  _meta: { title:'臺北市土地使用分區管制 種子資料', asOf:'2026-09-26', verified:false,
           source:'臺北市土地使用分區管制自治條例', note:'上線前須逐條核對，見 docs/DATA-VERIFICATION.md' },
  cities: { ... }
};
```

### 5.1 `TD.data.zoning`（`js/data/zoning.js`）

僅先做**臺北市**（MVP 的窄切決定），另留一個 `_template` 供擴充。

```js
cities: {
  '臺北市': {
    lawName: '臺北市土地使用分區管制自治條例',
    zones: {
      '住三': { name:'第三種住宅區', bcr:0.45, far:2.25, article:'第9條、第10條',
                use:['住宅'], minLotM2:null, verified:false },
      ...
    },
    // 畸零地：正面路寬區間 → 最小寬度/深度
    oddLot: { lawName:'臺北市畸零地使用規則', rows:[{roadWidthMax:7, minWidth:3.0, minDepth:12.0}, ...], verified:false },
    parking: { lawName:'臺北市建築管理自治條例', residentialPerM2:150, note:'...', verified:false },
    setback: { frontM:null, note:'退縮依細部計畫與都市設計審議，無圖資無法計算', verified:false }
  },
  '_template': { ...空殼，每個欄位都用說明字串標明要填什麼... }
}
```

必須涵蓋的臺北市分區代碼（值一律 `verified:false`）：
住一、住二、住二之一、住二之二、住三、住三之一、住三之二、住四、住四之一、商一、商二、商三、商四。
每個分區都要填 `article` 欄（條號），填不出來就寫 `'待查'`。**寧可寫 `'待查'` 也不要編一個條號。**

### 5.2 `TD.data.bonus`（`js/data/bonus.js`）

```js
_meta: { ..., tdrCapOfBase:0.30 },
regimes: [{
  id:'UR', name:'都市更新', lawName:'都市更新條例', article:'第65條',
  capOfBase:0.50,            // 獎勵上限占基準容積的比例
  altCapNote:'或原建築容積加基準容積之一定比例，以較高者',
  prereq:{ minSiteM2:1000, minAgeYears:30, consentNote:'需法定同意比例' },
  baseMonths:36, baseRisk:'high', allows:['GREEN','SMART','SEISMIC','BARRIER','SCALE','PUBLIC','TDR'],
  verified:false
}, { id:'HR', name:'危老重建', ..., capOfBase:0.30, ... },
   { id:'NONE', name:'不走更新／危老', capOfBase:0, allows:['OPEN','TOD','TDR'] }]

bonuses: [{
  id:'GREEN', name:'綠建築', lawName:'...', article:'待查',
  pctMin:0.02, pctTypical:0.06, pctMax:0.10,   // 占基準容積
  bucket:'regime',           // 'regime' 算進 regime.capOfBase；'tdr' 走自己的上限；'outside' 不受上限
  costType:'design',         // 'none'|'design'|'purchase'|'donation'
  costPerGainedPing:0,       // 元／每增加一坪可售
  costRateOfPrice:0,         // 取得成本＝售價 × 此比率 × 增加坪數
  monthsAdd:3, risk:'low',
  requires:{ regimes:['UR','HR'], minSiteM2:0, minAgeYears:0 },
  tradeoff:'設計與認證成本，需維護',
  verified:false
}, ...]
```

必含 id：`GREEN` 綠建築、`SMART` 智慧建築、`SEISMIC` 耐震設計、`BARRIER` 無障礙、`SCALE` 基地規模、`PUBLIC` 協助取得公益設施（`costType:'donation'`）、`OPEN` 開放空間／綜合設計、`TOD` 大眾運輸導向、`TDR` 容積移轉（`bucket:'tdr'`、`costType:'purchase'`）、`TIME` 時程獎勵（`requires.regimes:['HR']`，備註逐年遞減須查當年度）。

### 5.3 `TD.data.cost`（`js/data/cost.js`）

```js
construction: { // 元／坪（地上樓地板）
  rows:[{id:'rc12', label:'RC 12層以下 住宅', perPing:, low:, high:},
        {id:'rc25', label:'RC 13～25層 住宅', ...},
        {id:'src25up', label:'SRC 26層以上', ...}],
  basementPerPing:, demolitionPerPing:, verified:false,
  source:'政府電子採購網決標資料（待接）'
},
parkingPricePerStall: 2500000,
finance: { landLTV:0.5, landRate:0.028, constLTV:0.7, constRate:0.026, verified:false },
soft: { sgaRate:0.03, marketingRate:0.05, designRate:0.025, taxRateOther:0.01, profitTaxRate:0.20, verified:false },
schedule: { planMonths:12, buildMonths:30, handoverMonths:6, presaleStartMonth:9, verified:false },
priceIndex: { asOf:'', value:null, source:'主計總處營造工程物價指數（待接）' }
```

### 5.4 `TD.data.comps`（`js/data/comps.js`）

14 筆左右的**合成範例**交易，欄位：
`{ id, addr, district, unitPricePing, areaPing, ageYears, floor, totalFloors, distanceM, year, type }`
`_meta.synthetic = true`，且 `_meta.note` 必須明寫「此為合成示範資料，非真實實價登錄，僅供介面演示，使用前請匯入真實資料」。

### 5.5 `TD.data.laws`（`js/data/laws.js`）

```js
TD.data.laws = {
  'BUILD_TECH': { name:'建築技術規則建築設計施工編', url:null },
  'LAND_ACT_34_1': { name:'土地法 第34條之1', url:null },
  ...
};
TD.data.lawLink = function (name) {
  return 'https://law.moj.gov.tw/Index.aspx';  // 官方入口，不捏造深連結
};
```
不要捏造官方深連結；`url` 一律先給 `null`。`lawLink()` 回傳全國法規資料庫首頁即可，UI 另外提供「複製法規名稱」按鈕。

### 5.6 `TD.data.editions`（`js/data/editions.js`）

```js
TD.data.editions = {
  order:['A','B','C'],
  A:{ id:'A', name:'地主與仲介版', who:'土地所有權人、仲介、地政士',
      pitch:'你這塊地到底值多少', headline:'土地合理價值區間',
      headlinePath:'ed.A.valueHi', conflict:'無', price:'低，需要量',
      judgement:'道德上站得住，資訊不對稱極大',
      modules:['overview','m1','m2','m3','m5','m6','edA','report','settings'],
      disclaimer:'...', slides:[...] },
  B:{ ..., headline:'擔保價值與可貸額度', headlinePath:'ed.B.securityValue',
      conflict:'無，銀行與估價師是中立方', price:'高，需求穩定', judgement:'建議起點',
      modules:['overview','m1','m2','m3','m4','m5','m6','m7','m8','edB','report','settings'] },
  C:{ ..., headline:'土地出價上限', headlinePath:'ed.C.bidCap',
      conflict:'可能致命', price:'最高', judgement:'痛點最強，但賣方身分是問題',
      modules:[全部] }
};
```
`slides` 見第 8.5 節。

---

## 6. 專案資料結構與 `TD.store`（`js/lib/store.js`）

```js
TD.store.defaults()      // 回傳一個全新的 project 物件
TD.store.list()          // [{id,name,updatedAt,edition}]
TD.store.load(id)
TD.store.current()       // 目前 project（無則以 sample() 建立）
TD.store.save(p)
TD.store.create(name)
TD.store.remove(id)
TD.store.duplicate(id)
TD.store.setCurrent(id)
TD.store.get(p, path)            // 'm6.presalePremium' → 值
TD.store.set(p, path, value)     // 寫入並記 audit，回傳 p
TD.store.exportJSON(p) / TD.store.exportAllJSON() / TD.store.importJSON(text)
TD.store.sample()        // 填好的示範專案：臺北市大安區、商三、660 ㎡、臨 12 米路
```
localStorage key：`tdev.v1.projects`、`tdev.v1.current`。讀寫一律包 try/catch，失敗時退回記憶體模式並設 `TD.store.persistent = false`。

### project 結構（權威）

```js
{
  id:'p_xxx', name:'', createdAt:0, updatedAt:0, schema:1,
  edition:'C', units:'ping',
  parcel:{ city:'臺北市', district:'', section:'', numbers:[{no:'',areaM2:0,share:'1/1'}],
           zone:'商三', roadWidth:0, roadCount:1, corner:false, siteWidth:0, siteDepth:0,
           ownerCount:1, shareDenomMax:1, buildingAgeYears:0, existingFloorM2:0,
           deedText:'', notes:'' },
  m2:{ manualFlags:{}, consent:{ owners:0, agreeOwners:0, shareAgree:0 }, resolvedNotes:'' },
  m3:{ overrides:{ bcr:null, far:null }, manualChecks:{} },
  m4:{ regime:'HR', picked:['GREEN','SEISMIC'], pctOverrides:{}, tdrPct:0 },
  m5:{ exemptRatio:0.30, sellRatio:0.95, publicRatio:0.33, avgUnitPing:35,
       basementPerStallM2:40, floorHeightM:3.2 },
  m6:{ comps:[], useSampleComps:true, subject:{ ageYears:0, floor:8, areaPing:35, distanceM:0 },
       presalePremium:0.08, absorbPerMonth:8, manualUnitPricePing:null },
  m7:{ constructionKey:'rc25', constructionPerPingOverride:null,
       landLTV:null, landRate:null, constLTV:null, constRate:null,
       sgaRate:null, marketingRate:null, designRate:null, taxRateOther:null, profitTaxRate:null,
       planMonths:null, buildMonths:null, handoverMonths:null, presaleStartMonth:null },
  m8:{ targetIrr:0.15, targetMargin:0.15, scenario:'base' },
  reviews:{},          // key → { status:'done', at:0, by:'', note:'' }
  overrides:{},        // V.key → 使用者覆寫的數值
  audit:[]             // {at, path, from, to}
}
```

`m7` 裡凡是 `null` 的欄位，引擎一律回落到 `TD.data.cost` 的預設值（`null` 代表「沿用預設」，不是 0）。

**覆寫機制**：引擎各模組**不需要**自己處理覆寫。`TD.engine.run` 最後會走訪整棵結果樹，若 `p.overrides[key]` 存在，就把該 V 的 `v` 換成它、`conf` 改為 `'input'`、`note` 前面加「使用者覆寫，原值 X」。

---

## 7. 引擎契約（`js/engine/*.js`）

每個模組簽章一致：`TD.engine.mN(p, ctx)` → 回傳該模組的結果物件（純資料）。`ctx` 是目前為止累積的結果。

`TD.engine.run(p)`（`js/engine/pipeline.js`）依序呼叫 m1→m2→m3→m4(粗估)→m5→m6→m4(重算)→m7→m8→edition，組出 `ctx`，最後套用 `p.overrides`、算出 `ctx.gate`、回傳 `ctx`。

任何一個模組丟出例外時，`run` 必須捕捉，把 `ctx.mN = { error:'訊息' }`，並繼續跑後面的模組，絕不讓整個畫面掛掉。

### 各模組輸出（欄位名稱不可改；標 `V` 者必須是 `TD.V` 包裝值）

**m1 土地基本資訊**
`{ areaM2:V, areaPing:V, parcelCount:V, city, district, zoneCode, zoneName, roadWidth:V, corner, siteWidth, siteDepth, ownerCount:V, shareDenomMax:V, completeness:{score, missing:[]}, deed:{parsed, found:{}, unparsed:[]}, warnings:[] }`

另外提供 `TD.engine.parseDeed(text)` → `{ numbers:[{no,areaM2,share}], owners:[{name,share,addr}], rights:[{type,holder,amount}], zone, found:{}, unparsed:[] }`。

**謄本來源前提**：本系統假設使用者（或其客戶）**本人親自到地政事務所申請第一類土地與建物登記謄本**，因此文字含完整所有權人姓名、住址與他項權利（含債權額）。系統不連網、不代為查調。解析一律純正則。
要抓的欄位：地號、面積（`\d[\d,]*\.?\d*\s*平方公尺`）、權利範圍（`(\d+)分之(\d+)` 或 `全部`）、所有權人姓名、住址、登記原因、他項權利種類（抵押權、地上權、典權、耕作權、不動產役權）與限制登記（查封、假扣押、假處分、預告登記）、債權額。抓不到的欄位放進 `unparsed`，**不要猜**。

**m2 產權地雷**
`{ level:'red'|'amber'|'green', flags:[{ id, label, level, reason, resolvable, advice, law }], consent:{ ownerRatio, shareRatio, byHalf, byTwoThirds, pass, method, needOwners, needShare }, summary:V, blocked }`

旗標偵測規則（吃 `parcel.deedText` 與 m1 解析結果）：
- `ancestral` 祭祀公業／神明會：名稱含「祭祀公業」「神明會」「管理人」→ 紅
- `intestate` 未辦繼承：含「公同共有」或（含「繼承」且所有權人 > 3）→ 紅
- `japanese` 日治時期名義人：含「昭和」「大正」「明治」或日文假名 → 紅
- `overseas` 海外共有人：住址含國名或英文地址 → 黃
- `fragmented` 持分細碎：`shareDenomMax >= 1000` 或 `ownerCount >= 10` → 黃
- `encumbrance` 限制登記：查封／假扣押／假處分／預告登記 → 紅；單純抵押權 → 綠但註記
- 無任何旗標 → 綠

同意門檻依**土地法第34條之1第1項**：共有人數過半且應有部分合計過半；或應有部分合計逾三分之二者，人數不計。此條文 `conf:'high'`，其餘旗標 `conf:'low'`。

**m3 法規檢討**
`{ bcr:V, far:V, buildAreaM2:V, baseFloorM2:V, zoneSource, checks:[{ id, label, status:'pass'|'fail'|'manual'|'na', value, requirement, law, note, conf }], blockers:[], manualCount }`

必做檢核 id：`oddLot` 畸零地、`roadWidth` 臨路寬度、`setback` 退縮、`heightRatio` 高度比、`sunlight` 日照、`fireGap` 防火間隔、`parking` 停車。
**凡是無圖資就無法真正算出的（日照、防火間隔、退縮細節、細部計畫但書），status 一律 `'manual'`，並在 `note` 寫明需要什麼資料才算得出來。不准假裝算得出來。**

**m4 容積獎勵組合最佳化**
`{ options:[{ id, regimeId, regimeName, itemIds, items:[{id,name,pct,costTotal,monthsAdd,risk,law,tradeoff}], pctRaw, pct, capped, capNote, tdrPct, bonusFloorM2, totalFloorM2, costTotal, monthsAdd, riskScore, gainPing, netGain }], best, chosen, pct:V, bonusFloorM2:V, totalFloorM2:V, notes:[] }`

演算法：對每個 regime 列舉其 `allows` 的所有子集合（先以 `requires` 過濾），`pctRaw` = 各項 `pctTypical`（或 `p.m4.pctOverrides[id]`）之和；`bucket:'regime'` 的部分以 `regime.capOfBase` 封頂，`bucket:'tdr'` 以 `_meta.tdrCapOfBase` 另計，`outside` 不封頂。
`netGain` = 增加可售坪 × 預估單價 − 取得成本 − 時程成本（`monthsAdd` × 總成本 × 年利率 ÷ 12）。依 `netGain` 由大到小排序。`best` 取第一名；`chosen` 取 `p.m4.regime` ＋ `p.m4.picked` 對應那一組（找不到就等於 `best`）。
第一次呼叫時 `ctx.m6` 尚不存在，單價用 `TD.data.cost` 的保守預設；pipeline 會在 m6 之後再呼叫一次覆蓋。

**m5 量體試算**
`{ volFloorM2:V, exemptFloorM2:V, grossFloorM2:V, basementM2:V, sellablePing:V, mainPing:V, publicRatio:V, unitsCount:V, stalls:V, floorsAbove:V, heightM:V, notes:[], legalWarning }`
`legalWarning` 固定為：「本項為初步判斷，不具法律效力，須由開業建築師簽證。本系統賣的是『值不值得找建築師』，不是『不用找建築師』。」
所有 V 的 `conf` 不得高於 `'low'`。

**m6 收入模型**
`{ method:'hedonic'|'weighted'|'manual', n, r2, unitPricePing:V, loPing:V, hiPing:V, presalePricePing:V, salesRevenue:V, parkingRevenue:V, totalSales:V, absorbMonths:V, drivers:[{name,coef,effect}], comps:[], notes:[] }`

樣本 `n >= 8` 且 `TD.math.ols` 非 null 時走 hedonic（`y = ln(單價)`，自變數 `ageYears`、`floor`、`areaPing`、`distanceM`），區間取 `exp(pred ± 1.96 × se)`；否則走加權比價（屋齡、樓層、面積、距離調整率），`conf` 降一級並在 `notes` 說明。`manualUnitPricePing` 有值時走 `manual`、`conf:'input'`。
車位收入 = `stalls × TD.data.cost.parkingPricePerStall`。

**m7 成本模型**
`{ items:[{id,label,amount,basis,conf,src}], constructionCost:V, softCost:V, financeCost:V, taxCost:V, totalCostExLand:V, monthlyCostCurve:[], notes:[] }`
`financeCost` 只算建融（土融利息在 m8 隨土地價一起算，因為土地價是待解變數）。建融利息＝依 `TD.math.sCurve(buildMonths)` 動撥，以加權平均餘額 × 年利率 ÷ 12 累計。

**m8 財務回推**
`{ landCap:V, landCapPerPing:V, landCapByIrr, landCapByMargin, irrAtCap:V, marginAtCap:V, profitAtCap:V,
   cashflow:[{ m, land, construction, sales, interest, net, cum }],
   sensitivity:[{ id, label, unit, lo, hi, loCap, hiCap, swing }],
   breakeven:{ priceDropPct:V, costRisePct:V, rateRisePct:V },
   scenarios:[{ id, label, landCap, irr, margin }], notes:[] }`

核心：以 `TD.math.bisect` 對土地總價 L 求解，使（a）年化 IRR = `p.m8.targetIrr`，（b）稅後淨利 ÷ 總銷 = `p.m8.targetMargin`。`landCap = min(a, b)`。求不出來時該欄回傳 `null` 並在 `notes` 說明原因，**不要回傳 NaN**。
月現金流：t0 付土地自備款；`planMonths` 後開工，營建成本依 S 曲線；`presaleStartMonth` 起依去化曲線收訂簽開（15%），交屋月收尾款（85%）；利息按月計。
敏感度五項（id 固定）：`price` 售價 ±10%、`cost` 營建 ±10%、`rate` 利率 ±1 個百分點、`schedule` 工期 ±6 個月、`absorb` 去化速度 ±30%。`swing` = |hiCap − loCap|，由大到小排序。
情境 id 固定：`opt` / `base` / `con`。

**edition（`js/engine/edition.js`）** → `ctx.ed`

```
ed.A = { valueLo:V, valueHi:V, perPingLo:V, perPingHi:V,
         routes:[{ id:'sell'|'joint'|'self', label, proceeds:V, months:V, risk, note, needs }],
         titleRisk, plainSummary }
ed.B = { securityValue:V, landLoanCap:V, constLoanCap:V, ltvSuggest:V,
         stress:[{ id, label, delta, margin, irr, verdict:'通過'|'警示'|'不通過' }],
         coverage:V, reviewNotes:[] }
ed.C = { bidCap:V, bidCapPerPing:V, walkAway:V, topOptions:[m4 前三名], decisionNote, localOnly:true }
```

A 版三條變現路徑：
- `sell` 直接賣地 = m8 出價上限 × 0.92（買方議價折）
- `joint` 合建分回：地主分回比例 = 土地價值 ÷（土地價值＋開發總成本＋合理利潤），輸出分回坪數與市值
- `self` 自地自建 = 總銷 − 總成本，風險最高、需自備資金

B 版：`securityValue` = 出價上限 × 0.85（保守折價）；`landLoanCap` = securityValue × `landLTV`；壓力測試四項：利率 +2 個百分點、售價 −15%、工期 +9 個月、去化 −40%。

---

## 8. UI 契約（`js/ui/*.js`）

### 8.1 檢視註冊

```js
TD.registerView({
  id:'m3', code:'M3', label:'法規檢討', group:'核心',
  title:'法規檢討', desc:'一句話說明',
  render:function (ctx, p) { return '<div class="card">...</div>'; },
  mount:function (root, ctx, p) {}   // 選用
});
```
`TD.views` 是 `{id:view}`，`TD.viewOrder` 是陣列。導覽列依 `TD.data.editions[p.edition].modules` 過濾與排序。
固定 id：`overview`、`m1`…`m8`、`edA`、`edB`、`edC`、`report`、`settings`。

### 8.2 自動雙向綁定（不要自己寫 addEventListener 處理一般輸入）

任何 `<input>`/`<select>`/`<textarea>` 加上 `data-bind="m6.presalePremium"`，`main.js` 會自動：讀值填入、變更時寫回 `TD.store.set`、重算、重繪。
- `data-type="num"`（預設 text）、`"pct"`（畫面 % ↔ 內部小數）、`"bool"`（checkbox）、`"json"`。
- `data-min` / `data-max` 會夾住。
- 陣列成員用 `data-bind="parcel.numbers.0.areaM2"`。

按鈕用 `data-act="動作名"`，`main.js` 呼叫 `TD.actions[動作名](el, ctx, p)`。

重繪時必須保留目前捲動位置與焦點欄位（焦點欄位用 `data-bind` 值比對還原游標），否則打字會被打斷。

### 8.3 共用元件（`js/ui/common.js`）

```js
TD.ui.num(v, opts)      // v 為 V 或數字。opts:{fmt:'money'|'area'|'pct'|'n'|'unitPrice', d, units, plain}
                        // 產出 <span class="num" data-vkey="...">值<span class="badge c-xxx">高</span></span>
TD.ui.stat(label, v, opts)
TD.ui.card(title, bodyHtml, opts)      // opts:{sub, code, cls}
TD.ui.table(cols, rows, opts)          // cols:[{k,label,align,fmt}]
TD.ui.lamp(level, text)
TD.ui.note(kind, html)                 // kind: info|warn|bad|good
TD.ui.field(label, bindPath, opts)     // opts:{type,hint,min,max,step,options:[{v,t}],suffix}
TD.ui.tornado(items)                   // inline SVG 龍捲風圖
TD.ui.cashflowChart(rows)              // inline SVG 現金流累計曲線
TD.ui.legal(lawName, article)          // 法源標籤＋查法規連結
TD.ui.gateBox(ctx)
TD.ui.openDrawer(vkey, ctx, p)         // 右側抽屜：key/值/信心/法源/算式/備註 ＋ 覆寫輸入 ＋「已複核」勾選
```
`.num` 的點擊由 `main.js` 全域委派到 `TD.ui.openDrawer`。

### 8.4 複核閘門

`ctx.gate = { total, done, todo, blocking:[{key,src,note}] }`，`todo` = `conf` 為 `low`/`unv` 且 `p.reviews[key]` 未標 done 的數量。
`report` 檢視在 `todo > 0` 時，最上方顯示紅色警示並列出未複核項目，**但仍然顯示報告內容**（擋掉會讓人繞過工具）。報告首頁必須印出未複核清單。

### 8.5 簡報模式（`js/ui/present.js`）

`TD.present.start(ctx, p)` 全螢幕輪播 `TD.data.editions[p.edition].slides`。
投影片格式：`{ kicker, title, sub, kind:'hero'|'bullets'|'table'|'lamp'|'tornado'|'routes'|'stress'|'options', get:function(ctx,p){ return 資料; } }`。
鍵盤：→/← 換頁、Esc 離開、數字鍵跳頁。底部有 A/B/C 版本切換鈕，**簡報中途可直接換版本**（這是使用者明確要的功能，切換後立即重建投影片並回到第一頁）。

三個版本的投影片各自不同：
- **A 地主與仲介版**：這塊地值多少 → 三條變現路徑比較 → 產權紅綠燈 → 下一步
- **B 銀行與估價師版**：擔保價值 → 可貸額度 → 壓力測試四情境 → 法源可追溯性與複核紀錄
- **C 建商版**：土地出價上限 → 容積獎勵組合前三名 → 敏感度龍捲風 → 什麼情況下會賠錢 → 資料留在本機（利益衝突是架構問題）

---

## 9. 測試

`tools/smoke.js`（Node 執行，零相依）：
先 `global.window = {}`，依序 eval 載入 `js/lib/*`、`js/data/*`、`js/engine/*`，用 `TD.store.sample()` 跑 `TD.engine.run(p)`，斷言：
1. `ctx.m3.baseFloorM2` 為正，且等於面積 × 容積率。
2. `ctx.m4.options.length > 0`，且 `chosen.pct <= regime.capOfBase + tdrCap + 1e-9`。
3. `ctx.m5.sellablePing > 0`。
4. `ctx.m6.unitPricePing` 為正。
5. `ctx.m8.landCap` 為正，且小於 `ctx.m6.totalSales`。
6. 提高 `targetIrr` 會讓 `landCap` 下降（單調性）。
7. 敏感度 `price` 的 `loCap < hiCap`。
8. `ctx.gate.total > 0`。
9. 三個 edition 都能跑出 `ctx.ed.A/B/C` 的頭條數字，且不為 NaN。
每項印 `PASS` / `FAIL`，全過時 `exit 0`，否則 `exit 1`。

`tools/checkall.sh`：對每個 js 檔跑 `node --check`，再跑 smoke，最後 grep 確認全專案沒有 `fetch(`、`XMLHttpRequest`、`import `、`=>`、`` ` `` 樣板字串。

---

## 10. 檔案分工

| 檔案 | 內容 |
|---|---|
| `js/lib/store.js` | 第 6 節 |
| `js/data/zoning.js` `bonus.js` `cost.js` `comps.js` `laws.js` `editions.js` | 第 5 節 |
| `js/engine/m1.js` … `m8.js` `edition.js` `pipeline.js` | 第 7 節 |
| `js/ui/common.js` | 第 8.3 節 |
| `js/ui/views-site.js` | `overview`、`m1`、`m2` |
| `js/ui/views-reg.js` | `m3`、`m4`、`m5` |
| `js/ui/views-fin.js` | `m6`、`m7`、`m8` |
| `js/ui/views-edition.js` | `edA`、`edB`、`edC`、`settings` |
| `js/ui/report.js` | `report` |
| `js/ui/present.js` | 第 8.5 節 |
| `js/main.js` | 啟動、路由、綁定、重算、選單、匯出匯入、快捷鍵 |
| `tools/smoke.js` `tools/checkall.sh` | 第 9 節 |
| `docs/README.md` `docs/DEPLOY.md` `docs/DATA-VERIFICATION.md` | 說明文件 |

新增檔案務必同步加入 `index.html` 的 script 清單（順序：lib → data → engine → ui → main）。
`index.html` 目前已列出 `js/lib/ai.js` 以外的所有檔案；**不要建立 `js/lib/ai.js`**，本專案不含任何 API 呼叫。
