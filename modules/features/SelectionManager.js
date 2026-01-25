/**
 * @fileoverview Selection manager for celestial objects.
 * Handles object selection, highlighting, and info panel display.
 */

import {globalEventBus, Events} from '../core/EventBus.js';
import {escapeHtml} from '../core/SecurityUtils.js';

/**
 * DSO type full names.
 * @const {!Object<string, string>}
 */
const DSO_TYPE_NAMES = {
  'G': 'Galaxy',
  'GClstr': 'Galaxy Cluster',
  'GPair': 'Galaxy Pair',
  'GTrpl': 'Galaxy Triplet',
  'GGroup': 'Galaxy Group',
  'PN': 'Planetary Nebula',
  'HII': 'HII Region',
  'EmN': 'Emission Nebula',
  'RfN': 'Reflection Nebula',
  'SNR': 'Supernova Remnant',
  'Nova': 'Nova Remnant',
  'NonEx': 'Non-Existent',
  'Neb': 'Nebula',
  'Cl+N': 'Cluster with Nebulosity',
  'GCl': 'Globular Cluster',
  'OCl': 'Open Cluster',
  'Star': 'Star',
  'DrkN': 'Dark Nebula',
  'Other': 'Other',
  'Dup': 'Duplicate',
  '*': 'Star',
  '**': 'Double Star',
  '*Ass': 'Star Association',
  'Planet': 'Planet',
  'Moon': 'Moon',
  'Constellation': 'Constellation',
};

/**
 * SelectionManager handles object selection and info display.
 */
export class SelectionManager {
  /**
   * Creates a new SelectionManager instance.
   * @param {!Object} dependencies - Required dependencies
   * @param {function(number, number): void=} dependencies.navigateToRaDec - Navigate to coords
   * @param {function(string): void=} dependencies.highlightConstellation - Highlight constellation
   * @param {function(): void=} dependencies.unhighlightConstellation - Unhighlight constellation
   * @param {function(number, number, number): void=} dependencies.showHighlight - Show highlight ring
   * @param {function(): void=} dependencies.hideHighlight - Hide highlight ring
   * @param {function(!Object): ?string=} dependencies.getImageUrl - Get object image URL
   * @param {function(string): void=} dependencies.openPanel - Open UI panel
   * @param {function(): void=} dependencies.closeAllPanels - Close all UI panels
   */
  constructor(dependencies = {}) {
    /** @private @const */
    this.deps_ = dependencies;

    /** @private {?Object} */
    this.selectedObject_ = null;

    /** @private {?number} */
    this.highlightTimeout_ = null;
  }

  /**
   * Get the currently selected object.
   * @returns {?Object} Selected object or null
   */
  getSelectedObject() {
    return this.selectedObject_;
  }

  /**
   * Select an object and display its info.
   * @param {?Object} obj - Object to select, or null to deselect
   */
  selectObject(obj) {
    this.selectedObject_ = obj;

    // Clear any existing highlight timeout
    if (this.highlightTimeout_) {
      clearTimeout(this.highlightTimeout_);
      this.highlightTimeout_ = null;
    }

    if (!obj) {
      // Deselect - hide info panel and any highlight
      this.deps_.unhighlightConstellation?.();
      this.deps_.hideHighlight?.();
      this.deps_.closeAllPanels?.();

      globalEventBus.emit(Events.OBJECT_DESELECTED, {});
      return;
    }

    // Navigate camera to object
    this.deps_.navigateToRaDec?.(obj.ra, obj.dec);

    // Handle constellations specially
    if (obj.type === 'Constellation') {
      this.deps_.hideHighlight?.();
      this.deps_.highlightConstellation?.(obj.name);
      this.showConstellationInfo_(obj.name);
      this.deps_.openPanel?.('info-panel');

      globalEventBus.emit(Events.OBJECT_SELECTED, {
        object: obj,
        type: 'constellation',
      });
      return;
    }

    // Unhighlight any previously highlighted constellation
    this.deps_.unhighlightConstellation?.();

    // Show temporary highlight ring around the object
    const angularSize = obj.size_major || obj.angularSize || 20;
    this.deps_.showHighlight?.(obj.ra, obj.dec, angularSize);

    // Auto-hide the highlight after 4 seconds
    this.highlightTimeout_ = setTimeout(() => {
      this.deps_.hideHighlight?.();
      this.highlightTimeout_ = null;
    }, 4000);

    // Show info panel
    this.showObjectInfo_(obj);
    this.deps_.openPanel?.('info-panel');

    globalEventBus.emit(Events.OBJECT_SELECTED, {
      object: obj,
      type: obj.type,
    });
  }

  /**
   * Clear the current selection.
   */
  clearSelection() {
    this.selectObject(null);
  }

  /**
   * Get full name for a DSO type abbreviation.
   * @param {string} type - Type abbreviation
   * @returns {string} Full type name
   */
  getTypeFullName(type) {
    return DSO_TYPE_NAMES[type] || type || 'Unknown';
  }

