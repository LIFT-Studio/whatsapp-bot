/**
 * Test del webhook de WhatsApp contra el servidor local.
 *
 * Correr el servidor con credenciales dummy y dry-run (no llama a Meta):
 *   WHATSAPP_TOKEN=dummy WHATSAPP_PHONE_NUMBER_ID=123 META_APP_SECRET=testsecret \
 *   WHATSAPP_DRY_RUN=1 npm start
 *
 * Luego:  META_APP_SECRET=testsecret node test-whatsapp-webhook.js
 *
 * Verifica: challenge GET, rechazo de token/firma inválidos, y que un mensaje
 * de texto firmado correctamente se acepte (la respuesta del bot sale por
 * dry-run en el log del servidor). Exit code 1 si algo falla.
 */
require("dotenv").config();
const crypto = require("crypto");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const SECRET = process.env.META_APP_SECRET;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

if (!SECRET || !VERIFY_TOKEN) {
  console.error("❌ Necesito META_APP_SECRET y WHATSAPP_VERIFY_TOKEN en el entorno/.env");
  process.exit(1);
}

function sign(body) {
  return "sha256=" + crypto.createHmac("sha256", SECRET).update(body).digest("hex");
}

function metaPayload(text, messageId) {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{
      id: "TEST_WABA",
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: { display_phone_number: "13053398652", phone_number_id: "123" },
          contacts: [{ profile: { name: "Tester" }, wa_id: "50761234567" }],
          messages: [{
            from: "50761234567",
            id: messageId,
            timestamp: String(Math.floor(Date.now() / 1000)),
            type: "text",
            text: { body: text },
          }],
        },
      }],
    }],
  });
}

const failures = [];
async function check(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    failures.push(`${name}: ${err.message}`);
    console.error(`❌ ${name}: ${err.message}`);
  }
}

async function run() {
  await check("GET verificación con token correcto devuelve el challenge", async () => {
    const res = await fetch(
      `${BASE}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(VERIFY_TOKEN)}&hub.challenge=reto-42`
    );
    const body = await res.text();
    if (res.status !== 200 || body !== "reto-42") throw new Error(`HTTP ${res.status}, body "${body}"`);
  });

  await check("GET con token incorrecto → 403", async () => {
    const res = await fetch(
      `${BASE}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=malo&hub.challenge=x`
    );
    if (res.status !== 403) throw new Error(`HTTP ${res.status}, esperaba 403`);
  });

  await check("POST sin firma → 403", async () => {
    const body = metaPayload("hola", "wamid.nofirma");
    const res = await fetch(`${BASE}/webhooks/whatsapp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (res.status !== 403) throw new Error(`HTTP ${res.status}, esperaba 403`);
  });

  await check("POST con firma inválida → 403", async () => {
    const body = metaPayload("hola", "wamid.firmamala");
    const res = await fetch(`${BASE}/webhooks/whatsapp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": "sha256=" + "0".repeat(64),
      },
      body,
    });
    if (res.status !== 403) throw new Error(`HTTP ${res.status}, esperaba 403`);
  });

  await check("POST firmado correctamente → 200 (mensaje aceptado)", async () => {
    const body = metaPayload("hola, ¿tienen mochilas?", `wamid.ok-${Date.now()}`);
    const res = await fetch(`${BASE}/webhooks/whatsapp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Hub-Signature-256": sign(body) },
      body,
    });
    if (res.status !== 200) throw new Error(`HTTP ${res.status}, esperaba 200`);
  });

  await check("POST duplicado (mismo message id) → 200 sin reprocesar", async () => {
    const body = metaPayload("hola de nuevo", "wamid.duplicado-fijo");
    for (let i = 0; i < 2; i++) {
      const res = await fetch(`${BASE}/webhooks/whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Hub-Signature-256": sign(body) },
        body,
      });
      if (res.status !== 200) throw new Error(`HTTP ${res.status} en intento ${i + 1}`);
    }
  });

  await check("POST de reaction (👍) → 200 y se ignora en silencio", async () => {
    const body = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        id: "TEST_WABA",
        changes: [{
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: {},
            messages: [{
              from: "50761234567",
              id: `wamid.react-${Date.now()}`,
              timestamp: "1",
              type: "reaction",
              reaction: { message_id: "wamid.x", emoji: "👍" },
            }],
          },
        }],
      }],
    });
    const res = await fetch(`${BASE}/webhooks/whatsapp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Hub-Signature-256": sign(body) },
      body,
    });
    if (res.status !== 200) throw new Error(`HTTP ${res.status}, esperaba 200`);
  });

  await check("formatOutgoing: markdown anidado y casos borde", async () => {
    const { formatOutgoing } = require("./src/channels/whatsapp");
    const cases = [
      // imagen dentro de link: no debe quedar "[](url)"
      { in: "Mira: [![Mochila](https://cdn.com/a.png)](https://tienda.com/p/1)",
        expectText: "Mira: https://tienda.com/p/1", expectImages: 1 },
      // ***negrita+cursiva*** → *negrita*
      { in: "***Oferta*** especial", expectText: "*Oferta* especial", expectImages: 0 },
      // ** con asteriscos internos
      { in: "**2 * 3 = 6**", expectText: "*2 * 3 = 6*", expectImages: 0 },
    ];
    for (const c of cases) {
      const out = formatOutgoing(c.in);
      if (out.text !== c.expectText) throw new Error(`"${c.in}" → "${out.text}", esperaba "${c.expectText}"`);
      if (out.images.length !== c.expectImages) throw new Error(`"${c.in}" → ${out.images.length} imágenes, esperaba ${c.expectImages}`);
    }
  });

  console.log(`\n${failures.length === 0 ? "✅ WEBHOOK OK — todas las verificaciones pasaron" : `❌ ${failures.length} fallo(s)`}`);
  console.log("ℹ️  La respuesta del bot al mensaje firmado sale como 'DRY RUN' en el log del servidor (espera ~10s).");
  process.exit(failures.length === 0 ? 0 : 1);
}

run().catch((e) => { console.error(e); process.exit(1); });
