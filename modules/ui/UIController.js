/**
 * @fileoverview UI Controller for Sky Map Application.
 * Uses dependency injection and EventBus for decoupled communication.
 *
 * Feature-specific UI handlers have been extracted to their respective modules:
 * - GameUI → modules/features/GameUI.js
 * - TourUI → modules/features/TourUI.js
 * - TimeUI → modules/features/TimeUI.js
 * - TelescopeUI → modules/features/TelescopeUI.js
 */

import {globalEventBus, Events} from '../core/EventBus.js';
import {PanelManager, panelManager} from './PanelManager.js';
import {escapeHtml} from '../core/SecurityUtils.js';
import {GameUI} from '../features/GameUI.js';
import {TourUI} from '../features/TourUI.js';
import {TimeUI} from '../features/TimeUI.js';
import {TelescopeUI} from '../features/TelescopeUI.js';

/**
 * Maximum length for preset names.
 * @const {number}
 */
const MAX_PRESET_NAME_LENGTH = 50;

/**
 * Validates and sanitizes a preset name.
 * @param {string} name - The raw preset name from user input
 * @returns {{valid: boolean, sanitized: string, error: string}} Validation result
 */
export function validatePresetName(name) {
  if (!name) {
    return {valid: false, sanitized: '', error: 'Preset name is required.'};
  }

  // Trim whitespace
  let sanitized = name.trim();

  if (!sanitized) {
    return {valid: false, sanitized: '', error: 'Preset name cannot be empty.'};
  }

  // Check length
  if (sanitized.length > MAX_PRESET_NAME_LENGTH) {
    return {
      valid: false,
      sanitized: '',
      error: `Preset name must be ${MAX_PRESET_NAME_LENGTH} characters or less.`,
    };
  }

  // Only allow alphanumeric, spaces, hyphens, underscores
  const validPattern = /^[\w\s-]+$/;
  if (!validPattern.test(sanitized)) {
    return {
      valid: false,
      sanitized: '',
      error: 'Preset name can only contain letters, numbers, spaces, hyphens, and underscores.',
    };
  }

  return {valid: true, sanitized, error: ''};
}

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
    this.searchInput_ = document.getElementById('search-input');

    /** @private {?Element} */
    this.searchResults_ = document.getElementById('search-results');

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
   * @param {function(): void=} dependencies.toggleNightMode - Toggle night mode
   * @param {function(boolean): void=} dependencies.setConstellationLines - Set lines
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
  }

  /**
   * Initialize the settings handler.
   */
  initialize() {
    this.setupEventListeners_();
  }

  /**
   * Sets up event listeners for settings controls.
   * @private
   */
  setupEventListeners_() {
    // Equator line toggle
    const equatorToggle = document.getElementById('equator-line-toggle');
    if (equatorToggle) {
      equatorToggle.addEventListener('change', (e) => {
        this.deps_.setEquatorLineVisible?.(e.target.checked);
      });
    }

    // Constellation lines toggle
    const constLinesToggle = document.getElementById('constellation-lines-toggle');
    if (constLinesToggle) {
      constLinesToggle.addEventListener('change', (e) => {
        this.deps_.setConstellationLines?.(e.target.checked);

        // Sync quick toggle button state
        const quickToggle = document.getElementById('constellations-quick-toggle');
        if (quickToggle) {
          quickToggle.classList.toggle('active', e.target.checked);
        }

        globalEventBus.emit(Events.SETTING_CHANGED, {
          setting: 'constellationLines',
          value: e.target.checked,
        });
      });
    }

    // Language selector
    const languageSelect = document.getElementById('constellation-language');
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
    const magSlider = document.getElementById('magnitude-slider');
    const magValue = document.getElementById('mag-value');
    if (magSlider && magValue) {
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
    const setLocationBtn = document.getElementById('set-location-btn');
    if (setLocationBtn) {
      setLocationBtn.addEventListener('click', () => {
        this.deps_.showLocationDialog?.();
      });
    }

    // Auto location button
    const autoLocationBtn = document.getElementById('auto-location-btn');
    if (autoLocationBtn) {
      autoLocationBtn.addEventListener('click', () => {
        this.deps_.requestGeolocation?.();
      });
    }

    // Reset view button
    const resetViewBtn = document.getElementById('reset-view-btn');
    if (resetViewBtn) {
      resetViewBtn.addEventListener('click', () => {
        this.deps_.resetCamera?.();
      });
    }

    // Upcoming events button
    const eventsBtn = document.getElementById('events-btn');
    if (eventsBtn) {
      eventsBtn.addEventListener('click', () => {
        this.deps_.showEventsCalendar?.();
      });
    }

    // Max dynamic stars slider
    const maxDynamicSlider = document.getElementById('max-dynamic-stars');
    const maxDynamicValue = document.getElementById('max-dynamic-stars-value');
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

    // Constellation quick toggle
    const quickToggle = document.getElementById('constellations-quick-toggle');
    if (quickToggle) {
      quickToggle.addEventListener('click', () => {
        const settingsToggle = document.getElementById('constellation-lines-toggle');
        if (settingsToggle) {
          settingsToggle.checked = !settingsToggle.checked;
          settingsToggle.dispatchEvent(new Event('change'));
        }
        quickToggle.classList.toggle('active', settingsToggle?.checked);
      });
    }
  }

  /**
   * Update a setting value in the UI.
   * @param {string} setting - Setting name
   * @param {*} value - New value
   */
  updateSetting(setting, value) {
    switch (setting) {
      case 'nightMode': {
        const toggle = document.getElementById('night-mode-toggle');
        if (toggle) toggle.checked = value;
        break;
      }
      case 'constellationLines': {
        const toggle = document.getElementById('constellation-lines-toggle');
        if (toggle) toggle.checked = value;
        const quickToggle = document.getElementById('constellations-quick-toggle');
        if (quickToggle) quickToggle.classList.toggle('active', value);
        break;
      }
      case 'magnitudeLimit': {
        const slider = document.getElementById('magnitude-slider');
        const display = document.getElementById('mag-value');
        if (slider) slider.value = value;
        if (display) display.textContent = value.toFixed(1);
        break;
      }
    }
  }
}

