/**
 * @fileoverview Magnitude-related utility functions.
 * Shared calculations for star/object size based on magnitude.
 */

import {STARS} from './Constants.js';

/**
 * Whether an object of this magnitude is bright enough to be drawn.
 *
 * The single definition of "visible at this limit", used both by the
 * renderers that decide what to draw and by the click handler that decides
 * what can be selected. Keeping them on one predicate is the point: they
 * disagreed before, so faint deep sky objects were drawn but not clickable.
 *
 * The fade range matches the star shader's magFadeRange uniform, which ramps
 * visibility to zero across it — so an object is treated as drawable exactly
 * while the shader still shows something.
 *
 * @param {number|null|undefined} mag - Object magnitude; absent means always shown
 * @param {number} limit - Current magnitude limit
 * @returns {boolean} True if the object should be drawn and selectable
 */
export const isWithinMagnitudeLimit = (mag, limit) =>
  mag === null || mag === undefined || mag <= limit + STARS.FADE_RANGE;

/**
 * Convert astronomical magnitude to display size.
 * Uses exponential scaling to make brighter objects (lower magnitude) larger.
 *
 * @param {number} mag - Magnitude value (lower = brighter)
 * @param {number=} maxSize - Maximum size cap (default 3.5)
 * @param {number=} baseSize - Minimum size (default 0.8)
 * @param {number=} baseMag - Reference magnitude for base size (default 8)
 * @returns {number} Display size
 */
export const magnitudeToSize = (mag, maxSize = 3.5, baseSize = 0.8, baseMag = 8) => {
  const magnitudeDiff = baseMag - mag;
  const size = baseSize * Math.pow(1.15, magnitudeDiff);
  return Math.min(maxSize, Math.max(baseSize, size));
};

/**
 * Calculate limiting magnitude for a telescope aperture.
 * Based on: 2.7 + 5 * log10(aperture_mm)
 *
 * @param {number} apertureMm - Telescope aperture in millimeters
 * @returns {number} Theoretical limiting magnitude
 */
export const telescopeLimitingMagnitude = (apertureMm) => {
  return 2.7 + 5 * Math.log10(apertureMm);
};

/**
 * Calculate telescope gain over naked eye.
 * Gain = 5 * log10(aperture / pupil), where dark-adapted pupil is ~7mm.
 *
 * @param {number} apertureMm - Telescope aperture in millimeters
 * @param {number=} pupilMm - Observer's pupil size (default 7mm, dark-adapted)
 * @returns {number} Magnitude gain
 */
export const telescopeGain = (apertureMm, pupilMm = 7) => {
  return 5 * Math.log10(apertureMm / pupilMm);
};
