/**
 * @fileoverview Telescope simulation controller.
 * Computes optical properties, manages telescope viewing mode,
 * and provides diffuse object visibility analysis.
 */

import {globalEventBus, Events} from '../core/EventBus.js';
import {TELESCOPE} from '../core/Constants.js';
import {findNearestObject} from './CenterIdentify.js';
import {telescopeLimitingMagnitude, telescopeGain} from '../core/MagnitudeUtils.js';
import {createLogger} from '../core/Logger.js';
import {safeSetJson, safeGetJson} from '../core/Utils.js';

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
 * An eyepiece in the user's kit.
 * @typedef {{
 *   id: string,
 *   focalLength: number,
 *   apparentFov: number
 * }}
 */
let KitEyepiece;

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
 * Classify visibility margin into a label, boolean, and description.
 * The description accounts for two physical corrections:
 * 1. Compact penalty — small objects need large aperture to resolve detail.
 * 2. Concentration boost — very bright large objects have cores much brighter
 *    than their average SB (e.g. M42, M31).
 * @param {number} margin - SB limit minus object SB (positive = visible)
 * @param {string=} dsoType - DSO catalogue type (G, PN, GCl, OCl, EmN, etc.)
 * @param {number=} sizeMajor - Major axis in arcmin (for compact penalty)
 * @param {number=} diameter - Telescope aperture in mm (for compact penalty)
 * @param {number=} integratedMag - Object integrated magnitude (for concentration boost)
 * @returns {{visibilityLabel: string, isVisible: boolean, description: string}}
 */
function classifyVisibility(margin, dsoType, sizeMajor, diameter, integratedMag) {
  if (margin <= -1) {
    return {visibilityLabel: 'Not visible', isVisible: false, description: 'Not visible'};
  }

  let descMargin = margin;

  // Compact-object penalty: small objects need more aperture to resolve detail.
  // A 1.4' PN in a 60mm scope looks stellar, not ring-shaped.
  if (sizeMajor != null && diameter != null &&
      sizeMajor < TELESCOPE.COMPACT_SIZE_THRESHOLD) {
    const sizeFactor = (TELESCOPE.COMPACT_SIZE_THRESHOLD - sizeMajor) /
      TELESCOPE.COMPACT_SIZE_THRESHOLD;
    const apertureFactor = Math.max(0,
      1 - diameter / TELESCOPE.COMPACT_PENALTY_REF_DIAMETER);
    descMargin -= sizeFactor * TELESCOPE.COMPACT_PENALTY_MAX * apertureFactor;
  }

  // Concentration boost: very bright large objects (mag < 6, size > 10')
  // have cores 3-5 mag brighter than average SB. This corrects for the
  // systematic underestimate of showpiece objects like M42 and M31.
  if (integratedMag != null && sizeMajor != null &&
      integratedMag < 6 && sizeMajor > 10) {
    const brightnessFactor = 6 - integratedMag;
    const sizeFactor = Math.min(1, Math.log10(sizeMajor / 10));
    descMargin += brightnessFactor * sizeFactor *
      TELESCOPE.CONCENTRATION_BOOST_FACTOR;
  }

  // Don't let description be worse than the lowest visible tier when the
  // object IS detectable (margin > -1).
  if (margin > -1 && descMargin < 0) {
    descMargin = 0;
  }

  const desc = describeVisibility_(descMargin, dsoType || '');
  if (margin > 2) return {visibilityLabel: 'Easily visible', isVisible: true, description: desc};
  if (margin > 0.5) return {visibilityLabel: 'Visible', isVisible: true, description: desc};
  return {visibilityLabel: 'Barely visible', isVisible: true, description: desc};
}

/**
 * Describe what an observer would see based on margin and object type.
 * @param {number} margin - SB detection margin
 * @param {string} type - DSO catalogue type
 * @returns {string} Short visual description
 * @private
 */
