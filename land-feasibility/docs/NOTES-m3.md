# NOTES-m3.md（`js/engine/m3.js`）

SPEC 第 7 節 m3 段落照寫：`bcr` / `far` / `buildAreaM2` / `baseFloorM2` / `zoneSource` /
`checks` / `blockers` / `manualCount` 欄位名稱與型別一字未改，七項必做檢核 id 全部都在。
以下是契約沒寫到、我必須自己決定的部分，以及可能與其他檔案衝突、需要確認的地方。

## 一、契約未定義、我決定的行為

1. **多了第八項檢核 `detailPlan`（細部計畫但書）**
   SPEC 寫「必做檢核 id」七項，我理解成「至少要有這七項」。細部計畫但書是 SPEC 第 7 節
   自己點名「無圖資就無法真正算出」的類別之一，卻不在那七個 id 裡，所以獨立成一列，
   status 恆為 `manual`。**UI 請不要假設 `checks.length === 7`。**
   若複核後認為不該多這一列，刪掉它不影響其他欄位。

2. **`p.m3.manualChecks[id]` 的資料格式是我定的**（SPEC 只定義了欄位存在）。接受三種寫法：
   - `'pass' | 'fail' | 'na' | 'manual'`
   - `{ status:'pass', note:'已請建築師套繪確認', by:'王小明' }`
   - `true`（相容 checkbox 型 UI，視為 `'pass'`）
   套用後 `conf` 改為 `'input'`，系統原判定保留在加項欄位 `autoStatus` / `autoNote`，
   並在 `note` 開頭明寫「使用者人工判定」。
   **系統本身永遠不會自動把 `manual` 改成 `pass`**，只有使用者明示才會。

3. **缺資料一律是 `manual`，不是 `fail`。** 沒填基地寬深、沒填路寬、查無分區，
   都代表「算不出來」而不是「不合格」。`fail` 只留給「算得出來而且不通過」，
   因為 `blockers` 會被上層當成阻斷條件用。

4. **`zoneSource` 我輸出成字串**（法規名稱＋條號＋縣市／分區＋`verified` 狀態），
   SPEC 沒指定型別。UI 若需要結構化資料，請改用加項欄位 `zoneRef`
   `{ city, zoneCode, zoneName, lawName, article, verified, found, note }`，
   它可以直接餵給 `TD.ui.legal(lawName, article)`。

5. **`blockers` 放的是檢核「標題」字串**（例如 `['畸零地']`），不是 id。
   依任務敘述「blockers 收集所有 status 為 fail 的項目標題」。要 id 請從 `checks` 過濾。

6. **面積來源**：優先取 `ctx.m1.areaM2`，取不到才自己加總 `parcel.numbers[].areaM2`。
   實際用了哪一個寫在加項欄位 `areaSource`，數值在 `areaM2Used`（純數字，未包 V，
   因為面積的 V 是 m1 的職責，包兩次會讓複核閘門重複計數）。

7. **信心等級**：種子資料來的 `bcr` / `far` 一律 `'unv'`；`p.m3.overrides` 有值時 `'input'`。
   `buildAreaM2` / `baseFloorM2` 跟著各自的來源走（覆寫則 `'input'`，否則 `'unv'`）。
   所有 `check.conf` 預設 `'unv'`，被人工結案的改 `'input'`。**沒有任何一個值是 `'high'`**，
   因為連分區代碼本身都還沒跟分區證明書核對過。

8. **算不出來時回 `null`，不回 `NaN` 也不回 0。**
   查無分區時 `bcr` / `far` / `buildAreaM2` / `baseFloorM2` 全是 `null`，
   並在加項欄位 `notes` 說明。`zoning.setback.frontM` 為 `null` 時，
   引擎不會把它當成「不必退縮」。

9. **加項欄位**（SPEC 未列，都是加法，不影響契約）：
   `zoneRef`、`areaM2Used`、`areaSource`、`notes`（字串陣列）、
   以及被人工結案的檢核上的 `autoStatus` / `autoNote`。

## 二、我自己造的數字，請優先查證或刪掉

- **臨路寬度檢核用了一個 6 公尺的門檻，那是本系統自訂的保守值，不是法規數字。**
  常數叫 `ASSUMED_MIN_ROAD_M`，命名刻意帶 ASSUMED，`requirement` 與 `note` 兩處都明寫
  「本系統保守門檻，非法規數字」。種子資料裡沒有任何可用的臨路寬度法定門檻，
  我不願意編一個條號，也不願意讓這一項永遠是 manual 而失去警示作用，所以選了這個折衷。
  查到正確門檻後，請把數值與條號一起補進 `js/data/zoning.js`，並把這個常數拿掉。
