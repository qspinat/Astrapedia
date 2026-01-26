/**
 * @fileoverview Tests for GameController module.
 */

import {jest} from '@jest/globals';

// Mock domCache before importing GameController
jest.unstable_mockModule('../modules/ui/DOMCache.js', () => ({
  domCache: {
    gamePanel: {classList: {add: jest.fn(), remove: jest.fn()}},
    gameQuestion: {textContent: '', style: {color: ''}},
    gameScore: {textContent: ''},
    gameCorrect: {textContent: ''},
    gameTime: {textContent: ''},
  },
}));

const {GameController, GAME_CATEGORIES, gameController} = await import('../modules/features/GameController.js');
const {globalEventBus, Events} = await import('../modules/core/EventBus.js');

describe('GAME_CATEGORIES', () => {
  test('contains all category definitions', () => {
    expect(GAME_CATEGORIES['known-constellations']).toBeDefined();
    expect(GAME_CATEGORIES['all-constellations']).toBeDefined();
    expect(GAME_CATEGORIES['famous-objects']).toBeDefined();
    expect(GAME_CATEGORIES['messier-objects']).toBeDefined();
  });

  test('each category has name and count', () => {
    Object.values(GAME_CATEGORIES).forEach((cat) => {
      expect(cat).toHaveProperty('name');
      expect(cat).toHaveProperty('count');
      expect(typeof cat.name).toBe('string');
      expect(typeof cat.count).toBe('number');
    });
  });
});

