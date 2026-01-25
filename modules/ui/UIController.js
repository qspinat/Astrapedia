/**
 * @fileoverview UI Controller for Sky Map Application.
 * Uses dependency injection and EventBus for decoupled communication.
 */

import {globalEventBus, Events} from '../core/EventBus.js';
import {PanelManager, panelManager} from './PanelManager.js';
import {escapeHtml} from '../core/SecurityUtils.js';

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
 * Telescope Settings Handler - handles telescope simulation controls.
 *
 * @deprecated This modular version is not currently used. The app loads
 * ui-controller.js (legacy) which has its own TelescopeSettingsHandler
 * implementation that directly accesses window.app. This class is kept
 * for future migration to the modular main.js architecture.
 */
export class TelescopeSettingsHandler {
  /**
   * Creates a new TelescopeSettingsHandler instance.
   * @param {!Object} dependencies - Required dependencies
   * @param {function(): !Object=} dependencies.getTelescope - Get telescope config
   * @param {function(!Object): void=} dependencies.setTelescope - Set telescope config
   * @param {function(): !Object=} dependencies.getEyepiece - Get eyepiece config
   * @param {function(!Object): void=} dependencies.setEyepiece - Set eyepiece config
   * @param {function(): void=} dependencies.toggleTelescopeMode - Toggle mode
   * @param {function(): boolean=} dependencies.isTelescopeModeActive - Check if active
   * @param {function(string): void=} dependencies.savePreset - Save preset
   * @param {function(string): boolean=} dependencies.loadPreset - Load preset
   * @param {function(string): boolean=} dependencies.deletePreset - Delete preset
   * @param {function(): !Array<string>=} dependencies.getPresetNames - Get preset names
   * @param {function(): ?Object=} dependencies.getComputedProperties - Get computed props
   */
  constructor(dependencies) {
    /** @private @const */
    this.deps_ = dependencies;
  }

  /**
   * Initialize the telescope settings handler.
   */
  initialize() {
    this.setupEventListeners_();
    this.setupEventBusListeners_();
    this.populatePresets_();
    this.loadCurrentValues_();
    this.updateComputedDisplay_();
  }

  /**
   * Load current telescope values into inputs.
   * @private
   */
  loadCurrentValues_() {
    const telescope = this.deps_.getTelescope?.();
    const eyepiece = this.deps_.getEyepiece?.();

    if (telescope) {
      const diameterInput = document.getElementById('telescope-diameter');
      const focalLengthInput = document.getElementById('telescope-focal-length');
      if (diameterInput) diameterInput.value = telescope.diameter;
      if (focalLengthInput) focalLengthInput.value = telescope.focalLength;
    }

    if (eyepiece) {
      const eyepieceFLInput = document.getElementById('eyepiece-focal-length');
      const eyepieceAFOVInput = document.getElementById('eyepiece-afov');
      if (eyepieceFLInput) eyepieceFLInput.value = eyepiece.focalLength;
      if (eyepieceAFOVInput) eyepieceAFOVInput.value = eyepiece.apparentFov;
    }
  }

