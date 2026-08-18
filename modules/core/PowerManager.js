/**
 * @fileoverview Power management for render-on-demand.
 * Handles page visibility, idle detection, and animation loop control.
 */

import {POWER_SAVING} from './Constants.js';
import {createLogger} from './Logger.js';

const logger = createLogger('PowerManager');

/**
 * PowerManager handles power-saving features for the application.
 * Uses render-on-demand pattern to minimize battery usage.
 */
export class PowerManager {
  /**
   * Creates a new PowerManager instance.
   * @param {!Object} dependencies - Required dependencies
   * @param {function(): void} dependencies.onStartAnimating - Called when animation should start
   * @param {function(): void} dependencies.onStopAnimating - Called when animation should stop
   * @param {function(): boolean} dependencies.shouldKeepAnimating - Check if animation should continue
   */
  constructor(dependencies) {
    /** @private @const */
    this.onStartAnimating_ = dependencies.onStartAnimating;

    /** @private @const */
    this.onStopAnimating_ = dependencies.onStopAnimating;

    /** @private @const */
    this.shouldKeepAnimating_ = dependencies.shouldKeepAnimating || (() => false);

    /** @private {boolean} */
    this.isPageVisible_ = true;

    /** @private {boolean} */
    this.isAnimating_ = false;

    /** @private {?number} */
    this.idleTimeout_ = null;

    /** @private {number} */
    this.lastInteractionTime_ = 0;

    /** @private {number} - Idle timeout in milliseconds */
    this.idleTimeoutMs_ = POWER_SAVING.IDLE_THRESHOLD;

    /** @private {?function(): void} */
    this.onVisibilityChange_ = null;

    /** @private {?function(): void} */
    this.onFocus_ = null;
  }

  /**
   * Initialize power saving listeners.
   */
  initialize() {
    // Page Visibility API - pause when tab/app is hidden
    this.onVisibilityChange_ = () => {
      this.isPageVisible_ = !document.hidden;
      if (this.isPageVisible_) {
        logger.info('Page visible - resuming rendering');
        this.startAnimating();
      } else {
        logger.info('Page hidden - pausing rendering');
        this.stopAnimating();
      }
    };
    document.addEventListener('visibilitychange', this.onVisibilityChange_);

    // Handle window focus for better mobile support
    this.onFocus_ = () => {
      if (this.isPageVisible_ && !this.isAnimating_) {
        this.startAnimating();
      }
    };
    window.addEventListener('focus', this.onFocus_);
  }

  /**
   * Check if the page is currently visible.
   * @returns {boolean} True if page is visible
   */
  isPageVisible() {
    return this.isPageVisible_;
  }

  /**
   * Check if animation is currently running.
   * @returns {boolean} True if animating
   */
  isAnimating() {
    return this.isAnimating_;
  }

  /**
   * Request a render - call this when something changes.
   * Restarts animation if stopped and page is visible.
   */
  requestRender() {
    this.lastInteractionTime_ = performance.now();

    // Restart animation if stopped
    if (!this.isAnimating_ && this.isPageVisible_) {
      this.startAnimating();
    }

    // Reset idle timeout
    this.resetIdleTimeout();
  }

  /**
   * Reset the idle timeout that stops animation.
   */
  resetIdleTimeout() {
    if (this.idleTimeout_) {
      clearTimeout(this.idleTimeout_);
    }

    // Stop animation after idle period (if shouldKeepAnimating returns false)
    this.idleTimeout_ = setTimeout(() => {
      if (!this.shouldKeepAnimating_()) {
        this.stopAnimating();
      }
    }, this.idleTimeoutMs_);
  }

  /**
   * Start the animation loop.
   */
  startAnimating() {
    if (this.isAnimating_) return;

    this.isAnimating_ = true;
    this.resetIdleTimeout();
    this.onStartAnimating_?.();
  }

  /**
   * Stop the animation loop (power saving).
   */
  stopAnimating() {
    this.isAnimating_ = false;
    if (this.idleTimeout_) {
      clearTimeout(this.idleTimeout_);
      this.idleTimeout_ = null;
    }
    this.onStopAnimating_?.();
  }

  /**
   * Get time since last interaction.
   * @returns {number} Time in milliseconds
   */
  getTimeSinceInteraction() {
    return performance.now() - this.lastInteractionTime_;
  }

  /**
   * Dispose of resources.
   */
  dispose() {
    if (this.idleTimeout_) {
      clearTimeout(this.idleTimeout_);
      this.idleTimeout_ = null;
    }
    if (this.onVisibilityChange_) {
      document.removeEventListener('visibilitychange', this.onVisibilityChange_);
      this.onVisibilityChange_ = null;
    }
    if (this.onFocus_) {
      window.removeEventListener('focus', this.onFocus_);
      this.onFocus_ = null;
    }
  }
}
