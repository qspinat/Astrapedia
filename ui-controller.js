/**
 * @fileoverview UI Controller for Sky Map Application.
 * Extracted from inline JavaScript in app.html for better maintainability.
 */

/**
 * HTML escape function to prevent XSS.
 * @param {?string} str - String to escape
 * @returns {string} Escaped HTML string
 */
const escapeHtml = (str) => {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
};

/**
 * Panel Manager - handles opening/closing of slide panels.
 */
class PanelManager {
  /** Creates a new PanelManager instance. */
  constructor() {
    /** @private @const {?Element} */
    this.backdrop_ = document.getElementById('panel-backdrop');
    /** @private @const {!Array<string>} */
    this.allPanelIds_ = [
      'settings-panel',
      'info-panel',
      'visible-tonight-panel',
      'events-panel',
    ];
  }

  /** Closes all panels and removes backdrop. */
  closeAll() {
    this.allPanelIds_.forEach((id) => {
      const panel = document.getElementById(id);
      if (panel) panel.classList.remove('visible');
    });
    if (this.backdrop_) this.backdrop_.classList.remove('visible');
    document.body.classList.remove('panel-open');
  }

  /**
   * Opens a specific panel.
   * @param {string} panelId - The ID of the panel to open
   */
  open(panelId) {
    this.closeAll();
    // Also close search results
    const searchResults = document.getElementById('search-results');
    if (searchResults) searchResults.classList.remove('active');

    const panel = document.getElementById(panelId);
    if (panel) {
      panel.classList.add('visible');
      if (this.backdrop_) this.backdrop_.classList.add('visible');
      document.body.classList.add('panel-open');
    }
  }

  /** Sets up event listeners for panel management. */
  setupEventListeners() {
    // Backdrop click closes all panels
    if (this.backdrop_) {
      this.backdrop_.addEventListener('click', () => this.closeAll());
    }

    // Compass toggle
    const compassToggle = document.getElementById('compass-toggle');
    if (compassToggle) {
      compassToggle.addEventListener('click', () => {
        if (window.app && window.app.toggleCompassMode) {
          window.app.toggleCompassMode();
        }
      });
    }

    // Constellation lines quick toggle
    const constellationsQuickToggle = document.getElementById(
      'constellations-quick-toggle'
    );
    if (constellationsQuickToggle) {
      constellationsQuickToggle.addEventListener('click', () => {
        // Toggle the setting
        const settingsToggle = document.getElementById(
          'constellation-lines-toggle'
        );
        if (settingsToggle) {
          settingsToggle.checked = !settingsToggle.checked;
          // Trigger change event to update the app
          settingsToggle.dispatchEvent(new Event('change'));
        }
        // Update quick toggle button state
        constellationsQuickToggle.classList.toggle(
          'active',
          settingsToggle?.checked
        );
      });
    }

    // Settings toggle
    const settingsToggle = document.getElementById('settings-toggle');
    if (settingsToggle) {
      settingsToggle.addEventListener('click', () => {
        const panel = document.getElementById('settings-panel');
        if (panel && panel.classList.contains('visible')) {
          this.closeAll();
        } else {
          this.open('settings-panel');
        }
      });
    }

    // Close buttons for panels
    this.setupCloseButton_('settings-close-btn', () => this.closeAll());
    this.setupCloseButton_('visible-tonight-close-btn', () => this.closeAll());
    this.setupCloseButton_('events-close-btn', () => this.closeAll());

    // Info panel close button calls app.selectObject(null)
    const infoCloseBtn = document.getElementById('info-close-btn');
    if (infoCloseBtn) {
      infoCloseBtn.addEventListener('click', () => {
        if (window.app && window.app.selectObject) {
          window.app.selectObject(null);
        }
      });
    }
  }

