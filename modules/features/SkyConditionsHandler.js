/**
 * @fileoverview Sky conditions handler for calculating naked eye limiting magnitude.
 *
 * Calculates the naked eye limiting magnitude (NELM) based on:
 * - Light pollution level (Bortle scale)
 * - Moon phase and altitude
 *
 * Sources:
 * - Bortle Scale: https://en.wikipedia.org/wiki/Bortle_scale
 * - Sky & Telescope: https://skyandtelescope.org/astronomy-resources/light-pollution-and-astronomy-the-bortle-dark-sky-scale/
 * - Moon effect: https://skyandtelescope.org/astronomy-resources/astronomy-questions-answers/how-does-the-moons-phase-affect-the-skyglow-of-any-given-location-and-how-many-days-before-or-after-a-new-moon-is-a-dark-site-not-compromised/
 */

import {globalEventBus, Events} from '../core/EventBus.js';
import {locationManager} from '../services/LocationManager.js';
import {moonPhaseName} from '../core/MoonPhase.js';

/**
 * SkyConditionsHandler manages sky condition calculations for NELM.
 */
export class SkyConditionsHandler {
  /** Creates a new SkyConditionsHandler instance. */
  constructor() {
    /**
     * Base naked eye limiting magnitude by light pollution level.
     * Values from Bortle scale research.
     * @private @const {!Object<string, number>}
     */
    this.baseMagnitudes_ = {
      city: 3.8,      // Bortle 8-9: Inner city, NELM ~3.6-4.1
      suburban: 5.3,  // Bortle 5-6: Suburban sky, NELM ~5.1-5.6
      rural: 6.3,     // Bortle 3-4: Rural sky, NELM ~6.1-6.6
      dark: 7.3,      // Bortle 1-2: Dark sky site, NELM ~7.1-7.6
    };

    /** @private {string} */
    this.lightPollution_ = 'rural';

    /** @private {number} Moon phase 0-1 (0=new, 0.5=full) */
    this.moonPhase_ = 0;

    /** @private {number} Moon altitude in degrees */
    this.moonAltitude_ = -10;

    /** @private {?number} */
    this.updateInterval_ = null;

    /** @private {!Array<function(): void>} */
    this.changeCallbacks_ = [];

    /** @private {?Object} Cached reference to moon data */
    this.cachedMoonData_ = null;

    /** @private {?Array} Cached reference to planets array for invalidation check */
    this.cachedPlanetsRef_ = null;

    /** @private {!Date} Current simulation time from EventBus */
    this.simulationTime_ = new Date();

    /** @private {{lat: number, lon: number}} Observer location from EventBus */
    this.observerLocation_ = {lat: 45, lon: 0};

    /** @private {!Array<{unsubscribe: function(): void}>} EventBus subscriptions */
    this.subscriptions_ = [];

    this.loadFromStorage_();
  }

  /**
   * Register a callback to be called when sky conditions change.
   * @param {function(): void} callback
   */
  onChange(callback) {
    this.changeCallbacks_.push(callback);
  }

  /**
   * Notify all registered callbacks of a change.
   * @private
   */
  notifyChange_() {
    this.changeCallbacks_.forEach((cb) => cb());
  }

  /**
   * Set up EventBus subscriptions for time, location, and planet updates.
   * @private
   */
  setupEventSubscriptions_() {
    this.subscriptions_.push(
      // TIME_CHANGED fires only on an explicit jump; continuous playback
      // emits TIME_TICK. Listening to just the former left simulationTime_ at
      // the last jump, so the moon altitude and the naked-eye limit derived
      // from it drifted further out of date the longer playback ran.
      globalEventBus.on(Events.TIME_CHANGED, (data) => {
        this.simulationTime_ = data.time;
      }),
      globalEventBus.on(Events.TIME_TICK, (data) => {
        this.simulationTime_ = data.time;
      }),
      globalEventBus.on(Events.LOCATION_CHANGED, (data) => {
        this.observerLocation_ = {
          lat: data.location.lat,
          lon: data.location.lon,
        };
      }),
      globalEventBus.on(Events.PLANETS_UPDATED, (data) => {
        if (data.moon) {
          this.cachedMoonData_ = data.moon;
          this.moonPhase_ = data.moon.phase || 0;
          this.moonAltitude_ = locationManager.calculateAltitude(
            data.moon.ra, data.moon.dec, this.simulationTime_
          );
        }
      })
    );
  }

