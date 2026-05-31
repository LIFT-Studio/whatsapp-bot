// Session Store module
const sessions = new Map();

function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      id: sessionId,
      state: "BROWSING",
      cart: [],
      cartId: null,
      cartTotal: "0.00",
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
  return sessions.get(sessionId);
}

function updateSession(sessionId, updates) {
  const session = getSession(sessionId);
  Object.assign(session, updates, { updatedAt: new Date().toISOString() });
  return session;
}

function addMessage(sessionId, role, content) {
  const session = getSession(sessionId);
  session.messages.push({ role, content, timestamp: new Date().toISOString() });
  session.updatedAt = new Date().toISOString();
  return session;
}

/**
 * Synchronize local cart with MCP response
 * Maps MCP line items to session.cart with both line_id (for operations) and variant_id (for display)
 * @param {string} sessionId - Session ID
 * @param {object} mcpCart - Cart response from MCP with {id, lines, checkout_url}
 * @returns {object} Updated session
 */
function syncCartFromMCP(sessionId, mcpCart) {
  const session = getSession(sessionId);

  if (!mcpCart || !mcpCart.lines) {
    session.cart = [];
    session.cartTotal = "0.00";
  } else {
    // Map MCP lines to session.cart format
    session.cart = mcpCart.lines.map(line => {
      // Extract variant ID from merchandise.id
      const variantId = line.merchandise?.id || "unknown";
      // Extract product title
      const title = line.merchandise?.product?.title || "Unknown Product";
      // IMPORTANTE: el MCP devuelve cost.subtotal_amount como el SUBTOTAL DE LA LÍNEA
      // (precio unitario × cantidad), NO el precio unitario. Guardamos el unitario
      // (price) y el subtotal de línea (line_total) por separado para no contar la
      // cantidad dos veces al calcular el total.
      const qty = line.quantity || 1;
      const lineTotal = parseFloat(line.cost?.subtotal_amount?.amount || "0");
      const unitPrice = qty > 0 ? lineTotal / qty : lineTotal;

      return {
        line_id: line.id,                 // For MCP operations (remove/update)
        variant_id: variantId,            // For display and user reference
        quantity: qty,
        title: title,
        price: unitPrice.toFixed(2),      // precio UNITARIO
        line_total: lineTotal.toFixed(2), // subtotal de la línea (exacto del MCP)
      };
    });

    // Total autoritativo calculado por Shopify (no lo recalculamos a mano).
    // Normalizamos a 2 decimales: Shopify puede devolver "299.9" en vez de "299.90".
    // Fallback: suma de los subtotales de línea (exactos) si no viene el cost del carrito.
    const rawTotal = mcpCart.cost?.total_amount?.amount;
    session.cartTotal = rawTotal != null
      ? parseFloat(rawTotal).toFixed(2)
      : session.cart.reduce((s, i) => s + parseFloat(i.line_total), 0).toFixed(2);
  }

  session.updatedAt = new Date().toISOString();
  return session;
}

/**
 * Set cartId explicitly (called after successful updateCart from MCP)
 * @param {string} sessionId - Session ID
 * @param {string} cartId - Cart ID from MCP
 * @returns {object} Updated session
 */
function setCartId(sessionId, cartId) {
  const session = getSession(sessionId);
  session.cartId = cartId;
  session.updatedAt = new Date().toISOString();
  return session;
}

function addToCart(sessionId, item) {
  const session = getSession(sessionId);
  session.cart.push({
    variant_id: item.variant_id,
    quantity: item.quantity,
    title: item.title,
    price: item.price,
  });
  session.updatedAt = new Date().toISOString();
  return session;
}

function removeFromCart(sessionId, variantId) {
  const session = getSession(sessionId);
  session.cart = session.cart.filter((item) => item.variant_id !== variantId);
  session.updatedAt = new Date().toISOString();
  return session;
}

function updateCartItem(sessionId, variantId, newQuantity) {
  const session = getSession(sessionId);
  const item = session.cart.find((i) => i.variant_id === variantId);
  if (item) {
    item.quantity = newQuantity;
  }
  session.updatedAt = new Date().toISOString();
  return session;
}

function clearCart(sessionId) {
  const session = getSession(sessionId);
  session.cart = [];
  session.cartId = null;
  session.cartTotal = "0.00";
  session.updatedAt = new Date().toISOString();
  return session;
}

function deleteSession(sessionId) {
  sessions.delete(sessionId);
}

/**
 * Clean expired sessions based on TTL (Time To Live)
 * Removes sessions that haven't been updated in more than SESSION_TTL_HOURS
 * @returns {object} Cleanup stats {sessionsDeleted, totalSessions}
 */
function cleanExpiredSessions() {
  const ttlHours = parseInt(process.env.SESSION_TTL_HOURS || "24", 10);
  const ttlMs = ttlHours * 60 * 60 * 1000;
  const now = new Date();
  let sessionsDeleted = 0;
  const totalBefore = sessions.size;

  for (const [sessionId, session] of sessions.entries()) {
    const lastUpdated = new Date(session.updatedAt);
    const ageMs = now - lastUpdated;

    if (ageMs > ttlMs) {
      sessions.delete(sessionId);
      sessionsDeleted++;
    }
  }

  const totalAfter = sessions.size;
  console.log(
    `[SESSION] Cleanup completed: Deleted ${sessionsDeleted} expired sessions (${ttlHours}h TTL). Total: ${totalBefore} → ${totalAfter}`
  );

  return { sessionsDeleted, totalSessions: totalAfter };
}

/**
 * Start automatic session cleanup job
 * Runs cleanup every hour by default
 * Interval can be customized via CLEANUP_INTERVAL_MS environment variable
 */
function startCleanupJob() {
  const intervalMs = parseInt(process.env.CLEANUP_INTERVAL_MS || "3600000", 10); // 1 hour default
  const intervalHours = intervalMs / (60 * 60 * 1000);

  console.log(
    `[SESSION] Starting cleanup job: runs every ${intervalHours.toFixed(2)} hours`
  );

  const cleanupInterval = setInterval(() => {
    cleanExpiredSessions();
  }, intervalMs);

  // Optional: Store reference for graceful shutdown
  return cleanupInterval;
}

module.exports = {
  getSession,
  updateSession,
  addMessage,
  syncCartFromMCP,
  setCartId,
  addToCart,
  removeFromCart,
  updateCartItem,
  clearCart,
  deleteSession,
  cleanExpiredSessions,
  startCleanupJob,
};
