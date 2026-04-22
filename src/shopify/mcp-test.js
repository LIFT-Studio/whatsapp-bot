/**
 * Test de conectividad al Storefront MCP de Shopify
 * Ejecutar: node src/shopify/mcp-test.js
 */

require("dotenv").config();

const {
  searchProducts,
  getProductDetails,
  searchPolicies,
  getCart,
  updateCart,
} = require("./mcp-client");

const SHOPIFY_SHOP = process.env.SHOPIFY_SHOP;

async function runTests() {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`🧪 STOREFRONT MCP CONNECTIVITY TEST`);
  console.log(`Tienda: ${SHOPIFY_SHOP}`);
  console.log(`Endpoint: https://${SHOPIFY_SHOP}/api/mcp`);
  console.log(`${"=".repeat(70)}\n`);

  try {
    // TEST 1: Buscar productos
    console.log(`\n📦 TEST 1: searchProducts("mochila")`);
    console.log("-".repeat(70));
    const searchResult = await searchProducts("mochila");
    console.log(`✅ Búsqueda exitosa`);
    console.log(`   Productos encontrados: ${searchResult.products?.length || 0}`);
    if (searchResult.products && searchResult.products.length > 0) {
      const product = searchResult.products[0];
      console.log(`   - ${product.title}`);
      console.log(`     ID: ${product.id}`);
      console.log(`     Precio: ${product.price?.amount} ${product.price?.currency_code}`);
      if (product.variants && product.variants.length > 0) {
        console.log(`     Variantes: ${product.variants.length}`);
        console.log(`     Variant ID: ${product.variants[0].id}`);
      }
    }

    // TEST 2: Buscar políticas
    console.log(`\n📋 TEST 2: searchPolicies("¿cuál es tu política de devoluciones?")`);
    console.log("-".repeat(70));
    const policiesResult = await searchPolicies(
      "¿cuál es tu política de devoluciones?"
    );
    console.log(`✅ Búsqueda de políticas exitosa`);
    console.log(`   Respuesta:`, policiesResult.answer?.substring(0, 150) || "sin respuesta");

    // TEST 3: Crear carrito vacío
    console.log(`\n🛒 TEST 3: updateCart({addItems: []}) - crear carrito`);
    console.log("-".repeat(70));

    let cartId;
    try {
      // Intenta crear carrito sin items (solo para obtener ID)
      const cartResult = await updateCart({ add_items: [] });
      cartId = cartResult.cart?.id;
      console.log(`✅ Carrito creado`);
      console.log(`   ID: ${cartId}`);
      console.log(`   Items: ${cartResult.cart?.lines?.length || 0}`);
      console.log(`   Checkout URL: ${cartResult.cart?.checkout_url?.substring(0, 60)}...`);
    } catch (e) {
      console.log(`⚠️  No se puede crear carrito vacío (esperado). Saltando TEST 4.`);
      console.log(`   Error: ${e.message}`);
      cartId = null;
    }

    // TEST 4: Agregar producto al carrito (solo si TEST 3 pasó y hay productos)
    if (cartId && searchResult.products && searchResult.products.length > 0) {
      console.log(`\n➕ TEST 4: updateCart() - agregar producto`);
      console.log("-".repeat(70));

      const firstProduct = searchResult.products[0];
      const variantId = firstProduct.variants?.[0]?.id;

      if (variantId) {
        const updateResult = await updateCart({
          cart_id: cartId,
          add_items: [{ product_variant_id: variantId, quantity: 1 }],
        });
        console.log(`✅ Carrito actualizado`);
        console.log(`   Items: ${updateResult.cart?.lines?.length || 0}`);
        console.log(`   Checkout URL: ${updateResult.cart?.checkout_url?.substring(0, 60)}...`);
      }
    }

    console.log(`\n${"=".repeat(70)}`);
    console.log(`✅ CONNECTIVITY TEST COMPLETADO CON ÉXITO`);
    console.log(`${"=".repeat(70)}\n`);
  } catch (error) {
    console.error(`\n❌ ERROR EN TEST:`, error.message);
    console.error(`Stack:`, error.stack.split("\n").slice(0, 5).join("\n"));
    process.exit(1);
  }
}

// Ejecutar si se corre directamente
if (require.main === module) {
  runTests();
}

module.exports = { runTests };
