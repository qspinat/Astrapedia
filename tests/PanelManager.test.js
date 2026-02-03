/**
 * @fileoverview Tests for PanelManager module.
 */

import {jest} from '@jest/globals';
import {PanelManager} from '../modules/ui/PanelManager.js';
import {globalEventBus, Events} from '../modules/core/EventBus.js';

describe('PanelManager', () => {
  let panelManager;
  let mockBackdrop;
  let mockPanels;
  let eventHandler;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock backdrop
    mockBackdrop = {
      classList: {
        add: jest.fn(),
        remove: jest.fn(),
      },
      addEventListener: jest.fn(),
    };

    // Mock panels
    mockPanels = {};
    const panelIds = [
      'settings-panel',
      'info-panel',
      'visible-tonight-panel',
      'events-panel',
      'tour-panel',
      'game-panel',
      'bug-report-panel',
    ];
    panelIds.forEach((id) => {
      mockPanels[id] = {
        classList: {
          add: jest.fn(),
          remove: jest.fn(),
        },
        addEventListener: jest.fn(),
      };
    });

    // Mock search results
    mockPanels['search-results'] = {
      classList: {
        add: jest.fn(),
        remove: jest.fn(),
      },
    };

    // Mock body classList
    const mockBodyClassList = {
      add: jest.fn(),
      remove: jest.fn(),
    };
    Object.defineProperty(document.body, 'classList', {
      value: mockBodyClassList,
      writable: true,
      configurable: true,
    });

    // Mock getElementById
    jest.spyOn(document, 'getElementById').mockImplementation((id) => {
      if (id === 'panel-backdrop') return mockBackdrop;
      return mockPanels[id] || null;
    });

    // Track event bus emissions
    eventHandler = jest.fn();
    globalEventBus.on(Events.PANEL_OPENED, eventHandler);
    globalEventBus.on(Events.PANEL_CLOSED, eventHandler);

    panelManager = new PanelManager(mockBackdrop);
  });

  afterEach(() => {
    globalEventBus.off(Events.PANEL_OPENED, eventHandler);
    globalEventBus.off(Events.PANEL_CLOSED, eventHandler);
  });

  describe('constructor', () => {
    test('creates instance with backdrop', () => {
      expect(panelManager).toBeInstanceOf(PanelManager);
    });

    test('creates instance without backdrop parameter', () => {
      const pm = new PanelManager();
      expect(pm).toBeInstanceOf(PanelManager);
    });

    test('initializes with no current panel', () => {
      expect(panelManager.getCurrentPanel()).toBeNull();
    });
  });

  describe('initialize', () => {
    test('sets up backdrop listener', () => {
      panelManager.initialize();
      expect(mockBackdrop.addEventListener).toHaveBeenCalled();
    });

    test('sets up panel touch handlers', () => {
      panelManager.initialize();
      // Should set up touch handlers on all panels except game-panel
      expect(mockPanels['settings-panel'].addEventListener).toHaveBeenCalledTimes(3);
      expect(mockPanels['info-panel'].addEventListener).toHaveBeenCalledTimes(3);
      // game-panel should not have touch handlers
      expect(mockPanels['game-panel'].addEventListener).not.toHaveBeenCalled();
    });
  });

  describe('open', () => {
    test('opens a panel', () => {
      panelManager.open('settings-panel');

      expect(mockPanels['settings-panel'].classList.add).toHaveBeenCalledWith('visible');
      expect(mockBackdrop.classList.add).toHaveBeenCalledWith('visible');
      expect(document.body.classList.add).toHaveBeenCalledWith('panel-open');
      expect(panelManager.getCurrentPanel()).toBe('settings-panel');
    });

    test('emits PANEL_OPENED event', () => {
      panelManager.open('info-panel');
      expect(eventHandler).toHaveBeenCalled();
    });

    test('closes current panel before opening new one', () => {
      panelManager.open('settings-panel');
      panelManager.open('info-panel');

      expect(mockPanels['settings-panel'].classList.remove).toHaveBeenCalledWith('visible');
      expect(mockPanels['info-panel'].classList.add).toHaveBeenCalledWith('visible');
      expect(panelManager.getCurrentPanel()).toBe('info-panel');
    });

    test('warns when panel not found', () => {
      const warnSpy = jest.spyOn(console, 'warn');
      panelManager.open('nonexistent-panel');
      expect(warnSpy).toHaveBeenCalledWith('Panel not found: nonexistent-panel');
    });
  });

  describe('closeAll', () => {
    test('closes all panels', () => {
      panelManager.open('settings-panel');
      panelManager.closeAll();

      expect(mockPanels['settings-panel'].classList.remove).toHaveBeenCalledWith('visible');
      expect(mockBackdrop.classList.remove).toHaveBeenCalledWith('visible');
      expect(document.body.classList.remove).toHaveBeenCalledWith('panel-open');
      expect(panelManager.getCurrentPanel()).toBeNull();
    });

    test('emits PANEL_CLOSED event', () => {
      panelManager.open('settings-panel');
      eventHandler.mockClear();
      panelManager.closeAll();
      expect(eventHandler).toHaveBeenCalled();
    });

    test('closes search results', () => {
      panelManager.closeAll();
      expect(mockPanels['search-results'].classList.remove).toHaveBeenCalledWith('active');
    });

    test('does not emit event when no panel was open', () => {
      eventHandler.mockClear();
      panelManager.closeAll();
      expect(eventHandler).not.toHaveBeenCalled();
    });
  });

  describe('toggle', () => {
    test('opens panel when closed', () => {
      panelManager.toggle('settings-panel');
      expect(panelManager.getCurrentPanel()).toBe('settings-panel');
    });

    test('closes panel when open', () => {
      panelManager.open('settings-panel');
      panelManager.toggle('settings-panel');
      expect(panelManager.getCurrentPanel()).toBeNull();
    });
  });

  describe('isAnyPanelOpen', () => {
    test('returns false when no panel is open', () => {
      expect(panelManager.isAnyPanelOpen()).toBe(false);
    });

    test('returns true when a panel is open', () => {
      panelManager.open('settings-panel');
      expect(panelManager.isAnyPanelOpen()).toBe(true);
    });
  });

  describe('isPanelOpen', () => {
    test('returns false for closed panel', () => {
      expect(panelManager.isPanelOpen('settings-panel')).toBe(false);
    });

    test('returns true for open panel', () => {
      panelManager.open('settings-panel');
      expect(panelManager.isPanelOpen('settings-panel')).toBe(true);
    });

    test('returns false for different panel', () => {
      panelManager.open('settings-panel');
      expect(panelManager.isPanelOpen('info-panel')).toBe(false);
    });
  });

  describe('onOpen and onClose callbacks', () => {
    test('registers and triggers open callback', () => {
      const callback = jest.fn();
      panelManager.onOpen('settings-panel', callback);
      panelManager.open('settings-panel');
      expect(callback).toHaveBeenCalled();
    });

    test('registers and triggers close callback', () => {
      const callback = jest.fn();
      panelManager.onClose('settings-panel', callback);
      panelManager.open('settings-panel');
      panelManager.closeAll();
      expect(callback).toHaveBeenCalled();
    });

    test('supports multiple callbacks per panel', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      panelManager.onOpen('settings-panel', callback1);
      panelManager.onOpen('settings-panel', callback2);
      panelManager.open('settings-panel');
      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });
  });

  describe('setupCloseButton', () => {
    test('sets up close button listener', () => {
      const mockButton = {
        addEventListener: jest.fn(),
      };
      document.getElementById.mockImplementation((id) => {
        if (id === 'close-btn') return mockButton;
        if (id === 'panel-backdrop') return mockBackdrop;
        return mockPanels[id] || null;
      });

      panelManager.setupCloseButton('close-btn');
      expect(mockButton.addEventListener).toHaveBeenCalled();
    });

    test('handles missing button gracefully', () => {
      expect(() => {
        panelManager.setupCloseButton('nonexistent-btn');
      }).not.toThrow();
    });
  });

  describe('showNotification', () => {
    test('creates notification element if not exists', () => {
      document.getElementById.mockImplementation((id) => {
        if (id === 'notification-panel') return null;
        if (id === 'panel-backdrop') return mockBackdrop;
        return mockPanels[id] || null;
      });

      const mockNotification = {
        id: '',
        className: '',
        textContent: '',
        classList: {add: jest.fn(), remove: jest.fn()},
        setAttribute: jest.fn(),
      };
      jest.spyOn(document, 'createElement').mockReturnValue(mockNotification);
      jest.spyOn(document.body, 'appendChild').mockImplementation(() => {});

      panelManager.showNotification('Test message');
      expect(document.createElement).toHaveBeenCalledWith('div');
      expect(document.body.appendChild).toHaveBeenCalled();
    });

    test('shows notification with message', () => {
      const mockNotification = {
        textContent: '',
        classList: {add: jest.fn(), remove: jest.fn()},
      };
      document.getElementById.mockImplementation((id) => {
        if (id === 'notification-panel') return mockNotification;
        if (id === 'panel-backdrop') return mockBackdrop;
        return mockPanels[id] || null;
      });

      panelManager.showNotification('Test message', 100);
      expect(mockNotification.textContent).toBe('Test message');
      expect(mockNotification.classList.add).toHaveBeenCalledWith('visible');
    });
  });

  describe('showConfirmation', () => {
    test('creates confirmation dialog if not exists', () => {
      document.getElementById.mockImplementation((id) => {
        if (id === 'confirmation-dialog') return null;
        if (id === 'panel-backdrop') return mockBackdrop;
        return mockPanels[id] || null;
      });

      const mockDialog = {
        innerHTML: '',
        classList: {add: jest.fn(), remove: jest.fn()},
        querySelector: jest.fn().mockReturnValue({
          textContent: '',
          onclick: null,
          addEventListener: jest.fn(),
        }),
      };
      jest.spyOn(document, 'createElement').mockReturnValue(mockDialog);
      jest.spyOn(document.body, 'appendChild').mockImplementation(() => {});

      panelManager.showConfirmation('Confirm?', () => {}, () => {});
      expect(document.createElement).toHaveBeenCalledWith('div');
    });
  });

  describe('dispose', () => {
    test('clears all callbacks and state', () => {
      const callback = jest.fn();
      panelManager.onOpen('settings-panel', callback);
      panelManager.open('settings-panel');

      panelManager.dispose();

      expect(panelManager.getCurrentPanel()).toBeNull();
    });
  });
});
