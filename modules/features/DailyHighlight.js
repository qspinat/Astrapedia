/**
 * @fileoverview Tonight's Highlight — a featured object that changes once a
 * day, drawn at random from the objects actually well-placed tonight.
 *
 * Not the single brightest object (that would be the same planet every night),
 * and not a random pick from the whole catalog (half of which is obscure and
 * imageless). Instead: take the objects visible tonight from the user's
 * location, keep the showcase-worthy ones (famous / Messier / planets), and
 * pick one deterministically from the calendar date — so it's stable all day
 * and varies day to day. With no location, it falls back to a famous object,
 * still date-seeded, so the feature always has something good to show.
 */

/**
 * A small, stable string hash → non-negative integer. Used to turn a date
 * into a deterministic index, so the pick is the same all day for everyone at
 * a given location without any server.
 * @param {string} str
 * @returns {number}
 */
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Whether a visible-object entry is worth featuring: a planet, or a deep sky
 * object with a common name or Messier number. Keeps the pick off obscure,
 * imageless catalog rows.
 * @param {!Object} entry
 * @returns {boolean}
 */
function isShowcaseWorthy(entry) {
  if (entry.type === 'Planet') return true;
  const data = entry.data;
  return !!(data && (data.common_names ||
      (data.messier !== null && data.messier !== undefined)));
}

/**
 * Computes the day's highlighted object.
 */
export class DailyHighlight {
  /**
   * @param {{
   *   getVisibleObjects: function(number): !Array<!Object>,
   *   getLocation: function(): ?{lat: number, lon: number},
   *   getFamousObjects: function(): !Array<!Object>,
   *   calculateLST: function(!Date, number): number,
   *   now?: function(): !Date,
   * }} deps
   */
  constructor(deps) {
    this.getVisibleObjects_ = deps.getVisibleObjects;
    this.getLocation_ = deps.getLocation;
    this.getFamousObjects_ = deps.getFamousObjects;
    this.calculateLST_ = deps.calculateLST;
    this.now_ = deps.now || (() => new Date());
  }

  /**
   * The day's highlight.
   * @returns {?{object: !Object, name: string, label: string}} The object to
   *     select, a display name, and a one-line context label; null if nothing
   *     suitable is available.
   */
  getHighlight() {
    const now = this.now_();
    const dateKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
    const seed = hashString(dateKey);

    const location = this.getLocation_();
    if (location) {
      const pool = this.visiblePool_(location, now);
      if (pool.length > 0) {
        const entry = pick(pool, seed);
        return {
          object: entry.data || entry,
          name: entry.name,
          label: this.visibleLabel_(entry),
        };
      }
    }

    // Fallback: no location (or nothing up) — a famous object, still by date.
    const famous = this.getFamousObjects_() || [];
    if (famous.length === 0) return null;
    const dso = pick(famous, seed);
    return {
      object: dso,
      name: dso.common_names ? String(dso.common_names).split(',')[0].trim()
          : dso.name,
      label: 'A classic of the night sky',
    };
  }

  /**
   * Objects well-placed tonight, worth featuring, sorted for a stable index.
   * @param {!{lat: number, lon: number}} location
   * @param {!Date} now
   * @returns {!Array<!Object>}
   * @private
   */
  visiblePool_(location, now) {
    // Pin the sidereal time to this evening (22:00 local) so the pool — and
    // thus the pick — doesn't shift as the night wears on.
    const reference = new Date(now);
    reference.setHours(22, 0, 0, 0);
    const lst = this.calculateLST_(reference, location.lon);

    const pool = this.getVisibleObjects_(lst)
        .filter(isShowcaseWorthy);
    // Sort by name so the seeded index is stable regardless of scan order.
    pool.sort((a, b) => a.name.localeCompare(b.name));
    return pool;
  }

  /**
   * @param {!Object} entry
   * @returns {string}
   * @private
   */
  visibleLabel_(entry) {
    const alt = Math.round(entry.altitude || 0);
    const where = alt >= 55 ? 'High overhead' :
        alt >= 30 ? 'Well placed' : 'Low on the horizon';
    return `${where} tonight — ${alt}° up`;
  }
}

/**
 * Deterministically pick one item using the seed. Items must be pre-sorted for
 * the choice to be stable.
 * @param {!Array<T>} items
 * @param {number} seed
 * @returns {T}
 * @template T
 */
function pick(items, seed) {
  return items[seed % items.length];
}

/**
 * @param {!Object} deps
 * @returns {!DailyHighlight}
 */
export function initializeDailyHighlight(deps) {
  return new DailyHighlight(deps);
}
