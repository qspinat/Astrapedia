/**
 * @fileoverview Dynamic data loading service for VizieR and SIMBAD queries.
 * Loads additional stars and deep sky objects when zoomed in.
 */

import {globalEventBus, Events} from '../core/EventBus.js';
import {DYNAMIC_DATA, API_ENDPOINTS} from '../core/Constants.js';

/**
 * @typedef {{
 *   ra: number,
 *   dec: number,
 *   mag: number,
 *   ci: number
 * }}
 */
let StarData;

/**
 * @typedef {{
 *   ra: number,
 *   dec: number,
 *   mag: number,
 *   name: string,
 *   type: string,
 *   size_major: number,
 *   size_minor: number
 * }}
 */
let DSOData;

/**
 * DynamicDataLoader queries VizieR and SIMBAD for additional celestial data.
 */
export class DynamicDataLoader {
  /**
   * Creates a new DynamicDataLoader instance.
   * @param {Object=} config - Optional configuration
   */
  constructor(config = {}) {
    /** @private @const {number} */
    this.maxStars_ = config.maxStars || DYNAMIC_DATA.MAX_STARS;

    /** @private @const {number} */
    this.maxDSOs_ = config.maxDSOs || DYNAMIC_DATA.MAX_DSOS;

    /** @private @const {number} */
    this.maxRegions_ = config.maxRegions || DYNAMIC_DATA.MAX_REGIONS;

    /** @private @const {number} */
    this.queryTimeout_ = config.timeout || 30000;

    /** @private {!Array<!StarData>} */
    this.dynamicStars_ = [];

    /** @private {!Array<!DSOData>} */
    this.dynamicDSOs_ = [];

    /** @private {!Set<string>} */
    this.queriedRegions_ = new Set();

    /** @private {boolean} */
    this.isQueryingStars_ = false;

    /** @private {boolean} */
    this.isQueryingDSOs_ = false;
  }

  /**
   * Validate and sanitize query parameters.
   * @param {number} ra - Right Ascension in degrees
   * @param {number} dec - Declination in degrees
   * @param {number} radius - Search radius in degrees
   * @param {number} magLimit - Magnitude limit
   * @returns {?{ra: number, dec: number, radius: number, mag: number}}
   * @private
   */
  validateParams_(ra, dec, radius, magLimit) {
    const safeRa = parseFloat(ra);
    const safeDec = parseFloat(dec);
    const safeRadius = parseFloat(radius);
    const safeMag = parseFloat(magLimit);

    if (isNaN(safeRa) || isNaN(safeDec) || isNaN(safeRadius) || isNaN(safeMag) ||
        safeRa < 0 || safeRa > 360 || safeDec < -90 || safeDec > 90 ||
        safeRadius <= 0 || safeRadius > 180) {
      console.warn('Invalid query parameters');
      return null;
    }

    return {ra: safeRa, dec: safeDec, radius: safeRadius, mag: safeMag};
  }

  /**
   * Check if a region needs to be queried.
   * @param {number} ra - Right Ascension
   * @param {number} dec - Declination
   * @param {number} fov - Field of view
   * @param {number} magLimit - Magnitude limit
   * @returns {boolean} True if region should be queried
   */
  shouldQueryRegion(ra, dec, fov, magLimit) {
    if (fov > DYNAMIC_DATA.LOAD_FOV_THRESHOLD) return false;
    if (this.isQueryingStars_ || this.isQueryingDSOs_) return false;

    const gridSize = Math.max(1, fov);
    const raBucket = Math.floor(ra / gridSize) * gridSize;
    const decBucket = Math.floor(dec / gridSize) * gridSize;
    const fovBucket = fov < 1 ? 'deep' : (fov < 5 ? 'medium' : 'wide');
    const magBucket = Math.floor(magLimit / 2) * 2;
    const regionKey = `${raBucket.toFixed(0)}_${decBucket.toFixed(0)}_` +
                      `${fovBucket}_mag${magBucket}`;

    if (this.queriedRegions_.has(regionKey)) return false;

    return true;
  }

  /**
   * Get region key for caching.
   * @param {number} ra - Right Ascension
   * @param {number} dec - Declination
   * @param {number} fov - Field of view
   * @param {number} magLimit - Magnitude limit
   * @returns {string} Region key
   */
  getRegionKey(ra, dec, fov, magLimit) {
    const gridSize = Math.max(1, fov);
    const raBucket = Math.floor(ra / gridSize) * gridSize;
    const decBucket = Math.floor(dec / gridSize) * gridSize;
    const fovBucket = fov < 1 ? 'deep' : (fov < 5 ? 'medium' : 'wide');
    const magBucket = Math.floor(magLimit / 2) * 2;
    return `${raBucket.toFixed(0)}_${decBucket.toFixed(0)}_` +
           `${fovBucket}_mag${magBucket}`;
  }

