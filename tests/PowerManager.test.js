/**
 * @fileoverview Tests for PowerManager module.
 */

import {jest} from '@jest/globals';
import {PowerManager, initializePowerManager} from '../modules/core/PowerManager.js';

describe('PowerManager', () => {
  let powerManager;
  let mockDeps;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockDeps = {
      onStartAnimating: jest.fn(),
      onStopAnimating: jest.fn(),
      shouldKeepAnimating: jest.fn(() => false),
    };

    powerManager = new PowerManager(mockDeps);
  });

  afterEach(() => {
    powerManager.dispose();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    test('creates instance with dependencies', () => {
      expect(powerManager).toBeInstanceOf(PowerManager);
    });

    test('initializes with page visible', () => {
      expect(powerManager.isPageVisible()).toBe(true);
    });

    test('initializes not animating', () => {
      expect(powerManager.isAnimating()).toBe(false);
    });
  });

  describe('requestRender', () => {
    test('starts animating if not already', () => {
      expect(powerManager.isAnimating()).toBe(false);

      powerManager.requestRender();
      expect(powerManager.isAnimating()).toBe(true);
      expect(mockDeps.onStartAnimating).toHaveBeenCalled();
    });

    test('does not start animating if page not visible', () => {
      // Simulate page hidden
      Object.defineProperty(document, 'hidden', {
        value: true,
        writable: true,
        configurable: true,
      });

      const pm = new PowerManager(mockDeps);
      pm.initialize();

      // Trigger visibility change
      document.dispatchEvent(new Event('visibilitychange'));

      expect(pm.isPageVisible()).toBe(false);
      pm.requestRender();
      expect(pm.isAnimating()).toBe(false);

      // Restore
      Object.defineProperty(document, 'hidden', {
        value: false,
        writable: true,
        configurable: true,
      });
      pm.dispose();
    });

    test('resets idle timeout', () => {
      powerManager.startAnimating();
      jest.clearAllMocks();

      powerManager.requestRender();

      // Should not stop animating immediately
      jest.advanceTimersByTime(2000);
      expect(powerManager.isAnimating()).toBe(true);

      // Should stop after idle timeout
      jest.advanceTimersByTime(2000);
      expect(powerManager.isAnimating()).toBe(false);
    });
  });

  describe('startAnimating', () => {
    test('sets animating flag', () => {
      powerManager.startAnimating();
      expect(powerManager.isAnimating()).toBe(true);
    });

    test('calls onStartAnimating callback', () => {
      powerManager.startAnimating();
      expect(mockDeps.onStartAnimating).toHaveBeenCalled();
    });

    test('does not call callback twice if already animating', () => {
      powerManager.startAnimating();
      powerManager.startAnimating();
      expect(mockDeps.onStartAnimating).toHaveBeenCalledTimes(1);
    });
  });

  describe('stopAnimating', () => {
    test('clears animating flag', () => {
      powerManager.startAnimating();
      powerManager.stopAnimating();
      expect(powerManager.isAnimating()).toBe(false);
    });

    test('calls onStopAnimating callback', () => {
      powerManager.startAnimating();
      powerManager.stopAnimating();
      expect(mockDeps.onStopAnimating).toHaveBeenCalled();
    });

    test('clears idle timeout', () => {
      powerManager.startAnimating();
      powerManager.stopAnimating();

      // Advance time to ensure timeout was cleared
      jest.advanceTimersByTime(10000);
      expect(mockDeps.onStopAnimating).toHaveBeenCalledTimes(1);
    });
  });

  describe('idle timeout', () => {
    test('stops animation after idle timeout', () => {
      powerManager.startAnimating();

      jest.advanceTimersByTime(3000);

      expect(powerManager.isAnimating()).toBe(false);
      expect(mockDeps.onStopAnimating).toHaveBeenCalled();
    });

    test('keeps animating if shouldKeepAnimating returns true', () => {
      mockDeps.shouldKeepAnimating.mockReturnValue(true);
      powerManager.startAnimating();

      jest.advanceTimersByTime(5000);

      expect(powerManager.isAnimating()).toBe(true);
    });
  });

  describe('getTimeSinceInteraction', () => {
    test('returns time since last interaction', () => {
      powerManager.requestRender();

      jest.advanceTimersByTime(1000);

      expect(powerManager.getTimeSinceInteraction()).toBeGreaterThanOrEqual(1000);
    });
  });

  describe('dispose', () => {
    test('clears idle timeout', () => {
      powerManager.startAnimating();
      powerManager.dispose();

      // Should not trigger stopAnimating again
      jest.clearAllMocks();
      jest.advanceTimersByTime(10000);
      expect(mockDeps.onStopAnimating).not.toHaveBeenCalled();
    });
  });
});

describe('initializePowerManager', () => {
  test('returns a PowerManager instance', () => {
    const deps = {
      onStartAnimating: jest.fn(),
      onStopAnimating: jest.fn(),
    };
    const pm = initializePowerManager(deps);
    expect(pm).toBeInstanceOf(PowerManager);
    pm.dispose();
  });
});
