/**
 * Simple logger utility for consistent logging across the application
 */

/**
 * Log levels
 */
const LogLevel = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error'
};

/**
 * Logger class with methods for different log levels
 */
class Logger {
  /**
   * Log a debug message (only in development)
   * @param {string} message - The message to log
   * @param {any} data - Optional data to include
   */
  static debug(message, data) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEBUG] ${message}`, data ? data : '');
    }
  }

  /**
   * Log an info message (only in development)
   * @param {string} message - The message to log
   * @param {any} data - Optional data to include
   */
  static info(message, data) {
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[INFO] ${message}`, data ? data : '');
    }
  }

  /**
   * Log a warning message
   * @param {string} message - The message to log
   * @param {any} data - Optional data to include
   */
  static warn(message, data) {
    // Warnings are logged in all environments but with different levels of detail
    if (process.env.NODE_ENV === 'production') {
      console.warn(`[WARN] ${message}`);
    } else {
      console.warn(`[WARN] ${message}`, data ? data : '');
    }
  }

  /**
   * Log an error message
   * @param {string} message - The message to log
   * @param {Error|any} error - The error object or data
   */
  static error(message, error) {
    // Errors are always logged, but with different levels of detail
    if (process.env.NODE_ENV === 'production') {
      console.error(`[ERROR] ${message}`);
    } else {
      console.error(`[ERROR] ${message}`, error ? error : '');
    }
  }
}

export { Logger, LogLevel };