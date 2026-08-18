/**
 * @fileoverview UI Controller for Astrapedia.
 * Uses dependency injection and EventBus for decoupled communication.
 *
 * Feature-specific UI handlers have been extracted to their respective modules:
 * - GameUI → modules/features/GameUI.js
 * - TourUI → modules/features/TourUI.js
 * - TimeUI → modules/features/TimeUI.js
 * - TelescopeUI → modules/features/TelescopeUI.js
 */

import {globalEventBus, Events} from '../core/EventBus.js';
import {STARS} from '../core/Constants.js';
import {createLogger} from '../core/Logger.js';
import {PanelManager, panelManager} from './PanelManager.js';
import {escapeHtml} from '../core/SecurityUtils.js';
import {addMobileButtonListener} from '../core/Utils.js';
import {GameUI} from '../features/GameUI.js';
import {TourUI} from '../features/TourUI.js';
import {TimeUI} from '../features/TimeUI.js';
import {TelescopeUI} from '../features/TelescopeUI.js';
import {domCache} from './DOMCache.js';

const logger = createLogger('UIController');

/**
 * Search Controller - handles search input and results.
 */
export class SearchController {
  /**
   * Creates a new SearchController instance.
   * @param {!Object} dependencies - Required dependencies
   * @param {function(string): !Array} dependencies.performSearch - Search function
   * @param {function(!Object): void} dependencies.selectObject - Select object function
   */
  constructor(dependencies) {
    /** @private @const */
    this.performSearch_ = dependencies.performSearch;

    /** @private @const */
    this.selectObject_ = dependencies.selectObject;

    /** @private {?Element} */
    this.searchInput_ = domCache.get('search-input');

    /** @private {?Element} */
    this.searchResults_ = domCache.get('search-results');

    /** @private {!Array<!Object>} */
    this.currentResults_ = [];

    /** @private {number} */
    this.selectedIndex_ = -1;
  }

  /**
   * Initialize the search controller.
   */
  initialize() {
    this.setupEventListeners_();
  }

  /**
   * Updates the visual selection state of results.
   * @private
   */
  updateResultsDisplay_() {
    if (!this.searchResults_) return;

    const items = this.searchResults_.querySelectorAll('.search-result-item');
    items.forEach((item, index) => {
      item.classList.toggle('selected', index === this.selectedIndex_);
    });
  }

  /**
   * Selects a result by index.
   * @param {number} index - The index of the result to select
   * @private
   */
  selectResult_(index) {
    if (this.currentResults_.length > 0 &&
        index >= 0 &&
        index < this.currentResults_.length) {
      const selectedResult = this.currentResults_[index];
      this.selectObject_?.(selectedResult);
      this.searchResults_.classList.remove('active');
      this.searchInput_.value = '';
      this.currentResults_ = [];
      this.selectedIndex_ = -1;

      globalEventBus.emit(Events.SEARCH_RESULT_SELECTED, {
        result: selectedResult,
      });
    }
  }

  /**
   * Sets up event listeners for search functionality.
   * @private
   */
  setupEventListeners_() {
    if (!this.searchInput_ || !this.searchResults_) return;

    this.searchInput_.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      this.selectedIndex_ = 0;

      if (query.length < 2) {
        this.searchResults_.classList.remove('active');
        this.searchResults_.innerHTML = '';
        this.currentResults_ = [];
        return;
      }

      this.currentResults_ = this.performSearch_?.(query) || [];

      if (this.currentResults_.length === 0) {
        this.searchResults_.innerHTML =
          '<div class="search-result-item no-results">No results found</div>';
        this.searchResults_.classList.add('active');
        return;
      }

      let html = '';
      this.currentResults_.forEach((result, index) => {
        const magInfo = result.mag !== null && result.mag !== undefined
          ? `<span class="mag">mag ${result.mag.toFixed(1)}</span>`
          : '';
        const selectedClass = index === 0 ? 'selected' : '';
        html += `
          <div class="search-result-item ${selectedClass}" data-index="${index}">
            <span class="name">${escapeHtml(result.name)}</span>
            <span class="type">${escapeHtml(result.type)}</span>
            ${magInfo}
          </div>
        `;
      });

      this.searchResults_.innerHTML = html;
      this.searchResults_.classList.add('active');

      // Add click handlers to results
      this.searchResults_.querySelectorAll('.search-result-item').forEach((item) => {
        item.addEventListener('click', () => {
          const index = parseInt(item.dataset.index, 10);
          if (!isNaN(index)) this.selectResult_(index);
        });
      });
    });

    this.searchInput_.addEventListener('keydown', (e) => {
      if (!this.searchResults_.classList.contains('active') ||
          this.currentResults_.length === 0) {
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.selectedIndex_ = Math.min(
          this.selectedIndex_ + 1,
          this.currentResults_.length - 1
        );
        this.updateResultsDisplay_();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.selectedIndex_ = Math.max(this.selectedIndex_ - 1, 0);
        this.updateResultsDisplay_();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.selectResult_(this.selectedIndex_ >= 0 ? this.selectedIndex_ : 0);
      } else if (e.key === 'Escape') {
        this.searchResults_.classList.remove('active');
        this.currentResults_ = [];
        this.selectedIndex_ = -1;
      }
    });

    // Close search results when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.searchInput_.contains(e.target) &&
          !this.searchResults_.contains(e.target)) {
        this.searchResults_.classList.remove('active');
      }
    });
  }

  /**
   * Clear search results.
   */
  clear() {
    if (this.searchInput_) this.searchInput_.value = '';
    if (this.searchResults_) {
      this.searchResults_.classList.remove('active');
      this.searchResults_.innerHTML = '';
    }
    this.currentResults_ = [];
    this.selectedIndex_ = -1;
  }

  /**
   * Focus the search input.
   */
  focus() {
    this.searchInput_?.focus();
  }
}

