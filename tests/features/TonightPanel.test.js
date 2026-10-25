/**
 * @jest-environment jsdom
 * @fileoverview Tests for the Tonight panel.
 */

import {jest} from '@jest/globals';
import {installAstronomy} from '../helpers/astronomy.js';
import {TonightPanel, moonTonight} from '../../modules/features/TonightPanel.js';
import {observingLists} from '../../modules/features/ObservingLists.js';

installAstronomy();

const M42 = {name: 'NGC1976', messier: 42, type: 'HII', ra: 83.82, dec: -5.39, mag: 4.0,
  common_names: 'Orion Nebula'};
const M31 = {name: 'NGC0224', messier: 31, type: 'G', ra: 10.68, dec: 41.27, mag: 3.4};
const JUPITER = {name: 'Jupiter', ra: 110, dec: 22, mag: -2.6};
const MOON = {name: 'Moon', ra: 200, dec: -10, mag: -10, phase: 0.1};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('TonightPanel', () => {
  let panel;
  let deps;
  let openCallback;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = `
      <div id="tonight-summary"></div>
      <div id="tonight-weather"></div>
      <div id="tonight-instrument">
        <button data-instrument="eye"></button><button data-instrument="telescope"></button>
      </div>
      <div id="tonight-sort">
        <button data-sort="best"></button><button data-sort="brightest"></button>
      </div>
      <div id="tonight-filter">
        <button data-filter="all"></button><button data-filter="galaxies"></button>
        <button data-filter="wanted"></button>
      </div>
      <ol id="tonight-list"></ol>
      <input type="checkbox" id="weather-toggle">`;
    deps = {
      getLocation: () => ({lat: 48.8566, lon: 2.3522}),
      getTime: () => new Date('2026-12-21T20:00:00Z'),
      getPlanets: () => [JUPITER, MOON],
      getDSOs: () => [M42, M31],
      getStars: () => [{proper: 'Capella', ra: 79.17, dec: 45.99, mag: 0.08}],
      getNakedEyeLimit: () => 6,
      getTelescopeLimit: () => 13,
      selectObject: jest.fn(),
      openLocationDialog: jest.fn(),
      weather: {
        getForecast: jest.fn(async () => [
          {time: new Date('2026-12-21T20:00:00Z'), cloudCover: 10, temperature: 5, dewPoint: 1},
          {time: new Date('2026-12-21T21:00:00Z'), cloudCover: 90, temperature: 4, dewPoint: 3.5},
        ]),
        isEnabled: () => true,
        setEnabled: jest.fn(),
      },
      panelManager: {
        onOpen: (id, cb) => {
          openCallback = cb;
        },
        isPanelOpen: () => true,
        closeAll: jest.fn(),
      },
    };
    panel = new TonightPanel(deps);
    panel.initialize();
  });

  afterEach(() => panel.dispose());

  const rowNames = () => [...document.querySelectorAll('.tonight-row__name')]
      .map((e) => e.textContent);

  test('opening the panel shows the dark window and the Moon', () => {
    openCallback();
    const summary = document.getElementById('tonight-summary').textContent;
    expect(summary).toMatch(/Dark \d\d:\d\d → \d\d:\d\d/);
    expect(summary).toContain('Moon:');
  });

  test('lists the best targets, planets first', () => {
    openCallback();
    expect(rowNames()[0]).toBe('Jupiter');
    expect(rowNames()).toContain('M42 · Orion Nebula');
  });

  test('a filter keeps only that kind of object', () => {
    openCallback();
    document.querySelector('[data-filter="galaxies"]').click();
    expect(rowNames()).toEqual(['M31']);
  });

  test('tapping a row closes the panel and selects the object', () => {
    openCallback();
    document.querySelector('.tonight-row').click();
    expect(deps.panelManager.closeAll).toHaveBeenCalled();
    expect(deps.selectObject).toHaveBeenCalledWith(expect.objectContaining({name: 'Jupiter'}));
  });

  test('remembers the chosen sort', () => {
    openCallback();
    document.querySelector('[data-sort="brightest"]').click();
    const again = new TonightPanel(deps);
    again.initialize();
    openCallback();
    expect(document.querySelector('[data-sort="brightest"]')
        .getAttribute('aria-checked')).toBe('true');
    again.dispose();
  });

  test('summarises the cloud forecast and warns about dew', async () => {
    openCallback();
    await flush();
    const weather = document.getElementById('tonight-weather').textContent;
    expect(weather).toContain('Clear 1 of 2 hours');
    expect(weather).toContain('dew likely');
  });

  test('works without a forecast', async () => {
    deps.weather.getForecast.mockResolvedValue(null);
    openCallback();
    await flush();
    expect(document.getElementById('tonight-weather').textContent)
        .toContain('No cloud forecast');
    expect(rowNames().length).toBeGreaterThan(0);
  });

  test('My list shows wanted objects and names those not up tonight', () => {
    observingLists.toggleWanted('M31');
    observingLists.toggleWanted('M83');
    openCallback();
    document.querySelector('[data-filter="wanted"]').click();
    expect(rowNames()).toEqual(['M31']);
    expect(document.getElementById('tonight-list').textContent).toContain('M83');
    observingLists.toggleWanted('M31');
    observingLists.toggleWanted('M83');
  });

  test('My list includes wanted stars', () => {
    observingLists.toggleWanted('Capella');
    openCallback();
    document.querySelector('[data-filter="wanted"]').click();
    expect(rowNames()).toEqual(['Capella']);
    observingLists.toggleWanted('Capella');
  });

  test('turning the forecast off hides it at once', async () => {
    openCallback();
    await flush();
    deps.weather.getForecast.mockResolvedValue(null);
    const toggle = document.getElementById('weather-toggle');
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));
    await flush();
    expect(deps.weather.setEnabled).toHaveBeenCalledWith(false);
    expect(document.getElementById('tonight-weather').textContent).toContain('No cloud forecast');
  });

  test('the location link opens the location dialog', () => {
    openCallback();
    document.querySelector('[data-action="location"]').click();
    expect(deps.openLocationDialog).toHaveBeenCalled();
  });
});

describe('moonTonight', () => {
  const at = (iso) => new Date(iso);

  test('lists the night\'s events in time order', () => {
    expect(moonTonight({moonUpAtDusk: true, moonrise: at('2026-12-22T05:00:00Z'),
      moonset: at('2026-12-21T23:00:00Z')})).toMatch(/^sets .*, rises /);
  });

  test('says when the Moon stays up or down all night', () => {
    expect(moonTonight({moonUpAtDusk: true, moonrise: null, moonset: null})).toBe('up all night');
    expect(moonTonight({moonUpAtDusk: false, moonrise: null, moonset: null}))
        .toBe('down all night');
  });
});
