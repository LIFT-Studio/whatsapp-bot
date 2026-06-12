# Paridad con Agentic Storefronts de Shopify — vía WhatsApp

> Análisis de brechas (2026-06-12): qué capacidades de [Agentic Storefronts de Shopify](https://help.shopify.com/en/manual/online-sales-channels/agentic-storefronts) replicar en el bot de WhatsApp, **excluyendo el checkout dentro del chat** (decisión del usuario: se mantiene el link externo al checkout de Shopify).

## El hallazgo más importante

**El modelo que ya usa el bot — recomendar y redirigir al checkout real de Shopify por link — es EXACTAMENTE el modelo oficial de ChatGPT en Agentic Storefronts.** No es una limitación nuestra: es paridad con el canal de IA más grande. El "direct checkout" in-chat solo existe en Google AI Mode / Gemini / Copilot, y eso es lo que excluimos.

Además, dos ventajas frente a Agentic Storefronts:
- **Sin restricción geográfica:** los canales de IA de Shopify exigen vender a clientes en EE.UU. Nuestro bot WhatsApp no — ventaja directa para LatAm, donde WhatsApp domina.
- **Post-venta:** Shopify dice que "no se puede revisar el historial de pedidos de ChatGPT dentro de Shopify". Nuestra rama de estado de pedidos sí lee pedidos vía Admin API — cubrimos algo que el propio ChatGPT de Agentic no cubre.

## Lo que el bot YA cubre (paridad lograda)

- **Descubrimiento y recomendación conversacional** (el corazón de Agentic) — `search_catalog`, recomendando la mejor opción justificada.
- **Datos estructurados de producto** (título, descripción, opciones, imágenes, precio, disponibilidad) — el mismo set que Shopify Catalog sincroniza, pero servido en tiempo real por el Storefront MCP.
- **Detalle e imágenes a pedido** — `get_product_details`.
- **Carrito completo** — más rico que lo documentado en Agentic.
- **Checkout real "powered by Shopify"** por link (= modelo ChatGPT).
- **Políticas, FAQs, envíos, devoluciones** — `search_shop_policies_and_faqs` (cubre el indicador "completitud de políticas" de Agentic).
- **Calidad conversacional** — voz de tienda, agotado vs no-manejado, confirmación de precio, manejo de variantes.
- **Métricas de conversión propias** (`/api/metrics`) — equivalente parcial al reporting de Agentic, sobre nuestro canal.

## Brechas factibles por WhatsApp (priorizadas)

| # | Capacidad | Valor | Esfuerzo | Código | Setup Shopify/Meta |
|---|---|---|---|---|---|
| 1 | **Atribución de origen "WhatsApp" en el checkout** (UTM/cart attributes) — medir ventas del bot en Shopify analytics | Alto | Bajo (1-2h) | Sí | No |
| 2 | **Estado de pedidos por WhatsApp** — YA construido en `feature/order-status-whatsapp` | Alto | Bajo (activar) | No | Sí (scope `read_orders` + pedido prueba) |
| 3 | **Notificaciones proactivas de pedido** (enviado/en camino/entregado) vía webhooks Shopify + template Meta | Alto | Medio | Sí | Sí (template + opt-in) |
| 4 | **Recuperación de carrito abandonado** por WhatsApp (template + checkout_url) | Alto | Medio | Sí | Sí (template + opt-in) |
| 5 | **Reporte de rendimiento** ampliado (Sales atribuidas, Orders, Sessions, Conversion) ≈ reporting de Agentic | Medio | Medio | Sí | No |
| 6 | **Recomendar 2-3 opciones** cuando el cliente compara (hoy fuerza una) | Medio | Bajo | Sí (prompt) | No |
| 7 | **Enriquecer con metafields/metaobjects** (material, garantía, specs) | Medio | Medio | Sí | Sí |
| 8 | **Respetar exclusiones** (Unlisted / seo.hidden / B2B-only) | Medio | Bajo (verificar) | Quizá | No |

## Excluido (por decisión o por canal)

- **Direct/instant checkout in-chat** (botón Buy + Pay now sin salir) — excluido por el usuario; se mantiene link externo.
- **Vender dentro de ChatGPT / Gemini / Copilot / app Shop** — son canales que no son WhatsApp; activarlos es decisión del merchant en el admin de Shopify, no de nuestro código.
- **Auto-inscripción en escaparates agénticos y toggle "Allow Shopify to manage for me"** — config del merchant.
- **Combined Listings** (planes Agentic enterprise) — feature de catálogo del merchant.

## Lo que el merchant configura en Shopify (no es código nuestro)

- Completar las 3 políticas legales (Términos, Privacidad, Devoluciones) — también alimenta el bot.
- Publicar productos en la tienda online (condición para que el MCP y los agentes los vean).
- Mantener inventario y precios actualizados (el bot lee disponibilidad en tiempo real).
- Para activar pedidos: scope `read_orders` + pedido de prueba con teléfono del comprador.
- Para proactividad: plantillas aprobadas en Meta + opt-in del cliente.
- Opcional: si el merchant también quiere los canales de IA de Shopify, aceptar los Supplemental Terms y activar en `admin.shopify.com/apps/agentic` (requiere vender a EE.UU.).

## Plan por fases propuesto

- **Fase A (alto valor, sin bloqueos):** (1) atribución UTM en el checkout, (2) activar la rama de estado de pedidos, (8) verificar exclusiones del MCP.
- **Fase B (proactividad):** (3) notificaciones de pedido, (4) carrito abandonado — ambas requieren templates Meta + opt-in.
- **Fase C (calidad + reporting):** (6) 2-3 opciones, (7) metafields, (5) métricas ampliadas.

## Dudas / notas

- **Plan Agentic:** las páginas se contradicen sobre si hace falta un "plan Agentic" o solo elegibilidad. Para nuestro bot es **indiferente** — operamos sobre Storefront MCP, no sobre el canal Agentic de Shopify.
- **Catalog ≠ Storefront MCP:** Agentic sincroniza un feed (Shopify Catalog) hacia agentes externos; nuestro bot consulta el MCP en tiempo real. Activar/desactivar el Catalog **no afecta** lo que ve nuestro bot.
