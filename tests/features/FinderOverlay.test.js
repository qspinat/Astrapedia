/**
 * @jest-environment jsdom
 * @fileoverview Tests for the finder circles overlay.
 */

import {jest} from '@jest/globals';
import {
  FinderOverlay,
  ringRadiusPx,
} from '../../modules/features/FinderOverlay.js';
import {FINDER} from '../../modules/core/Constants.js';
import {globalEventBus, Events} from '../../modules/core/EventBus.js';

describe('ringRadiusPx', () => {
  test('a ring as wide as the view spans the full height', () => {
    expect(ringRadiusPx(60, 60, 800)).toBeCloseTo(400);
  });

  test('halving the FOV doubles a small ring', () => {
    const wide = ringRadiusPx(1, 20, 800);
    const narrow = ringRadiusPx(1, 10, 800);
    expect(narrow / wide).toBeCloseTo(2, 1);
  });
});

describe('FinderOverlay', () => {
  let overlay;
  let eyepieces;

  const rings = () => [...document.querySelectorAll('#finder-overlay circle')];
  const ringClasses = () => rings().map((c) => c.getAttribute('class'));

  beforeEach(() => {
    localStorage.clear();
    globalEventBus.clear();
    document.body.innerHTML = `
      <svg id="finder-overlay"></svg>
      <input type="checkbox" id="finder-toggle">
      <input type="checkbox" id="finder-telrad-toggle">
      <input type="checkbox" id="finder-scope-toggle">
      <input type="checkbox" id="finder-eyepieces-toggle">
      <input type="number" id="finder-scope-fov">`;
    window.innerWidth = 400;
    window.innerHeight = 800;
    eyepieces = [{focalLength: 25, realFieldOfView: 1.3}];
    overlay = new FinderOverlay({getEyepieces: () => eyepieces});
    overlay.initialize();
  });

  afterEach(() => {
    overlay.dispose();
    document.body.innerHTML = '';
  });

  test('draws nothing until turned on', () => {
    overlay.update(20);
    expect(rings()).toHaveLength(0);
  });

  test('draws Telrad, finder and eyepiece rings when on', () => {
    overlay.setSettings({enabled: true});
    overlay.update(20);
    expect(ringClasses()).toEqual([
      'finder-ring finder-ring--telrad',
      'finder-ring finder-ring--telrad',
      'finder-ring finder-ring--telrad',
      'finder-ring finder-ring--finder',
      'finder-ring finder-ring--eyepiece',
    ]);
  });

  test('sizes rings to the sky at the current zoom', () => {
    overlay.setSettings({enabled: true, telrad: false, eyepieces: false});
    overlay.update(10);
    const r = parseFloat(rings()[0].getAttribute('r'));
    expect(r).toBeCloseTo(ringRadiusPx(FINDER.DEFAULT_FINDER_FOV, 10, 800), 0);
  });

  test('skips rings too small to see', () => {
    overlay.setSettings({enabled: true, finderScope: false, eyepieces: false});
    overlay.update(120);
    // At 120 degrees the 0.5 degree Telrad ring is under 3px.
    expect(rings()).toHaveLength(2);
  });

  test('redraws eyepiece rings when the kit changes', () => {
    overlay.setSettings({enabled: true, telrad: false, finderScope: false});
    overlay.update(20);
    eyepieces = [...eyepieces, {focalLength: 10, realFieldOfView: 0.68}];
    globalEventBus.emit(Events.TELESCOPE_COMPUTED, {});
    expect(rings()).toHaveLength(2);
    expect(document.querySelector('#finder-overlay').textContent).toContain('10mm');
  });

  test('the panel toggle turns it on and is remembered', () => {
    const toggle = document.getElementById('finder-toggle');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    overlay.update(20);
    expect(rings().length).toBeGreaterThan(0);

    const reloaded = new FinderOverlay({getEyepieces: () => []});
    reloaded.initialize();
    expect(reloaded.getSettings().enabled).toBe(true);
    reloaded.dispose();
  });

  test('the finder field input resizes the finder ring', () => {
    overlay.setSettings({enabled: true, telrad: false, eyepieces: false});
    overlay.update(20);
    const before = parseFloat(rings()[0].getAttribute('r'));
    const input = document.getElementById('finder-scope-fov');
    input.value = '7';
    input.dispatchEvent(new Event('input'));
    expect(parseFloat(rings()[0].getAttribute('r'))).toBeGreaterThan(before);
  });

  test('ignores malformed stored settings', () => {
    localStorage.setItem(FINDER.STORAGE_KEY, JSON.stringify({enabled: 'yes', finderFov: 7}));
    const loaded = new FinderOverlay({getEyepieces: () => []});
    loaded.initialize();
    expect(loaded.getSettings()).toMatchObject({enabled: false, finderFov: 7});
    loaded.dispose();
  });
});
