/**
 * PERSONAS: 25 realistic test personas for sales chat evaluation
 * Each persona has: name, age, background, buying_behavior, objections, success_indicators
 */

const PERSONAS = [
  {
    id: 1,
    name: "Señora María",
    age: 65,
    background: "Jubilada, compra para regalos",
    buying_behavior: "Lenta, hace muchas preguntas, necesita reassurance",
    objections: ["Es muy caro", "¿Realmente funciona?", "Mis hijos usan esto"],
    conversational_style: "Formal, prefiere detalles explicados",
    success_indicators: [
      "Bot usa un tono cálido y paciente",
      "Responde preguntas específicas sin prisa",
      "Recomienda 1 producto claro, no enumera",
      "Explica beneficios en términos simples"
    ]
  },
  {
    id: 2,
    name: "Carlos Empresario",
    age: 45,
    background: "CEO de startup, muy ocupado",
    buying_behavior: "Rápido, quiere soluciones eficientes, no tiempo para detalles",
    objections: ["¿Cuánto tiempo toma?", "¿Cuál es la mejor opción?"],
    conversational_style: "Directo, puntos clave, sin rodeos",
    success_indicators: [
      "Bot es conciso y directo",
      "Recomendación clara en pocas palabras",
      "Ofrece checkout rápidamente",
      "Respeta el tiempo del cliente"
    ]
  },
  {
    id: 3,
    name: "Joven Estudiante",
    age: 22,
    background: "Estudiante universitario, presupuesto limitado",
    buying_behavior: "Busca mejor precio, compara opciones, negocia",
    objections: ["Es muy caro", "¿Hay descuentos?", "Déjame pensar"],
    conversational_style: "Casual, usa jerga moderna",
    success_indicators: [
      "Bot reconoce limitación de presupuesto",
      "Ofrece opciones ajustadas al presupuesto",
      "Respeta las dudas sin presionar",
      "Explica relación precio-valor"
    ]
  },
  {
    id: 4,
    name: "Madre Ocupada",
    age: 38,
    background: "Mamá de 2 hijos, compra para la familia",
    buying_behavior: "Busca practicidad, durabilidad, opiniones de otros",
    objections: ["¿Dura mucho?", "¿Es seguro?", "¿Qué dicen otros clientes?"],
    conversational_style: "Pragmática, directa al punto",
    success_indicators: [
      "Bot pregunta por caso de uso (para hijos, para ella)",
      "Menciona durabilidad y seguridad",
      "Respeta sus preocupaciones",
      "Guía con confianza"
    ]
  },
  {
    id: 5,
    name: "Ingeniero Técnico",
    age: 52,
    background: "Ingeniero jubilado, amateur de tecnología",
    buying_behavior: "Muy detallista, quiere especificaciones, analítico",
    objections: ["¿Cuáles son las specs exactas?", "¿Comparado con marca X?"],
    conversational_style: "Técnico, preciso, usa terminología",
    success_indicators: [
      "Bot responde preguntas técnicas con precisión",
      "Ofrece documentación o comparativas",
      "No generaliza, es específico",
      "Respeta el análisis profundo"
    ]
  },
  {
    id: 6,
    name: "Influencer Fashion",
    age: 28,
    background: "Influenciadora, compra por estética y trends",
    buying_behavior: "Rápida decisión, importa la apariencia, busca exclusividad",
    objections: ["¿Es trending?", "¿Otros lo tienen?", "¿Qué color es trending?"],
    conversational_style: "Entusiasta, usa emojis mentales, enfático",
    success_indicators: [
      "Bot reconoce importancia de estética",
      "Ofrece variedad de colores/estilos",
      "Menciona si es exclusivo o trending",
      "Aprecia la rapidez en la recomendación"
    ]
  },
  {
    id: 7,
    name: "Papá Primerizo",
    age: 32,
    background: "Nuevo papá, compra para bebé",
    buying_behavior: "Ansioso, busca seguridad, quiere lo mejor para su hijo",
    objections: ["¿Es seguro para bebés?", "¿Certificado?", "¿Tóxico?"],
    conversational_style: "Preocupado pero amable, hace muchas preguntas",
    success_indicators: [
      "Bot entiende la importancia de seguridad",
      "Menciona certificaciones si aplica",
      "Responde con autoridad pero empatía",
      "No minimiza sus preocupaciones"
    ]
  },
  {
    id: 8,
    name: "Viajero Nómada",
    age: 31,
    background: "Freelancer que viaja constantemente",
    buying_behavior: "Busca portabilidad, durabilidad, peso bajo",
    objections: ["¿Cabe en una mochila?", "¿Sobrevive viajes?", "¿Peso?"],
    conversational_style: "Aventurero, rápido, experiencial",
    success_indicators: [
      "Bot pregunta por tipo de viaje",
      "Recomienda por portabilidad",
      "Menciona durabilidad para nómadas",
      "Entiende necesidades de viajero"
    ]
  },
  {
    id: 9,
    name: "Ama de Casa Tradicional",
    age: 55,
    background: "Dedica tiempo a hogar y familia",
    buying_behavior: "Práctica, busca ahorrar, valora la calidad",
    objections: ["Muy caro", "¿Vale la pena?", "Necesito pensar"],
    conversational_style: "Humilde, respetuosa, metódica",
    success_indicators: [
      "Bot es amable y sin presión",
      "Explica valor, no solo precio",
      "Respeta tiempo de decisión",
      "Ofrece facilidades de pago"
    ]
  },
  {
    id: 10,
    name: "Ejecutiva Moderna",
    age: 42,
    background: "Directora de marketing, independiente",
    buying_behavior: "Busca calidad premium, no negocia, decisión rápida",
    objections: ["¿Es realmente premium?", "¿Servicio post-venta?"],
    conversational_style: "Profesional, exigente, respeta la experticia",
    success_indicators: [
      "Bot reconoce criterio premium",
      "Ofrece servicio/garantía sobresaliente",
      "Respeta su inteligencia y experiencia",
      "Entiende valor, no precio"
    ]
  },
  {
    id: 11,
    name: "Señor Jubilado",
    age: 72,
    background: "Pensionado, compra para sí mismo",
    buying_behavior: "Cauteloso, desconfiado de tecnología, valora lo clásico",
    objections: ["¿Es una estafa?", "¿Cómo funciona?", "No entiendo"],
    conversational_style: "Formal, necesita explicación paso a paso",
    success_indicators: [
      "Bot es paciente y claro",
      "Explica sin ser condescendiente",
      "Ofrece ayuda técnica si necesita",
      "Genera confianza y seguridad"
    ]
  },
  {
    id: 12,
    name: "Adolescente Gamer",
    age: 17,
    background: "Gamer, quiere lo mejor para gaming",
    buying_behavior: "Rápido, busca rendimiento máximo, conectado con trends",
    objections: ["¿Va a laggear?", "¿Es gaming-grade?", "¿FPS?"],
    conversational_style: "Casual, jerga gaming, entusiasta",
    success_indicators: [
      "Bot entiende gaming specs",
      "Recomienda por performance",
      "Respeta la jerga técnica",
      "Aprecia la rapidez"
    ]
  },
  {
    id: 13,
    name: "Regateadora Compulsiva",
    age: 48,
    background: "Experta negociadora, siempre busca mejor precio",
    buying_behavior: "Negocia todo, compara constantemente, quiere descuento",
    objections: ["¿Cuál es el mejor precio?", "¿Descuentos?", "¿Promoción?"],
    conversational_style: "Desafiante, estratégica, lista para discutir",
    success_indicators: [
      "Bot no se intimida con objeciones",
      "Explica valor genuino vs. precio",
      "Ofrece beneficios, no solo descuentos",
      "Mantiene confianza en recomendación"
    ]
  },
  {
    id: 14,
    name: "Emprendedor Joven",
    age: 27,
    background: "Dueño de pequeño negocio de servicios",
    buying_behavior: "Busca inversión que regrese ROI, analítico pero rápido",
    objections: ["¿Cuál es el ROI?", "¿Comprobado?", "¿Casos de éxito?"],
    conversational_style: "Profesional, orientado a resultados",
    success_indicators: [
      "Bot pregunta por tipo de negocio",
      "Ofrece casos de uso profesional",
      "Enfatiza beneficios medibles",
      "Genera confianza profesional"
    ]
  },
  {
    id: 15,
    name: "Divorciado Reciente",
    age: 44,
    background: "Reconstruyendo su vida, nuevo presupuesto",
    buying_behavior: "Busca valor máximo, inseguro en decisiones",
    objections: ["Parece muy caro para mí", "¿Realmente lo necesito?"],
    conversational_style: "Cauteloso, necesita validación, sensible",
    success_indicators: [
      "Bot es empático pero no piadoso",
      "Valida la decisión de compra",
      "Ofrece opciones dentro del presupuesto",
      "Genera confianza gradualmente"
    ]
  },
  {
    id: 16,
    name: "Amante del Lujo",
    age: 55,
    background: "Profesional exitoso, gasta sin problemas en calidad",
    buying_behavior: "Quiere lo mejor y más exclusivo, no mira precio",
    objections: ["¿Es realmente lo mejor?", "¿Existe algo mejor?"],
    conversational_style: "Refinado, exigente, expectativas altas",
    success_indicators: [
      "Bot reconoce estatus premium",
      "Ofrece lo mejor disponible",
      "Menciona exclusividad",
      "Respeta su criterio impecable"
    ]
  },
  {
    id: 17,
    name: "Mamá Millennial",
    age: 34,
    background: "Mamá moderna, busca balance y sostenibilidad",
    buying_behavior: "Consciente ambiental, ética en compras, bien informada",
    objections: ["¿Es sostenible?", "¿Éticas las prácticas?", "¿Plasticidad?"],
    conversational_style: "Informada, valores-driven, exigente en ética",
    success_indicators: [
      "Bot entiende sostenibilidad",
      "Menciona prácticas éticas",
      "Valora el impacto ambiental",
      "Genera confianza en valores"
    ]
  },
  {
    id: 18,
    name: "Experto en Reviews",
    age: 41,
    background: "Blogger de reviews, ve todo con lupa crítica",
    buying_behavior: "Busca defectos, compara exhaustivamente, experto",
    objections: ["He visto malas reviews", "¿Comparado con X?", "¿Garantía?"],
    conversational_style: "Crítico, basado en datos, no se impresiona fácil",
    success_indicators: [
      "Bot responde críticas con hechos",
      "Ofrece fuentes verificables",
      "No se ofende por escepticismo",
      "Demuestra conocimiento profundo"
    ]
  },
  {
    id: 19,
    name: "Comprador Impulsivo",
    age: 26,
    background: "Joven profesional, toma decisiones rápido",
    buying_behavior: "Muy rápido, emocional, se deja llevar por entusiasmo",
    objections: ["Déjame verlo", "Quiero ya", "¿Cuándo lo tengo?"],
    conversational_style: "Entusiasta, rápido, impaciente",
    success_indicators: [
      "Bot mantiene entusiasmo pero orden",
      "Guía la decisión con claridad",
      "Acelera el checkout cuando decide",
      "Genera momentum"
    ]
  },
  {
    id: 20,
    name: "Indeciso Crónico",
    age: 50,
    background: "Perfectcionista, siempre duda de sus decisiones",
    buying_behavior: "Muy lento, pide múltiples comparativas, nunca seguro",
    objections: ["Déjame pensar", "¿Seguro?", "¿No hay mejor opción?"],
    conversational_style: "Ansioso, busca validación constante",
    success_indicators: [
      "Bot da un recomendación FIRME",
      "No abruma con opciones",
      "Valida la decisión",
      "Ofrece garantía de satisfacción"
    ]
  },
  {
    id: 21,
    name: "Papá Ahorrista",
    age: 49,
    background: "Padre que ahorra cada centavo para sus hijos",
    buying_behavior: "Muy presupuesto-consciente, busca máximo valor",
    objections: ["Es muy caro", "¿El más barato?", "¿Necesito realmente?"],
    conversational_style: "Pragmático, cálculo costo-beneficio constante",
    success_indicators: [
      "Bot entiende limitación de presupuesto",
      "Enfatiza durabilidad y valor",
      "No presiona, respeta decisión",
      "Ofrece alternativas económicas"
    ]
  },
  {
    id: 22,
    name: "Fashionista Obsesionado",
    age: 29,
    background: "Fashion blogger, vive para tendencias",
    buying_behavior: "Muy rapido, quiere exclusividad y tendencia",
    objections: ["¿Es exclusivo?", "¿Me va a quedar bien?", "¿Cómo lo combino?"],
    conversational_style: "Entusiasta, visual, trending-focused",
    success_indicators: [
      "Bot entiende tendencias actuales",
      "Ofrece combinaciones visuales",
      "Menciona exclusividad",
      "Aprecia el gusto estético"
    ]
  },
  {
    id: 23,
    name: "Regalero Experto",
    age: 38,
    background: "Siempre busca regalar, da regalos constantemente",
    buying_behavior: "Rápido pero cuidadoso con regalo, piensa en el otro",
    objections: ["¿Le va a gustar?", "¿Es apropiado?", "¿Qué me aconsejas?"],
    conversational_style: "Considerado, busca validación en regalo",
    success_indicators: [
      "Bot pregunta para QUIÉN es el regalo",
      "Valida la elección considerada",
      "Recomienda con confianza",
      "Sugiere presentación si aplica"
    ]
  },
  {
    id: 24,
    name: "Técnico Paranoico",
    age: 43,
    background: "Trabajador IT, muy consciente de seguridad",
    buying_behavior: "Obsesionado con seguridad y privacidad",
    objections: ["¿Dónde están mis datos?", "¿Es seguro?", "¿Encriptado?"],
    conversational_style: "Técnico, desconfiado, demanda pruebas",
    success_indicators: [
      "Bot responde con autoridad técnica",
      "Menciona medidas de seguridad",
      "Ofrece documentación técnica",
      "No minimiza sus preocupaciones"
    ]
  },
  {
    id: 25,
    name: "Abuela Conectada",
    age: 68,
    background: "Abuela que se metió en el internet para hablar con nietos",
    buying_behavior: "Lenta pero determinada, necesita paciencia extrema",
    objections: ["No entiendo", "¿Cómo hago?", "¿Es seguro en internet?"],
    conversational_style: "Informal, dulce, necesita instrucciones claras",
    success_indicators: [
      "Bot es EXTREMADAMENTE paciente",
      "Explica paso a paso sin tecnicismos",
      "Cálido y afectuoso en tono",
      "Nunca la hace sentir ignorante"
    ]
  }
];

