/* 土地使用分區管制種子資料：僅臺北市，含建蔽率、容積率、畸零地、停車、退縮。全部待人工查證。*/
window.TD = window.TD || {};
(function (TD) {
  'use strict';
  TD.data = TD.data || {};

  /* --------------------------------------------------------------------------
     使用說明（給後續維護者與查證者）

     1. 本檔所有數值都是「種子資料」：由開發者依一般認知先填進來，**尚未**與現行
        條文逐字核對，因此每一區塊都掛 verified:false，引擎取用時信心等級一律 'unv'。
     2. 本系統不連網、不呼叫任何 API。查證方式一律是人工開啟官方條文核對後，
        直接修改這個檔案，並把該區塊的 verified 改成 true、補上真正的條號。
     3. 條號欄 article 填不出來一律寫 '待查'。**寧可寫「待查」，也不要編一個條號。**
        編出來的條號會讓複核者以為已經查過，這是本產品最不能犯的錯。
     4. cities 之下以底線開頭的 key（目前只有 '_template'）不是真的縣市，
        是擴充用的空殼範本，列舉縣市時請略過。
     -------------------------------------------------------------------------- */

  /* 分區共通查證指引，寫進每個分區的 note，是 docs/DATA-VERIFICATION.md 的素材 */
  var Z_WHERE = '查證：全國法規資料庫或臺北市法規查詢系統之「臺北市土地使用分區管制自治條例」現行條文附表（建蔽率、容積率），並另查該基地所屬都市計畫書與細部計畫有無另訂較嚴規定。';

  /* 「之一」「之二」等細分區的共通警語 */
  var Z_SUB = '「之一」「之二」細分區多由都市計畫通盤檢討或個案變更指定，容積高於本區基準，務必以該地都市計畫書及土地使用分區管制要點為準，不可只看自治條例附表。';

  TD.data.zoning = {

    _meta: {
      title: '臺北市土地使用分區管制 種子資料',
      asOf: '2026-09-26',
      verified: false,
      source: '臺北市土地使用分區管制自治條例（未逐條核對）',
      templateKey: '_template',
      note: '上線前須逐條核對，見 docs/DATA-VERIFICATION.md。本檔數值一律視為未查證（unv），'
          + '條號未確認者一律寫「待查」。MVP 只做臺北市，其他縣市請複製 cities._template 後逐格填寫。'
          + '本系統不連網，更新方式為人工查閱官方條文後直接改寫本檔，不經任何 API。'
    },

    cities: {

      '臺北市': {

        lawName: '臺北市土地使用分區管制自治條例',
        article: '待查',
        verified: false,
        note: '臺北市的建蔽率與容積率規定於本自治條例，但個案是否適用還受都市計畫書、'
            + '細部計畫、都市設計審議、航高與保護區等限制影響；本檔只提供「分區基準值」，'
            + '不代表該基地實際可用強度。分區代碼本身應以地籍圖資或土地使用分區證明書為準。',

        /* ---------- 分區基準：bcr 建蔽率（小數）／far 容積率（小數，5.6 = 560%） ---------- */
        zones: {

          '住一': {
            name: '第一種住宅區', bcr: 0.30, far: 0.60, article: '待查',
            use: ['住宅'], minLotM2: null, verified: false,
            note: '全市強度最低的住宅分區（種子值 30%／60%）。'
                + '此類基地常與山坡地、保護區、水源特定區交界，須另查有無更嚴限制。' + Z_WHERE
          },

          '住二': {
            name: '第二種住宅區', bcr: 0.35, far: 1.20, article: '待查',
            use: ['住宅'], minLotM2: null, verified: false,
            note: '種子值 35%／120%。舊市區有以細部計畫另訂容積者，須個案查。' + Z_WHERE
          },

          '住二之一': {
            name: '第二種住宅區（之一）', bcr: 0.35, far: 1.60, article: '待查',
            use: ['住宅'], minLotM2: null, verified: false,
            note: '種子值 35%／160%。' + Z_SUB + Z_WHERE
          },

          '住二之二': {
            name: '第二種住宅區（之二）', bcr: 0.35, far: 2.25, article: '待查',
            use: ['住宅'], minLotM2: null, verified: false,
            note: '種子值 35%／225%。' + Z_SUB + Z_WHERE
          },

          '住三': {
            name: '第三種住宅區', bcr: 0.45, far: 2.25, article: '待查',
            use: ['住宅'], minLotM2: null, verified: false,
            note: '種子值 45%／225%，臺北市最常見的住宅分區，也是本系統被查證頻率最高的一格，'
                + '請優先核對。' + Z_WHERE
          },

          '住三之一': {
            name: '第三種住宅區（之一）', bcr: 0.45, far: 3.00, article: '待查',
            use: ['住宅'], minLotM2: null, verified: false,
            note: '種子值 45%／300%。' + Z_SUB + Z_WHERE
          },

          '住三之二': {
            name: '第三種住宅區（之二）', bcr: 0.45, far: 4.00, article: '待查',
            use: ['住宅'], minLotM2: null, verified: false,
            note: '種子值 45%／400%。' + Z_SUB + Z_WHERE
          },

          '住四': {
            name: '第四種住宅區', bcr: 0.50, far: 3.00, article: '待查',
            use: ['住宅'], minLotM2: null, verified: false,
            note: '種子值 50%／300%。第四種住宅區多位於舊市區高密度地帶，'
                + '基地條件（臨路、畸零）往往比容積更關鍵。' + Z_WHERE
          },

          '住四之一': {
            name: '第四種住宅區（之一）', bcr: 0.50, far: 4.00, article: '待查',
            use: ['住宅'], minLotM2: null, verified: false,
            note: '種子值 50%／400%。' + Z_SUB + Z_WHERE
          },

          '商一': {
            name: '第一種商業區', bcr: 0.55, far: 3.60, article: '待查',
            use: ['商業', '辦公', '住宅（附條件）'], minLotM2: null, verified: false,
            note: '種子值 55%／360%。允許使用組別須另查自治條例之使用組別表（條號待查），'
                + '本欄 use 只是粗分類，不可當作可否申請某用途的依據。' + Z_WHERE
          },

          '商二': {
            name: '第二種商業區', bcr: 0.65, far: 6.30, article: '待查',
            use: ['商業', '辦公', '住宅（附條件）'], minLotM2: null, verified: false,
            note: '種子值 65%／630%。注意：種子資料中商二（630%）高於商三（560%），'
                + '順序不符直覺。這正是必須查證的一格，不要自行「修正」成遞增，'
                + '請以現行條文附表為準。' + Z_WHERE
          },

          '商三': {
            name: '第三種商業區', bcr: 0.65, far: 5.60, article: '待查',
            use: ['商業', '辦公', '住宅（附條件）'], minLotM2: null, verified: false,
            note: '種子值 65%／560%。與商二的高低順序請一併核對，見商二備註。' + Z_WHERE
          },

          '商四': {
            name: '第四種商業區', bcr: 0.75, far: 8.00, article: '待查',
            use: ['商業', '辦公', '旅館', '住宅（附條件）'], minLotM2: null, verified: false,
            note: '種子值 75%／800%，全市強度最高。此類基地多在車站商圈，'
                + '常受都市設計審議、航高、聯合開發或特定專用區規定影響，'
                + '基準容積算出來的量體通常不是實際可蓋量體。' + Z_WHERE
          }

        },

        /* ---------- 畸零地：正面路寬區間 → 最小寬度／最小深度（公尺） ----------
           讀法：rows 由小到大排列，取第一個 roadWidthMax >= 正面路寬 的列；
           roadWidthMax 為 null 代表「以上皆是」（無上限）。
           基地寬度或深度任一小於該列標準，即為畸零地，須與鄰地協議合併或依法調處。 */
        oddLot: {
          lawName: '臺北市畸零地使用規則',
          article: '待查',
          verified: false,
          rows: [
            { roadWidthMax: 7,    minWidth: 3.0, minDepth: 12.0 },
            { roadWidthMax: 15,   minWidth: 3.5, minDepth: 14.0 },
            { roadWidthMax: 25,   minWidth: 4.0, minDepth: 16.0 },
            { roadWidthMax: null, minWidth: 4.5, minDepth: 18.0 }
          ],
          note: '查證：「臺北市畸零地使用規則」之最小寬度、最小深度對照表（條號待查），'
              + '以及建築法第44條至第46條。本表為種子值，區間切點（7／15／25 公尺）與數值都可能與現行規定不同。'
              + '另注意：實務上寬度與深度要看地籍圖上的實際形狀，本系統只吃使用者手動輸入的基地寬深，'
              + '不規則地形、三角地、袋地一律判為 manual，不可只憑本表下結論。'
        },

        /* ---------- 停車：每多少平方公尺樓地板設一車位 ---------- */
        parking: {
          lawName: '臺北市建築管理自治條例',
          article: '待查',
          verified: false,
          residentialPerM2: 150,
          officePerM2: null,
          retailPerM2: null,
          note: '種子值：住宅每 150 ㎡ 樓地板設一停車位。查證：「臺北市建築管理自治條例」'
              + '與「建築技術規則建築設計施工編」停車空間章之附表（條號皆待查），'
              + '兩者從嚴適用，且不同用途組別門檻不同。辦公、零售欄位刻意留 null，'
              + '代表尚未查到，引擎遇到 null 不得自行猜值，應標為待查。'
              + '另：機械車位、裝卸位、機車位與停車空間免計容積的計算方式另有規定，本檔未涵蓋。'
        },

        /* ---------- 退縮：無圖資就算不出來 ---------- */
        setback: {
          lawName: '臺北市土地使用分區管制自治條例',
          article: '待查',
          verified: false,
          frontM: null,
          note: '退縮依細部計畫與都市設計審議，無圖資無法計算，一律標為 manual。'
              + '查證需要：該基地都市計畫書與細部計畫之退縮規定、都市設計審議原則、'
              + '是否臨計畫道路或指定建築線、有無騎樓或人行道退縮要求。'
              + 'frontM 維持 null 代表「未知」，不是 0；引擎不得把 null 當成不必退縮。'
        }
      },

      /* ---------- 擴充範本：複製這個物件、改成縣市名稱後逐格填寫 ----------
         這不是真的縣市，列舉時請略過所有以底線開頭的 key。 */
      '_template': {
        _isTemplate: true,
        lawName: '（填）該縣市土地使用分區管制自治條例或都市計畫法施行細則全名',
        article: '待查',
        verified: false,
        note: '（填）本縣市分區規定的主要法源、以及哪些情形要改看都市計畫書。'
            + '填寫原則：查得到就填數字並註明條號；查不到就留 null 與「待查」，不要用別的縣市數字代替。',
        zones: {
          '（填）分區代碼，例如「住三」': {
            name: '（填）分區全名，例如「第三種住宅區」',
            bcr: null,
            far: null,
            article: '待查',
            use: [],
            minLotM2: null,
            verified: false,
            note: '（填）這個建蔽率／容積率數字要去哪裡查證：法規名稱、附表名稱、有無細部計畫另訂。'
          }
        },
        oddLot: {
          lawName: '（填）該縣市畸零地使用規則全名',
          article: '待查',
          verified: false,
          rows: [],
          note: '（填）最小寬度深度對照表出處。rows 空陣列代表尚未建置，引擎應把畸零地檢核標為 manual。'
        },
        parking: {
          lawName: '（填）該縣市建築管理自治條例全名',
          article: '待查',
          verified: false,
          residentialPerM2: null,
          officePerM2: null,
          retailPerM2: null,
          note: '（填）停車位換算標準出處，並註明與建築技術規則何者從嚴。'
        },
        setback: {
          lawName: '（填）法規名稱',
          article: '待查',
          verified: false,
          frontM: null,
          note: '（填）退縮規定出處。無圖資即無法計算者維持 null，並說明需要哪些資料才算得出來。'
        }
      }
    }
  };
})(window.TD);

