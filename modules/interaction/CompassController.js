/**
 * @fileoverview Compass mode controller for device orientation.
 * Uses device magnetometer and gyroscope to orient the celestial sphere.
 */

import {globalEventBus, Events} from '../core/EventBus.js';
import {createLogger} from '../core/Logger.js';
import {clamp, safeGetJson, safeSetJson} from '../core/Utils.js';
import {domCache} from '../ui/DOMCache.js';

const logger = createLogger('CompassController');

/** Persisted heading correction, in radians. */
const OFFSET_STORAGE_KEY = 'astrapedia_compass_offset';

/** Set once the drag-to-correct hint has been shown. */
const HINT_STORAGE_KEY = 'astrapedia_compass_hint_shown';

/**
 * Wrap an angle difference into [-PI, PI].
 * @param {number} rad
 * @returns {number}
 */
function wrapAngle(rad) {
  return Math.atan2(Math.sin(rad), Math.cos(rad));
}

/**
 * Smoothing factor for a sensor step: heavy for the small jitter of a phone
 * held still, light for a deliberate sweep so the sky keeps up without lag.
 * @param {number} diffRad - Distance from the shown to the measured direction
 * @returns {number} Fraction of the step to apply, 0.05..0.5
 */
export function adaptiveSmoothing(diffRad) {
  // A 0.1 rad (~6 degree) jump gets the fastest response.
  return clamp(Math.abs(diffRad) * 5, 0.05, 0.5);
}

/**
 * CompassController manages device orientation for AR sky viewing.
 * Handles permission requests, event listening, and smooth interpolation.
 */
export class CompassController {
  /**
   * Creates a new CompassController instance.
   * @param {!Object} dependencies - Required dependencies
   * @param {function(): void} dependencies.requestRender - Request render callback
   * @param {function(): void} dependencies.updateCameraPosition - Update camera callback
   * @param {function(string, number=): void=} dependencies.notify - Show a
   *     short message, optionally for a duration in ms
   */
  constructor(dependencies) {
    /** @private @const */
    this.requestRender_ = dependencies.requestRender || (() => {});

    /** @private @const */
    this.updateCameraPosition_ = dependencies.updateCameraPosition || (() => {});

    /** @private @const */
    this.notify_ = dependencies.notify || ((message) => logger.warn(message));

    /** @private {number} Correction added to the sensor heading, radians */
    this.headingOffset_ = Number(safeGetJson(OFFSET_STORAGE_KEY)) || 0;

    /** @private {boolean} The user is dragging the sky to correct the heading */
    this.aligning_ = false;

    /** @private {boolean} */
    this.compassMode_ = false;

    /** @private {number} */
    this.compassHeading_ = 0;

    /** @private {number} */
    this.compassTilt_ = Math.PI / 2;

    /** @private {?function(!DeviceOrientationEvent): void} */
    this.deviceOrientationHandler_ = null;

    /** @private {?number} */
    this.orientationTimeout_ = null;

    /** @private {number} */
    this.lastOrientationTime_ = 0;

    /** @private {number} Stale data timeout in ms */
    this.STALE_TIMEOUT_MS_ = 3000;

    /** @private {number} Check interval in ms */
    this.CHECK_INTERVAL_MS_ = 1000;

    /** @private {number} Dead zone for jitter reduction */
    this.DEAD_ZONE_ = 0.009;

  }

  /**
   * Check if compass mode is active.
   * @returns {boolean} True if compass mode is enabled
   */
  isEnabled() {
    return this.compassMode_;
  }

  /**
   * Get current compass heading.
   * @returns {number} Heading in radians
   */
  getHeading() {
    return this.compassHeading_;
  }

  /**
   * Get current compass tilt (phi).
   * @returns {number} Tilt in radians
   */
  getTilt() {
    return this.compassTilt_;
  }

