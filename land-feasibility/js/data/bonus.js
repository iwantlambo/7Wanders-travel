/* 容積獎勵目錄：開發制度（一般建照／產業獎勵／危老／都更）互斥擇一，各制度可申請的獎勵項目、法定成數、前提、取得代價與時程。*/
window.TD = window.TD || {};
(function (TD) {
  'use strict';

  TD.data = TD.data || {};

  /* ------------------------------------------------------------------
     單位與語意約定（m4 讀這份資料時請照此解讀）

     1. pct 一律是「占基準容積」的比例（0.06 = 6%）。有些項目的成數要依基地條件計算
        （綜合設計、危老規模、都更規模、產業投資），這些項目的 pct 為 null，
        由 calc(ctx) 依基地面積、建蔽率、容積率等算出，算出 0 代表本案不適用。
     2. bucket 決定封頂方式，各制度的 caps 寫在 REGIMES 裡：
        'reg'   制度型獎勵（危老 1.3 倍、都更 1.5 倍）
        'extra' 危老時程＋規模獎勵（條例第6條第4項：合計不得超過基準容積 10%，不受 1.3 倍限制）
        'open'  綜合設計開放空間（臺灣省施行細則第34條之3：非都更地區除增額容積與容積移轉外合計 1.2 倍）
        'tod'   大眾運輸導向增額容積（向政府價購）
        'ind'   工業區產業獎勵：新增投資、能源管理、營運總部（新北市工業區立體化方案合計上限基準容積 20%）
        'indDon' 工業區捐贈產業空間或繳納回饋金（上限 30%；產業獎勵含容積移轉合計不得超過 50%）
        'tdr'   容積移轉（都市計畫容積移轉實施辦法第8條：30%，整體開發／都更地區 40%）
     3. 取得成本（cost）四種：
        'design'   設計與標章增量 = 估計營建費 × costRateOfHard
        'purchase' 向市場或政府購買容積 = 增加容積坪 × 樓地板地價 × landRatio
                   （樓地板地價 = 同區同分區土地成交中位數 ÷ 容積率，取自實價登錄）
        'donate'   捐贈樓地板（社福設施、產業空間）= 增加容積坪 × 營建單價 × buildRatio
        'none'     無直接取得成本（代價寫在 tradeoff）
     4. monthsAdd 是相對於該制度 baseMonths 另外增加的審議與設計月數（實務經驗值）。
     5. risk 為 'low' | 'mid' | 'high'：申請後拿不到、或拿到的成數低於本表的風險。
     ------------------------------------------------------------------ */

  var HR_LAW = '都市危險及老舊建築物建築容積獎勵辦法';
  var HR_ACT = '都市危險及老舊建築物加速重建條例';
  var UR_LAW = '都市更新建築容積獎勵辦法';
  var UR_ACT = '都市更新條例';
  var TDR_LAW = '都市計畫容積移轉實施辦法';
  var BT_LAW = '建築技術規則建築設計施工編';

  var META = {
    title: '容積獎勵目錄',
    asOf: '2026-10-03',
    verified: true,
    source: HR_ACT + '（112.12.6 修正）、' + HR_LAW + '（114.3.4 修正）、' + UR_ACT + '（113.11.13 修正）、'
          + UR_LAW + '（114.1.13 修正）、' + TDR_LAW + '、' + BT_LAW + '第十五章（綜合設計）、'
          + '都市計畫法臺灣省施行細則第34條之3、第34條之5、新北市工業區立體化方案、新北市 TOD 增額容積規定',
    note: '成數為法規所定的額度；能不能拿、拿幾成，最終取決於主管機關審議與個案條件。',
    tdrCapOfBase: 0.30,
    tdrCapOfBaseUR: 0.40,
    pctBasis: '所有百分比均為「占基準容積」的比例，以小數表示（0.06 = 6%）',
    warning: '容積獎勵能不能拿、拿幾成，最終取決於主管機關審議。本目錄用來排序「值不值得做」，不能當作核准的預期。'
  };

  /* ---------------- 制度（互斥，一個案子只能選一條路） ---------------- */

  var REGIMES = [
    {
      id: 'NONE',
      name: '一般建照（不走更新／危老）',
      lawName: BT_LAW + '；' + TDR_LAW,
      article: '',
      caps: { open: 0.20, tod: 0.50, tdr: 0.30 },
      baseMonths: 12,
      baseRisk: 'low',
      allows: ['OPEN', 'TOD', 'TDR'],
      prereq: { zoneCls: null, consent: '土地處分依土地法第34條之1（多數決）；單獨所有權人自行決定。' },
      note: '素地或整合完成的基地走一般建照，時程最短；可用的容積來源只有綜合設計（住宅區、商業區）、'
          + 'TOD 增額容積（捷運站周邊）與容積移轉。'
    },
    {
      id: 'IND',
      name: '產業獎勵（工業區立體化）',
      lawName: '新北市工業區立體化方案；都市計畫法臺灣省施行細則第34條之5',
      article: '',
      caps: { ind: 0.20, indDon: 0.30, tdr: 0.30, total: 0.50 },
      baseMonths: 15,
      baseRisk: 'mid',
      allows: ['IND_INVEST', 'IND_ENERGY', 'IND_HQ', 'IND_DONATE', 'TDR'],
      prereq: { zoneCls: '工', maxFar: 2.4, excludeCities: ['臺北市'],
                consent: '須提出興辦事業計畫經工業主管機關同意，建物限供工業或產業及其必要附屬設施使用。' },
      note: '適用於工業區（基準容積率 240% 以下）：新增投資每公頃逾 4.5 億元，每再增加 1,000 萬元獎勵 1%，'
          + '上限 15%；能源管理 2%、屋頂太陽光電 3%；新北市另有營運總部 5%；捐贈產業空間或繳納回饋金'
          + '上限 30%；合計（含容積移轉）不得超過基準容積 50%。'
    },
    {
      id: 'HR',
      name: '危老重建',
      lawName: HR_ACT,
      article: '第6條',
      caps: { reg: 0.30, extra: 0.10, tdr: 0.30 },
      baseMonths: 18,
      baseRisk: 'mid',
      allows: ['HR_STATUS', 'HR_ORIG', 'HR_SETBACK', 'SEISMIC', 'GREEN', 'SMART', 'BARRIER', 'HR_SCALE', 'TDR'],
      prereq: { minAgeYears: 30, needBuilding: true, deadline: '2027-05-31',
                consent: '須取得重建計畫範圍內全體土地及合法建築物所有權人同意（條例第5條），一戶不同意就不可行。' },
      note: '適用於都市計畫範圍內經評估為危險、或屋齡 30 年以上耐震能力不足之合法建築物（條例第3條）；'
          + '重建計畫申請期限至 116 年 5 月 31 日（條例第5條）。獎勵後容積不得超過 1.3 倍基準容積或 1.15 倍原建築容積；'
          + '時程獎勵已於施行後第 8 年（114 年 5 月）屆滿，現為 0%；規模獎勵另計，與時程獎勵合計不超過 10%。'
    },
    {
      id: 'UR',
      name: '都市更新',
      lawName: UR_ACT,
      article: '第65條',
      caps: { reg: 0.50, tdr: 0.40 },
      baseMonths: 36,
      baseRisk: 'high',
      allows: ['UR_STATUS', 'UR_ORIG', 'GREEN', 'SMART', 'BARRIER', 'SEISMIC', 'UR_TIME', 'UR_SCALE', 'UR_COOP', 'UR_SOCIAL', 'TDR'],
      prereq: { minSiteM2: 1000, minAgeYears: 30, needBuilding: true,
                consent: '事業計畫報核須達都市更新條例第37條同意比率（劃定更新地區：人數與面積均過半；'
                       + '自劃更新單元：均超過四分之三；面積均超過十分之九者人數不計）。' },
      note: '獎勵後容積不得超過 1.5 倍基準容積（條例第65條）；直轄市、縣（市）得以自治法規另訂獎勵，'
          + '上限 0.2 倍基準容積（本表未列，個案另計）。更新單元須符合各縣市更新單元劃定基準（常見：面積 1,000 ㎡ 以上、'
          + '屋齡 30 年以上建物占一定比例）。'
    }
  ];

  /* ---------------- 獎勵項目 ---------------- */

  var BONUSES = [
    /* ===== 一般建照 ===== */
    {
      id: 'OPEN', name: '綜合設計（開放空間）', lawName: BT_LAW, article: '第281條至第287條',
      pct: null, calc: 'open', bucket: 'open',
      cost: 'design', costRateOfHard: 0.01, monthsAdd: 6, risk: 'mid',
      requires: { zoneCls: ['住', '商'] },
      tradeoff: '地面層必須留設開放空間供公眾通行，一樓可銷售面積與店面價值減少，配置受限；'
              + '臨路部分自道路中心線退縮 6 公尺、10 公尺範圍內高度不超過 15 公尺（第286條），'
              + '開放空間維護責任長期留給管委會。',
      note: '僅適用住宅區、商業區（及文教區、風景區、機關用地、市場用地）；基地臨接 8 公尺以上道路、連續臨接 25 公尺以上，'
          + '商業區面積 1,000 ㎡、住宅區 1,500 ㎡ 以上（第282條）。增加樓地板 = 開放空間有效面積 × 鼓勵係數'
          + '（容積率 × 2/5，住宅區 0.5～1.5、商業區上限 2.5，第286條）；有效面積不得少於法定空地 60%（第287條）。'
          + '本系統以法定空地 60% 為有效面積試算；工業區不適用。'
    },
    {
      id: 'TOD', name: '大眾運輸導向增額容積（TOD）', lawName: '新北市捷運及鐵路場站周邊地區細部計畫土地使用分區管制要點', article: '',
      pct: null, calc: 'tod', bucket: 'tod',
      cost: 'purchase', landRatio: 1.0, monthsAdd: 9, risk: 'mid',
      requires: { cities: ['新北市', '桃園市'] },
      tradeoff: '增額容積須向政府繳納價金（由估價者查估，約等於該容積的土地價值），並須配合公益性設施、'
              + '人行環境改善或開放空間；須經都市設計審議。',
      note: '新北市 TOD3.0（66 處捷運與鐵路場站）：場站周邊 150／300 公尺內最高 50%（提供公益設施）、'
          + '一般 20%；400／500 公尺內 10%～20%。本系統以 300 公尺內 20%、500 公尺內 10% 試算，'
          + '須輸入基地與捷運站距離才列入。'
    },
    {
      id: 'TDR', name: '容積移轉', lawName: TDR_LAW, article: '第8條、第9條、第9條之1',
      pct: 0.30, bucket: 'tdr',
      cost: 'purchase', landRatio: 0.9, monthsAdd: 6, risk: 'mid',
      requires: {},
      tradeoff: '容積是買來的：捐贈公共設施保留地（送出基地）或折繳代金。代金由三家以上估價者查估，'
              + '新北市計算為「含容積移入之基地價格－未含容積移入之基地價格」，約等於移入容積的土地價值。',
      note: '接受基地可移入容積以基準容積 30% 為原則，整體開發地區、實施都市更新地區或面臨永久性空地者最高 40%（第8條）。'
          + '本系統成本以「同區同分區土地成交中位數 ÷ 容積率 × 0.9」估算每坪容積價格。'
    },

    /* ===== 產業獎勵（工業區） ===== */
    {
      id: 'IND_INVEST', name: '新增投資', lawName: '都市計畫法臺灣省施行細則', article: '第34條之5第1項',
      pct: null, calc: 'invest', bucket: 'ind',
      cost: 'none', monthsAdd: 3, risk: 'mid',
      requires: { zoneCls: ['工'] },
      tradeoff: '必須提出擴大投資或產業升級轉型之興辦事業計畫並經工業主管機關同意，建物限工業與產業使用；'
              + '銷售對象限於符合工業使用的買方，去化速度與單價低於住宅。',
      note: '平均每公頃新增投資（不含土地）超過 4.5 億元者，每再增加 1,000 萬元獎勵 1%，上限 15%。'
          + '本系統以估計營建費視為新增投資額試算。'
    },
    {
      id: 'IND_ENERGY', name: '能源管理與太陽光電', lawName: '都市計畫法臺灣省施行細則', article: '第34條之5第2項',
      pct: 0.05, bucket: 'ind',
      cost: 'design', costRateOfHard: 0.006, monthsAdd: 0, risk: 'low',
      requires: { zoneCls: ['工'] },
      tradeoff: '設置能源管理系統（2%）及屋頂太陽光電、水平投影面積占屋頂可設置區域 50% 以上（3%），'
              + '須於取得使用執照前完成設置。',
      note: '能源管理系統 2%、太陽光電 3%，合計 5%。'
    },
    {
      id: 'IND_HQ', name: '營運總部', lawName: '新北市工業區立體化方案', article: '',
      pct: 0.05, bucket: 'ind',
      cost: 'none', monthsAdd: 3, risk: 'high',
      requires: { zoneCls: ['工'], cities: ['新北市'] },
      tradeoff: '須由取得營運總部認定之企業使用，建商自行銷售的廠辦案很難符合，通常只有自用或整棟出售給單一企業時可用。',
      note: '新北市工業區立體化方案：新增投資、能源管理與營運總部合計以基準容積 20% 為上限。'
    },
    {
      id: 'IND_DONATE', name: '捐贈產業空間或繳納回饋金', lawName: '都市計畫法臺灣省施行細則', article: '第34條之5第3項',
      pct: 0.30, bucket: 'indDon',
      cost: 'donate', buildRatio: 1.0, monthsAdd: 6, risk: 'mid',
      requires: { zoneCls: ['工'] },
      tradeoff: '捐贈建築物部分樓地板（含對應土地持分）集中作產業空間，或依規定繳納回饋金；'
              + '捐贈部分免計容積、依捐贈面積給予獎勵（一倍為上限），等於「多蓋一份送一份」。',
      note: '上限基準容積 30%；新北市立體化方案：獎勵逾 15% 者須捐贈公益空間或繳納回饋金，總額度以基準容積 50% 為上限。'
    },

    /* ===== 危老重建 ===== */
    {
      id: 'HR_STATUS', name: '建物危險或耐震不足', lawName: HR_LAW, article: '第4條',
      pct: null, calc: 'hrStatus', bucket: 'reg',
      cost: 'none', monthsAdd: 0, risk: 'low',
      requires: { regimes: ['HR'] },
      tradeoff: '須委託評定機構完成結構安全性能評估（耐震初評），費用約數萬至數十萬元，時間約 2～4 個月。',
      note: '條例第3條第1項第1款（危險建築）10%、第2款（評估未達最低等級）8%、第3款（屋齡 30 年以上耐震能力不足且改善不具效益或無昇降設備）6%，不得重複。'
    },
    {
      id: 'HR_ORIG', name: '原建築容積高於基準容積', lawName: HR_LAW, article: '第3條',
      pct: null, calc: 'orig', bucket: 'reg',
      cost: 'none', monthsAdd: 0, risk: 'low',
      requires: { regimes: ['HR'] },
      tradeoff: '須以原建造執照或使用執照證明原建築容積。',
      note: '原建築容積高於基準容積者，獎勵基準容積 10%，或依原建築容積建築。'
    },
    {
      id: 'HR_SETBACK', name: '退縮建築（4 公尺）', lawName: HR_LAW, article: '第5條',
      pct: 0.10, bucket: 'reg',
      cost: 'none', monthsAdd: 0, risk: 'low',
      requires: { regimes: ['HR'] },
      tradeoff: '自計畫道路及現有巷道退縮淨寬 4 公尺以上並設無遮簷人行步道，與鄰地境界線淨寬不小於 2 公尺；'
              + '一樓可建築範圍縮小，小基地常因此排不下車道與梯廳。',
      note: '退縮 4 公尺以上 10%，退縮 2 公尺以上 8%，不得重複。'
    },

    /* ===== 都市更新 ===== */
    {
      id: 'UR_STATUS', name: '建物危險或耐震不足', lawName: UR_LAW, article: '第6條',
      pct: null, calc: 'urStatus', bucket: 'reg',
      cost: 'none', monthsAdd: 0, risk: 'low',
      requires: { regimes: ['UR'] },
      tradeoff: '須經建築主管機關通知限期拆除，或結構安全性能評估未達最低等級。',
      note: '危險建築 10%、結構安全性能評估未達最低等級 8%，不得累計。'
    },
    {
      id: 'UR_ORIG', name: '原建築容積高於基準容積', lawName: UR_LAW, article: '第5條',
      pct: null, calc: 'orig', bucket: 'reg',
      cost: 'none', monthsAdd: 0, risk: 'low',
      requires: { regimes: ['UR'] },
      tradeoff: '須以原建造執照或使用執照證明原建築容積。',
      note: '原建築容積高於基準容積者，得依原建築容積建築或給予基準容積 10%。'
    },
    {
      id: 'UR_TIME', name: '時程獎勵', lawName: UR_LAW, article: '第14條',
      pct: null, calc: 'urTime', bucket: 'reg',
      cost: 'none', monthsAdd: 0, risk: 'mid',
      requires: { regimes: ['UR'] },
      tradeoff: '須於期限內擬訂事業計畫報核，壓縮整合與規劃時間。',
      note: '108 年 5 月 15 日修正施行後第 6～10 年（113 年 5 月 16 日至 118 年 5 月 15 日）報核者：'
          + '劃定應實施更新之地區 5%，未經劃定之地區 3.5%。本系統預設未經劃定（3.5%）。'
    },
    {
      id: 'UR_SCALE', name: '基地規模', lawName: UR_LAW, article: '第15條',
      pct: null, calc: 'urScale', bucket: 'reg',
      cost: 'none', monthsAdd: 6, risk: 'mid',
      requires: { regimes: ['UR'] },
      tradeoff: '必須把基地做大：多整合一戶就多一份談判成本。',
      note: '含完整計畫街廓 5%；土地面積 3,000 ㎡ 以上未滿 1 萬 ㎡：5%，每增加 100 ㎡ 另加 0.3%；1 萬 ㎡ 以上 30%。'
    },
    {
      id: 'UR_COOP', name: '協議合建（20 戶以上）', lawName: UR_LAW, article: '第16條',
      pct: 0.05, bucket: 'reg',
      cost: 'none', monthsAdd: 0, risk: 'high',
      requires: { regimes: ['UR'], minOwners: 20 },
      tradeoff: '更新前門牌戶達 20 戶以上，且報核時經全體土地及合法建築物所有權人同意以協議合建實施。',
      note: '基準容積 5%。'
    },
    {
      id: 'UR_SOCIAL', name: '提供社會福利或公益設施', lawName: UR_LAW, article: '第7條',
      pct: 0.15, bucket: 'reg',
      cost: 'donate', buildRatio: 1.1, monthsAdd: 9, risk: 'high',
      requires: { regimes: ['UR'] },
      tradeoff: '須自費興建主管機關公告之社福或公益設施，建物及土地產權無償登記為公有；'
              + '設施不計入容積，獎勵等於捐出的樓地板（係數 1），等於多蓋一份送一份。',
      note: '獎勵額度以基準容積 30% 為上限；本系統以 15% 試算。'
    },

    /* ===== 危老與都更共用 ===== */
    {
      id: 'SEISMIC', name: '耐震設計標章', lawName: HR_LAW + '第6條／' + UR_LAW + '第13條', article: '',
      pct: 0.10, bucket: 'reg',
      cost: 'design', costRateOfHard: 0.03, monthsAdd: 3, risk: 'low',
      requires: { regimes: ['HR', 'UR'] },
      tradeoff: '結構外審與標章評定，鋼筋混凝土用量增加；須於使用執照前繳保證金、使照後兩年內取得標章，'
              + '未取得保證金不予退還。',
      note: '取得耐震設計標章 10%；住宅性能評估結構安全第一級 6%、第二級 4%、第三級 2%。'
    },
    {
      id: 'GREEN', name: '綠建築（黃金級）', lawName: HR_LAW + '第7條／' + UR_LAW + '第10條', article: '',
      pct: 0.08, bucket: 'reg',
      cost: 'design', costRateOfHard: 0.02, monthsAdd: 3, risk: 'low',
      requires: { regimes: ['HR', 'UR'] },
      tradeoff: '外殼節能、綠化保水與設備增量工程費；須繳保證金並於使照後兩年內取得標章。',
      note: '候選綠建築證書：鑽石級 10%、黃金級 8%、銀級 6%（基地 500 ㎡ 以上不適用銅級、合格級）。本系統以黃金級試算。'
    },
    {
      id: 'SMART', name: '智慧建築（銀級）', lawName: HR_LAW + '第8條／' + UR_LAW + '第11條', article: '',
      pct: 0.06, bucket: 'reg',
      cost: 'design', costRateOfHard: 0.012, monthsAdd: 2, risk: 'low',
      requires: { regimes: ['HR', 'UR'] },
      tradeoff: '弱電、監控與能源管理系統，設備折舊快、後續維護由住戶承擔。',
      note: '候選智慧建築證書：鑽石級 10%、黃金級 8%、銀級 6%。本系統以銀級試算。'
    },
    {
      id: 'BARRIER', name: '無障礙住宅建築標章', lawName: HR_LAW + '第9條／' + UR_LAW + '第12條', article: '',
      pct: 0.05, bucket: 'reg',
      cost: 'design', costRateOfHard: 0.006, monthsAdd: 1, risk: 'low',
      requires: { regimes: ['HR', 'UR'], products: ['住宅大樓', '華廈', '透天厝'] },
      tradeoff: '通路、電梯與衛浴淨尺寸放大，公設比上升、室內坪效下降。',
      note: '取得無障礙住宅建築標章 5%；住宅性能評估無障礙環境第一級 4%、第二級 3%。'
    },

    /* ===== 危老規模 ===== */
    {
      id: 'HR_SCALE', name: '基地規模（危老）', lawName: HR_ACT, article: '第6條第3項、第4項',
      pct: null, calc: 'hrScale', bucket: 'extra',
      cost: 'none', monthsAdd: 0, risk: 'low',
      requires: { regimes: ['HR'] },
      tradeoff: '合併鄰接基地時，合併部分面積不得超過原危老建物基地面積，且最高 1,000 ㎡（第6條第5項）。',
      note: '基地達 200 ㎡ 者 2%，每增加 100 ㎡ 另加 0.5%；與時程獎勵合計不得超過基準容積 10%，不受 1.3 倍上限限制。'
    }
  ];

  /* ---------------- 依基地條件計算的成數 ---------------- */

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /* c：{ siteM2, bcr, far, baseFloorM2, zoneCls, roadWidth, frontageM, hrStatus, buildingAgeYears,
          existingFloorM2, hardCostEst, mrtDistanceM, city, urDesignated } */
  var CALC = {
    open: function (c) {
      var minSite = (c.zoneCls === '商') ? 1000 : 1500;
      if (c.zoneCls !== '住' && c.zoneCls !== '商') return { pct: 0, why: '綜合設計僅適用住宅區、商業區等分區（' + BT_LAW + '第282條），本案分區不適用' };
      if (!(c.siteM2 >= minSite)) return { pct: 0, why: '基地面積未達 ' + minSite + ' ㎡（第282條）' };
      if (!(c.roadWidth >= 8)) return { pct: 0, why: '基地須臨接寬度 8 公尺以上道路（第282條）' };
      if (!(c.far > 0) || !(c.bcr > 0)) return { pct: 0, why: '缺建蔽率或容積率' };
      var I = c.far * 0.4;
      I = (c.zoneCls === '商') ? Math.min(I, 2.5) : clamp(I, 0.5, 1.5);
      var S = c.siteM2 * (1 - c.bcr) * 0.6;
      return { pct: Math.round(S * I / (c.siteM2 * c.far) * 1e4) / 1e4,
               why: '開放空間有效面積以法定空地 60% 計（' + Math.round(S) + ' ㎡）× 鼓勵係數 ' + Math.round(I * 100) / 100 };
    },
    tod: function (c) {
      var d = c.mrtDistanceM;
      if (!(typeof d === 'number' && d > 0)) return { pct: 0, why: '未輸入基地與最近捷運站（或鐵路車站）的距離' };
      if (d <= 300) return { pct: 0.20, why: '距場站 ' + d + ' 公尺（300 公尺內，一般 20%；提供公益設施最高 50%）' };
      if (d <= 500) return { pct: 0.10, why: '距場站 ' + d + ' 公尺（500 公尺內，10%～20%）' };
      return { pct: 0, why: '距場站 ' + d + ' 公尺，超過 500 公尺' };
    },
    invest: function (c) {
      var ha = c.siteM2 / 10000;
      if (!(ha > 0) || !(c.hardCostEst > 0)) return { pct: 0, why: '缺基地面積或營建費估計' };
      var perHa = c.hardCostEst / ha;
      if (perHa <= 4.5e8) return { pct: 0, why: '每公頃新增投資 ' + Math.round(perHa / 1e6) / 100 + ' 億元未超過 4.5 億元' };
      var pct = Math.min(0.15, Math.floor((perHa - 4.5e8) / 1e7) / 100);
      return { pct: pct, why: '每公頃新增投資約 ' + Math.round(perHa / 1e6) / 100 + ' 億元（以營建費計）' };
    },
    hrStatus: function (c) {
      var m = { danger: [0.10, '危險建築（第3條第1項第1款）'], lowest: [0.08, '結構安全性能評估未達最低等級（第2款）'],
                old30: [0.06, '屋齡 30 年以上耐震能力不足（第3款）'] };
      var s = c.hrStatus;
      if ((!s || s === 'auto') && c.buildingAgeYears >= 30) s = 'old30';
      if (m[s]) return { pct: m[s][0], why: m[s][1] + (c.hrStatus === 'auto' || !c.hrStatus ? '（依屋齡推定，須完成結構安全性能評估）' : '') };
      return { pct: 0, why: '既有建物不符危老條件' };
    },
    urStatus: function (c) {
      if (c.hrStatus === 'danger') return { pct: 0.10, why: '危險建築' };
      if (c.hrStatus === 'lowest') return { pct: 0.08, why: '結構安全性能評估未達最低等級' };
      return { pct: 0, why: '未經評估為危險或未達最低等級（第6條）' };
    },
    orig: function (c) {
      if (c.existingFloorM2 > 0 && c.baseFloorM2 > 0 && c.existingFloorM2 > c.baseFloorM2) {
        return { pct: 0.10, why: '既有建物樓地板 ' + Math.round(c.existingFloorM2) + ' ㎡ 高於基準容積 ' + Math.round(c.baseFloorM2) + ' ㎡' };
      }
      return { pct: 0, why: '原建築容積未高於基準容積' };
    },
    urTime: function (c) {
      return c.urDesignated ? { pct: 0.05, why: '位於劃定應實施更新之地區' } : { pct: 0.035, why: '未經劃定應實施更新之地區' };
    },
    urScale: function (c) {
      var a = c.siteM2;
      if (a >= 10000) return { pct: 0.30, why: '土地面積 1 萬 ㎡ 以上' };
      if (a >= 3000) return { pct: Math.round((0.05 + Math.floor((a - 3000) / 100) * 0.003) * 1e4) / 1e4, why: '土地面積 ' + Math.round(a) + ' ㎡' };
      return { pct: 0, why: '土地面積未達 3,000 ㎡（未含完整計畫街廓）' };
    },
    hrScale: function (c) {
      var a = c.siteM2;
      if (!(a >= 200)) return { pct: 0, why: '基地未達 200 ㎡' };
      return { pct: Math.min(0.10, Math.round((0.02 + Math.floor((a - 200) / 100) * 0.005) * 1e4) / 1e4),
               why: '基地 ' + Math.round(a) + ' ㎡：200 ㎡ 起 2%，每增加 100 ㎡ 加 0.5%' };
    }
  };

  function regimeById(id) {
    var i;
    for (i = 0; i < REGIMES.length; i++) if (REGIMES[i].id === id) return REGIMES[i];
    return null;
  }

  function bonusById(id) {
    var i;
    for (i = 0; i < BONUSES.length; i++) if (BONUSES[i].id === id) return BONUSES[i];
    return null;
  }

  TD.data.bonus = {
    _meta: META,
    regimes: REGIMES,
    bonuses: BONUSES,
    calc: CALC,
    regimeById: regimeById,
    bonusById: bonusById
  };
})(window.TD);
