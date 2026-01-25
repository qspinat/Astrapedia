/**
 * @fileoverview Search manager for celestial object search.
 * Builds and queries a search index for stars, DSOs, and constellations.
 */

import {globalEventBus, Events} from '../core/EventBus.js';

/**
 * @typedef {{
 *   name: string,
 *   type: string,
 *   ra: number,
 *   dec: number,
 *   mag: ?number,
 *   isAlias: boolean,
 *   data: !Object
 * }}
 */
let SearchEntry;

/**
 * @typedef {{
 *   name: string,
 *   type: string,
 *   ra: number,
 *   dec: number,
 *   mag: ?number,
 *   score: number
 * }}
 */
let SearchResult;

/**
 * SearchManager builds and queries a search index for celestial objects.
 */
export class SearchManager {
  /**
   * Creates a new SearchManager instance.
   */
  constructor() {
    /**
     * Search index entries.
     * @private {!Array<!SearchEntry>}
     */
    this.index_ = [];

    /**
     * Whether index has been built.
     * @private {boolean}
     */
    this.built_ = false;

    /**
     * Map for O(1) star lookup by HIP number.
     * @private {!Map<number, !Object>}
     */
    this.starByHip_ = new Map();

    /**
     * Map for O(1) star lookup by ID.
     * @private {!Map<string|number, !Object>}
     */
    this.starById_ = new Map();

    /**
     * Set for O(1) duplicate name checking during index building.
     * @private {!Set<string>}
     */
    this.indexedNames_ = new Set();
  }

  /**
   * Build the search index from data.
   * @param {!Object} data - Object containing stars, dsos, constellations, etc.
   */
  buildIndex(data) {
    const {stars, deepSkyObjects, constellations, namedObjects, planets} = data;

    this.index_ = [];
    this.starByHip_.clear();
    this.starById_.clear();
    this.indexedNames_.clear();

    // Build lookup maps for O(1) star access (instead of O(n) Array.find)
    if (stars) {
      stars.forEach((star) => {
        if (star.hip) this.starByHip_.set(star.hip, star);
        if (star.id) this.starById_.set(star.id, star);
      });
    }

    // Add named stars
    if (stars && namedObjects) {
      Object.entries(namedObjects).forEach(([name, starId]) => {
        // Use Map lookup for O(1) access instead of Array.find
        const star = this.starByHip_.get(starId) || this.starById_.get(starId);
        if (star) {
          this.index_.push({
            name,
            type: 'Star',
            ra: star.ra,
            dec: star.dec,
            mag: star.mag,
            isAlias: false,
            data: star,
          });
          this.indexedNames_.add(name);
        }
      });

      // Add stars with proper names directly
      stars.forEach((star) => {
        // Use Set for O(1) duplicate checking instead of Array.find
        if (star.proper && !this.indexedNames_.has(star.proper)) {
          this.index_.push({
            name: star.proper,
            type: 'Star',
            ra: star.ra,
            dec: star.dec,
            mag: star.mag,
            isAlias: false,
            data: star,
          });
          this.indexedNames_.add(star.proper);
        }
      });
    }

    // Add deep sky objects
    if (deepSkyObjects) {
      deepSkyObjects.forEach((dso) => {
        // Primary name (Messier or common name)
        const primaryName = dso.messier ? `M${dso.messier}` : dso.name;
        if (primaryName) {
          this.index_.push({
            name: primaryName,
            type: dso.type || 'DSO',
            ra: dso.ra,
            dec: dso.dec,
            mag: dso.mag,
            isAlias: false,
            data: dso,
          });
        }

        // NGC alias
        if (dso.ngc && primaryName !== `NGC${dso.ngc}`) {
          this.index_.push({
            name: `NGC${dso.ngc}`,
            type: dso.type || 'DSO',
            ra: dso.ra,
            dec: dso.dec,
            mag: dso.mag,
            isAlias: true,
            data: dso,
          });
        }

        // IC alias
        if (dso.ic) {
          this.index_.push({
            name: `IC${dso.ic}`,
            type: dso.type || 'DSO',
            ra: dso.ra,
            dec: dso.dec,
            mag: dso.mag,
            isAlias: true,
            data: dso,
          });
        }

        // Common name alias - handle both string and array formats
        if (dso.common_names) {
          const names = Array.isArray(dso.common_names)
            ? dso.common_names
            : dso.common_names.split(',').map((n) => n.trim()).filter(Boolean);
          names.forEach((commonName) => {
            if (commonName !== primaryName) {
              this.index_.push({
                name: commonName,
                type: dso.type || 'DSO',
                ra: dso.ra,
                dec: dso.dec,
                mag: dso.mag,
                isAlias: true,
                data: dso,
              });
            }
          });
        }
      });
    }

    // Add constellations
    if (constellations) {
      Object.entries(constellations).forEach(([name, data]) => {
        this.index_.push({
          name,
          type: 'Constellation',
          ra: data.ra || 0,
          dec: data.dec || 0,
          mag: null,
          isAlias: false,
          data,
        });
      });
    }

    // Add planets
    if (planets) {
      planets.forEach((planet) => {
        this.index_.push({
          name: planet.name,
          type: 'Planet',
          ra: planet.ra,
          dec: planet.dec,
          mag: planet.mag,
          isAlias: false,
          data: planet,
        });
      });
    }

    this.built_ = true;
    console.log(`✓ Built search index with ${this.index_.length} entries`);
  }

