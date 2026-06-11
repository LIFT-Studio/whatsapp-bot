// Canal WhatsApp — Meta Cloud API (Graph API).
//
// Contrato (docs/PLAN.md F2-03):
//   entrada Meta webhook → parseIncoming() → processMessage(sessionKey, text)
//   → formatOutgoing() → sendOutgoing() vía Graph API.
//
// sessionKey = "wa:<E.164>" — el número del cliente identifica su sesión,
// así la conversación y el carrito sobreviven entre mensajes (con Redis,
// también entre redeploys).
//
// Solo modo reactivo: respondemos cuando el cliente escribe (la ventana de
// 24h de Meta siempre está abierta en ese caso). Templates proactivos son
// Fase 4.

const crypto = require("crypto");

const GRAPH_VERSION = "v21.0";

function isConfigured() {
  return Boolean(
    process.env.WHATSAPP_TOKEN &&
    process.env.WHATSAPP_PHONE_NUMBER_ID &&
    process.env.META_APP_SECRET &&
    process.env.WHATSAPP_VERIFY_TOKEN
  );
}

// ── Verificación del webhook ─────────────────────────────────────────────────

// GET /webhooks/whatsapp: Meta manda hub.mode/hub.verify_token/hub.challenge.
// Devolver el challenge solo si el token coincide.
function verifyChallenge(query) {
  if (
    query["hub.mode"] === "subscribe" &&
    typeof query["hub.verify_token"] === "string" &&
    process.env.WHATSAPP_VERIFY_TOKEN &&
    safeEqual(query["hub.verify_token"], process.env.WHATSAPP_VERIFY_TOKEN)
  ) {
    return query["hub.challenge"];
  }
  return null;
}

// POST: Meta firma el body crudo con HMAC SHA-256 del App Secret en
// X-Hub-Signature-256 ("sha256=<hex>").
function isValidSignature(rawBody, signatureHeader) {
  if (!process.env.META_APP_SECRET || !signatureHeader || !rawBody) return false;
  const expected = "sha256=" + crypto
    .createHmac("sha256", process.env.META_APP_SECRET)
    .update(rawBody)
    .digest("hex");
  return safeEqual(signatureHeader, expected);
}

function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// ── Parseo de entrada ────────────────────────────────────────────────────────

/**
 * Extrae los mensajes de un payload de webhook de Meta.
 * Solo procesamos texto en Fase 2; otros tipos se reportan como
 * unsupported para responder con un mensaje amable.
 * @returns {Array<{from, text, messageId, profileName, type}>}
 */
function parseIncoming(body) {
  const out = [];
  if (body?.object !== "whatsapp_business_account") return out;
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value;
      if (!value?.messages) continue; // statuses (delivered/read) se ignoran
      const profileName = value.contacts?.[0]?.profile?.name;
      for (const msg of value.messages) {
        out.push({
          from: msg.from,                       // E.164 sin "+" (ej: "50761234567")
          messageId: msg.id,
          type: msg.type,
          text: msg.type === "text" ? msg.text?.body : null,
          profileName,
        });
      }
    }
  }
  return out;
}

// ── Formateo de salida ───────────────────────────────────────────────────────

/**
 * Convierte la respuesta markdown del bot al formato WhatsApp:
 * - ![alt](url) → se extraen como mensajes de imagen separados
 * - [label](url) → "label: url" (WhatsApp no tiene links con texto)
 * - **negrita** → *negrita* (sintaxis WhatsApp)
 * @returns {{text: string, images: Array<{url, caption}>}}
 */
function formatOutgoing(responseText) {
  const images = [];
  let text = (responseText || "").replace(
    /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g,
    (m, alt, url) => {
      images.push({ url, caption: alt || undefined });
      return "";
    }
  );
  // El label puede quedar vacío si solo contenía una imagen ya extraída
  // (caso [![alt](img)](link)) — dejar la URL sola, no "[](url)".
  text = text.replace(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g,
    (m, label, url) => (label.trim() ? `${label}: ${url}` : url));
  text = text.replace(/\*{3}([^*]+)\*{3}/g, "*$1*"); // ***x*** → *x*
  text = text.replace(/\*\*(.+?)\*\*/g, "*$1*");     // **x** → *x*, tolera * internos
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  return { text, images };
}

// ── Cliente Graph API ────────────────────────────────────────────────────────

async function graphPost(payload) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  if (process.env.WHATSAPP_DRY_RUN === "1") {
    console.log(`[WA] DRY RUN — no se envía a Meta:`, JSON.stringify(payload).substring(0, 300));
    return { dryRun: true };
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Graph API ${res.status}: ${data.error?.message || JSON.stringify(data)}`);
  }
  return data;
}

// Trunca sin partir un par sustituto (emoji) en el borde: un surrogate alto
// suelto hace que Meta rechace o corrompa el mensaje.
function truncate(str, max) {
  let out = str.substring(0, max);
  const last = out.charCodeAt(out.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) out = out.slice(0, -1);
  return out;
}

async function sendText(to, text) {
  if (!text) return null;
  return graphPost({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { body: truncate(text, 4096), preview_url: true },
  });
}

async function sendImage(to, url, caption) {
  return graphPost({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "image",
    image: caption ? { link: url, caption: truncate(caption, 1024) } : { link: url },
  });
}

// Marca el mensaje entrante como leído (doble check azul) — buena señal de
// "el negocio te está atendiendo" mientras Gemini procesa.
async function markAsRead(messageId) {
  try {
    await graphPost({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    });
  } catch (err) {
    console.warn(`[WA] markAsRead falló (no crítico): ${err.message}`);
  }
}

/**
 * Envía la respuesta completa del bot: imágenes primero (el producto se VE),
 * luego el texto. Las imágenes vienen del CDN de Shopify — URLs públicas que
 * Meta acepta directo.
 */
async function sendOutgoing(to, responseText) {
  const { text, images } = formatOutgoing(responseText);
  for (const img of images.slice(0, 3)) { // máx 3 imágenes por respuesta
    try {
      await sendImage(to, img.url, img.caption);
    } catch (err) {
      console.error(`[WA] sendImage falló: ${err.message}`);
    }
  }
  if (text) await sendText(to, text);
}

module.exports = {
  isConfigured,
  verifyChallenge,
  isValidSignature,
  parseIncoming,
  formatOutgoing,
  sendText,
  sendImage,
  sendOutgoing,
  markAsRead,
};
