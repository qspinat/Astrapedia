/**
 * @fileoverview Data loading service with error handling, timeout, and retry.
 * Provides a centralized way to load JSON data files and handle API responses.
 */

import {globalEventBus, Events} from '../core/EventBus.js';

/**
 * Default configuration for data loading.
 * @const {!Object}
 */
const DEFAULT_CONFIG = {
  /** Default timeout in milliseconds. */
  timeout: 30000,
  /** Number of retry attempts on failure. */
  retries: 2,
  /** Delay between retries in milliseconds. */
  retryDelay: 1000,
  /** Whether to cache successful responses. */
  enableCache: true,
};

/**
 * DataLoader provides centralized data fetching with error handling.
 */
export class DataLoader {
  /**
   * Creates a new DataLoader instance.
   * @param {Object=} config - Optional configuration overrides
   */
  constructor(config = {}) {
    /** @private @const {!Object} */
    this.config_ = {...DEFAULT_CONFIG, ...config};

    /** @private {!Map<string, *>} */
    this.cache_ = new Map();

    /** @private {!Map<string, !Promise<*>>} */
    this.pendingRequests_ = new Map();
  }

  /**
   * Fetch JSON data from a URL with timeout and retry support.
   * @param {string} url - URL to fetch
   * @param {Object=} options - Optional fetch options
   * @param {number=} options.timeout - Request timeout in ms
   * @param {number=} options.retries - Number of retry attempts
   * @param {boolean=} options.useCache - Whether to use cached response
   * @returns {!Promise<*>} Parsed JSON data
   * @throws {Error} If fetch fails after all retries
   */
  async fetchJson(url, options = {}) {
    const timeout = options.timeout ?? this.config_.timeout;
    const retries = options.retries ?? this.config_.retries;
    const useCache = options.useCache ?? this.config_.enableCache;

    // Return cached response if available
    if (useCache && this.cache_.has(url)) {
      return this.cache_.get(url);
    }

    // Return pending request if one exists (deduplication)
    if (this.pendingRequests_.has(url)) {
      return this.pendingRequests_.get(url);
    }

    // Create the fetch promise with retry logic
    const fetchPromise = this.fetchWithRetry_(url, timeout, retries);

    // Store as pending request
    this.pendingRequests_.set(url, fetchPromise);

    try {
      const data = await fetchPromise;

      // Cache successful response
      if (useCache) {
        this.cache_.set(url, data);
      }

      return data;
    } finally {
      // Remove from pending requests
      this.pendingRequests_.delete(url);
    }
  }

