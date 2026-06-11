# Activación del canal WhatsApp (Meta Cloud API)

> Guía interna LIFT. El código del canal ya está desplegado; activarlo son 3 pasos: llenar credenciales, subirlas a Railway y correr un script. ~10 minutos.

## Cómo funciona

```
Cliente (WhatsApp) → Meta Cloud API → POST /webhooks/whatsapp (firma HMAC verificada)
  → mismo cerebro del chat web (Gemini + Storefront MCP, sesión "wa:<teléfono>")
  → respuesta → Graph API → WhatsApp del cliente (imágenes de producto incluidas)
```

- **Reactivo solamente:** el bot responde cuando el cliente escribe (la ventana de 24h de Meta siempre está abierta en ese caso). Mensajes proactivos (carrito abandonado) requieren templates aprobados — Fase 4.
- **Sesión por teléfono:** la conversación y el carrito viven en la sesión `wa:<E.164>`. Con Upstash Redis configurado sobreviven redeploys.
- **Solo texto entrante** en esta fase: audios/imágenes del cliente reciben una respuesta amable pidiendo texto.

## Paso 1 — Credenciales en `.env` (y en Railway)

| Variable | Dónde se obtiene |
|---|---|
| `WHATSAPP_TOKEN` | developers.facebook.com → Business Settings → Users → System Users → Generate token (permisos `whatsapp_business_messaging` + `whatsapp_business_management`) |
| `WHATSAPP_PHONE_NUMBER_ID` | Tu app → WhatsApp → API Setup → "Phone number ID" |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Misma pantalla de API Setup → "WhatsApp Business Account ID" |
| `META_APP_ID` | Tu app → App Settings → Basic → "App ID" |
| `META_APP_SECRET` | Misma pantalla → "App Secret" (Show) |
| `WHATSAPP_VERIFY_TOKEN` | Ya generado en `.env` — clave compartida nuestra, no viene de Meta |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | upstash.com → tu database → REST API |
| `PUBLIC_URL` | URL pública del backend (default: la de Railway) |

**Railway:** todas las anteriores deben estar también en Variables del servicio antes de activar.

## Paso 2 — Desplegar

```bash
git push origin main   # Railway redespliega solo
curl https://whatsapp-bot-production-a74c.up.railway.app/health  # → 200
```

El webhook debe estar desplegado **antes** del paso 3: Meta lo verifica con un GET en el momento del registro.

## Paso 3 — Activar

```bash
npm run setup:whatsapp
```

El script registra el webhook en la app, suscribe la app a la WABA y verifica el número. Si todo sale bien imprime el número listo para probar.

**Prueba:** desde tu WhatsApp personal escribe al número del negocio: "hola, ¿tienen mochilas?" — debe responder el asesor con foto y precio, y el flujo completo hasta el link de checkout funciona igual que en el chat web.

## Verificación técnica local (sin tocar Meta)

```bash
# Terminal 1: servidor con credenciales dummy y envío simulado
WHATSAPP_TOKEN=dummy WHATSAPP_PHONE_NUMBER_ID=123 META_APP_SECRET=testsecret WHATSAPP_DRY_RUN=1 npm start

# Terminal 2: 6 checks (challenge, firmas, dedup)
META_APP_SECRET=testsecret npm run test:webhook
```

## Operación

- `GET /webhooks/whatsapp` — verificación de Meta (hub.challenge).
- `POST /webhooks/whatsapp` — entrada de mensajes. Rechaza firma inválida con 403; responde 503 si el canal no está configurado.
- Dedup de reintentos de Meta por message id; mensajes del mismo usuario se procesan en orden.
- Las métricas de `/api/metrics` incluyen las conversaciones de WhatsApp (sesiones `wa:...`).

## Limitaciones conocidas

- Sin Redis, un redeploy pierde las conversaciones activas (con Redis, sobreviven con TTL de `SESSION_TTL_HOURS`).
- Railway: si se cambia el subdominio, re-correr `npm run setup:whatsapp` con el nuevo `PUBLIC_URL`. Para estabilidad a largo plazo, configurar un dominio custom (riesgo señalado en PLAN.md).
- El historial enviado a Gemini se trunca a los últimos 24 mensajes (el carrito viaja completo aparte — no se pierde nada de la compra).