  /**
   * Query stars from multiple catalogs for a region.
   * @param {number} ra - Center Right Ascension in degrees
   * @param {number} dec - Center Declination in degrees
   * @param {number} fov - Field of view in degrees
   * @param {number} magLimit - Magnitude limit
   * @returns {!Promise<!Array<!StarData>>} Array of star data
   */
  async queryStars(ra, dec, fov, magLimit) {
    if (this.isQueryingStars_) return [];
    this.isQueryingStars_ = true;

    const regionKey = this.getRegionKey(ra, dec, fov, magLimit);
    this.queriedRegions_.add(regionKey);

    globalEventBus.emit(Events.DYNAMIC_QUERY_STARTED, {type: 'stars', ra, dec, fov});

    try {
      const stars = [];

      // Query Tycho-2 (bright stars up to ~11.5 mag)
      const tychoStars = await this.queryTycho_(ra, dec, fov, magLimit);
      stars.push(...tychoStars);

      // Query UCAC4 for fainter stars (up to ~16 mag) at deep zoom
      if (fov < 3) {
        const ucacStars = await this.queryUCAC4_(ra, dec, fov, magLimit);
        stars.push(...ucacStars);
      }

      // Query SIMBAD for very faint stars at extreme zoom
      if (fov < 1 && magLimit > 16) {
        const simbadStars = await this.querySimbadStars_(ra, dec, fov, magLimit);
        stars.push(...simbadStars);
      }

      // Add to collection and enforce limits
      this.addStars_(stars);

      globalEventBus.emit(Events.DYNAMIC_STARS_LOADED, {
        count: stars.length,
        total: this.dynamicStars_.length,
      });

      return stars;
    } catch (error) {
      console.warn('Star query error:', error.message);
      return [];
    } finally {
      this.isQueryingStars_ = false;
      globalEventBus.emit(Events.DYNAMIC_QUERY_COMPLETE, {type: 'stars'});
    }
  }

  /**
   * Query Tycho-2 catalog via VizieR.
   * @param {number} ra - Center RA in degrees
   * @param {number} dec - Center Dec in degrees
   * @param {number} fov - Field of view in degrees
   * @param {number} magLimit - Magnitude limit
   * @returns {!Promise<!Array<!StarData>>} Array of star data
   * @private
   */
  async queryTycho_(ra, dec, fov, magLimit) {
    const radius = Math.max(fov * 0.8, 0.2);
    const mag = Math.min(12, magLimit);
    const limit = fov < 1 ? 5000 : 3000;

    const params = this.validateParams_(ra, dec, radius, mag);
    if (!params) return [];

    const url = 'https://vizier.cds.unistra.fr/viz-bin/votable' +
      `?-source=I/259/tyc2` +
      `&-c=${encodeURIComponent(params.ra.toFixed(6) + ' ' + params.dec.toFixed(6))}` +
      `&-c.rd=${encodeURIComponent(params.radius.toFixed(4))}` +
      `&-out.max=${encodeURIComponent(limit)}` +
      `&-out=RAmdeg,DEmdeg,VTmag,BTmag` +
      `&VTmag=${encodeURIComponent('<' + params.mag.toFixed(2))}`;

    try {
      const response = await this.fetchWithTimeout_(url);
      if (!response.ok) throw new Error(`Tycho query failed: ${response.status}`);

      const text = await response.text();
      const stars = this.parseVOTableStars_(text);
      console.log(`✓ Loaded ${stars.length} stars from Tycho-2`);
      return stars;
    } catch (error) {
      console.warn('Tycho-2 query error:', error.message);
      return [];
    }
  }

