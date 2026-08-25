/**
 * @fileoverview Night Vision mode — a deep-red, low-luminance skin that
 * preserves the observer's dark adaptation for outdoor field use.
 *
 * Dark-adapted rod cells are disrupted most by short-wavelength and bright
 * light and least by dim long-wavelength red, so this mode drives the whole
 * UI to red via a `body.night-vision` class (which only redefines the CSS
 * tokens, so every component inherits it) and tints the star-field canvas
 * red. It trades astronomical color accuracy for night vision on purpose.
 *
 * State is persisted so the mode survives reloads and app restarts.
 */

import {safeLocalStorage} from '../core/Utils.js';

const STORAGE_KEY = 'astrapedia-night-vision';
const BODY_CLASS = 'night-vision';

/**
 * Controls Night Vision mode and keeps every registered toggle in sync.
 */
export class NightVision {
  /**
   * @param {{storage?: !Storage, body?: !Element}=} deps - Injectable for tests
   */
  constructor(deps = {}) {
    /** @private @const */
    this.storage_ = deps.storage !== undefined ? deps.storage : safeLocalStorage();

    /** @private @const */
    this.body_ = deps.body || (typeof document !== 'undefined' ? document.body : null);

    /** @private {!Array<!Element>} */
    this.toggles_ = [];

    /** @private {boolean} */
    this.enabled_ = this.readStored_();

    this.apply_();
  }

  /**
   * @returns {boolean} Whether night vision is currently on.
   */
  isEnabled() {
    return this.enabled_;
  }

  /**
   * Turn night vision on or off, persist it, and update every control.
   * @param {boolean} on - Desired state
   */
  setEnabled(on) {
    this.enabled_ = !!on;
    try {
      this.storage_?.setItem(STORAGE_KEY, String(this.enabled_));
    } catch (e) {
      // Private-mode / disabled storage: mode still works for this session.
    }
    this.apply_();
  }

  /**
   * Flip the current state.
   * @returns {boolean} The new state.
   */
  toggle() {
    this.setEnabled(!this.enabled_);
    return this.enabled_;
  }

  /**
   * Register a control (e.g. the header button) that reflects the state.
   * Its `aria-pressed` and `active` class track the mode; the caller wires
   * the click to toggle().
   * @param {?Element} el - The toggle control
   */
  registerToggle(el) {
    if (!el || this.toggles_.includes(el)) return;
    this.toggles_.push(el);
    this.syncControl_(el);
  }

  /**
   * @returns {boolean} Persisted state, defaulting to off.
   * @private
   */
  readStored_() {
    try {
      return this.storage_?.getItem(STORAGE_KEY) === 'true';
    } catch (e) {
      return false;
    }
  }

  /** @private */
  apply_() {
    this.body_?.classList.toggle(BODY_CLASS, this.enabled_);
    for (const el of this.toggles_) this.syncControl_(el);
  }

  /**
   * @param {!Element} el - Control to update
   * @private
   */
  syncControl_(el) {
    el.setAttribute('aria-pressed', String(this.enabled_));
    el.classList.toggle('active', this.enabled_);
  }
}

/**
 * @param {{storage?: !Storage, body?: !Element}=} deps
 * @returns {!NightVision}
 */
export function initializeNightVision(deps) {
  return new NightVision(deps);
}
