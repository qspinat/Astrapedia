/**
 * @fileoverview "What am I pointing at?" While compass mode follows the
 * phone, a crosshair marks the screen centre and a label names the object
 * nearest to it; tapping the label selects that object.
 */

import {globalEventBus, Events} from '../core/EventBus.js';
import {findNearestObject} from '../core/CoordinateUtils.js';
import {addMobileButtonListener} from '../core/Utils.js';
import {domCache} from '../ui/DOMCache.js';

/** Least time between identifications while the phone moves, in ms. */
const IDENTIFY_THROTTLE_MS = 300;

/** Search radius as a fraction of the vertical FOV, with a floor in degrees. */
const RADIUS_FOV_FRACTION = 0.06;
const MIN_RADIUS_DEG = 0.3;

/**
 * Shows the crosshair and the name of the object at the screen centre while
 * compass mode is on.
 */
export class CenterIdentifier {
  /**
   * @param {!Object} dependencies
   * @param {function(): {ra: number, dec: number}} dependencies.getViewCenterRaDec
   * @param {function(): number} dependencies.getFov - Vertical FOV in degrees
   * @param {function(): !Iterable<!Object>} dependencies.getCandidates - Selectable
   *     objects (name, type, ra, dec, mag) worth naming
   * @param {function(!Object): void} dependencies.selectObject
   */
  constructor(dependencies) {
    /** @private @const */
    this.deps_ = dependencies;

    /** @private {boolean} */
    this.active_ = false;

    /** @private {number} When the centre was last identified */
    this.lastIdentified_ = -Infinity;

    /** @private {?Object} Object currently named */
    this.current_ = null;

    /** @private {!Array<!Object>} */
    this.subscriptions_ = [];
  }

  /**
   * Follow compass mode and wire the label.
   */
  initialize() {
    this.subscriptions_.push(
        globalEventBus.on(Events.COMPASS_ENABLED, () => this.start_()),
        globalEventBus.on(Events.COMPASS_DISABLED, () => this.stop_()),
        // The view only moves when the phone does: follow its heading
        // updates, throttled, rather than polling.
        globalEventBus.on(Events.COMPASS_HEADING, () => {
          if (this.active_ && performance.now() - this.lastIdentified_ >= IDENTIFY_THROTTLE_MS) {
            this.identify_();
          }
        }));

    const label = domCache.get('center-label');
    if (label) {
      addMobileButtonListener(label, () => {
        if (this.current_) this.deps_.selectObject(this.current_);
      });
    }
  }

  /** @private */
  start_() {
    this.active_ = true;
    domCache.get('center-identify')?.classList.add('visible');
    this.identify_();
  }

  /** @private */
  stop_() {
    this.active_ = false;
    this.current_ = null;
    domCache.get('center-identify')?.classList.remove('visible');
    // Cleared so the next start does not show this session's last name.
    const label = domCache.get('center-label');
    if (label) label.hidden = true;
  }

  /**
   * Name the object at the centre, if any.
   * @private
   */
  identify_() {
    this.lastIdentified_ = performance.now();
    const center = this.deps_.getViewCenterRaDec();
    const radius = Math.max(MIN_RADIUS_DEG, this.deps_.getFov() * RADIUS_FOV_FRACTION);
    const found = findNearestObject(center, radius, this.deps_.getCandidates());
    if (found === this.current_) return;
    this.current_ = found;

    const label = domCache.get('center-label');
    if (!label) return;
    label.hidden = !found;
    if (found) {
      const mag = Number.isFinite(found.mag) ? ` · mag ${found.mag.toFixed(1)}` : '';
      label.textContent = `${found.name}${mag}`;
    }
  }

  /**
   * Stop and remove subscriptions.
   */
  dispose() {
    this.stop_();
    this.subscriptions_.forEach((sub) => sub.unsubscribe());
    this.subscriptions_ = [];
  }
}
