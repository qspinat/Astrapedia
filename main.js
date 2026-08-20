/**
 * @fileoverview Application bootstrap.
 *
 * Constructs the AstrapediaApp, wires the UI layer to it, and registers the
 * service worker. The scene, renderers and feature modules are owned by
 * skymap.js; this file only supplies the dependency callbacks that connect
 * them to the UI, plus the handful of modules the UI needs directly
 * (TelescopeController, SkyConditionsHandler, PanelManager).
 *
 * Loaded as <script type="module"> from app.html. Nothing imports it.
 */

// Core modules
import {globalEventBus, Events} from './modules/core/EventBus.js';
import {CAMERA} from './modules/core/Constants.js';

// Feature modules
import {TelescopeController} from './modules/features/TelescopeController.js';
import {SkyConditionsHandler} from './modules/features/SkyConditionsHandler.js';

// UI modules
import {initializeUIController} from './modules/ui/UIController.js';
import {initializeBugReportHandler} from './modules/ui/BugReportHandler.js';
import {panelManager} from './modules/ui/PanelManager.js';

// Main application class (to be slimmed down)
import {AstrapediaApp} from './skymap.js';
import {createLogger} from './modules/core/Logger.js';

const logger = createLogger('Main');

// Update loading indicator
{
  const lt = document.querySelector('.loading-text');
  if (lt) lt.textContent = 'Modules loaded, starting app...';
}

/**
 * Application instance.
 * @type {?AstrapediaApp}
 */
let app = null;

/**
 * Setup EventBus subscriptions for inter-module communication.
 * This wires up the publish/subscribe connections between modules.
 * @private
 */
function setupEventBusWiring_() {
  globalEventBus.on(Events.TIME_CHANGED, () => {
    app?.requestRender();
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
 * @param {!AstrapediaApp} appInstance - The application instance
 * @private
 */
function initializeUI_(appInstance) {
  panelManager.initialize();

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
    getCurrentFOV: () => appInstance.targetFov || appInstance.camera?.fov,
    getCurrentMagnitude: () => appInstance.currentMagnitude,
    setMagnitudeLimit: (mag) => appInstance.setMagnitudeLimit?.(mag),
    getSkyLimitingMagnitude: () => skyConditionsHandler?.getNakedEyeLimit(),
    lockZoom: () => {
      appInstance.telescopeModeActive = true;
    },
    unlockZoom: () => {
      appInstance.telescopeModeActive = false;
    },
    getViewCenterRaDec: () => appInstance.getViewCenterRaDec(),
    getDSOs: () => appInstance.deepSkyObjects || [],
  });
  telescopeController.initialize();

  // Let resetView() leave telescope mode instead of stranding the user with a
  // reset FOV, a locked zoom and the reticle still showing.
  appInstance.exitTelescopeMode = () =>
    telescopeController.deactivateTelescopeMode();

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
    getDailyHighlight: () => appInstance.getDailyHighlight?.(),

    // Settings
    setConstellationLines: (visible) => {
      appInstance.setConstellationLinesMode(visible ? 'all' : 'off');
    },
    setConstellationLinesMode: (mode) => {
      appInstance.setConstellationLinesMode(mode);
    },
    setEquatorLineVisible: (visible) => appInstance.setEquatorLineVisible?.(visible),
    setGridVisible: (visible) => appInstance.setGridVisible?.(visible),
    setLanguage: (lang) => appInstance.setConstellationLanguage?.(lang),
    setMagnitudeLimit: (mag) => appInstance.setMagnitudeLimit?.(mag),
    showLocationDialog: () => appInstance.setObserverLocation?.(),
    requestGeolocation: () => appInstance.requestGeolocation?.(),
    resetCamera: () => appInstance.resetView?.(),
    showEventsCalendar: () => appInstance.showEventsCalendar?.(),
    getNextEvent: () => appInstance.getNextEvent?.(),
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
    getSimulationTime: () => appInstance.getSimulationTime?.() ?? new Date(),

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
    computeVisibilityForDiameters: (obj, diameters) =>
      telescopeController?.computeVisibilityForDiameters(obj, diameters) || [],
    computeDiffuseVisibility: (obj) =>
      telescopeController?.computeDiffuseVisibility(obj) || null,

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
      .then((reg) => logger.info('SW registered:', reg.scope))
      .catch((err) => {
        logger.warn('Service worker registration failed:', err);
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
    app = new AstrapediaApp();

    // Initialize UI controller with app dependencies
    initializeUI_(app);

    // Register service worker for PWA
    registerServiceWorker_();

  } catch (error) {
    logger.error('Application initialization failed:', error);

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
