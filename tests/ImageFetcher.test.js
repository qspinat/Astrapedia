/**
 * @jest-environment jsdom
 * @fileoverview Tests for ImageFetcher service DSS fallback.
 */

import {jest, describe, it, expect, beforeEach, afterEach} from '@jest/globals';

// Mock dependencies before importing ImageFetcher
const mockEmit = jest.fn();
jest.unstable_mockModule('../modules/core/EventBus.js', () => ({
  globalEventBus: {emit: mockEmit},
  Events: {IMAGE_LOADED: 'image:loaded'},
}));

jest.unstable_mockModule('../modules/core/Constants.js', () => ({
  IMAGES: {
    MAX_CACHE_SIZE: 100,
    FETCH_TIMEOUT: 5000,
  },
  API_ENDPOINTS: {
    NASA_IMAGES: 'https://images-api.nasa.gov/search',
    CDS_HIPS: 'https://alasky.cds.unistra.fr/hips-image-services/hips2fits',
  },
}));

const mockGetCuratedImage = jest.fn().mockReturnValue(null);
jest.unstable_mockModule('../modules/data/CuratedImages.js', () => ({
  getCuratedImage: mockGetCuratedImage,
}));

const mockGetPlanetImageInfo = jest.fn().mockReturnValue(null);
jest.unstable_mockModule('../modules/data/PlanetImages.js', () => ({
  getPlanetImageInfo: mockGetPlanetImageInfo,
}));

// Dynamic import after mocks
const {ImageFetcher} = await import('../modules/services/ImageFetcher.js');

// Mock fetch globally
global.fetch = jest.fn();

describe('ImageFetcher', () => {
  let fetcher;

  beforeEach(() => {
    fetcher = new ImageFetcher();
    global.fetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    fetcher.clearCache();
  });

  describe('constructor', () => {
    it('creates instance with default config', () => {
      const f = new ImageFetcher();
      expect(f).toBeInstanceOf(ImageFetcher);
      f.clearCache();
    });

    it('accepts custom config', () => {
      const f = new ImageFetcher({maxCacheSize: 50, fetchTimeout: 10000});
      expect(f).toBeInstanceOf(ImageFetcher);
      f.clearCache();
    });
  });

  describe('fetchBestImage', () => {
    it('returns null url for empty name with no coordinates', async () => {
      const result = await fetcher.fetchBestImage('', undefined, undefined);
      expect(result).toEqual({
        url: null,
        loading: false,
        source: null,
        tier: null,
      });
    });

    it('caches results for same object', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({collection: {items: []}}),
      });

      const result1 = await fetcher.fetchBestImage('NGC1234', 50.0, 30.0, 'G');
      const result2 = await fetcher.fetchBestImage('NGC1234', 50.0, 30.0, 'G');

      // Both should return same cached result
      expect(result1.source).toBe('DSS');
      expect(result2.source).toBe('DSS');
      expect(result1.url).toBe(result2.url);
    });
  });

  describe('DSS fallback', () => {
    it('falls back to DSS when NASA and Wikimedia fail', async () => {
      // Mock NASA to return no results
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          collection: {items: []},
        }),
      });

      const result = await fetcher.fetchBestImage('NGC1234', 50.0, 30.0, 'G');

      expect(result.source).toBe('DSS');
      expect(result.tier).toBe('vintage');
      expect(result.url).toContain('hips=DSS2/color');
    });

    it('DSS URL includes correct coordinates', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({collection: {items: []}}),
      });

      const result = await fetcher.fetchBestImage('NGC9999', 123.456, -45.789, 'G');

      expect(result.source).toBe('DSS');
      expect(result.url).toContain('ra=123.456');
      expect(result.url).toContain('dec=-45.789');
    });

    it('does not use DSS fallback for stars', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({collection: {items: []}}),
      });

      const result = await fetcher.fetchBestImage('Random Star', 100.0, 20.0, 'Star');

      // Stars should not get DSS fallback
      expect(result.url).toBeNull();
      expect(result.source).toBeNull();
    });

    it('uses appropriate fov for galaxies', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({collection: {items: []}}),
      });

      const result = await fetcher.fetchBestImage('NGC1', 10.0, 20.0, 'G');
      expect(result.source).toBe('DSS');
      expect(result.url).toContain('fov=0.25'); // Galaxy default
    });

    it('uses appropriate fov for clusters', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({collection: {items: []}}),
      });

      const result = await fetcher.fetchBestImage('NGC47', 30.0, 40.0, 'GCl');
      expect(result.source).toBe('DSS');
      expect(result.url).toContain('fov=0.5'); // Cluster default
    });

    it('uses custom angular size when provided', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({collection: {items: []}}),
      });

      // 10 arcmin object should use 10 * 3 / 60 = 0.5 fov
      const result = await fetcher.fetchBestImage('NGC999', 50.0, 60.0, 'G', 10);
      expect(result.source).toBe('DSS');
      expect(result.url).toContain('fov=0.5');
    });
  });

  describe('clearCache', () => {
    it('clears all cached entries', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({collection: {items: []}}),
      });

      await fetcher.fetchBestImage('NGC1', 10.0, 20.0, 'G');
      expect(fetcher.getStats().size).toBeGreaterThan(0);

      fetcher.clearCache();
      expect(fetcher.getStats().size).toBe(0);
    });
  });

  describe('getCached', () => {
    it('returns cached result when available', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({collection: {items: []}}),
      });

      await fetcher.fetchBestImage('M42', 83.82, -5.39, 'Neb');

      const cached = fetcher.getCached('M42', 83.82, -5.39);
      expect(cached).not.toBeNull();
      expect(cached.source).toBe('DSS');
    });

    it('returns null when not cached', () => {
      const cached = fetcher.getCached('NotCached', 0, 0);
      expect(cached).toBeNull();
    });
  });
});
