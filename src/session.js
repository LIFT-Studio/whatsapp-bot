// Session Store module
const sessions = new Map();

function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      id: sessionId,
      state: "BROWSING",
      cart: [],
      cartId: null,
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
  } else {
    // Map MCP lines to session.cart format
    session.cart = mcpCart.lines.map(line => ({
      line_id: line.id,                      // For MCP operations (remove/update)
      variant_id: line.product_variant_id,   // For display and user reference
      quantity: line.quantity,
      title: line.title || line.product_title || "Unknown Product",
      price: line.price || "0.00"
    }));
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
  session.updatedAt = new Date().toISOString();
  return session;
}

function deleteSession(sessionId) {
  sessions.delete(sessionId);
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
};
