/**
 * @fileoverview Tests for PowerManager module.
 */

import {jest} from '@jest/globals';
import {PowerManager} from '../modules/core/PowerManager.js';

/** Jest's fake requestAnimationFrame fires every 16 ms. */
const FRAME_MS = 16;

describe('PowerManager', () => {
  let powerManager;
  let mockDeps;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockDeps = {
      renderFrame: jest.fn(),
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

  describe('render loop', () => {
    test('draws a frame on each animation frame while running', () => {
      powerManager.startAnimating();

      jest.advanceTimersByTime(FRAME_MS * 3);

      expect(mockDeps.renderFrame).toHaveBeenCalledTimes(3);
    });

    test('keeps running after a frame throws', () => {
      mockDeps.renderFrame.mockImplementationOnce(() => {
        throw new Error('bad frame');
      });
      powerManager.startAnimating();

      expect(() => jest.advanceTimersByTime(FRAME_MS)).toThrow('bad frame');
      jest.advanceTimersByTime(FRAME_MS);

      expect(mockDeps.renderFrame).toHaveBeenCalledTimes(2);
    });

    test('draws nothing once stopped', () => {
      powerManager.startAnimating();
      powerManager.stopAnimating();

      jest.advanceTimersByTime(FRAME_MS * 3);

      expect(mockDeps.renderFrame).not.toHaveBeenCalled();
    });
  });

  describe('resume after the app returns to the foreground', () => {
    /**
     * Simulates Android dropping the pending frame while the WebView was
     * paused: the handle is still held, but no frame will ever fire.
     * @param {!PowerManager} pm
     */
    function dropPendingFrame(pm) {
      cancelAnimationFrame(pm.rafId_);
    }

    test.each([
      ['focus', () => window.dispatchEvent(new Event('focus'))],
      ['visibilitychange', () => document.dispatchEvent(new Event('visibilitychange'))],
      ['Capacitor resume', () => document.dispatchEvent(new Event('resume'))],
    ])('%s restarts a loop whose frame was dropped', (_, fire) => {
      const pm = new PowerManager(mockDeps);
      pm.initialize();
      pm.startAnimating();
      dropPendingFrame(pm);

      fire();
      jest.advanceTimersByTime(FRAME_MS);

      expect(mockDeps.renderFrame).toHaveBeenCalled();
      pm.dispose();
    });

    test('resume schedules exactly one loop', () => {
      const pm = new PowerManager(mockDeps);
      pm.initialize();
      pm.startAnimating();

      window.dispatchEvent(new Event('focus'));
      jest.advanceTimersByTime(FRAME_MS);

      expect(mockDeps.renderFrame).toHaveBeenCalledTimes(1);
      pm.dispose();
    });
  });

  describe('requestRender', () => {
    test('starts animating if not already', () => {
      expect(powerManager.isAnimating()).toBe(false);

      powerManager.requestRender();

      expect(powerManager.isAnimating()).toBe(true);
    });

    test('does not start animating if page not visible', () => {
      Object.defineProperty(document, 'hidden', {
        value: true,
        writable: true,
        configurable: true,
      });

      const pm = new PowerManager(mockDeps);
      pm.initialize();
      document.dispatchEvent(new Event('visibilitychange'));

      expect(pm.isPageVisible()).toBe(false);
      pm.requestRender();
      expect(pm.isAnimating()).toBe(false);

      Object.defineProperty(document, 'hidden', {
        value: false,
        writable: true,
        configurable: true,
      });
      pm.dispose();
    });

    test('resets idle timeout', () => {
      powerManager.startAnimating();

      jest.advanceTimersByTime(2000);
      powerManager.requestRender();

      // Should not stop at the original deadline
      jest.advanceTimersByTime(2000);
      expect(powerManager.isAnimating()).toBe(true);

      // Should stop after a full idle period since the request
      jest.advanceTimersByTime(2000);
      expect(powerManager.isAnimating()).toBe(false);
    });
  });

  describe('startAnimating', () => {
    test('sets animating', () => {
      powerManager.startAnimating();
      expect(powerManager.isAnimating()).toBe(true);
    });

    test('does not start a second loop if already animating', () => {
      powerManager.startAnimating();
      powerManager.startAnimating();

      jest.advanceTimersByTime(FRAME_MS);

      expect(mockDeps.renderFrame).toHaveBeenCalledTimes(1);
    });
  });

  describe('stopAnimating', () => {
    test('clears animating', () => {
      powerManager.startAnimating();
      powerManager.stopAnimating();
      expect(powerManager.isAnimating()).toBe(false);
    });
  });

  describe('idle timeout', () => {
    test('stops animation after idle timeout', () => {
      powerManager.startAnimating();

      jest.advanceTimersByTime(3000);

      expect(powerManager.isAnimating()).toBe(false);
    });

    test('keeps animating if shouldKeepAnimating returns true', () => {
      mockDeps.shouldKeepAnimating.mockReturnValue(true);
      powerManager.startAnimating();

      jest.advanceTimersByTime(5000);

      expect(powerManager.isAnimating()).toBe(true);
    });
  });

  describe('dispose', () => {
    test('stops the loop', () => {
      powerManager.startAnimating();
      powerManager.dispose();

      jest.advanceTimersByTime(FRAME_MS * 3);

      expect(powerManager.isAnimating()).toBe(false);
      expect(mockDeps.renderFrame).not.toHaveBeenCalled();
    });
  });
});
