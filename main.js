/**
 * @fileoverview Application orchestration layer.
 *
 * This module serves as the central orchestration point for the SkyMap application.
 * It imports all modules, initializes dependencies, and wires EventBus connections.
 *
 * Module Architecture:
 * ====================
 *
 * CORE MODULES (modules/core/)
 * - EventBus: Global pub/sub for module communication
 * - Constants: Shared configuration (SPHERE, CAMERA, STARS, TIME, TELESCOPE)
 * - CoordinateUtils: RA/Dec to Cartesian conversions
 * - AstronomyCalculator: LST, altitude/azimuth calculations
 * - ErrorHandler: Centralized error handling
 * - SecurityUtils: HTML escaping, Wikipedia fetching
 *
 * DATA MODULES (modules/data/)
 * - CuratedImages: Static database of curated astronomical images
 * - ConstellationNames: Multi-language constellation name translations
 *
 * SERVICE MODULES (modules/services/)
 * - DataLoader: JSON/CSV data loading with caching
 * - ImageFetcher: Dynamic image fetching from NASA/Wikimedia/DSS
 * - LocationManager: Geolocation with fallback
 * - DynamicDataLoader: VizieR API for dynamic star loading
 *
 * RENDERING MODULES (modules/rendering/)
 * - StarFieldRenderer: Star visualization with magnitude filtering
 * - ConstellationRenderer: Constellation lines and labels
 * - PlanetRenderer: Solar system objects
 * - GridRenderer: RA/Dec coordinate grid
 * - HorizonRenderer: Local horizon and cardinal directions
 * - ImageRenderer: Deep sky object images
 *
 * FEATURE MODULES (modules/features/)
 * - SearchManager: Object search with fuzzy matching
 * - TimeController: Time simulation and playback
 * - TourController: Educational tours
 * - GameController: Object identification game
 * - TelescopeController: Telescope mode simulation
 * - SkyConditionsHandler: Constellation visibility helper
 * - SelectionManager: Object selection state
 *
 * Communication: All modules communicate via EventBus (pub/sub pattern)
 * for loose coupling and testability.
 */

// Core modules
import {globalEventBus, Events} from './modules/core/EventBus.js';
import {handleError, ErrorSeverity} from './modules/core/ErrorHandler.js';
import {CAMERA} from './modules/core/Constants.js';

// Service modules
import {dataLoader} from './modules/services/DataLoader.js';
import {imageFetcher} from './modules/services/ImageFetcher.js';
import {locationManager} from './modules/services/LocationManager.js';

// Rendering modules
import {StarFieldRenderer} from './modules/rendering/StarFieldRenderer.js';
import {ConstellationRenderer} from './modules/rendering/ConstellationRenderer.js';
import {PlanetRenderer} from './modules/rendering/PlanetRenderer.js';
import {GridRenderer} from './modules/rendering/GridRenderer.js';
import {HorizonRenderer} from './modules/rendering/HorizonRenderer.js';
import {ImageRenderer} from './modules/rendering/ImageRenderer.js';

// Feature modules
import {SearchManager} from './modules/features/SearchManager.js';
import {TimeController} from './modules/features/TimeController.js';
import {TourController} from './modules/features/TourController.js';
import {GameController} from './modules/features/GameController.js';
import {TelescopeController} from './modules/features/TelescopeController.js';
import {SkyConditionsHandler} from './modules/features/SkyConditionsHandler.js';
import {SelectionManager} from './modules/features/SelectionManager.js';

// UI modules
import {initializeUIController} from './modules/ui/UIController.js';
import {initializeBugReportHandler} from './modules/ui/BugReportHandler.js';
import {panelManager} from './modules/ui/PanelManager.js';

// Data modules
import {CURATED_IMAGES, getCuratedImage} from './modules/data/CuratedImages.js';
import {
  CONSTELLATION_NAMES,
  getConstellationName,
  getConstellationAbbrev,
  getConstellationNamesForLanguage,
} from './modules/data/ConstellationNames.js';

// Main application class (to be slimmed down)
import {SkyMapApp} from './skymap.js';

// Update loading indicator
{
  const lt = document.querySelector('.loading-text');
  if (lt) lt.textContent = 'Modules loaded, starting app...';
}

/**
 * Application instance.
 * @type {?SkyMapApp}
 */
let app = null;

/**
 * Module instances for advanced usage.
 * @type {!Object}
 */
const modules = {
  renderers: {},
  features: {},
  services: {},
};