/**
 * Settings Handler - handles settings toggles and sliders.
 */
export class SettingsHandler {
  /**
   * Creates a new SettingsHandler instance.
   * @param {!Object} dependencies - Required dependencies
   * @param {function(boolean): void=} dependencies.setConstellationLines - Set lines
   * @param {function(string): void=} dependencies.setConstellationLinesMode - Set mode
   * @param {function(boolean): void=} dependencies.setEquatorLineVisible - Set equator
   * @param {function(boolean): void=} dependencies.setGridVisible - Set grid visibility
   * @param {function(string): void=} dependencies.setLanguage - Set language
   * @param {function(number): void=} dependencies.setMagnitudeLimit - Set magnitude
   * @param {function(): void=} dependencies.showLocationDialog - Show location dialog
   * @param {function(): void=} dependencies.requestGeolocation - Request geolocation
   * @param {function(): void=} dependencies.resetCamera - Reset camera
   * @param {function(): void=} dependencies.showEventsCalendar - Show events
   * @param {function(number): void=} dependencies.setMaxDynamicStars - Set max stars
   */
  constructor(dependencies) {
    /** @private @const */
    this.deps_ = dependencies;

    /** @private {number} */
    this.savedMagnitude_ = STARS.DEFAULT_MAGNITUDE;

    /** @private {boolean} */
    this.telescopeModeActive_ = false;

    /** @private {!Array<{unsubscribe: function(): void}>} */
    this.subscriptions_ = [];
  }

  /**
   * Initialize the settings handler.
   */
  initialize() {
    this.setupEventListeners_();
    this.setupTelescopeModeListeners_();
  }

  /**
   * Set up telescope mode listeners to disable/enable magnitude slider.
   * @private
   */
  setupTelescopeModeListeners_() {
    this.subscriptions_.push(
      globalEventBus.on(Events.TELESCOPE_MODE_ACTIVATED, () => {
        this.telescopeModeActive_ = true;
        const magSlider = domCache.get('magnitude-slider');
        if (magSlider) {
          this.savedMagnitude_ = parseFloat(magSlider.value);
          magSlider.disabled = true;
        }
      }),
      globalEventBus.on(Events.TELESCOPE_MODE_DEACTIVATED, () => {
        this.telescopeModeActive_ = false;
        const magSlider = domCache.get('magnitude-slider');
        if (magSlider) {
          magSlider.disabled = false;
          magSlider.value = this.savedMagnitude_;
          this.deps_.setMagnitudeLimit?.(this.savedMagnitude_);
        }
      })
    );
  }

  /**
   * Release EventBus subscriptions.
   */
  dispose() {
    this.subscriptions_.forEach((sub) => sub?.unsubscribe?.());
    this.subscriptions_ = [];
  }

