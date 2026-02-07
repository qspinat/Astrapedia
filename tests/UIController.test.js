/**
 * @fileoverview Tests for UIController module and sub-controllers.
 */

import {jest} from '@jest/globals';

// Mock DOM elements
const mockSearchInput = {
  value: '',
  addEventListener: jest.fn(),
  focus: jest.fn(),
  contains: jest.fn(() => false),
};

const mockSearchResults = {
  innerHTML: '',
  classList: {
    add: jest.fn(),
    remove: jest.fn(),
    contains: jest.fn(() => false),
    toggle: jest.fn(),
  },
  querySelectorAll: jest.fn(() => []),
  contains: jest.fn(() => false),
};

const mockElements = {
  'search-input': mockSearchInput,
  'search-results': mockSearchResults,
  'equator-line-toggle': {addEventListener: jest.fn(), checked: false},
  'constellation-language': {addEventListener: jest.fn(), value: 'en'},
  'magnitude-slider': {addEventListener: jest.fn(), value: '6.0'},
  'mag-value': {textContent: '6.0'},
  'set-location-btn': {addEventListener: jest.fn()},
  'auto-location-btn': {addEventListener: jest.fn()},
  'reset-view-btn': {addEventListener: jest.fn()},
  'events-btn': {addEventListener: jest.fn()},
  'max-dynamic-stars': {addEventListener: jest.fn(), value: '500'},
  'max-dynamic-stars-value': {textContent: '500'},
  'constellations-quick-toggle': {
    addEventListener: jest.fn(),
    classList: {toggle: jest.fn()},
    dataset: {},
  },
  'settings-close-btn': {addEventListener: jest.fn()},
  'visible-tonight-close-btn': {addEventListener: jest.fn()},
  'events-close-btn': {addEventListener: jest.fn()},
  'location-dialog-close-btn': {addEventListener: jest.fn()},
  'info-panel-close-btn': {addEventListener: jest.fn()},
  'telescope-close-btn': {addEventListener: jest.fn()},
  'settings-btn': {addEventListener: jest.fn()},
  'visible-tonight-btn': {addEventListener: jest.fn()},
  'info-btn': {addEventListener: jest.fn()},
  'telescope-btn': {addEventListener: jest.fn()},
  'game-modal': null,
  'tour-modal': null,
  'night-mode-btn': {
    addEventListener: jest.fn(),
    classList: {toggle: jest.fn()},
  },
  'fov-display': {textContent: ''},
  'fov-badge': {textContent: ''},
};

// Store original getElementById
const originalGetElementById = document.getElementById;

// Setup mock before imports
document.getElementById = jest.fn((id) => mockElements[id] || null);
document.addEventListener = jest.fn();

// Mock EventBus
jest.unstable_mockModule('../modules/core/EventBus.js', () => ({
  globalEventBus: {
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
  },
  Events: {
    SEARCH_RESULT_SELECTED: 'search:result-selected',
    SETTING_CHANGED: 'setting:changed',
    GAME_STARTED: 'game:started',
    GAME_STOPPED: 'game:stopped',
    TOUR_STARTED: 'tour:started',
    TOUR_STOPPED: 'tour:stopped',
    TIME_SPEED_CHANGED: 'time:speed-changed',
    FOV_CHANGED: 'fov:changed',
    CMD_TOGGLE_NIGHT_MODE: 'cmd:toggle-night-mode',
  },
}));

// Mock PanelManager
const mockPanelManagerInstance = {
  register: jest.fn(),
  show: jest.fn(),
  hide: jest.fn(),
  toggle: jest.fn(),
  open: jest.fn(),
  isVisible: jest.fn(() => false),
  showExclusive: jest.fn(),
  closeAll: jest.fn(),
  initialize: jest.fn(),
  dispose: jest.fn(),
  setupCloseButton: jest.fn(),
  setupOpenButton: jest.fn(),
};

