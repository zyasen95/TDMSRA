// scripts/batch-process-msra.ts
// Batch process MSRA question screenshots

import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import FormData from 'form-data';
import readline from 'readline';

// Configuration
const CONFIG = {
  inputDir: path.join(process.env.HOME || '', 'Documents', 'MSRAquestions', 'raw'),
  processedDir: path.join(process.env.HOME || '', 'Documents', 'MSRAquestions', 'processed'),
  failedDir: path.join(process.env.HOME || '', 'Documents', 'MSRAquestions', 'failed'),
  outputDir: path.join(process.cwd(), 'msra_audit', 'batch_output'),
  apiEndpoint: 'http://localhost:3000/api/generate-msra',
  batchSize: 5,  // Process in batches to avoid overwhelming the system
  delayMs: 2000,  // Delay between requests
};

// Supported image extensions
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff'];

// Category mapping for common patterns (can be expanded)
const CATEGORY_HINTS: Record<string, string> = {
  'cardiac': 'Cardiovascular',
  'heart': 'Cardiovascular',
  'respiratory': 'Respiratory',
  'lung': 'Respiratory',
  'diabetes': 'Endocrinology & Metabolic',
  'thyroid': 'Endocrinology & Metabolic',
  'paediatric': 'Paediatrics',
  'child': 'Paediatrics',
  'drug': 'Pharmacology & Therapeutics',
  'prescription': 'Pharmacology & Therapeutics',
};

// Type definitions
interface ProcessResult {
  filename: string;
  success: boolean;
  category?: string;
  mcq?: any;
  error?: string;
  ragMetadata?: {
    questionType?: 'professional' | 'clinical';
    totalFound?: number;
    afterRerank?: number;
    sources?: Record<string, number>;
    chunksFound?: number;
    chunksUsed?: number;
    sourcesUsed?: Record<string, number>;
  };
  timestamp: string;
}

interface MSRAAPIResponse {
  success: boolean;
  auditFile?: string;
  extractedText?: string;
  ragMetadata?: {
    questionType?: 'professional' | 'clinical';
    totalFound?: number;
    afterRerank?: number;
    sources?: Record<string, number>;
    chunksFound?: number;
    chunksUsed?: number;
    sourcesUsed?: Record<string, number>;
  };
  category?: string;
  mcq?: {
    question?: string;
    options?: string[];
    correct_answer?: string;
    difficulty?: string;
    subsection?: string;
    subsubsection?: string;
    topic?: string;
    [key: string]: any;
  };
}

/**
 * Ensure all required directories exist
 */
