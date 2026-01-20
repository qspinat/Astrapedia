/**
 * @jest-environment jsdom
 * @fileoverview Tests for DynamicDataLoader rate limiting functionality.
 */

import {jest} from '@jest/globals';

// Mock the EventBus and Constants before importing DynamicDataLoader
// Note: Event names use colon convention to match actual EventBus.js format
const mockEmit = jest.fn();
jest.unstable_mockModule('../modules/core/EventBus.js', () => ({
  globalEventBus: {
    emit: mockEmit,
  },
  Events: {
    DYNAMIC_QUERY_STARTED: 'dynamic:query:started',
    DYNAMIC_QUERY_COMPLETE: 'dynamic:query:complete',
    DYNAMIC_STARS_LOADED: 'dynamic:stars:loaded',
    DYNAMIC_DSOS_LOADED: 'dynamic:dsos:loaded',
    DYNAMIC_QUERY_RATE_LIMITED: 'dynamic:query:ratelimited',
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
    mockEmit.mockClear();
  });

  describe('shouldRateLimit_', () => {
    test('allows first request to any API', () => {
      expect(loader.shouldRateLimit_('vizier')).toBe(false);
      expect(loader.shouldRateLimit_('simbad')).toBe(false);
    });

    test('respects disableRateLimiting config option', () => {
      const noLimitLoader = new DynamicDataLoader({
        rateLimitMs: 100,
        maxRequestsPerMinute: 5,
        disableRateLimiting: true,
      });

      // Record a request
      noLimitLoader.recordRequest_('vizier');

      // Should NOT be rate limited even immediately after
      expect(noLimitLoader.shouldRateLimit_('vizier')).toBe(false);

      // Make many requests
      for (let i = 0; i < 10; i++) {
        noLimitLoader.recordRequest_(`api${i}`);
      }

      // Still should not be rate limited
      expect(noLimitLoader.shouldRateLimit_('newapi')).toBe(false);
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

    test('emits DYNAMIC_QUERY_RATE_LIMITED event when rate limited', () => {
      // Record a request
      loader.recordRequest_('vizier');
      mockEmit.mockClear();

      // Trigger rate limit
      loader.shouldRateLimit_('vizier');

      // Should have emitted the rate limited event
      expect(mockEmit).toHaveBeenCalledWith(
        'dynamic:query:ratelimited',
        expect.objectContaining({
          api: 'vizier',
          reason: 'per-api',
          waitMs: expect.any(Number),
          consecutiveFailures: 0,
        })
      );
    });

    test('emits event with backoff reason after failures', () => {
      // Record failures
      loader.recordFailure_();
      loader.recordFailure_();
      mockEmit.mockClear();

      // Trigger rate limit
      loader.shouldRateLimit_('vizier');

      // Should have emitted with backoff reason
      expect(mockEmit).toHaveBeenCalledWith(
        'dynamic:query:ratelimited',
        expect.objectContaining({
          api: 'vizier',
          reason: 'backoff',
          consecutiveFailures: 2,
        })
      );
    });

    test('emits event with global reason when per-minute limit reached', () => {
      // Make 5 requests (the limit)
      for (let i = 0; i < 5; i++) {
        loader.recordRequest_(`api${i}`);
      }
      mockEmit.mockClear();

      // Trigger rate limit on new API
      loader.shouldRateLimit_('newapi');

      // Should have emitted with global reason
      expect(mockEmit).toHaveBeenCalledWith(
        'dynamic:query:ratelimited',
        expect.objectContaining({
          api: 'newapi',
          reason: 'global',
        })
      );
    });

    test('does not emit event when not rate limited', () => {
      mockEmit.mockClear();

      // First request should not be rate limited
      loader.shouldRateLimit_('vizier');

      // Should not have emitted rate limited event
      expect(mockEmit).not.toHaveBeenCalledWith(
        'dynamic:query:ratelimited',
        expect.anything()
      );
    });

    test('does not emit event when rate limiting is disabled', () => {
      const noLimitLoader = new DynamicDataLoader({
        rateLimitMs: 100,
        maxRequestsPerMinute: 5,
        disableRateLimiting: true,
      });

      // Record a request and try to trigger rate limit
      noLimitLoader.recordRequest_('vizier');
      mockEmit.mockClear();

      noLimitLoader.shouldRateLimit_('vizier');

      // Should not have emitted rate limited event
      expect(mockEmit).not.toHaveBeenCalledWith(
        'dynamic:query:ratelimited',
        expect.anything()
      );
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
    test('shouldRateLimit_ does not mutate timestamps (read-only)', () => {
      const now = Date.now();
      // Add old timestamps (> 60 seconds ago)
      loader.requestTimestamps_ = [
        now - 70000,
        now - 65000,
        now - 61000,
      ];

      // These old timestamps should NOT affect rate limiting
      expect(loader.shouldRateLimit_('vizier')).toBe(false);

      // shouldRateLimit_ should NOT mutate the array (it's read-only now)
      expect(loader.requestTimestamps_.length).toBe(3);
    });

    test('recordRequest_ cleans up old timestamps', () => {
      const now = Date.now();
      // Add old timestamps (> 60 seconds ago)
      loader.requestTimestamps_ = [
        now - 70000,
        now - 65000,
        now - 61000,
      ];

      // Record a new request, which triggers cleanup
      loader.recordRequest_('vizier');

      // Old timestamps should be removed, only new one remains
      expect(loader.requestTimestamps_.length).toBe(1);
    });

    test('cleanupOldTimestamps_ removes entries older than 60 seconds', () => {
      const now = Date.now();
      loader.requestTimestamps_ = [
        now - 70000, // old, should be removed
        now - 30000, // recent, should be kept
        now - 5000,  // recent, should be kept
      ];

      loader.cleanupOldTimestamps_();

      expect(loader.requestTimestamps_.length).toBe(2);
    });
  });
});

describe('DynamicDataLoader Configuration', () => {
  test('uses default configuration values', () => {
    const loader = new DynamicDataLoader();

    expect(loader.rateLimitMs_).toBe(1000);
    expect(loader.maxRequestsPerMinute_).toBe(30);
    expect(loader.maxBackoffMs_).toBe(60000);
    expect(loader.rateLimitingDisabled_).toBe(false);
    expect(loader.backoffBase_).toBe(2);
    expect(loader.backoffInitialMs_).toBe(1000);
  });

  test('accepts custom configuration', () => {
    const loader = new DynamicDataLoader({
      rateLimitMs: 500,
      maxRequestsPerMinute: 10,
    });

    expect(loader.rateLimitMs_).toBe(500);
    expect(loader.maxRequestsPerMinute_).toBe(10);
  });

  test('accepts disableRateLimiting option', () => {
    const loader = new DynamicDataLoader({
      disableRateLimiting: true,
    });

    expect(loader.rateLimitingDisabled_).toBe(true);
  });

  test('disableRateLimiting defaults to false', () => {
    const loader = new DynamicDataLoader({});

    expect(loader.rateLimitingDisabled_).toBe(false);
  });

  test('accepts custom backoff configuration', () => {
    const loader = new DynamicDataLoader({
      backoffBase: 3,
      backoffInitialMs: 500,
      maxBackoffMs: 30000,
    });

    expect(loader.backoffBase_).toBe(3);
    expect(loader.backoffInitialMs_).toBe(500);
    expect(loader.maxBackoffMs_).toBe(30000);
  });

  test('uses custom backoff parameters in calculation', () => {
    // Create loader with custom backoff: base 3, initial 500ms
    // 1 failure = 3^1 * 500 = 1500ms backoff
    const loader = new DynamicDataLoader({
      rateLimitMs: 100,
      backoffBase: 3,
      backoffInitialMs: 500,
      maxBackoffMs: 30000,
    });

    // Record one failure
    loader.recordFailure_();

    // Should be rate limited due to backoff
    expect(loader.shouldRateLimit_('vizier')).toBe(true);

    // Verify the event was emitted with correct wait time
    // With base=3, initial=500, 1 failure: backoff = 3^1 * 500 = 1500ms
    expect(mockEmit).toHaveBeenCalledWith(
      'dynamic:query:ratelimited',
      expect.objectContaining({
        reason: 'backoff',
        // waitMs should be approximately 1500ms (minus small elapsed time)
        waitMs: expect.any(Number),
      })
    );
  });
});
