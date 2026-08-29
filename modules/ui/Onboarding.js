/**
 * @fileoverview First-run onboarding overlay.
 *
 * A brand-new user was dropped straight into the 3D sky with no explanation
 * of how to look around, zoom, or identify anything. This shows a single
 * dismissible card the first time the app runs, gated on a localStorage flag,
 * and can be reopened from Settings.
 */

import {safeLocalStorage} from '../core/Utils.js';

const STORAGE_KEY = 'astrapedia-onboarded';

/**
 * Controls the first-run onboarding overlay.
 */
export class Onboarding {
  /**
   * @param {{storage?: !Storage, overlayId?: string}=} deps
   */
  constructor(deps = {}) {
    /** @private @const */
    this.storage_ = deps.storage !== undefined ? deps.storage : safeLocalStorage();
    /** @private @const */
    this.overlay_ = document.getElementById(deps.overlayId || 'onboarding-overlay');
    /** @private */
    this.onKeyDown_ = this.handleKeyDown_.bind(this);
    /** @private {?Element} */
    this.previousFocus_ = null;
  }

  /**
   * Wire the dismiss control and show the overlay on first run.
   */
  initialize() {
    if (!this.overlay_) return;

    const dismissBtn = document.getElementById('onboarding-dismiss');
    dismissBtn?.addEventListener('click', () => this.dismiss());

    // Tapping the backdrop (outside the card) also dismisses.
    this.overlay_.addEventListener('click', (e) => {
      if (e.target === this.overlay_) this.dismiss();
    });

    if (!this.hasSeen_()) this.show();
  }

  /**
   * @returns {boolean} Whether the user has dismissed onboarding before.
   */
  hasSeen_() {
    try {
      return this.storage_?.getItem(STORAGE_KEY) === 'true';
    } catch (e) {
      return false;
    }
  }

  /**
   * Show the overlay (used on first run and when reopened from Settings).
   */
  show() {
    if (!this.overlay_) return;
    this.previousFocus_ = document.activeElement;
    this.overlay_.classList.add('visible');
    document.addEventListener('keydown', this.onKeyDown_);
    document.getElementById('onboarding-dismiss')?.focus();
  }

  /**
   * Hide the overlay and remember that it has been seen.
   */
  dismiss() {
    if (!this.overlay_) return;
    this.overlay_.classList.remove('visible');
    document.removeEventListener('keydown', this.onKeyDown_);
    try {
      this.storage_?.setItem(STORAGE_KEY, 'true');
    } catch (e) {
      // Storage blocked: it will simply show again next run.
    }
    this.previousFocus_?.focus?.();
    this.previousFocus_ = null;
  }

  /**
   * @param {!KeyboardEvent} e
   * @private
   */
  handleKeyDown_(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.dismiss();
    }
  }
}

/** @type {?Onboarding} */
let onboarding = null;

/**
 * @param {{storage?: !Storage, overlayId?: string}=} deps
 * @returns {!Onboarding}
 */
export function initializeOnboarding(deps) {
  onboarding = new Onboarding(deps);
  onboarding.initialize();
  return onboarding;
}

/**
 * @returns {?Onboarding}
 */
export function getOnboarding() {
  return onboarding;
}
