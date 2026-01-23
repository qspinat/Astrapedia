/**
 * @fileoverview Main entry point for Sky Map Application.
 * Handles dependency wiring and module initialization.
 */

// Core modules
import {globalEventBus, Events} from './modules/core/EventBus.js';
import {SPHERE, CAMERA, STARS, TIME} from './modules/core/Constants.js';
import {SceneManager} from './modules/core/SceneManager.js';
import {
  AstronomyCalculator,
  initializeAstronomyCalculator,
} from './modules/core/AstronomyCalculator.js';
import {
  raDecToCartesian,
  cartesianToRaDec,
  angularDistance,
  calculateLST,
} from './modules/core/CoordinateUtils.js';

// Services
import {dataLoader} from './modules/services/DataLoader.js';
import {imageFetcher} from './modules/services/ImageFetcher.js';
import {dynamicDataLoader} from './modules/services/DynamicDataLoader.js';
import {locationManager} from './modules/services/LocationManager.js';

// Features
import {
  GameController,
  initializeGameController,
} from './modules/features/GameController.js';
import {searchManager} from './modules/features/SearchManager.js';
import {
  TourController,
  initializeTourController,
} from './modules/features/TourController.js';
import {
  TimeController,
  initializeTimeController,
} from './modules/features/TimeController.js';
import {
  TelescopeController,
  initializeTelescopeController,
} from './modules/features/TelescopeController.js';
// UI
import {panelManager} from './modules/ui/PanelManager.js';
import {DOMCache} from './modules/ui/DOMCache.js';
import {
  UIController,
  initializeUIController,
} from './modules/ui/UIController.js';

// Data
import {getCuratedImage} from './modules/data/CuratedImages.js';

/**
 * Application state and initialized modules.
 * @type {!Object}
 */
const app = {
  /** @type {?SceneManager} */
  sceneManager: null,
  /** @type {?AstronomyCalculator} */
  astronomyCalculator: null,
  /** @type {?GameController} */
  gameController: null,
  /** @type {?TourController} */
  tourController: null,
  /** @type {?TimeController} */
  timeController: null,
  /** @type {?TelescopeController} */
  telescopeController: null,
  /** @type {?UIController} */
  uiController: null,
  /** @type {?DOMCache} */
  domCache: null,

  // Data
  /** @type {!Array<!Object>} */
  stars: [],
  /** @type {!Array<!Object>} */
  deepSkyObjects: [],
  /** @type {!Object} */
  constellations: {},
  /** @type {!Object<string, number>} */
  namedObjects: {},
  /** @type {!Array<!Object>} */
  planets: [],

  // State
  /** @type {boolean} */
  initialized: false,
  /** @type {?Object} */
  selectedObject: null,
  /** @type {number} */
  currentMagnitude: STARS.DEFAULT_MAGNITUDE,

  // Three.js objects
  /** @type {?THREE.Group} */
  celestialSphere: null,
  /** @type {!Array<!THREE.Line>} */
  constellationLines: [],
};

/**
 * Initialize all application modules.
 * @returns {!Promise<void>}
 */
async function initializeApp() {
  console.log('Initializing Sky Map Application...');

  // Always use night mode
  document.body.classList.add('night-mode');

  // Get canvas container
  const container = document.getElementById('canvas-container');
  if (!container) {
    throw new Error('Canvas container not found');
  }

  // Initialize DOM cache
  app.domCache = new DOMCache();

  // Initialize scene manager
  app.sceneManager = new SceneManager(container);
  app.sceneManager.initialize();
  app.celestialSphere = app.sceneManager.getCelestialSphere();

  // Initialize astronomy calculator
  app.astronomyCalculator = initializeAstronomyCalculator();

  // Load data
  await loadApplicationData();

  // Initialize feature modules with dependencies
  initializeFeatureModules();

  // Initialize UI
  initializeUIModules();

  // Setup event listeners
  setupEventListeners();

  // Set initial location
  setupLocation();

  // Start animation loop
  startAnimationLoop();

  app.initialized = true;
  console.log('Sky Map Application initialized');

  globalEventBus.emit(Events.APP_INITIALIZED, {});
}

/**
 * Load all application data.
 * @returns {!Promise<void>}
 */
