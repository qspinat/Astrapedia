/**
 * @fileoverview Tests for TimeUI module.
 */

import {jest} from '@jest/globals';
import {TimeUI, initializeTimeUI, resetTimeUI} from '../modules/features/TimeUI.js';
import {globalEventBus, Events} from '../modules/core/EventBus.js';

describe('TimeUI', () => {
  let timeUI;
  let mockDeps;

  beforeEach(() => {
    jest.clearAllMocks();
    resetTimeUI();

    // Setup mock DOM elements
    document.body.innerHTML = `
      <button id="time-rewind-btn"></button>
      <button id="time-play-btn"></button>
      <button id="time-forward-btn"></button>
      <button id="time-now-btn"></button>
      <button id="time-picker-btn"></button>
      <div id="time-picker-panel">
        <input id="date-picker" type="date" />
        <input id="time-picker" type="time" />
        <button id="time-picker-apply"></button>
        <button id="time-picker-cancel"></button>
      </div>
      <div id="time-display"></div>
    `;

    mockDeps = {
      setTimeSpeed: jest.fn(),
      togglePlayback: jest.fn(),
      jumpToTime: jest.fn(),
      getSimulationTime: jest.fn(() => new Date('2025-06-15T12:00:00')),
    };

    timeUI = new TimeUI(mockDeps);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    resetTimeUI();
  });

  describe('constructor', () => {
    test('creates instance with dependencies', () => {
      expect(timeUI).toBeInstanceOf(TimeUI);
    });

    test('initializes state correctly', () => {
      expect(timeUI.isPlaying()).toBe(false);
      expect(timeUI.getCurrentSpeed()).toBe(0);
    });
  });

  describe('initialize', () => {
    test('sets up rewind button', () => {
      timeUI.initialize();

      const rewindBtn = document.getElementById('time-rewind-btn');
      rewindBtn.click();
      expect(mockDeps.setTimeSpeed).toHaveBeenCalledWith(-100);
    });

    test('sets up play button', () => {
      timeUI.initialize();

      const playBtn = document.getElementById('time-play-btn');
      playBtn.click();
      expect(mockDeps.togglePlayback).toHaveBeenCalled();
    });

    test('sets up forward button to cycle speeds', () => {
      timeUI.initialize();

      const forwardBtn = document.getElementById('time-forward-btn');
      forwardBtn.click();

      // Should cycle through TIME.SPEED_PRESETS
      expect(mockDeps.setTimeSpeed).toHaveBeenCalled();
    });

    test('sets up now button', () => {
      timeUI.initialize();

      const nowBtn = document.getElementById('time-now-btn');
      nowBtn.click();
      expect(mockDeps.jumpToTime).toHaveBeenCalledWith(expect.any(Date));
    });
  });

  describe('time picker', () => {
    test('toggles picker panel visibility', () => {
      timeUI.initialize();

      const pickerBtn = document.getElementById('time-picker-btn');
      const pickerPanel = document.getElementById('time-picker-panel');

      pickerBtn.click();
      expect(pickerPanel.classList.contains('visible')).toBe(true);
    });

    test('prefills picker with current simulation time', () => {
      timeUI.initialize();

      const pickerBtn = document.getElementById('time-picker-btn');
      pickerBtn.click();

      const datePicker = document.getElementById('date-picker');
      const timePicker = document.getElementById('time-picker');

      expect(datePicker.value).toBe('2025-06-15');
      expect(timePicker.value).toBe('12:00');
    });

    test('applies selected date/time', () => {
      timeUI.initialize();

      const pickerBtn = document.getElementById('time-picker-btn');
      pickerBtn.click();

      const datePicker = document.getElementById('date-picker');
      const timePicker = document.getElementById('time-picker');
      const applyBtn = document.getElementById('time-picker-apply');

      datePicker.value = '2025-12-25';
      timePicker.value = '18:30';
      applyBtn.click();

      expect(mockDeps.jumpToTime).toHaveBeenCalled();
      const calledDate = mockDeps.jumpToTime.mock.calls[0][0];
      expect(calledDate.getFullYear()).toBe(2025);
      expect(calledDate.getMonth()).toBe(11); // December is 11
      expect(calledDate.getDate()).toBe(25);
      expect(calledDate.getHours()).toBe(18);
      expect(calledDate.getMinutes()).toBe(30);
    });

    test('cancel button hides panel', () => {
      timeUI.initialize();

      const pickerBtn = document.getElementById('time-picker-btn');
      const pickerPanel = document.getElementById('time-picker-panel');
      const cancelBtn = document.getElementById('time-picker-cancel');

      pickerBtn.click();
      expect(pickerPanel.classList.contains('visible')).toBe(true);

      cancelBtn.click();
      expect(pickerPanel.classList.contains('visible')).toBe(false);
    });
  });

  describe('EventBus listeners', () => {
    test('handles TIME_SPEED_CHANGED event', () => {
      timeUI.initialize();

      globalEventBus.emit(Events.TIME_SPEED_CHANGED, {
        isPlaying: true,
        speed: 100,
      });

      expect(timeUI.isPlaying()).toBe(true);
      expect(timeUI.getCurrentSpeed()).toBe(100);
    });

    test('updates play button on speed change', () => {
      timeUI.initialize();
      const playBtn = document.getElementById('time-play-btn');

      globalEventBus.emit(Events.TIME_SPEED_CHANGED, {
        isPlaying: true,
        speed: 1,
      });

      expect(playBtn.classList.contains('playing')).toBe(true);
    });

    test('handles TIME_CHANGED event', () => {
      timeUI.initialize();
      const timeDisplay = document.getElementById('time-display');
      const testDate = new Date('2025-07-04T14:30:00');

      globalEventBus.emit(Events.TIME_CHANGED, {time: testDate});

      expect(timeDisplay.textContent).toBe(testDate.toLocaleString());
    });

    test('handles TIME_TICK event', () => {
      timeUI.initialize();
      const timeDisplay = document.getElementById('time-display');
      const testDate = new Date('2025-08-15T09:00:00');

      globalEventBus.emit(Events.TIME_TICK, {time: testDate});

      expect(timeDisplay.textContent).toBe(testDate.toLocaleString());
    });
  });

  describe('handles missing DOM elements gracefully', () => {
    test('works without buttons', () => {
      document.body.innerHTML = '';
      const ui = new TimeUI(mockDeps);

      expect(() => ui.initialize()).not.toThrow();
    });

    test('works without time picker elements', () => {
      document.body.innerHTML = '<button id="time-play-btn"></button>';
      const ui = new TimeUI(mockDeps);

      expect(() => ui.initialize()).not.toThrow();
    });
  });
});

describe('initializeTimeUI', () => {
  beforeEach(() => {
    resetTimeUI();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    resetTimeUI();
  });

  test('returns a TimeUI instance', () => {
    const deps = {setTimeSpeed: jest.fn()};
    const ui = initializeTimeUI(deps);
    expect(ui).toBeInstanceOf(TimeUI);
  });

  test('returns existing instance if already initialized', () => {
    const deps1 = {setTimeSpeed: jest.fn()};
    const deps2 = {setTimeSpeed: jest.fn()};

    const ui1 = initializeTimeUI(deps1);
    const ui2 = initializeTimeUI(deps2);

    expect(ui1).toBe(ui2);
  });
});
