// Express server
require("dotenv").config();
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const rateLimit = require("express-rate-limit");
const { processMessage } = require("./ai");
const { getSession, startCleanupJob } = require("./session");
const { isValidShop } = require("./shopify/shop-info");
const { getMetrics } = require("./metrics");

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy: required for rate limiting to work behind Railway's proxy
app.set('trust proxy', 1);

// Rate limiter for /api/chat endpoint: 30 requests per minute per IP
const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // limit each IP to 30 requests per windowMs
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  handler: (req, res) => {
    res.status(429).json({ error: "Demasiadas solicitudes, espera un momento." });
  },
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.post("/api/chat", chatLimiter, async (req, res) => {
  try {
    // Solo UUIDs (lo que genera este server): acota la memoria que un sessionId
    // arbitrario retendría en sesiones y métricas. Cualquier otra cosa → uno nuevo.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const sessionId = (typeof req.body.sessionId === "string" && UUID_RE.test(req.body.sessionId))
      ? req.body.sessionId
      : crypto.randomUUID();
    const { message, shop } = req.body;
    const logPrefix = `[SERVER] [${sessionId.substring(0, 8)}...]`;

    if (!message) {
      console.warn(`${logPrefix} missing message in request`);
      return res.status(400).json({ error: "message is required" });
    }

    // Multi-tenant: si el widget manda shop, debe ser un dominio myshopify válido.
    // Si no lo manda, processMessage cae al SHOPIFY_SHOP de entorno (modo standalone).
    if (shop !== undefined && !isValidShop(shop)) {
      console.warn(`${logPrefix} invalid shop rejected: ${shop}`);
      return res.status(400).json({ error: "shop inválido" });
    }

    console.log(`${logPrefix} processing message: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"${shop ? ` [shop: ${shop}]` : ''}`);

    const result = await processMessage(sessionId, message, shop);

    console.log(`${logPrefix} response generated successfully`);

    // Check if this is a handled error (errorType field present)
    if (result.errorType) {
      // Handled error: return HTTP 200 with error details in response
      console.log(`${logPrefix} handled error: ${result.errorType}`);
      return res.status(200).json({
        sessionId,
        response: result.response,
        errorType: result.errorType,
        state: result.state,
        cart: result.cart,
        shopName: result.shopName,
      });
    }

    // Success case: return HTTP 200 with normal response
    res.status(200).json({
      sessionId,
      response: result.response,
      state: result.state,
      cart: result.cart,
      shopName: result.shopName,
    });
  } catch (error) {
    console.error(`[SERVER] POST /api/chat unhandled error: ${error.message}`);
    // Unhandled exception: return HTTP 500
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/session/:sessionId", (req, res) => {
  const session = getSession(req.params.sessionId);
  res.json({ id: session.id, state: session.state, cart: session.cart });
});

// Rate limit propio para métricas: requests anónimos baratos pero acotados.
const metricsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: "Demasiadas solicitudes, espera un momento." });
  },
});

// Agregados de telemetría de los últimos 7 días (Fase 1).
// Sin METRICS_TOKEN configurado solo se sirven totales globales; el desglose
// por tenant (by_shop, ?shop=) exige el token — la lista de clientes y sus
// KPIs no quedan expuestos a cualquiera. Auth real por tenant llega en Fase 3.
app.get("/api/metrics", metricsLimiter, (req, res) => {
  let authed = false;
  if (process.env.METRICS_TOKEN) {
    // Comparación timing-safe: hashear ambos lados normaliza longitudes.
    const a = crypto.createHash("sha256").update(req.headers.authorization || "").digest();
    const b = crypto.createHash("sha256").update(`Bearer ${process.env.METRICS_TOKEN}`).digest();
    if (!crypto.timingSafeEqual(a, b)) {
      return res.status(401).json({ error: "No autorizado" });
    }
    authed = true;
  }

  const { shop, days } = req.query;
  if (shop !== undefined) {
    if (!authed) {
      return res.status(401).json({ error: "El filtro por shop requiere METRICS_TOKEN configurado" });
    }
    if (!isValidShop(shop)) {
      return res.status(400).json({ error: "shop inválido" });
    }
  }

  // Los eventos guardan el shop en minúsculas (resolveShop normaliza).
  const metrics = getMetrics({ days, shop: shop && String(shop).toLowerCase() });
  if (!authed) delete metrics.by_shop;
  res.json(metrics);
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);

  // Start session cleanup job
  startCleanupJob();
});

module.exports = app;
