/**
 * @fileoverview Location management service for observer position.
 * Handles geolocation, manual location setting, and coordinate storage.
 */

import {globalEventBus, Events} from '../core/EventBus.js';
import {DEFAULT_LOCATION} from '../core/Constants.js';

/**
 * @typedef {{
 *   lat: number,
 *   lon: number,
 *   height: number
 * }}
 */
let ObserverLocation;

/**
 * Local storage key for saved location.
 * @const {string}
 */
const STORAGE_KEY = 'skymap_observer_location';

/**
 * LocationManager handles observer location management.
 */
export class LocationManager {
  /**
   * Creates a new LocationManager instance.
   */
  constructor() {
    /**
     * Current observer location.
     * @private {!ObserverLocation}
     */
    this.location_ = this.loadSavedLocation_() || {
      lat: DEFAULT_LOCATION.LATITUDE,
      lon: DEFAULT_LOCATION.LONGITUDE,
      height: DEFAULT_LOCATION.HEIGHT,
    };

    /**
     * Whether geolocation is available.
     * @private {boolean}
     */
    this.geolocationAvailable_ = 'geolocation' in navigator;

    /**
     * Whether geolocation is currently being requested.
     * @private {boolean}
     */
    this.requesting_ = false;

    /**
     * Last geolocation error.
     * @private {?GeolocationPositionError}
     */
    this.lastError_ = null;
  }

  /**
   * Get current observer location.
   * @returns {!ObserverLocation} Current location
   */
  getLocation() {
    return {...this.location_};
  }

  /**
   * Get latitude in degrees.
   * @returns {number} Latitude
   */
  getLatitude() {
    return this.location_.lat;
  }

  /**
   * Get longitude in degrees.
   * @returns {number} Longitude
   */
  getLongitude() {
    return this.location_.lon;
  }

  /**
   * Get height in meters.
   * @returns {number} Height
   */
  getHeight() {
    return this.location_.height;
  }

  /**
   * Set observer location manually.
   * @param {number} lat - Latitude in degrees (-90 to 90)
   * @param {number} lon - Longitude in degrees (-180 to 180)
   * @param {number=} height - Height in meters (default 0)
   */
  setLocation(lat, lon, height = 0) {
    // Validate latitude
    const safeLat = Math.max(-90, Math.min(90, parseFloat(lat)));
    if (isNaN(safeLat)) {
      console.error('Invalid latitude:', lat);
      return;
    }

    // Validate longitude
    let safeLon = parseFloat(lon);
    if (isNaN(safeLon)) {
      console.error('Invalid longitude:', lon);
      return;
    }
    // Normalize longitude to -180 to 180
    while (safeLon > 180) safeLon -= 360;
    while (safeLon < -180) safeLon += 360;

    // Validate height
    const safeHeight = parseFloat(height);
    if (isNaN(safeHeight)) {
      console.error('Invalid height:', height);
      return;
    }

    this.location_ = {
      lat: safeLat,
      lon: safeLon,
      height: safeHeight,
    };

    this.saveLocation_();

    globalEventBus.emit(Events.LOCATION_CHANGED, {
      location: this.getLocation(),
      source: 'manual',
    });
  }

  /**
   * Request location from browser geolocation API.
   * @returns {!Promise<!ObserverLocation>} Promise resolving to location
   */
  async requestGeolocation() {
    if (!this.geolocationAvailable_) {
      const error = new Error('Geolocation not available');
      globalEventBus.emit(Events.LOCATION_ERROR, {error});
      throw error;
    }

    if (this.requesting_) {
      return this.location_;
    }

    this.requesting_ = true;
    this.lastError_ = null;

    try {
      const position = await this.getCurrentPosition_();

      this.location_ = {
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        height: position.coords.altitude || 0,
      };

      this.saveLocation_();

      globalEventBus.emit(Events.LOCATION_CHANGED, {
        location: this.getLocation(),
        source: 'geolocation',
        accuracy: position.coords.accuracy,
      });

      return this.getLocation();
    } catch (error) {
      this.lastError_ = error;
      globalEventBus.emit(Events.LOCATION_ERROR, {error});
      throw error;
    } finally {
      this.requesting_ = false;
    }
  }

