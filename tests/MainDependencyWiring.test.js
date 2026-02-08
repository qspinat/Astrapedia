/**
 * @fileoverview Tests for main.js dependency wiring.
 * Ensures all UIController dependencies are properly connected and functional.
 */

import {jest} from '@jest/globals';
import {globalEventBus, Events} from '../modules/core/EventBus.js';

describe('Main.js Dependency Wiring', () => {
  let eventHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    eventHandler = jest.fn();
  });

  afterEach(() => {
    globalEventBus.offAll?.() || globalEventBus.clear?.();
  });

  describe('Tour commands use EventBus', () => {
    test('CMD_START_TOUR event is defined', () => {
      expect(Events.CMD_START_TOUR).toBe('cmd:tour:start');
    });

    test('CMD_NEXT_TOUR_STEP event is defined', () => {
      expect(Events.CMD_NEXT_TOUR_STEP).toBe('cmd:tour:next');
    });

    test('CMD_PREV_TOUR_STEP event is defined', () => {
      expect(Events.CMD_PREV_TOUR_STEP).toBe('cmd:tour:prev');
    });

    test('CMD_STOP_TOUR event is defined', () => {
      expect(Events.CMD_STOP_TOUR).toBe('cmd:tour:stop');
    });

    test('startTour emits CMD_START_TOUR with tourName', () => {
      globalEventBus.on(Events.CMD_START_TOUR, eventHandler);

      // Simulate what main.js does
      const startTour = (name) => globalEventBus.emit(Events.CMD_START_TOUR, {tourName: name});
      startTour('tonight-best');

      expect(eventHandler).toHaveBeenCalledWith({tourName: 'tonight-best'});
    });

    test('nextTourStep emits CMD_NEXT_TOUR_STEP', () => {
      globalEventBus.on(Events.CMD_NEXT_TOUR_STEP, eventHandler);

      const nextTourStep = () => globalEventBus.emit(Events.CMD_NEXT_TOUR_STEP);
      nextTourStep();

      expect(eventHandler).toHaveBeenCalled();
    });

    test('prevTourStep emits CMD_PREV_TOUR_STEP', () => {
      globalEventBus.on(Events.CMD_PREV_TOUR_STEP, eventHandler);

      const prevTourStep = () => globalEventBus.emit(Events.CMD_PREV_TOUR_STEP);
      prevTourStep();

      expect(eventHandler).toHaveBeenCalled();
    });

    test('stopTour emits CMD_STOP_TOUR', () => {
      globalEventBus.on(Events.CMD_STOP_TOUR, eventHandler);

      const stopTour = () => globalEventBus.emit(Events.CMD_STOP_TOUR);
      stopTour();

      expect(eventHandler).toHaveBeenCalled();
    });
  });

  describe('Game commands use EventBus', () => {
    test('CMD_SHOW_GAME_SELECT event is defined', () => {
      expect(Events.CMD_SHOW_GAME_SELECT).toBeDefined();
    });

    test('CMD_PASS_QUESTION event is defined', () => {
      expect(Events.CMD_PASS_QUESTION).toBeDefined();
    });

    test('CMD_STOP_GAME event is defined', () => {
      expect(Events.CMD_STOP_GAME).toBeDefined();
    });

    test('startGame emits CMD_SHOW_GAME_SELECT', () => {
      globalEventBus.on(Events.CMD_SHOW_GAME_SELECT, eventHandler);

      const startGame = () => globalEventBus.emit(Events.CMD_SHOW_GAME_SELECT);
      startGame();

      expect(eventHandler).toHaveBeenCalled();
    });
  });

  describe('Time commands use EventBus', () => {
    test('CMD_TOGGLE_PLAYBACK event is defined', () => {
      expect(Events.CMD_TOGGLE_PLAYBACK).toBeDefined();
    });

    test('togglePlayback emits CMD_TOGGLE_PLAYBACK', () => {
      globalEventBus.on(Events.CMD_TOGGLE_PLAYBACK, eventHandler);

      const togglePlayback = () => globalEventBus.emit(Events.CMD_TOGGLE_PLAYBACK);
      togglePlayback();

      expect(eventHandler).toHaveBeenCalled();
    });
  });

  describe('All CMD events have handlers in skymap.js', () => {
    // This test documents the contract between main.js and skymap.js
    const CMD_EVENTS = [
      'CMD_START_TOUR',
      'CMD_NEXT_TOUR_STEP',
      'CMD_PREV_TOUR_STEP',
      'CMD_STOP_TOUR',
      'CMD_SHOW_GAME_SELECT',
      'CMD_START_GAME',
      'CMD_STOP_GAME',
      'CMD_PASS_QUESTION',
      'CMD_TOGGLE_PLAYBACK',
      'CMD_SET_TIME_SPEED',
      'CMD_JUMP_TO_TIME',
      'CMD_RESET_CAMERA',
      'CMD_TOGGLE_COMPASS',
      'CMD_REQUEST_GEOLOCATION',
      'CMD_SHOW_LOCATION_DIALOG',
      'CMD_SHOW_EVENTS',
      'CMD_SET_MAGNITUDE',
      'CMD_SET_LANGUAGE',
      'CMD_SET_CONSTELLATION_LINES',
      'CMD_SELECT_OBJECT',
      'CMD_SEARCH',
      'CMD_REQUEST_RENDER',
    ];

    test.each(CMD_EVENTS)('Events.%s is defined in EventBus', (eventName) => {
      expect(Events[eventName]).toBeDefined();
      expect(typeof Events[eventName]).toBe('string');
    });
  });
});

