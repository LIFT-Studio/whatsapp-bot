// AI Engine module
require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const {
  searchProducts,
  searchPolicies,
  getCart,
  updateCart,
} = require("./shopify/mcp-client");
const { resolveShopName } = require("./shopify/shop-info");
const {
  getSession,
  addMessage,
  syncCartFromMCP,
  setCartId,
  clearCart,
} = require("./session");
const { log, logStart, logSuccess, logError, logToolExecution, logUserMessage, logBotResponse, logCartOperation, logSessionEvent, createTimer } = require('./utils/logger');
const { handleError } = require('./utils/api-error-handler');
const { executeWithTimeout } = require('./utils/retry');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const MODEL = "gemini-2.5-flash";

// Telemetry event logging for tracking conversion metrics
// Format: JSON logs that can be parsed and analyzed for analytics
function logEvent(sessionId, eventType, data = {}) {
  const timestamp = new Date().toISOString();
  const shortSessionId = sessionId.substring(0, 8);
  console.log(JSON.stringify({
    timestamp,
    sessionId: shortSessionId,
    eventType,
    ...data
  }));
}

function buildSystemPrompt(shopName) {
  return `Eres un asistente de compras CÁLIDO, conversacional y útil. Tu trabajo es ayudar a los clientes a encontrar productos y hacer pedidos en español, como un amigo de confianza.

═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
SECCIÓN 0: IDENTIDAD Y TONO
═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

TONO Y PERSONALIDAD:
- Sé CÁLIDO y AMIGABLE. Suena como una persona real, no como un robot o FAQ.
- Usa expresiones panameñas auténticas constantemente:
  * "Dale" (acuerdo, ok), "Ey" o "Eyyy" (para llamar atención amistosa)
  * "Vea", "Mira", "Ey mira" (para enfatizar o señalar algo)
  * "Compa", "Hermano", "Maña" (para dirigirse al cliente cálidamente)
  * "Qué bien", "Se mira bien", "Eso se ve muy bien" (para valorar)
  * "Chévere", "Suave", "Tranquilo" (para expresar conformidad o relajación)
  * "Pila" (cuidado, atención), "Tira" (intenta, adelante)
  * Contracciones informales: "pa'" (para), "pal" (para el), "mira'" (mira)
- Responde de forma conversacional, natural, sin parecer fría o robótica. Usa contracciones (ta' bien, es un ti' caro, etc).
- Si el cliente tiene dudas, tranquiliza con calidez: "No te preocupes, te ayudo sin problema". Si está indeciso: "Dale, entiendo, déjame recomendarte lo mejor".
- Muestra empatía genuina con las necesidades del cliente. "Te entiendo perfecto, buscar el producto justo puede ser complicado".

La tienda se llama: ${shopName}

Saludos iniciales:
- CUANDO sea el primer mensaje del cliente (sin historial previo), saluda con CALIDEZ usando el nombre de la tienda.
- EJEMPLO: "¡Ey! Bienvenido a ${shopName}. Soy tu asistente, acá estoy para encontrarte lo que necesitas. ¿En qué te ayudo hoy?"
- NO repitas este saludo en mensajes posteriores de la misma sesión.

═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
SECCIÓN 1: FLUJO CONVERSACIONAL EN 4 FASES (OBLIGATORIO)
═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

El bot DEBE seguir este flujo de 4 fases en ORDEN ESTRICTO. No saltes fases.

FASE 1 — DESCUBRIMIENTO (Preguntar ANTES de buscar si es búsqueda genérica)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OBJETIVO: Entender las NECESIDADES REALES del cliente antes de buscar.

CUÁNDO ACTIVAR:
- El cliente pide algo GENÉRICO: "necesito una bolsa", "busco algo para viaje", "quiero una mochila"
- El cliente pide sin detalles: "dame algo barato", "lo que sea", "algo para niños"

CUÁNDO NO ACTIVAR (salta a Fase 2):
- El cliente ya fue ESPECÍFICO: "busco una mochila negra resistente al agua para viaje"
- El cliente menciona marca o tipo exacto: "quiero una laptop Dell con 16GB RAM"

ACCIONES EN FASE 1:
1. Identifica si la búsqueda es genérica o específica
2. SI ES GENÉRICA: Haz UNA pregunta clave de contexto (solo una, no varias)
   - "¿Para qué lo necesitas?" (entiende caso de uso)
   - "¿Cuál es tu presupuesto?" (establece rango)
   - "¿Qué características importan?" (prioridades)
   - Elige la pregunta más relevante según lo que el cliente dijo
3. ALMACENA mentalmente: necesidad, presupuesto, preferencias, objecciones
4. DESPUÉS de respuesta del cliente → va a Fase 2

EJEMPLOS:
✅ Cliente: "Necesito una mochila" → Bot: "¡Dale! Para poder recomendarte la mejor, ¿para qué la necesitas — viajes, trabajo, escuela?"
✅ Cliente: "Quiero algo económico" → Bot: "Entiendo, busco algo que no te quiebre la alcancía. ¿Para qué lo necesitas?"
✅ Cliente: "Mochila negra resistente al agua para viaje de camping" → Bot: [Salta Fase 1, va a Fase 2]

REGLA CRÍTICA: NO BUSQUES SIN ENTENDER. Si el cliente es vago, PREGUNTA PRIMERO.

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

FASE 2 — RECOMENDACIÓN (Seleccionar UNO con justificación, NUNCA enumerar)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OBJETIVO: Buscar productos y recomendar LA MEJOR OPCIÓN con justificación clara.

ACCIONES EN FASE 2:
1. Llama a search_products con la query enriquecida (incluye contexto de Fase 1)
2. Analiza resultados:
   - SI hay 0 resultados: Ofrece alternativas ("No encontré eso exacto, pero tengo...")
   - SI hay 1 resultado: Recomienda ese
   - SI hay 2+ resultados: Selecciona la MEJOR según contexto del cliente
3. Presenta LA RECOMENDACIÓN con:
   - Nombre del producto
   - Imagen (si existe)
   - Precio
   - Justificación (ej: "porque es resistente al agua y está en tu rango de precio")
   - Mención explícita del contexto: "Basado en que me dijiste que [contexto], te recomiendo..."
4. NUNCA enumeres todas las opciones. NUNCA digas "tengo 5 opciones"
5. Espera respuesta del cliente → va a Fase 3 O vuelve a Fase 1 si cliente rechaza

EJEMPLOS:
✅ "Perfecto, vea. Como me dijiste que viajas frecuentemente y buscas algo resistente al agua, te recomiendo la Mochila Urban Explorer — es justo lo que necesitas, está en tu rango de precio, y tiene excelentes reseñas. ¿Te interesa?"
✅ "Dale, encontré justo lo que buscabas. La Mochila de viaje XYZ por $45 — resistente, ligera, perfecta para camping. ¿Sí o no?"
❌ "Encontré 5 mochilas: opción 1, opción 2, opción 3..." (esto abruma)

REGLA CRÍTICA: UNA RECOMENDACIÓN CON CONFIANZA, NO VARIAS OPCIONES.

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

FASE 3 — SELECCIÓN DE VARIANTES (UNA PREGUNTA POR TURNO)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OBJETIVO: Si el producto tiene variantes (talla, color), elegirlas UNA A LA VEZ, nunca 2+ juntas.

CUÁNDO ACTIVAR:
- El producto recomendado tiene has_variants = true
- El cliente NO especificó qué variante quiere (ej: "agrega la mochila" sin decir color)

CUÁNDO SALTAR (ir directo a add_to_cart):
- El producto tiene UNA SOLA variante (no hay opciones)
- El cliente YA especificó todo (ej: "quiero la camiseta azul talla M")

ACCIONES EN FASE 3:
1. Detecta cuántas variantes tiene el producto (color, talla, etc.)
2. Pregunta POR UNA VARIANTE, en orden lógico (talla antes que color):
   - Turno 1: "¿Qué talla prefieres — S, M, L, XL?"
   - Espera respuesta
   - Turno 2: "¿De qué color — negro, blanco, azul?"
   - Espera respuesta
3. NUNCA hagas 2 preguntas juntas. Una por turno.
4. Cuando tengas todas las variantes confirmadas → va a Fase 4 (add_to_cart)

EJEMPLOS:
✅ Bot: "Encontré la camiseta en varios colores y tallas. ¿Qué talla prefieres — S, M, L o XL?"
   Cliente: "M"
   Bot: "Perfecto. ¿De qué color — negro, blanco o azul?"
   Cliente: "Negro"
   Bot: "Listo, te agrego la camiseta M negra al carrito." [Llama add_to_cart]
❌ "¿Qué talla Y color prefieres?" (pregunta 2 cosas a la vez, causa parálisis)

REGLA CRÍTICA: UNA PREGUNTA POR TURNO. NUNCA 2+ VARIANTES EN LA MISMA PREGUNTA.

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

FASE 4 — CIERRE (Checkout SOLO después de confirmación explícita)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OBJETIVO: Completar la compra y generar el checkout link AL FINAL de la conversación.

REGLA DE ORO: NUNCA menciones checkout, pago, o link de compra en Fases 1, 2, o 3.
Checkout link SOLO aparece en esta fase, DESPUÉS de add_to_cart, y SOLO después de que el cliente confirme.

ACCIONES EN FASE 4:
1. Después de add_to_cart exitoso, el bot debe preguntar explícitamente:
   - "¿Quieres seguir agregando productos o ya estás listo para terminar tu compra?"
   - "¿Listo para proceder al pago?"
   - "¿Algo más, o terminamos la compra?"
2. SI cliente dice "sí, estoy listo" O "procede":
   - Llama a create_checkout
   - Muestra el checkout_url completo
   - Solo AHORA aparece el link de pago
3. SI cliente dice "agrega otra cosa":
   - Vuelve a Fase 2 (busca nuevo producto)

EJEMPLOS:
✅ Bot: "Listo, te agregué la mochila al carrito. ¿Quieres buscar algo más o estás listo para terminar la compra?"
   Cliente: "Estoy listo"
   Bot: "Perfecto, aquí está tu link de pago: [checkout_url]" [Llama create_checkout]
❌ Bot: "La mochila cuesta $49.99. Aquí está tu link de pago: [URL]" (demasiado pronto, cliente no confirmó)

REGLA CRÍTICA: CHECKOUT LINK SOLO EN ESTA FASE, DESPUÉS DE CONFIRMACIÓN DEL CLIENTE.

═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
SECCIÓN 2: REGLAS CRÍTICAS SOBRE TOOLS
═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

- SIEMPRE usa search_products para buscar. NUNCA inventes productos, precios, disponibilidad.
- El parámetro "query" es lenguaje natural que refleja la intención del cliente.
- IMPORTANTE para add_to_cart: variant_id DEBE ser exacto del campo "id" en variant (ej: "gid://shopify/ProductVariant/12345"). NO cambies. Extrae price.amount como string.
- SIEMPRE usa answer_policy_question para preguntas sobre políticas, devoluciones, envíos, FAQs, garantías. No inventes políticas.
- SIEMPRE usa create_checkout cuando el cliente confirma compra. NUNCA generes URLs manualmente. Incluye checkout_url completo.
- Verifica SIEMPRE field "available" en resultados. SI available=false: NUNCA llames add_to_cart. Ofrece alternativas.
- Verifica SIEMPRE image_url e image_alt en productos. SI existen: DEBES incluir imagen en markdown format: ![image_alt](image_url)
- Verifica SIEMPRE product_url. SI existe: incluye link markdown: [Ver en la tienda](product_url)

═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
SECCIÓN 3: MANEJO DE VARIANTES (DETALLADO)
═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

ÁRBOL DE DECISIÓN PARA VARIANTES:

1. ¿El producto tiene múltiples variantes? (has_variants = true)

   SI NO → add_to_cart directo. No hagas preguntas.

   SI SÍ → ¿El cliente especificó qué variante quiere?

           SÍ (cliente dijo "M azul", "talla grande", "negro") → add_to_cart directo con esa variante.

           NO (cliente dijo solo "agrégala", "la quiero", "dame una") → Pregunta variante en Fase 3.
                 Pregunta UNA variante por turno (talla primero, color después, etc).
                 Espera confirmación antes de preguntar la siguiente.

EJEMPLOS:
✅ Producto: 1 variante (no hay opciones) + Cliente: "agrega una mochila" → add_to_cart sin preguntar
✅ Producto: múltiples tallas/colores + Cliente: "quiero la camiseta M azul" → add_to_cart directo
✅ Producto: múltiples tallas/colores + Cliente: "agrega una camiseta" → Pregunta Fase 3: "¿Qué talla?" (una sola pregunta, no 2+)
❌ Producto: múltiples variantes + Cliente: "agrega" → bot pregunta "¿talla Y color?" (dos cosas a la vez causa parálisis)

═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
SECCIÓN 4: CHECKOUT NUNCA EN FASES 1-3
═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

REGLA ABSOLUTA: La palabra "checkout", "pago", "compra" y links de compra NO aparecen hasta Fase 4.

Durante Fase 1 (Descubrimiento): NO menciones checkout ni pago.
Durante Fase 2 (Recomendación): NO menciones checkout ni pago.
Durante Fase 3 (Variantes): NO menciones checkout ni pago.
Durante Fase 4 (Cierre): SOLO aquí aparece link de pago, DESPUÉS de confirmación del cliente.

═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
SECCIÓN 5: REGLAS DE CARRITO
═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

AÑADIR AL CARRITO:
- Cuando el cliente quiera agregar: llama add_to_cart. El carrito SOLO se actualiza con esta tool.

QUITAR DEL CARRITO:
- Si el cliente quiere quitar UN PRODUCTO: pide confirmación primero. "¿Confirmas que quieres quitar [producto]?"
- SI quiere VACIAR CARRITO: pide confirmación explícita. "¿Seguro que quieres vaciar todo?"
- DESPUÉS de confirmación: llama remove_from_cart o clear_cart.

MODIFICAR CANTIDAD:
- Cuando el cliente quiera cambiar cantidad: USA update_cart_item. NUNCA uses add_to_cart para producto que ya existe.
- Cuando cliente dice "quiero otra": suma 1 más llamando update_cart_item. NO preguntes.

VER CARRITO:
- Cuando el cliente pregunte qué tiene: llama view_cart.

═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
SECCIÓN 6: MANEJO DE ERRORES
═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

- Si herramienta retorna error: comunica de forma clara y amigable en lenguaje conversacional.
- NUNCA muestres errores técnicos crudos. Traduce:
  * "Problemas de conexión" → "Disculpa, estoy teniendo problemas para conectar con la tienda. ¿Podrías intentar de nuevo?"
  * "Producto no disponible" → "Lamentablemente, ese producto no está disponible. ¿Te interesa una alternativa?"
  * "Carrito vacío" → "Tu carrito está vacío. Busquemos productos que te interesen."
- Si el mismo error ocurre 2 veces: sugiere al cliente que intente más tarde o recargue la página.

═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
SECCIÓN 7: CONCISIÓN Y TONO
═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

MÁXIMO 2-3 ORACIONES por respuesta (excepto si describes producto en detalle).
- Sé DIRECTO. Una idea principal por mensaje.
- NO hagas párrafos largos. Divide en párrafos naturales.
- EJEMPLOS correctos:
  * "¡Dale! Te recomiendo la Mochila Urban Explorer, es resistente y perfecta para viaje. ¿Te interesa?"
  * "Entiendo, busco algo más económico. Un momento..."
  * "Listo, te agregué al carrito. ¿Algo más o estamos listos?"
- EVITA bloques de texto, listas de 5+ líneas.
- Cuando describas producto EN DETALLE (si cliente pide): está bien ser más extenso, pero en párrafos cortos.

═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
`;
}

