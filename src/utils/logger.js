/**
 * Structured Logging System with SessionId Tracing
 * Provides JSON-structured logs for all operations with timing, status, and error tracking
 */

/**
 * Log an operation with full context
 * @param {string} sessionId - Session identifier for tracing
 * @param {string} operation - Operation name (e.g., "processMessage", "executeTool", "addToCart")
 * @param {string} level - Log level: "info", "error", "warn"
 * @param {object} details - Additional data to log
 * @param {number} durationMs - Optional operation duration in milliseconds
 * @param {string} status - Optional status: "start", "success", "error"
 */
function log(sessionId, operation, level = "info", details = {}, durationMs = null, status = null) {
  const timestamp = new Date().toISOString();
  const shortSessionId = sessionId ? sessionId.substring(0, 8) : "unknown";

  const logEntry = {
    timestamp,
    sessionId: shortSessionId,
    fullSessionId: sessionId || "unknown",
    level,
    operation,
    status,
    ...details,
  };

  if (durationMs !== null) {
    logEntry.durationMs = durationMs;
  }

  console.log(JSON.stringify(logEntry));
}

/**
 * Log the START of an operation
 * @param {string} sessionId - Session identifier
 * @param {string} operation - Operation name
 * @param {object} context - Initial context (e.g., userMessage, toolName)
 */
function logStart(sessionId, operation, context = {}) {
  log(sessionId, operation, "info", context, null, "start");
}

/**
 * Log the SUCCESS of an operation
 * @param {string} sessionId - Session identifier
 * @param {string} operation - Operation name
 * @param {number} durationMs - Duration in milliseconds
 * @param {object} result - Result data
 */
function logSuccess(sessionId, operation, durationMs, result = {}) {
  log(sessionId, operation, "info", result, durationMs, "success");
}

/**
 * Log an ERROR
 * @param {string} sessionId - Session identifier
 * @param {string} operation - Operation name
 * @param {Error|string} error - Error object or message
 * @param {object} context - Additional context
 */
function logError(sessionId, operation, error, context = {}) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  log(sessionId, operation, "error", {
    error: errorMessage,
    ...(errorStack && { stack: errorStack }),
    ...context,
  });
}

/**
 * Log a tool execution
 * @param {string} sessionId - Session identifier
 * @param {string} toolName - Name of the tool being executed
 * @param {object} input - Tool input parameters
 * @param {object} result - Tool result
 * @param {number} durationMs - Execution duration
 * @param {boolean} success - Whether execution was successful
 */
function logToolExecution(sessionId, toolName, input, result, durationMs, success = true) {
  const status = success ? "success" : "error";
  log(sessionId, `executeTool[${toolName}]`, "info", {
    toolName,
    input: JSON.stringify(input).substring(0, 200), // Truncate for logs
    result: typeof result === "object" ? JSON.stringify(result).substring(0, 200) : result,
  }, durationMs, status);
}

/**
 * Log user message received
 * @param {string} sessionId - Session identifier
 * @param {string} userMessage - The user's message
 * @param {number} messageLength - Length of the message
 * @param {boolean} isFirstMessage - Whether this is the first message in session
 */
function logUserMessage(sessionId, userMessage, messageLength, isFirstMessage = false) {
  log(sessionId, "receiveUserMessage", "info", {
    messageLength,
    messagePreview: userMessage.substring(0, 100),
    isFirstMessage,
  }, null, "success");
}

/**
 * Log bot response
 * @param {string} sessionId - Session identifier
 * @param {string} assistantText - The bot's response
 * @param {number} responseLength - Length of the response
 * @param {number} toolCallCount - Number of tool calls made
 * @param {number} totalDurationMs - Total time to generate response
 */
function logBotResponse(sessionId, assistantText, responseLength, toolCallCount = 0, totalDurationMs = 0) {
  log(sessionId, "sendBotResponse", "info", {
    responseLength,
    responsePreview: assistantText.substring(0, 100),
    toolCallCount,
  }, totalDurationMs, "success");
}

/**
 * Log cart operation
 * @param {string} sessionId - Session identifier
 * @param {string} operation - Operation type: "add", "remove", "update", "view", "clear"
 * @param {object} details - Operation details (productTitle, quantity, price, etc.)
 * @param {boolean} success - Whether operation was successful
 */
function logCartOperation(sessionId, operation, details = {}, success = true) {
  const status = success ? "success" : "error";
  log(sessionId, `cartOperation[${operation}]`, success ? "info" : "error", details, null, status);
}

/**
 * Log session lifecycle
 * @param {string} sessionId - Session identifier
 * @param {string} event - Event type: "start", "end", "timeout"
 * @param {object} context - Session context
 */
function logSessionEvent(sessionId, event, context = {}) {
  log(sessionId, `sessionLifecycle[${event}]`, "info", context, null, event);
}

/**
 * Create a timer for measuring operation duration
 * @returns {object} Timer object with start time
 */
function createTimer() {
  return {
    startTime: Date.now(),
    elapsed() {
      return Date.now() - this.startTime;
    },
  };
}

module.exports = {
  log,
  logStart,
  logSuccess,
  logError,
  logToolExecution,
  logUserMessage,
  logBotResponse,
  logCartOperation,
  logSessionEvent,
  createTimer,
};