- 畸零地檢核的法源字串裡出現「建築法第44條至第46條」，那是照抄 `js/data/zoning.js`
  `oddLot.note` 已有的註記，並在字串中標明「條號引自種子資料註記，待查證」。我沒有自己生條號。

## 三、刻意沒做的事

- **日照、防火間隔、退縮、高度比、細部計畫但書一律 `manual`**，`note` 逐項列出
  「需要什麼資料才算得出來」（細部計畫書、都市設計審議規範、指定建築線圖說、鄰地現況圖、
  方位與冬至日照分析、建築配置圖等）。這是 SPEC 原則一，不是偷懶。
  任何把這幾項寫成 `pass` 的修改，都必須先說明資料從哪裡來。
- 高度比雖然不在任務點名的四項裡，但種子資料沒有高度比／斜線管制數值，
  硬算就是編數字，所以同樣 `manual`；`note` 裡只給一個標示清楚的參考算術
  （容積率 ÷ 建蔽率 ≈ 滿建蔽層數），並明寫「這不是可蓋樓層數」。
- 停車只算「應設數量」，不判斷「配置得下」。`status` 為 `pass` 的語意是
  **應設車位數算得出來**，不是「停車規劃沒問題」，`note` 已寫明。
- 沒有自行「修正」種子資料裡商二（630%）高於商三（560%）的順序，
  `js/data/zoning.js` 的註記叫人不要改，就沒改。

## 四、需要其他檔案的人確認

1. **`m5` 量體試算要用哪個面積**：`m3.buildAreaM2` 是「法定建蔽率上限」，
   已在 `note` 註明退縮、防火間隔、法定空地會讓實際配置更小。m5 若直接拿它當可建面積會高估。
2. **停車數字會被重算**：m3 只用基準容積算應設車位；m4 的獎勵與 m5 的免計容積會讓樓地板上升，
   應設車位數跟著上升。m5 請以總樓地板重算，不要沿用 m3 的數字。
3. **UI 的檢核表請用 `status` 上色，不要只看 `blockers`**：`manual` 的數量（`manualCount`）
   才是這個模組最重要的輸出，示範專案就有 5 項 manual。
4. `checks[].law` 是一段字串（法規名稱＋條號或「條號待查」）。若 `TD.ui.legal()` 需要
   拆開的欄位，我可以再加 `lawName` / `article`，說一聲即可。

## 五、驗證過的行為（以 `TD.store.sample()`）

- 商三、660 ㎡ → `bcr` 0.65、`far` 5.6、`buildAreaM2` 429 ㎡、`baseFloorM2` 3,696 ㎡
  （＝ 660 × 5.6，對應 SPEC 第 9 節 smoke 斷言 1）。
- 畸零地：路寬 12 m 落在「7～15 公尺」級距 → 最小寬 3.5 m／深 14 m，基地 22×30 → `pass`。
  把基地改成 2.5×9、路寬 4 m → `fail`，`blockers` 出現「畸零地」。
- 停車：3,696 ÷ 150 → 應設 25 位。
- 空白專案（面積 0）：8 項全 `manual`、`blockers` 為空、四個 V 全為 `null`，不產生 NaN。

---

## 六、2026-09-26 對抗審查後的變更（契約加項，請確認）

1. **`checks[]` 新增 `valueNum` 欄位（純數值，算不出來一律 `null`）。**
   原因：m5 原本用 `firstNumber(c.requirement)` 從「每 150 ㎡ 樓地板面積設置一停車空間」
   這句人話裡撈出 150，當成「應設 150 個車位」——把**比例**讀成了**數量**。
   後果是未知分區（m3 判 `manual`）的案子憑空生出 150 個車位、6,000 ㎡ 地下室、
   3.75 億車位收入與 4 億成本。

   現在 `mk()` 多一個第 8 個參數 `valueNum`，只有「真的算出來」時才填。
   停車檢核在 `status === 'pass'` 時填實際車位數，兩個 `manual` 分支一律 `null`。
   m5 只認 `valueNum`，**絕不再解析 `value` 或 `requirement` 字串**。

   這是欄位**加項**不是改名，SPEC 第 7 節列的八個欄位都還在。
   若契約作者認為應該另取名字（例如 `stallsRequired` 只掛在停車那一列），請告知，
   改起來只影響 `mk()` 與 `js/engine/m5.js` 的 `parkingRequired()` 兩處。

2. **m5 的層數改用總樓地板，m3 的高度比與日照複核會拿到不同的高度。**
   `m5.floorsAbove` 原本用容積樓地板算，示範案得 10 層／32 m；
   改用總樓地板（含免計容積）後是 13 層／41.6 m。
   m3 的 `heightRatio` 與 `sunlight` 兩項是人工複核，複核者拿到的高度會高 10 公尺，
   這是修正不是迴歸 —— 原本的數字偏低，會讓人以為高度限制沒問題。
