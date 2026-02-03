/**
 * @fileoverview Constellation names in multiple languages.
 * Provides constellation name translations and lookup utilities.
 */

/**
 * Constellation names indexed by language code.
 * Each language maps IAU abbreviation to full name.
 * @const {!Object<string, !Object<string, string>>}
 */
export const CONSTELLATION_NAMES = {
  'en': {  // English
    'And': 'Andromeda', 'Ant': 'Antlia', 'Aps': 'Apus', 'Aqr': 'Aquarius', 'Aql': 'Aquila',
    'Ara': 'Ara', 'Ari': 'Aries', 'Aur': 'Auriga', 'Boo': 'Boötes', 'Cae': 'Caelum',
    'Cam': 'Camelopardalis', 'Cnc': 'Cancer', 'CVn': 'Canes Venatici', 'CMa': 'Canis Major',
    'CMi': 'Canis Minor', 'Cap': 'Capricornus', 'Car': 'Carina', 'Cas': 'Cassiopeia',
    'Cen': 'Centaurus', 'Cep': 'Cepheus', 'Cet': 'Cetus', 'Cha': 'Chamaeleon', 'Cir': 'Circinus',
    'Col': 'Columba', 'Com': 'Coma Berenices', 'CrA': 'Corona Australis', 'CrB': 'Corona Borealis',
    'Crv': 'Corvus', 'Crt': 'Crater', 'Cru': 'Crux', 'Cyg': 'Cygnus', 'Del': 'Delphinus',
    'Dor': 'Dorado', 'Dra': 'Draco', 'Equ': 'Equuleus', 'Eri': 'Eridanus', 'For': 'Fornax',
    'Gem': 'Gemini', 'Gru': 'Grus', 'Her': 'Hercules', 'Hor': 'Horologium', 'Hya': 'Hydra',
    'Hyi': 'Hydrus', 'Ind': 'Indus', 'Lac': 'Lacerta', 'Leo': 'Leo', 'LMi': 'Leo Minor',
    'Lep': 'Lepus', 'Lib': 'Libra', 'Lup': 'Lupus', 'Lyn': 'Lynx', 'Lyr': 'Lyra',
    'Men': 'Mensa', 'Mic': 'Microscopium', 'Mon': 'Monoceros', 'Mus': 'Musca', 'Nor': 'Norma',
    'Oct': 'Octans', 'Oph': 'Ophiuchus', 'Ori': 'Orion', 'Pav': 'Pavo', 'Peg': 'Pegasus',
    'Per': 'Perseus', 'Phe': 'Phoenix', 'Pic': 'Pictor', 'Psc': 'Pisces', 'PsA': 'Piscis Austrinus',
    'Pup': 'Puppis', 'Pyx': 'Pyxis', 'Ret': 'Reticulum', 'Sge': 'Sagitta', 'Sgr': 'Sagittarius',
    'Sco': 'Scorpius', 'Scl': 'Sculptor', 'Sct': 'Scutum', 'Ser': 'Serpens', 'Sex': 'Sextans',
    'Tau': 'Taurus', 'Tel': 'Telescopium', 'Tri': 'Triangulum', 'TrA': 'Triangulum Australe',
    'Tuc': 'Tucana', 'UMa': 'Ursa Major', 'UMi': 'Ursa Minor', 'Vel': 'Vela', 'Vir': 'Virgo',
    'Vol': 'Volans', 'Vul': 'Vulpecula',
  },
  'la': {  // Latin (same as English for most)
    'And': 'Andromeda', 'Ant': 'Antlia', 'Aps': 'Apus', 'Aqr': 'Aquarius', 'Aql': 'Aquila',
    'Ara': 'Ara', 'Ari': 'Aries', 'Aur': 'Auriga', 'Boo': 'Boötes', 'Cae': 'Caelum',
    'Cam': 'Camelopardalis', 'Cnc': 'Cancer', 'CVn': 'Canes Venatici', 'CMa': 'Canis Major',
    'CMi': 'Canis Minor', 'Cap': 'Capricornus', 'Car': 'Carina', 'Cas': 'Cassiopeia',
    'Cen': 'Centaurus', 'Cep': 'Cepheus', 'Cet': 'Cetus', 'Cha': 'Chamaeleon', 'Cir': 'Circinus',
    'Col': 'Columba', 'Com': 'Coma Berenices', 'CrA': 'Corona Australis', 'CrB': 'Corona Borealis',
    'Crv': 'Corvus', 'Crt': 'Crater', 'Cru': 'Crux', 'Cyg': 'Cygnus', 'Del': 'Delphinus',
    'Dor': 'Dorado', 'Dra': 'Draco', 'Equ': 'Equuleus', 'Eri': 'Eridanus', 'For': 'Fornax',
    'Gem': 'Gemini', 'Gru': 'Grus', 'Her': 'Hercules', 'Hor': 'Horologium', 'Hya': 'Hydra',
    'Hyi': 'Hydrus', 'Ind': 'Indus', 'Lac': 'Lacerta', 'Leo': 'Leo', 'LMi': 'Leo Minor',
    'Lep': 'Lepus', 'Lib': 'Libra', 'Lup': 'Lupus', 'Lyn': 'Lynx', 'Lyr': 'Lyra',
    'Men': 'Mensa', 'Mic': 'Microscopium', 'Mon': 'Monoceros', 'Mus': 'Musca', 'Nor': 'Norma',
    'Oct': 'Octans', 'Oph': 'Ophiuchus', 'Ori': 'Orion', 'Pav': 'Pavo', 'Peg': 'Pegasus',
    'Per': 'Perseus', 'Phe': 'Phoenix', 'Pic': 'Pictor', 'Psc': 'Pisces', 'PsA': 'Piscis Austrinus',
    'Pup': 'Puppis', 'Pyx': 'Pyxis', 'Ret': 'Reticulum', 'Sge': 'Sagitta', 'Sgr': 'Sagittarius',
    'Sco': 'Scorpius', 'Scl': 'Sculptor', 'Sct': 'Scutum', 'Ser': 'Serpens', 'Sex': 'Sextans',
    'Tau': 'Taurus', 'Tel': 'Telescopium', 'Tri': 'Triangulum', 'TrA': 'Triangulum Australe',
    'Tuc': 'Tucana', 'UMa': 'Ursa Major', 'UMi': 'Ursa Minor', 'Vel': 'Vela', 'Vir': 'Virgo',
    'Vol': 'Volans', 'Vul': 'Vulpecula',
  },
  'fr': {  // French
    'And': 'Andromède', 'Ant': 'Machine Pneumatique', 'Aps': 'Oiseau de Paradis', 'Aqr': 'Verseau', 'Aql': 'Aigle',
    'Ara': 'Autel', 'Ari': 'Bélier', 'Aur': 'Cocher', 'Boo': 'Bouvier', 'Cae': 'Burin',
    'Cam': 'Girafe', 'Cnc': 'Cancer', 'CVn': 'Chiens de Chasse', 'CMa': 'Grand Chien',
    'CMi': 'Petit Chien', 'Cap': 'Capricorne', 'Car': 'Carène', 'Cas': 'Cassiopée',
    'Cen': 'Centaure', 'Cep': 'Céphée', 'Cet': 'Baleine', 'Cha': 'Caméléon', 'Cir': 'Compas',
    'Col': 'Colombe', 'Com': 'Chevelure de Bérénice', 'CrA': 'Couronne Australe', 'CrB': 'Couronne Boréale',
    'Crv': 'Corbeau', 'Crt': 'Coupe', 'Cru': 'Croix du Sud', 'Cyg': 'Cygne', 'Del': 'Dauphin',
    'Dor': 'Dorade', 'Dra': 'Dragon', 'Equ': 'Petit Cheval', 'Eri': 'Éridan', 'For': 'Fourneau',
    'Gem': 'Gémeaux', 'Gru': 'Grue', 'Her': 'Hercule', 'Hor': 'Horloge', 'Hya': 'Hydre',
    'Hyi': 'Hydre Mâle', 'Ind': 'Indien', 'Lac': 'Lézard', 'Leo': 'Lion', 'LMi': 'Petit Lion',
    'Lep': 'Lièvre', 'Lib': 'Balance', 'Lup': 'Loup', 'Lyn': 'Lynx', 'Lyr': 'Lyre',
    'Men': 'Table', 'Mic': 'Microscope', 'Mon': 'Licorne', 'Mus': 'Mouche', 'Nor': 'Règle',
    'Oct': 'Octant', 'Oph': 'Serpentaire', 'Ori': 'Orion', 'Pav': 'Paon', 'Peg': 'Pégase',
    'Per': 'Persée', 'Phe': 'Phénix', 'Pic': 'Peintre', 'Psc': 'Poissons', 'PsA': 'Poisson Austral',
    'Pup': 'Poupe', 'Pyx': 'Boussole', 'Ret': 'Réticule', 'Sge': 'Flèche', 'Sgr': 'Sagittaire',
    'Sco': 'Scorpion', 'Scl': 'Sculpteur', 'Sct': 'Écu de Sobieski', 'Ser': 'Serpent', 'Sex': 'Sextant',
    'Tau': 'Taureau', 'Tel': 'Télescope', 'Tri': 'Triangle', 'TrA': 'Triangle Austral',
    'Tuc': 'Toucan', 'UMa': 'Grande Ourse', 'UMi': 'Petite Ourse', 'Vel': 'Voiles', 'Vir': 'Vierge',
    'Vol': 'Poisson Volant', 'Vul': 'Petit Renard',
  },
  'de': {  // German
    'And': 'Andromeda', 'Ant': 'Luftpumpe', 'Aps': 'Paradiesvogel', 'Aqr': 'Wassermann', 'Aql': 'Adler',
    'Ara': 'Altar', 'Ari': 'Widder', 'Aur': 'Fuhrmann', 'Boo': 'Bärenhüter', 'Cae': 'Grabstichel',
    'Cam': 'Giraffe', 'Cnc': 'Krebs', 'CVn': 'Jagdhunde', 'CMa': 'Großer Hund',
    'CMi': 'Kleiner Hund', 'Cap': 'Steinbock', 'Car': 'Kiel des Schiffs', 'Cas': 'Kassiopeia',
    'Cen': 'Zentaur', 'Cep': 'Kepheus', 'Cet': 'Walfisch', 'Cha': 'Chamäleon', 'Cir': 'Zirkel',
    'Col': 'Taube', 'Com': 'Haar der Berenike', 'CrA': 'Südliche Krone', 'CrB': 'Nördliche Krone',
    'Crv': 'Rabe', 'Crt': 'Becher', 'Cru': 'Kreuz des Südens', 'Cyg': 'Schwan', 'Del': 'Delfin',
    'Dor': 'Schwertfisch', 'Dra': 'Drache', 'Equ': 'Füllen', 'Eri': 'Eridanus', 'For': 'Chemischer Ofen',
    'Gem': 'Zwillinge', 'Gru': 'Kranich', 'Her': 'Herkules', 'Hor': 'Pendeluhr', 'Hya': 'Wasserschlange',
    'Hyi': 'Kleine Wasserschlange', 'Ind': 'Indianer', 'Lac': 'Eidechse', 'Leo': 'Löwe', 'LMi': 'Kleiner Löwe',
    'Lep': 'Hase', 'Lib': 'Waage', 'Lup': 'Wolf', 'Lyn': 'Luchs', 'Lyr': 'Leier',
    'Men': 'Tafelberg', 'Mic': 'Mikroskop', 'Mon': 'Einhorn', 'Mus': 'Fliege', 'Nor': 'Winkelmaß',
    'Oct': 'Oktant', 'Oph': 'Schlangenträger', 'Ori': 'Orion', 'Pav': 'Pfau', 'Peg': 'Pegasus',
    'Per': 'Perseus', 'Phe': 'Phönix', 'Pic': 'Maler', 'Psc': 'Fische', 'PsA': 'Südlicher Fisch',
    'Pup': 'Achterdeck', 'Pyx': 'Schiffskompass', 'Ret': 'Netz', 'Sge': 'Pfeil', 'Sgr': 'Schütze',
    'Sco': 'Skorpion', 'Scl': 'Bildhauer', 'Sct': 'Schild', 'Ser': 'Schlange', 'Sex': 'Sextant',
    'Tau': 'Stier', 'Tel': 'Teleskop', 'Tri': 'Dreieck', 'TrA': 'Südliches Dreieck',
    'Tuc': 'Tukan', 'UMa': 'Großer Bär', 'UMi': 'Kleiner Bär', 'Vel': 'Segel', 'Vir': 'Jungfrau',
    'Vol': 'Fliegender Fisch', 'Vul': 'Fuchs',
  },
  'es': {  // Spanish
    'And': 'Andrómeda', 'Ant': 'Máquina Neumática', 'Aps': 'Ave del Paraíso', 'Aqr': 'Acuario', 'Aql': 'Águila',
    'Ara': 'Altar', 'Ari': 'Aries', 'Aur': 'Cochero', 'Boo': 'Boyero', 'Cae': 'Cincel',
    'Cam': 'Jirafa', 'Cnc': 'Cáncer', 'CVn': 'Lebreles', 'CMa': 'Can Mayor',
    'CMi': 'Can Menor', 'Cap': 'Capricornio', 'Car': 'Quilla', 'Cas': 'Casiopea',
    'Cen': 'Centauro', 'Cep': 'Cefeo', 'Cet': 'Ballena', 'Cha': 'Camaleón', 'Cir': 'Compás',
    'Col': 'Paloma', 'Com': 'Cabellera de Berenice', 'CrA': 'Corona Austral', 'CrB': 'Corona Boreal',
    'Crv': 'Cuervo', 'Crt': 'Copa', 'Cru': 'Cruz del Sur', 'Cyg': 'Cisne', 'Del': 'Delfín',
    'Dor': 'Dorado', 'Dra': 'Dragón', 'Equ': 'Caballo Menor', 'Eri': 'Eridanus', 'For': 'Horno',
    'Gem': 'Géminis', 'Gru': 'Grulla', 'Her': 'Hércules', 'Hor': 'Reloj', 'Hya': 'Hidra',
    'Hyi': 'Hidra Macho', 'Ind': 'Indio', 'Lac': 'Lagarto', 'Leo': 'León', 'LMi': 'León Menor',
    'Lep': 'Liebre', 'Lib': 'Libra', 'Lup': 'Lobo', 'Lyn': 'Lince', 'Lyr': 'Lira',
    'Men': 'Mesa', 'Mic': 'Microscopio', 'Mon': 'Unicornio', 'Mus': 'Mosca', 'Nor': 'Escuadra',
    'Oct': 'Octante', 'Oph': 'Ofiuco', 'Ori': 'Orión', 'Pav': 'Pavo Real', 'Peg': 'Pegaso',
    'Per': 'Perseo', 'Phe': 'Fénix', 'Pic': 'Pintor', 'Psc': 'Piscis', 'PsA': 'Pez Austral',
    'Pup': 'Popa', 'Pyx': 'Brújula', 'Ret': 'Retículo', 'Sge': 'Flecha', 'Sgr': 'Sagitario',
    'Sco': 'Escorpio', 'Scl': 'Escultor', 'Sct': 'Escudo', 'Ser': 'Serpiente', 'Sex': 'Sextante',
    'Tau': 'Tauro', 'Tel': 'Telescopio', 'Tri': 'Triángulo', 'TrA': 'Triángulo Austral',
    'Tuc': 'Tucán', 'UMa': 'Osa Mayor', 'UMi': 'Osa Menor', 'Vel': 'Vela', 'Vir': 'Virgo',
    'Vol': 'Pez Volador', 'Vul': 'Zorra',
  },
  'zh': {  // Chinese (Simplified)
    'And': '仙女座', 'Ant': '唧筒座', 'Aps': '天燕座', 'Aqr': '宝瓶座', 'Aql': '天鹰座',
    'Ara': '天坛座', 'Ari': '白羊座', 'Aur': '御夫座', 'Boo': '牧夫座', 'Cae': '雕具座',
    'Cam': '鹿豹座', 'Cnc': '巨蟹座', 'CVn': '猎犬座', 'CMa': '大犬座',
    'CMi': '小犬座', 'Cap': '摩羯座', 'Car': '船底座', 'Cas': '仙后座',
    'Cen': '半人马座', 'Cep': '仙王座', 'Cet': '鲸鱼座', 'Cha': '蝘蜓座', 'Cir': '圆规座',
    'Col': '天鸽座', 'Com': '后发座', 'CrA': '南冕座', 'CrB': '北冕座',
    'Crv': '乌鸦座', 'Crt': '巨爵座', 'Cru': '南十字座', 'Cyg': '天鹅座', 'Del': '海豚座',
    'Dor': '剑鱼座', 'Dra': '天龙座', 'Equ': '小马座', 'Eri': '波江座', 'For': '天炉座',
    'Gem': '双子座', 'Gru': '天鹤座', 'Her': '武仙座', 'Hor': '时钟座', 'Hya': '长蛇座',
    'Hyi': '水蛇座', 'Ind': '印第安座', 'Lac': '蝎虎座', 'Leo': '狮子座', 'LMi': '小狮座',
    'Lep': '天兔座', 'Lib': '天秤座', 'Lup': '豺狼座', 'Lyn': '天猫座', 'Lyr': '天琴座',
    'Men': '山案座', 'Mic': '显微镜座', 'Mon': '麒麟座', 'Mus': '苍蝇座', 'Nor': '矩尺座',
    'Oct': '南极座', 'Oph': '蛇夫座', 'Ori': '猎户座', 'Pav': '孔雀座', 'Peg': '飞马座',
    'Per': '英仙座', 'Phe': '凤凰座', 'Pic': '绘架座', 'Psc': '双鱼座', 'PsA': '南鱼座',
    'Pup': '船尾座', 'Pyx': '罗盘座', 'Ret': '网罟座', 'Sge': '天箭座', 'Sgr': '人马座',
    'Sco': '天蝎座', 'Scl': '玉夫座', 'Sct': '盾牌座', 'Ser': '巨蛇座', 'Sex': '六分仪座',
    'Tau': '金牛座', 'Tel': '望远镜座', 'Tri': '三角座', 'TrA': '南三角座',
    'Tuc': '杜鹃座', 'UMa': '大熊座', 'UMi': '小熊座', 'Vel': '船帆座', 'Vir': '室女座',
    'Vol': '飞鱼座', 'Vul': '狐狸座',
  },
  'ja': {  // Japanese
    'And': 'アンドロメダ座', 'Ant': 'ポンプ座', 'Aps': 'ふうちょう座', 'Aqr': 'みずがめ座', 'Aql': 'わし座',
    'Ara': 'さいだん座', 'Ari': 'おひつじ座', 'Aur': 'ぎょしゃ座', 'Boo': 'うしかい座', 'Cae': 'ちょうこくぐ座',
    'Cam': 'きりん座', 'Cnc': 'かに座', 'CVn': 'りょうけん座', 'CMa': 'おおいぬ座',
    'CMi': 'こいぬ座', 'Cap': 'やぎ座', 'Car': 'りゅうこつ座', 'Cas': 'カシオペヤ座',
    'Cen': 'ケンタウルス座', 'Cep': 'ケフェウス座', 'Cet': 'くじら座', 'Cha': 'カメレオン座', 'Cir': 'コンパス座',
    'Col': 'はと座', 'Com': 'かみのけ座', 'CrA': 'みなみのかんむり座', 'CrB': 'かんむり座',
    'Crv': 'からす座', 'Crt': 'コップ座', 'Cru': 'みなみじゅうじ座', 'Cyg': 'はくちょう座', 'Del': 'いるか座',
    'Dor': 'かじき座', 'Dra': 'りゅう座', 'Equ': 'こうま座', 'Eri': 'エリダヌス座', 'For': 'ろ座',
    'Gem': 'ふたご座', 'Gru': 'つる座', 'Her': 'ヘルクレス座', 'Hor': 'とけい座', 'Hya': 'うみへび座',
    'Hyi': 'みずへび座', 'Ind': 'インディアン座', 'Lac': 'とかげ座', 'Leo': 'しし座', 'LMi': 'こじし座',
    'Lep': 'うさぎ座', 'Lib': 'てんびん座', 'Lup': 'おおかみ座', 'Lyn': 'やまねこ座', 'Lyr': 'こと座',
    'Men': 'テーブルさん座', 'Mic': 'けんびきょう座', 'Mon': 'いっかくじゅう座', 'Mus': 'はえ座', 'Nor': 'じょうぎ座',
    'Oct': 'はちぶんぎ座', 'Oph': 'へびつかい座', 'Ori': 'オリオン座', 'Pav': 'くじゃく座', 'Peg': 'ペガスス座',
    'Per': 'ペルセウス座', 'Phe': 'ほうおう座', 'Pic': 'がか座', 'Psc': 'うお座', 'PsA': 'みなみのうお座',
    'Pup': 'とも座', 'Pyx': 'らしんばん座', 'Ret': 'レチクル座', 'Sge': 'や座', 'Sgr': 'いて座',
    'Sco': 'さそり座', 'Scl': 'ちょうこくしつ座', 'Sct': 'たて座', 'Ser': 'へび座', 'Sex': 'ろくぶんぎ座',
    'Tau': 'おうし座', 'Tel': 'ぼうえんきょう座', 'Tri': 'さんかく座', 'TrA': 'みなみのさんかく座',
    'Tuc': 'きょしちょう座', 'UMa': 'おおぐま座', 'UMi': 'こぐま座', 'Vel': 'ほ座', 'Vir': 'おとめ座',
    'Vol': 'とびうお座', 'Vul': 'こぎつね座',
  },
  'ar': {  // Arabic
    'And': 'المرأة المسلسلة', 'Ant': 'الطلمبة', 'Aps': 'طائر الفردوس', 'Aqr': 'الدلو', 'Aql': 'العقاب',
    'Ara': 'المجمرة', 'Ari': 'الحمل', 'Aur': 'ممسك الأعنة', 'Boo': 'العواء', 'Cae': 'المنقاش',
    'Cam': 'الزرافة', 'Cnc': 'السرطان', 'CVn': 'السلوقيان', 'CMa': 'الكلب الأكبر',
    'CMi': 'الكلب الأصغر', 'Cap': 'الجدي', 'Car': 'القاعدة', 'Cas': 'ذات الكرسي',
    'Cen': 'القنطورس', 'Cep': 'الملتهب', 'Cet': 'قيطس', 'Cha': 'الحرباء', 'Cir': 'البيكار',
    'Col': 'الحمامة', 'Com': 'الهلبة', 'CrA': 'الإكليل الجنوبي', 'CrB': 'الإكليل الشمالي',
    'Crv': 'الغراب', 'Crt': 'الباطية', 'Cru': 'الصليب الجنوبي', 'Cyg': 'الدجاجة', 'Del': 'الدلفين',
    'Dor': 'أبو سيف', 'Dra': 'التنين', 'Equ': 'قطعة الفرس', 'Eri': 'النهر', 'For': 'الكور',
    'Gem': 'الجوزاء', 'Gru': 'الغرنوق', 'Her': 'الجاثي', 'Hor': 'الساعة', 'Hya': 'الشجاع',
    'Hyi': 'الشجاع الجنوبي', 'Ind': 'الهندي', 'Lac': 'العظاية', 'Leo': 'الأسد', 'LMi': 'الأسد الأصغر',
    'Lep': 'الأرنب', 'Lib': 'الميزان', 'Lup': 'السبع', 'Lyn': 'الوشق', 'Lyr': 'القيثارة',
    'Men': 'الجبل', 'Mic': 'المجهر', 'Mon': 'وحيد القرن', 'Mus': 'الذبابة', 'Nor': 'المسطرة',
    'Oct': 'الثمن', 'Oph': 'الحواء', 'Ori': 'الجبار', 'Pav': 'الطاووس', 'Peg': 'الفرس الأعظم',
    'Per': 'برشاوش', 'Phe': 'العنقاء', 'Pic': 'المرسم', 'Psc': 'الحوت', 'PsA': 'الحوت الجنوبي',
    'Pup': 'الكوثل', 'Pyx': 'البوصلة', 'Ret': 'الشبكة', 'Sge': 'السهم', 'Sgr': 'الرامي',
    'Sco': 'العقرب', 'Scl': 'النحات', 'Sct': 'الترس', 'Ser': 'الحية', 'Sex': 'السدس',
    'Tau': 'الثور', 'Tel': 'المقراب', 'Tri': 'المثلث', 'TrA': 'المثلث الجنوبي',
    'Tuc': 'الطوقان', 'UMa': 'الدب الأكبر', 'UMi': 'الدب الأصغر', 'Vel': 'الشراع', 'Vir': 'العذراء',
    'Vol': 'السمكة الطائرة', 'Vul': 'الثعلب',
  },
};

