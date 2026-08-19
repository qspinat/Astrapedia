/**
 * @fileoverview Styled observer-location dialog.
 *
 * Replaces the native prompt()/alert() pair, which was the one surface that
 * broke the app's visual language (and, being an OS dialog, ignored the night-
 * vision palette entirely). Submission routes through LocationManager, the
 * owner that validates, clamps latitude, normalizes longitude, persists, and
 * emits LOCATION_CHANGED — so the dialog only gathers input and reports back.
 */

import {locationManager} from '../services/LocationManager.js';
import {panelManager} from './PanelManager.js';
import {addMobileButtonListener} from '../core/Utils.js';

/**
 * Modal dialog for entering latitude/longitude.
 */
export class LocationDialog {
  constructor() {
    /** @private {?Element} */
    this.dialog_ = document.getElementById('location-dialog');
    /** @private {?HTMLInputElement} */
    this.latInput_ = document.getElementById('location-lat');
    /** @private {?HTMLInputElement} */
    this.lonInput_ = document.getElementById('location-lon');
    /** @private {?Element} */
    this.error_ = document.getElementById('location-dialog-error');
    /** @private {?Element} */
    this.previousFocus_ = null;
    /** @private */
    this.onKeyDown_ = this.handleKeyDown_.bind(this);
  }

  /**
   * Wire the dialog's buttons. Safe to call once at startup.
   */
  initialize() {
    if (!this.dialog_) return;

    const setBtn = document.getElementById('location-set-btn');
    const cancelBtn = document.getElementById('location-cancel-btn');
    if (setBtn) addMobileButtonListener(setBtn, () => this.apply_());
    if (cancelBtn) addMobileButtonListener(cancelBtn, () => this.close());

    // Enter in either field submits.
    for (const input of [this.latInput_, this.lonInput_]) {
      input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.apply_();
        }
      });
    }
  }

  /**
   * Open the dialog, prefilled with the current location.
   */
  show() {
    if (!this.dialog_) return;

    const current = locationManager.getLocation();
    if (this.latInput_) this.latInput_.value = current?.lat ?? '';
    if (this.lonInput_) this.lonInput_.value = current?.lon ?? '';
    this.clearError_();

    this.previousFocus_ = document.activeElement;
    this.dialog_.classList.add('visible');
    document.addEventListener('keydown', this.onKeyDown_);
    this.latInput_?.focus();
    this.latInput_?.select?.();
  }

  /**
   * Close without applying, restoring focus to whatever opened it.
   */
  close() {
    if (!this.dialog_) return;
    this.dialog_.classList.remove('visible');
    document.removeEventListener('keydown', this.onKeyDown_);
    this.previousFocus_?.focus?.();
    this.previousFocus_ = null;
  }

  /**
   * Validate and apply the entered coordinates.
   * @private
   */
  apply_() {
    const lat = parseFloat(this.latInput_?.value);
    const lon = parseFloat(this.lonInput_?.value);

    // Explicit finite checks, not truthiness: 0 is a valid coordinate (the
    // equator and the prime meridian). Range is left to LocationManager, which
    // clamps latitude and normalizes longitude — so 120 becomes 90, not an
    // error the user has to puzzle over.
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      this.showError_('Enter numeric coordinates, e.g. 48.8566 and 2.3522.');
      return;
    }

    locationManager.setLocation(lat, lon);
    const applied = locationManager.getLocation();
    this.close();
    panelManager.showNotification(
        `Location set to ${applied.lat}°, ${applied.lon}°.`);
  }

  /**
   * @param {!KeyboardEvent} e
   * @private
   */
  handleKeyDown_(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    }
  }

  /**
   * @param {string} message
   * @private
   */
  showError_(message) {
    if (!this.error_) return;
    this.error_.textContent = message;
    this.error_.hidden = false;
  }

  /** @private */
  clearError_() {
    if (!this.error_) return;
    this.error_.textContent = '';
    this.error_.hidden = true;
  }
}

/** @type {?LocationDialog} */
let locationDialog = null;

/**
 * @returns {!LocationDialog}
 */
export function initializeLocationDialog() {
  locationDialog = new LocationDialog();
  locationDialog.initialize();
  return locationDialog;
}

/**
 * @returns {?LocationDialog}
 */
export function getLocationDialog() {
  return locationDialog;
}
