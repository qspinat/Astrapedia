/**
 * @fileoverview Time simulation UI controls.
 * Handles time playback, speed controls, and date picker.
 */

import {globalEventBus, Events} from '../core/EventBus.js';
import {TIME} from '../core/Constants.js';

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
    const rewindBtn = document.getElementById('time-rewind-btn');
    if (rewindBtn) {
      rewindBtn.addEventListener('click', () => {
        this.deps_.setTimeSpeed?.(-100);
      });
    }

    // Play/pause button
    const playBtn = document.getElementById('time-play-btn');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        this.deps_.togglePlayback?.();
      });
    }

    // Forward button (cycles through speeds)
    const forwardBtn = document.getElementById('time-forward-btn');
    if (forwardBtn) {
      forwardBtn.addEventListener('click', () => {
        const presets = TIME.SPEED_PRESETS;
        const currentIndex = presets.indexOf(this.currentSpeed_);
        const newSpeed = presets[(currentIndex + 1) % presets.length];
        this.deps_.setTimeSpeed?.(newSpeed);
      });
    }

    // Now button
    const nowBtn = document.getElementById('time-now-btn');
    if (nowBtn) {
      nowBtn.addEventListener('click', () => {
        this.deps_.jumpToTime?.(new Date());
      });
    }

    // Time picker
    this.setupTimePicker_();
  }

  /**
   * Set up time picker functionality.
   * @private
   */
  setupTimePicker_() {
    const pickerBtn = document.getElementById('time-picker-btn');
    const pickerPanel = document.getElementById('time-picker-panel');
    const datePicker = document.getElementById('date-picker');
    const timePicker = document.getElementById('time-picker');
    const applyBtn = document.getElementById('time-picker-apply');
    const cancelBtn = document.getElementById('time-picker-cancel');

    if (!pickerBtn || !pickerPanel) return;

    // Toggle picker panel
    pickerBtn.addEventListener('click', () => {
      const isVisible = pickerPanel.classList.contains('visible');
      if (!isVisible) {
        this.prefillTimePicker_();
      }
      pickerPanel.classList.toggle('visible');
    });

    // Apply button
    if (applyBtn && datePicker && timePicker) {
      applyBtn.addEventListener('click', () => {
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
      cancelBtn.addEventListener('click', () => {
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
    const datePicker = document.getElementById('date-picker');
    const timePicker = document.getElementById('time-picker');

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
    globalEventBus.on(Events.TIME_SPEED_CHANGED, (data) => {
      this.isPlaying_ = data.isPlaying;
      this.currentSpeed_ = data.speed || 0;
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
   * Update play button appearance.
   * @private
   */
  updatePlayButton_() {
    const playBtn = document.getElementById('time-play-btn');
    if (playBtn) {
      playBtn.classList.toggle('playing', this.isPlaying_);
    }
  }

  /**
   * Update time display.
   * @param {!Date} time - Current time
   * @private
   */
  updateTimeDisplay_(time) {
    const timeDisplay = document.getElementById('time-display');
    if (timeDisplay) {
      timeDisplay.textContent = time.toLocaleString();
    }
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
    console.warn('TimeUI already initialized, returning existing instance');
    return timeUI;
  }
  timeUI = new TimeUI(dependencies);
  timeUI.initialize();
  return timeUI;
}
