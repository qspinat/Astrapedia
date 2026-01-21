/**
 * @fileoverview Static database of curated astronomical images.
 *
 * Image Source Priority (highest quality first):
 * 1. James Webb (esawebb.org) - Ultra-high infrared
 * 2. Hubble (esahubble.org) - Ultra-high visible light
 * 3. NASA Science - CORS-enabled NASA images
 * 4. Wikimedia Commons - Various sources with CORS
 *
 * Objects not in this database will use dynamic fallback
 * (NASA Images API, Wikimedia, DSS).
 */

const WEBB_BASE = 'https://cdn.esawebb.org/archives/images/screen/';
const HUBBLE_BASE = 'https://cdn.esahubble.org/archives/images/screen/';

/**
 * Curated image database with verified working URLs.
 * @const {!Object<string, {url: ?string, source: string}>}
 */
export const CURATED_IMAGES = {
  // === MESSIER OBJECTS ===

  // James Webb images (highest quality)
  'M16': {url: `${WEBB_BASE}weic2216a.jpg`, source: 'ESA/Webb'},
  'M42': {url: `${WEBB_BASE}weic2315b.jpg`, source: 'ESA/Webb'},
  'M51': {url: `${WEBB_BASE}potm2308c.jpg`, source: 'ESA/Webb'},
  'M57': {url: `${WEBB_BASE}weic2320b.jpg`, source: 'ESA/Webb'},
  'M74': {url: `${WEBB_BASE}potm2208a.jpg`, source: 'ESA/Webb'},

  // Hubble images (excellent quality)
  'M1': {url: `${HUBBLE_BASE}heic0515a.jpg`, source: 'ESA/Hubble'},
  'M3': {url: `${HUBBLE_BASE}potw1914a.jpg`, source: 'ESA/Hubble'},
  'M4': {url: `${HUBBLE_BASE}heic1221a.jpg`, source: 'ESA/Hubble'},
  'M5': {url: `${HUBBLE_BASE}potw1913a.jpg`, source: 'ESA/Hubble'},
  'M8': {url: `${HUBBLE_BASE}heic1517a.jpg`, source: 'ESA/Hubble'},
  'M9': {url: `${HUBBLE_BASE}potw1217a.jpg`, source: 'ESA/Hubble'},
  'M10': {url: `${HUBBLE_BASE}potw1235a.jpg`, source: 'ESA/Hubble'},
  'M12': {url: `${HUBBLE_BASE}potw2419a.jpg`, source: 'ESA/Hubble'},
  'M14': {url: `${HUBBLE_BASE}potw1228a.jpg`, source: 'ESA/Hubble'},
  'M15': {url: `${HUBBLE_BASE}heic1321a.jpg`, source: 'ESA/Hubble'},
  'M17': {url: `${HUBBLE_BASE}heic0305a.jpg`, source: 'ESA/Hubble'},
  'M19': {url: `${HUBBLE_BASE}potw1519a.jpg`, source: 'ESA/Hubble'},
  'M20': {url: `${HUBBLE_BASE}opo9931a.jpg`, source: 'ESA/Hubble'},
  'M24': {
    url: 'https://assets.science.nasa.gov/dynamicimage/assets/science/' +
         'missions/hubble/stars/star-cloud/M24_a_New-new.jpg?w=1024&h=1024&fit=clip',
    source: 'NASA',
  },
  'M27': {url: `${HUBBLE_BASE}opo0119a.jpg`, source: 'ESA/Hubble'},
  'M28': {url: `${HUBBLE_BASE}potw2221a.jpg`, source: 'ESA/Hubble'},
  'M30': {url: `${HUBBLE_BASE}heic0918a.jpg`, source: 'ESA/Hubble'},
  'M32': {url: `${HUBBLE_BASE}opo2509.jpg`, source: 'ESA/Hubble'},
  'M33': {url: `${HUBBLE_BASE}heic1901a.jpg`, source: 'ESA/Hubble'},
  'M44': {url: `${HUBBLE_BASE}potw1908a.jpg`, source: 'ESA/Hubble'},
  'M45': {url: `${HUBBLE_BASE}opo0420a.jpg`, source: 'ESA/Hubble'},
  'M53': {url: `${HUBBLE_BASE}potw1221a.jpg`, source: 'ESA/Hubble'},
  'M54': {url: `${HUBBLE_BASE}potw1118a.jpg`, source: 'ESA/Hubble'},
  'M56': {url: `${HUBBLE_BASE}potw1141a.jpg`, source: 'ESA/Hubble'},
  'M62': {url: `${HUBBLE_BASE}potw1319a.jpg`, source: 'ESA/Hubble'},
  'M70': {url: `${HUBBLE_BASE}potw1237a.jpg`, source: 'ESA/Hubble'},
  'M71': {url: `${HUBBLE_BASE}potw1940a.jpg`, source: 'ESA/Hubble'},
  'M72': {url: `${HUBBLE_BASE}potw1120a.jpg`, source: 'ESA/Hubble'},
  'M75': {url: `${HUBBLE_BASE}potw1321a.jpg`, source: 'ESA/Hubble'},
  'M76': {url: `${HUBBLE_BASE}heic2408a.jpg`, source: 'ESA/Hubble'},
  'M77': {url: `${HUBBLE_BASE}heic1305a.jpg`, source: 'ESA/Hubble'},
  'M79': {url: `${HUBBLE_BASE}potw1510a.jpg`, source: 'ESA/Hubble'},
  'M82': {url: `${HUBBLE_BASE}heic0604a.jpg`, source: 'ESA/Hubble'},
  'M83': {url: `${HUBBLE_BASE}heic1403a.jpg`, source: 'ESA/Hubble'},
  'M87': {url: `${HUBBLE_BASE}opo0020a.jpg`, source: 'ESA/Hubble'},
  'M94': {url: `${HUBBLE_BASE}potw1542a.jpg`, source: 'ESA/Hubble'},
  'M96': {url: `${HUBBLE_BASE}potw1643a.jpg`, source: 'ESA/Hubble'},
  'M100': {url: `${HUBBLE_BASE}potw1152a.jpg`, source: 'ESA/Hubble'},
  'M101': {url: `${HUBBLE_BASE}heic0602a.jpg`, source: 'ESA/Hubble'},
  'M104': {url: `${HUBBLE_BASE}opo0328a.jpg`, source: 'ESA/Hubble'},
  'M106': {url: `${HUBBLE_BASE}heic1302a.jpg`, source: 'ESA/Hubble'},

  // Wikimedia (full-view images not available from Hubble)
  'M31': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/98/' +
         'Andromeda_Galaxy_%28with_h-alpha%29.jpg/' +
         '1280px-Andromeda_Galaxy_%28with_h-alpha%29.jpg',
    source: 'Adam Evans/Wikimedia',
  },

  // === NGC OBJECTS ===

  // James Webb images
  'NGC2070': {url: `${WEBB_BASE}weic2212a.jpg`, source: 'ESA/Webb'},
  'NGC3132': {url: `${WEBB_BASE}weic2207b.jpg`, source: 'ESA/Webb'},
  'NGC3372': {url: `${WEBB_BASE}weic2205a.jpg`, source: 'ESA/Webb'},

  // Hubble images
  'NGC104': {url: `${HUBBLE_BASE}heic1510a.jpg`, source: 'ESA/Hubble'},
  'NGC253': {url: `${HUBBLE_BASE}heic0911a.jpg`, source: 'ESA/Hubble'},
  'NGC292': {url: `${HUBBLE_BASE}heic0514a.jpg`, source: 'ESA/Hubble'},
  'NGC891': {url: `${HUBBLE_BASE}opo0624b.jpg`, source: 'ESA/Hubble'},
  'NGC1275': {url: `${HUBBLE_BASE}heic0817a.jpg`, source: 'ESA/Hubble'},
  'NGC1300': {url: `${HUBBLE_BASE}opo0501a.jpg`, source: 'ESA/Hubble'},
  'NGC1672': {url: `${HUBBLE_BASE}heic0706a.jpg`, source: 'ESA/Hubble'},
  'NGC2024': {url: `${HUBBLE_BASE}heic1714a.jpg`, source: 'ESA/Hubble'},
  'NGC2237': {url: `${HUBBLE_BASE}heic2505f.jpg`, source: 'ESA/Hubble'},
  'NGC2392': {url: `${HUBBLE_BASE}opo0002a.jpg`, source: 'ESA/Hubble'},
  'NGC2841': {url: `${HUBBLE_BASE}heic1104a.jpg`, source: 'ESA/Hubble'},
  'NGC4565': {url: `${HUBBLE_BASE}opo0919a.jpg`, source: 'ESA/Hubble'},
  'NGC4631': {url: `${HUBBLE_BASE}heic1413a.jpg`, source: 'ESA/Hubble'},
  'NGC5139': {url: `${HUBBLE_BASE}heic0809a.jpg`, source: 'ESA/Hubble'},
  'NGC5866': {url: `${HUBBLE_BASE}opo0624a.jpg`, source: 'ESA/Hubble'},
  'NGC6302': {url: `${HUBBLE_BASE}heic0910h.jpg`, source: 'ESA/Hubble'},
  'NGC6543': {url: `${HUBBLE_BASE}heic0414a.jpg`, source: 'ESA/Hubble'},
  'NGC6611': {url: `${HUBBLE_BASE}heic0611a.jpg`, source: 'ESA/Hubble'},
  'NGC6752': {url: `${HUBBLE_BASE}potw1129a.jpg`, source: 'ESA/Hubble'},
  'NGC6826': {url: `${HUBBLE_BASE}opo9819a.jpg`, source: 'ESA/Hubble'},
  'NGC7293': {url: `${HUBBLE_BASE}opo0432d.jpg`, source: 'ESA/Hubble'},
  'NGC7635': {url: `${HUBBLE_BASE}heic1608a.jpg`, source: 'ESA/Hubble'},

  // Double Cluster - no individual images available
  'NGC869': {url: null, source: 'none'},
  'NGC884': {url: null, source: 'none'},

  // Wikimedia (wide-field objects not suitable for space telescopes)
  'NGC2244': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/' +
         'Rosette_Nebula_Hires.jpg/1024px-Rosette_Nebula_Hires.jpg',
    source: 'Wikimedia',
  },
  'NGC6960': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/' +
         'Veil_Nebula_-_NGC6960.jpg/1024px-Veil_Nebula_-_NGC6960.jpg',
    source: 'Wikimedia',
  },
  'NGC6992': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/93/' +
         'Veil_Nebula_by_Hubble_2015.jpg/800px-Veil_Nebula_by_Hubble_2015.jpg',
    source: 'ESA/Hubble',
  },
  'NGC7000': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/' +
         'North_America_Nebula_%28NGC_7000%29.jpg/' +
         '1024px-North_America_Nebula_%28NGC_7000%29.jpg',
    source: 'Wikimedia',
  },
  'NGC7023': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/26/' +
         'Iris_Nebula_NGC_7023.jpg/800px-Iris_Nebula_NGC_7023.jpg',
    source: 'Wikimedia',
  },

  // === IC OBJECTS ===
  'IC434': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/' +
         'Barnard_33.jpg/1024px-Barnard_33.jpg',
    source: 'Wikimedia',
  },
  'IC1396': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/' +
         "Elephant%27s_Trunk_Nebula.jpg/800px-Elephant%27s_Trunk_Nebula.jpg",
    source: 'Wikimedia',
  },
  'IC2118': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/' +
         'IC_2118.jpg/800px-IC_2118.jpg',
    source: 'Wikimedia',
  },

  // No image available (prevents Wikipedia lookup attempts)
  'IC4665': {url: null, source: 'none'},
};

