/**
 * @fileoverview Calculate object visibility based on observer location and time.
 * Determines which objects are visible tonight from a given location.
 */

/**
 * Calculate altitude of an object at a given location and time.
 * @param {number} ra - Right ascension in degrees
 * @param {number} dec - Declination in degrees
 * @param {number} lat - Observer latitude in degrees
 * @param {number} lst - Local sidereal time in degrees
 * @returns {number} Altitude in degrees
 */
export const calculateAltitude = (ra, dec, lat, lst) => {
  const latRad = lat * Math.PI / 180;
  const decRad = dec * Math.PI / 180;
  const haRad = (lst - ra) * Math.PI / 180;

  const sinAlt = Math.sin(latRad) * Math.sin(decRad) +
    Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad);

  return Math.asin(sinAlt) * 180 / Math.PI;
};

/**
 * Check if an object is above the horizon.
 * @param {number} ra - Right ascension in degrees
 * @param {number} dec - Declination in degrees
 * @param {number} lat - Observer latitude in degrees
 * @param {number} lst - Local sidereal time in degrees
 * @param {number=} minAltitude - Minimum altitude in degrees (default 0)
 * @returns {boolean} True if above minimum altitude
 */
export const isAboveHorizon = (ra, dec, lat, lst, minAltitude = 0) => {
  const altitude = calculateAltitude(ra, dec, lat, lst);
  return altitude >= minAltitude;
};

/**
 * Check if an object is circumpolar (never sets) from a given latitude.
 * @param {number} dec - Declination in degrees
 * @param {number} lat - Observer latitude in degrees
 * @returns {boolean} True if circumpolar
 */
export const isCircumpolar = (dec, lat) => {
  // For northern hemisphere: circumpolar if dec > (90 - lat)
  // For southern hemisphere: circumpolar if dec < -(90 + lat)
  if (lat >= 0) {
    return dec >= (90 - lat);
  }
  return dec <= -(90 + lat);
};

/**
 * Check if an object never rises from a given latitude.
 * @param {number} dec - Declination in degrees
 * @param {number} lat - Observer latitude in degrees
 * @returns {boolean} True if object never rises
 */
export const neverRises = (dec, lat) => {
  // For northern hemisphere: never rises if dec < -(90 - lat)
  // For southern hemisphere: never rises if dec > (90 + lat)
  if (lat >= 0) {
    return dec <= -(90 - lat);
  }
  return dec >= (90 + lat);
};

/**
 * Calculate the transit altitude (maximum altitude) of an object.
 * @param {number} dec - Declination in degrees
 * @param {number} lat - Observer latitude in degrees
 * @returns {number} Maximum altitude in degrees
 */
export const transitAltitude = (dec, lat) => {
  // Transit altitude = 90 - |lat - dec|
  return 90 - Math.abs(lat - dec);
};

/**
 * Types to exclude from visibility lists (stellar/non-extended objects).
 * @const {!Array<string>}
 */
export const EXCLUDE_STELLAR_TYPES = ['*', '**', '*Ass', 'Star', 'Nova', 'SNR?'];

/**
 * VisibilityCalculator determines object visibility for a location.
 */
export class VisibilityCalculator {
  /**
   * Creates a new VisibilityCalculator instance.
   * @param {!Object} dependencies - Required dependencies
   * @param {function(): {lat: number, lon: number}} dependencies.getLocation - Get observer location
   * @param {function(): number} dependencies.getLST - Get local sidereal time in degrees
   * @param {function(): !Array} dependencies.getPlanets - Get planets array
   * @param {function(): !Array} dependencies.getDSOs - Get DSOs array
   * @param {function(): !Array} dependencies.getStars - Get stars array
   */
  constructor(dependencies) {
    /** @private @const */
    this.getLocation_ = dependencies.getLocation;

    /** @private @const */
    this.getLST_ = dependencies.getLST;

    /** @private @const */
    this.getPlanets_ = dependencies.getPlanets;

    /** @private @const */
    this.getDSOs_ = dependencies.getDSOs;

    /** @private @const */
    this.getStars_ = dependencies.getStars;
  }