function describeVisibility_(margin, type) {
  switch (type) {
    case 'G':
      if (margin > 5) return 'Core, halo, dust lanes, star-forming regions';
      if (margin > 4) return 'Core, halo, dust lanes';
      if (margin > 3.5) return 'Core and halo, arms traceable';
      if (margin > 3) return 'Core and halo, hints of structure';
      if (margin > 2.5) return 'Core and halo, hints of arms';
      if (margin > 2) return 'Bright core, extended halo';
      if (margin > 1.5) return 'Bright core, faint halo';
      if (margin > 1) return 'Faint oval glow, core visible';
      if (margin > 0.5) return 'Faint oval glow';
      return 'Faint smudge, averted vision';

    case 'PN':
      if (margin > 5) return 'Ring/disk well defined, color, central star';
      if (margin > 4) return 'Disk/ring resolved, color possible';
      if (margin > 3.5) return 'Disk visible, shape and structure clear';
      if (margin > 3) return 'Disk visible, shape clear';
      if (margin > 2.5) return 'Small disk, some structure';
      if (margin > 2) return 'Small disk, hints of structure';
      if (margin > 1.5) return 'Small fuzzy disk';
      if (margin > 1) return 'Fuzzy, slightly non-stellar';
      if (margin > 0.5) return 'Stellar, hard to distinguish';
      return 'Faint, averted vision';

    case 'GCl':
      if (margin > 5) return 'Fully resolved to center, rich star field';
      if (margin > 4) return 'Resolved, many stars visible';
      if (margin > 3.5) return 'Granular, stars resolved across face';
      if (margin > 3) return 'Granular, outer stars resolved';
      if (margin > 2.5) return 'Bright core, granular edges';
      if (margin > 2) return 'Bright fuzzy ball, hints of resolution';
      if (margin > 1.5) return 'Bright fuzzy ball';
      if (margin > 1) return 'Fuzzy patch, brighter center';
      if (margin > 0.5) return 'Faint fuzzy patch';
      return 'Faint glow, averted vision';

    case 'OCl':
    case 'Cl+N':
      if (margin > 4) return 'Stars fully resolved, rich field';
      if (margin > 3) return 'Stars resolved, rich field';
      if (margin > 2) return 'Partially resolved, some stars';
      if (margin > 1) return 'Hazy patch with a few stars';
      if (margin > 0.5) return 'Hazy patch of stars';
      return 'Faint, averted vision';

    case 'EmN':
    case 'HII':
    case 'RfN':
    case 'Neb':
      if (margin > 5) return 'Bright, filaments and dark lanes';
      if (margin > 4) return 'Bright, structure and dark lanes';
      if (margin > 3.5) return 'Shape and extent clear, some structure';
      if (margin > 3) return 'Shape and extent clear';
      if (margin > 2.5) return 'Shape visible, edges defined';
      if (margin > 2) return 'Nebulosity visible, shape emerging';
      if (margin > 1.5) return 'Nebulosity visible';
      if (margin > 1) return 'Faint nebulosity';
      if (margin > 0.5) return 'Faint haze';
      return 'Faint, averted vision';

    case 'SNR':
      if (margin > 5) return 'Filamentary structure visible';
      if (margin > 4) return 'Visible, ragged edges';
      if (margin > 3) return 'Faint nebulous patch, some structure';
      if (margin > 2) return 'Faint nebulous patch';
      if (margin > 1.5) return 'Faint smudge';
      if (margin > 1) return 'Very faint smudge';
      if (margin > 0.5) return 'Very faint, needs attention';
      return 'Faint, averted vision';

    default:
      if (margin > 5) return 'Bright, detail visible';
      if (margin > 4) return 'Bright, shape clear';
      if (margin > 3) return 'Shape clear';
      if (margin > 2) return 'Visible, some shape';
      if (margin > 1) return 'Faint but visible';
      if (margin > 0.5) return 'Faint';
      return 'Faint, averted vision';
  }
}

/**
 * Compute the surface brightness detection limit for a given aperture.
 * @param {number} diameter - Telescope aperture in mm
 * @param {number} skySB - Sky surface brightness in mag/arcsec²
 * @returns {number} SB detection limit in mag/arcsec²
 */
