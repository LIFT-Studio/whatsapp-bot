# WhatsApp Bot - Carrito Conversacional con Shopify

> ⚠️ **Este documento tiene secciones históricas (abril 2026).** El estado actual y vigente del proyecto está en **[docs/ESTADO.md](docs/ESTADO.md)** — empezar por ahí.

Bot conversacional integrado con Shopify para búsqueda de productos, gestión de carrito y checkout via WhatsApp. Powered by Google Gemini Flash.

---

## Estado Actual

### Componentes Implementados ✅
- **Arquitectura definida** — Conversación → Gemini → MCP → Shopify
- **Búsqueda de productos** ✅ — Via Shopify Storefront MCP (`search_catalog`)
- **Loop de conversación** ✅ — Gemini Flash con herramientas disponibles
- **Manejo de sesión** ✅ — Session store en memoria con persistencia de carrito
- **Carrito + Checkout** ✅ — Via Storefront MCP (link de pago generado)
- **Frontend del chat** ✅ — Express API + Endpoint /api/chat
- **Respuestas a políticas** ✅ — Via Storefront MCP (`search_shop_policies_and_faqs`)

### Fase Actual
**Estable (v1.0)** — MVP completo con imágenes, carrito y checkout funcionales. Desplegado en producción.

---

## Stack Confirmado

### Backend
- **Runtime:** Node.js 20+ (ES modules)
- **Web Framework:** Express.js
- **Session Storage:** Map en memoria (sessionId → estado conversacional)

### APIs Externas
- **Shopify Storefront MCP** — JSON-RPC 2.0 endpoint público
  - `search_catalog` — Búsqueda natural de productos
  - `search_shop_policies_and_faqs` — Información de políticas/devoluciones/envíos
  - `update_cart` — Agregar/quitar/actualizar items en carrito
  - `get_cart` — Obtener estado actual del carrito

- **Google Generative AI** — Gemini Flash 2.0
  - Conversación natural en español
  - Function calling para invocar herramientas

### Carrito
- **Creación:** MCP `update_cart` (primera adición)
- **Sincronización:** MCP response → session.cart (con line_id + variant_id)
- **Checkout:** MCP retorna `checkout_url` (continue_url a tienda Shopify)

---

## Estructura del Código

```
whatsapp-bot/
├── src/
│   ├── shopify/
│   │   ├── mcp-client.js        ← Cliente para Shopify Storefront MCP
│   │   └── mcp-test.js          ← Scripts de prueba de MCP
│   ├── server.js                ← Express + route handler /api/chat
│   ├── session.js               ← Store de sesiones + cart sync
│   ├── ai.js                    ← Gemini integration + tool execution
│   └── [LIMPIEZA PENDIENTE]
│       └── search-strategy.js   ← OBSOLETO (eliminar)
│       └── synonyms.json        ← OBSOLETO (eliminar)
├── test-e2e.js                  ← Tests E2E de 4-mensaje flow
├── debug-prices.js              ← Debug script para validar precios
├── PROJECT.md                   ← Este archivo (documentación)
├── .env                         ← Config: GEMINI_API_KEY, SHOPIFY_SHOP
└── package.json

```

### Archivos Clave

#### `src/ai.js`
- **Responsabilidad:** AI engine + herramientas
- **Tools disponibles:**
  - `search_products` — Busca en catálogo
  - `answer_policy_question` — Responde sobre políticas
  - `add_to_cart` / `remove_from_cart` — Gestión de carrito
  - `view_cart` / `clear_cart` — Inspección de carrito
  - `create_checkout` — Genera link de pago
- **Flujo:** `processMessage(sessionId, userMessage)` → response + cart updated

#### `src/session.js`
- **Responsabilidad:** Persistencia de sesión
- **Funciones clave:**
  - `getSession(sessionId)` — Obtiene o crea sesión
  - `syncCartFromMCP(sessionId, mcpCart)` — Sincroniza carrito desde MCP
  - `setCartId(sessionId, cartId)` — Guarda ID del carrito
  - Cart sync: Extrae `variant_id`, `quantity`, `title`, `price` desde MCP

#### `src/shopify/mcp-client.js`
- **Responsabilidad:** Cliente JSON-RPC 2.0 para Shopify
- **Unwrapping:** MCP envuelve respuestas en `{ content: [{ type: "text", text: "..." }] }`
- **Funciones exportadas:**
  - `searchProducts(query)` — Natural language search
  - `searchPolicies(query)` — Policy/FAQ lookup
  - `updateCart(options)` — Create/update cart
  - `getCart(cartId)` — Retrieve cart state

#### `src/server.js`
- **Endpoint:** `POST /api/chat`
- **Request:** `{ sessionId?: string, message: string }`
- **Response:** `{ sessionId, response, state, cart }`

---

## Flujo de Conversación (Ejemplo)

```
Usuario: "hola, busco una mochila"
↓
Gemini llama: search_products(query: "mochila")
MCP retorna: Mochila Urban Explorer, $49.99, variant_id: gid://...
Gemini responde: "Encontré la Mochila Urban Explorer por $49.99..."

Usuario: "agrégame una al carrito"
↓
Gemini llama: add_to_cart(variant_id: "gid://...", quantity: 1)
MCP retorna: cart actualizado con item
Session sincroniza: cart = [{ variant_id, quantity, title, price }]
Gemini responde: "Agregué a tu carrito..."

Usuario: "¿cuál es la política de devoluciones?"
↓
Gemini llama: answer_policy_question(query: "política de devoluciones")
MCP retorna: Información de políticas
Gemini responde: "Aceptamos devoluciones dentro de 30 días..."

Usuario: "quiero pagar"
↓
Gemini llama: create_checkout()
MCP retorna: checkout_url
Session limpia: cart = []
Gemini responde: "Aquí tu link: https://... ¡Gracias!"
```

