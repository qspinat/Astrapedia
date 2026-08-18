/**
 * @fileoverview Checks that everything sw.js precaches exists in www/.
 *
 * The service worker calls cache.addAll(STATIC_ASSETS), which rejects
 * atomically if any single entry 404s — and the rejection is only
 * console.warn'd, so a missing file silently disables offline mode entirely
 * rather than failing loudly. build:web copies an explicit file list, so this
 * catches the two lists drifting apart at build time instead of at runtime on
 * someone's phone.
 */

import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

const block = sw.match(/STATIC_ASSETS\s*=\s*\[([\s\S]*?)\]/);
if (!block) {
  console.error('verify-precache: could not find STATIC_ASSETS in sw.js');
  process.exit(1);
}

const assets = [...block[1].matchAll(/'([^']+)'/g)]
    .map((m) => m[1])
    .filter((a) => a !== '/' && !a.startsWith('http'));

const missing = assets.filter(
    (a) => !fs.existsSync(path.join(root, 'www', a.replace(/^\//, ''))));

if (missing.length) {
  console.error(
      'verify-precache: sw.js precaches files that build:web did not copy ' +
      'into www/. cache.addAll would reject and offline mode would be off:');
  for (const m of missing) console.error(`  ${m}`);
  process.exit(1);
}

console.log(`verify-precache: all ${assets.length} precached assets present`);
