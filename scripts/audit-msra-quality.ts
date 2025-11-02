// scripts/audit-msra-quality.ts
// Quality audit tool for MSRA question generation

import fs from 'fs';
import path from 'path';
import readline from 'readline';

const auditDir = path.join(process.cwd(), 'msra_audit');

interface AuditSession {
  sessionId: string;
  reviewer: string;
  startTime: string;
  evaluations: QuestionEvaluation[];
}

interface QuestionEvaluation {
  filename: string;
  timestamp: string;
  
  // Question quality metrics
  questionQuality: {
    clinicalAccuracy: 1 | 2 | 3 | 4 | 5;  // 1=Poor, 5=Excellent
    difficultyAppropriate: boolean;
    distractorsPlausible: boolean;
    explanationQuality: 1 | 2 | 3 | 4 | 5;
    referencesAppropriate: boolean;
    notes: string;
  };
  
  // RAG quality metrics
  ragQuality: {
    chunksRelevant: boolean;
    correctSources: boolean;
    missedImportantChunks: boolean;
    irrelevantChunksIncluded: boolean;
    specificIssues: string[];
    notes: string;
  };
  
  // Overall assessment
  overall: {
    acceptable: boolean;
    requiresRevision: boolean;
    revisionNotes: string;
  };
}

/**
 * Load audit files for review
 */
function loadAuditFiles(): any[] {
  const files = fs.readdirSync(auditDir)
    .filter(f => f.startsWith('audit_') && f.endsWith('.json'))
    .sort((a, b) => b.localeCompare(a));  // Most recent first
  
  return files.map(filename => {
    const filepath = path.join(auditDir, filename);
    const content = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    return { filename, ...content };
  });
}

/**
 * Interactive CLI for reviewing a single question
 */
async function reviewQuestion(audit: any, rl: readline.Interface): Promise<QuestionEvaluation> {
  console.clear();
  console.log('=' .repeat(80));
  console.log('MSRA QUESTION QUALITY REVIEW');
  console.log('=' .repeat(80));
  
  // Display question details
  console.log('\n📋 QUESTION DETAILS:');
  console.log(`Category: ${audit.category}`);
  console.log(`Type: ${audit.metadata?.questionType}`);
  console.log(`Timestamp: ${audit.timestamp}`);
  
  console.log('\n❓ GENERATED QUESTION:');
  console.log(audit.mcq?.question);
  
  console.log('\n🎯 OPTIONS:');
  audit.mcq?.options?.forEach((opt: string, i: number) => {
    const isCorrect = opt === audit.mcq?.correct_answer;
    console.log(`${i + 1}. ${opt} ${isCorrect ? '✓' : ''}`);
  });
  
  console.log('\n📖 EXPLANATION:');
  console.log(audit.mcq?.correct_answer_explanation_sections?.explanation?.substring(0, 500) + '...');
  
  console.log('\n📚 REFERENCES USED:');
  audit.references?.forEach((ref: any) => {
    console.log(`- ${ref.source}: ${ref.topic_title}`);
  });
  
  console.log('\n🔍 RAG CHUNKS RETRIEVED:');
  console.log(`Total found: ${audit.metadata?.totalFound}`);
  console.log(`Used after reranking: ${audit.metadata?.afterRerank}`);
  console.log(`Sources: ${JSON.stringify(audit.metadata?.sources)}`);
  
  if (audit.chunks) {
    console.log('\nChunk previews:');
    audit.chunks.forEach((chunk: any, i: number) => {
      console.log(`${i + 1}. [${chunk.source}] ${chunk.topic_title}`);
      console.log(`   ${chunk.preview?.substring(0, 100)}...`);
    });
  }
  
  // Collect evaluation
  console.log('\n' + '=' .repeat(80));
  console.log('EVALUATION:');
  console.log('=' .repeat(80));
  
  const evaluation: QuestionEvaluation = {
    filename: audit.filename || 'unknown',
    timestamp: new Date().toISOString(),
    questionQuality: {
      clinicalAccuracy: await askNumber(rl, 'Clinical accuracy (1-5): ', 1, 5) as 1 | 2 | 3 | 4 | 5,
      difficultyAppropriate: await askYesNo(rl, 'Difficulty appropriate? (y/n): '),
      distractorsPlausible: await askYesNo(rl, 'Distractors plausible? (y/n): '),
      explanationQuality: await askNumber(rl, 'Explanation quality (1-5): ', 1, 5) as 1 | 2 | 3 | 4 | 5,
      referencesAppropriate: await askYesNo(rl, 'References appropriate? (y/n): '),
      notes: await ask(rl, 'Question quality notes: ')
    },
    ragQuality: {
      chunksRelevant: await askYesNo(rl, 'Retrieved chunks relevant? (y/n): '),
      correctSources: await askYesNo(rl, 'Correct sources used? (y/n): '),
      missedImportantChunks: await askYesNo(rl, 'Any important chunks missed? (y/n): '),
      irrelevantChunksIncluded: await askYesNo(rl, 'Any irrelevant chunks included? (y/n): '),
      specificIssues: (await ask(rl, 'Specific RAG issues (comma-separated): ')).split(',').filter(s => s.trim()),
      notes: await ask(rl, 'RAG quality notes: ')
    },
    overall: {
      acceptable: await askYesNo(rl, 'Overall acceptable? (y/n): '),
      requiresRevision: await askYesNo(rl, 'Requires revision? (y/n): '),
      revisionNotes: await ask(rl, 'Revision notes: ')
    }
  };
  
  return evaluation;
}