  /**
   * Get moon phase name and emoji.
   * @param {number} phase - Moon phase 0-1
   * @returns {{name: string, emoji: string}}
   * @private
   */
  getMoonPhaseName_(phase) {
    return moonPhaseName(phase);
  }

  /**
   * Calculate moon illumination factor (0-1) from phase.
   * Not linear - quarter moon is only ~8% as bright as full moon.
   * @param {number} phase - Moon phase 0-1
   * @returns {number} Illumination factor 0-1
   * @private
   */
  getMoonIllumination_(phase) {
    // Convert phase to angle from full moon (0 at full, PI at new)
    const angleFromFull = Math.abs(phase - 0.5) * 2 * Math.PI;
    // Approximate illumination using cosine (simplified)
    // Full moon = 1, new moon = 0, quarter = ~0.5
    const illumination = (1 + Math.cos(angleFromFull)) / 2;
    return illumination;
  }

  /**
   * Calculate magnitude reduction from moon.
   * Full moon above horizon can reduce NELM by up to 2.5 magnitudes.
   * @returns {number} Magnitude reduction (positive value)
   * @private
   */
  getMoonMagnitudeReduction_() {
    // If moon is below horizon, no effect
    if (this.moonAltitude_ <= 0) return 0;

    const illumination = this.getMoonIllumination_(this.moonPhase_);

    // Maximum reduction at full moon high in sky: ~2.5 magnitudes
    // Scale by illumination and altitude factor
    const altitudeFactor = Math.min(1, this.moonAltitude_ / 45); // Full effect above 45°
    const maxReduction = 2.5;

    return illumination * altitudeFactor * maxReduction;
  }

  /**
   * Calculate current naked eye limiting magnitude.
   * @returns {number} NELM value
   */
  calculateNakedEyeLimit() {
    const baseMag = this.baseMagnitudes_[this.lightPollution_] || 6.5;
    const moonReduction = this.getMoonMagnitudeReduction_();
    return Math.max(2.0, baseMag - moonReduction);
  }

  /**
   * Update moon position from cached data.
   * Moon data is updated via PLANETS_UPDATED event from EventBus.
   * Uses estimate as fallback if no data available yet.
   * @private
   */
  updateMoonData_() {
    // Moon data is now updated via PLANETS_UPDATED event
    // Use estimate as fallback if no data available yet
    if (this.cachedMoonData_ === null) {
      this.estimateMoonPhase_(this.simulationTime_);
    }
  }

  /**
   * Estimate moon phase and altitude without Astronomy Engine.
   * Uses a simplified model based on lunar cycle and time of day.
   *
   * NOTE: This is a simplified model that does not account for observer
   * latitude. The actual maximum altitude depends on declination and
   * observer position. This approximation assumes mid-latitudes (~40-50°N/S)
   * and provides reasonable estimates for light pollution calculations.
   *
   * @param {!Date} date
   * @private
   */
  estimateMoonPhase_(date) {
    // Known new moon: 6 January 2000, 18:14 UTC. Date.UTC, not the local-time
    // constructor — that read the instant as local, shifting the whole phase
    // estimate by the viewer's UTC offset.
    const knownNewMoon = new Date(Date.UTC(2000, 0, 6, 18, 14, 0));
    const lunarCycle = 29.530588853; // days
    const daysSinceNew = (date - knownNewMoon) / (1000 * 60 * 60 * 24);
    const phaseInCycle = ((daysSinceNew % lunarCycle) + lunarCycle) % lunarCycle;
    this.moonPhase_ = phaseInCycle / lunarCycle;

    // Estimate moon altitude based on phase and time of day
    // The moon's transit time shifts ~50 min later each day
    // New moon transits at noon, full moon at midnight
    // First quarter transits at 6pm, last quarter at 6am
    const hour = date.getHours() + date.getMinutes() / 60;

    // Moon transit hour: new moon (phase=0) transits at 12:00,
    // full moon (phase=0.5) transits at 0:00 (midnight)
    const transitHour = (12 + this.moonPhase_ * 24) % 24;

    // Hours from transit (moon is highest at transit)
    let hoursFromTransit = hour - transitHour;
    if (hoursFromTransit > 12) hoursFromTransit -= 24;
    if (hoursFromTransit < -12) hoursFromTransit += 24;

    // Approximate altitude: max ~50° at transit, varies with latitude
    // Use cosine curve: altitude = maxAlt * cos(hoursFromTransit * π/12)
    // This gives altitude = 0 at ±6 hours from transit (moon above horizon ~12 hours)
    const maxAltitude = 50; // Approximate max altitude
    if (Math.abs(hoursFromTransit) > 6) {
      // Moon below horizon
      this.moonAltitude_ = -10;
    } else {
      // Moon above horizon, use cosine approximation
      // π/12 radians per hour means altitude = 0 at 6 hours from transit
      this.moonAltitude_ = maxAltitude * Math.cos(hoursFromTransit * Math.PI / 12);
    }
  }

