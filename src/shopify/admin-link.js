// Fallback de links directos de producto.
//
// El Storefront MCP devuelve `url` en tiendas publicadas (ej. likershop.com),
// pero en dev stores con contraseña viene null y el link degradaba a una
// búsqueda (/search?q=...). Este módulo resuelve el handle real vía Admin
// GraphQL en MODO LECTURA, SOLO para la tienda propia (el token de .env
// pertenece a SHOPIFY_SHOP — nunca se manda a tiendas de terceros).
// El MCP sigue siendo la fuente de verdad de datos; esto solo arma el link.

const { resolveShop } = require("./shop-info");

const handleCache = new Map(); // product_id → handle (null = no encontrado)

function canResolve(shop) {
  return Boolean(
    process.env.SHOPIFY_ACCESS_TOKEN &&
    process.env.SHOPIFY_SHOP &&
    resolveShop(shop) === resolveShop(process.env.SHOPIFY_SHOP)
  );
}

/**
 * Devuelve la URL canónica /products/{handle} del producto, o null si no se
 * puede resolver (sin token, otra tienda, timeout, producto inexistente).
 * Nunca lanza.
 */
async function resolveProductUrl(productId, shop) {
  if (!productId || !canResolve(shop)) return null;
  const domain = resolveShop(shop);

  if (handleCache.has(productId)) {
    const cached = handleCache.get(productId);
    return cached ? `https://${domain}/products/${cached}` : null;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`https://${domain}/admin/api/2024-10/graphql.json`, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `{ product(id: ${JSON.stringify(productId)}) { handle } }`,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null; // sin cachear: puede ser transitorio
    const data = await res.json();
    const handle = data?.data?.product?.handle || null;
    handleCache.set(productId, handle);
    return handle ? `https://${domain}/products/${handle}` : null;
  } catch {
    return null;
  }
}

module.exports = { resolveProductUrl };
