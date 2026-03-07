/**
 * @fileoverview Telescope simulation controller.
 * Computes optical properties and manages telescope viewing mode.
 */

import {globalEventBus, Events} from '../core/EventBus.js';
import {TELESCOPE} from '../core/Constants.js';
import {createLogger} from '../core/Logger.js';

const logger = createLogger('TelescopeController');

/**
 * Telescope configuration.
 * @typedef {{
 *   diameter: number,
 *   focalLength: number
 * }}
 */
let TelescopeConfig;

/**
 * Eyepiece configuration.
 * @typedef {{
 *   focalLength: number,
 *   apparentFov: number
 * }}
 */
let EyepieceConfig;

/**
 * Computed optical properties.
 * @typedef {{
 *   magnification: number,
 *   maxUsefulMagnification: number,
 *   exitPupil: number,
 *   realFieldOfView: number,
 *   limitingMagnitude: number,
 *   theoreticalLimitingMag: number,
 *   isOverMagnified: boolean
 * }}
 */
let OpticalProperties;

/**
 * Saved telescope preset.
 * @typedef {{
 *   telescope: !TelescopeConfig,
 *   eyepiece: !EyepieceConfig
 * }}
 */
let TelescopePreset;

/**
 * TelescopeController manages telescope simulation mode.
 */
export class TelescopeController {
  /**
   * Creates a new TelescopeController instance.
   * @param {!Object} dependencies - Required dependencies
   * @param {function(number): void=} dependencies.setFOV - Set camera FOV
   * @param {function(number): void=} dependencies.setMagnitudeLimit - Set mag limit
   * @param {function(): number=} dependencies.getCurrentFOV - Get current FOV
   * @param {function(): number=} dependencies.getCurrentMagnitude - Get current magnitude
   * @param {function(): number=} dependencies.getSkyLimitingMagnitude - Get sky NELM
   * @param {function(): void=} dependencies.lockZoom - Lock zoom when telescope active
   * @param {function(): void=} dependencies.unlockZoom - Unlock zoom when telescope inactive
   */
  constructor(dependencies = {}) {
    /** @private @const */
    this.deps_ = dependencies;

    /** @private {!TelescopeConfig} */
    this.telescope_ = {
      diameter: TELESCOPE.DEFAULT_DIAMETER,
      focalLength: TELESCOPE.DEFAULT_FOCAL_LENGTH,
    };

    /** @private {!EyepieceConfig} */
    this.eyepiece_ = {
      focalLength: TELESCOPE.DEFAULT_EYEPIECE_FL,
      apparentFov: TELESCOPE.DEFAULT_EYEPIECE_AFOV,
    };

    /** @private {?OpticalProperties} */
    this.computedProperties_ = null;

    /** @private {boolean} */
    this.isActive_ = false;

    /** @private {?number} */
    this.previousFOV_ = null;

    /** @private {?number} */
    this.previousMagnitude_ = null;

    /** @private {!Object<string, !TelescopePreset>} */
    this.presets_ = {};

    // Load saved settings
    this.loadFromStorage_();
  }

  /**
   * Initialize the telescope controller.
   */
  initialize() {
    this.computeProperties_();
  }

  /**
   * Compute optical properties from current telescope/eyepiece config.
   * @returns {!OpticalProperties} Computed properties
   */
  computeProperties() {
    return this.computeProperties_();
  }

  /**
   * Compute optical properties internally.
   * @returns {!OpticalProperties} Computed properties
   * @private
   */
  computeProperties_() {
    const {diameter, focalLength} = this.telescope_;
    const {focalLength: eyepieceFl, apparentFov} = this.eyepiece_;

    // Magnification = Telescope focal length / Eyepiece focal length
    const magnification = focalLength / eyepieceFl;

    // Maximum useful magnification = 2 × Diameter (mm)
    const maxUsefulMagnification = TELESCOPE.MAX_MAG_MULTIPLIER * diameter;

    // Exit pupil = Diameter / Magnification
    const exitPupil = diameter / magnification;

    // Real field of view = Apparent FOV / Magnification
    const realFieldOfView = apparentFov / magnification;

    // Theoretical limiting magnitude = 2.7 + 5 × log10(Diameter_mm)
    // This is the telescope's optical limit under perfect conditions
    const theoreticalLimitingMag = 2.7 + 5 * Math.log10(diameter);

    // Calculate sky-limited magnitude if sky conditions are available
    // Telescope gain = 5 × log10(aperture / 7mm pupil)
    // Effective limit = min(theoretical, sky NELM + telescope gain)
    let limitingMagnitude = theoreticalLimitingMag;
    const skyNelm = this.deps_.getSkyLimitingMagnitude?.();
    if (skyNelm !== undefined && skyNelm !== null) {
      const telescopeGain = 5 * Math.log10(diameter / 7);
      const skyLimitedMag = skyNelm + telescopeGain;
      limitingMagnitude = Math.min(theoreticalLimitingMag, skyLimitedMag);
    }

    // Check if over-magnified
    const isOverMagnified = magnification > maxUsefulMagnification;

    this.computedProperties_ = {
      magnification,
      maxUsefulMagnification,
      exitPupil,
      realFieldOfView,
      limitingMagnitude,
      theoreticalLimitingMag,
      isOverMagnified,
    };

    globalEventBus.emit(Events.TELESCOPE_COMPUTED, this.computedProperties_);

    return this.computedProperties_;
  }

  /**
   * Get current telescope configuration.
   * @returns {!TelescopeConfig} Current telescope config
   */
  getTelescope() {
    return {...this.telescope_};
  }

  /**
   * Set telescope configuration.
   * @param {!TelescopeConfig} config - Telescope configuration
   */
  setTelescope(config) {
    this.telescope_ = {...this.telescope_, ...config};
    this.computeProperties_();
    this.saveToStorage_();
  }

