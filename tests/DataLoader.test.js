/**
 * @fileoverview Tests for DataLoader module.
 */

import {jest} from '@jest/globals';
import {DataLoader, dataLoader} from '../modules/services/DataLoader.js';
import {globalEventBus, Events} from '../modules/core/EventBus.js';

// Mock fetch globally
global.fetch = jest.fn();

// Mock AbortController
global.AbortController = class AbortController {
  constructor() {
    this.signal = {aborted: false};
  }
  abort() {
    this.signal.aborted = true;
  }
};

describe('DataLoader', () => {
  let loader;

  beforeEach(() => {
    loader = new DataLoader({
      timeout: 5000,
      retries: 1,
      retryDelay: 100,
    });
    globalEventBus.clear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    loader.clearCache();
  });

  describe('constructor', () => {
    test('uses default config', () => {
      const defaultLoader = new DataLoader();
      expect(defaultLoader.getCacheSize()).toBe(0);
    });

    test('accepts custom config', () => {
      const customLoader = new DataLoader({timeout: 1000});
      expect(customLoader.getCacheSize()).toBe(0);
    });
  });

  describe('fetchJson', () => {
    test('fetches and parses JSON', async () => {
      const mockData = {test: 'data'};
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const result = await loader.fetchJson('http://example.com/data.json');
      expect(result).toEqual(mockData);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test('caches successful response', async () => {
      const mockData = {test: 'data'};
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      await loader.fetchJson('http://example.com/data.json');
      const result = await loader.fetchJson('http://example.com/data.json');

      expect(result).toEqual(mockData);
      expect(global.fetch).toHaveBeenCalledTimes(1); // Only one fetch
    });

    test('skips cache when useCache is false', async () => {
      const mockData = {test: 'data'};
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      await loader.fetchJson('http://example.com/data.json');
      await loader.fetchJson('http://example.com/data.json', {useCache: false});

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    test('deduplicates concurrent requests', async () => {
      const mockData = {test: 'data'};
      let resolveResponse;
      const responsePromise = new Promise((resolve) => {
        resolveResponse = resolve;
      });

      global.fetch.mockReturnValueOnce(responsePromise);

      // Start two concurrent requests
      const request1 = loader.fetchJson('http://example.com/data.json');
      const request2 = loader.fetchJson('http://example.com/data.json');

      // Resolve the fetch
      resolveResponse({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const [result1, result2] = await Promise.all([request1, request2]);

      expect(result1).toEqual(mockData);
      expect(result2).toEqual(mockData);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test('throws on HTTP error', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 404,
      });

      await expect(loader.fetchJson('http://example.com/notfound.json'))
        .rejects.toThrow('HTTP error! status: 404');
    });

    test('retries on failure', async () => {
      const mockData = {test: 'data'};
      global.fetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockData),
        });

      const result = await loader.fetchJson('http://example.com/data.json');

      expect(result).toEqual(mockData);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    test('throws after all retries fail', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'));

      await expect(loader.fetchJson('http://example.com/data.json'))
        .rejects.toThrow('Network error');

      expect(global.fetch).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });

    test('handles timeout with abort error', async () => {
      // Mock fetch to simulate AbortError
      global.fetch.mockImplementation(() => {
        const error = new Error('Aborted');
        error.name = 'AbortError';
        return Promise.reject(error);
      });

      await expect(
        loader.fetchJson('http://example.com/slow.json', {retries: 0})
      ).rejects.toThrow('timeout');
    });
  });

  describe('loadDataFile', () => {
    test('loads from data directory', async () => {
      const mockData = {stars: []};
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const result = await loader.loadDataFile('stars.json');

      expect(result).toEqual(mockData);
      expect(global.fetch).toHaveBeenCalledWith(
        'data/stars.json',
        expect.any(Object)
      );
    });
  });

  describe('loadDataFiles', () => {
    test('loads multiple files in parallel', async () => {
      const mockStars = {stars: []};
      const mockDsos = {dsos: []};

      global.fetch
        .mockResolvedValueOnce({ok: true, json: () => Promise.resolve(mockStars)})
        .mockResolvedValueOnce({ok: true, json: () => Promise.resolve(mockDsos)});

      const results = await loader.loadDataFiles(['stars.json', 'dsos.json']);

      expect(results['stars.json']).toEqual(mockStars);
      expect(results['dsos.json']).toEqual(mockDsos);
    });

    test('handles partial failures', async () => {
      const mockStars = {stars: []};

      global.fetch
        .mockResolvedValueOnce({ok: true, json: () => Promise.resolve(mockStars)})
        .mockRejectedValueOnce(new Error('Failed'));

      const loaderWithNoRetry = new DataLoader({retries: 0});
      const results = await loaderWithNoRetry.loadDataFiles(['stars.json', 'dsos.json']);

      expect(results['stars.json']).toEqual(mockStars);
      expect(results['dsos.json']).toBeNull();
    });
  });

  describe('loadAppData', () => {
    test('loads all standard data files', async () => {
      const mockStars = [{id: 1}];
      const mockConstellations = {Orion: {}};
      const mockDsos = [{name: 'M31'}];
      const mockNamedObjects = {Polaris: 1};

      global.fetch
        .mockResolvedValueOnce({ok: true, json: () => Promise.resolve(mockStars)})
        .mockResolvedValueOnce({ok: true, json: () => Promise.resolve(mockConstellations)})
        .mockResolvedValueOnce({ok: true, json: () => Promise.resolve(mockDsos)})
        .mockResolvedValueOnce({ok: true, json: () => Promise.resolve(mockNamedObjects)});

      const data = await loader.loadAppData();

      expect(data.stars).toEqual(mockStars);
      expect(data.constellations).toEqual(mockConstellations);
      expect(data.deepSkyObjects).toEqual(mockDsos);
      expect(data.namedObjects).toEqual(mockNamedObjects);
    });

    test('uses specified star file', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await loader.loadAppData('stars_bright.json');

      expect(global.fetch).toHaveBeenCalledWith(
        'data/stars_bright.json',
        expect.any(Object)
      );
    });

    test('emits DATA_LOADED events', async () => {
      const loadingCallback = jest.fn();
      const successCallback = jest.fn();
      globalEventBus.on(Events.DATA_LOADED, (data) => {
        if (data.status === 'loading') loadingCallback(data);
        if (data.status === 'success') successCallback(data);
      });

      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await loader.loadAppData();

      expect(loadingCallback).toHaveBeenCalled();
      expect(successCallback).toHaveBeenCalled();
    });

    test('emits DATA_ERROR on failure', async () => {
      const errorCallback = jest.fn();
      globalEventBus.on(Events.DATA_ERROR, errorCallback);

      const loaderWithNoRetry = new DataLoader({retries: 0});
      global.fetch.mockRejectedValue(new Error('Network error'));

      await expect(loaderWithNoRetry.loadAppData()).rejects.toThrow();
      expect(errorCallback).toHaveBeenCalled();
    });
  });

  describe('postJson', () => {
    test('posts JSON body', async () => {
      const mockResponse = {success: true};
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await loader.postJson('http://example.com/api', {data: 'test'});

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://example.com/api',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({data: 'test'}),
        })
      );
    });

    test('accepts string body', async () => {
      const mockResponse = {success: true};
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await loader.postJson('http://example.com/api', 'raw string');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://example.com/api',
        expect.objectContaining({
          body: 'raw string',
        })
      );
    });
  });

  describe('postForm', () => {
    test('posts form-encoded data', async () => {
      const mockResponse = {success: true};
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await loader.postForm('http://example.com/api', {
        key1: 'value1',
        key2: 'value2',
      });

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://example.com/api',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded',
          }),
        })
      );
    });
  });

  describe('fetchText', () => {
    test('fetches text content', async () => {
      const mockText = 'Hello, World!';
      global.fetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockText),
      });

      const result = await loader.fetchText('http://example.com/text.txt');
      expect(result).toBe(mockText);
    });
  });

  describe('cache management', () => {
    test('clearCache removes specific URL', async () => {
      const mockData = {test: 'data'};
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      await loader.fetchJson('http://example.com/data1.json');
      await loader.fetchJson('http://example.com/data2.json');

      loader.clearCache('http://example.com/data1.json');

      expect(loader.isCached('http://example.com/data1.json')).toBe(false);
      expect(loader.isCached('http://example.com/data2.json')).toBe(true);
    });

    test('clearCache without URL clears all', async () => {
      const mockData = {test: 'data'};
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      await loader.fetchJson('http://example.com/data1.json');
      await loader.fetchJson('http://example.com/data2.json');

      loader.clearCache();

      expect(loader.getCacheSize()).toBe(0);
    });

    test('isCached returns correct status', async () => {
      expect(loader.isCached('http://example.com/uncached.json')).toBe(false);

      const mockData = {test: 'data'};
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      await loader.fetchJson('http://example.com/cached.json');
      expect(loader.isCached('http://example.com/cached.json')).toBe(true);
    });

    test('getCacheSize returns correct count', async () => {
      expect(loader.getCacheSize()).toBe(0);

      const mockData = {test: 'data'};
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      await loader.fetchJson('http://example.com/data1.json');
      expect(loader.getCacheSize()).toBe(1);

      await loader.fetchJson('http://example.com/data2.json');
      expect(loader.getCacheSize()).toBe(2);
    });
  });
});

describe('dataLoader singleton', () => {
  test('is a DataLoader instance', () => {
    expect(dataLoader).toBeInstanceOf(DataLoader);
  });
});
