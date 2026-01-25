/**
 * @fileoverview Tests for Utils module.
 */

import {jest} from '@jest/globals';
import {debounce, throttle, clamp, lerp} from '../modules/core/Utils.js';

describe('Utils', () => {
  describe('debounce', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('delays function execution by specified time', () => {
      const fn = jest.fn();
      const debouncedFn = debounce(fn, 100);

      debouncedFn();

      // Function should not be called immediately
      expect(fn).not.toHaveBeenCalled();

      // Advance time by 50ms - still not called
      jest.advanceTimersByTime(50);
      expect(fn).not.toHaveBeenCalled();

      // Advance to 100ms - now called
      jest.advanceTimersByTime(50);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    test('resets timer on subsequent calls', () => {
      const fn = jest.fn();
      const debouncedFn = debounce(fn, 100);

      debouncedFn();
      jest.advanceTimersByTime(50);

      // Call again before timer expires
      debouncedFn();
      jest.advanceTimersByTime(50);

      // Should not have been called yet (timer reset)
      expect(fn).not.toHaveBeenCalled();

      // Advance another 50ms to complete the reset timer
      jest.advanceTimersByTime(50);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    test('passes arguments to debounced function', () => {
      const fn = jest.fn();
      const debouncedFn = debounce(fn, 100);

      debouncedFn('arg1', 'arg2', 123);
      jest.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledWith('arg1', 'arg2', 123);
    });

    test('uses latest arguments when called multiple times', () => {
      const fn = jest.fn();
      const debouncedFn = debounce(fn, 100);

      debouncedFn('first');
      debouncedFn('second');
      debouncedFn('third');
      jest.advanceTimersByTime(100);

      // Should only be called once with the last arguments
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('third');
    });

    test('preserves this context', () => {
      const obj = {
        value: 42,
        fn: jest.fn(function() {
          return this.value;
        }),
      };

      obj.debouncedFn = debounce(obj.fn, 100);
      obj.debouncedFn();
      jest.advanceTimersByTime(100);

      expect(obj.fn.mock.instances[0]).toBe(obj);
    });

    test('handles zero delay', () => {
      const fn = jest.fn();
      const debouncedFn = debounce(fn, 0);

      debouncedFn();
      jest.advanceTimersByTime(0);

      expect(fn).toHaveBeenCalledTimes(1);
    });

    test('allows multiple independent debounced functions', () => {
      const fn1 = jest.fn();
      const fn2 = jest.fn();
      const debouncedFn1 = debounce(fn1, 100);
      const debouncedFn2 = debounce(fn2, 200);

      debouncedFn1();
      debouncedFn2();

      jest.advanceTimersByTime(100);
      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn2).not.toHaveBeenCalled();

      jest.advanceTimersByTime(100);
      expect(fn2).toHaveBeenCalledTimes(1);
    });

    test('cancel prevents pending execution', () => {
      const fn = jest.fn();
      const debouncedFn = debounce(fn, 100);

      debouncedFn();
      expect(fn).not.toHaveBeenCalled();

      // Cancel before timeout
      debouncedFn.cancel();

      jest.advanceTimersByTime(100);
      expect(fn).not.toHaveBeenCalled();
    });

    test('cancel does nothing if no pending execution', () => {
      const fn = jest.fn();
      const debouncedFn = debounce(fn, 100);

      // Cancel without calling debounced function first
      expect(() => debouncedFn.cancel()).not.toThrow();

      // Cancel after execution completes
      debouncedFn();
      jest.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);

      expect(() => debouncedFn.cancel()).not.toThrow();
    });

    test('can call debounced function again after cancel', () => {
      const fn = jest.fn();
      const debouncedFn = debounce(fn, 100);

      debouncedFn('first');
      debouncedFn.cancel();

      debouncedFn('second');
      jest.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('second');
    });
  });

  describe('throttle', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('executes function immediately on first call', () => {
      const fn = jest.fn();
      const throttledFn = throttle(fn, 100);

      throttledFn();

      expect(fn).toHaveBeenCalledTimes(1);
    });

    test('blocks subsequent calls within throttle period', () => {
      const fn = jest.fn();
      const throttledFn = throttle(fn, 100);

      throttledFn();
      throttledFn();
      throttledFn();

      expect(fn).toHaveBeenCalledTimes(1);
    });

    test('allows call after throttle period expires', () => {
      const fn = jest.fn();
      const throttledFn = throttle(fn, 100);

      throttledFn();
      expect(fn).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(100);

      throttledFn();
      expect(fn).toHaveBeenCalledTimes(2);
    });

    test('passes arguments to throttled function', () => {
      const fn = jest.fn();
      const throttledFn = throttle(fn, 100);

      throttledFn('arg1', 'arg2');

      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });

    test('preserves this context', () => {
      const obj = {
        value: 42,
        fn: jest.fn(function() {
          return this.value;
        }),
      };

      obj.throttledFn = throttle(obj.fn, 100);
      obj.throttledFn();

      expect(obj.fn.mock.instances[0]).toBe(obj);
    });
  });

  describe('clamp', () => {
    test('returns value when within range', () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(0, 0, 10)).toBe(0);
      expect(clamp(10, 0, 10)).toBe(10);
    });

    test('returns min when value is below range', () => {
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(-100, -50, 50)).toBe(-50);
    });

    test('returns max when value is above range', () => {
      expect(clamp(15, 0, 10)).toBe(10);
      expect(clamp(100, -50, 50)).toBe(50);
    });

    test('handles equal min and max', () => {
      expect(clamp(5, 5, 5)).toBe(5);
      expect(clamp(0, 5, 5)).toBe(5);
      expect(clamp(10, 5, 5)).toBe(5);
    });

    test('handles negative ranges', () => {
      expect(clamp(-5, -10, -1)).toBe(-5);
      expect(clamp(0, -10, -1)).toBe(-1);
      expect(clamp(-20, -10, -1)).toBe(-10);
    });

    test('handles floating point values', () => {
      expect(clamp(0.5, 0, 1)).toBe(0.5);
      expect(clamp(1.5, 0, 1)).toBe(1);
      expect(clamp(-0.5, 0, 1)).toBe(0);
    });
  });

  describe('lerp', () => {
    test('returns start value when t is 0', () => {
      expect(lerp(0, 10, 0)).toBe(0);
      expect(lerp(-5, 5, 0)).toBe(-5);
    });

    test('returns end value when t is 1', () => {
      expect(lerp(0, 10, 1)).toBe(10);
      expect(lerp(-5, 5, 1)).toBe(5);
    });

    test('returns midpoint when t is 0.5', () => {
      expect(lerp(0, 10, 0.5)).toBe(5);
      expect(lerp(-5, 5, 0.5)).toBe(0);
    });

    test('interpolates correctly for other t values', () => {
      expect(lerp(0, 100, 0.25)).toBe(25);
      expect(lerp(0, 100, 0.75)).toBe(75);
      expect(lerp(10, 20, 0.3)).toBeCloseTo(13);
    });

    test('extrapolates when t is outside 0-1', () => {
      expect(lerp(0, 10, 2)).toBe(20);
      expect(lerp(0, 10, -1)).toBe(-10);
    });

    test('handles equal start and end values', () => {
      expect(lerp(5, 5, 0)).toBe(5);
      expect(lerp(5, 5, 0.5)).toBe(5);
      expect(lerp(5, 5, 1)).toBe(5);
    });

    test('handles negative values', () => {
      expect(lerp(-10, -5, 0.5)).toBe(-7.5);
      expect(lerp(-10, 10, 0.5)).toBe(0);
    });
  });
});
