/**
 * @jest-environment node
 * @fileoverview Tests for VisibilityCalculator (altitude/visibility math).
 */

import {jest} from '@jest/globals';
import {
  calculateAltitude,
  isAboveHorizon,
  isCircumpolar,
  neverRises,
  transitAltitude,
  VisibilityCalculator,
} from '../../modules/features/VisibilityCalculator.js';

describe('VisibilityCalculator pure functions', () => {
  describe('calculateAltitude', () => {
    test('equals 90 - |lat - dec| at transit (LST === RA)', () => {
      // Hour angle is zero when LST equals RA, so altitude is maximal.
      expect(calculateAltitude(100, 45, 45, 100)).toBeCloseTo(90, 6);
      expect(calculateAltitude(100, 0, 45, 100)).toBeCloseTo(45, 6);
      expect(calculateAltitude(30, 20, 50, 30)).toBeCloseTo(90 - 30, 6);
    });

    test('object on the celestial equator at transit for a 45 deg observer', () => {
      expect(calculateAltitude(0, 0, 45, 0)).toBeCloseTo(45, 6);
    });

    test('wraps hour angle correctly regardless of RA/LST offset direction', () => {
      // +6h and -6h hour angles give the same altitude (symmetry).
      const east = calculateAltitude(0, 20, 40, 90);
      const west = calculateAltitude(0, 20, 40, -90);
      expect(east).toBeCloseTo(west, 6);
    });

    test('returns a value within [-90, 90]', () => {
      const alt = calculateAltitude(123, -60, 30, 250);
      expect(alt).toBeGreaterThanOrEqual(-90);
      expect(alt).toBeLessThanOrEqual(90);
    });
  });

  describe('transitAltitude', () => {
    test('is 90 - |lat - dec|', () => {
      expect(transitAltitude(45, 45)).toBe(90);
      expect(transitAltitude(0, 45)).toBe(45);
      expect(transitAltitude(-30, 40)).toBe(90 - 70);
    });

    test('matches calculateAltitude at transit', () => {
      expect(transitAltitude(20, 50)).toBeCloseTo(
        calculateAltitude(0, 20, 50, 0), 6);
    });
  });

  describe('isCircumpolar', () => {
    test('northern hemisphere: dec >= 90 - lat', () => {
      expect(isCircumpolar(45, 50)).toBe(true); // 45 >= 40
      expect(isCircumpolar(30, 50)).toBe(false); // 30 < 40
      expect(isCircumpolar(40, 50)).toBe(true); // boundary inclusive
    });

    test('southern hemisphere: dec <= -(90 + lat)', () => {
      expect(isCircumpolar(-50, -45)).toBe(true); // -50 <= -45
      expect(isCircumpolar(-40, -45)).toBe(false); // -40 > -45
    });
  });

  describe('neverRises', () => {
    test('northern hemisphere: dec <= -(90 - lat)', () => {
      expect(neverRises(-45, 50)).toBe(true); // -45 <= -40
      expect(neverRises(-30, 50)).toBe(false); // -30 > -40
    });

    test('southern hemisphere: dec >= 90 + lat', () => {
      expect(neverRises(50, -45)).toBe(true); // 50 >= 45
      expect(neverRises(40, -45)).toBe(false); // 40 < 45
    });

    test('a circumpolar object never "never rises"', () => {
      // dec=80 at lat=50 is circumpolar and must not also never-rise.
      expect(isCircumpolar(80, 50)).toBe(true);
      expect(neverRises(80, 50)).toBe(false);
    });
  });

  describe('isAboveHorizon', () => {
    test('true when altitude >= minAltitude', () => {
      expect(isAboveHorizon(0, 45, 45, 0)).toBe(true); // ~90 deg
    });

    test('false when altitude below the minimum', () => {
      // dec=-80 from lat=45 is deep below the horizon at transit.
      expect(isAboveHorizon(0, -80, 45, 0)).toBe(false);
    });

    test('respects a custom minimum altitude', () => {
      // Transit altitude here is 45 deg; require 60.
      expect(isAboveHorizon(0, 0, 45, 0, 60)).toBe(false);
      expect(isAboveHorizon(0, 0, 45, 0, 30)).toBe(true);
    });
  });
});

