/* 法規索引：名稱、條號、摘要與查詢連結。摘要皆為本專案自撰，非法條原文。*/
window.TD = window.TD || {};
(function (TD) {
  'use strict';
  TD.data = TD.data || {};

  /* --------------------------------------------------------------------------
     使用說明

     1. 本檔只是「索引」，不是法條全文，也不是法律意見。每個 summary 都是本專案
        自撰的一句話要旨，已在字串內標明「非法條原文」，UI 顯示時請原樣輸出，
        不要去掉這個標記。
     2. url 一律 null。全國法規資料庫的深連結會隨改版失效，猜一個連結比沒有連結更糟，
        所以 TD.data.lawLink() 只回傳官方入口首頁，讓使用者自己搜尋法規名稱。
     3. article 欄查不到就寫 '待查'，絕不編造條號。目前只有土地法第34條之1
        因為 SPEC 明文引用而填了條項，其餘一律待查。
     4. 本系統不連網、不呼叫任何 API；法規更新一律人工查閱後直接改寫本檔。
     5. key 以底線開頭者（_meta）不是法規，列舉時請略過。
     -------------------------------------------------------------------------- */

  var MOJ_HOME = 'https://law.moj.gov.tw/Index.aspx';
  var NOT_TEXT = '（本專案自撰摘要，非法條原文）';

  TD.data.laws = {

    _meta: {
      title: '法規索引 種子資料',
      asOf: '2026-09-26',
      verified: false,
      source: '全國法規資料庫（未逐條核對）',
      home: MOJ_HOME,
      note: '所有 summary 為自撰摘要，非法條原文；url 一律 null，不捏造深連結；'
          + 'article 未確認者一律「待查」。引用到決策文件前，請以官方現行條文為準，'
          + '見 docs/DATA-VERIFICATION.md。'
    },

    /* ---------- 建築法規 ---------- */

    'BUILDING_ACT': {
      name: '建築法',
      article: '待查',
      url: null,
      summary: NOT_TEXT + '建築行為的母法，規範建築許可、建築基地、建築界限與施工管理，'
             + '畸零地合併使用與建築線指定的授權依據亦在本法。'
    },

    'BUILD_TECH': {
      name: '建築技術規則建築設計施工編',
      article: '待查',
      url: null,
      summary: NOT_TEXT + '規定建築物設計與施工的技術標準，包含容積與樓地板面積計算、'
             + '免計容積項目、防火間隔、日照與高度比、停車空間等，是量體試算最核心的技術依據。'
    },

    /* ---------- 土地與產權 ---------- */

    'LAND_ACT_34_1': {
      name: '土地法 第34條之1',
      article: '第34條之1第1項',
      url: null,
      summary: NOT_TEXT + '共有土地或建物的處分、變更及設定負擔，得由共有人過半數且其應有部分'
             + '合計過半數同意行之；應有部分合計逾三分之二者，其人數不予計算。'
             + '這是共有地整合能不能成案的關鍵門檻。'
    },

    'LAND_REG_RULES': {
      name: '土地登記規則',
      article: '待查',
      url: null,
      summary: NOT_TEXT + '規範土地與建物登記的申請、審查與公示程序，'
             + '謄本上的登記原因、權利範圍、他項權利與限制登記（查封、假扣押、假處分、預告登記）'
             + '的意義，皆以本規則為準。'
    },

    'CIVIL_CODE': {
      name: '民法',
      article: '待查',
      url: null,
      summary: NOT_TEXT + '物權編關於共有、公同共有、共有物分割與優先承買的規定，'
             + '是判斷未辦繼承、祭祀公業與持分細碎能否整合的基礎；條號依個案適用，須逐案確認。'
    },

    /* ---------- 都市計畫與更新 ---------- */

    'URBAN_PLANNING_ACT': {
      name: '都市計畫法',
      article: '待查',
      url: null,
      summary: NOT_TEXT + '都市計畫的擬定、發布與土地使用分區管制的母法；'
             + '各縣市的施行細則與分區管制自治條例由本法授權訂定，'
             + '個案基地的實際管制內容仍以該地都市計畫書與細部計畫為準。'
    },

    'URBAN_RENEWAL_ACT': {
      name: '都市更新條例',
      article: '待查',
      url: null,
      summary: NOT_TEXT + '規範都市更新事業的劃定、同意比例、權利變換與容積獎勵；'
             + '走更新路徑的容積獎勵上限與程序時程以本條例及其子法為準。'
    },

    'URBAN_RENEWAL_BONUS_RULES': {
      name: '都市更新建築容積獎勵辦法',
      article: '待查',
      url: null,
      summary: NOT_TEXT + '訂定都市更新各項容積獎勵的項目、額度與申請要件'
             + '（如綠建築、智慧建築、耐震設計、無障礙、基地規模、公益設施等），'
             + '各項額度與合計上限須逐項核對現行條文。'
    },

    'HAZARD_OLD_ACT': {
      name: '都市危險及老舊建築物加速重建條例',
      article: '待查',
      url: null,
      summary: NOT_TEXT + '針對危險或屋齡老舊且無電梯的合法建築物，提供簡化程序與容積獎勵，'
             + '需全體所有權人同意；時程獎勵逐年遞減，適用比例務必查當年度規定。'
    },

    'HAZARD_OLD_BONUS_RULES': {
      name: '都市危險及老舊建築物建築容積獎勵辦法',
      article: '待查',
      url: null,
      summary: NOT_TEXT + '訂定危老重建各項容積獎勵的項目與額度上限，'
             + '包含時程獎勵與規模獎勵；時程獎勵有落日與逐年遞減設計，是最容易算錯的一項。'
    },

    'TDR_RULES': {
      name: '都市計畫容積移轉實施辦法',
      article: '待查',
      url: null,
      summary: NOT_TEXT + '規範送出基地與接受基地的資格、容積移入上限與折算方式；'
             + '容積移轉是用買的，成本與可移入額度都須個案查證，不能假設一定買得到。'
    },

    'EQUALIZATION_ACT': {
      name: '平均地權條例',
      article: '待查',
      url: null,
      summary: NOT_TEXT + '規範地價、市地重劃、區段徵收與不動產成交案件實際資訊申報登錄'
             + '（實價登錄）等事項，是比價資料來源與土地稅費估算的法源。'
    },

    /* ---------- 臺北市（MVP 範圍） ---------- */

    'TAIPEI_ZONING': {
      name: '臺北市土地使用分區管制自治條例',
      article: '待查',
      url: null,
      summary: NOT_TEXT + '訂定臺北市各使用分區的建蔽率、容積率與允許使用組別，'
             + '是 js/data/zoning.js 種子資料的對照來源；個案仍可能受細部計畫另訂較嚴規定拘束。'
    },

    'TAIPEI_ODD_LOT': {
      name: '臺北市畸零地使用規則',
      article: '待查',
      url: null,
      summary: NOT_TEXT + '依正面路寬訂定基地最小寬度與最小深度標準，'
             + '未達標準者為畸零地，非經與鄰地協議合併或調處不得單獨建築。'
    },

    'TAIPEI_BUILDING_MGMT': {
      name: '臺北市建築管理自治條例',
      article: '待查',
      url: null,
      summary: NOT_TEXT + '規範臺北市的建築管理事項，包含停車空間設置標準等地方加嚴規定，'
             + '與建築技術規則併同適用時從嚴認定。'
    }
  };

  /* 回傳官方入口首頁。刻意忽略 name：深連結會失效，猜一個比沒有更糟。
     UI 另外提供「複製法規名稱」按鈕，讓使用者到官網自行搜尋。 */
  TD.data.lawLink = function (name) {
    return MOJ_HOME;
  };

  /* 依 key 取法規資料；查無、或傳入 _meta 這類底線 key，一律回傳 null。
     回傳的是複本，避免呼叫端不小心改到索引本身。 */
  TD.data.lawRef = function (key) {
    if (!key || typeof key !== 'string') return null;
    if (key.charAt(0) === '_') return null;
    if (!Object.prototype.hasOwnProperty.call(TD.data.laws, key)) return null;
    var e = TD.data.laws[key];
    if (!e || typeof e !== 'object') return null;
    return { name: e.name, article: e.article, url: e.url, summary: e.summary };
  };
})(window.TD);
