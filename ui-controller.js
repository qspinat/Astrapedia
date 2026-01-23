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
 * Formspree endpoint for bug reports.
 * @const {string}
 */
const FORMSPREE_ENDPOINT = 'https://formspree.io/f/xaqeoelv';

/**
 * Validate email format.
 * @param {string} email - Email address to validate
 * @returns {boolean} True if email is valid or empty
 */
const isValidEmail = (email) => {
  if (!email) return true; // Empty is valid (optional field)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
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
      'bug-report-panel',
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

    // Telescope mode quick toggle
    const telescopeQuickToggle = document.getElementById('telescope-quick-toggle');
    if (telescopeQuickToggle) {
      telescopeQuickToggle.addEventListener('click', () => {
        // Toggle the telescope mode setting
        const telescopeToggle = document.getElementById('telescope-mode-toggle');
        if (telescopeToggle) {
          telescopeToggle.checked = !telescopeToggle.checked;
          // Trigger change event to update the app
          telescopeToggle.dispatchEvent(new Event('change'));
        }
        // Update quick toggle button state
        telescopeQuickToggle.classList.toggle('active', telescopeToggle?.checked);
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

    // Bug report button
    const bugReportBtn = document.getElementById('bug-report-btn');
    if (bugReportBtn) {
      bugReportBtn.addEventListener('click', () => {
        this.open('bug-report-panel');
      });
    }

    // Close buttons for panels
    this.setupCloseButton_('settings-close-btn', () => this.closeAll());
    this.setupCloseButton_('visible-tonight-close-btn', () => this.closeAll());
    this.setupCloseButton_('events-close-btn', () => this.closeAll());
    this.setupCloseButton_('bug-report-close-btn', () => this.closeAll());

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
        window.app?.setEquatorLineVisible?.(e.target.checked);
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
          window.app.requestRender?.();
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
          // Activate rendering when time starts
          window.app.requestRender?.();
        }
      });
    }

    const timeForwardBtn = document.getElementById('time-forward-btn');
    if (timeForwardBtn) {
      timeForwardBtn.addEventListener('click', () => {
        if (window.app && window.app.setTimeSpeed) {
          // Cycle through speeds: 100x → 1000x → 1x (and deactivate)
          const currentSpeed = window.app.timeSpeed || 0;
          let newSpeed;
          if (currentSpeed === 100) {
            newSpeed = 1000;
          } else if (currentSpeed === 1000) {
            newSpeed = 1;
            window.app.isTimePlaying = true;
          } else {
            newSpeed = 100;
            window.app.isTimePlaying = true;
          }
          window.app.setTimeSpeed(newSpeed);
          window.app.requestRender?.();
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
          // Pre-fill with current simulation time in local timezone
          const currentTime = window.app?.simulationTime || new Date();
          if (datePicker) {
            // Format as YYYY-MM-DD in local timezone
            const year = currentTime.getFullYear();
            const month = String(currentTime.getMonth() + 1).padStart(2, '0');
            const day = String(currentTime.getDate()).padStart(2, '0');
            datePicker.value = `${year}-${month}-${day}`;
          }
          if (timePicker) {
            // Format as HH:MM in local timezone
            const hours = String(currentTime.getHours()).padStart(2, '0');
            const minutes = String(currentTime.getMinutes()).padStart(2, '0');
            timePicker.value = `${hours}:${minutes}`;
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
          // Parse date and time components explicitly in local timezone
          const [year, month, day] = dateValue.split('-').map(Number);
          const [hours, minutes] = timeValue.split(':').map(Number);

          // Validate parsed values
          if (isNaN(year) || isNaN(month) || isNaN(day) ||
              isNaN(hours) || isNaN(minutes)) {
            timePickerPanel?.classList.remove('visible');
            return;
          }

          // Create date in local timezone (month is 0-indexed)
          const newDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
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

    // Close time picker on backdrop click (clicking outside the panel)
    if (timePickerPanel) {
      document.addEventListener('click', (e) => {
        if (!timePickerPanel.classList.contains('visible')) return;

        // Check if click is outside both the panel and the trigger button
        const isClickInsidePanel = timePickerPanel.contains(e.target);
        const isClickOnButton = timePickerBtn?.contains(e.target);

        if (!isClickInsidePanel && !isClickOnButton) {
          timePickerPanel.classList.remove('visible');
        }
      });

      // Close time picker on Escape key
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && timePickerPanel.classList.contains('visible')) {
          timePickerPanel.classList.remove('visible');
          e.preventDefault();
        }
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
 * Bug Report Handler - handles bug report form submission to Formspree.
 */
class BugReportHandler {
  /**
   * Creates a new BugReportHandler instance.
   * @param {!PanelManager} panelManager - The panel manager instance
   */
  constructor(panelManager) {
    /** @private @const {!PanelManager} */
    this.panelManager_ = panelManager;
    /** @private {boolean} */
    this.submitting_ = false;
  }

  /** Sets up event listeners for bug report form. */
  setupEventListeners() {
    const submitBtn = document.getElementById('bug-report-submit');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => this.handleSubmit_());
    }
  }

  /**
   * Validates the bug report form.
   * @returns {boolean} True if form is valid
   * @private
   */
  validateForm_() {
    const description = document.getElementById('bug-description');
    if (!description || !description.value.trim()) {
      this.showNotification_('Please provide a description of the bug.');
      description?.focus();
      return false;
    }
    if (description.value.trim().length < 10) {
      this.showNotification_('Please provide a more detailed description.');
      description?.focus();
      return false;
    }

    // Validate email if provided
    const emailInput = document.getElementById('bug-email');
    const email = emailInput?.value.trim() || '';
    if (email && !isValidEmail(email)) {
      this.showNotification_('Please enter a valid email address.');
      emailInput?.focus();
      return false;
    }

    return true;
  }

  /**
   * Collects diagnostic information.
   * @returns {!Object} Diagnostic info
   * @private
   */
  collectDiagnosticInfo_() {
    return {
      userAgent: navigator.userAgent,
      screenSize: `${window.innerWidth}x${window.innerHeight}`,
      devicePixelRatio: window.devicePixelRatio || 1,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      language: navigator.language || 'unknown',
    };
  }

  /**
   * Handles form submission.
   * @private
   */
  async handleSubmit_() {
    if (this.submitting_) return;
    if (!this.validateForm_()) return;

    const description = document.getElementById('bug-description')?.value.trim() || '';
    const category = document.getElementById('bug-category')?.value || 'other';
    const email = document.getElementById('bug-email')?.value.trim() || '';

    const submitBtn = document.getElementById('bug-report-submit');
    this.submitting_ = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';
    }

    try {
      const formData = {
        _subject: `Bug Report: ${category}`,
        message: description,
        category,
        ...this.collectDiagnosticInfo_(),
      };
      // Only include email if provided (Formspree rejects invalid emails)
      if (email) {
        formData.email = email;
        formData._replyto = email;
      }

      const response = await fetch(FORMSPREE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        this.showNotification_('Bug report submitted. Thank you!');
        this.clearForm_();
        this.panelManager_.closeAll();
      } else {
        this.showNotification_('Failed to submit. Please try again.');
      }
    } catch (error) {
      console.error('Bug report submission failed:', error);
      this.showNotification_('Network error. Please try again.');
    } finally {
      this.submitting_ = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Report';
      }
    }
  }

  /**
   * Clears the form fields.
   * @private
   */
  clearForm_() {
    const description = document.getElementById('bug-description');
    const category = document.getElementById('bug-category');
    const email = document.getElementById('bug-email');
    if (description) description.value = '';
    if (category) category.selectedIndex = 0;
    if (email) email.value = '';
  }

  /**
   * Shows a notification message.
   * @param {string} message - Message to display
   * @private
   */
  showNotification_(message) {
    let notification = document.getElementById('notification-panel');
    if (!notification) {
      notification = document.createElement('div');
      notification.id = 'notification-panel';
      notification.className = 'notification-panel';
      document.body.appendChild(notification);
    }
    notification.textContent = message;
    notification.classList.add('visible');
    setTimeout(() => notification.classList.remove('visible'), 3000);
  }
}

/**
 * Sky Conditions Handler - handles light pollution and calculates naked eye limiting magnitude.
 * Based on Bortle scale values and moon phase effects.
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
const MOON_PHASE_THRESHOLDS = {
  NEW_MOON_END: 0.0625,        // 1/16 - end of new moon
  WAXING_CRESCENT_END: 0.1875, // 3/16 - end of waxing crescent
  FIRST_QUARTER_END: 0.3125,   // 5/16 - end of first quarter
  WAXING_GIBBOUS_END: 0.4375,  // 7/16 - end of waxing gibbous
  FULL_MOON_END: 0.5625,       // 9/16 - end of full moon
  WANING_GIBBOUS_END: 0.6875,  // 11/16 - end of waning gibbous
  LAST_QUARTER_END: 0.8125,    // 13/16 - end of last quarter
  WANING_CRESCENT_END: 0.9375, // 15/16 - end of waning crescent
};

class SkyConditionsHandler {
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
   * Uses the actual rendered moon position from app.planets for consistency.
   * @private
   */
  updateMoonData_() {
    if (!window.app) return;

    const app = window.app;
    const simTime = app.simulationTime || new Date();

    // Get moon data from the app's planets array (same data used for rendering)
    const moonData = app.planets?.find((p) => p.name === 'Moon');

    if (moonData) {
      // Use the phase from the rendered moon
      this.moonPhase_ = moonData.phase || 0;

      // Calculate altitude using the app's method with actual moon RA/Dec
      const lat = app.observerLocation?.lat || 0;
      const lon = app.observerLocation?.lon || 0;
      const lst = app.calculateLST(simTime, lon);
      this.moonAltitude_ = app.calculateAltitude(moonData.ra, moonData.dec, lat, lst);
    } else {
      // Fallback if moon data not available yet
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
    const phaseInCycle = ((daysSinceNew % lunarCycle) + lunarCycle) % lunarCycle;
    this.moonPhase_ = phaseInCycle / lunarCycle;

    // Estimate moon altitude based on phase and time of day
    // The moon's transit time shifts ~50 min later each day
    // New moon transits at noon, full moon at midnight
    const hour = date.getHours() + date.getMinutes() / 60;

    // Moon transit hour: new moon (phase=0) transits at 12:00,
    // full moon (phase=0.5) transits at 0:00 (midnight)
    const transitHour = (12 + this.moonPhase_ * 24) % 24;

    // Hours from transit (moon is highest at transit)
    let hoursFromTransit = hour - transitHour;
    if (hoursFromTransit > 12) hoursFromTransit -= 24;
    if (hoursFromTransit < -12) hoursFromTransit += 24;

    // Approximate altitude: max ~50° at transit
    // Use cosine curve: altitude = maxAlt * cos(hoursFromTransit * π/12)
    // This gives altitude = 0 at ±6 hours from transit (moon above horizon ~12 hours)
    const maxAltitude = 50;
    if (Math.abs(hoursFromTransit) > 6) {
      this.moonAltitude_ = -10; // Moon below horizon
    } else {
      this.moonAltitude_ = maxAltitude * Math.cos(hoursFromTransit * Math.PI / 12);
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
function validatePresetName(name) {
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
 * Telescope Settings Handler - handles telescope simulation controls.
 */
class TelescopeSettingsHandler {
  /**
   * Creates a new TelescopeSettingsHandler instance.
   * @param {?SkyConditionsHandler} skyConditionsHandler - Sky conditions handler for NELM
   */
  constructor(skyConditionsHandler = null) {
    /** @private {?SkyConditionsHandler} */
    this.skyConditionsHandler_ = skyConditionsHandler;
    /** @private {!Object} */
    this.telescope_ = {
      diameter: 200,
      focalLength: 1000,
    };
    /** @private {!Object} */
    this.eyepiece_ = {
      focalLength: 25,
      apparentFov: 52,
    };
    /** @private {?Object} */
    this.computedProperties_ = null;
    /** @private {boolean} */
    this.isTelescopeModeActive_ = false;
    /** @private {?number} */
    this.previousFov_ = null;
    /** @private {?number} */
    this.previousMagnitude_ = null;
    /** @private {!Object<string, !Object>} */
    this.presets_ = {};

    this.loadFromStorage_();
  }

  /**
   * Compute optical properties.
   * @private
   */
  computeProperties_() {
    const {diameter, focalLength} = this.telescope_;
    const {focalLength: eyepieceFl, apparentFov} = this.eyepiece_;

    const magnification = focalLength / eyepieceFl;
    const maxUsefulMagnification = 2 * diameter;
    const exitPupil = diameter / magnification;
    const realFieldOfView = apparentFov / magnification;

    // Theoretical limiting magnitude (perfect dark sky conditions)
    // Formula: 2.7 + 5 × log10(diameter_mm)
    const theoreticalLimitingMag = 2.7 + 5 * Math.log10(diameter);

    // Telescope gain over naked eye
    // Gain = 5 × log10(aperture / pupil), where pupil ≈ 7mm dark-adapted
    const telescopeGain = 5 * Math.log10(diameter / 7);

    // Actual limiting magnitude based on current sky conditions
    // = naked eye limit + telescope gain, capped at theoretical max
    let limitingMagnitude = theoreticalLimitingMag;
    if (this.skyConditionsHandler_) {
      const nakedEyeLimit = this.skyConditionsHandler_.getNakedEyeLimit();
      const actualLimit = nakedEyeLimit + telescopeGain;
      limitingMagnitude = Math.min(theoreticalLimitingMag, actualLimit);
    }

    const isOverMagnified = magnification > maxUsefulMagnification;

    this.computedProperties_ = {
      magnification,
      maxUsefulMagnification,
      exitPupil,
      realFieldOfView,
      limitingMagnitude,
      theoreticalLimitingMag,
      isOverMagnified,
    };

    return this.computedProperties_;
  }

  /**
   * Update the computed values display.
   * @private
   */
  updateComputedDisplay_() {
    const props = this.computedProperties_;
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

    // Show limiting magnitude with theoretical max if sky-limited
    if (limitingMagEl) {
      const isLimited = props.theoreticalLimitingMag &&
          props.limitingMagnitude < props.theoreticalLimitingMag - 0.1;
      if (isLimited) {
        limitingMagEl.innerHTML = `${props.limitingMagnitude.toFixed(1)} <span style="font-size:10px;color:var(--text-secondary)">(max ${props.theoreticalLimitingMag.toFixed(1)})</span>`;
      } else {
        limitingMagEl.textContent = props.limitingMagnitude.toFixed(1);
      }
    }

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
   * Populate preset dropdown.
   * @private
   */
  populatePresets_() {
    const select = document.getElementById('telescope-preset-select');
    if (!select) return;

    while (select.options.length > 1) {
      select.remove(1);
    }

    Object.keys(this.presets_).forEach((name) => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });
  }

  /**
   * Load current values into inputs.
   * @private
   */
  loadCurrentValues_() {
    const diameterInput = document.getElementById('telescope-diameter');
    const focalLengthInput = document.getElementById('telescope-focal-length');
    const eyepieceFLInput = document.getElementById('eyepiece-focal-length');
    const eyepieceAFOVInput = document.getElementById('eyepiece-afov');

    if (diameterInput) diameterInput.value = this.telescope_.diameter;
    if (focalLengthInput) focalLengthInput.value = this.telescope_.focalLength;
    if (eyepieceFLInput) eyepieceFLInput.value = this.eyepiece_.focalLength;
    if (eyepieceAFOVInput) eyepieceAFOVInput.value = this.eyepiece_.apparentFov;
  }

  /**
   * Save to localStorage.
   * @private
   */
  saveToStorage_() {
    try {
      const data = {
        currentConfig: {
          telescope: this.telescope_,
          eyepiece: this.eyepiece_,
        },
        presets: this.presets_,
      };
      // Storage key matches TELESCOPE.STORAGE_KEY in modules/core/Constants.js
      localStorage.setItem('skymap_telescope_settings', JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to save telescope settings:', e);
    }
  }

  /**
   * Load from localStorage.
   * @private
   */
  loadFromStorage_() {
    try {
      const stored = localStorage.getItem('skymap_telescope_settings');
      if (!stored) return;

      const data = JSON.parse(stored);
      if (data.currentConfig) {
        if (data.currentConfig.telescope) {
          this.telescope_ = {...this.telescope_, ...data.currentConfig.telescope};
        }
        if (data.currentConfig.eyepiece) {
          this.eyepiece_ = {...this.eyepiece_, ...data.currentConfig.eyepiece};
        }
      }
      if (data.presets) {
        this.presets_ = data.presets;
      }
    } catch (e) {
      console.warn('Failed to load telescope settings:', e);
    }
  }

  /**
   * Apply current telescope settings to the view if telescope mode is active.
   * @private
   */
  applyTelescopeSettingsIfActive_() {
    if (!this.isTelescopeModeActive_ || !this.computedProperties_) return;

    const props = this.computedProperties_;
    const fov = Math.max(props.realFieldOfView, 0.1);

    if (window.app) {
      window.app.targetFov = fov;
      window.app.setMagnitudeLimit?.(props.limitingMagnitude);

      // Update magnitude slider UI
      const magSlider = document.getElementById('magnitude-slider');
      const magValue = document.getElementById('mag-value');
      if (magSlider) magSlider.value = props.limitingMagnitude;
      if (magValue) magValue.textContent = props.limitingMagnitude.toFixed(1);

      // Update reticle
      this.updateReticleAfov_();
    }
  }

  /**
   * Update reticle to highlight the circle matching the current apparent FOV.
   * @private
   */
  updateReticleAfov_() {
    const reticle = document.getElementById('telescope-reticle');
    if (!reticle) return;

    const afov = this.eyepiece_.apparentFov || 52;

    // Find the closest AFOV circle to highlight
    const afovValues = [40, 52, 68, 82, 100, 120];
    let closestAfov = afovValues[0];
    let minDiff = Math.abs(afov - closestAfov);

    for (const val of afovValues) {
      const diff = Math.abs(afov - val);
      if (diff < minDiff) {
        minDiff = diff;
        closestAfov = val;
      }
    }

    // Update circle and label highlighting
    const circles = reticle.querySelectorAll('.reticle-afov');
    const labels = reticle.querySelectorAll('.reticle-label');

    circles.forEach((circle) => {
      const circleAfov = parseInt(circle.getAttribute('data-afov'), 10);
      circle.classList.toggle('active', circleAfov === closestAfov);
    });

    labels.forEach((label) => {
      const labelAfov = parseInt(label.getAttribute('data-afov'), 10);
      label.classList.toggle('active', labelAfov === closestAfov);
    });
  }

  /**
   * Activate telescope mode.
   */
  activateTelescopeMode() {
    if (this.isTelescopeModeActive_) return;

    // Store previous settings
    if (window.app) {
      this.previousFov_ = window.app.targetFov || 60;
      this.previousMagnitude_ = window.app.currentMagnitude || 8.0;
    }

    const props = this.computedProperties_;
    if (!props) return;

    // Apply telescope settings
    const fov = Math.max(props.realFieldOfView, 0.1);
    if (window.app) {
      window.app.targetFov = fov;
      window.app.setMagnitudeLimit?.(props.limitingMagnitude);

      // Update magnitude slider UI
      const magSlider = document.getElementById('magnitude-slider');
      const magValue = document.getElementById('mag-value');
      if (magSlider) {
        magSlider.value = props.limitingMagnitude;
        magSlider.disabled = true;
      }
      if (magValue) magValue.textContent = props.limitingMagnitude.toFixed(1);

      // Block zooming
      window.app.telescopeModeActive = true;
    }

    this.isTelescopeModeActive_ = true;

    // Show reticle and highlight the appropriate AFOV circle
    const reticle = document.getElementById('telescope-reticle');
    if (reticle) reticle.classList.add('visible');
    this.updateReticleAfov_();

    // Add vignette effect
    document.body.classList.add('telescope-mode');
  }

  /**
   * Deactivate telescope mode.
   */
  deactivateTelescopeMode() {
    if (!this.isTelescopeModeActive_) return;

    // Restore previous settings
    if (window.app) {
      if (this.previousFov_ !== null) {
        window.app.targetFov = this.previousFov_;
      }
      if (this.previousMagnitude_ !== null) {
        window.app.setMagnitudeLimit?.(this.previousMagnitude_);

        // Update magnitude slider UI
        const magSlider = document.getElementById('magnitude-slider');
        const magValue = document.getElementById('mag-value');
        if (magSlider) {
          magSlider.value = this.previousMagnitude_;
          magSlider.disabled = false;
        }
        if (magValue) magValue.textContent = this.previousMagnitude_.toFixed(1);
      }

      // Re-enable zooming
      window.app.telescopeModeActive = false;
    }

    this.isTelescopeModeActive_ = false;
    this.previousFov_ = null;
    this.previousMagnitude_ = null;

    // Hide reticle
    const reticle = document.getElementById('telescope-reticle');
    if (reticle) reticle.classList.remove('visible');

    // Remove vignette effect
    document.body.classList.remove('telescope-mode');
  }

  /** Sets up event listeners for telescope controls. */
  setupEventListeners() {
    // Initialize computed properties and display
    this.computeProperties_();
    this.loadCurrentValues_();
    this.populatePresets_();
    this.updateComputedDisplay_();

    // Listen for sky condition changes to update limiting magnitude
    if (this.skyConditionsHandler_) {
      this.skyConditionsHandler_.onChange(() => {
        this.computeProperties_();
        this.updateComputedDisplay_();
      });
    }

    // Telescope mode toggle
    const modeToggle = document.getElementById('telescope-mode-toggle');
    if (modeToggle) {
      modeToggle.addEventListener('change', () => {
        if (modeToggle.checked) {
          this.activateTelescopeMode();
        } else {
          this.deactivateTelescopeMode();
        }
      });
    }

    // Telescope diameter
    const diameterInput = document.getElementById('telescope-diameter');
    if (diameterInput) {
      diameterInput.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        if (!isNaN(value) && value > 0) {
          this.telescope_.diameter = value;
          this.computeProperties_();
          this.updateComputedDisplay_();
          this.applyTelescopeSettingsIfActive_();
          this.saveToStorage_();
        }
      });
    }

    // Telescope focal length
    const focalLengthInput = document.getElementById('telescope-focal-length');
    if (focalLengthInput) {
      focalLengthInput.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        if (!isNaN(value) && value > 0) {
          this.telescope_.focalLength = value;
          this.computeProperties_();
          this.updateComputedDisplay_();
          this.applyTelescopeSettingsIfActive_();
          this.saveToStorage_();
        }
      });
    }

    // Eyepiece focal length
    const eyepieceFLInput = document.getElementById('eyepiece-focal-length');
    if (eyepieceFLInput) {
      eyepieceFLInput.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        if (!isNaN(value) && value > 0) {
          this.eyepiece_.focalLength = value;
          this.computeProperties_();
          this.updateComputedDisplay_();
          this.applyTelescopeSettingsIfActive_();
          this.saveToStorage_();
        }
      });
    }

    // Eyepiece apparent FOV
    const eyepieceAFOVInput = document.getElementById('eyepiece-afov');
    if (eyepieceAFOVInput) {
      eyepieceAFOVInput.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        if (!isNaN(value) && value > 0) {
          this.eyepiece_.apparentFov = value;
          this.computeProperties_();
          this.updateComputedDisplay_();
          this.applyTelescopeSettingsIfActive_();
          this.saveToStorage_();
        }
      });
    }

    // Preset selector
    const presetSelect = document.getElementById('telescope-preset-select');
    if (presetSelect) {
      presetSelect.addEventListener('change', (e) => {
        const name = e.target.value;
        if (name && this.presets_[name]) {
          const preset = this.presets_[name];
          this.telescope_ = {...preset.telescope};
          this.eyepiece_ = {...preset.eyepiece};
          this.loadCurrentValues_();
          this.computeProperties_();
          this.updateComputedDisplay_();
          this.saveToStorage_();
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
        if (this.presets_[sanitizedName]) {
          if (!confirm(`Preset "${sanitizedName}" already exists. Overwrite?`)) {
            return;
          }
        }

        this.presets_[sanitizedName] = {
          telescope: {...this.telescope_},
          eyepiece: {...this.eyepiece_},
        };
        this.saveToStorage_();
        this.populatePresets_();
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
        if (name && this.presets_[name] && confirm(`Delete preset "${name}"?`)) {
          delete this.presets_[name];
          this.saveToStorage_();
          this.populatePresets_();
        }
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
    /** @private @const {!BugReportHandler} */
    this.bugReportHandler_ = new BugReportHandler(this.panelManager_);
    /** @private @const {!SkyConditionsHandler} */
    this.skyConditionsHandler_ = new SkyConditionsHandler();
    /** @private @const {!TelescopeSettingsHandler} */
    this.telescopeSettingsHandler_ = new TelescopeSettingsHandler(this.skyConditionsHandler_);
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
      this.bugReportHandler_.setupEventListeners();
      this.skyConditionsHandler_.setupEventListeners();
      this.telescopeSettingsHandler_.setupEventListeners();

      // Start info badge updates
      this.infoBadgeUpdater_.start();

      // Expose panel functions globally for use by skymap.js
      window.openPanel = (panelId) => this.panelManager_.open(panelId);
      window.closeAllPanels = () => this.panelManager_.closeAll();

      console.log('UI Controller initialized');
    }, 1000);
  }

  /**
   * Disposes of the UI controller and cleans up resources.
   * Should be called when the controller is no longer needed.
   */
  dispose() {
    // Stop periodic intervals
    this.skyConditionsHandler_.dispose();
    this.infoBadgeUpdater_.stop();

    // Remove global functions
    delete window.openPanel;
    delete window.closeAllPanels;

    console.log('UI Controller disposed');
  }
}

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
      .then((reg) => console.log('Service worker registered'))
      .catch((err) => console.warn('Service worker registration failed:', err));
}

// Initialize UI controller when the page loads
let uiControllerInstance = null;

window.addEventListener('load', () => {
  uiControllerInstance = new UIController();
  uiControllerInstance.init();
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  if (uiControllerInstance) {
    uiControllerInstance.dispose();
    uiControllerInstance = null;
  }
});

// Export for testing (CommonJS for Node.js/Jest)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    UIController,
    PanelManager,
    SearchController,
    SettingsHandler,
    TimeControlsHandler,
    GameControlsHandler,
    TourButtonsHandler,
    SkyConditionsHandler,
    TelescopeSettingsHandler,
    InfoBadgeUpdater,
    escapeHtml,
    MOON_PHASE_THRESHOLDS,
  };
}
