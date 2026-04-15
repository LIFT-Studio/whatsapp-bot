// Session Store module
const sessions = new Map();

function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      id: sessionId,
      state: "BROWSING",
      cart: [],
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

function clearCart(sessionId) {
  const session = getSession(sessionId);
  session.cart = [];
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
  addToCart,
  clearCart,
  deleteSession,
};
