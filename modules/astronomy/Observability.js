/**
 * @fileoverview When things can be seen: rise, transit and set times, the
 * night's dark window, and altitude over a night. Built on astronomy-engine
 * (the global `Astronomy`), which handles precession, refraction and the
 * Moon's motion; every function returns null fields when it is unavailable.
 */

import {createLogger} from '../core/Logger.js';
import {PLANET_DEFAULTS} from './SolarSystem.js';

const logger = createLogger('Observability');

export const HOUR_MS = 3600 * 1000;
export const DAY_MS = 24 * HOUR_MS;

/** Recent nightWindow results; the info panel and Tonight panel share them. */
const nightCache = new Map();
const NIGHT_CACHE_SIZE = 8;

/** Sun altitude at the end of astronomical twilight, degrees. */
export const ASTRONOMICAL_TWILIGHT_DEG = -18;

/** Solar-system bodies the app tracks, which astronomy-engine knows by name. */
const BODY_NAMES = new Set(PLANET_DEFAULTS.map((p) => p.name));

/**
 * @param {{lat: number, lon: number, height: (number|undefined)}} location
 * @returns {!Object} Astronomy.Observer
 */
function observerFor(location) {
  return new Astronomy.Observer(location.lat, location.lon, location.height || 0);
}

/**
 * The astronomy-engine body for an object: a planet by name, or a fixed
 * point defined from its J2000 RA/Dec (degrees).
 * @param {{name: string, ra: number, dec: number}} obj
 * @returns {*} Astronomy.Body value
 */
function bodyFor(obj) {
  if (BODY_NAMES.has(obj.name)) return Astronomy.Body[obj.name];
  // Star1 is a single global slot, so define it right before each use.
  Astronomy.DefineStar(Astronomy.Body.Star1, obj.ra / 15, obj.dec, 1000);
  return Astronomy.Body.Star1;
}

/**
 * @param {?Object} astroTime - Astronomy.AstroTime or null
 * @returns {?Date}
 */
function toDate(astroTime) {
  return astroTime ? astroTime.date : null;
}

/**
 * Rise, highest point and set around a moment: the culmination nearest to
 * `date`, with the rise before it and the set after it.
 * @param {{name: string, ra: number, dec: number}} obj - Object (RA/Dec J2000)
 * @param {{lat: number, lon: number}} location - Observer
 * @param {!Date} date - Reference moment
 * @returns {?{rise: ?Date, transit: !Date, transitAltitude: number,
 *     set: ?Date, alwaysUp: boolean, neverUp: boolean}} Null if unavailable
 */
export function riseTransitSet(obj, location, date) {
  if (typeof Astronomy === 'undefined' || !location) return null;
  try {
    const observer = observerFor(location);
    const body = bodyFor(obj);
    const culmination = Astronomy.SearchHourAngle(body, observer, 0,
        new Date(date.getTime() - DAY_MS / 2));
    const transit = culmination.time.date;
    const transitAltitude = culmination.hor.altitude;
    const dayBefore = new Date(transit.getTime() - DAY_MS);
    const rise = toDate(Astronomy.SearchRiseSet(body, observer, +1, dayBefore, 1));
    const set = toDate(Astronomy.SearchRiseSet(body, observer, -1, transit, 1));
    return {
      rise,
      transit,
      transitAltitude,
      set,
      alwaysUp: !rise && !set && transitAltitude > 0,
      neverUp: transitAltitude <= 0,
    };
  } catch (error) {
    logger.warn(`Rise/set failed for ${obj.name}:`, error);
    return null;
  }
}

/**
 * The local noon that starts the night `date` belongs to: today's if it is
 * afternoon or evening, yesterday's in the small hours. Uses solar time
 * from the longitude, so it needs no time zone.
 * @param {!Date} date
 * @param {number} lon - Degrees east
 * @returns {!Date}
 */
export function nightStart(date, lon) {
  const offsetMs = lon / 15 * HOUR_MS;
  const localMs = date.getTime() + offsetMs;
  let noonMs = Math.floor(localMs / DAY_MS) * DAY_MS + DAY_MS / 2;
  if (noonMs > localMs) noonMs -= DAY_MS;
  return new Date(noonMs - offsetMs);
}

