/* 容積獎勵目錄：制度（都更／危老／不走更新）互斥三選一，加上各獎勵項目的百分比、取得代價與時程。全為種子資料，未經核對。 */
window.TD = window.TD || {};
(function (TD) {
  'use strict';

  TD.data = TD.data || {};

  /* ------------------------------------------------------------------
     單位與語意約定（m4 讀這份資料時請照此解讀）

     1. pctMin / pctTypical / pctMax 一律是「占基準容積」的比例，以小數表示，
        0.06 代表基準容積的 6%。不是占法定容積率，也不是占總樓地板。
     2. bucket 決定封頂方式：
        'regime'  併入該制度的 capOfBase 上限一起封頂
        'tdr'     走 _meta.tdrCapOfBase 自己的上限
        'outside' 不併入上述兩個上限（OPEN、TOD 屬之：它們只在 NONE 制度下適用，
                  而 NONE 的 capOfBase 為 0，若併入會被歸零。這兩項各自的法定上限
                  必須另行查證，不要誤以為 outside 等於沒有上限）
     3. 取得成本約定：
        costTotal = costPerGainedPing × 增加可售坪數
                  + costRateOfPrice × 預估單價（元／坪） × 增加可售坪數
        costPerGainedPing 單位為「元／每增加一坪可售面積」。
        兩個欄位可以同時為 0，代表沒有直接可貨幣化的取得成本，
        但不代表沒有代價 —— 代價寫在 tradeoff 欄，那一欄才是這個模組的重點。
     4. monthsAdd 是相對於該制度 baseMonths 另外增加的審議／設計月數。
     5. risk 為 'low' | 'mid' | 'high'，指「申請後拿不到、或拿到的成數低於
        pctTypical」的風險，不是工程風險。
     6. 所有數值 verified:false。條號填不出來一律寫 '待查'，不得編造。
     ------------------------------------------------------------------ */

  var META = {
    title: '容積獎勵目錄 種子資料',
    asOf: '2026-09-26',
    verified: false,
    source: '都市更新條例、都市危險及老舊建築物加速重建條例，及其各自之建築容積獎勵辦法、各該都市計畫書',
    note: '全部百分比、級距與上限皆為種子資料，尚未與法規原文及個案所在都市計畫書逐條核對。'
        + '獎勵辦法逐年修正、地方政府另有自治規定，上線前必須逐條查證，見 docs/DATA-VERIFICATION.md。',
    tdrCapOfBase: 0.30,
    outsideCapOfBase: 0.20,
    outsideCapNote: 'bucket 為 outside 的項目（OPEN、TOD）不併入 regime.capOfBase，但不代表無上限。'
                  + '此欄是暫設的合計上限佔位值，供 m4 封頂用，真正的上限訂在建築技術規則與各該都市計畫書，'
                  + '必須逐案查證後改寫。',
    pctBasis: '所有百分比均為「占基準容積」的比例，以小數表示（0.06 = 6%）',
    costBasis: 'costTotal = costPerGainedPing × 增加可售坪數 ＋ costRateOfPrice × 預估單價 × 增加可售坪數',
    warning: '容積獎勵能不能拿、拿幾成，最終取決於主管機關審議。本目錄只用來排序「值不值得做」，不能當作核准的預期。'
  };

  /* ---------------- 制度（互斥，一個案子只能選一條路） ---------------- */

  var REGIMES = [
    {
      id: 'UR',
      name: '都市更新',
      lawName: '都市更新條例',
      article: '第65條',
      capOfBase: 0.50,
      altCapNote: '或原建築容積加基準容積之一定比例，以較高者為準；實際上限仍須依個案所在都市計畫、'
                + '主管機關審議與當年度獎勵辦法認定，本系統以基準容積 50% 為種子上限。',
      prereq: {
        minSiteM2: 1000,
        minAgeYears: 30,
        consentNote: '需達法定同意比例（所有權人人數與土地面積、建築物樓地板面積合計之比例），'
                   + '門檻依是否位於更新地區、實施方式（協議合建或權利變換）而不同，須逐案查證。'
                   + '未達同意比例即無法報核，這是時程失控的主因。'
      },
      baseMonths: 36,
      baseRisk: 'high',
      allows: ['GREEN', 'SMART', 'SEISMIC', 'BARRIER', 'SCALE', 'PUBLIC', 'TDR'],
      verified: false,
      note: '第65條為容積獎勵上限之依據條號；各獎勵細目訂於「都市更新建築容積獎勵辦法」，該辦法條號與級距待查。'
    },
    {
      id: 'HR',
      name: '危老重建',
      lawName: '都市危險及老舊建築物加速重建條例',
      article: '第6條',
      capOfBase: 0.30,
      altCapNote: '或原建築容積之一定倍數，以較高者為準；本系統以基準容積 30% 為種子上限。'
                + '倍數與上限歷經多次修正，必須查當年度條文。',
      prereq: {
        minSiteM2: 0,
        minAgeYears: 30,
        consentNote: '需土地及合法建築物所有權人「全體同意」（100%）。這是危老與都更最關鍵的差別：'
                   + '一戶不同意就不可行，沒有多數決可用。同意書取得難度必須在評估階段就問清楚。'
      },
      baseMonths: 18,
      baseRisk: 'mid',
      allows: ['GREEN', 'SMART', 'SEISMIC', 'BARRIER', 'SCALE', 'TIME', 'TDR'],
      verified: false,
      note: '第6條為容積獎勵之依據；各細項獎勵值訂於「都市危險及老舊建築物建築容積獎勵辦法」，條號與級距待查。'
          + '另須符合危險或老舊之認定（屋齡、耐震評估、有無電梯），認定結果由主管機關為之。'
    },
    {
      id: 'NONE',
      name: '不走更新／危老',
      lawName: '（無單一法源，依各該都市計畫書與建築技術規則個案認定）',
      article: '待查',
      capOfBase: 0,
      altCapNote: '不適用更新或危老的獎勵上限；開放空間、大眾運輸導向等獎勵各自依其法令另有上限，'
                + '本系統將此制度的 capOfBase 設為 0，代表沒有「制度型」獎勵可併入。',
      prereq: {
        minSiteM2: 0,
        minAgeYears: 0,
        consentNote: '仍須取得土地處分所需之共有人同意，見土地法第34條之1。'
      },
      baseMonths: 12,
      baseRisk: 'low',
      allows: ['OPEN', 'TOD', 'TDR'],
      verified: false,
      note: '素地或整合完成的基地走一般建照，時程最短、變數最少，但拿不到更新／危老的大額獎勵。'
          + '本制度下 OPEN 與 TOD 的上限不在 capOfBase 內處理，須另行查證個案上限。'
    }
  ];

  /* ---------------- 獎勵項目 ---------------- */

  var BONUSES = [
    {
      id: 'GREEN',
      name: '綠建築',
      lawName: '都市更新建築容積獎勵辦法／都市危險及老舊建築物建築容積獎勵辦法',
      article: '待查',
      pctMin: 0.02,
      pctTypical: 0.06,
      pctMax: 0.10,
      bucket: 'regime',
      costType: 'design',
      costPerGainedPing: 45000,
      costRateOfPrice: 0,
      monthsAdd: 3,
      risk: 'low',
      requires: { regimes: ['UR', 'HR'], minSiteM2: 0, minAgeYears: 0 },
      tradeoff: '代價是外殼、設備與綠化的增量工程費，加上標章申請與第三方評定費用；'
              + '等級越高（銅→銀→黃金→鑽石）獎勵越多，但增量成本非線性上升。'
              + '取得後仍有標章維護與複審義務，交屋後的管理成本會落到管委會身上，是銷售期要先講清楚的事。',
      verified: false,
      note: '級距依標章等級而定，種子值取銀級附近的中間值。實際成數須查當年度獎勵辦法與地方自治規定。'
    },
    {
      id: 'SMART',
      name: '智慧建築',
      lawName: '都市更新建築容積獎勵辦法／都市危險及老舊建築物建築容積獎勵辦法',
      article: '待查',
      pctMin: 0.02,
      pctTypical: 0.05,
      pctMax: 0.10,
      bucket: 'regime',
      costType: 'design',
      costPerGainedPing: 60000,
      costRateOfPrice: 0,
      monthsAdd: 2,
      risk: 'low',
      requires: { regimes: ['UR', 'HR'], minSiteM2: 0, minAgeYears: 0 },
      tradeoff: '代價是弱電、監控、能源管理系統的設備費與整合設計費，且這類系統折舊快、'
              + '五到十年後的汰換與維護費用由住戶承擔，容易變成交屋後的客訴來源。'
              + '規劃階段要確認系統規格能撐到標章複審，不要為了拿獎勵裝一堆用不到的設備。',
      verified: false,
      note: '級距依標章等級而定。種子值取中間偏保守，實際成數待查。'
    },
    {
      id: 'SEISMIC',
      name: '耐震設計',
      lawName: '都市更新建築容積獎勵辦法／都市危險及老舊建築物建築容積獎勵辦法',
      article: '待查',
      pctMin: 0.02,
      pctTypical: 0.06,
      pctMax: 0.10,
      bucket: 'regime',
      costType: 'design',
      costPerGainedPing: 55000,
      costRateOfPrice: 0,
      monthsAdd: 3,
      risk: 'low',
      requires: { regimes: ['UR', 'HR'], minSiteM2: 0, minAgeYears: 0 },
      tradeoff: '代價是結構用鋼筋與混凝土數量增加、或採用隔震／制震設備，屬於直接的工程費增量；'
              + '另需結構外審或標章評定，設計變更的彈性會被壓縮。'
              + '好處是銷售說詞強，但要注意增量成本隨樓層數放大，高樓層案未必划算。',
      verified: false,
      note: '耐震標章與一般結構外審的認定不同，成數與適用條件待查。'
    },
    {
      id: 'BARRIER',
      name: '無障礙環境',
      lawName: '都市更新建築容積獎勵辦法／都市危險及老舊建築物建築容積獎勵辦法',
      article: '待查',
      pctMin: 0.01,
      pctTypical: 0.03,
      pctMax: 0.05,
      bucket: 'regime',
      costType: 'design',
      costPerGainedPing: 25000,
      costRateOfPrice: 0,
      monthsAdd: 1,
      risk: 'low',
      requires: { regimes: ['UR', 'HR'], minSiteM2: 0, minAgeYears: 0 },
      tradeoff: '代價是通路、電梯、衛浴的淨尺寸放大，公設比上升、實際可售的室內坪效下降；'
              + '拿到的容積有一部分會被自己吃掉。成數不高但成本也低，通常是順手做的項目。',
      verified: false,
      note: '須達無障礙住宅標章或等同之設計標準，認定方式待查。'
    },
    {
      id: 'SCALE',
      name: '基地規模',
      lawName: '都市更新建築容積獎勵辦法／都市危險及老舊建築物建築容積獎勵辦法',
      article: '待查',
      pctMin: 0.02,
      pctTypical: 0.05,
      pctMax: 0.10,
      bucket: 'regime',
      costType: 'none',
      costPerGainedPing: 0,
      costRateOfPrice: 0,
      monthsAdd: 6,
      risk: 'mid',
      requires: { regimes: ['UR', 'HR'], minSiteM2: 500, minAgeYears: 0 },
      tradeoff: '沒有直接的工程成本，但代價是必須把基地做大：多收一塊畸零地、多談一戶釘子戶，'
              + '換來的是土地取得溢價與整合時間。獎勵成數隨規模級距跳動，'
              + '差一平方公尺就掉一級，規劃前必須先確認級距門檻再決定要不要加碼買地。',
      verified: false,
      note: '級距門檻（基地面積達多少平方公尺給多少成數）都更與危老不同，種子門檻 500 ㎡ 為暫設值，必須查證。'
    },
    {
      id: 'PUBLIC',
      name: '協助取得公益設施',
      lawName: '都市更新條例／都市更新建築容積獎勵辦法',
      article: '待查',
      pctMin: 0.05,
      pctTypical: 0.12,
      pctMax: 0.20,
      bucket: 'regime',
      costType: 'donation',
      costPerGainedPing: 250000,
      costRateOfPrice: 0,
      monthsAdd: 9,
      risk: 'high',
      requires: { regimes: ['UR'], minSiteM2: 0, minAgeYears: 0 },
      tradeoff: '成數最大、代價也最實在：必須自費興建公益設施（托育、長照、社福、集會空間等）'
              + '並無償提供或移轉給政府，等於拿樓地板換樓地板。'
              + '興建成本外還有設施點交前的管理責任、日後共用出入口與管理費分攤的爭議，'
              + '且設施種類與規模由主管機關指定，建商幾乎沒有議價空間。'
              + '審議時間最長，是壓垮時程的常見原因。',
      verified: false,
      note: '成數與設施種類由主管機關個案認定，種子值僅供排序用。costPerGainedPing 為捐贈設施之興建與點交成本估值，待接實績。'
    },
    {
      id: 'OPEN',
      name: '開放空間／綜合設計',
      lawName: '建築技術規則建築設計施工編（實施都市計畫地區建築基地綜合設計）',
      article: '待查',
      pctMin: 0.05,
      pctTypical: 0.10,
      pctMax: 0.20,
      bucket: 'outside',
      costType: 'design',
      costPerGainedPing: 30000,
      costRateOfPrice: 0,
      monthsAdd: 6,
      risk: 'mid',
      requires: { regimes: ['NONE'], minSiteM2: 1000, minAgeYears: 0 },
      tradeoff: '代價是把一塊地面層永久留給公眾通行使用：一樓可銷售面積與店面價值直接減少，'
              + '基地配置受限、車道與出入口位置被綁死，社區私密性下降，'
              + '而且開放空間的清潔、照明與維護責任長期留在管委會。'
              + '住戶事後想圍起來就是違規，這件事必須在銷售時說明白。',
      verified: false,
      note: '綜合設計之獎勵公式、開放空間有效面積計算與上限須依建築技術規則與地方規定核算，條號待查。'
          + '本制度下的上限不在 regime.capOfBase 內，m4 若要封頂須另行查證個案上限。'
    },
    {
      id: 'TOD',
      name: '大眾運輸導向',
      lawName: '各該都市計畫書／地方政府大眾運輸導向發展相關規定',
      article: '待查',
      pctMin: 0.05,
      pctTypical: 0.10,
      pctMax: 0.20,
      bucket: 'outside',
      costType: 'design',
      costPerGainedPing: 40000,
      costRateOfPrice: 0,
      monthsAdd: 9,
      risk: 'high',
      requires: { regimes: ['NONE'], minSiteM2: 0, minAgeYears: 0 },
      tradeoff: '代價通常是配合人行環境改善、留設連通道或轉乘設施、負擔周邊公共設施改善費用，'
              + '並接受都市設計審議對量體、立面與退縮的額外要求。'
              + '適用範圍與捷運場站距離帶綁定，差幾公尺就不適用，'
              + '而且是否給、給多少往往寫在個案的都市計畫書裡，不是通案規定。',
      verified: false,
      note: '必須查明基地是否落在特定都市計畫的 TOD 範圍內，以及該計畫書的獎勵條件；'
          + '不同縣市、不同計畫區規定差異極大，種子值僅為佔位。'
          + 'bucket 標為 outside 代表不併入 regime.capOfBase（NONE 的 capOfBase 為 0），'
          + '但個案仍有其上限，須查該都市計畫書。'
    },
    {
      id: 'TDR',
      name: '容積移轉',
      lawName: '都市計畫容積移轉實施辦法',
      article: '待查',
      pctMin: 0.05,
      pctTypical: 0.15,
      pctMax: 0.30,
      bucket: 'tdr',
      costType: 'purchase',
      costPerGainedPing: 0,
      costRateOfPrice: 0.30,
      monthsAdd: 6,
      risk: 'mid',
      requires: { regimes: ['UR', 'HR', 'NONE'], minSiteM2: 0, minAgeYears: 0 },
      tradeoff: '這一項的取得成本是實打實的現金：容積不是政府送的，是向市場購買（或繳納代金）而來，'
              + 'costRateOfPrice 0.30 代表每增加一坪可售面積，約需支付該坪售價的三成去取得容積。'
              + '代價還包括送出基地的來源必須合法可用、移入比例受上限限制、'
              + '市場行情隨供需與政策波動，簽約前必須實際詢價，不能用本系統的預設值下決策。'
              + '好處是不必等審議大會，時程相對可控。',
      verified: false,
      note: '移入上限依 _meta.tdrCapOfBase（種子值 0.30）另計，不併入 regime.capOfBase。'
          + '實際上限依各該都市計畫與實施辦法規定，且與其他獎勵合計另有總量限制，必須查證。'
          + 'costRateOfPrice 為市場行情估值（占售價比例），非法規數字，逐案詢價。'
    },
    {
      id: 'TIME',
      name: '時程獎勵',
      lawName: '都市危險及老舊建築物建築容積獎勵辦法',
      article: '待查',
      pctMin: 0.00,
      pctTypical: 0.02,
      pctMax: 0.10,
      bucket: 'regime',
      costType: 'none',
      costPerGainedPing: 0,
      costRateOfPrice: 0,
      monthsAdd: 0,
      risk: 'high',
      requires: { regimes: ['HR'], minSiteM2: 0, minAgeYears: 0 },
      tradeoff: '沒有工程成本，代價是時間壓力：這項獎勵逐年遞減，越晚申請成數越低，'
              + '為了卡住當年度成數而壓縮規劃設計與同意書整合的時間，'
              + '事後常以設計變更、追加預算與鄰損爭議的形式把省下的錢還回去。'
              + '評估時要誠實回答：同意書真的來得及在期限前收齊嗎。',
      verified: false,
      note: '逐年遞減，須查當年度規定。本目錄不預設任何特定年度的成數，'
          + 'pctTypical 僅為保守佔位值，實際成數必須以申請當年度之獎勵辦法為準，條號與級距待查。'
    }
  ];

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
    regimeById: regimeById,
    bonusById: bonusById
  };
})(window.TD);