  /**
   * Sets up a close button with a callback.
   * @param {string} buttonId - The button element ID
   * @param {function(): void} callback - Function to call on click
   * @private
   */
  setupCloseButton_(buttonId, callback) {
    const btn = document.getElementById(buttonId);
    if (btn) {
      btn.addEventListener('click', callback);
    }
  }
}

/**
 * Search Controller - handles search input and results.
 */
class SearchController {
  /** Creates a new SearchController instance. */
  constructor() {
    /** @private @const {?Element} */
    this.searchInput_ = document.getElementById('search-input');
    /** @private @const {?Element} */
    this.searchResults_ = document.getElementById('search-results');
    /** @private {!Array<!Object>} */
    this.currentResults_ = [];
    /** @private {number} */
    this.selectedIndex_ = -1;
  }

  /**
   * Updates the visual selection state of results.
   * @private
   */
  updateResultsDisplay_() {
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
      if (window.app) {
        window.app.selectObject(this.currentResults_[index]);
      }
      this.searchResults_.classList.remove('active');
      this.searchInput_.value = '';
      this.currentResults_ = [];
      this.selectedIndex_ = -1;
    }
  }

  /** Sets up event listeners for search functionality. */
  setupEventListeners() {
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

      if (!window.app) return;
      this.currentResults_ = window.app.performSearch(query);

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
            this.currentResults_.length - 1,
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
}

/**
 * Settings Handler - handles settings toggles and sliders.
 */
class SettingsHandler {
  /** Sets up event listeners for settings controls. */
  setupEventListeners() {
    // Equator line toggle
    const equatorToggle = document.getElementById('equator-line-toggle');
    if (equatorToggle) {
      equatorToggle.addEventListener('change', (e) => {
        if (window.app?.setEquatorLineVisible) {
          window.app.setEquatorLineVisible(e.target.checked);
        }
      });
    }

    // Constellation lines toggle
    const constLinesToggle = document.getElementById('constellation-lines-toggle');
    if (constLinesToggle) {
      constLinesToggle.addEventListener('change', (e) => {
        if (window.app && window.app.constellationLines) {
          window.app.constellationLines.forEach((line) => {
            line.visible = e.target.checked;
          });
        }
        // Sync quick toggle button state
        const quickToggle = document.getElementById('constellations-quick-toggle');
        if (quickToggle) {
          quickToggle.classList.toggle('active', e.target.checked);
        }
      });
    }

    // Language selector
    const languageSelect = document.getElementById('constellation-language');
    if (languageSelect) {
      languageSelect.addEventListener('change', (e) => {
        if (window.app && window.app.setConstellationLanguage) {
          window.app.setConstellationLanguage(e.target.value);
        }
      });
    }

    // Magnitude slider
    const magSlider = document.getElementById('magnitude-slider');
    const magValue = document.getElementById('mag-value');
    if (magSlider && magValue) {
      magSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        magValue.textContent = val.toFixed(1);
        if (window.app && window.app.setMagnitudeLimit) {
          window.app.setMagnitudeLimit(val);
        }
      });
    }

    // Set location button
    const setLocationBtn = document.getElementById('set-location-btn');
    if (setLocationBtn) {
      setLocationBtn.addEventListener('click', () => {
        if (window.app && window.app.showLocationDialog) {
          window.app.showLocationDialog();
        }
      });
    }

    // Auto location button
    const autoLocationBtn = document.getElementById('auto-location-btn');
    if (autoLocationBtn) {
      autoLocationBtn.addEventListener('click', () => {
        if (window.app && window.app.requestGeolocation) {
          window.app.requestGeolocation();
        }
      });
    }

    // Reset view button
    const resetViewBtn = document.getElementById('reset-view-btn');
    if (resetViewBtn) {
      resetViewBtn.addEventListener('click', () => {
        if (window.app && window.app.resetCamera) {
          window.app.resetCamera();
        }
      });
    }

    // Upcoming events button
    const eventsBtn = document.getElementById('events-btn');
    if (eventsBtn) {
      eventsBtn.addEventListener('click', () => {
        if (window.app && window.app.showEventsCalendar) {
          window.app.showEventsCalendar();
        }
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
        if (window.app) {
          window.app.maxDynamicStars = val;
        }
      });
    }
  }
}

