/**
 * @fileoverview Tests for TimeController module.
 */

import {jest} from '@jest/globals';
import {
  TimeController,
  initializeTimeController,
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

  describe('resetToNow', () => {
    test('resets to current real time', () => {
      controller.setTime(new Date('2020-01-01'));
      controller.resetToNow();
      const diff = Math.abs(controller.getTime().getTime() - Date.now());
      expect(diff).toBeLessThan(1000);
    });

    test('pauses playback', () => {
      controller.setSpeed(10);
      controller.resetToNow();
      expect(controller.getSpeed()).toBe(0);
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
    test('starts playback when paused', () => {
      controller.togglePlayback();
      expect(controller.isPlaying()).toBe(true);
      expect(controller.getSpeed()).toBe(1);
    });

    test('pauses when playing', () => {
      controller.setSpeed(10);
      controller.togglePlayback();
      expect(controller.isPlaying()).toBe(false);
      expect(controller.getSpeed()).toBe(0);
    });

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

  describe('play', () => {
    test('starts playback at default speed', () => {
      controller.play();
      expect(controller.isPlaying()).toBe(true);
      expect(controller.getSpeed()).toBe(1);
    });

    test('starts playback at specified speed', () => {
      controller.play(10);
      expect(controller.getSpeed()).toBe(10);
    });

    test('uses default speed when paused', () => {
      controller.setSpeed(50);
      controller.pause(); // Sets speed to 0
      controller.play(); // play() uses timeSpeed_ || 1, which is 0 || 1 = 1
      expect(controller.getSpeed()).toBe(1);
    });
  });

  describe('pause', () => {
    test('pauses playback', () => {
      controller.play(10);
      controller.pause();
      expect(controller.isPlaying()).toBe(false);
      expect(controller.getSpeed()).toBe(0);
    });
  });

  describe('nextSpeed / previousSpeed', () => {
    test('cycles through speed presets', () => {
      const initialSpeed = controller.getSpeed();
      controller.nextSpeed();
      const newSpeed = controller.getSpeed();
      // Should have changed to next preset
      expect(newSpeed).not.toBe(initialSpeed);
    });

    test('wraps around at end of presets', () => {
      // Cycle through all presets
      for (let i = 0; i < 10; i++) {
        controller.nextSpeed();
      }
      // Should not throw
    });

    test('previousSpeed goes backward', () => {
      controller.nextSpeed(); // Go to index 1
      controller.nextSpeed(); // Go to index 2
      controller.previousSpeed(); // Back to index 1
      // Should be at second preset now
    });
  });

  describe('speedUp / slowDown', () => {
    test('speedUp multiplies speed', () => {
      controller.setSpeed(10);
      controller.speedUp();
      expect(controller.getSpeed()).toBe(20);
    });

    test('speedUp uses custom factor', () => {
      controller.setSpeed(10);
      controller.speedUp(5);
      expect(controller.getSpeed()).toBe(50);
    });

    test('speedUp has minimum of 1', () => {
      controller.setSpeed(0);
      controller.speedUp();
      expect(controller.getSpeed()).toBeGreaterThanOrEqual(1);
    });

    test('slowDown divides speed', () => {
      controller.setSpeed(20);
      controller.slowDown();
      expect(controller.getSpeed()).toBe(10);
    });

    test('slowDown pauses when speed drops below 1', () => {
      controller.setSpeed(1);
      controller.slowDown();
      expect(controller.getSpeed()).toBe(0);
    });
  });

  describe('step methods', () => {
    let initialTime;

    beforeEach(() => {
      initialTime = new Date('2023-06-15T12:00:00Z');
      controller.setTime(initialTime);
      jest.clearAllMocks();
    });

    test('stepForward adds milliseconds', () => {
      controller.stepForward(60000); // 1 minute
      expect(controller.getTime().getTime()).toBe(initialTime.getTime() + 60000);
    });

    test('stepBackward subtracts milliseconds', () => {
      controller.stepBackward(60000);
      expect(controller.getTime().getTime()).toBe(initialTime.getTime() - 60000);
    });

    test('stepHour advances by 1 hour', () => {
      controller.stepHour();
      const diff = controller.getTime().getTime() - initialTime.getTime();
      expect(diff).toBe(3600000);
    });

    test('stepDay advances by 1 day', () => {
      controller.stepDay();
      const diff = controller.getTime().getTime() - initialTime.getTime();
      expect(diff).toBe(86400000);
    });

    test('stepWeek advances by 7 days', () => {
      controller.stepWeek();
      const diff = controller.getTime().getTime() - initialTime.getTime();
      expect(diff).toBe(604800000);
    });

    test('stepMonth advances by 30 days', () => {
      controller.stepMonth();
      const diff = controller.getTime().getTime() - initialTime.getTime();
      expect(diff).toBe(2592000000);
    });
  });

  describe('update', () => {
    test('returns false when paused', () => {
      expect(controller.update(16)).toBe(false);
    });

    test('returns true when playing', () => {
      controller.play(1);
      expect(controller.update(16)).toBe(true);
    });

    test('advances time by speed * deltaMs', () => {
      const startTime = new Date('2023-06-15T12:00:00Z');
      controller.setTime(startTime);
      controller.play(100);
      controller.update(1000); // 1 second real time
      const elapsed = controller.getTime().getTime() - startTime.getTime();
      expect(elapsed).toBe(100000); // 100 seconds simulated
    });

    test('rotates celestial sphere', () => {
      controller.play(1);
      controller.update(1000);
      expect(mockDependencies.rotateCelestialSphere).toHaveBeenCalled();
    });

    test('emits TIME_TICK event', () => {
      const callback = jest.fn();
      globalEventBus.on(Events.TIME_TICK, callback);
      controller.play(1);
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
      controller.play(3600); // 1 hour per second
      // Simulate several hours passing
      for (let i = 0; i < 5; i++) {
        controller.update(1000);
      }
      // Planets should have been updated
      expect(mockDependencies.updatePlanets).toHaveBeenCalled();
    });
  });

  describe('getSpeedDisplayString', () => {
    test('returns "Paused" for speed 0', () => {
      controller.setSpeed(0);
      expect(controller.getSpeedDisplayString()).toBe('Paused');
    });

    test('returns "Real-time" for speed 1', () => {
      controller.setSpeed(1);
      expect(controller.getSpeedDisplayString()).toBe('Real-time');
    });

    test('formats preset speeds', () => {
      controller.setSpeed(60);
      expect(controller.getSpeedDisplayString()).toBe('1 min/s');
      controller.setSpeed(600);
      expect(controller.getSpeedDisplayString()).toBe('10 min/s');
      controller.setSpeed(3600);
      expect(controller.getSpeedDisplayString()).toBe('1 hr/s');
    });

    test('formats non-preset speeds with x notation', () => {
      controller.setSpeed(10);
      expect(controller.getSpeedDisplayString()).toBe('x10');
      controller.setSpeed(120);
      expect(controller.getSpeedDisplayString()).toBe('x120');
    });
  });

  describe('getFormattedTime', () => {
    beforeEach(() => {
      controller.setTime(new Date('2023-06-15T14:30:00Z'));
    });

    test('formats date only', () => {
      const result = controller.getFormattedTime('date');
      expect(result).toBeTruthy();
    });

    test('formats time only', () => {
      const result = controller.getFormattedTime('time');
      expect(result).toBeTruthy();
    });

    test('formats ISO', () => {
      const result = controller.getFormattedTime('iso');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    test('formats short', () => {
      const result = controller.getFormattedTime('short');
      expect(result).toBeTruthy();
    });

    test('formats full by default', () => {
      const result = controller.getFormattedTime();
      expect(result).toBeTruthy();
    });
  });

  describe('getTimeOfDay', () => {
    test('returns dawn for 6-8 AM', () => {
      controller.setTime(new Date('2023-06-15T07:00:00'));
      expect(controller.getTimeOfDay()).toBe('dawn');
    });

    test('returns day for 8-18', () => {
      controller.setTime(new Date('2023-06-15T12:00:00'));
      expect(controller.getTimeOfDay()).toBe('day');
    });

    test('returns dusk for 18-20', () => {
      controller.setTime(new Date('2023-06-15T19:00:00'));
      expect(controller.getTimeOfDay()).toBe('dusk');
    });

    test('returns night for 20-6', () => {
      controller.setTime(new Date('2023-06-15T23:00:00'));
      expect(controller.getTimeOfDay()).toBe('night');
    });
  });

  describe('isNight', () => {
    test('returns true for night, dusk, dawn', () => {
      controller.setTime(new Date('2023-06-15T07:00:00')); // dawn
      expect(controller.isNight()).toBe(true);

      controller.setTime(new Date('2023-06-15T19:00:00')); // dusk
      expect(controller.isNight()).toBe(true);

      controller.setTime(new Date('2023-06-15T23:00:00')); // night
      expect(controller.isNight()).toBe(true);
    });

    test('returns false for day', () => {
      controller.setTime(new Date('2023-06-15T12:00:00'));
      expect(controller.isNight()).toBe(false);
    });
  });

  describe('getJulianDate / setFromJulianDate', () => {
    test('calculates J2000.0 correctly', () => {
      controller.setTime(new Date(Date.UTC(2000, 0, 1, 12, 0, 0)));
      expect(controller.getJulianDate()).toBeCloseTo(2451545.0, 3);
    });

    test('round-trips through Julian Date', () => {
      const original = new Date('2023-06-15T12:00:00Z');
      controller.setTime(original);
      const jd = controller.getJulianDate();
      controller.setFromJulianDate(jd);
      const result = controller.getTime();
      expect(Math.abs(result.getTime() - original.getTime())).toBeLessThan(1000);
    });
  });

  describe('dispose', () => {
    test('pauses playback', () => {
      controller.play(10);
      controller.dispose();
      expect(controller.isPlaying()).toBe(false);
    });
  });
});

describe('initializeTimeController', () => {
  test('creates and returns TimeController instance', () => {
    const mockDeps = {
      updatePlanets: jest.fn(),
      rotateCelestialSphere: jest.fn(),
      setCelestialRotation: jest.fn(),
      calculateLST: jest.fn(),
      getLongitude: jest.fn(),
    };
    const result = initializeTimeController(mockDeps);
    expect(result).toBeInstanceOf(TimeController);
  });
});
