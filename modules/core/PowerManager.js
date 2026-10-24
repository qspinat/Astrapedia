/**
 * @fileoverview Power management for render-on-demand.
 * Owns the animation loop and handles page visibility and idle detection.
 */

import {POWER_SAVING} from './Constants.js';
import {createLogger} from './Logger.js';

const logger = createLogger('PowerManager');

/**
 * PowerManager runs the animation loop only while something needs drawing.
 *
 * It is the single owner of the pending animation frame: "animating" means a
 * frame is scheduled, nothing else. Tracking that as a separate flag (here and
 * again in the app) let the two disagree when Android dropped a frame while
 * the WebView was paused.
 */
export class PowerManager {
  /**
   * Creates a new PowerManager instance.
   * @param {!Object} dependencies - Required dependencies
   * @param {function(): void} dependencies.renderFrame - Draws one frame
   * @param {function(): boolean} dependencies.shouldKeepAnimating - Check if animation should continue
   */
  constructor(dependencies) {
    /** @private @const */
    this.renderFrame_ = dependencies.renderFrame;

    /** @private @const */
    this.shouldKeepAnimating_ = dependencies.shouldKeepAnimating || (() => false);

    /** @private {boolean} */
    this.isPageVisible_ = true;

    /** @private {?number} Pending requestAnimationFrame handle */
    this.rafId_ = null;

    /** @private {?number} */
    this.idleTimeout_ = null;

    /** @private {number} - Idle timeout in milliseconds */
    this.idleTimeoutMs_ = POWER_SAVING.IDLE_THRESHOLD;

    /** @private {?function(): void} */
    this.onVisibilityChange_ = null;

    /** @private {?function(): void} */
    this.onFocus_ = null;

    /**
     * Schedules the next frame before drawing this one, so an exception in
     * renderFrame does not stop the loop.
     * @private @const {function(): void}
     */
    this.tick_ = () => {
      this.rafId_ = requestAnimationFrame(this.tick_);
      this.renderFrame_();
    };
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
        this.resume_();
      } else {
        logger.info('Page hidden - pausing rendering');
        this.stopAnimating();
      }
    };
    document.addEventListener('visibilitychange', this.onVisibilityChange_);

    // Belt-and-suspenders resume signals. On Android, locking the screen
    // (power button) often does NOT fire visibilitychange, yet the WebView
    // still drops the pending animation frame — so relying on visibility
    // alone leaves the loop dead on unlock. focus, pageshow, and Capacitor's
    // resume all cover that path.
    this.onFocus_ = () => this.resume_();
    window.addEventListener('focus', this.onFocus_);
    window.addEventListener('pageshow', this.onFocus_);
    document.addEventListener('resume', this.onFocus_);
  }

  /**
   * Force the render loop back on after the app returns to the foreground.
   *
   * Unlike startAnimating(), this does not trust a pending frame: the WebView
   * can drop it while paused, so cancel whatever handle is held and schedule
   * exactly one fresh frame.
   * @private
   */
  resume_() {
    this.isPageVisible_ = true;
    if (this.rafId_ !== null) cancelAnimationFrame(this.rafId_);
    this.rafId_ = requestAnimationFrame(this.tick_);
    this.resetIdleTimeout();
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
   * @returns {boolean} True if a frame is scheduled
   */
  isAnimating() {
    return this.rafId_ !== null;
  }

  /**
   * Request a render - call this when something changes.
   * Restarts animation if stopped and page is visible.
   */
  requestRender() {
    if (!this.isAnimating() && this.isPageVisible_) {
      this.startAnimating();
      return;
    }
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
    if (this.isAnimating()) return;
    this.rafId_ = requestAnimationFrame(this.tick_);
    this.resetIdleTimeout();
  }

  /**
   * Stop the animation loop (power saving).
   */
  stopAnimating() {
    if (this.idleTimeout_) {
      clearTimeout(this.idleTimeout_);
      this.idleTimeout_ = null;
    }
    if (this.rafId_ !== null) {
      cancelAnimationFrame(this.rafId_);
      this.rafId_ = null;
    }
  }

  /**
   * Stop the loop and remove listeners.
   */
  dispose() {
    this.stopAnimating();
    if (this.onVisibilityChange_) {
      document.removeEventListener('visibilitychange', this.onVisibilityChange_);
      this.onVisibilityChange_ = null;
    }
    if (this.onFocus_) {
      window.removeEventListener('focus', this.onFocus_);
      window.removeEventListener('pageshow', this.onFocus_);
      document.removeEventListener('resume', this.onFocus_);
      this.onFocus_ = null;
    }
  }
}
