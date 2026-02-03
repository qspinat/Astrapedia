/**
 * @fileoverview Time controller for simulation time management.
 * Handles time playback, speed control, and celestial rotation updates.
 */

import {globalEventBus, Events} from '../core/EventBus.js';
import {TIME} from '../core/Constants.js';

/**
 * Sidereal day in seconds (23h 56m 4s).
 * @const {number}
 */
const SIDEREAL_DAY_SECONDS = 86164;

/**
 * Sidereal rotation rate in radians per second.
 * @const {number}
 */
const SIDEREAL_ROTATION_RATE = (2 * Math.PI) / SIDEREAL_DAY_SECONDS;

/**
 * Update interval for planet positions (1 simulated hour in ms).
 * @const {number}
 */
const PLANET_UPDATE_INTERVAL = 3600000;

/**
 * TimeController manages simulation time and playback.
 */
export class TimeController {
  /**
   * Creates a new TimeController instance.
   * @param {!Object} dependencies - Required dependencies
   * @param {function(): void} dependencies.updatePlanets - Recreate planets
   * @param {function(number): void} dependencies.rotateCelestialSphere - Rotate sphere
   * @param {function(number): void} dependencies.setCelestialRotation - Set rotation
   * @param {function(!Date, number): number} dependencies.calculateLST - Calculate LST
   * @param {function(): number} dependencies.getLongitude - Get observer longitude
   */
  constructor(dependencies) {
    /** @private @const */
    this.updatePlanets_ = dependencies.updatePlanets;

    /** @private @const */
    this.rotateCelestialSphere_ = dependencies.rotateCelestialSphere;

    /** @private @const */
    this.setCelestialRotation_ = dependencies.setCelestialRotation;

    /** @private @const */
    this.calculateLST_ = dependencies.calculateLST;

    /** @private @const */
    this.getLongitude_ = dependencies.getLongitude;

    /**
     * Current simulation time.
     * @private {!Date}
     */
    this.simulationTime_ = new Date();

    /**
     * Time speed multiplier (0 = paused, 1 = realtime).
     * @private {number}
     */
    this.timeSpeed_ = 0;

    /**
     * Whether time playback is active.
     * @private {boolean}
     */
    this.isPlaying_ = false;

    /**
     * Last time planets were updated.
     * @private {number}
     */
    this.lastPlanetUpdate_ = Date.now();

    /**
     * Available time speed presets.
     * @private @const {!Array<number>}
     */
    this.speedPresets_ = TIME.SPEED_PRESETS;

    /**
     * Current preset index.
     * @private {number}
     */
    this.currentPresetIndex_ = 0;
  }

  /**
   * Get current simulation time.
   * @returns {!Date} Current simulation time
   */
  getTime() {
    return new Date(this.simulationTime_);
  }

  /**
   * Get current time speed.
   * @returns {number} Time speed multiplier
   */
  getSpeed() {
    return this.timeSpeed_;
  }

  /**
   * Check if time playback is active.
   * @returns {boolean} True if playing
   */
  isPlaying() {
    return this.isPlaying_;
  }

  /**
   * Set simulation time directly.
   * @param {!Date} date - New simulation time
   */
  setTime(date) {
    this.simulationTime_ = new Date(date);
    this.updateCelestialRotation_();
    this.updatePlanets_?.();
    this.lastPlanetUpdate_ = this.simulationTime_.getTime();

    globalEventBus.emit(Events.TIME_CHANGED, {
      time: this.getTime(),
      speed: this.timeSpeed_,
      isPlaying: this.isPlaying_,
    });
  }

  /**
   * Jump to a specific time.
   * @param {!Date} date - Target time
   */
  jumpToTime(date) {
    this.setTime(date);
  }

  /**
   * Reset to current real time.
   */
  resetToNow() {
    this.setTime(new Date());
    this.setSpeed(0);
  }

  /**
   * Set time speed.
   * @param {number} speed - Speed multiplier
   */
  setSpeed(speed) {
    this.timeSpeed_ = speed;
    this.isPlaying_ = speed !== 0;

    globalEventBus.emit(Events.TIME_SPEED_CHANGED, {
      speed: this.timeSpeed_,
      speedDisplay: this.getSpeedDisplayString(),
      isPlaying: this.isPlaying_,
    });
  }

  /**
   * Toggle playback on/off.
   * @param {number=} defaultSpeed - Speed to use when resuming (default 1)
   */
  togglePlayback(defaultSpeed = 1) {
    if (this.isPlaying_) {
      this.setSpeed(0);
    } else {
      this.setSpeed(this.timeSpeed_ || defaultSpeed);
    }
  }

