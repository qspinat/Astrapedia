/**
 * @jest-environment jsdom
 * @fileoverview Tests for CompassController (device-orientation AR heading).
 */

import {jest} from '@jest/globals';
import {CompassController} from '../../modules/interaction/CompassController.js';

describe('CompassController', () => {
  let deps;
  let controller;

  beforeEach(() => {
    // jsdom lacks DeviceOrientationEvent; provide a minimal stub (no
    // requestPermission, so the iOS permission branch is skipped).
    window.DeviceOrientationEvent = function DeviceOrientationEvent() {};
    window.alert = jest.fn();

    deps = {
      requestRender: jest.fn(),
      updateCameraPosition: jest.fn(),
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
});