  /**
   * Query UCAC4 catalog via VizieR.
   * @param {number} ra - Center RA in degrees
   * @param {number} dec - Center Dec in degrees
   * @param {number} fov - Field of view in degrees
   * @param {number} magLimit - Magnitude limit
   * @returns {!Promise<!Array<!StarData>>} Array of star data
   * @private
   */
  async queryUCAC4_(ra, dec, fov, magLimit) {
    const radius = Math.max(fov * 0.8, 0.1);
    const mag = Math.min(16, magLimit);
    const limit = fov < 0.5 ? 8000 : 4000;

    const params = this.validateParams_(ra, dec, radius, mag);
    if (!params) return [];

    const url = 'https://vizier.cds.unistra.fr/viz-bin/votable' +
      `?-source=I/322A/out` +
      `&-c=${encodeURIComponent(params.ra.toFixed(6) + ' ' + params.dec.toFixed(6))}` +
      `&-c.rd=${encodeURIComponent(params.radius.toFixed(4))}` +
      `&-out.max=${encodeURIComponent(limit)}` +
      `&-out=RAJ2000,DEJ2000,Vmag,Bmag` +
      `&Vmag=${encodeURIComponent('<' + params.mag.toFixed(2))}`;

    try {
      const response = await this.fetchWithTimeout_(url);
      if (!response.ok) return [];

      const text = await response.text();
      const stars = this.parseVOTableStars_(text);
      console.log(`✓ Loaded ${stars.length} stars from UCAC4`);
      return stars;
    } catch (error) {
      return [];
    }
  }

  /**
   * Query SIMBAD for faint stars.
   * @param {number} ra - Center RA in degrees
   * @param {number} dec - Center Dec in degrees
   * @param {number} fov - Field of view in degrees
   * @param {number} magLimit - Magnitude limit
   * @returns {!Promise<!Array<!StarData>>} Array of star data
   * @private
   */
  async querySimbadStars_(ra, dec, fov, magLimit) {
    const radius = Math.max(fov * 0.7, 0.1);
    const mag = Math.min(25, magLimit);
    const limit = 5000;

    const params = this.validateParams_(ra, dec, radius, mag);
    if (!params) return [];

    const query = `
      SELECT TOP ${limit}
        ra, dec, flux as mag, main_id as name, otype as type
      FROM basic
      WHERE 1=CONTAINS(
        POINT('ICRS', ra, dec),
        CIRCLE('ICRS', ${params.ra.toFixed(6)}, ${params.dec.toFixed(6)}, ${params.radius.toFixed(6)})
      )
      AND flux < ${params.mag.toFixed(2)}
    `;

    try {
      const response = await this.fetchWithTimeout_(API_ENDPOINTS.SIMBAD, {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: new URLSearchParams({
          REQUEST: 'doQuery',
          LANG: 'ADQL',
          FORMAT: 'json',
          QUERY: query,
        }),
      });

      if (!response.ok) return [];

      const data = await response.json();
      if (!data.data?.length) return [];

      const stars = data.data.map((row) => ({
        ra: parseFloat(row[0]),
        dec: parseFloat(row[1]),
        mag: parseFloat(row[2]),
        ci: 0.6, // Default color index
      })).filter((s) => !isNaN(s.ra) && !isNaN(s.dec) && !isNaN(s.mag));

      console.log(`✓ Loaded ${stars.length} stars from SIMBAD`);
      return stars;
    } catch (error) {
      return [];
    }
  }

  /**
   * Query DSOs from VizieR NGC/IC catalog.
   * @param {number} ra - Center RA in degrees
   * @param {number} dec - Center Dec in degrees
   * @param {number} fov - Field of view in degrees
   * @param {number} magLimit - Magnitude limit
   * @returns {!Promise<!Array<!DSOData>>} Array of DSO data
   */
  async queryDSOs(ra, dec, fov, magLimit) {
    if (fov > 10) return [];
    if (this.isQueryingDSOs_) return [];
    this.isQueryingDSOs_ = true;

    globalEventBus.emit(Events.DYNAMIC_QUERY_STARTED, {type: 'dsos', ra, dec, fov});

    try {
      const radius = Math.max(fov * 0.8, 0.1);
      const mag = Math.min(18, magLimit);

      const params = this.validateParams_(ra, dec, radius, mag);
      if (!params) return [];

      const url = 'https://vizier.cds.unistra.fr/viz-bin/votable' +
        `?-source=VII/118/ngc2000` +
        `&-c=${encodeURIComponent(params.ra.toFixed(6) + ' ' + params.dec.toFixed(6))}` +
        `&-c.rd=${encodeURIComponent(params.radius.toFixed(4))}` +
        `&-out.max=1000` +
        `&-out=RAJ2000,DEJ2000,Bmag,MajAxis,MinAxis,NGC,IC,Name,Type` +
        `&Bmag=${encodeURIComponent('<' + params.mag.toFixed(2))}`;

      const response = await this.fetchWithTimeout_(url);
      if (!response.ok) return [];

      const text = await response.text();
      const dsos = this.parseVOTableDSOs_(text);

      // Add to collection and enforce limits
      this.addDSOs_(dsos);

      console.log(`✓ Loaded ${dsos.length} DSOs from VizieR`);

      globalEventBus.emit(Events.DYNAMIC_DSOS_LOADED, {
        count: dsos.length,
        total: this.dynamicDSOs_.length,
      });

      return dsos;
    } catch (error) {
      console.warn('DSO query error:', error.message);
      return [];
    } finally {
      this.isQueryingDSOs_ = false;
      globalEventBus.emit(Events.DYNAMIC_QUERY_COMPLETE, {type: 'dsos'});
    }
  }

