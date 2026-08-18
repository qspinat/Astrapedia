/**
 * @fileoverview Time controller for simulation time management.
 * Handles time playback, speed control, and celestial rotation updates.
 */

import {globalEventBus, Events} from '../core/EventBus.js';

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
  }

  /**
   * Get current simulation time.
   * @returns {!Date} Current simulation time
   */
  getTime() {
    return new Date(this.simulationTime_);
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
   * Get the current time speed multiplier.
   * @returns {number} Speed multiplier; 0 when paused
   */
  getSpeed() {
    return this.timeSpeed_;
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
   * Pause playback.
   */
  pause() {
    this.setSpeed(0);
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
   * Dispose of resources.
   */
  dispose() {
    this.pause();
  }
}
