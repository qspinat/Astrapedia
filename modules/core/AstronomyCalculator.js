/**
 * @fileoverview Astronomical calculations for celestial body positions.
 * Includes Sun, Moon, and planet position calculations.
 */

import {ASTRONOMY} from './Constants.js';
import {
  dateToJulianDate as coordDateToJulianDate,
  julianDateToDate as coordJulianDateToDate,
  calculateLST as coordCalculateLST,
} from './CoordinateUtils.js';

/**
 * @typedef {{
 *   ra: number,
 *   dec: number
 * }}
 */
let CelestialPosition;

/**
 * @typedef {{
 *   ra: number,
 *   dec: number,
 *   phase: number
 * }}
 */
let MoonPosition;

/**
 * Approximate orbital elements for planets (fallback calculations).
 * @const {!Object<string, {period: number, a: number}>}
 */
const ORBITAL_ELEMENTS = {
  Mercury: {period: 87.97, a: 0.387},
  Venus: {period: 224.7, a: 0.723},
  Mars: {period: 686.98, a: 1.524},
  Jupiter: {period: 4332.59, a: 5.203},
  Saturn: {period: 10759.22, a: 9.537},
  Uranus: {period: 30688.5, a: 19.191},
  Neptune: {period: 60182, a: 30.069},
};

/**
 * AstronomyCalculator provides celestial position calculations.
 * Uses astronomy-engine library when available, with Keplerian fallback.
 */
export class AstronomyCalculator {
  /**
   * Creates a new AstronomyCalculator instance.
   * @param {Object=} observerLocation - Observer location {lat, lon, height}
   */
  constructor(observerLocation = null) {
    /**
     * Observer location for topocentric corrections.
     * @private {?{lat: number, lon: number, height: number}}
     */
    this.observerLocation_ = observerLocation || {lat: 0, lon: 0, height: 0};

    /**
     * Cache for planet positions.
     * @private {?{positions: !Object, time: number}}
     */
    this.planetCache_ = null;

    /**
     * Cache duration in milliseconds (6 hours).
     * @private @const {number}
     */
    this.cacheDuration_ = 6 * 60 * 60 * 1000;
  }

  /**
   * Set observer location.
   * @param {number} lat - Latitude in degrees
   * @param {number} lon - Longitude in degrees
   * @param {number=} height - Height in meters
   */
  setObserverLocation(lat, lon, height = 0) {
    this.observerLocation_ = {lat, lon, height};
  }

  /**
   * Get observer location.
   * @returns {{lat: number, lon: number, height: number}} Observer location
   */
  getObserverLocation() {
    return {...this.observerLocation_};
  }

  /**
   * Calculate Sun's position based on date.
   * Uses simplified solar position algorithm.
   * @param {!Date} date - The date for calculation
   * @returns {!CelestialPosition} RA/Dec in degrees
   */
  calculateSunPosition(date) {
    const jd = this.dateToJulianDate(date);
    const n = jd - ASTRONOMY.J2000;

    // Mean longitude of the Sun (degrees)
    const L = this.normalizeAngle_(280.460 + 0.9856474 * n);

    // Mean anomaly of the Sun (degrees)
    const g = this.normalizeAngle_(357.528 + 0.9856003 * n);
    const gRad = g * Math.PI / 180;

    // Ecliptic longitude of the Sun (degrees)
    const lambda = L + 1.915 * Math.sin(gRad) + 0.020 * Math.sin(2 * gRad);

    // Obliquity of the ecliptic (degrees)
    const epsilon = ASTRONOMY.OBLIQUITY_J2000 - 0.0000004 * n;
    const epsilonRad = epsilon * Math.PI / 180;
    const lambdaRad = lambda * Math.PI / 180;

    // Right Ascension and Declination
    const ra = Math.atan2(
      Math.cos(epsilonRad) * Math.sin(lambdaRad),
      Math.cos(lambdaRad)
    ) * 180 / Math.PI;

    const dec = Math.asin(
      Math.sin(epsilonRad) * Math.sin(lambdaRad)
    ) * 180 / Math.PI;

    return {
      ra: this.normalizeAngle_(ra),
      dec,
    };
  }

