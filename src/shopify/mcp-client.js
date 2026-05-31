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

const { withRetry, executeWithTimeout } = require('../utils/retry');
const { resolveShop } = require('./shop-info');

let requestId = 0;

/**
 * Construye el endpoint MCP para una tienda dada (multi-tenant).
 * MCP_URL override gana (para testing). Si shop es inválido/ausente,
 * resolveShop cae al SHOPIFY_SHOP de entorno.
 * @param {string} [shop] - dominio myshopify del tenant
 * @returns {string} endpoint MCP
 */
function mcpEndpoint(shop) {
  if (process.env.MCP_URL) return process.env.MCP_URL;
  return `https://${resolveShop(shop)}/api/mcp`;
}

/**
 * Realiza una llamada JSON-RPC 2.0 al Storefront MCP con reintentos automáticos
 * Usa withRetry() para manejo de timeouts y errores transitorios
 * @param {string} toolName - Nombre de la herramienta
 * @param {object} toolArguments - Parámetros de la herramienta
 * @param {string} [shop] - dominio myshopify del tenant (default: env)
 * @param {number} maxRetries - Número máximo de reintentos (default: 2)
 * @param {number} timeoutMs - Timeout per attempt in milliseconds (default: 8000)
 * @returns {Promise<object>} Resultado de la herramienta
 */
async function callMCPTool(toolName, toolArguments, shop, maxRetries = 2, timeoutMs = 8000) {
  const endpoint = mcpEndpoint(shop);
  console.log(`[MCP] Llamando ${toolName} @ ${endpoint}:`, JSON.stringify(toolArguments, null, 2).substring(0, 200));

  const mcpCall = async () => {
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

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

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
  };

  return withRetry(mcpCall, maxRetries, timeoutMs, `MCP-${toolName}`);
}

/**
 * Busca productos en el catálogo de la tienda
 * @param {string} query - Búsqueda en lenguaje natural
 * @param {object} options - Opciones adicionales (context, filters, pagination)
 * @param {string} [shop] - dominio myshopify del tenant
 * @returns {Promise<object>} Productos encontrados
 */
async function searchProducts(query, options = {}, shop) {
  const catalogParams = {
    query,
    ...options,
  };

  return callMCPTool("search_catalog", { catalog: catalogParams }, shop);
}

/**
 * Obtiene detalles de un producto por ID
 * @param {string} productId - ID del producto (ej: gid://shopify/Product/123)
 * @param {object} options - Opciones (options para variante, country, language)
 * @param {string} [shop] - dominio myshopify del tenant
 * @returns {Promise<object>} Detalles del producto
 */
async function getProductDetails(productId, options = {}, shop) {
  return callMCPTool("get_product_details", {
    product_id: productId,
    ...options,
  }, shop);
}

/**
 * Obtiene el estado actual del carrito
 * @param {string} cartId - ID del carrito
 * @param {string} [shop] - dominio myshopify del tenant
 * @returns {Promise<object>} Contenido del carrito con checkout URL
 */
async function getCart(cartId, shop) {
  return callMCPTool("get_cart", { cart_id: cartId }, shop);
}

/**
 * Crea o actualiza un carrito
 * @param {object} options - {cartId?, addItems?, updateItems?, removeLineIds?, buyerIdentity?, etc}
 * @param {string} [shop] - dominio myshopify del tenant
 * @returns {Promise<object>} Carrito actualizado con checkout URL
 */
async function updateCart(options, shop) {
  return callMCPTool("update_cart", options, shop);
}

/**
 * Busca información sobre políticas y FAQs de la tienda
 * @param {string} query - Pregunta en lenguaje natural
 * @param {string} context - Contexto adicional (opcional)
 * @param {string} [shop] - dominio myshopify del tenant
 * @returns {Promise<object>} Información de políticas/FAQs
 */
async function searchPolicies(query, context, shop) {
  const params = { query };
  if (context) params.context = context;
  return callMCPTool("search_shop_policies_and_faqs", params, shop);
}

module.exports = {
  searchProducts,
  getProductDetails,
  getCart,
  updateCart,
  searchPolicies,
  callMCPTool,
};
