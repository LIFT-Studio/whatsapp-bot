# Diagnóstico: Chat de Ventas Actual vs. Objetivo

**Fecha:** 2026-04-30  
**Estado:** FASE 1 - Diagnóstico Completo

---

## 🔍 Hallazgos Clave

### PROBLEMA PRINCIPAL: Modo "Catálogo" en lugar de "Asesor de Ventas"

El bot actual responde como una máquina de búsqueda (catálogo), no como un vendedor humano.

**Ejemplo actual (problema):**
```
Usuario: "quiero comprar una computadora"
Bot: "¡Encontré la Apple iMac 24"! Está disponible en 7 colores 
y 4 capacidades. Precios desde $1200 hasta $2100. 
¿Qué color y almacenamiento prefieres?"
```

**Lo que falta:**
- ❌ Descubrimiento: No pregunta para qué la necesita
- ❌ Recomendación: Enumera en lugar de recomendar
- ❌ Guía paso a paso: Hace 2 preguntas a la vez (parálisis)
- ❌ Timing de checkout: Muestra link antes de confirmación

---

## 📋 Análisis del SYSTEM_PROMPT Actual (src/ai.js)

### Extensión
- **Líneas:** 158 líneas (muy largo)
- **Estructura:** Reglas CRÍTICAS vs. guidelines

### Lo que SÍ funciona ✅
1. Detección de imágenes
2. Manejo de variantes (disponibilidad, tallas, colores)
3. Herramientas correctamente declaradas (search, add_to_cart, checkout)
4. Manejo de errores con traducción conversacional
5. Lógica de confirmación antes de acciones irreversibles

### Lo que NO funciona ❌

#### 1. Falta filosofía de DESCUBRIMIENTO
**Línea actual (41):**
```
"¡Hola! Bienvenido a ${SHOPIFY_SHOP}. ¿En qué puedo ayudarte hoy?"
```
**Problema:** Es un saludo genérico, no una pregunta consultiva.

**Debe ser:** Preguntar POR QUÉ antes de QUÉ
```
"¿Para qué necesitas una computadora? ¿Diseño, programación, tareas generales?"
```

#### 2. Instrucción de LISTAR en lugar de RECOMENDAR
**Línea 107-108:**
```
"Muestra 3-5 opciones principales con imagen, precio y link."
```
**Problema:** Enumera. La paradoja de la elección dice que <3 opciones vende más.

**Debe ser:** 
```
"Te recomiendo ESTA por X razón. Si quieres alternativas, me avisas."
```

#### 3. Permite 2 PREGUNTAS a la vez (línea 80, 108)
**Actuales:**
```
"¿Qué color y almacenamiento prefieres?"
"¿Cuál de estos te interesa?"
```
**Problema:** Parálisis de análisis. Una decisión por turno.

**Debe ser:**
```
Turno 1: "¿Qué capacidad? Te recomiendo 512GB porque..."
Turno 2: [Usuario elige]
Turno 3: "¿Qué color?"
```

#### 4. Muestra checkout DEMASIADO PRONTO
**Línea 99:**
```
"SIEMPRE usa la tool create_checkout para generar el link..."
```
**Contexto:** No hay restricción temporal. Se muestra incluso antes de confirmación.

**Debe ser:**
```
Mostrar checkout SOLO después de: "¿Procedes con tu compra?"
Antes: "Agregué al carrito..."  (sin link)
```

---

## 🏗️ Arquitectura Actual

```
src/
├── ai.js                    # Prompts + tools + processMessage()
├── session.js               # Session storage (in-memory)
├── server.js                # Express + /api/chat endpoint
├── shopify/
│   ├── mcp-client.js        # MCP API calls a Shopify Storefront
│   └── mcp-test.js          # Test file

public/
└── index.html               # Frontend simple (chat bubble UI)
```

### Flujo de datos:
```
User Input (frontend)
  ↓
POST /api/chat (server.js)
  ↓
processMessage() (ai.js)
  ↓
Gemini 2.5-flash + tools
  ↓
Tool calls → searchProducts / addToCart / etc
  ↓
Response → Front
```

---

## ⚠️ Problemas a Nivel Arquitectura

1. **SYSTEM_PROMPT NO discrimina por estado conversacional**
   - No hay "modo descubrimiento" vs. "modo recomendación" vs. "modo checkout"
   - Todo el comportamiento está en UN prompt gigante
   - Difícil de iterar sin romper otras cosas

2. **Session no almacena contexto del cliente**
   - No guarda "el cliente dijo que programa en Python" para contexto futuro
   - Cada búsqueda es aislada, sin memoria de preferencias

3. **No hay separación: CUANDO vs. CÓMO**
   - El prompt dice CUÁNDO mostrar checkout (línea 99)
   - Pero no dice CÓMO hacerlo sin mostrar link prematuro

---

## 🎯 Cambios Requeridos

### Cambio 1: Rediseñar SYSTEM_PROMPT con "modos conversacionales"
**Qué:** Agregar secciones de estado (DISCOVERY, RECOMMENDATION, CONFIRMATION)
**Dónde:** src/ai.js líneas 35-158
**Cómo:** Dividir el prompt en 4 fases, una por turno de conversación

### Cambio 2: Agregar memoria de contexto del cliente en session
**Qué:** Guardar respuestas a preguntas de descubrimiento
**Dónde:** src/session.js
**Estructura:**
```javascript
{
  context: {
    use_case: "programación",  // Lo que dijo en descubrimiento
    preference_color: "space_gray",
    price_range: "$1500-$2000"
  }
}
```

### Cambio 3: Controlar TIMING de checkout
**Qué:** Mostrar link SOLO después de confirmación explícita
**Dónde:** src/ai.js, tool create_checkout
**Lógica:** 
```
- Si cliente dice "sí" o "quiero" → SÍ mostrar checkout
- Si aún está eligiendo variantes → NO mostrar link
```

### Cambio 4: Entrenar un evaluador (harness)
**Qué:** Simular 25 tipos de cliente reales
**Dónde:** /eval/ directory
**Métrica:** Score 1-10 en 6 dimensiones (calidez, curiosidad, recomendación, concisión, naturalidad, ambigüedad)

---

## 📊 Métrica de Éxito

**Scoring por dimensión (1-10):**
1. **Calidez**: ¿Suena como persona o FAQ? (Meta: >8)
2. **Curiosidad**: ¿Pregunta para entender o por checklist? (Meta: >8)
3. **Recomendación**: ¿Guía o enumera? (Meta: >8)
4. **Concisión**: ¿Párrafos o puntos clave? (Meta: >8.5)
5. **Naturalidad**: ¿Español panameño auténtico? (Meta: >8)
6. **Manejo ambigüedad**: ¿Pregunta cuando falta info? (Meta: >8.5)

**Meta global:** Promedio ≥8.5 en todas las dimensiones

---

## 🔧 Next: Fase 2 (Construir Harness de Evaluación)

El diagnóstico indica que el problema es **filosófico, no técnico**.

Técnicas correcto:
- ✅ Busca funciona (MCP)
- ✅ Carrito funciona (session)
- ✅ Tools están bien diseñadas

Filosofía incorrecta:
- ❌ No descubre necesidades
- ❌ Enumera en lugar de recomendar
- ❌ No guía paso a paso
- ❌ Checkpoint prematuro

**Siguiente:** Construir evaluador para medir mejoras iterativamente.
