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

const SYSTEM_PROMPT = `Eres un asistente de compras para una tienda online. Tu trabajo es ayudar a los clientes a encontrar productos y hacer pedidos de forma conversacional en español.

REGLAS CRÍTICAS SOBRE TOOLS:
- SIEMPRE usa la tool search_products para buscar productos. NUNCA inventes productos, precios ni disponibilidad.
- SIEMPRE usa la tool add_to_cart para agregar productos al carrito. NUNCA digas que agregaste algo sin llamar a add_to_cart primero. El carrito solo se actualiza cuando llamas a esta tool.
- IMPORTANTE para add_to_cart: El "variant_id" DEBE ser el valor exacto del campo "id" en el objeto variant (ej: "gid://shopify/ProductVariant/53622813753708"). NO cambies ni acortes este valor. Extrae el price.amount como price en formato string.
- SIEMPRE usa la tool answer_policy_question para responder preguntas sobre políticas, devoluciones, envíos, etc. No inventes políticas.
- SIEMPRE usa la tool create_checkout para generar el link de pago cuando el cliente confirme la compra. NUNCA generes URLs tú mismo.
- Infiere variantes del mensaje del cliente (talla, color, cantidad). Solo pregunta si hay ambigüedad real.
- Puedes manejar múltiples productos en un solo mensaje.
- Si un producto no está disponible, dilo claramente.
- Responde SIEMPRE en español, de forma conversacional, amigable y concisa.
- Cuando el cliente dice "quiero una/uno", "dame una", "me interesa" o similar: es una SOLICITUD DIRECTA DE COMPRA. Llama a add_to_cart INMEDIATAMENTE con quantity 1. NUNCA describes el producto sin agregarlo primero. NO hagas preguntas.
- Cuando el cliente menciona un tipo de producto (computadora, laptop, teléfono, iMac, etc.) O dice "agrega X", "quiero X" refiriéndose a un producto: BUSCA INMEDIATAMENTE con search_products. NO importa si dice "agrega 2 imacs" o "quiero una laptop", SIEMPRE busca primero. NO pidas más detalles primero.
- Incluye siempre el checkout_url completo en tu respuesta cuando generes un checkout.

REGLAS CRÍTICAS SOBRE BÚSQUEDA:
- El parámetro "query" en search_products es una cadena de texto que refleja la INTENCIÓN del cliente en lenguaje natural.
- Manda la búsqueda tal como la entiende el cliente. Ejemplos:
  * Cliente: "Busco una bolsa de viaje" → query: "bolsa de viaje"
  * Cliente: "¿Tienes cosas para el camping?" → query: "camping"
  * Cliente: "Quiero mochilas" → query: "mochilas"
- NO expandes sinónimos tú mismo. El sistema MCP maneja la búsqueda inteligente de forma natural.

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

  switch (toolName) {
    case "search_products": {
      // query es una cadena de texto (lenguaje natural)
      const query = toolInput.query;
      console.log("[AI] search_products - query:", query);

      try {
        const result = await searchProducts(query);
        console.log("[AI] search_products - resultado:", result?.products?.length || 0, "productos");

        // Simplificar la respuesta para Gemini: incluir solo datos esenciales y variant_id claramente identificado
        const simplifiedProducts = result?.products?.map(product => {
          const firstVariant = product.variants?.[0];
          return {
            id: product.id,
            title: product.title,
            description: product.description,
            price_range: product.price_range,
            // CRÍTICO: Incluir variant_id como field de primer nivel para que Gemini lo vea claramente
            variant_id: firstVariant?.id,
            variant_title: firstVariant?.title,
            variant_price: firstVariant?.price,
            variants: product.variants,
            options: product.options,
            media: product.media
          };
        }) || [];

        if (simplifiedProducts.length > 0 && simplifiedProducts[0].variant_id) {
          console.log("[AI] Primer variant_id para Gemini:", simplifiedProducts[0].variant_id);
        }

        return { products: simplifiedProducts };
      } catch (error) {
        console.error("[AI] search_products - error:", error.message);
        return { error: error.message, products: [] };
      }
    }

    case "answer_policy_question": {
      // Responde preguntas sobre políticas
      const query = toolInput.query;
      console.log("[AI] answer_policy_question - query:", query);

      try {
        const result = await searchPolicies(query);
        console.log("[AI] answer_policy_question - respuesta obtenida");
        return result;
      } catch (error) {
        console.error("[AI] answer_policy_question - error:", error.message);
        return { error: error.message, answer: "No pude obtener información sobre esa política." };
      }
    }

    case "add_to_cart": {
      console.log("[AI] add_to_cart - variant_id:", toolInput.variant_id, "cantidad:", toolInput.quantity);

      try {
        // Crear carrito si no existe
        if (!session.cartId) {
          console.log("[AI] Creando carrito nuevo...");
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

        console.log("[AI] MCP updateCart respuesta keys:", Object.keys(mcpResult));
        console.log("[AI] MCP updateCart tiene 'cart'?", !!mcpResult.cart);
        console.log("[AI] MCP cart estructura:", JSON.stringify(mcpResult.cart).substring(0, 500));

        // Guardar cartId y sincronizar cart
        if (mcpResult.cart) {
          setCartId(sessionId, mcpResult.cart.id);
          syncCartFromMCP(sessionId, mcpResult.cart);
          console.log("[AI] Carrito sincronizado. ID:", mcpResult.cart.id, "items:", mcpResult.cart.lines?.length);
        } else {
          console.log("[AI] ⚠️ No hay cart en mcpResult");
        }

        const updatedSession = getSession(sessionId);
        console.log("[AI] Session cart después de sync:", updatedSession.cart.length, "items");
        return { success: true, cart: updatedSession.cart };
      } catch (error) {
        console.error("[AI] add_to_cart - error:", error.message);
        return { error: error.message };
      }
    }

    case "remove_from_cart": {
      console.log("[AI] remove_from_cart - variant_id:", toolInput.variant_id);

      try {
        // Buscar el line_id del item a eliminar
        const item = session.cart.find((i) => i.variant_id === toolInput.variant_id);
        if (!item) {
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
          console.log("[AI] Producto removido del carrito");
        }

        return { success: true, cart: session.cart };
      } catch (error) {
        console.error("[AI] remove_from_cart - error:", error.message);
        return { error: error.message };
      }
    }

    case "update_cart_item": {
      console.log("[AI] update_cart_item - variant_id:", toolInput.variant_id, "nueva cantidad:", toolInput.new_quantity);

      try {
        // Buscar el item
        const item = session.cart.find((i) => i.variant_id === toolInput.variant_id);
        if (!item) {
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
          console.log("[AI] Cantidad actualizada");
        }

        return { success: true, cart: session.cart };
      } catch (error) {
        console.error("[AI] update_cart_item - error:", error.message);
        return { error: error.message };
      }
    }

    case "view_cart": {
      console.log("[AI] view_cart - items en carrito:", session.cart.length);
      return { cart: session.cart };
    }

    case "clear_cart": {
      console.log("[AI] clear_cart");

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
        return { success: true, cart: session.cart };
      } catch (error) {
        console.error("[AI] clear_cart - error:", error.message);
        // Igual limpiamos la session localmente
        clearCart(sessionId);
        return { success: true, cart: session.cart };
      }
    }

    case "create_checkout": {
      console.log("[AI] create_checkout - cartId:", session.cartId);

      try {
        if (!session.cartId) {
          console.log("[AI] create_checkout - no cartId");
          return { error: "No hay carrito activo" };
        }

        if (session.cart.length === 0) {
          console.log("[AI] create_checkout - carrito vacío");
          return { error: "El carrito está vacío" };
        }

        // Obtener el carrito final con checkout_url
        console.log("[AI] Llamando getCart con cartId:", session.cartId);
        const mcpResult = await getCart(session.cartId);

        console.log("[AI] getCart resultado keys:", Object.keys(mcpResult));
        const checkoutUrl = mcpResult.cart?.checkout_url;
        console.log("[AI] checkoutUrl encontrado?", !!checkoutUrl);
        if (checkoutUrl) {
          console.log("[AI] checkout_url:", checkoutUrl.substring(0, 100));
        } else {
          console.log("[AI] mcpResult.cart keys:", Object.keys(mcpResult.cart || {}));
        }

        if (!checkoutUrl) {
          console.log("[AI] ❌ No hay checkout_url en la respuesta");
          return { error: "No se pudo generar el checkout" };
        }

        // Limpiar session después de checkout
        clearCart(sessionId);

        console.log("[AI] ✅ Checkout generado exitosamente");
        return { checkout_url: checkoutUrl };
      } catch (error) {
        console.error("[AI] create_checkout - error:", error.message);
        console.error("[AI] Stack:", error.stack);
        return { error: error.message };
      }
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
    response?.candidates?.[0]?.content?.parts?.some((p) => p.functionCall)
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

  const assistantText = response?.text?.() || "";

  addMessage(sessionId, "assistant", assistantText);

  const updatedSession = getSession(sessionId);
  return {
    response: assistantText,
    state: updatedSession.state,
    cart: updatedSession.cart,
  };
}

module.exports = { processMessage };
