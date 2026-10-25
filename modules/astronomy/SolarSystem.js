/**
 * @fileoverview Solar system position calculations.
 * Contains algorithms for computing Sun, Moon, and planet positions.
 */

import {dateToJulianDate} from '../core/CoordinateUtils.js';
import {ASTRONOMY} from '../core/Constants.js';
import {createLogger} from '../core/Logger.js';

const logger = createLogger('SolarSystem');

/** @const {number} */
const J2000 = ASTRONOMY.J2000;

/** @const {number} */
const DAYS_PER_CENTURY = ASTRONOMY.DAYS_PER_CENTURY;

/**
 * Normalize angle to range [0, 360).
 * @param {number} angle - Angle in degrees
 * @returns {number} Normalized angle
 */
function normalizeAngle(angle) {
  let result = angle % 360;
  if (result < 0) result += 360;
  return result;
}

/**
 * Convert degrees to radians.
 * @param {number} degrees - Angle in degrees
 * @returns {number} Angle in radians
 */
function degToRad(degrees) {
  return degrees * Math.PI / 180;
}

/**
 * Convert radians to degrees.
 * @param {number} radians - Angle in radians
 * @returns {number} Angle in degrees
 */
function radToDeg(radians) {
  return radians * 180 / Math.PI;
}

/**
 * J2000 RA/Dec of a body from astronomy-engine, as seen by the observer.
 *
 * The catalog is J2000, so solar-system bodies must be too: the series
 * fallbacks below give equinox-of-date positions, which drift ~50"/yr
 * (~0.37° by 2026) against the stars — visible at telescope zoom.
 * @param {string} bodyName - astronomy-engine body name (e.g. 'Moon')
 * @param {!Date} date - Date for calculation
 * @param {?{lat: number, lon: number, height: number}} observer
 * @returns {?{ra: number, dec: number}} RA/Dec in degrees, or null when the
 *     library is unavailable or fails
 * @private
 */
function equatorJ2000_(bodyName, date, observer) {
  if (typeof Astronomy === 'undefined') return null;
  const body = Astronomy.Body[bodyName];
  if (!body) return null;
  try {
    const time = Astronomy.MakeTime(date);
    // Without an observer, use the geocentric position rather than one seen
    // from (0°, 0°), which would misplace the Moon by up to ~1° of parallax.
    // ofdate=false: J2000 frame; aberration=true: apparent position.
    const equator = observer ?
      Astronomy.Equator(body, time,
          new Astronomy.Observer(observer.lat, observer.lon, observer.height || 0),
          false, true) :
      Astronomy.EquatorFromVector(Astronomy.GeoVector(body, time, true));
    return {ra: equator.ra * ASTRONOMY.HOURS_TO_DEGREES, dec: equator.dec};
  } catch (error) {
    logger.warn(`Error calculating position for ${bodyName}:`, error);
    return null;
  }
}

/**
 * Calculate the Sun's position for a given date.
 * Uses astronomy-engine when loaded, else a simplified solar algorithm.
 * @param {!Date} date - Date for calculation
 * @param {?{lat: number, lon: number, height: number}=} observer
 * @returns {{ra: number, dec: number}} RA and Dec in degrees
 */
export function calculateSunPosition(date, observer = null) {
  const precise = equatorJ2000_('Sun', date, observer);
  if (precise) return precise;

  // Days since J2000.0 (January 1, 2000, 12:00 TT)
  const jd = dateToJulianDate(date);
  const n = jd - J2000;

  // Mean longitude of the Sun (degrees)
  let L = normalizeAngle(280.460 + 0.9856474 * n);

  // Mean anomaly of the Sun (degrees)
  let g = normalizeAngle(357.528 + 0.9856003 * n);
  const gRad = degToRad(g);

  // Ecliptic longitude of the Sun (degrees)
  const lambda = L + 1.915 * Math.sin(gRad) + 0.020 * Math.sin(2 * gRad);

  // Obliquity of the ecliptic (degrees)
  const epsilon = ASTRONOMY.OBLIQUITY_J2000 - 0.0000004 * n;
  const epsilonRad = degToRad(epsilon);
  const lambdaRad = degToRad(lambda);

  // Right Ascension and Declination
  const ra = radToDeg(
    Math.atan2(Math.cos(epsilonRad) * Math.sin(lambdaRad), Math.cos(lambdaRad))
  );
  const dec = radToDeg(Math.asin(Math.sin(epsilonRad) * Math.sin(lambdaRad)));

  return {
    ra: normalizeAngle(ra),
    dec: dec,
  };
}

