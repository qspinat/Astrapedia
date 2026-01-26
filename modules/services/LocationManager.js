/**
 * @fileoverview Location management service for observer position.
 * Handles geolocation, manual location setting, and coordinate storage.
 */

import {globalEventBus, Events} from '../core/EventBus.js';
import {DEFAULT_LOCATION} from '../core/Constants.js';
import {dateToJulianDate} from '../core/CoordinateUtils.js';

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
    const jd = dateToJulianDate(date);
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

  /**
   * Check and request location permission on startup.
   * Uses Permissions API to check state before prompting.
   * @param {function(): void=} onLocationGranted - Callback when location is granted
   */
  async requestLocationOnStartup(onLocationGranted) {
    if (!this.geolocationAvailable_) {
      return; // Silently fail if not supported
    }

    this.onLocationGrantedCallback_ = onLocationGranted;

    // Check permission state using Permissions API (if available)
    if ('permissions' in navigator) {
      try {
        const permission = await navigator.permissions.query({name: 'geolocation'});

        if (permission.state === 'granted') {
          // Already granted - get location silently
          this.getLocationSilently_();
        } else if (permission.state === 'prompt') {
          // Not yet asked - show a friendly prompt first
          this.showLocationPrompt_();
        } else if (permission.state === 'denied') {
          // Previously denied - show how to enable
          console.log('Location permission was previously denied');
        }

        // Listen for permission changes
        permission.addEventListener('change', () => {
          if (permission.state === 'granted') {
            this.getLocationSilently_();
          }
        });
      } catch (e) {
        // Permissions API not fully supported, try showing prompt
        this.showLocationPrompt_();
      }
    } else {
      // No Permissions API, show prompt
      this.showLocationPrompt_();
    }
  }

  /**
   * Show a friendly prompt asking user for location permission.
   * @private
   */
  showLocationPrompt_() {
    // Create a non-blocking prompt dialog
    const dialog = document.createElement('div');
    dialog.className = 'location-prompt-dialog';
    dialog.innerHTML = `
      <div class="location-prompt-content">
        <div class="location-prompt-icon">📍</div>
        <h3>Enable Location?</h3>
        <p>SkyMap can show you the exact sky visible from your location right now.</p>
        <div class="location-prompt-buttons">
          <button class="location-prompt-btn location-prompt-btn--secondary" id="location-skip">
            Not now
          </button>
          <button class="location-prompt-btn location-prompt-btn--primary" id="location-allow">
            Allow
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);

    this.addPromptStyles_();

    document.getElementById('location-skip').addEventListener('click', () => {
      dialog.remove();
    });

    document.getElementById('location-allow').addEventListener('click', () => {
      dialog.remove();
      this.requestGeolocationWithUI_();
    });
  }

  /**
   * Show help dialog when location permission was denied.
   */
  showLocationDeniedHelp() {
    const dialog = document.createElement('div');
    dialog.className = 'location-prompt-dialog';
    dialog.innerHTML = `
      <div class="location-prompt-content">
        <div class="location-prompt-icon">🔒</div>
        <h3>Location Disabled</h3>
        <p>Location access was denied. To see the sky from your location, please enable location permission in your device settings.</p>
        <div class="location-prompt-buttons">
          <button class="location-prompt-btn location-prompt-btn--primary" id="location-dismiss">
            OK
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);

    this.addPromptStyles_();

    document.getElementById('location-dismiss').addEventListener('click', () => {
      dialog.remove();
    });
  }

  /**
   * Add CSS styles for location prompts if not already present.
   * @private
   */
  addPromptStyles_() {
    if (document.getElementById('location-prompt-styles')) return;

    const style = document.createElement('style');
    style.id = 'location-prompt-styles';
    style.textContent = `
      .location-prompt-dialog {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1001;
        padding: 20px;
      }
      .location-prompt-content {
        background: rgba(30, 30, 40, 0.95);
        border-radius: 16px;
        padding: 24px;
        max-width: 300px;
        text-align: center;
        backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.1);
      }
      .location-prompt-icon {
        font-size: 48px;
        margin-bottom: 12px;
      }
      .location-prompt-content h3 {
        margin: 0 0 8px 0;
        color: #fff;
        font-size: 18px;
      }
      .location-prompt-content p {
        margin: 0 0 20px 0;
        color: rgba(255, 255, 255, 0.7);
        font-size: 14px;
        line-height: 1.4;
      }
      .location-prompt-buttons {
        display: flex;
        gap: 12px;
      }
      .location-prompt-btn {
        flex: 1;
        padding: 12px 16px;
        border: none;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
      }
      .location-prompt-btn--secondary {
        background: rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.7);
      }
      .location-prompt-btn--primary {
        background: #3B82F6;
        color: #fff;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Get location silently (no alerts) - used when permission already granted.
   * @private
   */
  getLocationSilently_() {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.location_ = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          height: position.coords.altitude || 0,
        };
        this.saveLocation_();

        console.log(`✓ Location detected: ${this.location_.lat.toFixed(4)}°, ${this.location_.lon.toFixed(4)}°`);

        globalEventBus.emit(Events.LOCATION_CHANGED, {
          location: this.getLocation(),
          source: 'geolocation-silent',
        });

        if (this.onLocationGrantedCallback_) {
          this.onLocationGrantedCallback_();
        }
      },
      (error) => {
        console.warn('Could not get location:', error.message);
      },
      {
        enableHighAccuracy: false,
        timeout: 5000,
        maximumAge: 300000,
      }
    );
  }

  /**
   * Request geolocation with UI feedback.
   * Shows loading state and handles errors with user-friendly messages.
   * @private
   */
  requestGeolocationWithUI_() {
    // Show loading state on button if exists
    const btn = document.getElementById('auto-location-btn');
    const originalContent = btn ? btn.innerHTML : '';
    if (btn) btn.innerHTML = '⏳';

    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.location_ = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          height: position.coords.altitude || 0,
        };
        this.saveLocation_();

        console.log(`✓ Location detected: ${this.location_.lat.toFixed(4)}°, ${this.location_.lon.toFixed(4)}°`);

        globalEventBus.emit(Events.LOCATION_CHANGED, {
          location: this.getLocation(),
          source: 'geolocation',
        });

        if (this.onLocationGrantedCallback_) {
          this.onLocationGrantedCallback_();
        }

        alert(`Location set to:\n${this.location_.lat.toFixed(4)}°, ${this.location_.lon.toFixed(4)}°\n\nSky now shows correct position for your location and time.`);
        if (btn) btn.innerHTML = originalContent;
      },
      (error) => {
        console.warn('Location access denied:', error);
        if (btn) btn.innerHTML = originalContent;

        if (error.code === error.PERMISSION_DENIED) {
          this.showLocationDeniedHelp();
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          alert('Location unavailable.\n\nPlease check your GPS/location services are enabled.');
        } else if (error.code === error.TIMEOUT) {
          alert('Location request timed out.\n\nPlease try again.');
        } else {
          alert('Could not get your location.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000,
      }
    );
  }

  /**
   * Request geolocation from the device.
   * Called when user clicks location button.
   */
  requestGeolocationInteractive() {
    if (!this.geolocationAvailable_) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    // Check if permission is denied first
    if ('permissions' in navigator) {
      navigator.permissions.query({name: 'geolocation'}).then((permission) => {
        if (permission.state === 'denied') {
          this.showLocationDeniedHelp();
          return;
        }
        this.requestGeolocationWithUI_();
      }).catch(() => {
        this.requestGeolocationWithUI_();
      });
    } else {
      this.requestGeolocationWithUI_();
    }
  }
}

/**
 * Singleton instance for application-wide location management.
 * @const {!LocationManager}
 */
export const locationManager = new LocationManager();
