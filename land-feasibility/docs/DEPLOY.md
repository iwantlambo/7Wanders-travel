# 部署指南

這是一個**純靜態、預設離線**的網頁應用。沒有建置步驟、沒有 npm、沒有打包器、
沒有後端、沒有資料庫；除非使用者自己按下「自動研究」（自備 Anthropic API 金鑰，瀏覽器直接連 `api.anthropic.com`），
不發任何網路請求。

因此部署有兩種層次：最簡單的那種根本不叫部署，複製檔案就是部署。

---

## 1. 最簡單：雙擊就能用

1. 把整包資料夾解壓縮到任何位置（桌面、隨身碟、公司網路磁碟都可以）。
2. 雙擊 `index.html`。

結束。不需要伺服器、不需要 Node、不需要網路。斷網也照跑。

適用：個人使用、給客戶一份離線副本、在客戶辦公室用筆電當場試算、
資安要求不得對外連線的環境。

> **注意**：用 `file://` 開啟時，瀏覽器把它視為一個獨立的來源。
> 同一份檔案之後改放到網址上開，**看不到原本在 `file://` 存的專案**
> （資料沒有遺失，只是不同來源各自獨立）。要搬移專案請用「⋯ → 匯出專案 JSON」，
> 到新環境再「匯入專案 JSON」。

### 要發給別人的話

把整個資料夾壓成 zip 寄出即可。收件人解壓縮後雙擊 `index.html`。
裡面沒有任何需要安裝的東西。

---

## 2. 上傳靜態主機

**所有主機的共通規則**：上傳的是**整個專案資料夾的內容**，
也就是讓 `index.html` 落在網站的**根目錄**，旁邊保留 `assets/`、`js/`、`docs/` 這三個子資料夾。

```
網站根目錄/
  index.html        ← 必須在根目錄
  assets/app.css
  js/lib/ js/data/ js/engine/ js/ui/ js/vendor/ js/main.js
  docs/             ← 可以不上傳，但留著方便查
```

`js/vendor/anthropic-sdk.js` 是自動研究用的官方 SDK（只在按下研究時載入），一起上傳；少了它其他功能照常，只有自動研究無法使用。
主機若有設定 Content-Security-Policy，`connect-src` 要加上 `https://api.anthropic.com`，自動研究才連得上。

不要只上傳 `js/`，也不要把 `index.html` 放進子資料夾再上傳。
`index.html` 用的全部是相對路徑，所以放在子目錄（例如 `https://example.com/land/`）也能正常運作，
只要那個目錄裡有完整的檔案結構。

**建置設定一律留空**：build command 沒有、install command 沒有、
output directory 就是專案根目錄（`.` 或 `/`）。任何平台問你要用哪個框架，答案是「無／靜態」。

### Netlify（拖放，最快）

登入 Netlify → `Sites` → 把**整個專案資料夾**直接拖到 "Deploy manually / drag and drop" 區域。
不要拖 zip 以外的單一檔案，也不要只拖 `js`。上傳完會拿到一個 `xxx.netlify.app` 網址。

若改用 Git 連動：build command 留空，**publish directory 填 `.`**（專案根目錄）。

### Cloudflare Pages

`Workers & Pages` → `Create` → `Pages` → 選 `Upload assets`（直接上傳整個資料夾）
或連 Git repo。連 Git 時：
framework preset 選 `None`，build command 留空，**build output directory 填 `/`**。

### GitHub Pages

1. 把整包 push 到 repo 的根目錄（`index.html` 必須在 repo 根目錄，不要包一層資料夾）。
2. repo → `Settings` → `Pages` → Source 選 `Deploy from a branch`。
3. Branch 選 `main`，**folder 選 `/ (root)`**，Save。

若堅持要把檔案放在子資料夾，folder 選 `/docs` 並把整包搬進 `docs/`；
但本專案的 `docs/` 已經放說明文件，建議直接用根目錄。
網址會是 `https://<帳號>.github.io/<repo>/`，相對路徑一樣正常。

### Vercel

`Add New` → `Project` → 匯入 repo（或用 `vercel` CLI 在專案根目錄執行）。
Framework Preset 選 `Other`，**Root Directory 留空（即 repo 根目錄）**，
Build Command 留空，Output Directory 留空。Vercel 會直接把靜態檔案送出去。