  /**
   * Update the display.
   * @private
   */
  updateDisplay_() {
    this.updateMoonData_();

    const phaseInfo = this.getMoonPhaseName_(this.moonPhase_);
    const nakedEyeLimit = this.calculateNakedEyeLimit();

    // Update moon phase display
    const phaseEl = document.getElementById('moon-phase-display');
    if (phaseEl) {
      const illumination = Math.round(this.getMoonIllumination_(this.moonPhase_) * 100);
      phaseEl.textContent = `${phaseInfo.emoji} ${phaseInfo.name} (${illumination}%)`;
    }

    // Update moon altitude display
    const altEl = document.getElementById('moon-altitude-display');
    if (altEl) {
      if (this.moonAltitude_ <= 0) {
        altEl.textContent = 'Below horizon ✓';
        altEl.style.color = 'var(--accent-green, #22c55e)';
      } else {
        altEl.textContent = `${this.moonAltitude_.toFixed(0)}° above horizon`;
        altEl.style.color = 'var(--text-primary)';
      }
    }

    // Update naked eye limit display
    const limitEl = document.getElementById('naked-eye-limit-display');
    if (limitEl) {
      limitEl.textContent = `mag ${nakedEyeLimit.toFixed(1)}`;
    }
  }

  /**
   * Save to localStorage.
   * @private
   */
  saveToStorage_() {
    try {
      localStorage.setItem('astrapedia_light_pollution', this.lightPollution_);
    } catch (e) {
      // Ignore storage errors
    }
  }

  /**
   * Load from localStorage.
   * @private
   */
  loadFromStorage_() {
    try {
      const saved = localStorage.getItem('astrapedia_light_pollution');
      if (saved && this.baseMagnitudes_[saved]) {
        this.lightPollution_ = saved;
      }
    } catch (e) {
      // Ignore storage errors
    }
  }

  /**
   * Get current naked eye limiting magnitude.
   * @returns {number}
   */
  getNakedEyeLimit() {
    return this.calculateNakedEyeLimit();
  }

  /**
   * Get current light pollution setting.
   * @returns {string}
   */
  getLightPollution() {
    return this.lightPollution_;
  }

  /** Sets up event listeners. */
  setupEventListeners() {
    // Set up EventBus subscriptions
    this.setupEventSubscriptions_();

    // Light pollution selector
    const select = document.getElementById('light-pollution-select');
    if (select) {
      select.value = this.lightPollution_;
      select.addEventListener('change', (e) => {
        this.lightPollution_ = e.target.value;
        this.saveToStorage_();
        this.updateDisplay_();
        this.notifyChange_();
      });
    }

    // Initial display update
    this.updateDisplay_();

    // Update periodically (every 30 seconds) for moon position changes
    this.updateInterval_ = setInterval(() => {
      this.updateDisplay_();
      this.notifyChange_();
    }, 30000);
  }

  /** Stop the update interval and clean up subscriptions. */
  dispose() {
    if (this.updateInterval_) {
      clearInterval(this.updateInterval_);
      this.updateInterval_ = null;
    }
    // Clean up EventBus subscriptions
    this.subscriptions_.forEach((sub) => sub.unsubscribe());
    this.subscriptions_ = [];
  }
}
