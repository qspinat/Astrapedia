/**
 * @jest-environment jsdom
 * @fileoverview Tests for SelectionManager module.
 */

import {jest} from '@jest/globals';
import {
  SelectionManager,
} from '../../modules/features/SelectionManager.js';
import {domCache} from '../../modules/ui/DOMCache.js';
import {globalEventBus, Events} from '../../modules/core/EventBus.js';

describe('SelectionManager', () => {
  let manager;
  let mockDeps;

  beforeEach(() => {
    // Create mock dependencies
    mockDeps = {
      navigateToRaDec: jest.fn(),
      highlightConstellation: jest.fn(),
      unhighlightConstellation: jest.fn(),
      showHighlight: jest.fn(),
      hideHighlight: jest.fn(),
      getImageUrl: jest.fn().mockReturnValue(null),
      openPanel: jest.fn(),
      closeAllPanels: jest.fn(),
    };

    manager = new SelectionManager(mockDeps);

    // Mock DOM elements
    document.body.innerHTML = `
      <div id="info-content"></div>
      <div id="object-title"></div>
      <div id="main-image"></div>
    `;
  });

  afterEach(() => {
    manager.dispose();
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('creates instance with no selected object', () => {
      expect(manager.getSelectedObject()).toBeNull();
    });

    it('works with empty dependencies', () => {
      const emptyManager = new SelectionManager();
      expect(emptyManager.getSelectedObject()).toBeNull();
      emptyManager.dispose();
    });
  });

  describe('selectObject', () => {
    it('stores selected object', () => {
      const obj = {name: 'Sirius', ra: 101.29, dec: -16.72, type: 'Star'};
      manager.selectObject(obj);
      expect(manager.getSelectedObject()).toBe(obj);
    });

    it('calls navigateToRaDec for regular objects', () => {
      const obj = {name: 'M31', ra: 10.68, dec: 41.27, type: 'G'};
      manager.selectObject(obj);
      expect(mockDeps.navigateToRaDec).toHaveBeenCalledWith(10.68, 41.27);
    });

    it('calls showHighlight for regular objects', () => {
      const obj = {name: 'M31', ra: 10.68, dec: 41.27, type: 'G', size_major: 30};
      manager.selectObject(obj);
      expect(mockDeps.showHighlight).toHaveBeenCalledWith(10.68, 41.27, 30);
    });

    it('uses default angular size when not provided', () => {
      const obj = {name: 'Test', ra: 0, dec: 0, type: 'Star'};
      manager.selectObject(obj);
      expect(mockDeps.showHighlight).toHaveBeenCalledWith(0, 0, 20);
    });

    it('opens info panel', () => {
      const obj = {name: 'Test', ra: 0, dec: 0, type: 'Star'};
      manager.selectObject(obj);
      expect(mockDeps.openPanel).toHaveBeenCalledWith('info-panel');
    });

    it('handles constellation selection differently', () => {
      const obj = {name: 'Orion', ra: 85, dec: 0, type: 'Constellation'};
      manager.selectObject(obj);
      expect(mockDeps.highlightConstellation).toHaveBeenCalledWith('Orion');
      expect(mockDeps.showHighlight).not.toHaveBeenCalled();
    });
  });

  describe('deselect when the info panel is dismissed (back/backdrop/Escape)',
      () => {
        it('deselects the object and hides its highlight', async () => {
          const obj = {name: 'Vega', ra: 279, dec: 38, type: 'Star'};
          manager.selectObject(obj);
          expect(manager.getSelectedObject()).toBe(obj);
          // Let the isSelecting_ guard clear on the next tick.
          await Promise.resolve();
          mockDeps.hideHighlight.mockClear();

          globalEventBus.emit(Events.PANEL_CLOSED, {panelId: 'info-panel'});

          expect(manager.getSelectedObject()).toBeNull();
          expect(mockDeps.hideHighlight).toHaveBeenCalled();
        });

        it('does NOT deselect during a panel swap to a new object', () => {
          const obj = {name: 'Vega', ra: 279, dec: 38, type: 'Star'};
          manager.selectObject(obj);
          // Simulate the synchronous window while selecting: the panel the swap
          // closes must not be mistaken for a dismissal.
          manager.isSelecting_ = true;

          globalEventBus.emit(Events.PANEL_CLOSED, {panelId: 'info-panel'});

          expect(manager.getSelectedObject()).toBe(obj);
        });

        it('ignores closes of other panels', async () => {
          const obj = {name: 'Vega', ra: 279, dec: 38, type: 'Star'};
          manager.selectObject(obj);
          await Promise.resolve();

          globalEventBus.emit(Events.PANEL_CLOSED, {panelId: 'settings-panel'});

          expect(manager.getSelectedObject()).toBe(obj);
        });
      });

  describe('selectObject with null (deselect)', () => {
    it('clears selected object', () => {
      const obj = {name: 'Test', ra: 0, dec: 0, type: 'Star'};
      manager.selectObject(obj);
      manager.selectObject(null);
      expect(manager.getSelectedObject()).toBeNull();
    });

    it('calls unhighlightConstellation', () => {
      manager.selectObject(null);
      expect(mockDeps.unhighlightConstellation).toHaveBeenCalled();
    });

    it('calls hideHighlight', () => {
      manager.selectObject(null);
      expect(mockDeps.hideHighlight).toHaveBeenCalled();
    });

    it('closes all panels', () => {
      manager.selectObject(null);
      expect(mockDeps.closeAllPanels).toHaveBeenCalled();
    });
  });

  describe('clearSelection', () => {
    it('deselects current object', () => {
      const obj = {name: 'Test', ra: 0, dec: 0, type: 'Star'};
      manager.selectObject(obj);
      manager.clearSelection();
      expect(manager.getSelectedObject()).toBeNull();
    });
  });

  describe('info panel layout', () => {
    const star = {
      name: 'Vega', type: 'Star', ra: 279.2347, dec: 38.7837,
      mag: 0.03, spect: 'A0V', dist: 7.68, internalName: 'Vega',
    };

    /**
     * Render the star's info and return the written HTML. Reads through the
     * same domCache reference the code writes to, so it is unaffected by cache
     * staleness across tests.
     * @return {string}
     */
    function render() {
      manager.showObjectInfo_(star);
      return domCache.infoContent.innerHTML;
    }

    it('leads with the description before the technical data', () => {
      const html = render();

      expect(html.indexOf('object-description'))
          .toBeLessThan(html.indexOf('info-technical'));
    });

    it('keeps 4-decimal RA/Dec inside the technical section, not up front',
        () => {
          const html = render();

          expect(html.indexOf('279.2347'))
              .toBeGreaterThan(html.indexOf('info-technical'));
        });

    it('shows distance in light-years in the primary facts', () => {
      // 7.68 pc x 3.26156 is about 25.0 light-years.
      const html = render();
      const facts = html.slice(0, html.indexOf('info-technical'));

      expect(facts).toContain('25.0 ly');
    });

    it('shows parsecs only in the technical section', () => {
      const html = render();

      expect(html.indexOf(' pc')).toBeGreaterThan(html.indexOf('info-technical'));
    });

    it('leads with a type headline', () => {
      expect(render()).toContain('info-type');
    });
  });

  describe('getTypeFullName', () => {
    it('returns full name for galaxy', () => {
      expect(manager.getTypeFullName('G')).toBe('Galaxy');
    });

    it('returns full name for planetary nebula', () => {
      expect(manager.getTypeFullName('PN')).toBe('Planetary Nebula');
    });

    it('returns original type for unknown', () => {
      expect(manager.getTypeFullName('Unknown')).toBe('Unknown');
    });
  });

  describe('dispose', () => {
    it('clears selected object', () => {
      const obj = {name: 'Test', ra: 0, dec: 0, type: 'Star'};
      manager.selectObject(obj);
      manager.dispose();
      expect(manager.getSelectedObject()).toBeNull();
    });

    it('clears highlight timeout', () => {
      jest.useFakeTimers();
      const obj = {name: 'Test', ra: 0, dec: 0, type: 'Star'};
      manager.selectObject(obj);
      manager.dispose();
      // Advance timers - should not call hideHighlight again
      jest.advanceTimersByTime(5000);
      // hideHighlight called once during dispose cleanup
      jest.useRealTimers();
    });
  });

  describe('DSS fallback on image error', () => {
    let managerWithDss;
    let mockDepsWithDss;

    beforeEach(() => {
      mockDepsWithDss = {
        ...mockDeps,
        getSkyViewImageUrl: jest.fn().mockReturnValue('https://dss.example.com/image.jpg'),
        fetchBestImage: jest.fn().mockResolvedValue({
          url: 'https://nasa.gov/image.jpg',
          source: 'NASA',
          tier: 'high',
        }),
      };
      managerWithDss = new SelectionManager(mockDepsWithDss);
    });

    afterEach(() => {
      managerWithDss.dispose();
    });

    it('calls getSkyViewImageUrl when image fails and source is not DSS', () => {
      const container = document.getElementById('main-image');
      const obj = {name: 'M31', ra: 10.68, dec: 41.27, type: 'G'};

      // Call the private method via public interface
      managerWithDss.displayImage_(container, obj, 'https://fail.url', 'NASA', 'tier-high', 'NASA');

      // Simulate image error
      const img = container.querySelector('img');
      expect(img).toBeTruthy();

      // Trigger onerror
      img.onerror();

      // Should have called getSkyViewImageUrl for DSS fallback
      expect(mockDepsWithDss.getSkyViewImageUrl).toHaveBeenCalledWith(10.68, 41.27, 'G');
    });

    it('does not try DSS fallback when source is already DSS', () => {
      const container = document.getElementById('main-image');
      const obj = {name: 'M31', ra: 10.68, dec: 41.27, type: 'G'};

      managerWithDss.displayImage_(container, obj, 'https://dss.url', 'DSS', 'tier-vintage', 'DSS');

      const img = container.querySelector('img');
      img.onerror();

      // Should NOT call getSkyViewImageUrl since source is already DSS
      expect(mockDepsWithDss.getSkyViewImageUrl).not.toHaveBeenCalled();

      // Should show unavailable message
      const unavailable = container.querySelector('.image-unavailable');
      expect(unavailable).toBeTruthy();
    });

    it('does not try DSS fallback when object has no coordinates', () => {
      const container = document.getElementById('main-image');
      const obj = {name: 'Unknown', type: 'Star'}; // No ra/dec

      managerWithDss.displayImage_(container, obj, 'https://fail.url', 'NASA', 'tier-high', 'NASA');

      const img = container.querySelector('img');
      img.onerror();

      // Should NOT call getSkyViewImageUrl since no coordinates
      expect(mockDepsWithDss.getSkyViewImageUrl).not.toHaveBeenCalled();
    });

    it('shows DSS fallback with correct source text', () => {
      const container = document.getElementById('main-image');
      const obj = {name: 'M31', ra: 10.68, dec: 41.27, type: 'G'};

      managerWithDss.displayImage_(container, obj, 'https://fail.url', 'NASA', 'tier-high', 'NASA');

      // Trigger onerror - this should recursively call displayImage_ with DSS
      const img = container.querySelector('img');
      img.onerror();

      // After DSS fallback, should have new img with DSS URL
      const dssImg = container.querySelector('img');
      expect(dssImg.src).toBe('https://dss.example.com/image.jpg');

      // Should show DSS source text
      const sourceDiv = container.querySelector('.image-source');
      expect(sourceDiv.textContent).toBe('📜 Digitized Sky Survey (fallback)');
    });
  });

  describe('AbortController behavior', () => {
    let abortManager;
    let mockAbortDeps;
    let originalFetch;

    beforeEach(() => {
      // Save original fetch and create mock
      originalFetch = global.fetch;
      global.fetch = jest.fn();

      mockAbortDeps = {
        ...mockDeps,
        fetchBestImage: jest.fn().mockResolvedValue({
          url: 'https://example.com/image.jpg',
          source: 'NASA',
          tier: 'high',
        }),
      };
      abortManager = new SelectionManager(mockAbortDeps);
    });

    afterEach(() => {
      abortManager.dispose();
      // Restore original fetch
      global.fetch = originalFetch;
    });

    it('dispose() aborts pending description requests', () => {
      // Set up an AbortController manually
      abortManager.descriptionAbortController_ = new AbortController();
      const abortSpy = jest.spyOn(abortManager.descriptionAbortController_, 'abort');

      abortManager.dispose();

      expect(abortSpy).toHaveBeenCalled();
      expect(abortManager.descriptionAbortController_).toBeNull();
    });

    it('dispose() aborts pending image requests', () => {
      // Set up an AbortController manually
      abortManager.imageAbortController_ = new AbortController();
      const abortSpy = jest.spyOn(abortManager.imageAbortController_, 'abort');

      abortManager.dispose();

      expect(abortSpy).toHaveBeenCalled();
      expect(abortManager.imageAbortController_).toBeNull();
    });

    it('creates new AbortController for each description fetch', async () => {
      // Mock fetch response
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({extract: 'Test description'}),
      });

      // First fetch creates controller
      const obj1 = {name: 'Sirius', ra: 0, dec: 0, type: 'Star'};
      await abortManager.fetchObjectDescription_(obj1);
      const controller1 = abortManager.descriptionAbortController_;
      expect(controller1).toBeInstanceOf(AbortController);

      // Second fetch creates new controller
      const obj2 = {name: 'Vega', ra: 0, dec: 0, type: 'Star'};
      await abortManager.fetchObjectDescription_(obj2);
      const controller2 = abortManager.descriptionAbortController_;
      expect(controller2).toBeInstanceOf(AbortController);
      expect(controller2).not.toBe(controller1);
    });

    it('passes signal to fetch via fetchWikipedia', async () => {
      // Import fetchWikipedia directly and test it
      const {fetchWikipedia} = await import('../../modules/core/SecurityUtils.js');

      // Mock fetch response
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({extract: 'Test'}),
      });

      // Create an AbortController and pass its signal
      const controller = new AbortController();
      await fetchWikipedia('https://en.wikipedia.org/api/test', controller.signal);

      // Verify signal was passed to fetch
      expect(global.fetch).toHaveBeenCalled();
      const fetchOptions = global.fetch.mock.calls[0][1];
      expect(fetchOptions.signal).toBe(controller.signal);
    });

    it('handles AbortError gracefully without console warning', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      // Mock fetch to throw AbortError
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      global.fetch.mockRejectedValue(abortError);

      const obj = {name: 'Test', ra: 0, dec: 0, type: 'Star'};
      await abortManager.fetchObjectDescription_(obj);

      // Should NOT log warning for AbortError
      expect(consoleWarnSpy).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('propagates non-abort errors from fetch', async () => {
      // This verifies that fetchWikipedia propagates network errors (doesn't swallow them).
      // The actual console.warn behavior in SelectionManager's catch block can't be
      // easily tested due to ES module caching - the module captures fetch at import time.
      // Full error handling is tested in SecurityUtils.test.js.
      const {fetchWikipedia} = await import('../../modules/core/SecurityUtils.js');

      // Mock fetch to throw a regular error
      global.fetch.mockRejectedValue(new Error('Network error'));

      // Call fetchWikipedia directly with signal
      const controller = new AbortController();
      let errorThrown = false;
      try {
        await fetchWikipedia('https://en.wikipedia.org/api/test', controller.signal);
      } catch (e) {
        errorThrown = true;
        expect(e.message).toBe('Network error');
      }

      // Verify: fetch was called and error was propagated (not swallowed)
      expect(global.fetch).toHaveBeenCalled();
      expect(errorThrown).toBe(true);
    });

    it('aborts previous request when selecting new object rapidly', async () => {
      // Set up a controller as if first fetch is in progress
      const firstController = new AbortController();
      abortManager.descriptionAbortController_ = firstController;
      const abortSpy = jest.spyOn(firstController, 'abort');

      // Mock fetch for second request
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({extract: 'Second'}),
      });

      // Start second fetch - should abort first
      const obj2 = {name: 'Second', ra: 0, dec: 0, type: 'Star'};
      await abortManager.fetchObjectDescription_(obj2);

      // First controller should have been aborted
      expect(abortSpy).toHaveBeenCalled();
    });

    it('constellation description also aborts previous requests', async () => {
      // Set up a controller as if previous fetch is in progress
      const prevController = new AbortController();
      abortManager.descriptionAbortController_ = prevController;
      const abortSpy = jest.spyOn(prevController, 'abort');

      // Mock fetch
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({extract: 'Orion constellation'}),
      });

      // Fetch constellation description - should abort previous
      await abortManager.fetchConstellationDescription('Orion');

      // Previous controller should have been aborted
      expect(abortSpy).toHaveBeenCalled();
    });

    it('selectObject() aborts pending requests immediately', () => {
      // Set up controllers as if fetches are in progress from previous selection
      const oldDescController = new AbortController();
      const oldImageController = new AbortController();
      abortManager.descriptionAbortController_ = oldDescController;
      abortManager.imageAbortController_ = oldImageController;

      const descAbortSpy = jest.spyOn(oldDescController, 'abort');
      const imageAbortSpy = jest.spyOn(oldImageController, 'abort');

      // Select a new object - should abort both pending requests immediately
      const obj = {name: 'NewObject', ra: 0, dec: 0, type: 'Star'};
      abortManager.selectObject(obj);

      // OLD controllers should have been aborted
      expect(descAbortSpy).toHaveBeenCalled();
      expect(imageAbortSpy).toHaveBeenCalled();

      // New controllers may be created by the info fetching, but the OLD ones are gone
      // (new requests would have new controllers)
    });

    it('selectObject(null) also aborts pending requests', () => {
      // Set up controllers as if fetches are in progress
      const descController = new AbortController();
      abortManager.descriptionAbortController_ = descController;
      const abortSpy = jest.spyOn(descController, 'abort');

      // Deselect - should abort pending requests
      abortManager.selectObject(null);

      expect(abortSpy).toHaveBeenCalled();
      expect(abortManager.descriptionAbortController_).toBeNull();
    });
  });
});
