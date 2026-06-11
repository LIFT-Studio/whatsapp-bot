/**
 * Activación del canal WhatsApp — registra el webhook en Meta vía Graph API.
 *
 * Uso:  node scripts/setup-whatsapp.js
 *
 * Requiere en .env: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, META_APP_SECRET,
 * META_APP_ID, WHATSAPP_BUSINESS_ACCOUNT_ID, WHATSAPP_VERIFY_TOKEN.
 * El backend (PUBLIC_URL) debe estar desplegado ANTES de correr esto:
 * Meta verifica el webhook con un GET en el momento del registro.
 *
 * Pasos que ejecuta:
 *   1. Registra el callback del webhook en la app (object whatsapp_business_account).
 *   2. Suscribe la app a la WABA (sin esto, los mensajes no llegan al webhook).
 *   3. Verifica el estado del número (nombre, calidad).
 */
require("dotenv").config();

const GRAPH = "https://graph.facebook.com/v21.0";
const PUBLIC_URL = process.env.PUBLIC_URL || "https://whatsapp-bot-production-a74c.up.railway.app";

const REQUIRED = [
  "WHATSAPP_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "META_APP_SECRET",
  "META_APP_ID",
  "WHATSAPP_BUSINESS_ACCOUNT_ID",
  "WHATSAPP_VERIFY_TOKEN",
];

async function main() {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`❌ Faltan variables en .env: ${missing.join(", ")}`);
    process.exit(1);
  }

  const appToken = `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`;
  const callbackUrl = `${PUBLIC_URL}/webhooks/whatsapp`;

  // 1. Webhook de la app → nuestro endpoint (Meta hace el GET de verificación aquí).
  console.log(`1/3 Registrando webhook: ${callbackUrl}`);
  let res = await fetch(`${GRAPH}/${process.env.META_APP_ID}/subscriptions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      access_token: appToken,
      object: "whatsapp_business_account",
      callback_url: callbackUrl,
      verify_token: process.env.WHATSAPP_VERIFY_TOKEN,
      fields: "messages",
    }),
  });
  let data = await res.json();
  if (!res.ok) {
    console.error(`❌ Registro del webhook falló: ${data.error?.message || JSON.stringify(data)}`);
    console.error(`   ¿El backend está desplegado y responde en ${callbackUrl}?`);
    process.exit(1);
  }
  console.log(`   ✅ Webhook registrado y verificado por Meta`);

  // 2. Suscribir la app a la cuenta de WhatsApp Business.
  console.log(`2/3 Suscribiendo la app a la WABA ${process.env.WHATSAPP_BUSINESS_ACCOUNT_ID}`);
  res = await fetch(`${GRAPH}/${process.env.WHATSAPP_BUSINESS_ACCOUNT_ID}/subscribed_apps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
  });
  data = await res.json();
  if (!res.ok || !data.success) {
    console.error(`❌ Suscripción a la WABA falló: ${data.error?.message || JSON.stringify(data)}`);
    process.exit(1);
  }
  console.log(`   ✅ App suscrita — los mensajes entrantes ya llegan al webhook`);

  // 3. Estado del número.
  console.log(`3/3 Verificando el número...`);
  res = await fetch(
    `${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}?fields=display_phone_number,verified_name,quality_rating,platform_type,status`,
    { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } }
  );
  data = await res.json();
  if (!res.ok) {
    console.error(`❌ No pude leer el número: ${data.error?.message || JSON.stringify(data)}`);
    process.exit(1);
  }
  console.log(`   ✅ ${data.display_phone_number} ("${data.verified_name}") — calidad: ${data.quality_rating}`);

  if (data.platform_type && data.platform_type !== "CLOUD_API") {
    console.warn(`   ⚠️  El número no está registrado en Cloud API (platform_type: ${data.platform_type}).`);
    console.warn(`      Recibirás mensajes pero NO podrás responder (error #133010).`);
    console.warn(`      Regístralo: POST ${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/register`);
    console.warn(`      con body { "messaging_product": "whatsapp", "pin": "<PIN de 6 dígitos>" }`);
    process.exit(1);
  }

  console.log(`\n🎉 Canal WhatsApp activo. Escribe al ${data.display_phone_number} desde tu WhatsApp para probar.`);
}

main().catch((err) => {
  console.error(`❌ Error: ${err.message}`);
  process.exit(1);
});
