/**
 * @fileoverview Location management service for observer position.
 * Handles geolocation, manual location setting, and coordinate storage.
 */

import {globalEventBus, Events} from '../core/EventBus.js';
import {DEFAULT_LOCATION} from '../core/Constants.js';
import {
  calculateAltitude as computeAltitude,
  calculateLST as computeLST,
  clampDec,
  normalizeLongitude,
} from '../core/CoordinateUtils.js';
import {createLogger} from '../core/Logger.js';
import {safeSetJson, safeGetJson} from '../core/Utils.js';

const logger = createLogger('LocationManager');

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
const STORAGE_KEY = 'astrapedia_observer_location';

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
    const safeLat = clampDec(parseFloat(lat));
    if (isNaN(safeLat)) {
      logger.error('Invalid latitude:', lat);
      return;
    }

    // Validate longitude (Number.isFinite also rejects Infinity, which would
    // spin the old while-loop normalization forever)
    const parsedLon = parseFloat(lon);
    if (!Number.isFinite(parsedLon)) {
      logger.error('Invalid longitude:', lon);
      return;
    }
    // Normalize longitude to -180..180 (leaves in-range values exact).
    const safeLon = normalizeLongitude(parsedLon);

    // Validate height
    const safeHeight = parseFloat(height);
    if (isNaN(safeHeight)) {
      logger.error('Invalid height:', height);
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
    // Delegate to the canonical implementation (CoordinateUtils) so the
    // sidereal-time formula lives in exactly one place.
    return computeLST(date, this.location_.lon);
  }

  /**
   * Calculate altitude of an object at current location.
   * @param {number} ra - Right Ascension in degrees
   * @param {number} dec - Declination in degrees
   * @param {!Date} date - Date for calculation
   * @returns {number} Altitude in degrees
   */
  calculateAltitude(ra, dec, date) {
    return computeAltitude(ra, dec, this.location_.lat,
        this.calculateLST(date));
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
    safeSetJson(STORAGE_KEY, this.location_);
  }

  /**
   * Load saved location from localStorage.
   * @returns {?ObserverLocation} Saved location or null
   * @private
   */
  loadSavedLocation_() {
    const location = safeGetJson(STORAGE_KEY);
    if (!location ||
        !Number.isFinite(location.lat) || !Number.isFinite(location.lon)) {
      return null;
    }
    // Sanitize: clamp latitude and normalize longitude, matching setLocation,
    // so tampered/out-of-range storage can't leak through.
    return {
      lat: clampDec(location.lat),
      lon: normalizeLongitude(location.lon),
      height: Number.isFinite(location.height) ? location.height : 0,
    };
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
          // Not yet asked — do NOT prompt on launch. Best practice is to ask
          // in context, so the request now waits for the user to tap the "My
          // location" control (requestGeolocationInteractive). This keeps the
          // first run free of an unsolicited permission dialog.
          logger.info('Location not yet granted; deferring to first use');
        } else if (permission.state === 'denied') {
          // Previously denied - show how to enable
          logger.info('Location permission was previously denied');
        }

        // Listen for permission changes
        permission.addEventListener('change', () => {
          if (permission.state === 'granted') {
            this.getLocationSilently_();
          }
        });
      } catch (e) {
        // Permissions API unreliable — still don't prompt on launch; wait for
        // the user to tap "My location".
        logger.info('Could not check location permission; deferring to first use');
      }
    } else {
      // No Permissions API — defer to first use rather than prompting on launch.
      logger.info('No Permissions API; deferring location to first use');
    }
  }

  /**
   * Show a friendly prompt asking user for location permission.
   * @private
   */
  showLocationPrompt_() {
    // On first run the onboarding overlay is up; wait for it to close so the
    // two dialogs don't stack. Reads the DOM only — no coupling to Onboarding.
    const onboarding = document.getElementById('onboarding-overlay');
    if (onboarding && onboarding.classList.contains('visible')) {
      const observer = new MutationObserver(() => {
        if (!onboarding.classList.contains('visible')) {
          observer.disconnect();
          this.showLocationPrompt_();
        }
      });
      observer.observe(onboarding, {
        attributes: true,
        attributeFilter: ['class'],
      });
      return;
    }

    // Create a non-blocking prompt dialog
    const dialog = document.createElement('div');
    dialog.className = 'location-prompt-dialog';
    dialog.innerHTML = `
      <div class="location-prompt-content">
        <div class="location-prompt-icon">📍</div>
        <h3>Enable Location?</h3>
        <p>Astrapedia can show you the exact sky visible from your location right now.</p>
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
    // Uses the shared design tokens (so it inherits the night-vision skin)
    // instead of the previous hard-coded blue/white island, whose blue button
    // was a dark-adaptation hazard.
    style.textContent = `
      .location-prompt-dialog {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: var(--z-modal, 200);
        padding: 20px;
      }
      .location-prompt-content {
        background: var(--bg-dark);
        border-radius: var(--radius);
        padding: 24px;
        max-width: 300px;
        text-align: center;
        border: 1px solid var(--border);
        border-top: 2px solid var(--accent-warm-dim);
      }
      .location-prompt-icon {
        font-size: 40px;
        margin-bottom: 12px;
        filter: saturate(0.5) brightness(0.85);
      }
      .location-prompt-content h3 {
        margin: 0 0 8px 0;
        color: var(--accent-warm);
        font-size: 16px;
        letter-spacing: 1px;
      }
      .location-prompt-content p {
        margin: 0 0 20px 0;
        color: var(--text-secondary);
        font-size: 13px;
        line-height: 1.5;
      }
      .location-prompt-buttons {
        display: flex;
        gap: 12px;
      }
      .location-prompt-btn {
        flex: 1;
        padding: 12px 16px;
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        font-size: 13px;
        font-family: inherit;
        cursor: pointer;
      }
      .location-prompt-btn--secondary {
        background: var(--bg-secondary);
        color: var(--text-secondary);
      }
      .location-prompt-btn--primary {
        background: var(--accent);
        color: var(--text-primary);
        border-color: var(--border-accent);
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Adopt a geolocation position: store it, persist it, announce it, and fire
   * the granted callback. Shared by the silent and UI geolocation paths.
   * @param {!GeolocationPosition} position
   * @param {string} source - LOCATION_CHANGED source tag
   * @private
   */
  applyPosition_(position, source) {
    this.location_ = {
      lat: position.coords.latitude,
      lon: position.coords.longitude,
      height: position.coords.altitude || 0,
    };
    this.saveLocation_();

    logger.info(`Location detected: ${this.location_.lat.toFixed(4)}°, ${this.location_.lon.toFixed(4)}°`);

    globalEventBus.emit(Events.LOCATION_CHANGED, {
      location: this.getLocation(),
      source,
    });

    if (this.onLocationGrantedCallback_) {
      this.onLocationGrantedCallback_();
    }
  }

  /**
   * Get location silently (no alerts) - used when permission already granted.
   * @private
   */
  getLocationSilently_() {
    navigator.geolocation.getCurrentPosition(
      (position) => this.applyPosition_(position, 'geolocation-silent'),
      (error) => {
        logger.warn('Could not get location:', error.message);
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
        this.applyPosition_(position, 'geolocation');

        alert(`Location set to:\n${this.location_.lat.toFixed(4)}°, ${this.location_.lon.toFixed(4)}°\n\nSky now shows correct position for your location and time.`);
        if (btn) btn.innerHTML = originalContent;
      },
      (error) => {
        logger.warn('Location access denied:', error);
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
        } else if (permission.state === 'prompt') {
          // First time: prime with the styled explanation, then the OS prompt
          // fires from the card's "Allow" — contextual, higher grant rate.
          this.showLocationPrompt_();
        } else {
          this.requestGeolocationWithUI_();
        }
      }).catch(() => {
        this.showLocationPrompt_();
      });
    } else {
      this.showLocationPrompt_();
    }
  }
}

/**
 * Singleton instance for application-wide location management.
 * @const {!LocationManager}
 */
export const locationManager = new LocationManager();
