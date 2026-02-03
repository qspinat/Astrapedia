/**
 * @fileoverview Tests for TourUI module.
 */

import {jest} from '@jest/globals';
import {TourUI, initializeTourUI, resetTourUI} from '../modules/features/TourUI.js';
import {globalEventBus, Events} from '../modules/core/EventBus.js';

describe('TourUI', () => {
  let tourUI;
  let mockDeps;
  let mockPanelManager;

  beforeEach(() => {
    jest.clearAllMocks();
    resetTourUI();

    // Setup mock DOM elements
    document.body.innerHTML = `
      <button id="tour-tonight-btn"></button>
      <button id="tour-messier-btn"></button>
      <button id="tour-nebulae-btn"></button>
      <button id="tour-galaxies-btn"></button>
      <button id="tour-clusters-btn"></button>
      <button id="tour-constellations-btn"></button>
      <button id="tour-planets-btn"></button>
      <button id="tour-winter-btn"></button>
      <button id="tour-next-btn"></button>
      <button id="tour-prev-btn"></button>
      <button id="tour-stop-btn"></button>
      <div id="tour-panel">
        <div id="tour-step"></div>
        <div id="tour-object-name"></div>
      </div>
    `;

    mockPanelManager = {
      closeAll: jest.fn(),
    };

    mockDeps = {
      startTour: jest.fn(),
      nextStep: jest.fn(),
      prevStep: jest.fn(),
      stopTour: jest.fn(),
      panelManager: mockPanelManager,
    };

    tourUI = new TourUI(mockDeps);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    resetTourUI();
  });

  describe('constructor', () => {
    test('creates instance with dependencies', () => {
      expect(tourUI).toBeInstanceOf(TourUI);
    });

    test('initializes state correctly', () => {
      expect(tourUI.isActive()).toBe(false);
      expect(tourUI.getCurrentTour()).toBe(null);
    });
  });

  describe('initialize', () => {
    test('sets up tour buttons', () => {
      tourUI.initialize();

      const tonightBtn = document.getElementById('tour-tonight-btn');
      tonightBtn.click();

      expect(mockDeps.startTour).toHaveBeenCalledWith('tonight-best');
      expect(mockPanelManager.closeAll).toHaveBeenCalled();
    });

    test('sets up messier tour button', () => {
      tourUI.initialize();

      const messierBtn = document.getElementById('tour-messier-btn');
      messierBtn.click();

      expect(mockDeps.startTour).toHaveBeenCalledWith('messier-marathon');
    });

    test('sets up navigation buttons', () => {
      tourUI.initialize();

      const nextBtn = document.getElementById('tour-next-btn');
      nextBtn.click();
      expect(mockDeps.nextStep).toHaveBeenCalled();

      const prevBtn = document.getElementById('tour-prev-btn');
      prevBtn.click();
      expect(mockDeps.prevStep).toHaveBeenCalled();

      const stopBtn = document.getElementById('tour-stop-btn');
      stopBtn.click();
      expect(mockDeps.stopTour).toHaveBeenCalled();
    });
  });

  describe('EventBus listeners', () => {
    test('handles TOUR_STARTED event', () => {
      tourUI.initialize();

      globalEventBus.emit(Events.TOUR_STARTED, {tourName: 'planets'});

      expect(tourUI.isActive()).toBe(true);
      expect(tourUI.getCurrentTour()).toBe('planets');
    });

    test('handles TOUR_ENDED event', () => {
      tourUI.initialize();

      globalEventBus.emit(Events.TOUR_STARTED, {tourName: 'planets'});
      globalEventBus.emit(Events.TOUR_ENDED, {});

      expect(tourUI.isActive()).toBe(false);
      expect(tourUI.getCurrentTour()).toBe(null);
    });

    test('handles TOUR_STEP_CHANGED event', () => {
      tourUI.initialize();

      globalEventBus.emit(Events.TOUR_STEP_CHANGED, {
        tour: {name: 'Night Sky Tour'},
        step: {name: 'Orion', description: 'The Hunter'},
        stepIndex: 2,
        totalSteps: 10,
      });

      const panel = document.getElementById('tour-panel');
      expect(panel.textContent).toContain('Night Sky Tour');
      expect(panel.textContent).toContain('Orion');
      expect(panel.textContent).toContain('The Hunter');
      expect(panel.textContent).toContain('Step 3 of 10');
    });
  });

  describe('buildTourPanel', () => {
    test('creates correct panel structure', () => {
      tourUI.initialize();

      const onPrev = jest.fn();
      const onNext = jest.fn();
      const onEnd = jest.fn();

      tourUI.buildTourPanel({
        tourName: 'Test Tour',
        stepName: 'Step Name',
        description: 'Step description',
        stepIndex: 0,
        totalSteps: 5,
        isFirstStep: true,
        onPrev,
        onNext,
        onEnd,
      });

      const panel = document.getElementById('tour-panel');
      expect(panel.querySelector('h2').textContent).toBe('Test Tour');
      expect(panel.querySelector('h3').textContent).toBe('Step Name');
    });

    test('disables previous button on first step', () => {
      tourUI.initialize();

      tourUI.buildTourPanel({
        tourName: 'Test',
        stepName: 'First',
        description: '',
        stepIndex: 0,
        totalSteps: 5,
        isFirstStep: true,
        onPrev: jest.fn(),
        onNext: jest.fn(),
        onEnd: jest.fn(),
      });

      const panel = document.getElementById('tour-panel');
      const buttons = panel.querySelectorAll('button');
      const prevBtn = Array.from(buttons).find((b) => b.textContent.includes('Previous'));
      expect(prevBtn.disabled).toBe(true);
    });
  });

  describe('UI updates', () => {
    test('shows tour panel on start', () => {
      tourUI.initialize();
      const panel = document.getElementById('tour-panel');

      globalEventBus.emit(Events.TOUR_STARTED, {tourName: 'test'});
      expect(panel.classList.contains('active')).toBe(true);
    });

    test('hides tour panel on end', () => {
      tourUI.initialize();
      const panel = document.getElementById('tour-panel');

      globalEventBus.emit(Events.TOUR_STARTED, {tourName: 'test'});
      globalEventBus.emit(Events.TOUR_ENDED, {});

      expect(panel.classList.contains('active')).toBe(false);
      expect(panel.style.display).toBe('none');
    });
  });

  describe('handles missing DOM elements gracefully', () => {
    test('works without buttons', () => {
      document.body.innerHTML = '';
      const ui = new TourUI(mockDeps);

      expect(() => ui.initialize()).not.toThrow();
    });

    test('works without tour panel', () => {
      document.body.innerHTML = '<button id="tour-tonight-btn"></button>';
      const ui = new TourUI(mockDeps);
      ui.initialize();

      expect(() => {
        globalEventBus.emit(Events.TOUR_STARTED, {tourName: 'test'});
      }).not.toThrow();
    });
  });
});

describe('initializeTourUI', () => {
  beforeEach(() => {
    resetTourUI();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    resetTourUI();
  });

  test('returns a TourUI instance', () => {
    const deps = {startTour: jest.fn()};
    const ui = initializeTourUI(deps);
    expect(ui).toBeInstanceOf(TourUI);
  });

  test('returns existing instance if already initialized', () => {
    const deps1 = {startTour: jest.fn()};
    const deps2 = {startTour: jest.fn()};

    const ui1 = initializeTourUI(deps1);
    const ui2 = initializeTourUI(deps2);

    expect(ui1).toBe(ui2);
  });
});
