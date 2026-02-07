/**
 * @fileoverview Stateless coordinate conversion functions.
 * Extracted from skymap.js for reusability and testing.
 *
 * Note: Uses global THREE object loaded by app.html
 */

/**
 * Convert Right Ascension and Declination to 3D Cartesian coordinates.
 * @param {number} ra - Right Ascension in degrees (0-360)
 * @param {number} dec - Declination in degrees (-90 to +90)
 * @param {number} radius - Distance from origin
 * @returns {!THREE.Vector3} Cartesian position
 */
export const raDecToCartesian = (ra, dec, radius) => {
  const raRad = THREE.MathUtils.degToRad(ra);
  const decRad = THREE.MathUtils.degToRad(dec);

  // Spherical to Cartesian conversion
  // Note: Three.js uses a different coordinate system
  const x = radius * Math.cos(decRad) * Math.cos(raRad);
  const y = radius * Math.sin(decRad);
  const z = -radius * Math.cos(decRad) * Math.sin(raRad);

  return new THREE.Vector3(x, y, z);
};

/**
 * Convert Cartesian coordinates to Right Ascension and Declination.
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {number} z - Z coordinate
 * @returns {{ra: number, dec: number}} RA/Dec in degrees
 */
export const cartesianToRaDec = (x, y, z) => {
  const radius = Math.sqrt(x * x + y * y + z * z);
  const dec = Math.asin(y / radius);
  const ra = Math.atan2(-z, x);

  const raDegrees = THREE.MathUtils.radToDeg(ra);
  const normalizedRa = raDegrees < 0 ? raDegrees + 360 : raDegrees;

  return {
    ra: normalizedRa % 360,
    dec: THREE.MathUtils.radToDeg(dec),
  };
};

/**
 * Degrees to radians conversion factor.
 * @const {number}
 */
const DEG_TO_RAD = Math.PI / 180;

/**
 * Radians to degrees conversion factor.
 * @const {number}
 */
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Calculate angular distance between two celestial positions.
 * Uses the Haversine formula for numerical stability.
 * Does not depend on THREE.js for testability.
 * @param {number} ra1 - RA of first position in degrees
 * @param {number} dec1 - Dec of first position in degrees
 * @param {number} ra2 - RA of second position in degrees
 * @param {number} dec2 - Dec of second position in degrees
 * @returns {number} Angular distance in degrees
 */
export const angularDistance = (ra1, dec1, ra2, dec2) => {
  const ra1Rad = ra1 * DEG_TO_RAD;
  const dec1Rad = dec1 * DEG_TO_RAD;
  const ra2Rad = ra2 * DEG_TO_RAD;
  const dec2Rad = dec2 * DEG_TO_RAD;

  const dRa = ra2Rad - ra1Rad;
  const dDec = dec2Rad - dec1Rad;

  const a = Math.sin(dDec / 2) ** 2 +
            Math.cos(dec1Rad) * Math.cos(dec2Rad) * Math.sin(dRa / 2) ** 2;

  const c = 2 * Math.asin(Math.sqrt(a));
  return c * RAD_TO_DEG;
};

/**
 * Convert world coordinates to celestial direction.
 * Transforms from Three.js world space to celestial RA/Dec.
 * @param {!THREE.Vector3} worldPos - Position in world coordinates
 * @param {?THREE.Object3D} celestialSphere - The celestial sphere object
 * @returns {{ra: number, dec: number}} RA/Dec in degrees
 */
export const worldToCelestialDirection = (worldPos, celestialSphere) => {
  // Direction from origin to position in world coordinates
  const dir = worldPos.clone().normalize();

  // Transform to celestial coordinates by applying inverse of
  // celestialSphere's transformation
  const celestialDir = dir.clone();
  if (celestialSphere) {
    celestialSphere.updateMatrixWorld();
    const inverseMatrix = new THREE.Matrix4()
        .copy(celestialSphere.matrixWorld)
        .invert();
    const rotationMatrix = new THREE.Matrix3().setFromMatrix4(inverseMatrix);
    celestialDir.applyMatrix3(rotationMatrix);
  }

  return cartesianToRaDec(celestialDir.x, celestialDir.y, celestialDir.z);
};

/**
 * Format an angle with appropriate precision (degrees, arcminutes, arcseconds).
 * @param {number} degrees - Angle in degrees
 * @returns {string} Formatted angle string
 */
