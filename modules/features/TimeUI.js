/**
 * @fileoverview Time simulation UI controls.
 * Handles time playback, speed controls, and date picker.
 */

import {globalEventBus, Events} from '../core/EventBus.js';
import {TIME} from '../core/Constants.js';
import {addMobileButtonListener, setTextIfChanged} from '../core/Utils.js';
import {createLogger} from '../core/Logger.js';
import {domCache} from '../ui/DOMCache.js';

const logger = createLogger('TimeUI');

/**
 * TimeUI handles time control buttons and display.
 */
export class TimeUI {
  /**
   * Creates a new TimeUI instance.
   * @param {!Object} dependencies - Required dependencies
   * @param {function(number): void=} dependencies.setTimeSpeed - Set time speed
   * @param {function(): void=} dependencies.togglePlayback - Toggle playback
   * @param {function(!Date): void=} dependencies.jumpToTime - Jump to specific time
   * @param {function(): ?Date=} dependencies.getSimulationTime - Get current sim time
   */
  constructor(dependencies) {
    /** @private @const */
    this.deps_ = dependencies;

    /** @private {boolean} */
    this.isPlaying_ = false;

    /** @private {number} */
    this.currentSpeed_ = 0;

    /** @private {!Array<!Object>} EventBus subscriptions for cleanup */
    this.subscriptions_ = [];

    /** @private {?number} Epoch second currently shown in #time-display */
    this.lastDisplayedSecond_ = null;
  }

  /**
   * Initialize the time UI.
   */
  initialize() {
    this.setupEventListeners_();
    this.setupEventBusListeners_();
  }

  /**
   * Set up DOM event listeners.
   * @private
   */
  setupEventListeners_() {
    // Rewind button
    const rewindBtn = domCache.get('time-rewind-btn');
    if (rewindBtn) {
      addMobileButtonListener(rewindBtn, () => {
        this.deps_.setTimeSpeed?.(-100);
      });
    }

    // Play/pause button
    const playBtn = domCache.get('time-play-btn');
    if (playBtn) {
      addMobileButtonListener(playBtn, () => {
        this.deps_.togglePlayback?.();
      });
    }

    // Forward button (cycles through speeds)
    const forwardBtn = domCache.get('time-forward-btn');
    if (forwardBtn) {
      addMobileButtonListener(forwardBtn, () => {
        const presets = TIME.SPEED_PRESETS;
        const currentIndex = presets.indexOf(this.currentSpeed_);
        const newSpeed = presets[(currentIndex + 1) % presets.length];
        this.deps_.setTimeSpeed?.(newSpeed);
      });
    }

    // Now button
    const nowBtn = domCache.get('time-now-btn');
    if (nowBtn) {
      addMobileButtonListener(nowBtn, () => {
        this.deps_.jumpToTime?.(new Date());
      });
    }

    // Time picker
    this.setupTimePicker_();

    // The time and magnitude chips open the full controls and close them.
    for (const id of ['time-chip', 'mag-chip']) {
      const chip = domCache.get(id);
      if (chip) addMobileButtonListener(chip, () => this.setControlsOpen(!this.areControlsOpen()));
    }
  }

  /**
   * @returns {boolean} Whether the full time and magnitude controls show
   */
  areControlsOpen() {
    return domCache.get('control-bar')?.classList.contains('is-open') ?? false;
  }

  /**
   * Show the full time and magnitude controls, or fold them back to chips.
   * @param {boolean} open
   */
  setControlsOpen(open) {
    domCache.get('control-bar')?.classList.toggle('is-open', open);
    for (const id of ['time-chip', 'mag-chip']) {
      domCache.get(id)?.setAttribute('aria-expanded', String(open));
    }
  }

