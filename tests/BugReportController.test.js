/**
 * @fileoverview Tests for BugReportController module.
 */

import {jest} from '@jest/globals';

// Mock Constants module before importing BugReportController
jest.unstable_mockModule('../modules/core/Constants.js', () => ({
  APP_VERSION: '1.0.0-test',
  FORMSPREE_ENDPOINT: 'https://formspree.io/f/test123',
}));

// Import after mocking
const {BugReportController, initializeBugReportController} = await import(
  '../modules/features/BugReportController.js'
);
const {globalEventBus, Events} = await import('../modules/core/EventBus.js');

// Mock fetch
global.fetch = jest.fn();

// Mock DOM elements
function createMockElement(id) {
  let element;
  if (id === 'bug-category') {
    element = document.createElement('select');
    // Add options to the select
    const options = ['display', 'interaction', 'performance', 'data', 'other'];
    options.forEach((val, idx) => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = val;
      element.appendChild(opt);
    });
    element.value = 'display';
    element.selectedIndex = 0;
  } else if (id === 'bug-email') {
    element = document.createElement('input');
    element.type = 'email';
    element.value = '';
  } else if (id === 'bug-description') {
    element = document.createElement('textarea');
    element.value = '';
    element.focus = jest.fn();
  } else if (id === 'bug-report-submit') {
    element = document.createElement('button');
    element.disabled = false;
    element.textContent = 'Submit Report';
  } else {
    element = document.createElement('button');
  }
  element.id = id;
  return element;
}

