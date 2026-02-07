/**
 * @fileoverview Planet name translations in multiple languages.
 * Provides planet name lookup by English name and language code.
 */

/**
 * Planet names indexed by English name, then by language code.
 * English omitted since it matches the key and is used as-is.
 * @const {!Object<string, !Object<string, string>>}
 */
export const PLANET_NAMES = {
  'Sun': {
    fr: 'Soleil', de: 'Sonne', es: 'Sol',
    la: 'Sol', zh: '太阳', ja: '太陽', ar: 'الشمس',
  },
  'Moon': {
    fr: 'Lune', de: 'Mond', es: 'Luna',
    la: 'Luna', zh: '月球', ja: '月', ar: 'القمر',
  },
  'Mercury': {
    fr: 'Mercure', de: 'Merkur', es: 'Mercurio',
    la: 'Mercurius', zh: '水星', ja: '水星', ar: 'عطارد',
  },
  'Venus': {
    fr: 'Vénus', de: 'Venus', es: 'Venus',
    la: 'Venus', zh: '金星', ja: '金星', ar: 'الزهرة',
  },
  'Mars': {
    fr: 'Mars', de: 'Mars', es: 'Marte',
    la: 'Mars', zh: '火星', ja: '火星', ar: 'المريخ',
  },
  'Jupiter': {
    fr: 'Jupiter', de: 'Jupiter', es: 'Júpiter',
    la: 'Iuppiter', zh: '木星', ja: '木星', ar: 'المشتري',
  },
  'Saturn': {
    fr: 'Saturne', de: 'Saturn', es: 'Saturno',
    la: 'Saturnus', zh: '土星', ja: '土星', ar: 'زحل',
  },
  'Uranus': {
    fr: 'Uranus', de: 'Uranus', es: 'Urano',
    la: 'Uranus', zh: '天王星', ja: '天王星', ar: 'أورانوس',
  },
  'Neptune': {
    fr: 'Neptune', de: 'Neptun', es: 'Neptuno',
    la: 'Neptunus', zh: '海王星', ja: '海王星', ar: 'نبتون',
  },
};

/**
 * Get planet name in a specific language.
 * @param {string} englishName - English planet name (e.g., 'Mars')
 * @param {string=} lang - Language code (default: 'en')
 * @returns {string} Translated planet name, or English name if not found
 */
export function getPlanetName(englishName, lang = 'en') {
  if (lang === 'en') return englishName;
  return PLANET_NAMES[englishName]?.[lang] || englishName;
}
