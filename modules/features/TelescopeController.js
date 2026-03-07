/**
 * @fileoverview Telescope simulation controller.
 * Computes optical properties, manages telescope viewing mode,
 * and provides diffuse object visibility analysis.
 */

import {globalEventBus, Events} from '../core/EventBus.js';
import {TELESCOPE} from '../core/Constants.js';
import {angularDistance} from '../core/CoordinateUtils.js';
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
 *   isOverMagnified: boolean,
 *   surfaceBrightnessPct: number,
 *   exitPupilCategory: string
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
 * Classify visibility margin into a label and boolean.
 * @param {number} margin - SB limit minus object SB (positive = visible)
 * @returns {{visibilityLabel: string, isVisible: boolean}}
 */
function classifyVisibility(margin) {
  if (margin > 2) return {visibilityLabel: 'Easily visible', isVisible: true};
  if (margin > 0.5) return {visibilityLabel: 'Visible', isVisible: true};
  if (margin > -0.5) return {visibilityLabel: 'Barely visible', isVisible: true};
  return {visibilityLabel: 'Not visible', isVisible: false};
}

/**
 * Compute the surface brightness detection limit for a given aperture.
 * @param {number} diameter - Telescope aperture in mm
 * @param {number} skySB - Sky surface brightness in mag/arcsec²
 * @returns {number} SB detection limit in mag/arcsec²
 */
function computeSbLimit(diameter, skySB) {
  const gain = 5 * Math.log10(diameter / TELESCOPE.EYE_PUPIL_DIAMETER);
  return skySB - TELESCOPE.DIFFUSE_CONTRAST_THRESHOLD + gain;
}

/**
 * Check whether a DSO has valid diffuse object data (magnitude and angular size).
 * @param {!Object} obj - DSO object
 * @returns {boolean} True if the object has size and magnitude data
 */
