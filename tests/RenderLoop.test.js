/**
 * @fileoverview Tests for RenderLoop module.
 */

import {jest} from '@jest/globals';
import {RenderLoop, initializeRenderLoop} from '../modules/core/RenderLoop.js';

describe('RenderLoop', () => {
  let renderLoop;
  let mockDeps;
  let rafCallbacks;
  let rafId;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock requestAnimationFrame
    rafCallbacks = [];
    rafId = 0;

    global.requestAnimationFrame = jest.fn((callback) => {
      rafId++;
      rafCallbacks.push({id: rafId, callback});
      return rafId;
    });

    global.cancelAnimationFrame = jest.fn((id) => {
      rafCallbacks = rafCallbacks.filter((cb) => cb.id !== id);
    });

    mockDeps = {
      shouldRender: jest.fn(() => true),
      onFrame: jest.fn(),
      render: jest.fn(),
    };

    renderLoop = new RenderLoop(mockDeps);
  });

  afterEach(() => {
    renderLoop.dispose();
  });

  /**
   * Simulate a single animation frame.
   */
  function runFrame() {
    const callbacks = [...rafCallbacks];
    rafCallbacks = [];
    callbacks.forEach((cb) => cb.callback());
  }

  describe('constructor', () => {
    test('creates instance with dependencies', () => {
      expect(renderLoop).toBeInstanceOf(RenderLoop);
    });

    test('initializes with frame count 0', () => {
      expect(renderLoop.getFrameCount()).toBe(0);
    });

    test('initializes not running', () => {
      expect(renderLoop.isRunning()).toBe(false);
    });
  });

  describe('start', () => {
    test('sets running flag', () => {
      renderLoop.start();
      expect(renderLoop.isRunning()).toBe(true);
    });

    test('requests animation frame', () => {
      renderLoop.start();
      expect(global.requestAnimationFrame).toHaveBeenCalled();
    });

    test('does nothing if already running', () => {
      renderLoop.start();
      const callCount = global.requestAnimationFrame.mock.calls.length;

      renderLoop.start();
      expect(global.requestAnimationFrame).toHaveBeenCalledTimes(callCount);
    });
  });

  describe('stop', () => {
    test('clears running flag', () => {
      renderLoop.start();
      renderLoop.stop();
      expect(renderLoop.isRunning()).toBe(false);
    });

    test('cancels animation frame', () => {
      renderLoop.start();
      renderLoop.stop();
      expect(global.cancelAnimationFrame).toHaveBeenCalled();
    });
  });

  describe('animation loop', () => {
    test('increments frame count on each frame', () => {
      renderLoop.start();

      runFrame();
      expect(renderLoop.getFrameCount()).toBe(1);

      runFrame();
      expect(renderLoop.getFrameCount()).toBe(2);
    });

    test('calls onFrame callback with frame count', () => {
      renderLoop.start();
      runFrame();

      expect(mockDeps.onFrame).toHaveBeenCalledWith(1);
    });

    test('calls render function', () => {
      renderLoop.start();
      runFrame();

      expect(mockDeps.render).toHaveBeenCalled();
    });

    test('schedules next frame', () => {
      renderLoop.start();
      runFrame();

      // Should have requested another frame
      expect(rafCallbacks.length).toBe(1);
    });

    test('skips render when shouldRender returns false', () => {
      mockDeps.shouldRender.mockReturnValue(false);

      renderLoop.start();
      runFrame();

      expect(mockDeps.render).not.toHaveBeenCalled();
      expect(renderLoop.getFrameCount()).toBe(0);
    });

    test('does not run frame when stopped', () => {
      renderLoop.start();
      renderLoop.stop();

      // Clear callbacks from start
      rafCallbacks = [];
      mockDeps.onFrame.mockClear();
      mockDeps.render.mockClear();

      // Simulate trying to run frame after stop
      const loop = new RenderLoop(mockDeps);
      loop.start();
      loop.stop();
      runFrame();

      // render should not have been called since isRunning is false
      expect(mockDeps.render).not.toHaveBeenCalled();
    });
  });

  describe('resetFrameCount', () => {
    test('resets frame count to zero', () => {
      renderLoop.start();
      runFrame();
      runFrame();
      expect(renderLoop.getFrameCount()).toBe(2);

      renderLoop.resetFrameCount();
      expect(renderLoop.getFrameCount()).toBe(0);
    });
  });

  describe('dispose', () => {
    test('stops the render loop', () => {
      renderLoop.start();
      renderLoop.dispose();

      expect(renderLoop.isRunning()).toBe(false);
    });
  });
});

describe('initializeRenderLoop', () => {
  beforeEach(() => {
    global.requestAnimationFrame = jest.fn(() => 1);
    global.cancelAnimationFrame = jest.fn();
  });

  test('returns a RenderLoop instance', () => {
    const deps = {render: jest.fn()};
    const loop = initializeRenderLoop(deps);
    expect(loop).toBeInstanceOf(RenderLoop);
    loop.dispose();
  });
});
