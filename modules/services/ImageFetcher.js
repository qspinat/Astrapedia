/**
 * @fileoverview Multi-source image fetching service for celestial objects.
 * Fetches images from NASA, Wikimedia, ESA, and DSS with quality prioritization.
 */

import {globalEventBus, Events} from '../core/EventBus.js';
import {IMAGES, API_ENDPOINTS} from '../core/Constants.js';
import {getCuratedImage} from '../data/CuratedImages.js';
import {getPlanetImageInfo} from '../data/PlanetImages.js';
import {createLogger} from '../core/Logger.js';

const logger = createLogger('ImageFetcher');

/**
 * @typedef {{
 *   url: ?string,
 *   source: ?string,
 *   tier: ?string,
 *   loading: boolean
 * }}
 */
let ImageResult;

/**
 * Famous stars that should use API search instead of DSS.
 * @const {!Array<string>}
 */
const FAMOUS_STARS = [
  'Sirius', 'Betelgeuse', 'Rigel', 'Vega', 'Arcturus', 'Capella',
  'Aldebaran', 'Antares', 'Polaris', 'Deneb', 'Altair', 'Procyon',
  'Canopus', 'Achernar', 'Fomalhaut', 'Regulus', 'Pollux', 'Castor',
];

/**
 * Deep sky object types for API search prioritization.
 * @const {!Array<string>}
 */
const DSO_TYPES = ['G', 'Neb', 'PN', 'EmN', 'HII', 'Cl+N', 'RfN', 'SNR', 'GCl', 'OCl'];

/**
 * Type-specific search terms for Wikimedia queries.
 * @const {!Object<string, string>}
 */
const TYPE_SEARCH_TERMS = {
  G: 'galaxy',
  Neb: 'nebula',
  PN: 'planetary nebula',
  EmN: 'emission nebula',
  HII: 'nebula',
  'Cl+N': 'cluster nebula',
  RfN: 'reflection nebula',
  SNR: 'supernova remnant',
  GCl: 'globular cluster',
  OCl: 'open cluster',
};

/**
 * ImageFetcher provides multi-source image loading with caching.
 */
export class ImageFetcher {
  /**
   * Creates a new ImageFetcher instance.
   * @param {Object=} config - Optional configuration
   */
  constructor(config = {}) {
    /** @private @const {number} */
    this.maxCacheSize_ = config.maxCacheSize || IMAGES.MAX_CACHE_SIZE;

    /** @private @const {number} */
    this.fetchTimeout_ = config.fetchTimeout || IMAGES.FETCH_TIMEOUT;

    /** @private {!Map<string, !ImageResult>} */
    this.cache_ = new Map();

    /** @private {!Set<string>} */
    this.loadingKeys_ = new Set();
  }

