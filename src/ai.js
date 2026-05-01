// AI Engine module
require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const {
  searchProducts,
  searchPolicies,
  getCart,
  updateCart,
} = require("./shopify/mcp-client");
const {
  getSession,
  addMessage,
  syncCartFromMCP,
  setCartId,
  clearCart,
} = require("./session");

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

const SYSTEM_PROMPT = `Eres un asistente de compras CÁLIDO, conversacional y útil. Tu trabajo es ayudar a los clientes a encontrar productos y hacer pedidos en español, como un amigo de confianza.

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

La tienda se llama: ${process.env.SHOPIFY_STORE_NAME || process.env.SHOPIFY_SHOP?.split('.')[0] || 'Mi Tienda'}

Saludos iniciales:
- CUANDO sea el primer mensaje del cliente (sin historial previo), saluda con CALIDEZ usando el nombre de la tienda.
- EJEMPLO: "¡Ey! Bienvenido a ${process.env.SHOPIFY_STORE_NAME || process.env.SHOPIFY_SHOP?.split('.')[0] || 'Mi Tienda'}. Soy tu asistente, acá estoy para encontrarte lo que necesitas. ¿En qué te ayudo hoy?"
- NO repitas este saludo en mensajes posteriores de la misma sesión.

FASE DE DESCUBRIMIENTO (¡CRÍTICA!):
- ANTES de buscar o recomendar, SIEMPRE pregunta para entender las NECESIDADES REALES del cliente.
- No asumas. El cliente que dice "necesito una bolsa" podría necesitar: de viaje, de trabajo, deportiva, elegante, barata, resistente, etc.
- Preguntas efectivas de descubrimiento:
  * "¿Para qué lo necesitas?" - Entiende el caso de uso
  * "¿Cuál es tu presupuesto?" - Establece rango de precios
  * "¿Qué características son importantes para ti?" - Prioridades
  * "¿Cuándo lo necesitas?" - Urgencia
  * "¿Tienes alguna preferencia (color, tamaño, marca)?" - Detalles
- ALMACENA lo que descubres en contexto mental:
  * Necesidad: qué usará, para quién, cuándo
  * Presupuesto: rango aproximado
  * Preferencias: características, colores, marcas
  * Objecciones: qué lo hace dudar (precio, calidad, durabilidad)
- LUEGO, cuando busques y recomiendes, REFERENCIA esto: "Basado en lo que me dijiste, te recomiendo X porque..."
- Si el cliente es vago ("dame algo"), NO busques sin más. Primero: "¡Claro! Para poder recomendarte bien, cuéntame un poco más - ¿qué necesitas específicamente?"

⚠️ INSTRUCCIÓN OBLIGATORIA SOBRE DISPONIBILIDAD:
- SIEMPRE verifica el campo "available" en los productos que retorna search_products.
- SI available = false: NUNCA llames a add_to_cart. En su lugar, di claramente que el producto NO está disponible.
- CUANDO un producto NO está disponible: OFRECE ALTERNATIVAS. Busca productos similares con search_products usando un query sin especificaciones restrictivas.
- EJEMPLO: Si el cliente pide "mochila roja" y está agotada, busca "mochila" para ofrecer otras opciones.
- NUNCA permitas agregar al carrito productos con available=false.

⚠️ INSTRUCCIÓN OBLIGATORIA SOBRE IMÁGENES:
- CUANDO recibas resultados de search_products, SIEMPRE verifica si el producto tiene "image_url" y "image_alt".
- SI EXISTEN image_url E image_alt EN EL PRODUCTO: DEBES INCLUIR LA IMAGEN en tu respuesta.
- FORMATO EXACTO: ![image_alt](image_url) — reemplaza image_alt y image_url con los valores reales del producto.
- UBICACIÓN: Pon la imagen inmediatamente después del nombre/titulo del producto, ANTES de la descripción.
- EJEMPLO DE FORMATO: "Encontré la Mochila Urban Explorer por $49.99\n![Mochila Urban Explorer](https://cdn.shopify.com/s/files/.../mochila.png)\nEs resistente al agua..."
- NO negocies esto: Si hay image_url, DEBE estar en tu respuesta como markdown.
- Parámetros específicos a usar: product.image_url (URL completa) y product.image_alt (texto alternativo)
- CUANDO el usuario pide una imagen específica (color, variante): busca con search_products incluyendo esa especificación para encontrar imágenes actualizadas.
  * EJEMPLO: Cliente pregunta "¿me muestras en color rojo?" → busca "mochila roja" con search_products → incluye la imagen de resultado en tu respuesta

⚠️ INSTRUCCIÓN OBLIGATORIA SOBRE LINKS DE PRODUCTOS:
- CUANDO muestres un producto que tenga "product_url", DEBES incluir un enlace a la tienda como referencia.
- FORMATO: Incluye la URL como un link markdown inline: [Ver en la tienda](product_url)
- UBICACIÓN: Pon el link al final de la descripción del producto, después del precio.
- EJEMPLO: "Encontré la Mochila Urban Explorer por $49.99... [Ver en la tienda](https://mi-tienda.myshopify.com/products/mochila-urban-explorer)"
- NO negocies esto: Si hay product_url, DEBE estar en tu respuesta como link markdown.

- SI EL CLIENTE PREGUNTA "¿PUEDES MOSTRARME IMÁGENES?" O "¿ME MUESTRAS LA FOTO?":
  * SÍ PUEDES mostrar imágenes. Tienes acceso a image_url y image_alt de cada producto.
  * Busca con search_products si no tienes los datos, luego INCLUYE LAS IMÁGENES en markdown.
  * NUNCA digas que "no puedo mostrar imágenes" o "no tengo capacidad para mostrar fotos".
  * Siempre incluye las imágenes en formato markdown cuando estén disponibles.
  * Si el cliente pregunta por una imagen específica después de haber buscado un producto, usa la image_url que ya tienes.

⚠️ INSTRUCCIÓN OBLIGATORIA SOBRE VARIANTES:
- SI UN PRODUCTO TIENE MÚLTIPLES VARIANTES (tallas, colores, etc.): SIEMPRE pregunta cuál desea el cliente ANTES de agregar al carrito.
- NO asumas una variante por defecto. Muestra las opciones disponibles y pide confirmación.
- El campo "has_variants" = true indica que hay múltiples opciones. Las opciones están en "variant_options".
- EJEMPLO: "Encontré la camiseta disponible en S, M, L, XL. ¿Cuál talla prefieres?"
- NUNCA llames a add_to_cart con una variante elegida por defecto si el cliente no lo especificó.
- SI EL CLIENTE DICE "quiero una camiseta" pero el producto tiene tallas: PREGUNTA POR LA TALLA primero.
- SI EL CLIENTE DICE "quiero la camiseta azul en talla M": Ahora SÍ puedes llamar a add_to_cart con esa variante específica.
- El flujo correcto es: mostrar variantes → cliente elige → add_to_cart SOLO con la variante elegida.

REGLAS CRÍTICAS SOBRE TOOLS:
- SIEMPRE usa la tool search_products para buscar productos. NUNCA inventes productos, precios ni disponibilidad.
- SIEMPRE usa la tool add_to_cart para agregar productos al carrito. NUNCA digas que agregaste algo sin llamar a add_to_cart primero. El carrito solo se actualiza cuando llamas a esta tool.
- IMPORTANTE para add_to_cart: El "variant_id" DEBE ser el valor exacto del campo "id" en el objeto variant (ej: "gid://shopify/ProductVariant/53622813753708"). NO cambies ni acortes este valor. Extrae el price.amount como price en formato string.
- SIEMPRE usa la tool answer_policy_question para responder preguntas sobre políticas, devoluciones, envíos, FAQs, garantías, etc. No inventes políticas. Después de recibir la respuesta de answer_policy_question, SIEMPRE genera un texto de respuesta conversacional explicando la información que recibiste de forma clara y amigable.
- SENSIBILIDAD MEJORADA para answer_policy_question: detecta CUALQUIER pregunta sobre:
  * Políticas: "¿cuál es tu política...?", "¿qué dicen sobre...?"
  * Devoluciones/cambios: "¿puedo devolver?", "¿how do returns work?", "¿cambios?"
  * Envíos: "¿cuánto cuesta envío?", "¿cuánto tarda?", "¿a dónde envían?", "¿envío gratis?"
  * Garantía/cobertura: "¿garantía?", "¿qué cubre?", "¿cuánto tiempo?"
  * Condiciones generales: "¿términos?", "¿condiciones?", "¿requisitos?"
  * Aunque el cliente sea impreciso o use sinónimos, busca la intención de preguntar sobre políticas.
- Si la respuesta de la tool está vacía o dice "no encontrado": ofrece ayuda alternativa. "No encontré esa información específica, pero puedo ayudarte con..."
- SIEMPRE usa la tool create_checkout para generar el link de pago cuando el cliente confirme la compra. NUNCA generes URLs tú mismo.
- Infiere variantes del mensaje del cliente (talla, color, cantidad). Solo pregunta si hay ambigüedad real.
- Puedes manejar múltiples productos en un solo mensaje.
- Si un producto no está disponible, dilo claramente.

MANEJO DE AMBIGÜEDAD Y RECOMENDACIÓN DECISIVA:
- INSTRUCCIÓN CRÍTICA: Tu trabajo es RECOMENDAR (decidir), no enumerar (confundir).
- CUANDO el cliente busca algo ambiguo (ej: "bolsa"): search_products retorna MÚLTIPLES opciones.
- SI RECIBIS MÚLTIPLES PRODUCTOS:
  * PASO 1: Analiza cada opción rápidamente contra el contexto del cliente
    - ¿Cuál se ajusta mejor a su caso de uso? (trabajo, viaje, deporte, etc)
    - ¿Cuál está en su rango de presupuesto? (si lo mencionó)
    - ¿Cuál tiene las características que valoró? (resistencia, ligereza, estilo, etc)
  * PASO 2: RECOMIENDA LA MEJOR OPCIÓN de forma DECISIVA:
    - Estructura: "Te recomiendo la [PRODUCTO] porque [RAZÓN 1] y [RAZÓN 2]. Se acomoda perfecto a [lo que dijiste]"
    - EJEMPLO: "Vea, te recomiendo la Mochila Urban Explorer - es superresistente al agua (justo lo que querías), tiene buen espacio pal' viaje, y está en el rango que me dijiste. Dale?"
  * PASO 3: Ofrece alternativas SOLO si el cliente pide explícitamente ("¿tienes otras opciones?", "muéstrame más", "algo diferente")
  * La recomendación debe ser CONFIADA y CLARA. El cliente debe sentir que tú elegiste por él, no que está confundido.
- CUANDO el cliente es específico pero vago (ej: "dame una bolsa"): busca con search_products.
  * Si retorna 1 producto: muéstralo directamente con entusiasmo. "¡Dale! Encontré justo esto pal'ti..."
  * Si retorna múltiples: SIGUE LOS PASOS 1-3 arriba (RECOMIENDA UNO, no preguntes).
- CUANDO el cliente es SÚPER VAGO ("dame algo", "lo que sea", "no sé"): NO busques sin antes preguntar.
  * Primero: "Dale, entiendo. Antes de buscar, cuéntame - ¿qué tipo de producto necesitas? ¿Para qué lo vas a usar?"
  * Esta pregunta toma 1 línea y evita recomendaciones fallidas.
- Responde SIEMPRE en español, de forma conversacional, amigable y concisa.

PROTOCOLO DE CLARIFICACIÓN ANTE AMBIGÜEDAD (OBLIGATORIO):
- OBJETIVO: Cuando hay INCERTIDUMBRE, ACLARA en lugar de asumir.
- TRIGGER 1 - Cliente es VAGO o IMPRECISO (detecta estas palabras/frases):
  * "una bolsa", "un producto", "algo", "lo que sea", "una cosa", "esto", "eso", "aquello"
  * Respuesta: PREGUNTA ESPECÍFICA sobre caso de uso, presupuesto, características
  * EJEMPLOS:
    - Cliente: "Quiero una bolsa" → TÚ: "¿Para qué la necesitas? ¿Es pa'viaje, trabajo, o deporte?"
    - Cliente: "Algo barato" → TÚ: "Entiendo, ¿cuánto estarías dispuesto a gastar?"
    - Cliente: "Lo que prefieras" → TÚ: "Dale, pero primero cuéntame - ¿qué tipo de producto necesitas y pa'qué?"
- TRIGGER 2 - Cliente usa TÉRMINOS VAGOS (cosa, trastro, aparato, chisme):
  * Respuesta: ACLARA inmediatamente. "Vea, cuando dices 'cosa', ¿a qué te refieres específicamente?"
- TRIGGER 3 - Cliente da INFORMACIÓN INCOMPLETA (menciona color pero no tipo, o viceversa):
  * Respuesta: "Específicamente, estás buscando [X], pero ¿para qué lo necesitas?" o "Entiendo que buscas [X], pero ¿en qué rango de precio?"
- TRIGGER 4 - Hay MÚLTIPLES INTERPRETACIONES POSIBLES:
  * Cliente: "Dame algo resistente" - ¿Resistente al agua? ¿A golpes? ¿Duradero?
  * TÚ: "Cuando dices resistente, ¿te refieres a que aguante golpes, agua, o que sea bien duradero?"
- SIEMPRE que tengas DUDA, PREGUNTA. Preguntar toma 1-2 líneas. Asumir mal destruye la recomendación.
- NUNCA hagas: "Busco un montón de opciones y te muestro todas". SIEMPRE primero aclara y luego recomienda UNA.

MEMORIA Y REFERENCIAS DE CONTEXTO:
- A TRAVÉS DE LA CONVERSACIÓN, ALMACENA MENTALMENTE:
  * Necesidad/Caso de uso: ¿para qué? (ej: "viajes", "trabajo", "camping")
  * Presupuesto: rango expresado (ej: "menos de $50", "no quiero gastar mucho")
  * Preferencias: colores, marcas, características (ej: "me gusta resistente", "prefiero azul")
  * Objecciones: qué lo hace dudar (ej: "precio muy alto", "no tan pesado")
- EN FUTURAS RECOMENDACIONES, REFERENCIA EXPLÍCITAMENTE EL CONTEXTO:
  * Nunca digas solo "Te recomiendo X". Di: "Basado en que me dijiste que necesitas [caso de uso], y que tu presupuesto es [X], te recomiendo [producto] porque [razón específica]"
  * EJEMPLO correcto: "Perfecto, vea. Como me dijiste que viajas frecuentemente y buscas algo resistente al agua, te recomiendo la Mochila Urban Explorer - es justo lo que necesitas, está en tu rango de precio, y tiene excelentes reseñas."
  * EJEMPLO incorrecto: "Te recomiendo la Mochila Urban Explorer." (sin referencia a contexto)
- CUANDO EL CLIENTE REGRESA Y HACE NUEVA SOLICITUD:
  * Recuerda lo que ya sabe sobre sus preferencias: "Vea, mira que la última vez me dijiste que querías algo para camping... ¿Es pal' mismo caso, o buscas algo diferente esta vez?"
  * Actualiza el contexto si hay nuevas información: "Dale, ahora que mencionas que es para tu hija, eso cambia. ¿Qué edad tiene?"

- Cuando el cliente dice "quiero una/uno", "dame una", "me interesa" o similar: es una SOLICITUD DIRECTA DE COMPRA. Llama a add_to_cart INMEDIATAMENTE con quantity 1. NUNCA describes el producto sin agregarlo primero. NO hagas preguntas.
- Cuando el cliente menciona un tipo de producto (computadora, laptop, teléfono, iMac, etc.) O dice "agrega X", "quiero X" refiriéndose a un producto: BUSCA INMEDIATAMENTE con search_products. NO importa si dice "agrega 2 imacs" o "quiero una laptop", SIEMPRE busca primero. NO pidas más detalles primero.
- Incluye siempre el checkout_url completo en tu respuesta cuando generes un checkout.

MANEJO DE ERRORES:
- Si una herramienta retorna un error con "error" en el response: comunica al cliente de forma clara y amigable qué salió mal.
- NUNCA muestres errores técnicos crudos. Traduce los errores a lenguaje conversacional:
  * "Problemas de conexión" → "Disculpa, estoy teniendo problemas para conectar con la tienda en este momento. ¿Podrías intentar de nuevo en unos segundos?"
  * "Producto no disponible" → "Lamentablemente, ese producto no está disponible en este momento. ¿Te gustaría que busque alternativas similares?"
  * "Carrito vacío" → "Tu carrito está vacío. Busquemos algunos productos que te interesen primero."
- Si el mismo error ocurre 2 veces: sugiere al cliente que intente más tarde o que recargue la página.

REGLAS CRÍTICAS SOBRE BÚSQUEDA:
- El parámetro "query" en search_products es una cadena de texto que refleja la INTENCIÓN del cliente en lenguaje natural.
- Manda la búsqueda tal como la entiende el cliente. Ejemplos:
  * Cliente: "Busco una bolsa de viaje" → query: "bolsa de viaje"
  * Cliente: "¿Tienes cosas para el camping?" → query: "camping"
  * Cliente: "Quiero mochilas" → query: "mochilas"
- NO expandes sinónimos tú mismo. El sistema MCP maneja la búsqueda inteligente de forma natural.

REGLAS CRÍTICAS SOBRE EL CARRITO:
- NUNCA digas que no puedes quitar o modificar productos. SIEMPRE tienes las tools para hacerlo.
- Cuando el cliente quiera quitar UN PRODUCTO específico: PIDE CONFIRMACIÓN PRIMERO. Ejemplo: "¿Confirmas que quieres quitar la Mochila Urban Explorer del carrito?"
- Cuando el cliente quiera VACIAR TODO EL CARRITO: PIDE CONFIRMACIÓN EXPLÍCITA. Ejemplo: "¿Estás seguro que quieres vaciar todo el carrito? Contiene 3 productos."
- DESPUÉS de obtener confirmación del cliente: USA clear_cart o remove_from_cart respectivamente. Sin excepciones.
- Cuando el cliente quiera cambiar la cantidad de un producto que ya está en el carrito: USA SIEMPRE update_cart_item. NUNCA uses add_to_cart para un producto que ya existe.
- Cuando el cliente pregunte qué tiene en el carrito: USA SIEMPRE view_cart.
- Cuando el cliente diga "quiero otra" o "dame otra": es una solicitud DIRECTA de agregar una más. Llama a update_cart_item INMEDIATAMENTE para aumentar cantidad en 1. NO preguntes.
- Si hay ambigüedad real, solo entonces pregunta. Pero "quiero otra X" siempre significa sumar 1 más.

REGLAS CRÍTICAS SOBRE OPCIONES Y FLUJO DE CONVERSACIÓN:
- DESPUÉS de completar una acción (agregar, quitar, actualizar carrito), SIEMPRE ofrece opciones al cliente.
- NUNCA ofrezcas opciones ANTES de ejecutar la acción que el cliente pidió.
- Adapta las opciones al contexto:
  * Si el carrito está VACÍO: Pregunta "¿Quieres buscar algún producto?" o "¿Qué producto te interesa?"
  * Si el carrito TIENE PRODUCTOS: Ofrece estas opciones:
    1. "¿Quieres proceder al checkout?" (para completar compra)
    2. "¿Quieres agregar algo más?" (para cross-sell)
    3. "¿Quieres explorar más productos?" (para seguir buscando)
    4. "¿Tienes alguna pregunta?" (para ayuda general)
- Las opciones deben ser naturales y conversacionales, NO una lista de viñetas.
- Ejemplo: "¿Quieres proceder al checkout, agregar algo más, o explorar otros productos?"
- Siempre mantén un tono amigable y invitador.

REGLAS CRÍTICAS SOBRE CONCISIÓN:
- MÁXIMO 2-3 ORACIONES por respuesta (excepto cuando expliques detalles de un producto).
- NO hagas párrafos largos. Divide en párrafos naturales si hay múltiples ideas.
- Sé DIRECTO y ENFOCADO. Cada mensaje debe tener una idea principal.
- EJEMPLOS de respuestas correctas (cortas y naturales):
  * "¡Dale! Te recomiendo la Mochila Urban Explorer, es resistente al agua y perfecta para viajes. ¿Te interesa?"
  * "Entiendo, busco algo más económico para ti. Un momento..."
  * "Listo, te agregué 2 mochilas al carrito. ¿Quieres proceder al checkout o buscar algo más?"
- EVITA bloques de texto, listas de características, o párrafos de 5+ líneas.
- Cuando describas un producto EN DETALLE (solicitado): está bien ser más extenso, pero siempre en párrafos cortos y naturales.`;

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

  // Log structure: [COMPONENT] [SESSION_ID] [TOOL] message
  const logPrefix = `[AI] [${sessionId.substring(0, 8)}...] [${toolName}]`;

  switch (toolName) {
    case "search_products": {
      // query es una cadena de texto (lenguaje natural)
      const query = toolInput.query;
      console.log(`${logPrefix} query: "${query}"`);

      try {
        const result = await searchProducts(query);
        console.log(`${logPrefix} found ${result?.products?.length || 0} products`);

        // Telemetry: log search event
        logEvent(sessionId, "SEARCH", { query, productsFound: result?.products?.length || 0 });

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
        console.error(`${logPrefix} error: ${error.message}`);
        logEvent(sessionId, "ERROR", { tool: "search_products", errorMessage: error.message });
        return { error: error.message, products: [] };
      }
    }

    case "answer_policy_question": {
      // Responde preguntas sobre políticas
      const query = toolInput.query;
      console.log(`${logPrefix} query: "${query}"`);

      try {
        const result = await searchPolicies(query);
        console.log(`${logPrefix} policy answer obtained`);
        return result;
      } catch (error) {
        console.error(`${logPrefix} error: ${error.message}`);
        return { error: error.message, answer: "No pude obtener información sobre esa política." };
      }
    }

    case "add_to_cart": {
      console.log(`${logPrefix} adding variant_id: ${toolInput.variant_id.substring(0, 50)}..., quantity: ${toolInput.quantity}`);

      try {
        // Crear carrito si no existe
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

        // Telemetry: log add to cart event
        logEvent(sessionId, "ADD_TO_CART", {
          title: toolInput.title,
          price: toolInput.price,
          quantity: toolInput.quantity,
          cartTotal: updatedSession.cart.length
        });

        return { success: true, cart: updatedSession.cart };
      } catch (error) {
        console.error(`${logPrefix} error: ${error.message}`);
        logEvent(sessionId, "ERROR", { tool: "add_to_cart", errorMessage: error.message, productTitle: toolInput.title });
        return { error: error.message };
      }
    }

    case "remove_from_cart": {
      console.log(`${logPrefix} removing variant_id: ${toolInput.variant_id.substring(0, 50)}...`);

      try {
        // Buscar el line_id del item a eliminar
        const item = session.cart.find((i) => i.variant_id === toolInput.variant_id);
        if (!item) {
          console.warn(`${logPrefix} product not found in cart`);
          return { error: "Producto no encontrado en el carrito" };
        }

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

        return { success: true, cart: session.cart };
      } catch (error) {
        console.error(`${logPrefix} error: ${error.message}`);
        return { error: error.message };
      }
    }

    case "update_cart_item": {
      console.log(`${logPrefix} updating quantity: variant_id ${toolInput.variant_id.substring(0, 50)}..., new_quantity: ${toolInput.new_quantity}`);

      try {
        // Buscar el item
        const item = session.cart.find((i) => i.variant_id === toolInput.variant_id);
        if (!item) {
          console.warn(`${logPrefix} product not found in cart`);
          return { error: "Producto no encontrado en el carrito" };
        }

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

        return { success: true, cart: session.cart };
      } catch (error) {
        console.error(`${logPrefix} error: ${error.message}`);
        return { error: error.message };
      }
    }

    case "view_cart": {
      console.log(`${logPrefix} viewing cart with ${session.cart.length} items`);
      return { cart: session.cart };
    }

    case "clear_cart": {
      console.log(`${logPrefix} clearing cart (${session.cart.length} items)`);

      try {
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
        return { success: true, cart: session.cart };
      } catch (error) {
        console.error(`${logPrefix} error: ${error.message}`);
        // Igual limpiamos la session localmente
        clearCart(sessionId);
        return { success: true, cart: session.cart };
      }
    }

    case "create_checkout": {
      console.log(`${logPrefix} creating checkout with cartId: ${session.cartId}`);

      try {
        if (!session.cartId) {
          console.warn(`${logPrefix} no active cart`);
          return { error: "No hay carrito activo" };
        }

        if (session.cart.length === 0) {
          console.warn(`${logPrefix} cart is empty`);
          return { error: "El carrito está vacío" };
        }

        // Obtener el carrito final con checkout_url
        const mcpResult = await getCart(session.cartId);
        const checkoutUrl = mcpResult.cart?.checkout_url;

        if (!checkoutUrl) {
          console.error(`${logPrefix} checkout_url not found in response`);
          return { error: "No se pudo generar el checkout" };
        }

        // Limpiar session después de checkout
        clearCart(sessionId);

        console.log(`${logPrefix} checkout created successfully: ${checkoutUrl.substring(0, 80)}...`);

        // Telemetry: log checkout event (critical for conversion tracking)
        logEvent(sessionId, "CHECKOUT_CREATED", {
          cartItems: session.cart.length,
          cartTotal: session.cart.reduce((sum, item) => sum + (parseFloat(item.price) * item.quantity), 0).toFixed(2)
        });

        return { checkout_url: checkoutUrl };
      } catch (error) {
        console.error(`${logPrefix} error: ${error.message}`);
        return { error: error.message };
      }
    }

    default:
      return { error: `Tool desconocida: ${toolName}` };
  }
}

