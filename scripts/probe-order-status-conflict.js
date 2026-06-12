// Probe: ¿la REGLA ABSOLUTA de SECCIÓN 4 hace que gemini-2.5-flash omita
// payment_status o links al responder get_order_status?
// Usa el system prompt y tools REALES extraídos de src/ai.js.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "ai.js"), "utf8");

// Extraer buildSystemPrompt (template literal real)
const promptMatch = src.match(/function buildSystemPrompt\(shopName\) \{\n  return `([\s\S]*?)`;\n\}/);
if (!promptMatch) { console.error("no pude extraer buildSystemPrompt"); process.exit(1); }
const buildSystemPrompt = new Function("shopName", "return `" + promptMatch[1] + "`;");

// Extraer const tools = [...] real
const toolsStart = src.indexOf("const tools = [");
const toolsEnd = src.indexOf("\n];", toolsStart);
if (toolsStart < 0 || toolsEnd < 0) { console.error("no pude extraer tools"); process.exit(1); }
const tools = eval("(" + src.slice(toolsStart + "const tools = ".length, toolsEnd + 2).trim() + ")");

const FAKE_ORDER = {
  order: {
    name: "#1010",
    created_at: "2026-06-08T14:00:00Z",
    fulfillment_status: "ya fue enviado",
    payment_status: "con pago pendiente",
    total: "499.90 MXN",
    tracking: [{ number: "MX12345678", url: "https://tracking.dhl.com/MX12345678", company: "DHL" }],
    status_page_url: "https://likershop.example.com/61234/orders/abc123/authenticate?key=xyz",
    estimated_delivery: "2026-06-15T00:00:00Z",
  },
};

async function runOne(genAI, userMsg, label) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: buildSystemPrompt("Likershop"),
    tools,
  });
  const history = [
    { role: "user", parts: [{ text: "hola" }] },
    { role: "model", parts: [{ text: "¡Hola! Bienvenido a Likershop. ¿En qué puedo ayudarte hoy?" }] },
  ];
  const chat = model.startChat({ history });
  let result = await chat.sendMessage(userMsg + "\n[El carrito está vacío]");
  let response = result.response;
  let calledTool = false;
  let loops = 0;
  while (response?.candidates?.[0]?.content?.parts?.some((p) => p.functionCall) && ++loops <= 4) {
    const calls = response.candidates[0].content.parts.filter((p) => p.functionCall);
    const responses = calls.map((p) => {
      if (p.functionCall.name === "get_order_status") calledTool = true;
      return {
        functionResponse: {
          name: p.functionCall.name,
          response: p.functionCall.name === "get_order_status" ? FAKE_ORDER : { error: "n/a" },
        },
      };
    });
    result = await chat.sendMessage(responses);
    response = result.response;
  }
  const text = response.text();
  const mentionsPago = /pago|pagad/i.test(text);
  const hasTrackingLink = text.includes("tracking.dhl.com");
  const hasStatusLink = text.includes("likershop.example.com");
  console.log(`\n--- ${label} ---`);
  console.log(`tool llamada: ${calledTool} | menciona pago: ${mentionsPago} | link tracking: ${hasTrackingLink} | link status: ${hasStatusLink}`);
  console.log(text.trim());
  return { calledTool, mentionsPago, hasTrackingLink, hasStatusLink };
}

(async () => {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const scenarios = [
    ["¿dónde está mi pedido #1010?", "A: dónde está mi pedido"],
    ["¿ya quedó pagado mi pedido #1010? y pásame el link para rastrearlo", "B: pregunta explícita por pago + link"],
  ];
  const tally = {};
  for (const [msg, label] of scenarios) {
    tally[label] = [];
    for (let i = 1; i <= 3; i++) {
      try {
        tally[label].push(await runOne(genAI, msg, `${label} (run ${i})`));
      } catch (e) {
        console.error(`${label} run ${i} ERROR: ${e.message}`);
      }
    }
  }
  console.log("\n===== RESUMEN =====");
  for (const [label, runs] of Object.entries(tally)) {
    const n = runs.length;
    console.log(
      `${label}: pago ${runs.filter((r) => r.mentionsPago).length}/${n}, tracking link ${runs.filter((r) => r.hasTrackingLink).length}/${n}, status link ${runs.filter((r) => r.hasStatusLink).length}/${n}`
    );
  }
})();