### AWS S3（靜態網站代管）

1. 建一個 bucket，`Properties` → `Static website hosting` 啟用，
   **Index document 填 `index.html`**。
2. 把整個專案資料夾的內容上傳到 bucket 的**根目錄**（保留 `assets/`、`js/` 的路徑結構）。
3. 用 `aws s3 sync . s3://你的bucket名 --delete` 一次同步整包最省事
   （在專案根目錄執行；`--delete` 會清掉舊檔案，更新時很有用）。
4. 要對外公開就設 bucket policy 允許 `s3:GetObject`；
   建議前面掛 CloudFront，並把 Default root object 設為 `index.html`。

### 公司內網 nginx

把整包放到伺服器上，例如 `/var/www/land-dev-eval/`，然後：

```nginx
server {
    listen 80;
    server_name land.internal.example.com;

    root /var/www/land-dev-eval;   # 這個目錄裡要有 index.html
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }
}
```

`nginx -t` 檢查語法後 `systemctl reload nginx`。不需要任何 proxy_pass、
不需要 PHP、不需要 Node process。

### 公司內網 IIS（Windows Server）

1. 開啟 `IIS 管理員` → 對 `站台` 按右鍵 → `新增網站`。
2. **實體路徑指向專案資料夾**（裡面要有 `index.html`），設定站台名稱與繫結的埠。
3. 確認該站台的 `預設文件` 清單含 `index.html`。
4. 確認 `.css` 與 `.js` 的 MIME 類型存在（IIS 預設就有；若是精簡安裝需補
   `text/css` 與 `text/javascript`）。

同樣不需要應用程式集區的特殊設定，也不需要 .NET。

---

## 3. 注意事項（部署前一定要讀）

### 資料存在瀏覽器裡

專案資料存在瀏覽器的 localStorage，key 是 `tdev.v1.projects` 與 `tdev.v1.current`。這代表：

- **換瀏覽器、換電腦、換無痕視窗就看不到原本的專案。**
- **清除瀏覽資料／網站資料會把專案刪掉，而且救不回來。**
- 不同網域（或 `file://` 與網址之間）的資料各自獨立，不互通。
- localStorage 不可用時（無痕模式、瀏覽器設定封鎖網站資料），系統會退到**記憶體模式**，
  右欄出現紅色警告，重新整理就會遺失。

**所以：請養成用「⋯ → 匯出專案 JSON」備份的習慣。**
「匯出全部專案」可以一次備份所有專案，之後用「匯入專案 JSON」還原。
這是唯一可靠的保存方式。

### 放上公開網址等於任何人都能用這個工具

靜態網站沒有登入。把它放到公開網址上，任何拿到連結的人都能開起來用。

但**他們看不到你的資料** —— 因為資料只在各自的瀏覽器裡，
沒有伺服器可以存放或交換任何東西。別人用他的電腦開你的網址，
他看到的是一個空專案（或他自己建的專案）。

換句話說：公開網址洩漏的是「工具本身」，不是「你評估了哪塊地」。
如果你不想連工具都給人看，往下看。

### 要限制存取就用主機層的密碼保護

不要試圖在前端做登入，那只是裝飾。用主機提供的機制：

- **Netlify**：站台設定的 `Access control` → `Password protection`，設一組全站密碼即可（需付費方案）。
- **Cloudflare Access**：在 Zero Trust 裡為這個網域建一條 Application 政策，限定公司 Email 網域或指定人員才能開。
- **nginx basic auth**：`htpasswd -c /etc/nginx/.htpasswd 使用者名`，然後在 `location /` 裡加 `auth_basic "restricted"; auth_basic_user_file /etc/nginx/.htpasswd;` 並 reload。
- **IIS**：關掉匿名驗證、開啟 Windows 驗證，靠網域帳號控管。

---

## 4. 更新方式

**覆蓋檔案即可。專案資料不受影響。**

localStorage 是依網域（來源）保存的，跟檔案內容無關。你把 `js/` 整個換新、
把 `index.html` 換掉，使用者原本建的專案都還在。

作法：

