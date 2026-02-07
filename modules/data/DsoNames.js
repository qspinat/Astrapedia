/**
 * @fileoverview DSO common name translations in multiple languages.
 * Provides translated names for notable deep sky objects.
 */

/**
 * DSO common name translations indexed by English name, then by language code.
 * English omitted since it matches the key and is used as-is.
 * Latin omitted since DSO common names have no established Latin forms.
 * Covers ~21 of the most notable deep sky objects.
 * @const {!Object<string, !Object<string, string>>}
 */
export const DSO_NAMES = {
  'Crab Nebula': {
    fr: 'Nébuleuse du Crabe', de: 'Krebsnebel',
    es: 'Nebulosa del Cangrejo', zh: '蟹状星云', ja: 'かに星雲', ar: 'سديم السرطان',
  },
  'Lagoon Nebula': {
    fr: 'Nébuleuse de la Lagune', de: 'Lagunennebel',
    es: 'Nebulosa de la Laguna', zh: '礁湖星云', ja: '干潟星雲', ar: 'سديم البحيرة',
  },
  'Hercules Cluster': {
    fr: "Amas d'Hercule", de: 'Herkuleshaufen',
    es: 'Cúmulo de Hércules', zh: '武仙座球状星团', ja: 'ヘルクレス座球状星団', ar: 'عنقود هرقل',
  },
  'Eagle Nebula': {
    fr: "Nébuleuse de l'Aigle", de: 'Adlernebel',
    es: 'Nebulosa del Águila', zh: '鹰状星云', ja: 'わし星雲', ar: 'سديم النسر',
  },
  'Omega Nebula': {
    fr: 'Nébuleuse Oméga', de: 'Omeganebel',
    es: 'Nebulosa Omega', zh: '奥米茄星云', ja: 'オメガ星雲', ar: 'سديم أوميغا',
  },
  'Trifid Nebula': {
    fr: 'Nébuleuse Trifide', de: 'Trifidnebel',
    es: 'Nebulosa Trífida', zh: '三裂星云', ja: '三裂星雲', ar: 'سديم ثلاثي الفصوص',
  },
  'Dumbbell Nebula': {
    fr: "Nébuleuse de l'Haltère", de: 'Hantelnebel',
    es: 'Nebulosa Dumbbell', zh: '哑铃星云', ja: 'あれい星雲', ar: 'سديم الدمبل',
  },
  'Andromeda Galaxy': {
    fr: "Galaxie d'Andromède", de: 'Andromedagalaxie',
    es: 'Galaxia de Andrómeda', zh: '仙女座星系', ja: 'アンドロメダ銀河', ar: 'مجرة المرأة المسلسلة',
  },
  'Triangulum Galaxy': {
    fr: 'Galaxie du Triangle', de: 'Dreiecksgalaxie',
    es: 'Galaxia del Triángulo', zh: '三角座星系', ja: 'さんかく座銀河', ar: 'مجرة المثلث',
  },
  'Orion Nebula': {
    fr: "Nébuleuse d'Orion", de: 'Orionnebel',
    es: 'Nebulosa de Orión', zh: '猎户座大星云', ja: 'オリオン大星雲', ar: 'سديم الجبار',
  },
  'Pleiades': {
    fr: 'Pléiades', de: 'Plejaden',
    es: 'Pléyades', zh: '昴宿星团', ja: 'プレアデス星団', ar: 'الثريا',
  },
  'Whirlpool Galaxy': {
    fr: 'Galaxie du Tourbillon', de: 'Strudelgalaxie',
    es: 'Galaxia Remolino', zh: '涡状星系', ja: '子持ち銀河', ar: 'مجرة الدوامة',
  },
  'Ring Nebula': {
    fr: "Nébuleuse de l'Anneau", de: 'Ringnebel',
    es: 'Nebulosa del Anillo', zh: '环状星云', ja: 'リング星雲', ar: 'سديم الحلقة',
  },
  'Sunflower Galaxy': {
    fr: 'Galaxie du Tournesol', de: 'Sonnenblumengalaxie',
    es: 'Galaxia del Girasol', zh: '向日葵星系', ja: 'ひまわり銀河', ar: 'مجرة دوار الشمس',
  },
  'Black Eye Galaxy': {
    fr: "Galaxie de l'Œil Noir", de: 'Schwarzaugengalaxie',
    es: 'Galaxia del Ojo Negro', zh: '黑眼星系', ja: '黒目銀河', ar: 'مجرة العين السوداء',
  },
  "Bode's Galaxy": {
    fr: 'Galaxie de Bode', de: 'Bodes Galaxie',
    es: 'Galaxia de Bode', zh: '波德星系', ja: 'ボーデの銀河', ar: 'مجرة بود',
  },
  'Cigar Galaxy': {
    fr: 'Galaxie du Cigare', de: 'Zigarrengalaxie',
    es: 'Galaxia del Cigarro', zh: '雪茄星系', ja: '葉巻銀河', ar: 'مجرة السيجار',
  },
  'Owl Nebula': {
    fr: 'Nébuleuse du Hibou', de: 'Eulennebel',
    es: 'Nebulosa del Búho', zh: '猫头鹰星云', ja: 'ふくろう星雲', ar: 'سديم البومة',
  },
  'Sombrero Galaxy': {
    fr: 'Galaxie du Sombrero', de: 'Sombrerogalaxie',
    es: 'Galaxia del Sombrero', zh: '草帽星系', ja: 'ソンブレロ銀河', ar: 'مجرة القبعة',
  },
  "Cat's Eye Nebula": {
    fr: "Nébuleuse de l'Œil de Chat", de: 'Katzenaugennebel',
    es: 'Nebulosa Ojo de Gato', zh: '猫眼星云', ja: 'キャッツアイ星雲', ar: 'سديم عين القط',
  },
  'Helix Nebula': {
    fr: "Nébuleuse de l'Hélice", de: 'Helixnebel',
    es: 'Nebulosa de la Hélice', zh: '螺旋星云', ja: 'らせん星雲', ar: 'سديم الحلزون',
  },
};

/**
 * Get DSO name in a specific language.
 * @param {string} englishName - English DSO common name (e.g., 'Orion Nebula')
 * @param {string=} lang - Language code (default: 'en')
 * @returns {?string} Translated name, or null if not found
 */
export function getDsoName(englishName, lang = 'en') {
  if (lang === 'en') return englishName;
  return DSO_NAMES[englishName]?.[lang] || null;
}
