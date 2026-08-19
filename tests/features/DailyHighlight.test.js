/**
 * @fileoverview Tests for Tonight's Highlight — the daily featured object.
 *
 * Contract: one pick per calendar day (stable all day, varies day to day),
 * drawn from the showcase-worthy objects visible tonight; a famous-object
 * fallback when there's no location; nothing obscure ever surfaces.
 */

import {jest} from '@jest/globals';
import {DailyHighlight} from '../../modules/features/DailyHighlight.js';

/** A visible-object entry as VisibilityCalculator emits them. */
function dso(name, {alt = 40, messier = null, common = null} = {}) {
  return {
    name, ra: 10, dec: 20, mag: 5, altitude: alt, type: 'G',
    data: {name, common_names: common, messier},
  };
}

function planet(name, alt = 50) {
  return {name, ra: 5, dec: 5, mag: 1, altitude: alt, type: 'Planet'};
}

describe('DailyHighlight', () => {
  const AT_PARIS = {lat: 48.8566, lon: 2.3522};

  /**
   * @param {!Object} overrides
   * @returns {!DailyHighlight}
   */
  function make(overrides = {}) {
    return new DailyHighlight({
      getVisibleObjects: () => [],
      getLocation: () => AT_PARIS,
      getFamousObjects: () => [],
      calculateLST: () => 0,
      now: () => new Date(2026, 5, 15, 23, 0, 0),
      ...overrides,
    });
  }

  describe('with a location', () => {
    test('features a showcase-worthy object that is up tonight', () => {
      const hl = make({
        getVisibleObjects: () => [
          dso('NGC 224', {common: 'Andromeda Galaxy', alt: 60}),
          planet('Jupiter'),
        ],
      }).getHighlight();

      expect(hl).not.toBeNull();
      expect(['NGC 224', 'Jupiter']).toContain(hl.name);
      expect(hl.label).toMatch(/tonight/i);
    });

    test('never features an obscure object even if it is visible', () => {
      // Only an unnamed, non-Messier DSO is up — nothing worth featuring.
      const hl = make({
        getVisibleObjects: () => [dso('NGC 5303', {alt: 70})],
        getFamousObjects: () => [],
      }).getHighlight();

      // Falls through to the (empty) fallback rather than showing the obscure one.
      expect(hl).toBeNull();
    });

    test('the pick is stable for a given day', () => {
      const pool = [
        dso('M31', {messier: 31}), dso('M42', {messier: 42}),
        dso('M13', {messier: 13}), planet('Saturn'),
      ];
      const a = make({getVisibleObjects: () => pool}).getHighlight();
      const b = make({getVisibleObjects: () => pool}).getHighlight();

      expect(a.name).toBe(b.name);
    });

    test('a different day can pick a different object', () => {
      const pool = [
        dso('M31', {messier: 31}), dso('M42', {messier: 42}),
        dso('M13', {messier: 13}), dso('M45', {messier: 45}),
        planet('Saturn'), planet('Mars'),
      ];
      const names = new Set();
      for (let day = 1; day <= 20; day++) {
        const hl = make({
          getVisibleObjects: () => pool,
          now: () => new Date(2026, 5, day, 23, 0, 0),
        }).getHighlight();
        names.add(hl.name);
      }
      // Over 20 days it should land on more than one object.
      expect(names.size).toBeGreaterThan(1);
    });
  });

  describe('without a location', () => {
    test('falls back to a famous object, still by date', () => {
      const famous = [
        {name: 'NGC 224', common_names: 'Andromeda Galaxy', mag: 3.4},
        {name: 'NGC 1976', common_names: 'Orion Nebula', mag: 4.0},
      ];
      const hl = make({
        getLocation: () => null,
        getFamousObjects: () => famous,
      }).getHighlight();

      expect(hl).not.toBeNull();
      expect(['Andromeda Galaxy', 'Orion Nebula']).toContain(hl.name);
    });

    test('returns null when there is nothing to show at all', () => {
      const hl = make({
        getLocation: () => null,
        getFamousObjects: () => [],
      }).getHighlight();

      expect(hl).toBeNull();
    });
  });
});
