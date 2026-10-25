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
 *
 * Every entry is checked by `node scripts/check-image-urls.mjs` (HTTP 200,
 * image type, CORS header, under 5 MB): run it after editing this list.
 * Wikimedia thumbnails only exist at standard widths (330/500/960/1280/1920);
 * any other width now returns HTTP 400.
 * @const {!Object<string, {url: ?string, source: string}>}
 */
export const CURATED_IMAGES = {
  // === MESSIER OBJECTS ===

  // James Webb images (highest quality)
  'M16': {url: `${WEBB_BASE}weic2216a.jpg`, source: 'ESA/Webb'},
  'M42': {url: `${WEBB_BASE}weic2315b.jpg`, source: 'ESA/Webb'},
  'M51': {url: `${HUBBLE_BASE}heic0506a.jpg`, source: 'ESA/Hubble'},
  'M57': {url: `${WEBB_BASE}weic2320b.jpg`, source: 'ESA/Webb'},
  'M74': {url: `${WEBB_BASE}potm2208a.jpg`, source: 'ESA/Webb'},

  // Hubble images (excellent quality)
  'M1': {url: `${HUBBLE_BASE}heic0515a.jpg`, source: 'ESA/Hubble'},
  'M3': {url: `${HUBBLE_BASE}potw1914a.jpg`, source: 'ESA/Hubble'},
  'M4': {url: `${HUBBLE_BASE}heic1221a.jpg`, source: 'ESA/Hubble'},
  'M5': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Messier_5_-_HST.jpg/' +
         '1280px-Messier_5_-_HST.jpg',
    source: 'ESA/Hubble & NASA via Wikimedia',
  },
  'M8': {url: `${HUBBLE_BASE}heic1517a.jpg`, source: 'ESA/Hubble'},
  'M9': {url: `${HUBBLE_BASE}heic1205a.jpg`, source: 'ESA/Hubble'},
  'M10': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/Messier_10_Hubble_WikiSky.jpg/' +
         '1280px-Messier_10_Hubble_WikiSky.jpg',
    source: 'NASA/STScI/WikiSky via Wikimedia',
  },
  'M12': {url: `${HUBBLE_BASE}potw1113a.jpg`, source: 'ESA/Hubble'},
  'M14': {
    url: 'https://science.nasa.gov/wp-content/uploads/2023/04/hubble_m14_wfc3_1flat_cont_final-jpg.webp',
    source: 'NASA',
  },
  'M15': {url: `${HUBBLE_BASE}heic1321a.jpg`, source: 'ESA/Hubble'},
  'M17': {url: `${HUBBLE_BASE}heic0305a.jpg`, source: 'ESA/Hubble'},
  'M19': {
    url: 'https://science.nasa.gov/wp-content/uploads/2023/04/hubble_m19_wfc3_str_gapfilled_flat_cont_final-jpg.webp',
    source: 'NASA',
  },
  'M20': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Trifid_Nebula_%28M20%29_%28gemini0207a%29.jpg/' +
         '1280px-Trifid_Nebula_%28M20%29_%28gemini0207a%29.jpg',
    source: 'Gemini Observatory/NOIRLab via Wikimedia',
  },
  'M24': {
    url: 'https://assets.science.nasa.gov/content/dam/science/missions/hubble/stars/star-cloud/Hubble_M24_1_flat_FINAL_A_rot90.jpg/jcr:content/renditions/cq5dam.web.1280.1280.jpeg',
    source: 'NASA',
  },
  'M27': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/M27%2C_NGC_6853%2C_Dumbbell_Nebula_%28noao-02674%29.jpg/' +
         '1280px-M27%2C_NGC_6853%2C_Dumbbell_Nebula_%28noao-02674%29.jpg',
    source: 'NOIRLab/NSF/AURA via Wikimedia',
  },
  'M28': {url: `${HUBBLE_BASE}potw1910a.jpg`, source: 'ESA/Hubble'},
  'M30': {url: `${HUBBLE_BASE}heic0918a.jpg`, source: 'ESA/Hubble'},
  'M32': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cf/M32%2C_NGC_221_%28noao-02326%29.jpg/' +
         '1280px-M32%2C_NGC_221_%28noao-02326%29.jpg',
    source: 'NOIRLab/NSF/AURA via Wikimedia',
  },
  'M33': {url: `${HUBBLE_BASE}heic1901a.jpg`, source: 'ESA/Hubble'},
  'M44': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/M44-_The_Beehive_Cluster_%28noao-m44bash%29.jpg/' +
         '1280px-M44-_The_Beehive_Cluster_%28noao-m44bash%29.jpg',
    source: 'KPNO/NOIRLab/NSF/AURA via Wikimedia',
  },
  'M45': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Pleiades_large.jpg/' +
         '1280px-Pleiades_large.jpg',
    source: 'NASA/ESA/AURA/Caltech via Wikimedia',
  },
  'M53': {url: `${HUBBLE_BASE}potw1140a.jpg`, source: 'ESA/Hubble'},
  'M54': {url: `${HUBBLE_BASE}potw1118a.jpg`, source: 'ESA/Hubble'},
  'M56': {url: `${HUBBLE_BASE}potw1234a.jpg`, source: 'ESA/Hubble'},
  'M62': {url: `${HUBBLE_BASE}potw1915a.jpg`, source: 'ESA/Hubble'},
  'M70': {url: `${HUBBLE_BASE}potw1215a.jpg`, source: 'ESA/Hubble'},
  'M71': {url: `${HUBBLE_BASE}potw1018a.jpg`, source: 'ESA/Hubble'},
  'M72': {url: `${HUBBLE_BASE}potw2516a.jpg`, source: 'ESA/Hubble'},
  'M75': {url: `${HUBBLE_BASE}potw1916a.jpg`, source: 'ESA/Hubble'},
  'M76': {url: `${HUBBLE_BASE}heic2408a.jpg`, source: 'ESA/Hubble'},
  'M77': {url: `${HUBBLE_BASE}heic1305a.jpg`, source: 'ESA/Hubble'},
  'M79': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/31/' +
         'A_snowstorm_of_stars.jpg/1280px-A_snowstorm_of_stars.jpg',
    source: 'NASA/ESA Hubble via Wikimedia',
  },
  'M82': {url: `${HUBBLE_BASE}heic0604a.jpg`, source: 'ESA/Hubble'},
  'M83': {url: `${HUBBLE_BASE}heic1403a.jpg`, source: 'ESA/Hubble'},
  'M87': {url: `${HUBBLE_BASE}opo0020a.jpg`, source: 'ESA/Hubble'},
  'M94': {url: `${HUBBLE_BASE}potw1542a.jpg`, source: 'ESA/Hubble'},
  'M96': {url: `${HUBBLE_BASE}potw2534a.jpg`, source: 'ESA/Hubble'},
  'M100': {
    url: 'https://assets.science.nasa.gov/content/dam/science/missions/hubble/releases/2018/12/STScI-01EVSYX5KXKD5N7E53PYXGQ5E4.tif/jcr:content/renditions/cq5dam.web.1280.1280.jpeg',
    source: 'NASA',
  },
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
  'NGC292': {url: `${HUBBLE_BASE}heic0514a.jpg`, source: 'ESA/Hubble'},
  'NGC891': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/2/24/N891s.jpg',
    source: 'Adam Block/Mount Lemmon SkyCenter via Wikimedia',
  },
  'NGC1275': {url: `${HUBBLE_BASE}heic0817a.jpg`, source: 'ESA/Hubble'},
  'NGC1300': {url: `${HUBBLE_BASE}opo0501a.jpg`, source: 'ESA/Hubble'},
  'NGC1672': {url: `${HUBBLE_BASE}heic0706a.jpg`, source: 'ESA/Hubble'},
  'NGC2024': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Flame_Nebula_NGC_2024.jpg/' +
         '1280px-Flame_Nebula_NGC_2024.jpg',
    source: 'ESO via Wikimedia',
  },
  'NGC2237': {url: `${HUBBLE_BASE}heic2505f.jpg`, source: 'ESA/Hubble'},
  'NGC2392': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/Ngc2392.jpg/' +
         '1280px-Ngc2392.jpg',
    source: 'NASA/ESA via Wikimedia',
  },
  'NGC2841': {url: `${HUBBLE_BASE}heic1104a.jpg`, source: 'ESA/Hubble'},
  'NGC4565': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/NGC_4565.jpg/' +
         '1280px-NGC_4565.jpg',
    source: 'ESO via Wikimedia',
  },
  'NGC4631': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/NGC_4631-_The_Whale_%28noao-n4631vickery%29.jpg/' +
         '1280px-NGC_4631-_The_Whale_%28noao-n4631vickery%29.jpg',
    source: 'KPNO/NOIRLab/NSF/AURA via Wikimedia',
  },
  'NGC5139': {url: `${HUBBLE_BASE}heic0809a.jpg`, source: 'ESA/Hubble'},
  'NGC5866': {url: `${HUBBLE_BASE}opo0624a.jpg`, source: 'ESA/Hubble'},
  'NGC6302': {url: `${HUBBLE_BASE}heic0910h.jpg`, source: 'ESA/Hubble'},
  'NGC6543': {url: `${HUBBLE_BASE}heic0414a.jpg`, source: 'ESA/Hubble'},
  'NGC6611': {
    url: 'https://cdn.eso.org/images/screen/eso0926a.jpg',
    source: 'ESO',
  },
  'NGC6752': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/NGC_6752_Hubble_WikiSky.jpg/' +
         '1280px-NGC_6752_Hubble_WikiSky.jpg',
    source: 'NASA/STScI/WikiSky via Wikimedia',
  },
  'NGC6826': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/6/66/Caldwell_15.jpg',
    source: 'NASA/Hubble via Wikimedia',
  },
  'NGC7293': {url: `${HUBBLE_BASE}opo0432d.jpg`, source: 'ESA/Hubble'},
  'NGC7635': {url: `${HUBBLE_BASE}heic1608a.jpg`, source: 'ESA/Hubble'},

  // Double Cluster - no individual images available
  'NGC869': {url: null, source: 'none'},
  'NGC884': {url: null, source: 'none'},

  // Wikimedia (wide-field objects not suitable for space telescopes)
  'NGC2244': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c6/The_Rosette_Nebula_Caldwell_49_50_Broadband.jpg/' +
         '1280px-The_Rosette_Nebula_Caldwell_49_50_Broadband.jpg',
    source: 'Dylan O\'Donnell via Wikimedia',
  },
  'NGC6960': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Veil_Nebula_-_NGC6960.jpg/' +
         '1280px-Veil_Nebula_-_NGC6960.jpg',
    source: 'Ken Crawford via Wikimedia',
  },
  'NGC6992': {url: `${HUBBLE_BASE}heic1520a.jpg`, source: 'ESA/Hubble'},
  'NGC7000': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/NGC_7000-_The_North_America_Nebula_and_the_Pelican_Nebula_%28noao-n7000mosblock%29.jpg/' +
         '1280px-NGC_7000-_The_North_America_Nebula_and_the_Pelican_Nebula_%28noao-n7000mosblock%29.jpg',
    source: 'KPNO/NOIRLab/NSF/AURA via Wikimedia',
  },
  'NGC7023': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Iris_Nebula_NGC_7023.jpg/' +
         '1280px-Iris_Nebula_NGC_7023.jpg',
    source: 'Northrim via Wikimedia',
  },

  // === IC OBJECTS ===
  'IC434': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Barnard_33.jpg/' +
         '1280px-Barnard_33.jpg',
    source: 'Ken Crawford via Wikimedia',
  },
  'IC1396': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/IC_1396A_Elephant_Trunk_Nebula_%28noao1507a%29.jpg/' +
         '1280px-IC_1396A_Elephant_Trunk_Nebula_%28noao1507a%29.jpg',
    source: 'T.A. Rector/NOIRLab via Wikimedia',
  },
  'IC2118': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Witch_Head_Nebula_%28witchhead-ch17-bardon-cc%29.jpg/' +
         '1280px-Witch_Head_Nebula_%28witchhead-ch17-bardon-cc%29.jpg',
    source: 'Zdeněk Bardon/ESO via Wikimedia',
  },

  // No image available (prevents Wikipedia lookup attempts)
  'IC4665': {url: null, source: 'none'},
};

