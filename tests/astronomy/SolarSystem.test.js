/**
 * @fileoverview Tests for SolarSystem module.
 */

import {
  calculateSunPosition,
  calculateMoonPosition,
  calculatePlanetPositionFallback,
  PLANET_DEFAULTS,
} from '../../modules/astronomy/SolarSystem.js';

describe('SolarSystem', () => {
  describe('calculateSunPosition', () => {
    it('returns valid RA between 0 and 360', () => {
      const date = new Date('2024-06-21T12:00:00Z'); // Summer solstice
      const pos = calculateSunPosition(date);
      expect(pos.ra).toBeGreaterThanOrEqual(0);
      expect(pos.ra).toBeLessThan(360);
    });

    it('returns valid Dec between -90 and 90', () => {
      const date = new Date('2024-06-21T12:00:00Z');
      const pos = calculateSunPosition(date);
      expect(pos.dec).toBeGreaterThanOrEqual(-90);
      expect(pos.dec).toBeLessThanOrEqual(90);
    });

    it('sun is near summer solstice position in June', () => {
      const date = new Date('2024-06-21T12:00:00Z');
      const pos = calculateSunPosition(date);
      // Sun should be near RA ~90° (6h) and Dec ~+23.4° at summer solstice
      expect(pos.dec).toBeGreaterThan(20);
      expect(pos.dec).toBeLessThan(25);
    });

    it('sun is near winter solstice position in December', () => {
      const date = new Date('2024-12-21T12:00:00Z');
      const pos = calculateSunPosition(date);
      // Sun should be near Dec ~-23.4° at winter solstice
      expect(pos.dec).toBeGreaterThan(-25);
      expect(pos.dec).toBeLessThan(-20);
    });

    it('position changes over time', () => {
      const date1 = new Date('2024-01-01T12:00:00Z');
      const date2 = new Date('2024-07-01T12:00:00Z');
      const pos1 = calculateSunPosition(date1);
      const pos2 = calculateSunPosition(date2);
      expect(pos1.ra).not.toBeCloseTo(pos2.ra, 0);
      expect(pos1.dec).not.toBeCloseTo(pos2.dec, 0);
    });
  });

  describe('calculateMoonPosition', () => {
    it('returns valid RA between 0 and 360', () => {
      const date = new Date('2024-06-21T12:00:00Z');
      const pos = calculateMoonPosition(date);
      expect(pos.ra).toBeGreaterThanOrEqual(0);
      expect(pos.ra).toBeLessThan(360);
    });

    it('returns valid Dec between -90 and 90', () => {
      const date = new Date('2024-06-21T12:00:00Z');
      const pos = calculateMoonPosition(date);
      expect(pos.dec).toBeGreaterThanOrEqual(-90);
      expect(pos.dec).toBeLessThanOrEqual(90);
    });

    it('returns phase between 0 and 1', () => {
      const date = new Date('2024-06-21T12:00:00Z');
      const pos = calculateMoonPosition(date);
      expect(pos.phase).toBeGreaterThanOrEqual(0);
      expect(pos.phase).toBeLessThanOrEqual(1);
    });

    it('moon position changes significantly over a month', () => {
      const date1 = new Date('2024-06-01T12:00:00Z');
      const date2 = new Date('2024-06-15T12:00:00Z');
      const pos1 = calculateMoonPosition(date1);
      const pos2 = calculateMoonPosition(date2);
      // Moon moves ~13° per day, so should be very different after 14 days
      expect(Math.abs(pos1.ra - pos2.ra)).toBeGreaterThan(10);
    });
  });

  describe('calculatePlanetPositionFallback', () => {
    it('returns position for Mercury', () => {
      const date = new Date('2024-06-21T12:00:00Z');
      const pos = calculatePlanetPositionFallback('Mercury', date);
      expect(pos).not.toBeNull();
      expect(pos.ra).toBeGreaterThanOrEqual(0);
      expect(pos.ra).toBeLessThan(360);
    });

    it('returns position for all planets', () => {
      const date = new Date('2024-06-21T12:00:00Z');
      const planets = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];

      planets.forEach((name) => {
        const pos = calculatePlanetPositionFallback(name, date);
        expect(pos).not.toBeNull();
        expect(pos.ra).toBeDefined();
        expect(pos.dec).toBeDefined();
      });
    });

    it('returns null for unknown planet', () => {
      const date = new Date('2024-06-21T12:00:00Z');
      const pos = calculatePlanetPositionFallback('Pluto', date);
      expect(pos).toBeNull();
    });

    it('position changes over time', () => {
      const date1 = new Date('2024-01-01T12:00:00Z');
      const date2 = new Date('2024-07-01T12:00:00Z');
      const pos1 = calculatePlanetPositionFallback('Mars', date1);
      const pos2 = calculatePlanetPositionFallback('Mars', date2);
      expect(pos1.ra).not.toBeCloseTo(pos2.ra, 0);
    });
  });

  describe('PLANET_DEFAULTS', () => {
    it('contains Sun', () => {
      const sun = PLANET_DEFAULTS.find((p) => p.name === 'Sun');
      expect(sun).toBeDefined();
      expect(sun.mag).toBe(-26.7);
    });

    it('contains Moon', () => {
      const moon = PLANET_DEFAULTS.find((p) => p.name === 'Moon');
      expect(moon).toBeDefined();
      expect(moon.angularSize).toBe(31);
    });

    it('contains all 7 planets', () => {
      const planetNames = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
      planetNames.forEach((name) => {
        const planet = PLANET_DEFAULTS.find((p) => p.name === name);
        expect(planet).toBeDefined();
        expect(planet.imageUrl).toBeDefined();
      });
    });

    it('all entries have required fields', () => {
      PLANET_DEFAULTS.forEach((planet) => {
        expect(planet.name).toBeDefined();
        expect(planet.mag).toBeDefined();
        expect(planet.color).toBeDefined();
        expect(planet.angularSize).toBeDefined();
      });
    });
  });
});
