/**
 * @fileoverview Centralized planet image URLs with fallback support.
 * Primary URLs use CORS-friendly sources (Wikimedia, NASA JPL).
 * NASA GSFC URLs don't support CORS so are not used.
 */

/**
 * Planet image configuration with primary and fallback URLs.
 * @const {!Object<string, {primary: string, fallback: string, source: string, tier: string}>}
 */
export const PLANET_IMAGES = {
  Sun: {
    // Wikimedia - NASA SDO image (CORS-friendly, unlike live NASA SDO)
    primary: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/' +
      'The_Sun_by_the_Atmospheric_Imaging_Assembly_of_NASA%27s_Solar_Dynamics_Observatory_' +
      '-_20100819.jpg/400px-The_Sun_by_the_Atmospheric_Imaging_Assembly_of_NASA%27s_Solar_' +
      'Dynamics_Observatory_-_20100819.jpg',
    fallback: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/' +
      'The_Sun_in_white_light.jpg/400px-The_Sun_in_white_light.jpg',
    source: 'NASA/SDO via Wikimedia',
    tier: 'iconic',
  },
  Moon: {
    // Wikimedia full moon image (CORS-friendly)
    primary: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/' +
      'FullMoon2010.jpg/400px-FullMoon2010.jpg',
    fallback: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/' +
      'Full_Moon_Luc_Viatour.jpg/400px-Full_Moon_Luc_Viatour.jpg',
    source: 'Wikimedia Commons',
    tier: 'high',
  },
  Mercury: {
    // NASA Photojournal
    primary: 'https://photojournal.jpl.nasa.gov/jpegMod/PIA15160_modest.jpg',
    fallback: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/' +
      'Mercury_in_true_color.jpg/400px-Mercury_in_true_color.jpg',
    source: 'NASA/MESSENGER',
    tier: 'iconic',
  },
  Venus: {
    // NASA Photojournal - Mariner 10 true color
    primary: 'https://photojournal.jpl.nasa.gov/jpegMod/PIA23791_modest.jpg',
    fallback: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/' +
      'PIA23791-Venus-NewlyProcessedView-20200608.jpg/400px-PIA23791-Venus-' +
      'NewlyProcessedView-20200608.jpg',
    source: 'NASA/Mariner',
    tier: 'iconic',
  },
  Mars: {
    // NASA Photojournal
    primary: 'https://photojournal.jpl.nasa.gov/jpegMod/PIA14293_modest.jpg',
    fallback: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/' +
      'Mars_-_August_30_2021_-_Flickr_-_Kevin_M._Gill.png/400px-Mars_-_August_30_2021' +
      '_-_Flickr_-_Kevin_M._Gill.png',
    source: 'NASA/Hubble',
    tier: 'iconic',
  },
  Jupiter: {
    // NASA Photojournal - Juno
    primary: 'https://photojournal.jpl.nasa.gov/jpegMod/PIA21973_modest.jpg',
    fallback: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/' +
      'Jupiter_New_Horizons.jpg/400px-Jupiter_New_Horizons.jpg',
    source: 'NASA/Juno',
    tier: 'iconic',
  },
  Saturn: {
    // NASA Photojournal - Cassini
    primary: 'https://photojournal.jpl.nasa.gov/jpegMod/PIA11141_modest.jpg',
    fallback: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/' +
      'Saturn_during_Equinox.jpg/400px-Saturn_during_Equinox.jpg',
    source: 'NASA/Cassini',
    tier: 'iconic',
  },
  Uranus: {
    // NASA Photojournal - Voyager
    primary: 'https://photojournal.jpl.nasa.gov/jpegMod/PIA18182_modest.jpg',
    fallback: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/' +
      'Uranus2.jpg/400px-Uranus2.jpg',
    source: 'NASA/Voyager',
    tier: 'iconic',
  },
  Neptune: {
    // NASA Photojournal - Voyager
    primary: 'https://photojournal.jpl.nasa.gov/jpegMod/PIA01492_modest.jpg',
    fallback: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/' +
      'Neptune_Voyager2_color_calibrated.png/400px-Neptune_Voyager2_color_calibrated.png',
    source: 'NASA/Voyager',
    tier: 'iconic',
  },
  Pluto: {
    // NASA Photojournal - New Horizons
    primary: 'https://photojournal.jpl.nasa.gov/jpegMod/PIA19952_modest.jpg',
    fallback: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/' +
      'Pluto_in_True_Color_-_High-Res.jpg/400px-Pluto_in_True_Color_-_High-Res.jpg',
    source: 'NASA/New Horizons',
    tier: 'iconic',
  },
};

/**
 * Get the primary image URL for a planet.
 * @param {string} name - Planet name
 * @returns {?string} Primary image URL or null
 */
export function getPlanetImageUrl(name) {
  return PLANET_IMAGES[name]?.primary || null;
}

/**
 * Get the fallback image URL for a planet.
 * @param {string} name - Planet name
 * @returns {?string} Fallback image URL or null
 */
export function getPlanetFallbackUrl(name) {
  return PLANET_IMAGES[name]?.fallback || null;
}

/**
 * Get planet image metadata.
 * @param {string} name - Planet name
 * @returns {?{url: string, source: string, tier: string}} Image info or null
 */
export function getPlanetImageInfo(name) {
  const info = PLANET_IMAGES[name];
  if (!info) return null;
  return {
    url: info.primary,
    source: info.source,
    tier: info.tier,
  };
}
