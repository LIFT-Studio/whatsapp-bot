// Test script para conteo directo de catálogo
require("dotenv").config();
const { searchProducts } = require("./src/shopify");

async function testCatalog() {
  const terms = ["mochila", "laptop", "cartera", "backpack"];

  console.log("\n=== CONTEO REAL DEL CATÁLOGO ===\n");

  for (const term of terms) {
    try {
      const products = await searchProducts([term]);
      console.log(`"${term}": ${products.length} producto(s)`);
      if (products.length > 0) {
        console.log(`  └─ ${products.map(p => p.title).join(", ")}`);
      }
    } catch (error) {
      console.error(`"${term}": ERROR - ${error.message}`);
    }
  }
}

testCatalog();