/* ------------------------------------------------------------------
   全國縣市與住商以外的分區
   本系統只對臺北市的住宅區與商業區建了種子數值。其餘縣市、其餘分區
   一律 bcr:null / far:null —— 寧可留白讓使用者自己輸入，也不拿臺北市的
   數字頂替。引擎遇到 null 會把基準容積、量體、出價上限一路標成算不出來。
   ------------------------------------------------------------------ */
window.TD = window.TD || {};
(function (TD) {
  'use strict';

  var Z = TD.data && TD.data.zoning;
  if (!Z || !Z.cities) return;

  var FILL_NOTE = '本系統未建檔此分區的建蔽率與容積率。請查該縣市土地使用分區管制自治條例'
    + '（並確認該基地所屬都市計畫書與細部計畫有無另訂較嚴規定）後，在左側直接輸入建蔽率與容積率；'
    + '未輸入前，基準容積、量體與出價上限一律不予計算。';

  function blankZone(name, use) {
    return { name: name, bcr: null, far: null, article: '待查',
             use: use ? [use] : [], minLotM2: null, verified: false, note: FILL_NOTE };
  }

  /* 住商以外的常見分區。各縣市名稱不盡相同，以該縣市都市計畫書為準。*/
  var OTHER_ZONES = [
    ['工業區', '工業區', '工業'],
    ['甲種工業區', '甲種工業區', '工業'],
    ['乙種工業區', '乙種工業區', '工業'],
    ['零星工業區', '零星工業區', '工業'],
    ['倉庫區', '倉庫區', '倉儲'],
    ['行政區', '行政區', '公共設施'],
    ['文教區', '文教區', '文教'],
    ['醫療區', '醫療專用區', '醫療'],
    ['農業區', '農業區', '農業'],
    ['林木區', '林木區', '林業'],
    ['保護區', '保護區', '保護'],
    ['風景區', '風景區', '風景'],
    ['河川區', '河川區', '水利'],
    ['特定專用區', '特定專用區', '專用'],
    ['其他', '其他（請自行輸入建蔽率與容積率）', '']
  ];

  /* 臺北市另有的工業區代碼；住商部分已在上面建檔，不動。*/
  var TPE_EXTRA = [
    ['工二', '第二種工業區', '工業'],
    ['工三', '第三種工業區', '工業']
  ];

  /* 一般縣市的住商代碼。數值一律留白。*/
  var COMMON_RES_COM = [
    ['住一', '第一種住宅區', '住宅'], ['住二', '第二種住宅區', '住宅'],
    ['住三', '第三種住宅區', '住宅'], ['住四', '第四種住宅區', '住宅'],
    ['商一', '第一種商業區', '商業'], ['商二', '第二種商業區', '商業'],
    ['商三', '第三種商業區', '商業'], ['商四', '第四種商業區', '商業']
  ];

  var OTHER_CITIES = ['新北市', '桃園市', '臺中市', '臺南市', '高雄市',
    '基隆市', '新竹市', '嘉義市', '新竹縣', '苗栗縣', '彰化縣', '南投縣',
    '雲林縣', '嘉義縣', '屏東縣', '宜蘭縣', '花蓮縣', '臺東縣',
    '澎湖縣', '金門縣', '連江縣'];

  function addZones(node, list) {
    var i;
    for (i = 0; i < list.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(node.zones, list[i][0])) {
        node.zones[list[i][0]] = blankZone(list[i][1], list[i][2]);
      }
    }
  }

  /* 1. 臺北市補上工業區與其他分區（數值仍為 null） */
  if (Z.cities['臺北市'] && Z.cities['臺北市'].zones) {
    addZones(Z.cities['臺北市'], TPE_EXTRA);
    addZones(Z.cities['臺北市'], OTHER_ZONES);
  }

  /* 2. 其餘二十一個縣市 */
  var i, city;
  for (i = 0; i < OTHER_CITIES.length; i++) {
    city = OTHER_CITIES[i];
    if (Object.prototype.hasOwnProperty.call(Z.cities, city)) continue;
    Z.cities[city] = {
      lawName: city + '土地使用分區管制自治條例（法規全名待查）',
      article: '待查',
      verified: false,
      note: '本系統尚未為' + city + '建檔任何分區數值。請以該縣市法規查詢系統之土地使用分區管制規定，'
          + '以及該基地所屬都市計畫書、細部計畫為準，於左側自行輸入建蔽率與容積率。',
      zones: {},
      oddLot: { lawName: city + '畸零地使用規則（法規全名待查）', article: '待查', verified: false,
                rows: [], note: '未建置，畸零地檢核一律標為需人工判斷。' },
      parking: { lawName: city + '建築管理自治條例（法規全名待查）', article: '待查', verified: false,
                 residentialPerM2: null, officePerM2: null, retailPerM2: null,
                 note: '未建置停車位換算標準，停車檢核一律標為需人工判斷。' },
      setback: { lawName: '（法規名稱待查）', article: '待查', verified: false, frontM: null,
                 note: '退縮規定需細部計畫與都市設計審議資料，無圖資無法計算。' }
    };
    addZones(Z.cities[city], COMMON_RES_COM);
    addZones(Z.cities[city], OTHER_ZONES);
  }

  Z._meta = Z._meta || {};
  Z._meta.coverageNote = '只有臺北市的住宅區與商業區有種子數值（verified:false，仍須查證）。'
    + '其餘縣市與其餘分區一律留白，需使用者自行輸入建蔽率與容積率。';
})(window.TD);
