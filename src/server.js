// Express server
require("dotenv").config();
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const rateLimit = require("express-rate-limit");
const { processMessage } = require("./ai");
const { startCleanupJob } = require("./session");
const { isValidShop } = require("./shopify/shop-info");
const { getMetrics } = require("./metrics");
const whatsapp = require("./channels/whatsapp");

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

// rawBody se necesita para verificar la firma HMAC de los webhooks de Meta
// (la firma es sobre los bytes crudos, no sobre el JSON re-serializado).
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; },
}));
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
    const clientSentId = typeof req.body.sessionId === "string" && UUID_RE.test(req.body.sessionId);
    const sessionId = clientSentId ? req.body.sessionId : crypto.randomUUID();
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

    // skipHydrate: si el UUID lo acabamos de acuñar, el GET a Redis sería
    // un miss garantizado — ahorrarse esa latencia.
    const result = await processMessage(sessionId, message, shop, { skipHydrate: !clientSentId });

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

// GET /api/session/:sessionId eliminado: ningún frontend lo usaba, creaba
// sesiones fantasma, y con el canal WhatsApp se volvió una fuga — el ID de
// esas sesiones es "wa:<teléfono>", adivinable, y exponía el carrito ajeno.

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

// ── Webhook de WhatsApp (Meta Cloud API) ────────────────────────────────────

// Verificación inicial: Meta llama GET con hub.verify_token al registrar el webhook.
app.get("/webhooks/whatsapp", (req, res) => {
  const challenge = whatsapp.verifyChallenge(req.query);
  if (challenge) {
    console.log("[WA] webhook verificado por Meta");
    return res.status(200).send(challenge);
  }
  console.warn("[WA] intento de verificación con token inválido");
  res.sendStatus(403);
});

// Dedup de entregas: Meta reintenta si no respondemos rápido; sin esto un
// mensaje lento (Gemini tarda segundos) se procesaría dos veces.
const processedMessages = new Set();
const PROCESSED_CAP = 500;
function alreadyProcessed(messageId) {
  if (processedMessages.has(messageId)) return true;
  processedMessages.add(messageId);
  if (processedMessages.size > PROCESSED_CAP) {
    // Set itera en orden de inserción: borrar el más viejo.
    processedMessages.delete(processedMessages.values().next().value);
  }
  return false;
}

// Cola por sesión: dos mensajes rápidos del mismo usuario deben procesarse
// EN ORDEN (en paralelo, ambos verían historial vacío y saludarían dos veces).
const sessionQueues = new Map();
function enqueueForSession(sessionId, job) {
  const prev = sessionQueues.get(sessionId) || Promise.resolve();
  const next = prev.then(job, job); // el job corre aunque el anterior falle
  sessionQueues.set(sessionId, next);
  // Limpieza: si nadie encoló mientras corría, soltar la referencia.
  next.finally(() => {
    if (sessionQueues.get(sessionId) === next) sessionQueues.delete(sessionId);
  });
  return next;
}

// Rate limit del webhook: Meta real manda ráfagas modestas; esto acota el
// trabajo (parse + HMAC) que un atacante sin firma puede provocar.
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.sendStatus(429),
});

// PII: nunca loguear el número completo del cliente — los últimos 4 dígitos
// bastan para correlacionar en debugging.
const maskPhone = (p) => `…${String(p).slice(-4)}`;

app.post("/webhooks/whatsapp", webhookLimiter, (req, res) => {
  // 403 también cuando el canal no está configurado: misma respuesta que una
  // firma inválida, no revelar el estado de configuración a un caller anónimo.
  if (!whatsapp.isConfigured()) {
    return res.sendStatus(403);
  }
  if (!whatsapp.isValidSignature(req.rawBody, req.headers["x-hub-signature-256"])) {
    console.warn("[WA] firma HMAC inválida — payload rechazado");
    return res.sendStatus(403);
  }

  // Ack inmediato: Meta exige respuesta en segundos; Gemini tarda más.
  res.sendStatus(200);

  const messages = whatsapp.parseIncoming(req.body);
  for (const msg of messages) {
    if (alreadyProcessed(msg.messageId)) continue;

    // Eventos que no son contenido del cliente (👍 a un mensaje, cambio de
    // número, efímeros): ignorar en silencio, no merecen disculpa.
    if (msg.type === "reaction" || msg.type === "system" || msg.type === "ephemeral") continue;

    if (msg.type !== "text" || !msg.text) {
      // Audios/imágenes entrantes son Fase 4 — responder algo amable, no silencio.
      whatsapp
        .sendText(msg.from, "Por ahora solo puedo leer mensajes de texto 🙏 ¿Me escribes qué estás buscando?")
        .catch((err) => console.error(`[WA] respuesta a tipo no soportado falló: ${err.message}`));
      continue;
    }

    const sessionId = `wa:${msg.from}`;
    console.log(`[WA] [${maskPhone(msg.from)}] mensaje entrante: "${msg.text.substring(0, 60)}"`);
    whatsapp.markAsRead(msg.messageId);
    whatsapp.sendTyping(msg.from);

    enqueueForSession(sessionId, () =>
      processMessage(sessionId, msg.text, undefined)
        .then((result) => whatsapp.sendOutgoing(msg.from, result.response))
        .then(() => console.log(`[WA] [${maskPhone(msg.from)}] respuesta enviada`))
        .catch((err) => {
          console.error(`[WA] [${maskPhone(msg.from)}] error procesando: ${err.message}`);
          whatsapp
            .sendText(msg.from, "Disculpa, tuve un problema técnico. ¿Me lo repites en un momento?")
            .catch(() => {});
        })
    );
  }
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
