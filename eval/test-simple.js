#!/usr/bin/env node

const { simulateAllConversations } = require("./conversations");
const { batchEvaluate } = require("./judge-simple");
const { calculateOverallScore, RUBRIC_DIMENSIONS } = require("./rubric");
const { PERSONAS } = require("./personas");

async function testEvaluation() {
  console.log("\n" + "=".repeat(80));
  console.log("QUICK TEST - SIMPLE JUDGE - 3 PERSONAS");
  console.log("=".repeat(80));

  const testPersonaIds = [1, 6, 20];

  try {
    console.log("\n[TEST] Simulating conversations...");
    const conversations = await simulateAllConversations(testPersonaIds);

    const validConversations = conversations
      .filter(c => c.success && c.messages.length > 0)
      .map(c => ({
        messages: c.messages,
        persona: PERSONAS.find(p => p.id === c.personaId)
      }));

    console.log(`✅ Simulated ${validConversations.length} conversations\n`);

    console.log("[TEST] Evaluating conversations...");
    const evaluations = await batchEvaluate(validConversations);

    console.log(`✅ Completed ${evaluations.length} evaluations\n`);

    // Print results
    console.log("=".repeat(80));
    console.log("TEST RESULTS");
    console.log("=".repeat(80));

    let successCount = 0;
    evaluations.forEach(eval => {
      try {
        const score = calculateOverallScore(eval.numericScores);
        successCount++;
        console.log(`\n${score.passed ? '✅' : '❌'} ${eval.persona}: ${score.overall}/10`);
        console.log(`  ${Object.entries(score.breakdown)
          .map(([dim, s]) => `${dim}=${s}`)
          .join(", ")}`);
      } catch (e) {
        console.log(`\n❌ ${eval.persona}: Error calculating score`);
      }
    });

    console.log("\n" + "=".repeat(80));
    console.log(`Success: ${successCount}/${evaluations.length}`);
    console.log("=".repeat(80) + "\n");

  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  testEvaluation();
}
