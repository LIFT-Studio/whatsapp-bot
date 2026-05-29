# Plan del Proyecto — Compras conversacionales Shopify ↔ Chat / WhatsApp

## Contexto

LIFT Studio (agencia Shopify Partner LatAm) está construyendo un bot conversacional que traslada la experiencia de tienda Shopify al chat — primero como widget embebido en el theme del cliente, eventualmente como WhatsApp Business API. El usuario quiere un **demo de portafolio listo esta semana (3-5 días)** para usar como herramienta de venta con clientes potenciales, y luego avanzar por fases hasta una oferta multi-tenant productizada.

**Estado actual verificado:**
- Backend Node.js + Express + Gemini 2.5 Flash + Storefront MCP (JSON-RPC público).
- Chat web propio funcionando en Railway ([whatsapp-bot-production-a74c.up.railway.app](https://whatsapp-bot-production-a74c.up.railway.app)) sobre tienda sandbox `b2b-sandbox-lift-2.myshopify.com`.
- Search → cart → checkout link end-to-end OK.
- Logs estructurados JSON con sessionId, error handling categorizado (7 tipos), retry con backoff exponencial.
- Local HEAD `1faf81b` adelante de `origin/main` (`302e54a`). Railway lagging.
- Cinco regresiones/gaps abiertos en [Estado del proyecto Notion](https://www.notion.so/somoslift/353edfd44211817e9319e635fd2a2135), tres de ellas críticas para el demo.
- Sandbox con catálogo escaso — bloquea QA realista.

**Decisiones arquitectónicas ya tomadas (no replantear):**
- Session store futuro: Upstash Redis (REST) — no SQLite, no Railway Redis.
- WhatsApp: Meta Cloud API directa (número verificado +1 305-339-8652, calidad Alta) — no Twilio.
- Storefront MCP es source of truth — no migrar a Admin MCP en MVP.
- Customer Accounts MCP postpuesto a Fase 3 (OAuth + dominio custom).
- Principio rector: si Shopify tiene una app nativa que resuelve el problema (Search & Discovery, Knowledge Base, Metafields, Colecciones), el bot la consume — no reinventa.

**Respuestas del usuario que definen Fase 0:**
- Canal del demo: **chat web embebido en theme Shopify**, estilizado como WhatsApp.
- Audiencia: **demo genérico de portafolio** (no personalizado por cliente).
- Timeline: **esta semana, 3-5 días**.

---

## FASE 0 — Demo Portafolio (3-5 días, ESTA SEMANA)

**Objetivo:** Widget embebible WhatsApp-styled que LIFT pega en cualquier dev store y demuestra search → cart → checkout en un pitch de 10 minutos. Sin Fase 2 todavía (WhatsApp real queda para post-venta).

### 0.1 — Fixes mínimos que rompen el demo (Día 1, ~3h)

| # | Bug | Fix |
|---|---|---|
| 1 | **Saludo dice "Tienda Virtual" en vez del nombre real** | Crear `src/shopify/shop-info.js` con `fetchShopInfo(shop)` que consulte el shop name vía MCP / Storefront GraphQL una vez por shop y cachée en `Map`. En [src/ai.js](src/ai.js:38) convertir `SYSTEM_PROMPT` de string-literal a `buildSystemPrompt(shopName)` invocado por request. Fallback chain: `cachedShopInfo.name → SHOPIFY_STORE_NAME → shop.split('.')[0] → "Mi Tienda"`. |
| 2 | **Frontend no renderiza markdown links** | En [public/index.html](public/index.html) (sección de render de mensajes ~líneas 271-326), agregar parser regex `/\[([^\]]+)\]\(([^)]+)\)/g` → `<a href="$2" target="_blank" class="product-link">$1</a>`. Distinguir checkout URLs (botón verde grande) de links de producto (link inline). |
| 3 | **Carrito persiste tras refresh por localStorage** | Cambiar `localStorage.getItem("sessionId")` → `sessionStorage.getItem("sessionId")` en `public/index.html`. La sesión muere al cerrar pestaña; el botón "Nueva conversación" se mantiene para reset manual. Backend cleanup sigue por TTL 24h. |

**Skip por ahora (no demo-killers):** GAP confirmación carrito y GAP imágenes on-demand. Quedan para Fase 1.

### 0.2 — Widget embebible (Días 1-2, ~6h)

**Mecánica:** snippet de una sola línea que LIFT pega en `theme.liquid` antes de `</body>`:
```html
<script src="https://whatsapp-bot-production-a74c.up.railway.app/widget.js" data-shop="cliente.myshopify.com"></script>
```

**Componentes nuevos:**
- `public/widget.js` (loader, ~150 líneas):
  - Lee `data-shop` y `data-position` del propio `<script>` tag.
  - Inyecta CSS aislado con prefijo `.lift-wa-*` para evitar colisión con el theme.
  - Renderiza FAB verde `#25D366` esquina inferior derecha, ícono WhatsApp SVG inline, badge "1".
  - Al click abre `<iframe>` apuntando a `${RAILWAY}/widget.html?shop=cliente.myshopify.com` — aislamiento total de estilos del theme.
- `public/widget.html` (variante de index.html con styling WhatsApp-like):
  - Header verde `#075E54` + avatar circular + "en línea" + nombre tienda dinámico.
  - Burbujas: usuario `#DCF8C6` derecha, bot blanco izquierda, esquinas tipo WhatsApp.
  - Fondo `#ECE5DD`. Tamaño 380×600 desktop, fullscreen mobile (`window.innerWidth < 768`).

**CORS:** mantener `Access-Control-Allow-Origin: *` para demo. En Fase 3 → allow-list por tenant.

**Riesgo flagged:** algunos themes con CSP estricto podrían bloquear el iframe. Fallback: botón "abrir en nueva pestaña" como secundario.

### 0.3 — Multi-tenant config minimalista (Día 2, ~1h)

Hoy `SHOPIFY_SHOP` se lee una sola vez en `require()` de [src/shopify/mcp-client.js:16-18](src/shopify/mcp-client.js:16). Para demo multi-store:

- `POST /api/chat` acepta `{ sessionId, message, shop }` en el body.
- `processMessage(sessionId, message, shop)` recibe shop y lo propaga.
- En `mcp-client.js`, cambiar las funciones a `searchProducts(query, options, shop)` etc., construyendo endpoint por llamada: `https://${shop}/api/mcp`.
- **Validar `shop` con regex estricta** `/^[a-z0-9-]+\.myshopify\.com$/` para evitar SSRF.
- `SHOPIFY_SHOP` env queda como default si el widget no manda `shop` (modo standalone local).

### 0.4 — Sandbox poblado (Día 2, ~2h, LIFT lo hace manualmente en Shopify admin)

**Vertical recomendado: moda casual + tech accessories** — universal en LatAm, fácil de fotografiar, conversaciones naturales.

| Categoría | Productos | Detalles |
|---|---|---|
| Moda casual (8) | camiseta básica (3 colores × 4 tallas), jeans skinny, hoodie unisex, gorra snapback, mochila urbana, sneakers blancas, vestido midi, chaqueta denim | 2 imágenes mínimo, USD, descripción en español |
| Tech (5) | cargador USB-C 20W, audífonos bluetooth, power bank 10000mAh, soporte de laptop, funda silicona iPhone | mismo standard |
| Colecciones (2) | "Esenciales de moda", "Tech del día a día" | manual asignación |
| FAQ Knowledge Base (3) | envíos en Panamá, política de cambios 15 días, formas de pago | via Shopify Pages o app FAQ Pro |
| Sinónimos Search & Discovery (2) | `tenis → sneakers`, `audífonos → headphones/auriculares` | demuestra la integración nativa |

### 0.5 — Demo script (3 golden paths, Día 3, ~1h ensayando)

| Path | Flujo | Qué demuestra |
|---|---|---|
| **A. Discovery genérica** | "Hola, busco un regalo" → bot pregunta para quién/presupuesto → "Hermana, 50 USD" → recomienda vestido con imagen + precio → pregunta talla → confirma → agrega → checkout | Conversación humana, descubrimiento de necesidades |
| **B. Búsqueda específica** | "Quiero audífonos bluetooth" → recomienda directo (salta discovery) → variantes → confirma → checkout | Eficiencia cuando el cliente sabe qué quiere |
| **C. Policy + venta** | "¿Hacen envíos a Colón?" → responde FAQ → "Perfecto, dame una camiseta básica" → talla/color → agrega → checkout | Bot es KB + ventas, no solo búsqueda |

### 0.6 — Deployment (Día 3, ~30min)

- `git push origin main` (14 commits incluyendo `1faf81b`).
- Verificar en Railway dashboard: `GEMINI_API_KEY`, `SHOPIFY_SHOP` (default), `SHOPIFY_STORE_NAME` (fallback opcional), `SESSION_TTL_HOURS`, `PORT`.
- `curl https://whatsapp-bot-production-a74c.up.railway.app/health` → 200.

### 0.7 — Verificación end-to-end

1. Crear dev store Shopify nueva, pegar el `<script>` tag en `theme.liquid`.
2. Cargar storefront → FAB verde aparece esquina inferior derecha.
3. Click → iframe abre, saludo dice el nombre real de la tienda (no "Tienda Virtual").
4. Ejecutar Path A completo → imagen renderiza, link de producto clickeable, botón checkout abre Shopify checkout real.
5. Refresh página → conversación limpia, nuevo sessionId.
6. Repetir desde móvil (responsive).
7. Cambiar `data-shop` a otro store en el `<script>` tag, verificar widget apunta al nuevo MCP endpoint sin reiniciar el backend.

**Archivos críticos Fase 0:**
- [src/ai.js](src/ai.js) — refactor `SYSTEM_PROMPT` de literal → función `buildSystemPrompt(shopName)`.
- [src/shopify/mcp-client.js](src/shopify/mcp-client.js) — parametrizar `shop` por llamada, quitar lectura en `require()`.
- [src/server.js](src/server.js) — aceptar `shop` en payload, validar con regex SSRF-safe.
- `public/widget.js` *(nuevo)* — loader embebible con FAB e iframe.
- `public/widget.html` *(nuevo)* — UI WhatsApp-styled servida en iframe.
- [public/index.html](public/index.html) — parche markdown links + sessionStorage. Se mantiene como UI standalone para QA interno.
- *(nuevo opcional)* `src/shopify/shop-info.js` — fetch + cache de shop name.

---

## FASE 1 — Cierre Web MVP (semana 2)

**Objetivo:** Cerrar gaps de Notion para que el chat web sea producto pulido, no solo demo.

**Entregables:**
- GAP 4 en SYSTEM_PROMPT: "antes de `add_to_cart`, confirmar producto + precio + variante en una frase y esperar 'sí/dale'".
- GAP 5 en SYSTEM_PROMPT: "si el usuario pide 'foto', 'imagen', 'cómo se ve', llamar `get_product_details` y devolver imagen en markdown".
- Eventos de telemetría (custom JSON ya tiene patrón en [src/ai.js:27](src/ai.js:27) `logEvent`): `conversation_started`, `product_searched`, `add_to_cart`, `checkout_started`, `policy_asked`.
- Endpoint `GET /api/metrics` con agregados últimos 7 días.
- `docs/install-widget.md` — guía de instalación interna para LIFT.

**Verificación:** 20 conversaciones manuales con personas (no eval automatizado), revisar que cada evento se loguea y `/api/metrics` los suma bien.

---

## FASE 2 — WhatsApp Real (semanas 3-5)

**Objetivo:** Canal WhatsApp productivo vía Meta Cloud API, manteniendo el chat web vivo en paralelo. Ejecutar F2-01 → F2-04 secuencial (cada uno bloquea al siguiente).

### F2-01 — Upstash Redis (semana 3)
Reemplazar el `Map` de [src/session.js](src/session.js) con cliente Upstash Redis REST. **Mantener exactamente la misma firma pública** (`getSession`, `addMessage`, `syncCartFromMCP`, `setCartId`, `clearCart`) — el resto del código no se entera. TTL via `EX` en cada `SET`. Clave: `session:${sessionKey}` (ver F2-03).

### F2-02 — User identification por canal (semana 3)
Backend recibe `externalUserId` ya normalizado por el adapter. Web → UUID generado server-side (como hoy). WhatsApp → phone E.164. `getSession` recibe `sessionKey` ya computado, no inventa nada.

### F2-03 — Channel adapter contract (semana 4)

Contrato del adapter (TypeScript-like, implementado en JS):

```js
// IncomingMessage
{
  channelId: string,         // "web" | "whatsapp"
  channelType: ChannelType,
  externalUserId: string,    // UUID web | phone E.164 whatsapp
  shop: string,              // tenant context (de Fase 0.3)
  text: string,
  attachments: [{type, url}],
  timestamp: string,         // ISO
  raw: unknown,              // canal-específico, debugging
}

// OutgoingMessage
{
  channelType: ChannelType,
  externalUserId: string,
  text: string,
  attachments: [{type, url, caption}],
}

// sessionKey = `${channelType}:${externalUserId}` → clave Redis
```

`processMessage` se refactoriza a `processMessage(incoming: IncomingMessage): Promise<OutgoingMessage>`. `POST /api/chat` queda como adapter web: normaliza body → IncomingMessage, serializa OutgoingMessage → response JSON. Nuevos: `src/channels/web.js`, `src/channels/whatsapp.js`, `src/channels/types.js`.

### F2-04 — Meta Cloud API adapter (semanas 4-5)
- `GET /webhooks/whatsapp` — verificación con `hub.verify_token`.
- `POST /webhooks/whatsapp` — verificación HMAC SHA-256 del header `X-Hub-Signature-256` usando `META_APP_SECRET`.
- Parser de payload Meta → `IncomingMessage`.
- Cliente `sendMessage(to, OutgoingMessage)` → `POST https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages` con bearer token.
- **Ventana de 24h:** solo respondemos cuando el usuario inicia (caso reactivo cubre 100% del MVP). Templates aprobados quedan para Fase 4 (abandoned cart proactivo).
- **Media inbound:** descargar attachments vía media endpoint con token antes de procesar. Para Fase 2 solo registrar; audios e imágenes ricas en Fase 4.
- **Media outbound:** imágenes de productos hosteadas en Shopify CDN — URLs públicas, válidas directamente para Meta.

**Riesgo flagged:** Meta requiere webhook URL pública HTTPS estable. Configurar custom domain en Railway antes de registrarlo en Meta config para no quedar atado al subdominio Railway auto-generado.

**Archivos críticos Fase 2:**
- [src/session.js](src/session.js) (refactor Redis manteniendo firma)
- [src/ai.js](src/ai.js) (firma `processMessage` normalizada)
- `src/channels/types.js`, `src/channels/web.js`, `src/channels/whatsapp.js` *(nuevos)*
- [src/server.js](src/server.js) (rutas webhook)

**Verificación:** dos sesiones en paralelo desde una sola instancia — web (sandbox) con `externalUserId` UUID y WhatsApp (+1 305-339-8652) con E.164 — misma tienda, ambos llegan al checkout sin cruzar carritos. Reiniciar el servidor a mitad de conversación → al reanudar, ambas sesiones siguen donde quedaron (validar Redis).

---

## FASE 3 — Multi-tenant Agency Offering (mes 2+)

**Objetivo:** Convertir la solución probada en producto LIFT-as-a-service vendible.

**Entregables:**
- Tabla `tenants` (Postgres o Redis): `{shop, displayName, brandColor, systemPromptOverrides, whatsappPhoneNumberId, metaAccessToken, allowedDomains[], plan}`.
- Customer Accounts MCP (OAuth + dominio custom) para personalización con historial de pedidos del cliente.
- Dashboard merchant `/admin/${shop}` con métricas de Fase 1, override de prompt y branding del widget.
- Modelo de billing: tier base ($/mes hasta N conversaciones) + overage.
- Allow-list CORS por tenant (cierra el `*` abierto de Fase 0).

---

## FASE 4 — Diferenciación (futuro)

- Voice messages (Whisper inbound, ElevenLabs outbound).
- Abandoned cart proactivo (Shopify webhook → WhatsApp template aprobado).
- Post-purchase Q&A (estado de pedido, devoluciones).
- Multi-idioma con auto-detección.
- Competencia frontal con Wizybot — precio + soporte local + integración nativa Storefront MCP como diferencial técnico.

---

## Riesgos arquitectónicos transversales

1. **CORS `*` abierto** — aceptable para demo, restringir por allow-list por tenant en Fase 3.
2. **SSRF en `shop` param** — validar regex `/^[a-z0-9-]+\.myshopify\.com$/` desde Fase 0.
3. **Secretos por tenant** — Railway env vars escalan a ~20 tenants; después necesitarás Doppler, Vault o Railway shared variables segmentadas.
4. **Rate limits Shopify MCP** — no documentados públicamente. Instrumentar fallos 429 en `mcp-client.js` y usar el `withRetry` existente.
5. **Coste Gemini** — gemini-2.5-flash es barato pero historial largo escala. En Fase 1 truncar historial > 20 turnos y considerar context caching de la parte estática del SYSTEM_PROMPT.
6. **Webhook URL Meta** — necesita estabilidad. Configurar custom domain en Railway antes de F2-04.

---

## Verificación general del plan

- **Fase 0 listo cuando:** widget embebido en una dev store muestra el nombre real de la tienda, ejecuta los 3 golden paths sin fallos visibles, link de checkout abre Shopify checkout funcional, cambia de tienda solo cambiando `data-shop` en el script tag.
- **Fase 1 listo cuando:** `/api/metrics` reporta 5 eventos correctamente sobre 20 conversaciones reales; SYSTEM_PROMPT confirma precio antes de carrito en el 100% de los casos.
- **Fase 2 listo cuando:** mismo backend sirve web + WhatsApp con sesiones independientes en Redis, sobrevive reinicio.
- **Fase 3 listo cuando:** un nuevo cliente se onboardea en < 30 minutos vía dashboard sin tocar código.
