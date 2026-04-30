// Express server
require("dotenv").config();
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const rateLimit = require("express-rate-limit");
const { processMessage } = require("./ai");
const { getSession, startCleanupJob } = require("./session");

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
    const sessionId = req.body.sessionId || crypto.randomUUID();
    const { message } = req.body;
    const logPrefix = `[SERVER] [${sessionId.substring(0, 8)}...]`;

    if (!message) {
      console.warn(`${logPrefix} missing message in request`);
      return res.status(400).json({ error: "message is required" });
    }

    console.log(`${logPrefix} processing message: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`);

    const result = await processMessage(sessionId, message);

    console.log(`${logPrefix} response generated successfully`);

    res.json({
      sessionId,
      response: result.response,
      state: result.state,
      cart: result.cart,
    });
  } catch (error) {
    console.error(`[SERVER] POST /api/chat error: ${error.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/session/:sessionId", (req, res) => {
  const session = getSession(req.params.sessionId);
  res.json({ id: session.id, state: session.state, cart: session.cart });
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