1. 把新版整包上傳／同步覆蓋舊檔（S3 用 `aws s3 sync . s3://bucket --delete`；nginx 直接覆蓋目錄）。
2. 請使用者**強制重新整理**（Windows `Ctrl + F5`、macOS `Cmd + Shift + R`）。
   瀏覽器與 CDN 都會快取 `.js` 與 `.css`，不強制重新整理可能還在跑舊版。
   Cloudflare 或 CloudFront 記得順手清一次快取（purge / invalidation）。
3. 若改動了 `project` 的資料結構，請同步升高 `js/lib/store.js` 的 `schema` 並在載入時做搬移，
   否則舊的 localStorage 專案與新版程式對不起來。目前 `schema` 是 `1`。

**唯一要小心的情況**：改了 localStorage 的 key 名稱（`tdev.v1.*`），
那等於換了一個儲存空間，舊專案會「看起來消失」。真的要改版號時，
請先叫使用者匯出 JSON。

---

## 5. 自行擴充指引

擴充的入口幾乎都在 `js/data/`。這是刻意的：護城河在髒活不在模型，
所以資料層寫成一格一格、附法源與查證指引的純資料檔。

**共通規則**：

- 語法限 **ES5 風格**：只用 `var` 與 `function`，不用箭頭函式、`let`／`const`、
  `class`、樣板字串、解構、選擇性鏈結。字串用 `+` 串接。
- 新值一律先填 `verified: false`，條號查不到就寫 `'待查'`。
  **寧可寫「待查」也不要編一個條號。**
- 改完跑 `node --check js/data/你改的檔.js`，再跑 `bash tools/checkall.sh`
  （會逐檔語法檢查、跑 `tools/smoke.js` 的 20 項斷言，並確認全專案沒有
  `fetch`／`XMLHttpRequest`／外部 CDN／ES6 語法）。
- **新增檔案**務必同步加進 `index.html` 的 script 清單，順序是
  lib → data → engine → ui → main。

### 5.1 加一個縣市

**檔案**：`js/data/zoning.js`
**位置**：`TD.data.zoning.cities`

1. 複製 `cities['_template']` 整個物件，key 改成縣市全名（例如 `'新北市'`），
   並把 `_isTemplate: true` 這一行刪掉。
2. 填 `lawName`（該縣市的土地使用分區管制自治條例或都市計畫法施行細則全名）與 `note`。
3. `zones` 之下每個分區填：`name`（分區全名）、`bcr`（建蔽率，小數）、
   `far`（容積率，小數；`5.6` 代表 560%）、`article`（條號，查不到寫 `'待查'`）、
   `use`（允許使用的粗分類陣列）、`minLotM2`、`verified: false`、`note`（寫明這個數字要去哪裡查）。
4. `oddLot.rows` 是畸零地對照表，由小到大排列：
   `{ roadWidthMax: 7, minWidth: 3.0, minDepth: 12.0 }`，
   最後一列的 `roadWidthMax` 填 `null` 代表「以上皆是」。
   **`rows` 留空陣列的話，畸零地檢核會自動標成需人工複核**，這是安全的預設。
5. `parking.residentialPerM2` 是「每多少平方公尺樓地板設一車位」；
   `officePerM2` 與 `retailPerM2` 查不到就**留 `null`**，引擎遇到 `null` 會標待查，不會自己猜。
6. `setback.frontM` 查不到留 `null`（代表未知，不是不必退縮）。

**不用改任何 UI。** 左欄「基地」的「縣市」下拉是直接列舉 `cities` 的 key
（會跳過以底線開頭的 `_template`），「使用分區」下拉讀 `cities[目前縣市].zones`，
提示文字也會自動帶出該分區的種子建蔽率、容積率與條號。

### 5.2 加一項容積獎勵

**檔案**：`js/data/bonus.js`
**位置**：檔案中段的 `BONUSES` 陣列

新增一個物件，欄位與既有項目一致：