  /**
   * Get current position as a Promise.
   * @returns {!Promise<!GeolocationPosition>} Position promise
   * @private
   */
  getCurrentPosition_() {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        resolve,
        reject,
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000, // Cache for 5 minutes
        }
      );
    });
  }

  /**
   * Check if geolocation is available.
   * @returns {boolean} True if available
   */
  isGeolocationAvailable() {
    return this.geolocationAvailable_;
  }

  /**
   * Check if currently requesting geolocation.
   * @returns {boolean} True if requesting
   */
  isRequesting() {
    return this.requesting_;
  }

  /**
   * Get last geolocation error.
   * @returns {?GeolocationPositionError} Last error or null
   */
  getLastError() {
    return this.lastError_;
  }

  /**
   * Get location display string.
   * @returns {string} Formatted location string
   */
  getDisplayString() {
    const lat = this.location_.lat;
    const lon = this.location_.lon;

    const latDir = lat >= 0 ? 'N' : 'S';
    const lonDir = lon >= 0 ? 'E' : 'W';

    return `${Math.abs(lat).toFixed(2)}°${latDir}, ` +
           `${Math.abs(lon).toFixed(2)}°${lonDir}`;
  }

  /**
   * Calculate Local Sidereal Time for current location.
   * @param {!Date} date - Date to calculate for
   * @returns {number} LST in degrees (0-360)
   */
  calculateLST(date) {
    const jd = this.dateToJulianDate_(date);
    const T = (jd - 2451545.0) / 36525;

    // Greenwich Mean Sidereal Time
    const gmstRaw = 280.46061837 + 360.98564736629 * (jd - 2451545.0) +
                    0.000387933 * T * T - T * T * T / 38710000;

    const gmstMod = gmstRaw % 360;
    const gmst = gmstMod < 0 ? gmstMod + 360 : gmstMod;

    // Local Sidereal Time
    const lstRaw = gmst + this.location_.lon;
    const lstMod = lstRaw % 360;
    return lstMod < 0 ? lstMod + 360 : lstMod;
  }

  /**
   * Convert JavaScript Date to Julian Date.
   * @param {!Date} date - Date to convert
   * @returns {number} Julian Date
   * @private
   */
  dateToJulianDate_(date) {
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

    return Math.floor(365.25 * (y + 4716)) +
           Math.floor(30.6001 * (m + 1)) +
           day + B - 1524.5 +
           (hour + minute / 60 + second / 3600) / 24;
  }

  /**
   * Calculate altitude of an object at current location.
   * @param {number} ra - Right Ascension in degrees
   * @param {number} dec - Declination in degrees
   * @param {!Date} date - Date for calculation
   * @returns {number} Altitude in degrees
   */
  calculateAltitude(ra, dec, date) {
    const lst = this.calculateLST(date);
    const ha = lst - ra; // Hour angle

    const latRad = this.location_.lat * Math.PI / 180;
    const decRad = dec * Math.PI / 180;
    const haRad = ha * Math.PI / 180;

    const sinAlt = Math.sin(latRad) * Math.sin(decRad) +
                   Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad);

    return Math.asin(sinAlt) * 180 / Math.PI;
  }

  /**
   * Check if an object is above the horizon.
   * @param {number} ra - Right Ascension in degrees
   * @param {number} dec - Declination in degrees
   * @param {!Date} date - Date for calculation
   * @returns {boolean} True if above horizon
   */
  isAboveHorizon(ra, dec, date) {
    return this.calculateAltitude(ra, dec, date) > 0;
  }

  /**
   * Save location to localStorage.
   * @private
   */
  saveLocation_() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.location_));
    } catch (error) {
      console.warn('Failed to save location:', error);
    }
  }

  /**
   * Load saved location from localStorage.
   * @returns {?ObserverLocation} Saved location or null
   * @private
   */
  loadSavedLocation_() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const location = JSON.parse(saved);
        if (typeof location.lat === 'number' &&
            typeof location.lon === 'number') {
          return {
            lat: location.lat,
            lon: location.lon,
            height: location.height || 0,
          };
        }
      }
    } catch (error) {
      console.warn('Failed to load saved location:', error);
    }
    return null;
  }

  /**
   * Reset to default location.
   */
  resetToDefault() {
    this.location_ = {
      lat: DEFAULT_LOCATION.LATITUDE,
      lon: DEFAULT_LOCATION.LONGITUDE,
      height: DEFAULT_LOCATION.HEIGHT,
    };

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      // Ignore
    }

    globalEventBus.emit(Events.LOCATION_CHANGED, {
      location: this.getLocation(),
      source: 'reset',
    });
  }

  /**
   * Get latitude tilt angle for celestial sphere.
   * @returns {number} Tilt angle in radians
   */
  getLatitudeTilt() {
    return (90 - this.location_.lat) * Math.PI / 180;
  }
}

/**
 * Singleton instance for application-wide location management.
 * @const {!LocationManager}
 */
export const locationManager = new LocationManager();
