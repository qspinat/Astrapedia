/**
 * @fileoverview Solar system position calculations.
 * Contains algorithms for computing Sun, Moon, and planet positions.
 */

import {dateToJulianDate} from '../core/CoordinateUtils.js';

/**
 * Julian Date of J2000.0 epoch.
 * @const {number}
 */
const J2000 = 2451545.0;

/**
 * Days per Julian century.
 * @const {number}
 */
const DAYS_PER_CENTURY = 36525;

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
 * Calculate Sun's geocentric position for a given date.
 * Uses simplified solar position algorithm.
 * @param {!Date} date - Date for calculation
 * @returns {{ra: number, dec: number}} RA and Dec in degrees
 */
export function calculateSunPosition(date) {
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
  const epsilon = 23.439 - 0.0000004 * n;
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
 * Calculate Moon's geocentric position for a given date.
 * Uses simplified lunar position algorithm with main perturbations.
 * @param {!Date} date - Date for calculation
 * @returns {{ra: number, dec: number, phase: number}} RA, Dec in degrees, phase 0-1
 */
export function calculateMoonPosition(date) {
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
  const epsilon = 23.439 - 0.0000004 * (jd - J2000);
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
    console.warn('Astronomy library not loaded, using fallback');
    return calculatePlanetPositionFallback(planetName, date);
  }

  try {
    // Map planet names to astronomy-engine body names
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

    // Create observer from location (required by newer astronomy-engine versions)
    const astroObserver = new Astronomy.Observer(
      observer?.lat || 0,
      observer?.lon || 0,
      observer?.height || 0
    );

    // Get equatorial coordinates (RA/Dec) for the planet
    // ofdate=false means J2000 coordinates, aberration=true includes light travel time
    const equator = Astronomy.Equator(body, astroDate, astroObserver, false, true);

    return {
      ra: equator.ra * 15, // Convert hours to degrees
      dec: equator.dec,
    };
  } catch (error) {
    console.warn(`Error calculating position for ${planetName}:`, error);
    return calculatePlanetPositionFallback(planetName, date);
  }
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
  const dec = Math.sin(degToRad(meanAnomaly)) * 23.4 * (1 / planet.a);

  return {ra, dec};
}

/**
 * Planet data with default angular sizes and colors.
 * @const {!Array<!Object>}
 */
export const PLANET_DEFAULTS = [
  {
    name: 'Sun',
    mag: -26.7,
    color: 0xffff00,
    angularSize: 32,
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/The_Sun_by_the_Atmospheric_Imaging_Assembly_of_NASA%27s_Solar_Dynamics_Observatory_-_20100819.jpg/480px-The_Sun_by_the_Atmospheric_Imaging_Assembly_of_NASA%27s_Solar_Dynamics_Observatory_-_20100819.jpg',
  },
  {
    name: 'Moon',
    mag: -12.7,
    color: 0xc0c0c0,
    angularSize: 31,
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/FullMoon2010.jpg/480px-FullMoon2010.jpg',
  },
  {
    name: 'Mercury',
    mag: 0.5,
    color: 0xb5b5b5,
    angularSize: 0.1,
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Mercury_in_true_color.jpg/480px-Mercury_in_true_color.jpg',
  },
  {
    name: 'Venus',
    mag: -4.0,
    color: 0xfffacd,
    angularSize: 0.4,
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Venus_from_Mariner_10.jpg/480px-Venus_from_Mariner_10.jpg',
  },
  {
    name: 'Mars',
    mag: 1.2,
    color: 0xcd5c5c,
    angularSize: 0.1,
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Mars_-_August_30_2021_-_Flickr_-_Kevin_M._Gill.png/480px-Mars_-_August_30_2021_-_Flickr_-_Kevin_M._Gill.png',
  },
  {
    name: 'Jupiter',
    mag: -2.5,
    color: 0xffe4b5,
    angularSize: 0.7,
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/Jupiter_and_its_shrunken_Great_Red_Spot.jpg/480px-Jupiter_and_its_shrunken_Great_Red_Spot.jpg',
  },
  {
    name: 'Saturn',
    mag: 0.8,
    color: 0xf4d03f,
    angularSize: 0.3,
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Saturn_during_Equinox.jpg/480px-Saturn_during_Equinox.jpg',
  },
  {
    name: 'Uranus',
    mag: 5.7,
    color: 0xafeeee,
    angularSize: 0.06,
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Uranus2.jpg/480px-Uranus2.jpg',
  },
  {
    name: 'Neptune',
    mag: 7.9,
    color: 0x4169e1,
    angularSize: 0.04,
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Neptune_-_Voyager_2_%2829347980845%29_flatten_crop.jpg/480px-Neptune_-_Voyager_2_%2829347980845%29_flatten_crop.jpg',
  },
];

/**
 * Calculate all solar system positions for a given date.
 * @param {!Date} date - Date for calculation
 * @param {?{lat: number, lon: number, height: number}} observer - Observer location
 * @returns {!Array<!Object>} Array of planet data with positions
 */
export function calculateAllSolarSystemPositions(date, observer = null) {
  const sunPos = calculateSunPosition(date);
  const moonPos = calculateMoonPosition(date);

  const planets = [];

  // Sun
  const sunData = {...PLANET_DEFAULTS.find((p) => p.name === 'Sun')};
  sunData.ra = sunPos.ra;
  sunData.dec = sunPos.dec;
  planets.push(sunData);

  // Moon
  const moonData = {...PLANET_DEFAULTS.find((p) => p.name === 'Moon')};
  moonData.ra = moonPos.ra;
  moonData.dec = moonPos.dec;
  moonData.phase = moonPos.phase;
  planets.push(moonData);

  // Planets
  const planetNames = [
    'Mercury',
    'Venus',
    'Mars',
    'Jupiter',
    'Saturn',
    'Uranus',
    'Neptune',
  ];

  for (const name of planetNames) {
    const pos = calculatePlanetPosition(name, date, observer) || {ra: 0, dec: 0};
    const defaults = PLANET_DEFAULTS.find((p) => p.name === name);
    planets.push({
      ...defaults,
      ra: pos.ra,
      dec: pos.dec,
    });
  }

  return planets;
}
