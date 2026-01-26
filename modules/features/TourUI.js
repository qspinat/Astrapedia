/**
 * @fileoverview Tour selection UI controls.
 * Handles tour button interactions and tour navigation.
 */

import {globalEventBus, Events} from '../core/EventBus.js';
import {panelManager} from '../ui/PanelManager.js';

/**
 * TourUI handles the tour selection buttons and navigation.
 */
export class TourUI {
  /**
   * Creates a new TourUI instance.
   * @param {!Object} dependencies - Required dependencies
   * @param {function(string): void=} dependencies.startTour - Start tour by name
   * @param {function(): void=} dependencies.nextStep - Go to next step
   * @param {function(): void=} dependencies.prevStep - Go to previous step
   * @param {function(): void=} dependencies.stopTour - Stop current tour
   * @param {!Object=} dependencies.panelManager - Panel manager instance
   */
  constructor(dependencies) {
    /** @private @const */
    this.deps_ = dependencies;

    /** @private @const */
    this.panelManager_ = dependencies.panelManager || panelManager;

    /** @private {boolean} */
    this.isActive_ = false;

    /** @private {?string} */
    this.currentTour_ = null;
  }

  /**
   * Initialize the tour UI.
   */
  initialize() {
    this.setupEventListeners_();
    this.setupEventBusListeners_();
  }

