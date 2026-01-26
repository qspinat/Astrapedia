/**
 * @fileoverview Game mode UI controls.
 * Handles game start, pass, and stop button interactions.
 */

import {globalEventBus, Events} from '../core/EventBus.js';

/**
 * GameUI handles the game control buttons and display.
 */
export class GameUI {
  /**
   * Creates a new GameUI instance.
   * @param {!Object} dependencies - Required dependencies
   * @param {function(): void=} dependencies.startGame - Start game function
   * @param {function(): void=} dependencies.passQuestion - Pass current question
   * @param {function(): void=} dependencies.stopGame - Stop game function
   */
  constructor(dependencies) {
    /** @private @const */
    this.deps_ = dependencies;

    /** @private {boolean} */
    this.isPlaying_ = false;
  }

  /**
   * Initialize the game UI.
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
    const startGameBtn = document.getElementById('start-game-btn');
    if (startGameBtn) {
      startGameBtn.addEventListener('click', () => {
        this.deps_.startGame?.();
      });
    }

    const passBtn = document.getElementById('pass-btn');
    if (passBtn) {
      passBtn.addEventListener('click', () => {
        this.deps_.passQuestion?.();
      });
    }

    const stopGameBtn = document.getElementById('stop-game-btn');
    if (stopGameBtn) {
      stopGameBtn.addEventListener('click', () => {
        this.deps_.stopGame?.();
      });
    }
  }

  /**
   * Set up EventBus listeners.
   * @private
   */
  setupEventBusListeners_() {
    globalEventBus.on(Events.GAME_STARTED, () => {
      this.isPlaying_ = true;
      this.updateUI_(true);
    });

    globalEventBus.on(Events.GAME_ENDED, () => {
      this.isPlaying_ = false;
      this.updateUI_(false);
    });

    globalEventBus.on(Events.GAME_QUESTION, (data) => {
      this.updateQuestion_(data);
    });

    globalEventBus.on(Events.GAME_SCORE, (data) => {
      this.updateScore_(data);
    });
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
      questionEl.textContent = `Find: ${data.targetName}`;
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
 * Initialize the game UI singleton.
 * @param {!Object} dependencies - Required dependencies
 * @returns {!GameUI} Initialized instance
 */
export function initializeGameUI(dependencies) {
  gameUI = new GameUI(dependencies);
  gameUI.initialize();
  return gameUI;
}