/**
 * Build reverse lookup map (name -> abbreviation) for a language.
 * @private
 * @param {string} lang - Language code
 * @returns {!Map<string, string>} Lowercase name to abbreviation map
 */
function buildReverseLookup_(lang) {
  const langData = CONSTELLATION_NAMES[lang] || CONSTELLATION_NAMES['en'];
  const map = new Map();
  Object.entries(langData).forEach(([abbrev, name]) => {
    map.set(name.toLowerCase(), abbrev);
  });
  return map;
}

/**
 * Cache for reverse lookups per language.
 * @private @type {!Map<string, !Map<string, string>>}
 */
const reverseLookupCache_ = new Map();

/**
 * Get constellation name from IAU abbreviation.
 * @param {string} abbrev - IAU constellation abbreviation (e.g., 'Ori')
 * @param {string=} lang - Language code (default: 'en')
 * @returns {string} Full constellation name, or abbreviation if not found
 */
export function getConstellationName(abbrev, lang = 'en') {
  const langData = CONSTELLATION_NAMES[lang] || CONSTELLATION_NAMES['en'];
  return langData[abbrev] || abbrev;
}

/**
 * Get IAU abbreviation from constellation name.
 * @param {string} name - Full constellation name
 * @param {string=} lang - Language code (default: 'en')
 * @returns {?string} IAU abbreviation, or null if not found
 */
