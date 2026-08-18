/**
 * @fileoverview Tests for TimeController module.
 */

import {jest} from '@jest/globals';
import {
  TimeController,
} from '../modules/features/TimeController.js';
import {globalEventBus, Events} from '../modules/core/EventBus.js';

describe('TimeController', () => {
  let controller;
  let mockDependencies;

  beforeEach(() => {
    mockDependencies = {
      updatePlanets: jest.fn(),
      rotateCelestialSphere: jest.fn(),
      setCelestialRotation: jest.fn(),
      calculateLST: jest.fn().mockReturnValue(0),
      getLongitude: jest.fn().mockReturnValue(0),
    };
    controller = new TimeController(mockDependencies);
    globalEventBus.clear();
  });

  describe('constructor', () => {
    test('initializes with current time', () => {
      const now = Date.now();
      const controllerTime = controller.getTime().getTime();
      expect(Math.abs(controllerTime - now)).toBeLessThan(1000);
    });

    test('starts paused', () => {
      expect(controller.isPlaying()).toBe(false);
      expect(controller.getSpeed()).toBe(0);
    });
  });

  describe('getTime', () => {
    test('returns copy of simulation time', () => {
      const time1 = controller.getTime();
      const time2 = controller.getTime();
      expect(time1).not.toBe(time2);
      expect(time1.getTime()).toBe(time2.getTime());
    });
  });

  describe('setTime', () => {
    test('sets simulation time', () => {
      const newTime = new Date('2023-06-15T12:00:00Z');
      controller.setTime(newTime);
      expect(controller.getTime().getTime()).toBe(newTime.getTime());
    });

    test('calls updatePlanets', () => {
      controller.setTime(new Date());
      expect(mockDependencies.updatePlanets).toHaveBeenCalled();
    });

    test('updates celestial rotation', () => {
      controller.setTime(new Date());
      expect(mockDependencies.setCelestialRotation).toHaveBeenCalled();
    });

    test('emits TIME_CHANGED event', () => {
      const callback = jest.fn();
      globalEventBus.on(Events.TIME_CHANGED, callback);
      controller.setTime(new Date());
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          time: expect.any(Date),
          speed: expect.any(Number),
          isPlaying: expect.any(Boolean),
        })
      );
    });
  });

  describe('jumpToTime', () => {
    test('delegates to setTime', () => {
      const newTime = new Date('2024-01-01T00:00:00Z');
      controller.jumpToTime(newTime);
      expect(controller.getTime().getTime()).toBe(newTime.getTime());
    });
  });
  describe('setSpeed', () => {
    test('sets time speed', () => {
      controller.setSpeed(100);
      expect(controller.getSpeed()).toBe(100);
    });

    test('sets isPlaying to true for non-zero speed', () => {
      controller.setSpeed(1);
      expect(controller.isPlaying()).toBe(true);
    });

    test('sets isPlaying to false for zero speed', () => {
      controller.setSpeed(10);
      controller.setSpeed(0);
      expect(controller.isPlaying()).toBe(false);
    });

    test('emits TIME_SPEED_CHANGED event', () => {
      const callback = jest.fn();
      globalEventBus.on(Events.TIME_SPEED_CHANGED, callback);
      controller.setSpeed(60);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          speed: 60,
          speedDisplay: expect.any(String),
          isPlaying: true,
        })
      );
    });
  });

  describe('togglePlayback', () => {
    test('uses custom default speed', () => {
      controller.togglePlayback(100);
      expect(controller.getSpeed()).toBe(100);
    });

    test('resumes at previous speed if speed was not zeroed', () => {
      controller.setSpeed(50);
      controller.pause(); // This sets speed to 0
      // After pausing, timeSpeed_ is 0, so togglePlayback uses defaultSpeed (1)
      controller.togglePlayback();
      expect(controller.getSpeed()).toBe(1);
    });
  });

  describe('update', () => {
    test('returns false when paused', () => {
      expect(controller.update(16)).toBe(false);
    });
    test('advances time by speed * deltaMs', () => {
      const startTime = new Date('2023-06-15T12:00:00Z');
      controller.setTime(startTime);
      controller.setSpeed(100);
      controller.update(1000); // 1 second real time
      const elapsed = controller.getTime().getTime() - startTime.getTime();
      expect(elapsed).toBe(100000); // 100 seconds simulated
    });

    test('rotates celestial sphere', () => {
      controller.setSpeed(1);
      controller.update(1000);
      expect(mockDependencies.rotateCelestialSphere).toHaveBeenCalled();
    });

    test('emits TIME_TICK event', () => {
      const callback = jest.fn();
      globalEventBus.on(Events.TIME_TICK, callback);
      controller.setSpeed(1);
      controller.update(16);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          time: expect.any(Date),
          deltaMs: expect.any(Number),
        })
      );
    });

    test('updates planets periodically at high speed', () => {
      jest.clearAllMocks();
      controller.setSpeed(3600); // 1 hour per second
      // Simulate several hours passing
      for (let i = 0; i < 5; i++) {
        controller.update(1000);
      }
      // Planets should have been updated
      expect(mockDependencies.updatePlanets).toHaveBeenCalled();
    });
  });
});

describe('TimeController EventBus integration', () => {
  let controller;

  beforeEach(() => {
    controller = new TimeController({
      updatePlanets: jest.fn(),
      rotateCelestialSphere: jest.fn(),
      setCelestialRotation: jest.fn(),
      calculateLST: jest.fn().mockReturnValue(0),
      getLongitude: jest.fn().mockReturnValue(0),
    });
    globalEventBus.clear();
  });

  test('CMD_TOGGLE_PLAYBACK can be used to control TimeController', () => {
    // This test verifies the pattern used in skymap.js
    // where CMD_TOGGLE_PLAYBACK event triggers controller.togglePlayback()

    globalEventBus.on(Events.CMD_TOGGLE_PLAYBACK, () => {
      controller.togglePlayback();
    });

    expect(controller.isPlaying()).toBe(false);

    // Emit toggle event (as main.js does)
    globalEventBus.emit(Events.CMD_TOGGLE_PLAYBACK);
    expect(controller.isPlaying()).toBe(true);
    expect(controller.getSpeed()).toBe(1);

    // Toggle again
    globalEventBus.emit(Events.CMD_TOGGLE_PLAYBACK);
    expect(controller.isPlaying()).toBe(false);
    expect(controller.getSpeed()).toBe(0);
  });

  test('togglePlayback uses internal state not external properties', () => {
    // This test ensures togglePlayback works correctly with its own state
    // and doesn't rely on external properties like app.isTimePlaying

    // Start at speed 100
    controller.setSpeed(100);
    expect(controller.isPlaying()).toBe(true);

    // Toggle off
    controller.togglePlayback();
    expect(controller.isPlaying()).toBe(false);
    expect(controller.getSpeed()).toBe(0);

    // Toggle on - should use default speed since previous was zeroed
    controller.togglePlayback();
    expect(controller.isPlaying()).toBe(true);
    expect(controller.getSpeed()).toBe(1);
  });

  test('togglePlayback emits TIME_SPEED_CHANGED event', () => {
    const callback = jest.fn();
    globalEventBus.on(Events.TIME_SPEED_CHANGED, callback);

    controller.togglePlayback();

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        speed: 1,
        isPlaying: true,
      })
    );
  });
});