  /**
   * Parse VizieR VOTable XML for stars.
   * @param {string} text - VOTable XML text
   * @returns {!Array<!StarData>} Parsed star data
   * @private
   */
  parseVOTableStars_(text) {
    const stars = [];
    try {
      const rowMatches = text.matchAll(/<TR>([\s\S]*?)<\/TR>/g);
      for (const rowMatch of rowMatches) {
        const rowContent = rowMatch[1];
        const tdMatches = [...rowContent.matchAll(/<TD>([^<]*)<\/TD>/g)];
        if (tdMatches.length >= 3) {
          const ra = parseFloat(tdMatches[0][1]);
          const dec = parseFloat(tdMatches[1][1]);
          const vMag = parseFloat(tdMatches[2][1]);
          const bMag = tdMatches.length >= 4 ? parseFloat(tdMatches[3][1]) : NaN;

          // Calculate B-V color index
          let ci = 0.6; // Default sun-like
          if (!isNaN(bMag) && !isNaN(vMag)) {
            ci = Math.max(-0.5, Math.min(2.5, bMag - vMag));
          }

          if (!isNaN(ra) && !isNaN(dec) && !isNaN(vMag)) {
            stars.push({ra, dec, mag: vMag, ci});
          }
        }
      }
    } catch (error) {
      console.warn('VOTable parse error:', error);
    }
    return stars;
  }

