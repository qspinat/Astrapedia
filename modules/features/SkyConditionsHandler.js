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

/**
 * Moon phase threshold constants.
 * Each phase spans 1/8 of the cycle (0.125), boundaries are at midpoints.
 * @const {!Object<string, number>}
 */
export const MOON_PHASE_THRESHOLDS = {
  NEW_MOON_END: 0.0625,        // 1/16 - end of new moon
  WAXING_CRESCENT_END: 0.1875, // 3/16 - end of waxing crescent
  FIRST_QUARTER_END: 0.3125,   // 5/16 - end of first quarter
  WAXING_GIBBOUS_END: 0.4375,  // 7/16 - end of waxing gibbous
  FULL_MOON_END: 0.5625,       // 9/16 - end of full moon
  WANING_GIBBOUS_END: 0.6875,  // 11/16 - end of waning gibbous
  LAST_QUARTER_END: 0.8125,    // 13/16 - end of last quarter
  WANING_CRESCENT_END: 0.9375, // 15/16 - end of waning crescent
};

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
      city: 4.0,      // Bortle 8-9: Inner city, only bright stars visible
      suburban: 5.5,  // Bortle 5-6: Suburban sky
      rural: 6.5,     // Bortle 4: Rural/suburban transition
      dark: 7.5,      // Bortle 2-3: Dark sky site, excellent conditions
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
   * Get moon phase name and emoji.
   * @param {number} phase - Moon phase 0-1
   * @returns {{name: string, emoji: string}}
   * @private
   */
  getMoonPhaseName_(phase) {
    // Phase: 0 = new moon, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter
    const T = MOON_PHASE_THRESHOLDS;
    if (phase < T.NEW_MOON_END) return {name: 'New Moon', emoji: '🌑'};
    if (phase < T.WAXING_CRESCENT_END) return {name: 'Waxing Crescent', emoji: '🌒'};
    if (phase < T.FIRST_QUARTER_END) return {name: 'First Quarter', emoji: '🌓'};
    if (phase < T.WAXING_GIBBOUS_END) return {name: 'Waxing Gibbous', emoji: '🌔'};
    if (phase < T.FULL_MOON_END) return {name: 'Full Moon', emoji: '🌕'};
    if (phase < T.WANING_GIBBOUS_END) return {name: 'Waning Gibbous', emoji: '🌖'};
    if (phase < T.LAST_QUARTER_END) return {name: 'Last Quarter', emoji: '🌗'};
    if (phase < T.WANING_CRESCENT_END) return {name: 'Waning Crescent', emoji: '🌘'};
    return {name: 'New Moon', emoji: '🌑'};
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
   * Update moon position from app data.
   * @private
   */
  updateMoonData_() {
    if (typeof window === 'undefined' || !window.app) return;

    // Get simulation time
    const simTime = window.app.simulationTime || new Date();

    // Use Astronomy Engine if available (loaded in app.html)
    if (typeof Astronomy !== 'undefined') {
      try {
        // Calculate moon phase
        const moonIllum = Astronomy.Illumination('Moon', simTime);
        this.moonPhase_ = moonIllum.phase_angle / 360; // Convert to 0-1

        // Calculate moon position
        const observer = {
          latitude: window.app.observerLatitude || 0,
          longitude: window.app.observerLongitude || 0,
          height: 0,
        };
        const moonPos = Astronomy.Equator('Moon', simTime, observer, true, true);
        const moonHoriz = Astronomy.Horizon(simTime, observer, moonPos.ra, moonPos.dec, 'normal');
        this.moonAltitude_ = moonHoriz.altitude;
      } catch (e) {
        // Fallback: estimate from lunar cycle (~29.5 days)
        this.estimateMoonPhase_(simTime);
      }
    } else {
      this.estimateMoonPhase_(simTime);
    }
  }

  /**
   * Estimate moon phase without Astronomy Engine.
   * @param {!Date} date
   * @private
   */
  estimateMoonPhase_(date) {
    // Known new moon: January 6, 2000
    const knownNewMoon = new Date(2000, 0, 6, 18, 14, 0);
    const lunarCycle = 29.530588853; // days
    const daysSinceNew = (date - knownNewMoon) / (1000 * 60 * 60 * 24);
    this.moonPhase_ = (daysSinceNew % lunarCycle) / lunarCycle;

    // Rough altitude estimate (assume worst case - moon could be up)
    // For better UX, assume moon is up during night hours
    const hour = date.getHours();
    if (hour >= 6 && hour <= 18) {
      this.moonAltitude_ = -10; // Daytime, assume moon not affecting much
    } else {
      // Night time - assume moon might be up, scale by illumination
      this.moonAltitude_ = 30 * this.getMoonIllumination_(this.moonPhase_);
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
      localStorage.setItem('skymap_light_pollution', this.lightPollution_);
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
      const saved = localStorage.getItem('skymap_light_pollution');
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

  /** Stop the update interval. */
  dispose() {
    if (this.updateInterval_) {
      clearInterval(this.updateInterval_);
      this.updateInterval_ = null;
    }
  }
}