  /**
   * Start playback at specified or current speed.
   * @param {number=} speed - Speed to use (defaults to current or 1)
   */
  play(speed) {
    const targetSpeed = speed ?? (this.timeSpeed_ || 1);
    this.setSpeed(targetSpeed);
  }

  /**
   * Pause playback.
   */
  pause() {
    this.setSpeed(0);
  }

  /**
   * Cycle to next speed preset.
   */
  nextSpeed() {
    this.currentPresetIndex_ = (this.currentPresetIndex_ + 1) %
      this.speedPresets_.length;
    this.setSpeed(this.speedPresets_[this.currentPresetIndex_]);
  }

  /**
   * Cycle to previous speed preset.
   */
  previousSpeed() {
    this.currentPresetIndex_ = (this.currentPresetIndex_ - 1 +
      this.speedPresets_.length) % this.speedPresets_.length;
    this.setSpeed(this.speedPresets_[this.currentPresetIndex_]);
  }

  /**
   * Speed up by factor.
   * @param {number=} factor - Multiplier (default 2)
   */
  speedUp(factor = 2) {
    const newSpeed = Math.max(1, this.timeSpeed_ * factor);
    this.setSpeed(Math.min(newSpeed, TIME.MAX_SPEED));
  }

  /**
   * Slow down by factor.
   * @param {number=} factor - Divisor (default 2)
   */
  slowDown(factor = 2) {
    const newSpeed = this.timeSpeed_ / factor;
    if (newSpeed < 1) {
      this.setSpeed(0);
    } else {
      this.setSpeed(newSpeed);
    }
  }

  /**
   * Step forward by duration.
   * @param {number} milliseconds - Duration to step
   */
  stepForward(milliseconds) {
    const newTime = new Date(this.simulationTime_.getTime() + milliseconds);
    this.setTime(newTime);
  }

  /**
   * Step backward by duration.
   * @param {number} milliseconds - Duration to step back
   */
  stepBackward(milliseconds) {
    const newTime = new Date(this.simulationTime_.getTime() - milliseconds);
    this.setTime(newTime);
  }

  /**
   * Step forward by one hour.
   */
  stepHour() {
    this.stepForward(3600000);
  }

  /**
   * Step forward by one day.
   */
  stepDay() {
    this.stepForward(86400000);
  }

  /**
   * Step forward by one week.
   */
  stepWeek() {
    this.stepForward(604800000);
  }

  /**
   * Step forward by one month (30 days).
   */
  stepMonth() {
    this.stepForward(2592000000);
  }

  /**
   * Update simulation time (call from animation loop).
   * @param {number} deltaMs - Elapsed real time in ms
   * @returns {boolean} True if time was updated
   */
  update(deltaMs) {
    if (!this.isPlaying_ || this.timeSpeed_ === 0) {
      return false;
    }

    const simulatedDelta = deltaMs * this.timeSpeed_;
    this.simulationTime_ = new Date(
      this.simulationTime_.getTime() + simulatedDelta
    );

    // Rotate celestial sphere for Earth's rotation
    this.applySiderealRotation_(simulatedDelta);

    // Update planets periodically at high speeds
    this.checkPlanetUpdate_();

    globalEventBus.emit(Events.TIME_TICK, {
      time: this.getTime(),
      deltaMs: simulatedDelta,
    });

    return true;
  }

  /**
   * Apply sidereal rotation to celestial sphere.
   * @param {number} deltaMs - Simulated time change in ms
   * @private
   */
  applySiderealRotation_(deltaMs) {
    if (!this.rotateCelestialSphere_) return;

    const deltaSeconds = deltaMs / 1000;
    const rotationAngle = SIDEREAL_ROTATION_RATE * deltaSeconds;

    // Negative because stars appear to move westward
    this.rotateCelestialSphere_(-rotationAngle);
  }

  /**
   * Update celestial sphere rotation based on LST.
   * @private
   */
  updateCelestialRotation_() {
    if (!this.setCelestialRotation_ || !this.calculateLST_) return;

    const longitude = this.getLongitude_?.() || 0;
    const lst = this.calculateLST_(this.simulationTime_, longitude);

    // LST is RA on meridian; place it at -Z (due south)
    const lstRad = lst * Math.PI / 180;
    const rotation = Math.PI / 2 - lstRad;

    this.setCelestialRotation_(rotation);
  }

