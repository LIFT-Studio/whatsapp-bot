/**
 * JUDGE: Gemini-powered evaluator for sales chat conversations
 * Uses temperature 0.2 for consistency in scoring
 */

require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { RUBRIC_DIMENSIONS } = require("./rubric");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MODEL = "gemini-2.5-flash";

/**
 * Extract JSON from Gemini response using robust brace matching
 * Handles markdown code blocks and other text wrappers
 */
function extractJSON(rawText) {
  // Remove markdown code block markers if present
  let cleanText = rawText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```$/, '');

  const startIdx = cleanText.indexOf('{');
  if (startIdx === -1) return null;

  let braceCount = 0;
  let endIdx = startIdx;
  for (let i = startIdx; i < cleanText.length; i++) {
    if (cleanText[i] === '{') braceCount++;
    if (cleanText[i] === '}') braceCount--;
    if (braceCount === 0) {
      endIdx = i + 1;
      break;
    }
  }

  if (braceCount !== 0) {
    // Braces don't match, but return what we have anyway
    if (endIdx > startIdx) {
      return cleanText.substring(startIdx).trim();
    }
    return null;
  }
  return cleanText.substring(startIdx, endIdx).trim();
}

/**
 * Evaluate a single conversation against all 6 rubric dimensions
 * @param {array} messages - Array of {role: "user"|"bot", content: string}
 * @param {object} persona - Persona being evaluated
 * @returns {Promise<object>} Scores for all dimensions
 */
async function evaluateConversation(messages, persona) {
  const conversationText = formatConversation(messages);

  const model = genAI.getGenerativeModel({
    model: MODEL,
    generationConfig: {
      temperature: 0.2,
      topP: 0.8,
      topK: 40,
      maxOutputTokens: 2000,
    }
  });

  const evaluationPrompt = `Evaluate this sales conversation against 6 dimensions.

PERSONA: ${persona.name} (${persona.age} years, ${persona.background})

CONVERSATION:
${conversationText}

Score each dimension 1-10 and respond with ONLY this JSON structure:

{
  "calidez": {"score": 8, "evidence": "example from conversation", "reason": "why this score"},
  "curiosidad": {"score": 7, "evidence": "example", "reason": "why"},
  "recomendacion": {"score": 8, "evidence": "example", "reason": "why"},
  "concision": {"score": 9, "evidence": "example", "reason": "why"},
  "naturalidad": {"score": 8, "evidence": "example", "reason": "why"},
  "ambiguedad": {"score": 7, "evidence": "example", "reason": "why"}
}`;

  try {
    const response = await model.generateContent(evaluationPrompt);
    const rawText = response.response.text();
    const jsonStr = extractJSON(rawText);

    if (!jsonStr) {
      console.error(`[JUDGE] No JSON extracted. Response:\n${rawText.substring(0, 200)}`);
      return {
        numericScores: getDefaultNumericScores(),
        persona: persona.name,
        error: "Could not extract JSON"
      };
    }

    let scores;
    try {
      scores = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error(`[JUDGE] Parse error: ${parseError.message}`);
      return {
        numericScores: getDefaultNumericScores(),
        persona: persona.name,
        error: `Parse error: ${parseError.message}`
      };
    }

    // Validate all dimensions present and extract numeric scores
    const numericScores = {};
    RUBRIC_DIMENSIONS.forEach(d => {
      const dimData = scores[d.id];
      if (!dimData || !dimData.score) {
        numericScores[d.id] = 5;
      } else {
        numericScores[d.id] = Math.min(10, Math.max(1, parseInt(dimData.score) || 5));
      }
    });

    return {
      rawScores: scores,
      numericScores,
      persona: persona.name,
      conversationLength: messages.length
    };
  } catch (error) {
    console.error(`[JUDGE] Evaluation error: ${error.message}`);
    return {
      numericScores: getDefaultNumericScores(),
      persona: persona.name,
      error: error.message
    };
  }
}

/**
 * Format conversation into readable text
 */
function formatConversation(messages) {
  return messages
    .map((msg, idx) => {
      const role = msg.role === "user" ? "CLIENTE" : "BOT";
      return `${idx + 1}. ${role}: ${msg.content}`;
    })
    .join("\n");
}

/**
 * Default numeric scores
 */
function getDefaultNumericScores() {
  const scores = {};
  RUBRIC_DIMENSIONS.forEach(d => {
    scores[d.id] = 5;
  });
  return scores;
}

/**
 * Batch evaluate multiple conversations
 * @param {array} conversations - Array of {messages, persona} objects
 * @returns {Promise<array>} Array of evaluation results
 */
async function batchEvaluate(conversations) {
  const results = [];

  for (let i = 0; i < conversations.length; i++) {
    const { messages, persona } = conversations[i];
    console.log(`[JUDGE] Evaluating ${i + 1}/${conversations.length}: ${persona.name}...`);

    const result = await evaluateConversation(messages, persona);
    results.push(result);

    // Rate limiting: wait 1 second between evaluations
    if (i < conversations.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return results;
}

module.exports = {
  evaluateConversation,
  batchEvaluate,
  formatConversation,
  extractJSON
};