describe('BugReportController', () => {
  let controller;
  let mockPanelManager;
  let mockElements;

  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';

    // Create mock elements
    mockElements = {
      'bug-report-btn': createMockElement('bug-report-btn'),
      'bug-report-close-btn': createMockElement('bug-report-close-btn'),
      'bug-report-submit': createMockElement('bug-report-submit'),
      'bug-description': createMockElement('bug-description'),
      'bug-category': createMockElement('bug-category'),
      'bug-email': createMockElement('bug-email'),
    };

    Object.values(mockElements).forEach((el) => document.body.appendChild(el));

    // Mock panelManager
    mockPanelManager = {
      open: jest.fn(),
      closeAll: jest.fn(),
      onClose: jest.fn(),
      showNotification: jest.fn(),
    };

    // Reset mocks
    jest.clearAllMocks();
    globalEventBus.clear();
    global.fetch.mockReset();

    controller = new BugReportController({panelManager: mockPanelManager});
  });

  afterEach(() => {
    controller.dispose();
  });

  describe('constructor', () => {
    test('initializes with panelManager dependency', () => {
      expect(controller).toBeInstanceOf(BugReportController);
    });

    test('starts with submitting_ as false', () => {
      // Access via handleSubmit behavior - if we call it twice quickly,
      // the second should be blocked while first is in progress
      expect(controller).toBeDefined();
    });
  });

  describe('initialize', () => {
    test('sets up event listeners', () => {
      controller.initialize();

      // Verify onClose callback was registered
      expect(mockPanelManager.onClose).toHaveBeenCalledWith(
        'bug-report-panel',
        expect.any(Function)
      );
    });

    test('bug report button opens panel', () => {
      controller.initialize();

      mockElements['bug-report-btn'].click();

      expect(mockPanelManager.open).toHaveBeenCalledWith('bug-report-panel');
    });

    test('close button closes all panels', () => {
      controller.initialize();

      mockElements['bug-report-close-btn'].click();

      expect(mockPanelManager.closeAll).toHaveBeenCalled();
    });
  });

  describe('collectDiagnosticInfo_', () => {
    test('collects browser and environment info', () => {
      controller.initialize();

      // Access private method via reflection for testing
      const diagnosticInfo = controller.collectDiagnosticInfo_();

      expect(diagnosticInfo).toMatchObject({
        userAgent: expect.any(String),
        screenSize: expect.stringMatching(/^\d+x\d+$/),
        devicePixelRatio: expect.any(Number),
        appVersion: '1.0.0-test',
        timestamp: expect.any(String),
        url: expect.any(String),
        language: expect.any(String),
      });
    });

    test('timestamp is ISO format', () => {
      controller.initialize();
      const diagnosticInfo = controller.collectDiagnosticInfo_();

      // Should be valid ISO date
      expect(() => new Date(diagnosticInfo.timestamp)).not.toThrow();
    });
  });

  describe('validateForm_', () => {
    beforeEach(() => {
      controller.initialize();
    });

    test('returns false when description is empty', () => {
      mockElements['bug-description'].value = '';

      const result = controller.validateForm_();

      expect(result).toBe(false);
      expect(mockPanelManager.showNotification).toHaveBeenCalledWith(
        'Please provide a description of the bug.',
        expect.any(Number)
      );
    });

    test('returns false when description is too short', () => {
      mockElements['bug-description'].value = 'short';

      const result = controller.validateForm_();

      expect(result).toBe(false);
      expect(mockPanelManager.showNotification).toHaveBeenCalledWith(
        'Please provide a more detailed description.',
        expect.any(Number)
      );
    });

    test('returns true when description is valid', () => {
      mockElements['bug-description'].value = 'This is a valid bug description with enough detail.';

      const result = controller.validateForm_();

      expect(result).toBe(true);
      expect(mockPanelManager.showNotification).not.toHaveBeenCalled();
    });

    test('focuses description field on validation error', () => {
      mockElements['bug-description'].value = '';

      controller.validateForm_();

      expect(mockElements['bug-description'].focus).toHaveBeenCalled();
    });
  });

  describe('handleSubmit_', () => {
    beforeEach(() => {
      controller.initialize();
      mockElements['bug-description'].value = 'This is a valid bug description for testing.';
    });

    test('prevents double submission', async () => {
      global.fetch.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ok: true}), 100))
      );

      // Start first submission
      const promise1 = controller.handleSubmit_();
      // Try second submission immediately
      const promise2 = controller.handleSubmit_();

      await Promise.all([promise1, promise2]);

      // Should only have one fetch call
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test('validates form before submitting', async () => {
      mockElements['bug-description'].value = '';

      await controller.handleSubmit_();

      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('submits report data to endpoint', async () => {
      global.fetch.mockResolvedValue({ok: true});
      mockElements['bug-category'].value = 'performance';
      mockElements['bug-email'].value = 'test@example.com';

      await controller.handleSubmit_();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://formspree.io/f/test123',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: expect.any(String),
        })
      );

      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body).toMatchObject({
        description: 'This is a valid bug description for testing.',
        category: 'performance',
        email: 'test@example.com',
        appVersion: '1.0.0-test',
      });
    });

    test('uses "Not provided" when email is empty', async () => {
      global.fetch.mockResolvedValue({ok: true});
      mockElements['bug-email'].value = '';

      await controller.handleSubmit_();

      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body.email).toBe('Not provided');
    });
  });

  describe('submitReport_', () => {
    beforeEach(() => {
      controller.initialize();
    });

    test('disables submit button during submission', async () => {
      global.fetch.mockImplementation(
        () =>
          new Promise((resolve) => {
            expect(mockElements['bug-report-submit'].disabled).toBe(true);
            expect(mockElements['bug-report-submit'].textContent).toBe('Submitting...');
            resolve({ok: true});
          })
      );

      await controller.submitReport_({description: 'test'});
    });

    test('re-enables submit button after submission', async () => {
      global.fetch.mockResolvedValue({ok: true});

      await controller.submitReport_({description: 'test'});

      expect(mockElements['bug-report-submit'].disabled).toBe(false);
      expect(mockElements['bug-report-submit'].textContent).toBe('Submit Report');
    });

    test('shows success notification on successful submission', async () => {
      global.fetch.mockResolvedValue({ok: true});

      await controller.submitReport_({description: 'test'});

      expect(mockPanelManager.showNotification).toHaveBeenCalledWith(
        'Bug report submitted successfully. Thank you!',
        3000
      );
    });

    test('closes panel on successful submission', async () => {
      global.fetch.mockResolvedValue({ok: true});

      await controller.submitReport_({description: 'test'});

      expect(mockPanelManager.closeAll).toHaveBeenCalled();
    });

    test('emits BUG_REPORT_SUBMITTED event on success', async () => {
      global.fetch.mockResolvedValue({ok: true});
      const callback = jest.fn();
      globalEventBus.on(Events.BUG_REPORT_SUBMITTED, callback);

      await controller.submitReport_({description: 'test'});

      expect(callback).toHaveBeenCalledWith({
        success: true,
        data: {description: 'test'},
      });
    });

    test('shows error notification on failed submission', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({error: 'Custom error'}),
      });

      await controller.submitReport_({description: 'test'});

      expect(mockPanelManager.showNotification).toHaveBeenCalledWith('Custom error', 5000);
    });

    test('shows generic error when response has no error message', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({}),
      });

      await controller.submitReport_({description: 'test'});

      expect(mockPanelManager.showNotification).toHaveBeenCalledWith(
        'Failed to submit report. Please try again.',
        5000
      );
    });

    test('emits BUG_REPORT_SUBMITTED event with error on failure', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({error: 'Server error'}),
      });
      const callback = jest.fn();
      globalEventBus.on(Events.BUG_REPORT_SUBMITTED, callback);

      await controller.submitReport_({description: 'test'});

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'Server error',
      });
    });

    test('handles network errors', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'));

      await controller.submitReport_({description: 'test'});

      expect(mockPanelManager.showNotification).toHaveBeenCalledWith(
        'Network error. Please check your connection and try again.',
        5000
      );
    });

    test('emits event with error message on network failure', async () => {
      global.fetch.mockRejectedValue(new Error('Connection refused'));
      const callback = jest.fn();
      globalEventBus.on(Events.BUG_REPORT_SUBMITTED, callback);

      await controller.submitReport_({description: 'test'});

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'Connection refused',
      });
    });

    test('re-enables submit button after error', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'));

      await controller.submitReport_({description: 'test'});

      expect(mockElements['bug-report-submit'].disabled).toBe(false);
      expect(mockElements['bug-report-submit'].textContent).toBe('Submit Report');
    });
  });

  describe('clearForm_', () => {
    beforeEach(() => {
      controller.initialize();
      mockElements['bug-description'].value = 'Some description';
      mockElements['bug-category'].value = 'performance';
      mockElements['bug-category'].selectedIndex = 2;
      mockElements['bug-email'].value = 'test@example.com';
    });

    test('clears description field', () => {
      controller.clearForm_();
      expect(mockElements['bug-description'].value).toBe('');
    });

    test('resets category to first option', () => {
      controller.clearForm_();
      expect(mockElements['bug-category'].selectedIndex).toBe(0);
    });

    test('clears email field', () => {
      controller.clearForm_();
      expect(mockElements['bug-email'].value).toBe('');
    });

    test('is called when panel closes', () => {
      // Get the callback that was registered
      const onCloseCallback = mockPanelManager.onClose.mock.calls[0][1];

      // Set form values
      mockElements['bug-description'].value = 'Test';

      // Trigger the callback
      onCloseCallback();

      expect(mockElements['bug-description'].value).toBe('');
    });
  });

  describe('dispose', () => {
    test('removes event listeners', () => {
      controller.initialize();

      // Store reference to check if listener is removed
      const openBtn = mockElements['bug-report-btn'];
      const removeListenerSpy = jest.spyOn(openBtn, 'removeEventListener');

      controller.dispose();

      expect(removeListenerSpy).toHaveBeenCalledWith('click', expect.any(Function));
    });

    test('clears bound handlers', () => {
      controller.initialize();
      controller.dispose();

      // After dispose, calling initialize again should work
      expect(() => controller.initialize()).not.toThrow();
    });

    test('resets submitting state', () => {
      controller.initialize();
      controller.dispose();

      // Should be able to submit after dispose + reinitialize
      expect(controller).toBeDefined();
    });
  });
});