  /**
   * Set up DOM event listeners.
   * @private
   */
  setupEventListeners_() {
    // Main tour buttons
    this.setupTourButton_('tour-tonight-btn', 'tonight-best');
    this.setupTourButton_('tour-messier-btn', 'messier-marathon');
    this.setupTourButton_('tour-nebulae-btn', 'best-nebulae');
    this.setupTourButton_('tour-galaxies-btn', 'best-galaxies');
    this.setupTourButton_('tour-clusters-btn', 'best-clusters');
    this.setupTourButton_('tour-constellations-btn', 'constellations');
    this.setupTourButton_('tour-planets-btn', 'planets');
    this.setupTourButton_('tour-winter-btn', 'winter-sky');

    // Navigation buttons
    const nextBtn = document.getElementById('tour-next-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        this.deps_.nextStep?.();
      });
    }

    const prevBtn = document.getElementById('tour-prev-btn');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        this.deps_.prevStep?.();
      });
    }

    const stopBtn = document.getElementById('tour-stop-btn');
    if (stopBtn) {
      stopBtn.addEventListener('click', () => {
        this.deps_.stopTour?.();
      });
    }
  }

  /**
   * Set up a tour button with event handler.
   * @param {string} buttonId - The button element ID
   * @param {string} tourName - The tour name to start
   * @private
   */
  setupTourButton_(buttonId, tourName) {
    const btn = document.getElementById(buttonId);
    if (btn) {
      btn.addEventListener('click', () => {
        this.deps_.startTour?.(tourName);
        this.panelManager_?.closeAll?.();
      });
    }
  }

  /**
   * Set up EventBus listeners.
   * @private
   */
  setupEventBusListeners_() {
    globalEventBus.on(Events.TOUR_STARTED, (data) => {
      this.isActive_ = true;
      this.currentTour_ = data.tourName;
      this.showTourUI_();
    });

    globalEventBus.on(Events.TOUR_ENDED, () => {
      this.isActive_ = false;
      this.currentTour_ = null;
      this.hideTourUI_();
    });

    globalEventBus.on(Events.TOUR_STEP_CHANGED, (data) => {
      // Build the full tour panel with navigation buttons
      this.buildTourPanel({
        tourName: data.tour?.name || this.currentTour_,
        stepName: data.step?.name || '',
        description: data.step?.description || '',
        stepIndex: data.stepIndex,
        totalSteps: data.totalSteps,
        isFirstStep: data.stepIndex === 0,
        onPrev: () => this.deps_.prevStep?.(),
        onNext: () => this.deps_.nextStep?.(),
        onEnd: () => this.deps_.stopTour?.(),
      });
    });
  }

  /**
   * Show the tour navigation UI.
   * @private
   */
  showTourUI_() {
    const tourPanel = document.getElementById('tour-panel');
    if (tourPanel) {
      tourPanel.classList.add('active');
    }
  }

  /**
   * Hide the tour navigation UI.
   * @private
   */
  hideTourUI_() {
    const tourPanel = document.getElementById('tour-panel');
    if (tourPanel) {
      tourPanel.classList.remove('active');
      tourPanel.style.display = 'none';
    }
  }

  /**
   * Update the step display.
   * @param {!Object} data - Step data
   * @private
   */
  updateStepDisplay_(data) {
    const stepEl = document.getElementById('tour-step');
    if (stepEl) {
      stepEl.textContent = `${data.stepIndex + 1} / ${data.totalSteps}`;
    }

    const nameEl = document.getElementById('tour-object-name');
    if (nameEl && data.step) {
      nameEl.textContent = data.step.name;
    }
  }

  /**
   * Build the tour panel with step info and navigation buttons.
   * @param {!Object} tourData - Tour data
   * @param {string} tourData.tourName - Name of the tour
   * @param {string} tourData.stepName - Display name for current step
   * @param {string} tourData.description - Step description
   * @param {number} tourData.stepIndex - Current step index (0-based)
   * @param {number} tourData.totalSteps - Total steps in tour
   * @param {boolean} tourData.isFirstStep - True if first step
   * @param {function(): void} tourData.onPrev - Previous step callback
   * @param {function(): void} tourData.onNext - Next step callback
   * @param {function(): void} tourData.onEnd - End tour callback
   */
  buildTourPanel(tourData) {
    const tourPanel = document.getElementById('tour-panel');
    if (!tourPanel) return;

    // Clear existing content
    tourPanel.textContent = '';

    // Tour title
    const h2 = document.createElement('h2');
    h2.textContent = tourData.tourName;
    tourPanel.appendChild(h2);

    // Step name
    const h3 = document.createElement('h3');
    h3.textContent = tourData.stepName;
    tourPanel.appendChild(h3);

    // Description
    const desc = document.createElement('p');
    desc.textContent = tourData.description;
    tourPanel.appendChild(desc);

    // Progress
    const progress = document.createElement('p');
    progress.textContent = `Step ${tourData.stepIndex + 1} of ${tourData.totalSteps}`;
    tourPanel.appendChild(progress);

    // Navigation buttons container
    const btnContainer = document.createElement('div');
    btnContainer.className = 'tour-buttons';

    // Previous button
    const prevBtn = document.createElement('button');
    prevBtn.textContent = '← Previous';
    prevBtn.disabled = tourData.isFirstStep;
    prevBtn.addEventListener('click', () => tourData.onPrev?.());
    btnContainer.appendChild(prevBtn);

    // Next button
    const nextBtn = document.createElement('button');
    nextBtn.textContent = 'Next →';
    nextBtn.addEventListener('click', () => tourData.onNext?.());
    btnContainer.appendChild(nextBtn);

    tourPanel.appendChild(btnContainer);

    // End tour button
    const endBtn = document.createElement('button');
    endBtn.textContent = 'End Tour';
    endBtn.className = 'tour-end-btn';
    endBtn.addEventListener('click', () => tourData.onEnd?.());
    tourPanel.appendChild(endBtn);

    // Show the panel
    tourPanel.style.display = 'block';
  }

  /**
   * Check if a tour is currently active.
   * @returns {boolean} True if tour is active
   */
  isActive() {
    return this.isActive_;
  }

  /**
   * Get the current tour name.
   * @returns {?string} Tour name or null
   */
  getCurrentTour() {
    return this.currentTour_;
  }
}

/**
 * Singleton tour UI instance.
 * @type {?TourUI}
 */
export let tourUI = null;

/**
 * Initialize the tour UI singleton.
 * @param {!Object} dependencies - Required dependencies
 * @returns {!TourUI} Initialized instance
 */
export function initializeTourUI(dependencies) {
  tourUI = new TourUI(dependencies);
  tourUI.initialize();
  return tourUI;
}