describe('VisibilityCalculator class', () => {
  /**
   * Build a calculator with injected fakes.
   * @param {!Object} data Overrides for location/lst/planets/dsos/stars.
   * @return {!VisibilityCalculator}
   */
  const makeCalc = (data = {}) => new VisibilityCalculator({
    getLocation: jest.fn(() => data.location ?? {lat: 45, lon: 0}),
    getLST: jest.fn(() => data.lst ?? 0),
    getPlanets: jest.fn(() => data.planets ?? []),
    getDSOs: jest.fn(() => data.dsos ?? []),
    getStars: jest.fn(() => data.stars ?? []),
  });

  describe('getBestVisibleObjectsTonight', () => {
    // Relocated from TourController, which used to carry its own copy of
    // this query.
    test('returns an array', () => {
      expect(Array.isArray(makeCalc().getBestVisibleObjectsTonight()))
          .toBe(true);
    });

    test('excludes the Sun and the Moon', () => {
      const calc = makeCalc({
        location: {lat: 0, lon: 0},
        planets: [
          {name: 'Sun', ra: 0, dec: 0, mag: -26},
          {name: 'Moon', ra: 0, dec: 0, mag: -12},
          {name: 'Mars', ra: 0, dec: 0, mag: 1},
        ],
      });

      const names = calc.getBestVisibleObjectsTonight().map((o) => o.name);

      expect(names).toContain('Mars');
      expect(names).not.toContain('Sun');
      expect(names).not.toContain('Moon');
    });

    test('sorts brightest first', () => {
      const calc = makeCalc({
        location: {lat: 0, lon: 0},
        dsos: [
          {name: 'NGC3', ra: 0, dec: 0, mag: 8, type: 'G'},
          {name: 'NGC1', ra: 0, dec: 0, mag: 4, type: 'G'},
          {name: 'NGC2', ra: 0, dec: 0, mag: 6, type: 'G'},
        ],
      });

      const objects = calc.getBestVisibleObjectsTonight();

      expect(objects.map((o) => o.mag)).toEqual([4, 6, 8]);
    });

    test('honours the object limit', () => {
      const dsos = Array.from({length: 80}, (_, i) => (
        {name: `NGC${i}`, ra: 0, dec: 0, mag: 1 + i / 100, type: 'G'}));

      expect(makeCalc({location: {lat: 0, lon: 0}, dsos})
          .getBestVisibleObjectsTonight(15, 10, 50)).toHaveLength(50);
    });

    // TourController and skymap.js each carried a ten-entry label table, so a
    // type outside those ten showed a raw catalog code in one list and a full
    // name in another. TypeMappings has thirty-odd.
    test('labels deep sky objects with the shared type table', () => {
      const calc = makeCalc({
        location: {lat: 0, lon: 0},
        dsos: [{name: 'NGC1', ra: 0, dec: 0, mag: 5, type: 'GPair'}],
      });

      const [object] = calc.getBestVisibleObjectsTonight();

      expect(object.typeName).toBe('Galaxy Pair');
      expect(object.description).toContain('Galaxy Pair');
    });

    test('joins a list of common names readably', () => {
      const calc = makeCalc({
        location: {lat: 0, lon: 0},
        dsos: [{
          name: 'Mel22', ra: 0, dec: 0, mag: 1.6, type: 'OCl',
          common_names: ['Pleiades', 'Seven Sisters'],
        }],
      });

      const [object] = calc.getBestVisibleObjectsTonight();

      expect(object.description).toContain('(Pleiades, Seven Sisters)');
    });

    test('includes a high, bright DSO and excludes a low one', () => {
      const calc = makeCalc({
        location: {lat: 0, lon: 0},
        lst: 0,
        dsos: [
          {name: 'NGC1', ra: 0, dec: 0, mag: 5, type: 'G'}, // transit alt 90
          {name: 'NGC2', ra: 0, dec: -80, mag: 5, type: 'G'}, // far below
        ],
      });
      const result = calc.getBestVisibleObjectsTonight(15, 10, 50);
      const names = result.map((o) => o.name);
      expect(names).toContain('NGC1');
      expect(names).not.toContain('NGC2');
    });

    test('excludes stellar object types', () => {
      const calc = makeCalc({
        location: {lat: 0, lon: 0},
        dsos: [
          {name: 'DoubleStar', ra: 0, dec: 0, mag: 4, type: '**'},
          {name: 'Galaxy', ra: 0, dec: 0, mag: 4, type: 'G'},
        ],
      });
      const names = calc.getBestVisibleObjectsTonight().map((o) => o.name);
      expect(names).toContain('Galaxy');
      expect(names).not.toContain('DoubleStar');
    });

    test('excludes DSOs fainter than maxMagnitude', () => {
      const calc = makeCalc({
        location: {lat: 0, lon: 0},
        dsos: [{name: 'Faint', ra: 0, dec: 0, mag: 12, type: 'G'}],
      });
      expect(calc.getBestVisibleObjectsTonight(15, 10, 50)).toHaveLength(0);
    });

    test('sorts by magnitude (brightest first) and limits count', () => {
      const calc = makeCalc({
        location: {lat: 0, lon: 0},
        dsos: [
          {name: 'A', ra: 0, dec: 0, mag: 8, type: 'G'},
          {name: 'B', ra: 0, dec: 0, mag: 3, type: 'G'},
          {name: 'C', ra: 0, dec: 0, mag: 5, type: 'G'},
        ],
      });
      const result = calc.getBestVisibleObjectsTonight(15, 10, 2);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('B');
      expect(result[1].name).toBe('C');
    });

    test('skips the Sun and Moon planets', () => {
      const calc = makeCalc({
        location: {lat: 0, lon: 0},
        planets: [
          {name: 'Sun', ra: 0, dec: 0, mag: -26},
          {name: 'Jupiter', ra: 0, dec: 0, mag: -2},
        ],
      });
      const names = calc.getBestVisibleObjectsTonight().map((o) => o.name);
      expect(names).toContain('Jupiter');
      expect(names).not.toContain('Sun');
    });

    test('falls back to defaults when dependencies return nullish', () => {
      const calc = new VisibilityCalculator({
        getLocation: jest.fn(() => null),
        getLST: jest.fn(() => null),
        getPlanets: jest.fn(() => null),
        getDSOs: jest.fn(() => null),
        getStars: jest.fn(() => null),
      });
      expect(calc.getBestVisibleObjectsTonight()).toEqual([]);
    });
  });

  describe('isObjectVisible', () => {
    test('reports visible with altitude at transit', () => {
      const calc = makeCalc({location: {lat: 45, lon: 0}, lst: 0});
      const result = calc.isObjectVisible(0, 45, 15);
      expect(result.visible).toBe(true);
      expect(result.altitude).toBeCloseTo(90, 6);
    });

    test('reports not visible when below the minimum', () => {
      const calc = makeCalc({location: {lat: 45, lon: 0}, lst: 0});
      expect(calc.isObjectVisible(0, -80, 15).visible).toBe(false);
    });
  });

  describe('getObjectsAboveHorizon', () => {
    test('returns only objects above the minimum altitude', () => {
      const calc = makeCalc({
        location: {lat: 0, lon: 0},
        lst: 0,
        planets: [{name: 'Mars', ra: 0, dec: 0, mag: 1}],
        dsos: [{name: 'Low', ra: 0, dec: -85, mag: 6, type: 'G'}],
      });
      const result = calc.getObjectsAboveHorizon(10);
      const names = result.map((o) => o.name);
      expect(names).toContain('Mars');
      expect(names).not.toContain('Low');
    });
  });
});
