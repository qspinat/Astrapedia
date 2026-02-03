/**
 * @fileoverview Power management for render-on-demand.
 * Handles page visibility, idle detection, and animation loop control.
 */

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
    this.needsRender_ = true;

    /** @private {boolean} */
    this.isAnimating_ = false;

    /** @private {?number} */
    this.idleTimeout_ = null;

    /** @private {number} */
    this.lastInteractionTime_ = 0;

    /** @private {number} - Idle timeout in milliseconds */
    this.idleTimeoutMs_ = 3000;
  }

  /**
   * Initialize power saving listeners.
   */
  initialize() {
    // Page Visibility API - pause when tab/app is hidden
    document.addEventListener('visibilitychange', () => {
      this.isPageVisible_ = !document.hidden;
      if (this.isPageVisible_) {
        console.log('Page visible - resuming rendering');
        this.startAnimating();
      } else {
        console.log('Page hidden - pausing rendering');
        this.stopAnimating();
      }
    });

    // Handle window focus for better mobile support
    window.addEventListener('focus', () => {
      if (this.isPageVisible_ && !this.isAnimating_) {
        this.startAnimating();
      }
    });
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
   * Check if a render is needed.
   * @returns {boolean} True if render needed
   */
  needsRender() {
    return this.needsRender_;
  }

  /**
   * Clear the needs render flag.
   */
  clearNeedsRender() {
    this.needsRender_ = false;
  }

  /**
   * Request a render - call this when something changes.
   * Restarts animation if stopped and page is visible.
   */
  requestRender() {
    this.needsRender_ = true;
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
    this.needsRender_ = true;
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
   * Set the idle timeout duration.
   * @param {number} ms - Timeout in milliseconds
   */
  setIdleTimeout(ms) {
    this.idleTimeoutMs_ = ms;
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
  }
}

/**
 * Singleton power manager instance.
 * @type {?PowerManager}
 */
export let powerManager = null;

/**
 * Initialize the power manager singleton.
 * @param {!Object} dependencies - Required dependencies
 * @returns {!PowerManager} Initialized manager
 */
export function initializePowerManager(dependencies) {
  powerManager = new PowerManager(dependencies);
  powerManager.initialize();
  return powerManager;
}
