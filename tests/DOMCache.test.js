/**
 * @fileoverview Tests for DOMCache module.
 */

import {jest} from '@jest/globals';
import {DOMCache, domCache} from '../modules/ui/DOMCache.js';

describe('DOMCache', () => {
  let cache;

  // Mock document.getElementById
  const mockElements = {
    'ra-display': {id: 'ra-display', textContent: ''},
    'dec-display': {id: 'dec-display', textContent: ''},
    'fov-display': {id: 'fov-display', textContent: ''},
    'visible-count': {id: 'visible-count', textContent: ''},
    'time-display': {id: 'time-display', textContent: ''},
    'search-input': {id: 'search-input', value: ''},
    'settings-panel': {id: 'settings-panel', classList: {add: jest.fn(), remove: jest.fn()}},
    'canvas-container': {id: 'canvas-container'},
    'magnitude-slider': {id: 'magnitude-slider', value: '6'},
  };

  beforeEach(() => {
    cache = new DOMCache();

    // Mock document.getElementById
    jest.spyOn(document, 'getElementById').mockImplementation((id) => {
      return mockElements[id] || null;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('get', () => {
    test('returns cached element on first access', () => {
      const element = cache.get('ra-display');
      expect(element).toBe(mockElements['ra-display']);
      expect(document.getElementById).toHaveBeenCalledWith('ra-display');
    });

    test('returns same element on subsequent access without re-querying', () => {
      cache.get('ra-display');
      cache.get('ra-display');
      cache.get('ra-display');

      // Should only query DOM once
      expect(document.getElementById).toHaveBeenCalledTimes(1);
    });

    test('returns null for non-existent elements', () => {
      const element = cache.get('non-existent-element');
      expect(element).toBeNull();
    });

    test('caches null for non-existent elements', () => {
      cache.get('non-existent-element');
      cache.get('non-existent-element');

      // Should only query DOM once even for null results
      expect(document.getElementById).toHaveBeenCalledTimes(1);
    });
  });

  describe('getRequired', () => {
    test('returns element when it exists', () => {
      const element = cache.getRequired('ra-display');
      expect(element).toBe(mockElements['ra-display']);
    });

    test('throws error when element does not exist', () => {
      expect(() => {
        cache.getRequired('non-existent-element');
      }).toThrow('Required DOM element not found: non-existent-element');
    });
  });

  describe('invalidate', () => {
    test('removes element from cache', () => {
      // First access caches the element
      cache.get('ra-display');
      expect(document.getElementById).toHaveBeenCalledTimes(1);

      // Invalidate the cache entry
      cache.invalidate('ra-display');

      // Next access should re-query
      cache.get('ra-display');
      expect(document.getElementById).toHaveBeenCalledTimes(2);
    });

    test('does nothing for non-cached elements', () => {
      cache.invalidate('never-cached');
      // Should not throw
    });
  });

  describe('clear', () => {
    test('removes all cached elements', () => {
      // Cache several elements
      cache.get('ra-display');
      cache.get('dec-display');
      cache.get('fov-display');

      expect(document.getElementById).toHaveBeenCalledTimes(3);

      // Clear the cache
      cache.clear();

      // Access again should re-query
      cache.get('ra-display');
      cache.get('dec-display');

      expect(document.getElementById).toHaveBeenCalledTimes(5);
    });

    test('resets initialized flag', () => {
      cache.initialize();
      expect(cache.initialized_).toBe(true);

      cache.clear();
      expect(cache.initialized_).toBe(false);
    });
  });

  describe('initialize', () => {
    test('pre-fetches all known elements', () => {
      cache.initialize();

      // Should have queried for multiple elements
      expect(document.getElementById).toHaveBeenCalled();
      expect(cache.initialized_).toBe(true);
    });

    test('only initializes once', () => {
      cache.initialize();
      const callCount = document.getElementById.mock.calls.length;

      cache.initialize();
      expect(document.getElementById.mock.calls.length).toBe(callCount);
    });
  });

  describe('property accessors', () => {
    test('raDisplay returns correct element', () => {
      expect(cache.raDisplay).toBe(mockElements['ra-display']);
    });

    test('decDisplay returns correct element', () => {
      expect(cache.decDisplay).toBe(mockElements['dec-display']);
    });

    test('fovDisplay returns correct element', () => {
      expect(cache.fovDisplay).toBe(mockElements['fov-display']);
    });

    test('visibleCount returns correct element', () => {
      expect(cache.visibleCount).toBe(mockElements['visible-count']);
    });

    test('timeDisplay returns correct element', () => {
      expect(cache.timeDisplay).toBe(mockElements['time-display']);
    });

    test('searchInput returns correct element', () => {
      expect(cache.searchInput).toBe(mockElements['search-input']);
    });

    test('settingsPanel returns correct element', () => {
      expect(cache.settingsPanel).toBe(mockElements['settings-panel']);
    });

    test('canvasContainer returns correct element', () => {
      expect(cache.canvasContainer).toBe(mockElements['canvas-container']);
    });

    test('magnitudeSlider returns correct element', () => {
      expect(cache.magnitudeSlider).toBe(mockElements['magnitude-slider']);
    });
  });

  describe('global domCache instance', () => {
    test('domCache is a DOMCache instance', () => {
      expect(domCache).toBeInstanceOf(DOMCache);
    });
  });
});
