/* 比較交易案例：合成示範資料，供 m6 特徵價格迴歸（hedonic）演示用，絕非真實實價登錄。 */
window.TD = window.TD || {};
(function (TD) {
  'use strict';

  TD.data = TD.data || {};

  /* ------------------------------------------------------------------
     欄位說明

       id             案例代碼（本檔一律 c01～c14，代表合成資料）
       addr           示範地址，門牌一律以 ○○ 表示，不對應任何真實建物
       district       行政區
       unitPricePing  成交單價，元／坪（房地總價 ÷ 建物登記面積）
       areaPing       建物登記面積，坪
       ageYears       屋齡，年
       floor          所在樓層
       totalFloors    建物總樓層
       distanceM      與標的基地的直線距離，公尺
       year           成交年度（西元）
       type           建物型態

     m6 的迴歸自變數為 ageYears、floor、areaPing、distanceM 四項，
     本檔已刻意讓這四個變數有足夠變異且不共線（兩兩相關係數皆在 ±0.72 以內），
     以 ln(unitPricePing) 為應變數時 OLS 可解，R² 約 0.92、殘差標準差約 0.059，
     換算約 ±11% 的信心區間 —— 這個寬度是刻意保留的，真實資料不會更漂亮。

     再說一次：這是合成資料。換成真實實價登錄後，係數、R² 與區間都會改變，
     介面上顯示的任何數字在匯入真實資料前都不得對外引用。
     ------------------------------------------------------------------ */

  TD.data.comps = {
    _meta: {
      title: '比較交易案例 合成示範資料',
      asOf: '2026-09-26',
      verified: false,
      synthetic: true,
      source: '無。本檔由程式依假設模型產生，未取自內政部實價登錄或任何交易紀錄。',
      note: '此為合成示範資料，非真實實價登錄，僅供介面演示，使用前請匯入真實資料。',
      model: '產生方式：ln(單價) = ln(1,450,000) − 0.0055×屋齡 + 0.011×(樓層−1)'
           + ' − 0.0018×(坪數−35) − 0.00022×距離(公尺)，再乘上 ±7% 的隨機擾動並四捨五入至千元。'
           + '係數為杜撰的假設值，不代表大安區的真實市場結構。',
      region: '臺北市大安區及其周邊街廓（示範用）',
      caution: '匯入真實資料時請保持欄位名稱一致，並注意實價登錄的建物面積含車位與否、'
             + '以及有無裝潢或增建，這些差異會直接污染迴歸結果。'
    },

    rows: [
      { id: 'c01', addr: '臺北市大安區敦化南路二段○○號', district: '大安區',
        unitPricePing: 1618000, areaPing: 42.5, ageYears: 3,  floor: 12, totalFloors: 15,
        distanceM: 180,  year: 2026, type: '住宅大樓' },
      { id: 'c02', addr: '臺北市大安區復興南路一段○○號', district: '大安區',
        unitPricePing: 1270000, areaPing: 28.6, ageYears: 8,  floor: 5,  totalFloors: 12,
        distanceM: 420,  year: 2025, type: '住宅大樓' },
      { id: 'c03', addr: '臺北市大安區和平東路二段○○號', district: '大安區',
        unitPricePing: 1201000, areaPing: 36.2, ageYears: 15, floor: 7,  totalFloors: 12,
        distanceM: 950,  year: 2025, type: '華廈' },
      { id: 'c04', addr: '臺北市大安區信義路四段○○號', district: '大安區',
        unitPricePing: 1512000, areaPing: 55.8, ageYears: 2,  floor: 18, totalFloors: 24,
        distanceM: 300,  year: 2026, type: '住宅大樓' },
      { id: 'c05', addr: '臺北市大安區大安路一段○○號', district: '大安區',
        unitPricePing: 1412000, areaPing: 24.0, ageYears: 22, floor: 6,  totalFloors: 9,
        distanceM: 260,  year: 2024, type: '華廈' },
      { id: 'c06', addr: '臺北市大安區仁愛路四段○○號', district: '大安區',
        unitPricePing: 1165000, areaPing: 68.4, ageYears: 6,  floor: 9,  totalFloors: 14,
        distanceM: 640,  year: 2025, type: '住宅大樓' },
      { id: 'c07', addr: '臺北市大安區安和路一段○○號', district: '大安區',
        unitPricePing: 1198000, areaPing: 31.5, ageYears: 30, floor: 4,  totalFloors: 5,
        distanceM: 520,  year: 2024, type: '公寓' },
      { id: 'c08', addr: '臺北市大安區建國南路二段○○號', district: '大安區',
        unitPricePing: 1159000, areaPing: 45.0, ageYears: 12, floor: 14, totalFloors: 20,
        distanceM: 1100, year: 2026, type: '住宅大樓' },
      { id: 'c09', addr: '臺北市大安區新生南路三段○○號', district: '大安區',
        unitPricePing: 1158000, areaPing: 38.8, ageYears: 18, floor: 11, totalFloors: 15,
        distanceM: 1350, year: 2025, type: '住宅大樓' },
      { id: 'c10', addr: '臺北市大安區瑞安街○○號', district: '大安區',
        unitPricePing: 1082000, areaPing: 22.5, ageYears: 26, floor: 5,  totalFloors: 5,
        distanceM: 700,  year: 2024, type: '公寓' },
      { id: 'c11', addr: '臺北市大安區金華街○○號', district: '大安區',
        unitPricePing: 1288000, areaPing: 50.2, ageYears: 5,  floor: 11, totalFloors: 13,
        distanceM: 880,  year: 2026, type: '住宅大樓' },
      { id: 'c12', addr: '臺北市大安區延吉街○○號', district: '大安區',
        unitPricePing: 1108000, areaPing: 33.4, ageYears: 10, floor: 6,  totalFloors: 11,
        distanceM: 1500, year: 2025, type: '住宅大樓' },
      { id: 'c13', addr: '臺北市大安區光復南路○○號', district: '大安區',
        unitPricePing: 866000,  areaPing: 60.5, ageYears: 20, floor: 8,  totalFloors: 12,
        distanceM: 1750, year: 2024, type: '住宅大樓' },
      { id: 'c14', addr: '臺北市大安區樂利路○○號', district: '大安區',
        unitPricePing: 922000,  areaPing: 27.8, ageYears: 35, floor: 3,  totalFloors: 4,
        distanceM: 1250, year: 2026, type: '公寓' }
    ]
  };

  /* 舊式取用方式的相容別名：有些呼叫端習慣直接拿到陣列。 */
  TD.data.comps.list = TD.data.comps.rows;
})(window.TD);
