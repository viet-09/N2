const fs = require('fs');

function item(kanji, on, kun, meaningVi, ex1jp, ex1vi, ex2jp, ex2vi) {
  return {
    kanji,
    on,
    kun,
    meaningVi,
    examples: [
      { jp: ex1jp, vi: ex1vi },
      { jp: ex2jp, vi: ex2vi }
    ]
  };
}

const data = {};

// ---------------- WEEK 4 ----------------

data.k4d1 = {
  introVi: "Bài này ôn tiếp âm On (音読み) với các Hán tự N2 thường gặp có NHIỀU âm On khác nhau tùy từ ghép — điểm hay gây nhầm lẫn khi thi. Hãy chú ý từ ghép nào dùng âm On nào.",
  items: [
    item("行", "コウ・ギョウ・アン", "いく・おこなう", "đi, thực hiện, hàng/dòng (nhiều âm On khác nhau theo từ ghép)",
      "{行動|こうどう}", "hành động",
      "{行事|ぎょうじ}", "sự kiện, nghi lễ thường niên"),
    item("生", "セイ・ショウ", "いきる・うまれる・なま", "sinh, sống, tươi (sống)",
      "{生産|せいさん}", "sản xuất",
      "{一生|いっしょう}", "cả đời người"),
    item("分", "フン・ブン", "わける・わかる", "phần, chia, phút",
      "{分析|ぶんせき}", "phân tích",
      "{三分|さんぷん}", "ba phút"),
    item("度", "ド・タク", "たび", "độ, lần, mức độ",
      "{態度|たいど}", "thái độ",
      "{支度|したく}", "sự chuẩn bị, sửa soạn"),
    item("楽", "ガク・ラク", "たのしい・らく", "vui, âm nhạc, thoải mái",
      "{音楽|おんがく}", "âm nhạc",
      "{気楽|きらく}", "thoải mái, vô lo"),
    item("出", "シュツ・スイ", "でる・だす", "ra, xuất",
      "{出発|しゅっぱつ}", "xuất phát, khởi hành",
      "{出納|すいとう}", "thu chi (kế toán)"),
    item("発", "ハツ・ホツ", "（なし）", "phát ra, bùng nổ, khởi phát",
      "{発見|はっけん}", "phát hiện",
      "{発端|ほったん}", "nguyên nhân, đầu mối của sự việc")
  ]
};

data.k4d2 = {
  introVi: "Bài này tập trung vào âm Kun (訓読み) của các động từ Hán tự thường gặp trong đề đọc hiểu và từ vựng N2. Mỗi Hán tự có một cách đọc riêng khi đứng độc lập làm động từ.",
  items: [
    item("支", "シ", "ささえる", "chống đỡ, hỗ trợ, nâng đỡ",
      "{支|ささ}える", "chống đỡ, ủng hộ",
      "{支障|ししょう}", "trở ngại, chướng ngại"),
    item("従", "ジュウ", "したがう", "tuân theo, đi theo, phục tùng",
      "{従|したが}う", "tuân theo, làm theo",
      "{従業員|じゅうぎょういん}", "nhân viên"),
    item("抱", "ホウ", "かかえる・だく", "ôm, gánh (vấn đề, khó khăn)",
      "{抱|かか}える", "ôm, gánh chịu (vấn đề)",
      "{抱負|ほうふ}", "hoài bão, khát vọng"),
    item("訴", "ソ", "うったえる", "kiện, khiếu nại, kêu gọi",
      "{訴|うった}える", "khiếu nại, kêu gọi, than phiền",
      "{訴訟|そしょう}", "tố tụng, kiện tụng"),
    item("恵", "ケイ・エ", "めぐむ・めぐみ", "ban ơn, ban phước, trí tuệ",
      "{恵|めぐ}み", "ơn huệ, phước lành",
      "{知恵|ちえ}", "trí tuệ, sự khôn khéo"),
    item("補", "ホ", "おぎなう", "bù đắp, bổ sung",
      "{補|おぎな}う", "bù đắp, bổ sung phần thiếu",
      "{補習|ほしゅう}", "học bù, học thêm"),
    item("慣", "カン", "なれる・ならす", "quen, thành thói quen",
      "{慣|な}れる", "trở nên quen thuộc",
      "{習慣|しゅうかん}", "tập quán, thói quen")
  ]
};