  /**
   * Populate preset dropdown.
   * @private
   */
  populatePresets_() {
    const select = document.getElementById('telescope-preset-select');
    if (!select) return;

    const presetNames = this.deps_.getPresetNames?.() || [];

    // Clear existing options except the first one
    while (select.options.length > 1) {
      select.remove(1);
    }

    // Add presets
    presetNames.forEach((name) => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });
  }

  /**
   * Update computed display values.
   * @private
   */
  updateComputedDisplay_() {
    const props = this.deps_.getComputedProperties?.();
    if (!props) return;

    const magEl = document.getElementById('computed-magnification');
    const maxMagEl = document.getElementById('computed-max-mag');
    const exitPupilEl = document.getElementById('computed-exit-pupil');
    const realFovEl = document.getElementById('computed-real-fov');
    const limitingMagEl = document.getElementById('computed-limiting-mag');
    const warningEl = document.getElementById('telescope-warning');

    if (magEl) magEl.textContent = `${props.magnification.toFixed(0)}x`;
    if (maxMagEl) maxMagEl.textContent = `${props.maxUsefulMagnification.toFixed(0)}x`;
    if (exitPupilEl) exitPupilEl.textContent = `${props.exitPupil.toFixed(1)}mm`;
    if (realFovEl) realFovEl.textContent = `${props.realFieldOfView.toFixed(2)}°`;
    if (limitingMagEl) limitingMagEl.textContent = props.limitingMagnitude.toFixed(1);

    // Show/hide warning
    if (warningEl) {
      warningEl.classList.toggle('visible', props.isOverMagnified);
    }

    // Update reticle info
    const reticleFovEl = document.getElementById('reticle-fov');
    const reticleMagEl = document.getElementById('reticle-mag');
    if (reticleFovEl) reticleFovEl.textContent = `${props.realFieldOfView.toFixed(2)}°`;
    if (reticleMagEl) reticleMagEl.textContent = `${props.magnification.toFixed(0)}x`;
  }

  /**
   * Sets up event listeners.
   * @private
   */
  setupEventListeners_() {
    // Telescope mode toggle
    const modeToggle = document.getElementById('telescope-mode-toggle');
    if (modeToggle) {
      modeToggle.addEventListener('change', () => {
        this.deps_.toggleTelescopeMode?.();
      });
    }

    // Telescope diameter
    const diameterInput = document.getElementById('telescope-diameter');
    if (diameterInput) {
      diameterInput.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        if (!isNaN(value) && value > 0) {
          this.deps_.setTelescope?.({diameter: value});
        }
      });
    }

    // Telescope focal length
    const focalLengthInput = document.getElementById('telescope-focal-length');
    if (focalLengthInput) {
      focalLengthInput.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        if (!isNaN(value) && value > 0) {
          this.deps_.setTelescope?.({focalLength: value});
        }
      });
    }

    // Eyepiece focal length
    const eyepieceFLInput = document.getElementById('eyepiece-focal-length');
    if (eyepieceFLInput) {
      eyepieceFLInput.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        if (!isNaN(value) && value > 0) {
          this.deps_.setEyepiece?.({focalLength: value});
        }
      });
    }

    // Eyepiece apparent FOV
    const eyepieceAFOVInput = document.getElementById('eyepiece-afov');
    if (eyepieceAFOVInput) {
      eyepieceAFOVInput.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        if (!isNaN(value) && value > 0) {
          this.deps_.setEyepiece?.({apparentFov: value});
        }
      });
    }

    // Preset selector
    const presetSelect = document.getElementById('telescope-preset-select');
    if (presetSelect) {
      presetSelect.addEventListener('change', (e) => {
        const name = e.target.value;
        if (name) {
          this.deps_.loadPreset?.(name);
          this.loadCurrentValues_();
        }
      });
    }

    // Save preset button
    const saveBtn = document.getElementById('telescope-save-preset-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const name = prompt('Enter preset name:');
        if (!name) return;

        // Validate and sanitize the name
        const validation = validatePresetName(name);
        if (!validation.valid) {
          alert(validation.error);
          return;
        }

        const sanitizedName = validation.sanitized;

        // Check if preset already exists
        const existingPresets = this.deps_.getPresetNames?.() || [];
        if (existingPresets.includes(sanitizedName)) {
          if (!confirm(`Preset "${sanitizedName}" already exists. Overwrite?`)) {
            return;
          }
        }

        this.deps_.savePreset?.(sanitizedName);
        this.populatePresets_();
        // Select the newly saved preset
        const select = document.getElementById('telescope-preset-select');
        if (select) select.value = sanitizedName;
      });
    }

    // Delete preset button
    const deleteBtn = document.getElementById('telescope-delete-preset-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        const select = document.getElementById('telescope-preset-select');
        const name = select?.value;
        if (name && confirm(`Delete preset "${name}"?`)) {
          this.deps_.deletePreset?.(name);
          this.populatePresets_();
        }
      });
    }
  }

  /**
   * Sets up EventBus listeners.
   * @private
   */
  setupEventBusListeners_() {
    globalEventBus.on(Events.TELESCOPE_COMPUTED, () => {
      this.updateComputedDisplay_();
    });

    globalEventBus.on(Events.TELESCOPE_MODE_ACTIVATED, () => {
      const toggle = document.getElementById('telescope-mode-toggle');
      if (toggle) toggle.checked = true;

      // Show reticle
      const reticle = document.getElementById('telescope-reticle');
      if (reticle) reticle.classList.add('visible');

      // Add vignette effect
      document.body.classList.add('telescope-mode');
    });

    globalEventBus.on(Events.TELESCOPE_MODE_DEACTIVATED, () => {
      const toggle = document.getElementById('telescope-mode-toggle');
      if (toggle) toggle.checked = false;

      // Hide reticle
      const reticle = document.getElementById('telescope-reticle');
      if (reticle) reticle.classList.remove('visible');

      // Remove vignette effect
      document.body.classList.remove('telescope-mode');
    });
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

    /** @private {?TelescopeSettingsHandler} */
    this.telescopeSettingsHandler_ = null;
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

    this.telescopeSettingsHandler_ = new TelescopeSettingsHandler({
      getTelescope: this.deps_.getTelescope,
      setTelescope: this.deps_.setTelescope,
      getEyepiece: this.deps_.getEyepiece,
      setEyepiece: this.deps_.setEyepiece,
      toggleTelescopeMode: this.deps_.toggleTelescopeMode,
      isTelescopeModeActive: this.deps_.isTelescopeModeActive,
      savePreset: this.deps_.saveTelescopePreset,
      loadPreset: this.deps_.loadTelescopePreset,
      deletePreset: this.deps_.deleteTelescopePreset,
      getPresetNames: this.deps_.getTelescopePresetNames,
      getComputedProperties: this.deps_.getTelescopeComputedProperties,
    });
    this.telescopeSettingsHandler_.initialize();

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
