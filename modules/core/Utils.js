/**
 * @fileoverview Utility functions for the Sky Map application.
 */

/**
 * Debounce helper function to limit how often a function is called.
 * The debounced function will wait until `delay` milliseconds have passed
 * since the last call before executing.
 *
 * The returned function has a `cancel()` method to cancel any pending execution.
 *
 * @param {function(...*): void} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {function(...*): void} Debounced function with cancel() method
 *
 * @example
 * const debouncedSearch = debounce((query) => {
 *   console.log('Searching for:', query);
 * }, 300);
 *
 * // These rapid calls will only execute once, 300ms after the last call
 * debouncedSearch('a');
 * debouncedSearch('ab');
 * debouncedSearch('abc'); // Only this one executes
 *
 * // Cancel pending execution
 * debouncedSearch.cancel();
 */
export function debounce(fn, delay) {
  let timeoutId;
  const debouncedFn = function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
  debouncedFn.cancel = function() {
    clearTimeout(timeoutId);
    timeoutId = null;
  };
  return debouncedFn;
}

/**
 * Throttle helper function to limit how often a function is called.
 * Unlike debounce, throttle ensures the function is called at most once
 * per `limit` milliseconds.
 *
 * @param {function(...*): void} fn - Function to throttle
 * @param {number} limit - Minimum time between calls in milliseconds
 * @returns {function(...*): void} Throttled function
 *
 * @example
 * const throttledScroll = throttle(() => {
 *   console.log('Scroll position:', window.scrollY);
 * }, 100);
 *
 * // During rapid scrolling, this will execute at most every 100ms
 * window.addEventListener('scroll', throttledScroll);
 */
export function throttle(fn, limit) {
  let inThrottle = false;
  return function(...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * Clamp a value between a minimum and maximum.
 *
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Linear interpolation between two values.
 *
 * @param {number} a - Start value
 * @param {number} b - End value
 * @param {number} t - Interpolation factor (0-1)
 * @returns {number} Interpolated value
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}