export function isDiffuseObject(obj) {
  return !!obj.size_major && obj.mag != null;
}

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
   * @param {function(): {ra: number, dec: number}=} dependencies.getViewCenterRaDec - Get camera center
   * @param {function(): !Array=} dependencies.getDSOs - Get loaded DSO list
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

    /** @private {?number} */
    this.centerDetectionInterval_ = null;

    /** @private {?string} */
    this.lastCenteredDsoName_ = null;

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

    // Sky-limited magnitude: min(theoretical, sky NELM + telescope gain)
    let limitingMagnitude = theoreticalLimitingMag;
    const skyNelm = this.deps_.getSkyLimitingMagnitude?.();
    if (skyNelm != null) {
      const telescopeGain = 5 * Math.log10(diameter / 7);
      const skyLimitedMag = skyNelm + telescopeGain;
      limitingMagnitude = Math.min(theoreticalLimitingMag, skyLimitedMag);
    }

    // Check if over-magnified
    const isOverMagnified = magnification > maxUsefulMagnification;

    // Surface brightness percentage: how much of sky brightness is preserved
    const eyePupil = TELESCOPE.EYE_PUPIL_DIAMETER;
    const surfaceBrightnessPct = Math.min(100, (exitPupil / eyePupil) ** 2 * 100);

    // Exit pupil category label
    const exitPupilCategory = TelescopeController.getExitPupilCategory(exitPupil);

    this.computedProperties_ = {
      magnification,
      maxUsefulMagnification,
      exitPupil,
      realFieldOfView,
      limitingMagnitude,
      theoreticalLimitingMag,
      isOverMagnified,
      surfaceBrightnessPct,
      exitPupilCategory,
    };

    globalEventBus.emit(Events.TELESCOPE_COMPUTED, this.computedProperties_);

    return this.computedProperties_;
  }

  /**
   * Get exit pupil category label from exit pupil value.
   * @param {number} exitPupil - Exit pupil in mm
   * @returns {string} Category label
   */
  static getExitPupilCategory(exitPupil) {
    for (const cat of TELESCOPE.EXIT_PUPIL_CATEGORIES) {
      if (exitPupil >= cat.min) return cat.label;
    }
    return 'Very high magnification';
  }

  /**
   * Compute surface brightness for a diffuse object.
   * @param {number} mag - Integrated magnitude
   * @param {number} sizeMajor - Major axis in arcminutes
   * @param {number=} sizeMinor - Minor axis in arcminutes (defaults to sizeMajor)
   * @returns {number} Surface brightness in mag/arcsec²
   */
  static computeObjectSurfaceBrightness(mag, sizeMajor, sizeMinor) {
    // SB = m + 2.5 × log10(π × 900 × a × b)
    // 900 converts arcmin² to arcsec² (30×30)
    const minor = sizeMinor || sizeMajor;
    return mag + 2.5 * Math.log10(Math.PI * 900 * sizeMajor * minor);
  }

  /**
   * Derive sky surface brightness from naked-eye limiting magnitude.
   * @param {number=} nelm - Naked-eye limiting magnitude
   * @returns {number} Sky SB in mag/arcsec²
   * @private
   */
  deriveSkyBrightness_(nelm) {
    return nelm != null ? nelm + 14.7 : TELESCOPE.DEFAULT_SKY_SB;
  }

  /**
   * Compute diffuse object visibility for a list of telescope diameters.
   * @param {!Object} obj - DSO with mag, size_major, size_minor
   * @param {!Array<number>} diameters - Telescope diameters in mm
   * @returns {!Array<{diameter: number, visibilityLabel: string, isVisible: boolean}>}
   */
  computeVisibilityForDiameters(obj, diameters) {
    if (!isDiffuseObject(obj)) return [];

    const objectSB = TelescopeController.computeObjectSurfaceBrightness(
      obj.mag, obj.size_major, obj.size_minor
    );
    const skySB = this.deriveSkyBrightness_(this.deps_.getSkyLimitingMagnitude?.());

    return diameters.map((diameter) => {
      const margin = computeSbLimit(diameter, skySB) - objectSB;
      return {diameter, ...classifyVisibility(margin)};
    });
  }

  /**
   * Compute diffuse object visibility for the current telescope configuration.
   * @param {!Object} obj - DSO with mag, size_major, size_minor
   * @returns {?Object} Visibility info or null if not a diffuse object
   */
  computeDiffuseVisibility(obj) {
    if (!isDiffuseObject(obj)) return null;

    const objectSB = TelescopeController.computeObjectSurfaceBrightness(
      obj.mag, obj.size_major, obj.size_minor
    );

    const {diameter, focalLength} = this.telescope_;
    const skySB = this.deriveSkyBrightness_(this.deps_.getSkyLimitingMagnitude?.());
    const margin = computeSbLimit(diameter, skySB) - objectSB;

    // Recommended exit pupil based on object angular size (arcmin)
    // Boundaries are exclusive: 10' gets EP=2, 11' gets EP=3
    const recommendedExitPupil =
      obj.size_major > 30 ? 5 :
      obj.size_major > 10 ? 3 :
      obj.size_major > 3 ? 2 : 1;

    const focalRatio = focalLength / diameter;

    return {
      objectSB,
      ...classifyVisibility(margin),
      recommendedExitPupil,
      suggestedEyepieceFl: Math.round(recommendedExitPupil * focalRatio),
      surfaceBrightnessPct: this.computedProperties_?.surfaceBrightnessPct ?? 0,
      name: obj.name || obj.proper || 'Unknown',
    };
  }

  /**
   * Start periodic detection of DSO centered in telescope view.
   * @private
   */
  startCenterDetection_() {
    this.stopCenterDetection_();
    this.lastCenteredDsoName_ = null;

    this.centerDetectionInterval_ = setInterval(() => {
      this.detectCenteredDso_();
    }, TELESCOPE.CENTERED_DSO_CHECK_INTERVAL);
  }

  /**
   * Stop center detection interval.
   * @private
   */
  stopCenterDetection_() {
    if (this.centerDetectionInterval_ !== null) {
      clearInterval(this.centerDetectionInterval_);
      this.centerDetectionInterval_ = null;
    }
    this.lastCenteredDsoName_ = null;
  }

  /**
   * Detect if a DSO is centered in the telescope FOV.
   * @private
   */
  detectCenteredDso_() {
    const center = this.deps_.getViewCenterRaDec?.();
    const dsos = this.deps_.getDSOs?.() || [];
    if (!center || !this.computedProperties_) {
      if (this.lastCenteredDsoName_ !== null) {
        this.lastCenteredDsoName_ = null;
        globalEventBus.emit(Events.TELESCOPE_DSO_CENTERED, null);
      }
      return;
    }

    const fov = this.computedProperties_.realFieldOfView;
    const halfFov = fov / 2;

    let nearest = null;
    let nearestDist = Infinity;

    for (const dso of dsos) {
      if (!isDiffuseObject(dso) || dso.size_major <= 0) continue;

      const dist = angularDistance(center.ra, center.dec, dso.ra, dso.dec);
      if (dist < halfFov && dist < nearestDist) {
        nearestDist = dist;
        nearest = dso;
      }
    }

    if (nearest) {
      const dsoName = nearest.name || nearest.proper || 'Unknown';
      if (dsoName === this.lastCenteredDsoName_) return;
      this.lastCenteredDsoName_ = dsoName;

      const visibility = this.computeDiffuseVisibility(nearest);
      globalEventBus.emit(Events.TELESCOPE_DSO_CENTERED, visibility);
    } else {
      if (this.lastCenteredDsoName_ !== null) {
        this.lastCenteredDsoName_ = null;
        globalEventBus.emit(Events.TELESCOPE_DSO_CENTERED, null);
      }
    }
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

    // Start center detection for DSO HUD
    this.startCenterDetection_();

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

    // Stop center detection
    this.stopCenterDetection_();

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
   * Dispose of resources and clean up intervals.
   */
  dispose() {
    this.stopCenterDetection_();
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