  /**
   * Get best visible objects for tonight.
   * @param {number=} minAltitude - Minimum altitude in degrees (default 15)
   * @param {number=} maxMagnitude - Maximum magnitude to include (default 10)
   * @param {number=} maxObjects - Maximum number of objects to return (default 50)
   * @returns {!Array<!Object>} Array of visible objects sorted by magnitude
   */
  getBestVisibleObjectsTonight(minAltitude = 15, maxMagnitude = 10, maxObjects = 50) {
    const objects = [];
    const location = this.getLocation_() || {lat: 45, lon: 0};
    const lst = this.getLST_() || 0;

    // Add visible planets
    const planets = this.getPlanets_() || [];
    planets.forEach((planet) => {
      if (planet.name !== 'Sun' && planet.name !== 'Moon') {
        const altitude = calculateAltitude(planet.ra, planet.dec, location.lat, lst);
        if (altitude > minAltitude && planet.mag < 6) {
          objects.push({
            name: planet.name,
            ra: planet.ra,
            dec: planet.dec,
            mag: planet.mag,
            altitude,
            type: 'Planet',
            description: `Currently ${altitude.toFixed(0)}° above horizon`,
          });
        }
      }
    });

    // Add visible DSOs
    const dsos = this.getDSOs_() || [];
    dsos.forEach((dso) => {
      if (EXCLUDE_STELLAR_TYPES.includes(dso.type)) return;

      if (dso.mag && dso.mag < maxMagnitude) {
        const altitude = calculateAltitude(dso.ra, dso.dec, location.lat, lst);
        if (altitude > minAltitude) {
          const name = dso.messier ? `M${Math.floor(dso.messier)}` :
            (dso.name?.match(/^(NGC|IC)\d+/)?.[0] || dso.name);
          const commonName = dso.common_names ? ` (${dso.common_names})` : '';

          objects.push({
            name,
            ra: dso.ra,
            dec: dso.dec,
            mag: dso.mag,
            altitude,
            type: dso.type || 'DSO',
            description: `Mag ${dso.mag.toFixed(1)}, Alt ${altitude.toFixed(0)}°${commonName}`,
            data: dso,
          });
        }
      }
    });

    // Sort by magnitude and limit
    return objects.sort((a, b) => a.mag - b.mag).slice(0, maxObjects);
  }

  /**
   * Get all objects currently above horizon.
   * @param {number=} minAltitude - Minimum altitude in degrees
   * @returns {!Array<!Object>} Array of objects with altitude
   */
  getObjectsAboveHorizon(minAltitude = 0) {
    const objects = [];
    const location = this.getLocation_() || {lat: 45, lon: 0};
    const lst = this.getLST_() || 0;

    // Check planets
    const planets = this.getPlanets_() || [];
    planets.forEach((planet) => {
      const altitude = calculateAltitude(planet.ra, planet.dec, location.lat, lst);
      if (altitude > minAltitude) {
        objects.push({...planet, altitude, type: 'Planet'});
      }
    });

    // Check DSOs
    const dsos = this.getDSOs_() || [];
    dsos.forEach((dso) => {
      const altitude = calculateAltitude(dso.ra, dso.dec, location.lat, lst);
      if (altitude > minAltitude) {
        objects.push({...dso, altitude});
      }
    });

    return objects;
  }

  /**
   * Check if a specific object is currently visible.
   * @param {number} ra - Right ascension in degrees
   * @param {number} dec - Declination in degrees
   * @param {number=} minAltitude - Minimum altitude in degrees
   * @returns {{visible: boolean, altitude: number}} Visibility info
   */
  isObjectVisible(ra, dec, minAltitude = 0) {
    const location = this.getLocation_() || {lat: 45, lon: 0};
    const lst = this.getLST_() || 0;
    const altitude = calculateAltitude(ra, dec, location.lat, lst);

    return {
      visible: altitude > minAltitude,
      altitude,
    };
  }
}

/**
 * Singleton visibility calculator instance.
 * @type {?VisibilityCalculator}
 */
export let visibilityCalculator = null;

/**
 * Initialize the visibility calculator singleton.
 * @param {!Object} dependencies - Required dependencies
 * @returns {!VisibilityCalculator} Initialized calculator
 */
export function initializeVisibilityCalculator(dependencies) {
  visibilityCalculator = new VisibilityCalculator(dependencies);
  return visibilityCalculator;
}