async function loadApplicationData() {
  console.log('Loading application data...');

  try {
    const data = await dataLoader.loadSkyMapData();

    app.stars = data.stars || [];
    app.deepSkyObjects = data.deepSkyObjects || [];
    app.constellations = data.constellations || {};
    app.namedObjects = data.namedObjects || {};

    // Build search index
    searchManager.buildIndex({
      stars: app.stars,
      deepSkyObjects: app.deepSkyObjects,
      constellations: app.constellations,
      namedObjects: app.namedObjects,
      planets: app.planets,
    });

    console.log(`Loaded: ${app.stars.length} stars, ` +
      `${app.deepSkyObjects.length} DSOs, ` +
      `${Object.keys(app.constellations).length} constellations`);

    globalEventBus.emit(Events.DATA_LOADED, {
      stars: app.stars.length,
      dsos: app.deepSkyObjects.length,
      constellations: Object.keys(app.constellations).length,
    });
  } catch (error) {
    console.error('Failed to load application data:', error);
    globalEventBus.emit(Events.DATA_ERROR, {error});
    throw error;
  }
}

/**
 * Initialize feature modules with dependencies.
 */
function initializeFeatureModules() {
  // Initialize time controller
  app.timeController = initializeTimeController({
    updatePlanets: () => createPlanets(),
    rotateCelestialSphere: (angle) => {
      if (app.celestialSphere) {
        app.celestialSphere.rotation.y += angle;
      }
    },
    setCelestialRotation: (rotation) => {
      if (app.celestialSphere) {
        app.celestialSphere.rotation.y = rotation;
      }
    },
    calculateLST: (date, lon) => calculateLST(date, lon),
    getLongitude: () => locationManager.getLongitude(),
  });

  // Initialize game controller
  app.gameController = initializeGameController({
    getStars: () => app.stars,
    getDeepSkyObjects: () => app.deepSkyObjects,
    getConstellations: () => app.constellations,
    getNamedObjects: () => app.namedObjects,
    getPlanets: () => app.planets,
    getConstellationName: (abbrev) => abbrev, // TODO: implement translation
    navigateToRaDec: (ra, dec) => animateCameraTo(ra, dec),
    checkObjectAtPosition: (ra, dec, tolerance) => checkObjectAtPosition(ra, dec, tolerance),
  });

  // Initialize tour controller
  app.tourController = initializeTourController({
    navigateToRaDec: (ra, dec) => animateCameraTo(ra, dec),
    highlightConstellation: (name) => highlightConstellation(name),
    unhighlightConstellation: () => unhighlightConstellation(),
    showObjectInfo: (obj) => showObjectInfo(obj),
    showConstellationInfo: (abbrev) => showConstellationInfo(abbrev),
    getLST: () => {
      const time = app.timeController?.getTime() || new Date();
      return calculateLST(time, locationManager.getLongitude());
    },
    getLocation: () => locationManager.getLocation(),
    getPlanets: () => app.planets,
    getDeepSkyObjects: () => app.deepSkyObjects,
    getStars: () => app.stars,
    getFOV: () => app.sceneManager?.getFOV() || 60,
    setFOV: (fov) => app.sceneManager?.setFOV(fov),
    getConstellationName: (abbrev) => abbrev,
  });

  // Set scene callbacks for tour controller
  app.tourController.setSceneCallbacks(
    (sprite) => app.celestialSphere?.add(sprite),
    (sprite) => app.celestialSphere?.remove(sprite)
  );

  // Initialize telescope controller
  // TODO: Add SkyConditionsController module and wire getSkyLimitingMagnitude
  // Currently, sky conditions integration is handled in ui-controller.js
  app.telescopeController = initializeTelescopeController({
    setFOV: (fov) => app.sceneManager?.setFOV(fov),
    setMagnitudeLimit: (mag) => setMagnitudeLimit(mag),
    getCurrentFOV: () => app.sceneManager?.getFOV() || 60,
    getCurrentMagnitude: () => app.currentMagnitude,
    // getSkyLimitingMagnitude: () => app.skyConditionsController?.getNakedEyeLimit(),
  });
}

/**
 * Initialize UI modules.
 */