// TimeControlsHandler has been moved to modules/features/TimeUI.js

// GameControlsHandler has been moved to modules/features/GameUI.js

// TourButtonsHandler has been moved to modules/features/TourUI.js

// TelescopeSettingsHandler has been moved to modules/features/TelescopeUI.js

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
    globalEventBus.on(Events.FOV_CHANGED, (data) => {
      this.updateFOVDisplay_(data.fov);
    });

    globalEventBus.on(Events.CAMERA_MOVE, () => {
      this.updateBadges_();
    });
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
    const fovBadge = document.getElementById('fov-badge');
    const coordsBadge = document.getElementById('coords-badge');

    if (fovBadge) {
      fovBadge.textContent =
        document.getElementById('fov-display')?.textContent || '60°';
    }

    if (coordsBadge) {
      const ra = document.getElementById('ra-display')?.textContent || '0°';
      const dec = document.getElementById('dec-display')?.textContent || '0°';
      coordsBadge.textContent = `RA ${ra} Dec ${dec}`;
    }
  }

  /**
   * Update FOV display.
   * @param {number} fov - FOV in degrees
   * @private
   */
  updateFOVDisplay_(fov) {
    const fovBadge = document.getElementById('fov-badge');
    const fovDisplay = document.getElementById('fov-display');

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
      toggleNightMode: this.deps_.toggleNightMode,
      setConstellationLines: this.deps_.setConstellationLines,
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
    });
    this.telescopeUI_.initialize();

    this.infoBadgeUpdater_ = new InfoBadgeUpdater({
      getFOV: this.deps_.getFOV,
      getViewDirection: this.deps_.getViewDirection,
    });
    this.infoBadgeUpdater_.initialize();

    // Setup panel-specific buttons
    this.setupPanelButtons_();

    console.log('UI Controller initialized');
  }

  /**
   * Setup panel-specific buttons.
   * @private
   */
  setupPanelButtons_() {
    // Settings toggle
    const settingsToggle = document.getElementById('settings-toggle');
    if (settingsToggle) {
      settingsToggle.addEventListener('click', () => {
        this.panelManager_.toggle('settings-panel');
      });
    }

    // Compass toggle
    const compassToggle = document.getElementById('compass-toggle');
    if (compassToggle) {
      compassToggle.addEventListener('click', () => {
        this.deps_.toggleCompassMode?.();
      });
    }

    // Close buttons
    this.panelManager_.setupCloseButton('settings-close-btn');
    this.panelManager_.setupCloseButton('visible-tonight-close-btn');
    this.panelManager_.setupCloseButton('events-close-btn');

    // Info panel close button
    const infoCloseBtn = document.getElementById('info-close-btn');
    if (infoCloseBtn) {
      infoCloseBtn.addEventListener('click', () => {
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
 * Initialize the UI controller singleton.
 * @param {!Object} dependencies - Required dependencies
 * @returns {!UIController} Initialized controller
 */
export function initializeUIController(dependencies) {
  uiController = new UIController(dependencies);
  uiController.initialize();
  return uiController;
}