data.k4d3 = {
  introVi: "Tiếp tục luyện âm Kun (訓読み) với các động từ Hán tự nâng cao hơn, thường xuất hiện trong bài đọc hiểu trình độ N2 với nghĩa trừu tượng.",
  items: [
    item("逆", "ギャク", "さか・さからう", "nghịch, ngược, chống lại",
      "{逆|さか}らう", "chống lại, làm ngược lại",
      "{逆転|ぎゃくてん}", "đảo ngược tình thế"),
    item("隔", "カク", "へだてる・へだたる", "cách, ngăn cách",
      "{隔|へだ}てる", "ngăn cách, làm cách biệt",
      "{隔週|かくしゅう}", "cách tuần, hai tuần một lần"),
    item("潜", "セン", "ひそむ・もぐる", "ẩn giấu, lặn, tiềm ẩn",
      "{潜|ひそ}む", "ẩn nấp, ẩn chứa",
      "{潜在|せんざい}", "tiềm ẩn"),
    item("携", "ケイ", "たずさえる・たずさわる", "mang theo, tham gia vào",
      "{携|たずさ}わる", "tham gia vào (công việc)",
      "{携帯|けいたい}", "mang theo mình, điện thoại di động"),
    item("陥", "カン", "おちいる・おとしいれる", "rơi vào (tình trạng xấu), sập",
      "{陥|おちい}る", "rơi vào tình trạng xấu",
      "{欠陥|けっかん}", "khiếm khuyết, lỗi"),
    item("遂", "スイ", "とげる", "hoàn thành, đạt được (mục tiêu)",
      "{遂|と}げる", "đạt được, hoàn thành",
      "{遂行|すいこう}", "thực hiện, tiến hành"),
    item("巡", "ジュン", "めぐる", "đi vòng quanh, tuần tra",
      "{巡|めぐ}る", "đi vòng quanh, xoay quanh",
      "{巡回|じゅんかい}", "tuần tra, đi tuần")
  ]
};

data.k4d4 = {
  introVi: "Bài này giới thiệu hiện tượng đọc âm hỗn hợp On-Kun trong một từ ghép: 湯桶読み (Kun + On, ví dụ 場所ばしょ) và 重箱読み (On + Kun, ví dụ 台所だいどころ). Đây là điểm dễ nhầm khi đoán cách đọc từ ghép Hán tự.",
  items: [
    item("場", "ジョウ", "ば", "nơi, chỗ, nơi diễn ra",
      "{場所|ばしょ}", "nơi, địa điểm (湯桶読み: kun+on)",
      "{本場|ほんば}", "nơi xuất xứ chính gốc (重箱読み: on+kun)"),
    item("所", "ショ", "ところ", "nơi, chốn",
      "{台所|だいどころ}", "nhà bếp (重箱読み: on+kun)",
      "{近所|きんじょ}", "hàng xóm, vùng lân cận (đọc âm On thông thường)"),
    item("手", "シュ", "て", "tay",
      "{手本|てほん}", "khuôn mẫu, mẫu mực (湯桶読み: kun+on)",
      "{助手|じょしゅ}", "trợ lý (đọc âm On thông thường)"),
    item("本", "ホン", "もと", "sách, gốc, vốn",
      "{見本|みほん}", "hàng mẫu (湯桶読み: kun+on)",
      "{本場|ほんば}", "nơi chính gốc, xuất xứ (重箱読み: on+kun)"),
    item("毎", "マイ", "（なし）", "mỗi, mỗi lần",
      "{毎朝|まいあさ}", "mỗi buổi sáng (重箱読み: on+kun)",
      "{毎年|まいとし}", "mỗi năm (重箱読み: on+kun)"),
    item("屋", "オク", "や", "nhà, tiệm, quán",
      "{肉屋|にくや}", "tiệm bán thịt (重箱読み: on+kun)",
      "{楽屋|がくや}", "phòng hóa trang của diễn viên (重箱読み: on+kun)"),
    item("具", "グ", "（なし）", "đồ dùng, dụng cụ",
      "{雨具|あまぐ}", "đồ dùng khi đi mưa (áo mưa, dù...) (湯桶読み: kun+on)",
      "{道具|どうぐ}", "dụng cụ, công cụ (đọc âm On thông thường)")
  ]
};

data.k4d5 = {
  introVi: "Tiếng Nhật có rất nhiều Hán tự đồng âm (同音異義語) — phát âm On giống nhau nhưng hình dạng và nghĩa hoàn toàn khác nhau, dễ gây nhầm lẫn khi nghe hoặc chọn Hán tự trong đề thi N2. Bài này ôn nhóm âm カン và コウ.",
  items: [
    item("感", "カン", "（なし）", "cảm, cảm giác (dễ nhầm với 観・関 cùng đọc カン)",
      "{感想|かんそう}", "cảm nghĩ",
      "{感動|かんどう}", "cảm động"),
    item("観", "カン", "（なし）", "quan sát, xem, quan điểm (khác 感 - cảm giác)",
      "{観光|かんこう}", "du lịch, tham quan",
      "{観察|かんさつ}", "quan sát"),
    item("関", "カン", "せき・かかわる", "liên quan, cửa quan (khác 感・観)",
      "{関係|かんけい}", "quan hệ, liên quan",
      "{関心|かんしん}", "sự quan tâm"),
    item("館", "カン", "（なし）", "tòa nhà, quán lớn (thư viện, khách sạn...)",
      "{図書館|としょかん}", "thư viện",
      "{旅館|りょかん}", "nhà nghỉ kiểu Nhật"),
    item("効", "コウ", "きく", "hiệu quả, công hiệu (dễ nhầm với 校・高 cùng đọc コウ)",
      "{効果|こうか}", "hiệu quả",
      "{有効|ゆうこう}", "có hiệu lực"),
    item("好", "コウ", "このむ・すく", "thích, ưa, tốt đẹp",
      "{好調|こうちょう}", "tình trạng tốt, thuận lợi",
      "{好|す}き", "thích, yêu thích"),
    item("交", "コウ", "まじる・かわす", "giao, trao đổi, giao thoa",
      "{交流|こうりゅう}", "giao lưu",
      "{交換|こうかん}", "trao đổi")
  ]
};

