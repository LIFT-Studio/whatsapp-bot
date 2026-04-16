// AI Engine module
require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { searchProducts, createCheckoutUrl } = require("./shopify");
const { expandSearchTerms } = require("./search-strategy");
const {
  getSession,
  addMessage,
  addToCart,
  removeFromCart,
  updateCartItem,
  clearCart,
} = require("./session");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const MODEL = "gemini-2.5-flash";

const SYSTEM_PROMPT = `Eres un asistente de compras para una tienda online. Tu trabajo es ayudar a los clientes a encontrar productos y hacer pedidos de forma conversacional en español.

REGLAS CRÍTICAS SOBRE TOOLS:
- SIEMPRE usa la tool search_products para buscar productos. NUNCA inventes productos, precios ni disponibilidad.
- SIEMPRE usa la tool add_to_cart para agregar productos al carrito. NUNCA digas que agregaste algo sin llamar a add_to_cart primero. El carrito solo se actualiza cuando llamas a esta tool.
- SIEMPRE usa la tool create_checkout para generar el link de pago cuando el cliente confirme la compra. NUNCA generes URLs tú mismo.
- Infiere variantes del mensaje del cliente (talla, color, cantidad). Solo pregunta si hay ambigüedad real.
- Puedes manejar múltiples productos en un solo mensaje.
- Si un producto no está disponible, dilo claramente.
- Responde SIEMPRE en español, de forma conversacional, amigable y concisa.
- Cuando el cliente dice "quiero una/uno", "dame una", "me interesa" o similar: es una SOLICITUD DIRECTA DE COMPRA. Llama a add_to_cart INMEDIATAMENTE con quantity 1. NUNCA describes el producto sin agregarlo primero. NO hagas preguntas.
- Cuando el cliente menciona un tipo de producto (computadora, laptop, teléfono, iMac, etc.) O dice "agrega X", "quiero X" refiriéndose a un producto: BUSCA INMEDIATAMENTE con search_products. NO importa si dice "agrega 2 imacs" o "quiero una laptop", SIEMPRE busca primero. NO pidas más detalles primero.
- Incluye siempre el checkout_url completo en tu respuesta cuando generes un checkout.

REGLAS CRÍTICAS SOBRE BÚSQUEDA Y SINÓNIMOS:
- El parámetro "terms" en search_products es un ARRAY de términos que reflejan la INTENCIÓN del cliente.
- Interpreta la intención y manda 1-3 términos relevantes. Ejemplos:
  * Cliente: "Busco una bolsa de viaje" → terms: ["bolsa"] o ["viaje"]
  * Cliente: "¿Tienes cosas para el camping?" → terms: ["camping"]
  * Cliente: "Quiero mochilas y tenis deportivos" → terms: ["mochila", "tenis"]
- El sistema expande automáticamente cada término con sinónimos relevantes.
- NO es tu responsabilidad pensar en sinónimos. Tú identificas el TÉRMINO PRINCIPAL y el servidor lo expande.

REGLAS CRÍTICAS SOBRE EL CARRITO:
- NUNCA digas que no puedes quitar o modificar productos. SIEMPRE tienes las tools para hacerlo.
- Cuando el cliente quiera quitar un producto: USA SIEMPRE la tool remove_from_cart. Sin excepciones.
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
- Siempre mantén un tono amigable y invitador.`;

const tools = [
  {
    functionDeclarations: [
      {
        name: "search_products",
        description:
          "Busca productos en la tienda usando uno o más términos. El sistema expande automáticamente cada término con sinónimos relevantes. Manda 1-3 términos que reflejen la intención del cliente.",
        parameters: {
          type: "OBJECT",
          properties: {
            terms: {
              type: "ARRAY",
              items: {
                type: "STRING",
              },
              description: "Array de 1-3 términos de búsqueda (ej: ['bulto'] o ['mochila', 'laptop']). El sistema los expande automáticamente con sinónimos.",
            },
          },
          required: ["terms"],
        },
      },
      {
        name: "add_to_cart",
        description:
          "Agrega un producto al carrito del cliente. Usa esto cuando el cliente quiera agregar un producto específico.",
        parameters: {
          type: "OBJECT",
          properties: {
            variant_id: { type: "STRING", description: "ID de la variante" },
            quantity: { type: "NUMBER", description: "Cantidad a agregar" },
            title: { type: "STRING", description: "Nombre del producto" },
            price: { type: "STRING", description: "Precio unitario" },
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
          "Reemplaza la cantidad de un producto que ya está en el carrito. Usa esto cuando el cliente quiera cambiar la cantidad de un producto existente.",
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
  switch (toolName) {
    case "search_products": {
      // toolInput.terms es un array de términos (ej: ["bulto", "mochila"])
      // Si por algún motivo es string, convertir a array
      let terms = Array.isArray(toolInput.terms)
        ? toolInput.terms
        : [toolInput.terms];

      // Expandir cada término con sinónimos y combinar resultados únicos
      const expandedTerms = new Set();
      for (const term of terms) {
        const expanded = expandSearchTerms(term);
        expanded.forEach((t) => expandedTerms.add(t));
      }

      // Convertir a array para enviar a Shopify
      const allTerms = Array.from(expandedTerms);
      const products = await searchProducts(allTerms);
      return products;
    }
    case "add_to_cart": {
      const session = addToCart(sessionId, {
        variant_id: toolInput.variant_id,
        quantity: toolInput.quantity,
        title: toolInput.title,
        price: toolInput.price,
      });
      return { success: true, cart: session.cart };
    }
    case "remove_from_cart": {
      const session = removeFromCart(sessionId, toolInput.variant_id);
      return { success: true, cart: session.cart };
    }
    case "update_cart_item": {
      const session = updateCartItem(
        sessionId,
        toolInput.variant_id,
        toolInput.new_quantity
      );
      return { success: true, cart: session.cart };
    }
    case "view_cart": {
      const session = getSession(sessionId);
      return { cart: session.cart };
    }
    case "clear_cart": {
      const session = clearCart(sessionId);
      return { success: true, cart: session.cart };
    }
    case "create_checkout": {
      const session = getSession(sessionId);
      if (session.cart.length === 0) {
        return { error: "El carrito está vacío" };
      }
      const checkoutUrl = createCheckoutUrl(session.cart);
      clearCart(sessionId);
      return { checkout_url: checkoutUrl };
    }
    default:
      return { error: `Tool desconocida: ${toolName}` };
  }
}

async function processMessage(sessionId, userMessage) {
  const session = getSession(sessionId);

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

  let result = await chat.sendMessage(userMessage + cartContext);
  let response = result.response;

  while (
    response.candidates[0].content.parts.some((p) => p.functionCall)
  ) {
    const functionCalls = response.candidates[0].content.parts.filter(
      (p) => p.functionCall
    );

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
        functionResponses.push({
          functionResponse: {
            name,
            response: { error: error.message },
          },
        });
      }
    }

    result = await chat.sendMessage(functionResponses);
    response = result.response;
  }

  const assistantText = response.text();

  addMessage(sessionId, "assistant", assistantText);

  const updatedSession = getSession(sessionId);
  return {
    response: assistantText,
    state: updatedSession.state,
    cart: updatedSession.cart,
  };
}

module.exports = { processMessage };
