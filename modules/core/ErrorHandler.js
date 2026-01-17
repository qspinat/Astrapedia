/**
 * @fileoverview Centralized error handling utilities.
 * Provides consistent error handling, logging, and user notification.
 */

import {globalEventBus, Events} from './EventBus.js';

/**
 * Error severity levels.
 * @enum {string}
 */
export const ErrorSeverity = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical',
};

/**
 * Error categories for grouping and filtering.
 * @enum {string}
 */
export const ErrorCategory = {
  NETWORK: 'network',
  DATA: 'data',
  RENDER: 'render',
  LOCATION: 'location',
  STORAGE: 'storage',
  API: 'api',
  USER_INPUT: 'user_input',
  UNKNOWN: 'unknown',
};

/**
 * Application error class with additional context.
 */
export class AppError extends Error {
  /**
   * Creates a new AppError.
   * @param {string} message - Error message
   * @param {!Object=} options - Additional options
   * @param {string=} options.category - Error category
   * @param {string=} options.severity - Error severity
   * @param {*=} options.cause - Original error
   * @param {!Object=} options.context - Additional context
   * @param {boolean=} options.recoverable - Whether error is recoverable
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'AppError';
    this.category = options.category || ErrorCategory.UNKNOWN;
    this.severity = options.severity || ErrorSeverity.ERROR;
    this.cause = options.cause || null;
    this.context = options.context || {};
    this.recoverable = options.recoverable ?? true;
    this.timestamp = new Date();
  }
}

/**
 * ErrorHandler provides centralized error handling.
 */
export class ErrorHandler {
  /**
   * Creates a new ErrorHandler instance.
   */
  constructor() {
    /**
     * Error log for debugging.
     * @private {!Array<!Object>}
     */
    this.errorLog_ = [];

    /**
     * Maximum errors to keep in log.
     * @private @const {number}
     */
    this.maxLogSize_ = 100;

    /**
     * Error handlers by category.
     * @private {!Map<string, !Array<function(!AppError): void>>}
     */
    this.handlers_ = new Map();

    /**
     * Whether to show errors to user.
     * @private {boolean}
     */
    this.showUserErrors_ = true;
  }