data.k4d6 = {
  introVi: "Tiếp tục luyện Hán tự đồng âm (同音異義語) với nhóm âm シ và セイ — những Hán tự rất dễ chọn nhầm trong phần Hán tự của đề thi N2 vì phát âm giống nhau hoàn toàn.",
  items: [
    item("私", "シ", "わたし・わたくし", "tôi, riêng tư, cá nhân",
      "{私立|しりつ}", "tư lập (trường do tư nhân thành lập)",
      "{私生活|しせいかつ}", "đời tư"),
    item("視", "シ", "（なし）", "nhìn, xem xét (khác 私・詩)",
      "{視力|しりょく}", "thị lực",
      "{重視|じゅうし}", "coi trọng"),
    item("姿", "シ", "すがた", "hình dáng, tư thế, bóng dáng",
      "{姿勢|しせい}", "tư thế, thái độ",
      "{容姿|ようし}", "dung nhan, vẻ ngoài"),
    item("詩", "シ", "（なし）", "thơ, thi ca",
      "{詩人|しじん}", "nhà thơ",
      "{詩集|ししゅう}", "tập thơ"),
    item("性", "セイ・ショウ", "（なし）", "tính chất, giới tính, bản chất (dễ nhầm với 制・製)",
      "{性格|せいかく}", "tính cách",
      "{個性|こせい}", "cá tính"),
    item("制", "セイ", "（なし）", "chế độ, khống chế, kiểm soát (khác 性・製)",
      "{制度|せいど}", "chế độ",
      "{制限|せいげん}", "hạn chế"),
    item("製", "セイ", "（なし）", "chế tạo, sản xuất (khác 性・制)",
      "{製造|せいぞう}", "sản xuất, chế tạo",
      "{日本製|にほんせい}", "sản xuất tại Nhật")
  ]
};

data.k4d7 = {
  introVi: "実戦問題 — Ôn tập tổng hợp tuần 4: âm On đa dạng, âm Kun của động từ, hiện tượng đọc hỗn hợp On-Kun, và Hán tự đồng âm. Hãy chắc chắn phân biệt được các Hán tự dễ nhầm lẫn đã học.",
  items: [
    item("行", "コウ・ギョウ", "いく・おこなう", "ôn: âm On đa dạng của một Hán tự",
      "{実行|じっこう}", "thực hiện",
      "{行方|ゆくえ}", "tung tích, nơi đi tới"),
    item("支", "シ", "ささえる", "ôn: âm Kun của động từ Hán tự",
      "{支|ささ}える", "chống đỡ, ủng hộ",
      "{収支|しゅうし}", "thu chi"),
    item("場", "ジョウ", "ば", "ôn: hiện tượng đọc hỗn hợp On-Kun",
      "{場所|ばしょ}", "nơi, địa điểm (湯桶読み)",
      "{会場|かいじょう}", "hội trường, địa điểm sự kiện"),
    item("効", "コウ", "きく", "ôn: Hán tự đồng âm nhóm コウ",
      "{効果|こうか}", "hiệu quả",
      "{効|き}く", "có hiệu quả, phát huy tác dụng"),
    item("感", "カン", "（なし）", "ôn: Hán tự đồng âm nhóm カン",
      "{感謝|かんしゃ}", "cảm ơn",
      "{感覚|かんかく}", "cảm giác"),
    item("性", "セイ・ショウ", "（なし）", "ôn: Hán tự đồng âm nhóm セイ, và đọc hỗn hợp On-Kun",
      "{性質|せいしつ}", "tính chất",
      "{相性|あいしょう}", "hợp tính, hợp nhau (湯桶読み)"),
    item("慣", "カン", "なれる・ならす", "ôn: âm Kun của động từ Hán tự",
      "{慣|な}れる", "trở nên quen thuộc",
      "{習慣|しゅうかん}", "tập quán, thói quen")
  ]
};

// ---------------- WEEK 5 ----------------

data.k5d1 = {
  introVi: "Trong tiếng Nhật có nhiều Hán tự mang nghĩa gần giống nhau (同義語 - từ đồng nghĩa), thường dùng thay thế nhau trong văn viết trang trọng. Bài này giới thiệu nhóm nghĩa \"cùng nhau\" và \"tăng lên\".",
  items: [
    item("相", "ソウ・ショウ", "あい", "lẫn nhau, tương hỗ",
      "{相互|そうご}", "tương hỗ, qua lại",
      "{相談|そうだん}", "bàn bạc, tư vấn"),
    item("共", "キョウ", "とも", "cùng, chung (đồng nghĩa gần với 相・同)",
      "{共通|きょうつう}", "điểm chung, phổ biến",
      "{共同|きょうどう}", "hợp tác, cùng nhau"),
    item("同", "ドウ", "おなじ", "giống, cùng (đồng nghĩa gần với 共)",
      "{同時|どうじ}", "đồng thời",
      "{同様|どうよう}", "tương tự, giống như"),
    item("増", "ゾウ", "ます・ふえる", "tăng, tăng lên",
      "{増加|ぞうか}", "tăng lên",
      "{急増|きゅうぞう}", "tăng vọt, tăng nhanh"),
    item("加", "カ", "くわえる・くわわる", "thêm vào, gia tăng (đồng nghĩa với 増)",
      "{追加|ついか}", "bổ sung thêm",
      "{加入|かにゅう}", "gia nhập"),
    item("上", "ジョウ", "うえ・あがる・のぼる", "lên, tăng, ở trên",
      "{上昇|じょうしょう}", "tăng lên, đi lên",
      "{向上|こうじょう}", "nâng cao, cải thiện"),
    item("昇", "ショウ", "のぼる", "đi lên, thăng tiến (đồng nghĩa với 上)",
      "{昇進|しょうしん}", "thăng chức, thăng tiến",
      "{昇格|しょうかく}", "thăng cấp")
  ]
};

