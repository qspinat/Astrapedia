/**
 * @fileoverview Guards the method contract main.js depends on.
 *
 * main.js reaches every call into AstrapediaApp through optional chaining
 * (`appInstance.foo?.()`), which is deliberate — the app is constructed
 * asynchronously and the UI is wired before init() finishes. The cost is that
 * deleting a method does not break anything loudly: the call silently
 * evaluates to undefined forever.
 *
 * That is not hypothetical. `getSimulationTime()` was removed during a dead
 * code sweep while main.js still wired it into TimeUI, so the Time Machine's
 * date and time pickers quietly began prefilling with the wall clock instead
 * of the simulated time the user had travelled to. Nothing failed; the feature
 * just stopped telling the truth.
 */

import {readFileSync} from 'fs';

const mainSource = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../skymap.js', import.meta.url), 'utf8');

/**
 * Names main.js invokes as methods on the app instance.
 * @return {!Array<string>} Sorted, de-duplicated method names.
 */
function methodsMainCalls() {
  const names = new Set();
  for (const m of mainSource.matchAll(/appInstance\.([A-Za-z_]\w*)\s*\??\.?\(/g)) {
    names.add(m[1]);
  }
  return [...names].sort();
}

/**
 * Method names declared on the AstrapediaApp class body.
 * @return {!Set<string>} Declared method names.
 */
function methodsAppDeclares() {
  const names = new Set();
  // Class methods sit at exactly two spaces of indentation in this file.
  for (const m of appSource.matchAll(/^ {2}(?:async\s+)?([A-Za-z_]\w*)\s*\(/gm)) {
    names.add(m[1]);
  }
  return names;
}

describe('the app API main.js relies on', () => {
  test('main.js calls at least a dozen app methods', () => {
    // Guards the regex itself: a rename that broke the match would otherwise
    // make every assertion below vacuously true.
    expect(methodsMainCalls().length).toBeGreaterThan(12);
  });

  test('every method main.js calls is declared on AstrapediaApp', () => {
    const declared = methodsAppDeclares();

    const missing = methodsMainCalls().filter((name) => !declared.has(name));

    expect(missing).toEqual([]);
  });
});