/**
 * Helper functions for CLI input
 */
async function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(question, resolve);
  });
}

async function askYesNo(rl: readline.Interface, question: string): Promise<boolean> {
  const answer = await ask(rl, question);
  return answer.toLowerCase() === 'y';
}

async function askNumber(rl: readline.Interface, question: string, min: number, max: number): Promise<number> {
  let num: number;
  do {
    const answer = await ask(rl, question);
    num = parseInt(answer);
  } while (isNaN(num) || num < min || num > max);
  return num;
}

/**
 * Generate quality report
 */
function generateQualityReport(session: AuditSession): string {
  const evaluations = session.evaluations;
  const avgClinicalAccuracy = evaluations.reduce((sum, e) => sum + e.questionQuality.clinicalAccuracy, 0) / evaluations.length;
  const avgExplanationQuality = evaluations.reduce((sum, e) => sum + e.questionQuality.explanationQuality, 0) / evaluations.length;
  const acceptableCount = evaluations.filter(e => e.overall.acceptable).length;
  const revisionCount = evaluations.filter(e => e.overall.requiresRevision).length;
  
  const ragIssues = {
    chunksNotRelevant: evaluations.filter(e => !e.ragQuality.chunksRelevant).length,
    wrongSources: evaluations.filter(e => !e.ragQuality.correctSources).length,
    missedChunks: evaluations.filter(e => e.ragQuality.missedImportantChunks).length,
    irrelevantChunks: evaluations.filter(e => e.ragQuality.irrelevantChunksIncluded).length
  };
  
  return `
# MSRA Question Quality Audit Report

**Session ID:** ${session.sessionId}  
**Reviewer:** ${session.reviewer}  
**Date:** ${session.startTime}  
**Questions Reviewed:** ${evaluations.length}

## Overall Quality Metrics

### Question Quality
- **Average Clinical Accuracy:** ${avgClinicalAccuracy.toFixed(2)}/5
- **Average Explanation Quality:** ${avgExplanationQuality.toFixed(2)}/5
- **Appropriate Difficulty:** ${evaluations.filter(e => e.questionQuality.difficultyAppropriate).length}/${evaluations.length}
- **Plausible Distractors:** ${evaluations.filter(e => e.questionQuality.distractorsPlausible).length}/${evaluations.length}
- **Appropriate References:** ${evaluations.filter(e => e.questionQuality.referencesAppropriate).length}/${evaluations.length}

### RAG Performance
- **Chunks Not Relevant:** ${ragIssues.chunksNotRelevant} cases
- **Wrong Sources Used:** ${ragIssues.wrongSources} cases
- **Missed Important Chunks:** ${ragIssues.missedChunks} cases
- **Irrelevant Chunks Included:** ${ragIssues.irrelevantChunks} cases

### Overall Assessment
- **Acceptable:** ${acceptableCount}/${evaluations.length} (${(acceptableCount/evaluations.length*100).toFixed(1)}%)
- **Requires Revision:** ${revisionCount}/${evaluations.length}

## Detailed Issues

### Common RAG Issues
${[...new Set(evaluations.flatMap(e => e.ragQuality.specificIssues))]
  .filter(issue => issue.trim())
  .map(issue => `- ${issue}`)
  .join('\n')}

### Questions Requiring Revision
${evaluations
  .filter(e => e.overall.requiresRevision)
  .map(e => `- ${e.filename}: ${e.overall.revisionNotes}`)
  .join('\n')}

## Recommendations

${generateRecommendations(evaluations)}
  `;
}

