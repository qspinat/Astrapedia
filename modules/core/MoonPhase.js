/**
 * @fileoverview Canonical moon-phase → name/emoji mapping.
 *
 * Phase runs 0..1 (0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last
 * quarter). The eight named phases occupy even 1/16-turn bands. This is the
 * single source of truth shared by the sky-conditions readout and the object
 * info panel, which previously each carried their own copy of the table.
 */

/**
 * Boundaries between the eight named phases, as fractions of a full cycle.
 * @const {!Object<string, number>}
 */
export const MOON_PHASE_THRESHOLDS = {
  NEW_MOON_END: 0.0625,        // 1/16 - end of new moon
  WAXING_CRESCENT_END: 0.1875, // 3/16 - end of waxing crescent
  FIRST_QUARTER_END: 0.3125,   // 5/16 - end of first quarter
  WAXING_GIBBOUS_END: 0.4375,  // 7/16 - end of waxing gibbous
  FULL_MOON_END: 0.5625,       // 9/16 - end of full moon
  WANING_GIBBOUS_END: 0.6875,  // 11/16 - end of waning gibbous
  LAST_QUARTER_END: 0.8125,    // 13/16 - end of last quarter
  WANING_CRESCENT_END: 0.9375, // 15/16 - end of waning crescent
};

/**
 * Map a moon phase fraction to its name and emoji.
 * @param {number} phase - Moon phase 0..1.
 * @returns {{name: string, emoji: string}}
 */
export function moonPhaseName(phase) {
  const T = MOON_PHASE_THRESHOLDS;
  if (phase < T.NEW_MOON_END) return {name: 'New Moon', emoji: '🌑'};
  if (phase < T.WAXING_CRESCENT_END) return {name: 'Waxing Crescent', emoji: '🌒'};
  if (phase < T.FIRST_QUARTER_END) return {name: 'First Quarter', emoji: '🌓'};
  if (phase < T.WAXING_GIBBOUS_END) return {name: 'Waxing Gibbous', emoji: '🌔'};
  if (phase < T.FULL_MOON_END) return {name: 'Full Moon', emoji: '🌕'};
  if (phase < T.WANING_GIBBOUS_END) return {name: 'Waning Gibbous', emoji: '🌖'};
  if (phase < T.LAST_QUARTER_END) return {name: 'Last Quarter', emoji: '🌗'};
  if (phase < T.WANING_CRESCENT_END) return {name: 'Waning Crescent', emoji: '🌘'};
  return {name: 'New Moon', emoji: '🌑'};
}
