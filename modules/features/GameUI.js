/**
 * @fileoverview Game mode UI controls.
 * Handles game start, pass, stop button interactions, and panel drag.
 */

import {globalEventBus, Events} from '../core/EventBus.js';
import {domCache} from '../ui/DOMCache.js';
import {clamp, addMobileButtonListener} from '../core/Utils.js';
import {createLogger} from '../core/Logger.js';

const logger = createLogger('GameUI');

/**
 * GameUI handles the game control buttons and display.
 */
export class GameUI {
  /**
   * Creates a new GameUI instance.
   * @param {!Object} dependencies - Required dependencies
   * @param {function(): void=} dependencies.passQuestion - Pass current question
   * @param {function(): void=} dependencies.stopGame - Stop game function
   */
  constructor(dependencies) {
    /** @private @const */
    this.deps_ = dependencies;

    /** @private {boolean} */
    this.isPlaying_ = false;

    /** @private {boolean} */
    this.panelDragSetup_ = false;

    /** @private {boolean} */
    this.isDragging_ = false;

    /** @private {!Array<{unsubscribe: function(): void}>} */
    this.subscriptions_ = [];
  }

  /**
   * Initialize the game UI.
   */
  initialize() {
    this.setupEventListeners_();
    this.setupEventBusListeners_();
    this.setupPanelDrag_();
  }

  /**
   * Set up DOM event listeners.
   * @private
   */
  setupEventListeners_() {
    const passBtn = document.getElementById('pass-btn');
    if (passBtn) {
      addMobileButtonListener(passBtn, () => {
        this.deps_.passQuestion?.();
      });
    }

    const stopGameBtn = document.getElementById('stop-game-btn');
    if (stopGameBtn) {
      addMobileButtonListener(stopGameBtn, () => {
        this.deps_.stopGame?.();
      });
    }
  }

  /**
   * Setup drag functionality for the game panel.
   * Only draggable by the header (h2 element).
   * Uses dynamic listener attachment to avoid memory leaks.
   * @private
   */
  setupPanelDrag_() {
    // Guard against multiple setup calls
    if (this.panelDragSetup_) return;

    const gamePanel = domCache.gamePanel;
    if (!gamePanel) return;

    const header = gamePanel.querySelector('h2');
    if (!header) return;

    this.panelDragSetup_ = true;

    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    // Define handlers as arrow functions to preserve 'this' context
    const onDragMove = (e) => {
      let clientX, clientY;
      if (e.type === 'touchmove') {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }

      const deltaX = clientX - startX;
      const deltaY = clientY - startY;

      let newLeft = startLeft + deltaX;
      let newTop = startTop + deltaY;

      // Constrain to viewport bounds
      const panelRect = gamePanel.getBoundingClientRect();
      const maxLeft = window.innerWidth - panelRect.width;
      const maxTop = window.innerHeight - panelRect.height;

      newLeft = clamp(newLeft, 0, maxLeft);
      newTop = clamp(newTop, 0, maxTop);

      gamePanel.style.left = `${newLeft}px`;
      gamePanel.style.top = `${newTop}px`;

      e.preventDefault();
    };

    const onDragEnd = () => {
      this.isDragging_ = false;

      // Remove document-level listeners to prevent memory leaks
      document.removeEventListener('mousemove', onDragMove);
      document.removeEventListener('mouseup', onDragEnd);
      document.removeEventListener('touchmove', onDragMove);
      document.removeEventListener('touchend', onDragEnd);
    };

    const onDragStart = (e) => {
      this.isDragging_ = true;

      // Get current position (use computed style if not set)
      const rect = gamePanel.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;

      // Get pointer position
      if (e.type === 'touchstart') {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      } else {
        startX = e.clientX;
        startY = e.clientY;
      }

      // Add document-level listeners only when dragging starts
      document.addEventListener('mousemove', onDragMove);
      document.addEventListener('mouseup', onDragEnd);
      document.addEventListener('touchmove', onDragMove, {passive: false});
      document.addEventListener('touchend', onDragEnd);

      e.preventDefault();
    };

    // Only attach start listeners to header
    header.addEventListener('mousedown', onDragStart);
    header.addEventListener('touchstart', onDragStart, {passive: false});
  }

  /**
   * Check if panel is currently being dragged.
   * @returns {boolean} True if dragging
   */
  isDragging() {
    return this.isDragging_;
  }

  /**
   * Set up EventBus listeners.
   * @private
   */
  setupEventBusListeners_() {
    this.subscriptions_.push(
      globalEventBus.on(Events.GAME_STARTED, () => {
        this.isPlaying_ = true;
        this.updateUI_(true);
      }),
      globalEventBus.on(Events.GAME_STOPPED, () => {
        this.isPlaying_ = false;
        this.updateUI_(false);
      }),
      globalEventBus.on(Events.GAME_QUESTION, (data) => {
        this.updateQuestion_(data);
      }),
      globalEventBus.on(Events.GAME_SCORE_UPDATED, (data) => {
        this.updateScore_(data);
      })
    );
  }

  /**
   * Clean up event subscriptions.
   */
  dispose() {
    if (this.subscriptions_) {
      this.subscriptions_.forEach((sub) => sub?.unsubscribe?.());
      this.subscriptions_ = [];
    }
  }

  /**
   * Update UI state.
   * @param {boolean} isPlaying - Whether game is active
   * @private
   */
  updateUI_(isPlaying) {
    const gamePanel = document.getElementById('game-panel');
    if (gamePanel) {
      gamePanel.classList.toggle('active', isPlaying);
    }
  }

  /**
   * Update question display.
   * @param {!Object} data - Question data
   * @private
   */
  updateQuestion_(data) {
    const questionEl = document.getElementById('game-question');
    if (questionEl) {
      // Use displayName for translated names, fall back to name
      questionEl.textContent = data.question?.displayName ||
          data.question?.name || 'Unknown';
    }
  }

  /**
   * Update score display.
   * @param {!Object} data - Score data
   * @private
   */
  updateScore_(data) {
    const scoreEl = document.getElementById('game-score');
    if (scoreEl) {
      scoreEl.textContent = `Score: ${data.score}/${data.total}`;
    }
  }

  /**
   * Check if game is currently playing.
   * @returns {boolean} True if game is active
   */
  isPlaying() {
    return this.isPlaying_;
  }
}

/**
 * Singleton game UI instance.
 * @type {?GameUI}
 */
export let gameUI = null;

/**
 * Reset the singleton instance (for testing only).
 */
export function resetGameUI() {
  gameUI?.dispose();
  gameUI = null;
}

/**
 * Initialize the game UI singleton.
 * Returns existing instance if already initialized (prevents duplicate event handlers).
 * @param {!Object} dependencies - Required dependencies
 * @returns {!GameUI} Initialized instance
 */
export function initializeGameUI(dependencies) {
  if (gameUI) {
    logger.warn('GameUI already initialized, returning existing instance');
    return gameUI;
  }
  gameUI = new GameUI(dependencies);
  gameUI.initialize();
  return gameUI;
}
