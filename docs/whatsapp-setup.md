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

## Troubleshooting Meta — lecciones de la activación real (2026-06-11)

La activación del número de LIFT tomó ~3 horas por una cadena de trampas del panel de Meta. Para no repetirlas con el próximo cliente:

1. **El error `(#100) Unsupported get request... subcode 33` casi nunca es "no existe"** — es falta de acceso. Tres causas posibles, en orden de probabilidad: (a) la WABA no está conectada a la app, (b) el system user no tiene la WABA asignada, (c) el ID es de otro objeto (Business Manager ≠ WABA).
2. **Las asignaciones de activos pueden quedar "fantasma":** el panel muestra "Control total" pero el backend no lo grabó. Verificación autoritativa por API (no confiar en la UI): `GET /me/assigned_whatsapp_business_accounts` con el token — si devuelve `[]`, la asignación NO existe por mucho que el panel diga lo contrario. Fix: quitar y volver a asignar.
3. **Los tokens fijan su acceso al momento de generarse.** Cambiaste activos/conexiones → regenera el token. El diálogo "No hay permisos disponibles" suele ser caché: refrescar la página (F5) lo arregla.
4. **El dropdown "Desde" de API Setup solo muestra números de WABAs conectadas a la app.** Vacío = la app no está conectada a ninguna WABA (aunque la WABA exista y tenga el número). La conexión app↔WABA se hace con el flujo de login del botón "Generar identificador de acceso" → **"Editar configuración"** (embedded signup) → ahí elegir "todos los WhatsApp accounts actuales y futuros".
5. **Cuidado: el embedded signup puede CREAR una WABA nueva vacía** si se navega con descuido, y además puede **desasignar la app del system user** (volver a asignarla después). Revisar siempre qué WABA quedó conectada.
6. **Si el número quedó en una WABA que la app no ve**, lo pragmático es migrarlo: desconectar el número de la WABA vieja (WhatsApp Manager) → esperar ~3 min → agregarlo vía el flujo de la app → re-verificar por SMS. Se pierde la calificación de calidad y las plantillas aprobadas (irrelevante si no se usan templates). Requisito: poder recibir el SMS de verificación en ese número.
7. **Tras agregar el número hay que registrarlo en Cloud API** (la UI no lo dice): `POST /{PHONE_NUMBER_ID}/register` con `{messaging_product: "whatsapp", pin: "<6 dígitos>"}` — el PIN queda guardado como `WHATSAPP_2FA_PIN` en `.env`. Sin esto, `platform_type` queda `NOT_APPLICABLE` y no se puede enviar (error #133010).
8. **Apps con caso de uso exclusivo de WhatsApp no ofrecen el permiso `business_management`** en el generador de tokens — no insistir; no se necesita para operar (solo para enumerar activos del negocio por API).

## Limitaciones conocidas

- Sin Redis, un redeploy pierde las conversaciones activas (con Redis, sobreviven con TTL de `SESSION_TTL_HOURS`).
- Railway: si se cambia el subdominio, re-correr `npm run setup:whatsapp` con el nuevo `PUBLIC_URL`. Para estabilidad a largo plazo, configurar un dominio custom (riesgo señalado en PLAN.md).
- El historial enviado a Gemini se trunca a los últimos 24 mensajes (el carrito viaja completo aparte — no se pierde nada de la compra).