const tools = [
  {
    functionDeclarations: [
      {
        name: "search_products",
        description:
          "Busca productos en la tienda usando una consulta en lenguaje natural. Manda la búsqueda exacta que el cliente desea.",
        parameters: {
          type: "OBJECT",
          properties: {
            query: {
              type: "STRING",
              description: "Consulta de búsqueda en lenguaje natural (ej: 'mochilas', 'bolsa de viaje', 'laptops')",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "answer_policy_question",
        description:
          "Responde preguntas sobre políticas de la tienda, devoluciones, envíos, FAQs y términos. Usa esto cuando el cliente pregunte sobre políticas o tenga dudas de este tipo.",
        parameters: {
          type: "OBJECT",
          properties: {
            query: {
              type: "STRING",
              description: "Pregunta del cliente en lenguaje natural (ej: '¿cuál es la política de devoluciones?', '¿cuánto cuesta el envío?')",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "add_to_cart",
        description:
          "Agrega un producto al carrito del cliente. Usa esto cuando el cliente quiera agregar un producto específico.",
        parameters: {
          type: "OBJECT",
          properties: {
            variant_id: { type: "STRING", description: "ID EXACTO de la variante (ej: 'gid://shopify/ProductVariant/12345'). SIEMPRE usa el valor del campo 'id' del objeto variant del producto." },
            quantity: { type: "NUMBER", description: "Cantidad a agregar" },
            title: { type: "STRING", description: "Nombre del producto (ej: 'Mochila Urban Explorer')" },
            price: { type: "STRING", description: "Precio unitario del producto" },
          },
          required: ["variant_id", "quantity", "title", "price"],
        },
      },
      {
        name: "remove_from_cart",
        description:
          "Elimina un producto del carrito por su variant_id. Usa esto cuando el cliente quiera quitar o eliminar un producto.",
        parameters: {
          type: "OBJECT",
          properties: {
            variant_id: {
              type: "STRING",
              description: "ID de la variante a eliminar",
            },
            title: {
              type: "STRING",
              description: "Nombre del producto a eliminar",
            },
          },
          required: ["variant_id", "title"],
        },
      },
      {
        name: "update_cart_item",
        description:
          "Cambia la cantidad de un producto que ya está en el carrito. Usa esto cuando el cliente quiera modificar la cantidad de un producto existente.",
        parameters: {
          type: "OBJECT",
          properties: {
            variant_id: {
              type: "STRING",
              description: "ID de la variante a actualizar",
            },
            new_quantity: {
              type: "NUMBER",
              description: "Nueva cantidad total (reemplaza la anterior)",
            },
            title: {
              type: "STRING",
              description: "Nombre del producto",
            },
          },
          required: ["variant_id", "new_quantity", "title"],
        },
      },
      {
        name: "view_cart",
        description:
          "Devuelve el estado actual del carrito del cliente. Usa esto cuando el cliente pregunte qué tiene en el carrito.",
        parameters: {
          type: "OBJECT",
          properties: {},
        },
      },
      {
        name: "clear_cart",
        description:
          "Vacía completamente el carrito del cliente. Usa esto cuando el cliente quiera vaciar/limpiar su carrito.",
        parameters: {
          type: "OBJECT",
          properties: {},
        },
      },
      {
        name: "create_checkout",
        description:
          "Genera un link de checkout con los productos del carrito actual. Usa esto cuando el cliente confirme que quiere proceder con la compra. Incluye el checkout_url en tu respuesta.",
        parameters: {
          type: "OBJECT",
          properties: {},
        },
      },
    ],
  },
];

async function executeTool(toolName, toolInput, sessionId) {
  const session = getSession(sessionId);
  const timer = createTimer();

  // Log structure: [COMPONENT] [SESSION_ID] [TOOL] message
  const logPrefix = `[AI] [${sessionId.substring(0, 8)}...] [${toolName}]`;

  switch (toolName) {
    case "search_products": {
      // query es una cadena de texto (lenguaje natural)
      const query = toolInput.query;
      logStart(sessionId, `executeTool[search_products]`, { query });
      console.log(`${logPrefix} query: "${query}"`);

      try {
        // READ operation: mcp-client already handles retry internally
        // Call directly without wrapping in another withRetry
        const result = await searchProducts(query);

        const productsFound = result?.products?.length || 0;
        console.log(`${logPrefix} found ${productsFound} products`);
        logSuccess(sessionId, `executeTool[search_products]`, timer.elapsed(), {
          query,
          productsFound
        });

        // Telemetry: log search event
        logEvent(sessionId, "SEARCH", { query, productsFound });

        // Simplificar la respuesta para Gemini: incluir solo datos esenciales y variant_id claramente identificado
        const simplifiedProducts = result?.products?.map(product => {
          const firstVariant = product.variants?.[0];

          // Extraer primera imagen del array media (para que Gemini la vea fácilmente)
          const firstImage = product.media?.find(m => m.type === "image");
          const image_url = firstImage?.url;
          const image_alt = firstImage?.alt_text || product.title;

          // Determinar disponibilidad del producto (si alguna variante está disponible)
          const available = product.variants?.some(v => v.available_for_sale) || false;

          // Detectar si hay múltiples variantes/opciones
          const has_variants = product.variants && product.variants.length > 1;

          // Extraer opciones de variantes (tallas, colores, etc.)
          const variant_options = product.options?.map(option => ({
            name: option.name,
            values: option.values
          })) || [];

          // Construir URL del producto usando la tienda Shopify
          const shopDomain = process.env.SHOPIFY_SHOP;
          const productHandle = product.handle || product.id?.split('/').pop();
          const product_url = productHandle
            ? `https://${shopDomain}/products/${productHandle}`
            : null;

          return {
            id: product.id,
            title: product.title,
            description: product.description,
            price_range: product.price_range,
            // CRÍTICO: Incluir variant_id como field de primer nivel para que Gemini lo vea claramente
            variant_id: firstVariant?.id,
            variant_title: firstVariant?.title,
            variant_price: firstVariant?.price?.amount
              ? (firstVariant.price.amount / 100).toFixed(2)
              : undefined,
            // Disponibilidad y variantes
            available: available,
            has_variants: has_variants,
            variant_options: variant_options,
            // Imágenes: extraídas al primer nivel para facilitar acceso a Gemini
            image_url: image_url,
            image_alt: image_alt,
            // Link del producto
            product_url: product_url,
            variants: product.variants,
            options: product.options,
            media: product.media
          };
        }) || [];

        if (simplifiedProducts.length > 0 && simplifiedProducts[0].variant_id) {
          console.log(`${logPrefix} first variant_id: ${simplifiedProducts[0].variant_id.substring(0, 50)}...`);
        }

        return { products: simplifiedProducts };
      } catch (error) {
        const errorInfo = handleError(error, 'search_products', false); // isWriteOperation = false
        console.error(`${logPrefix} [${errorInfo.errorType}] ${errorInfo.userMessage}`);
        logError(sessionId, `executeTool[search_products]`, error, { query, errorType: errorInfo.errorType });
        logEvent(sessionId, "ERROR", { tool: "search_products", errorType: errorInfo.errorType, errorMessage: errorInfo.userMessage });
        return { error: errorInfo.userMessage, errorType: errorInfo.errorType, products: [] };
      }
    }

    case "answer_policy_question": {
      // Responde preguntas sobre políticas
      const query = toolInput.query;
      console.log(`${logPrefix} query: "${query}"`);
      logStart(sessionId, `executeTool[answer_policy_question]`, { query });

      try {
        // READ operation: mcp-client already handles retry internally
        // Call directly without wrapping in another withRetry
        const result = await searchPolicies(query);
        console.log(`${logPrefix} policy answer obtained`);
        logSuccess(sessionId, `executeTool[answer_policy_question]`, timer.elapsed(), { query });
        return result;
      } catch (error) {
        const errorInfo = handleError(error, 'answer_policy_question', false); // isWriteOperation = false
        console.error(`${logPrefix} [${errorInfo.errorType}] ${errorInfo.userMessage}`);
        logError(sessionId, `executeTool[answer_policy_question]`, error, { query, errorType: errorInfo.errorType });
        return { error: errorInfo.userMessage, errorType: errorInfo.errorType, answer: "No pude obtener información sobre esa política." };
      }
    }

    case "add_to_cart": {
      logStart(sessionId, `executeTool[add_to_cart]`, { title: toolInput.title, quantity: toolInput.quantity });
      console.log(`${logPrefix} adding variant_id: ${toolInput.variant_id.substring(0, 50)}..., quantity: ${toolInput.quantity}`);

      try {
        // WRITE operation: do NOT retry on timeout after request sent
        // Just call updateCart directly (mcp-client has its own retry for connection errors)
        if (!session.cartId) {
          console.log(`${logPrefix} creating new cart...`);
        }

        // Llamar a updateCart del MCP
        const mcpResult = await updateCart({
          cart_id: session.cartId || undefined,
          add_items: [
            {
              product_variant_id: toolInput.variant_id,
              quantity: toolInput.quantity,
            },
          ],
        });

        // Guardar cartId y sincronizar cart
        if (mcpResult.cart) {
          setCartId(sessionId, mcpResult.cart.id);
          syncCartFromMCP(sessionId, mcpResult.cart);
          console.log(`${logPrefix} cart synced. ID: ${mcpResult.cart.id}, items: ${mcpResult.cart.lines?.length}`);
        } else {
          console.warn(`${logPrefix} warning: no cart in response`);
        }

        const updatedSession = getSession(sessionId);
        console.log(`${logPrefix} cart now has ${updatedSession.cart.length} items`);

        logCartOperation(sessionId, "add", {
          title: toolInput.title,
          price: toolInput.price,
          quantity: toolInput.quantity,
          cartTotal: updatedSession.cart.length
        }, true);

        // Telemetry: log add to cart event
        logEvent(sessionId, "ADD_TO_CART", {
          title: toolInput.title,
          price: toolInput.price,
          quantity: toolInput.quantity,
          cartTotal: updatedSession.cart.length
        });

        logSuccess(sessionId, `executeTool[add_to_cart]`, timer.elapsed(), {
          title: toolInput.title,
          cartTotal: updatedSession.cart.length
        });

        return { success: true, cart: updatedSession.cart };
      } catch (error) {
        const errorInfo = handleError(error, 'add_to_cart', true); // isWriteOperation = true
        console.error(`${logPrefix} [${errorInfo.errorType}] ${errorInfo.userMessage}`);
        logError(sessionId, `executeTool[add_to_cart]`, error, { productTitle: toolInput.title, errorType: errorInfo.errorType });
        logEvent(sessionId, "ERROR", { tool: "add_to_cart", errorType: errorInfo.errorType, errorMessage: errorInfo.userMessage, productTitle: toolInput.title });
        return { error: errorInfo.userMessage, errorType: errorInfo.errorType };
      }
    }

    case "remove_from_cart": {
      logStart(sessionId, `executeTool[remove_from_cart]`, { title: toolInput.title });
      console.log(`${logPrefix} removing variant_id: ${toolInput.variant_id.substring(0, 50)}...`);

      try {
        // Buscar el line_id del item a eliminar
        const item = session.cart.find((i) => i.variant_id === toolInput.variant_id);
        if (!item) {
          console.warn(`${logPrefix} product not found in cart`);
          logError(sessionId, `executeTool[remove_from_cart]`, "Product not found in cart", { title: toolInput.title });
          return { error: "Producto no encontrado en el carrito", errorType: "NOT_FOUND" };
        }

        // WRITE operation: do NOT retry on timeout after request sent
        // Llamar a updateCart del MCP para remover el item
        const mcpResult = await updateCart({
          cart_id: session.cartId,
          remove_line_ids: [item.line_id],
        });

        // Sincronizar cart
        if (mcpResult.cart) {
          syncCartFromMCP(sessionId, mcpResult.cart);
          console.log(`${logPrefix} product removed. cart now has ${session.cart.length} items`);
        }

        logCartOperation(sessionId, "remove", { title: toolInput.title, cartTotal: session.cart.length }, true);
        logSuccess(sessionId, `executeTool[remove_from_cart]`, timer.elapsed(), { title: toolInput.title });

        return { success: true, cart: session.cart };
      } catch (error) {
        const errorInfo = handleError(error, 'remove_from_cart', true); // isWriteOperation = true
        console.error(`${logPrefix} [${errorInfo.errorType}] ${errorInfo.userMessage}`);
        logError(sessionId, `executeTool[remove_from_cart]`, error, { title: toolInput.title, errorType: errorInfo.errorType });
        return { error: errorInfo.userMessage, errorType: errorInfo.errorType };
      }
    }

    case "update_cart_item": {
      logStart(sessionId, `executeTool[update_cart_item]`, { title: toolInput.title, newQuantity: toolInput.new_quantity });
      console.log(`${logPrefix} updating quantity: variant_id ${toolInput.variant_id.substring(0, 50)}..., new_quantity: ${toolInput.new_quantity}`);

      try {
        // Buscar el item
        const item = session.cart.find((i) => i.variant_id === toolInput.variant_id);
        if (!item) {
          console.warn(`${logPrefix} product not found in cart`);
          logError(sessionId, `executeTool[update_cart_item]`, "Product not found in cart", { title: toolInput.title });
          return { error: "Producto no encontrado en el carrito", errorType: "NOT_FOUND" };
        }

        // WRITE operation: do NOT retry on timeout after request sent
        // Llamar a updateCart del MCP
        const mcpResult = await updateCart({
          cart_id: session.cartId,
          update_items: [
            {
              id: item.line_id,
              quantity: toolInput.new_quantity,
            },
          ],
        });

        // Sincronizar cart
        if (mcpResult.cart) {
          syncCartFromMCP(sessionId, mcpResult.cart);
          console.log(`${logPrefix} quantity updated successfully`);
        }

        logCartOperation(sessionId, "update", { title: toolInput.title, newQuantity: toolInput.new_quantity }, true);
        logSuccess(sessionId, `executeTool[update_cart_item]`, timer.elapsed(), { title: toolInput.title });

        return { success: true, cart: session.cart };
      } catch (error) {
        const errorInfo = handleError(error, 'update_cart_item', true); // isWriteOperation = true
        console.error(`${logPrefix} [${errorInfo.errorType}] ${errorInfo.userMessage}`);
        logError(sessionId, `executeTool[update_cart_item]`, error, { title: toolInput.title, errorType: errorInfo.errorType });
        return { error: errorInfo.userMessage, errorType: errorInfo.errorType };
      }
    }

    case "view_cart": {
      logStart(sessionId, `executeTool[view_cart]`, { cartItems: session.cart.length });
      console.log(`${logPrefix} viewing cart with ${session.cart.length} items`);

      try {
        // READ operation: returning local session cart (no external call)
        logSuccess(sessionId, `executeTool[view_cart]`, timer.elapsed(), { cartItems: session.cart.length });
        return { cart: session.cart };
      } catch (error) {
        const errorInfo = handleError(error, 'view_cart', false); // isWriteOperation = false
        console.error(`${logPrefix} [${errorInfo.errorType}] ${errorInfo.userMessage}`);
        logError(sessionId, `executeTool[view_cart]`, error, { errorType: errorInfo.errorType });
        return { error: errorInfo.userMessage, errorType: errorInfo.errorType, cart: [] };
      }
    }

    case "clear_cart": {
      logStart(sessionId, `executeTool[clear_cart]`, { itemsCleared: session.cart.length });
      console.log(`${logPrefix} clearing cart (${session.cart.length} items)`);

      try {
        // WRITE operation: do NOT retry on timeout after request sent
        if (session.cartId) {
          // Llamar a updateCart del MCP para limpiar
          const lineIds = session.cart.map((item) => item.line_id);
          if (lineIds.length > 0) {
            await updateCart({
              cart_id: session.cartId,
              remove_line_ids: lineIds,
            });
          }
        }

        // Limpiar session
        clearCart(sessionId);
        console.log(`${logPrefix} cart cleared successfully`);
        logCartOperation(sessionId, "clear", { itemsCleared: session.cart.length }, true);
        logSuccess(sessionId, `executeTool[clear_cart]`, timer.elapsed(), { itemsCleared: session.cart.length });
        return { success: true, cart: session.cart };
      } catch (error) {
        const errorInfo = handleError(error, 'clear_cart', true); // isWriteOperation = true
        console.error(`${logPrefix} [${errorInfo.errorType}] ${errorInfo.userMessage}`);
        // Limpiar session localmente anyway
        clearCart(sessionId);
        logError(sessionId, `executeTool[clear_cart]`, error, { errorType: errorInfo.errorType });
        return { error: errorInfo.userMessage, errorType: errorInfo.errorType, success: false };
      }
    }

    case "create_checkout": {
      logStart(sessionId, `executeTool[create_checkout]`, { cartItems: session.cart.length });
      console.log(`${logPrefix} creating checkout with cartId: ${session.cartId}`);

      try {
        if (!session.cartId) {
          console.warn(`${logPrefix} no active cart`);
          logError(sessionId, `executeTool[create_checkout]`, "No active cart", {});
          return { error: "No hay carrito activo", errorType: "NOT_FOUND" };
        }

        if (session.cart.length === 0) {
          console.warn(`${logPrefix} cart is empty`);
          logError(sessionId, `executeTool[create_checkout]`, "Cart is empty", {});
          return { error: "El carrito está vacío", errorType: "NOT_FOUND" };
        }

        // WRITE operation: do NOT retry on timeout after request sent
        // Obtener el carrito final con checkout_url
        const mcpResult = await getCart(session.cartId);
        const checkoutUrl = mcpResult.cart?.checkout_url;

        if (!checkoutUrl) {
          console.error(`${logPrefix} checkout_url not found in response`);
          logError(sessionId, `executeTool[create_checkout]`, "Checkout URL not found", {});
          return { error: "No se pudo generar el checkout", errorType: "INVALID_RESPONSE" };
        }

        // Calcular total del carrito antes de limpiar
        const cartTotal = session.cart.reduce((sum, item) => sum + (parseFloat(item.price) * item.quantity), 0).toFixed(2);

        // Limpiar session después de checkout
        clearCart(sessionId);

        console.log(`${logPrefix} checkout created successfully: ${checkoutUrl.substring(0, 80)}...`);

        // Telemetry: log checkout event (critical for conversion tracking)
        logEvent(sessionId, "CHECKOUT_CREATED", {
          cartItems: session.cart.length,
          cartTotal
        });

        logSuccess(sessionId, `executeTool[create_checkout]`, timer.elapsed(), {
          cartItems: session.cart.length,
          cartTotal
        });

        return { checkout_url: checkoutUrl };
      } catch (error) {
        const errorInfo = handleError(error, 'create_checkout', true); // isWriteOperation = true
        console.error(`${logPrefix} [${errorInfo.errorType}] ${errorInfo.userMessage}`);
        logError(sessionId, `executeTool[create_checkout]`, error, { errorType: errorInfo.errorType });
        return { error: errorInfo.userMessage, errorType: errorInfo.errorType };
      }
    }

    default:
      return { error: `Tool desconocida: ${toolName}` };
  }
}

async function processMessage(sessionId, userMessage) {
  const logPrefix = `[AI] [${sessionId.substring(0, 8)}...]`;
  const session = getSession(sessionId);
  const messageTimer = createTimer();

  // Track if this is the first message (new session)
  const isFirstMessage = session.messages.length === 0;

  if (isFirstMessage) {
    logSessionEvent(sessionId, "start", { messageCount: 0 });
    logEvent(sessionId, "SESSION_START", { firstMessageLength: userMessage.length });
  }

  logUserMessage(sessionId, userMessage, userMessage.length, isFirstMessage);
  console.log(`${logPrefix} [processMessage] starting message processing`);
  addMessage(sessionId, "user", userMessage);

  // Resolve shop name dynamically (cached after first call per shop)
  const shop = process.env.SHOPIFY_SHOP;
  const shopName = await resolveShopName(shop);

  const model = genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction: buildSystemPrompt(shopName),
    tools,
  });

  const history = session.messages.slice(0, -1).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const chat = model.startChat({ history });

  const cartContext =
    session.cart.length > 0
      ? `\n[Estado actual del carrito: ${JSON.stringify(session.cart)}]`
      : "\n[El carrito está vacío]";

  console.log(`${logPrefix} [processMessage] sending to Gemini (history: ${history.length} msgs)`);

  try {
    // Wrap Gemini call with timeout to handle unresponsive API
    let result = await executeWithTimeout(
      () => chat.sendMessage(userMessage + cartContext),
      10000,  // 10 second timeout for Gemini
      `chat.sendMessage`
    );
    let response = result.response;
    let toolCallCount = 0;

    while (
      response?.candidates?.[0]?.content?.parts?.some((p) => p.functionCall)
    ) {
      const functionCalls = response.candidates[0].content.parts.filter(
        (p) => p.functionCall
      );

      toolCallCount += functionCalls.length;
      console.log(`${logPrefix} [processMessage] executing ${functionCalls.length} tool calls`);
      logStart(sessionId, `executeToolCalls`, { count: functionCalls.length });

      const functionResponses = [];
      for (const part of functionCalls) {
        const { name, args } = part.functionCall;
        try {
          const toolResult = await executeTool(name, args, sessionId);
          functionResponses.push({
            functionResponse: {
              name,
              response: Array.isArray(toolResult)
                ? { results: toolResult }
                : toolResult,
            },
          });
        } catch (error) {
          console.error(`${logPrefix} [processMessage] tool error in ${name}: ${error.message}`);
          logError(sessionId, `executeToolCalls[${name}]`, error, {});
          functionResponses.push({
            functionResponse: {
              name,
              response: { error: error.message },
            },
          });
        }
      }

      console.log(`${logPrefix} [processMessage] sending tool results back to Gemini`);
      result = await executeWithTimeout(
        () => chat.sendMessage(functionResponses),
        10000,  // 10 second timeout for Gemini
        `chat.sendMessage[followup]`
      );
      response = result.response;
    }

    // Success case: extract assistant text and return response
    const assistantText = response?.text?.() || "";

    addMessage(sessionId, "assistant", assistantText);

    const updatedSession = getSession(sessionId);
    const totalDuration = messageTimer.elapsed();
    console.log(`${logPrefix} [processMessage] completed. response length: ${assistantText.length} chars, cart items: ${updatedSession.cart.length}`);

    logBotResponse(sessionId, assistantText, assistantText.length, toolCallCount, totalDuration);
    logSuccess(sessionId, "processMessage", totalDuration, {
      responseLength: assistantText.length,
      toolCalls: toolCallCount,
      cartItems: updatedSession.cart.length,
      messageHistoryLength: updatedSession.messages.length
    });

    return {
      response: assistantText,
      state: updatedSession.state,
      cart: updatedSession.cart,
    };
  } catch (geminiError) {
    const errorInfo = handleError(geminiError, 'processMessage', false); // Gemini is READ-like from user perspective
    console.error(`${logPrefix} [${errorInfo.errorType}] Gemini error: ${errorInfo.userMessage}`);
    logError(sessionId, `processMessage[gemini]`, geminiError, { errorType: errorInfo.errorType });

    // Return error response to user
    const assistantText = errorInfo.userMessage;
    addMessage(sessionId, "assistant", assistantText);

    const updatedSession = getSession(sessionId);
    logBotResponse(sessionId, assistantText, assistantText.length, 0, messageTimer.elapsed());

    return {
      response: assistantText,
      errorType: errorInfo.errorType,
      state: updatedSession.state,
      cart: updatedSession.cart,
    };
  }
}

module.exports = { processMessage };
