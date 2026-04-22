require("dotenv").config();
const { getCart, updateCart } = require("./src/shopify/mcp-client");

(async () => {
  try {
    // First create a cart
    const createResult = await updateCart({
      add_items: [{
        product_variant_id: "gid://shopify/ProductVariant/53622813753708",
        quantity: 1
      }]
    });

    console.log("===  CREATED CART ===");
    const cartId = createResult.cart?.id;
    console.log("Cart ID:", cartId);

    // Now get the cart
    console.log("\n=== GET CART ===");
    const getResult = await getCart(cartId);
    console.log("getCart result keys:", Object.keys(getResult));
    console.log("getCart.cart keys:", Object.keys(getResult.cart || {}));
    console.log("\nSearching for checkout_url or continue_url or similar...");
    console.log("JSON.stringify(getResult.cart, null, 2):");
    console.log(JSON.stringify(getResult.cart, null, 2));
  } catch (error) {
    console.error("Error:", error.message);
  }
})();
