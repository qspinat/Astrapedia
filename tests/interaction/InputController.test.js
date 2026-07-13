/**
 * @jest-environment jsdom
 * @fileoverview Tests for InputController (mouse/touch/zoom handling).
 */

import {jest} from '@jest/globals';
import {InputController} from '../../modules/interaction/InputController.js';

describe('InputController', () => {
  let canvas;
  let deps;
  let controller;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    document.body.appendChild(canvas);

    deps = {
      canvas,
      getFov: jest.fn(() => 60),
      getRotation: jest.fn(() => ({theta: 0, phi: Math.PI / 2})),
      setRotation: jest.fn(),
      setTargetFov: jest.fn(),
      setTargetRotation: jest.fn(),
      updateCamera: jest.fn(),
      requestRender: jest.fn(),
      getCanvasHeight: jest.fn(() => 768),
      getAspect: jest.fn(() => 1.33),
      isZoomLocked: jest.fn(() => false),
      onDragStart: jest.fn(),
      onDragEnd: jest.fn(),
      onClick: jest.fn(),
    };
    controller = new InputController(deps);
    controller.initialize();
  });

  afterEach(() => {
    canvas.remove();
    jest.clearAllMocks();
  });

  const mouse = (type, x, y) =>
    canvas.dispatchEvent(new MouseEvent(type, {clientX: x, clientY: y, bubbles: true}));

  describe('drag lifecycle', () => {
    test('mousedown starts dragging and notifies onDragStart', () => {
      mouse('mousedown', 100, 100);
      expect(controller.isDragging()).toBe(true);
      expect(deps.onDragStart).toHaveBeenCalled();
    });

    test('mouseup ends dragging and notifies onDragEnd', () => {
      mouse('mousedown', 100, 100);
      mouse('mouseup', 100, 100);
      expect(controller.isDragging()).toBe(false);
      expect(deps.onDragEnd).toHaveBeenCalled();
    });

    test('dragging rotates the camera on move', () => {
      mouse('mousedown', 100, 100);
      mouse('mousemove', 130, 120);
      expect(deps.setRotation).toHaveBeenCalled();
      expect(deps.updateCamera).toHaveBeenCalled();
    });

    test('move without a prior mousedown does nothing', () => {
      mouse('mousemove', 130, 120);
      expect(deps.setRotation).not.toHaveBeenCalled();
    });
  });

  describe('click vs drag', () => {
    test('a click without movement fires onClick with NDC coords', () => {
      // Center of the default 1024x768 jsdom window -> (0, 0) in NDC.
      mouse('mousedown', 512, 384);
      mouse('mouseup', 512, 384);
      mouse('click', 512, 384);
      expect(deps.onClick).toHaveBeenCalledTimes(1);
      const arg = deps.onClick.mock.calls[0][0];
      expect(arg.x).toBeCloseTo(0, 6);
      expect(arg.y).toBeCloseTo(0, 6);
    });

    test('a click after a drag beyond threshold is suppressed', () => {
      mouse('mousedown', 100, 100);
      mouse('mousemove', 200, 200); // well beyond DRAG_THRESHOLD_PX
      mouse('mouseup', 200, 200);
      mouse('click', 200, 200);
      expect(deps.onClick).not.toHaveBeenCalled();
    });

    test('a tiny move under the threshold still counts as a click', () => {
      mouse('mousedown', 300, 300);
      mouse('mousemove', 302, 301); // < 5px threshold
      mouse('mouseup', 302, 301);
      mouse('click', 302, 301);
      expect(deps.onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('wheel zoom', () => {
    const wheel = (deltaY) => canvas.dispatchEvent(
      new WheelEvent('wheel', {deltaY, clientX: 512, clientY: 384, bubbles: true}));

    test('scrolling down zooms out (larger target FOV)', () => {
      wheel(100);
      expect(deps.setTargetFov).toHaveBeenCalled();
      expect(deps.setTargetFov.mock.calls[0][0]).toBeGreaterThan(60);
    });

    test('scrolling up zooms in (smaller target FOV)', () => {
      wheel(-100);
      expect(deps.setTargetFov.mock.calls[0][0]).toBeLessThan(60);
    });

    test('does not exceed the maximum FOV', () => {
      deps.getFov.mockReturnValue(119);
      wheel(100);
      expect(deps.setTargetFov.mock.calls[0][0]).toBeLessThanOrEqual(120);
    });

    test('ignores the wheel when zoom is locked', () => {
      deps.isZoomLocked.mockReturnValue(true);
      wheel(100);
      expect(deps.setTargetFov).not.toHaveBeenCalled();
    });
  });
});
