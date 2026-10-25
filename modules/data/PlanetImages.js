/**
 * @fileoverview Centralized planet image URLs with fallback support.
 * All primary URLs use CORS-friendly sources (Wikimedia Commons).
 */

/**
 * Where a body's disc sits in its photograph: centre and diameter as
 * fractions of the image width (x, diameter) and height (y). Measured on the
 * actual files, so the disc can be cut out of its black background and sized
 * to the body's real angular diameter. Null for Saturn, whose rings do not
 * fit a circle.
 * @typedef {?{x: number, y: number, diameter: number}}
 */
let BodyDisc;

/**
 * Planet image configuration with primary and fallback URLs.
 *
 * Wikimedia thumbnails only exist at standard widths (330/500/960/1280/1920);
 * check edits with `node scripts/check-image-urls.mjs`. A new or replaced
 * photo needs its disc re-measured.
 * @const {!Object<string, {primary: string, fallback: ?string,
 *     primaryDisc: !BodyDisc, fallbackDisc: !BodyDisc, source: string,
 *     tier: string}>}
 */
export const PLANET_IMAGES = {
  Sun: {
    primary: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/' +
      'The_Sun_by_the_Atmospheric_Imaging_Assembly_of_NASA%27s_Solar_Dynamics_Observatory_' +
      '-_20100819.jpg/960px-The_Sun_by_the_Atmospheric_Imaging_Assembly_of_NASA%27s_Solar_' +
      'Dynamics_Observatory_-_20100819.jpg',
    fallback: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/' +
      'The_Sun_in_white_light.jpg/960px-The_Sun_in_white_light.jpg',
    primaryDisc: {x: 0.497, y: 0.499, diameter: 0.899},
    fallbackDisc: {x: 0.503, y: 0.504, diameter: 0.842},
    source: 'NASA/SDO via Wikimedia',
    tier: 'iconic',
  },
  Moon: {
    primary: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/' +
      'FullMoon2010.jpg/1280px-FullMoon2010.jpg',
    fallback: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/' +
      'Full_Moon_Luc_Viatour.jpg/960px-Full_Moon_Luc_Viatour.jpg',
    primaryDisc: {x: 0.500, y: 0.509, diameter: 0.831},
    fallbackDisc: {x: 0.499, y: 0.507, diameter: 0.883},
    source: 'Wikimedia Commons',
    tier: 'high',
  },
  Mercury: {
    primary: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/' +
      'Mercury_in_true_color.jpg/960px-Mercury_in_true_color.jpg',
    fallback: null,
    primaryDisc: {x: 0.495, y: 0.499, diameter: 0.920},
    fallbackDisc: null,
    source: 'NASA/MESSENGER via Wikimedia',
    tier: 'iconic',
  },
  Venus: {
    primary: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/' +
      'PIA23791-Venus-NewlyProcessedView-20200608.jpg/960px-PIA23791-Venus-' +
      'NewlyProcessedView-20200608.jpg',
    fallback: null,
    primaryDisc: {x: 0.513, y: 0.500, diameter: 0.855},
    fallbackDisc: null,
    source: 'NASA/Mariner via Wikimedia',
    tier: 'iconic',
  },
  Mars: {
    primary: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/' +
      'Mars_-_August_30_2021_-_Flickr_-_Kevin_M._Gill.png/500px-Mars_-_August_30_2021' +
      '_-_Flickr_-_Kevin_M._Gill.png',
    fallback: null,
    primaryDisc: {x: 0.507, y: 0.493, diameter: 0.844},
    fallbackDisc: null,
    source: 'NASA/Hubble via Wikimedia',
    tier: 'iconic',
  },
  Jupiter: {
    primary: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e2/' +
      'Jupiter_OPAL_2024.png/1280px-Jupiter_OPAL_2024.png',
    fallback: null,
    primaryDisc: {x: 0.502, y: 0.500, diameter: 0.855},
    fallbackDisc: null,
    source: 'NASA/STScI (OPAL) via Wikimedia',
    tier: 'iconic',
  },
  Saturn: {
    primary: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/' +
      'Saturn_during_Equinox.jpg/960px-Saturn_during_Equinox.jpg',
    fallback: null,
    primaryDisc: null,
    fallbackDisc: null,
    source: 'NASA/Cassini via Wikimedia',
    tier: 'iconic',
  },
  Uranus: {
    primary: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/' +
      'Uranus2.jpg/960px-Uranus2.jpg',
    fallback: null,
    primaryDisc: {x: 0.495, y: 0.496, diameter: 0.811},
    fallbackDisc: null,
    source: 'NASA/Voyager via Wikimedia',
    tier: 'iconic',
  },
  Neptune: {
    primary: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/' +
      'Neptune_Voyager2_color_calibrated.png/960px-Neptune_Voyager2_color_calibrated.png',
    fallback: null,
    primaryDisc: {x: 0.498, y: 0.504, diameter: 0.850},
    fallbackDisc: null,
    source: 'NASA/Voyager via Wikimedia',
    tier: 'iconic',
  },
  Pluto: {
    primary: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/' +
      'Pluto_in_True_Color_-_High-Res.jpg/960px-Pluto_in_True_Color_-_High-Res.jpg',
    fallback: null,
    primaryDisc: {x: 0.503, y: 0.493, diameter: 0.865},
    fallbackDisc: null,
    source: 'NASA/New Horizons via Wikimedia',
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
 * A body's photographs in the order to try them, each with its disc.
 * @param {string} name - Body name ('Moon', 'Mars', ...)
 * @returns {!Array<{url: string, disc: !BodyDisc}>} Empty if none
 */
export function getPlanetImageSources(name) {
  const info = PLANET_IMAGES[name];
  if (!info) return [];
  const sources = [{url: info.primary, disc: info.primaryDisc}];
  if (info.fallback) sources.push({url: info.fallback, disc: info.fallbackDisc});
  return sources;
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