data.k5d2 = {
  introVi: "Tiếp tục học nhóm Hán tự đồng nghĩa (同義語), lần này là nhóm nghĩa \"giảm xuống\" và \"khó khăn, cố gắng\" — rất thường gặp trong bài đọc hiểu và luận N2.",
  items: [
    item("減", "ゲン", "へる・へらす", "giảm, giảm xuống",
      "{減少|げんしょう}", "giảm thiểu",
      "{削減|さくげん}", "cắt giảm"),
    item("縮", "シュク", "ちぢむ・ちぢめる", "rút ngắn, co lại (đồng nghĩa gần với 減)",
      "{縮小|しゅくしょう}", "thu nhỏ lại",
      "{短縮|たんしゅく}", "rút ngắn"),
    item("努", "ド", "つとめる", "cố gắng, nỗ lực",
      "{努力|どりょく}", "nỗ lực",
      "{努|つと}める", "cố gắng, gắng sức"),
    item("励", "レイ", "はげむ・はげます", "khích lệ, gắng sức (đồng nghĩa với 努)",
      "{励|はげ}む", "chăm chỉ, gắng sức",
      "{奨励|しょうれい}", "khuyến khích"),
    item("困", "コン", "こまる", "khó khăn, khốn khó",
      "{困難|こんなん}", "khó khăn",
      "{貧困|ひんこん}", "nghèo khó"),
    item("難", "ナン", "かたい・むずかしい", "khó, khó khăn (đồng nghĩa với 困)",
      "{困難|こんなん}", "khó khăn",
      "{難民|なんみん}", "người tị nạn"),
    item("苦", "ク", "くるしい・にがい", "khổ, đắng, khó chịu",
      "{苦労|くろう}", "vất vả, khổ cực",
      "{苦手|にがて}", "không giỏi, ngại làm")
  ]
};

data.k5d3 = {
  introVi: "Hán tự đối nghĩa (対義語) là các cặp Hán tự mang nghĩa trái ngược nhau, thường xuất hiện trong đề thi từ vựng N2. Bài này ôn các cặp về mức độ: cao-thấp, mạnh-yếu, sâu-cạn, dày.",
  items: [
    item("高", "コウ", "たかい", "cao (đối nghĩa với 低)",
      "{高度|こうど}", "độ cao, cao độ",
      "{最高|さいこう}", "cao nhất"),
    item("低", "テイ", "ひくい", "thấp (đối nghĩa với 高)",
      "{低下|ていか}", "hạ xuống, suy giảm",
      "{最低|さいてい}", "thấp nhất"),
    item("強", "キョウ", "つよい・つよまる", "mạnh (đối nghĩa với 弱)",
      "{強化|きょうか}", "tăng cường",
      "{強力|きょうりょく}", "mạnh mẽ"),
    item("弱", "ジャク", "よわい・よわまる", "yếu (đối nghĩa với 強)",
      "{弱点|じゃくてん}", "điểm yếu",
      "{弱|よわ}い", "yếu"),
    item("深", "シン", "ふかい", "sâu (đối nghĩa với 浅)",
      "{深刻|しんこく}", "nghiêm trọng, sâu sắc",
      "{深夜|しんや}", "đêm khuya"),
    item("浅", "セン", "あさい", "nông, cạn (đối nghĩa với 深)",
      "{浅|あさ}い", "nông, cạn",
      "{浅薄|せんぱく}", "hời hợt, nông cạn"),
    item("厚", "コウ", "あつい", "dày (đối nghĩa với 薄)",
      "{厚|あつ}い", "dày",
      "{濃厚|のうこう}", "đậm đặc, đậm")
  ]
};

data.k5d4 = {
  introVi: "Tiếp tục ôn Hán tự đối nghĩa (対義語) với các cặp: mỏng-dày, rộng-hẹp, phức tạp-đơn giản, xa-gần — nhóm từ hay xuất hiện trong đề đọc hiểu và ngữ pháp N2.",
  items: [
    item("薄", "ハク", "うすい", "mỏng, nhạt (đối nghĩa với 厚)",
      "{薄|うす}い", "mỏng, nhạt",
      "{薄型|うすがた}", "kiểu dáng mỏng"),
    item("広", "コウ", "ひろい・ひろがる", "rộng (đối nghĩa với 狭)",
      "{広大|こうだい}", "rộng lớn",
      "{広|ひろ}い", "rộng"),
    item("狭", "キョウ", "せまい", "hẹp (đối nghĩa với 広)",
      "{狭|せま}い", "hẹp",
      "{狭義|きょうぎ}", "nghĩa hẹp"),
    item("複", "フク", "（なし）", "phức tạp, nhiều lớp (dùng trong 複雑, đối nghĩa với 単)",
      "{複雑|ふくざつ}", "phức tạp",
      "{複数|ふくすう}", "số nhiều"),
    item("単", "タン", "（なし）", "đơn, đơn giản (đối nghĩa với 複)",
      "{単純|たんじゅん}", "đơn giản",
      "{単独|たんどく}", "đơn độc, một mình"),
    item("遠", "エン", "とおい", "xa (đối nghĩa với 近)",
      "{遠慮|えんりょ}", "khách sáo, e dè, kiêng nể",
      "{永遠|えいえん}", "vĩnh viễn"),
    item("近", "キン", "ちかい", "gần (đối nghĩa với 遠)",
      "{近所|きんじょ}", "hàng xóm",
      "{最近|さいきん}", "gần đây")
  ]
};