| 欄位 | 填什麼 |
|---|---|
| `id` | 大寫英文代號，全檔唯一（例如 `'PARK'`） |
| `name` `lawName` `article` | 中文名稱、法規全名、條號（查不到寫 `'待查'`） |
| `pctMin` `pctTypical` `pctMax` | **占基準容積**的比例，小數（`0.06` = 6%）。不是占法定容積率，也不是占總樓地板 |
| `bucket` | `'regime'` 併入該制度的 `capOfBase` 一起封頂；`'tdr'` 走 `_meta.tdrCapOfBase`；`'outside'` 走 `_meta.outsideCapOfBase`（暫設佔位值，仍須逐案查真正上限） |
| `costType` | `'none'` ／ `'design'` ／ `'purchase'` ／ `'donation'`（只是標籤，計算看下面兩欄） |
| `costPerGainedPing` | 元／每增加一坪可售面積 |
| `costRateOfPrice` | 取得成本 ＝ 售價 × 此比率 × 增加坪數（容積移轉用這欄） |
| `monthsAdd` | 相對於制度 `baseMonths` 額外增加的審議與設計月數 |
| `risk` | `'low'` ／ `'mid'` ／ `'high'`，指「申請後拿不到或成數低於 `pctTypical`」的風險 |
| `requires` | `{ regimes: ['UR','HR'], minSiteM2: 0, minAgeYears: 0 }` |
| `tradeoff` | **這一欄最重要**：代價是什麼。獎勵組合的價值在這裡，不在百分比 |
| `verified` `note` | 一律 `false`；`note` 寫要去哪裡查 |

**關鍵的第二步**：把新的 `id` 加進 `REGIMES` 裡對應制度的 `allows` 陣列
（`'UR'` 都市更新／`'HR'` 危老重建／`'NONE'` 不走更新危老）。
**沒加進 `allows`，容積獎勵 根本不會列舉這一項。**

提醒：容積獎勵 是列舉所有子集合，組合數隨項目數以 2 的次方成長
（現在 10 項、示範案產生 260 組）。一次加太多項會明顯變慢。

若要調整上限本身，改 `META` 的 `tdrCapOfBase`（容積移轉上限）、
`outsideCapOfBase`（開放空間與 TOD 的暫設合計上限），
或各 `REGIMES` 的 `capOfBase`（都更 0.50、危老 0.30、不走 0）。

### 5.3 換成真實實價登錄資料

有兩條路，看你要一次性還是永久換掉。

**（a）單一專案，執行期匯入（不改程式）**

展開左欄的「進階假設 → 售價」，把資料貼進比價案例文字框按「解析並匯入」。
欄位順序固定，前五欄必須是數字：

```
單價, 坪數, 屋齡, 樓層, 距離, 地址, 行政區, 年度, 型態
```

- 單價是**元／坪**（不是萬／坪；系統偵測到小於 10,000 會提醒你確認單位）。
- 支援逗號與 tab 分隔、支援雙引號包住含逗號的欄位、第一列若不是數字會當標題列跳過。
- 任何一列的前五欄缺值或不是數字，**整列略過並列出原因，不補預設值**。
- 匯入後會寫進 `p.m6.comps`，並自動把 `p.m6.useSampleComps` 設為 `false`。
- 「把目前案例倒進文字框」可以把現用案例倒出來改一兩筆再貼回去。

**（b）永久換掉種子資料**

改 `js/data/comps.js` 的 `TD.data.comps.rows` 陣列。**欄位名稱不可改**：

```
id, addr, district, unitPricePing, areaPing, ageYears, floor,
totalFloors, distanceM, year, type
```

同時務必改 `_meta`：把 `synthetic: true` 改成 `false`、
改 `source`（寫明資料來源與擷取日期）、改 `note`（現在寫的是「此為合成示範資料」，
換成真資料後留著會誤導人）、改 `asOf`。

**資料品質提醒**（會直接決定 收入 走哪條路）：

- 樣本 **≥ 8 筆**且四個自變數（屋齡、樓層、坪數、距離）**不共線**時才走特徵價格迴歸；
  不足就退回加權比價並自動降一級信心。
- 實價登錄的建物面積**含不含車位**、有沒有裝潢或增建，會直接污染迴歸。
  清資料時務必統一。
- `distanceM` 是與本案基地的直線距離，需要自己算或估。
- 標的條件（收入 頁的「標的條件」四欄）落在樣本範圍外就是外插，引擎會降一級信心。

