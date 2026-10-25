/**
 * @fileoverview Ranks what is worth looking at tonight: each object's
 * altitude is followed through the dark window (not just at one instant),
 * and objects are scored on how high they climb, how far they are above the
 * observer's limiting magnitude, and how much the Moon washes them out.
 */

import {angularDistance, calculateAltitude, calculateLST} from '../core/CoordinateUtils.js';
import {EXCLUDE_STELLAR_TYPES} from './VisibilityCalculator.js';
import {toSelectablePlanet} from '../astronomy/SolarSystem.js';
import {toSelectableDso} from '../interaction/ClickHandler.js';

const HOUR_MS = 3600 * 1000;

/** Altitude samples per hour of the window. */
const SAMPLES_PER_HOUR = 2;

/** Lowest peak altitude worth listing, degrees. */
export const MIN_PEAK_ALTITUDE = 20;

/** Catalog types in each filter category. */
export const CATEGORIES = {
  planets: new Set(['Planet']),
  galaxies: new Set(['G', 'GPair', 'GTrpl', 'GGroup']),
  nebulae: new Set(['EmN', 'RfN', 'PN', 'HII', 'SNR', 'Neb', 'Cl+N', 'DrkN']),
  clusters: new Set(['OCl', 'GCl']),
};

/**
 * The span to plan over: astronomical darkness, or from an hour after
 * sunset to an hour before sunrise when the sky never gets fully dark.
 * @param {?{dusk: ?Date, dawn: ?Date, sunset: ?Date, sunrise: ?Date, start: !Date}} night
 * @returns {?{from: !Date, to: !Date, fullyDark: boolean}} Null if the Sun
 *     never sets
 */
export function planningWindow(night) {
  if (!night) return null;
  if (night.dusk && night.dawn) return {from: night.dusk, to: night.dawn, fullyDark: true};
  if (night.sunset && night.sunrise) {
    return {
      from: new Date(night.sunset.getTime() + HOUR_MS),
      to: new Date(night.sunrise.getTime() - HOUR_MS),
      fullyDark: false,
    };
  }
  return null;
}

/**
 * Highest altitude an object reaches in the window, and when.
 * @param {{ra: number, dec: number}} obj
 * @param {number} lat
 * @param {!Array<{time: !Date, lst: number}>} samples
 * @returns {{altitude: number, time: !Date}}
 */
function peakOf(obj, lat, samples) {
  let best = {altitude: -90, time: samples[0].time};
  for (const {time, lst} of samples) {
    const altitude = calculateAltitude(obj.ra, obj.dec, lat, lst);
    if (altitude > best.altitude) best = {altitude, time};
  }
  return best;
}

/**
 * Rank tonight's targets.
 * @param {!Object} input
 * @param {{lat: number, lon: number}} input.location
 * @param {{from: !Date, to: !Date}} input.window - From planningWindow
 * @param {number} input.limitMag - Faintest magnitude the observer can see
 * @param {!Array<!Object>} input.planets - Planet records (name, ra, dec, mag)
 * @param {!Array<!Object>} input.dsos - Deep-sky catalog records
 * @param {?{ra: number, dec: number, illumination: number}=} input.moon
 * @returns {!Array<{object: !Object, category: string, peakAltitude: number,
 *     bestTime: !Date, score: number}>} Best first
 */
export function rankTonight({location, window, limitMag, planets, dsos, moon = null}) {
  const hours = (window.to.getTime() - window.from.getTime()) / HOUR_MS;
  const count = Math.max(2, Math.ceil(hours * SAMPLES_PER_HOUR) + 1);
  const step = (window.to.getTime() - window.from.getTime()) / (count - 1);
  const samples = Array.from({length: count}, (_, i) => {
    const time = new Date(window.from.getTime() + i * step);
    return {time, lst: calculateLST(time, location.lon)};
  });

  const candidates = [
    ...planets.filter((p) => p.name !== 'Sun' && p.name !== 'Moon' && p.mag < 6)
        .map((p) => ({object: toSelectablePlanet(p), category: 'planets', type: 'Planet'})),
    ...dsos.filter((d) => Number.isFinite(d.mag) && d.mag <= limitMag &&
        !EXCLUDE_STELLAR_TYPES.includes(d.type))
        .map((d) => ({object: toSelectableDso(d), category: categoryOf(d.type), type: d.type})),
  ];

  const ranked = [];
  for (const {object, category, type} of candidates) {
    const peak = peakOf(object, location.lat, samples);
    if (peak.altitude < MIN_PEAK_ALTITUDE) continue;
    ranked.push({
      object,
      category,
      peakAltitude: peak.altitude,
      bestTime: peak.time,
      score: scoreOf(object, type, peak.altitude, limitMag, moon),
    });
  }
  return ranked.sort((a, b) => b.score - a.score);
}

/**
 * @param {string} type - Catalog type
 * @returns {string} Category key, or 'other'
 */
function categoryOf(type) {
  for (const [key, types] of Object.entries(CATEGORIES)) {
    if (types.has(type)) return key;
  }
  return 'other';
}

/**
 * How rewarding an object is tonight. Height matters through the airmass it
 * avoids (sin of altitude); brightness by the margin over the limit; a
 * bright Moon nearby hurts faint diffuse objects, not planets.
 * @param {{ra: number, dec: number, mag: number}} object
 * @param {string} type
 * @param {number} peakAltitude
 * @param {number} limitMag
 * @param {?{ra: number, dec: number, illumination: number}} moon
 * @returns {number}
 */
function scoreOf(object, type, peakAltitude, limitMag, moon) {
  const height = Math.sin(peakAltitude * Math.PI / 180);
  const margin = Math.max(0.5, limitMag - object.mag + 1);
  if (type === 'Planet') return height * (margin + 4);
  let moonFactor = 1;
  if (moon) {
    const separation = angularDistance(object.ra, object.dec, moon.ra, moon.dec);
    moonFactor = 1 - 0.6 * moon.illumination * Math.max(0, 1 - separation / 90);
  }
  return height * margin * moonFactor;
}
