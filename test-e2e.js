/**
 * End-to-End Test: 4-message flow
 * Tests complete conversation: search → add to cart → policy question → checkout
 */

const http = require("http");
const crypto = require("crypto");

const sessionId = crypto.randomUUID();
const messages = [
  "hola, busco una mochila",
  "agrégame una al carrito",
  "¿cuál es la política de devoluciones?",
  "quiero pagar",
];

function makeRequest(message) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ sessionId, message });

    const options = {
      hostname: "localhost",
      port: 3000,
      path: "/api/chat",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": data.length,
      },
    };

    const req = http.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function runTest() {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`🧪 END-TO-END TEST: 4-MESSAGE FLOW`);
  console.log(`Session ID: ${sessionId}`);
  console.log(`${"=".repeat(80)}\n`);

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    console.log(`📨 Message ${i + 1}: "${message}"`);
    console.log("-".repeat(80));

    try {
      const result = await makeRequest(message);

      if (result.error) {
        console.error(`❌ Error:`, result.error);
      } else {
        console.log(`✅ Response:`);
        console.log(`   ${result.response}`);
        console.log(`\n📦 Cart:`, result.cart.length, "items");
        if (result.cart.length > 0) {
          result.cart.forEach((item, idx) => {
            console.log(`   ${idx + 1}. ${item.title} (qty: ${item.quantity}, price: ${item.price})`);
          });
        }
      }
    } catch (error) {
      console.error(`❌ Request failed:`, error.message);
    }

    console.log("");
  }

  console.log(`${"=".repeat(80)}`);
  console.log(`✅ END-TO-END TEST COMPLETE`);
  console.log(`${"=".repeat(80)}\n`);
}

runTest().catch(console.error);
