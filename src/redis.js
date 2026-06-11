// Cliente mínimo para Upstash Redis REST.
// Sin UPSTASH_REDIS_REST_URL/TOKEN configurados, todo es no-op y el bot
// funciona igual que siempre (sesiones solo en memoria). Con ellos, las
// sesiones sobreviven reinicios/redeploys — requisito para WhatsApp,
// donde una conversación puede durar días.

const URL_ENV = "UPSTASH_REDIS_REST_URL";
const TOKEN_ENV = "UPSTASH_REDIS_REST_TOKEN";

function isEnabled() {
  return Boolean(process.env[URL_ENV] && process.env[TOKEN_ENV]);
}

// Ejecuta un comando Redis vía REST. Upstash acepta el comando como
// array JSON en el body: ["SET", "key", "value", "EX", 3600].
async function command(args, timeoutMs = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(process.env[URL_ENV], {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env[TOKEN_ENV]}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Upstash HTTP ${res.status}`);
    }
    const data = await res.json();
    if (data.error) throw new Error(`Upstash: ${data.error}`);
    return data.result;
  } finally {
    clearTimeout(timer);
  }
}

async function get(key) {
  if (!isEnabled()) return null;
  return command(["GET", key]);
}

async function setex(key, ttlSeconds, value) {
  if (!isEnabled()) return null;
  return command(["SET", key, value, "EX", String(ttlSeconds)]);
}

async function del(key) {
  if (!isEnabled()) return null;
  return command(["DEL", key]);
}

module.exports = { isEnabled, get, setex, del };