function initializeUIModules() {
  // Initialize panel manager
  panelManager.initialize();

  // Initialize UI controller with all dependencies
  app.uiController = initializeUIController({
    panelManager,
    performSearch: (query) => searchManager.search(query),
    selectObject: (obj) => selectObject(obj),
    setEquatorLineVisible: (visible) => setEquatorLineVisible(visible),
    setConstellationLines: (visible) => setConstellationLinesVisible(visible),
    setLanguage: (lang) => setConstellationLanguage(lang),
    setMagnitudeLimit: (mag) => setMagnitudeLimit(mag),
    showLocationDialog: () => showLocationDialog(),
    requestGeolocation: () => locationManager.requestGeolocation(),
    resetCamera: () => app.sceneManager?.resetCamera(),
    showEventsCalendar: () => showEventsCalendar(),
    setMaxDynamicStars: (max) => setMaxDynamicStars(max),
    setTimeSpeed: (speed) => app.timeController?.setSpeed(speed),
    togglePlayback: () => app.timeController?.togglePlayback(),
    jumpToTime: (date) => app.timeController?.jumpToTime(date),
    startGame: () => app.gameController?.start(),
    passQuestion: () => app.gameController?.passQuestion(),
    stopGame: () => app.gameController?.stop(),
    startTour: (name) => app.tourController?.start(name),
    toggleCompassMode: () => toggleCompassMode(),
    getFOV: () => app.sceneManager?.getFOV(),
    getViewDirection: () => app.sceneManager?.getViewDirectionCelestial(),
    // Telescope dependencies
    getTelescope: () => app.telescopeController?.getTelescope(),
    setTelescope: (config) => app.telescopeController?.setTelescope(config),
    getEyepiece: () => app.telescopeController?.getEyepiece(),
    setEyepiece: (config) => app.telescopeController?.setEyepiece(config),
    toggleTelescopeMode: () => app.telescopeController?.toggleTelescopeMode(),
    isTelescopeModeActive: () => app.telescopeController?.isActive(),
    saveTelescopePreset: (name) => app.telescopeController?.savePreset(name),
    loadTelescopePreset: (name) => app.telescopeController?.loadPreset(name),
    deleteTelescopePreset: (name) => app.telescopeController?.deletePreset(name),
    getTelescopePresetNames: () => app.telescopeController?.getPresetNames() || [],
    getTelescopeComputedProperties: () => app.telescopeController?.getComputedProperties(),
  });

  // Expose for legacy compatibility
  window.openPanel = (id) => panelManager.open(id);
  window.closeAllPanels = () => panelManager.closeAll();
}

/**
 * Setup global event listeners.
 */
function setupEventListeners() {
  // Location changes
  globalEventBus.on(Events.LOCATION_CHANGED, (data) => {
    app.sceneManager?.setLatitudeTilt(data.location.lat);
    app.timeController?.update(0); // Force update
    createPlanets();
  });

  // Search result selected
  globalEventBus.on(Events.SEARCH_RESULT_SELECTED, (data) => {
    selectObject(data.result);
  });

  // Game events
  globalEventBus.on(Events.GAME_CORRECT, () => {
    // Play success feedback
  });

  globalEventBus.on(Events.GAME_INCORRECT, () => {
    // Play failure feedback
  });
}

/**
 * Setup initial location.
 */
function setupLocation() {
  const location = locationManager.getLocation();
  app.sceneManager?.setLatitudeTilt(location.lat);

  // Try to get geolocation
  if (locationManager.isGeolocationAvailable()) {
    locationManager.requestGeolocation().catch(() => {
      console.log('Using default location');
    });
  }
}

/**
 * Start the animation loop.
 */
function startAnimationLoop() {
  let lastTime = performance.now();

  const animate = () => {
    requestAnimationFrame(animate);

    const now = performance.now();
    const deltaMs = now - lastTime;
    lastTime = now;

    // Update time simulation
    app.timeController?.update(deltaMs);

    // Update scene animations
    const animating = app.sceneManager?.updateAnimations();

    // Update tour highlight
    if (app.tourController?.isActive()) {
      const fov = app.sceneManager?.getFOV() || 60;
      const height = app.sceneManager?.getCanvasSize()?.height || 800;
      app.tourController.updateHighlight(fov, height);
    }

    // Render if needed
    if (animating || app.sceneManager?.needsRender()) {
      app.sceneManager?.render();
    }
  };

  animate();
}

// ============================================================================
// Placeholder functions to be implemented in SkyMapApp
// These provide the interface expected by the modules
// ============================================================================

/**
 * Animate camera to RA/Dec position.
 * @param {number} ra - Right ascension in degrees
 * @param {number} dec - Declination in degrees
 */
function animateCameraTo(ra, dec) {
  // Convert RA/Dec to camera theta/phi
  let theta = -ra * Math.PI / 180 + Math.PI;

  // Account for celestial sphere rotation (time offset)
  // Objects are children of celestialSphere, so camera needs to adjust for its rotation
  if (app.celestialSphere) {
    theta -= app.celestialSphere.rotation.y;
  }

  const phi = (90 - dec) * Math.PI / 180;
  app.sceneManager?.setCameraRotation(theta, phi, true);
}

/**
 * Create/update planet positions.
 */
function createPlanets() {
  const time = app.timeController?.getTime() || new Date();

  app.planets = app.astronomyCalculator?.calculateAllPlanetPositions(
    time,
    locationManager.getLatitude(),
    locationManager.getLongitude()
  ) || [];

  // Update search index with planets
  searchManager.updatePlanets(app.planets);

  globalEventBus.emit(Events.PLANETS_UPDATED, {planets: app.planets});
}