/**
 * Setup EventBus subscriptions for inter-module communication.
 * This wires up the publish/subscribe connections between modules.
 * @private
 */
function setupEventBusWiring_() {
  // Location changes trigger celestial rotation update
  globalEventBus.on(Events.LOCATION_UPDATED, ({latitude, longitude}) => {
    if (app) {
      app.updateCelestialRotation();
    }
  });

  // Time changes trigger sky updates
  globalEventBus.on(Events.TIME_CHANGED, ({time}) => {
    if (app) {
      app.requestRender();
    }
  });
}

/**
 * UI Controller instance.
 * @type {?Object}
 */
let uiController = null;

/**
 * Telescope Controller instance.
 * @type {?TelescopeController}
 */
let telescopeController = null;

/**
 * Sky Conditions Handler instance.
 * @type {?SkyConditionsHandler}
 */
let skyConditionsHandler = null;

/**
 * Initialize the UI controller with dependencies from the app.
 * @param {!SkyMapApp} appInstance - The application instance
 * @private
 */
function initializeUI_(appInstance) {
  // Initialize panel manager (expose to window for skymap.js compatibility)
  panelManager.initialize();
  window.openPanel = (panelId) => panelManager.open(panelId);
  window.closeAllPanels = () => panelManager.closeAll();

  // Initialize sky conditions handler
  skyConditionsHandler = new SkyConditionsHandler();
  skyConditionsHandler.setupEventListeners();
  skyConditionsHandler.onChange(() => {
    appInstance.requestRender?.();
  });

  // Initialize telescope controller
  telescopeController = new TelescopeController({
    setFOV: (fov) => {
      appInstance.targetFov = fov;
      appInstance.requestRender?.();
    },
    getSkyLimitingMagnitude: () => skyConditionsHandler?.getNakedEyeLimit(),
    lockZoom: () => {
      appInstance.telescopeModeActive = true;
    },
    unlockZoom: () => {
      appInstance.telescopeModeActive = false;
    },
  });
  telescopeController.initialize();

  // Initialize bug report handler
  initializeBugReportHandler({
    closePanel: () => panelManager.closeAll(),
  });

  // Setup bug report button
  const bugReportBtn = document.getElementById('bug-report-btn');
  if (bugReportBtn) {
    bugReportBtn.addEventListener('click', () => {
      panelManager.open('bug-report-panel');
    });
  }

  // Setup bug report close button
  panelManager.setupCloseButton('bug-report-close-btn');

  // Initialize main UI controller with all dependencies from app
  uiController = initializeUIController({
    panelManager,

    // Search
    performSearch: (query) => appInstance.performSearch(query),
    selectObject: (obj) => appInstance.selectObject(obj),

    // Settings
    setConstellationLines: (visible) => {
      appInstance.showConstellationLines = visible;
      if (appInstance.constellationLinesGroup) {
        appInstance.constellationLinesGroup.visible = visible;
      }
      appInstance.requestRender?.();
    },
    setEquatorLineVisible: (visible) => appInstance.setEquatorLineVisible?.(visible),
    setGridVisible: (visible) => appInstance.setGridVisible?.(visible),
    setLanguage: (lang) => appInstance.setConstellationLanguage?.(lang),
    setMagnitudeLimit: (mag) => appInstance.setMagnitudeLimit?.(mag),
    showLocationDialog: () => appInstance.setObserverLocation?.(),
    requestGeolocation: () => appInstance.requestGeolocation?.(),
    resetCamera: () => appInstance.resetView?.(),
    showEventsCalendar: () => appInstance.showEventsCalendar?.(),
    setMaxDynamicStars: (val) => {
      // DSOs limit is ~1/6 of stars limit
      const maxDSOs = Math.max(1000, Math.floor(val / 6));
      appInstance.dynamicObjectManager_?.setLimits(val, maxDSOs);
    },

    // Time
    setTimeSpeed: (speed) => appInstance.setTimeSpeed?.(speed),
    togglePlayback: () => {
      globalEventBus.emit(Events.CMD_TOGGLE_PLAYBACK);
    },
    jumpToTime: (date) => appInstance.jumpToTime?.(date),
    getSimulationTime: () => appInstance.simulationTime || new Date(),

    // Game
    startGame: () => globalEventBus.emit(Events.CMD_SHOW_GAME_SELECT),
    passQuestion: () => globalEventBus.emit(Events.CMD_PASS_QUESTION),
    stopGame: () => globalEventBus.emit(Events.CMD_STOP_GAME),

    // Tour
    startTour: (name) => globalEventBus.emit(Events.CMD_START_TOUR, {tourName: name}),
    nextTourStep: () => globalEventBus.emit(Events.CMD_NEXT_TOUR_STEP),
    prevTourStep: () => globalEventBus.emit(Events.CMD_PREV_TOUR_STEP),
    stopTour: () => globalEventBus.emit(Events.CMD_STOP_TOUR),

    // Compass
    toggleCompassMode: () => appInstance.toggleCompassMode?.(),

    // Telescope - wired to TelescopeController instance
    getTelescope: () => telescopeController?.getTelescope() || null,
    setTelescope: (settings) => telescopeController?.setTelescope(settings),
    getEyepiece: () => telescopeController?.getEyepiece() || null,
    setEyepiece: (settings) => telescopeController?.setEyepiece(settings),
    toggleTelescopeMode: () => telescopeController?.toggleTelescopeMode(),
    isTelescopeModeActive: () => telescopeController?.isActive() || false,
    saveTelescopePreset: (name) => telescopeController?.savePreset(name),
    loadTelescopePreset: (name) => telescopeController?.loadPreset(name) || false,
    deleteTelescopePreset: (name) => telescopeController?.deletePreset(name) || false,
    getTelescopePresetNames: () => telescopeController?.getPresetNames() || [],
    getTelescopeComputedProperties: () => telescopeController?.getComputedProperties() || null,

    // Info
    getFOV: () => appInstance.targetFov || CAMERA.DEFAULT_FOV,
    getViewDirection: () => ({ra: 0, dec: 0}),
  });
}

