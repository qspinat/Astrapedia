/**
 * @fileoverview Security utility functions for the Astrapedia application.
 * Provides XSS prevention and input sanitization.
 */

/**
 * Escape HTML special characters to prevent XSS attacks.
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for HTML insertion
 */
export const escapeHtml = (str) => {
  if (typeof str !== 'string') return String(str);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

/**
 * Fetch from Wikipedia API with proper User-Agent header.
 * Wikipedia requires a descriptive User-Agent for API requests.
 * @param {string} url - Wikipedia API URL
 * @param {?AbortSignal=} signal - Optional AbortSignal for cancellation
 * @returns {Promise<Response>} Fetch response
 */
export const fetchWikipedia = (url, signal = null) => {
  const options = {
    headers: {
      'Api-User-Agent': 'Astrapedia/1.0 (https://github.com/qspinat/Astrapedia; ' +
                        'https://github.com/qspinat/Astrapedia/issues) fetch/1.0',
    },
  };
  if (signal) {
    options.signal = signal;
  }
  return fetch(url, options);
};