jest.unstable_mockModule('../modules/ui/PanelManager.js', () => ({
  PanelManager: jest.fn().mockImplementation(() => mockPanelManagerInstance),
  panelManager: mockPanelManagerInstance,
}));

// Mock domCache
jest.unstable_mockModule('../modules/ui/DOMCache.js', () => ({
  domCache: {
    get: jest.fn((id) => mockElements[id] || null),
    gamePanel: {
      classList: {add: jest.fn(), remove: jest.fn()},
      querySelector: jest.fn(() => null),
    },
    tourPanel: {
      classList: {add: jest.fn(), remove: jest.fn()},
      querySelector: jest.fn(() => null),
    },
    initialize: jest.fn(),
  },
}));

// Mock SecurityUtils
jest.unstable_mockModule('../modules/core/SecurityUtils.js', () => ({
  escapeHtml: jest.fn((str) => str),
}));

// Mock Utils
jest.unstable_mockModule('../modules/core/Utils.js', () => ({
  clamp: (v, min, max) => Math.min(Math.max(v, min), max),
  addMobileButtonListener: jest.fn((button, handler) => {
    // Mock implementation that just adds click listener
    button.addEventListener('click', handler);
  }),
}));

// Mock feature UI modules
jest.unstable_mockModule('../modules/features/GameUI.js', () => ({
  GameUI: jest.fn().mockImplementation(() => ({
    initialize: jest.fn(),
  })),
}));

jest.unstable_mockModule('../modules/features/TourUI.js', () => ({
  TourUI: jest.fn().mockImplementation(() => ({
    initialize: jest.fn(),
  })),
}));

jest.unstable_mockModule('../modules/features/TimeUI.js', () => ({
  TimeUI: jest.fn().mockImplementation(() => ({
    initialize: jest.fn(),
  })),
}));

jest.unstable_mockModule('../modules/features/TelescopeUI.js', () => ({
  TelescopeUI: jest.fn().mockImplementation(() => ({
    initialize: jest.fn(),
  })),
}));

// Dynamic imports after mocks
const {
  validatePresetName,
  SearchController,
  SettingsHandler,
  InfoBadgeUpdater,
  UIController,
  initializeUIController,
  resetUIController,
} = await import('../modules/ui/UIController.js');

const {globalEventBus, Events} = await import('../modules/core/EventBus.js');

