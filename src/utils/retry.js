/**
 * Retry Logic: Idempotence-aware
 *
 * RETRY STRATEGY BY OPERATION TYPE:
 *
 * READ operations (search_products, get_cart, view_cart, answer_policy_question):
 *   → Retry up to 2 times on ANY error (TIMEOUT, NETWORK, 5xx)
 *   → Safe: multiple identical requests don't cause side effects
 *
 * WRITE operations (add_to_cart, remove_from_cart, update_cart_item, clear_cart, create_checkout):
 *   → Retry ONLY on connection errors BEFORE sending request:
 *     - ECONNREFUSED (server not responding)
 *     - ETIMEDOUT (DNS/connection timeout before request sent)
 *   → DO NOT retry on timeout AFTER sending request (response lost):
 *     - If timeout happens after request reached server, the operation may have succeeded
 *     - Client doesn't know if item was added or not → ambiguous state
 *     - Solution: Return friendly message asking user to retry manually
 *   → NO retry on 5xx (server error) for writes
 *     - Risk: double-charge, duplicate cart items, inconsistent state
 *
 * CALLER RESPONSIBILITY:
 *   - executeTool() must know operation type (read vs write)
 *   - For writes: if retry exhausted, return error with message suggesting manual retry
 *   - For reads: if retry exhausted, return error with message suggesting retry
 */

/**
 * Execute function with retry and timeout support
 * @param {Function} fn - Async function to execute
 * @param {number} maxRetries - Maximum number of retries (default: 3)
 * @param {number} timeoutMs - Timeout per attempt in milliseconds (default: 8000)
 * @param {string} operationName - Name of operation for logging
 * @returns {Promise} Result of function execution
 */
async function withRetry(fn, maxRetries = 3, timeoutMs = 8000, operationName = 'operation') {
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await executeWithTimeout(fn, timeoutMs, operationName);
      return result;
    } catch (error) {
      lastError = error;
      const isTimeout = error.name === 'TimeoutError';
      const isLastAttempt = attempt === maxRetries;

      const errorType = isTimeout ? 'TIMEOUT' : 'ERROR';

      if (!isLastAttempt) {
        const backoffMs = calculateBackoff(attempt - 1);
        console.log(`[RETRY] ${operationName}[attempt-${attempt}/${maxRetries}] ${errorType} — waiting ${backoffMs}ms before retry`);
        await sleep(backoffMs);
      } else {
        console.log(`[RETRY] ${operationName}[attempt-${attempt}/${maxRetries}] ${errorType} — exhausted retries`);
      }
    }
  }

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
  const baseBackoff = 100;
  const exponent = Math.pow(2, attemptNumber);
  const backoff = baseBackoff * exponent;

  // Add random jitter (±20%)
  const jitter = backoff * 0.2 * (Math.random() - 0.5);
  const finalBackoff = Math.max(100, backoff + jitter);

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
  if (error.name === 'TimeoutError') return true;

  if (error.message?.includes('ECONNREFUSED') ||
      error.message?.includes('ECONNRESET') ||
      error.message?.includes('ETIMEDOUT') ||
      error.message?.includes('EHOSTUNREACH')) {
    return true;
  }

  if (error.statusCode >= 500 && error.statusCode < 600) {
    return true;
  }

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