  /**
   * Sets up event listeners for settings controls.
   * @private
   */
  setupEventListeners_() {
    // Equator line toggle
    const equatorToggle = domCache.get('equator-line-toggle');
    if (equatorToggle) {
      equatorToggle.addEventListener('change', (e) => {
        this.deps_.setEquatorLineVisible?.(e.target.checked);
      });
    }

    // Coordinate grid toggle
    const gridToggle = domCache.get('grid-toggle');
    if (gridToggle) {
      gridToggle.addEventListener('change', (e) => {
        this.deps_.setGridVisible?.(e.target.checked);
      });
    }

    // Language selector
    const languageSelect = domCache.get('constellation-language');
    if (languageSelect) {
      languageSelect.addEventListener('change', (e) => {
        this.deps_.setLanguage?.(e.target.value);

        globalEventBus.emit(Events.SETTING_CHANGED, {
          setting: 'constellationLanguage',
          value: e.target.value,
        });
      });
    }

    // Magnitude slider
    const magSlider = domCache.get('magnitude-slider');
    const magValue = domCache.get('mag-value');
    if (magSlider && magValue) {
      // Initialize from constant
      magSlider.value = STARS.DEFAULT_MAGNITUDE;
      magValue.textContent = STARS.DEFAULT_MAGNITUDE.toFixed(1);

      magSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        magValue.textContent = val.toFixed(1);
        this.deps_.setMagnitudeLimit?.(val);

        globalEventBus.emit(Events.SETTING_CHANGED, {
          setting: 'magnitudeLimit',
          value: val,
        });
      });
    }

    // Set location button
    const setLocationBtn = domCache.get('set-location-btn');
    if (setLocationBtn) {
      addMobileButtonListener(setLocationBtn, () => {
        this.deps_.showLocationDialog?.();
      });
    }

    // Auto location button
    const autoLocationBtn = domCache.get('auto-location-btn');
    if (autoLocationBtn) {
      addMobileButtonListener(autoLocationBtn, () => {
        this.deps_.requestGeolocation?.();
      });
    }

    // Reset view button
    const resetViewBtn = domCache.get('reset-view-btn');
    if (resetViewBtn) {
      addMobileButtonListener(resetViewBtn, () => {
        this.deps_.resetCamera?.();
      });
    }

    // Upcoming events button
    const eventsBtn = domCache.get('events-btn');
    if (eventsBtn) {
      addMobileButtonListener(eventsBtn, () => {
        this.deps_.showEventsCalendar?.();
      });
    }

    // Max dynamic stars slider
    const maxDynamicSlider = domCache.get('max-dynamic-stars');
    const maxDynamicValue = domCache.get('max-dynamic-stars-value');
    if (maxDynamicSlider && maxDynamicValue) {
      maxDynamicSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        maxDynamicValue.textContent =
          val >= 1000 ? `${Math.round(val / 1000)}K` : val;
        this.deps_.setMaxDynamicStars?.(val);

        globalEventBus.emit(Events.SETTING_CHANGED, {
          setting: 'maxDynamicStars',
          value: val,
        });
      });
    }

    // Constellation quick toggle - cycles: all → focus → off → all
    const quickToggle = domCache.get('constellations-quick-toggle');
    if (quickToggle) {
      this.syncConstellationQuickToggle_('all');
      addMobileButtonListener(quickToggle, () => {
        const cycleOrder = ['all', 'focus', 'off'];
        const currentMode = quickToggle.dataset.mode || 'all';
        const nextIdx = (cycleOrder.indexOf(currentMode) + 1) % cycleOrder.length;
        const nextMode = cycleOrder[nextIdx];

        this.deps_.setConstellationLinesMode?.(nextMode);
        this.syncConstellationQuickToggle_(nextMode);

        globalEventBus.emit(Events.SETTING_CHANGED, {
          setting: 'constellationLinesMode',
          value: nextMode,
        });
      });
    }
  }

  /**
   * Sync the constellation quick toggle button with the current mode.
   * @param {string} mode - 'off', 'focus', or 'all'
   * @private
   */
  syncConstellationQuickToggle_(mode) {
    const quickToggle = domCache.get('constellations-quick-toggle');
    if (!quickToggle) return;

    quickToggle.classList.toggle('active', mode === 'all');
    quickToggle.dataset.mode = mode;
  }

}

/**
 * Info Badge Updater - periodically updates the info badge display.
 */
export class InfoBadgeUpdater {
  /**
   * Creates a new InfoBadgeUpdater instance.
   * @param {!Object=} dependencies - Optional dependencies
   * @param {function(): number=} dependencies.getFOV - Get FOV function
   * @param {function(): {ra: number, dec: number}=} dependencies.getViewDirection - Get view
   */
  constructor(dependencies = {}) {
    /** @private @const */
    this.deps_ = dependencies;

    /** @private {?number} */
    this.intervalId_ = null;

    /** @private {!Array<{unsubscribe: function(): void}>} */
    this.subscriptions_ = [];
  }