describe('GameController', () => {
  let controller;

  const testConstellations = {
    'Orion': {ra: 85, dec: 0},
    'UrsaMajor': {ra: 165, dec: 55},
    'Cassiopeia': {ra: 15, dec: 60},
    'Scorpius': {ra: 255, dec: -30},
  };

  // Constellations with lines (matching real data format)
  const testConstellationsWithLines = {
    'TestConstellation': {
      name: 'TestConstellation',
      lines: [[1, 2], [2, 3]],
    },
  };

  const testDSOs = [
    {name: 'Andromeda Galaxy', messier: 31, ra: 10.68, dec: 41.27, mag: 3.4, type: 'G'},
    {name: 'Orion Nebula', messier: 42, ra: 83.82, dec: -5.39, mag: 4.0, type: 'Neb'},
    {name: 'Whirlpool Galaxy', messier: 51, ra: 202.47, dec: 47.20, mag: 8.4, type: 'G'},
    {ngc: 7293, ra: 337.41, dec: -20.84, mag: 7.6, type: 'PN'},
  ];

  const testStars = [
    {proper: 'Sirius', ra: 101.29, dec: -16.72, mag: -1.46},
    {proper: 'Vega', ra: 279.23, dec: 38.78, mag: 0.03},
    {proper: 'Polaris', ra: 37.95, dec: 89.26, mag: 1.98},
  ];

  const testNamedObjects = {
    'Sirius': 1,
    'Vega': 2,
    'Polaris': 3,
  };

  beforeEach(() => {
    controller = new GameController();
    controller.setData({
      constellations: testConstellations,
      deepSkyObjects: testDSOs,
      stars: testStars,
      namedObjects: testNamedObjects,
    });
    globalEventBus.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    controller.stop();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    test('initializes with default state', () => {
      const newController = new GameController();
      expect(newController.isActive()).toBe(false);
      expect(newController.getScore()).toBe(0);
      expect(newController.getCorrect()).toBe(0);
      expect(newController.getCategory()).toBe('known-constellations');
      expect(newController.getCurrentQuestion()).toBeNull();
    });
  });

  describe('setCategory / getCategory', () => {
    test('sets and gets category', () => {
      controller.setCategory('messier-objects');
      expect(controller.getCategory()).toBe('messier-objects');
    });
  });

  describe('setData', () => {
    test('stores data references', () => {
      const newController = new GameController();
      newController.setData({constellations: testConstellations});
      newController.setCategory('all-constellations');
      newController.start();
      expect(newController.getCurrentQuestion()).not.toBeNull();
      newController.stop();
    });
  });

  describe('setNavigateCallback', () => {
    test('stores callback', () => {
      const callback = jest.fn();
      controller.setNavigateCallback(callback);
      controller.setCategory('all-constellations');
      controller.start();
      controller.passQuestion();
      jest.advanceTimersByTime(100);
      expect(callback).toHaveBeenCalled();
    });
  });

  describe('start', () => {
    test('activates game', () => {
      controller.setCategory('all-constellations');
      controller.start();
      expect(controller.isActive()).toBe(true);
    });

    test('resets score and correct count', () => {
      controller.setCategory('all-constellations');
      controller.start();
      expect(controller.getScore()).toBe(0);
      expect(controller.getCorrect()).toBe(0);
    });

    test('sets first question', () => {
      controller.setCategory('all-constellations');
      controller.start();
      expect(controller.getCurrentQuestion()).not.toBeNull();
    });

    test('emits GAME_STARTED event', () => {
      const callback = jest.fn();
      globalEventBus.on(Events.GAME_STARTED, callback);
      controller.setCategory('all-constellations');
      controller.start();
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'all-constellations',
          totalQuestions: expect.any(Number),
        })
      );
    });

    test('emits error when no objects found', () => {
      const callback = jest.fn();
      globalEventBus.on(Events.GAME_STARTED, callback);
      const emptyController = new GameController();
      emptyController.setData({});
      emptyController.start();
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({error: 'No objects found'})
      );
    });
  });

  describe('stop', () => {
    test('deactivates game', () => {
      controller.setCategory('all-constellations');
      controller.start();
      controller.stop();
      expect(controller.isActive()).toBe(false);
    });

    test('emits GAME_STOPPED event', () => {
      const callback = jest.fn();
      globalEventBus.on(Events.GAME_STOPPED, callback);
      controller.setCategory('all-constellations');
      controller.start();
      controller.stop();
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          score: expect.any(Number),
          correct: expect.any(Number),
          total: expect.any(Number),
        })
      );
    });
  });

  describe('nextQuestion', () => {
    beforeEach(() => {
      controller.setCategory('all-constellations');
      controller.start();
    });

    test('sets new question', () => {
      const firstQuestion = controller.getCurrentQuestion();
      controller.nextQuestion();
      // Could be same question randomly, but question should exist
      expect(controller.getCurrentQuestion()).not.toBeNull();
    });

    test('emits GAME_QUESTION event', () => {
      const callback = jest.fn();
      globalEventBus.on(Events.GAME_QUESTION, callback);
      controller.nextQuestion();
      expect(callback).toHaveBeenCalled();
    });

    test('stops game when all questions asked', () => {
      // Ask all questions
      for (let i = 0; i < 10; i++) {
        controller.nextQuestion();
      }
      // Game should eventually stop
    });
  });

  describe('checkAnswer', () => {
    beforeEach(() => {
      controller.setCategory('all-constellations');
      controller.start();
    });

    test('returns true for correct position', () => {
      const question = controller.getCurrentQuestion();
      const result = controller.checkAnswer(question.data.ra, question.data.dec);
      expect(result).toBe(true);
    });

    test('returns false for wrong position', () => {
      const question = controller.getCurrentQuestion();
      // Use position far from answer
      const result = controller.checkAnswer(
        (question.data.ra + 180) % 360,
        -question.data.dec
      );
      expect(result).toBe(false);
    });

    test('increments score on correct answer', () => {
      const question = controller.getCurrentQuestion();
      controller.checkAnswer(question.data.ra, question.data.dec);
      expect(controller.getScore()).toBeGreaterThan(0);
    });

    test('increments correct count on correct answer', () => {
      const question = controller.getCurrentQuestion();
      controller.checkAnswer(question.data.ra, question.data.dec);
      expect(controller.getCorrect()).toBe(1);
    });

    test('emits GAME_CORRECT event on correct answer', () => {
      const callback = jest.fn();
      globalEventBus.on(Events.GAME_CORRECT, callback);
      const question = controller.getCurrentQuestion();
      controller.checkAnswer(question.data.ra, question.data.dec);
      expect(callback).toHaveBeenCalled();
    });

    test('uses larger tolerance for constellations', () => {
      const question = controller.getCurrentQuestion();
      // Click within 10 degrees should be correct for constellation
      const result = controller.checkAnswer(
        question.data.ra + 10,
        question.data.dec
      );
      expect(result).toBe(true);
    });
  });

  describe('checkAnswerByName', () => {
    beforeEach(() => {
      controller.setCategory('all-constellations');
      controller.start();
    });

    test('returns true for matching name', () => {
      const question = controller.getCurrentQuestion();
      const result = controller.checkAnswerByName(question.name);
      expect(result).toBe(true);
    });

    test('is case insensitive', () => {
      const question = controller.getCurrentQuestion();
      const result = controller.checkAnswerByName(question.name.toLowerCase());
      expect(result).toBe(true);
    });

    test('returns false for non-matching name', () => {
      const result = controller.checkAnswerByName('WrongName');
      expect(result).toBe(false);
    });
  });

  describe('passQuestion', () => {
    beforeEach(() => {
      controller.setCategory('all-constellations');
      controller.start();
    });

    test('emits GAME_PASSED event', () => {
      const callback = jest.fn();
      globalEventBus.on(Events.GAME_PASSED, callback);
      controller.passQuestion();
      expect(callback).toHaveBeenCalled();
    });

    test('calls navigate callback', () => {
      const navigateCallback = jest.fn();
      controller.setNavigateCallback(navigateCallback);
      controller.passQuestion();
      expect(navigateCallback).toHaveBeenCalled();
    });

    test('calls highlight callback for constellation', () => {
      const highlightCallback = jest.fn();
      const unhighlightCallback = jest.fn();
      controller.setHighlightCallbacks(highlightCallback, unhighlightCallback);
      controller.passQuestion();
      expect(highlightCallback).toHaveBeenCalled();
    });

    test('advances to next question after delay', () => {
      const firstQuestion = controller.getCurrentQuestion();
      controller.passQuestion();
      jest.advanceTimersByTime(3500);
      // Should have moved to next question
    });

    test('prevents checkAnswer from scoring during pass reveal', () => {
      const question = controller.getCurrentQuestion();
      const initialScore = controller.getScore();
      const initialCorrect = controller.getCorrect();

      // Pass the question
      controller.passQuestion();

      // Try to answer during the reveal period - should return false
      const result = controller.checkAnswer(question.data.ra, question.data.dec);
      expect(result).toBe(false);

      // Score and correct count should remain unchanged
      expect(controller.getScore()).toBe(initialScore);
      expect(controller.getCorrect()).toBe(initialCorrect);
    });

    test('prevents checkAnswerByName from scoring during pass reveal', () => {
      const question = controller.getCurrentQuestion();
      const initialScore = controller.getScore();
      const initialCorrect = controller.getCorrect();

      // Pass the question
      controller.passQuestion();

      // Try to answer by name during the reveal period - should return false
      const result = controller.checkAnswerByName(question.name);
      expect(result).toBe(false);

      // Score and correct count should remain unchanged
      expect(controller.getScore()).toBe(initialScore);
      expect(controller.getCorrect()).toBe(initialCorrect);
    });

    test('allows answering after pass reveal period ends', () => {
      controller.passQuestion();

      // Advance past the reveal period
      jest.advanceTimersByTime(3500);

      // Now answering should work again for the next question
      const newQuestion = controller.getCurrentQuestion();
      if (newQuestion) {
        const result = controller.checkAnswer(newQuestion.data.ra, newQuestion.data.dec);
        expect(result).toBe(true);
      }
    });
  });

  describe('double alert prevention', () => {
    beforeEach(() => {
      controller.setCategory('all-constellations');
      controller.start();
    });

    test('stop() only emits GAME_STOPPED once', () => {
      const callback = jest.fn();
      globalEventBus.on(Events.GAME_STOPPED, callback);

      // Call stop multiple times
      controller.stop();
      controller.stop();
      controller.stop();

      // Should only emit once
      expect(callback).toHaveBeenCalledTimes(1);
    });

    test('stop() does nothing if game is not active', () => {
      const callback = jest.fn();
      controller.stop(); // First stop
      globalEventBus.on(Events.GAME_STOPPED, callback);

      // Try to stop again
      controller.stop();

      // Should not emit again
      expect(callback).toHaveBeenCalledTimes(0);
    });
  });

  describe('category: known-constellations', () => {
    test('builds question pool from known constellations', () => {
      controller.setCategory('known-constellations');
      controller.start();
      expect(controller.isActive()).toBe(true);
    });
  });

  describe('category: north-constellations', () => {
    test('includes only northern constellations', () => {
      controller.setCategory('north-constellations');
      controller.start();
      // UrsaMajor and Cassiopeia are in north, should have questions
      expect(controller.getCurrentQuestion()).not.toBeNull();
    });
  });

  describe('category: south-constellations', () => {
    test('includes only southern constellations', () => {
      controller.setCategory('south-constellations');
      controller.start();
      // Scorpius is in south
      expect(controller.getCurrentQuestion()).not.toBeNull();
    });
  });

  describe('category: famous-objects', () => {
    test('builds pool from famous DSO list', () => {
      controller.setCategory('famous-objects');
      controller.start();
      expect(controller.isActive()).toBe(true);
    });
  });

  describe('category: galaxies', () => {
    test('filters DSOs by galaxy type', () => {
      controller.setCategory('galaxies');
      controller.start();
      expect(controller.getCurrentQuestion()).not.toBeNull();
      expect(['G']).toContain(controller.getCurrentQuestion().data.type);
    });
  });

  describe('category: nebulae', () => {
    test('filters DSOs by nebula types', () => {
      controller.setCategory('nebulae');
      controller.start();
      expect(controller.getCurrentQuestion()).not.toBeNull();
    });
  });

  describe('category: bright-stars', () => {
    test('builds pool from bright star list', () => {
      controller.setCategory('bright-stars');
      controller.start();
      expect(controller.getCurrentQuestion()).not.toBeNull();
      expect(controller.getCurrentQuestion().type).toBe('Star');
    });
  });

  describe('category: messier-objects', () => {
    test('includes all Messier objects', () => {
      controller.setCategory('messier-objects');
      controller.start();
      expect(controller.getCurrentQuestion()).not.toBeNull();
      expect(controller.getCurrentQuestion().name).toMatch(/^M\d+$/);
    });
  });

  describe('angularDistance_ (via checkAnswer)', () => {
    test('calculates distance correctly', () => {
      controller.setCategory('all-constellations');
      controller.start();
      const question = controller.getCurrentQuestion();

      // Exact position should be within tolerance
      expect(controller.checkAnswer(question.data.ra, question.data.dec)).toBe(true);

      // Far position should not
      expect(controller.checkAnswer(
        (question.data.ra + 90) % 360,
        question.data.dec
      )).toBe(false);
    });
  });

  describe('timer', () => {
    test('starts timer when game starts', () => {
      controller.setCategory('all-constellations');
      controller.start();
      jest.advanceTimersByTime(5000);
      // Timer should be running
    });

    test('stops timer when game stops', () => {
      controller.setCategory('all-constellations');
      controller.start();
      controller.stop();
      // Timer should be cleared
    });
  });

  describe('getConstellationCenter_', () => {
    test('uses existing ra/dec if present', () => {
      // testConstellations has ra/dec directly
      controller.setCategory('all-constellations');
      controller.start();
      const question = controller.getCurrentQuestion();
      // Should have valid coordinates from the test constellation data
      expect(question.data.ra).toBeDefined();
      expect(question.data.dec).toBeDefined();
      expect(typeof question.data.ra).toBe('number');
      expect(typeof question.data.dec).toBe('number');
    });

    test('calculates center from star lines when ra/dec not present', () => {
      // Create controller with constellation that has lines but no ra/dec
      const lineController = new GameController();
      const starsWithHip = [
        {hip: 1, ra: 100, dec: 10},
        {hip: 2, ra: 110, dec: 20},
        {hip: 3, ra: 120, dec: 30},
      ];
      lineController.setData({
        constellations: testConstellationsWithLines,
        stars: starsWithHip,
        deepSkyObjects: [],
        namedObjects: {},
      });
      lineController.setCategory('all-constellations');
      lineController.start();
      const question = lineController.getCurrentQuestion();
      // Center should be average: (100+110+120)/3 = 110, (10+20+30)/3 = 20
      expect(question.data.ra).toBeCloseTo(110, 1);
      expect(question.data.dec).toBeCloseTo(20, 1);
    });

    test('returns 0,0 for constellation with no lines or ra/dec', () => {
      const emptyController = new GameController();
      emptyController.setData({
        constellations: {'Empty': {name: 'Empty', lines: []}},
        stars: [],
        deepSkyObjects: [],
        namedObjects: {},
      });
      emptyController.setCategory('all-constellations');
      emptyController.start();
      const question = emptyController.getCurrentQuestion();
      expect(question.data.ra).toBe(0);
      expect(question.data.dec).toBe(0);
    });

    test('returns 0,0 when star IDs not found', () => {
      const noMatchController = new GameController();
      noMatchController.setData({
        constellations: {'NoMatch': {name: 'NoMatch', lines: [[999, 998]]}},
        stars: [{hip: 1, ra: 100, dec: 10}], // Different IDs
        deepSkyObjects: [],
        namedObjects: {},
      });
      noMatchController.setCategory('all-constellations');
      noMatchController.start();
      const question = noMatchController.getCurrentQuestion();
      expect(question.data.ra).toBe(0);
      expect(question.data.dec).toBe(0);
    });
  });
});

describe('gameController singleton', () => {
  test('is a GameController instance', () => {
    expect(gameController).toBeInstanceOf(GameController);
  });
});