/**
 * Calculate the Moon's position and phase for a given date.
 * Uses astronomy-engine when loaded (topocentric, so the ~1° lunar parallax
 * is included), else a simplified lunar algorithm with main perturbations.
 * @param {!Date} date - Date for calculation
 * @param {?{lat: number, lon: number, height: number}=} observer
 * @returns {{ra: number, dec: number, phase: number}} RA, Dec in degrees, phase 0-1
 */
export function calculateMoonPosition(date, observer = null) {
  const precise = equatorJ2000_('Moon', date, observer);
  if (precise) {
    // MoonPhase is the true Sun–Moon ecliptic elongation: 0 new, 180 full.
    return {...precise, phase: Astronomy.MoonPhase(Astronomy.MakeTime(date)) / 360};
  }

  const jd = dateToJulianDate(date);
  const T = (jd - J2000) / DAYS_PER_CENTURY; // Julian centuries since J2000.0

  // Moon's mean longitude (degrees)
  let L0 = normalizeAngle(
    218.3164477 + 481267.88123421 * T - 0.0015786 * T * T
  );

  // Moon's mean anomaly (degrees)
  let M = normalizeAngle(134.9633964 + 477198.8675055 * T + 0.0087414 * T * T);
  const Mrad = degToRad(M);

  // Moon's mean elongation from Sun (degrees)
  let D = normalizeAngle(297.8501921 + 445267.1114034 * T - 0.0018819 * T * T);
  const Drad = degToRad(D);

  // Moon's argument of latitude (degrees)
  let F = normalizeAngle(93.272095 + 483202.0175233 * T - 0.0036539 * T * T);
  const Frad = degToRad(F);

  // Sun's mean anomaly (degrees)
  let Ms = normalizeAngle(357.5291092 + 35999.0502909 * T - 0.0001536 * T * T);
  const Msrad = degToRad(Ms);

  // Main perturbations in longitude (simplified)
  const dL =
    6.289 * Math.sin(Mrad) + // Equation of center
    1.274 * Math.sin(2 * Drad - Mrad) + // Evection
    0.658 * Math.sin(2 * Drad) - // Variation
    0.186 * Math.sin(Msrad) - // Annual equation
    0.114 * Math.sin(2 * Frad); // Reduction to ecliptic

  // Ecliptic longitude
  const lambda = normalizeAngle(L0 + dL);

  // Ecliptic latitude (Moon's orbit inclined ~5.1 to ecliptic)
  const beta =
    5.128 * Math.sin(Frad) +
    0.281 * Math.sin(Mrad + Frad) -
    0.278 * Math.sin(Frad - Mrad) -
    0.173 * Math.sin(2 * Drad - Frad);

  // Convert from ecliptic to equatorial coordinates
  const lambdaRad = degToRad(lambda);
  const betaRad = degToRad(beta);

  // Obliquity of the ecliptic
  const epsilon = ASTRONOMY.OBLIQUITY_J2000 - 0.0000004 * (jd - J2000);
  const epsilonRad = degToRad(epsilon);

  // Right Ascension
  const ra = radToDeg(
    Math.atan2(
      Math.sin(lambdaRad) * Math.cos(epsilonRad) -
        Math.tan(betaRad) * Math.sin(epsilonRad),
      Math.cos(lambdaRad)
    )
  );

  // Declination
  const dec = radToDeg(
    Math.asin(
      Math.sin(betaRad) * Math.cos(epsilonRad) +
        Math.cos(betaRad) * Math.sin(epsilonRad) * Math.sin(lambdaRad)
    )
  );

  // Calculate Moon phase (0-1, where 0 = new moon, 0.5 = full moon)
  // D is the mean elongation from Sun: 0 at new moon, 180 at full moon
  const normalizedD = normalizeAngle(D);
  const phase = normalizedD / 360;

  return {
    ra: normalizeAngle(ra),
    dec: dec,
    phase: phase, // 0 = new moon, 0.5 = full moon
  };
}

/**
 * Approximate orbital elements for planets.
 * Used as fallback when astronomy-engine is not available.
 * @const {!Object<string, {period: number, a: number}>}
 */
const PLANET_ORBITAL_ELEMENTS = {
  Mercury: {period: 87.97, a: 0.387},
  Venus: {period: 224.7, a: 0.723},
  Mars: {period: 686.98, a: 1.524},
  Jupiter: {period: 4332.59, a: 5.203},
  Saturn: {period: 10759.22, a: 9.537},
  Uranus: {period: 30688.5, a: 19.191},
  Neptune: {period: 60182, a: 30.069},
};

