/**
 * @fileoverview Application context facade for decoupled module access.
 * Provides a clean interface to app functionality without direct window.app coupling.
 */

/**
 * AppContext provides a facade for accessing SkyMapApp functionality.
 * Modules should use this instead of directly accessing window.app.
 */
export class AppContext {
  /**
   * Creates a new AppContext instance.
   * @param {!Object} app - The SkyMapApp instance
   */
  constructor(app) {
    /** @private @const */
    this.app_ = app;
  }

  // =========================================================================
  // NAVIGATION & CAMERA
  // =========================================================================

  /**
   * Navigate camera to specific RA/Dec coordinates.
   * @param {number} ra - Right Ascension in degrees
   * @param {number} dec - Declination in degrees
   */
  navigateToRaDec(ra, dec) {
    this.app_.animateCameraTo?.(ra, dec);
  }

  /**
   * Reset camera to default position.
   */
  resetCamera() {
    this.app_.resetCamera?.();
  }

  /**
   * Get current target FOV.
   * @returns {number} Target FOV in degrees
   */
  getTargetFov() {
    return this.app_.targetFov || 60;
  }

  /**
   * Set target FOV.
   * @param {number} fov - FOV in degrees
   */
  setTargetFov(fov) {
    if (this.app_) {
      this.app_.targetFov = fov;
    }
  }

  /**
   * Request a render frame.
   */
  requestRender() {
    this.app_.requestRender?.();
  }

  // =========================================================================
  // SELECTION & SEARCH
  // =========================================================================

  /**
   * Select an object and display its info.
   * @param {?Object} obj - Object to select, or null to deselect
   */
  selectObject(obj) {
    this.app_.selectObject?.(obj);
  }

  /**
   * Perform a search query.
   * @param {string} query - Search query string
   * @returns {!Array<!Object>} Search results
   */
  performSearch(query) {
    return this.app_.performSearch?.(query) || [];
  }

  /**
   * Get currently selected object.
   * @returns {?Object} Selected object or null
   */
  getSelectedObject() {
    return this.app_.selectedObject || null;
  }

  // =========================================================================
  // MAGNITUDE & VISIBILITY
  // =========================================================================

  /**
   * Set magnitude limit for star visibility.
   * @param {number} mag - Magnitude limit
   */
  setMagnitudeLimit(mag) {
    this.app_.setMagnitudeLimit?.(mag);
  }

  /**
   * Get current magnitude limit.
   * @returns {number} Current magnitude limit
   */
  getMagnitudeLimit() {
    return this.app_.currentMagnitude || 8.0;
  }

  /**
   * Set equator line visibility.
   * @param {boolean} visible - Whether equator line should be visible
   */
  setEquatorLineVisible(visible) {
    this.app_.setEquatorLineVisible?.(visible);
  }

  // =========================================================================
  // CONSTELLATIONS
  // =========================================================================

  /**
   * Set constellation label language.
   * @param {string} language - Language code (e.g., 'en', 'la', 'fr')
   */
  setConstellationLanguage(language) {
    this.app_.setConstellationLanguage?.(language);
  }

  /**
   * Highlight a constellation.
   * @param {string} name - Constellation name
   */
  highlightConstellation(name) {
    this.app_.highlightConstellation?.(name);
  }

  /**
   * Remove constellation highlighting.
   */
  unhighlightConstellation() {
    this.app_.unhighlightConstellation?.();
  }

  // =========================================================================
  // TIME SIMULATION
  // =========================================================================

  /**
   * Set time simulation speed.
   * @param {number} speed - Speed multiplier (0 = paused, 1 = real-time)
   */
  setTimeSpeed(speed) {
    this.app_.setTimeSpeed?.(speed);
  }

  /**
   * Get current time speed.
   * @returns {number} Current time speed
   */
  getTimeSpeed() {
    return this.app_.timeSpeed || 0;
  }

  /**
   * Check if time is playing.
   * @returns {boolean} Whether time simulation is playing
   */
  isTimePlaying() {
    return this.app_.isTimePlaying || false;
  }

  /**
   * Set time playing state.
   * @param {boolean} playing - Whether time should be playing
   */
  setTimePlaying(playing) {
    if (this.app_) {
      this.app_.isTimePlaying = playing;
    }
  }

  /**
   * Jump to a specific time.
   * @param {!Date} date - Date to jump to
   */
  jumpToTime(date) {
    this.app_.jumpToTime?.(date);
  }