### 5.4 調整成本假設

**檔案**：`js/data/cost.js`

| 要改什麼 | 改哪個欄位 |
|---|---|
| 營建單價 | `construction.rows` 裡三列的 `perPing`／`low`／`high`（元／坪，地上樓地板）。`id` 是 `rc12`／`rc25`／`src25up`，「進階假設 → 成本」的營建類型下拉靠這個 `id`，改 id 要同步改專案的 `m7.constructionKey` |
| 地下室與拆除 | `construction.basementPerPing`（元／坪，地下樓地板）、`construction.demolitionPerPing`（元／坪，既有建物樓地板） |
| 車位售價 | `parkingPricePerStall`（元／個，目前不分平面與機械） |
| 融資條件 | `finance.landLTV`／`landRate`／`constLTV`／`constRate`（成數與年利率，一律小數；`0.028` = 2.8%） |
| 軟成本與稅 | `soft.sgaRate` 管銷／`marketingRate` 廣告銷售含代銷佣金／`designRate` 設計監造／`taxRateOther` 其他稅費規費／`profitTaxRate` 利潤稅率 |
| 時程 | `schedule.planMonths`／`buildMonths`／`handoverMonths`／`presaleStartMonth`（單位皆為月；`presaleStartMonth` 從 t=0 起算） |
| 物價指數 | `priceIndex.value`（目前是 `null`，代表不做物價調整）與 `asOf`、`source` |
| 獎勵組合首輪預估單價 | `fallbackUnitPricePing` 與 `defaultUnitPricePing`（容積獎勵第一次試算時還沒有比價單價，用這個保守值；**不要拿它做任何對外報告**） |

**只想改一個專案、不想動資料檔**：展開左欄的「進階假設 → 成本」填就好。
`project.m7` 裡每個欄位為 `null` 代表「沿用 `js/data/cost.js` 的預設值」，
**`null` 不是 0**。填了值就以你填的為準；右欄「成本結構」明細的「計算基礎」與「來源」兩欄
會逐列告訴你哪些是你填的、哪些是回落到預設值。

改完記得把該區塊的 `verified` 與 `source` 一起更新，
並回到 `docs/DATA-VERIFICATION.md` 勾掉對應那一列，填上負責人與查證日期。

### 5.5 其他常見擴充

- **法規索引**：`js/data/laws.js`。新增一個 key（大寫英文）填 `name`／`article`／`url`／`summary`。`url` **一律留 `null`** —— 全國法規資料庫的深連結會隨改版失效，猜一個比沒有更糟；`TD.data.lawLink()` 只回官方入口首頁，UI 另外提供「複製法規名稱」按鈕。`summary` 是自撰摘要，字串裡已標明「非法條原文」，請保留這個標記。
- **A／B／C 客戶版本、多檢視註冊（`TD.registerView`）與簡報模式都已整條移除**，不要再加回來。
  現在只有一個頁面：左欄輸入、右欄結果。要加一塊新的結果，就在 `js/ui/results.js`（①～⑤）或
  `js/ui/details.js`（⑥ 明細）裡多回傳一段 HTML 字串，用 `TD.ui.sec(id, 標題, 內容, 是否展開)` 包起來即可；
  收合狀態由 `js/main.js` 統一管理，不需要自己碰 `localStorage`。
  **新區塊的每個數字一律走 `TD.ui.num`**，算不出來就讓它輸出「—」，不要自己 `toFixed`。
- **介面上不得出現引擎內部的代號與欄位路徑。** 引擎回傳的說明字串先過 `TD.ui.zh()` 再輸出；
  新的欄位路徑請在 `js/ui/common.js` 的 `LABELS` 補一個中文名。
  `tools/checkall.sh` 第 8d 關掃原始碼，`tools/smoke.js` 第 20 項掃渲染後的輸出，兩關都要過。
- **不要改**：`docs/SPEC.md`、`docs/UI-V2.md`、`js/lib/fmt.js`、`js/lib/value.js`、`js/lib/math.js`。`index.html` 的 script 清單與順序已經排好，新增檔案才需要加一行。
- **不要建立 `js/lib/ai.js`**，本專案不含任何 API 呼叫。