data.k5d5 = {
  introVi: "Nhiều thành ngữ tiếng Nhật (慣用表現) dùng Hán tự chỉ bộ phận cơ thể để diễn tả cảm xúc, tính cách, hành động một cách bóng bẩy. Bài này giới thiệu các thành ngữ với 手・目・口・顔・頭・足・腹.",
  items: [
    item("手", "シュ", "て", "tay",
      "{手|て}に{余|あま}る", "quá sức, ngoài khả năng xử lý",
      "{手|て}を{焼|や}く", "bó tay, gặp khó khăn khi xử lý"),
    item("目", "モク", "め", "mắt",
      "{目|め}を{通|とお}す", "xem qua, lướt qua (tài liệu)",
      "{目|め}に{留|と}まる", "gây chú ý, đập vào mắt"),
    item("口", "コウ", "くち", "miệng",
      "{口|くち}を{挟|はさ}む", "xen vào cuộc nói chuyện",
      "{口|くち}が{堅|かた}い", "kín miệng, giữ bí mật tốt"),
    item("顔", "ガン", "かお", "mặt",
      "{顔|かお}が{広|ひろ}い", "quan hệ rộng, quen biết nhiều người",
      "{顔|かお}に{出|で}る", "thể hiện ra mặt (cảm xúc)"),
    item("頭", "トウ・ズ", "あたま", "đầu",
      "{頭|あたま}を{抱|かか}える", "đau đầu vì vấn đề nào đó",
      "{頭|あたま}が{固|かた}い", "đầu óc cứng nhắc, bảo thủ"),
    item("足", "ソク", "あし・たりる", "chân, đủ",
      "{足|あし}を{運|はこ}ぶ", "đích thân đến, ghé qua",
      "{足|た}りる", "đủ"),
    item("腹", "フク", "はら", "bụng",
      "{腹|はら}が{立|た}つ", "nổi giận, bực mình",
      "{腹|はら}を{決|き}める", "quyết tâm, hạ quyết định")
  ]
};

data.k5d6 = {
  introVi: "Tiếp tục học thành ngữ (慣用表現) dùng Hán tự chỉ bộ phận cơ thể — nhóm 耳・鼻・胸・肩・骨・心・気, rất hữu ích để hiểu văn hội thoại và bài đọc N2.",
  items: [
    item("耳", "ジ", "みみ", "tai",
      "{耳|みみ}を{疑|うたが}う", "không tin vào tai mình vì quá bất ngờ",
      "{耳|みみ}に{入|はい}る", "nghe được, lọt vào tai"),
    item("鼻", "ビ", "はな", "mũi",
      "{鼻|はな}が{高|たか}い", "tự hào, hãnh diện",
      "{鼻|はな}にかける", "khoe khoang, tự đắc"),
    item("胸", "キョウ", "むね", "ngực",
      "{胸|むね}を{張|は}る", "ngẩng cao đầu, tự tin",
      "{胸|むね}が{痛|いた}む", "đau lòng, xót xa"),
    item("肩", "ケン", "かた", "vai",
      "{肩|かた}を{持|も}つ", "đứng về phía ai, bênh vực",
      "{肩|かた}の{荷|に}が{下|お}りる", "nhẹ nhõm, trút được gánh nặng"),
    item("骨", "コツ", "ほね", "xương",
      "{骨|ほね}が{折|お}れる", "vất vả, tốn nhiều công sức",
      "{骨|こつ}をつかむ", "nắm được bí quyết, mấu chốt"),
    item("心", "シン", "こころ", "tim, tâm",
      "{心|こころ}を{込|こ}める", "đặt hết tâm huyết vào",
      "{心配|しんぱい}", "lo lắng"),
    item("気", "キ・ケ", "（なし）", "khí, tâm trạng",
      "{気|き}に{入|い}る", "thích, ưa",
      "{気|き}が{利|き}く", "nhạy bén, tinh ý")
  ]
};

