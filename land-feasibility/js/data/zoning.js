/* 土地使用分區管制資料：全國 22 縣市的分區建蔽率、容積率、允許產品類型，以及畸零地、停車、退縮等通案規定。*/
window.TD = window.TD || {};
(function (TD) {
  'use strict';
  TD.data = TD.data || {};

  /* --------------------------------------------------------------------------
     使用說明（給後續維護者與查證者）

     1. 數值來源分三種，conf 欄位標明信心等級：
        'high'：法規明文（全國法規資料庫或縣市法規現行條文的數字，本系統逐字對過）。
        'mid' ：法規的「上限值」或「該市常見細部計畫值」——規則本身有依據，但個案可能
                被細部計畫、都市計畫書另訂較嚴（或較寬）的數字取代，必須以該地號的
                「土地使用分區證明書」為準。
     2. 每個分區都有 cls（住／商／工／農／保／其他）、allowRes（可否作住宅）與
        product（預設產品類型）。m5／m6 依此選量體參數與比價樣本：工業區不能蓋住宅，
        比價就必須用廠辦，不能用住宅大樓的單價。
     3. 新北市住宅區、商業區的容積率依「都市計畫區（細部計畫）」不同，資料放在
        farByDistrict；面前道路未達 8 公尺者降為 farNarrowRoad（新北市常見細部計畫
        通案規定）。
     4. 本系統不連網、不呼叫任何 API；法規更新一律人工查閱後直接改寫本檔，
        並同步更新 _meta.asOf 與 docs/DATA-VERIFICATION.md。
     -------------------------------------------------------------------------- */

  var TPE_LAW = '臺北市土地使用分區管制自治條例';
  var NTP_LAW = '都市計畫法新北市施行細則';
  var TWP_LAW = '都市計畫法臺灣省施行細則';
  var CERT = '個案仍以該地號之土地使用分區證明書、都市計畫書及細部計畫土地使用分區管制要點為準。';

  function Z(name, cls, bcr, far, conf, src, note, extra) {
    var z = { name: name, cls: cls, bcr: bcr, far: far, conf: conf, src: src, note: note || '',
              allowRes: (cls === '住' || cls === '商'), product: (cls === '工') ? '廠辦' : '住宅大樓',
              verified: conf === 'high' || conf === 'mid', article: '' };
    var k;
    if (extra) for (k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) z[k] = extra[k]; }
    return z;
  }

  /* ===================== 通案規定（全國） ===================== */

  /* 停車：建築技術規則建築設計施工編第59條附表（都市計畫內區域）。
     細部計畫另有規定者從其規定（多數縣市更嚴，例如住宅每 100～120 ㎡ 設一位）。*/
  var PARKING_59 = {
    lawName: '建築技術規則建築設計施工編', article: '第59條',
    note: '都市計畫內區域：第一類（辦公、店鋪、商場、餐廳等）300 ㎡ 以下免設、超過部分每 150 ㎡ 設一輛；'
        + '第二類（住宅、集合住宅）500 ㎡ 以下免設、超過部分每 150 ㎡ 設一輛；'
        + '第四類（工廠、倉庫等）500 ㎡ 以下免設、超過部分每 250 ㎡ 設一輛；零數應設置一輛。'
        + '樓地板面積不含停車空間、防空避難、機械房等。都市計畫書另有規定者從其規定。',
    cat: {
      '1': { exemptM2: 300, perM2: 150, label: '第一類（辦公、店鋪、商場等）' },
      '2': { exemptM2: 500, perM2: 150, label: '第二類（住宅、集合住宅）' },
      '3': { exemptM2: 500, perM2: 200, label: '第三類（旅館、醫院等）' },
      '4': { exemptM2: 500, perM2: 250, label: '第四類（工廠、倉庫等）' }
    },
    stallMaxFarM2: 40     /* 第60條第1項第7款：每輛停車空間換算容積之樓地板面積最大 40 ㎡ */
  };

  /* 畸零地：建築法第44條授權各縣市訂最小寬度與深度。各縣市附表數值不同，
     本系統以「全國最嚴格者」做保守檢核：寬度 ≥ 7 m 且深度 ≥ 20 m 的基地，
     在任何縣市的任何分區都不是畸零地；未達者標「需依該縣市附表確認」。*/
  var ODD_CONSERVATIVE = {
    lawName: '建築法', article: '第44條、第45條',
    minWidth: 7, minDepth: 20,
    note: '畸零地最小寬度、深度由各縣市畸零地使用規則（自治條例）附表訂定，依分區與正面路寬分級。'
        + '各縣市住宅區最小寬度多在 3～5 公尺、深度 12～20 公尺之間；本系統以寬 7 公尺、深 20 公尺為保守門檻：'
        + '達到者在任何縣市都不構成畸零地；未達者請以該縣市附表逐項確認，或與鄰地協議合併。'
  };

  /* ===================== 臺北市 ===================== */

  var TPE_NOTE = '數值為' + TPE_LAW + '之分區上限（本系統已逐一核對）。' + CERT;

  var TPE = {
    lawName: TPE_LAW,
    conf: 'high',
    note: '臺北市各分區建蔽率與容積率規定於本自治條例；「之一」「之二」細分區由都市計畫指定。' + CERT,
    zones: {
      '住一': Z('第一種住宅區', '住', 0.30, 0.60, 'high', TPE_LAW, TPE_NOTE, { product: '透天厝' }),
      '住二': Z('第二種住宅區', '住', 0.35, 1.20, 'high', TPE_LAW, TPE_NOTE, { product: '華廈' }),
      '住二之一': Z('第二種住宅區（之一）', '住', 0.35, 1.60, 'high', TPE_LAW, TPE_NOTE, { product: '華廈' }),
      '住二之二': Z('第二種住宅區（之二）', '住', 0.35, 2.25, 'high', TPE_LAW, TPE_NOTE),
      '住三': Z('第三種住宅區', '住', 0.45, 2.25, 'high', TPE_LAW, TPE_NOTE),
      '住三之一': Z('第三種住宅區（之一）', '住', 0.45, 3.00, 'high', TPE_LAW, TPE_NOTE),
      '住三之二': Z('第三種住宅區（之二）', '住', 0.45, 4.00, 'high', TPE_LAW, TPE_NOTE),
      '住四': Z('第四種住宅區', '住', 0.50, 3.00, 'high', TPE_LAW, TPE_NOTE),
      '住四之一': Z('第四種住宅區（之一）', '住', 0.50, 4.00, 'high', TPE_LAW, TPE_NOTE),
      '商一': Z('第一種商業區', '商', 0.55, 3.60, 'high', TPE_LAW, TPE_NOTE),
      '商二': Z('第二種商業區', '商', 0.65, 6.30, 'high', TPE_LAW,
                TPE_NOTE + '商二（630%）高於商三（560%）是條例本身的規定，不是誤植。'),
      '商三': Z('第三種商業區', '商', 0.65, 5.60, 'high', TPE_LAW, TPE_NOTE),
      '商四': Z('第四種商業區', '商', 0.75, 8.00, 'high', TPE_LAW, TPE_NOTE),
      '工二': Z('第二種工業區', '工', 0.45, 2.00, 'high', TPE_LAW,
                TPE_NOTE + '工業區不得作住宅使用，產品以廠辦／一般事務所（依使用組別）為準。'),
      '工三': Z('第三種工業區', '工', 0.55, 3.00, 'high', TPE_LAW,
                TPE_NOTE + '工業區不得作住宅使用，產品以廠辦／一般事務所（依使用組別）為準。')
    },
    parking: PARKING_59,
    oddLot: ODD_CONSERVATIVE,
    setback: { frontM: 0, sideM: 0, conf: 'mid',
               note: '臺北市住宅區、商業區另有前院、後院、側院深度規定（依分區與基地條件），'
                   + '面臨 8 公尺以上道路者多以無遮簷人行道或退縮建築處理；預設 0 公尺，請依分區證明書輸入。' }
  };

  /* ===================== 新北市 ===================== */

  /* 住宅區、商業區容積率依都市計畫區：
     板橋、新莊、三重、中和、永和：住 300%、商 440%（板橋商業區 460%）；
     面前道路未達 8 公尺者：住 200%、商 320%。
     蘆洲、五股、泰山、土城（頂埔）、樹林（山佳）、鶯歌、八里、瑞芳：住 200%、商 300%。
     新店：住三 280%、住四 300%、商一 420%、商二 440%（住宅區預設取 280%）。
     其餘計畫區預設住 200%、商 300%，請以分區證明書為準。*/
  var NTP_RES_FAR = { '板橋區': 3.0, '新莊區': 3.0, '三重區': 3.0, '中和區': 3.0, '永和區': 3.0,
                      '新店區': 2.8, '蘆洲區': 2.0, '五股區': 2.0, '泰山區': 2.0, '土城區': 2.0,
                      '樹林區': 2.0, '鶯歌區': 2.0, '八里區': 2.0, '瑞芳區': 2.0 };
  var NTP_COM_FAR = { '板橋區': 4.6, '新莊區': 4.4, '三重區': 4.4, '中和區': 4.4, '永和區': 4.4,
                      '新店區': 4.2, '蘆洲區': 3.0, '五股區': 3.0, '泰山區': 3.0, '土城區': 3.0,
                      '樹林區': 3.0, '鶯歌區': 3.0, '八里區': 3.0, '瑞芳區': 3.0 };
  var NTP_NARROW = '面前計畫道路未達 8 公尺（或依現有巷道建築）者，板橋、新莊、三重、中和、永和等細部計畫'
                 + '通案規定住宅區容積率降為 200%、商業區 320%。';
  var NTP_IND_NOTE = NTP_LAW + '：工業區建蔽率 60%、容積率 210%。乙種工業區以公害輕微之工廠與其必要附屬設施及'
                   + '工業發展有關設施使用為主，不得作住宅使用；依「新北市各都市計畫甲乙種工業區設置工業發展有關設施'
                   + '公共服務設施公用事業設施及一般商業設施土地使用審查要點」，一般事務所等一般商業設施之使用'
                   + '土地面積以不超過該建築基地面積 10% 為原則。產品以廠辦（工業用樓地板）為主。' + CERT;

  var NTP = {
    lawName: NTP_LAW,
    conf: 'high',
    note: '新北市建蔽率：住宅區 50%、商業區 70%、工業區 60%（' + NTP_LAW + '）；'
        + '住宅區、商業區容積率依各都市計畫書與細部計畫，工業區容積率 210%。' + CERT,
    zones: {
      '住宅區': Z('住宅區', '住', 0.50, 2.0, 'mid', NTP_LAW + '；各該細部計畫',
                  '建蔽率 50% 為施行細則明文；容積率依計畫區（三重、板橋、新莊、中和、永和 300%，'
                + '蘆洲、五股、泰山等 200%，新店住三 280%）。' + NTP_NARROW + CERT,
                  { farByDistrict: NTP_RES_FAR, farNarrowRoad: 2.0 }),
      '商業區': Z('商業區', '商', 0.70, 3.0, 'mid', NTP_LAW + '；各該細部計畫',
                  '建蔽率 70% 為施行細則明文；容積率依計畫區（三重、新莊、中和、永和 440%，板橋 460%，'
                + '新店 420%，蘆洲、五股、泰山等 300%）。' + NTP_NARROW
                + '商業區作住宅使用另有比例限制，規劃時須一併檢討。' + CERT,
                  { farByDistrict: NTP_COM_FAR, farNarrowRoad: 3.2 }),
      '甲種工業區': Z('甲種工業區', '工', 0.60, 2.10, 'high', NTP_LAW, NTP_IND_NOTE),
      '乙種工業區': Z('乙種工業區', '工', 0.60, 2.10, 'high', NTP_LAW, NTP_IND_NOTE),
      '零星工業區': Z('零星工業區', '工', 0.60, 2.10, 'high', NTP_LAW, NTP_IND_NOTE),
      '產業專用區': Z('產業專用區', '工', 0.60, 2.40, 'mid', '各該都市計畫書',
                      '產業專用區之建蔽率、容積率由各該都市計畫書訂定（常見 60%／240%～300%）。' + CERT),
      '行政區': Z('行政區', '其他', 0.60, 2.50, 'mid', NTP_LAW + '（比照臺灣省施行細則第32、34條）', CERT),
      '文教區': Z('文教區', '其他', 0.60, 2.50, 'mid', NTP_LAW + '（比照臺灣省施行細則第32、34條）', CERT),
      '農業區': Z('農業區', '農', 0.10, null, 'high', NTP_LAW,
                  '農業區以農業使用為主，建蔽率 10%，不作一般開發估價；容積率請依個案輸入。' + CERT,
                  { product: '透天厝', allowRes: false }),
      '保護區': Z('保護區', '保', 0.10, null, 'high', NTP_LAW,
                  '保護區原則不得開發，不作一般開發估價；容積率請依個案輸入。' + CERT,
                  { product: '透天厝', allowRes: false })
    },
    parking: PARKING_59,
    oddLot: ODD_CONSERVATIVE,
    setback: { frontM: 4, sideM: 0, conf: 'mid',
               note: '新北市細部計畫與都市設計審議對面臨計畫道路之基地多要求自道路境界線退縮建築'
                   + '（常見 3.64～6 公尺，留設無遮簷人行道或植栽帶，退縮部分得計入法定空地）。'
                   + '預設 4 公尺，請依分區證明書與細部計畫土管要點輸入實際值。' }
  };

  /* ===================== 臺灣省施行細則適用之縣市與其他直轄市 ===================== */

  var TWP_NOTE_RES = '依' + TWP_LAW + '第34條，住宅區、商業區容積率依都市計畫書所載；未載明者依居住密度與'
                   + '鄰里性公共設施比值分級（住宅區 120%～240%、商業區 180%～320%）。本系統預設取'
                   + '居住密度每公頃 300～400 人、公設比值未逾 15% 之級距（住宅區 180%、商業區 240%）。' + CERT;

  function provincial(lawName, lawConf, res, com) {
    var src = lawName;
    return {
      lawName: lawName,
      conf: lawConf,
      note: '建蔽率依' + lawName + '（住宅區 60%、商業區 80%、工業區 70%）；容積率依都市計畫書，'
          + '工業區 210%。' + CERT,
      zones: {
        '住宅區': Z('住宅區', '住', 0.60, res.far, 'mid', src, res.note || TWP_NOTE_RES, res.extra || null),
        '商業區': Z('商業區', '商', 0.80, com.far, 'mid', src, com.note || TWP_NOTE_RES, com.extra || null),
        '甲種工業區': Z('甲種工業區', '工', 0.70, 2.10, lawConf, src,
                        TWP_LAW + '第32條第3款、第34條第1項第3款：工業區建蔽率 70%、容積率 210%；'
                      + '乙種工業區不得作住宅使用（第18條）。' + CERT),
        '乙種工業區': Z('乙種工業區', '工', 0.70, 2.10, lawConf, src,
                        TWP_LAW + '第18條、第32條、第34條：乙種工業區以公害輕微之工廠與其必要附屬設施'
                      + '及工業發展有關設施使用為主，不得作住宅使用；建蔽率 70%、容積率 210%。' + CERT),
        '零星工業區': Z('零星工業區', '工', 0.70, 2.10, lawConf, src,
                        '工業區建蔽率 70%、容積率 210%（' + TWP_LAW + '第32、34條）。' + CERT),
        '行政區': Z('行政區', '其他', 0.60, 2.50, lawConf, src, TWP_LAW + '第32、34條。' + CERT),
        '文教區': Z('文教區', '其他', 0.60, 2.50, lawConf, src, TWP_LAW + '第32、34條。' + CERT),
        '倉庫區': Z('倉庫區', '工', 0.70, 3.00, lawConf, src, TWP_LAW + '第32、34條。' + CERT),
        '風景區': Z('風景區', '其他', 0.20, 0.60, lawConf, src, TWP_LAW + '第32、34條。' + CERT,
                    { product: '透天厝' }),
        '醫療專用區': Z('醫療專用區', '其他', 0.60, 2.00, lawConf, src, TWP_LAW + '第32、34條。' + CERT),
        '農業區': Z('農業區', '農', 0.10, null, lawConf, src,
                    '農業區建蔽率 10%（' + TWP_LAW + '第32條），以農業使用為主，不作一般開發估價。' + CERT,
                    { product: '透天厝', allowRes: false }),
        '保護區': Z('保護區', '保', 0.10, null, lawConf, src,
                    '保護區建蔽率 10%（' + TWP_LAW + '第32條），原則不得開發。' + CERT,
                    { product: '透天厝', allowRes: false })
      },
      parking: PARKING_59,
      oddLot: ODD_CONSERVATIVE,
      setback: { frontM: 0, sideM: 0, conf: 'mid',
                 note: '退縮規定依各該細部計畫土地使用分區管制要點，預設 0 公尺，請依分區證明書輸入。' }
    };
  }

  var cities = {
    '臺北市': TPE,
    '新北市': NTP,
    '桃園市': provincial('都市計畫法桃園市施行細則', 'mid',
      { far: 2.3, note: '桃園市各都市計畫住宅區常見容積率 230%（依計畫區不同），' + CERT },
      { far: 3.8, note: '桃園市各都市計畫商業區常見容積率 380%（依計畫區不同），' + CERT }),
    '臺中市': provincial('都市計畫法臺中市施行自治條例', 'mid', { far: 1.8 }, { far: 2.4 }),
    '臺南市': provincial('都市計畫法臺南市施行細則', 'mid', { far: 1.8 }, { far: 2.4 }),
    '高雄市': provincial('都市計畫法高雄市施行細則', 'mid',
      { far: 2.4, note: '高雄市住宅區分第二種～第五種（容積率 150%、240%、300%、420%），預設取第三種 240%。' + CERT },
      { far: 4.9, note: '高雄市商業區分第一種～第五種（容積率 240%～840%），預設取第三種 490%。' + CERT })
  };

  var PROVINCIAL = ['基隆市', '新竹市', '嘉義市', '新竹縣', '苗栗縣', '彰化縣', '南投縣', '雲林縣',
                    '嘉義縣', '屏東縣', '宜蘭縣', '花蓮縣', '臺東縣', '澎湖縣', '金門縣', '連江縣'];
  var i;
  for (i = 0; i < PROVINCIAL.length; i++) {
    cities[PROVINCIAL[i]] = provincial(TWP_LAW, 'high', { far: 1.8 }, { far: 2.4 });
  }

  /* 所有縣市都補一個「其他」：分區不在清單內時，由使用者自行輸入建蔽率與容積率 */
  var ck;
  for (ck in cities) {
    if (!Object.prototype.hasOwnProperty.call(cities, ck)) continue;
    cities[ck].zones['其他'] = Z('其他（請輸入建蔽率與容積率）', '其他', null, null, 'mid', '使用者輸入',
      '本分區沒有通案數值，請依土地使用分區證明書於左側輸入建蔽率與容積率。');
  }

  /* 分區代碼的別名：謄本與使用者常寫全名或簡稱，對應到本表的鍵 */
  var ALIAS = {
    '第一種住宅區': '住一', '第二種住宅區': '住二', '第三種住宅區': '住三', '第四種住宅區': '住四',
    '第一種商業區': '商一', '第二種商業區': '商二', '第三種商業區': '商三', '第四種商業區': '商四',
    '第二種工業區': '工二', '第三種工業區': '工三',
    '乙工': '乙種工業區', '甲工': '甲種工業區', '住宅': '住宅區', '商業': '商業區'
  };

  /* 取分區資料：先查原鍵，再查別名；新北市住宅區、商業區依行政區與路寬回傳實際容積率。
     回傳的是複本，呼叫端改了也不會污染資料表。*/
  function lookup(city, zone, district, roadWidth) {
    var c = Object.prototype.hasOwnProperty.call(cities, city) ? cities[city] : null;
    if (!c || !zone) return null;
    var key = Object.prototype.hasOwnProperty.call(c.zones, zone) ? zone
            : (Object.prototype.hasOwnProperty.call(ALIAS, zone) && Object.prototype.hasOwnProperty.call(c.zones, ALIAS[zone]) ? ALIAS[zone] : null);
    if (!key) return null;
    var z = c.zones[key], out = {}, k;
    for (k in z) { if (Object.prototype.hasOwnProperty.call(z, k)) out[k] = z[k]; }
    out.key = key;
    out.farReason = '';
    if (z.farByDistrict && district && Object.prototype.hasOwnProperty.call(z.farByDistrict, district)) {
      out.far = z.farByDistrict[district];
      out.farReason = district + '所屬都市計畫之' + z.name + '容積率';
    } else if (z.farByDistrict) {
      out.farReason = '本行政區未列於本表，採保守預設值';
    }
    if (typeof z.farNarrowRoad === 'number' && typeof roadWidth === 'number' && roadWidth > 0 && roadWidth < 8
        && typeof out.far === 'number' && out.far > z.farNarrowRoad) {
      out.far = z.farNarrowRoad;
      out.farReason = '面前道路 ' + roadWidth + ' 公尺未達 8 公尺，依細部計畫通案規定降為 ' + Math.round(z.farNarrowRoad * 100) + '%';
    }
    return out;
  }

  TD.data.zoning = {
    _meta: {
      title: '土地使用分區管制',
      asOf: '2026-10-03',
      verified: true,
      source: '臺北市土地使用分區管制自治條例；都市計畫法新北市施行細則與各細部計畫；'
            + '都市計畫法臺灣省施行細則（114 年 8 月 12 日修正）；建築技術規則建築設計施工編第59條；建築法第44條',
      note: '臺北市、新北市工業區與臺灣省施行細則適用縣市之數值為法規明文（high）；'
          + '新北市住宅區商業區、其他直轄市住宅區商業區為依計畫區之常見值或法規上限（mid）。' + CERT
    },
    cities: cities,
    lookup: lookup,
    alias: ALIAS,
    parking59: PARKING_59,
    oddConservative: ODD_CONSERVATIVE
  };
})(window.TD);
