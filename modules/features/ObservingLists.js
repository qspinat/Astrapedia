/**
 * @fileoverview The observer's own lists: objects they want to see, and
 * objects they have seen (with the date). Kept on the device, so they work
 * offline: plan indoors, tick off outside.
 *
 * Objects are keyed by the name the info panel shows (catalog designation
 * for deep-sky objects, proper name for stars and planets).
 */

import {safeGetJson, safeSetJson} from '../core/Utils.js';

const STORAGE_KEY = 'astrapedia_observing_lists';

/**
 * Wanted and seen objects, persisted to localStorage.
 */
export class ObservingLists {
  constructor() {
    /** @private {!Object<string, {addedAt: number}>} */
    this.wanted_ = {};

    /** @private {!Object<string, {date: number}>} */
    this.seen_ = {};

    this.load_();
  }

  /**
   * @param {string} name - Object name
   * @returns {boolean}
   */
  isWanted(name) {
    return Object.hasOwn(this.wanted_, name);
  }

  /**
   * @param {string} name - Object name
   * @returns {?Date} When it was marked seen, or null
   */
  seenOn(name) {
    return Object.hasOwn(this.seen_, name) ? new Date(this.seen_[name].date) : null;
  }

  /**
   * Add to or remove from the want-to-see list.
   * @param {string} name
   * @returns {boolean} Whether it is now wanted
   */
  toggleWanted(name) {
    if (this.isWanted(name)) {
      delete this.wanted_[name];
    } else {
      this.wanted_[name] = {addedAt: Date.now()};
    }
    this.save_();
    return this.isWanted(name);
  }

  /**
   * Mark as seen (today) or unmark.
   * @param {string} name
   * @param {!Date=} date - When it was seen
   * @returns {boolean} Whether it is now marked seen
   */
  toggleSeen(name, date = new Date()) {
    if (this.seenOn(name)) {
      delete this.seen_[name];
    } else {
      this.seen_[name] = {date: date.getTime()};
    }
    this.save_();
    return !!this.seenOn(name);
  }

  /**
   * @returns {!Array<string>} Wanted object names, oldest first
   */
  getWanted() {
    return Object.entries(this.wanted_)
        .sort(([, a], [, b]) => a.addedAt - b.addedAt)
        .map(([name]) => name);
  }

  /** @private */
  load_() {
    const data = safeGetJson(STORAGE_KEY);
    const isRecord = (v) => v && typeof v === 'object' && !Array.isArray(v);
    if (!isRecord(data)) return;
    if (isRecord(data.wanted)) this.wanted_ = data.wanted;
    if (isRecord(data.seen)) this.seen_ = data.seen;
  }

  /** @private */
  save_() {
    safeSetJson(STORAGE_KEY, {wanted: this.wanted_, seen: this.seen_});
  }
}

/**
 * Application-wide lists.
 * @const {!ObservingLists}
 */
export const observingLists = new ObservingLists();
