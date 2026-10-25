/**
 * @fileoverview Finder circles: the aiming aids mounted on a telescope —
 * Telrad rings, the finder scope's field and each eyepiece's true field —
 * drawn around the screen centre over the normal sky view, so a star hop can
 * be planned with the same circles that will be used outside.
 */

import {FINDER} from '../core/Constants.js';
import {skyToCameraAngle} from '../core/CoordinateUtils.js';
import {globalEventBus, Events} from '../core/EventBus.js';
import {safeGetJson, safeSetJson} from '../core/Utils.js';
import {domCache} from '../ui/DOMCache.js';
import {createLogger} from '../core/Logger.js';

const logger = createLogger('FinderOverlay');

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Overlay settings.
 * @typedef {{enabled: boolean, telrad: boolean, finderScope: boolean,
 *     finderFov: number, eyepieces: boolean}}
 */
let FinderSettings;

/** @const {!FinderSettings} */
const DEFAULT_SETTINGS = {
  enabled: false,
  telrad: true,
  finderScope: true,
  finderFov: FINDER.DEFAULT_FINDER_FOV,
  eyepieces: true,
};

/** Settings toggles in the telescope panel, by settings key. */
const TOGGLE_IDS = {
  enabled: 'finder-toggle',
  telrad: 'finder-telrad-toggle',
  finderScope: 'finder-scope-toggle',
  eyepieces: 'finder-eyepieces-toggle',
};

/**
 * Screen radius of a circle of the given angular diameter, centred in a
 * perspective view.
 * @param {number} diameterDeg - Circle's angular diameter on the sky
 * @param {number} fovDeg - Camera vertical FOV
 * @param {number} viewHeight - View height in CSS px
 * @returns {number} Radius in CSS px
 */
export function ringRadiusPx(diameterDeg, fovDeg, viewHeight) {
  const rad = Math.PI / 180;
  return Math.tan(skyToCameraAngle(diameterDeg) / 2 * rad) /
      Math.tan(fovDeg / 2 * rad) * viewHeight / 2;
}

/**
 * Draws the finder circles and keeps them in step with zoom and settings.
 */
export class FinderOverlay {
  /**
   * @param {!Object} dependencies
   * @param {function(): !Array<{focalLength: number, realFieldOfView: number}>}
   *     dependencies.getEyepieces - The eyepiece kit with each true field
   */
  constructor(dependencies) {
    /** @private @const */
    this.deps_ = dependencies;

    /** @private {!FinderSettings} */
    this.settings_ = {...DEFAULT_SETTINGS};

    /** @private {?number} Last camera vertical FOV */
    this.fov_ = null;

    /** @private {string} Key of what was last drawn, to skip identical redraws */
    this.drawnKey_ = '';

    /** @private {!Array<!Object>} */
    this.subscriptions_ = [];
  }

  /**
   * Load settings, bind the panel controls and listen for eyepiece changes.
   */
  initialize() {
    const stored = safeGetJson(FINDER.STORAGE_KEY);
    if (stored && typeof stored === 'object') {
      for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (typeof stored[key] === typeof DEFAULT_SETTINGS[key]) {
          this.settings_[key] = stored[key];
        }
      }
    }

    for (const [key, id] of Object.entries(TOGGLE_IDS)) {
      const input = domCache.get(id);
      if (!input) continue;
      input.checked = this.settings_[key];
      input.addEventListener('change', () => this.setSettings({[key]: input.checked}));
    }
    const fovInput = domCache.get('finder-scope-fov');
    if (fovInput) {
      fovInput.value = this.settings_.finderFov;
      fovInput.addEventListener('input', () => {
        const value = parseFloat(fovInput.value);
        if (value > 0) this.setSettings({finderFov: value});
      });
    }