/**
 * Catalog prefixes and the shapes that resolve to them.
 * @const {!Array<!Array>}
 */
const CATALOG_PATTERNS = [
  ['M', /^M\s*0*(\d+)$/i],
  ['NGC', /^NGC\s*0*(\d+)$/i],
  ['IC', /^IC\s*0*(\d+)$/i],
];

/**
 * Parse an M/NGC/IC designation, tolerating a separating space and leading
 * zeros ('M 31', 'NGC0869'). Anchored at both ends: a name that merely
 * contains a designation ('Cr399M31') is not one.
 * @param {?string} name
 * @returns {?{prefix: string, number: number}} e.g. {prefix: 'NGC', number: 869}
 */
export const parseCatalogDesignation = (name) => {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  for (const [prefix, pattern] of CATALOG_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) return {prefix, number: parseInt(match[1], 10)};
  }
  return null;
};

/**
 * Canonical catalog designation for a deep sky object.
 *
 * The pipeline emits OpenNGC's zero-padded names ('NGC0869', 'IC0010') for
 * 141 of the 1,772 objects, and emits `messier` as a float. Callers used to
 * each derive a name inline, several of them reading `dso.ngc`/`dso.ic`
 * fields that no record has ever carried, so the padded name fell through to
 * the UI and to the image cache — where it misses NASA's 'NGC 869' titles and
 * fails to dedupe against the normalized key the sprite path uses.
 *
 * Messier wins when present, since that is the name people recognise.
 *
 * @param {?Object} dso - Deep sky object record from the pipeline
 * @returns {string} Canonical designation, or 'Unknown Object'
 */
