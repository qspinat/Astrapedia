/**
 * @fileoverview Tests for TelescopeController module.
 */

import {jest} from '@jest/globals';
import {
  TelescopeController,
  initializeTelescopeController,
} from '../modules/features/TelescopeController.js';
import {globalEventBus, Events} from '../modules/core/EventBus.js';
import {TELESCOPE} from '../modules/core/Constants.js';

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: jest.fn((key) => store[key] || null),
    setItem: jest.fn((key, value) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
});

// Note: DOM manipulation was moved to the UI layer (modules/ui/UIController.js)
// TelescopeController now only emits events for mode changes

describe('TelescopeController', () => {
  let controller;
  let mockDependencies;

  beforeEach(() => {
    mockDependencies = {
      setFOV: jest.fn(),
      setMagnitudeLimit: jest.fn(),
      getCurrentFOV: jest.fn().mockReturnValue(60),
      getCurrentMagnitude: jest.fn().mockReturnValue(8.0),
    };
    localStorageMock.clear();
    jest.clearAllMocks();
    globalEventBus.clear();

    controller = new TelescopeController(mockDependencies);
  });

  describe('constructor', () => {
    test('initializes with default telescope values', () => {
      const telescope = controller.getTelescope();
      expect(telescope.diameter).toBe(TELESCOPE.DEFAULT_DIAMETER);
      expect(telescope.focalLength).toBe(TELESCOPE.DEFAULT_FOCAL_LENGTH);
    });

    test('initializes with default eyepiece values', () => {
      const eyepiece = controller.getEyepiece();
      expect(eyepiece.focalLength).toBe(TELESCOPE.DEFAULT_EYEPIECE_FL);
      expect(eyepiece.apparentFov).toBe(TELESCOPE.DEFAULT_EYEPIECE_AFOV);
    });

    test('starts inactive', () => {
      expect(controller.isActive()).toBe(false);
    });

    test('loads saved settings from localStorage', () => {
      const savedData = {
        currentConfig: {
          telescope: {diameter: 300, focalLength: 1500},
          eyepiece: {focalLength: 10, apparentFov: 68},
        },
        presets: {},
      };
      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(savedData));

      const newController = new TelescopeController(mockDependencies);
      const telescope = newController.getTelescope();
      const eyepiece = newController.getEyepiece();

      expect(telescope.diameter).toBe(300);
      expect(telescope.focalLength).toBe(1500);
      expect(eyepiece.focalLength).toBe(10);
      expect(eyepiece.apparentFov).toBe(68);
    });

    test('handles invalid localStorage data gracefully', () => {
      localStorageMock.getItem.mockReturnValueOnce('invalid json');

      const newController = new TelescopeController(mockDependencies);
      // Should fall back to defaults
      expect(newController.getTelescope().diameter).toBe(TELESCOPE.DEFAULT_DIAMETER);
    });
  });

  describe('initialize', () => {
    test('computes initial properties', () => {
      controller.initialize();
      const props = controller.getComputedProperties();
      expect(props).not.toBeNull();
      expect(props.magnification).toBeGreaterThan(0);
    });
  });

  describe('getTelescope / setTelescope', () => {
    test('returns copy of telescope config', () => {
      const t1 = controller.getTelescope();
      const t2 = controller.getTelescope();
      expect(t1).not.toBe(t2);
      expect(t1).toEqual(t2);
    });

    test('sets telescope configuration', () => {
      controller.setTelescope({diameter: 250});
      expect(controller.getTelescope().diameter).toBe(250);
    });

    test('merges partial config', () => {
      controller.setTelescope({diameter: 250});
      expect(controller.getTelescope().focalLength).toBe(TELESCOPE.DEFAULT_FOCAL_LENGTH);
    });

    test('recomputes properties on change', () => {
      controller.initialize();
      const oldProps = controller.getComputedProperties();
      controller.setTelescope({diameter: 300});
      const newProps = controller.getComputedProperties();
      expect(newProps.limitingMagnitude).not.toBe(oldProps.limitingMagnitude);
    });

    test('saves to localStorage on change', () => {
      controller.setTelescope({diameter: 250});
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        TELESCOPE.STORAGE_KEY,
        expect.any(String)
      );
    });
  });

  describe('getEyepiece / setEyepiece', () => {
    test('returns copy of eyepiece config', () => {
      const e1 = controller.getEyepiece();
      const e2 = controller.getEyepiece();
      expect(e1).not.toBe(e2);
      expect(e1).toEqual(e2);
    });

    test('sets eyepiece configuration', () => {
      controller.setEyepiece({focalLength: 10});
      expect(controller.getEyepiece().focalLength).toBe(10);
    });

    test('merges partial config', () => {
      controller.setEyepiece({focalLength: 10});
      expect(controller.getEyepiece().apparentFov).toBe(TELESCOPE.DEFAULT_EYEPIECE_AFOV);
    });
  });

  describe('computeProperties', () => {
    beforeEach(() => {
      controller.setTelescope({diameter: 200, focalLength: 1000});
      controller.setEyepiece({focalLength: 10, apparentFov: 52});
    });

    test('calculates magnification correctly', () => {
      const props = controller.computeProperties();
      // Magnification = 1000 / 10 = 100x
      expect(props.magnification).toBe(100);
    });

    test('calculates max useful magnification correctly', () => {
      const props = controller.computeProperties();
      // Max useful = 2 × 200 = 400x
      expect(props.maxUsefulMagnification).toBe(400);
    });

    test('calculates exit pupil correctly', () => {
      const props = controller.computeProperties();
      // Exit pupil = 200 / 100 = 2mm
      expect(props.exitPupil).toBe(2);
    });

    test('calculates real field of view correctly', () => {
      const props = controller.computeProperties();
      // Real FOV = 52 / 100 = 0.52°
      expect(props.realFieldOfView).toBeCloseTo(0.52);
    });

    test('calculates limiting magnitude correctly', () => {
      const props = controller.computeProperties();
      // Limiting mag = 2.7 + 5 × log10(200) ≈ 14.2
      expect(props.limitingMagnitude).toBeCloseTo(14.2, 1);
    });

    test('detects over-magnification', () => {
      controller.setEyepiece({focalLength: 2, apparentFov: 52}); // 500x magnification
      const props = controller.computeProperties();
      expect(props.isOverMagnified).toBe(true);
    });

    test('not over-magnified within limits', () => {
      const props = controller.computeProperties();
      expect(props.isOverMagnified).toBe(false);
    });

    test('emits TELESCOPE_COMPUTED event', () => {
      const callback = jest.fn();
      globalEventBus.on(Events.TELESCOPE_COMPUTED, callback);
      controller.computeProperties();
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          magnification: expect.any(Number),
          maxUsefulMagnification: expect.any(Number),
          exitPupil: expect.any(Number),
          realFieldOfView: expect.any(Number),
          limitingMagnitude: expect.any(Number),
          theoreticalLimitingMag: expect.any(Number),
          isOverMagnified: expect.any(Boolean),
        })
      );
    });

    test('includes theoreticalLimitingMag in computed properties', () => {
      const props = controller.computeProperties();
      // Theoretical limit = 2.7 + 5 × log10(200) ≈ 14.2
      expect(props.theoreticalLimitingMag).toBeCloseTo(14.2, 1);
    });

    test('uses sky conditions when available', () => {
      // Create controller with sky conditions dependency
      const skyController = new TelescopeController({
        ...mockDependencies,
        getSkyLimitingMagnitude: jest.fn().mockReturnValue(5.0), // Poor sky
      });
      skyController.setTelescope({diameter: 200, focalLength: 1000});
      skyController.setEyepiece({focalLength: 10, apparentFov: 52});

      const props = skyController.computeProperties();

      // Telescope gain = 5 × log10(200/7) ≈ 7.3
      // Sky-limited mag = 5.0 + 7.3 ≈ 12.3
      // Theoretical = 14.2, so sky-limited wins
      expect(props.limitingMagnitude).toBeLessThan(props.theoreticalLimitingMag);
      expect(props.limitingMagnitude).toBeCloseTo(12.3, 0);
    });

    test('uses theoretical limit when sky is darker', () => {
      // Create controller with excellent sky conditions
      const skyController = new TelescopeController({
        ...mockDependencies,
        getSkyLimitingMagnitude: jest.fn().mockReturnValue(7.5), // Excellent sky
      });
      skyController.setTelescope({diameter: 200, focalLength: 1000});
      skyController.setEyepiece({focalLength: 10, apparentFov: 52});

      const props = skyController.computeProperties();

      // Telescope gain = 5 × log10(200/7) ≈ 7.3
      // Sky-limited mag = 7.5 + 7.3 ≈ 14.8
      // Theoretical = 14.2, so theoretical wins (min of both)
      expect(props.limitingMagnitude).toBeCloseTo(props.theoreticalLimitingMag, 1);
    });
  });

  describe('getComputedProperties', () => {
    test('returns null before computation', () => {
      const freshController = new TelescopeController(mockDependencies);
      // computeProperties_ is null until compute is called
      expect(freshController.getComputedProperties()).toBeNull();
    });

    test('returns copy of computed properties', () => {
      controller.initialize();
      const p1 = controller.getComputedProperties();
      const p2 = controller.getComputedProperties();
      expect(p1).not.toBe(p2);
      expect(p1).toEqual(p2);
    });
  });

  describe('activateTelescopeMode', () => {
    beforeEach(() => {
      controller.initialize();
    });

    test('stores previous FOV and magnitude', () => {
      controller.activateTelescopeMode();
      expect(mockDependencies.getCurrentFOV).toHaveBeenCalled();
      expect(mockDependencies.getCurrentMagnitude).toHaveBeenCalled();
    });

    test('sets FOV to real field of view', () => {
      controller.activateTelescopeMode();
      expect(mockDependencies.setFOV).toHaveBeenCalledWith(expect.any(Number));
    });

    test('clamps FOV to minimum', () => {
      controller.setEyepiece({focalLength: 1, apparentFov: 52}); // Very small FOV
      controller.activateTelescopeMode();
      const fovArg = mockDependencies.setFOV.mock.calls[0][0];
      expect(fovArg).toBeGreaterThanOrEqual(TELESCOPE.MIN_TELESCOPE_FOV);
    });

    test('sets magnitude limit to limiting magnitude', () => {
      controller.activateTelescopeMode();
      expect(mockDependencies.setMagnitudeLimit).toHaveBeenCalledWith(expect.any(Number));
    });

    test('sets isActive to true', () => {
      controller.activateTelescopeMode();
      expect(controller.isActive()).toBe(true);
    });

    test('emits TELESCOPE_MODE_ACTIVATED event', () => {
      const callback = jest.fn();
      globalEventBus.on(Events.TELESCOPE_MODE_ACTIVATED, callback);
      controller.activateTelescopeMode();
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          fov: expect.any(Number),
          magnitudeLimit: expect.any(Number),
          magnification: expect.any(Number),
        })
      );
    });

    test('does nothing if already active', () => {
      controller.activateTelescopeMode();
      jest.clearAllMocks();
      controller.activateTelescopeMode();
      expect(mockDependencies.setFOV).not.toHaveBeenCalled();
    });

    test('calls lockZoom to prevent user zoom changes', () => {
      const lockZoom = jest.fn();
      const controllerWithLock = new TelescopeController({
        ...mockDependencies,
        lockZoom,
      });
      controllerWithLock.initialize();
      controllerWithLock.activateTelescopeMode();
      expect(lockZoom).toHaveBeenCalled();
    });
  });

  describe('deactivateTelescopeMode', () => {
    beforeEach(() => {
      controller.initialize();
      controller.activateTelescopeMode();
      jest.clearAllMocks();
    });

    test('restores previous FOV', () => {
      controller.deactivateTelescopeMode();
      expect(mockDependencies.setFOV).toHaveBeenCalledWith(60);
    });

    test('restores previous magnitude', () => {
      controller.deactivateTelescopeMode();
      expect(mockDependencies.setMagnitudeLimit).toHaveBeenCalledWith(8.0);
    });

    test('sets isActive to false', () => {
      controller.deactivateTelescopeMode();
      expect(controller.isActive()).toBe(false);
    });

    test('emits TELESCOPE_MODE_DEACTIVATED event', () => {
      const callback = jest.fn();
      globalEventBus.on(Events.TELESCOPE_MODE_DEACTIVATED, callback);
      controller.deactivateTelescopeMode();
      expect(callback).toHaveBeenCalledWith({});
    });

    test('does nothing if not active', () => {
      controller.deactivateTelescopeMode();
      jest.clearAllMocks();
      controller.deactivateTelescopeMode();
      expect(mockDependencies.setFOV).not.toHaveBeenCalled();
    });

    test('calls unlockZoom to allow user zoom changes', () => {
      const lockZoom = jest.fn();
      const unlockZoom = jest.fn();
      const controllerWithLock = new TelescopeController({
        ...mockDependencies,
        lockZoom,
        unlockZoom,
      });
      controllerWithLock.initialize();
      controllerWithLock.activateTelescopeMode();
      controllerWithLock.deactivateTelescopeMode();
      expect(unlockZoom).toHaveBeenCalled();
    });
  });

  describe('toggleTelescopeMode', () => {
    beforeEach(() => {
      controller.initialize();
    });

    test('activates when inactive', () => {
      controller.toggleTelescopeMode();
      expect(controller.isActive()).toBe(true);
    });

    test('deactivates when active', () => {
      controller.activateTelescopeMode();
      controller.toggleTelescopeMode();
      expect(controller.isActive()).toBe(false);
    });
  });

  describe('presets', () => {
    describe('savePreset', () => {
      test('saves current configuration', () => {
        controller.setTelescope({diameter: 250, focalLength: 1200});
        controller.setEyepiece({focalLength: 15, apparentFov: 68});
        controller.savePreset('My Scope');

        expect(controller.getPresetNames()).toContain('My Scope');
      });

      test('persists to localStorage', () => {
        controller.savePreset('Test Preset');
        const stored = JSON.parse(localStorageMock.setItem.mock.calls.pop()[1]);
        expect(stored.presets['Test Preset']).toBeDefined();
      });
    });

    describe('loadPreset', () => {
      test('loads saved preset', () => {
        controller.setTelescope({diameter: 300, focalLength: 1500});
        controller.savePreset('Big Scope');

        controller.setTelescope({diameter: 100, focalLength: 500});
        controller.loadPreset('Big Scope');

        expect(controller.getTelescope().diameter).toBe(300);
        expect(controller.getTelescope().focalLength).toBe(1500);
      });

      test('returns true on success', () => {
        controller.savePreset('Test');
        expect(controller.loadPreset('Test')).toBe(true);
      });

      test('returns false for non-existent preset', () => {
        expect(controller.loadPreset('NonExistent')).toBe(false);
      });

      test('recomputes properties after loading', () => {
        controller.setTelescope({diameter: 300, focalLength: 1500});
        controller.setEyepiece({focalLength: 10, apparentFov: 82});
        controller.savePreset('Wide Field');

        controller.setTelescope({diameter: 100, focalLength: 500});
        controller.initialize();

        const callback = jest.fn();
        globalEventBus.on(Events.TELESCOPE_COMPUTED, callback);

        controller.loadPreset('Wide Field');
        expect(callback).toHaveBeenCalled();
      });
    });

    describe('deletePreset', () => {
      test('removes preset', () => {
        controller.savePreset('ToDelete');
        expect(controller.getPresetNames()).toContain('ToDelete');

        controller.deletePreset('ToDelete');
        expect(controller.getPresetNames()).not.toContain('ToDelete');
      });

      test('returns true on success', () => {
        controller.savePreset('Test');
        expect(controller.deletePreset('Test')).toBe(true);
      });

      test('returns false for non-existent preset', () => {
        expect(controller.deletePreset('NonExistent')).toBe(false);
      });

      test('persists deletion to localStorage', () => {
        controller.savePreset('Test');
        jest.clearAllMocks();
        controller.deletePreset('Test');
        expect(localStorageMock.setItem).toHaveBeenCalled();
      });
    });

    describe('getPresetNames', () => {
      test('returns empty array initially', () => {
        expect(controller.getPresetNames()).toEqual([]);
      });

      test('returns list of preset names', () => {
        controller.savePreset('Preset A');
        controller.savePreset('Preset B');
        controller.savePreset('Preset C');

        const names = controller.getPresetNames();
        expect(names).toContain('Preset A');
        expect(names).toContain('Preset B');
        expect(names).toContain('Preset C');
        expect(names.length).toBe(3);
      });
    });
  });

  describe('optical calculations edge cases', () => {
    test('handles very small aperture', () => {
      controller.setTelescope({diameter: 25, focalLength: 200});
      const props = controller.computeProperties();
      expect(props.magnification).toBeGreaterThan(0);
      expect(props.limitingMagnitude).toBeGreaterThan(0);
    });

    test('handles very large aperture', () => {
      controller.setTelescope({diameter: 1000, focalLength: 4000});
      const props = controller.computeProperties();
      expect(props.maxUsefulMagnification).toBe(2000);
    });

    test('handles very short eyepiece focal length', () => {
      controller.setEyepiece({focalLength: 2, apparentFov: 52});
      const props = controller.computeProperties();
      expect(props.magnification).toBe(500); // 1000 / 2
    });

    test('handles wide-field eyepiece', () => {
      controller.setEyepiece({focalLength: 25, apparentFov: 100});
      const props = controller.computeProperties();
      expect(props.realFieldOfView).toBe(2.5); // 100 / 40
    });
  });
});