/**
 * Generate recommendations based on patterns
 */
function generateRecommendations(evaluations: QuestionEvaluation[]): string {
  const recommendations: string[] = [];
  
  const avgClinicalAccuracy = evaluations.reduce((sum, e) => sum + e.questionQuality.clinicalAccuracy, 0) / evaluations.length;
  if (avgClinicalAccuracy < 3.5) {
    recommendations.push('- Clinical accuracy needs improvement. Consider additional medical review.');
  }
  
  const ragRelevanceRate = evaluations.filter(e => e.ragQuality.chunksRelevant).length / evaluations.length;
  if (ragRelevanceRate < 0.8) {
    recommendations.push('- RAG retrieval relevance is low. Consider tuning search parameters or reranking logic.');
  }
  
  const wrongSourceRate = evaluations.filter(e => !e.ragQuality.correctSources).length / evaluations.length;
  if (wrongSourceRate > 0.2) {
    recommendations.push('- Source selection needs improvement. Review question type detection logic.');
  }
  
  if (recommendations.length === 0) {
    recommendations.push('- System performing well. Continue monitoring for edge cases.');
  }
  
  return recommendations.join('\n');
}

/**
 * Main audit session
 */
async function runAuditSession() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  console.log('🔍 MSRA Quality Audit Tool\n');
  
  // Get session info
  const reviewer = await ask(rl, 'Your name: ');
  const sessionId = `audit_${Date.now()}`;
  
  // Load audit files
  const auditFiles = loadAuditFiles();
  
  if (auditFiles.length === 0) {
    console.log('No audit files found to review.');
    rl.close();
    return;
  }
  
  console.log(`\nFound ${auditFiles.length} audit files.`);
  const numToReview = parseInt(await ask(rl, 'How many to review? '));
  
  // Create session
  const session: AuditSession = {
    sessionId,
    reviewer,
    startTime: new Date().toISOString(),
    evaluations: []
  };
  
  // Review questions
  for (let i = 0; i < Math.min(numToReview, auditFiles.length); i++) {
    console.log(`\n📄 Reviewing ${i + 1}/${numToReview}`);
    const evaluation = await reviewQuestion(auditFiles[i], rl);
    session.evaluations.push(evaluation);
    
    if (i < numToReview - 1) {
      await ask(rl, '\nPress Enter to continue to next question...');
    }
  }
  
  // Save session
  const sessionPath = path.join(auditDir, 'quality_audits', `${sessionId}.json`);
  const sessionDir = path.dirname(sessionPath);
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }
  fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));
  
  // Generate report
  const report = generateQualityReport(session);
  const reportPath = path.join(auditDir, 'quality_audits', `${sessionId}_report.md`);
  fs.writeFileSync(reportPath, report);
  
  console.log('\n' + '=' .repeat(50));
  console.log('✅ AUDIT SESSION COMPLETE');
  console.log('=' .repeat(50));
  console.log(`Session saved to: ${sessionPath}`);
  console.log(`Report saved to: ${reportPath}`);
  console.log('\nSummary:');
  console.log(`- Questions reviewed: ${session.evaluations.length}`);
  console.log(`- Acceptable: ${session.evaluations.filter(e => e.overall.acceptable).length}`);
  console.log(`- Needs revision: ${session.evaluations.filter(e => e.overall.requiresRevision).length}`);
  
  rl.close();
}

// Run if called directly
if (require.main === module) {
  runAuditSession().catch(console.error);
}

export { runAuditSession, generateQualityReport };