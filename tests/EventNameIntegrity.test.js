/**
 * @fileoverview Guards against referencing an Events constant that does not
 * exist.
 *
 * `Events.NOT_A_REAL_EVENT` evaluates to undefined rather than throwing, so an
 * emit under that name publishes to the key "undefined" and reaches nobody,
 * and a subscription to it never fires. CompassController shipped three such
 * emits. Nothing in the language or the test suite catches this, so it is
 * checked structurally here.
 */

import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

import {Events} from '../modules/core/EventBus.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set([
  'node_modules', 'tests', 'android', 'www', 'build', 'coverage', '.venv',
  '.git', '__pycache__', '__mocks__',
]);

/**
 * @param {string} dir
 * @param {!Array<string>} out
 * @return {!Array<string>}
 */
function collectJsFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collectJsFiles(full, out);
    } else if (entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) {
      out.push(full);
    }
  }
  return out;
}

describe('Events constant integrity', () => {
  const files = collectJsFiles(REPO_ROOT);

  test('finds the production sources to scan', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  test('every Events.X referenced in production code is defined', () => {
    const defined = new Set(Object.keys(Events));
    const unknown = [];

    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(/\bEvents\.([A-Z0-9_]+)\b/g)) {
        const name = match[1];
        if (defined.has(name)) continue;
        const line = source.slice(0, match.index).split('\n').length;
        unknown.push(`${path.relative(REPO_ROOT, file)}:${line} Events.${name}`);
      }
    }

    expect(unknown).toEqual([]);
  });

  test('every event name maps to a distinct string', () => {
    const byValue = new Map();
    const duplicates = [];

    for (const [name, value] of Object.entries(Events)) {
      if (byValue.has(value)) {
        duplicates.push(`${byValue.get(value)} and ${name} both use "${value}"`);
      }
      byValue.set(value, name);
    }

    expect(duplicates).toEqual([]);
  });
});