  /**
   * Get current simulation time.
   * @returns {!Date} Current simulation time
   */
  getSimulationTime() {
    return this.app_.simulationTime || new Date();
  }

  // =========================================================================
  // LOCATION
  // =========================================================================

  /**
   * Request geolocation from device.
   */
  requestGeolocation() {
    this.app_.requestGeolocation?.();
  }

  /**
   * Show location settings dialog.
   */
  showLocationDialog() {
    this.app_.showLocationDialog?.();
  }

  /**
   * Get current observer location.
   * @returns {{lat: number, lon: number, height: number}} Observer location
   */
  getObserverLocation() {
    return this.app_.observerLocation || {lat: 45, lon: 0, height: 0};
  }

  // =========================================================================
  // COMPASS MODE
  // =========================================================================

  /**
   * Toggle compass/device orientation mode.
   */
  toggleCompassMode() {
    this.app_.toggleCompassMode?.();
  }

  /**
   * Check if compass mode is active.
   * @returns {boolean} Whether compass mode is active
   */
  isCompassModeActive() {
    return this.app_.compassMode || false;
  }

  // =========================================================================
  // GAME MODE
  // =========================================================================

  /**
   * Start the identification game.
   */
  startGame() {
    this.app_.startGame?.();
  }

  /**
   * Stop the current game.
   */
  stopGame() {
    this.app_.stopGame?.();
  }

  /**
   * Pass (skip) the current game question.
   */
  passCurrentObject() {
    this.app_.passCurrentObject?.();
  }

  /**
   * Check if game is active.
   * @returns {boolean} Whether game is active
   */
  isGameActive() {
    return this.app_.gameActive || false;
  }

  // =========================================================================
  // TOURS
  // =========================================================================

  /**
   * Start a guided tour.
   * @param {string} tourName - Name of tour to start
   */
  startTour(tourName) {
    this.app_.startTour?.(tourName);
  }

  /**
   * End the current tour.
   */
  endTour() {
    this.app_.endTour?.();
  }

  // =========================================================================
  // DATA ACCESS
  // =========================================================================

  /**
   * Get all loaded stars.
   * @returns {!Array<!Object>} Stars array
   */
  getStars() {
    return this.app_.stars || [];
  }

  /**
   * Get all loaded deep sky objects.
   * @returns {!Array<!Object>} DSOs array
   */
  getDSOs() {
    return this.app_.deepSkyObjects || [];
  }

  /**
   * Get all loaded constellations.
   * @returns {!Object} Constellations object
   */
  getConstellations() {
    return this.app_.constellations || {};
  }

  /**
   * Get all planets.
   * @returns {!Array<!Object>} Planets array
   */
  getPlanets() {
    return this.app_.planets || [];
  }

  // =========================================================================
  // DYNAMIC DATA
  // =========================================================================

  /**
   * Set maximum dynamic stars to load.
   * @param {number} max - Maximum star count
   */
  setMaxDynamicStars(max) {
    if (this.app_) {
      this.app_.maxDynamicStars = max;
    }
  }

  /**
   * Get maximum dynamic stars setting.
   * @returns {number} Maximum dynamic stars
   */
  getMaxDynamicStars() {
    return this.app_.maxDynamicStars || 30000;
  }

  // =========================================================================
  // TELESCOPE MODE
  // =========================================================================

  /**
   * Check if telescope mode is active.
   * @returns {boolean} Whether telescope mode is active
   */
  isTelescopeModeActive() {
    return this.app_.telescopeModeActive || false;
  }

  /**
   * Set telescope mode active state.
   * @param {boolean} active - Whether telescope mode should be active
   */
  setTelescopeModeActive(active) {
    if (this.app_) {
      this.app_.telescopeModeActive = active;
    }
  }
}

/**
 * Singleton app context instance.
 * @type {?AppContext}
 */
export let appContext = null;

/**
 * Initialize the app context singleton.
 * @param {!Object} app - The SkyMapApp instance
 * @returns {!AppContext} Initialized context
 */
export function initializeAppContext(app) {
  appContext = new AppContext(app);
  return appContext;
}

/**
 * Get the current app context.
 * Falls back to window.app if context not initialized.
 * @returns {?AppContext} App context or null
 */
export function getAppContext() {
  if (appContext) {
    return appContext;
  }
  // Fallback: create context from window.app if available
  if (typeof window !== 'undefined' && window.app) {
    return new AppContext(window.app);
  }
  return null;
}
