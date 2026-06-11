# 📈 Forecast — Likershop (Beta → Producción)

**Cliente:** Likershop · **Preparado por:** LIFT Studio · **Uso:** interno (contiene costos y márgenes)

---

## Datos reales del cliente (últimos 6 meses, dic 2025 – may 2026)

| Métrica | Valor |
|---|---|
| Ventas totales | $81,355.14 |
| Ventas/mes | ~$13,559 |
| Órdenes | 564 (~94/mes) |
| **AOV** | **$123.99** (alto) |
| Unidades | 15,065 (~27/orden → señal de mayoreo / B2B, ~$4.6/unidad) |

> **Implicación del perfil B2B/mayoreo:** el valor del bot está en **armar carritos multi-producto y reposición sin fallar**, no en descubrimiento. La fiabilidad de `add_to_cart` (ya blindada) es el corazón del caso de uso.

## Supuestos clave (validar en la beta)
- **~800 conversaciones/mes** — ancla: clientes B2B recurrentes que ya saben qué quieren convierten alto (~12% chat→pedido); 800 × 12% ≈ sus ~94 órdenes/mes. Rango razonable: 600-1.000.
- **Atribución realista:** el chat **capta un % de sus ventas existentes + algo incremental**; NO multiplica las ventas totales.
- **Costo/hora soporte interno:** $20 (confirmado).
- **Canal beta:** widget web (listo). WhatsApp real = Fase 2 (3-5 semanas, no construido).

---

## PARTE 1 · BETA (a costo, sin ganancia)

### Qué se necesita para lanzarla
- **Setup técnico (~10h):** conectar tienda vía Storefront MCP, verificar catálogo + **inventario con stock**, embeber widget en el theme, QA de golden paths.
- **Config nativa Shopify:** FAQ/políticas (Knowledge Base), sinónimos (Search & Discovery).
- **Telemetría activada:** eventos `checkout_started`, etc. — obligatorio para medir la beta.
- **Soporte continuo:** monitoreo, check-ins semanales, arreglos, medición.
- **Comercial:** acuerdo de beta 3 meses + métrica de éxito: **checkout-starts desde el chat**.

### Costo a costo (widget web)
| Concepto | Mes 1 (onboarding) | Mes 2-3 (estable) |
|---|---|---|
| IA (Flash, ~800 conv × $0.02) | $8 | $16 |
| Infra (Railway + Redis) | $30 | $30 |
| Soporte humano ($20/h) | 12h → $240 | 5h → $100 |
| **Total/mes** | **~$280** | **~$150** |

- **Setup único:** ~$200 (10h × $20)
- **Beta 3 meses a costo:** ~**$780 total** ($200 + $280 + $150 + $150)
- **Precio beta recomendado:** **$200 setup + $150/mes × 3 meses**
- **Desembolso de caja real** (si LIFT absorbe su propio tiempo): **~$46/mes** (IA + infra). El $150 es el costo cargado con horas.

---

## PARTE 2 · PRODUCCIÓN (con margen)

**COGS LIFT/cliente: ~$185-225/mes** (modelo Híbrido: Flash + premium en carrito/checkout; ~800 conv × $0.07 = $56 IA + $30 infra + 5h soporte a $20 = $100; sube con el volumen del escenario).

| Escenario (atribución) | GMV chat/mes | COGS | Plana $449 | **Base $249 + 5% GMV** | Rev-share 8% |
|---|---|---|---|---|---|
| Conservador (25% + 5% lift) | ~$3,560 | ~$185 | paga $449 · +$264 | paga $427 · +$242 | paga $285 · +$100 |
| **Probable** (40% + 12% lift) | ~$6,075 | ~$200 | paga $449 · +$249 | **paga $553 · +$353** | paga $486 · +$286 |
| Optimista (60% + 20% lift) | ~$9,763 | ~$225 | paga $449 · +$224 | **paga $737 · +$512** | paga $781 · +$556 |

*(margen = mensual para LIFT, tras COGS)*

**Recomendación de pricing:** **Base $249/mes + 5% del GMV atribuido al chat.** El base cubre el COGS de sobra (nunca perdés); el % captura el upside. Con soporte a $20/h la rev-share pura ya no pierde en el escenario bajo, pero deja el ingreso 100% expuesto a la atribución — el modelo base + % es más predecible.

**Valor para Likershop:** el chat le atribuye **~$3,500-9,800/mes en ventas** = **~$1,000-2,900/mes de ganancia** (margen 30%). Paga ~$450-740 → ROI 4-6×.

---

## 🔎 Hallazgos honestos
1. **El costo dominante es el SOPORTE humano, no la IA.** Flash $16 vs Híbrido $56/mes; soporte $100/mes. Optimizá soporte y pricing antes que el modelo.
2. **Un cliente da margen moderado** (~$2,900-6,100/año en Base + 5%). El negocio es **multi-tenant**: 20 clientes × ~$3-6k/año = **$60-120k/año**.
3. **El valor justifica el precio 4-6×.** Pitch: *"recupero $1-3k/mes en ventas de WhatsApp que hoy se pierden."*

## ⚠️ Riesgos
- **Atribución** es el supuesto frágil — la beta debe medir si el chat **incrementa** o solo **mueve** ventas. (Telemetría obligatoria.)
- **WhatsApp real no existe aún** (Fase 2, 3-5 sem). Beta web primero.
- **Inventario del catálogo real** debe tener stock o el bot no vende.

## ✅ Plan
1. Beta web 3 meses a costo: **$200 + $150/mes**. Métrica: checkout-starts.
2. Medir atribución real → convierte el forecast de producción en datos.
3. Producción: **Base $249 + 5% GMV**, Híbrido.
4. Escalar a más clientes (multi-tenant) = el negocio real.
