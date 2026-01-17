/**
 * @fileoverview DOM element cache for performance optimization.
 * Caches frequently-accessed DOM elements to avoid repeated queries.
 */

/**
 * DOM element IDs grouped by category.
 * @const {!Object<string, !Array<string>>}
 */
const DOM_ELEMENT_IDS = {
  containers: [
    'canvas-container',
    'ui-overlay',
    'loading',
  ],
  panels: [
    'settings-panel',
    'info-panel',
    'visible-tonight-panel',
    'events-panel',
    'tour-panel',
    'game-panel',
    'controls-panel',
    'panel-backdrop',
  ],
  displays: [
    'ra-display',
    'dec-display',
    'fov-display',
    'fov-badge',
    'coords-badge',
    'visible-count',
    'dynamic-stars-count',
    'time-display',
    'time-speed-display',
    'object-title',
    'info-content',
    'info-badge',
  ],
  inputs: [
    'search-input',
    'magnitude-slider',
    'mag-value',
    'constellation-lines-toggle',
    'night-mode-toggle',
    'constellation-language',
    'max-dynamic-stars',
    'max-dynamic-stars-value',
  ],
  buttons: [
    'compass-toggle',
    'constellations-quick-toggle',
    'settings-toggle',
    'auto-location-btn',
    'set-location-btn',
    'reset-view-btn',
    'events-btn',
    'time-rewind-btn',
    'time-play-btn',
    'time-forward-btn',
    'time-now-btn',
    'start-game-btn',
    'pass-btn',
    'stop-game-btn',
    'game-select-cancel',
  ],
  closeButtons: [
    'settings-close-btn',
    'info-close-btn',
    'visible-tonight-close-btn',
    'events-close-btn',
  ],
  tourButtons: [
    'tour-tonight-btn',
    'tour-messier-btn',
    'tour-nebulae-btn',
    'tour-galaxies-btn',
    'tour-clusters-btn',
    'tour-constellations-btn',
    'tour-planets-btn',
    'tour-winter-btn',
  ],
  game: [
    'game-question',
    'game-score',
    'game-time',
    'game-correct',
    'game-select-modal',
  ],
  search: [
    'search-results',
  ],
};

/**
 * DOMCache provides cached access to frequently-used DOM elements.
 * Elements are lazily cached on first access for better startup performance.
 */
export class DOMCache {
  /**
   * Creates a new DOMCache instance.
   */
  constructor() {
    /**
     * Cache of DOM elements by ID.
     * @private {!Map<string, ?Element>}
     */
    this.cache_ = new Map();

    /**
     * Whether the cache has been initialized.
     * @private {boolean}
     */
    this.initialized_ = false;
  }

  /**
   * Initialize the cache by pre-fetching all known elements.
   * Call this after DOM is ready for best performance.
   */
  initialize() {
    if (this.initialized_) return;

    // Flatten all element IDs and cache them
    Object.values(DOM_ELEMENT_IDS).flat().forEach((id) => {
      this.get(id);
    });

    this.initialized_ = true;
  }

  /**
   * Get a cached DOM element by ID.
   * @param {string} id - The element ID (without '#' prefix)
   * @returns {?Element} The cached element or null if not found
   */
  get(id) {
    if (!this.cache_.has(id)) {
      this.cache_.set(id, document.getElementById(id));
    }
    return this.cache_.get(id);
  }

  /**
   * Get a DOM element, throwing if not found.
   * Use when the element is required for proper function.
   * @param {string} id - The element ID
   * @returns {!Element} The element
   * @throws {Error} If element not found
   */
  getRequired(id) {
    const element = this.get(id);
    if (!element) {
      throw new Error(`Required DOM element not found: ${id}`);
    }
    return element;
  }

  /**
   * Invalidate a cached element (force re-fetch on next access).
   * @param {string} id - The element ID to invalidate
   */
  invalidate(id) {
    this.cache_.delete(id);
  }

  /**
   * Clear the entire cache.
   * Useful when significant DOM changes occur.
   */
  clear() {
    this.cache_.clear();
    this.initialized_ = false;
  }

  /**
   * Get the canvas container element.
   * @returns {?Element} Canvas container
   */
  get canvasContainer() {
    return this.get('canvas-container');
  }

