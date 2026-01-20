/**
 * @fileoverview Security utility functions for the SkyMap application.
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
 * @returns {Promise<Response>} Fetch response
 */
export const fetchWikipedia = (url) => {
  return fetch(url, {
    headers: {
      'Api-User-Agent': 'SkyMap/1.0 (https://github.com/qspinat/SkyMap; ' +
                        'contact@skymap.app) fetch/1.0',
    },
  });
};
