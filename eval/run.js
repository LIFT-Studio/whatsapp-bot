#!/usr/bin/env node

/**
 * EVALUATION HARNESS ORCHESTRATOR
 * Phase 2: Run complete evaluation cycle
 *
 * Workflow:
 * 1. Simulate conversations with all 25 personas
 * 2. Evaluate each conversation against 6-dimension rubric
 * 3. Generate detailed reports
 * 4. Identify failing dimensions and problem conversations
 */

const fs = require("fs");
const path = require("path");
const { simulateAllConversations, getConversationStats } = require("./conversations");
const { batchEvaluate } = require("./judge-simple");
const { calculateOverallScore, RUBRIC_DIMENSIONS } = require("./rubric");
const { PERSONAS } = require("./personas");

const REPORTS_DIR = path.join(__dirname, "reports");

/**
 * Ensure reports directory exists
 */
function ensureReportsDir() {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
}

/**
 * Run the complete evaluation cycle
 */
async function runEvaluation() {
  console.log("\n" + "=".repeat(80));
  console.log("EVALUATION HARNESS - PHASE 2");
  console.log("=".repeat(80));

  const timestamp = new Date().toISOString();
  const startTime = Date.now();

  try {
    // STEP 1: Simulate conversations
    console.log("\n[STEP 1/3] Simulating conversations with 25 personas...");
    const conversations = await simulateAllConversations();

    const convStats = getConversationStats(conversations);
    console.log(`\nConversation Stats:`);
    console.log(`  Total: ${convStats.total}`);
    console.log(`  Valid: ${convStats.valid}`);
    console.log(`  Invalid: ${convStats.invalid}`);
    console.log(`  Success Rate: ${convStats.successRate}`);
    console.log(`  Avg Messages per Conversation: ${convStats.avgLength}`);

    // STEP 2: Evaluate conversations
    console.log("\n[STEP 2/3] Evaluating conversations with Gemini judge...");
    const validConversations = conversations
      .filter(c => c.success && c.messages.length > 0)
      .map(c => ({
        messages: c.messages,
        persona: PERSONAS.find(p => p.id === c.personaId)
      }));

    const evaluations = await batchEvaluate(validConversations);

    // STEP 3: Generate reports
    console.log("\n[STEP 3/3] Generating reports...");
    const report = generateReport(conversations, evaluations, timestamp);

    // Save reports
    ensureReportsDir();
    saveReport(report, timestamp);

    // Print summary
    printSummary(report);

    console.log("\n" + "=".repeat(80));
    console.log("✅ Evaluation completed successfully");
    console.log(`📁 Reports saved to: ${REPORTS_DIR}`);
    console.log("=".repeat(80));

  } catch (error) {
    console.error("\n❌ Evaluation failed:");
    console.error(error.message);
    process.exit(1);
  }
}

/**
 * Generate comprehensive evaluation report
 */
function generateReport(conversations, evaluations, timestamp) {
  const conversationsByPersona = {};
  conversations.forEach(c => {
    conversationsByPersona[c.personaId] = c;
  });

  const evaluationsByPersona = {};
  evaluations.forEach(e => {
    const persona = PERSONAS.find(p => p.name === e.persona);
    if (persona) {
      evaluationsByPersona[persona.id] = e;
    }
  });

  // Calculate aggregate scores
  const allScores = {};
  RUBRIC_DIMENSIONS.forEach(d => {
    allScores[d.id] = [];
  });

  evaluations.forEach(eval => {
    Object.entries(eval.numericScores).forEach(([dim, score]) => {
      allScores[dim].push(score);
    });
  });

  const aggregateScores = {};
  const dimensionAnalysis = {};

  Object.entries(allScores).forEach(([dim, scores]) => {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const failed = scores.filter(s => s < 8.5).length;

    aggregateScores[dim] = Math.round(avg * 10) / 10;
    dimensionAnalysis[dim] = { avg, min, max, failed };
  });

  const overallScore = calculateOverallScore(aggregateScores);

  // Identify problem conversations (< 8.5)
  const problemConversations = [];
  evaluations.forEach(eval => {
    const score = calculateOverallScore(eval.numericScores);
    if (!score.passed) {
      problemConversations.push({
        persona: eval.persona,
        overall: score.overall,
        failures: score.failures
      });
    }
  });

  return {
    timestamp,
    metadata: {
      totalPersonas: PERSONAS.length,
      conversationsSimulated: conversations.length,
      conversationsValid: conversations.filter(c => c.success).length,
      evaluationsCompleted: evaluations.length
    },
    aggregateScores,
    overallScore,
    dimensionAnalysis,
    problemConversations: problemConversations.sort((a, b) => a.overall - b.overall),
    allEvaluations: evaluations,
    allConversations: conversations
  };
}

/**
 * Save report to file
 */
function saveReport(report, timestamp) {
  const dateStr = new Date(timestamp).toISOString().split('T')[0];
  const filename = `eval-${dateStr}-${timestamp.split('T')[1].replace(/:/g, '')}.json`;
  const filepath = path.join(REPORTS_DIR, filename);

  // Save detailed JSON report
  fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
  console.log(`  📄 Detailed report: ${filename}`);

  // Save human-readable summary
  const summaryFile = filepath.replace('.json', '-summary.txt');
  const summary = generateTextSummary(report);
  fs.writeFileSync(summaryFile, summary);
  console.log(`  📋 Summary report: ${summaryFile.split('/').pop()}`);

  // Save problem conversations for analysis
  if (report.problemConversations.length > 0) {
    const problemFile = filepath.replace('.json', '-problems.md');
    const problemsMarkdown = generateProblemsMarkdown(report);
    fs.writeFileSync(problemFile, problemsMarkdown);
    console.log(`  ⚠️  Problem analysis: ${problemFile.split('/').pop()}`);
  }
}

