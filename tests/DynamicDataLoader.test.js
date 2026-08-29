/**
 * @fileoverview Tests for DynamicDataLoader module.
 */

import {jest} from '@jest/globals';
import {DynamicDataLoader} from '../modules/services/DynamicDataLoader.js';
import {globalEventBus, Events} from '../modules/core/EventBus.js';

describe('DynamicDataLoader', () => {
  let loader;
  let eventHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Track event emissions
    eventHandler = jest.fn();
    globalEventBus.on(Events.DYNAMIC_QUERY_STARTED, eventHandler);
    globalEventBus.on(Events.DYNAMIC_STARS_LOADED, eventHandler);
    globalEventBus.on(Events.DYNAMIC_QUERY_COMPLETE, eventHandler);
    globalEventBus.on(Events.DYNAMIC_QUERY_RATE_LIMITED, eventHandler);

    loader = new DynamicDataLoader({
      disableRateLimiting: true, // Disable rate limiting for tests
    });
  });

  afterEach(() => {
    globalEventBus.off(Events.DYNAMIC_QUERY_STARTED, eventHandler);
    globalEventBus.off(Events.DYNAMIC_STARS_LOADED, eventHandler);
    globalEventBus.off(Events.DYNAMIC_QUERY_COMPLETE, eventHandler);
    globalEventBus.off(Events.DYNAMIC_QUERY_RATE_LIMITED, eventHandler);
    jest.useRealTimers();
  });

  describe('constructor', () => {
    test('creates instance with default config', () => {
      const defaultLoader = new DynamicDataLoader();
      expect(defaultLoader).toBeInstanceOf(DynamicDataLoader);
    });

    test('accepts custom config', () => {
      const customLoader = new DynamicDataLoader({
        maxStars: 1000,
        maxDSOs: 500,
        maxRegions: 50,
        timeout: 5000,
        rateLimitMs: 2000,
        maxRequestsPerMinute: 10,
      });
      expect(customLoader).toBeInstanceOf(DynamicDataLoader);
    });
  });

  describe('shouldQueryRegion', () => {
    test('returns false when FOV is too wide', () => {
      expect(loader.shouldQueryRegion(0, 0, 20, 12)).toBe(false);
    });

    test('returns false when already querying', () => {
      // Manually set querying state
      loader.isQueryingStars_ = true;
      expect(loader.shouldQueryRegion(0, 0, 1, 12)).toBe(false);
    });

    test('returns true for valid unqueried region', () => {
      expect(loader.shouldQueryRegion(45, 30, 2, 12)).toBe(true);
    });

    test('returns false for already queried region', () => {
      // Query once
      expect(loader.shouldQueryRegion(45, 30, 2, 12)).toBe(true);
      // Add to queried regions
      const key = loader.getRegionKey(45, 30, 2, 12);
      loader.queriedRegions_.add(key);
      // Should return false now
      expect(loader.shouldQueryRegion(45, 30, 2, 12)).toBe(false);
    });
  });

  describe('getRegionKey', () => {
    test('creates consistent region keys', () => {
      const key1 = loader.getRegionKey(45, 30, 2, 12);
      const key2 = loader.getRegionKey(45, 30, 2, 12);
      expect(key1).toBe(key2);
    });

    test('creates different keys for different regions', () => {
      const key1 = loader.getRegionKey(45, 30, 2, 12);
      const key2 = loader.getRegionKey(90, 60, 2, 12);
      expect(key1).not.toBe(key2);
    });

    test('includes FOV bucket in key', () => {
      const deepKey = loader.getRegionKey(0, 0, 0.5, 12);
      const mediumKey = loader.getRegionKey(0, 0, 3, 12);
      const wideKey = loader.getRegionKey(0, 0, 8, 12);
      expect(deepKey).toContain('deep');
      expect(mediumKey).toContain('medium');
      expect(wideKey).toContain('wide');
    });

    test('includes magnitude bucket in key', () => {
      const key10 = loader.getRegionKey(0, 0, 2, 10);
      const key14 = loader.getRegionKey(0, 0, 2, 14);
      expect(key10).toContain('mag10');
      expect(key14).toContain('mag14');
    });
  });

  describe('validateParams_', () => {
    test('returns null for invalid RA', () => {
      expect(loader.validateParams_(-10, 0, 1, 12)).toBeNull();
      expect(loader.validateParams_(400, 0, 1, 12)).toBeNull();
    });

    test('returns null for invalid Dec', () => {
      expect(loader.validateParams_(0, -100, 1, 12)).toBeNull();
      expect(loader.validateParams_(0, 100, 1, 12)).toBeNull();
    });

    test('returns null for invalid radius', () => {
      expect(loader.validateParams_(0, 0, 0, 12)).toBeNull();
      expect(loader.validateParams_(0, 0, -1, 12)).toBeNull();
      expect(loader.validateParams_(0, 0, 200, 12)).toBeNull();
    });

    test('returns null for NaN values', () => {
      expect(loader.validateParams_(NaN, 0, 1, 12)).toBeNull();
      expect(loader.validateParams_(0, NaN, 1, 12)).toBeNull();
      expect(loader.validateParams_(0, 0, NaN, 12)).toBeNull();
      expect(loader.validateParams_(0, 0, 1, NaN)).toBeNull();
    });

    test('returns sanitized params for valid input', () => {
      const result = loader.validateParams_(45.5, 30.5, 2.5, 12.5);
      expect(result).toEqual({
        ra: 45.5,
        dec: 30.5,
        radius: 2.5,
        mag: 12.5,
      });
    });
  });

  describe('rate limiting', () => {
    test('rate limiting can be disabled', () => {
      const noLimitLoader = new DynamicDataLoader({disableRateLimiting: true});
      expect(noLimitLoader.shouldRateLimit_('vizier')).toBe(false);
    });

    test('enforces per-API rate limit', () => {
      const limitedLoader = new DynamicDataLoader({
        disableRateLimiting: false,
        rateLimitMs: 1000,
      });

      // First request should not be limited
      expect(limitedLoader.shouldRateLimit_('vizier')).toBe(false);

      // Record a request
      limitedLoader.recordRequest_('vizier');

      // Next request should be limited
      expect(limitedLoader.shouldRateLimit_('vizier')).toBe(true);

      // After waiting, should not be limited
      jest.advanceTimersByTime(1100);
      expect(limitedLoader.shouldRateLimit_('vizier')).toBe(false);
    });

    test('enforces global request limit', () => {
      const limitedLoader = new DynamicDataLoader({
        disableRateLimiting: false,
        rateLimitMs: 0, // Disable per-API limit
        maxRequestsPerMinute: 3,
      });

      // Make 3 requests
      limitedLoader.recordRequest_('api1');
      limitedLoader.recordRequest_('api2');
      limitedLoader.recordRequest_('api3');

      // Next request should be limited
      expect(limitedLoader.shouldRateLimit_('api4')).toBe(true);
    });

    test('enforces backoff after failures', () => {
      const limitedLoader = new DynamicDataLoader({
        disableRateLimiting: false,
        rateLimitMs: 0,
        maxRequestsPerMinute: 100,
        backoffInitialMs: 1000,
      });

      // Record failures
      limitedLoader.recordFailure_();
      limitedLoader.recordFailure_();

      // Should be in backoff
      expect(limitedLoader.shouldRateLimit_('vizier')).toBe(true);

      // After waiting for backoff, should not be limited
      jest.advanceTimersByTime(5000);
      expect(limitedLoader.shouldRateLimit_('vizier')).toBe(false);
    });

    test('emits rate limited event', () => {
      const limitedLoader = new DynamicDataLoader({
        disableRateLimiting: false,
        rateLimitMs: 1000,
      });
      limitedLoader.recordRequest_('vizier');

      const handler = jest.fn();
      globalEventBus.on(Events.DYNAMIC_QUERY_RATE_LIMITED, handler);

      limitedLoader.shouldRateLimit_('vizier');
      expect(handler).toHaveBeenCalled();

      globalEventBus.off(Events.DYNAMIC_QUERY_RATE_LIMITED, handler);
    });
  });

  describe('recordRequest_', () => {
    test('resets consecutive failures', () => {
      loader.recordFailure_();
      expect(loader.consecutiveFailures_).toBe(1);
      loader.recordRequest_('vizier');
      expect(loader.consecutiveFailures_).toBe(0);
    });

    test('records request time', () => {
      const now = Date.now();
      loader.recordRequest_('vizier');
      expect(loader.lastRequestTime_.get('vizier')).toBeGreaterThanOrEqual(now);
    });

    test('adds to request timestamps', () => {
      loader.recordRequest_('vizier');
      expect(loader.requestTimestamps_.length).toBe(1);
    });
  });

  describe('recordFailure_', () => {
    test('increments consecutive failures', () => {
      expect(loader.consecutiveFailures_).toBe(0);
      loader.recordFailure_();
      expect(loader.consecutiveFailures_).toBe(1);
      loader.recordFailure_();
      expect(loader.consecutiveFailures_).toBe(2);
    });

    test('records failure time', () => {
      const now = Date.now();
      loader.recordFailure_();
      expect(loader.lastRequestTime_.get('_failure')).toBeGreaterThanOrEqual(now);
    });
  });

  describe('cleanupOldTimestamps_', () => {
    test('removes timestamps older than 1 minute', () => {
      // Add old timestamp
      loader.requestTimestamps_ = [Date.now() - 70000, Date.now()];
      loader.cleanupOldTimestamps_();
      expect(loader.requestTimestamps_.length).toBe(1);
    });

    test('keeps recent timestamps', () => {
      const recent = Date.now();
      loader.requestTimestamps_ = [recent];
      loader.cleanupOldTimestamps_();
      expect(loader.requestTimestamps_.length).toBe(1);
    });
  });

  describe('queryStars', () => {
    beforeEach(() => {
      // Mock fetch
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(''),
      });
    });

    test('returns null (did not run) when already querying', async () => {
      loader.isQueryingStars_ = true;
      const result = await loader.queryStars(0, 0, 2, 12);
      expect(result).toBeNull();
    });

    test('returns [] (ran, empty) when the region has no stars', async () => {
      // Mocked fetch returns an empty VOTable, so the query runs but finds
      // nothing. This must be [] (not null) so the caller marks the region
      // covered and stops re-querying it.
      const result = await loader.queryStars(45, 30, 2, 12);
      expect(result).toEqual([]);
    });

    test('emits query started event', async () => {
      await loader.queryStars(0, 0, 2, 12);
      expect(eventHandler).toHaveBeenCalled();
    });

    test('emits query complete event', async () => {
      await loader.queryStars(0, 0, 2, 12);
      const completeCalls = eventHandler.mock.calls.filter(
        (call) => call[0]?.type === 'stars'
      );
      expect(completeCalls.length).toBeGreaterThan(0);
    });

    test('adds region to queried regions', async () => {
      await loader.queryStars(45, 30, 2, 12);
      const key = loader.getRegionKey(45, 30, 2, 12);
      expect(loader.queriedRegions_.has(key)).toBe(true);
    });

    test('resets querying flag after completion', async () => {
      await loader.queryStars(0, 0, 2, 12);
      expect(loader.isQueryingStars_).toBe(false);
    });

    test('resets querying flag on error', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
      await loader.queryStars(0, 0, 2, 12);
      expect(loader.isQueryingStars_).toBe(false);
    });
  });

  describe('state management', () => {
    test('tracks queried regions', () => {
      expect(loader.queriedRegions_.size).toBe(0);
    });
  });
});
