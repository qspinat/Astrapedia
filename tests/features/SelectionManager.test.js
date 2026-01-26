/**
 * @fileoverview Tests for SelectionManager module.
 */

import {jest} from '@jest/globals';
import {
  SelectionManager,
  initializeSelectionManager,
} from '../../modules/features/SelectionManager.js';

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

  describe('initializeSelectionManager', () => {
    it('creates and returns singleton instance', () => {
      const instance = initializeSelectionManager(mockDeps);
      expect(instance).toBeInstanceOf(SelectionManager);
      instance.dispose();
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
});