export function getConstellationAbbrev(name, lang = 'en') {
  if (!reverseLookupCache_.has(lang)) {
    reverseLookupCache_.set(lang, buildReverseLookup_(lang));
  }
  const lookup = reverseLookupCache_.get(lang);
  return lookup.get(name.toLowerCase()) || null;
}

/**
 * Get all constellation abbreviations.
 * @returns {!Array<string>} Array of IAU abbreviations
 */
export function getAllConstellationAbbrevs() {
  return Object.keys(CONSTELLATION_NAMES['en']);
}

/**
 * Get all available language codes.
 * @returns {!Array<string>} Array of language codes
 */
export function getAvailableLanguages() {
  return Object.keys(CONSTELLATION_NAMES);
}

/**
 * Get all constellation names for a language.
 * @param {string=} lang - Language code (default: 'en')
 * @returns {!Object<string, string>} Abbreviation to name mapping
 */
export function getConstellationNamesForLanguage(lang = 'en') {
  return CONSTELLATION_NAMES[lang] || CONSTELLATION_NAMES['en'];
}

/**
 * Internal key mapping from IAU abbreviation to constellation data key format.
 * These keys have no spaces (e.g., "UrsaMajor" instead of "Ursa Major").
 * Used for matching constellation data structures that use CamelCase keys.
 * @const {!Object<string, string>}
 */