  /**
   * Fetch with timeout wrapper.
   * @param {string} url - URL to fetch
   * @param {number} timeout - Timeout in milliseconds
   * @param {!RequestInit=} fetchOptions - Fetch options
   * @returns {!Promise<!Response>} Fetch response
   * @throws {Error} If request times out or fails
   * @private
   */
  async fetchWithTimeout_(url, timeout, fetchOptions = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return response;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms: ${url}`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Fetch with retry logic.
   * @param {string} url - URL to fetch
   * @param {number} timeout - Timeout per request in milliseconds
   * @param {number} retries - Number of retry attempts remaining
   * @returns {!Promise<*>} Parsed JSON data
   * @throws {Error} If all retries fail
   * @private
   */
  async fetchWithRetry_(url, timeout, retries) {
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await this.fetchWithTimeout_(url, timeout);
        return await response.json();
      } catch (error) {
        lastError = error;
        console.warn(
          `Fetch attempt ${attempt + 1}/${retries + 1} failed for ${url}:`,
          error.message
        );

        if (attempt < retries) {
          // Wait before retrying (exponential backoff)
          const delay = this.config_.retryDelay * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  /**
   * Load a local data file from the data directory.
   * @param {string} filename - Name of the file (e.g., 'stars_bright.json')
   * @param {Object=} options - Optional fetch options
   * @returns {!Promise<*>} Parsed JSON data
   */
  async loadDataFile(filename, options = {}) {
    const url = `data/${filename}`;
    return this.fetchJson(url, options);
  }

  /**
   * Load multiple data files in parallel.
   * @param {!Array<string>} filenames - Array of filenames to load
   * @param {Object=} options - Optional fetch options
   * @returns {!Promise<!Object<string, *>>} Object mapping filenames to data
   */
  async loadDataFiles(filenames, options = {}) {
    const results = {};
    const promises = filenames.map(async (filename) => {
      try {
        results[filename] = await this.loadDataFile(filename, options);
      } catch (error) {
        console.error(`Failed to load ${filename}:`, error);
        results[filename] = null;
      }
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * Load all standard sky map data files.
   * @param {string=} starFile - Star file to use (default: 'stars_medium.json')
   * @returns {!Promise<!Object>} Object with stars, constellations, dsos, namedObjects
   */
  async loadSkyMapData(starFile = 'stars_medium.json') {
    globalEventBus.emit(Events.DATA_LOADED, {status: 'loading'});

    try {
      const [stars, constellations, dsos, namedObjects] = await Promise.all([
        this.loadDataFile(starFile),
        this.loadDataFile('constellations.json'),
        this.loadDataFile('deep_sky_objects.json'),
        this.loadDataFile('named_objects.json'),
      ]);

      const data = {
        stars: stars || [],
        constellations: constellations || {},
        deepSkyObjects: dsos || [],
        namedObjects: namedObjects || {},
      };

      globalEventBus.emit(Events.DATA_LOADED, {
        status: 'success',
        data,
      });

      return data;
    } catch (error) {
      globalEventBus.emit(Events.DATA_ERROR, {error});
      throw error;
    }
  }

  /**
   * Make a POST request and get JSON response.
   * @param {string} url - URL to post to
   * @param {!Object|string} body - Request body
   * @param {Object=} options - Optional fetch options
   * @returns {!Promise<*>} Parsed JSON response
   */
  async postJson(url, body, options = {}) {
    const timeout = options.timeout ?? this.config_.timeout;

    const fetchOptions = {
      method: 'POST',
      headers: {
        'Content-Type': options.contentType || 'application/json',
        ...options.headers,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    };

    const response = await this.fetchWithTimeout_(url, timeout, fetchOptions);
    return response.json();
  }

  /**
   * Make a POST request with form-encoded data.
   * @param {string} url - URL to post to
   * @param {!Object<string, string>} params - Form parameters
   * @param {Object=} options - Optional fetch options
   * @returns {!Promise<*>} Parsed JSON response
   */
  async postForm(url, params, options = {}) {
    const timeout = options.timeout ?? this.config_.timeout;

    const fetchOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...options.headers,
      },
      body: new URLSearchParams(params),
    };

    const response = await this.fetchWithTimeout_(url, timeout, fetchOptions);
    return response.json();
  }

  /**
   * Fetch text content from a URL.
   * @param {string} url - URL to fetch
   * @param {Object=} options - Optional fetch options
   * @returns {!Promise<string>} Response text
   */
  async fetchText(url, options = {}) {
    const timeout = options.timeout ?? this.config_.timeout;
    const response = await this.fetchWithTimeout_(url, timeout);
    return response.text();
  }

  /**
   * Clear the response cache.
   * @param {string=} url - Optional specific URL to clear, or all if not provided
   */
  clearCache(url) {
    if (url) {
      this.cache_.delete(url);
    } else {
      this.cache_.clear();
    }
  }

  /**
   * Check if a URL is cached.
   * @param {string} url - URL to check
   * @returns {boolean} True if cached
   */
  isCached(url) {
    return this.cache_.has(url);
  }

  /**
   * Get cache size.
   * @returns {number} Number of cached items
   */
  getCacheSize() {
    return this.cache_.size;
  }
}

/**
 * Singleton instance for application-wide data loading.
 * @const {!DataLoader}
 */
export const dataLoader = new DataLoader();