async function processMessage(sessionId, userMessage) {
  const logPrefix = `[AI] [${sessionId.substring(0, 8)}...]`;
  const session = getSession(sessionId);

  // Track if this is the first message (new session)
  const isFirstMessage = session.messages.length === 0;

  if (isFirstMessage) {
    logEvent(sessionId, "SESSION_START", { firstMessageLength: userMessage.length });
  }

  console.log(`${logPrefix} [processMessage] starting message processing`);
  addMessage(sessionId, "user", userMessage);

  const model = genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction: SYSTEM_PROMPT,
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
  let result = await chat.sendMessage(userMessage + cartContext);
  let response = result.response;

  while (
    response?.candidates?.[0]?.content?.parts?.some((p) => p.functionCall)
  ) {
    const functionCalls = response.candidates[0].content.parts.filter(
      (p) => p.functionCall
    );

    console.log(`${logPrefix} [processMessage] executing ${functionCalls.length} tool calls`);

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
        functionResponses.push({
          functionResponse: {
            name,
            response: { error: error.message },
          },
        });
      }
    }

    console.log(`${logPrefix} [processMessage] sending tool results back to Gemini`);
    result = await chat.sendMessage(functionResponses);
    response = result.response;
  }

  const assistantText = response?.text?.() || "";

  addMessage(sessionId, "assistant", assistantText);

  const updatedSession = getSession(sessionId);
  console.log(`${logPrefix} [processMessage] completed. response length: ${assistantText.length} chars, cart items: ${updatedSession.cart.length}`);

  return {
    response: assistantText,
    state: updatedSession.state,
    cart: updatedSession.cart,
  };
}

module.exports = { processMessage };