  /**
   * Calculate Moon's position based on date.
   * Uses simplified lunar position algorithm with phase calculation.
   * @param {!Date} date - The date for calculation
   * @returns {!MoonPosition} RA/Dec in degrees and phase (0-1)
   */
  calculateMoonPosition(date) {
    const jd = this.dateToJulianDate(date);
    const T = (jd - ASTRONOMY.J2000) / ASTRONOMY.DAYS_PER_CENTURY;

    // Moon's mean longitude (degrees)
    const L0 = this.normalizeAngle_(
      218.3164477 + 481267.88123421 * T - 0.0015786 * T * T
    );

    // Moon's mean anomaly (degrees)
    const M = this.normalizeAngle_(
      134.9633964 + 477198.8675055 * T + 0.0087414 * T * T
    );
    const Mrad = M * Math.PI / 180;

    // Moon's mean elongation from Sun (degrees)
    const D = this.normalizeAngle_(
      297.8501921 + 445267.1114034 * T - 0.0018819 * T * T
    );
    const Drad = D * Math.PI / 180;

    // Moon's argument of latitude (degrees)
    const F = this.normalizeAngle_(
      93.272095 + 483202.0175233 * T - 0.0036539 * T * T
    );
    const Frad = F * Math.PI / 180;

    // Sun's mean anomaly (degrees)
    const Ms = this.normalizeAngle_(
      357.5291092 + 35999.0502909 * T - 0.0001536 * T * T
    );
    const Msrad = Ms * Math.PI / 180;

    // Main perturbations in longitude
    const dL = 6.289 * Math.sin(Mrad) +          // Equation of center
               1.274 * Math.sin(2 * Drad - Mrad) +  // Evection
               0.658 * Math.sin(2 * Drad) +         // Variation
               -0.186 * Math.sin(Msrad) +           // Annual equation
               -0.114 * Math.sin(2 * Frad);         // Reduction to ecliptic

    // Ecliptic longitude
    const lambda = this.normalizeAngle_(L0 + dL);

    // Ecliptic latitude (Moon's orbit inclined ~5.1° to ecliptic)
    const beta = 5.128 * Math.sin(Frad) +
                 0.281 * Math.sin(Mrad + Frad) +
                 -0.278 * Math.sin(Frad - Mrad) +
                 -0.173 * Math.sin(2 * Drad - Frad);

    // Convert from ecliptic to equatorial coordinates
    const lambdaRad = lambda * Math.PI / 180;
    const betaRad = beta * Math.PI / 180;

    // Obliquity of the ecliptic
    const epsilon = ASTRONOMY.OBLIQUITY_J2000 - 0.0000004 * (jd - ASTRONOMY.J2000);
    const epsilonRad = epsilon * Math.PI / 180;

    // Right Ascension
    const ra = Math.atan2(
      Math.sin(lambdaRad) * Math.cos(epsilonRad) -
      Math.tan(betaRad) * Math.sin(epsilonRad),
      Math.cos(lambdaRad)
    ) * 180 / Math.PI;

    // Declination
    const dec = Math.asin(
      Math.sin(betaRad) * Math.cos(epsilonRad) +
      Math.cos(betaRad) * Math.sin(epsilonRad) * Math.sin(lambdaRad)
    ) * 180 / Math.PI;

    // Calculate Moon phase (0-1, where 0 = new moon, 0.5 = full moon)
    // D is the mean elongation (0-360° over lunar month)
    const normalizedD = ((D % 360) + 360) % 360; // Ensure positive 0-360
    const phase = normalizedD / 360;

    return {
      ra: this.normalizeAngle_(ra),
      dec,
      phase,
    };
  }

  /**
   * Calculate planet position using astronomy-engine library.
   * Falls back to Keplerian approximation if library unavailable.
   * @param {string} planetName - Name of the planet
   * @param {!Date} date - Date for calculation
   * @returns {?CelestialPosition} RA/Dec in degrees or null if invalid planet
   */
  calculatePlanetPosition(planetName, date) {
    // Check if astronomy-engine library is loaded
    if (typeof Astronomy !== 'undefined') {
      return this.calculatePlanetPositionVSOP_(planetName, date);
    }

    // Fall back to Keplerian approximation
    return this.calculatePlanetPositionKeplerian_(planetName, date);
  }

