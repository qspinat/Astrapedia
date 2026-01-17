/**
 * @fileoverview Tests for ErrorHandler module.
 */

import {jest} from '@jest/globals';
import {
  ErrorHandler,
  AppError,
  ErrorSeverity,
  ErrorCategory,
  errorHandler,
  handleError,
  createError,
} from '../modules/core/ErrorHandler.js';
import {globalEventBus, Events} from '../modules/core/EventBus.js';

describe('ErrorSeverity', () => {
  test('contains all severity levels', () => {
    expect(ErrorSeverity.INFO).toBe('info');
    expect(ErrorSeverity.WARNING).toBe('warning');
    expect(ErrorSeverity.ERROR).toBe('error');
    expect(ErrorSeverity.CRITICAL).toBe('critical');
  });
});

describe('ErrorCategory', () => {
  test('contains all error categories', () => {
    expect(ErrorCategory.NETWORK).toBe('network');
    expect(ErrorCategory.DATA).toBe('data');
    expect(ErrorCategory.RENDER).toBe('render');
    expect(ErrorCategory.LOCATION).toBe('location');
    expect(ErrorCategory.STORAGE).toBe('storage');
    expect(ErrorCategory.API).toBe('api');
    expect(ErrorCategory.USER_INPUT).toBe('user_input');
    expect(ErrorCategory.UNKNOWN).toBe('unknown');
  });
});

