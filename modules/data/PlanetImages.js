/**
 * @fileoverview Photographs of the Sun, Moon and planets, each with where its
 * disc sits in the frame. All URLs are CORS-enabled (Wikimedia Commons), so
 * they can be drawn to a canvas.
 */

const COMMONS = 'https://upload.wikimedia.org/wikipedia/commons/thumb/';

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
 * Photographs per body, in the order to try them, and their credit.
 *
 * Wikimedia thumbnails only exist at standard widths (330/500/960/1280/1920);
 * check edits with `node scripts/check-image-urls.mjs`. A new or replaced
 * photo needs its disc re-measured.
 * @const {!Object<string, {sources: !Array<{url: string, disc: !BodyDisc}>,
 *     credit: string}>}
 */
export const PLANET_IMAGES = {
  Sun: {
    sources: [
      {
        url: `${COMMONS}b/b4/The_Sun_by_the_Atmospheric_Imaging_Assembly_of_NASA%27s_Solar_` +
          'Dynamics_Observatory_-_20100819.jpg/960px-The_Sun_by_the_Atmospheric_Imaging_' +
          'Assembly_of_NASA%27s_Solar_Dynamics_Observatory_-_20100819.jpg',
        disc: {x: 0.497, y: 0.499, diameter: 0.899},
      },
      {
        url: `${COMMONS}8/83/The_Sun_in_white_light.jpg/960px-The_Sun_in_white_light.jpg`,
        disc: {x: 0.503, y: 0.504, diameter: 0.842},
      },
    ],
    credit: 'NASA/SDO via Wikimedia',
  },
  Moon: {
    sources: [
      {
        url: `${COMMONS}e/e1/FullMoon2010.jpg/1280px-FullMoon2010.jpg`,
        disc: {x: 0.500, y: 0.509, diameter: 0.831},
      },
      {
        url: `${COMMONS}d/dd/Full_Moon_Luc_Viatour.jpg/960px-Full_Moon_Luc_Viatour.jpg`,
        disc: {x: 0.499, y: 0.507, diameter: 0.883},
      },
    ],
    credit: 'Gregory H. Revera / Luc Viatour via Wikimedia',
  },
  Mercury: {
    sources: [{
      url: `${COMMONS}4/4a/Mercury_in_true_color.jpg/960px-Mercury_in_true_color.jpg`,
      disc: {x: 0.495, y: 0.499, diameter: 0.920},
    }],
    credit: 'NASA/MESSENGER via Wikimedia',
  },
  Venus: {
    sources: [{
      url: `${COMMONS}a/a9/PIA23791-Venus-NewlyProcessedView-20200608.jpg/` +
        '960px-PIA23791-Venus-NewlyProcessedView-20200608.jpg',
      disc: {x: 0.513, y: 0.500, diameter: 0.855},
    }],
    credit: 'NASA/Mariner 10 via Wikimedia',
  },
  Mars: {
    // 500px: the 960px PNG is 2.7 MB.
    sources: [{
      url: `${COMMONS}0/0c/Mars_-_August_30_2021_-_Flickr_-_Kevin_M._Gill.png/` +
        '500px-Mars_-_August_30_2021_-_Flickr_-_Kevin_M._Gill.png',
      disc: {x: 0.507, y: 0.493, diameter: 0.844},
    }],
    credit: 'NASA/Kevin M. Gill via Wikimedia',
  },
  Jupiter: {
    sources: [{
      url: `${COMMONS}e/e2/Jupiter_OPAL_2024.png/1280px-Jupiter_OPAL_2024.png`,
      disc: {x: 0.502, y: 0.500, diameter: 0.855},
    }],
    credit: 'NASA/STScI (OPAL) via Wikimedia',
  },
  Saturn: {
    sources: [{
      url: `${COMMONS}c/c7/Saturn_during_Equinox.jpg/960px-Saturn_during_Equinox.jpg`,
      disc: null,
    }],
    credit: 'NASA/Cassini via Wikimedia',
  },
  Uranus: {
    sources: [{
      url: `${COMMONS}3/3d/Uranus2.jpg/960px-Uranus2.jpg`,
      disc: {x: 0.495, y: 0.496, diameter: 0.811},
    }],
    credit: 'NASA/Voyager via Wikimedia',
  },
  Neptune: {
    sources: [{
      url: `${COMMONS}b/b9/Neptune_Voyager2_color_calibrated.png/` +
        '960px-Neptune_Voyager2_color_calibrated.png',
      disc: {x: 0.498, y: 0.504, diameter: 0.850},
    }],
    credit: 'NASA/Voyager via Wikimedia',
  },
  Pluto: {
    sources: [{
      url: `${COMMONS}e/ef/Pluto_in_True_Color_-_High-Res.jpg/` +
        '960px-Pluto_in_True_Color_-_High-Res.jpg',
      disc: {x: 0.503, y: 0.493, diameter: 0.865},
    }],
    credit: 'NASA/New Horizons via Wikimedia',
  },
};

/**
 * A body's photographs in the order to try them, each with its disc.
 * @param {string} name - Body name ('Moon', 'Mars', ...)
 * @returns {!Array<{url: string, disc: !BodyDisc}>} Empty if none
 */
export function getPlanetImageSources(name) {
  return PLANET_IMAGES[name]?.sources ?? [];
}

/**
 * Credit line for a body's photographs.
 * @param {string} name - Body name
 * @returns {?string} Null if the body has no photographs
 */
export function getPlanetImageCredit(name) {
  return PLANET_IMAGES[name]?.credit ?? null;
}