  /**
   * Calculate planet position using astronomy-engine (VSOP87).
   * @param {string} planetName - Name of the planet
   * @param {!Date} date - Date for calculation
   * @returns {?CelestialPosition} RA/Dec in degrees
   * @private
   */
  calculatePlanetPositionVSOP_(planetName, date) {
    try {
      const bodyMap = {
        Mercury: Astronomy.Body.Mercury,
        Venus: Astronomy.Body.Venus,
        Mars: Astronomy.Body.Mars,
        Jupiter: Astronomy.Body.Jupiter,
        Saturn: Astronomy.Body.Saturn,
        Uranus: Astronomy.Body.Uranus,
        Neptune: Astronomy.Body.Neptune,
      };

      const body = bodyMap[planetName];
      if (!body) return null;

      // Create Astronomy date from JavaScript Date
      const astroDate = Astronomy.MakeTime(date);

      // Create observer from location
      const observer = new Astronomy.Observer(
        this.observerLocation_.lat,
        this.observerLocation_.lon,
        this.observerLocation_.height
      );

      // Get equatorial coordinates (RA/Dec)
      // ofdate=false means J2000 coordinates, aberration=true includes light travel
      const equator = Astronomy.Equator(body, astroDate, observer, false, true);

      return {
        ra: equator.ra * ASTRONOMY.HOURS_TO_DEGREES, // Convert hours to degrees
        dec: equator.dec,
      };
    } catch (error) {
      console.warn(`Error calculating position for ${planetName}:`, error);
      return this.calculatePlanetPositionKeplerian_(planetName, date);
    }
  }

  /**
   * Calculate planet position using simplified Keplerian elements.
   * Used as fallback when astronomy-engine is unavailable.
   * @param {string} planetName - Name of the planet
   * @param {!Date} date - Date for calculation
   * @returns {?CelestialPosition} RA/Dec in degrees
   * @private
   */
  calculatePlanetPositionKeplerian_(planetName, date) {
    const elements = ORBITAL_ELEMENTS[planetName];
    if (!elements) return null;

    // Days since J2000.0
    const J2000 = new Date('2000-01-01T12:00:00Z');
    const daysSinceJ2000 = (date.getTime() - J2000.getTime()) / (1000 * 60 * 60 * 24);

    // Mean anomaly
    const meanAnomaly = (daysSinceJ2000 / elements.period) * 360;

    // Very rough approximation for RA
    const ra = this.normalizeAngle_(meanAnomaly + 280);

    // Approximate declination based on orbital inclination
    const dec = Math.sin(meanAnomaly * Math.PI / 180) *
                ASTRONOMY.OBLIQUITY_J2000 * (1 / elements.a);

    return {ra, dec};
  }

  /**
   * Get all planet positions for a date.
   * Uses caching to avoid redundant calculations.
   * @param {!Date} date - Date for calculation
   * @returns {!Object<string, !CelestialPosition>} Map of planet name to position
   */
  getAllPlanetPositions(date) {
    const now = date.getTime();

    // Check cache validity
    if (this.planetCache_ &&
        Math.abs(now - this.planetCache_.time) < this.cacheDuration_) {
      return this.planetCache_.positions;
    }

    const planets = [
      'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune',
    ];

    const positions = {};
    planets.forEach((name) => {
      const pos = this.calculatePlanetPosition(name, date);
      if (pos) {
        positions[name] = pos;
      }
    });

    // Cache results
    this.planetCache_ = {
      positions,
      time: now,
    };

    return positions;
  }

  /**
   * Get all solar system body positions including Sun and Moon.
   * @param {!Date} date - Date for calculation
   * @returns {!Object<string, CelestialPosition|MoonPosition>} Position map
   */
  getAllBodyPositions(date) {
    const positions = this.getAllPlanetPositions(date);
    positions.Sun = this.calculateSunPosition(date);
    positions.Moon = this.calculateMoonPosition(date);
    return positions;
  }