data.k5d7 = {
  introVi: "実戦問題 — Ôn tập tổng hợp tuần 5: Hán tự đồng nghĩa, đối nghĩa, và thành ngữ dùng bộ phận cơ thể. Hãy ôn lại các cặp từ và thành ngữ đã học để làm quen với dạng đề thi thực tế.",
  items: [
    item("増", "ゾウ", "ふえる・ます", "ôn: từ đồng nghĩa nhóm \"tăng lên\"",
      "{増加|ぞうか}", "tăng lên",
      "{急増|きゅうぞう}", "tăng vọt"),
    item("減", "ゲン", "へる・へらす", "ôn: từ đối nghĩa với 増",
      "{減少|げんしょう}", "giảm",
      "{半減|はんげん}", "giảm một nửa"),
    item("高", "コウ", "たかい", "ôn: từ đối nghĩa với 低",
      "{高齢|こうれい}", "cao tuổi",
      "{最高|さいこう}", "cao nhất"),
    item("弱", "ジャク", "よわい", "ôn: từ đối nghĩa với 強",
      "{弱者|じゃくしゃ}", "kẻ yếu",
      "{弱点|じゃくてん}", "điểm yếu"),
    item("手", "シュ", "て", "ôn: thành ngữ với 手",
      "{手|て}を{焼|や}く", "bó tay, khó xử lý",
      "{手|て}に{余|あま}る", "quá sức xử lý"),
    item("口", "コウ", "くち", "ôn: thành ngữ với 口",
      "{口|くち}が{堅|かた}い", "kín miệng",
      "{口|くち}を{挟|はさ}む", "xen vào cuộc nói chuyện"),
    item("困", "コン", "こまる", "ôn: từ đồng nghĩa với 難",
      "{困難|こんなん}", "khó khăn",
      "{困|こま}る", "gặp khó khăn, bối rối")
  ]
};

// ---------------- WEEK 6 ----------------

data.k6d1 = {
  introVi: "Tiếp tục học thành ngữ (慣用表現), lần này là nhóm dùng hiện tượng thiên nhiên: 水・火・波・風・石・山・息 — thường mang nghĩa bóng chỉ tình huống trong cuộc sống, công việc.",
  items: [
    item("水", "スイ", "みず", "nước",
      "{水|みず}に{流|なが}す", "cho qua, bỏ qua chuyện cũ",
      "{水|みず}を{差|さ}す", "phá đám, làm gián đoạn"),
    item("火", "カ", "ひ", "lửa",
      "{火|ひ}に{油|あぶら}を{注|そそ}ぐ", "đổ thêm dầu vào lửa, làm tình huống tệ hơn",
      "{火|ひ}の{車|くるま}", "tình cảnh khó khăn về tiền bạc"),
    item("波", "ハ", "なみ", "sóng",
      "{波|なみ}に{乗|の}る", "bắt kịp xu hướng, thuận theo trào lưu",
      "{波風|なみかぜ}が{立|た}つ", "nảy sinh xung đột, bất hòa"),
    item("風", "フウ", "かぜ", "gió",
      "{風向|かざむ}きが{変|か}わる", "tình hình thay đổi",
      "{風当|かぜあ}たりが{強|つよ}い", "bị chỉ trích, chịu nhiều áp lực"),
    item("石", "セキ", "いし", "đá",
      "{石|いし}につまずく", "vấp phải khó khăn nhỏ",
      "{石橋|いしばし}を{叩|たた}いて{渡|わた}る", "cẩn thận quá mức, dò xét kỹ trước khi hành động"),
    item("山", "サン", "やま", "núi",
      "{山|やま}を{越|こ}える", "vượt qua giai đoạn khó khăn nhất",
      "{山場|やまば}", "cao điểm, thời điểm mấu chốt"),
    item("息", "ソク", "いき", "hơi thở",
      "{息|いき}を{抜|ぬ}く", "nghỉ ngơi, xả hơi",
      "{息|いき}が{合|あ}う", "hợp ý nhau, ăn ý")
  ]
};

data.k6d2 = {
  introVi: "四字熟語 là các cụm từ 4 chữ Hán mang một nghĩa cố định, rất hay gặp trong bài đọc hiểu và câu chuyện N2. Bài này giới thiệu nhóm thành ngữ 4 chữ đầu tiên.",
  items: [
    item("一", "イチ・イツ", "ひとつ", "một",
      "{一石二鳥|いっせきにちょう}", "một mũi tên trúng hai đích, một công đôi việc",
      "{一生懸命|いっしょうけんめい}", "hết mình, dốc toàn lực"),
    item("二", "ニ", "ふたつ", "hai (dùng trong 一石二鳥)",
      "{二人三脚|ににんさんきゃく}", "hợp tác ăn ý (như chạy hai người ba chân)",
      "{二重|にじゅう}", "gấp đôi, hai lớp"),
    item("全", "ゼン", "まったく・すべて", "toàn bộ",
      "{全力投球|ぜんりょくとうきゅう}", "dốc toàn lực vào việc gì",
      "{安全|あんぜん}", "an toàn"),
    item("意", "イ", "（なし）", "ý, ý nghĩa",
      "{意気投合|いきとうごう}", "hợp ý nhau ngay lập tức",
      "{得意|とくい}", "sở trường, tự hào"),
    item("心", "シン", "こころ", "tâm, lòng (dùng trong 一心不乱)",
      "{一心不乱|いっしんふらん}", "chuyên tâm, không xao nhãng",
      "{心配|しんぱい}", "lo lắng"),
    item("乱", "ラン", "みだれる・みだす", "rối loạn (dùng trong 一心不乱)",
      "{一心不乱|いっしんふらん}", "chuyên tâm, không xao nhãng",
      "{混乱|こんらん}", "hỗn loạn"),
    item("断", "ダン", "たつ・ことわる", "cắt đứt, quyết đoán",
      "{言語道断|ごんごどうだん}", "không thể chấp nhận, quá đáng",
      "{判断|はんだん}", "phán đoán")
  ]
};

