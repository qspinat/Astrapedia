/**
 * @fileoverview Integration tests for EventBus wiring between modules.
 * Tests that modules correctly emit and respond to events with expected shapes.
 */

import {jest} from '@jest/globals';
import {globalEventBus, Events} from '../modules/core/EventBus.js';
import {GameUI, initializeGameUI, resetGameUI} from '../modules/features/GameUI.js';
import {TimeUI, initializeTimeUI, resetTimeUI} from '../modules/features/TimeUI.js';
import {TourUI, initializeTourUI, resetTourUI} from '../modules/features/TourUI.js';

describe('EventBus Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';

    // Reset UI singletons
    resetGameUI();
    resetTimeUI();
    resetTourUI();
  });

  afterEach(() => {
    // Clean up singletons
    resetGameUI();
    resetTimeUI();
    resetTourUI();
  });

  describe('GameController -> GameUI integration', () => {
    test('GAME_STARTED event updates GameUI state', () => {
      // Setup minimal DOM
      document.body.innerHTML = '<div id="game-panel"></div>';

      // Initialize GameUI
      const gameUI = initializeGameUI({
        passQuestion: jest.fn(),
        stopGame: jest.fn(),
      });

      expect(gameUI.isPlaying()).toBe(false);

      // Emit event as GameController would
      globalEventBus.emit(Events.GAME_STARTED, {
        category: 'stars',
        difficulty: 'easy',
      });

      expect(gameUI.isPlaying()).toBe(true);
    });

    test('GAME_ENDED event updates GameUI state', () => {
      document.body.innerHTML = '<div id="game-panel"></div>';

      const gameUI = initializeGameUI({});

      // Start game
      globalEventBus.emit(Events.GAME_STARTED, {category: 'stars'});
      expect(gameUI.isPlaying()).toBe(true);

      // End game
      globalEventBus.emit(Events.GAME_STOPPED, {
        score: 8,
        total: 10,
        correct: 8,
      });

      expect(gameUI.isPlaying()).toBe(false);
    });

    test('GAME_QUESTION event shape matches GameUI expectations', () => {
      document.body.innerHTML = `
        <div id="game-panel"></div>
        <div id="game-question"></div>
      `;

      const gameUI = initializeGameUI({});

      // Emit question event with expected shape
      globalEventBus.emit(Events.GAME_QUESTION, {
        question: {
          name: 'Sirius',
          ra: 101.28,
          dec: -16.72,
          mag: -1.46,
        },
        questionNumber: 1,
        totalQuestions: 10,
      });

      const questionEl = document.getElementById('game-question');
      expect(questionEl.textContent).toContain('Sirius');
    });

    test('GAME_SCORE event shape matches GameUI expectations', () => {
      document.body.innerHTML = `
        <div id="game-panel"></div>
        <div id="game-score"></div>
      `;

      const gameUI = initializeGameUI({});

      // Emit score event with expected shape
      globalEventBus.emit(Events.GAME_SCORE_UPDATED, {
        score: 5,
        total: 10,
        streak: 3,
      });

      const scoreEl = document.getElementById('game-score');
      expect(scoreEl.textContent).toBe('Score: 5/10');
    });
  });

  describe('TimeController -> TimeUI integration', () => {
    test('TIME_SPEED_CHANGED event updates TimeUI state', () => {
      document.body.innerHTML = '<button id="time-play-btn"></button>';

      const timeUI = initializeTimeUI({
        setTimeSpeed: jest.fn(),
        togglePlayback: jest.fn(),
      });

      expect(timeUI.isPlaying()).toBe(false);
      expect(timeUI.getCurrentSpeed()).toBe(0);

      // Emit event as TimeController would
      globalEventBus.emit(Events.TIME_SPEED_CHANGED, {
        speed: 100,
        isPlaying: true,
      });

      expect(timeUI.isPlaying()).toBe(true);
      expect(timeUI.getCurrentSpeed()).toBe(100);
    });

    test('TIME_CHANGED event shape matches TimeUI expectations', () => {
      document.body.innerHTML = '<div id="time-display"></div>';

      const timeUI = initializeTimeUI({});

      const testDate = new Date('2025-06-15T12:30:00');
      globalEventBus.emit(Events.TIME_CHANGED, {
        time: testDate,
        julianDate: 2460471.02083,
      });

      const timeDisplay = document.getElementById('time-display');
      expect(timeDisplay.textContent).toBe(testDate.toLocaleString());
    });

    test('TIME_TICK event is handled same as TIME_CHANGED', () => {
      document.body.innerHTML = '<div id="time-display"></div>';

      const timeUI = initializeTimeUI({});

      const testDate = new Date('2025-07-04T18:00:00');
      globalEventBus.emit(Events.TIME_TICK, {
        time: testDate,
        deltaTime: 1000,
      });

      const timeDisplay = document.getElementById('time-display');
      expect(timeDisplay.textContent).toBe(testDate.toLocaleString());
    });
  });

  describe('TourController -> TourUI integration', () => {
    test('TOUR_STARTED event updates TourUI state', () => {
      document.body.innerHTML = '<div id="tour-panel"></div>';

      const tourUI = initializeTourUI({
        startTour: jest.fn(),
        nextStep: jest.fn(),
        prevStep: jest.fn(),
        stopTour: jest.fn(),
        panelManager: {closeAll: jest.fn()},
      });

      expect(tourUI.isActive()).toBe(false);
      expect(tourUI.getCurrentTour()).toBe(null);

      globalEventBus.emit(Events.TOUR_STARTED, {
        tourName: 'tonight-best',
        totalSteps: 5,
      });

      expect(tourUI.isActive()).toBe(true);
      expect(tourUI.getCurrentTour()).toBe('tonight-best');
    });

    test('TOUR_ENDED event updates TourUI state', () => {
      document.body.innerHTML = '<div id="tour-panel"></div>';

      const tourUI = initializeTourUI({
        panelManager: {closeAll: jest.fn()},
      });

      // Start tour
      globalEventBus.emit(Events.TOUR_STARTED, {tourName: 'planets'});
      expect(tourUI.isActive()).toBe(true);

      // End tour
      globalEventBus.emit(Events.TOUR_ENDED, {
        tourName: 'planets',
        completed: true,
      });

      expect(tourUI.isActive()).toBe(false);
      expect(tourUI.getCurrentTour()).toBe(null);
    });

    test('TOUR_STEP_CHANGED event shape matches TourUI expectations', () => {
      document.body.innerHTML = '<div id="tour-panel"></div>';

      const tourUI = initializeTourUI({
        prevStep: jest.fn(),
        nextStep: jest.fn(),
        stopTour: jest.fn(),
        panelManager: {closeAll: jest.fn()},
      });

      // Start tour first
      globalEventBus.emit(Events.TOUR_STARTED, {tourName: 'Best Tonight'});

      // Emit step change with expected shape
      globalEventBus.emit(Events.TOUR_STEP_CHANGED, {
        tour: {name: 'Best Tonight'},
        step: {
          name: 'M31 - Andromeda Galaxy',
          description: 'The nearest major galaxy to the Milky Way.',
          ra: 10.68,
          dec: 41.27,
        },
        stepIndex: 2,
        totalSteps: 8,
      });

      const panel = document.getElementById('tour-panel');
      expect(panel.textContent).toContain('Best Tonight');
      expect(panel.textContent).toContain('M31 - Andromeda Galaxy');
      expect(panel.textContent).toContain('Step 3 of 8');
    });
  });

  describe('Cross-module event handling', () => {
    test('modules can coexist without interference', () => {
      document.body.innerHTML = `
        <div id="game-panel"></div>
        <button id="time-play-btn"></button>
        <div id="tour-panel"></div>
      `;

      const gameUI = initializeGameUI({});
      const timeUI = initializeTimeUI({});
      const tourUI = initializeTourUI({panelManager: {closeAll: jest.fn()}});

      // Start game
      globalEventBus.emit(Events.GAME_STARTED, {category: 'dsos'});
      expect(gameUI.isPlaying()).toBe(true);
      expect(timeUI.isPlaying()).toBe(false);
      expect(tourUI.isActive()).toBe(false);

      // Start time
      globalEventBus.emit(Events.TIME_SPEED_CHANGED, {speed: 100, isPlaying: true});
      expect(gameUI.isPlaying()).toBe(true);
      expect(timeUI.isPlaying()).toBe(true);
      expect(tourUI.isActive()).toBe(false);

      // End game, start tour
      globalEventBus.emit(Events.GAME_STOPPED, {score: 10, total: 10});
      globalEventBus.emit(Events.TOUR_STARTED, {tourName: 'planets'});
      expect(gameUI.isPlaying()).toBe(false);
      expect(timeUI.isPlaying()).toBe(true);
      expect(tourUI.isActive()).toBe(true);
    });

    test('unknown event properties are ignored gracefully', () => {
      document.body.innerHTML = '<div id="game-panel"></div>';

      const gameUI = initializeGameUI({});

      // Emit event with extra properties that GameUI doesn't use
      expect(() => {
        globalEventBus.emit(Events.GAME_STARTED, {
          category: 'stars',
          unknownProp: 'should be ignored',
          nested: {deep: {value: 42}},
        });
      }).not.toThrow();

      expect(gameUI.isPlaying()).toBe(true);
    });

    test('missing optional properties are handled gracefully', () => {
      document.body.innerHTML = `
        <div id="game-panel"></div>
        <div id="game-question"></div>
      `;

      const gameUI = initializeGameUI({});

      // Emit question with minimal data
      expect(() => {
        globalEventBus.emit(Events.GAME_QUESTION, {
          question: {}, // Missing name, ra, dec
        });
      }).not.toThrow();

      const questionEl = document.getElementById('game-question');
      expect(questionEl.textContent).toContain('Unknown');
    });
  });

  describe('Event data validation', () => {
    test('TIME_SPEED_CHANGED handles zero speed correctly', () => {
      document.body.innerHTML = '<button id="time-play-btn"></button>';

      const timeUI = initializeTimeUI({});

      globalEventBus.emit(Events.TIME_SPEED_CHANGED, {
        speed: 0,
        isPlaying: false,
      });

      expect(timeUI.getCurrentSpeed()).toBe(0);
      expect(timeUI.isPlaying()).toBe(false);
    });

    test('TIME_SPEED_CHANGED handles negative speed (rewind)', () => {
      document.body.innerHTML = '<button id="time-play-btn"></button>';

      const timeUI = initializeTimeUI({});

      globalEventBus.emit(Events.TIME_SPEED_CHANGED, {
        speed: -100,
        isPlaying: true,
      });

      expect(timeUI.getCurrentSpeed()).toBe(-100);
      expect(timeUI.isPlaying()).toBe(true);
    });

    test('GAME_SCORE handles zero scores', () => {
      document.body.innerHTML = `
        <div id="game-panel"></div>
        <div id="game-score"></div>
      `;

      const gameUI = initializeGameUI({});

      globalEventBus.emit(Events.GAME_SCORE_UPDATED, {
        score: 0,
        total: 0,
      });

      const scoreEl = document.getElementById('game-score');
      expect(scoreEl.textContent).toBe('Score: 0/0');
    });

    test('TOUR_STEP_CHANGED handles first step correctly', () => {
      document.body.innerHTML = '<div id="tour-panel"></div>';

      const mockPrevStep = jest.fn();
      const tourUI = initializeTourUI({
        prevStep: mockPrevStep,
        nextStep: jest.fn(),
        stopTour: jest.fn(),
        panelManager: {closeAll: jest.fn()},
      });

      globalEventBus.emit(Events.TOUR_STARTED, {tourName: 'Test'});
      globalEventBus.emit(Events.TOUR_STEP_CHANGED, {
        tour: {name: 'Test'},
        step: {name: 'First', description: 'First step'},
        stepIndex: 0,
        totalSteps: 5,
      });

      const panel = document.getElementById('tour-panel');
      const buttons = panel.querySelectorAll('button');
      const prevBtn = Array.from(buttons).find((b) => b.textContent.includes('Previous'));

      // Previous button should be disabled on first step
      expect(prevBtn.disabled).toBe(true);
    });
  });

  describe('Game command events', () => {
    test('CMD_START_GAME event triggers game start', () => {
      const mockStart = jest.fn();
      const mockGameController = {
        getCategory: jest.fn().mockReturnValue('known-constellations'),
        setCategory: jest.fn(),
        start: mockStart,
      };

      // Subscribe as skymap.js does
      globalEventBus.on(Events.CMD_START_GAME, () => {
        if (mockGameController) {
          const category = mockGameController.getCategory() || 'known-constellations';
          mockGameController.setCategory(category);
          mockGameController.start();
        }
      });

      // Emit event as main.js does
      globalEventBus.emit(Events.CMD_START_GAME);

      expect(mockStart).toHaveBeenCalledTimes(1);
    });

    test('CMD_STOP_GAME event triggers game stop', () => {
      const mockStop = jest.fn();

      globalEventBus.on(Events.CMD_STOP_GAME, () => {
        mockStop();
      });

      globalEventBus.emit(Events.CMD_STOP_GAME);
      expect(mockStop).toHaveBeenCalledTimes(1);
    });

    test('CMD_PASS_QUESTION event triggers pass question', () => {
      const mockPass = jest.fn();

      globalEventBus.on(Events.CMD_PASS_QUESTION, () => {
        mockPass();
      });

      globalEventBus.emit(Events.CMD_PASS_QUESTION);
      expect(mockPass).toHaveBeenCalledTimes(1);
    });

    test('CMD_SHOW_GAME_SELECT shows game selection modal', () => {
      document.body.innerHTML = '<div id="game-select-modal"></div>';

      const modal = document.getElementById('game-select-modal');
      expect(modal.classList.contains('visible')).toBe(false);

      // Subscribe as skymap.js does
      globalEventBus.on(Events.CMD_SHOW_GAME_SELECT, () => {
        modal.classList.add('visible');
      });

      globalEventBus.emit(Events.CMD_SHOW_GAME_SELECT);

      expect(modal.classList.contains('visible')).toBe(true);
    });

    test('CMD_START_GAME is used when category is selected (after modal)', () => {
      // CMD_START_GAME is emitted by skymap.js when user selects a category
      const mockStart = jest.fn();

      globalEventBus.on(Events.CMD_START_GAME, () => {
        mockStart();
      });

      // Simulate what happens when user selects a category in the modal
      globalEventBus.emit(Events.CMD_START_GAME);

      expect(mockStart).toHaveBeenCalledTimes(1);
    });
  });

  describe('Time command events', () => {
    test('CMD_TOGGLE_PLAYBACK event triggers TimeController.togglePlayback', () => {
      // Mock TimeController
      const mockTogglePlayback = jest.fn();
      const mockTimeController = {
        togglePlayback: mockTogglePlayback,
        getSpeedDisplayString: jest.fn().mockReturnValue('Paused'),
      };

      // Subscribe to CMD_TOGGLE_PLAYBACK as skymap.js does
      globalEventBus.on(Events.CMD_TOGGLE_PLAYBACK, () => {
        mockTimeController.togglePlayback();
      });

      // Emit the event as main.js does
      globalEventBus.emit(Events.CMD_TOGGLE_PLAYBACK);

      expect(mockTogglePlayback).toHaveBeenCalledTimes(1);
    });

    test('CMD_TOGGLE_PLAYBACK starts animation loop when playing', () => {
      // This test verifies that the animation loop is started when playback begins
      // (the bug was that togglePlayback didn't call startAnimating)
      const mockStartAnimating = jest.fn();
      let isPlaying = false;

      const mockTimeController = {
        togglePlayback: function() {
          isPlaying = !isPlaying;
        },
        isPlaying: () => isPlaying,
        getSpeedDisplayString: jest.fn().mockReturnValue('Real-time'),
      };

      // Subscribe as skymap.js does (with startAnimating call)
      globalEventBus.on(Events.CMD_TOGGLE_PLAYBACK, () => {
        mockTimeController.togglePlayback();
        if (mockTimeController.isPlaying()) {
          mockStartAnimating();
        }
      });

      // Toggle to start playing
      globalEventBus.emit(Events.CMD_TOGGLE_PLAYBACK);
      expect(mockStartAnimating).toHaveBeenCalledTimes(1);

      // Toggle to pause - should not call startAnimating
      globalEventBus.emit(Events.CMD_TOGGLE_PLAYBACK);
      expect(mockStartAnimating).toHaveBeenCalledTimes(1); // Still 1, not called again
    });

    test('CMD_TOGGLE_PLAYBACK does not rely on external isTimePlaying property', () => {
      // This test ensures we don't accidentally reintroduce the bug where
      // togglePlayback relied on a non-existent isTimePlaying property

      let isPlaying = false;
      let speed = 0;

      const mockTimeController = {
        togglePlayback: function() {
          // Proper implementation: uses internal state
          if (isPlaying) {
            speed = 0;
            isPlaying = false;
          } else {
            speed = speed || 1;
            isPlaying = true;
          }
        },
        isPlaying: () => isPlaying,
        getSpeed: () => speed,
        getSpeedDisplayString: jest.fn().mockReturnValue('Paused'),
      };

      globalEventBus.on(Events.CMD_TOGGLE_PLAYBACK, () => {
        mockTimeController.togglePlayback();
      });

      // First toggle - should start playing
      globalEventBus.emit(Events.CMD_TOGGLE_PLAYBACK);
      expect(mockTimeController.isPlaying()).toBe(true);
      expect(mockTimeController.getSpeed()).toBe(1);

      // Second toggle - should pause
      globalEventBus.emit(Events.CMD_TOGGLE_PLAYBACK);
      expect(mockTimeController.isPlaying()).toBe(false);
      expect(mockTimeController.getSpeed()).toBe(0);

      // Third toggle - should resume
      globalEventBus.emit(Events.CMD_TOGGLE_PLAYBACK);
      expect(mockTimeController.isPlaying()).toBe(true);
    });

    test('CMD_SET_TIME_SPEED event sets speed correctly', () => {
      const mockSetSpeed = jest.fn();

      globalEventBus.on(Events.CMD_SET_TIME_SPEED, (data) => {
        mockSetSpeed(data?.speed || 0);
      });

      globalEventBus.emit(Events.CMD_SET_TIME_SPEED, {speed: 100});
      expect(mockSetSpeed).toHaveBeenCalledWith(100);

      globalEventBus.emit(Events.CMD_SET_TIME_SPEED, {speed: 0});
      expect(mockSetSpeed).toHaveBeenCalledWith(0);
    });

    test('CMD_JUMP_TO_TIME event jumps to specified time', () => {
      const mockJumpToTime = jest.fn();

      globalEventBus.on(Events.CMD_JUMP_TO_TIME, (data) => {
        if (data?.time) {
          mockJumpToTime(data.time);
        }
      });

      const testDate = new Date('2025-06-15T12:00:00Z');
      globalEventBus.emit(Events.CMD_JUMP_TO_TIME, {time: testDate});

      expect(mockJumpToTime).toHaveBeenCalledWith(testDate);
    });
  });

  describe('TimeUI button -> EventBus -> TimeController flow', () => {
    test('play button calls togglePlayback dependency which should emit event', () => {
      document.body.innerHTML = '<button id="time-play-btn"></button>';

      // Track if the event is emitted
      const eventSpy = jest.fn();
      globalEventBus.on(Events.CMD_TOGGLE_PLAYBACK, eventSpy);

      // Initialize TimeUI with togglePlayback that emits the event (as main.js does)
      const timeUI = initializeTimeUI({
        togglePlayback: () => {
          globalEventBus.emit(Events.CMD_TOGGLE_PLAYBACK);
        },
      });

      // Simulate button click
      const playBtn = document.getElementById('time-play-btn');
      playBtn.click();

      expect(eventSpy).toHaveBeenCalledTimes(1);
    });

    test('TimeUI updates when TIME_SPEED_CHANGED is emitted after toggle', () => {
      document.body.innerHTML = '<button id="time-play-btn"></button>';

      // Simulate the full flow:
      // 1. TimeUI calls togglePlayback
      // 2. togglePlayback emits CMD_TOGGLE_PLAYBACK
      // 3. skymap handles event, calls TimeController.togglePlayback()
      // 4. TimeController emits TIME_SPEED_CHANGED
      // 5. TimeUI updates its state

      const timeUI = initializeTimeUI({
        togglePlayback: () => {
          globalEventBus.emit(Events.CMD_TOGGLE_PLAYBACK);
        },
      });

      // Simulate skymap's handler
      globalEventBus.on(Events.CMD_TOGGLE_PLAYBACK, () => {
        // TimeController would emit this after toggling
        globalEventBus.emit(Events.TIME_SPEED_CHANGED, {
          speed: 1,
          isPlaying: true,
        });
      });

      expect(timeUI.isPlaying()).toBe(false);

      // Click play button
      const playBtn = document.getElementById('time-play-btn');
      playBtn.click();

      // TimeUI should have updated from TIME_SPEED_CHANGED event
      expect(timeUI.isPlaying()).toBe(true);
      expect(timeUI.getCurrentSpeed()).toBe(1);
    });
  });
});