  /**
   * Convert JavaScript Date to Julian Date.
   * Delegates to CoordinateUtils for the calculation.
   * @param {!Date} date - Date to convert
   * @returns {number} Julian Date
   */
  dateToJulianDate(date) {
    return coordDateToJulianDate(date);
  }

  /**
   * Convert Julian Date to JavaScript Date.
   * Delegates to CoordinateUtils for the calculation.
   * @param {number} jd - Julian Date
   * @returns {!Date} JavaScript Date
   */
  julianDateToDate(jd) {
    return coordJulianDateToDate(jd);
  }

  /**
   * Calculate Local Sidereal Time.
   * Delegates to CoordinateUtils for the calculation.
   * @param {!Date} date - Observation date
   * @param {number} longitude - Observer longitude in degrees
   * @returns {number} LST in degrees (0-360)
   */
  calculateLST(date, longitude) {
    return coordCalculateLST(date, longitude);
  }

  /**
   * Calculate hour angle of an object.
   * @param {number} ra - Right Ascension in degrees
   * @param {!Date} date - Observation date
   * @param {number} longitude - Observer longitude in degrees
   * @returns {number} Hour angle in degrees
   */
  calculateHourAngle(ra, date, longitude) {
    const lst = this.calculateLST(date, longitude);
    return this.normalizeAngle_(lst - ra);
  }

  /**
   * Calculate altitude of an object from observer's location.
   * @param {number} ra - Right Ascension in degrees
   * @param {number} dec - Declination in degrees
   * @param {!Date} date - Observation date
   * @returns {number} Altitude in degrees
   */
  calculateAltitude(ra, dec, date) {
    const ha = this.calculateHourAngle(ra, date, this.observerLocation_.lon);

    const latRad = this.observerLocation_.lat * Math.PI / 180;
    const decRad = dec * Math.PI / 180;
    const haRad = ha * Math.PI / 180;

    const sinAlt = Math.sin(latRad) * Math.sin(decRad) +
                   Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad);

    return Math.asin(sinAlt) * 180 / Math.PI;
  }

  /**
   * Calculate azimuth of an object from observer's location.
   * @param {number} ra - Right Ascension in degrees
   * @param {number} dec - Declination in degrees
   * @param {!Date} date - Observation date
   * @returns {number} Azimuth in degrees (0 = North, 90 = East)
   */
  calculateAzimuth(ra, dec, date) {
    const ha = this.calculateHourAngle(ra, date, this.observerLocation_.lon);

    const latRad = this.observerLocation_.lat * Math.PI / 180;
    const decRad = dec * Math.PI / 180;
    const haRad = ha * Math.PI / 180;

    const y = Math.sin(haRad);
    const x = Math.cos(haRad) * Math.sin(latRad) -
              Math.tan(decRad) * Math.cos(latRad);

    const az = Math.atan2(y, x) * 180 / Math.PI;
    return this.normalizeAngle_(az + 180); // Convert to N=0 convention
  }

  /**
   * Check if an object is above the horizon.
   * @param {number} ra - Right Ascension in degrees
   * @param {number} dec - Declination in degrees
   * @param {!Date} date - Observation date
   * @returns {boolean} True if above horizon
   */
  isAboveHorizon(ra, dec, date) {
    return this.calculateAltitude(ra, dec, date) > 0;
  }

  /**
   * Normalize angle to 0-360 range.
   * @param {number} angle - Angle in degrees
   * @returns {number} Normalized angle
   * @private
   */
  normalizeAngle_(angle) {
    const normalized = angle % 360;
    return normalized < 0 ? normalized + 360 : normalized;
  }

  /**
   * Clear the planet position cache.
   */
  clearCache() {
    this.planetCache_ = null;
  }
}

/**
 * Singleton instance for application-wide astronomy calculations.
 * @const {!AstronomyCalculator}
 */
export const astronomyCalculator = new AstronomyCalculator();
