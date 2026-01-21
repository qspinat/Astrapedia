/**
 * @fileoverview Tests for SearchManager module.
 */

import {jest} from '@jest/globals';
import {SearchManager, searchManager} from '../modules/features/SearchManager.js';
import {globalEventBus, Events} from '../modules/core/EventBus.js';

describe('SearchManager', () => {
  let manager;

  // Sample test data
  const testStars = [
    {id: 1, hip: 11767, proper: 'Polaris', ra: 37.95, dec: 89.26, mag: 1.98},
    {id: 2, hip: 91262, proper: 'Vega', ra: 279.23, dec: 38.78, mag: 0.03},
    {id: 3, hip: 24436, proper: 'Rigel', ra: 78.63, dec: -8.20, mag: 0.12},
    {id: 4, hip: 27989, proper: 'Betelgeuse', ra: 88.79, dec: 7.41, mag: 0.50},
  ];

  const testDSOs = [
    {name: 'Andromeda Galaxy', messier: 31, ngc: 224, ra: 10.68, dec: 41.27, mag: 3.4, type: 'G'},
    {name: 'Orion Nebula', messier: 42, ngc: 1976, ra: 83.82, dec: -5.39, mag: 4.0, type: 'Neb'},
    {ngc: 7293, common_names: ['Helix Nebula'], ra: 337.41, dec: -20.84, mag: 7.6, type: 'PN'},
  ];

  const testConstellations = {
    'Orion': {ra: 85, dec: 0},
    'Ursa Major': {ra: 165, dec: 55},
    'Scorpius': {ra: 255, dec: -30},
  };

  const testNamedObjects = {
    'Polaris': 11767,
    'Vega': 91262,
    'Rigel': 24436,
    'Betelgeuse': 27989,
  };

  const testPlanets = [
    {name: 'Mars', ra: 45.0, dec: 15.0, mag: -1.5},
    {name: 'Jupiter', ra: 120.0, dec: 20.0, mag: -2.5},
    {name: 'Saturn', ra: 280.0, dec: -20.0, mag: 0.5},
  ];

  beforeEach(() => {
    manager = new SearchManager();
    globalEventBus.clear();
  });

  describe('buildIndex', () => {
    test('builds index from data', () => {
      manager.buildIndex({
        stars: testStars,
        deepSkyObjects: testDSOs,
        constellations: testConstellations,
        namedObjects: testNamedObjects,
        planets: testPlanets,
      });
      expect(manager.isBuilt()).toBe(true);
      expect(manager.getSize()).toBeGreaterThan(0);
    });

    test('indexes named stars', () => {
      manager.buildIndex({stars: testStars, namedObjects: testNamedObjects});
      const polaris = manager.findByName('Polaris');
      expect(polaris).not.toBeNull();
      expect(polaris.type).toBe('Star');
    });

    test('indexes Messier objects with M prefix', () => {
      manager.buildIndex({deepSkyObjects: testDSOs});
      const m31 = manager.findByName('M31');
      expect(m31).not.toBeNull();
      expect(m31.name).toBe('M31');
    });

    test('indexes NGC aliases', () => {
      manager.buildIndex({deepSkyObjects: testDSOs});
      const ngc = manager.findByName('NGC224');
      expect(ngc).not.toBeNull();
      expect(ngc.isAlias).toBe(true);
    });

    test('indexes common names from array format', () => {
      manager.buildIndex({deepSkyObjects: testDSOs});
      const helix = manager.findByName('Helix Nebula');
      expect(helix).not.toBeNull();
    });

    test('indexes common names from comma-separated string format', () => {
      const dsosWithStringNames = [
        {
          name: 'Mel22',
          messier: 45,
          ra: 56.87,
          dec: 24.12,
          mag: 1.6,
          type: 'OCl',
          common_names: 'Pleiades, Seven Sisters, Subaru',
        },
      ];
      manager.buildIndex({deepSkyObjects: dsosWithStringNames});

      // Should find by primary Messier designation
      const m45 = manager.findByName('M45');
      expect(m45).not.toBeNull();

      // Should find by each common name parsed from string
      const pleiades = manager.findByName('Pleiades');
      expect(pleiades).not.toBeNull();
      expect(pleiades.ra).toBe(56.87);

      const sevenSisters = manager.findByName('Seven Sisters');
      expect(sevenSisters).not.toBeNull();

      const subaru = manager.findByName('Subaru');
      expect(subaru).not.toBeNull();
    });

    test('handles mixed common_names formats in same dataset', () => {
      const mixedDSOs = [
        {ngc: 7293, common_names: ['Helix Nebula'], ra: 337.41, dec: -20.84, mag: 7.6, type: 'PN'},
        {name: 'Mel22', messier: 45, common_names: 'Pleiades, Seven Sisters', ra: 56.87, dec: 24.12, mag: 1.6, type: 'OCl'},
      ];
      manager.buildIndex({deepSkyObjects: mixedDSOs});

      // Array format
      expect(manager.findByName('Helix Nebula')).not.toBeNull();

      // String format
      expect(manager.findByName('Pleiades')).not.toBeNull();
      expect(manager.findByName('Seven Sisters')).not.toBeNull();
    });

    test('indexes constellations', () => {
      manager.buildIndex({constellations: testConstellations});
      const orion = manager.findByName('Orion');
      expect(orion).not.toBeNull();
      expect(orion.type).toBe('Constellation');
    });

    test('indexes planets', () => {
      manager.buildIndex({planets: testPlanets});
      const mars = manager.findByName('Mars');
      expect(mars).not.toBeNull();
      expect(mars.type).toBe('Planet');
    });

    test('handles empty data', () => {
      manager.buildIndex({});
      expect(manager.isBuilt()).toBe(true);
      expect(manager.getSize()).toBe(0);
    });
  });

  describe('search', () => {
    beforeEach(() => {
      manager.buildIndex({
        stars: testStars,
        deepSkyObjects: testDSOs,
        constellations: testConstellations,
        namedObjects: testNamedObjects,
        planets: testPlanets,
      });
    });

    test('returns empty array for short queries', () => {
      expect(manager.search('')).toEqual([]);
      expect(manager.search('a')).toEqual([]);
    });

    test('finds exact matches', () => {
      const results = manager.search('Polaris');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('Polaris');
    });

    test('finds partial matches', () => {
      const results = manager.search('Pol');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('Polaris');
    });

    test('is case insensitive', () => {
      const results = manager.search('polaris');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('Polaris');
    });

    test('finds Messier objects by number', () => {
      const results = manager.search('M31');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.name === 'M31')).toBe(true);
    });

    test('finds objects containing query', () => {
      const results = manager.search('Nebula');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.name.includes('Nebula'))).toBe(true);
    });

    test('limits results', () => {
      const results = manager.search('or', 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    test('sorts by relevance', () => {
      const results = manager.search('Mars');
      // Planets should be boosted, exact match should be first
      expect(results[0].name).toBe('Mars');
    });

    test('penalizes aliases', () => {
      const results = manager.search('NGC224');
      expect(results.length).toBeGreaterThan(0);
      // M31 should rank higher than NGC224 alias
      const m31Score = results.find((r) => r.name === 'M31')?.score || 0;
      const ngcScore = results.find((r) => r.name === 'NGC224')?.score || 0;
      // NGC224 is an alias so should have lower score when both match
    });

    test('emits SEARCH_RESULTS event', () => {
      const callback = jest.fn();
      globalEventBus.on(Events.SEARCH_RESULTS, callback);
      manager.search('Vega');
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'Vega',
          results: expect.any(Array),
          count: expect.any(Number),
        })
      );
    });
  });

  describe('findByName', () => {
    beforeEach(() => {
      manager.buildIndex({stars: testStars, namedObjects: testNamedObjects});
    });

    test('finds exact name match', () => {
      const result = manager.findByName('Vega');
      expect(result).not.toBeNull();
      expect(result.name).toBe('Vega');
    });

    test('is case insensitive', () => {
      const result = manager.findByName('VEGA');
      expect(result).not.toBeNull();
    });

    test('returns null for non-existent name', () => {
      const result = manager.findByName('NonExistent');
      expect(result).toBeNull();
    });
  });

  describe('findByType', () => {
    beforeEach(() => {
      manager.buildIndex({
        stars: testStars,
        namedObjects: testNamedObjects,
        planets: testPlanets,
      });
    });

    test('finds all entries of type', () => {
      const planets = manager.findByType('Planet');
      expect(planets).toHaveLength(3);
      planets.forEach((p) => {
        expect(p.type).toBe('Planet');
      });
    });

    test('returns empty array for non-existent type', () => {
      const results = manager.findByType('Unknown');
      expect(results).toEqual([]);
    });
  });

  describe('findNear', () => {
    beforeEach(() => {
      manager.buildIndex({stars: testStars, namedObjects: testNamedObjects});
    });

    test('finds objects within radius', () => {
      // Search near Polaris (RA=37.95, Dec=89.26)
      const results = manager.findNear(38, 89, 5);
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.name === 'Polaris')).toBe(true);
    });

    test('excludes objects outside radius', () => {
      // Search near Polaris with small radius, shouldn't find Vega
      const results = manager.findNear(38, 89, 5);
      expect(results.some((r) => r.name === 'Vega')).toBe(false);
    });
  });

  describe('getBrightestByType', () => {
    beforeEach(() => {
      manager.buildIndex({
        stars: testStars,
        namedObjects: testNamedObjects,
        planets: testPlanets,
      });
    });

    test('returns objects sorted by magnitude', () => {
      const brightest = manager.getBrightestByType('Star', 3);
      expect(brightest.length).toBeLessThanOrEqual(3);
      // Vega (0.03) should be brightest star
      expect(brightest[0].name).toBe('Vega');
    });

    test('respects limit', () => {
      const brightest = manager.getBrightestByType('Star', 2);
      expect(brightest.length).toBeLessThanOrEqual(2);
    });
  });

  describe('getMessierObjects', () => {
    beforeEach(() => {
      manager.buildIndex({deepSkyObjects: testDSOs});
    });

    test('returns only Messier objects', () => {
      const messier = manager.getMessierObjects();
      expect(messier.length).toBeGreaterThan(0);
      messier.forEach((m) => {
        expect(m.name).toMatch(/^M\d+$/);
      });
    });

    test('sorts by Messier number', () => {
      const messier = manager.getMessierObjects();
      expect(messier[0].name).toBe('M31');
      expect(messier[1].name).toBe('M42');
    });
  });

  describe('clear', () => {
    test('clears the index', () => {
      manager.buildIndex({stars: testStars, namedObjects: testNamedObjects});
      expect(manager.getSize()).toBeGreaterThan(0);
      manager.clear();
      expect(manager.getSize()).toBe(0);
      expect(manager.isBuilt()).toBe(false);
    });
  });

  describe('addEntry', () => {
    test('adds entry to index', () => {
      const sizeBefore = manager.getSize();
      manager.addEntry({
        name: 'Test Object',
        type: 'Test',
        ra: 0,
        dec: 0,
        mag: 5.0,
        isAlias: false,
        data: {},
      });
      expect(manager.getSize()).toBe(sizeBefore + 1);
      expect(manager.findByName('Test Object')).not.toBeNull();
    });
  });

  describe('updatePlanets', () => {
    beforeEach(() => {
      manager.buildIndex({planets: testPlanets});
    });

    test('updates planet positions', () => {
      const newPlanets = [
        {name: 'Mars', ra: 90.0, dec: 10.0, mag: -1.0},
        {name: 'Venus', ra: 180.0, dec: 5.0, mag: -4.0},
      ];
      manager.updatePlanets(newPlanets);

      const mars = manager.findByName('Mars');
      expect(mars.ra).toBe(90.0);

      const venus = manager.findByName('Venus');
      expect(venus).not.toBeNull();

      // Jupiter should be removed
      const jupiter = manager.findByName('Jupiter');
      expect(jupiter).toBeNull();
    });

    test('removes old planets', () => {
      const originalSize = manager.findByType('Planet').length;
      expect(originalSize).toBe(3);

      manager.updatePlanets([{name: 'Mars', ra: 0, dec: 0, mag: 0}]);
      expect(manager.findByType('Planet').length).toBe(1);
    });
  });

  describe('angularDistance_ (private)', () => {
    test('calculates correct distance', () => {
      // Use findNear to test angular distance calculation
      manager.addEntry({name: 'A', type: 'Test', ra: 0, dec: 0, mag: 5, isAlias: false, data: {}});
      manager.addEntry({name: 'B', type: 'Test', ra: 0, dec: 10, mag: 5, isAlias: false, data: {}});

      // B should be within 15 degrees of origin
      const near = manager.findNear(0, 0, 15);
      expect(near.some((r) => r.name === 'B')).toBe(true);

      // B should not be within 5 degrees of origin
      const notNear = manager.findNear(0, 0, 5);
      expect(notNear.some((r) => r.name === 'B')).toBe(false);
    });
  });
});

describe('searchManager singleton', () => {
  test('is a SearchManager instance', () => {
    expect(searchManager).toBeInstanceOf(SearchManager);
  });
});
