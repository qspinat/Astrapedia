/**
 * @fileoverview Observer-aware wrapper over the canonical coordinate helpers.
 *
 * Holds the observer's location so callers can ask "how high is this object
 * right now" without threading latitude and sidereal time through every call.
 * The maths itself lives in CoordinateUtils.
 *
 * Ephemeris calculations (Sun, Moon and planet positions) belong to
 * modules/astronomy/SolarSystem.js, which PlanetRenderer uses. This module
 * once carried a second, independently maintained copy of all of them; the two
 * had already drifted apart before it was removed.
 */

import {
  calculateAltitude as coordCalculateAltitude,
  calculateLST as coordCalculateLST,
} from './CoordinateUtils.js';

/**
 * @typedef {{lat: number, lon: number, height: number}}
 */
let ObserverLocation;

/**
 * Tracks the observer's location and answers altitude queries for it.
 */
export class AstronomyCalculator {
  /**
   * @param {?ObserverLocation=} observerLocation - Initial location; defaults
   *     to the intersection of the equator and the prime meridian.
   */
  constructor(observerLocation = null) {
    /** @private {!ObserverLocation} */
    this.observerLocation_ = observerLocation || {lat: 0, lon: 0, height: 0};
  }

  /**
   * Set the observer location.
   * @param {number} lat - Latitude in degrees
   * @param {number} lon - Longitude in degrees, east positive
   * @param {number=} height - Height in metres
   */
  setObserverLocation(lat, lon, height = 0) {
    this.observerLocation_ = {lat, lon, height};
  }

  /**
   * Get the observer location.
   * @returns {!ObserverLocation} A copy, so callers cannot mutate our state
   */
  getObserverLocation() {
    return {...this.observerLocation_};
  }

  /**
   * Calculate Local Sidereal Time at the observer's longitude.
   * @param {!Date} date - Observation date
   * @param {number=} longitude - Overrides the observer's longitude
   * @returns {number} LST in degrees, 0-360
   */
  calculateLST(date, longitude = this.observerLocation_.lon) {
    return coordCalculateLST(date, longitude);
  }

  /**
   * Calculate an object's altitude above the observer's horizon.
   * @param {number} ra - Right ascension in degrees
   * @param {number} dec - Declination in degrees
   * @param {!Date} date - Observation date
   * @returns {number} Altitude in degrees, -90 to 90
   */
  calculateAltitude(ra, dec, date) {
    const lst = this.calculateLST(date);
    return coordCalculateAltitude(ra, dec, this.observerLocation_.lat, lst);
  }
}

/**
 * Singleton instance for application-wide astronomy calculations.
 * @const {!AstronomyCalculator}
 */
export const astronomyCalculator = new AstronomyCalculator();
