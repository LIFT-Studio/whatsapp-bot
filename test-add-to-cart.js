/**
 * Debug test for add_to_cart flow
 */
require("dotenv").config();
const {
  searchProducts,
  updateCart,
} = require("./src/shopify/mcp-client");

async function test() {
  console.log("1. Searching for mochila...");
  const searchResult = await searchProducts("mochila");
  console.log("Search result:", JSON.stringify(searchResult, null, 2).substring(0, 500));

  if (!searchResult.products || searchResult.products.length === 0) {
    console.log("❌ No products found");
    return;
  }

  const product = searchResult.products[0];
  const variant = product.variants[0];
  
  console.log("\n2. Adding to cart...");
  console.log("Product:", product.title);
  console.log("Variant ID:", variant.id);

  try {
    const cartResult = await updateCart({
      add_items: [
        {
          product_variant_id: variant.id,
          quantity: 1,
        },
      ],
    });

    console.log("\n3. Cart result:");
    console.log(JSON.stringify(cartResult, null, 2));
  } catch (error) {
    console.error("Error:", error.message);
  }
}

test();