/**
 * Time Controls Handler - handles time playback buttons.
 */
class TimeControlsHandler {
  /** Sets up event listeners for time controls. */
  setupEventListeners() {
    const timeRewindBtn = document.getElementById('time-rewind-btn');
    if (timeRewindBtn) {
      timeRewindBtn.addEventListener('click', () => {
        if (window.app && window.app.setTimeSpeed) {
          window.app.setTimeSpeed(-100);
        }
      });
    }

    const timePlayBtn = document.getElementById('time-play-btn');
    if (timePlayBtn) {
      timePlayBtn.addEventListener('click', () => {
        if (window.app) {
          window.app.isTimePlaying = !window.app.isTimePlaying;
          if (window.app.setTimeSpeed) {
            window.app.setTimeSpeed(window.app.isTimePlaying ? 1 : 0);
          }
        }
      });
    }

    const timeForwardBtn = document.getElementById('time-forward-btn');
    if (timeForwardBtn) {
      timeForwardBtn.addEventListener('click', () => {
        if (window.app && window.app.setTimeSpeed) {
          window.app.setTimeSpeed(100);
        }
      });
    }

    const timeNowBtn = document.getElementById('time-now-btn');
    if (timeNowBtn) {
      timeNowBtn.addEventListener('click', () => {
        if (window.app && window.app.jumpToTime) {
          window.app.jumpToTime(new Date());
        }
      });
    }

    // Date/Time Picker
    const timePickerBtn = document.getElementById('time-picker-btn');
    const timePickerPanel = document.getElementById('time-picker-panel');
    const datePicker = document.getElementById('date-picker');
    const timePicker = document.getElementById('time-picker');
    const timePickerApply = document.getElementById('time-picker-apply');
    const timePickerCancel = document.getElementById('time-picker-cancel');

    if (timePickerBtn && timePickerPanel) {
      // Toggle picker panel
      timePickerBtn.addEventListener('click', () => {
        const isVisible = timePickerPanel.classList.contains('visible');
        if (!isVisible) {
          // Pre-fill with current simulation time
          const currentTime = window.app?.simulationTime || new Date();
          if (datePicker) {
            datePicker.value = currentTime.toISOString().split('T')[0];
          }
          if (timePicker) {
            timePicker.value = currentTime.toTimeString().slice(0, 5);
          }
        }
        timePickerPanel.classList.toggle('visible');
      });
    }

    if (timePickerApply && datePicker && timePicker) {
      timePickerApply.addEventListener('click', () => {
        const dateValue = datePicker.value;
        const timeValue = timePicker.value;
        if (dateValue && timeValue) {
          const newDate = new Date(`${dateValue}T${timeValue}`);
          if (!isNaN(newDate.getTime()) && window.app?.jumpToTime) {
            window.app.jumpToTime(newDate);
          }
        }
        timePickerPanel?.classList.remove('visible');
      });
    }

    if (timePickerCancel) {
      timePickerCancel.addEventListener('click', () => {
        timePickerPanel?.classList.remove('visible');
      });
    }
  }
}

/**
 * Game Controls Handler - handles game mode buttons.
 */
class GameControlsHandler {
  /** Sets up event listeners for game controls. */
  setupEventListeners() {
    const startGameBtn = document.getElementById('start-game-btn');
    if (startGameBtn) {
      startGameBtn.addEventListener('click', () => {
        if (window.app && window.app.startGame) {
          window.app.startGame();
        }
      });
    }

    const passBtn = document.getElementById('pass-btn');
    if (passBtn) {
      passBtn.addEventListener('click', () => {
        if (window.app && window.app.passCurrentObject) {
          window.app.passCurrentObject();
        }
      });
    }

    const stopGameBtn = document.getElementById('stop-game-btn');
    if (stopGameBtn) {
      stopGameBtn.addEventListener('click', () => {
        if (window.app && window.app.stopGame) {
          window.app.stopGame();
        }
      });
    }
  }
}