export const formatAngle = (degrees) => {
  if (degrees >= 1) {
    return `${degrees.toFixed(1)}°`;
  } else if (degrees >= 1 / 60) {
    const arcmin = degrees * 60;
    if (arcmin >= 10) {
      return `${arcmin.toFixed(0)}'`;
    }
    return `${arcmin.toFixed(1)}'`;
  }
  const arcsec = degrees * 3600;
  return `${arcsec.toFixed(0)}"`;
};

/**
 * Normalize Right Ascension to range [0, 360).
 * @param {number} ra - RA in degrees
 * @returns {number} Normalized RA
 */
export const normalizeRA = (ra) => {
  const normalized = ra % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

/**
 * Clamp Declination to range [-90, 90].
 * @param {number} dec - Dec in degrees
 * @returns {number} Clamped Dec
 */
export const clampDec = (dec) => {
  return Math.max(-90, Math.min(90, dec));
};

/**
 * Convert Julian Date to JavaScript Date.
 * @param {number} jd - Julian Date
 * @returns {!Date} JavaScript Date object
 */
export const julianDateToDate = (jd) => {
  // JD to Unix timestamp (JD 2440587.5 = Unix epoch)
  const unixTimestamp = (jd - 2440587.5) * 86400 * 1000;
  return new Date(unixTimestamp);
};

/**
 * Convert JavaScript Date to Julian Date.
 * @param {!Date} date - JavaScript Date object
 * @returns {number} Julian Date
 */
export const dateToJulianDate = (date) => {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();
  const second = date.getUTCSeconds();

  const y = month <= 2 ? year - 1 : year;
  const m = month <= 2 ? month + 12 : month;

  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);

  const jd = Math.floor(365.25 * (y + 4716)) +
             Math.floor(30.6001 * (m + 1)) +
             day + B - 1524.5 +
             (hour + minute / 60 + second / 3600) / 24;

  return jd;
};

/**
 * Calculate Local Sidereal Time in degrees (0-360).
 * @param {!Date} date - Observation date
 * @param {number} longitude - Observer longitude in degrees (east positive)
 * @returns {number} LST in degrees
 */
export const calculateLST = (date, longitude) => {
  const jd = dateToJulianDate(date);
  const T = (jd - 2451545.0) / 36525; // Julian centuries since J2000.0

  // Greenwich Mean Sidereal Time at 0h UT (in degrees)
  const gmstRaw = 280.46061837 + 360.98564736629 * (jd - 2451545.0) +
                  0.000387933 * T * T - T * T * T / 38710000;

  // Normalize to 0-360
  const gmstMod = gmstRaw % 360;
  const gmst = gmstMod < 0 ? gmstMod + 360 : gmstMod;

  // Local Sidereal Time = GMST + observer's longitude
  const lstRaw = gmst + longitude;
  const lstMod = lstRaw % 360;
  const lst = lstMod < 0 ? lstMod + 360 : lstMod;

  return lst;
};

/**
 * Compute the center RA/Dec of a constellation from its line star pairs.
 * Uses circular mean for RA to handle wrap-around at 0/360.
 * @param {!Object} constData - Constellation data with `lines` array of star ID pairs
 * @param {function(number): ?Object} getStarById - Lookup returning star with {ra, dec}
 * @returns {{ra: number, dec: number}} Center coordinates
 */
export const constellationCenter = (constData, getStarById) => {
  if (constData?.ra !== undefined && constData?.dec !== undefined) {
    return {ra: constData.ra, dec: constData.dec};
  }

  if (!constData?.lines || constData.lines.length === 0) {
    console.warn('constellationCenter: no line data, falling back to (0, 0)');
    return {ra: 0, dec: 0};
  }

  const starIds = new Set();
  for (const pair of constData.lines) {
    if (Array.isArray(pair)) {
      pair.forEach((id) => starIds.add(id));
    }
  }

  let sumX = 0;
  let sumY = 0;
  let sumDec = 0;
  let count = 0;

  for (const id of starIds) {
    const star = getStarById(id);
    if (star?.ra !== undefined && star?.dec !== undefined) {
      const raRad = star.ra * DEG_TO_RAD;
      sumX += Math.cos(raRad);
      sumY += Math.sin(raRad);
      sumDec += star.dec;
      count++;
    }
  }

  if (count === 0) {
    console.warn('constellationCenter: no matching stars found, falling back to (0, 0)');
    return {ra: 0, dec: 0};
  }

  let meanRa = Math.atan2(sumY / count, sumX / count) * RAD_TO_DEG;
  if (meanRa < 0) meanRa += 360;

  return {ra: meanRa, dec: sumDec / count};
};