/**
 * Calculate planet position using astronomy-engine (VSOP87).
 * Provides arcsecond-level accuracy for dates within millennia of J2000.
 * @param {string} planetName - Name of the planet
 * @param {!Date} date - Date for calculation
 * @param {?{lat: number, lon: number, height: number}} observer - Observer location
 * @returns {?{ra: number, dec: number}} Geocentric RA/Dec in degrees, or null
 */
export function calculatePlanetPosition(planetName, date, observer = null) {
  // Check if astronomy-engine library is loaded
  if (typeof Astronomy === 'undefined') {
    logger.warn('Astronomy library not loaded, using fallback');
    return calculatePlanetPositionFallback(planetName, date);
  }

  if (!PLANET_ORBITAL_ELEMENTS[planetName]) return null;
  return equatorJ2000_(planetName, date, observer) ??
      calculatePlanetPositionFallback(planetName, date);
}

/**
 * Fallback planet position calculation using simple Keplerian elements.
 * Used if astronomy-engine library fails to load.
 * @param {string} planetName - Name of the planet
 * @param {!Date} date - Date for calculation
 * @returns {?{ra: number, dec: number}} Approximate RA/Dec in degrees, or null
 */
export function calculatePlanetPositionFallback(planetName, date) {
  const planet = PLANET_ORBITAL_ELEMENTS[planetName];
  if (!planet) return null;

  // Very rough approximation based on orbital period
  const J2000_DATE = new Date('2000-01-01T12:00:00Z');
  const daysSinceJ2000 = (date - J2000_DATE) / (1000 * 60 * 60 * 24);
  const meanAnomaly = (daysSinceJ2000 / planet.period) * 360;

  // Approximate RA (this is very rough)
  const ra = normalizeAngle(meanAnomaly + 280);
  const dec = Math.sin(degToRad(meanAnomaly)) * ASTRONOMY.OBLIQUITY_J2000 *
    (1 / planet.a);

  return {ra, dec};
}

/**
 * Object type of a solar-system body, as the info panel and image lookup
 * expect it (TypeMappings renders 'Moon' as "Natural Satellite").
 * @param {string} name - 'Sun', 'Moon' or a planet name
 * @returns {string}
 */
export function solarSystemType(name) {
  if (name === 'Sun') return 'Star';
  if (name === 'Moon') return 'Moon';
  return 'Planet';
}

/**
 * The selectable object for a solar-system body, shared by click, tour and
 * any other path that shows one in the info panel.
 * @param {{name: string, ra: number, dec: number, mag: number,
 *     angularSize: number, phase: (number|undefined)}} body
 * @returns {!Object}
 */
export function toSelectablePlanet(body) {
  return {
    name: body.name,
    type: solarSystemType(body.name),
    // Only the Sun needs a qualifier; for the rest it repeated the type
    // ("Planet · Planet").
    subtype: body.name === 'Sun' ? 'Star (G2V)' : null,
    ra: body.ra,
    dec: body.dec,
    mag: body.mag,
    angularSize: body.angularSize,
    phase: body.phase,
  };
}

/**
 * Planet data with default angular sizes and colors.
 * Image URLs are fetched dynamically from PlanetImages.js.
 * @const {!Array<!Object>}
 */
export const PLANET_DEFAULTS = [
  {
    name: 'Sun',
    mag: -26.7,
    color: 0xffff00,
    angularSize: 32,
  },
  {
    name: 'Moon',
    mag: -12.7,
    color: 0xc0c0c0,
    angularSize: 31,
  },
  {
    name: 'Mercury',
    mag: 0.5,
    color: 0xb5b5b5,
    angularSize: 0.1,
  },
  {
    name: 'Venus',
    mag: -4.0,
    color: 0xfffacd,
    angularSize: 0.4,
  },
  {
    name: 'Mars',
    mag: 1.2,
    color: 0xcd5c5c,
    angularSize: 0.1,
  },
  {
    name: 'Jupiter',
    mag: -2.5,
    color: 0xffe4b5,
    angularSize: 0.7,
  },
  {
    name: 'Saturn',
    mag: 0.8,
    color: 0xf4d03f,
    angularSize: 0.3,
  },
  {
    name: 'Uranus',
    mag: 5.7,
    color: 0xafeeee,
    angularSize: 0.06,
  },
  {
    name: 'Neptune',
    mag: 7.9,
    color: 0x4169e1,
    angularSize: 0.04,
  },
];
