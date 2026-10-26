/**
 * @jest-environment jsdom
 * @fileoverview Tests for the sky colour and the Milky Way.
 */

import {installThreeMock} from '../helpers/threeMock.js';

installThreeMock();

const {SkyBackground, milkyWayStrength, skyColor} =
    await import('../../modules/rendering/SkyBackground.js');
const {SKY} = await import('../../modules/core/Constants.js');

const DARK = {sunAltitude: -30, moonAltitude: -30, moonLit: 0};

describe('skyColor', () => {
  test('black once the Sun is 18 degrees down', () => {
    expect(skyColor(-25)).toEqual([0, 0, 0]);
  });

  test('brightens through twilight', () => {
    const [, , blueNautical] = skyColor(-10);
    const [, , blueCivil] = skyColor(-3);
    expect(blueCivil).toBeGreaterThan(blueNautical);
    expect(blueNautical).toBeGreaterThan(0);
  });
});

describe('milkyWayStrength', () => {
  test('full on a dark moonless night, zoomed out', () => {
    expect(milkyWayStrength(DARK, 90)).toBeCloseTo(SKY.MILKY_WAY_BRIGHTNESS);
  });

  test('gone in twilight', () => {
    expect(milkyWayStrength({...DARK, sunAltitude: -8}, 90)).toBe(0);
  });

  test('a full Moon high up washes most of it out', () => {
    const moonlit = milkyWayStrength({...DARK, moonAltitude: 40, moonLit: 1}, 90);
    expect(moonlit).toBeLessThan(milkyWayStrength(DARK, 90) / 2);
  });

  test('hidden when zoomed in close', () => {
    expect(milkyWayStrength(DARK, 2)).toBe(0);
  });
});

describe('SkyBackground', () => {
  let scene;
  let sky;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<input type="checkbox" id="milky-way-toggle">';
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0, 0, 0);
    sky = new SkyBackground({scene, celestialSphere: new THREE.Group()});
    sky.initialize();
  });

  afterEach(() => sky.dispose());

  test('colours the sky for twilight', () => {
    sky.setSky({...DARK, sunAltitude: -4});
    expect(scene.background.b).toBeGreaterThan(0);
  });

  test('the settings switch hides the Milky Way and is remembered', () => {
    sky.setSky(DARK);
    sky.setViewFov(90);
    const toggle = document.getElementById('milky-way-toggle');
    expect(toggle.checked).toBe(true);
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));

    const reloaded = new SkyBackground({scene, celestialSphere: new THREE.Group()});
    reloaded.initialize();
    expect(document.getElementById('milky-way-toggle').checked).toBe(false);
    reloaded.dispose();
  });
});
