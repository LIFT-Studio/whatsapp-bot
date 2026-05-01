# Phase 3: Iterative Improvement Cycle - IMPLEMENTATION PLAN

**Status:** 🚀 STARTING PHASE 3  
**Date:** 2026-04-30  
**Baseline Score:** 4.2/10 (ALL 25 PERSONAS FAILING)  
**Goal:** Execute 8 iterations maximum to reach 8.5+/10 across all 6 dimensions

---

## 📊 Baseline Results (25 Personas)

| Dimension | Score | Target | Gap | Personas Failing |
|-----------|-------|--------|-----|------------------|
| **Calidez** | 3.6/10 | 8.5 | -4.9 | 25/25 ❌ |
| **Curiosidad** | 4.2/10 | 8.5 | -4.3 | 25/25 ❌ |
| **Recomendación** | 1.4/10 | 8.5 | -7.1 | 25/25 ❌ **CRITICAL** |
| **Concisión** | 6.1/10 | 8.5 | -2.4 | 25/25 ❌ |
| **Naturalidad** | 5.0/10 | 8.5 | -3.5 | 25/25 ❌ |
| **Manejo de Ambigüedad** | 5.0/10 | 8.5 | -3.5 | 25/25 ❌ |

**Overall: 4.2/10 - COMPLETE SYSTEM FAILURE**

---

## 🎯 Top Failures by Persona (Bottom 10)

1. **Adolescente Gamer** - 3.0/10 (Calidez: 1, Curiosidad: 4, Recomendación: 1, Naturalidad: 1)
2. **Papá Primerizo** - 3.3/10
3. **Mamá Millennial** - 3.3/10 (Curiosidad: 1, Calidez: 1)
4. **Experto en Reviews** - 3.3/10 (Curiosidad: 1)
5. **Comprador Impulsivo** - 3.3/10
6. **Técnico Paranoico** - 3.3/10 (Calidez: 1, Curiosidad: 1)
7. **Viajero Nómada** - 3.5/10
8. **Ama de Casa Tradicional** - 3.7/10
9. **Divorciado Reciente** - 3.7/10
10. **Amante del Lujo** - 3.7/10

---

## 🔧 Root Cause Analysis

### 1. **Recomendación FAILURE (1.4/10)** 
**Root Cause:** SYSTEM_PROMPT lines 107-108 explicitly says "Muestra 3-5 opciones principales"
- Bot is enumerating options instead of recommending ONE with clear reasoning
- Even when search returns multiple products, bot lists them all
- Violates sales psychology principle #3: "Guide, don't enumerate"

**Fix Strategy:**
- Replace "Muestra 3-5 opciones" with "Recomienda UNA opción con criterio claro"
- Add logic: "Si retorna múltiples productos, analiza cuál es MEJOR para el cliente basado en contexto, y recomienda ESE. Solo muestra alternativas si el cliente pide explícitamente 'opciones'"
- Analyze conversation context: buyer behavior, stated needs, objections → recommend best match

**Expected Impact:** 1.4/10 → 8/10+ (estimated +6.6 points)

---

### 2. **Calidez FAILURE (3.6/10)**
**Root Cause:** Multiple issues:
- Generic greeting with store domain name "b2b-sandbox-lift-2" or "Mi Tienda" (not human-readable)
- Robotic responses following checklist pattern (question → answer → move on)
- Missing personality, local expressions, authentic tone
- No use of Panamanian Spanish expressions (dale, ey, chombo, etc.)

**Fix Strategy:**
- Add `SHOPIFY_STORE_NAME` env var (set to actual store name like "Tienda Virtual" or user-friendly name)
- Replace greeting to use real store name: "¡Hola! Bienvenido a [STORE_NAME], soy tu asistente. ¿En qué te ayudo hoy?"
- Add personality guidelines: "Usa un tono cálido, conversacional, como hablando con un amigo"
- Add Panamanian expressions: "Dale", "Ey", "Compa", "Vea", "Qué bien", informal contractions
- No "FAQ robot" pattern - keep conversation natural

**Expected Impact:** 3.6/10 → 7-8/10 (estimated +3.5 points)

---

### 3. **Curiosidad FAILURE (4.2/10)**
**Root Cause:**
- Bot doesn't ask discovery questions about needs, preferences, budget, use case
- Just waits for specific product requests
- Lacks the "why before what" principle

**Fix Strategy:**
- Add discovery phase: "Before I recommend, tell me more..."
- Ask about: use case, preferences, budget constraints, pain points
- Examples: "¿Para qué lo necesitas?", "¿Cuál es tu presupuesto?", "¿Qué características importan más?"
- Store context in session memory (preferences, price_range, use_case, objections)
- Use this context in subsequent responses

