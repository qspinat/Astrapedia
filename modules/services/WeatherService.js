/**
 * @fileoverview Cloud forecast for the observing night, from Open-Meteo
 * (free, no account or key). Strictly optional: offline, on failure, or when
 * turned off, it returns null and everything else keeps working. The last
 * forecast is cached so the app has one outdoors without signal.
 *
 * Only the location, rounded to 0.1° (~10 km), is sent.
 */

import {safeGetJson, safeSetJson} from '../core/Utils.js';
import {createLogger} from '../core/Logger.js';

const logger = createLogger('WeatherService');

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const CACHE_KEY = 'astrapedia_weather_cache';
const ENABLED_KEY = 'astrapedia-weather-enabled';

/** Re-fetch a cached forecast older than this. */
const REFRESH_MS = 60 * 60 * 1000;

/** A cached forecast this old is too stale to show. */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

const HOURLY_FIELDS = ['cloud_cover', 'cloud_cover_low', 'cloud_cover_mid',
  'cloud_cover_high', 'relative_humidity_2m', 'dew_point_2m', 'temperature_2m',
  'wind_speed_10m'];

/**
 * One forecast hour.
 * @typedef {{time: !Date, cloudCover: number, cloudLow: number,
 *     cloudMid: number, cloudHigh: number, humidity: number,
 *     dewPoint: number, temperature: number, windSpeed: number}}
 */
let ForecastHour;

/**
 * Round a coordinate to 0.1 degrees.
 * @param {number} value
 * @returns {number}
 */
function coarse(value) {
  return Math.round(value * 10) / 10;
}

/**
 * Whether dew is likely to form on optics: air within 2 °C of its dew point.
 * @param {!ForecastHour} hour
 * @returns {boolean}
 */
export function dewRisk(hour) {
  return hour.temperature - hour.dewPoint < 2;
}

/**
 * Convert Open-Meteo's column arrays into one record per hour.
 * @param {!Object} json - API response
 * @returns {!Array<!ForecastHour>}
 */
export function parseForecast(json) {
  const h = json?.hourly;
  if (!h || !Array.isArray(h.time)) return [];
  // timeformat=unixtime: seconds since the epoch, no time-zone ambiguity.
  return h.time.map((t, i) => ({
    time: new Date(t * 1000),
    cloudCover: h.cloud_cover?.[i],
    cloudLow: h.cloud_cover_low?.[i],
    cloudMid: h.cloud_cover_mid?.[i],
    cloudHigh: h.cloud_cover_high?.[i],
    humidity: h.relative_humidity_2m?.[i],
    dewPoint: h.dew_point_2m?.[i],
    temperature: h.temperature_2m?.[i],
    windSpeed: h.wind_speed_10m?.[i],
  })).filter((hour) => Number.isFinite(hour.cloudCover));
}

/**
 * Fetches, caches and serves the hourly forecast.
 */
export class WeatherService {
  /**
   * @param {{fetch?: function(string): !Promise, now?: function(): number}=} deps -
   *     Injectable for tests
   */
  constructor(deps = {}) {
    /** @private @const */
    this.fetch_ = deps.fetch || ((url) => fetch(url));

    /** @private @const */
    this.now_ = deps.now || (() => Date.now());
  }

  /**
   * @returns {boolean} Whether forecasts are turned on (default on).
   */
  isEnabled() {
    return safeGetJson(ENABLED_KEY) !== false;
  }

  /**
   * Turn forecasts on or off; off also forgets the cached one.
   * @param {boolean} on
   */
  setEnabled(on) {
    safeSetJson(ENABLED_KEY, !!on);
    if (!on) safeSetJson(CACHE_KEY, null);
  }

  /**
   * The hourly forecast for a location: fresh when possible, else the cached
   * one if recent enough, else null.
   * @param {?{lat: number, lon: number}} location
   * @returns {!Promise<?Array<!ForecastHour>>}
   */
  async getForecast(location) {
    if (!this.isEnabled() || !location) return null;
    const lat = coarse(location.lat);
    const lon = coarse(location.lon);
    const cached = safeGetJson(CACHE_KEY);
    const cacheMatches = cached && cached.lat === lat && cached.lon === lon;
    const age = cacheMatches ? this.now_() - cached.fetchedAt : Infinity;

    if (age < REFRESH_MS) return parseForecast(cached.json);

    try {
      const url = `${ENDPOINT}?latitude=${lat}&longitude=${lon}` +
          `&hourly=${HOURLY_FIELDS.join(',')}&forecast_days=2&timeformat=unixtime`;
      const response = await this.fetch_(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      safeSetJson(CACHE_KEY, {lat, lon, fetchedAt: this.now_(), json});
      return parseForecast(json);
    } catch (error) {
      logger.debug(`Forecast unavailable: ${error.message}`);
      return age < MAX_AGE_MS ? parseForecast(cached.json) : null;
    }
  }
}

/**
 * Shared instance.
 * @const {!WeatherService}
 */
export const weatherService = new WeatherService();