export const catalogDesignation = (dso) => {
  if (!dso) return 'Unknown Object';

  if (dso.messier !== null && dso.messier !== undefined && dso.messier !== '') {
    const messier = Math.floor(Number(dso.messier));
    if (Number.isFinite(messier)) return `M${messier}`;
  }

  const name = typeof dso.name === 'string' ? dso.name.trim() : '';
  if (!name) return 'Unknown Object';

  const parsed = parseCatalogDesignation(name);
  return parsed ? `${parsed.prefix}${parsed.number}` : name;
};

/**
 * Get curated image URL for an object.
 * @param {string} objectName - Name of the object (e.g., 'M31', 'NGC7293')
 * @returns {?{url: ?string, source: string}} Image info or null if not found
 */
export const getCuratedImage = (objectName) => {
  if (!objectName) return null;

  const trimmed = objectName.trim();

  // Direct match
  if (CURATED_IMAGES[trimmed]) {
    return CURATED_IMAGES[trimmed];
  }

  // Catalog designations, tolerating a separating space and leading zeros:
  // 'M 31' and 'NGC0869' resolve to 'M31' and 'NGC869'.
  //
  // Anchored at both ends. An unanchored /M(\d+)/ matches the designation
  // anywhere in the string, so a name that merely contains one — 'Cr399M31',
  // or anything VizieR returns for a dynamically loaded object — would take
  // another object's photograph.
  for (const [prefix, pattern] of CATALOG_PATTERNS) {
    const match = trimmed.match(pattern);
    if (!match) continue;
    const entry = CURATED_IMAGES[`${prefix}${parseInt(match[1], 10)}`];
    if (entry) return entry;
  }

  return null;
};

/**
 * Get all curated image keys.
 * @returns {!Array<string>} Array of object names with curated images
 */
export const getCuratedImageKeys = () => {
  return Object.keys(CURATED_IMAGES);
};