const CONSTELLATION_INTERNAL_KEYS = {
  'And': 'Andromeda', 'Ant': 'Antlia', 'Aps': 'Apus', 'Aqr': 'Aquarius',
  'Aql': 'Aquila', 'Ara': 'Ara', 'Ari': 'Aries', 'Aur': 'Auriga',
  'Boo': 'Bootes', 'Cae': 'Caelum', 'Cam': 'Camelopardalis', 'Cnc': 'Cancer',
  'CVn': 'CanesVenatici', 'CMa': 'CanisMajor', 'CMi': 'CanisMinor',
  'Cap': 'Capricornus', 'Car': 'Carina', 'Cas': 'Cassiopeia', 'Cen': 'Centaurus',
  'Cep': 'Cepheus', 'Cet': 'Cetus', 'Cha': 'Chamaeleon', 'Cir': 'Circinus',
  'Col': 'Columba', 'Com': 'ComaBerenices', 'CrA': 'CoronaAustralis',
  'CrB': 'CoronaBorealis', 'Crv': 'Corvus', 'Crt': 'Crater', 'Cru': 'Crux',
  'Cyg': 'Cygnus', 'Del': 'Delphinus', 'Dor': 'Dorado', 'Dra': 'Draco',
  'Equ': 'Equuleus', 'Eri': 'Eridanus', 'For': 'Fornax', 'Gem': 'Gemini',
  'Gru': 'Grus', 'Her': 'Hercules', 'Hor': 'Horologium', 'Hya': 'Hydra',
  'Hyi': 'Hydrus', 'Ind': 'Indus', 'Lac': 'Lacerta', 'Leo': 'Leo',
  'LMi': 'LeoMinor', 'Lep': 'Lepus', 'Lib': 'Libra', 'Lup': 'Lupus',
  'Lyn': 'Lynx', 'Lyr': 'Lyra', 'Men': 'Mensa', 'Mic': 'Microscopium',
  'Mon': 'Monoceros', 'Mus': 'Musca', 'Nor': 'Norma', 'Oct': 'Octans',
  'Oph': 'Ophiuchus', 'Ori': 'Orion', 'Pav': 'Pavo', 'Peg': 'Pegasus',
  'Per': 'Perseus', 'Phe': 'Phoenix', 'Pic': 'Pictor', 'Psc': 'Pisces',
  'PsA': 'PiscisAustrinus', 'Pup': 'Puppis', 'Pyx': 'Pyxis', 'Ret': 'Reticulum',
  'Sge': 'Sagitta', 'Sgr': 'Sagittarius', 'Sco': 'Scorpius', 'Scl': 'Sculptor',
  'Sct': 'Scutum', 'Ser': 'SerpensA', 'Sex': 'Sextans', 'Tau': 'Taurus',
  'Tel': 'Telescopium', 'Tri': 'Triangulum', 'TrA': 'TriangulumAustrale',
  'Tuc': 'Tucana', 'UMa': 'UrsaMajor', 'UMi': 'UrsaMinor', 'Vel': 'Vela',
  'Vir': 'Virgo', 'Vol': 'Volans', 'Vul': 'Vulpecula'
};

