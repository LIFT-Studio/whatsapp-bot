/**
 * Shopify Storefront MCP Client
 * Cliente para conectarse al Storefront MCP público de Shopify
 * Endpoint: https://{shop}.myshopify.com/api/mcp
 *
 * Herramientas disponibles:
 * - search_catalog: Busca productos con query en lenguaje natural
 * - get_product_details: Obtiene detalles de un producto por ID
 * - get_cart: Obtiene estado del carrito
 * - update_cart: Crea/actualiza carrito (agregar/quitar/actualizar items)
 * - search_shop_policies_and_faqs: Busca políticas y FAQs
 */

const SHOPIFY_SHOP = process.env.SHOPIFY_SHOP;
const MCP_ENDPOINT = `https://${SHOPIFY_SHOP}/api/mcp`;
const DEFAULT_TIMEOUT_MS = parseInt(process.env.MCP_TIMEOUT_MS || '8000');
const DEFAULT_MAX_RETRIES = parseInt(process.env.MCP_MAX_RETRIES || '3');

let requestId = 0;

/**
 * Realiza una llamada JSON-RPC 2.0 al Storefront MCP con timeouts y reintentos
 * @param {string} toolName - Nombre de la herramienta
 * @param {object} toolArguments - Parámetros de la herramienta
 * @param {number} maxRetries - Número máximo de reintentos (default: DEFAULT_MAX_RETRIES)
 * @param {number} timeoutMs - Timeout por intento en ms (default: DEFAULT_TIMEOUT_MS)
 * @returns {Promise<object>} Resultado de la herramienta
 */
async function callMCPTool(toolName, toolArguments, maxRetries = DEFAULT_MAX_RETRIES, timeoutMs = DEFAULT_TIMEOUT_MS) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt === 0) {
        console.log(`[MCP] Llamando ${toolName}:`, JSON.stringify(toolArguments, null, 2).substring(0, 200));
      } else {
        console.log(`[MCP] Reintentando ${toolName} (intento ${attempt}/${maxRetries}, timeout: ${timeoutMs}ms)...`);
      }

      // Execute fetch with timeout
      const result = await fetchWithTimeout(toolName, toolArguments, timeoutMs);
      return result;
    } catch (error) {
      lastError = error;
      const isTimeout = error.name === 'TimeoutError';
      const errorType = isTimeout ? 'TIMEOUT' : 'ERROR';

      console.error(`[MCP] ❌ ${errorType} en ${toolName} (intento ${attempt + 1}/${maxRetries + 1}):`, error.message);

      // Si es el último intento, lanza el error
      if (attempt === maxRetries) {
        throw error;
      }

      // Esperar con backoff exponencial antes de reintentar
      const delayMs = Math.pow(2, attempt) * 500; // 500ms, 1s, 2s, etc.
      console.log(`[MCP] Esperando ${delayMs}ms antes de reintentar...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

/**
 * Ejecuta fetch con timeout
 * @private
 */
async function fetchWithTimeout(toolName, toolArguments, timeoutMs) {
  const id = ++requestId;

  const payload = {
    jsonrpc: "2.0",
    method: "tools/call",
    id,
    params: {
      name: toolName,
      arguments: toolArguments,
    },
  };

  // Create timeout promise
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      const error = new Error(`MCP ${toolName} timed out after ${timeoutMs}ms`);
      error.name = 'TimeoutError';
      error.timeout = timeoutMs;
      reject(error);
    }, timeoutMs);
  });

  // Race between fetch and timeout
  const response = await Promise.race([
    fetch(MCP_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
    timeoutPromise
  ]);

  if (!response.ok) {
    throw new Error(`MCP HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();

  // JSON-RPC puede retornar error
  if (data.error) {
    const errorMsg = data.error.message || JSON.stringify(data.error);
    throw new Error(`MCP Error (${data.error.code}): ${errorMsg}`);
  }

  console.log(`[MCP] ✅ Respuesta de ${toolName}: ${data.result ? "OK" : "vacío"}`);

  // Storefront MCP wraps response in { content: [{ type: "text", text: "..." }] }
  // Extract and parse if needed
  let result = data.result;
  if (result && result.content && Array.isArray(result.content)) {
    const textContent = result.content.find((c) => c.type === "text");
    if (textContent && typeof textContent.text === "string") {
      try {
        result = JSON.parse(textContent.text);
      } catch (e) {
        // If it's not JSON, keep the original text
        result = textContent.text;
      }
    }
  }

  return result;
}

/**
 * Busca productos en el catálogo de la tienda
 * @param {string} query - Búsqueda en lenguaje natural
 * @param {object} options - Opciones adicionales (context, filters, pagination)
 * @returns {Promise<object>} Productos encontrados
 */
async function searchProducts(query, options = {}) {
  const catalogParams = {
    query,
    ...options,
  };

  return callMCPTool("search_catalog", { catalog: catalogParams });
}

/**
 * Obtiene detalles de un producto por ID
 * @param {string} productId - ID del producto (ej: gid://shopify/Product/123)
 * @param {object} options - Opciones (options para variante, country, language)
 * @returns {Promise<object>} Detalles del producto
 */
async function getProductDetails(productId, options = {}) {
  return callMCPTool("get_product_details", {
    product_id: productId,
    ...options,
  });
}

/**
 * Obtiene el estado actual del carrito
 * @param {string} cartId - ID del carrito
 * @returns {Promise<object>} Contenido del carrito con checkout URL
 */
async function getCart(cartId) {
  return callMCPTool("get_cart", { cart_id: cartId });
}

/**
 * Crea o actualiza un carrito
 * @param {object} options - {cartId?, addItems?, updateItems?, removeLineIds?, buyerIdentity?, etc}
 * @returns {Promise<object>} Carrito actualizado con checkout URL
 */
async function updateCart(options) {
  return callMCPTool("update_cart", options);
}

/**
 * Busca información sobre políticas y FAQs de la tienda
 * @param {string} query - Pregunta en lenguaje natural
 * @param {string} context - Contexto adicional (opcional)
 * @returns {Promise<object>} Información de políticas/FAQs
 */
async function searchPolicies(query, context) {
  const params = { query };
  if (context) params.context = context;
  return callMCPTool("search_shop_policies_and_faqs", params);
}

module.exports = {
  searchProducts,
  getProductDetails,
  getCart,
  updateCart,
  searchPolicies,
  callMCPTool,
};
