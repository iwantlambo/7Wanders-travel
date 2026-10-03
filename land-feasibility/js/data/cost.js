/* 成本與財務參數種子資料：營建單價、車位售價、融資條件、軟成本比率、時程。全部未經核對。 */
window.TD = window.TD || {};
(function (TD) {
  'use strict';

  TD.data = TD.data || {};

  /* ------------------------------------------------------------------
     單位約定（m7、m8 讀這份資料時請照此解讀）

     1. 營建單價 perPing / low / high 一律是「元／坪（地上樓地板）」。
        low 與 high 是合理市場區間的上下緣，用來做敏感度與信心區間，
        不是保證值。價差主要來自樓層數、地質、外牆材料與發包時點。
     2. basementPerPing 是「元／坪（地下樓地板）」，另計，不含在地上單價內。
        地下室單價高於地上，開挖深度、擋土工法與地質是主因。
     3. demolitionPerPing 是「元／坪（既有建物樓地板）」，素地為 0。
     4. 所有比率欄位（LTV、利率、軟成本率、稅率）一律以小數表示，
        0.028 代表年利率 2.8%。
     5. 時程欄位單位皆為「月」。presaleStartMonth 是從專案 t=0 起算的月份。
     6. project.m7 中為 null 的欄位代表「沿用本檔預設值」，不是 0。
     7. 全部 verified:false。營建單價與利率會隨景氣與政策變動，
        上線前必須接實際決標資料與銀行報價，見 docs/DATA-VERIFICATION.md。
     ------------------------------------------------------------------ */

  TD.data.cost = {
    _meta: {
      title: '成本與財務參數 種子資料',
      asOf: '2026-09-26',
      verified: false,
      source: '未接任何官方或市場來源，數值為台灣市場常見區間之種子值',
      note: '此檔所有數字皆為種子資料，尚未與政府電子採購網決標資料、銀行實際報價或主計總處物價指數核對。'
          + '營建單價對工期、樓層與發包時點極度敏感，直接沿用本檔預設值下決策是危險的。',
      fieldNotes: {
        construction: '營建單價含結構、裝修、機電與一般水電，不含土地、規費、外接管線與特殊基礎。'
                    + '實際單價請以建築師或營造廠報價為準。',
        parkingPricePerStall: '平面車位售價之種子值，台北市精華區平面車位常見區間約 200 萬至 350 萬元，'
                            + '機械車位明顯較低。本欄只有單一數字，不分車位型式，m5 估算車位數時請注意這個簡化。',
        finance: '土融與建融的成數與利率依建商信用、擔保品與當時政策（含選擇性信用管制）差異極大，'
               + '同一塊地不同銀行可以差到一成成數與一碼利率，必須以實際核貸條件取代。',
        soft: '軟成本以總銷或總成本的比率估算，是粗估法；大案與小案的規模經濟差異很大。'
            + 'profitTaxRate 為營利事業所得稅之簡化稅率，未計入土地增值稅、房地合一稅與未分配盈餘加徵，'
            + '實際稅負須由會計師依交易架構試算。',
        schedule: '時程為一般中型住宅案的種子值。都更與危老的審議期不含在此，'
                + '應由 m4 的 regime.baseMonths 與 monthsAdd 另行加計。',
        priceIndex: '預留給主計總處營造工程物價指數，尚未接入，value 為 null 代表不做物價調整。',
        fallbackUnitPricePing: '僅供 m4 第一次呼叫（ctx.m6 尚未存在）時估算獎勵效益用的保守單價，'
                             + 'pipeline 在 m6 算出單價後會再呼叫 m4 覆蓋。不要用這個數字做任何對外報告。'
      }
    },

    /* 營建成本：元／坪 */
    construction: {
      rows: [
        { id: 'rc12', label: 'RC 12層以下 住宅', perPing: 140000, low: 120000, high: 165000,
          note: '中低樓層 RC 構造，基礎與擋土相對單純，單價區間最窄。' },
        { id: 'rc25', label: 'RC 13～25層 住宅', perPing: 170000, low: 145000, high: 205000,
          note: '需考慮筏基或樁基、擋土支撐與垂直運輸，單價隨開挖深度上升。' },
        { id: 'src25up', label: 'SRC 26層以上', perPing: 215000, low: 180000, high: 265000,
          note: 'SRC 或鋼構高層，鋼料價格波動大，且外牆與消防設備規格拉高單價。' }
      ],
      basementPerPing: 195000,
      demolitionPerPing: 6000,
      verified: false,
      source: '政府電子採購網決標資料（待接）',
      note: '單價含結構、裝修、機電；不含土地、規費、外接管線、特殊基礎與鄰房保護。'
          + '地下室單價（basementPerPing）另計，拆除（demolitionPerPing）以既有建物樓地板面積計。'
    },

    /* 車位售價：元／個 */
    parkingPricePerStall: 2500000,

    /* 融資條件：成數與年利率（小數） */
    finance: {
      landLTV: 0.5,
      landRate: 0.028,
      constLTV: 0.7,
      constRate: 0.026,
      verified: false,
      source: '銀行實際核貸條件（待接）',
      note: '土融成數受選擇性信用管制影響，建案所在區位與建商信用評等會讓成數與利率明顯位移；'
          + '建融依工程進度動撥，利息以加權平均餘額計算，不是全額計息。'
    },

    /* 軟成本比率（小數） */
    soft: {
      sgaRate: 0.03,
      marketingRate: 0.05,
      designRate: 0.025,
      taxRateOther: 0.01,
      profitTaxRate: 0.20,
      verified: false,
      source: '業界常見比率（待接實績）',
      note: 'sgaRate 管銷、marketingRate 廣告銷售（含代銷佣金）、designRate 設計監造、'
          + 'taxRateOther 其他稅費規費、profitTaxRate 為簡化後的利潤稅率。'
          + '代銷佣金有包銷與純代銷之別，比率差異可達兩個百分點以上。'
    },

    /* 時程：月 */
    schedule: {
      planMonths: 12,
      buildMonths: 30,
      handoverMonths: 6,
      presaleStartMonth: 12,
      verified: false,
      source: '一般中型住宅案之常見時程（待接實績）',
      note: 'planMonths 為規劃設計與請照期，buildMonths 為施工期，handoverMonths 為完工到交屋結案期'
          + '（驗屋、對保、辦貸與過戶；m8 把交屋尾款 85% 收在「完工月 ＋ handoverMonths」那個月，'
          + '交屋期越長、尾款收得越晚、利息壓越久，出價上限越低），'
          + 'presaleStartMonth 為自 t=0 起算的預售啟動月份，'
          + '不得早於 planMonths（預售屋須先領得建造執照），m7 會夾住。'
          + '都更與危老的審議時間不含在此，須由 m4 的 baseMonths 與 monthsAdd 另加。'
    },

    /* 物價指數：預留接口，尚未接入 */
    priceIndex: { asOf: '', value: null, source: '主計總處營造工程物價指數（待接）' },

    /* m4 第一次呼叫時的保守預估單價（元／坪）。兩個欄位同值，供不同命名習慣取用。 */
    fallbackUnitPricePing: 900000,
    defaultUnitPricePing: 900000
  };
})(window.TD);