  /**
   * Initialize the info badge updater.
   */
  initialize() {
    this.start();
    this.setupEventBusListeners_();
  }

  /**
   * Sets up EventBus listeners.
   * @private
   */
  setupEventBusListeners_() {
    this.subscriptions_.push(
      globalEventBus.on(Events.FOV_CHANGED, (data) => {
        this.updateFOVDisplay_(data.fov);
      }),
      globalEventBus.on(Events.CAMERA_MOVE, () => {
        this.updateBadges_();
      })
    );
  }

  /**
   * Release EventBus subscriptions.
   */
  dispose() {
    this.subscriptions_.forEach((sub) => sub?.unsubscribe?.());
    this.subscriptions_ = [];
  }

  /**
   * Starts the periodic update interval.
   */
  start() {
    // Update every 2 seconds to save power
    this.intervalId_ = setInterval(() => {
      this.updateBadges_();
    }, 2000);
  }

  /**
   * Stops the periodic update interval.
   */
  stop() {
    if (this.intervalId_) {
      clearInterval(this.intervalId_);
      this.intervalId_ = null;
    }
  }

  /**
   * Update all badges.
   * @private
   */
  updateBadges_() {
    const fovBadge = domCache.get('fov-badge');
    const coordsBadge = domCache.get('coords-badge');

    if (fovBadge) {
      fovBadge.textContent =
        domCache.get('fov-display')?.textContent || '60°';
    }

    if (coordsBadge) {
      const ra = domCache.get('ra-display')?.textContent || '0°';
      const dec = domCache.get('dec-display')?.textContent || '0°';
      coordsBadge.textContent = `RA ${ra} Dec ${dec}`;
    }
  }

  /**
   * Update FOV display.
   * @param {number} fov - FOV in degrees
   * @private
   */
  updateFOVDisplay_(fov) {
    const fovBadge = domCache.get('fov-badge');
    const fovDisplay = domCache.get('fov-display');

    if (fovDisplay) {
      fovDisplay.textContent = `${fov.toFixed(1)}°`;
    }
    if (fovBadge) {
      fovBadge.textContent = `${fov.toFixed(1)}°`;
    }
  }
}

/**
 * Main UI Controller - orchestrates all UI components.
 */
export class UIController {
  /**
   * Creates a new UIController instance.
   * @param {!Object} dependencies - Required dependencies for all handlers
   */
  constructor(dependencies) {
    /** @private @const */
    this.deps_ = dependencies;

    /** @private @const {!PanelManager} */
    this.panelManager_ = dependencies.panelManager || panelManager;

    /** @private {?SearchController} */
    this.searchController_ = null;

    /** @private {?SettingsHandler} */
    this.settingsHandler_ = null;

    /** @private {?TimeUI} */
    this.timeUI_ = null;

    /** @private {?GameUI} */
    this.gameUI_ = null;

    /** @private {?TourUI} */
    this.tourUI_ = null;

    /** @private {?InfoBadgeUpdater} */
    this.infoBadgeUpdater_ = null;

    /** @private {?TelescopeUI} */
    this.telescopeUI_ = null;
  }

