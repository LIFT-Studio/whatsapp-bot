/**
 * SIMPLE JUDGE: Alternative evaluator that returns text-based scores
 * Avoids JSON parsing issues by using simple numeric output
 */

require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { RUBRIC_DIMENSIONS } = require("./rubric");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MODEL = "gemini-2.5-flash";

/**
 * Evaluate a conversation and return simple numeric scores
 */
async function evaluateConversation(messages, persona) {
  const model = genAI.getGenerativeModel({
    model: MODEL,
    generationConfig: {
      temperature: 0.2,
      topP: 0.8,
      maxOutputTokens: 1000,
    }
  });

  const conversationText = messages
    .map((m, i) => `${i + 1}. ${m.role === "user" ? "USUARIO" : "BOT"}: ${m.content}`)
    .join("\n");

  const evaluationPrompt = `Evaluate this sales chat with persona: ${persona.name}.

CONVERSATION:
${conversationText}

Score these 6 dimensions (1-10 scale):
1. CALIDEZ (warmth/personality):
2. CURIOSIDAD (genuine discovery questions):
3. RECOMENDACION (recommends ONE best product):
4. CONCISION (brief responses):
5. NATURALIDAD (authentic Panamanian Spanish):
6. AMBIGUEDAD (asks when unclear):

Response format - just the scores, nothing else:
CALIDEZ: X
CURIOSIDAD: X
RECOMENDACION: X
CONCISION: X
NATURALIDAD: X
AMBIGUEDAD: X`;

  try {
    const response = await model.generateContent(evaluationPrompt);
    const text = response.response.text();

    const scores = {};
    const lines = text.split('\n');

    for (const line of lines) {
      for (const dim of RUBRIC_DIMENSIONS) {
        const pattern = new RegExp(`^${dim.id.toUpperCase()}:\\s*(\\d+)`, 'i');
        const match = line.match(pattern);
        if (match) {
          scores[dim.id] = Math.min(10, Math.max(1, parseInt(match[1])));
        }
      }
    }

    // Fill in any missing scores with defaults
    RUBRIC_DIMENSIONS.forEach(d => {
      if (!scores[d.id]) {
        scores[d.id] = 5;
      }
    });

    return {
      numericScores: scores,
      persona: persona.name,
      rawResponse: text
    };
  } catch (error) {
    console.error(`[JUDGE] Error: ${error.message}`);
    const defaultScores = {};
    RUBRIC_DIMENSIONS.forEach(d => {
      defaultScores[d.id] = 5;
    });
    return {
      numericScores: defaultScores,
      persona: persona.name,
      error: error.message
    };
  }
}

/**
 * Batch evaluate multiple conversations
 */
async function batchEvaluate(conversations) {
  const results = [];

  for (let i = 0; i < conversations.length; i++) {
    const { messages, persona } = conversations[i];
    console.log(`[JUDGE] Evaluating ${i + 1}/${conversations.length}: ${persona.name}...`);

    const result = await evaluateConversation(messages, persona);
    results.push(result);

    if (i < conversations.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return results;
}

module.exports = {
  evaluateConversation,
  batchEvaluate
};