describe('AppError', () => {
  test('creates error with message', () => {
    const error = new AppError('Test error');
    expect(error.message).toBe('Test error');
    expect(error.name).toBe('AppError');
  });

  test('uses default values when options not provided', () => {
    const error = new AppError('Test error');
    expect(error.category).toBe(ErrorCategory.UNKNOWN);
    expect(error.severity).toBe(ErrorSeverity.ERROR);
    expect(error.cause).toBeNull();
    expect(error.context).toEqual({});
    expect(error.recoverable).toBe(true);
  });

  test('accepts all options', () => {
    const cause = new Error('Original error');
    const error = new AppError('Test error', {
      category: ErrorCategory.NETWORK,
      severity: ErrorSeverity.WARNING,
      cause,
      context: {url: 'http://example.com'},
      recoverable: false,
    });
    expect(error.category).toBe(ErrorCategory.NETWORK);
    expect(error.severity).toBe(ErrorSeverity.WARNING);
    expect(error.cause).toBe(cause);
    expect(error.context).toEqual({url: 'http://example.com'});
    expect(error.recoverable).toBe(false);
  });

  test('sets timestamp', () => {
    const before = new Date();
    const error = new AppError('Test error');
    const after = new Date();
    expect(error.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(error.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  test('extends Error', () => {
    const error = new AppError('Test error');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
  });
});

describe('ErrorHandler', () => {
  let handler;

  beforeEach(() => {
    handler = new ErrorHandler();
    globalEventBus.clear();
  });

  describe('handle', () => {
    test('normalizes string errors', () => {
      const eventCallback = jest.fn();
      globalEventBus.on(Events.DATA_ERROR, eventCallback);
      handler.handle('String error');
      expect(eventCallback).toHaveBeenCalled();
      const emittedError = eventCallback.mock.calls[0][0].error;
      expect(emittedError).toBeInstanceOf(AppError);
      expect(emittedError.message).toBe('String error');
    });

    test('normalizes Error objects', () => {
      const eventCallback = jest.fn();
      globalEventBus.on(Events.DATA_ERROR, eventCallback);
      handler.handle(new Error('Native error'));
      expect(eventCallback).toHaveBeenCalled();
      const emittedError = eventCallback.mock.calls[0][0].error;
      expect(emittedError).toBeInstanceOf(AppError);
      expect(emittedError.message).toBe('Native error');
    });

    test('passes through AppError objects', () => {
      const eventCallback = jest.fn();
      globalEventBus.on(Events.DATA_ERROR, eventCallback);
      const appError = new AppError('App error', {
        category: ErrorCategory.NETWORK,
      });
      handler.handle(appError);
      const emittedError = eventCallback.mock.calls[0][0].error;
      expect(emittedError).toBe(appError);
    });

    test('adds context to existing AppError', () => {
      const eventCallback = jest.fn();
      globalEventBus.on(Events.DATA_ERROR, eventCallback);
      const appError = new AppError('App error', {
        context: {original: true},
      });
      handler.handle(appError, {added: true});
      const emittedError = eventCallback.mock.calls[0][0].error;
      expect(emittedError.context).toEqual({original: true, added: true});
    });

    test('logs error to internal log', () => {
      handler.handle('Test error');
      const log = handler.getLog();
      expect(log).toHaveLength(1);
      expect(log[0].message).toBe('Test error');
    });

    test('emits DATA_ERROR event', () => {
      const callback = jest.fn();
      globalEventBus.on(Events.DATA_ERROR, callback);
      handler.handle('Test error');
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('onCategory', () => {
    test('registers handler for category', () => {
      const categoryHandler = jest.fn();
      handler.onCategory(ErrorCategory.NETWORK, categoryHandler);
      handler.handle(new AppError('Network error', {
        category: ErrorCategory.NETWORK,
      }));
      expect(categoryHandler).toHaveBeenCalled();
    });

    test('does not call handler for different category', () => {
      const categoryHandler = jest.fn();
      handler.onCategory(ErrorCategory.NETWORK, categoryHandler);
      handler.handle(new AppError('Storage error', {
        category: ErrorCategory.STORAGE,
      }));
      expect(categoryHandler).not.toHaveBeenCalled();
    });

    test('allows multiple handlers per category', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      handler.onCategory(ErrorCategory.NETWORK, handler1);
      handler.onCategory(ErrorCategory.NETWORK, handler2);
      handler.handle(new AppError('Error', {category: ErrorCategory.NETWORK}));
      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });

  describe('getLog', () => {
    test('returns copy of error log', () => {
      handler.handle('Error 1');
      handler.handle('Error 2');
      const log = handler.getLog();
      expect(log).toHaveLength(2);
      // Verify it's a copy
      log.push({});
      expect(handler.getLog()).toHaveLength(2);
    });
  });

  describe('clearLog', () => {
    test('clears the error log', () => {
      handler.handle('Error 1');
      handler.handle('Error 2');
      handler.clearLog();
      expect(handler.getLog()).toHaveLength(0);
    });
  });

  describe('setShowUserErrors', () => {
    test('controls user error display', () => {
      handler.setShowUserErrors(false);
      // Would need to mock DOM to fully test this
      expect(() => handler.handle('Error')).not.toThrow();
    });
  });

  describe('wrap', () => {
    test('wraps synchronous function', () => {
      const fn = jest.fn(() => 'result');
      const wrapped = handler.wrap(fn);
      expect(wrapped()).toBe('result');
      expect(fn).toHaveBeenCalled();
    });

    test('handles synchronous error', () => {
      const eventCallback = jest.fn();
      globalEventBus.on(Events.DATA_ERROR, eventCallback);
      const fn = jest.fn(() => {
        throw new Error('Sync error');
      });
      const wrapped = handler.wrap(fn);
      expect(() => wrapped()).toThrow('Sync error');
      expect(eventCallback).toHaveBeenCalled();
    });

    test('wraps async function', async () => {
      const fn = jest.fn(async () => 'async result');
      const wrapped = handler.wrap(fn);
      const result = await wrapped();
      expect(result).toBe('async result');
    });

    test('handles async error', async () => {
      const eventCallback = jest.fn();
      globalEventBus.on(Events.DATA_ERROR, eventCallback);
      const fn = jest.fn(async () => {
        throw new Error('Async error');
      });
      const wrapped = handler.wrap(fn);
      await expect(wrapped()).rejects.toThrow('Async error');
      expect(eventCallback).toHaveBeenCalled();
    });
  });

  describe('retry', () => {
    test('returns result on first success', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await handler.retry(fn, 3, 10);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    test('retries on failure', async () => {
      const fn = jest.fn()
          .mockRejectedValueOnce(new Error('Fail 1'))
          .mockRejectedValueOnce(new Error('Fail 2'))
          .mockResolvedValue('success');
      const result = await handler.retry(fn, 3, 10);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    test('throws after max retries', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Always fails'));
      await expect(handler.retry(fn, 3, 10)).rejects.toThrow('Always fails');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    test('uses exponential backoff', async () => {
      const fn = jest.fn()
          .mockRejectedValueOnce(new Error('Fail'))
          .mockResolvedValue('success');
      const start = Date.now();
      await handler.retry(fn, 2, 50);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(45); // Allow some timing variance
    });
  });

  describe('log trimming', () => {
    test('trims log when exceeding max size', () => {
      // Default max is 100
      for (let i = 0; i < 110; i++) {
        handler.handle(`Error ${i}`);
      }
      expect(handler.getLog()).toHaveLength(100);
      // Most recent errors should be kept
      expect(handler.getLog()[99].message).toBe('Error 109');
    });
  });
});

describe('handleError', () => {
  test('delegates to errorHandler singleton', () => {
    const callback = jest.fn();
    globalEventBus.on(Events.DATA_ERROR, callback);
    handleError('Test error');
    expect(callback).toHaveBeenCalled();
  });
});

describe('createError', () => {
  test('creates AppError with message and category', () => {
    const error = createError('Test message', ErrorCategory.NETWORK);
    expect(error).toBeInstanceOf(AppError);
    expect(error.message).toBe('Test message');
    expect(error.category).toBe(ErrorCategory.NETWORK);
  });

  test('accepts context', () => {
    const error = createError('Test', ErrorCategory.API, {endpoint: '/test'});
    expect(error.context).toEqual({endpoint: '/test'});
  });
});

describe('errorHandler singleton', () => {
  test('is an ErrorHandler instance', () => {
    expect(errorHandler).toBeInstanceOf(ErrorHandler);
  });
});