/**
 * Generate human-readable text summary
 */
function generateTextSummary(report) {
  let text = `EVALUATION REPORT
${new Date(report.timestamp).toLocaleString()}
${"=".repeat(80)}\n\n`;

  text += `METADATA\n`;
  text += `Total Personas: ${report.metadata.totalPersonas}\n`;
  text += `Conversations Simulated: ${report.metadata.conversationsSimulated}\n`;
  text += `Valid Conversations: ${report.metadata.conversationsValid}\n`;
  text += `Evaluations Completed: ${report.metadata.evaluationsCompleted}\n\n`;

  text += `OVERALL SCORE\n`;
  text += `Score: ${report.overallScore.overall}/10 ${report.overallScore.passed ? '✅ PASSED' : '❌ FAILED'}\n\n`;

  text += `DIMENSION BREAKDOWN\n`;
  text += `${"Dimension".padEnd(20)} ${"Avg".padEnd(8)} ${"Min".padEnd(8)} ${"Max".padEnd(8)} ${"Failed".padEnd(8)}\n`;
  text += `${"-".repeat(52)}\n`;

  RUBRIC_DIMENSIONS.forEach(dim => {
    const analysis = report.dimensionAnalysis[dim.id];
    text += `${dim.name.padEnd(20)} ${analysis.avg.toFixed(1).padEnd(8)} ${analysis.min.toString().padEnd(8)} ${analysis.max.toString().padEnd(8)} ${analysis.failed.toString().padEnd(8)}\n`;
  });

  text += `\n`;

  if (report.problemConversations.length > 0) {
    text += `PROBLEM CONVERSATIONS (Score < 8.5)\n`;
    text += `${"Persona".padEnd(25)} ${"Score".padEnd(8)} ${"Failing Dimensions"}\n`;
    text += `${"-".repeat(70)}\n`;

    report.problemConversations.forEach(problem => {
      const failingDims = problem.failures.map(f => `${f.dimension}(${f.score})`).join(", ");
      text += `${problem.persona.padEnd(25)} ${problem.overall.toString().padEnd(8)} ${failingDims}\n`;
    });
  }

  return text;
}

/**
 * Generate Markdown analysis of problem conversations
 */
function generateProblemsMarkdown(report) {
  let md = `# Evaluation Analysis - Problem Conversations\n\n`;
  md += `**Date:** ${new Date(report.timestamp).toLocaleString()}\n`;
  md += `**Problem Conversations:** ${report.problemConversations.length} of ${report.metadata.evaluationsCompleted}\n\n`;

  report.problemConversations.forEach(problem => {
    md += `## ${problem.persona}\n`;
    md += `**Overall Score:** ${problem.overall}/10\n\n`;
    md += `**Failing Dimensions:**\n`;
    problem.failures.forEach(failure => {
      const dim = RUBRIC_DIMENSIONS.find(d => d.id === failure.dimension);
      md += `- **${dim.name}:** ${failure.score}/10 (target: ${dim.target_score})\n`;
    });
    md += `\n`;
  });

  md += `## Summary\n`;
  md += `Focus improvements on these dimensions:\n`;

  const dimensionFailures = {};
  RUBRIC_DIMENSIONS.forEach(d => {
    dimensionFailures[d.id] = 0;
  });

  report.problemConversations.forEach(problem => {
    problem.failures.forEach(f => {
      dimensionFailures[f.dimension]++;
    });
  });

  Object.entries(dimensionFailures)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .forEach(([dim, count]) => {
      const dimObj = RUBRIC_DIMENSIONS.find(d => d.id === dim);
      md += `\n### ${dimObj.name} (${count} personas failing)\n`;
      md += `${dimObj.description}\n`;
      md += `Target Score: ${dimObj.target_score}\n`;
    });

  return md;
}

/**
 * Print summary to console
 */
function printSummary(report) {
  console.log("\n" + "=".repeat(80));
  console.log("EVALUATION SUMMARY");
  console.log("=".repeat(80));

  console.log(`\nOverall Score: ${report.overallScore.overall}/10 ${report.overallScore.passed ? '✅' : '❌'}`);

  console.log(`\nDimension Scores:`);
  RUBRIC_DIMENSIONS.forEach(dim => {
    const score = report.aggregateScores[dim.id];
    const analysis = report.dimensionAnalysis[dim.id];
    const status = score >= 8.5 ? '✅' : score >= 7.0 ? '⚠️' : '❌';
    console.log(`  ${status} ${dim.name.padEnd(25)} ${score}/10 (min: ${analysis.min}, max: ${analysis.max})`);
  });

  if (report.problemConversations.length > 0) {
    console.log(`\nProblematic Conversations (${report.problemConversations.length}):`);
    report.problemConversations.slice(0, 10).forEach(problem => {
      const failingDims = problem.failures.map(f => f.dimension).join(", ");
      console.log(`  ❌ ${problem.persona.padEnd(25)} ${problem.overall}/10 [${failingDims}]`);
    });
    if (report.problemConversations.length > 10) {
      console.log(`  ... and ${report.problemConversations.length - 10} more`);
    }
  }

  console.log(`\nMetadata:`);
  console.log(`  Conversations Simulated: ${report.metadata.conversationsSimulated}`);
  console.log(`  Evaluations Completed: ${report.metadata.evaluationsCompleted}`);
  console.log(`  Timestamp: ${report.timestamp}`);
}

// Run evaluation
if (require.main === module) {
  runEvaluation().catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

module.exports = {
  runEvaluation,
  generateReport,
  saveReport
};