data.k6d3 = {
  introVi: "Tiếp tục học 四字熟語 (thành ngữ 4 chữ Hán) — nhóm thành ngữ thứ hai, thường gặp trong đề đọc hiểu và bài luận trình độ N2.",
  items: [
    item("半", "ハン", "なかば", "nửa",
      "{半信半疑|はんしんはんぎ}", "nửa tin nửa nghi",
      "{半分|はんぶん}", "một nửa"),
    item("信", "シン", "（なし）", "tin tưởng (dùng trong 半信半疑)",
      "{半信半疑|はんしんはんぎ}", "nửa tin nửa nghi",
      "{信頼|しんらい}", "sự tin tưởng"),
    item("危", "キ", "あぶない・あやうい", "nguy hiểm",
      "{危機一髪|ききいっぱつ}", "thoát hiểm trong đường tơ kẽ tóc",
      "{危険|きけん}", "nguy hiểm"),
    item("髪", "ハツ", "かみ", "tóc (dùng trong 危機一髪)",
      "{危機一髪|ききいっぱつ}", "thoát hiểm trong đường tơ kẽ tóc",
      "{白髪|はくはつ}", "tóc bạc"),
    item("我", "ガ", "われ・わが", "ta, tôi, bản thân",
      "{我田引水|がでんいんすい}", "chỉ lo lợi ích riêng của mình",
      "{自我|じが}", "bản ngã"),
    item("田", "デン", "た", "ruộng (dùng trong 我田引水)",
      "{我田引水|がでんいんすい}", "chỉ lo lợi ích cá nhân",
      "{田畑|たはた}", "đồng ruộng"),
    item("転", "テン", "ころぶ・ころがる", "lăn, chuyển, ngã",
      "{七転八倒|しちてんばっとう}", "vật vã đau đớn, lăn lộn vì khổ sở",
      "{運転|うんてん}", "lái xe, vận hành")
  ]
};

data.k6d4 = {
  introVi: "成語 (thành ngữ, tục ngữ cổ) là những câu nói ngắn mang ý nghĩa giáo huấn, đúc kết kinh nghiệm dân gian Nhật Bản. Bài này giới thiệu các câu tục ngữ quen thuộc dùng trong văn viết N2.",
  items: [
    item("石", "セキ", "いし", "đá",
      "{石|いし}の{上|うえ}にも{三年|さんねん}", "có công mài sắt có ngày nên kim (kiên trì)",
      "{宝石|ほうせき}", "đá quý"),
    item("三", "サン", "みっつ・み", "ba",
      "{三日坊主|みっかぼうず}", "người hay bỏ giữa đường, thiếu kiên trì",
      "{三角|さんかく}", "hình tam giác"),
    item("猿", "エン", "さる", "khỉ",
      "{猿|さる}も{木|き}から{落|お}ちる", "ngựa hay cũng có lúc vấp, ai cũng có lúc sai",
      "{猿真似|さるまね}", "bắt chước một cách mù quáng"),
    item("木", "モク・ボク", "き・こ", "cây (dùng trong 猿も木から落ちる)",
      "{猿|さる}も{木|き}から{落|お}ちる", "ai cũng có lúc sai sót",
      "{木材|もくざい}", "gỗ, vật liệu gỗ"),
    item("覆", "フク", "くつがえす・おおう", "lật, che phủ",
      "{覆水盆|ふくすいぼん}に{返|かえ}らず", "việc đã làm không thể vãn hồi (nước đổ khó hốt lại)",
      "{覆|おお}う", "che phủ"),
    item("郷", "キョウ・ゴウ", "（なし）", "làng, quê hương",
      "{郷|きょう}に{入|い}っては{郷|きょう}に{従|したが}え", "nhập gia tùy tục",
      "{故郷|こきょう}", "quê hương"),
    item("塵", "ジン", "ちり", "bụi",
      "{塵|ちり}も{積|つ}もれば{山|やま}となる", "góp gió thành bão, tích tiểu thành đại",
      "{塵埃|じんあい}", "bụi bặm")
  ]
};

