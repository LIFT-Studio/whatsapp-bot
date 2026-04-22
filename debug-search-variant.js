require("dotenv").config();
const { searchProducts } = require("./src/shopify/mcp-client");

(async () => {
  try {
    const result = await searchProducts("mochila");
    if (result.products && result.products.length > 0) {
      const product = result.products[0];
      console.log("\n=== PRODUCT SEARCH RESULT ===");
      console.log("Title:", product.title);
      console.log("ID:", product.id);
      
      if (product.variants && product.variants.length > 0) {
        const variant = product.variants[0];
        console.log("\n=== FIRST VARIANT ===");
        console.log("Full variant object:");
        console.log(JSON.stringify(variant, null, 2));
      }
    } else {
      console.log("No products found");
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
})();