  /**
   * Parse VizieR VOTable XML for DSOs.
   * @param {string} text - VOTable XML text
   * @returns {!Array<!DSOData>} Parsed DSO data
   * @private
   */
  parseVOTableDSOs_(text) {
    const dsos = [];
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/xml');
      const rows = doc.querySelectorAll('TABLEDATA TR');

      rows.forEach((row) => {
        const cells = row.querySelectorAll('TD');
        if (cells.length >= 6) {
          const ra = parseFloat(cells[0]?.textContent);
          const dec = parseFloat(cells[1]?.textContent);
          const mag = parseFloat(cells[2]?.textContent) || 15;
          const sizeMajor = parseFloat(cells[3]?.textContent) || 1;
          const sizeMinor = parseFloat(cells[4]?.textContent) || sizeMajor;
          const ngc = cells[5]?.textContent?.trim();
          const ic = cells[6]?.textContent?.trim();
          const name = cells[7]?.textContent?.trim();
          const type = cells[8]?.textContent?.trim() || 'DSO';

          if (!isNaN(ra) && !isNaN(dec) && ra >= 0 && ra <= 360 &&
              dec >= -90 && dec <= 90) {
            dsos.push({
              ra, dec, mag,
              size_major: sizeMajor,
              size_minor: sizeMinor,
              name: ngc ? `NGC${ngc}` : (ic ? `IC${ic}` : name),
              type,
            });
          }
        }
      });
    } catch (error) {
      // Silent fail
    }
    return dsos;
  }

  /**
   * Fetch with timeout.
   * @param {string} url - URL to fetch
   * @param {!RequestInit=} options - Fetch options
   * @returns {!Promise<!Response>} Fetch response
   * @private
   */
  async fetchWithTimeout_(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.queryTimeout_);

    try {
      const response = await fetch(url, {...options, signal: controller.signal});
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Add stars to collection with deduplication and limit enforcement.
   * @param {!Array<!StarData>} newStars - Stars to add
   * @private
   */
  addStars_(newStars) {
    // Deduplicate
    const uniqueStars = newStars.filter((star) => {
      return !this.dynamicStars_.some((s) =>
        Math.abs(s.ra - star.ra) < 0.001 && Math.abs(s.dec - star.dec) < 0.001
      );
    });

    this.dynamicStars_.push(...uniqueStars);

    // Enforce limit - keep brightest stars
    if (this.dynamicStars_.length > this.maxStars_) {
      this.dynamicStars_.sort((a, b) => a.mag - b.mag);
      const excess = this.dynamicStars_.length - this.maxStars_;
      this.dynamicStars_ = this.dynamicStars_.slice(0, this.maxStars_);
      console.log(`Dynamic stars trimmed: removed ${excess} faintest`);
    }
  }

  /**
   * Add DSOs to collection with deduplication and limit enforcement.
   * @param {!Array<!DSOData>} newDSOs - DSOs to add
   * @private
   */
  addDSOs_(newDSOs) {
    // Deduplicate
    const uniqueDSOs = newDSOs.filter((dso) => {
      return !this.dynamicDSOs_.some((d) =>
        Math.abs(d.ra - dso.ra) < 0.01 && Math.abs(d.dec - dso.dec) < 0.01
      );
    });

    this.dynamicDSOs_.push(...uniqueDSOs);

    // Enforce limit - prioritize by size then brightness
    if (this.dynamicDSOs_.length > this.maxDSOs_) {
      this.dynamicDSOs_.sort((a, b) => {
        const sizeDiff = (b.size_major || 1) - (a.size_major || 1);
        if (Math.abs(sizeDiff) > 0.5) return sizeDiff;
        return (a.mag || 15) - (b.mag || 15);
      });
      const excess = this.dynamicDSOs_.length - this.maxDSOs_;
      this.dynamicDSOs_ = this.dynamicDSOs_.slice(0, this.maxDSOs_);
      console.log(`Dynamic DSOs trimmed: removed ${excess} smallest/faintest`);
    }
  }

  /**
   * Filter stars outside a given view.
   * @param {number} ra - View center RA
   * @param {number} dec - View center Dec
   * @param {number} fov - Field of view
   */
  filterStarsByView(ra, dec, fov) {
    if (this.dynamicStars_.length === 0) return;

    const filterRadius = Math.max(fov * 1.5, fov + 2);
    const filterRadiusRad = filterRadius * Math.PI / 180;
    const cosFilterRadius = Math.cos(filterRadiusRad);
    const viewRaRad = ra * Math.PI / 180;
    const viewDecRad = dec * Math.PI / 180;

    const initialCount = this.dynamicStars_.length;

    this.dynamicStars_ = this.dynamicStars_.filter((star) => {
      const starRaRad = star.ra * Math.PI / 180;
      const starDecRad = star.dec * Math.PI / 180;
      const cosDist = Math.sin(viewDecRad) * Math.sin(starDecRad) +
                      Math.cos(viewDecRad) * Math.cos(starDecRad) *
                      Math.cos(starRaRad - viewRaRad);
      return cosDist >= cosFilterRadius;
    });

    const removed = initialCount - this.dynamicStars_.length;
    if (removed > 0) {
      console.log(`Filtered ${removed} dynamic stars outside FOV`);
    }
  }

  /**
   * Clear all dynamic data (called when zoomed out).
   */
  clearAll() {
    this.dynamicStars_ = [];
    this.dynamicDSOs_ = [];
    this.queriedRegions_.clear();
  }

  /**
   * Clear cached regions (for re-querying).
   */
  clearRegionCache() {
    // Limit cache size
    if (this.queriedRegions_.size > this.maxRegions_) {
      const keysArray = Array.from(this.queriedRegions_);
      const toRemove = keysArray.slice(0, Math.floor(this.maxRegions_ / 2));
      toRemove.forEach((key) => this.queriedRegions_.delete(key));
    }
  }

  /**
   * Get current dynamic stars.
   * @returns {!Array<!StarData>} Dynamic stars array
   */
  getStars() {
    return this.dynamicStars_;
  }

  /**
   * Get current dynamic DSOs.
   * @returns {!Array<!DSOData>} Dynamic DSOs array
   */
  getDSOs() {
    return this.dynamicDSOs_;
  }

  /**
   * Check if currently querying.
   * @returns {boolean} True if querying
   */
  isQuerying() {
    return this.isQueryingStars_ || this.isQueryingDSOs_;
  }

  /**
   * Get statistics.
   * @returns {{stars: number, dsos: number, regions: number}} Stats
   */
  getStats() {
    return {
      stars: this.dynamicStars_.length,
      dsos: this.dynamicDSOs_.length,
      regions: this.queriedRegions_.size,
    };
  }

  /**
   * Set maximum limits.
   * @param {number} maxStars - Maximum stars
   * @param {number} maxDSOs - Maximum DSOs
   */
  setLimits(maxStars, maxDSOs) {
    this.maxStars_ = maxStars;
    this.maxDSOs_ = maxDSOs;
  }
}

/**
 * Singleton instance for application-wide dynamic data loading.
 * @const {!DynamicDataLoader}
 */
export const dynamicDataLoader = new DynamicDataLoader();