    this.subscriptions_.push(
        // Zoom or screen size changed.
        globalEventBus.on(Events.FOV_CHANGED, ({fov}) => this.update(fov)),
        // Eyepiece kit or telescope changed: the eyepiece circles change size.
        globalEventBus.on(Events.TELESCOPE_COMPUTED, () => this.redraw_()));
    logger.info('Initialized');
  }

  /**
   * @returns {!FinderSettings} A copy of the settings
   */
  getSettings() {
    return {...this.settings_};
  }

  /**
   * Change and persist settings, then redraw.
   * @param {!Object} changes - Subset of FinderSettings
   */
  setSettings(changes) {
    this.settings_ = {...this.settings_, ...changes};
    safeSetJson(FINDER.STORAGE_KEY, this.settings_);
    this.redraw_();
  }

  /**
   * Redraw for the camera's vertical FOV (on FOV_CHANGED).
   * @param {number} fov - Degrees
   */
  update(fov) {
    this.fov_ = fov;
    this.redraw_();
  }

  /**
   * The rings to draw for the current settings.
   * @returns {!Array<{diameter: number, kind: string, label: string}>}
   * @private
   */
  rings_() {
    const rings = [];
    if (this.settings_.telrad) {
      for (const diameter of FINDER.TELRAD_RINGS_DEG) {
        rings.push({diameter, kind: 'telrad', label: ''});
      }
    }
    if (this.settings_.finderScope) {
      const diameter = this.settings_.finderFov;
      rings.push({diameter, kind: 'finder', label: `finder ${diameter}°`});
    }
    if (this.settings_.eyepieces) {
      for (const e of this.deps_.getEyepieces?.() || []) {
        rings.push({diameter: e.realFieldOfView, kind: 'eyepiece', label: `${e.focalLength}mm`});
      }
    }
    return rings;
  }

  /**
   * Redraw the overlay when what it shows has changed.
   * @private
   */
  redraw_() {
    const svg = domCache.get('finder-overlay');
    if (!svg) return;

    const width = window.innerWidth;
    const height = window.innerHeight;
    const rings = this.settings_.enabled && this.fov_ ? this.rings_() : [];
    const key = JSON.stringify([width, height, this.fov_, rings]);
    if (key === this.drawnKey_) return;
    this.drawnKey_ = key;

    const cx = width / 2;
    const cy = height / 2;
    const maxRadius = 1.5 * Math.max(width, height);
    const nodes = [];
    const labelledRadii = [];
    for (const ring of rings) {
      const r = ringRadiusPx(ring.diameter, this.fov_, height);
      if (r < FINDER.MIN_RING_PX || r > maxRadius) continue;

      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', cx);
      circle.setAttribute('cy', cy);
      circle.setAttribute('r', r.toFixed(1));
      circle.setAttribute('class', `finder-ring finder-ring--${ring.kind}`);
      nodes.push(circle);

      // A label too close to one already drawn would print over it.
      const labelFits = labelledRadii.every((other) =>
        Math.abs(other - r) >= FINDER.LABEL_GAP_PX);
      if (ring.label && labelFits) {
        labelledRadii.push(r);
        // Upper right of the ring, where it rarely covers the target.
        const text = document.createElementNS(SVG_NS, 'text');
        text.setAttribute('x', (cx + r * 0.71 + 3).toFixed(1));
        text.setAttribute('y', (cy - r * 0.71 - 3).toFixed(1));
        text.setAttribute('class', 'finder-label');
        text.textContent = ring.label;
        nodes.push(text);
      }
    }
    svg.replaceChildren(...nodes);
  }

  /**
   * Remove subscriptions.
   */
  dispose() {
    this.subscriptions_.forEach((sub) => sub.unsubscribe());
    this.subscriptions_ = [];
  }
}

/** @type {?FinderOverlay} */
let finderOverlay = null;

/**
 * Create the overlay once; later calls return the same instance.
 * @param {!Object} dependencies - See FinderOverlay
 * @returns {!FinderOverlay}
 */
export function initializeFinderOverlay(dependencies) {
  if (finderOverlay) return finderOverlay;
  finderOverlay = new FinderOverlay(dependencies);
  finderOverlay.initialize();
  return finderOverlay;
}

/**
 * Reset the singleton (tests only).
 */
export function resetFinderOverlay() {
  finderOverlay?.dispose();
  finderOverlay = null;
}