  /**
   * Check if index has been built.
   * @returns {boolean} True if index is built
   */
  isBuilt() {
    return this.built_;
  }

  /**
   * Get index size.
   * @returns {number} Number of entries in index
   */
  getSize() {
    return this.index_.length;
  }

  /**
   * Perform a search query.
   * @param {string} query - Search query
   * @param {number=} limit - Maximum results (default 12)
   * @returns {!Array<!SearchResult>} Search results sorted by relevance
   */
  search(query, limit = 12) {
    if (!query || query.length < 2) return [];

    const lowerQuery = query.toLowerCase();

    const results = this.index_
      .map((entry) => {
        const nameLower = entry.name.toLowerCase();
        let score = 0;

        // Exact match gets highest score
        if (nameLower === lowerQuery) {
          score = 1000;
        } else if (nameLower.startsWith(lowerQuery)) {
          // Starts with query
          score = 500;
        } else if (nameLower.includes(lowerQuery)) {
          // Contains query
          score = 100;
        }

        // Penalize aliases
        if (entry.isAlias) {
          score -= 10;
        }

        // Boost by brightness
        if (entry.mag !== null && entry.mag !== undefined) {
          score += (10 - entry.mag) * 5;
        }

        // Boost planets and constellations
        if (entry.type === 'Planet') score += 50;
        if (entry.type === 'Constellation') score += 30;

        return {
          name: entry.name,
          type: entry.type,
          ra: entry.ra,
          dec: entry.dec,
          mag: entry.mag,
          score,
          data: entry.data,
        };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    globalEventBus.emit(Events.SEARCH_RESULTS, {
      query,
      results,
      count: results.length,
    });

    return results;
  }

  /**
   * Find an object by exact name.
   * @param {string} name - Object name
   * @returns {?SearchEntry} Entry or null if not found
   */
  findByName(name) {
    return this.index_.find(
      (e) => e.name.toLowerCase() === name.toLowerCase()
    ) || null;
  }

  /**
   * Find objects by type.
   * @param {string} type - Object type
   * @returns {!Array<!SearchEntry>} Matching entries
   */
  findByType(type) {
    return this.index_.filter((e) => e.type === type);
  }

  /**
   * Find objects near a position.
   * @param {number} ra - Right Ascension in degrees
   * @param {number} dec - Declination in degrees
   * @param {number} radius - Search radius in degrees
   * @returns {!Array<!SearchEntry>} Matching entries
   */
  findNear(ra, dec, radius) {
    return this.index_.filter((entry) => {
      const distance = this.angularDistance_(ra, dec, entry.ra, entry.dec);
      return distance <= radius;
    });
  }

  /**
   * Get brightest objects of a type.
   * @param {string} type - Object type
   * @param {number=} limit - Maximum results
   * @returns {!Array<!SearchEntry>} Brightest entries
   */
  getBrightestByType(type, limit = 10) {
    return this.index_
      .filter((e) => e.type === type && e.mag !== null)
      .sort((a, b) => (a.mag || 99) - (b.mag || 99))
      .slice(0, limit);
  }

  /**
   * Get all Messier objects.
   * @returns {!Array<!SearchEntry>} Messier entries sorted by number
   */
  getMessierObjects() {
    return this.index_
      .filter((e) => /^M\d+$/i.test(e.name))
      .sort((a, b) => {
        const numA = parseInt(a.name.substring(1), 10);
        const numB = parseInt(b.name.substring(1), 10);
        return numA - numB;
      });
  }

  /**
   * Calculate angular distance between two positions.
   * @param {number} ra1 - First RA
   * @param {number} dec1 - First Dec
   * @param {number} ra2 - Second RA
   * @param {number} dec2 - Second Dec
   * @returns {number} Angular distance in degrees
   * @private
   */
  angularDistance_(ra1, dec1, ra2, dec2) {
    const ra1Rad = ra1 * Math.PI / 180;
    const dec1Rad = dec1 * Math.PI / 180;
    const ra2Rad = ra2 * Math.PI / 180;
    const dec2Rad = dec2 * Math.PI / 180;

    const dRa = ra2Rad - ra1Rad;
    const dDec = dec2Rad - dec1Rad;

    const a = Math.sin(dDec / 2) ** 2 +
              Math.cos(dec1Rad) * Math.cos(dec2Rad) *
              Math.sin(dRa / 2) ** 2;

    return 2 * Math.asin(Math.sqrt(a)) * 180 / Math.PI;
  }

  /**
   * Clear the index.
   */
  clear() {
    this.index_ = [];
    this.built_ = false;
    this.starByHip_.clear();
    this.starById_.clear();
    this.indexedNames_.clear();
  }

  /**
   * Add entry to index.
   * @param {!SearchEntry} entry - Entry to add
   */
  addEntry(entry) {
    this.index_.push(entry);
  }

  /**
   * Update planet positions in the index.
   * @param {!Array<!Object>} planets - Updated planet data
   */
  updatePlanets(planets) {
    // Remove old planet entries
    this.index_ = this.index_.filter((e) => e.type !== 'Planet');

    // Add updated planets
    planets.forEach((planet) => {
      this.index_.push({
        name: planet.name,
        type: 'Planet',
        ra: planet.ra,
        dec: planet.dec,
        mag: planet.mag,
        isAlias: false,
        data: planet,
      });
    });
  }
}

/**
 * Singleton instance for application-wide search.
 * @const {!SearchManager}
 */
export const searchManager = new SearchManager();
