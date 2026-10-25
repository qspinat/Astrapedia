/**
 * @fileoverview Keeps the screen on while the app is in use, so the phone
 * does not dim or lock mid-observation. The browser releases a screen wake
 * lock whenever the page is hidden, so it is requested again each time the
 * page becomes visible.
 */

import {safeLocalStorage} from './Utils.js';
import {createLogger} from './Logger.js';

const logger = createLogger('WakeLock');

const STORAGE_KEY = 'astrapedia-keep-awake';

/**
 * Holds a screen wake lock while enabled and the page is visible.
 */
export class ScreenWakeLock {
  /**
   * @param {{wakeLock?: ?Object, storage?: ?Storage, doc?: !Document}=} deps -
   *     Injectable for tests; default to the browser's
   */
  constructor(deps = {}) {
    /** @private @const {?Object} navigator.wakeLock, absent when unsupported */
    this.api_ = deps.wakeLock !== undefined ? deps.wakeLock :
        (typeof navigator !== 'undefined' ? navigator.wakeLock ?? null : null);

    /** @private @const {?Storage} */
    this.storage_ = deps.storage !== undefined ? deps.storage : safeLocalStorage();

    /** @private @const {!Document} */
    this.doc_ = deps.doc || document;

    /** @private {?Object} The held WakeLockSentinel */
    this.sentinel_ = null;

    /** @private {boolean} Defaults to on: outdoors a sleeping screen is the norm. */
    this.enabled_ = this.readStored_();

    /** @private @const */
    this.onVisibilityChange_ = () => {
      if (this.doc_.visibilityState === 'visible') this.acquire_();
    };
  }

  /**
   * Start holding the lock (when enabled) and re-acquire it on return.
   */
  initialize() {
    this.doc_.addEventListener('visibilitychange', this.onVisibilityChange_);
    this.acquire_();
  }

  /**
   * @returns {boolean} Whether the device supports screen wake locks.
   */
  isSupported() {
    return !!this.api_;
  }

  /**
   * @returns {boolean} Whether the user wants the screen kept on.
   */
  isEnabled() {
    return this.enabled_;
  }

  /**
   * Turn keep-awake on or off and remember the choice.
   * @param {boolean} on
   */
  setEnabled(on) {
    this.enabled_ = !!on;
    try {
      this.storage_?.setItem(STORAGE_KEY, String(this.enabled_));
    } catch (e) {
      // Storage unavailable: the choice holds for this session.
    }
    if (this.enabled_) {
      this.acquire_();
    } else {
      this.release_();
    }
  }

  /**
   * @returns {boolean} Stored choice, defaulting to on.
   * @private
   */
  readStored_() {
    try {
      return this.storage_?.getItem(STORAGE_KEY) !== 'false';
    } catch (e) {
      return true;
    }
  }

  /** @private */
  async acquire_() {
    if (!this.api_ || !this.enabled_ || this.sentinel_) return;
    if (this.doc_.visibilityState && this.doc_.visibilityState !== 'visible') return;
    try {
      this.sentinel_ = await this.api_.request('screen');
      this.sentinel_.addEventListener?.('release', () => {
        this.sentinel_ = null;
      });
    } catch (e) {
      // Denied (battery saver, not visible yet): the screen just sleeps.
      logger.debug(`Wake lock unavailable: ${e.message}`);
    }
  }

  /** @private */
  release_() {
    this.sentinel_?.release?.();
    this.sentinel_ = null;
  }

  /**
   * Release the lock and stop listening.
   */
  dispose() {
    this.doc_.removeEventListener('visibilitychange', this.onVisibilityChange_);
    this.release_();
  }
}
