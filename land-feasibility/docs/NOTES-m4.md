# NOTES-m4.md（`js/engine/m4.js`）

SPEC 第 7 節 m4 段落照寫：`options[]` 的十六個欄位、`best`、`chosen`、`pct`、
`bonusFloorM2`、`totalFloorM2`、`notes` 名稱與型別一字未改。
以下是契約沒寫到、我必須自己決定的部分，其中**第 1 項與第 6 項請優先裁示**。

## 一、必須裁示：`outside` 不封頂，與 smoke 斷言 2 互相矛盾

- SPEC 第 7 節明寫 `bucket:'outside'` **不受上限**，任務敘述也再講一次，所以我沒有封頂。
- 但 SPEC 第 9 節 smoke 斷言 2 要求 `chosen.pct <= regime.capOfBase + tdrCap + 1e-9`。
  `NONE` 制度的 `capOfBase` 是 0，而 `OPEN`（10%）與 `TOD`（10%）都是 `outside`，
  所以只要使用者選 `NONE` ＋ 這兩項，`pct` 就會是 0.35（0 ＋ TDR 0.15 ＋ outside 0.20），
  **大於 0 + 0.30，斷言會不過**。
- 現況：`TD.store.sample()` 用的是 `HR`，斷言照常會過，所以 smoke 目前不會紅。
- 兩條路，請擇一：
  (a) 維持不封頂（現況），把 smoke 斷言 2 改成只對沒有 outside 項目的組合成立；
  (b) 改成對 outside 也封頂，上限用 `TD.data.bonus._meta.outsideCapOfBase`（種子值 0.20）。
  資料檔 `bonus.js` 的 `_meta.outsideCapNote` 其實是傾向 (b) 的寫法，
  但那個 0.20 自己也標明是「暫設佔位值」，所以我沒有拿它去覆蓋 SPEC 的明文。
- 目前的折衷：不封頂，但任何一個組合的 outside 合計超過 `outsideCapOfBase` 時，
  該組合的加項欄位 `outsideNote` 會寫明超出多少、以及真正上限要去哪裡查；
  `notes` 也有一條通案說明。

## 二、契約未定義、我決定的行為

1. **`option.monthsAdd` 含制度本身的 `baseMonths`**（＝ `regime.baseMonths` ＋ 各項 `monthsAdd`）。
   資料檔說項目的 `monthsAdd` 是「相對於 baseMonths 另外增加」的，但 option 層級的
   `monthsAdd` 是什麼，SPEC 沒寫。如果只算項目月數，跨制度比較就會忽略都更 36 個月、
   危老 18 個月的審議差距，讓「獎勵成數大」的都更永遠排第一 —— 那是危險的排序。
   拆解值在加項欄位 `baseMonths` 與 `itemMonthsAdd`。
   **UI 若要顯示「額外增加幾個月」，請用 `itemMonthsAdd`，不要用 `monthsAdd`。**

2. **時程成本的「總成本」是估的。** SPEC 的式子是
   `monthsAdd × 總成本 × 年利率 ÷ 12`，但 pipeline 在 m4 之後才跑 m7，此時沒有成本模型。
   我的估法：`總樓地板 ÷ 坪 × 營建單價（p.m7.constructionKey 或 rc25）＋ 本組合取得成本`；
   年利率取 `p.m7.constRate`，沒填就用 `TD.data.cost.finance.constRate`。
   若 `ctx.m7` 已經存在（未來若改 pipeline 順序），會改用 `ctx.m7.totalCostExLand`。
   這是**資金被卡住的機會成本近似值，不是現金流量表**，正式數字看 M7／M8。

3. **增加可售坪 = 增加容積樓地板 ÷ 坪 × `p.m5.sellRatio`。**
   SPEC 只說「增加可售坪」，沒說怎麼換算。我刻意保守：
   獎勵容積連帶增加的**免計容積（陽台、雨遮、機電、停車空間）沒有計入可售面積**，
   所以實際增加的銷售坪數可能高於本模組的估計，淨效益是低估的。
   用 `p.m5.sellRatio`（專案輸入）而不是 `ctx.m5.sellablePing`，是為了讓 m4 兩次呼叫
   （m5 之前、m5 之後）的差異只來自單價，不要多一個變動來源。

