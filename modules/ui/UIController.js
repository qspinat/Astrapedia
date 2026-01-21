/**
 * @fileoverview UI Controller for Sky Map Application.
 * Uses dependency injection and EventBus for decoupled communication.
 */

import {globalEventBus, Events} from '../core/EventBus.js';
import {PanelManager, panelManager} from './PanelManager.js';

/**
 * HTML escape function to prevent XSS.
 * @param {?string} str - String to escape
 * @returns {string} Escaped HTML string
 */
export const escapeHtml = (str) => {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
};

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
      this.selectObject_?.(this.currentResults_[index]);
      this.searchResults_.classList.remove('active');
      this.searchInput_.value = '';
      this.currentResults_ = [];
      this.selectedIndex_ = -1;

      globalEventBus.emit(Events.SEARCH_RESULT_SELECTED, {
        result: this.currentResults_[index],
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

/**
 * Time Controls Handler - handles time playback buttons.
 */
export class TimeControlsHandler {
  /**
   * Creates a new TimeControlsHandler instance.
   * @param {!Object} dependencies - Required dependencies
   * @param {function(number): void=} dependencies.setTimeSpeed - Set time speed
   * @param {function(): void=} dependencies.togglePlayback - Toggle playback
   * @param {function(!Date): void=} dependencies.jumpToTime - Jump to time
   */
  constructor(dependencies) {
    /** @private @const */
    this.deps_ = dependencies;

    /** @private {boolean} */
    this.isPlaying_ = false;
  }

  /**
   * Initialize the time controls handler.
   */
  initialize() {
    this.setupEventListeners_();
    this.setupEventBusListeners_();
  }

  /**
   * Sets up event listeners for time controls.
   * @private
   */
  setupEventListeners_() {
    const timeRewindBtn = document.getElementById('time-rewind-btn');
    if (timeRewindBtn) {
      timeRewindBtn.addEventListener('click', () => {
        this.deps_.setTimeSpeed?.(-100);
      });
    }

    const timePlayBtn = document.getElementById('time-play-btn');
    if (timePlayBtn) {
      timePlayBtn.addEventListener('click', () => {
        this.deps_.togglePlayback?.();
      });
    }

    const timeForwardBtn = document.getElementById('time-forward-btn');
    if (timeForwardBtn) {
      timeForwardBtn.addEventListener('click', () => {
        this.deps_.setTimeSpeed?.(100);
      });
    }

    const timeNowBtn = document.getElementById('time-now-btn');
    if (timeNowBtn) {
      timeNowBtn.addEventListener('click', () => {
        this.deps_.jumpToTime?.(new Date());
      });
    }
  }

  /**
   * Sets up EventBus listeners.
   * @private
   */
  setupEventBusListeners_() {
    globalEventBus.on(Events.TIME_SPEED_CHANGED, (data) => {
      this.isPlaying_ = data.isPlaying;
      this.updatePlayButton_();
    });

    globalEventBus.on(Events.TIME_CHANGED, (data) => {
      this.updateTimeDisplay_(data.time);
    });

    globalEventBus.on(Events.TIME_TICK, (data) => {
      this.updateTimeDisplay_(data.time);
    });
  }

  /**
   * Update the play button appearance.
   * @private
   */
  updatePlayButton_() {
    const playBtn = document.getElementById('time-play-btn');
    if (playBtn) {
      playBtn.classList.toggle('playing', this.isPlaying_);
    }
  }

  /**
   * Update the time display.
   * @param {!Date} time - Current time
   * @private
   */
  updateTimeDisplay_(time) {
    const timeDisplay = document.getElementById('time-display');
    if (timeDisplay) {
      timeDisplay.textContent = time.toLocaleString();
    }
  }
}

/**
 * Game Controls Handler - handles game mode buttons.
 */
export class GameControlsHandler {
  /**
   * Creates a new GameControlsHandler instance.
   * @param {!Object} dependencies - Required dependencies
   * @param {function(): void=} dependencies.startGame - Start game
   * @param {function(): void=} dependencies.passQuestion - Pass current question
   * @param {function(): void=} dependencies.stopGame - Stop game
   */
  constructor(dependencies) {
    /** @private @const */
    this.deps_ = dependencies;
  }

  /**
   * Initialize the game controls handler.
   */
  initialize() {
    this.setupEventListeners_();
    this.setupEventBusListeners_();
  }

  /**
   * Sets up event listeners for game controls.
   * @private
   */
  setupEventListeners_() {
    const startGameBtn = document.getElementById('start-game-btn');
    if (startGameBtn) {
      startGameBtn.addEventListener('click', () => {
        this.deps_.startGame?.();
      });
    }

    const passBtn = document.getElementById('pass-btn');
    if (passBtn) {
      passBtn.addEventListener('click', () => {
        this.deps_.passQuestion?.();
      });
    }

    const stopGameBtn = document.getElementById('stop-game-btn');
    if (stopGameBtn) {
      stopGameBtn.addEventListener('click', () => {
        this.deps_.stopGame?.();
      });
    }
  }

  /**
   * Sets up EventBus listeners.
   * @private
   */
  setupEventBusListeners_() {
    globalEventBus.on(Events.GAME_STARTED, () => {
      this.updateGameUI_(true);
    });

    globalEventBus.on(Events.GAME_ENDED, () => {
      this.updateGameUI_(false);
    });

    globalEventBus.on(Events.GAME_QUESTION, (data) => {
      this.updateQuestionDisplay_(data);
    });

    globalEventBus.on(Events.GAME_SCORE, (data) => {
      this.updateScoreDisplay_(data);
    });
  }

  /**
   * Update game UI state.
   * @param {boolean} isPlaying - Whether game is playing
   * @private
   */
  updateGameUI_(isPlaying) {
    const gamePanel = document.getElementById('game-panel');
    if (gamePanel) {
      gamePanel.classList.toggle('active', isPlaying);
    }
  }

  /**
   * Update question display.
   * @param {!Object} data - Question data
   * @private
   */
  updateQuestionDisplay_(data) {
    const questionEl = document.getElementById('game-question');
    if (questionEl) {
      questionEl.textContent = `Find: ${data.targetName}`;
    }
  }

  /**
   * Update score display.
   * @param {!Object} data - Score data
   * @private
   */
  updateScoreDisplay_(data) {
    const scoreEl = document.getElementById('game-score');
    if (scoreEl) {
      scoreEl.textContent = `Score: ${data.score}/${data.total}`;
    }
  }
}

/**
 * Tour Buttons Handler - handles tour selection buttons.
 */
export class TourButtonsHandler {
  /**
   * Creates a new TourButtonsHandler instance.
   * @param {!Object} dependencies - Required dependencies
   * @param {function(string): void=} dependencies.startTour - Start tour function
   * @param {!PanelManager=} dependencies.panelManager - Panel manager
   */
  constructor(dependencies) {
    /** @private @const */
    this.startTour_ = dependencies.startTour;

    /** @private @const */
    this.panelManager_ = dependencies.panelManager || panelManager;
  }

  /**
   * Initialize the tour buttons handler.
   */
  initialize() {
    this.setupEventListeners_();
  }

  /**
   * Sets up event listeners for tour buttons.
   * @private
   */
  setupEventListeners_() {
    this.setupTourButton_('tour-tonight-btn', 'tonight-best');
    this.setupTourButton_('tour-messier-btn', 'messier-marathon');
    this.setupTourButton_('tour-nebulae-btn', 'best-nebulae');
    this.setupTourButton_('tour-galaxies-btn', 'best-galaxies');
    this.setupTourButton_('tour-clusters-btn', 'best-clusters');
    this.setupTourButton_('tour-constellations-btn', 'constellations');
    this.setupTourButton_('tour-planets-btn', 'planets');
    this.setupTourButton_('tour-winter-btn', 'winter-sky');
  }

  /**
   * Sets up a tour button with event handler.
   * @param {string} buttonId - The button element ID
   * @param {string} tourName - The tour name to start
   * @private
   */
  setupTourButton_(buttonId, tourName) {
    const btn = document.getElementById(buttonId);
    if (btn) {
      btn.addEventListener('click', () => {
        this.startTour_?.(tourName);
        this.panelManager_.closeAll();
      });
    }
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

    /** @private {?TimeControlsHandler} */
    this.timeControlsHandler_ = null;

    /** @private {?GameControlsHandler} */
    this.gameControlsHandler_ = null;

    /** @private {?TourButtonsHandler} */
    this.tourButtonsHandler_ = null;

    /** @private {?InfoBadgeUpdater} */
    this.infoBadgeUpdater_ = null;
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

    this.timeControlsHandler_ = new TimeControlsHandler({
      setTimeSpeed: this.deps_.setTimeSpeed,
      togglePlayback: this.deps_.togglePlayback,
      jumpToTime: this.deps_.jumpToTime,
    });
    this.timeControlsHandler_.initialize();

    this.gameControlsHandler_ = new GameControlsHandler({
      startGame: this.deps_.startGame,
      passQuestion: this.deps_.passQuestion,
      stopGame: this.deps_.stopGame,
    });
    this.gameControlsHandler_.initialize();

    this.tourButtonsHandler_ = new TourButtonsHandler({
      startTour: this.deps_.startTour,
      panelManager: this.panelManager_,
    });
    this.tourButtonsHandler_.initialize();

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