function computeSbLimit(diameter, skySB) {
  // Extended object gain is ~half point-source gain: the telescope magnifies
  // both object and sky background equally, so contrast improves less than
  // for stars. 2.5× matches empirical visual reports for diffuse objects.
  const gain = 2.5 * Math.log10(diameter / TELESCOPE.EYE_PUPIL_DIAMETER);
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
 * Keep only the named keys whose values are usable optical measurements.
 *
 * Anything absent, non-numeric, zero or negative is dropped so the caller's
 * existing default survives the merge.
 *
 * @param {*} source - Untrusted object, typically from localStorage
 * @param {!Array<string>} keys - Keys to consider
 * @returns {!Object<string, number>} The valid subset
 */
function pickPositiveNumbers(source, keys) {
  const valid = {};
  if (!source || typeof source !== 'object') return valid;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      valid[key] = value;
    }
  }
  return valid;
}

/**
 * What an eyepiece gives in a telescope.
 * @param {!TelescopeConfig} telescope
 * @param {!EyepieceConfig} eyepiece
 * @returns {{magnification: number, realFieldOfView: number, exitPupil: number}}
 */
export function eyepieceOptics(telescope, eyepiece) {
  const magnification = telescope.focalLength / eyepiece.focalLength;
  return {
    magnification,
    realFieldOfView: eyepiece.apparentFov / magnification,
    exitPupil: telescope.diameter / magnification,
  };
}

/**
 * Camera vertical FOV that makes the on-screen reticle circle span exactly
 * the eyepiece's true field. The reticle is TELESCOPE.RETICLE_SCREEN_FRACTION
 * of the screen's short side, while the camera FOV spans the full height.
 * @param {number} trueFov - Eyepiece true field in degrees
 * @param {number} width - Viewport width in px
 * @param {number} height - Viewport height in px
 * @returns {number} Camera vertical FOV in degrees
 */
export function reticleCameraFov(trueFov, width, height) {
  const reticlePx = TELESCOPE.RETICLE_SCREEN_FRACTION * Math.min(width, height);
  return trueFov * height / reticlePx;
}

/**
 * Validate a stored eyepiece kit, dropping malformed entries.
 * @param {*} stored - Untrusted, from localStorage
 * @returns {!Array<!KitEyepiece>} Possibly empty
 */
