# NOTES-store.md（`js/lib/store.js`）

SPEC 第 6 節照寫，欄位名稱與函式簽章一字未改。以下是契約沒寫到、我必須自己決定的部分，
以及可能與其他檔案衝突、需要確認的地方。

## 一、契約未定義、我決定的行為

1. **`set(p, path, value)` 會自動落地儲存**
   SPEC 8.2 只寫「變更時寫回 `TD.store.set`，重算，重繪」，沒提到誰負責 `save`。
   為避免使用者打字後忘了存，`set()` 內部會把該專案 upsert 回清單並寫 localStorage。
   `main.js` 若另外呼叫 `save(p)` 不會有副作用（冪等）。
2. **`set` 多吃一個選用參數 `at`**：`set(p, path, value, at)`。不傳時用 `Date.now()`。
   audit 項目仍嚴格只有 `{at, path, from, to}` 四個欄位。
3. **相同值不寫 audit**：`from` 與 `to` 相等（物件以 JSON 比對）時直接返回，避免重繪迴圈灌爆 audit。
4. **audit 上限 500 筆**（`AUDIT_MAX`），超過丟最舊的。理由是整份專案會塞進 localStorage，
   而 `parcel.deedText` 本身就不小。若複核紀錄需要永久保存，應該由 `reviews` 負責而不是 `audit`。
5. **`create(name)` 會順手把目前專案切過去**（`setCurrent`）。如果 `main.js` 想先建立、後切換，
   請改呼叫 `defaults()` + `save()`。
6. **`load(id)` 回傳快取內的同一個物件（不是複本）**。UI 拿到後直接改、或用 `set()` 改，
   都會反映到儲存的那一份。要複本請用 `duplicate()`。
7. **`importJSON(text)` 的回傳值**：SPEC 沒定義，我回傳
   `{ ok:Boolean, count:Number, ids:[], names:[], warnings:[], error:String|null }`。
   匯入成功時會把目前專案切到第一筆匯入的專案。
8. **`exportAllJSON()` 輸出的是專案陣列**（不是包裝物件），這樣 `importJSON` 可以原樣吃回去。
   `importJSON` 另外也接受 `{projects:[...]}` 包裝與單一專案物件。
9. **額外對外函式**：`TD.store.currentId()`、`TD.store.adopt(obj, warnArray)`、`TD.store.sampleDeedText()`、
   `TD.store.schema`、`TD.store.keys`。都是加法，不影響契約列出的介面。

## 二、匯入資料的安全處理

匯入的 JSON 視為不受信任：

- 不使用 `Object.assign` 整包吃進來。以 `defaults()` 為底，**逐欄位**取值（`adopt()`）。
- 型別不對就退回預設（字串欄位拿到數字會轉字串、數字欄位拿到 `"12"` 會轉 12、其餘退預設）。
- `m7` 的 `null` 代表「沿用 `TD.data.cost` 預設」，與 0 意義不同，用 `takeNumOrNull()` 保留。
- `__proto__` / `constructor` / `prototype` 三個鍵名，在 `set()` 路徑與匯入複製時一律擋掉。
- `overrides` 只收得到數字的鍵；`reviews` 只收 `{status, at, by, note}`。
- id 與既有專案撞號時**另給新 id**，不覆蓋既有專案，並在 `warnings` 說明。
- schema 版本：`> 1` 警告「較新版本，無法辨識的欄位已忽略」；`< 1` 或缺欄位警告「已補齊」。

## 三、localStorage 降級

- 所有讀寫包 try/catch。取不到 `localStorage`（Node、`file://` 受限、隱私模式）、
  讀寫丟例外、或存的內容 JSON 壞掉，一律轉記憶體模式並設 `TD.store.persistent = false`。
- **刻意的保守做法**：內容解析失敗時即使之後寫入還會成功，`persistent` 仍維持 `false`。
  理由是那份舊資料實際上已經救不回來，介面應該提醒使用者手動匯出，而不是安靜地繼續。
  **請 `main.js` 在 `TD.store.persistent === false` 時於畫面上顯示警示**（例如「本次變更不會保留，請先匯出 JSON」）。

## 四、示範專案（`sample()`）

臺北市大安區大安段三小段、商三、兩筆地號 418.00 ＋ 242.00 ＝ 660.00 平方公尺、臨 12 米路、
角地（`roadCount:2`）、基地 22m × 30m、既有建物屋齡 42 年、總樓地板 1,180.60 ㎡、
所有權人 6 人、最大持分分母 48、`m4.regime:'HR'`（基地未達都更 1,000 ㎡ 門檻，屋齡 42 年符合危老）、
`m4.picked:['GREEN','SEISMIC','TIME']`。

`parcel.deedText` 是一段擬真的第一類土地暨建物登記謄本，開頭已註明「示範用，非真實謄本」，
並寫明**前提是申請人本人到地政事務所臨櫃申請第一類謄本**，所以文字含完整姓名、住址與他項權利債權額；
本系統不連網、不代為查調（對應 SPEC 第 7 節 m1 的「謄本來源前提」）。

刻意放進去讓 M1／M2 有東西可吃：

| 內容 | 預期觸發 |
|---|---|
| `權利範圍：48分之7`、`2分之1`、`4分之1`、`48分之17`、`48分之24` | m1 權利範圍解析、`shareDenomMax = 48` |
| `418.00 平方公尺`、`242.00 平方公尺`、`1,180.60 平方公尺` | m1 面積正則 |
| `公同共有`＋`繼承`＋所有權人 6 人 | m2 `intestate` 紅燈 |
| 美國洛杉磯英文住址 | m2 `overseas` 黃燈 |
| `抵押權`＋`擔保債權總金額：新臺幣 36,000,000 元整` | m2 `encumbrance` 綠燈但註記 |

刻意**不**放進去：

- 沒有「查封／假扣押／假處分／預告登記」字樣（連「查無查封」這種否定句也避開），
  否則 m2 的字串比對會把示範案誤判成紅燈 blocker。
- 沒有「祭祀公業／神明會／**管理人**」。特別注意「管理人」三個字在 m2 是紅燈觸發詞，
  謄本裡公同共有的欄位我寫成「公同共有人」而不是「管理者／管理人」。
- 沒有「昭和／大正／明治」與日文假名。

**寫 m2 的人請注意**：上面這幾個詞只要出現在謄本任何位置（包含否定句）就會觸發，
如果你打算加上下文判斷，示範資料不需要跟著改；如果維持純字串比對，請不要在示範謄本裡加入這些詞。

## 五、待確認 / 可能衝突

1. `parcel.numbers[].share` 的語義契約沒寫死。我當成「本案標的在該地號的權利範圍」，
   格式沿用 defaults 的 `'1/1'` 斜線寫法（示範案第二筆是 `'7/48'`）。
   謄本文字裡則是地政慣用的「48分之7」。**m1 若要交叉比對兩者，要記得這兩種格式並存。**
2. `m2.consent.shareAgree` 我當成 0～1 的小數（示範填 0.62）。若 m2 期待的是百分比整數，請告知。
3. `m2.manualFlags` 的值型別契約沒寫。我用泛型純資料複製（布林、字串、物件都收）。
4. `m4.picked` 內含 `'TIME'`，依 SPEC 5.2 它 `requires.regimes:['HR']`。
   若 `bonus.js` 最後沒有 `TIME` 這個 id，m4 會找不到對應組合而回落到 `best`，不會壞，但示範效果會變。
5. `defaults()` 每次呼叫都會產生新的 `id` 與 `createdAt`／`updatedAt`。
   `importJSON` 會用匯入資料裡的值覆蓋，所以不影響匯入。