  /**
   * Fetch the best available image for an object.
   * Tries sources in quality order: Curated > NASA > Wikimedia > DSS.
   * @param {string} objectName - Name of the object
   * @param {number=} ra - Right Ascension in degrees
   * @param {number=} dec - Declination in degrees
   * @param {string=} type - Object type
   * @param {number=} angularSizeArcmin - Angular size in arcminutes
   * @returns {!Promise<?ImageResult>} Image result or null
   */
  async fetchBestImage(objectName, ra, dec, type, angularSizeArcmin = null) {
    const normalizedName = objectName?.trim();
    const cacheKey = this.getCacheKey_(normalizedName, ra, dec);

    // Check for curated image first (always takes priority)
    const curatedResult = this.checkCuratedImage_(normalizedName, cacheKey);
    if (curatedResult) {
      return curatedResult.skipToFallback ? null : curatedResult;
    }

    // Check cache
    if (this.cache_.has(cacheKey)) {
      const cached = this.cache_.get(cacheKey);
      if (!cached.loading) {
        return cached;
      }
      return null; // Still loading
    }

    // Prevent duplicate requests
    if (this.loadingKeys_.has(cacheKey)) {
      return null;
    }

    // Check for special objects (planets)
    const specialResult = this.checkSpecialObject_(normalizedName, cacheKey);
    if (specialResult) {
      return specialResult;
    }

    // Enforce cache size limit
    this.enforceCacheLimit_();

    // Mark as loading
    this.loadingKeys_.add(cacheKey);
    this.cache_.set(cacheKey, {url: null, loading: true, source: null, tier: null});

    // Determine search strategy
    const isCatalogObject = /^(IC|NGC|M)\d+$/i.test(normalizedName);
    const isDeepSkyObject = type && DSO_TYPES.includes(type);
    const isStar = type === 'Star' || type === '*' || (!type && !isCatalogObject);
    const isFamousStar = isStar && normalizedName &&
        FAMOUS_STARS.some((s) => normalizedName.toLowerCase().includes(s.toLowerCase()));
    const skipApiSearch = isStar && !isFamousStar;

    try {
      // Try NASA Images API first (for non-stars)
      if (normalizedName && !skipApiSearch) {
        const nasaResult = await this.fetchFromNasa_(
          normalizedName, isDeepSkyObject, isCatalogObject
        );
        if (nasaResult) {
          this.cacheResult_(cacheKey, nasaResult);
          return nasaResult;
        }
      }

      // Try Wikimedia Commons
      if (normalizedName && !skipApiSearch) {
        const wikiResult = await this.fetchFromWikimedia_(
          normalizedName, type, isDeepSkyObject
        );
        if (wikiResult) {
          this.cacheResult_(cacheKey, wikiResult);
          return wikiResult;
        }
      }

      // Fall back to DSS (for objects with coordinates)
      if (ra !== undefined && dec !== undefined && !isStar) {
        const dssUrl = this.getDSSUrl_(ra, dec, type, angularSizeArcmin);
        const result = {url: dssUrl, loading: false, source: 'DSS', tier: 'vintage'};
        this.cacheResult_(cacheKey, result);
        return result;
      }

      // No image available
      const result = {url: null, loading: false, source: null, tier: null};
      this.cacheResult_(cacheKey, result);
      return result;
    } finally {
      this.loadingKeys_.delete(cacheKey);
    }
  }

  /**
   * Get cache key for an object.
   * @param {?string} name - Object name
   * @param {number=} ra - Right Ascension
   * @param {number=} dec - Declination
   * @returns {string} Cache key
   * @private
   */
  getCacheKey_(name, ra, dec) {
    if (name) return name;
    if (ra !== undefined && dec !== undefined) {
      return `${ra.toFixed(3)}_${dec.toFixed(3)}`;
    }
    return 'unknown';
  }

  /**
   * Check for curated image.
   * @param {?string} name - Object name
   * @param {string} cacheKey - Cache key
   * @returns {?ImageResult|{skipToFallback: boolean}} Result or skip flag
   * @private
   */
  checkCuratedImage_(name, cacheKey) {
    const curatedImage = getCuratedImage(name);
    if (!curatedImage) return null;

    const url = typeof curatedImage === 'string' ? curatedImage : curatedImage.url;

    // Object marked as "no higher-tier image available"
    if (url === null) {
      return {skipToFallback: true};
    }

    const source = typeof curatedImage === 'string'
      ? 'Curated'
      : (curatedImage.source || 'Curated');
    const tier = typeof curatedImage === 'string'
      ? 'high'
      : (curatedImage.tier || 'high');

    const result = {url, loading: false, source, tier};
    this.cache_.set(cacheKey, result);
    return result;
  }

  /**
   * Check for special object (planet) image.
   * @param {?string} name - Object name
   * @param {string} cacheKey - Cache key
   * @returns {?ImageResult} Result or null
   * @private
   */
  checkSpecialObject_(name, cacheKey) {
    const special = name ? getPlanetImageInfo(name) : null;
    if (!special) return null;

    const result = {
      url: special.url,
      loading: false,
      source: special.source,
      tier: special.tier,
    };
    this.cache_.set(cacheKey, result);
    return result;
  }

