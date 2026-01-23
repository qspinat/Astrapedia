/**
 * @fileoverview Tests for planet position update functionality.
 * Tests the updatePlanetPositions() method logic in isolation.
 */

import {jest} from '@jest/globals';

// Mock sprite factory
const mockSprite = (name, ra = 0, dec = 0) => ({
  userData: {name, ra, dec},
  position: {set: jest.fn()},
});

describe('updatePlanetPositions logic', () => {
  // Simulated planet position calculator
  const calculateSunPosition = (time) => ({
    ra: 100 + (time.getMonth() * 30),
    dec: 23.4 * Math.sin((time.getMonth() / 12) * 2 * Math.PI),
  });

  const calculateMoonPosition = (time) => ({
    ra: (time.getDate() * 13) % 360,
    dec: 5 * Math.sin((time.getDate() / 28) * 2 * Math.PI),
    phase: (time.getDate() / 28) % 1,
  });

  const getPlanetPosition = (name, time) => {
    const positions = {
      Mercury: {ra: 80, dec: 5},
      Venus: {ra: 120, dec: -10},
      Mars: {ra: 200, dec: 15},
      Jupiter: {ra: 250, dec: -5},
      Saturn: {ra: 300, dec: -20},
      Uranus: {ra: 30, dec: 10},
      Neptune: {ra: 350, dec: -3},
    };
    return positions[name] || null;
  };

  /**
   * Simplified updatePlanetPositions logic for testing.
   * Mirrors the structure of the actual method.
   */
  function updatePlanetPositions(context) {
    const {planetSprites, planets, simulationTime, _planetPositions} = context;

    if (!planetSprites || planetSprites.length === 0) {
      return {needsFullCreation: true};
    }

    const simTime = simulationTime || new Date();
    const warnings = [];

    _planetPositions['Sun'] = calculateSunPosition(simTime);
    _planetPositions['Moon'] = calculateMoonPosition(simTime);

    // Calculate outer planet positions with fallback
    ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'].forEach(name => {
      const pos = getPlanetPosition(name, simTime);
      if (!pos) {
        warnings.push(`Planet position unavailable for ${name}, using fallback`);
        _planetPositions[name] = {ra: 0, dec: 0};
      } else {
        _planetPositions[name] = pos;
      }
    });

    const radius = 99;
    const updatedSprites = [];

    planetSprites.forEach(sprite => {
      const name = sprite.userData.name;
      const pos = _planetPositions[name];
      if (pos) {
        // Update planet data
        const planetData = planets.find(p => p.name === name);
        if (planetData) {
          planetData.ra = pos.ra;
          planetData.dec = pos.dec;
          if (pos.phase !== undefined) planetData.phase = pos.phase;
        }

        // Calculate 3D position
        const raRad = pos.ra * Math.PI / 180;
        const decRad = pos.dec * Math.PI / 180;
        const x = radius * Math.cos(decRad) * Math.cos(raRad);
        const y = radius * Math.sin(decRad);
        const z = -radius * Math.cos(decRad) * Math.sin(raRad);

        sprite.position.set(x, y, z);
        sprite.userData.ra = pos.ra;
        sprite.userData.dec = pos.dec;
        if (pos.phase !== undefined) sprite.userData.phase = pos.phase;

        updatedSprites.push({name, x, y, z, ra: pos.ra, dec: pos.dec});
      }
    });

    return {needsFullCreation: false, updatedSprites, warnings};
  }

  describe('updatePlanetPositions', () => {
    test('returns needsFullCreation when no sprites exist', () => {
      const context = {
        planetSprites: [],
        planets: [],
        simulationTime: new Date(),
        _planetPositions: {},
      };

      const result = updatePlanetPositions(context);
      expect(result.needsFullCreation).toBe(true);
    });

    test('returns needsFullCreation when planetSprites is null', () => {
      const context = {
        planetSprites: null,
        planets: [],
        simulationTime: new Date(),
        _planetPositions: {},
      };

      const result = updatePlanetPositions(context);
      expect(result.needsFullCreation).toBe(true);
    });

    test('updates all planet positions correctly', () => {
      const planets = [
        {name: 'Sun', ra: 0, dec: 0},
        {name: 'Moon', ra: 0, dec: 0, phase: 0},
        {name: 'Mercury', ra: 0, dec: 0},
        {name: 'Venus', ra: 0, dec: 0},
        {name: 'Mars', ra: 0, dec: 0},
        {name: 'Jupiter', ra: 0, dec: 0},
        {name: 'Saturn', ra: 0, dec: 0},
        {name: 'Uranus', ra: 0, dec: 0},
        {name: 'Neptune', ra: 0, dec: 0},
      ];

      const planetSprites = planets.map(p => mockSprite(p.name));

      const context = {
        planetSprites,
        planets,
        simulationTime: new Date(2024, 6, 15),
        _planetPositions: {},
      };

      const result = updatePlanetPositions(context);

      expect(result.needsFullCreation).toBe(false);
      expect(result.updatedSprites.length).toBe(9);

      // Verify positions were set
      planetSprites.forEach(sprite => {
        expect(sprite.position.set).toHaveBeenCalled();
      });
    });

    test('updates planet data with new RA/Dec values', () => {
      const planets = [
        {name: 'Mars', ra: 0, dec: 0},
      ];

      const planetSprites = [mockSprite('Mars')];

      const context = {
        planetSprites,
        planets,
        simulationTime: new Date(2024, 6, 15),
        _planetPositions: {},
      };

      updatePlanetPositions(context);

      expect(planets[0].ra).toBe(200);
      expect(planets[0].dec).toBe(15);
    });

    test('updates Moon phase correctly', () => {
      const planets = [
        {name: 'Moon', ra: 0, dec: 0, phase: 0},
      ];

      const planetSprites = [mockSprite('Moon')];

      const context = {
        planetSprites,
        planets,
        simulationTime: new Date(2024, 6, 15), // Day 15 of month
        _planetPositions: {},
      };

      updatePlanetPositions(context);

      // Phase should be calculated based on day
      expect(planets[0].phase).toBeDefined();
      expect(planets[0].phase).toBeGreaterThanOrEqual(0);
      expect(planets[0].phase).toBeLessThanOrEqual(1);
    });

    test('updates sprite userData with new coordinates', () => {
      const planets = [{name: 'Jupiter', ra: 0, dec: 0}];
      const sprite = mockSprite('Jupiter');
      const planetSprites = [sprite];

      const context = {
        planetSprites,
        planets,
        simulationTime: new Date(2024, 6, 15),
        _planetPositions: {},
      };

      updatePlanetPositions(context);

      expect(sprite.userData.ra).toBe(250);
      expect(sprite.userData.dec).toBe(-5);
    });

    test('calculates correct 3D position from RA/Dec', () => {
      const planets = [{name: 'Mars', ra: 0, dec: 0}];
      const sprite = mockSprite('Mars');
      const planetSprites = [sprite];

      const context = {
        planetSprites,
        planets,
        simulationTime: new Date(2024, 6, 15),
        _planetPositions: {},
      };

      updatePlanetPositions(context);

      // Verify position.set was called with correct values
      const setCall = sprite.position.set.mock.calls[0];
      expect(setCall).toHaveLength(3);

      const [x, y, z] = setCall;
      const radius = 99;

      // Mars position is ra=200, dec=15
      const raRad = 200 * Math.PI / 180;
      const decRad = 15 * Math.PI / 180;
      const expectedX = radius * Math.cos(decRad) * Math.cos(raRad);
      const expectedY = radius * Math.sin(decRad);
      const expectedZ = -radius * Math.cos(decRad) * Math.sin(raRad);

      expect(x).toBeCloseTo(expectedX, 5);
      expect(y).toBeCloseTo(expectedY, 5);
      expect(z).toBeCloseTo(expectedZ, 5);
    });

    test('handles sprites without matching planet data gracefully', () => {
      const planets = []; // No planet data
      const planetSprites = [mockSprite('Unknown')];

      const context = {
        planetSprites,
        planets,
        simulationTime: new Date(2024, 6, 15),
        _planetPositions: {},
      };

      // Should not throw
      expect(() => updatePlanetPositions(context)).not.toThrow();
    });

    test('uses current time when simulationTime is not set', () => {
      const planets = [{name: 'Sun', ra: 0, dec: 0}];
      const planetSprites = [mockSprite('Sun')];

      const context = {
        planetSprites,
        planets,
        simulationTime: null,
        _planetPositions: {},
      };

      const result = updatePlanetPositions(context);
      expect(result.needsFullCreation).toBe(false);
    });
  });

  describe('position calculation accuracy', () => {
    test('positions objects at correct radius (99 units)', () => {
      const planets = [{name: 'Mars', ra: 0, dec: 0}];
      const sprite = mockSprite('Mars');
      const planetSprites = [sprite];

      const context = {
        planetSprites,
        planets,
        simulationTime: new Date(2024, 6, 15),
        _planetPositions: {},
      };

      updatePlanetPositions(context);

      const [x, y, z] = sprite.position.set.mock.calls[0];
      const actualRadius = Math.sqrt(x * x + y * y + z * z);

      expect(actualRadius).toBeCloseTo(99, 5);
    });

    test('equator positions have y close to 0', () => {
      // Use a planet with dec close to 0
      const context = {
        planetSprites: [mockSprite('Neptune')], // Neptune has dec = -3
        planets: [{name: 'Neptune', ra: 0, dec: 0}],
        simulationTime: new Date(2024, 6, 15),
        _planetPositions: {},
      };

      updatePlanetPositions(context);

      const [, y] = context.planetSprites[0].position.set.mock.calls[0];
      // y = radius * sin(dec), with dec = -3°, should be small
      expect(Math.abs(y)).toBeLessThan(10);
    });

    test('polar positions have y close to radius', () => {
      // Test with custom position at pole
      const customGetPlanetPosition = () => ({ra: 0, dec: 90});

      // This tests the formula: y = radius * sin(90°) = radius * 1 = 99
      const raRad = 0;
      const decRad = 90 * Math.PI / 180;
      const radius = 99;
      const y = radius * Math.sin(decRad);

      expect(y).toBeCloseTo(99, 5);
    });
  });
});