4. **封頂後在同一個 bucket 內按比例分攤。**
   例如危老上限 30%，但選了合計 56% 的制度型獎勵，每一項的 `pct` 會被等比例縮到合計 30%，
   `costTotal` 也跟著只算縮小後的坪數。**付錢買沒拿到的容積是錯的**，所以這樣分攤。
   縮減前的原始成數保留在 item 的加項欄位 `pctRaw`。

5. **不符制度前提的制度，組合仍然列出，但排在所有可行組合之後，而且不會被選為 `best`。**
   SPEC 說「依 netGain 由大到小排序」，我加了一層前置排序鍵 `feasible`。
   理由：示範專案 660 ㎡ 未達都更 1,000 ㎡ 門檻，若純按 netGain 排序，
   畫面第一名會是一個這塊地根本走不了的都更方案 —— 那正是 SPEC 原則一要防的事。
   使用者仍然看得到那些組合與不可行的原因（`feasible:false`、`prereqNotes`），
   `chosen` 也仍然找得到（使用者選了不可行的制度時，`notes` 會明講）。
   **若要嚴格照 SPEC 的單鍵排序，把 `options.sort` 裡的第一個比較拿掉即可。**
   制度前提只檢查客觀可算的 `minSiteM2` 與 `minAgeYears`；同意比例無法由系統判定，
   一律放進 `prereqNotes` 要求人工確認，不影響 `feasible`。

6. **`p.m4.tdrPct` 的解讀**：SPEC 的 project 結構有這個欄位，但 m4 段落沒提它。
   我當成容積移轉成數的專用覆寫欄位，優先序是
   `p.m4.pctOverrides.TDR` ＞ `p.m4.tdrPct`（> 0 時）＞ 種子 `pctTypical`。
   若原意是別的（例如「已談妥的移入量」），請告訴我，這段只有一個函式 `itemPct` 要改。

7. **`riskScore` 的定義**（SPEC 只給欄位名）：
   `制度風險權重 ＋ 各獎勵項目風險權重的成數加權平均`，low/mid/high = 1/2/3，
   數值越大越危險，範圍大致 1～6。文字版在加項欄位 `riskLabel`。
   指的是「申請後拿不到、或成數低於預期」的風險，不是工程風險。

8. **`chosen` 的比對**：`regimeId` 相等且 `itemIds` 與 `p.m4.picked` **集合相等**（忽略順序、
   忽略重複）。找不到就等於 `best`，並在 `notes` 寫明原因；能判斷出是哪幾個勾選項目
   被前提擋掉時（例如在都更底下勾了只限危老的 `TIME`），會把項目名稱列出來。
   `chosen` 與 `best` 不同時，`notes` 另有一條寫出差額，並附但書：
   差額沒有反映審議風險與 `tradeoff` 欄的代價，**不是「應該照做」的建議**。

9. **對外三個 V 取 `chosen` 而不是 `best`**，因為下游 M5 的量體必須是使用者選定的那一組。
   三個 V 的 `conf` 一律 `'unv'`：成數是種子資料、上限是種子資料，而且最終由審議決定。
   `note` 裡會串上封頂說明與「本組合不符制度前提」的警語。

10. **截斷保護**（任務要求，附上實際數字）：
    - `ITEM_CAP = 16`：單一制度可用項目超過 16 項時，先算各項單獨的 netGain，只留前 16 項，
      `notes` 會列出被截掉的 id，並註明「這是效能截斷，不是法規判斷」。
    - `OPTION_KEEP = 200`：單一制度的組合數超過 200 時只留 netGain 前段，
      但**使用者目前選定的那一組一定保留**。
    - 現行種子資料每個制度最多 7 項（128 組），兩個上限都不會觸發；
      總共產生 260 個組合。資料擴充到 8 項以上時請回來看這裡。

11. **成數對外一律四捨五入到小數 6 位**（`PCT_DP`），避免 `0.42000000000000004` 這種浮點雜訊
    直接進到畫面與匯出的 JSON。封頂是在四捨五入之前做的，所以不會因為進位而超過上限。