/**
 * Tour Buttons Handler - handles tour selection buttons.
 */
class TourButtonsHandler {
  /**
   * Creates a new TourButtonsHandler instance.
   * @param {!PanelManager} panelManager - The panel manager instance
   */
  constructor(panelManager) {
    /** @private @const {!PanelManager} */
    this.panelManager_ = panelManager;
  }

  /** Sets up event listeners for tour buttons. */
  setupEventListeners() {
    // Main tour buttons
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
        if (window.app && window.app.startTour) {
          window.app.startTour(tourName);
        }
        this.panelManager_.closeAll();
      });
    }
  }
}

/**
 * Info Badge Updater - periodically updates the info badge display.
 */
class InfoBadgeUpdater {
  /** Creates a new InfoBadgeUpdater instance. */
  constructor() {
    /** @private {?number} */
    this.intervalId_ = null;
  }

  /** Starts the periodic update interval. */
  start() {
    // Update every 2 seconds instead of 500ms to save power
    this.intervalId_ = setInterval(() => {
      if (window.app) {
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
    }, 2000);
  }

  /** Stops the periodic update interval. */
  stop() {
    if (this.intervalId_) {
      clearInterval(this.intervalId_);
      this.intervalId_ = null;
    }
  }
}

/**
 * Main UI Controller - orchestrates all UI components.
 */
class UIController {
  /** Creates a new UIController instance. */
  constructor() {
    /** @private @const {!PanelManager} */
    this.panelManager_ = new PanelManager();
    /** @private @const {!SearchController} */
    this.searchController_ = new SearchController();
    /** @private @const {!SettingsHandler} */
    this.settingsHandler_ = new SettingsHandler();
    /** @private @const {!TimeControlsHandler} */
    this.timeControlsHandler_ = new TimeControlsHandler();
    /** @private @const {!GameControlsHandler} */
    this.gameControlsHandler_ = new GameControlsHandler();
    /** @private @const {!TourButtonsHandler} */
    this.tourButtonsHandler_ = new TourButtonsHandler(this.panelManager_);
    /** @private @const {!InfoBadgeUpdater} */
    this.infoBadgeUpdater_ = new InfoBadgeUpdater();
  }

  /** Initializes the UI controller. */
  init() {
    // Wait for app to be available
    setTimeout(() => {
      if (!window.app) {
        console.error('SkyMapApp instance not found');
        return;
      }

      // Setup all event listeners
      this.panelManager_.setupEventListeners();
      this.searchController_.setupEventListeners();
      this.settingsHandler_.setupEventListeners();
      this.timeControlsHandler_.setupEventListeners();
      this.gameControlsHandler_.setupEventListeners();
      this.tourButtonsHandler_.setupEventListeners();

      // Start info badge updates
      this.infoBadgeUpdater_.start();

      // Expose panel functions globally for use by skymap.js
      window.openPanel = (panelId) => this.panelManager_.open(panelId);
      window.closeAllPanels = () => this.panelManager_.closeAll();

      console.log('UI Controller initialized');
    }, 1000);
  }
}

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
      .then((reg) => console.log('Service worker registered'))
      .catch((err) => console.warn('Service worker registration failed:', err));
}

// Initialize UI controller when the page loads
window.addEventListener('load', () => {
  const uiController = new UIController();
  uiController.init();
});

// Export for potential module use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    UIController,
    PanelManager,
    SearchController,
    SettingsHandler,
    TimeControlsHandler,
    GameControlsHandler,
    TourButtonsHandler,
    InfoBadgeUpdater,
    escapeHtml,
  };
}