  /**
   * Fetch image from NASA Images API.
   * @param {string} objectName - Object name
   * @param {boolean} isDeepSkyObject - Whether object is a DSO
   * @param {boolean} isCatalogObject - Whether object is a catalog object
   * @returns {!Promise<?ImageResult>} Result or null
   * @private
   */
  async fetchFromNasa_(objectName, isDeepSkyObject, isCatalogObject) {
    try {
      // Format search name
      let searchName = objectName;
      if (/^M\d+$/.test(objectName)) {
        searchName = objectName.replace(/^M(\d+)$/, 'messier $1');
      } else {
        searchName = objectName.replace(/([A-Za-z]+)(\d+)/, '$1 $2').trim();
      }

      const nasaSearchTerm = isDeepSkyObject
        ? `${searchName} astronomy`
        : searchName;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.fetchTimeout_);

      const response = await fetch(
        `${API_ENDPOINTS.NASA_IMAGES}?q=${encodeURIComponent(nasaSearchTerm)}` +
        '&media_type=image',
        {signal: controller.signal}
      );
      clearTimeout(timeoutId);

      if (!response.ok) return null;

      const data = await response.json();
      if (!data.collection?.items?.length) return null;

      // Look for Webb or Hubble images first
      for (const item of data.collection.items) {
        if (!this.checkNasaRelevance_(item, objectName)) continue;

        const desc = (item.data?.[0]?.description || '').toLowerCase();
        const title = (item.data?.[0]?.title || '').toLowerCase();
        const isWebb = desc.includes('webb') || title.includes('webb') ||
                       desc.includes('jwst');
        const isHubble = desc.includes('hubble') || title.includes('hubble') ||
                         desc.includes('hst');

        const previewLink = item.links?.find((link) => link.rel === 'preview');
        if (previewLink?.href && (isWebb || isHubble)) {
          const tier = isWebb ? 'Webb' : 'Hubble';
          return {
            url: previewLink.href,
            loading: false,
            source: `NASA/${tier}`,
            tier: 'iconic',
          };
        }
      }

      // Fall back to any relevant NASA image
      for (const item of data.collection.items) {
        if (!this.checkNasaRelevance_(item, objectName)) continue;

        const previewLink = item.links?.find((link) => link.rel === 'preview');
        if (previewLink?.href) {
          return {
            url: previewLink.href,
            loading: false,
            source: 'NASA',
            tier: 'high',
          };
        }
      }

      // Last resort for catalog objects: use first result
      if (isCatalogObject && data.collection.items.length > 0) {
        const previewLink = data.collection.items[0].links?.find(
          (link) => link.rel === 'preview'
        );
        if (previewLink?.href) {
          return {
            url: previewLink.href,
            loading: false,
            source: 'NASA',
            tier: 'high',
          };
        }
      }

      return null;
    } catch (error) {
      if (error.name !== 'AbortError') {
        logger.warn(`NASA API failed for ${objectName}:`, error.message);
      }
      return null;
    }
  }

  /**
   * Check if NASA result is relevant to the object.
   * @param {!Object} item - NASA API item
   * @param {string} objectName - Object name to match
   * @returns {boolean} True if relevant
   * @private
   */
  checkNasaRelevance_(item, objectName) {
    const title = (item.data?.[0]?.title || '').toLowerCase();
    const desc = (item.data?.[0]?.description || '').toLowerCase();
    const keywords = (item.data?.[0]?.keywords || []).join(' ').toLowerCase();

    // Check for catalog number variations
    const catalogMatch = objectName.match(/^(IC|NGC|M)(\d+)$/i);
    if (catalogMatch) {
      const prefix = catalogMatch[1].toLowerCase();
      const number = catalogMatch[2];
      const patterns = [`${prefix}${number}`, `${prefix} ${number}`, `${prefix}-${number}`];

      for (const pattern of patterns) {
        if (title.includes(pattern) || desc.includes(pattern) ||
            keywords.includes(pattern)) {
          return true;
        }
      }
    }

    // General match
    const searchLower = objectName.toLowerCase().replace(/\s+/g, '');
    const titleNoSpace = title.replace(/\s+/g, '');
    const descNoSpace = desc.replace(/\s+/g, '');

    return titleNoSpace.includes(searchLower) ||
           descNoSpace.includes(searchLower) ||
           keywords.includes(objectName.toLowerCase());
  }

  /**
   * Fetch image from Wikimedia Commons.
   * @param {string} objectName - Object name
   * @param {?string} type - Object type
   * @param {boolean} isDeepSkyObject - Whether object is a DSO
   * @returns {!Promise<?ImageResult>} Result or null
   * @private
   */
  async fetchFromWikimedia_(objectName, type, isDeepSkyObject) {
    try {
      const wikiSearchName = objectName.replace(/([A-Za-z]+)(\d+)/, '$1 $2').trim();

      // Build search query based on object type
      let wikiSearchQuery = wikiSearchName;
      if (isDeepSkyObject && type && TYPE_SEARCH_TERMS[type]) {
        wikiSearchQuery = `${wikiSearchName} ${TYPE_SEARCH_TERMS[type]} astronomy`;
      } else {
        wikiSearchQuery = `${wikiSearchName} astronomy space`;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.fetchTimeout_);

      const response = await fetch(
        `${API_ENDPOINTS.WIKIMEDIA}?action=query&generator=search` +
        `&gsrsearch=${encodeURIComponent(wikiSearchQuery)}&gsrlimit=10` +
        '&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=400' +
        '&format=json&origin=*',
        {signal: controller.signal}
      );
      clearTimeout(timeoutId);

      if (!response.ok) return null;

      const data = await response.json();
      if (!data.query?.pages) return null;

      const pages = Object.values(data.query.pages).sort(
        (a, b) => (a.index || 0) - (b.index || 0)
      );

      const maxOriginalSize = 20 * 1024 * 1024; // 20MB

      // Look for official observatory images first
      for (const page of pages) {
        const result = this.processWikiPage_(page, objectName, maxOriginalSize, true);
        if (result) return result;
      }

      // Fall back to any relevant image
      for (const page of pages) {
        const result = this.processWikiPage_(page, objectName, maxOriginalSize, false);
        if (result) return result;
      }

      return null;
    } catch (error) {
      if (error.name !== 'AbortError') {
        logger.warn(`Wikimedia API failed for ${objectName}:`, error.message);
      }
      return null;
    }
  }

  /**
   * Process a Wikimedia page result.
   * @param {!Object} page - Wikimedia page object
   * @param {string} objectName - Object name to match
   * @param {number} maxSize - Maximum file size
   * @param {boolean} officialOnly - Only accept official sources
   * @returns {?ImageResult} Result or null
   * @private
   */
  processWikiPage_(page, objectName, maxSize, officialOnly) {
    const imageInfo = page.imageinfo?.[0];
    const thumbUrl = imageInfo?.thumburl;
    const originalSize = imageInfo?.size || 0;
    const metadata = imageInfo?.extmetadata;
    const artist = metadata?.Artist?.value || '';
    const pageTitle = page.title || '';

    if (!this.checkWikiRelevance_(pageTitle, objectName)) return null;
    if (originalSize > maxSize) return null;
    if (!thumbUrl || thumbUrl.includes('.svg') ||
        thumbUrl.includes('Map') || thumbUrl.includes('map')) {
      return null;
    }

    const isSubaru = artist.includes('Subaru') || artist.includes('NAOJ') ||
                     artist.includes('National Astronomical Observatory of Japan');
    const isOfficial = artist.includes('ESO') || artist.includes('ESA') ||
                       artist.includes('NASA') || artist.includes('Hubble') ||
                       isSubaru;

    if (officialOnly && !isOfficial) return null;

    const source = isOfficial
      ? (isSubaru ? 'Wikimedia/Subaru' : 'Wikimedia/ESO')
      : 'Wikimedia';
    const tier = isOfficial ? 'high' : 'medium';

    return {url: thumbUrl, loading: false, source, tier};
  }

  /**
   * Check if Wikimedia page is relevant to the object.
   * @param {string} pageTitle - Page title
   * @param {string} objectName - Object name to match
   * @returns {boolean} True if relevant
   * @private
   */
  checkWikiRelevance_(pageTitle, objectName) {
    const titleLower = pageTitle.toLowerCase();

    // Check for catalog number variations
    const catalogMatch = objectName.match(/^(IC|NGC|M)(\d+)$/i);
    if (catalogMatch) {
      const prefix = catalogMatch[1].toLowerCase();
      const number = catalogMatch[2];
      const patterns = [
        `${prefix}${number}`, `${prefix} ${number}`,
        `${prefix}-${number}`, `${prefix}_${number}`,
      ];

      for (const pattern of patterns) {
        if (titleLower.includes(pattern)) return true;
      }
    }

    // General match
    const searchLower = objectName.toLowerCase().replace(/\s+/g, '');
    const titleNoSpace = titleLower.replace(/\s+/g, '');
    return titleNoSpace.includes(searchLower);
  }

  /**
   * Get DSS (Digitized Sky Survey) URL via CDS HiPS.
   * @param {number} ra - Right Ascension in degrees
   * @param {number} dec - Declination in degrees
   * @param {?string} type - Object type
   * @param {?number} angularSizeArcmin - Angular size in arcminutes
   * @returns {string} DSS image URL
   * @private
   */
  getDSSUrl_(ra, dec, type, angularSizeArcmin) {
    // Calculate field of view based on object size
    let fov = 0.3; // Default 18 arcmin
    if (angularSizeArcmin) {
      fov = Math.max(0.1, Math.min(2.0, angularSizeArcmin * 3 / 60));
    } else if (type === 'G') {
      fov = 0.25; // Galaxies
    } else if (type === 'GCl' || type === 'OCl') {
      fov = 0.5; // Clusters
    }

    return `${API_ENDPOINTS.CDS_HIPS}?hips=DSS2/color&ra=${ra}&dec=${dec}` +
           `&fov=${fov}&width=400&height=400`;
  }

  /**
   * Cache an image result.
   * @param {string} key - Cache key
   * @param {!ImageResult} result - Result to cache
   * @private
   */
  cacheResult_(key, result) {
    this.cache_.set(key, result);
    globalEventBus.emit(Events.IMAGE_LOADED, {key, result});
  }

  /**
   * Enforce cache size limit using LRU eviction.
   * @private
   */
  enforceCacheLimit_() {
    if (this.cache_.size <= this.maxCacheSize_) return;

    // Remove oldest entries (first inserted)
    const keysToRemove = Array.from(this.cache_.keys()).slice(
      0, Math.floor(this.maxCacheSize_ * 0.25)
    );
    keysToRemove.forEach((key) => this.cache_.delete(key));
  }

  /**
   * Get cached image if available.
   * @param {string} objectName - Object name
   * @param {number=} ra - Right Ascension
   * @param {number=} dec - Declination
   * @returns {?ImageResult} Cached result or null
   */
  getCached(objectName, ra, dec) {
    const key = this.getCacheKey_(objectName, ra, dec);
    return this.cache_.get(key) || null;
  }

  /**
   * Check if an image is currently loading.
   * @param {string} objectName - Object name
   * @param {number=} ra - Right Ascension
   * @param {number=} dec - Declination
   * @returns {boolean} True if loading
   */
  isLoading(objectName, ra, dec) {
    const key = this.getCacheKey_(objectName, ra, dec);
    return this.loadingKeys_.has(key);
  }

  /**
   * Clear the image cache.
   */
  clearCache() {
    this.cache_.clear();
    this.loadingKeys_.clear();
  }

  /**
   * Get cache statistics.
   * @returns {{size: number, loading: number}} Cache stats
   */
  getStats() {
    return {
      size: this.cache_.size,
      loading: this.loadingKeys_.size,
    };
  }
}

/**
 * Singleton instance for application-wide image fetching.
 * @const {!ImageFetcher}
 */
export const imageFetcher = new ImageFetcher();