/**
 * Select an object.
 * @param {?Object} obj - Object to select or null to deselect
 */
function selectObject(obj) {
  app.selectedObject = obj;

  if (obj) {
    animateCameraTo(obj.ra, obj.dec);
    showObjectInfo(obj);
    panelManager.open('info-panel');
  } else {
    panelManager.closeAll();
  }

  globalEventBus.emit(Events.OBJECT_SELECTED, {object: obj});
}

/**
 * Show object info panel.
 * @param {!Object} obj - Object to display
 */
function showObjectInfo(obj) {
  const infoPanel = document.getElementById('info-panel');
  if (!infoPanel) return;

  // Update panel content
  const nameEl = infoPanel.querySelector('.object-name');
  if (nameEl) nameEl.textContent = obj.name || 'Unknown';

  const typeEl = infoPanel.querySelector('.object-type');
  if (typeEl) typeEl.textContent = obj.type || '';

  const magEl = infoPanel.querySelector('.object-magnitude');
  if (magEl) {
    magEl.textContent = obj.mag !== undefined ? `Magnitude: ${obj.mag.toFixed(1)}` : '';
  }
}

/**
 * Show constellation info.
 * @param {string} abbrev - Constellation abbreviation
 */
function showConstellationInfo(abbrev) {
  const constellation = app.constellations[abbrev];
  if (!constellation) return;

  showObjectInfo({
    name: constellation.name || abbrev,
    type: 'Constellation',
    ra: constellation.ra || 0,
    dec: constellation.dec || 0,
  });
}

/**
 * Highlight a constellation.
 * @param {string} name - Constellation name
 */
function highlightConstellation(name) {
  // TODO: Implement constellation highlighting
}

/**
 * Remove constellation highlighting.
 */
function unhighlightConstellation() {
  // TODO: Implement
}

/**
 * Check if object exists at position.
 * @param {number} ra - Right ascension
 * @param {number} dec - Declination
 * @param {number} tolerance - Tolerance in degrees
 * @returns {?Object} Found object or null
 */
function checkObjectAtPosition(ra, dec, tolerance) {
  // Check in search index
  const nearby = searchManager.findNear(ra, dec, tolerance);
  return nearby.length > 0 ? nearby[0] : null;
}

/**
 * Set equator line visibility.
 * @param {boolean} visible - Whether the equator line should be visible
 */
function setEquatorLineVisible(visible) {
  // This is handled by skymap.js app.setEquatorLineVisible
  if (window.app?.setEquatorLineVisible) {
    window.app.setEquatorLineVisible(visible);
  }
}

/**
 * Set constellation lines visibility.
 * @param {boolean} visible - Whether lines should be visible
 */
function setConstellationLinesVisible(visible) {
  app.constellationLines.forEach((line) => {
    line.visible = visible;
  });
  app.sceneManager?.requestRender();
}

/**
 * Set constellation language.
 * @param {string} lang - Language code
 */
function setConstellationLanguage(lang) {
  // TODO: Implement language switching
}

/**
 * Set magnitude limit.
 * @param {number} mag - Maximum magnitude to display
 */
function setMagnitudeLimit(mag) {
  app.currentMagnitude = mag;

  // Update UI slider
  const slider = document.getElementById('magnitude-slider');
  const display = document.getElementById('mag-value');
  if (slider) slider.value = mag;
  if (display) display.textContent = mag.toFixed(1);

  globalEventBus.emit(Events.MAGNITUDE_CHANGED, {magnitude: mag});
}

/**
 * Show location dialog.
 */
function showLocationDialog() {
  // TODO: Implement location dialog
}

/**
 * Show events calendar.
 */
function showEventsCalendar() {
  panelManager.open('events-panel');
}

/**
 * Set max dynamic stars.
 * @param {number} max - Maximum number of dynamic stars
 */
function setMaxDynamicStars(max) {
  dynamicDataLoader.setMaxStars(max);
}

/**
 * Toggle compass mode.
 */
function toggleCompassMode() {
  // TODO: Implement compass mode
}

// ============================================================================
// Initialization
// ============================================================================

// Wait for DOM and Three.js to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initializeApp().catch(console.error);
  });
} else {
  initializeApp().catch(console.error);
}

// Expose app for debugging
window.skyMapApp = app;

// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then((reg) => console.log('Service worker registered'))
    .catch((err) => console.warn('Service worker registration failed:', err));
}

export {app, initializeApp};
