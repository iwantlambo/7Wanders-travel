/* 成本與財務參數：2026 年第三季行情的營建單價（依產品、樓層、縣市）、融資條件、軟成本、稅費與時程。*/
window.TD = window.TD || {};
(function (TD) {
  'use strict';

  TD.data = TD.data || {};

  /* ------------------------------------------------------------------
     單位約定（m4、m7、m8 讀這份資料時請照此解讀）

     1. 營建單價 perPing／low／high 一律是「元／坪（地上樓地板）」，為雙北行情；
        其他縣市乘 cityFactor。單價含結構、裝修、機電、一般水電與電梯，
        不含土地、規費、外接管線、特殊基礎與鄰房保護。
     2. basementPerPing 是「元／坪（地下樓地板）」，另計；開挖、擋土、止水與結構強化
        使地下室單價高於地上（約地上的 1.2～1.5 倍）。
     3. 所有比率欄位一律以小數表示，0.028 代表年利率 2.8%。時程單位皆為「月」。
     4. project.m7 中為 null 的欄位代表「沿用本檔預設值」，不是 0。
     5. conf：'mid' 代表由公開市場資料推算（附來源），'high' 代表法規明文。
     ------------------------------------------------------------------ */

  var CON_SRC = '2025～2026 年雙北營建行情：RC 住宅大樓每坪約 20～28 萬元、臺北市已近 25～30 萬元，'
              + 'RC 結構符合 0.24G 耐震最低要求約 28 萬元／坪；地下室造價約為地上 1～2 倍'
              + '（營造業與建設公司公開成本分析、工商時報與經濟日報 2025～2026 年報導）';

  TD.data.cost = {
    _meta: {
      title: '成本與財務參數（2026 年第三季）',
      asOf: '2026-10-03',
      verified: true,
      source: CON_SRC + '；中央銀行 2026 年 9 月 17 日理監事會（重貼現率維持 2%、刪除購地貸款切結動工規定）；'
            + '所得稅法第24條之5第4項（營利事業興建房屋完成後第一次移轉計入營利事業所得額）；'
            + '加值型及非加值型營業稅法（房屋銷售額課徵 5%，土地免徵）',
      note: '營建單價為雙北 2026 年第三季行情區間的中位，建商自己的發包實績永遠比本檔準；'
          + '融資條件以 2026 年 9 月央行政策利率 2% 推估，實際以銀行核貸為準。',
      fieldNotes: {
        construction: '營建單價含結構、裝修、機電、一般水電與電梯，不含土地、規費、外接管線與特殊基礎；'
                    + '依產品類型與地上層數自動選級距，可在左欄「進階假設 → 成本」覆寫。',
        finance: '土融：住宅區、商業區購地貸款受中央銀行選擇性信用管制，最高五成且其中一成於動工後撥貸；'
               + '工業區土地不在該項管制範圍，依銀行自主授信，常見六成。',
        soft: '設計監造占營建成本、管銷與廣告銷售占總銷；營業稅以「房屋部分售價」計 5%，土地部分免稅。',
        schedule: '施工期依地上層數與地下室層數推估（12 個月＋每層地上 1 個月＋每層地下 3 個月）。'
      }
    },

    /* 營建成本：元／坪（雙北），其他縣市乘 cityFactor */
    construction: {
      rows: [
        { id: 'res12', label: '住宅 RC 12 層以下', products: ['住宅大樓', '華廈'], maxFloors: 12,
          perPing: 230000, low: 200000, high: 265000,
          note: '中低樓層 RC，基礎與擋土相對單純。' },
        { id: 'res25', label: '住宅 RC 13～25 層', products: ['住宅大樓', '華廈'], maxFloors: 25,
          perPing: 270000, low: 240000, high: 310000,
          note: '需筏基或樁基、擋土支撐與垂直運輸；2025～2026 雙北常見 25～28 萬元。' },
        { id: 'res26', label: '住宅 SRC／SC 26 層以上', products: ['住宅大樓', '華廈'], maxFloors: 999,
          perPing: 330000, low: 290000, high: 390000,
          note: '高層鋼骨構造，鋼料與外牆規格拉高單價。' },
        { id: 'ind12', label: '廠辦 RC 12 層以下', products: ['廠辦'], maxFloors: 12,
          perPing: 210000, low: 180000, high: 245000,
          note: '樓板活載重 500～1,000 kg/㎡、樓層高 4.2 公尺以上、貨梯；室內裝修少於住宅。' },
        { id: 'ind25', label: '廠辦 RC／SRC 13 層以上', products: ['廠辦'], maxFloors: 999,
          perPing: 250000, low: 215000, high: 290000,
          note: '高層廠辦，結構與垂直運輸成本上升。' },
        { id: 'off', label: '辦公大樓 RC／SRC', products: ['辦公商業大樓', '店面'], maxFloors: 999,
          perPing: 290000, low: 250000, high: 350000,
          note: '帷幕外牆、空調與智慧建築設備。' },
        { id: 'th', label: '透天 RC 5 層以下', products: ['透天厝'], maxFloors: 5,
          perPing: 170000, low: 150000, high: 200000,
          note: '連棟透天，無地下室或僅一層。' }
      ],
      basementPerPing: 320000,
      basementLow: 280000,
      basementHigh: 380000,
      demolitionPerPing: 8000,
      cityFactor: { '臺北市': 1.05, '新北市': 1.0, '基隆市': 0.95, '桃園市': 0.94, '新竹市': 0.95, '新竹縣': 0.95,
                    '臺中市': 0.92, '臺南市': 0.88, '高雄市': 0.90, '_default': 0.86 },
      verified: true,
      conf: 'mid',
      source: CON_SRC,
      note: '單價含結構、裝修、機電；不含土地、規費、外接管線、特殊基礎與鄰房保護。地下室與拆除另計。'
    },

    /* 車位售價：優先取本區實價登錄（預售屋附車位之車位價、單獨車位交易），
       沒有資料時才用下列縣市概略值（元／位）。*/
    parkingFallback: { '臺北市': 3500000, '新北市': 2300000, '桃園市': 1600000, '新竹市': 1700000,
                       '新竹縣': 1600000, '臺中市': 1500000, '臺南市': 1200000, '高雄市': 1300000,
                       '_default': 1000000 },

    /* 融資條件：成數與年利率（小數） */
    finance: {
      landLTV: 0.5,
      landLTVIndustrial: 0.6,
      landRate: 0.030,
      constLTV: 0.7,
      constRate: 0.028,
      verified: true,
      conf: 'mid',
      source: '中央銀行 2026 年 9 月 17 日理監事會：重貼現率維持年息 2%（第十次維持），刪除購地貸款「切結一定期間內動工興建」之規定，'
            + '購買住宅區及商業區土地貸款成數上限五成、其中一成於動工後撥貸；建商土融、建融利率依信用評等約為政策利率加 0.6～1.2 個百分點',
      note: '土融利率較建融高約 0.2 個百分點（擔保品未開發、無工程進度控管）。實際以銀行核貸條件為準。'
    },

    /* 軟成本與稅費（小數） */
    soft: {
      sgaRate: 0.03,
      marketingRate: 0.045,
      designRate: 0.03,
      taxRateOther: 0.008,
      businessTaxRate: 0.05,
      housePortion: 0.35,
      profitTaxRate: 0.20,
      verified: true,
      conf: 'mid',
      source: '管銷 3%、廣告銷售（含代銷佣金）4～5%、設計監造約營建費 3% 為業界常見比率；'
            + '營業稅 5%（加值型及非加值型營業稅法，房屋部分課徵、土地免徵）；'
            + '營利事業所得稅 20%（所得稅法第5條、第24條之5第4項：興建房屋完成後第一次移轉計入營利事業所得額）',
      note: 'housePortion 為售價中房屋部分的比例：營業稅只就房屋部分課徵，契約未分別載明時依營業稅法施行細則第21條'
          + '按房屋評定標準價格與土地公告現值比例拆分；雙北新案契約載明的房屋價款多占總價三至四成，本系統取 35%。'
          + 'taxRateOther 為印花稅、地價稅（開發期間）、建照與使照規費、代書與保險等雜項，約總銷 0.8%；'
          + '營業稅另依房屋部分售價計算；未分配盈餘加徵 5%（所得稅法第66條之9）視盈餘分配政策另計，未納入。'
    },

    /* 時程：月 */
    schedule: {
      planMonths: 12,
      buildMonths: null,            /* null：依層數推估，見 buildMonthsOf */
      handoverMonths: 6,
      presaleStartMonth: 12,
      verified: true,
      conf: 'mid',
      source: '一般建照案：規劃設計與請照約 12 個月；施工期約 12 個月 ＋ 地上每層 1 個月 ＋ 地下每層 3 個月；'
            + '完工至交屋結案約 6 個月；預售屋須領得建造執照後始得銷售（不動產經紀業管理條例、平均地權條例預售屋相關規定）',
      note: '都更與危老的審議期不含在此，由容積獎勵制度的作業月數另加。'
    },

    /* 施工月數推估 */
    buildMonthsOf: function (floorsAbove, basementLevels) {
      var fa = (typeof floorsAbove === 'number' && isFinite(floorsAbove)) ? floorsAbove : 10;
      var bl = (typeof basementLevels === 'number' && isFinite(basementLevels)) ? basementLevels : 2;
      return Math.max(18, Math.min(60, Math.round(12 + fa + 3 * bl)));
    },

    /* 依產品與層數挑營建級距 */
    rowFor: function (product, floorsAbove) {
      var rows = TD.data.cost.construction.rows, i, r, best = null;
      for (i = 0; i < rows.length; i++) {
        r = rows[i];
        if (r.products.indexOf(product) < 0) continue;
        if (typeof floorsAbove === 'number' && floorsAbove > r.maxFloors) continue;
        if (!best || r.maxFloors < best.maxFloors) best = r;
      }
      if (!best) {
        for (i = 0; i < rows.length; i++) if (rows[i].products.indexOf(product) >= 0) best = rows[i];
      }
      return best || rows[1];
    },

    /* 依產品與地上層數連續內插的營建單價（元／坪，雙北）。級距表（rows）只供人工指定與顯示；
       自動模式用這條曲線，避免層數跨過 12 層、25 層時單價跳一階，讓容積獎勵排序出現假象。*/
    curve: {
      '住宅大樓': [[3, 200000], [7, 215000], [12, 235000], [18, 255000], [25, 275000], [32, 310000], [40, 345000], [60, 400000]],
      '華廈': [[3, 200000], [7, 215000], [12, 235000], [18, 255000]],
      '透天厝': [[2, 150000], [5, 175000]],
      '廠辦': [[3, 180000], [8, 195000], [12, 210000], [18, 230000], [25, 255000], [35, 290000]],
      '辦公商業大樓': [[5, 250000], [12, 275000], [20, 300000], [30, 340000], [45, 390000]],
      '店面': [[2, 200000], [5, 230000], [12, 275000], [20, 300000]]
    },
    perPingOf: function (product, floorsAbove) {
      var c = TD.data.cost.curve, pts = Object.prototype.hasOwnProperty.call(c, product) ? c[product] : c['住宅大樓'];
      var f = (typeof floorsAbove === 'number' && isFinite(floorsAbove)) ? floorsAbove : 12, i;
      if (f <= pts[0][0]) return pts[0][1];
      for (i = 1; i < pts.length; i++) {
        if (f <= pts[i][0]) return pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * (f - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]);
      }
      return pts[pts.length - 1][1];
    },

    cityFactorOf: function (city) {
      var f = TD.data.cost.construction.cityFactor;
      return Object.prototype.hasOwnProperty.call(f, city) ? f[city] : f._default;
    },

    /* 物價指數：營建單價已是 2026 年第三季行情，不再另做調整 */
    priceIndex: { asOf: '2026-09', value: null, source: '單價已為當期行情，不另做物價指數調整' },

    /* m4 第一次呼叫時（比價尚未算出）的保守預估單價（元／坪） */
    fallbackUnitPricePing: 600000,
    defaultUnitPricePing: 600000
  };
})(window.TD);