data.k6d5 = {
  introVi: "Tiếp tục học 成語 (tục ngữ, thành ngữ cổ) — nhóm câu nói dân gian thứ hai, giúp hiểu sâu hơn văn hóa và cách diễn đạt gián tiếp trong tiếng Nhật trình độ N2.",
  items: [
    item("泣", "キュウ", "なく", "khóc",
      "{泣|な}く{子|こ}と{地頭|じとう}には{勝|か}てぬ", "không thể thắng được kẻ không biết lý lẽ (như trẻ con khóc)",
      "{号泣|ごうきゅう}", "khóc nức nở"),
    item("灯", "トウ", "ひ", "đèn",
      "{灯台|とうだい}{下|もと}{暗|くら}し", "đèn biển sáng nhưng chân đèn lại tối, không nhận ra điều gần bên mình",
      "{電灯|でんとう}", "đèn điện"),
    item("花", "カ", "はな", "hoa",
      "{花|はな}より{団子|だんご}", "thực tế hơn hình thức",
      "{花見|はなみ}", "ngắm hoa"),
    item("団", "ダン", "（なし）", "đoàn, tập thể (dùng trong 花より団子)",
      "{花|はな}より{団子|だんご}", "thực tế hơn hình thức",
      "{団体|だんたい}", "tập thể, đoàn thể"),
    item("苦", "ク", "くるしい・にがい", "khổ, đắng, khó chịu",
      "{良薬|りょうやく}は{口|くち}に{苦|にが}し", "thuốc tốt thì đắng miệng, lời khuyên chân thật thường khó nghe",
      "{苦情|くじょう}", "khiếu nại, phàn nàn"),
    item("薬", "ヤク", "くすり", "thuốc (dùng trong 良薬は口に苦し)",
      "{良薬|りょうやく}は{口|くち}に{苦|にが}し", "thuốc tốt thì đắng miệng",
      "{薬局|やっきょく}", "tiệm thuốc"),
    item("井", "セイ・ショウ", "い", "giếng",
      "{井|い}の{中|なか}の{蛙|かわず}", "ếch ngồi đáy giếng, tầm nhìn hạn hẹp",
      "{天井|てんじょう}", "trần nhà")
  ]
};

data.k6d6 = {
  introVi: "総復習 — Ôn tập tổng hợp các Hán tự thường xuất hiện trong bài đọc hiểu N2 với chủ đề trạng thái, hiện tượng và nguyên nhân - kết quả: 状・態・化・象・因・果・傾.",
  items: [
    item("状", "ジョウ", "（なし）", "trạng thái, tình trạng",
      "{状態|じょうたい}", "tình trạng",
      "{症状|しょうじょう}", "triệu chứng"),
    item("態", "タイ", "（なし）", "trạng thái, thái độ",
      "{態度|たいど}", "thái độ",
      "{実態|じったい}", "tình trạng thực tế"),
    item("化", "カ", "ばける・ばかす", "biến hóa, chuyển hóa",
      "{変化|へんか}", "biến đổi",
      "{化石|かせき}", "hóa thạch"),
    item("象", "ショウ・ゾウ", "（なし）", "hiện tượng, hình tượng, con voi",
      "{現象|げんしょう}", "hiện tượng",
      "{印象|いんしょう}", "ấn tượng"),
    item("因", "イン", "よる", "nguyên nhân, do",
      "{原因|げんいん}", "nguyên nhân",
      "{因果|いんが}", "nhân quả"),
    item("果", "カ", "はたす・はて", "kết quả, quả (dùng trong 因果)",
      "{結果|けっか}", "kết quả",
      "{果|は}たす", "hoàn thành, thực hiện"),
    item("傾", "ケイ", "かたむく・かたよる", "nghiêng, có xu hướng",
      "{傾向|けいこう}", "xu hướng",
      "{傾|かたむ}く", "nghiêng, ngả về")
  ]
};

data.k6d7 = {
  introVi: "実戦問題 — Ôn tập tổng hợp tuần 6: thành ngữ thiên nhiên, thành ngữ 4 chữ Hán, tục ngữ cổ, và các Hán tự chủ đề trạng thái - hiện tượng. Đây cũng là phần ôn cuối cho toàn bộ chuyên đề Hán tự N2.",
  items: [
    item("水", "スイ", "みず", "ôn: thành ngữ với 水",
      "{水|みず}に{流|なが}す", "cho qua, xóa bỏ hiềm khích",
      "{水|みず}を{差|さ}す", "làm gián đoạn, phá đám"),
    item("一", "イチ", "ひとつ", "ôn: thành ngữ 4 chữ Hán",
      "{一石二鳥|いっせきにちょう}", "một công đôi việc",
      "{一生懸命|いっしょうけんめい}", "hết mình, dốc toàn lực"),
    item("危", "キ", "あぶない", "ôn: thành ngữ 4 chữ Hán",
      "{危機一髪|ききいっぱつ}", "thoát hiểm trong đường tơ kẽ tóc",
      "{危険|きけん}", "nguy hiểm"),
    item("石", "セキ", "いし", "ôn: tục ngữ cổ",
      "{石|いし}の{上|うえ}にも{三年|さんねん}", "có công mài sắt có ngày nên kim",
      "{石橋|いしばし}を{叩|たた}いて{渡|わた}る", "cẩn thận quá mức"),
    item("花", "カ", "はな", "ôn: tục ngữ cổ",
      "{花|はな}より{団子|だんご}", "thực tế hơn hình thức",
      "{花見|はなみ}", "ngắm hoa"),
    item("状", "ジョウ", "（なし）", "ôn: Hán tự chủ đề trạng thái",
      "{状態|じょうたい}", "tình trạng",
      "{現状|げんじょう}", "hiện trạng"),
    item("傾", "ケイ", "かたむく", "ôn: Hán tự chủ đề xu hướng",
      "{傾向|けいこう}", "xu hướng",
      "{傾|かたむ}く", "nghiêng")
  ]
};

const outPath = "C:/Users/UYTIN/Downloads/個人/N2_web/data/content/kanji-w4-6.json";
fs.writeFileSync(outPath, JSON.stringify(data, null, 2), "utf8");
console.log("Written", Object.keys(data).length, "lessons to", outPath);