12. **加項欄位**（都是加法，不影響契約）：
    option 上有 `feasible` / `prereqNotes` / `regimePct` / `outsidePct` / `outsideNote` /
    `baseMonths` / `itemMonthsAdd` / `revenue` / `timeCost` / `estTotalCost` / `riskLabel` / `regimeLaw`；
    item 上有 `pctRaw` / `pctFrom` / `bucket` / `costType` / `costBasis` / `gainPing` /
    `lawName` / `article` / `note`；
    模組層另有 `unitPricePingUsed` / `unitPriceFrom` / `sellRatioUsed` / `baseFloorM2Used` /
    `tdrCapOfBase` / `optionCount` / `chosenIsBest` / **`topOptions`（前三名，給 `ed.C.topOptions` 直接用）**。

## 三、效能（寫 UI 的人請一起注意）

`TD.fmt.n` / `TD.fmt.money` 走 `toLocaleString`，單次約 60 微秒。
第一版把算式說明字串寫在 2^n 的列舉迴圈裡，一次 m4 要 110 毫秒，
pipeline 會呼叫兩次，等於每按一個鍵多等 0.2 秒。
改成「把與組合無關的字串先算好快取、迴圈內只用一個不走 locale 的百分比格式化」之後，
一次 m4 降到約 5 毫秒（同一台機器、同一筆示範專案、260 個組合）。
**結論：不要在逐列／逐組合的迴圈裡呼叫 `TD.fmt.*`。**

## 四、驗證過的行為

- 示範專案（危老、660 ㎡、屋齡 42 年）：260 個組合，`chosen` = `HR:GREEN+SEISMIC+TIME`、
  `pct` 0.14、`totalFloorM2` 4,213.44 ㎡；`best` 是七項全上的組合。
  `chosen.pct (0.14) <= capOfBase (0.30) + tdrCap (0.30)` ✓（smoke 斷言 2）。
- 封頂：把制度型灌到 56%、TDR 灌到 45% → `pct` 0.60、`capped:true`、
  `capNote` 寫出各砍了 26 與 15 個百分點，各項 `pct` 相加正好等於 0.600000。
- 第一次呼叫用 `fallbackUnitPricePing`（90 萬/坪）、塞進 `ctx.m6` 後第二次呼叫改用 M6 單價，
  `notes` 兩次都說明採用了哪一個。
- 空白專案（基準容積 0）：仍然回 132 個組合、所有數值為 0 或 `null`，沒有 NaN，
  `notes` 明講「排序沒有意義」。
- `m4({}, {})`：不丟例外，回得出 `options` 與 `chosen`。

---

## 2026-09-26 對抗審查後的變更

**`options[]` 與 `items[]` 新增 `gainPingForCost`，`gainPing` 的定義改了。**

原本 `gainPing = 增加容積樓地板 ÷ PING × sellRatio`，少乘了免計容積係數，
與 `m5.sellablePing` 的算法不一致，低估約 36%（示範案 148.699 坪 vs 實際 193.309 坪）。
而時程成本沒有同步縮放，所以偏誤在各制度間不等量（UR `baseMonths` 36 對 HR 18），
跨制度排序有被壓低的風險。

現在：
- `gainPing` ＝ 增加容積樓地板 ÷ PING × `sellRatio` × (1 + `p.m5.exemptRatio`)
  —— 收入基礎，與 `m5.sellablePing` 同一套算法，兩個模組不再打架。
- `gainPingForCost` ＝ 增加容積樓地板 ÷ PING × `sellRatio`
  —— 成本基礎，維持原值，因為 `TD.data.bonus` 的 `costPerGainedPing` 與
  `costRateOfPrice` 的單位註記是「元／每增加一坪可售」，而容積移轉的購入代價
  實務上按**移入的容積**計，不是按陽台雨遮計。把成本也乘 1.3 會高估 TDR 與捐贈代價。

結果是 `netGain` 的收入面與成本面用兩個不同的坪數，兩者都輸出、`notes` 都寫明。
這是**妥協不是結論**：正確做法是在 `js/data/bonus.js` 逐項標明每種獎勵的取得成本
以容積坪還是可售坪計價（需要查證實際計價慣例，屬於髒活）。
詳見 `docs/KNOWN-ISSUES.md` 第 2.3 節。

示範案實測：`chosen.gainPing` 193.309 坪，恰等於「有選獎勵」與「不選獎勵」
兩次 `m5.sellablePing` 的差額（1574.089 − 1380.779）。top-5 排序未變。
