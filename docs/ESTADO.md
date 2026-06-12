# Estado del proyecto — snapshot

> **Última actualización: 2026-06-11.** Este documento es el punto de entrada para cualquier sesión de trabajo nueva. Si solo vas a leer un archivo, lee este.

## TL;DR

El bot de ventas Shopify está **vivo en producción en dos canales**: chat web embebible y **WhatsApp real**. Fase 1 (MVP web) y Fase 2 (WhatsApp + Redis) de [PLAN.md](PLAN.md) están completas y verificadas de punta a punta — incluyendo una compra real por WhatsApp con checkout generado (funnel 1/1/1, 0 errores).

## Producción

| Qué | Valor |
|---|---|
| Backend | Railway — `https://whatsapp-bot-production-a74c.up.railway.app` (deploy automático desde `main`) |
| Número WhatsApp | **+1 305-339-8652** — Cloud API, status CONNECTED, calidad GREEN |
| WABA activa | **"LIFT Studio" — ID `1889414158402973`** |
| Phone Number ID | `1227253570462167` |
| App Meta | "Shopify Bot" — App ID `2367448293779783`, propiedad del Business Manager LIFT (`948251075212146`) |
| System user del token | `liftwabot` (ID `61590333827836`), token permanente con `whatsapp_business_messaging` + `whatsapp_business_management` |
| Sesiones | Upstash Redis (REST), TTL 24h — sobreviven redeploys |
| Tienda demo | `b2b-sandbox-lift-2.myshopify.com` — 13 productos (moda+tech), colecciones, Knowledge Base con 17 FAQs, políticas reales |

⚠️ **OJO — WABA vieja:** existe una WABA anterior llamada "LIFT" (`835830702360112`) que quedó **vacía** — el número se migró desde ahí el 2026-06-11 (desconectar + re-verificar por SMS). No usarla; los IDs viejos en notas o documentos anteriores a esa fecha están obsoletos.

## Variables de entorno

Fuente de verdad: `.env` local (no versionado) + Variables del servicio en Railway (sincronizadas el 2026-06-11 vía `railway variables --set`). Plantilla comentada: [.env.example](../.env.example). Las de WhatsApp: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `META_APP_ID`, `META_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` (generada por nosotros), `WHATSAPP_2FA_PIN` (PIN de registro Cloud API del número), `UPSTASH_REDIS_REST_URL/TOKEN`, `PUBLIC_URL`.

## Operación diaria

```bash
npm start              # servidor local :3000
npm run test:e2e       # e2e del chat web con aserciones (requiere servidor corriendo)
npm run test:webhook   # 8 checks del webhook WhatsApp (servidor con creds dummy + WHATSAPP_DRY_RUN=1)
npm run setup:whatsapp # re-registrar webhook en Meta (solo si cambia PUBLIC_URL o el token)
```

Endpoints: `GET /health` · `GET /api/metrics` (agregados 7 días, en memoria; con `METRICS_TOKEN` desbloquea desglose por tienda) · `POST /api/chat` (canal web) · `GET|POST /webhooks/whatsapp` (canal WhatsApp).

## Arquitectura (archivos clave)

- [src/ai.js](../src/ai.js) — cerebro: Gemini 2.5 Flash + 9 tools → Storefront MCP. Prompt de 4 fases (descubrimiento→recomendación→variantes→cierre), confirmación de precio pre-carrito, fotos a pedido (`get_product_details`), blindaje anti-IDs-alucinados, reintento de búsqueda simplificada, loop de tools con tope de 8.
- [src/server.js](../src/server.js) — Express: `/api/chat`, `/api/metrics`, webhook WhatsApp (HMAC, dedup, cola por sesión), rate limits.
- [src/channels/whatsapp.js](../src/channels/whatsapp.js) — firma, parser Meta, markdown→WhatsApp, cliente Graph API v21+ (dry-run para tests).
- [src/session.js](../src/session.js) + [src/redis.js](../src/redis.js) — Map en memoria como working store + write-through a Upstash (no-op sin credenciales).
- [src/metrics.js](../src/metrics.js) — eventos de telemetría → agregados de 7 días.
- [public/widget.js](../public/widget.js) + [widget.html](../public/widget.html) — widget embebible ([guía de instalación](install-widget.md)).
- Principio rector: **todo dato sale de Shopify** (Storefront MCP — conforme UCP). Nada hardcodeado, no Admin API en runtime.

## Trabajo parqueado (ramas aparte)

- **`feature/order-status-whatsapp`** — consulta de estado de pedidos por WhatsApp ("¿dónde está mi pedido 1010?") con verificación de identidad por teléfono (E.164 estricto vía libphonenumber-js, solo canal WhatsApp donde Meta verifica el remitente). Pasó un review adversarial (15 agentes, 10 hallazgos corregidos, incluida una fuga de PII por match de sufijo). **No está en `main`** porque requiere dos pasos de admin antes de validarse en vivo: (1) scope `read_orders` en la app del token Admin del sandbox, (2) un pedido de prueba con el teléfono del comprador. Para retomar: `git checkout feature/order-status-whatsapp`, completar los dos pasos, probar por WhatsApp, y merge a main. Tarea en Notion (Tasks Tracker, Fase 3).

## Pendientes

1. **Rotar `WHATSAPP_TOKEN`** — quedó expuesto en un log de error del CLI de Railway (2026-06-11). Regenerar en liftwabot → `.env` → Railway. *Prioridad alta, 5 min.*
2. `METRICS_TOKEN` en Railway (protege el desglose por tienda de `/api/metrics`).
3. Fase 3 de [PLAN.md](PLAN.md): multi-tenant productizado (tabla tenants, dashboard, CORS allow-list, Customer Accounts MCP).
4. Fase 4: voz, carrito abandonado (templates), multi-idioma.
5. Borrar la WABA vieja "LIFT" vacía (opcional, higiene del Business Manager).

## Historial de fases

- **Fase 0** (demo widget) ✅ — commits hasta `40afc5e`.
- **Fase 1** (MVP web: fotos a pedido, /api/metrics, GAP 4, guía instalación) ✅ — commit `e070dc6` (2026-06-11). Review adversarial: 7 hallazgos corregidos pre-deploy.
- **Fase 2** (WhatsApp + Redis) ✅ — commit `d4bafdc` (2026-06-11). Review adversarial: 13 hallazgos corregidos pre-deploy. Activación Meta completada el mismo día (ver [whatsapp-setup.md](whatsapp-setup.md), sección troubleshooting, para la saga completa de configuración).
- Catálogo sandbox poblado según PLAN §0.4 ✅ (sesión paralela, 2026-06-11).