/**
 * Register service worker for PWA.
 * @private
 */
function registerServiceWorker_() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => console.log('SW registered:', reg.scope))
      .catch((err) => {
        console.warn('Service worker registration failed:', err);
        globalEventBus.emit(Events.SERVICE_WORKER_ERROR, {
          error: err.message,
          timestamp: Date.now(),
        });
      });
  }
}

/**
 * Initialize the application.
 */
async function initializeApp() {
  const loadingText = document.querySelector('.loading-text');

  try {
    // Check if THREE.js loaded
    if (typeof THREE === 'undefined') {
      throw new Error('THREE.js library failed to load');
    }

    if (loadingText) loadingText.textContent = 'Initializing...';

    // Setup inter-module communication first
    setupEventBusWiring_();

    // Create main application instance
    app = new SkyMapApp();

    // Expose to window for debugging and legacy compatibility
    window.app = app;

    // Initialize UI controller with app dependencies
    initializeUI_(app);

    // Register service worker for PWA
    registerServiceWorker_();

  } catch (error) {
    console.error('Initialization failed:', error);
    handleError(error, 'Application initialization failed', ErrorSeverity.CRITICAL);

    // Show error on loading screen
    const loadingEl = document.getElementById('loading');
    if (loadingEl) {
      loadingEl.innerHTML = `
        <div style="color: #ff6b6b; text-align: center; padding: 20px;">
          <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
          <div style="font-size: 18px; margin-bottom: 8px;">Failed to start</div>
          <div style="font-size: 14px; color: #999; max-width: 300px;">
            ${error.message || 'Unknown error'}
          </div>
          <button onclick="location.reload()" style="margin-top: 20px; padding: 10px 20px; background: #3B82F6; color: white; border: none; border-radius: 8px; cursor: pointer;">
            Retry
          </button>
        </div>
      `;
    }
  }
}

// Start the application when DOM is loaded
window.addEventListener('DOMContentLoaded', initializeApp);

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  if (uiController) {
    uiController.dispose?.();
    uiController = null;
  }
});

// Export for testing and external access
export {
  // Application
  app,
  modules,
  uiController,

  // Core
  globalEventBus,
  Events,

  // Services
  dataLoader,
  imageFetcher,
  locationManager,

  // Data
  CURATED_IMAGES,
  getCuratedImage,
  CONSTELLATION_NAMES,
  getConstellationName,
  getConstellationAbbrev,
  getConstellationNamesForLanguage,

  // Renderers (classes for custom usage)
  StarFieldRenderer,
  ConstellationRenderer,
  PlanetRenderer,
  GridRenderer,
  HorizonRenderer,
  ImageRenderer,

  // Features (classes for custom usage)
  SearchManager,
  TimeController,
  TourController,
  GameController,
  TelescopeController,
  SkyConditionsHandler,
  SelectionManager,
};