/**
 * Build reverse lookup from internal key to abbreviation.
 * @private @type {?Map<string, string>}
 */
let internalKeyToAbbrev_ = null;

/**
 * Get internal constellation data key from IAU abbreviation.
 * Returns keys without spaces (e.g., "UrsaMajor" for "UMa").
 * @param {string} abbrevOrKey - IAU abbreviation or existing internal key
 * @returns {string} Internal key for constellation data lookup
 */
export function getConstellationInternalKey(abbrevOrKey) {
  return CONSTELLATION_INTERNAL_KEYS[abbrevOrKey] || abbrevOrKey;
}

/**
 * Get IAU abbreviation from internal constellation key.
 * Reverse lookup for keys like "UrsaMajor" -> "UMa".
 * @param {string} internalKey - Internal constellation key (CamelCase)
 * @returns {string} IAU abbreviation or original key if not found
 */
export function getAbbrevFromInternalKey(internalKey) {
  if (!internalKeyToAbbrev_) {
    internalKeyToAbbrev_ = new Map();
    Object.entries(CONSTELLATION_INTERNAL_KEYS).forEach(([abbrev, key]) => {
      internalKeyToAbbrev_.set(key, abbrev);
      internalKeyToAbbrev_.set(key.toLowerCase(), abbrev);
    });
  }
  return internalKeyToAbbrev_.get(internalKey) ||
         internalKeyToAbbrev_.get(internalKey.toLowerCase()) ||
         internalKey;
}
