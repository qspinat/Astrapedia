/**
 * @fileoverview Tests for GameUI module.
 */

import {jest} from '@jest/globals';
import {GameUI, initializeGameUI, resetGameUI} from '../modules/features/GameUI.js';
import {globalEventBus, Events} from '../modules/core/EventBus.js';

describe('GameUI', () => {
  let gameUI;
  let mockDeps;

  beforeEach(() => {
    jest.clearAllMocks();
    resetGameUI();

    // Setup mock DOM elements
    document.body.innerHTML = `
      <button id="pass-btn"></button>
      <button id="stop-game-btn"></button>
      <div id="game-panel">
        <h2>Game</h2>
        <div id="game-question"></div>
        <div id="game-score"></div>
      </div>
    `;

    mockDeps = {
      passQuestion: jest.fn(),
      stopGame: jest.fn(),
    };

    gameUI = new GameUI(mockDeps);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    resetGameUI();
  });

  describe('constructor', () => {
    test('creates instance with dependencies', () => {
      expect(gameUI).toBeInstanceOf(GameUI);
    });

    test('initializes state correctly', () => {
      expect(gameUI.isPlaying()).toBe(false);
      expect(gameUI.isDragging()).toBe(false);
    });
  });

  describe('initialize', () => {
    test('sets up pass button', () => {
      gameUI.initialize();

      const passBtn = document.getElementById('pass-btn');
      passBtn.click();
      expect(mockDeps.passQuestion).toHaveBeenCalled();
    });

    test('sets up stop button', () => {
      gameUI.initialize();

      const stopBtn = document.getElementById('stop-game-btn');
      stopBtn.click();
      expect(mockDeps.stopGame).toHaveBeenCalled();
    });
  });

  describe('EventBus listeners', () => {
    test('handles GAME_STARTED event', () => {
      gameUI.initialize();
      expect(gameUI.isPlaying()).toBe(false);

      globalEventBus.emit(Events.GAME_STARTED, {});
      expect(gameUI.isPlaying()).toBe(true);
    });

    test('handles GAME_STOPPED event', () => {
      gameUI.initialize();
      globalEventBus.emit(Events.GAME_STARTED, {});
      expect(gameUI.isPlaying()).toBe(true);

      globalEventBus.emit(Events.GAME_STOPPED, {});
      expect(gameUI.isPlaying()).toBe(false);
    });

    test('handles GAME_QUESTION event', () => {
      gameUI.initialize();

      globalEventBus.emit(Events.GAME_QUESTION, {
        question: {name: 'Vega', displayName: 'Vega'},
      });

      const questionEl = document.getElementById('game-question');
      expect(questionEl.textContent).toBe('Vega');
    });

    test('handles GAME_QUESTION event with displayName for translated names', () => {
      gameUI.initialize();

      globalEventBus.emit(Events.GAME_QUESTION, {
        question: {name: 'UrsaMajor', displayName: 'Ursa Major'},
      });

      const questionEl = document.getElementById('game-question');
      expect(questionEl.textContent).toBe('Ursa Major');
    });

    test('handles GAME_SCORE_UPDATED event', () => {
      gameUI.initialize();

      globalEventBus.emit(Events.GAME_SCORE_UPDATED, {score: 5, total: 10});

      const scoreEl = document.getElementById('game-score');
      expect(scoreEl.textContent).toBe('Score: 5/10');
    });
  });

  describe('UI updates', () => {
    test('adds active class to panel on game start', () => {
      gameUI.initialize();
      const panel = document.getElementById('game-panel');

      globalEventBus.emit(Events.GAME_STARTED, {});
      expect(panel.classList.contains('active')).toBe(true);
    });

    test('removes active class from panel on game end', () => {
      gameUI.initialize();
      const panel = document.getElementById('game-panel');

      globalEventBus.emit(Events.GAME_STARTED, {});
      globalEventBus.emit(Events.GAME_STOPPED, {});
      expect(panel.classList.contains('active')).toBe(false);
    });
  });

  describe('handles missing DOM elements gracefully', () => {
    test('works without buttons', () => {
      document.body.innerHTML = '';
      const ui = new GameUI(mockDeps);

      expect(() => ui.initialize()).not.toThrow();
    });

    test('works without game panel', () => {
      document.body.innerHTML = '<button id="pass-btn"></button>';
      const ui = new GameUI(mockDeps);
      ui.initialize();

      expect(() => {
        globalEventBus.emit(Events.GAME_STARTED, {});
      }).not.toThrow();
    });
  });
});

describe('initializeGameUI', () => {
  beforeEach(() => {
    resetGameUI();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    resetGameUI();
  });

  test('returns a GameUI instance', () => {
    const deps = {passQuestion: jest.fn()};
    const ui = initializeGameUI(deps);
    expect(ui).toBeInstanceOf(GameUI);
  });

  test('returns existing instance if already initialized', () => {
    const deps1 = {passQuestion: jest.fn()};
    const deps2 = {passQuestion: jest.fn()};

    const ui1 = initializeGameUI(deps1);
    const ui2 = initializeGameUI(deps2);

    expect(ui1).toBe(ui2);
  });
});