  /**
   * Get current eyepiece configuration.
   * @returns {!EyepieceConfig} Current eyepiece config
   */
  getEyepiece() {
    return {...this.eyepiece_};
  }

  /**
   * Set eyepiece configuration.
   * @param {!EyepieceConfig} config - Eyepiece configuration
   */
  setEyepiece(config) {
    this.eyepiece_ = {...this.eyepiece_, ...config};
    this.computeProperties_();
    this.saveToStorage_();
  }

  /**
   * Get computed optical properties.
   * @returns {?OpticalProperties} Computed properties or null
   */
  getComputedProperties() {
    return this.computedProperties_ ? {...this.computedProperties_} : null;
  }

  /**
   * Check if telescope mode is active.
   * @returns {boolean} Whether telescope mode is active
   */
  isActive() {
    return this.isActive_;
  }

  /**
   * Activate telescope viewing mode.
   */
  activateTelescopeMode() {
    if (this.isActive_) return;

    // Store previous settings
    this.previousFOV_ = this.deps_.getCurrentFOV?.() ?? null;
    this.previousMagnitude_ = this.deps_.getCurrentMagnitude?.() ?? null;

    // Ensure properties are computed
    if (!this.computedProperties_) {
      this.computeProperties_();
    }

    // Apply telescope settings
    const {realFieldOfView, limitingMagnitude} = this.computedProperties_;

    // Clamp FOV to minimum
    const fov = Math.max(realFieldOfView, TELESCOPE.MIN_TELESCOPE_FOV);
    this.deps_.setFOV?.(fov);
    this.deps_.setMagnitudeLimit?.(limitingMagnitude);

    // Lock zoom to prevent user from changing FOV
    this.deps_.lockZoom?.();

    this.isActive_ = true;

    // Emit event for UI layer to handle DOM changes (reticle, vignette)
    globalEventBus.emit(Events.TELESCOPE_MODE_ACTIVATED, {
      fov,
      magnitudeLimit: limitingMagnitude,
      magnification: this.computedProperties_.magnification,
    });
  }

  /**
   * Deactivate telescope viewing mode.
   */
  deactivateTelescopeMode() {
    if (!this.isActive_) return;

    // Restore previous settings
    if (this.previousFOV_ !== null) {
      this.deps_.setFOV?.(this.previousFOV_);
    }
    if (this.previousMagnitude_ !== null) {
      this.deps_.setMagnitudeLimit?.(this.previousMagnitude_);
    }

    this.isActive_ = false;
    this.previousFOV_ = null;
    this.previousMagnitude_ = null;

    // Unlock zoom to allow user control
    this.deps_.unlockZoom?.();

    // Emit event for UI layer to handle DOM changes (reticle, vignette)
    globalEventBus.emit(Events.TELESCOPE_MODE_DEACTIVATED, {});
  }

  /**
   * Toggle telescope mode.
   */
  toggleTelescopeMode() {
    if (this.isActive_) {
      this.deactivateTelescopeMode();
    } else {
      this.activateTelescopeMode();
    }
  }

  /**
   * Save a preset.
   * @param {string} name - Preset name
   */
  savePreset(name) {
    this.presets_[name] = {
      telescope: {...this.telescope_},
      eyepiece: {...this.eyepiece_},
    };
    this.saveToStorage_();
  }

  /**
   * Load a preset.
   * @param {string} name - Preset name
   * @returns {boolean} Whether the preset was loaded
   */
  loadPreset(name) {
    const preset = this.presets_[name];
    if (!preset) return false;

    this.telescope_ = {...preset.telescope};
    this.eyepiece_ = {...preset.eyepiece};
    this.computeProperties_();
    this.saveToStorage_();

    return true;
  }

  /**
   * Delete a preset.
   * @param {string} name - Preset name
   * @returns {boolean} Whether the preset was deleted
   */
  deletePreset(name) {
    if (!this.presets_[name]) return false;

    delete this.presets_[name];
    this.saveToStorage_();

    return true;
  }

  /**
   * Get all preset names.
   * @returns {!Array<string>} List of preset names
   */
  getPresetNames() {
    return Object.keys(this.presets_);
  }

  /**
   * Save current configuration to localStorage.
   * @private
   */
  saveToStorage_() {
    try {
      const data = {
        currentConfig: {
          telescope: this.telescope_,
          eyepiece: this.eyepiece_,
        },
        presets: this.presets_,
      };
      localStorage.setItem(TELESCOPE.STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      logger.warn('Failed to save telescope settings:', e);
    }
  }

  /**
   * Load configuration from localStorage.
   * @private
   */
  loadFromStorage_() {
    try {
      const stored = localStorage.getItem(TELESCOPE.STORAGE_KEY);
      if (!stored) return;

      const data = JSON.parse(stored);

      if (data.currentConfig) {
        if (data.currentConfig.telescope) {
          this.telescope_ = {...this.telescope_, ...data.currentConfig.telescope};
        }
        if (data.currentConfig.eyepiece) {
          this.eyepiece_ = {...this.eyepiece_, ...data.currentConfig.eyepiece};
        }
      }

      if (data.presets) {
        this.presets_ = data.presets;
      }
    } catch (e) {
      logger.warn('Failed to load telescope settings:', e);
    }
  }
}

/**
 * Singleton telescope controller instance.
 * @type {?TelescopeController}
 */
export let telescopeController = null;

/**
 * Initialize the telescope controller singleton.
 * @param {!Object} dependencies - Required dependencies
 * @returns {!TelescopeController} Initialized controller
 */
export function initializeTelescopeController(dependencies) {
  telescopeController = new TelescopeController(dependencies);
  telescopeController.initialize();
  return telescopeController;
}