  /**
   * Initializes the UI controller.
   */
  initialize() {
    // Initialize panel manager
    this.panelManager_.initialize();

    // Create and initialize all handlers
    this.searchController_ = new SearchController({
      performSearch: this.deps_.performSearch,
      selectObject: this.deps_.selectObject,
    });
    this.searchController_.initialize();

    this.settingsHandler_ = new SettingsHandler({
      setConstellationLines: this.deps_.setConstellationLines,
      setConstellationLinesMode: this.deps_.setConstellationLinesMode,
      setEquatorLineVisible: this.deps_.setEquatorLineVisible,
      setGridVisible: this.deps_.setGridVisible,
      setLanguage: this.deps_.setLanguage,
      setMagnitudeLimit: this.deps_.setMagnitudeLimit,
      showLocationDialog: this.deps_.showLocationDialog,
      requestGeolocation: this.deps_.requestGeolocation,
      resetCamera: this.deps_.resetCamera,
      showEventsCalendar: this.deps_.showEventsCalendar,
      setMaxDynamicStars: this.deps_.setMaxDynamicStars,
    });
    this.settingsHandler_.initialize();

    this.timeUI_ = new TimeUI({
      setTimeSpeed: this.deps_.setTimeSpeed,
      togglePlayback: this.deps_.togglePlayback,
      jumpToTime: this.deps_.jumpToTime,
      getSimulationTime: this.deps_.getSimulationTime,
    });
    this.timeUI_.initialize();

    this.gameUI_ = new GameUI({
      startGame: this.deps_.startGame,
      passQuestion: this.deps_.passQuestion,
      stopGame: this.deps_.stopGame,
    });
    this.gameUI_.initialize();

    this.tourUI_ = new TourUI({
      startTour: this.deps_.startTour,
      nextStep: this.deps_.nextTourStep,
      prevStep: this.deps_.prevTourStep,
      stopTour: this.deps_.stopTour,
      panelManager: this.panelManager_,
    });
    this.tourUI_.initialize();

    this.telescopeUI_ = new TelescopeUI({
      getTelescope: this.deps_.getTelescope,
      setTelescope: this.deps_.setTelescope,
      getEyepiece: this.deps_.getEyepiece,
      setEyepiece: this.deps_.setEyepiece,
      toggleMode: this.deps_.toggleTelescopeMode,
      isActive: this.deps_.isTelescopeModeActive,
      savePreset: this.deps_.saveTelescopePreset,
      loadPreset: this.deps_.loadTelescopePreset,
      deletePreset: this.deps_.deleteTelescopePreset,
      getPresetNames: this.deps_.getTelescopePresetNames,
      getComputedProperties: this.deps_.getTelescopeComputedProperties,
      computeVisibilityForDiameters: this.deps_.computeVisibilityForDiameters,
      computeDiffuseVisibility: this.deps_.computeDiffuseVisibility,
    });
    this.telescopeUI_.initialize();

    this.infoBadgeUpdater_ = new InfoBadgeUpdater({
      getFOV: this.deps_.getFOV,
      getViewDirection: this.deps_.getViewDirection,
    });
    this.infoBadgeUpdater_.initialize();

    // Setup panel-specific buttons
    this.setupPanelButtons_();

    logger.info('Initialized');
  }

  /**
   * Setup panel-specific buttons.
   * @private
   */
  setupPanelButtons_() {
    // Settings toggle
    const settingsToggle = domCache.get('settings-toggle');
    if (settingsToggle) {
      addMobileButtonListener(settingsToggle, () => {
        this.panelManager_.toggle('settings-panel');
      });
    }

    // Compass toggle
    const compassToggle = domCache.get('compass-toggle');
    if (compassToggle) {
      addMobileButtonListener(compassToggle, () => {
        this.deps_.toggleCompassMode?.();
      });
    }

    // Close buttons
    this.panelManager_.setupCloseButton('settings-close-btn');
    this.panelManager_.setupCloseButton('visible-tonight-close-btn');
    this.panelManager_.setupCloseButton('events-close-btn');

    // Info panel close button
    const infoCloseBtn = domCache.get('info-close-btn');
    if (infoCloseBtn) {
      addMobileButtonListener(infoCloseBtn, () => {
        this.deps_.selectObject?.(null);
      });
    }
  }

  /**
   * Get the panel manager.
   * @returns {!PanelManager} Panel manager instance
   */
  getPanelManager() {
    return this.panelManager_;
  }

  /**
   * Get the search controller.
   * @returns {?SearchController} Search controller instance
   */
  getSearchController() {
    return this.searchController_;
  }

  /**
   * Get the settings handler.
   * @returns {?SettingsHandler} Settings handler instance
   */
  getSettingsHandler() {
    return this.settingsHandler_;
  }

  /**
   * Open a panel by ID.
   * @param {string} panelId - Panel ID to open
   */
  openPanel(panelId) {
    this.panelManager_.open(panelId);
  }

  /**
   * Close all panels.
   */
  closeAllPanels() {
    this.panelManager_.closeAll();
  }

  /**
   * Dispose of resources.
   */
  dispose() {
    this.infoBadgeUpdater_?.stop();
    this.infoBadgeUpdater_?.dispose();
    this.settingsHandler_?.dispose();
    this.panelManager_.dispose();
  }
}

/**
 * Singleton instance for application-wide UI control.
 * Note: Must be initialized with dependencies before use.
 * @type {?UIController}
 */
export let uiController = null;

/**
 * Reset the singleton instance (for testing only).
 */
export function resetUIController() {
  uiController = null;
}

/**
 * Initialize the UI controller singleton.
 * Returns existing instance if already initialized (prevents duplicate event handlers).
 * @param {!Object} dependencies - Required dependencies
 * @returns {!UIController} Initialized controller
 */
export function initializeUIController(dependencies) {
  if (uiController) {
    logger.warn('Already initialized, returning existing instance');
    return uiController;
  }
  uiController = new UIController(dependencies);
  uiController.initialize();
  return uiController;
}
