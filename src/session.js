// Session Store module
//
// El Map en memoria sigue siendo el working store (toda la API pública es
// síncrona, igual que siempre). Con Upstash configurado, processMessage
// hidrata la sesión desde Redis al entrar (hydrateSession) y la persiste al
// salir (persistSession) — write-through. Sin Upstash, ambos son no-op.
const redis = require("./redis");

const sessions = new Map();

// Cap de historial almacenado: WhatsApp mantiene conversaciones por días y
// sin tope el payload de Redis (y el costo de Gemini) crece sin límite.
const MAX_STORED_MESSAGES = 80;

function redisKey(sessionId) {
  return `session:${sessionId}`;
}

function ttlSeconds() {
  return parseInt(process.env.SESSION_TTL_HOURS || "24", 10) * 3600;
}

/**
 * Carga la sesión desde Redis al Map si no está en memoria (tras un
 * reinicio del servidor). Llamar UNA vez al inicio de processMessage;
 * después, todos los getSession síncronos trabajan sobre el Map.
 */
async function hydrateSession(sessionId) {
  if (sessions.has(sessionId)) return sessions.get(sessionId);
  if (!redis.isEnabled()) return null;
  try {
    const raw = await redis.get(redisKey(sessionId));
    // Re-check tras el await: otro request concurrente pudo crear/mutar la
    // sesión mientras esperábamos el GET — no pisarla con la copia de Redis.
    if (sessions.has(sessionId)) return sessions.get(sessionId);
    if (raw) {
      const session = JSON.parse(raw);
      sessions.set(sessionId, session);
      console.log(`[SESSION] ${sessionId.substring(0, 12)}... hidratada desde Redis (${session.messages?.length || 0} msgs)`);
      return session;
    }
  } catch (err) {
    // Redis caído no debe tumbar el chat: se sigue solo en memoria.
    console.error(`[SESSION] hydrate falló (${err.message}) — continúo en memoria`);
  }
  return null;
}

/**
 * Persiste la sesión actual a Redis con TTL. Nunca lanza: un fallo de
 * persistencia no debe romper la respuesta al cliente.
 */
async function persistSession(sessionId) {
  if (!redis.isEnabled()) return;
  const session = sessions.get(sessionId);
  if (!session) return;
  try {
    await redis.setex(redisKey(sessionId), ttlSeconds(), JSON.stringify(session));
  } catch (err) {
    console.error(`[SESSION] persist falló (${err.message}) — la sesión sigue en memoria`);
  }
}

function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      id: sessionId,
      state: "BROWSING",
      cart: [],
      cartId: null,
      cartTotal: "0.00",
      productCache: [],   // resultados de búsqueda recientes (para resolver adds por título)
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
  if (session.messages.length > MAX_STORED_MESSAGES) {
    session.messages.splice(0, session.messages.length - MAX_STORED_MESSAGES);
  }
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
  // Fire-and-forget: si Redis falla, el TTL la expira igual.
  redis.del(redisKey(sessionId)).catch(() => {});
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
  hydrateSession,
  persistSession,
};