  /**
   * Get the UI overlay element.
   * @returns {?Element} UI overlay
   */
  get uiOverlay() {
    return this.get('ui-overlay');
  }

  /**
   * Get the loading screen element.
   * @returns {?Element} Loading screen
   */
  get loading() {
    return this.get('loading');
  }

  /**
   * Get the settings panel element.
   * @returns {?Element} Settings panel
   */
  get settingsPanel() {
    return this.get('settings-panel');
  }

  /**
   * Get the info panel element.
   * @returns {?Element} Info panel
   */
  get infoPanel() {
    return this.get('info-panel');
  }

  /**
   * Get the panel backdrop element.
   * @returns {?Element} Panel backdrop
   */
  get panelBackdrop() {
    return this.get('panel-backdrop');
  }

  /**
   * Get the search input element.
   * @returns {?HTMLInputElement} Search input
   */
  get searchInput() {
    return /** @type {?HTMLInputElement} */ (this.get('search-input'));
  }

  /**
   * Get the search results container.
   * @returns {?Element} Search results
   */
  get searchResults() {
    return this.get('search-results');
  }

  /**
   * Get the magnitude slider element.
   * @returns {?HTMLInputElement} Magnitude slider
   */
  get magnitudeSlider() {
    return /** @type {?HTMLInputElement} */ (this.get('magnitude-slider'));
  }

  /**
   * Get the magnitude value display element.
   * @returns {?Element} Magnitude value display
   */
  get magValue() {
    return this.get('mag-value');
  }

  /**
   * Get the time display element.
   * @returns {?Element} Time display
   */
  get timeDisplay() {
    return this.get('time-display');
  }

  /**
   * Get the time speed display element.
   * @returns {?Element} Time speed display
   */
  get timeSpeedDisplay() {
    return this.get('time-speed-display');
  }

  /**
   * Get the game panel element.
   * @returns {?Element} Game panel
   */
  get gamePanel() {
    return this.get('game-panel');
  }

  /**
   * Get the game question element.
   * @returns {?Element} Game question
   */
  get gameQuestion() {
    return this.get('game-question');
  }

  /**
   * Get the game score element.
   * @returns {?Element} Game score
   */
  get gameScore() {
    return this.get('game-score');
  }

  /**
   * Get the game time element.
   * @returns {?Element} Game time
   */
  get gameTime() {
    return this.get('game-time');
  }

  /**
   * Get the game correct count element.
   * @returns {?Element} Game correct count
   */
  get gameCorrect() {
    return this.get('game-correct');
  }

  /**
   * Get the game selection modal.
   * @returns {?Element} Game selection modal
   */
  get gameSelectModal() {
    return this.get('game-select-modal');
  }

  /**
   * Get the tour panel element.
   * @returns {?Element} Tour panel
   */
  get tourPanel() {
    return this.get('tour-panel');
  }

  /**
   * Get the object title element in info panel.
   * @returns {?Element} Object title
   */
  get objectTitle() {
    return this.get('object-title');
  }

  /**
   * Get the info content element.
   * @returns {?Element} Info content
   */
  get infoContent() {
    return this.get('info-content');
  }

  /**
   * Get the RA display element.
   * @returns {?Element} RA display
   */
  get raDisplay() {
    return this.get('ra-display');
  }

  /**
   * Get the Dec display element.
   * @returns {?Element} Dec display
   */
  get decDisplay() {
    return this.get('dec-display');
  }

  /**
   * Get the FOV display element.
   * @returns {?Element} FOV display
   */
  get fovDisplay() {
    return this.get('fov-display');
  }

  /**
   * Get the FOV badge element.
   * @returns {?Element} FOV badge
   */
  get fovBadge() {
    return this.get('fov-badge');
  }

  /**
   * Get the coordinates badge element.
   * @returns {?Element} Coordinates badge
   */
  get coordsBadge() {
    return this.get('coords-badge');
  }

  /**
   * Get the visible count element.
   * @returns {?Element} Visible count
   */
  get visibleCount() {
    return this.get('visible-count');
  }

  /**
   * Get the dynamic stars count element.
   * @returns {?Element} Dynamic stars count
   */
  get dynamicStarsCount() {
    return this.get('dynamic-stars-count');
  }
}

/**
 * Global DOMCache instance.
 * Import this in modules that need DOM access.
 * @const {!DOMCache}
 */
export const domCache = new DOMCache();
