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

/** Frame length the per-frame easing rates were tuned at (60 Hz). */
export const REFERENCE_FRAME_MS = 1000 / 60;

/** Longest frame an animation steps over at once, so a stall doesn't jump. */
export const MAX_FRAME_MS = 50;

/**
 * Fraction of the remaining distance an exponential ease covers in one frame,
 * so it takes the same time on a 60, 90 or 120 Hz screen.
 * @param {number} ratePerFrame - Fraction covered per 60 Hz frame (0-1)
 * @param {number} frameMs - Time since the last frame
 * @returns {number} Fraction to cover this frame
 */
export function easeFactor(ratePerFrame, frameMs) {
  return 1 - Math.pow(1 - ratePerFrame, frameMs / REFERENCE_FRAME_MS);
}

/**
 * Smoothstep easing: starts and ends gently.
 * @param {number} t - Progress (0-1)
 * @returns {number} Eased progress (0-1)
 */
export function smoothstep(t) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
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
 * @param {{onLongPress: (function(): void|undefined)}=} options - A hold
 *     calls onLongPress instead of the click handler
 */
export function addMobileButtonListener(button, handler, {onLongPress} = {}) {
  // Track if handler was recently called to prevent double execution
  let handlerCalled = false;
  const press = onLongPress ? addLongPressListener(button, onLongPress) : null;

  const callHandler = () => {
    // The tap that ends a hold still arrives; the hold already acted.
    if (press?.consume()) return;
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
 * Fire a handler when a control is held down. For a button that also has a
 * tap action, use addMobileButtonListener's onLongPress option instead,
 * which ignores the tap that ends the hold.
 *
 * @param {!HTMLElement} el - Control element
 * @param {function(): void} onLongPress - Called once the hold lasts `ms`
 * @param {number=} ms - Hold duration
 * @returns {{consume: function(): boolean}} `consume()` is true once after
 *     each long press, so the tap that ends it can be ignored
 */
export function addLongPressListener(el, onLongPress, ms = 500) {
  const MOVE_TOLERANCE = 10; // pixels
  let timer = null;
  let fired = false;
  let startX = 0;
  let startY = 0;

  const cancel = () => {
    clearTimeout(timer);
    timer = null;
  };
  const start = (x, y) => {
    cancel();
    fired = false;
    startX = x;
    startY = y;
    timer = setTimeout(() => {
      timer = null;
      fired = true;
      onLongPress();
    }, ms);
  };

  el.addEventListener('touchstart', (e) => {
    const t = e.touches?.[0];
    start(t?.clientX ?? 0, t?.clientY ?? 0);
  }, {passive: true});
  el.addEventListener('touchmove', (e) => {
    const t = e.touches?.[0];
    if (t && (Math.abs(t.clientX - startX) > MOVE_TOLERANCE ||
        Math.abs(t.clientY - startY) > MOVE_TOLERANCE)) {
      cancel();
    }
  }, {passive: true});
  el.addEventListener('mousedown', (e) => start(e.clientX, e.clientY));
  for (const type of ['touchend', 'touchcancel', 'mouseup', 'mouseleave']) {
    el.addEventListener(type, cancel);
  }
  // Android shows a context menu on a held button.
  el.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    consume() {
      const wasLongPress = fired;
      fired = false;
      return wasLongPress;
    },
  };
}

/**
 * The app UI is English regardless of the device locale, so date formatting is
 * pinned here rather than rendering as e.g. "28 août".
 * @const {string}
 */
export const APP_LOCALE = 'en-US';

/**
 * Clock time of day in the device's time zone, e.g. "21:47".
 * @param {!Date} date
 * @returns {string}
 */
export function formatClockTime(date) {
  return date.toLocaleTimeString(APP_LOCALE,
      {hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});
}

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

/**
 * JSON-serialize a value into localStorage, swallowing any failure
 * (unavailable store, quota, circular value).
 * @param {string} key
 * @param {*} value
 * @returns {boolean} True on success.
 */
export function safeSetJson(key, value) {
  const store = safeLocalStorage();
  if (!store) return false;
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Read and JSON-parse a value from localStorage, returning null on any
 * failure (unavailable store, missing key, malformed JSON).
 * @param {string} key
 * @returns {*} The parsed value, or null.
 */
export function safeGetJson(key) {
  const store = safeLocalStorage();
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    return raw == null ? null : JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

/**
 * Set an element's text only when it differs. Assigning textContent always
 * replaces the text node and invalidates style, even for identical text, which
 * adds up for readouts written on every input event.
 * @param {?Element} el - Target element (no-op when missing)
 * @param {string} text - Text to show
 */
export function setTextIfChanged(el, text) {
  if (el && el.textContent !== text) el.textContent = text;
}