  /**
   * Format angular size for display.
   * @param {number} arcminMajor - Major axis in arcminutes
   * @param {number=} arcminMinor - Minor axis in arcminutes
   * @returns {string} Formatted size string
   * @private
   */
  formatAngularSize_(arcminMajor, arcminMinor) {
    let sizeStr;
    if (arcminMajor >= 60) {
      sizeStr = `${(arcminMajor / 60).toFixed(1)}°`;
    } else if (arcminMajor >= 1) {
      sizeStr = `${arcminMajor.toFixed(1)}'`;
    } else {
      sizeStr = `${(arcminMajor * 60).toFixed(1)}"`;
    }

    // Add minor axis if different
    if (arcminMinor && arcminMinor !== arcminMajor) {
      let minorStr;
      if (arcminMinor >= 60) {
        minorStr = `${(arcminMinor / 60).toFixed(1)}°`;
      } else if (arcminMinor >= 1) {
        minorStr = `${arcminMinor.toFixed(1)}'`;
      } else {
        minorStr = `${(arcminMinor * 60).toFixed(1)}"`;
      }
      sizeStr += ` × ${minorStr}`;
    }

    return sizeStr;
  }

  /**
   * Show object info in the info panel.
   * @param {!Object} obj - Object to display
   * @private
   */
  showObjectInfo_(obj) {
    const content = document.getElementById('info-content');
    if (!content) return;

    // Get display name with fallbacks
    const displayName = obj.name || obj.proper || 'Unknown Object';

    // Update panel header title
    const titleEl = document.getElementById('object-title');
    if (titleEl) titleEl.textContent = displayName;

    let html = '';

    // Image container - will be populated with best available image
    html += `<div class="object-images">`;
    html += `<div class="object-image-container" id="main-image">`;
    html += `<div class="image-loading">Loading image...</div>`;
    html += `</div>`;
    html += `</div>`;

    // Object details
    const typeFullName = this.getTypeFullName(obj.type);
    html += `<p><strong>Type:</strong> ${escapeHtml(typeFullName)}</p>`;

    if (obj.subtype) {
      html += `<p><strong>Subtype:</strong> ${escapeHtml(this.getTypeFullName(obj.subtype))}</p>`;
    }

    html += `<p><strong>RA:</strong> ${obj.ra.toFixed(4)}°</p>`;
    html += `<p><strong>Dec:</strong> ${obj.dec.toFixed(4)}°</p>`;

    if (obj.mag !== undefined && obj.mag !== null) {
      html += `<p><strong>Magnitude:</strong> ${obj.mag.toFixed(1)}</p>`;
    }

    // Angular size
    if (obj.size_major) {
      const sizeStr = this.formatAngularSize_(obj.size_major, obj.size_minor);
      html += `<p><strong>Angular Size:</strong> ${sizeStr}</p>`;
    }

    // Distance
    if (obj.dist) {
      html += `<p><strong>Distance:</strong> ${obj.dist.toFixed(1)} parsecs</p>`;
    }

    // Spectral type
    if (obj.spect) {
      html += `<p><strong>Spectral Type:</strong> ${escapeHtml(obj.spect)}</p>`;
    }

    // Alternative names
    if (obj.common_names) {
      const names = Array.isArray(obj.common_names)
        ? obj.common_names.join(', ')
        : obj.common_names;
      html += `<p><strong>Also known as:</strong> ${escapeHtml(names)}</p>`;
    }

    // Messier number
    if (obj.messier) {
      html += `<p><strong>Messier:</strong> M${obj.messier}</p>`;
    }

    // Wikipedia link
    html += `<div class="wiki-link-container">`;
    html += `<a href="https://en.wikipedia.org/wiki/${encodeURIComponent(displayName)}" `;
    html += `target="_blank" rel="noopener noreferrer" class="wiki-link">`;
    html += `Learn more on Wikipedia</a>`;
    html += `</div>`;

    content.innerHTML = html;

    // Load image asynchronously
    this.loadObjectImage_(obj);
  }

  /**
   * Load object image asynchronously.
   * @param {!Object} obj - Object to load image for
   * @private
   */
  loadObjectImage_(obj) {
    const imageUrl = this.deps_.getImageUrl?.(obj);
    const container = document.getElementById('main-image');

    if (!container) return;

    if (imageUrl) {
      const img = new Image();
      img.onload = () => {
        container.innerHTML = `<img src="${imageUrl}" alt="${escapeHtml(obj.name || 'Object')}" class="object-image">`;
      };
      img.onerror = () => {
        container.innerHTML = `<div class="image-error">Image not available</div>`;
      };
      img.src = imageUrl;
    } else {
      container.innerHTML = `<div class="image-error">No image available</div>`;
    }
  }

  /**
   * Show constellation info in the info panel.
   * @param {string} name - Constellation name
   * @private
   */
  showConstellationInfo_(name) {
    const content = document.getElementById('info-content');
    if (!content) return;

    // Update panel header title
    const titleEl = document.getElementById('object-title');
    if (titleEl) titleEl.textContent = name;

    let html = '';
    html += `<p><strong>Type:</strong> Constellation</p>`;
    html += `<div class="wiki-link-container">`;
    html += `<a href="https://en.wikipedia.org/wiki/${encodeURIComponent(name)}_(constellation)" `;
    html += `target="_blank" rel="noopener noreferrer" class="wiki-link">`;
    html += `Learn more on Wikipedia</a>`;
    html += `</div>`;

    content.innerHTML = html;
  }

  /**
   * Dispose of resources.
   */
  dispose() {
    if (this.highlightTimeout_) {
      clearTimeout(this.highlightTimeout_);
      this.highlightTimeout_ = null;
    }
    this.selectedObject_ = null;
  }
}

/**
 * Singleton selection manager instance.
 * @type {?SelectionManager}
 */
export let selectionManager = null;

/**
 * Initialize the selection manager singleton.
 * @param {!Object} dependencies - Required dependencies
 * @returns {!SelectionManager} Initialized manager
 */
export function initializeSelectionManager(dependencies) {
  selectionManager = new SelectionManager(dependencies);
  return selectionManager;
}
