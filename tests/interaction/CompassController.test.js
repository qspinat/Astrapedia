/**
 * @jest-environment jsdom
 * @fileoverview Tests for CompassController (device-orientation AR heading).
 */

import {jest} from '@jest/globals';
import {
  CompassController,
  adaptiveSmoothing,
} from '../../modules/interaction/CompassController.js';

describe('CompassController', () => {
  let deps;
  let controller;

  beforeEach(() => {
    // jsdom lacks DeviceOrientationEvent; provide a minimal stub (no
    // requestPermission, so the iOS permission branch is skipped).
    window.DeviceOrientationEvent = function DeviceOrientationEvent() {};
    localStorage.clear();

    deps = {
      requestRender: jest.fn(),
      updateCameraPosition: jest.fn(),
      notify: jest.fn(),
    };
    controller = new CompassController(deps);
  });

  afterEach(() => {
    controller.dispose();
    delete window.DeviceOrientationEvent;
    jest.clearAllMocks();
  });

  describe('initial state', () => {
    test('starts disabled with default heading/tilt', () => {
      expect(controller.isEnabled()).toBe(false);
      expect(controller.getHeading()).toBe(0);
      expect(controller.getTilt()).toBeCloseTo(Math.PI / 2, 6);
    });
  });

  describe('enable / disable', () => {
    test('enable turns compass mode on', async () => {
      const enabled = await controller.enable();
      expect(enabled).toBe(true);
      expect(controller.isEnabled()).toBe(true);
    });

    test('toggle enables then disables', async () => {
      await controller.toggle();
      expect(controller.isEnabled()).toBe(true);
      await controller.toggle();
      expect(controller.isEnabled()).toBe(false);
    });

    test('enable fails gracefully without DeviceOrientationEvent', async () => {
      delete window.DeviceOrientationEvent;
      const enabled = await controller.enable();
      expect(enabled).toBe(false);
      expect(controller.isEnabled()).toBe(false);
    });
  });

  describe('handleDeviceOrientation_', () => {
    test('ignores orientation events while disabled', () => {
      controller.handleDeviceOrientation_({alpha: 90, beta: 90, gamma: 0});
      expect(deps.updateCameraPosition).not.toHaveBeenCalled();
      expect(controller.getHeading()).toBe(0);
    });

    test('updates heading and camera when enabled', async () => {
      await controller.enable();
      controller.handleDeviceOrientation_({alpha: 90, beta: 90, gamma: 0});
      expect(controller.getHeading()).not.toBe(0);
      expect(deps.updateCameraPosition).toHaveBeenCalled();
      expect(deps.requestRender).toHaveBeenCalled();
    });

    test('ignores events with null orientation components', async () => {
      await controller.enable();
      deps.updateCameraPosition.mockClear();
      controller.handleDeviceOrientation_({alpha: null, beta: 10, gamma: 10});
      expect(deps.updateCameraPosition).not.toHaveBeenCalled();
    });

    test('keeps tilt (phi) within the clamped pole-safe range', async () => {
      await controller.enable();
      // Device flat on its back -> would map to phi=0, must clamp to >=0.1.
      controller.handleDeviceOrientation_({alpha: 0, beta: 0, gamma: 0});
      const tilt = controller.getTilt();
      expect(tilt).toBeGreaterThanOrEqual(0.1);
      expect(tilt).toBeLessThanOrEqual(Math.PI - 0.1);
    });

    test('applies a dead zone: a repeated identical reading stops moving', async () => {
      await controller.enable();
      // Drive it repeatedly toward the same target; the smoothing converges
      // until the remaining delta falls inside the dead zone and is ignored.
      for (let i = 0; i < 200; i++) {
        controller.handleDeviceOrientation_({alpha: 45, beta: 80, gamma: 5});
      }
      const settled = controller.getHeading();
      deps.updateCameraPosition.mockClear();
      controller.handleDeviceOrientation_({alpha: 45, beta: 80, gamma: 5});
      expect(controller.getHeading()).toBeCloseTo(settled, 6);
      expect(deps.updateCameraPosition).not.toHaveBeenCalled();
    });
  });

  describe('sensor watchdog', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test('turns off when no reading ever arrives', async () => {
      await controller.enable();
      controller.handleDeviceOrientation_({alpha: null, beta: null, gamma: null});
      jest.advanceTimersByTime(3000);
      expect(controller.isEnabled()).toBe(false);
    });

    test('stays on while the phone is held still', async () => {
      await controller.enable();
      controller.handleDeviceOrientation_({alpha: 90, beta: 90, gamma: 0});
      // Android sends nothing while the reading does not change.
      jest.advanceTimersByTime(60000);
      expect(controller.isEnabled()).toBe(true);
    });
  });

  describe('telling the user', () => {
    test('says so when the device has no sensor', async () => {
      delete window.DeviceOrientationEvent;
      await controller.enable();
      expect(deps.notify).toHaveBeenCalledWith(expect.stringContaining('orientation sensor'));
    });

    test('explains drag-to-correct the first time only', async () => {
      await controller.enable();
      controller.disable();
      await controller.enable();
      const hints = deps.notify.mock.calls.filter(([m]) => m.includes('Drag'));
      expect(hints).toHaveLength(1);
    });
  });

  describe('heading correction by dragging', () => {
    /**
     * Angles equal modulo 2pi. Each settle stops within the 0.009 rad jitter
     * dead zone of its target, possibly on opposite sides, so allow twice it.
     */
    const expectSameAngle = (a, b) => {
      expect(Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))).toBeLessThan(0.02);
    };

    /** Feed one sensor reading and return the resulting heading. */
    const settle = () => {
      for (let i = 0; i < 200; i++) {
        controller.handleDeviceOrientation_({alpha: 90, beta: 90, gamma: 0});
      }
      return controller.getHeading();
    };

    test('ignores the sensor while the sky is dragged', async () => {
      await controller.enable();
      const before = settle();
      controller.beginAlignment();
      controller.handleDeviceOrientation_({alpha: 0, beta: 90, gamma: 0});
      expect(controller.getHeading()).toBe(before);
    });

    test('keeps the dragged difference as a correction', async () => {
      await controller.enable();
      const sensorHeading = settle();
      controller.beginAlignment();
      controller.endAlignment(sensorHeading + 0.2);

      expectSameAngle(settle(), sensorHeading + 0.2);
    });

    test('a phone turned during the drag does not skew the correction', async () => {
      await controller.enable();
      settle(); // sensor at alpha 90
      controller.beginAlignment();
      // The phone turns while the user drags; the sky stays where dragged.
      controller.handleDeviceOrientation_({alpha: 60, beta: 90, gamma: 0});
      const sensorNow = controller.sensorHeading_;
      controller.endAlignment(sensorNow + 0.2);
      for (let i = 0; i < 200; i++) {
        controller.handleDeviceOrientation_({alpha: 60, beta: 90, gamma: 0});
      }
      expectSameAngle(controller.getHeading(), sensorNow + 0.2);
    });

    test('remembers the correction next time', async () => {
      await controller.enable();
      const sensorHeading = settle();
      controller.beginAlignment();
      controller.endAlignment(sensorHeading + 0.2);
      controller.dispose();

      controller = new CompassController(deps);
      await controller.enable();
      expectSameAngle(settle(), sensorHeading + 0.2);
    });

    test('a drag outside compass mode changes nothing', () => {
      controller.beginAlignment();
      controller.endAlignment(1);
      expect(controller.getHeading()).toBe(0);
    });
  });
});

describe('adaptiveSmoothing', () => {
  test('damps small jitter heavily', () => {
    expect(adaptiveSmoothing(0.002)).toBe(0.05);
  });

  test('follows a fast sweep closely', () => {
    expect(adaptiveSmoothing(0.3)).toBe(0.5);
  });

  test('is symmetric', () => {
    expect(adaptiveSmoothing(-0.05)).toBe(adaptiveSmoothing(0.05));
  });
});