---

## Problemas Resueltos en Fase 2-3

### Problema 1: Response Vacío en answer_policy_question
- **Síntoma:** Mensaje 3 retornaba `"response": ""`
- **Causa:** Gemini ejecutaba herramienta pero no generaba texto propio
- **Fix:** SYSTEM_PROMPT ahora instruye: "Después de recibir respuesta de herramienta, SIEMPRE generas texto conversacional"
- **Status:** ✅ RESUELTO

### Problema 2: Inconsistencia de Precio
- **Síntoma:** Search mostraba $4999.00, carrito mostraba $49.99
- **Causa:** MCP retorna precio en centavos (4999) sin dividir por 100
- **Fix:** `variant_price` normaliza: `(amount / 100).toFixed(2)`
- **Status:** ✅ RESUELTO

### Problema 3: Imágenes no se renderizan en chat (Fase 3.1)
- **Síntoma:** Código con instrucciones de imágenes estaba en main/Railway, pero Gemini no incluía imágenes en respuestas
- **Causa:** SYSTEM_PROMPT asumía estructura incorrecta de campo `media` (objeto simple vs ARRAY)
- **Investigación:**
  - Confirmado: `media` es un ARRAY: `[{type: "image", url: "...", alt_text: "..."(opcional)}]`
  - Problema: Instrucción original no especificaba que era un array, confundiendo a Gemini
- **Fix:**
  1. Actualizar SYSTEM_PROMPT con estructura REAL del array media
  2. Extraer primer imagen al nivel superior: `image_url`, `image_alt` en simplifiedProduct
  3. Gemini ahora ve los campos claramente y los usa: `![image_alt](image_url)`
- **Status:** ✅ RESUELTO - Verificado en Railway

---

## Validación E2E (Fase 2)

Flujo completo probado con 4 curls secuenciales:

```bash
# 1. Búsqueda
curl -X POST http://localhost:3000/api/chat \
  -d '{"message": "hola, busco una mochila"}'
# Response: Producto encontrado, precio correcto ($49.99)

# 2. Agregar al carrito (usando sessionId del paso 1)
curl -X POST http://localhost:3000/api/chat \
  -d '{"sessionId": "...", "message": "agrégame una al carrito"}'
# Response: Confirmación, cart.length = 1

# 3. Pregunta sobre política
curl -X POST http://localhost:3000/api/chat \
  -d '{"sessionId": "...", "message": "cuál es la política de devoluciones"}'
# Response: Información completa de devoluciones, cart persiste

# 4. Checkout
curl -X POST http://localhost:3000/api/chat \
  -d '{"sessionId": "...", "message": "quiero pagar"}'
# Response: URL de checkout, cart.length = 0 (limpiado)
```

✅ **4/4 Pruebas PASADAS** — Listo para Fase 3

---

## Fase 3: Completada ✅

### Limpieza de Código
- ✅ `src/synonyms.json` — eliminado
- ✅ `debug-search-variant.js` — eliminado
- ✅ `diagnose-images.js` — eliminado
- ✅ Servidor arranca limpio

### Corrección de Renderizado de Imágenes (Fase 3.1)
- ✅ Identificado: campo `media` es un ARRAY de objetos, no un objeto simple
- ✅ Estructura real: `media: [{type: "image", url: "...", alt_text: "..."(opcional)}]`
- ✅ Actualizado SYSTEM_PROMPT con instrucción precisa sobre estructura media
- ✅ Extracción de imagen al nivel superior: `image_url`, `image_alt` en producto simplificado
- ✅ Gemini ahora incluye markdown `![alt](url)` en respuestas
- ✅ Desplegado en Railway y verificado en producción

### Validaciones Completadas (Post Fase 3.1)
- ✅ E2E flow completo: Búsqueda → Agregar → Ver carrito → Checkout
- ✅ Imágenes renderizadas en todas las fases del flujo
- ✅ Carrito persiste y se limpia correctamente en checkout
- ✅ Checkout URL generado correctamente
- ✅ Desplegado y verificado en producción (Railway)

### Validaciones Futuras
- [ ] Validar con múltiples productos/categorías diferentes
- [ ] Pruebas de error handling (producto no disponible, etc.)
- [ ] Validar limpieza de sesiones viejas (implementar TTL)

---

## Backlog Futuro

### Checkout Completo (Sin Link a Tienda)
**Descripción:** Cerrar venta completamente dentro del chat, sin enviar al cliente a tienda Shopify.

**Requisitos:**
- JWT token para autenticación del checkout
- Recolectar datos en conversación:
  - Email
  - Dirección de envío
  - Método de pago
- MCP tools: `create_checkout` → `complete_checkout`
- Payment integration (Stripe, Shopify Payments, etc.)

**Complejidad:** Media-Alta  
**Prioridad:** Post-MVP

### Historial de Ordenes
- Permitir cliente ver órdenes anteriores
- Tracking de envíos
- Soporte post-venta

### Multi-Idioma
- Español ✅ (actual)
- Inglés (estructura ya soporta)
- Portugués

---

## Referencias

- **Shopify Storefront MCP:** https://{shop}.myshopify.com/api/mcp/storefront
- **Google Generative AI:** https://ai.google.dev/
- **Gemini Function Calling:** https://ai.google.dev/docs/function_calling

---

**Última actualización:** 2026-04-22  
**Responsable:** LIFT Studio  
**Estado:** Fase 3 — Limpieza y validación
