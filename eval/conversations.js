/**
 * CONVERSATIONS: Simulate actual conversations between personas and the bot
 * This module dynamically calls the bot's processMessage() function
 * and builds conversation transcripts for evaluation
 */

const { processMessage } = require("../src/ai");
const { PERSONAS, CONVERSATION_SCRIPTS } = require("./personas");

/**
 * Simulate a conversation between a persona and the bot
 * @param {object} persona - The persona to simulate
 * @param {string} sessionId - Unique session ID for this conversation
 * @returns {Promise<object>} Conversation transcript
 */
async function simulateConversation(persona, sessionId) {
  const script = CONVERSATION_SCRIPTS[persona.id] || [];
  const messages = [];

  if (script.length === 0) {
    console.warn(`No conversation script for persona ${persona.id} (${persona.name})`);
    return {
      persona: persona.name,
      personaId: persona.id,
      messages: [],
      success: false,
      error: "No conversation script"
    };
  }

  console.log(`\n[SIMULATE] Starting conversation with ${persona.name}...`);

  for (let turnIndex = 0; turnIndex < script.length; turnIndex++) {
    const userMessage = script[turnIndex];

    // Add user message
    messages.push({
      role: "user",
      content: userMessage
    });

    console.log(`  Turn ${turnIndex + 1}/${script.length} (${persona.name}): "${userMessage.substring(0, 50)}..."`);

    try {
      // Get bot response
      const result = await processMessage(sessionId, userMessage);
      const botResponse = result.response;

      // Add bot message
      messages.push({
        role: "bot",
        content: botResponse
      });

      // Rate limiting: wait 500ms between turns
      if (turnIndex < script.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error(`    Error getting bot response: ${error.message}`);
      messages.push({
        role: "bot",
        content: `[ERROR] ${error.message}`
      });
      break;
    }
  }

  return {
    persona: persona.name,
    personaId: persona.id,
    messages,
    success: messages.length === script.length * 2, // Each turn = 2 messages
    messageCount: messages.length
  };
}

/**
 * Simulate conversations with all personas
 * @param {array} personaIds - Optional: specific persona IDs to simulate (default: all)
 * @returns {Promise<array>} Array of conversation transcripts
 */
async function simulateAllConversations(personaIds = null) {
  const personas = personaIds
    ? PERSONAS.filter(p => personaIds.includes(p.id))
    : PERSONAS;

  const conversations = [];
  const startTime = Date.now();

  console.log(`\n[SIMULATE] Starting ${personas.length} conversations...`);

  for (let i = 0; i < personas.length; i++) {
    const persona = personas[i];
    const sessionId = `eval-session-${persona.id}-${Date.now()}`;

    try {
      const conversation = await simulateConversation(persona, sessionId);
      conversations.push(conversation);

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`  ✅ Completed ${i + 1}/${personas.length} [${elapsed}s elapsed]`);
    } catch (error) {
      console.error(`  ❌ Failed to simulate ${persona.name}: ${error.message}`);
      conversations.push({
        persona: persona.name,
        personaId: persona.id,
        messages: [],
        success: false,
        error: error.message
      });
    }

    // Rate limiting between personas: 2 seconds
    if (i < personas.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  const totalTime = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n[SIMULATE] Completed ${conversations.length} conversations in ${totalTime}s`);

  return conversations;
}

/**
 * Validate conversation format
 * @param {object} conversation
 * @returns {boolean}
 */
function validateConversation(conversation) {
  if (!conversation.messages || !Array.isArray(conversation.messages)) {
    return false;
  }

  // Should have at least 2 messages (user + bot)
  if (conversation.messages.length < 2) {
    return false;
  }

  // Messages should alternate user/bot (or close to it)
  let lastRole = null;
  for (const msg of conversation.messages) {
    if (!msg.role || !msg.content) return false;
    // Allow consecutive same roles in case of errors
    lastRole = msg.role;
  }

  return true;
}

/**
 * Get conversation statistics
 * @param {array} conversations
 * @returns {object} Statistics
 */
function getConversationStats(conversations) {
  const valid = conversations.filter(validateConversation);
  const invalid = conversations.filter(c => !validateConversation(c));

  const avgLength = valid.length > 0
    ? Math.round(valid.reduce((sum, c) => sum + c.messages.length, 0) / valid.length)
    : 0;

  return {
    total: conversations.length,
    valid: valid.length,
    invalid: invalid.length,
    avgMessageCount: avgLength,
    successRate: Math.round((valid.length / conversations.length) * 100) + "%"
  };
}

module.exports = {
  simulateConversation,
  simulateAllConversations,
  validateConversation,
  getConversationStats
};