  /**
   * Set up time picker functionality.
   * @private
   */
  setupTimePicker_() {
    const pickerBtn = domCache.get('time-picker-btn');
    const pickerPanel = domCache.get('time-picker-panel');
    const datePicker = domCache.get('date-picker');
    const timePicker = domCache.get('time-picker');
    const applyBtn = domCache.get('time-picker-apply');
    const cancelBtn = domCache.get('time-picker-cancel');

    if (!pickerBtn || !pickerPanel) return;

    // Toggle picker panel
    addMobileButtonListener(pickerBtn, () => {
      const isVisible = pickerPanel.classList.contains('visible');
      if (!isVisible) {
        this.prefillTimePicker_();
      }
      pickerPanel.classList.toggle('visible');
    });

    // Apply button
    if (applyBtn && datePicker && timePicker) {
      addMobileButtonListener(applyBtn, () => {
        const dateValue = datePicker.value;
        const timeValue = timePicker.value;
        if (dateValue && timeValue) {
          const [year, month, day] = dateValue.split('-').map(Number);
          const [hours, minutes] = timeValue.split(':').map(Number);

          if (!isNaN(year) && !isNaN(month) && !isNaN(day) &&
              !isNaN(hours) && !isNaN(minutes)) {
            const newDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
            if (!isNaN(newDate.getTime())) {
              this.deps_.jumpToTime?.(newDate);
            }
          }
        }
        pickerPanel.classList.remove('visible');
      });
    }

    // Cancel button
    if (cancelBtn) {
      addMobileButtonListener(cancelBtn, () => {
        pickerPanel.classList.remove('visible');
      });
    }

    // Close on backdrop click
    document.addEventListener('click', (e) => {
      if (!pickerPanel.classList.contains('visible')) return;
      if (!pickerPanel.contains(e.target) && !pickerBtn.contains(e.target)) {
        pickerPanel.classList.remove('visible');
      }
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && pickerPanel.classList.contains('visible')) {
        pickerPanel.classList.remove('visible');
        e.preventDefault();
      }
    });
  }

  /**
   * Prefill time picker with current simulation time.
   * @private
   */
  prefillTimePicker_() {
    const currentTime = this.deps_.getSimulationTime?.() || new Date();
    const datePicker = domCache.get('date-picker');
    const timePicker = domCache.get('time-picker');

    if (datePicker) {
      const year = currentTime.getFullYear();
      const month = String(currentTime.getMonth() + 1).padStart(2, '0');
      const day = String(currentTime.getDate()).padStart(2, '0');
      datePicker.value = `${year}-${month}-${day}`;
    }

    if (timePicker) {
      const hours = String(currentTime.getHours()).padStart(2, '0');
      const minutes = String(currentTime.getMinutes()).padStart(2, '0');
      timePicker.value = `${hours}:${minutes}`;
    }
  }

  /**
   * Set up EventBus listeners.
   * @private
   */
  setupEventBusListeners_() {
    this.subscriptions_.push(
      globalEventBus.on(Events.TIME_SPEED_CHANGED, (data) => {
        this.isPlaying_ = data.isPlaying;
        this.currentSpeed_ = data.speed || 0;
        this.updatePlayButton_();
        if (data.speedDisplay) {
          setTextIfChanged(domCache.get('time-speed-display'), data.speedDisplay);
        }
      }),

      globalEventBus.on(Events.TIME_CHANGED, (data) => {
        this.updateTimeDisplay_(data.time);
      }),

      globalEventBus.on(Events.TIME_TICK, (data) => {
        this.updateTimeDisplay_(data.time);
      })
    );
  }

  /**
   * Update play button appearance.
   * @private
   */
  updatePlayButton_() {
    const playBtn = domCache.get('time-play-btn');
    if (playBtn) {
      playBtn.classList.toggle('playing', this.isPlaying_);
    }
  }

  /**
   * Update time display. The only writer of #time-display; TIME_TICK fires
   * every frame during playback, so skip the locale formatting and the DOM
   * write when the displayed second has not changed.
   * @param {!Date} time - Current time
   * @private
   */
  updateTimeDisplay_(time) {
    const second = Math.floor(time.getTime() / 1000);
    if (second === this.lastDisplayedSecond_) return;
    this.lastDisplayedSecond_ = second;
    setTextIfChanged(domCache.get('time-display'), time.toLocaleString());
  }

  /**
   * Check if time is playing.
   * @returns {boolean} True if playing
   */
  isPlaying() {
    return this.isPlaying_;
  }

  /**
   * Get current speed.
   * @returns {number} Current speed multiplier
   */
  getCurrentSpeed() {
    return this.currentSpeed_;
  }

  /**
   * Dispose of resources and clean up subscriptions.
   */
  dispose() {
    this.subscriptions_.forEach((sub) => sub.unsubscribe());
    this.subscriptions_ = [];
  }
}

/**
 * Singleton time UI instance.
 * @type {?TimeUI}
 */
export let timeUI = null;

/**
 * Reset the singleton instance (for testing only).
 */
export function resetTimeUI() {
  timeUI = null;
}

/**
 * Initialize the time UI singleton.
 * Returns existing instance if already initialized (prevents duplicate event handlers).
 * @param {!Object} dependencies - Required dependencies
 * @returns {!TimeUI} Initialized instance
 */
export function initializeTimeUI(dependencies) {
  if (timeUI) {
    logger.warn('TimeUI already initialized, returning existing instance');
    return timeUI;
  }
  timeUI = new TimeUI(dependencies);
  timeUI.initialize();
  return timeUI;
}