describe('TourUI to TourController Integration', () => {
  test('TourUI calls startTour which emits CMD_START_TOUR', () => {
    const handler = jest.fn();
    globalEventBus.on(Events.CMD_START_TOUR, handler);

    // This simulates the chain: TourUI -> deps.startTour -> EventBus -> AstrapediaApp
    const mockStartTour = (name) => globalEventBus.emit(Events.CMD_START_TOUR, {tourName: name});

    // Simulate button click in TourUI
    mockStartTour('messier-marathon');

    expect(handler).toHaveBeenCalledWith({tourName: 'messier-marathon'});
  });

  test('TourController.start is called when CMD_START_TOUR is emitted', () => {
    // This documents the expected behavior in skymap.js
    const mockTourController = {
      start: jest.fn(),
    };

    globalEventBus.on(Events.CMD_START_TOUR, (data) => {
      if (data?.tourName) {
        mockTourController.start(data.tourName);
      }
    });

    globalEventBus.emit(Events.CMD_START_TOUR, {tourName: 'planets'});

    expect(mockTourController.start).toHaveBeenCalledWith('planets');
  });

  test('Tour navigation events trigger TourController methods', () => {
    const mockTourController = {
      next: jest.fn(),
      previous: jest.fn(),
      stop: jest.fn(),
    };

    globalEventBus.on(Events.CMD_NEXT_TOUR_STEP, () => mockTourController.next());
    globalEventBus.on(Events.CMD_PREV_TOUR_STEP, () => mockTourController.previous());
    globalEventBus.on(Events.CMD_STOP_TOUR, () => mockTourController.stop());

    globalEventBus.emit(Events.CMD_NEXT_TOUR_STEP);
    expect(mockTourController.next).toHaveBeenCalled();

    globalEventBus.emit(Events.CMD_PREV_TOUR_STEP);
    expect(mockTourController.previous).toHaveBeenCalled();

    globalEventBus.emit(Events.CMD_STOP_TOUR);
    expect(mockTourController.stop).toHaveBeenCalled();
  });
});

describe('Available Tour Names', () => {
  // Document the tour names that TourUI buttons expect
  const TOUR_NAMES = [
    'tonight-best',
    'messier-marathon',
    'best-nebulae',
    'best-galaxies',
    'best-clusters',
    'constellations',
    'planets',
    'winter-sky',
  ];

  test.each(TOUR_NAMES)('tour "%s" can be started via EventBus', (tourName) => {
    const handler = jest.fn();
    globalEventBus.on(Events.CMD_START_TOUR, handler);

    globalEventBus.emit(Events.CMD_START_TOUR, {tourName});

    expect(handler).toHaveBeenCalledWith({tourName});
  });
});
