/**
 * @fileoverview Search manager for celestial object search.
 * Builds and queries a search index for stars, DSOs, and constellations.
 */

import {globalEventBus, Events} from '../core/EventBus.js';
import {angularDistance} from '../core/CoordinateUtils.js';
import {CONSTELLATION_NAMES, getAbbrevFromInternalKey} from '../data/ConstellationNames.js';
import {PLANET_NAMES} from '../data/PlanetNames.js';
import {DSO_NAMES} from '../data/DsoNames.js';

/**
 * @typedef {{
 *   name: string,
 *   displayName: (string|undefined),
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
 *   internalName: (string|undefined),
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
        // Handle both scalar IDs and object format {id, hip, ra, dec, mag}
        const hipId = typeof starId === 'object' ? starId.hip : starId;
        const idNum = typeof starId === 'object' ? starId.id : starId;
        const star = (hipId && this.starByHip_.get(hipId)) ||
                     (idNum && this.starById_.get(idNum)) ||
                     (typeof starId === 'object' ? starId : null);
        if (star) {
          const entry = {
            name,
            type: 'Star',
            ra: star.ra,
            dec: star.dec,
            mag: star.mag,
            isAlias: false,
            data: star,
          };
          this.index_.push(entry);
          this.indexedNames_.add(name);
          this.addStarCatalogAliases_(star, name);
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
          this.addStarCatalogAliases_(star, star.proper);
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
            name: primaryName || `NGC${dso.ngc}`,
            displayName: `NGC${dso.ngc}`,
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
            name: primaryName || `IC${dso.ic}`,
            displayName: `IC${dso.ic}`,
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
                name: primaryName || commonName,
                displayName: commonName,
                type: dso.type || 'DSO',
                ra: dso.ra,
                dec: dso.dec,
                mag: dso.mag,
                isAlias: true,
                data: dso,
              });
            }

            // Add translated names for this common name
            this.addDsoLanguageAliases_(dso, commonName, primaryName);
          });
        }
      });
    }

    // Add constellations with all language names
    if (constellations) {
      Object.entries(constellations).forEach(([internalKey, data]) => {
        // Primary entry with internal key
        this.index_.push({
          name: internalKey,
          type: 'Constellation',
          ra: data.ra || 0,
          dec: data.dec || 0,
          mag: null,
          isAlias: false,
          data,
        });

        // IAU abbreviation alias (e.g., "UMa" for "UrsaMajor")
        const abbrev = getAbbrevFromInternalKey(internalKey);
        if (abbrev !== internalKey) {
          this.index_.push({
            name: internalKey,
            displayName: abbrev,
            type: 'Constellation',
            ra: data.ra || 0,
            dec: data.dec || 0,
            mag: null,
            isAlias: true,
            data,
          });
        }

        // Add names in all languages (dedup identical names across languages)
        const seenNames = new Set();
        for (const [, langData] of Object.entries(CONSTELLATION_NAMES)) {
          const localizedName = langData[abbrev];
          if (localizedName && localizedName !== internalKey &&
              !seenNames.has(localizedName)) {
            seenNames.add(localizedName);
            this.index_.push({
              name: internalKey,
              displayName: localizedName,
              type: 'Constellation',
              ra: data.ra || 0,
              dec: data.dec || 0,
              mag: null,
              isAlias: true,
              data,
            });
          }
        }
      });
    }

    // Add planets with all language names
    if (planets) {
      this.addPlanetEntries_(planets);
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
        const displayName = entry.displayName || entry.name;
        const displayLower = displayName.toLowerCase();
        let score = 0;

        // Match against displayName first
        if (displayLower === lowerQuery) {
          score = 1000;
        } else if (displayLower.startsWith(lowerQuery)) {
          score = 500;
        } else if (displayLower.includes(lowerQuery)) {
          score = 100;
        }

        // Fall back to matching against internal name if no displayName match
        if (score === 0 && entry.displayName) {
          const nameLower = entry.name.toLowerCase();
          if (nameLower === lowerQuery) {
            score = 1000;
          } else if (nameLower.startsWith(lowerQuery)) {
            score = 500;
          } else if (nameLower.includes(lowerQuery)) {
            score = 100;
          }
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
          name: displayName,
          internalName: entry.name,
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
   * Find an object by exact name (checks both displayName and internal name).
   * Returns the raw index entry with `name` as internal key. For the
   * user-facing display name, use `entry.displayName || entry.name`.
   * @param {string} name - Object name (display name or internal key)
   * @returns {?SearchEntry} Entry or null if not found
   */
  findByName(name) {
    const lower = name.toLowerCase();
    return this.index_.find(
      (e) => (e.displayName && e.displayName.toLowerCase() === lower) ||
             e.name.toLowerCase() === lower
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
      const distance = angularDistance(ra, dec, entry.ra, entry.dec);
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
    const seen = new Set();
    return this.index_
      .filter((e) => /^M\d+$/i.test(e.name) && !e.isAlias)
      .filter((e) => {
        if (seen.has(e.name)) return false;
        seen.add(e.name);
        return true;
      })
      .sort((a, b) => {
        const numA = parseInt(a.name.substring(1), 10);
        const numB = parseInt(b.name.substring(1), 10);
        return numA - numB;
      });
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

    // Re-add with all language aliases
    this.addPlanetEntries_(planets);
  }

  /**
   * Add planet entries with all language aliases.
   * @param {!Array<!Object>} planets - Planet data array
   * @private
   */
  addPlanetEntries_(planets) {
    planets.forEach((planet) => {
      // Primary English entry
      this.index_.push({
        name: planet.name,
        type: 'Planet',
        ra: planet.ra,
        dec: planet.dec,
        mag: planet.mag,
        isAlias: false,
        data: planet,
      });

      // Add translated names
      const translations = PLANET_NAMES[planet.name];
      if (translations) {
        for (const [, localizedName] of Object.entries(translations)) {
          if (localizedName !== planet.name) {
            this.index_.push({
              name: planet.name,
              displayName: localizedName,
              type: 'Planet',
              ra: planet.ra,
              dec: planet.dec,
              mag: planet.mag,
              isAlias: true,
              data: planet,
            });
          }
        }
      }
    });
  }

  /**
   * Add catalog ID aliases for a named star (HIP, HD, HR, Gl).
   * @param {!Object} star - Star data object
   * @param {string} properName - The star's proper name
   * @private
   */
  addStarCatalogAliases_(star, properName) {
    const aliases = [];
    if (star.hip) aliases.push(`HIP ${star.hip}`);
    if (star.hd) aliases.push(`HD ${star.hd}`);
    if (star.hr) aliases.push(`HR ${star.hr}`);
    if (star.gl) aliases.push(`Gl ${star.gl}`);

    aliases.forEach((alias) => {
      this.index_.push({
        name: alias,
        displayName: `${alias} (${properName})`,
        type: 'Star',
        ra: star.ra,
        dec: star.dec,
        mag: star.mag,
        isAlias: true,
        data: star,
      });
    });
  }

  /**
   * Add translated name aliases for a DSO common name.
   * @param {!Object} dso - DSO data object
   * @param {string} englishName - English common name
   * @param {string} primaryName - Primary catalog name (e.g., 'M31')
   * @private
   */
  addDsoLanguageAliases_(dso, englishName, primaryName) {
    const translations = DSO_NAMES[englishName];
    if (!translations) return;

    for (const [, localizedName] of Object.entries(translations)) {
      if (localizedName !== englishName && localizedName !== primaryName) {
        this.index_.push({
          name: primaryName || englishName,
          displayName: localizedName,
          type: dso.type || 'DSO',
          ra: dso.ra,
          dec: dso.dec,
          mag: dso.mag,
          isAlias: true,
          data: dso,
        });
      }
    }
  }
}

/**
 * Singleton instance for application-wide search.
 * @const {!SearchManager}
 */
export const searchManager = new SearchManager();