/**
 * Get curated image URL for an object.
 * @param {string} objectName - Name of the object (e.g., 'M31', 'NGC7293')
 * @returns {?{url: ?string, source: string}} Image info or null if not found
 */
export const getCuratedImage = (objectName) => {
  if (!objectName) return null;

  // Direct match
  if (CURATED_IMAGES[objectName]) {
    return CURATED_IMAGES[objectName];
  }

  // Try Messier format
  const messierMatch = objectName.match(/M(\d+)/i);
  if (messierMatch) {
    const key = `M${messierMatch[1]}`;
    if (CURATED_IMAGES[key]) {
      return CURATED_IMAGES[key];
    }
  }

  // Try NGC format (remove leading zeros)
  const ngcMatch = objectName.match(/NGC\s*0*(\d+)/i);
  if (ngcMatch) {
    const key = `NGC${parseInt(ngcMatch[1], 10)}`;
    if (CURATED_IMAGES[key]) {
      return CURATED_IMAGES[key];
    }
  }

  // Try IC format (remove leading zeros)
  const icMatch = objectName.match(/IC\s*0*(\d+)/i);
  if (icMatch) {
    const key = `IC${parseInt(icMatch[1], 10)}`;
    if (CURATED_IMAGES[key]) {
      return CURATED_IMAGES[key];
    }
  }

  return null;
};

/**
 * Check if an object has a curated image.
 * @param {string} objectName - Name of the object
 * @returns {boolean} True if curated image exists
 */
export const hasCuratedImage = (objectName) => {
  return getCuratedImage(objectName) !== null;
};

/**
 * Get all curated image keys.
 * @returns {!Array<string>} Array of object names with curated images
 */
export const getCuratedImageKeys = () => {
  return Object.keys(CURATED_IMAGES);
};