function sanitizeKit(stored) {
  if (!Array.isArray(stored)) return [];
  return stored
      .map((e) => ({id: typeof e?.id === 'string' ? e.id : '',
        ...pickPositiveNumbers(e, ['focalLength', 'apparentFov'])}))
      .filter((e) => e.id && e.focalLength && e.apparentFov);
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
   * @param {function(): {ra: number, dec: number}=} dependencies.getViewCenterRaDec - Get camera center
   * @param {function(): !Array=} dependencies.getDSOs - Get loaded DSO list
   * @param {function(): {width: number, height: number}=} dependencies.getViewportSize -
   *     Screen size, to fit the eyepiece field to the reticle circle
   */
  constructor(dependencies = {}) {
    /** @private @const */
    this.deps_ = dependencies;

    /** @private {!TelescopeConfig} */
    this.telescope_ = {
      diameter: TELESCOPE.DEFAULT_DIAMETER,
      focalLength: TELESCOPE.DEFAULT_FOCAL_LENGTH,
    };

    /** @private {!Array<!KitEyepiece>} The user's eyepieces; never empty */
    this.eyepieces_ = [{
      id: 'ep1',
      focalLength: TELESCOPE.DEFAULT_EYEPIECE_FL,
      apparentFov: TELESCOPE.DEFAULT_EYEPIECE_AFOV,
    }];

    /** @private {string} */
    this.activeEyepieceId_ = 'ep1';

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
    const {diameter} = this.telescope_;
    const {magnification, realFieldOfView, exitPupil} =
        eyepieceOptics(this.telescope_, this.activeEyepiece_());

    // Maximum useful magnification = 2 × Diameter (mm)
    const maxUsefulMagnification = TELESCOPE.MAX_MAG_MULTIPLIER * diameter;

    // Theoretical limiting magnitude — the telescope's optical limit under
    // perfect conditions.
    const theoreticalLimitingMag = telescopeLimitingMagnitude(diameter);

    // Sky-limited magnitude: min(theoretical, sky NELM + telescope gain)
    let limitingMagnitude = theoreticalLimitingMag;
    const skyNelm = this.deps_.getSkyLimitingMagnitude?.();
    if (skyNelm != null) {
      const skyLimitedMag = skyNelm + telescopeGain(diameter);
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
      return {diameter, ...classifyVisibility(
        margin, obj.subtype || obj.type, obj.size_major, diameter, obj.mag
      )};
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
      ...classifyVisibility(margin, obj.subtype || obj.type, obj.size_major, diameter, obj.mag),
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

    const {realFieldOfView, limitingMagnitude} = this.computedProperties_;
    const nearest = findNearestObject(center, realFieldOfView / 2, dsos.filter((dso) =>
      isDiffuseObject(dso) && dso.size_major > 0 && dso.mag <= limitingMagnitude));

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
    if (this.isActive_) this.applyTelescopeView_();
    this.saveToStorage_();
  }

  /**
   * The eyepiece in use.
   * @returns {!KitEyepiece}
   * @private
   */
  activeEyepiece_() {
    return this.eyepieces_.find((e) => e.id === this.activeEyepieceId_) ||
        this.eyepieces_[0];
  }

  /**
   * Get the eyepiece in use.
   * @returns {!EyepieceConfig} Current eyepiece config
   */
  getEyepiece() {
    const {focalLength, apparentFov} = this.activeEyepiece_();
    return {focalLength, apparentFov};
  }

  /**
   * Edit the eyepiece in use.
   * @param {!EyepieceConfig} config - Eyepiece configuration
   */
  setEyepiece(config) {
    Object.assign(this.activeEyepiece_(),
        pickPositiveNumbers(config, ['focalLength', 'apparentFov']));
    this.eyepiecesChanged_();
  }

  /**
   * The eyepiece kit, each with what it gives in the current telescope.
   * @returns {!Array<{id: string, focalLength: number, apparentFov: number,
   *     magnification: number, realFieldOfView: number, active: boolean}>}
   */
  getEyepieces() {
    return this.eyepieces_.map((e) => ({
      ...e,
      ...eyepieceOptics(this.telescope_, e),
      active: e.id === this.activeEyepieceId_,
    }));
  }

  /**
   * Add an eyepiece to the kit and switch to it.
   * @param {!EyepieceConfig} config
   * @returns {string} The new eyepiece's id
   */
  addEyepiece(config) {
    const id = `ep${Date.now().toString(36)}${this.eyepieces_.length}`;
    this.eyepieces_.push({
      id,
      focalLength: TELESCOPE.DEFAULT_EYEPIECE_FL,
      apparentFov: TELESCOPE.DEFAULT_EYEPIECE_AFOV,
      ...pickPositiveNumbers(config, ['focalLength', 'apparentFov']),
    });
    this.activeEyepieceId_ = id;
    this.eyepiecesChanged_();
    return id;
  }

  /**
   * Remove an eyepiece. The last one stays: the simulation needs one.
   * @param {string} id
   * @returns {boolean} Whether it was removed
   */
  removeEyepiece(id) {
    if (this.eyepieces_.length <= 1) return false;
    const index = this.eyepieces_.findIndex((e) => e.id === id);
    if (index < 0) return false;
    this.eyepieces_.splice(index, 1);
    if (this.activeEyepieceId_ === id) {
      this.activeEyepieceId_ = this.eyepieces_[Math.max(0, index - 1)].id;
    }
    this.eyepiecesChanged_();
    return true;
  }

  /**
   * Switch to another eyepiece of the kit; in telescope mode the view
   * changes to its field at once.
   * @param {string} id
   * @returns {boolean} Whether the id is in the kit
   */
  setActiveEyepiece(id) {
    if (!this.eyepieces_.some((e) => e.id === id)) return false;
    this.activeEyepieceId_ = id;
    this.eyepiecesChanged_();
    return true;
  }

  /**
   * Recompute (which announces TELESCOPE_COMPUTED), re-apply to the live
   * view and persist after the kit or the eyepiece in use changed.
   * @private
   */
  eyepiecesChanged_() {
    this.computeProperties_();
    if (this.isActive_) this.applyTelescopeView_();
    this.saveToStorage_();
  }

  /**
   * Recomputes the sky-limited magnitude after the naked-eye limit changed
   * (light pollution, moon), and re-applies it to the live view when active.
   */
  refreshSkyConditions() {
    this.computeProperties_();
    if (this.isActive_) this.applyTelescopeView_();
  }

  /**
   * Re-fit the eyepiece field to the reticle after the screen changed size
   * or orientation.
   */
  refitView() {
    if (this.isActive_) this.applyTelescopeView_();
  }

  /**
   * Applies the computed FOV (clamped) and magnitude limit to the live view.
   * @return {number} The applied field of view in degrees.
   * @private
   */
  applyTelescopeView_() {
    const {realFieldOfView, limitingMagnitude} = this.computedProperties_;
    const viewport = this.deps_.getViewportSize?.();
    const cameraFov = viewport ?
        reticleCameraFov(realFieldOfView, viewport.width, viewport.height) :
        realFieldOfView;
    const fov = Math.max(cameraFov, TELESCOPE.MIN_TELESCOPE_FOV);
    this.deps_.setFOV?.(fov);
    this.deps_.setMagnitudeLimit?.(limitingMagnitude);
    return fov;
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

    // Apply telescope settings to the live view
    const fov = this.applyTelescopeView_();
    const {limitingMagnitude} = this.computedProperties_;

    // Zoom input is locked while isActive() is true (InputController asks).

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
      eyepiece: this.getEyepiece(),
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

    // Presets come out of localStorage exactly as currentConfig does, so they
    // can carry the same junk: a zero or missing diameter drives
    // theoreticalLimitingMag to -Infinity, which reaches the shader uniform
    // and blanks every star. Validate here rather than at load time so a
    // preset saved before this check is also covered.
    this.telescope_ = {
      diameter: TELESCOPE.DEFAULT_DIAMETER,
      focalLength: TELESCOPE.DEFAULT_FOCAL_LENGTH,
      ...pickPositiveNumbers(preset.telescope, ['diameter', 'focalLength']),
    };
    // A preset names one eyepiece: use it from the kit, adding it if the
    // kit does not have it yet.
    const eyepiece = {
      focalLength: TELESCOPE.DEFAULT_EYEPIECE_FL,
      apparentFov: TELESCOPE.DEFAULT_EYEPIECE_AFOV,
      ...pickPositiveNumbers(preset.eyepiece, ['focalLength', 'apparentFov']),
    };
    const owned = this.eyepieces_.find((e) =>
      e.focalLength === eyepiece.focalLength && e.apparentFov === eyepiece.apparentFov);
    if (owned) {
      this.setActiveEyepiece(owned.id);
    } else {
      this.addEyepiece(eyepiece);
    }

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
    safeSetJson(TELESCOPE.STORAGE_KEY, {
      currentConfig: {
        telescope: this.telescope_,
        eyepieces: this.eyepieces_,
        activeEyepieceId: this.activeEyepieceId_,
      },
      presets: this.presets_,
    });
  }

  /**
   * Load configuration from localStorage.
   * @private
   */
  loadFromStorage_() {
    const data = safeGetJson(TELESCOPE.STORAGE_KEY);
    if (!data) return;

    if (data.currentConfig) {
      // Validate before merging. Every optical property is derived from
      // these by division or a logarithm, so a stored 0 or a non-number
      // propagates: diameter 0 gives a limiting magnitude of -Infinity,
      // which activating telescope mode pushes into the shader's magLimit
      // uniform, and every star disappears. The UI inputs already reject
      // these; storage is the path that did not.
      this.telescope_ = {
        ...this.telescope_,
        ...pickPositiveNumbers(data.currentConfig.telescope,
            ['diameter', 'focalLength']),
      };
      const kit = sanitizeKit(data.currentConfig.eyepieces);
      if (kit.length) {
        this.eyepieces_ = kit;
        this.activeEyepieceId_ =
            kit.some((e) => e.id === data.currentConfig.activeEyepieceId) ?
            data.currentConfig.activeEyepieceId : kit[0].id;
      } else {
        // Settings saved before the kit existed held a single eyepiece.
        Object.assign(this.eyepieces_[0], pickPositiveNumbers(
            data.currentConfig.eyepiece, ['focalLength', 'apparentFov']));
      }
    }

    // presets_ is an object keyed by preset name, so reject anything that
    // is not one — an array or a string here would break every lookup.
    if (data.presets && typeof data.presets === 'object' &&
        !Array.isArray(data.presets)) {
      this.presets_ = data.presets;
    }
  }
}