/**
 * The night `date` falls in: sunset, end of evening twilight, start of
 * morning twilight, sunrise, and the Moon's rise and set in between.
 * Fields are null when the event does not happen (summer at high latitude
 * never gets astronomically dark).
 * @param {{lat: number, lon: number}} location
 * @param {!Date} date
 * @returns {?{start: !Date, sunset: ?Date, dusk: ?Date, dawn: ?Date,
 *     sunrise: ?Date, moonrise: ?Date, moonset: ?Date}} Null if unavailable
 */
export function nightWindow(location, date) {
  if (typeof Astronomy === 'undefined' || !location) return null;
  const start = nightStart(date, location.lon);
  const key = `${location.lat.toFixed(3)},${location.lon.toFixed(3)},${start.getTime()}`;
  if (nightCache.has(key)) return nightCache.get(key);
  const night = computeNightWindow_(location, start);
  if (night) {
    if (nightCache.size >= NIGHT_CACHE_SIZE) nightCache.delete(nightCache.keys().next().value);
    nightCache.set(key, night);
  }
  return night;
}

/**
 * @param {{lat: number, lon: number}} location
 * @param {!Date} start - From nightStart
 * @returns {?Object} See nightWindow
 * @private
 */
function computeNightWindow_(location, start) {
  try {
    const observer = observerFor(location);
    const sun = Astronomy.Body.Sun;
    const sunset = toDate(Astronomy.SearchRiseSet(sun, observer, -1, start, 1));
    const sunrise = toDate(Astronomy.SearchRiseSet(sun, observer, +1, sunset || start, 1));
    const dusk = toDate(Astronomy.SearchAltitude(sun, observer, -1, start, 1,
        ASTRONOMICAL_TWILIGHT_DEG));
    const dawn = dusk ? toDate(Astronomy.SearchAltitude(sun, observer, +1, dusk, 1,
        ASTRONOMICAL_TWILIGHT_DEG)) : null;
    const moon = Astronomy.Body.Moon;
    return {
      start,
      sunset,
      dusk,
      dawn,
      sunrise,
      moonrise: toDate(Astronomy.SearchRiseSet(moon, observer, +1, start, 1)),
      moonset: toDate(Astronomy.SearchRiseSet(moon, observer, -1, start, 1)),
    };
  } catch (error) {
    logger.warn('Night window failed:', error);
    return null;
  }
}

/**
 * The span an altitude chart covers: sunset to sunrise with half an hour
 * either side, or 18:00 to 06:00 solar time where the Sun does not set or
 * rise that night.
 * @param {{start: !Date, sunset: ?Date, sunrise: ?Date}} night - From nightWindow
 * @returns {{from: !Date, to: !Date}}
 */
export function chartSpan(night) {
  const start = night.start.getTime();
  return {
    from: new Date((night.sunset?.getTime() ?? start + 6 * HOUR_MS) - HOUR_MS / 2),
    to: new Date((night.sunrise?.getTime() ?? start + 18 * HOUR_MS) + HOUR_MS / 2),
  };
}

/**
 * Altitude of an object at a moment, refraction included.
 * @param {!Object} body - Astronomy.Body (fixed points already defined)
 * @param {!Object} observer - Astronomy.Observer
 * @param {!Date} date
 * @returns {number} Degrees
 */
function altitudeOf(body, observer, date) {
  const eq = Astronomy.Equator(body, date, observer, true, true);
  return Astronomy.Horizon(date, observer, eq.ra, eq.dec, 'normal').altitude;
}

/**
 * Altitude samples between two moments.
 * @param {{name: string, ra: number, dec: number}} obj
 * @param {{lat: number, lon: number}} location
 * @param {!Date} from
 * @param {!Date} to
 * @param {number=} stepMinutes
 * @returns {!Array<{time: !Date, altitude: number}>} Empty if unavailable
 */
export function altitudeCurve(obj, location, from, to, stepMinutes = 15) {
  if (typeof Astronomy === 'undefined' || !location) return [];
  try {
    const observer = observerFor(location);
    const body = bodyFor(obj);
    const samples = [];
    for (let t = from.getTime(); t <= to.getTime(); t += stepMinutes * 60 * 1000) {
      const time = new Date(t);
      samples.push({time, altitude: altitudeOf(body, observer, time)});
    }
    return samples;
  } catch (error) {
    logger.warn(`Altitude curve failed for ${obj.name}:`, error);
    return [];
  }
}