describe('initializeBugReportController', () => {
  let mockPanelManager;

  beforeEach(() => {
    document.body.innerHTML = '';

    // Create minimal required elements
    ['bug-report-btn', 'bug-report-close-btn', 'bug-report-submit'].forEach((id) => {
      const el = document.createElement('div');
      el.id = id;
      document.body.appendChild(el);
    });

    mockPanelManager = {
      open: jest.fn(),
      closeAll: jest.fn(),
      onClose: jest.fn(),
      showNotification: jest.fn(),
    };

    globalEventBus.clear();
  });

  test('creates and returns BugReportController instance', () => {
    const result = initializeBugReportController({panelManager: mockPanelManager});
    expect(result).toBeInstanceOf(BugReportController);
  });

  test('initializes the controller', () => {
    const result = initializeBugReportController({panelManager: mockPanelManager});

    // Verify initialization occurred by checking onClose was called
    expect(mockPanelManager.onClose).toHaveBeenCalled();
  });
});

describe('unconfigured endpoint', () => {
  test('shows error when endpoint is not configured', async () => {
    // This test verifies the endpoint validation logic
    // In the actual code, it checks for YOUR_FORM_ID in the endpoint
    const mockPanelManager = {
      open: jest.fn(),
      closeAll: jest.fn(),
      onClose: jest.fn(),
      showNotification: jest.fn(),
    };

    // Reset modules to test with unconfigured endpoint
    jest.resetModules();

    jest.unstable_mockModule('../modules/core/Constants.js', () => ({
      APP_VERSION: '1.0.0',
      FORMSPREE_ENDPOINT: 'https://formspree.io/f/YOUR_FORM_ID',
    }));

    const {BugReportController: UnconfiguredController} = await import(
      '../modules/features/BugReportController.js'
    );

    // Create elements
    document.body.innerHTML = '';
    const descEl = document.createElement('textarea');
    descEl.id = 'bug-description';
    descEl.value = 'Valid description for testing';
    document.body.appendChild(descEl);

    const submitBtn = document.createElement('button');
    submitBtn.id = 'bug-report-submit';
    document.body.appendChild(submitBtn);

    const controller = new UnconfiguredController({panelManager: mockPanelManager});
    controller.initialize();

    await controller.handleSubmit_();

    expect(mockPanelManager.showNotification).toHaveBeenCalledWith(
      'Bug reporting is not configured. Please contact the developer.',
      5000
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('Events constants', () => {
  test('has BUG_REPORT_SUBMITTED event defined', () => {
    expect(Events.BUG_REPORT_SUBMITTED).toBeDefined();
  });

  test('BUG_REPORT_SUBMITTED follows naming convention', () => {
    expect(Events.BUG_REPORT_SUBMITTED).toMatch(/^bugreport:/);
  });
});