describe('initializeTelescopeController', () => {
  beforeEach(() => {
    localStorageMock.clear();
    globalEventBus.clear();
  });

  test('creates and returns TelescopeController instance', () => {
    const mockDeps = {
      setFOV: jest.fn(),
      setMagnitudeLimit: jest.fn(),
      getCurrentFOV: jest.fn().mockReturnValue(60),
      getCurrentMagnitude: jest.fn().mockReturnValue(8.0),
    };
    const result = initializeTelescopeController(mockDeps);
    expect(result).toBeInstanceOf(TelescopeController);
  });

  test('initializes the controller', () => {
    const mockDeps = {
      setFOV: jest.fn(),
      setMagnitudeLimit: jest.fn(),
      getCurrentFOV: jest.fn().mockReturnValue(60),
      getCurrentMagnitude: jest.fn().mockReturnValue(8.0),
    };
    const result = initializeTelescopeController(mockDeps);
    // Should have computed properties after initialization
    expect(result.getComputedProperties()).not.toBeNull();
  });
});

describe('TELESCOPE constants', () => {
  test('has required default values', () => {
    expect(TELESCOPE.DEFAULT_DIAMETER).toBeDefined();
    expect(TELESCOPE.DEFAULT_FOCAL_LENGTH).toBeDefined();
    expect(TELESCOPE.DEFAULT_EYEPIECE_FL).toBeDefined();
    expect(TELESCOPE.DEFAULT_EYEPIECE_AFOV).toBeDefined();
  });

  test('has minimum FOV defined', () => {
    expect(TELESCOPE.MIN_TELESCOPE_FOV).toBeGreaterThan(0);
  });

  test('has max magnification multiplier defined', () => {
    expect(TELESCOPE.MAX_MAG_MULTIPLIER).toBeGreaterThan(0);
  });

  test('has storage key defined', () => {
    expect(TELESCOPE.STORAGE_KEY).toBe('skymap_telescope_settings');
  });
});

describe('Events constants', () => {
  test('has telescope events defined', () => {
    expect(Events.TELESCOPE_COMPUTED).toBeDefined();
    expect(Events.TELESCOPE_MODE_ACTIVATED).toBeDefined();
    expect(Events.TELESCOPE_MODE_DEACTIVATED).toBeDefined();
  });

  test('telescope events follow naming convention', () => {
    expect(Events.TELESCOPE_COMPUTED).toMatch(/^telescope:/);
    expect(Events.TELESCOPE_MODE_ACTIVATED).toMatch(/^telescope:/);
    expect(Events.TELESCOPE_MODE_DEACTIVATED).toMatch(/^telescope:/);
  });
});