  /**
   * Refresh celestial sphere rotation based on current time and observer location.
   * Call this when observer location changes to update the sky position.
   */
  refreshCelestialRotation() {
    this.updateCelestialRotation_();
  }

  /**
   * Check if planets need updating.
   * @private
   */
  checkPlanetUpdate_() {
    const timeSinceUpdate = Math.abs(
      this.simulationTime_.getTime() - this.lastPlanetUpdate_
    );

    if (timeSinceUpdate > PLANET_UPDATE_INTERVAL) {
      this.updatePlanets_?.();
      this.lastPlanetUpdate_ = this.simulationTime_.getTime();
    }
  }

  /**
   * Get display string for current speed.
   * @returns {string} Human-readable speed string
   */
  getSpeedDisplayString() {
    if (this.timeSpeed_ === 0) {
      return 'Paused';
    } else if (this.timeSpeed_ === 1) {
      return 'Real-time';
    } else if (this.timeSpeed_ === 60) {
      return '1 min/s';
    } else if (this.timeSpeed_ === 600) {
      return '10 min/s';
    } else if (this.timeSpeed_ === 3600) {
      return '1 hr/s';
    } else {
      return `x${this.timeSpeed_}`;
    }
  }

  /**
   * Get formatted time string.
   * @param {string=} format - Format type ('full', 'date', 'time')
   * @returns {string} Formatted time string
   */
  getFormattedTime(format = 'full') {
    const date = this.simulationTime_;

    switch (format) {
      case 'date':
        return date.toLocaleDateString();
      case 'time':
        return date.toLocaleTimeString();
      case 'iso':
        return date.toISOString();
      case 'short':
        return date.toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      case 'full':
      default:
        return date.toLocaleString();
    }
  }

  /**
   * Get time of day category.
   * @returns {string} 'day', 'night', 'dawn', or 'dusk'
   */
  getTimeOfDay() {
    const hour = this.simulationTime_.getHours();

    if (hour >= 6 && hour < 8) {
      return 'dawn';
    } else if (hour >= 8 && hour < 18) {
      return 'day';
    } else if (hour >= 18 && hour < 20) {
      return 'dusk';
    } else {
      return 'night';
    }
  }

  /**
   * Check if it's currently nighttime.
   * @returns {boolean} True if nighttime
   */
  isNight() {
    const timeOfDay = this.getTimeOfDay();
    return timeOfDay === 'night' || timeOfDay === 'dusk' || timeOfDay === 'dawn';
  }

  /**
   * Get Julian Date for current simulation time.
   * @returns {number} Julian Date
   */
  getJulianDate() {
    const date = this.simulationTime_;
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
   * Set time from Julian Date.
   * @param {number} jd - Julian Date
   */
  setFromJulianDate(jd) {
    const z = Math.floor(jd + 0.5);
    const f = jd + 0.5 - z;

    let a;
    if (z < 2299161) {
      a = z;
    } else {
      const alpha = Math.floor((z - 1867216.25) / 36524.25);
      a = z + 1 + alpha - Math.floor(alpha / 4);
    }

    const b = a + 1524;
    const c = Math.floor((b - 122.1) / 365.25);
    const d = Math.floor(365.25 * c);
    const e = Math.floor((b - d) / 30.6001);

    const day = b - d - Math.floor(30.6001 * e) + f;
    const month = e < 14 ? e - 1 : e - 13;
    const year = month > 2 ? c - 4716 : c - 4715;

    const dayFrac = day % 1;
    const hours = dayFrac * 24;
    const hourInt = Math.floor(hours);
    const minutes = (hours - hourInt) * 60;
    const minuteInt = Math.floor(minutes);
    const seconds = (minutes - minuteInt) * 60;

    const date = new Date(Date.UTC(
      year, month - 1, Math.floor(day),
      hourInt, minuteInt, Math.floor(seconds)
    ));

    this.setTime(date);
  }

  /**
   * Dispose of resources.
   */
  dispose() {
    this.pause();
  }
}

/**
 * Singleton instance for application-wide time control.
 * Note: Must be initialized with dependencies before use.
 * @type {?TimeController}
 */
export let timeController = null;

/**
 * Initialize the time controller singleton.
 * @param {!Object} dependencies - Required dependencies
 * @returns {!TimeController} Initialized controller
 */
export function initializeTimeController(dependencies) {
  timeController = new TimeController(dependencies);
  return timeController;
}
