#!/usr/bin/env node

/**
 * Quick test of evaluation harness with 5 personas
 * Used to validate the system works before running full 25-persona evaluation
 */

const { simulateAllConversations } = require("./conversations");
const { batchEvaluate } = require("./judge");
const { calculateOverallScore, RUBRIC_DIMENSIONS } = require("./rubric");
const { PERSONAS } = require("./personas");

async function testEvaluation() {
  console.log("\n" + "=".repeat(80));
  console.log("QUICK TEST - 5 PERSONAS");
  console.log("=".repeat(80));

  const testPersonaIds = [1, 3, 6, 12, 20]; // Variety of personas

  try {
    console.log("\n[TEST] Simulating conversations with 5 test personas...");
    const conversations = await simulateAllConversations(testPersonaIds);

    const validConversations = conversations
      .filter(c => c.success && c.messages.length > 0)
      .map(c => ({
        messages: c.messages,
        persona: PERSONAS.find(p => p.id === c.personaId)
      }));

    console.log(`✅ Simulated ${validConversations.length} valid conversations\n`);

    console.log("[TEST] Evaluating conversations with Gemini judge...");
    const evaluations = await batchEvaluate(validConversations);

    console.log(`✅ Completed ${evaluations.length} evaluations\n`);

    // Print results
    console.log("=".repeat(80));
    console.log("TEST RESULTS");
    console.log("=".repeat(80));

    evaluations.forEach(eval => {
      if (eval.error || !eval.numericScores) {
        console.log(`\n❌ ${eval.persona || 'Unknown'}: ERROR - ${eval.error || 'No scores'}`);
      } else {
        try {
          const score = calculateOverallScore(eval.numericScores);
          console.log(`\n${score.passed ? '✅' : '❌'} ${eval.persona}: ${score.overall}/10`);
          console.log(`  ${Object.entries(score.breakdown)
            .map(([dim, s]) => `${dim}=${s}`)
            .join(", ")}`);
        } catch (e) {
          console.log(`\n❌ ${eval.persona}: Failed to calculate score - ${e.message}`);
        }
      }
    });

    console.log("\n" + "=".repeat(80));
    const successCount = evaluations.filter(e => !e.error && e.numericScores).length;
    console.log(`Test completed: ${successCount}/${evaluations.length} successful`);
    console.log("=".repeat(80) + "\n");

  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  testEvaluation();
}

module.exports = { testEvaluation };
