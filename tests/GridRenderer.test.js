/**
 * @fileoverview Tests for GridRenderer module.
 */

import {jest} from '@jest/globals';
import {GridRenderer} from '../modules/rendering/GridRenderer.js';

// Mock THREE.js
const mockGeometry = {
  setAttribute: jest.fn(),
  setFromPoints: jest.fn().mockReturnThis(),
  dispose: jest.fn(),
};

const mockMaterial = {
  dispose: jest.fn(),
};

const mockLineSegments = {
  visible: true,
};

const mockLine = {
  visible: true,
};

global.THREE = {
  LineBasicMaterial: jest.fn(() => mockMaterial),
  BufferGeometry: jest.fn(() => mockGeometry),
  Float32BufferAttribute: jest.fn(),
  LineSegments: jest.fn(() => mockLineSegments),
  Line: jest.fn(() => mockLine),
  Vector3: jest.fn((x, y, z) => ({x, y, z})),
  MathUtils: {
    degToRad: (deg) => deg * Math.PI / 180,
  },
};

describe('GridRenderer', () => {
  let renderer;
  let mockCelestialSphere;
  let mockRequestRender;

  beforeEach(() => {
    jest.clearAllMocks();

    mockCelestialSphere = {
      add: jest.fn(),
      remove: jest.fn(),
    };
    mockRequestRender = jest.fn();

    renderer = new GridRenderer({
      celestialSphere: mockCelestialSphere,
      requestRender: mockRequestRender,
    });
  });

  describe('constructor', () => {
    test('initializes with default intervals', () => {
      expect(renderer.currentRaInterval_).toBe(15);
      expect(renderer.currentDecInterval_).toBe(15);
    });

    test('creates materials on construction', () => {
      expect(THREE.LineBasicMaterial).toHaveBeenCalledTimes(2);
    });

    test('starts with grid not visible', () => {
      expect(renderer.isGridVisible()).toBe(false);
    });

    test('starts with equator not visible', () => {
      expect(renderer.isEquatorVisible()).toBe(false);
    });
  });

  describe('create', () => {
    test('creates grid lines', () => {
      renderer.create();
      expect(THREE.LineSegments).toHaveBeenCalled();
      expect(mockCelestialSphere.add).toHaveBeenCalled();
    });

    test('creates equator line', () => {
      renderer.create();
      expect(THREE.Line).toHaveBeenCalled();
    });
  });

  describe('setGridVisible', () => {
    test('sets grid visibility', () => {
      renderer.create();
      renderer.setGridVisible(true);
      expect(renderer.isGridVisible()).toBe(true);
      expect(mockRequestRender).toHaveBeenCalled();
    });

    test('does nothing if grid not created', () => {
      renderer.setGridVisible(true);
      expect(renderer.isGridVisible()).toBe(true);
      expect(mockRequestRender).not.toHaveBeenCalled();
    });
  });

  describe('setEquatorVisible', () => {
    test('sets equator visibility', () => {
      renderer.create();
      renderer.setEquatorVisible(true);
      expect(renderer.isEquatorVisible()).toBe(true);
      expect(mockRequestRender).toHaveBeenCalled();
    });
  });

  describe('updateForFov', () => {
    beforeEach(() => {
      renderer.create();
      jest.clearAllMocks();
    });

    test('updates grid density for narrow FOV', () => {
      // Start with wide FOV defaults (15 degrees)
      expect(renderer.currentRaInterval_).toBe(15);

      // Update to narrow FOV
      renderer.updateForFov(10);
      expect(renderer.currentRaInterval_).toBe(1);
      expect(renderer.currentDecInterval_).toBe(1);
    });

    test('updates grid density for very narrow FOV', () => {
      renderer.updateForFov(0.3);
      expect(renderer.currentRaInterval_).toBeCloseTo(1/60, 5);
      expect(renderer.currentDecInterval_).toBeCloseTo(1/60, 5);
    });

    test('uses 5 degree intervals for medium FOV', () => {
      renderer.updateForFov(25);
      expect(renderer.currentRaInterval_).toBe(5);
      expect(renderer.currentDecInterval_).toBe(5);
    });

    test('does not recreate if intervals unchanged', () => {
      renderer.updateForFov(60); // Should stay at 15 degrees
      expect(renderer.currentRaInterval_).toBe(15);
      expect(THREE.LineSegments).not.toHaveBeenCalled();
    });

    test('recreates grid geometry when density changes', () => {
      renderer.updateForFov(10);
      expect(THREE.LineSegments).toHaveBeenCalled();
      expect(mockCelestialSphere.remove).toHaveBeenCalled();
    });

    test('requests render after update', () => {
      renderer.updateForFov(10);
      expect(mockRequestRender).toHaveBeenCalled();
    });

    test('throttles rapid updates', () => {
      jest.useFakeTimers();

      // First update should work
      renderer.updateForFov(10);
      expect(renderer.currentRaInterval_).toBe(1);

      jest.clearAllMocks();

      // Advance time by less than throttle period (50ms)
      jest.advanceTimersByTime(50);

      // Second update should be throttled
      renderer.updateForFov(25);
      expect(renderer.currentRaInterval_).toBe(1); // Should not change
      expect(THREE.LineSegments).not.toHaveBeenCalled();

      jest.useRealTimers();
    });

    test('allows update after throttle period', () => {
      jest.useFakeTimers();

      renderer.updateForFov(10);
      expect(renderer.currentRaInterval_).toBe(1);

      // Advance time past throttle period (150ms > 100ms)
      jest.advanceTimersByTime(150);

      renderer.updateForFov(25);
      expect(renderer.currentRaInterval_).toBe(5);

      jest.useRealTimers();
    });
  });

  describe('dispose', () => {
    test('disposes materials', () => {
      renderer.create();
      renderer.dispose();
      expect(mockMaterial.dispose).toHaveBeenCalledTimes(2);
    });

    test('removes grid from scene', () => {
      renderer.create();
      renderer.dispose();
      expect(mockCelestialSphere.remove).toHaveBeenCalled();
    });

    test('disposes geometry', () => {
      renderer.create();
      renderer.dispose();
      expect(mockGeometry.dispose).toHaveBeenCalled();
    });
  });
});
