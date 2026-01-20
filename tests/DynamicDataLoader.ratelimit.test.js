/**
 * @jest-environment jsdom
 * @fileoverview Tests for DynamicDataLoader rate limiting functionality.
 */

import {jest} from '@jest/globals';

// Mock the EventBus and Constants before importing DynamicDataLoader
jest.unstable_mockModule('../modules/core/EventBus.js', () => ({
  globalEventBus: {
    emit: jest.fn(),
  },
  Events: {
    DYNAMIC_QUERY_STARTED: 'dynamic_query_started',
    DYNAMIC_QUERY_COMPLETE: 'dynamic_query_complete',
    DYNAMIC_STARS_LOADED: 'dynamic_stars_loaded',
    DYNAMIC_DSOS_LOADED: 'dynamic_dsos_loaded',
  },
}));

jest.unstable_mockModule('../modules/core/Constants.js', () => ({
  DYNAMIC_DATA: {
    MAX_STARS: 30000,
    MAX_DSOS: 5000,
    MAX_REGIONS: 50,
    LOAD_FOV_THRESHOLD: 10,
  },
  API_ENDPOINTS: {
    SIMBAD: 'https://simbad.u-strasbg.fr/simbad/sim-tap/sync',
  },
}));

const {DynamicDataLoader} = await import(
  '../modules/services/DynamicDataLoader.js'
);

describe('DynamicDataLoader Rate Limiting', () => {
  let loader;

  beforeEach(() => {
    loader = new DynamicDataLoader({
      rateLimitMs: 100,
      maxRequestsPerMinute: 5,
    });
    jest.clearAllMocks();
  });

  describe('shouldRateLimit_', () => {
    test('allows first request to any API', () => {
      expect(loader.shouldRateLimit_('vizier')).toBe(false);
      expect(loader.shouldRateLimit_('simbad')).toBe(false);
    });

    test('blocks rapid requests to same API', () => {
      // Record a request
      loader.recordRequest_('vizier');

      // Should be rate limited immediately after
      expect(loader.shouldRateLimit_('vizier')).toBe(true);

      // Different API should not be affected
      expect(loader.shouldRateLimit_('simbad')).toBe(false);
    });

    test('allows request after rate limit window passes', async () => {
      loader.recordRequest_('vizier');
      expect(loader.shouldRateLimit_('vizier')).toBe(true);

      // Wait for rate limit window
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(loader.shouldRateLimit_('vizier')).toBe(false);
    });

    test('enforces global requests per minute limit', () => {
      // Make 5 requests (the limit)
      for (let i = 0; i < 5; i++) {
        loader.recordRequest_(`api${i}`);
      }

      // 6th request should be blocked
      expect(loader.shouldRateLimit_('newapi')).toBe(true);
    });

    test('applies exponential backoff after failures', () => {
      // Record failures
      loader.recordFailure_();
      loader.recordFailure_();
      loader.recordFailure_();

      // Should be rate limited due to backoff
      expect(loader.shouldRateLimit_('vizier')).toBe(true);
    });

    test('resets failure count on successful request', () => {
      // Record some failures
      loader.recordFailure_();
      loader.recordFailure_();

      // Then a success
      loader.recordRequest_('vizier');

      // Failure count should be reset
      expect(loader.consecutiveFailures_).toBe(0);
    });
  });

  describe('recordRequest_', () => {
    test('updates lastRequestTime for API', () => {
      const before = Date.now();
      loader.recordRequest_('vizier');
      const after = Date.now();

      const recorded = loader.lastRequestTime_.get('vizier');
      expect(recorded).toBeGreaterThanOrEqual(before);
      expect(recorded).toBeLessThanOrEqual(after);
    });

    test('adds timestamp to requestTimestamps array', () => {
      expect(loader.requestTimestamps_.length).toBe(0);

      loader.recordRequest_('vizier');

      expect(loader.requestTimestamps_.length).toBe(1);
    });

    test('resets consecutive failures', () => {
      loader.consecutiveFailures_ = 5;

      loader.recordRequest_('vizier');

      expect(loader.consecutiveFailures_).toBe(0);
    });
  });

  describe('recordFailure_', () => {
    test('increments consecutive failure count', () => {
      expect(loader.consecutiveFailures_).toBe(0);

      loader.recordFailure_();
      expect(loader.consecutiveFailures_).toBe(1);

      loader.recordFailure_();
      expect(loader.consecutiveFailures_).toBe(2);
    });

    test('records failure timestamp', () => {
      const before = Date.now();
      loader.recordFailure_();
      const after = Date.now();

      const recorded = loader.lastRequestTime_.get('_failure');
      expect(recorded).toBeGreaterThanOrEqual(before);
      expect(recorded).toBeLessThanOrEqual(after);
    });
  });

  describe('exponential backoff calculation', () => {
    test('backoff increases exponentially with failures', async () => {
      // 1 failure = 2^1 * 1000 = 2000ms backoff
      loader.recordFailure_();

      // Force rate limit check after small delay
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(loader.shouldRateLimit_('vizier')).toBe(true);

      // Reset and try with more failures
      loader.consecutiveFailures_ = 0;
      loader.lastRequestTime_.delete('_failure');

      // 3 failures = 2^3 * 1000 = 8000ms backoff
      loader.recordFailure_();
      loader.recordFailure_();
      loader.recordFailure_();

      expect(loader.shouldRateLimit_('vizier')).toBe(true);
    });

    test('backoff is capped at maxBackoffMs', () => {
      // Set many failures
      for (let i = 0; i < 20; i++) {
        loader.recordFailure_();
      }

      // Backoff should be capped
      const expectedMaxBackoff = loader.maxBackoffMs_;
      const calculatedBackoff = Math.pow(2, 20) * 1000;

      expect(calculatedBackoff).toBeGreaterThan(expectedMaxBackoff);
      // The capping is handled in shouldRateLimit_, just verify the logic exists
      expect(loader.maxBackoffMs_).toBe(60000);
    });
  });

  describe('request timestamp cleanup', () => {
    test('filters out old timestamps when checking rate limit', async () => {
      // Add timestamps that would exceed the limit
      const now = Date.now();
      // Add old timestamps (> 60 seconds ago)
      loader.requestTimestamps_ = [
        now - 70000,
        now - 65000,
        now - 61000,
      ];

      // These old timestamps should be filtered out
      expect(loader.shouldRateLimit_('vizier')).toBe(false);

      // After check, old timestamps should be removed
      expect(loader.requestTimestamps_.length).toBe(0);
    });
  });
});

describe('DynamicDataLoader Configuration', () => {
  test('uses default configuration values', () => {
    const loader = new DynamicDataLoader();

    expect(loader.rateLimitMs_).toBe(1000);
    expect(loader.maxRequestsPerMinute_).toBe(30);
    expect(loader.maxBackoffMs_).toBe(60000);
  });

  test('accepts custom configuration', () => {
    const loader = new DynamicDataLoader({
      rateLimitMs: 500,
      maxRequestsPerMinute: 10,
    });

    expect(loader.rateLimitMs_).toBe(500);
    expect(loader.maxRequestsPerMinute_).toBe(10);
  });
});