function ensureDirectories() {
  [CONFIG.processedDir, CONFIG.failedDir, CONFIG.outputDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

/**
 * Get list of images to process
 */
function getImagesToProcess(): string[] {
  if (!fs.existsSync(CONFIG.inputDir)) {
    console.error(`❌ Input directory not found: ${CONFIG.inputDir}`);
    return [];
  }

  return fs.readdirSync(CONFIG.inputDir)
    .filter(file => IMAGE_EXTENSIONS.includes(path.extname(file).toLowerCase()))
    .map(file => path.join(CONFIG.inputDir, file));
}

/**
 * Guess category from filename
 */
function guessCategory(filename: string): string | undefined {
  const name = path.basename(filename).toLowerCase();
  
  for (const [keyword, category] of Object.entries(CATEGORY_HINTS)) {
    if (name.includes(keyword)) {
      return category;
    }
  }
  
  return undefined;
}

/**
 * Process single image
 */
async function processImage(imagePath: string): Promise<ProcessResult> {
  const filename = path.basename(imagePath);
  console.log(`\n📸 Processing: ${filename}`);
  
  try {
    // Create form data
    const form = new FormData();
    form.append('image', fs.createReadStream(imagePath));
    
    // Try to guess category from filename
    const category = guessCategory(filename);
    if (category) {
      console.log(`  📁 Category hint: ${category}`);
      form.append('category', category);
    }

    // Make API request
    const response = await fetch(CONFIG.apiEndpoint, {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error: ${response.status} - ${error}`);
    }

    const result = await response.json() as any;

    // Save individual result
    const outputFile = path.join(
      CONFIG.outputDir,
      `${path.basename(filename, path.extname(filename))}_result.json`
    );
    fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));

    // Move to processed folder
    const processedPath = path.join(CONFIG.processedDir, filename);
    fs.renameSync(imagePath, processedPath);

    console.log(`  ✅ Success: ${result.category} - ${result.mcq?.question?.substring(0, 50)}...`);

    return {
      filename,
      success: true,
      category: result.category || 'Unknown',
      mcq: result.mcq,
      ragMetadata: result.ragMetadata,
      timestamp: new Date().toISOString()
    };

  } catch (error: any) {
    console.error(`  ❌ Failed: ${error.message}`);
    
    // Move to failed folder
    const failedPath = path.join(CONFIG.failedDir, filename);
    fs.renameSync(imagePath, failedPath);

    return {
      filename,
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Process images in batches
 */
async function processBatch(images: string[]): Promise<ProcessResult[]> {
  const results: ProcessResult[] = [];
  
  for (let i = 0; i < images.length; i += CONFIG.batchSize) {
    const batch = images.slice(i, i + CONFIG.batchSize);
    console.log(`\n🔄 Processing batch ${Math.floor(i / CONFIG.batchSize) + 1}/${Math.ceil(images.length / CONFIG.batchSize)}`);
    
    for (const image of batch) {
      const result = await processImage(image);
      results.push(result);
      
      // Delay between requests
      if (batch.indexOf(image) < batch.length - 1) {
        await new Promise(resolve => setTimeout(resolve, CONFIG.delayMs));
      }
    }
    
    // Longer delay between batches
    if (i + CONFIG.batchSize < images.length) {
      console.log('⏸️  Pausing between batches...');
      await new Promise(resolve => setTimeout(resolve, CONFIG.delayMs * 2));
    }
  }
  
  return results;
}

/**
 * Generate summary report
 */
function generateSummaryReport(results: ProcessResult[]): string {
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  const categoryBreakdown: Record<string, number> = {};
  const sourceBreakdown: Record<string, number> = {};
  
  successful.forEach(result => {
    categoryBreakdown[result.category || 'Unknown'] = 
      (categoryBreakdown[result.category || 'Unknown'] || 0) + 1;
    
    if (result.ragMetadata?.sourcesUsed) {
      Object.entries(result.ragMetadata.sourcesUsed).forEach(([source, count]) => {
        sourceBreakdown[source] = (sourceBreakdown[source] || 0) + (count as number);
      });
    }
  });

  return `
# MSRA Batch Processing Report
Generated: ${new Date().toISOString()}

## Summary
- Total Processed: ${results.length}
- Successful: ${successful.length}
- Failed: ${failed.length}
- Success Rate: ${((successful.length / results.length) * 100).toFixed(1)}%

## Category Breakdown
${Object.entries(categoryBreakdown)
  .sort((a, b) => b[1] - a[1])
  .map(([cat, count]) => `- ${cat}: ${count}`)
  .join('\n')}

## Source Usage
${Object.entries(sourceBreakdown)
  .sort((a, b) => b[1] - a[1])
  .map(([source, count]) => `- ${source}: ${count}`)
  .join('\n')}

## Failed Files
${failed.map(f => `- ${f.filename}: ${f.error}`).join('\n') || 'None'}

## Successful Files
${successful.map(f => `- ${f.filename} -> ${f.category}`).join('\n')}

## RAG Performance Metrics
- Average chunks found: ${
  successful
    .map(r => r.ragMetadata?.chunksFound || 0)
    .reduce((a, b) => a + b, 0) / successful.length || 0
  }
- Average chunks used: ${
  successful
    .map(r => r.ragMetadata?.chunksUsed || 0)
    .reduce((a, b) => a + b, 0) / successful.length || 0
  }
  `;
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 MSRA Batch Processing Script');
  console.log('================================\n');
  
  // Setup
  ensureDirectories();
  
  // Get images
  const images = getImagesToProcess();
  
  if (images.length === 0) {
    console.log('No images found to process.');
    console.log(`Please add images to: ${CONFIG.inputDir}`);
    return;
  }
  
  console.log(`Found ${images.length} images to process`);
  
  // Confirm before processing
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const answer = await new Promise<string>(resolve => {
    rl.question('Continue with processing? (y/n): ', resolve);
  });
  rl.close();
  
  if (answer.toLowerCase() !== 'y') {
    console.log('Processing cancelled');
    return;
  }
  
  // Process images
  const startTime = Date.now();
  const results = await processBatch(images);
  const duration = (Date.now() - startTime) / 1000;
  
  // Save batch results
  const batchResultPath = path.join(
    CONFIG.outputDir, 
    `batch_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  );
  fs.writeFileSync(batchResultPath, JSON.stringify(results, null, 2));
  
  // Generate and save report
  const report = generateSummaryReport(results);
  const reportPath = path.join(
    CONFIG.outputDir,
    `report_${new Date().toISOString().replace(/[:.]/g, '-')}.md`
  );
  fs.writeFileSync(reportPath, report);
  
  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('✅ BATCH PROCESSING COMPLETE');
  console.log('='.repeat(50));
  console.log(`Time taken: ${duration.toFixed(1)} seconds`);
  console.log(`Results saved to: ${batchResultPath}`);
  console.log(`Report saved to: ${reportPath}`);
  console.log('\nSummary:');
  console.log(`- Successful: ${results.filter(r => r.success).length}/${results.length}`);
  console.log(`- Failed: ${results.filter(r => !r.success).length}/${results.length}`);
  
  // Folders status
  console.log('\n📁 Files have been moved to:');
  console.log(`- Processed: ${CONFIG.processedDir}`);
  console.log(`- Failed: ${CONFIG.failedDir}`);
}

// Run if called directly
// Simply run main() when the script is executed
main().catch(console.error);

export { processImage, processBatch, generateSummaryReport };