  /**
   * Initialize the error handler with global handlers.
   */
  initialize() {
    // Handle uncaught errors
    window.addEventListener('error', (event) => {
      this.handle(new AppError(event.message, {
        category: ErrorCategory.UNKNOWN,
        severity: ErrorSeverity.ERROR,
        cause: event.error,
        context: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      }));
    });

    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.handle(new AppError('Unhandled promise rejection', {
        category: ErrorCategory.UNKNOWN,
        severity: ErrorSeverity.ERROR,
        cause: event.reason,
      }));
    });
  }

  /**
   * Handle an error.
   * @param {!AppError|!Error|string} error - Error to handle
   * @param {!Object=} context - Additional context
   */
  handle(error, context = {}) {
    // Normalize to AppError
    const appError = this.normalizeError_(error, context);

    // Log the error
    this.log_(appError);

    // Emit event
    globalEventBus.emit(Events.DATA_ERROR, {error: appError});

    // Call registered handlers
    this.callHandlers_(appError);

    // Show to user if appropriate
    if (this.showUserErrors_ && this.shouldShowToUser_(appError)) {
      this.showUserMessage_(appError);
    }

    // Log to console
    this.consoleLog_(appError);
  }

  /**
   * Normalize any error to AppError.
   * @param {!AppError|!Error|string} error - Error to normalize
   * @param {!Object} context - Additional context
   * @returns {!AppError} Normalized error
   * @private
   */
  normalizeError_(error, context) {
    if (error instanceof AppError) {
      if (Object.keys(context).length > 0) {
        error.context = {...error.context, ...context};
      }
      return error;
    }

    if (error instanceof Error) {
      return new AppError(error.message, {
        cause: error,
        context,
      });
    }

    return new AppError(String(error), {context});
  }

  /**
   * Log error to internal log.
   * @param {!AppError} error - Error to log
   * @private
   */
  log_(error) {
    this.errorLog_.push({
      message: error.message,
      category: error.category,
      severity: error.severity,
      timestamp: error.timestamp,
      context: error.context,
    });

    // Trim log if too large
    if (this.errorLog_.length > this.maxLogSize_) {
      this.errorLog_ = this.errorLog_.slice(-this.maxLogSize_);
    }
  }

  /**
   * Log to console with appropriate level.
   * @param {!AppError} error - Error to log
   * @private
   */
  consoleLog_(error) {
    const prefix = `[${error.category}]`;

    switch (error.severity) {
      case ErrorSeverity.INFO:
        console.info(prefix, error.message, error.context);
        break;
      case ErrorSeverity.WARNING:
        console.warn(prefix, error.message, error.context);
        break;
      case ErrorSeverity.CRITICAL:
        console.error(prefix, 'CRITICAL:', error.message, error.context, error.cause);
        break;
      default:
        console.error(prefix, error.message, error.context, error.cause);
    }
  }

  /**
   * Call registered handlers for error category.
   * @param {!AppError} error - Error to handle
   * @private
   */
  callHandlers_(error) {
    const handlers = this.handlers_.get(error.category) || [];
    handlers.forEach((handler) => {
      try {
        handler(error);
      } catch (e) {
        console.error('Error in error handler:', e);
      }
    });
  }

  /**
   * Check if error should be shown to user.
   * @param {!AppError} error - Error to check
   * @returns {boolean} True if should show
   * @private
   */
  shouldShowToUser_(error) {
    // Don't show info-level errors
    if (error.severity === ErrorSeverity.INFO) {
      return false;
    }

    // Always show critical errors
    if (error.severity === ErrorSeverity.CRITICAL) {
      return true;
    }

    // Show network errors only for important operations
    if (error.category === ErrorCategory.NETWORK) {
      return error.context.important === true;
    }

    return true;
  }

  /**
   * Show error message to user.
   * @param {!AppError} error - Error to show
   * @private
   */
  showUserMessage_(error) {
    const message = this.getUserMessage_(error);

    // Try to use notification panel if available
    const notification = document.getElementById('notification-panel');
    if (notification) {
      notification.textContent = message;
      notification.classList.add('visible', 'error');
      setTimeout(() => {
        notification.classList.remove('visible', 'error');
      }, 5000);
    }
  }

  /**
   * Get user-friendly message for error.
   * @param {!AppError} error - Error
   * @returns {string} User message
   * @private
   */
  getUserMessage_(error) {
    switch (error.category) {
      case ErrorCategory.NETWORK:
        return 'Network error. Please check your connection.';
      case ErrorCategory.DATA:
        return 'Failed to load data. Please try again.';
      case ErrorCategory.LOCATION:
        return 'Location error. Using default location.';
      case ErrorCategory.STORAGE:
        return 'Storage error. Settings may not be saved.';
      default:
        return error.recoverable
          ? 'An error occurred. Please try again.'
          : 'A critical error occurred. Please reload the page.';
    }
  }

  /**
   * Register a handler for a category.
   * @param {string} category - Error category
   * @param {function(!AppError): void} handler - Handler function
   */
  onCategory(category, handler) {
    if (!this.handlers_.has(category)) {
      this.handlers_.set(category, []);
    }
    this.handlers_.get(category).push(handler);
  }

  /**
   * Enable/disable user error messages.
   * @param {boolean} show - Whether to show
   */
  setShowUserErrors(show) {
    this.showUserErrors_ = show;
  }

  /**
   * Get the error log.
   * @returns {!Array<!Object>} Error log
   */
  getLog() {
    return [...this.errorLog_];
  }

  /**
   * Clear the error log.
   */
  clearLog() {
    this.errorLog_ = [];
  }

  /**
   * Create a wrapped function that handles errors.
   * @param {function(...*): *} fn - Function to wrap
   * @param {!Object=} options - Error options
   * @returns {function(...*): *} Wrapped function
   */
  wrap(fn, options = {}) {
    return (...args) => {
      try {
        const result = fn(...args);
        if (result instanceof Promise) {
          return result.catch((error) => {
            this.handle(error, options);
            throw error;
          });
        }
        return result;
      } catch (error) {
        this.handle(error, options);
        throw error;
      }
    };
  }

  /**
   * Create a retry wrapper for async functions.
   * @param {function(): !Promise<*>} fn - Async function
   * @param {number=} maxRetries - Max retry attempts
   * @param {number=} delay - Delay between retries in ms
   * @returns {!Promise<*>} Result promise
   */
  async retry(fn, maxRetries = 3, delay = 1000) {
    let lastError;

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (i < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2; // Exponential backoff
        }
      }
    }

    throw lastError;
  }
}

/**
 * Singleton error handler instance.
 * @const {!ErrorHandler}
 */
export const errorHandler = new ErrorHandler();

/**
 * Convenience function for handling errors.
 * @param {!AppError|!Error|string} error - Error to handle
 * @param {!Object=} context - Additional context
 */
export function handleError(error, context) {
  errorHandler.handle(error, context);
}

/**
 * Convenience function for creating app errors.
 * @param {string} message - Error message
 * @param {string} category - Error category
 * @param {!Object=} context - Additional context
 * @returns {!AppError} New error
 */
export function createError(message, category, context = {}) {
  return new AppError(message, {category, context});
}
