// Estado de pedidos vía Admin API (read-only), SOLO para la tienda propia.
//
// Seguridad: la información de un pedido es PII. Este módulo NUNCA devuelve
// datos sin que el teléfono del solicitante coincida con el del pedido.
// En WhatsApp el remitente viene verificado por Meta — esa es la identidad.
// El canal web NO tiene identidad verificada: el caller no debe llamar esto
// desde web (se valida también en ai.js).

const { parsePhoneNumberFromString } = require("libphonenumber-js");
const { resolveShop } = require("./shop-info");

const ADMIN_API_VERSION = "2025-01";

function canQuery(shop) {
  return Boolean(
    process.env.SHOPIFY_ACCESS_TOKEN &&
    process.env.SHOPIFY_SHOP &&
    resolveShop(shop) === resolveShop(process.env.SHOPIFY_SHOP)
  );
}

// Compara dos teléfonos normalizándolos a E.164 (incluye código de país) y
// exigiendo igualdad EXACTA. Falla cerrado: si algo no parsea, NO autentica
// (un falso negativo solo molesta a un dueño legítimo; un falso positivo
// filtraría datos de otra persona — inaceptable).
//
// `requester` es el wa_id de Meta: SIEMPRE internacional (código de país +
// número), así que lo parseamos como E.164 confiable. Su país sirve de
// región por defecto para el teléfono del pedido, que el comercio pudo
// guardar en formato nacional — si es del mismo país, normaliza igual; si
// es de otro país, los códigos difieren y NO hay match (cierra la colisión
// por sufijo). libphonenumber maneja además los prefijos de móvil de MX
// (521→52) y AR (549→54).
function phonesMatch(orderPhone, requesterWaId) {
  const reqDigits = String(requesterWaId || "").replace(/\D/g, "");
  // wa_id de MX/AR llega con prefijo de móvil histórico (52*1*… / 54*9*…) que
  // libphonenumber a veces no concilia con el número guardado sin ese dígito.
  // Probamos ambas formas; basta que UNA valide y coincida.
  const variants = new Set(["+" + reqDigits]);
  if (/^521\d{10}$/.test(reqDigits)) variants.add("+52" + reqDigits.slice(3));
  if (/^549\d{10}$/.test(reqDigits)) variants.add("+54" + reqDigits.slice(3));

  const raw = String(orderPhone || "").trim();
  for (const v of variants) {
    const requester = parsePhoneNumberFromString(v);
    if (!requester || !requester.isValid()) continue;
    const order = raw.startsWith("+")
      ? parsePhoneNumberFromString(raw)
      : parsePhoneNumberFromString(raw, requester.country);
    if (order && order.isValid() && requester.number === order.number) return true;
  }
  return false;
}

const FULFILLMENT_ES = {
  UNFULFILLED: "aún no ha sido enviado",
  PARTIALLY_FULFILLED: "fue enviado parcialmente",
  FULFILLED: "ya fue enviado",
  SCHEDULED: "está programado para envío",
  ON_HOLD: "está en espera",
};

const FINANCIAL_ES = {
  PAID: "pagado",
  PENDING: "con pago pendiente",
  AUTHORIZED: "con pago autorizado",
  PARTIALLY_PAID: "pagado parcialmente",
  REFUNDED: "reembolsado",
  PARTIALLY_REFUNDED: "reembolsado parcialmente",
  VOIDED: "anulado",
};

/**
 * Busca el pedido y verifica que el teléfono del solicitante coincida.
 *
 * NOTA: con el scope `read_orders` (sin `read_all_orders`), la Admin API solo
 * devuelve pedidos de los últimos 60 días — un pedido más viejo dará
 * "not_found". Para soporte de pedidos antiguos hay que pedir `read_all_orders`.
 *
 * @returns {Promise<{status: "ok", order: object} |
 *                   {status: "not_found"|"phone_mismatch"|"unavailable"}>}
 */
async function getOrderStatusForPhone(orderNumber, requesterPhone, shop) {
  if (!canQuery(shop)) return { status: "unavailable" };

  const num = String(orderNumber || "").replace(/\D/g, "");
  if (!num) return { status: "not_found" };

  try {
    // AbortSignal.timeout cubre headers Y lectura del body (a diferencia de
    // un timer manual que se cancela tras el fetch y deja el body sin tope).
    const res = await fetch(`https://${resolveShop(shop)}/admin/api/${ADMIN_API_VERSION}/graphql.json`, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({
        query: `query($q: String!) {
          orders(first: 10, query: $q) {
            nodes {
              name
              createdAt
              displayFulfillmentStatus
              displayFinancialStatus
              statusPageUrl
              phone
              customer { phone }
              shippingAddress { phone }
              billingAddress { phone }
              totalPriceSet { shopMoney { amount currencyCode } }
              fulfillments(first: 5) {
                trackingInfo { number url company }
                estimatedDeliveryAt
              }
            }
          }
        }`,
        // Interpolamos SOLO dígitos en la query (nunca el input crudo del
        // usuario, para no permitir inyección de sintaxis de búsqueda).
        variables: { q: `name:${num}` },
      }),
    });
    if (!res.ok) return { status: "unavailable" };
    const data = await res.json();
    if (data.errors) {
      console.error(`[ORDERS] Admin API error: ${JSON.stringify(data.errors).substring(0, 150)}`);
      return { status: "unavailable" };
    }

    // Match por dígitos del nombre: tolera prefijos/sufijos de tienda
    // (#1010, LS1010, 1010-A) sin asumir el formato "#1010".
    const order = (data.data?.orders?.nodes || []).find(
      (o) => String(o.name).replace(/\D/g, "") === num
    );
    if (!order) return { status: "not_found" };

    const orderPhones = [
      order.phone,
      order.customer?.phone,
      order.shippingAddress?.phone,
      order.billingAddress?.phone,
    ].filter(Boolean);
    if (!orderPhones.some((p) => phonesMatch(p, requesterPhone))) {
      console.warn(`[ORDERS] ${order.name}: teléfono del solicitante no coincide — info denegada`);
      return { status: "phone_mismatch" };
    }

    const tracking = (order.fulfillments || [])
      .flatMap((f) => f.trackingInfo || [])
      .filter((t) => t.number || t.url);

    return {
      status: "ok",
      order: {
        name: order.name,
        created_at: order.createdAt,
        fulfillment_status: FULFILLMENT_ES[order.displayFulfillmentStatus] || order.displayFulfillmentStatus,
        payment_status: FINANCIAL_ES[order.displayFinancialStatus] || order.displayFinancialStatus,
        total: order.totalPriceSet?.shopMoney
          ? `${order.totalPriceSet.shopMoney.amount} ${order.totalPriceSet.shopMoney.currencyCode}`
          : undefined,
        tracking: tracking.map((t) => ({ number: t.number, url: t.url, company: t.company })),
        status_page_url: order.statusPageUrl || undefined,
        estimated_delivery: (order.fulfillments || []).map((f) => f.estimatedDeliveryAt).find(Boolean) || undefined,
      },
    };
  } catch (err) {
    console.error(`[ORDERS] lookup falló: ${err.message}`);
    return { status: "unavailable" };
  }
}

module.exports = { getOrderStatusForPhone, phonesMatch };
