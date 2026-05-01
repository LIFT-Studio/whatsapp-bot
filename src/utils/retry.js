/**
 * Retry Logic with Exponential Backoff and Timeout Support
 * Handles transient failures and timeout scenarios
 */

const { logError } = require('./logger');

/**
 * Execute function with retry and timeout support
 * @param {Function} fn - Async function to execute
 * @param {number} maxRetries - Maximum number of retries (default: 3)
 * @param {number} timeoutMs - Timeout per attempt in milliseconds (default: 8000)
 * @param {string} operationName - Name of operation for logging
 * @param {string} sessionId - Session ID for tracing
 * @returns {Promise} Result of function execution
 */
async function withRetry(fn, maxRetries = 3, timeoutMs = 8000, operationName = 'operation', sessionId = 'unknown') {
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Execute with timeout
      const result = await executeWithTimeout(fn, timeoutMs, operationName);
      return result;
    } catch (error) {
      lastError = error;
      const isTimeout = error.name === 'TimeoutError';
      const isLastAttempt = attempt === maxRetries;

      // Log each attempt
      const errorType = isTimeout ? 'TIMEOUT' : 'ERROR';
      const willRetry = !isLastAttempt;

      if (willRetry) {
        const backoffMs = calculateBackoff(attempt - 1);
        logError(sessionId, `${operationName}[attempt-${attempt}]`, error, {
          errorType,
          attempt,
          maxRetries,
          backoffMs,
          willRetry: true
        });

        // Wait before retry
        await sleep(backoffMs);
      } else {
        logError(sessionId, `${operationName}[failed]`, error, {
          errorType,
          attempt,
          maxRetries,
          willRetry: false
        });
      }
    }
  }

  // All retries exhausted
  throw lastError || new Error(`${operationName} failed after ${maxRetries} attempts`);
}

/**
 * Execute function with timeout
 * @param {Function} fn - Async function
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} operationName - Operation name for error message
 * @returns {Promise} Result or TimeoutError
 */
async function executeWithTimeout(fn, timeoutMs, operationName = 'operation') {
  return Promise.race([
    fn(),
    new Promise((_, reject) => {
      setTimeout(() => {
        const error = new Error(`${operationName} timed out after ${timeoutMs}ms`);
        error.name = 'TimeoutError';
        error.timeout = timeoutMs;
        reject(error);
      }, timeoutMs);
    })
  ]);
}

/**
 * Calculate exponential backoff with jitter
 * @param {number} attemptNumber - 0-based attempt number
 * @returns {number} Milliseconds to wait
 */
function calculateBackoff(attemptNumber) {
  // Exponential backoff: 100ms, 200ms, 400ms, 800ms, etc.
  const baseBackoff = 100;
  const exponent = Math.pow(2, attemptNumber);
  const backoff = baseBackoff * exponent;

  // Add random jitter (±20%)
  const jitter = backoff * 0.2 * (Math.random() - 0.5);
  const finalBackoff = Math.max(100, backoff + jitter); // Min 100ms

  return Math.round(finalBackoff);
}

/**
 * Sleep utility for delays
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if error is retryable (transient vs permanent)
 * @param {Error} error - Error to check
 * @returns {boolean} Whether error is retryable
 */
function isRetryable(error) {
  // Timeout errors are retryable
  if (error.name === 'TimeoutError') return true;

  // Network errors are retryable
  if (error.message?.includes('ECONNREFUSED') ||
      error.message?.includes('ECONNRESET') ||
      error.message?.includes('ETIMEDOUT') ||
      error.message?.includes('EHOSTUNREACH')) {
    return true;
  }

  // API errors with 5xx status are retryable
  if (error.statusCode >= 500 && error.statusCode < 600) {
    return true;
  }

  // Rate limit errors (429) are retryable with backoff
  if (error.statusCode === 429) {
    return true;
  }

  return false;
}

module.exports = {
  withRetry,
  executeWithTimeout,
  calculateBackoff,
  sleep,
  isRetryable
};
