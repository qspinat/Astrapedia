/**
 * @fileoverview Guards that the service worker precaches every script the app
 * loads.
 *
 * ES module imports issued on the first visit happen before the service worker
 * controls the page, so they never reach its runtime cache. Anything missing
 * from STATIC_ASSETS is therefore absent offline, and a single missing module
 * makes the whole import graph — and the app — fail to start.
 */

import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @return {!Set<string>} Paths listed in sw.js STATIC_ASSETS.
 */
function precachedAssets() {
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const block = sw.match(/STATIC_ASSETS\s*=\s*\[([\s\S]*?)\]/)[1];
  return new Set([...block.matchAll(/'([^']+)'/g)].map((m) => m[1]));
}

/**
 * @param {string} dir
 * @return {!Array<string>} JS files under dir, as site-root paths.
 */
function jsFilesUnder(dir) {
  return fs.readdirSync(path.join(root, dir), {withFileTypes: true, recursive: true})
      .filter((e) => e.isFile() && e.name.endsWith('.js'))
      .map((e) => '/' + path.relative(root, path.join(e.parentPath, e.name)));
}

describe('service worker precache', () => {
  test('includes every module', () => {
    const assets = precachedAssets();
    const missing = jsFilesUnder('modules').filter((f) => !assets.has(f));
    expect(missing).toEqual([]);
  });

  test('includes every script app.html loads', () => {
    const assets = precachedAssets();
    const html = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
    const scripts = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)]
        .map((m) => '/' + m[1]);
    expect(scripts.filter((s) => !assets.has(s))).toEqual([]);
  });
});
