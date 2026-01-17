/**
 * @fileoverview Tests for EventBus module.
 */

import {jest} from '@jest/globals';
import {EventBus, Events, globalEventBus} from '../modules/core/EventBus.js';

describe('EventBus', () => {
  let eventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  describe('on', () => {
    test('subscribes to events', () => {
      const callback = jest.fn();
      eventBus.on('test', callback);
      eventBus.emit('test', {data: 'value'});
      expect(callback).toHaveBeenCalledWith({data: 'value'});
    });

    test('returns subscription with unsubscribe method', () => {
      const callback = jest.fn();
      const subscription = eventBus.on('test', callback);
      expect(subscription).toHaveProperty('unsubscribe');
      expect(typeof subscription.unsubscribe).toBe('function');
    });

    test('allows multiple subscribers to same event', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      eventBus.on('test', callback1);
      eventBus.on('test', callback2);
      eventBus.emit('test', 'data');
      expect(callback1).toHaveBeenCalledWith('data');
      expect(callback2).toHaveBeenCalledWith('data');
    });

    test('tracks subscriber ID when provided', () => {
      const callback = jest.fn();
      eventBus.on('test', callback, {subscriberId: 'module1'});
      eventBus.emit('test');
      expect(callback).toHaveBeenCalled();
    });
  });

  describe('once', () => {
    test('subscribes only for first emission', () => {
      const callback = jest.fn();
      eventBus.once('test', callback);
      eventBus.emit('test', 'first');
      eventBus.emit('test', 'second');
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith('first');
    });

    test('returns subscription with unsubscribe method', () => {
      const callback = jest.fn();
      const subscription = eventBus.once('test', callback);
      expect(subscription).toHaveProperty('unsubscribe');
    });
  });

  describe('off', () => {
    test('removes specific callback', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      eventBus.on('test', callback1);
      eventBus.on('test', callback2);
      eventBus.off('test', callback1);
      eventBus.emit('test');
      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    test('handles removing non-existent callback gracefully', () => {
      const callback = jest.fn();
      expect(() => eventBus.off('nonexistent', callback)).not.toThrow();
    });

    test('cleans up empty listener arrays', () => {
      const callback = jest.fn();
      eventBus.on('test', callback);
      eventBus.off('test', callback);
      expect(eventBus.hasListeners('test')).toBe(false);
    });
  });

  describe('offAll', () => {
    test('removes all subscriptions for a subscriber ID', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      eventBus.on('event1', callback1, {subscriberId: 'module1'});
      eventBus.on('event2', callback2, {subscriberId: 'module1'});
      eventBus.offAll('module1');
      eventBus.emit('event1');
      eventBus.emit('event2');
      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
    });

    test('handles non-existent subscriber ID gracefully', () => {
      expect(() => eventBus.offAll('nonexistent')).not.toThrow();
    });
  });

  describe('emit', () => {
    test('passes data to callbacks', () => {
      const callback = jest.fn();
      eventBus.on('test', callback);
      const testData = {key: 'value', num: 42};
      eventBus.emit('test', testData);
      expect(callback).toHaveBeenCalledWith(testData);
    });

    test('handles no subscribers gracefully', () => {
      expect(() => eventBus.emit('nonexistent', {})).not.toThrow();
    });

    test('continues after callback error', () => {
      const errorCallback = jest.fn(() => {
        throw new Error('Test error');
      });
      const normalCallback = jest.fn();
      eventBus.on('test', errorCallback);
      eventBus.on('test', normalCallback);
      eventBus.emit('test');
      expect(normalCallback).toHaveBeenCalled();
    });

    test('allows modifications during iteration', () => {
      const dynamicCallback = jest.fn(() => {
        eventBus.on('test', () => {});
      });
      eventBus.on('test', dynamicCallback);
      expect(() => eventBus.emit('test')).not.toThrow();
    });
  });

  describe('hasListeners', () => {
    test('returns true when listeners exist', () => {
      eventBus.on('test', () => {});
      expect(eventBus.hasListeners('test')).toBe(true);
    });

    test('returns false when no listeners exist', () => {
      expect(eventBus.hasListeners('test')).toBe(false);
    });

    test('returns false after all listeners removed', () => {
      const callback = jest.fn();
      eventBus.on('test', callback);
      eventBus.off('test', callback);
      expect(eventBus.hasListeners('test')).toBe(false);
    });
  });

  describe('listenerCount', () => {
    test('returns 0 for event with no listeners', () => {
      expect(eventBus.listenerCount('test')).toBe(0);
    });

    test('returns correct count', () => {
      eventBus.on('test', () => {});
      eventBus.on('test', () => {});
      eventBus.on('test', () => {});
      expect(eventBus.listenerCount('test')).toBe(3);
    });
  });

  describe('clear', () => {
    test('removes all listeners', () => {
      eventBus.on('event1', () => {});
      eventBus.on('event2', () => {});
      eventBus.clear();
      expect(eventBus.hasListeners('event1')).toBe(false);
      expect(eventBus.hasListeners('event2')).toBe(false);
    });
  });

  describe('generateSubscriptionId', () => {
    test('returns unique IDs', () => {
      const id1 = eventBus.generateSubscriptionId();
      const id2 = eventBus.generateSubscriptionId();
      const id3 = eventBus.generateSubscriptionId();
      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
    });

    test('returns string starting with sub_', () => {
      const id = eventBus.generateSubscriptionId();
      expect(id).toMatch(/^sub_\d+$/);
    });
  });

  describe('subscription.unsubscribe', () => {
    test('removes callback when called', () => {
      const callback = jest.fn();
      const subscription = eventBus.on('test', callback);
      subscription.unsubscribe();
      eventBus.emit('test');
      expect(callback).not.toHaveBeenCalled();
    });
  });
});

describe('Events', () => {
  test('contains standard event names', () => {
    expect(Events.DATA_LOADED).toBeDefined();
    expect(Events.CAMERA_MOVE).toBeDefined();
    expect(Events.OBJECT_SELECTED).toBeDefined();
    expect(Events.TIME_CHANGED).toBeDefined();
    expect(Events.LOCATION_CHANGED).toBeDefined();
    expect(Events.GAME_STARTED).toBeDefined();
    expect(Events.TOUR_STARTED).toBeDefined();
  });

  test('event names follow naming convention', () => {
    Object.values(Events).forEach((eventName) => {
      expect(eventName).toMatch(/^[a-z]+:[a-z:]+$/);
    });
  });
});

describe('globalEventBus', () => {
  test('is an EventBus instance', () => {
    expect(globalEventBus).toBeInstanceOf(EventBus);
  });

  afterEach(() => {
    globalEventBus.clear();
  });
});
