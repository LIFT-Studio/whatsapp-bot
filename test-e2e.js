/**
 * End-to-End Test: flujo completo de venta contra el servidor local.
 * Requiere: servidor en :3000 (npm start) y tienda sandbox con "mochila" en catálogo.
 *
 * Flujo (golden path A + foto a pedido + métricas):
 *   descubrimiento → recomendación con imagen → confirmar → carrito →
 *   foto a pedido → política → checkout → /api/metrics suma los 5 eventos.
 *
 * Sale con exit code 1 si cualquier aserción falla.
 */

require("dotenv").config();
const crypto = require("crypto");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const sessionId = crypto.randomUUID();

const IMAGE_MD = /!\[[^\]]*\]\(https?:\/\//;
const ANY_URL = /https?:\/\/[^\s]+/;

const steps = [
  {
    message: "hola, busco una mochila",
    assert: (r) => {
      const fails = [];
      if (!r.response || r.response.trim() === "") fails.push("respuesta vacía");
      return fails;
    },
  },
  {
    message: "es para el trabajo, algo urbano",
    assert: (r) => {
      const fails = [];
      if (!IMAGE_MD.test(r.response)) fails.push("la recomendación no incluye imagen markdown");
      if (!/\$\s?\d/.test(r.response)) fails.push("la recomendación no muestra precio");
      if (r.cart.length !== 0) fails.push("agregó al carrito sin confirmación del cliente");
      return fails;
    },
  },
  {
    message: "sí, agrégala al carrito",
    assert: (r) => {
      const fails = [];
      if (r.cart.length < 1) fails.push(`carrito vacío tras confirmar (cart: ${r.cart.length})`);
      return fails;
    },
  },
  {
    message: "muéstrame una foto",
    assert: (r) => {
      const fails = [];
      if (!IMAGE_MD.test(r.response)) fails.push("pedir foto no devolvió imagen markdown (GAP 5)");
      return fails;
    },
  },
  {
    message: "¿cuál es la política de devoluciones?",
    assert: (r) => {
      const fails = [];
      if (!r.response || r.response.length < 30) fails.push("respuesta de política sospechosamente corta");
      if (r.cart.length < 1) fails.push("el carrito se perdió al preguntar una política");
      return fails;
    },
  },
  {
    message: "listo, quiero pagar",
    assert: (r) => {
      const fails = [];
      if (!ANY_URL.test(r.response)) fails.push("no hay link de checkout en la respuesta");
      if (r.cart.length !== 0) fails.push("el carrito no se limpió tras el checkout");
      return fails;
    },
  },
];

async function chat(message) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, message }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function runTest() {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`🧪 E2E: ${steps.length} mensajes + métricas — session ${sessionId.substring(0, 8)}`);
  console.log(`${"=".repeat(80)}\n`);

  const failures = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    console.log(`📨 ${i + 1}/${steps.length}: "${step.message}"`);
    try {
      const result = await chat(step.message);
      console.log(`   → ${result.response.replace(/\n/g, " ").substring(0, 140)}`);
      console.log(`   📦 cart: ${result.cart.length} items`);
      for (const fail of step.assert(result)) {
        failures.push(`Paso ${i + 1} ("${step.message}"): ${fail}`);
        console.error(`   ❌ ${fail}`);
      }
    } catch (error) {
      failures.push(`Paso ${i + 1}: request falló — ${error.message}`);
      console.error(`   ❌ request falló: ${error.message}`);
    }
    console.log("");
  }

  // Las métricas deben reflejar los 5 eventos de Fase 1 para esta corrida.
  console.log(`📊 Verificando /api/metrics...`);
  try {
    const headers = process.env.METRICS_TOKEN
      ? { Authorization: `Bearer ${process.env.METRICS_TOKEN}` }
      : {};
    const res = await fetch(`${BASE}/api/metrics`, { headers });
    const m = await res.json();
    if (!res.ok) throw new Error(m.error || `HTTP ${res.status}`);
    const expectAtLeast = {
      conversation_started: 1,
      product_searched: 1,
      add_to_cart: 1,
      policy_asked: 1,
      checkout_started: 1,
    };
    for (const [name, min] of Object.entries(expectAtLeast)) {
      if ((m.totals[name] || 0) < min) {
        failures.push(`metrics: ${name} = ${m.totals[name] || 0}, esperado >= ${min}`);
        console.error(`   ❌ ${name} = ${m.totals[name] || 0} (esperado >= ${min})`);
      } else {
        console.log(`   ✓ ${name} = ${m.totals[name]}`);
      }
    }
  } catch (error) {
    failures.push(`GET /api/metrics falló: ${error.message}`);
  }

  console.log(`\n${"=".repeat(80)}`);
  if (failures.length > 0) {
    console.error(`❌ E2E FALLÓ — ${failures.length} problema(s):`);
    failures.forEach((f) => console.error(`   • ${f}`));
    console.log(`${"=".repeat(80)}\n`);
    process.exit(1);
  }
  console.log(`✅ E2E COMPLETO — todas las aserciones pasaron`);
  console.log(`${"=".repeat(80)}\n`);
}

runTest().catch((e) => {
  console.error(`❌ E2E error fatal: ${e.message}`);
  process.exit(1);
});
