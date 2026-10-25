/**
 * @fileoverview Loads the vendored astronomy-engine browser build as the
 * `Astronomy` global, the way app.html does, so modules that use it can be
 * tested against real ephemerides.
 */

import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const VENDOR_PATH = fileURLToPath(
    new URL('../../vendor/astronomy.browser.min.js', import.meta.url));

/**
 * Define global.Astronomy. Evaluated in this realm (not a vm context) so the
 * Dates it returns pass instanceof checks.
 * @returns {!Object} The Astronomy namespace
 */
export function installAstronomy() {
  if (!global.Astronomy) {
    const module = {exports: {}};
    new Function('module', 'exports', readFileSync(VENDOR_PATH, 'utf8'))(module, module.exports);
    global.Astronomy = module.exports;
  }
  return global.Astronomy;
}
