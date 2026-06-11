# Guía de instalación del widget de chat

> Guía **interna de LIFT Studio** para instalar el chat de ventas en la tienda Shopify de un cliente. La instalación toma ~5 minutos. No requiere apps, tokens ni cambios en el backend.

## Qué es

Un botón flotante (FAB) verde estilo WhatsApp que abre un panel de chat dentro de la tienda. El panel es un `<iframe>` servido desde nuestro backend en Railway, así que toda la lógica vive de nuestro lado — en el theme del cliente solo se pega **una línea**.

El bot consume exclusivamente recursos nativos de Shopify vía **Storefront MCP** (`https://{shop}.myshopify.com/api/mcp`): catálogo, carrito, checkout y políticas/FAQs. No inventa datos: si no está en Shopify, el bot no lo dice.

- **Backend:** `https://whatsapp-bot-production-a74c.up.railway.app`

## Requisitos de la tienda

1. Dominio `*.myshopify.com` válido (el backend valida con `/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i` — anti-SSRF).
2. Storefront MCP habilitado (es público por defecto en tiendas Shopify; verificar con el paso de prueba de abajo).
3. **Catálogo con imágenes** — las fotos que el bot muestra salen del primer `media` de cada producto.
4. **Políticas y FAQs cargadas** en Shopify (Settings → Policies, o app de Knowledge Base) — de ahí responde las preguntas de envíos/devoluciones.

Prueba rápida de que el MCP de la tienda responde:

```bash
curl -s -X POST https://CLIENTE.myshopify.com/api/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"tools/call","id":1,"params":{"name":"search_catalog","arguments":{"catalog":{"query":"test"}}}}'
```

## Instalación

1. Shopify admin → **Online Store → Themes → ⋯ → Edit code**.
2. Abrir `layout/theme.liquid`.
3. Pegar antes de `</body>`:

```html
<script src="https://whatsapp-bot-production-a74c.up.railway.app/widget.js" data-shop="CLIENTE.myshopify.com"></script>
```

4. Guardar. Listo.

### Atributos del `<script>`

| Atributo | Requerido | Valores | Qué hace |
|---|---|---|---|
| `data-shop` | Sí* | `cliente.myshopify.com` | Tienda cuyo catálogo/carrito usa el bot. *Sin él, el backend cae a la tienda default (`SHOPIFY_SHOP` del entorno) — solo útil para demos. |
| `data-position` | No | `right` (default) \| `left` | Esquina donde aparece el FAB. |
| `data-greeting` | No | texto libre | Tooltip junto al botón (ej: "¿Te ayudo a encontrar algo?"). |

El loader tiene guard anti doble inyección: pegar el script dos veces no duplica el botón.

## Checklist de verificación post-instalación

- [ ] El FAB verde aparece en la esquina elegida del storefront.
- [ ] Al abrir, el saludo dice el **nombre real de la tienda** (no "Mi Tienda"). El nombre se resuelve solo: `og:site_name` de la home → `SHOPIFY_STORE_NAME` env → subdominio → "Mi Tienda".
- [ ] Flujo completo: buscar producto → el bot recomienda con **imagen y precio** → confirmar → carrito → "quiero pagar" → el botón de checkout abre el checkout real de Shopify.
- [ ] Pedir **"muéstrame una foto"** de un producto ya mostrado devuelve la imagen.
- [ ] Preguntar una política ("¿hacen envíos a X?") responde con la política real de la tienda.
- [ ] En móvil (≤480px) el panel abre fullscreen y se cierra con la X del header.
- [ ] Cambiar `data-shop` a otra tienda apunta el bot al otro catálogo **sin redeploy**.

## Operación del backend (Railway)

Variables de entorno (ver `.env.example` en la raíz del repo):

| Variable | Requerida | Qué hace |
|---|---|---|
| `GEMINI_API_KEY` | **Sí** | API key de Google Gemini. Sin ella el servidor no arranca (fail-fast al boot). |
| `SHOPIFY_SHOP` | Sí | Tienda default cuando el widget no manda `shop`. |
| `SHOPIFY_STORE_NAME` | No | Fallback del nombre de la tienda en el saludo. |
| `PORT` | No | Default `3000`. |
| `SESSION_TTL_HOURS` | No | Vida de las sesiones en memoria. Default `24`. |
| `CLEANUP_INTERVAL_MS` | No | Frecuencia de limpieza de sesiones. Default 1h. |
| `METRICS_TOKEN` | Recomendada en producción | Si está definida, `GET /api/metrics` exige `Authorization: Bearer <token>`. Sin ella, el endpoint solo sirve totales globales: el desglose por tienda (`by_shop`, `?shop=`) queda bloqueado para no exponer la lista de clientes. |
| `MCP_URL` | No | Override del endpoint MCP — solo testing. |

Endpoints útiles:

- `GET /health` — liveness.
- `GET /api/metrics` — agregados de los últimos 7 días: conversaciones, búsquedas, carritos, checkouts, tasas de conversión. Con `METRICS_TOKEN` acepta `?shop=cliente.myshopify.com` (en minúsculas) y desglose `by_shop`; `?days=N` (máx 7). **En memoria: se reinicia con cada redeploy.**
- Rate limit: 30 req/min/IP en `/api/chat`, 20 req/min/IP en `/api/metrics`.

QA del backend: `npm run test:e2e` (requiere servidor local corriendo y la tienda sandbox).

## Limitaciones conocidas (no prometer lo contrario al cliente)

- **Sesión y carrito viven en memoria**: un redeploy del backend o un refresh de la página reinician la conversación. Persistencia (Redis) llega en Fase 2.
- El badge "1" del FAB es decorativo (simula mensaje no leído).
- El header del chat dice "Asistente" hasta que llega la primera respuesta con el nombre de la tienda.
- Sin opciones de theming/color por tenant todavía (Fase 3).
- Themes con **CSP estricto** pueden bloquear el iframe. No hay fallback automático aún; workaround manual: abrir `https://whatsapp-bot-production-a74c.up.railway.app/widget.html?shop=CLIENTE.myshopify.com` en una pestaña.
- CORS abierto (`*`) hasta la allow-list por tenant de Fase 3.

## Troubleshooting

| Síntoma | Causa probable | Fix |
|---|---|---|
| No aparece el FAB | Script pegado fuera de `theme.liquid`, o CSP del theme | Verificar en la consola del navegador si `widget.js` cargó |
| Saludo dice "Mi Tienda" | La home no expone `og:site_name` | Definir `SHOPIFY_STORE_NAME` en Railway o ignorar (cosmético) |
| Bot dice "no encontré productos" | Catálogo vacío / productos como borrador | Publicar productos al canal Online Store |
| Bot no responde políticas | Políticas no cargadas en Shopify | Settings → Policies en el admin |
| Error 400 "shop inválido" | `data-shop` no es dominio `*.myshopify.com` | Usar el dominio myshopify, no el dominio custom |