/**
 * Simulated conversation scripts for each persona
 * Format: [user_turns] where each turn is a realistic message
 */
const CONVERSATION_SCRIPTS = {
  1: [ // Señora María
    "Hola, hola, ¿hay alguien aquí?",
    "Es que necesito un regalo para mi nieta, pero no sé qué regalarle",
    "Ella tiene 25 años, trabaja en una oficina",
    "No, no sabe de tecnología. Es simple",
    "Sí, quiero algo que le dure, que sea bonito",
    "¿Cuánto cuesta? No quiero gastar demasiado, ¿eh?",
    "Mira, está bien. Si tú lo recomiendas, le hace falta"
  ],
  2: [ // Carlos Empresario
    "Necesito una solución rápido para mi equipo",
    "15 personas en la oficina, tenemos presupuesto limitado",
    "¿Cuál es la opción que más ROI genera?",
    "Dale, ¿cuánto es en total?",
    "Perfecto, proceda al checkout"
  ],
  3: [ // Joven Estudiante
    "Oye, ¿cuál es el producto más barato que tienes?",
    "Soy estudiante, no tengo mucho dinero",
    "¿Cuál es la mejor oferta que me puedas dar?",
    "Hmm, ¿hay descuento si compro ahora?",
    "Dale, me lo llevo"
  ],
  4: [ // Madre Ocupada
    "Necesito algo para mi familia, pero tiene que ser duradero",
    "Tengo dos hijos, 8 y 12 años",
    "¿Es seguro para niños? No quiero problemas",
    "¿Cuánto tiempo dura?",
    "Dale, suena bien, sigue adelante"
  ],
  5: [ // Ingeniero Técnico
    "¿Cuáles son las especificaciones técnicas exactas?",
    "¿Cuál es el voltaje, amperaje y eficiencia?",
    "¿Cómo se compara con la marca X?",
    "Necesito datos concretos, no marketing",
    "Si los specs son esos, me interesa"
  ],
  6: [ // Influencer Fashion
    "¡Hola! ¿Qué de nuevo tienen?",
    "Busco algo que esté en tendencia ahora",
    "¿Qué colores tienen? Quiero algo que no todos tengan",
    "Ame ese color, ¿es exclusivo?",
    "¡Dale, me lo llevo!"
  ],
  7: [ // Papá Primerizo
    "Hola, necesito algo para mi recién nacido",
    "¿Es seguro para bebés? Estoy asustado",
    "¿Tiene certificaciones de seguridad?",
    "¿Contiene material tóxico?",
    "Dale, si es seguro, lo quiero"
  ],
  8: [ // Viajero Nómada
    "Estoy viajando por Latinoamérica",
    "Necesito algo ligero y portable",
    "¿Cabe en una mochila de 40 litros?",
    "¿Aguanta los cambios de clima y golpes?",
    "Perfecto, me lo llevo"
  ],
  9: [ // Ama de Casa Tradicional
    "Hola, quisiera algo de buena calidad",
    "Es que los que tengo no me duran",
    "¿Vale la pena gastarse eso? Soy cuidadosa con el dinero",
    "¿Puedo pagar en partes?",
    "Dale, confío en ti"
  ],
  10: [ // Ejecutiva Moderna
    "Buenos días, necesito algo premium",
    "¿Qué servicio post-venta ofrecen?",
    "¿Hay garantía extendida?",
    "¿Es realmente la mejor opción del mercado?",
    "Perfecto, proceda"
  ],
  11: [ // Señor Jubilado
    "Hola joven, ¿me pueden ayudar?",
    "Es que no entiendo bien esto del internet",
    "¿Cómo sé que es seguro mandar dinero así?",
    "¿Me pueden explicar paso a paso cómo funciona?",
    "Bueno, si es así, me animo"
  ],
  12: [ // Adolescente Gamer
    "Ey, ¿qué onda? Necesito gear gaming",
    "¿Qué FPS da? Porque tengo otro en 120",
    "¿Es compatible con mi setup?",
    "¿Cómo es la latencia?",
    "Voy, me lo llevo"
  ],
  13: [ // Regateadora Compulsiva
    "¿Cuál es el mejor precio que tienen?",
    "He visto más barato en otro lado",
    "¿Me hacen descuento?",
    "¿Hay promoción esta semana?",
    "Si me haces un descuento, me lo llevo"
  ],
  14: [ // Emprendedor Joven
    "Tengo un negocio de consultoría",
    "¿Cómo me ayudaría esto a crecer?",
    "¿Hay casos de éxito de emprendedores?",
    "¿Cuál es el tiempo de retorno?",
    "Suena bien, vamos adelante"
  ],
  15: [ // Divorciado Reciente
    "Hola, es que estoy pasando por un cambio",
    "Mi presupuesto es más limitado ahora",
    "¿Realmente lo necesito?",
    "¿No hay algo más económico?",
    "Dale, me animo"
  ],
  16: [ // Amante del Lujo
    "Quiero lo mejor que tengan",
    "¿Es realmente lo más exclusivo?",
    "¿Existe algo más premium?",
    "¿Cuál es la línea de lujo?",
    "Perfecto, ese es mi nivel"
  ],
  17: [ // Mamá Millennial
    "Me importa que sea sostenible",
    "¿De dónde viene? ¿Prácticas éticas?",
    "¿Cuánto plástico tiene?",
    "¿Es hecho localmente?",
    "Si es así, me interesa"
  ],
  18: [ // Experto en Reviews
    "He visto malas reviews de ese producto",
    "¿Cómo se compara con la competencia?",
    "¿Cuáles son los defectos conocidos?",
    "¿Qué dicen en Reddit/Twitter?",
    "Si los datos apoyan, me lo considero"
  ],
  19: [ // Comprador Impulsivo
    "¡Ey! ¿Qué es lo más cool que tienen?",
    "¿Puedo verlo ahora?",
    "¡Sí, parece genial!",
    "¿Cuándo lo tengo?",
    "¡Dale, quiero ya!"
  ],
  20: [ // Indeciso Crónico
    "No sé qué elegir",
    "¿Cuál es mejor entre A y B?",
    "¿Seguro que esa es la mejor opción?",
    "¿No hay algo mejor?",
    "Está bien, pero sigue dándome opciones"
  ],
  21: [ // Papá Ahorrista
    "Tengo presupuesto limitado",
    "¿Es el más barato de calidad?",
    "¿Cuánto tiempo va a durar?",
    "¿Vale la pena el precio?",
    "Dale, pero que sea durabilidad"
  ],
  22: [ // Fashionista Obsesionado
    "¿Qué está trending en moda ahora?",
    "¿Es exclusivo? ¿Pocos lo usan?",
    "¿Qué colores están en tendencia?",
    "¿Me va a quedar bien con mis otros outfits?",
    "¡Sí! Me lo llevo ahora"
  ],
  23: [ // Regalero Experto
    "Necesito un regalo para mi hermano",
    "Tiene 35 años, es abogado",
    "¿Qué crees que le va a gustar?",
    "¿Es apropiado para un ejecutivo?",
    "Dale, confío en tu recomendación"
  ],
  24: [ // Técnico Paranoico
    "¿Dónde están mis datos? ¿Encriptados?",
    "¿Qué protocolos de seguridad usan?",
    "¿Es open source?",
    "¿Cuál es la política de privacidad?",
    "Si está auditado, lo considero"
  ],
  25: [ // Abuela Conectada
    "Hola, hola, ¿hay alguien ahí?",
    "Es que mis nietos me dijeron que comprara por aquí",
    "Pero no sé cómo funciona esto",
    "¿Me explicas bien? Soy un poco lenta",
    "Está bien, me animo si me ayudas"
  ]
};

module.exports = {
  PERSONAS,
  CONVERSATION_SCRIPTS,
  getPersonaById: (id) => PERSONAS.find(p => p.id === id),
  getConversationScript: (personaId) => CONVERSATION_SCRIPTS[personaId] || [],
  getTotalPersonas: () => PERSONAS.length
};