  /**
   * Toggle compass mode on/off.
   * @returns {!Promise<boolean>} True if mode was enabled, false if disabled
   */
  async toggle() {
    if (this.compassMode_) {
      this.disable();
      return false;
    } else {
      return await this.enable();
    }
  }

  /**
   * Enable compass mode with device orientation.
   * Requests permission on iOS 13+ and starts listening for orientation events.
   * @returns {!Promise<boolean>} True if successfully enabled
   */
  async enable() {
    // Check if DeviceOrientationEvent is available
    if (!window.DeviceOrientationEvent) {
      this.notify_('This device has no orientation sensor.');
      return false;
    }

    // Request permission on iOS 13+ (requires user gesture)
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission !== 'granted') {
          this.notify_('Compass mode needs permission to use the orientation sensor.');
          return false;
        }
      } catch (err) {
        logger.error('Error requesting device orientation permission:', err);
        this.notify_('Could not enable compass mode. Please try again.');
        return false;
      }
    }

    // Create bound handler for cleanup
    this.deviceOrientationHandler_ = this.handleDeviceOrientation_.bind(this);

    // Listen for device orientation events
    // Prefer deviceorientationabsolute for true compass heading
    if ('ondeviceorientationabsolute' in window) {
      window.addEventListener(
        'deviceorientationabsolute',
        this.deviceOrientationHandler_,
        true
      );
    } else {
      // Fallback to regular deviceorientation (may be relative, not absolute)
      window.addEventListener(
        'deviceorientation',
        this.deviceOrientationHandler_,
        true
      );
    }

    this.compassMode_ = true;
    this.lastOrientationTime_ = performance.now();

    // Update button visual state
    this.updateButtonState_(true);

    // Start timeout to detect if orientation events stop firing
    this.startOrientationTimeout_();

    if (!safeGetJson(HINT_STORAGE_KEY)) {
      safeSetJson(HINT_STORAGE_KEY, true);
      this.notify_('Sky not lined up? Drag it into place to correct the compass.', 6000);
    }

    logger.info('Compass mode enabled');
    globalEventBus.emit(Events.COMPASS_ENABLED, {enabled: true});
    this.requestRender_();

    return true;
  }

  /**
   * Disable compass mode and return to manual control.
   */
  disable() {
    // Clear the stale data timeout
    this.clearOrientationTimeout_();

    if (this.deviceOrientationHandler_) {
      window.removeEventListener(
        'deviceorientationabsolute',
        this.deviceOrientationHandler_,
        true
      );
      window.removeEventListener(
        'deviceorientation',
        this.deviceOrientationHandler_,
        true
      );
      this.deviceOrientationHandler_ = null;
    }

    this.compassMode_ = false;
    this.aligning_ = false;

    // Update button visual state
    this.updateButtonState_(false);

    logger.info('Compass mode disabled');
    globalEventBus.emit(Events.COMPASS_DISABLED, {enabled: false});
  }

  /**
   * The user started dragging the sky: stop following the sensor so the drag
   * is not fought.
   */
  beginAlignment() {
    if (this.compassMode_) this.aligning_ = true;
  }

  /**
   * The drag ended with the sky where the user says it belongs: keep the
   * difference from the sensor heading as a lasting correction.
   * @param {number} theta - Camera azimuth the drag left, radians
   */
  endAlignment(theta) {
    if (!this.aligning_) return;
    this.aligning_ = false;
    const correction = wrapAngle(theta - this.compassHeading_);
    this.headingOffset_ = wrapAngle(this.headingOffset_ + correction);
    this.compassHeading_ = theta;
    safeSetJson(OFFSET_STORAGE_KEY, this.headingOffset_);
  }

  /**
   * Update the compass toggle button state.
   * @param {boolean} active - Whether compass mode is active
   * @private
   */
  updateButtonState_(active) {
    const btn = domCache.get('compass-toggle');
    if (btn) {
      if (active) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
        btn.blur(); // Remove focus state on mobile
        // Force style recalculation
        btn.offsetHeight;
      }
    }
  }

  /**
   * Start a timeout to detect stale orientation data.
   * If no orientation events received for 3 seconds, disable compass mode.
   * @private
   */
  startOrientationTimeout_() {
    this.clearOrientationTimeout_();
    this.orientationTimeout_ = setInterval(() => {
      if (!this.compassMode_) {
        this.clearOrientationTimeout_();
        return;
      }
      const elapsed = performance.now() - this.lastOrientationTime_;
      if (elapsed > this.STALE_TIMEOUT_MS_) {
        logger.warn('No orientation data received for 3s, disabling compass');
        this.disable();
      }
    }, this.CHECK_INTERVAL_MS_);
  }

  /**
   * Clear the orientation timeout.
   * @private
   */
  clearOrientationTimeout_() {
    if (this.orientationTimeout_) {
      clearInterval(this.orientationTimeout_);
      this.orientationTimeout_ = null;
    }
  }

  /**
   * Handle device orientation events for AR sky viewing.
   * Uses W3C DeviceOrientation spec formulas for AR mode.
   * Device held vertically, looking through the back camera at the sky.
   * @param {!DeviceOrientationEvent} event - The orientation event
   * @private
   */
  handleDeviceOrientation_(event) {
    if (!this.compassMode_) return;

    // Update timestamp for stale data detection
    this.lastOrientationTime_ = performance.now();
    if (this.aligning_) return;

    let alpha = event.alpha; // Compass direction (0-360)
    const beta = event.beta;   // Front/back tilt (-180 to 180)
    const gamma = event.gamma; // Left/right tilt (-90 to 90)

    if (alpha === null || beta === null || gamma === null) return;

    // Adjust for screen orientation
    const screenOrientation = window.orientation || 0;
    alpha = alpha - screenOrientation;
    if (alpha < 0) alpha += 360;

    // Convert to radians
    const a = alpha * Math.PI / 180;
    const b = beta * Math.PI / 180;
    const g = gamma * Math.PI / 180;

    // W3C spec: AR compass heading formula for device held vertically
    const cA = Math.cos(a);
    const sA = Math.sin(a);
    const cB = Math.cos(b);
    const sB = Math.sin(b);
    const cG = Math.cos(g);
    const sG = Math.sin(g);

    // Compute the direction vector v' pointing out of back of device
    const vx = -cA * sG - sA * sB * cG;
    const vy = -cB * cG;
    const vz = sA * sG - cA * sB * cG;

    // Compass heading (azimuth) from horizontal components
    const targetTheta = -Math.atan2(vx, vz) + Math.PI / 2 + this.headingOffset_;

    // Altitude angle from vertical component
    const clampedVy = clamp(-vy, -1, 1);
    const targetPhi = Math.acos(clampedVy);

    // Clamp phi to prevent flipping at poles
    const clampedPhi = clamp(targetPhi, 0.1, Math.PI - 0.1);

    // Handle theta wraparound for smooth interpolation
    const thetaDiff = wrapAngle(targetTheta - this.compassHeading_);

    const phiDiff = clampedPhi - this.compassTilt_;

    // Dead zone: ignore tiny movements to reduce jitter
    if (Math.abs(thetaDiff) < this.DEAD_ZONE_ && Math.abs(phiDiff) < this.DEAD_ZONE_) {
      return;
    }

    // Smooth the compass values: steady when held still, quick on a sweep
    this.compassHeading_ += thetaDiff * adaptiveSmoothing(thetaDiff);
    this.compassTilt_ += phiDiff * adaptiveSmoothing(phiDiff);

    // Emit event with new orientation values
    globalEventBus.emit(Events.COMPASS_HEADING, {
      theta: this.compassHeading_,
      phi: this.compassTilt_,
    });

    this.updateCameraPosition_();
    this.requestRender_();
  }

  /**
   * Dispose of the controller and clean up resources.
   */
  dispose() {
    this.disable();
  }
}
