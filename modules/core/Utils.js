/**
 * @fileoverview Utility functions for the Astrapedia application.
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

/**
 * Add both click and touch listeners to a button for mobile compatibility.
 * On mobile, click events can be unreliable or delayed. This ensures buttons
 * work properly on both desktop (click) and mobile (touchend).
 * Distinguishes taps from scrolls by tracking movement.
 * Prevents double-firing when both touchend and synthetic click trigger.
 *
 * @param {!HTMLElement} button - Button element
 * @param {function(): void} handler - Click handler
 */
export function addMobileButtonListener(button, handler) {
  // Track if handler was recently called to prevent double execution
  let handlerCalled = false;

  const callHandler = () => {
    if (handlerCalled) return;
    handlerCalled = true;
    // Reset after a short delay to allow future clicks
    setTimeout(() => {
      handlerCalled = false;
    }, 300);
    handler();
  };

  // Use click for desktop
  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    callHandler();
  });

  // Use touchend for mobile (more reliable than click on touch devices)
  // Track movement to distinguish tap from scroll
  let touchStarted = false;
  let touchMoved = false;
  let startX = 0;
  let startY = 0;
  const TAP_THRESHOLD = 10; // pixels

  button.addEventListener('touchstart', (e) => {
    touchStarted = true;
    touchMoved = false;
    if (e.touches.length > 0) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }
    e.stopPropagation();
  }, {passive: true});

  button.addEventListener('touchmove', (e) => {
    if (touchStarted && e.touches.length > 0) {
      const dx = Math.abs(e.touches[0].clientX - startX);
      const dy = Math.abs(e.touches[0].clientY - startY);
      if (dx > TAP_THRESHOLD || dy > TAP_THRESHOLD) {
        touchMoved = true;
      }
    }
  }, {passive: true});

  button.addEventListener('touchend', (e) => {
    if (touchStarted && !touchMoved) {
      e.preventDefault();
      e.stopPropagation();
      callHandler();
    }
    touchStarted = false;
    touchMoved = false;
  });
}

/**
 * The app UI is English regardless of the device locale, so date formatting is
 * pinned here rather than rendering as e.g. "28 août".
 * @const {string}
 */
export const APP_LOCALE = 'en-US';

/**
 * Human "today / tomorrow / in N days" label for an upcoming date.
 * @param {!Date} date - The future date.
 * @param {!Date=} now - Reference "now" (defaults to the current time).
 * @returns {string} Relative-day label.
 */
export function relativeDayLabel(date, now = new Date()) {
  const days = Math.ceil((date - now) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

/**
 * localStorage that never throws (Safari private mode, sandboxed frames, etc.).
 * @returns {?Storage} The store, or null if it is unavailable.
 */
export function safeLocalStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch (e) {
    return null;
  }
}
