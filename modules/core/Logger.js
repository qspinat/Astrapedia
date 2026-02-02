/**
 * @fileoverview Centralized logging utility.
 * Provides configurable log levels and consistent logging interface.
 */

/**
 * Log levels in order of severity.
 * @enum {number}
 */
export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4,
};

/**
 * Logger class for centralized logging.
 */
class Logger {
  constructor() {
    /** @private {number} */
    this.level_ = LogLevel.INFO;

    /** @private {boolean} */
    this.enabled_ = true;

    /** @private {?string} */
    this.prefix_ = null;
  }

  /**
   * Set the minimum log level.
   * @param {number} level - LogLevel value
   */
  setLevel(level) {
    this.level_ = level;
  }

  /**
   * Get the current log level.
   * @returns {number}
   */
  getLevel() {
    return this.level_;
  }

  /**
   * Enable or disable all logging.
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.enabled_ = enabled;
  }

  /**
   * Check if logging is enabled.
   * @returns {boolean}
   */
  isEnabled() {
    return this.enabled_;
  }

  /**
   * Set a prefix for all log messages.
   * @param {?string} prefix
   */
  setPrefix(prefix) {
    this.prefix_ = prefix;
  }

  /**
   * Format message with optional prefix.
   * @param {...*} args - Arguments to log
   * @returns {Array} Formatted arguments
   * @private
   */
  formatArgs_(...args) {
    if (this.prefix_ && args.length > 0 && typeof args[0] === 'string') {
      args[0] = `[${this.prefix_}] ${args[0]}`;
    }
    return args;
  }

  /**
   * Log a debug message.
   * @param {...*} args - Arguments to log
   */
  debug(...args) {
    if (!this.enabled_ || this.level_ > LogLevel.DEBUG) return;
    console.log(...this.formatArgs_(...args));
  }

  /**
   * Log an info message.
   * @param {...*} args - Arguments to log
   */
  info(...args) {
    if (!this.enabled_ || this.level_ > LogLevel.INFO) return;
    console.log(...this.formatArgs_(...args));
  }

  /**
   * Log a warning message.
   * @param {...*} args - Arguments to log
   */
  warn(...args) {
    if (!this.enabled_ || this.level_ > LogLevel.WARN) return;
    console.warn(...this.formatArgs_(...args));
  }

  /**
   * Log an error message.
   * @param {...*} args - Arguments to log
   */
  error(...args) {
    if (!this.enabled_ || this.level_ > LogLevel.ERROR) return;
    console.error(...this.formatArgs_(...args));
  }

  /**
   * Create a child logger with a specific prefix.
   * @param {string} prefix - Module or component name
   * @returns {Object} Logger-like object with same interface
   */
  createChild(prefix) {
    const parent = this;
    return {
      debug(...args) {
        if (!parent.enabled_ || parent.level_ > LogLevel.DEBUG) return;
        console.log(`[${prefix}]`, ...args);
      },
      info(...args) {
        if (!parent.enabled_ || parent.level_ > LogLevel.INFO) return;
        console.log(`[${prefix}]`, ...args);
      },
      warn(...args) {
        if (!parent.enabled_ || parent.level_ > LogLevel.WARN) return;
        console.warn(`[${prefix}]`, ...args);
      },
      error(...args) {
        if (!parent.enabled_ || parent.level_ > LogLevel.ERROR) return;
        console.error(`[${prefix}]`, ...args);
      },
    };
  }
}

/**
 * Global logger instance.
 * @type {!Logger}
 */
export const logger = new Logger();

/**
 * Create a module-specific logger.
 * @param {string} moduleName - Name of the module
 * @returns {Object} Logger with module prefix
 */
export function createLogger(moduleName) {
  return logger.createChild(moduleName);
}