describe('UIController Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetUIController();

    // Reset mock elements
    mockSearchInput.value = '';
    mockSearchResults.innerHTML = '';
  });

  afterEach(() => {
    resetUIController();
  });

  describe('validatePresetName', () => {
    test('returns valid for normal preset name', () => {
      const result = validatePresetName('My Preset');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('My Preset');
      expect(result.error).toBe('');
    });

    test('trims whitespace from preset name', () => {
      const result = validatePresetName('  Preset Name  ');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('Preset Name');
    });

    test('allows hyphens and underscores', () => {
      const result = validatePresetName('my-preset_v2');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('my-preset_v2');
    });

    test('allows numbers', () => {
      const result = validatePresetName('Preset123');
      expect(result.valid).toBe(true);
    });

    test('rejects empty string', () => {
      const result = validatePresetName('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Preset name is required.');
    });

    test('rejects whitespace-only string', () => {
      const result = validatePresetName('   ');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Preset name cannot be empty.');
    });

    test('rejects null', () => {
      const result = validatePresetName(null);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Preset name is required.');
    });

    test('rejects name exceeding 50 characters', () => {
      const longName = 'a'.repeat(51);
      const result = validatePresetName(longName);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('50 characters or less');
    });

    test('accepts name with exactly 50 characters', () => {
      const exactName = 'a'.repeat(50);
      const result = validatePresetName(exactName);
      expect(result.valid).toBe(true);
    });

    test('rejects special characters', () => {
      const result = validatePresetName('preset<script>');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('letters, numbers, spaces, hyphens');
    });

    test('rejects emoji', () => {
      const result = validatePresetName('preset🌟');
      expect(result.valid).toBe(false);
    });
  });

  describe('SearchController', () => {
    let searchController;
    let mockPerformSearch;
    let mockSelectObject;

    beforeEach(() => {
      mockPerformSearch = jest.fn();
      mockSelectObject = jest.fn();

      searchController = new SearchController({
        performSearch: mockPerformSearch,
        selectObject: mockSelectObject,
      });
    });

    test('initializes with dependencies', () => {
      expect(searchController).toBeDefined();
    });

    test('initialize sets up event listeners', () => {
      searchController.initialize();

      expect(mockSearchInput.addEventListener).toHaveBeenCalledWith(
        'input',
        expect.any(Function)
      );
      expect(mockSearchInput.addEventListener).toHaveBeenCalledWith(
        'keydown',
        expect.any(Function)
      );
    });

    test('clear resets search state', () => {
      mockSearchInput.value = 'test';
      searchController.clear();

      expect(mockSearchInput.value).toBe('');
      expect(mockSearchResults.classList.remove).toHaveBeenCalledWith('active');
    });

    test('focus focuses the input', () => {
      searchController.focus();
      expect(mockSearchInput.focus).toHaveBeenCalled();
    });
  });

  describe('SettingsHandler', () => {
    let settingsHandler;
    let mockDeps;

    beforeEach(() => {
      mockDeps = {
        toggleNightMode: jest.fn(),
        setConstellationLines: jest.fn(),
        setLanguage: jest.fn(),
        setMagnitudeLimit: jest.fn(),
        showLocationDialog: jest.fn(),
        requestGeolocation: jest.fn(),
        resetCamera: jest.fn(),
        showEventsCalendar: jest.fn(),
        setMaxDynamicStars: jest.fn(),
      };

      settingsHandler = new SettingsHandler(mockDeps);
    });

    test('initializes with dependencies', () => {
      expect(settingsHandler).toBeDefined();
    });

    test('initialize sets up event listeners on controls', () => {
      settingsHandler.initialize();

      // Check that event listeners were added to various controls
      expect(
        mockElements['magnitude-slider'].addEventListener
      ).toHaveBeenCalledWith('input', expect.any(Function));

      expect(
        mockElements['set-location-btn'].addEventListener
      ).toHaveBeenCalledWith('click', expect.any(Function));
    });
  });

  describe('InfoBadgeUpdater', () => {
    let infoBadgeUpdater;

    beforeEach(() => {
      infoBadgeUpdater = new InfoBadgeUpdater();
    });

    test('initializes properly', () => {
      expect(infoBadgeUpdater).toBeDefined();
    });

    test('start and stop manage interval', () => {
      // Spy on setInterval and clearInterval
      const setIntervalSpy = jest.spyOn(global, 'setInterval').mockReturnValue(123);
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval').mockImplementation();

      infoBadgeUpdater.start();
      expect(setIntervalSpy).toHaveBeenCalled();

      infoBadgeUpdater.stop();
      expect(clearIntervalSpy).toHaveBeenCalledWith(123);

      setIntervalSpy.mockRestore();
      clearIntervalSpy.mockRestore();
    });

    test('initialize starts updater and sets up listeners', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval').mockReturnValue(123);

      infoBadgeUpdater.initialize();

      expect(setIntervalSpy).toHaveBeenCalled();
      expect(globalEventBus.on).toHaveBeenCalledWith(
        Events.FOV_CHANGED,
        expect.any(Function)
      );

      setIntervalSpy.mockRestore();
    });
  });

  describe('UIController', () => {
    let controller;
    let mockDeps;

    beforeEach(() => {
      mockDeps = {
        panelManager: mockPanelManagerInstance,
        performSearch: jest.fn(),
        selectObject: jest.fn(),
        toggleNightMode: jest.fn(),
        setConstellationLines: jest.fn(),
        setLanguage: jest.fn(),
        setMagnitudeLimit: jest.fn(),
        showLocationDialog: jest.fn(),
        requestGeolocation: jest.fn(),
        resetCamera: jest.fn(),
        showEventsCalendar: jest.fn(),
        setMaxDynamicStars: jest.fn(),
        startGame: jest.fn(),
        passQuestion: jest.fn(),
        stopGame: jest.fn(),
        startTour: jest.fn(),
        nextTourStep: jest.fn(),
        prevTourStep: jest.fn(),
        stopTour: jest.fn(),
        setTimeSpeed: jest.fn(),
        togglePlayback: jest.fn(),
        jumpToTime: jest.fn(),
        getSimulationTime: jest.fn(() => new Date()),
        getTelescope: jest.fn(),
        setTelescope: jest.fn(),
        getEyepiece: jest.fn(),
        setEyepiece: jest.fn(),
        toggleTelescopeMode: jest.fn(),
        saveTelescopePreset: jest.fn(),
        loadTelescopePreset: jest.fn(),
        deleteTelescopePreset: jest.fn(),
        getTelescopePresetNames: jest.fn(() => []),
        getTelescopeComputedProperties: jest.fn(),
      };
    });

    test('constructor stores dependencies', () => {
      controller = new UIController(mockDeps);
      expect(controller).toBeDefined();
    });

    test('initialize creates all sub-controllers', () => {
      controller = new UIController(mockDeps);
      controller.initialize();

      // Verify panel manager was initialized
      expect(mockPanelManagerInstance.initialize).toHaveBeenCalled();
    });

    test('getSearchController returns search controller after init', () => {
      controller = new UIController(mockDeps);
      controller.initialize();

      const searchController = controller.getSearchController();
      expect(searchController).toBeDefined();
      expect(searchController).toBeInstanceOf(SearchController);
    });

    test('getSettingsHandler returns settings handler after init', () => {
      controller = new UIController(mockDeps);
      controller.initialize();

      const settingsHandler = controller.getSettingsHandler();
      expect(settingsHandler).toBeDefined();
      expect(settingsHandler).toBeInstanceOf(SettingsHandler);
    });

    test('openPanel delegates to panel manager', () => {
      controller = new UIController(mockDeps);
      controller.initialize();
      controller.openPanel('settings-panel');

      expect(mockPanelManagerInstance.open).toHaveBeenCalledWith('settings-panel');
    });

    test('closeAllPanels delegates to panel manager', () => {
      controller = new UIController(mockDeps);
      controller.initialize();
      controller.closeAllPanels();

      expect(mockPanelManagerInstance.closeAll).toHaveBeenCalled();
    });

    test('dispose cleans up resources', () => {
      controller = new UIController(mockDeps);
      controller.initialize();
      controller.dispose();

      expect(mockPanelManagerInstance.dispose).toHaveBeenCalled();
    });
  });

  describe('initializeUIController singleton', () => {
    test('creates instance on first call', () => {
      const instance = initializeUIController({
        panelManager: mockPanelManagerInstance,
      });

      expect(instance).toBeDefined();
      expect(instance).toBeInstanceOf(UIController);
    });

    test('returns same instance on second call', () => {
      const instance1 = initializeUIController({
        panelManager: mockPanelManagerInstance,
      });
      const instance2 = initializeUIController({
        panelManager: mockPanelManagerInstance,
      });

      expect(instance1).toBe(instance2);
    });

    test('logs warning on duplicate initialization', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      initializeUIController({panelManager: mockPanelManagerInstance});
      initializeUIController({panelManager: mockPanelManagerInstance});

      expect(consoleSpy).toHaveBeenCalledWith(
        'UIController already initialized, returning existing instance'
      );

      consoleSpy.mockRestore();
    });

    test('resetUIController allows new instance creation', () => {
      const instance1 = initializeUIController({
        panelManager: mockPanelManagerInstance,
      });

      resetUIController();

      const instance2 = initializeUIController({
        panelManager: mockPanelManagerInstance,
      });

      expect(instance1).not.toBe(instance2);
    });
  });
});
