// Métricas en memoria para GET /api/metrics.
// Los eventos entran por logEvent (src/ai.js) vía recordEvent y se agregan aquí.
// En memoria por diseño: los contadores se reinician en cada redeploy.
// La persistencia (Upstash Redis) llega en Fase 2 — ver docs/PLAN.md F2-01.

// Ventana máxima consultable. Eventos más viejos se podan.
const WINDOW_DAYS = 7;
const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;
// Cap duro contra crecimiento de memoria sin límite.
const MAX_EVENTS = 50000;
const PRUNE_EVERY = 200;

// Los logs conservan los eventType UPPERCASE históricos (Railway puede estar
// parseándolos); el endpoint expone los nombres que pide docs/PLAN.md Fase 1.
const EVENT_NAMES = {
  SESSION_START: "conversation_started",
  SEARCH: "product_searched",
  ADD_TO_CART: "add_to_cart",
  ADD_FAILED: "add_failed",
  POLICY_ASKED: "policy_asked",
  ORDER_STATUS_ASKED: "order_status_asked",
  CHECKOUT_CREATED: "checkout_started",
  ERROR: "errors",
};

const events = [];
let insertsSincePrune = 0;

function prune(now) {
  const cutoff = now - WINDOW_MS;
  let firstValid = 0;
  while (firstValid < events.length && events[firstValid].ts < cutoff) firstValid++;
  if (firstValid > 0) events.splice(0, firstValid);
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
}

function recordEvent({ timestamp, sessionId, shop, eventType }) {
  const ts = timestamp ? Date.parse(timestamp) : Date.now();
  // Minúsculas siempre: resolveShop normaliza el shop del widget, pero el
  // fallback de entorno (SHOPIFY_SHOP) podría venir con mayúsculas.
  events.push({ ts, sessionId, shop: shop ? String(shop).toLowerCase() : shop, eventType });
  if (++insertsSincePrune >= PRUNE_EVERY) {
    insertsSincePrune = 0;
    prune(Date.now());
  }
}

function getMetrics({ days = WINDOW_DAYS, shop } = {}) {
  const now = Date.now();
  prune(now);

  const windowDays = Math.min(Math.max(1, Number(days) || WINDOW_DAYS), WINDOW_DAYS);
  const since = now - windowDays * 24 * 60 * 60 * 1000;

  const selected = events.filter(
    (e) => e.ts >= since && (!shop || e.shop === shop)
  );

  const totals = {};
  for (const name of Object.values(EVENT_NAMES)) totals[name] = 0;

  const byDay = {};
  const byShop = {};
  const sessionsByEvent = {};

  for (const e of selected) {
    const name = EVENT_NAMES[e.eventType] || e.eventType.toLowerCase();
    totals[name] = (totals[name] || 0) + 1;

    const day = new Date(e.ts).toISOString().slice(0, 10);
    byDay[day] = byDay[day] || {};
    byDay[day][name] = (byDay[day][name] || 0) + 1;

    if (e.shop) byShop[e.shop] = (byShop[e.shop] || 0) + 1;

    sessionsByEvent[e.eventType] = sessionsByEvent[e.eventType] || new Set();
    sessionsByEvent[e.eventType].add(e.sessionId);
  }

  const started = sessionsByEvent.SESSION_START?.size || 0;
  const withAdd = sessionsByEvent.ADD_TO_CART?.size || 0;
  const withCheckout = sessionsByEvent.CHECKOUT_CREATED?.size || 0;
  const rate = (n, d) => (d > 0 ? +(n / d).toFixed(3) : 0);

  return {
    window: {
      days: windowDays,
      since: new Date(since).toISOString(),
      until: new Date(now).toISOString(),
    },
    shop: shop || "all",
    totals,
    by_day: byDay,
    by_shop: byShop,
    sessions: {
      started,
      with_add_to_cart: withAdd,
      with_checkout: withCheckout,
      add_to_cart_rate: rate(withAdd, started),
      checkout_rate: rate(withCheckout, started),
    },
    note: "Métricas en memoria: los contadores se reinician con cada redeploy del servidor.",
  };
}

module.exports = { recordEvent, getMetrics };