**Expected Impact:** 4.2/10 → 7-8/10 (estimated +3.5 points)

---

### 4. **Manejo de Ambigüedad FAILURE (5.0/10)**
**Root Cause:** Bot returns default score of 5 on every persona - likely not asking clarifying questions when info is ambiguous

**Fix Strategy:**
- When client says "bolsa", "producto", "cosa", etc.: explicitly ask "¿Para qué necesitas?" or "¿Qué tipo de bolsa?" 
- When search returns multiple items: "Encontré varias opciones. ¿Buscabas algo más específico?" 
- When client gives vague timeframe/budget: "¿Cuál es tu presupuesto?" or "¿Cuándo lo necesitas?"
- Never assume - ask first

**Expected Impact:** 5/10 → 7-8/10 (estimated +2.5 points)

---

### 5. **Concisión (6.1/10)** & **Naturalidad (5.0/10)**
**Root Cause:**
- Responses are verbose (blocks of text)
- Mixing formal Spanish with technical/neutral tone

**Fix Strategy:**
- Max 2-3 sentences per response unless explaining product details
- Use short paragraphs, natural breaks
- Consistent Panamanian Spanish (not mix of formal/neutral)

**Expected Impact:** +1.5-2.0 points each

---

## 🚀 Phase 3 Iteration Plan

### Iteration 1: Recomendación Fix (CRITICAL)
```
Changes to src/ai.js SYSTEM_PROMPT:
- Lines 106-112: Rewrite recommendation logic
  OLD: "Muestra 3-5 opciones principales con imagen, precio y link..."
  NEW: "Recomienda UNA opción que MEJOR se ajuste al contexto del cliente.
        Analiza lo que el cliente necesita (use case, presupuesto, preferencias) 
        y elige la MEJOR opción. 
        Solo muestra alternativas si el cliente pide explícitamente 'opciones' o 'más alternativas'.
        La recomendación debe ser CLARA: '...te recomiendo la Mochila X porque...'"

Expected: +6.6 points → 10.8/10 (capped at 10)
```

### Iteration 2: Calidez Fix (Add Store Name & Warmth)
```
Changes:
- Add SHOPIFY_STORE_NAME env var (or use a proper name)
- Line 37: Update greeting to use actual store name
- Add personality section: "Eres cálido, conversacional, usa expresiones panameñas auténticas"
- Add Panamanian expressions guideline

Expected: +3.5 points → 13/10 (capped at 10)
```

### Iteration 3: Curiosidad Fix (Discovery Questions)
```
Changes:
- Add discovery phase in SYSTEM_PROMPT
- First message after greeting: ask about needs before searching
- Store context in session (preferences_discovered, price_range, use_case, objections)
- Reference discovered preferences in recommendations

Expected: +3.5 points → 13/10 (capped at 10)
```

### Iteration 4: Manejo de Ambigüedad (Clarification)
```
Changes:
- Add explicit clarification protocol
- When ambiguous: ask specific questions
- Never assume, always confirm when unclear

Expected: +2.5 points → 13/10 (capped at 10)
```

### Iteration 5+: Fine-tuning
```
Refine based on evaluation results:
- Concisión improvements (shorten responses)
- Naturalidad improvements (more Spanish expressions)
- Context memory optimization
```

---

## ⏱️ Timeline

- **Iteration 1:** ~10 min (recomendación logic)
- **Iteration 2:** ~5 min (store name, warmth)
- **Iteration 3:** ~15 min (discovery, context memory)
- **Iteration 4:** ~10 min (clarification)
- **Evaluation after each iteration:** ~7-8 minutes (25 personas)

**Total Expected:** ~80-90 minutes for all iterations

---

## ✅ Success Criteria

- **All 6 dimensions ≥ 8.5/10**
- **Overall score ≥ 8.5/10**
- **All 25 personas passing**
- **Maximum 8 iterations** (before diminishing returns)

---

## 📝 Commits Strategy

Each iteration will be committed as:
```
iter 1: Fix recomendación logic (1.4 → 8/10)
iter 2: Add store name and warmth (3.6 → 7/10)
iter 3: Add discovery questions (4.2 → 7.5/10)
iter 4: Add ambiguity handling (5.0 → 7.5/10)
...
```

---

## 🎯 Ready to Start

This document serves as the action plan for Phase 3.  
Next step: Execute Iteration 1 (Recomendación fix)
