/**
 * Shop Info Fetcher
 * Obtiene el nombre real de la tienda Shopify desde su storefront público.
 * No requiere token: parsea og:site_name (o <title>) del HTML de la home.
 * Cache en memoria por shop domain.
 */

const { executeWithTimeout } = require('../utils/retry');

const shopInfoCache = new Map();
const FETCH_TIMEOUT_MS = 5000;

// Solo dominios myshopify.com válidos. Previene SSRF: sin esto, un `shop`
// arbitrario en el payload haría que el servidor haga fetch a hosts internos.
const SHOP_REGEX = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

/**
 * Valida que el shop sea un dominio myshopify.com legítimo.
 * @param {*} shop
 * @returns {boolean}
 */
function isValidShop(shop) {
  return typeof shop === 'string' && SHOP_REGEX.test(shop);
}

/**
 * Devuelve un shop válido (normalizado a minúsculas) o el default de entorno.
 * @param {*} shop - shop candidato (del payload del request)
 * @returns {string|null}
 */
function resolveShop(shop) {
  if (isValidShop(shop)) return shop.toLowerCase();
  return process.env.SHOPIFY_SHOP || null;
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function parseShopName(html) {
  // 1. og:site_name (más confiable en themes Shopify modernos)
  const ogMatch = html.match(
    /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i
  );
  if (ogMatch && ogMatch[1].trim()) {
    return decodeEntities(ogMatch[1].trim());
  }
  // 2. application-name
  const appMatch = html.match(
    /<meta[^>]+name=["']application-name["'][^>]+content=["']([^"']+)["']/i
  );
  if (appMatch && appMatch[1].trim()) {
    return decodeEntities(appMatch[1].trim());
  }
  // 3. <title> — fallback. Formato típico Shopify: "Shop Name" o "Shop Name – tagline"
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch && titleMatch[1].trim()) {
    const raw = decodeEntities(titleMatch[1].trim());
    // Split on common separators (en-dash, em-dash, pipe, hyphen) and take first piece
    return raw.split(/\s+[–—|-]\s+/)[0].trim();
  }
  return null;
}

/**
 * Obtiene info de la tienda. Cachea por shop domain.
 * @param {string} shop - dominio myshopify (ej: "b2b-sandbox-lift-2.myshopify.com")
 * @returns {Promise<{name: string} | null>}
 */
async function fetchShopInfo(shop) {
  if (!isValidShop(shop)) {
    console.warn(`[SHOP_INFO] Invalid shop domain rejected: ${shop}`);
    return null;
  }
  if (shopInfoCache.has(shop)) return shopInfoCache.get(shop);

  try {
    const html = await executeWithTimeout(
      async () => {
        const res = await fetch(`https://${shop}/`, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; LiftBot/1.0)',
            'Accept': 'text/html',
          },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      },
      FETCH_TIMEOUT_MS,
      `shop-info[${shop}]`
    );

    const name = parseShopName(html);
    if (name) {
      const info = { name };
      shopInfoCache.set(shop, info);
      console.log(`[SHOP_INFO] Cached "${name}" for ${shop}`);
      return info;
    }
    console.warn(`[SHOP_INFO] Could not parse name from ${shop}`);
    return null;
  } catch (err) {
    console.warn(`[SHOP_INFO] Fetch failed for ${shop}: ${err.message}`);
    return null;
  }
}

/**
 * Resuelve el nombre de la tienda con cadena de fallback.
 * Orden: shopInfo.name → SHOPIFY_STORE_NAME env → shop.split('.')[0] → 'Mi Tienda'
 * @param {string} shop
 * @returns {Promise<string>}
 */
async function resolveShopName(shop) {
  const info = await fetchShopInfo(shop);
  if (info && info.name) return info.name;
  if (process.env.SHOPIFY_STORE_NAME) return process.env.SHOPIFY_STORE_NAME;
  if (shop) return shop.split('.')[0];
  return 'Mi Tienda';
}

module.exports = {
  fetchShopInfo,
  resolveShopName,
  isValidShop,
  resolveShop,
  parseShopName, // exposed for testing
};
