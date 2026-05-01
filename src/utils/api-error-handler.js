/**
 * Centralized API Error Handler
 * Categorizes errors and provides user-friendly responses in Spanish
 */

/**
 * Error categories
 */
const ErrorType = {
  TIMEOUT: 'TIMEOUT',
  NETWORK: 'NETWORK',
  API_ERROR: 'API_ERROR',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNKNOWN: 'UNKNOWN'
};

/**
 * Categorize error and get user-friendly message
 * @param {Error} error - Error object
 * @param {string} context - Operation context (e.g., "search_products", "add_to_cart")
 * @returns {object} { errorType, userMessage, isRetryable, originalError }
 */
function handleError(error, context = 'operation') {
  const errorInfo = categorizeError(error);

  // Get user-friendly message based on error type
  const userMessage = getUserFriendlyMessage(errorInfo, context);

  return {
    errorType: errorInfo.type,
    userMessage,
    isRetryable: isRetryable(errorInfo),
    originalError: error,
    details: errorInfo.details
  };
}

/**
 * Categorize error by type
 * @param {Error} error - Error object
 * @returns {object} { type, code, statusCode, message, details }
 */
function categorizeError(error) {
  // Timeout error
  if (error.name === 'TimeoutError') {
    return {
      type: ErrorType.TIMEOUT,
      code: 'TIMEOUT',
      timeout: error.timeout,
      message: error.message,
      details: { timeoutMs: error.timeout }
    };
  }

  // Network errors
  if (error.code === 'ECONNREFUSED' ||
      error.message?.includes('ECONNREFUSED')) {
    return {
      type: ErrorType.NETWORK,
      code: 'ECONNREFUSED',
      message: 'Connection refused',
      details: { errno: error.errno, code: error.code }
    };
  }

  if (error.code === 'ECONNRESET' ||
      error.message?.includes('ECONNRESET')) {
    return {
      type: ErrorType.NETWORK,
      code: 'ECONNRESET',
      message: 'Connection reset',
      details: { errno: error.errno, code: error.code }
    };
  }

  if (error.code === 'ETIMEDOUT' ||
      error.message?.includes('ETIMEDOUT')) {
    return {
      type: ErrorType.TIMEOUT,
      code: 'ETIMEDOUT',
      message: 'Request timed out',
      details: { errno: error.errno, code: error.code }
    };
  }

  // HTTP status code errors
  if (error.statusCode) {
    if (error.statusCode === 404) {
      return {
        type: ErrorType.NOT_FOUND,
        statusCode: 404,
        message: 'Resource not found',
        details: { url: error.url }
      };
    }

    if (error.statusCode === 429) {
      return {
        type: ErrorType.API_ERROR,
        code: 'RATE_LIMITED',
        statusCode: 429,
        message: 'Rate limited',
        details: { retryAfter: error.retryAfter }
      };
    }

    if (error.statusCode >= 400 && error.statusCode < 500) {
      return {
        type: ErrorType.VALIDATION_ERROR,
        statusCode: error.statusCode,
        message: error.message,
        details: { body: error.body }
      };
    }

    if (error.statusCode >= 500 && error.statusCode < 600) {
      return {
        type: ErrorType.API_ERROR,
        code: 'SERVER_ERROR',
        statusCode: error.statusCode,
        message: 'Server error',
        details: { statusCode: error.statusCode }
      };
    }
  }

  // Invalid response format
  if (error.message?.includes('JSON') ||
      error.message?.includes('parse')) {
    return {
      type: ErrorType.INVALID_RESPONSE,
      code: 'PARSE_ERROR',
      message: 'Invalid response format',
      details: { originalMessage: error.message }
    };
  }

  // Default: unknown error
  return {
    type: ErrorType.UNKNOWN,
    code: 'UNKNOWN_ERROR',
    message: error.message || 'An unknown error occurred',
    details: { originalError: error.toString() }
  };
}

/**
 * Get user-friendly message in Spanish based on error type
 * @param {object} errorInfo - Error info from categorizeError()
 * @param {string} context - Operation context
 * @returns {string} User-friendly message
 */
function getUserFriendlyMessage(errorInfo, context = 'operation') {
  const messageMap = {
    [ErrorType.TIMEOUT]: {
      default: 'Disculpa, la tienda está tomando mucho tiempo para responder. ¿Podrías intentar de nuevo?',
      search_products: 'Estoy teniendo problemas para conectar con la tienda. ¿Podrías intentar de nuevo?',
      add_to_cart: 'El carrito está tardando en responder. ¿Podemos intentar de nuevo?',
      create_checkout: 'El checkout está tardando. ¿Podrías volver a intentar?'
    },
    [ErrorType.NETWORK]: {
      default: 'Parece que hay un problema de conexión. ¿Podrías intentar de nuevo?',
      search_products: 'No puedo conectar con la tienda en este momento. ¿Intentamos de nuevo?',
      add_to_cart: 'Hay un problema de conexión. ¿Podemos intentar agregar el producto de nuevo?'
    },
    [ErrorType.API_ERROR]: {
      default: 'La tienda está teniendo problemas. ¿Podrías intentar más tarde?',
      search_products: 'La tienda está experimentando problemas. ¿Intentamos en unos minutos?',
      create_checkout: 'Hay un problema generando el checkout. ¿Podemos intentar de nuevo?'
    },
    [ErrorType.INVALID_RESPONSE]: {
      default: 'Recibí una respuesta extraña de la tienda. ¿Podrías intentar de nuevo?',
      search_products: 'La respuesta de la tienda no es clara. ¿Intentemos de nuevo?'
    },
    [ErrorType.NOT_FOUND]: {
      default: 'No encontré lo que buscas. ¿Quieres intentar otra búsqueda?',
      search_products: 'El producto no está disponible. ¿Buscamos algo parecido?'
    },
    [ErrorType.VALIDATION_ERROR]: {
      default: 'Hay un problema con la información. ¿Podrías revisar y intentar de nuevo?',
      add_to_cart: 'No puedo agregar este producto en este momento. ¿Quieres intentar otro?'
    },
    [ErrorType.UNKNOWN]: {
      default: 'Algo salió mal. ¿Podrías intentar de nuevo?'
    }
  };

  // Try to get specific message for context
  const typeMessages = messageMap[errorInfo.type] || messageMap[ErrorType.UNKNOWN];
  return typeMessages[context] || typeMessages.default || messageMap[ErrorType.UNKNOWN].default;
}

/**
 * Determine if error is retryable
 * @param {object} errorInfo - Error info from categorizeError()
 * @returns {boolean} Whether error should be retried
 */
function isRetryable(errorInfo) {
  const retryableTypes = [
    ErrorType.TIMEOUT,
    ErrorType.NETWORK,
    ErrorType.API_ERROR  // 5xx errors
  ];

  return retryableTypes.includes(errorInfo.type);
}

/**
 * Format error for logging with context
 * @param {Error} error - Error object
 * @param {string} context - Operation context
 * @returns {object} Formatted error for logs
 */
function formatErrorForLog(error, context = 'operation') {
  const errorInfo = categorizeError(error);
  return {
    errorType: errorInfo.type,
    code: errorInfo.code,
    message: errorInfo.message,
    context,
    statusCode: errorInfo.statusCode,
    details: errorInfo.details,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  ErrorType,
  handleError,
  categorizeError,
  getUserFriendlyMessage,
  isRetryable,
  formatErrorForLog
};
