// pages/api/generate-msra.ts
// Simplified version with local JSON storage instead of complex SQL

import { IncomingForm } from 'formidable';
import fs from 'fs';
import path from 'path';
import { OpenAI } from 'openai';
import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import { getSubsectionAndSubsubsectionPromptMSRA } from '../../lib/getSubsectionMSRA';
import { extractTextFromImage } from '../../lib/ocr';
import { 
  determineQuestionType, 
  findRelevantChunks, 
  rerankChunks, 
  extractReferences 
} from '../../lib/MSRASupabaseStore';

// MSRA System Prompt
const systemPromptMSRA = `You are an expert medical educator helping to build a high-quality MSRA Clinical Problem Solving question bank.

You will receive:
- A clinical question stem (may or may not include a patient scenario)
- Five answer options (with or without percentages)
- The correct answer (sometimes within the explanation)
- An explanation
- Relevant excerpts retrieved by an AI RAG system from authoritative medical sources (e.g. NICE CKS, BNF, GMC, SIGN, etc.)

Your task is to rewrite and structure this information for publication, ensuring high quality, originality, and clinical relevance. Apply the following rules strictly:

---

GENERAL RULES:
1. Completely rework the question — do not preserve the structure, phrasing, or logic of the original stem. Avoid superficial substitutions (e.g., changing "pneumonia" to "bronchitis"). Instead, craft a **clinically distinct but educationally equivalent** context.
2. Write direct factual questions when possible (e.g., "What is the first-line treatment for...?"). Use a brief vignette (1–2 sentences) only if necessary.
3. Always vary the patient's demographics and clinical setting — age, gender, presentation, context.
4. Reword the explanation entirely — no reused phrases from the original.
5. Use clean UK spelling and MSRA-level clinical language.
6. Return your final structured answer strictly as minified JSON format.

---

CLINICAL ACCURACY RULES:
1. Preserve the **specific diagnosis, condition, mechanism, or concept** being assessed.
2. The rewritten question must test the same primary concept as the original.
3. You may adjust context, demographics, and distractors, but not the underlying concept.
4. Never substitute one disease or mechanism for another, even if related.

---

DISTRACTOR RULES:
1. Replace or reword at least **3 distractors**.
2. Replace the two weakest distractors completely with plausible incorrect options.
3. Maintain exactly 5 options and randomise order.
4. Lightly reword the correct answer only if a common synonym is used.
5. Ensure all options are clinically plausible.

---

EXPLANATION RULES:
1. Only the correct answer receives a detailed explanation.

2. Structure the explanation into these fields:
   - **Explanation**: Clear, clinically focused reasoning with **bolded key facts** and contrasts vs similar diagnoses.
   - **Key Points**: 3–10 concise bullet points or numbered facts. You may include one simple HTML table for clarity (e.g. diagnostic criteria, drug classes, comparisons).
   - **Clinical Relevance**: Short paragraph linking the topic to real-world practice, guidelines, or patient safety.
   - **Memory Anchor** (optional): Include only if a **genuine mnemonic, naming pattern, or strong association** exists. Otherwise leave blank.

3. Provide **one-line bullet explanations** for each option (why correct or incorrect).
4. Separate major sections with two line breaks (<br><br>).
5. For tables, use simple HTML (<table><thead><tbody>).
6. Embed memory techniques naturally (bolding, chunking, contrasts).

---

CLASSIFICATION:
- **category**: Use exactly one from the MSRA taxonomy.
- **subsection**, **subsubsection**, **topic**: Follow the hierarchical structure for that category.
- **keywords**: Return 3–5 search-optimised keywords.
- **difficulty**: "Easy", "Medium", or "Hard".

---

REFERENCING:
Include a **"references"** array with entries from the provided context, each containing:
- **source**: The source name (e.g. "NICE CKS")
- **topic_title**: The section title or heading
- **citation**: The copyright line (e.g. "© NICE, 2025")
- **url**: If provided, include the direct link

---

FINAL OUTPUT FORMAT:

{
  "question_number": 1,
  "question": "Rewritten question text",
  "options": ["Option A", "Option B", "Option C", "Option D", "Option E"],
  "correct_answer": "Exact correct option text",
  "correct_answer_explanation_sections": {
    "explanation": "Full detailed explanation",
    "key_points": "Bullet list",
    "clinical_relevance": "Short clinical context",
    "memory_anchor": "Mnemonic if applicable"
  },
  "bullet_explanations": {
    "Option A": "Why A is correct/incorrect",
    "Option B": "Why B is correct/incorrect",
    "Option C": "Why C is correct/incorrect",
    "Option D": "Why D is correct/incorrect",
    "Option E": "Why E is correct/incorrect"
  },
  "category": "Category name",
  "subsection": "Subsection name",
  "subsubsection": "Subsubsection name",
  "topic": "Topic name",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "difficulty": "Easy" | "Medium" | "Hard",
  "references": [
    { "source": "", "topic_title": "", "citation": "", "url": "" }
  ]
}`;

// Valid MSRA categories
const MSRA_CATEGORIES = [
  'Cardiovascular',
  'Respiratory',
  'Gastroenterology & Nutrition',
  'Endocrinology & Metabolic',
  'Infectious, Haematology, Immunology, Allergy & Genetics',
  'Musculoskeletal',
  'Paediatrics',
  'Pharmacology & Therapeutics',
  'Psychiatry & Neurology',
  'Renal & Urology',
  'Reproductive Health',
  'Dermatology, ENT & Eyes'
];

// Category prediction using GPT-4.1-mini
async function predictCategory(text: string): Promise<string> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  console.log('🔮 Predicting MSRA category...');

  const systemPrompt = `
You are an expert medical educator.
Classify the following text into **one** of these exact MSRA categories:

${MSRA_CATEGORIES.map(c => `- "${c}"`).join('\n')}

Return only the exact category string, nothing else.
`;

  try {
    const chatCompletion = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text.slice(0, 1000) }
      ],
      temperature: 0.1,
      max_tokens: 50
    });

    const prediction = chatCompletion.choices[0]?.message?.content?.trim();
    
    if (MSRA_CATEGORIES.includes(prediction)) {
      console.log(`✅ Category predicted: ${prediction}`);
      return prediction;
    }
    
    console.warn(`⚠️ Invalid category prediction: ${prediction}, using default`);
    return 'Pharmacology & Therapeutics';
  } catch (error) {
    console.error('❌ Category prediction failed:', error);
    return 'Pharmacology & Therapeutics';
  }
}

// Ensure audit directory exists
function ensureAuditDir(): string {
  const auditDir = path.join(process.cwd(), 'msra_audit');
  if (!fs.existsSync(auditDir)) {
    fs.mkdirSync(auditDir, { recursive: true });
  }
  return auditDir;
}

// Save audit data to JSON
function saveAuditData(auditData: any, category: string): string {
  const auditDir = ensureAuditDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const auditFilename = `audit_${timestamp}_${category}.json`;
  const auditPath = path.join(auditDir, auditFilename);
  
  fs.writeFileSync(auditPath, JSON.stringify(auditData, null, 2));
  console.log(`📁 Audit saved: ${auditFilename}`);
  
  return auditFilename;
}

// Update coverage tracking
function updateCoverage(mcq: any, auditFilename: string): void {
  const auditDir = ensureAuditDir();
  const coveragePath = path.join(auditDir, 'coverage.json');
  let coverage = {};
  
  if (fs.existsSync(coveragePath)) {
    coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
  }

  const coverageKey = `${mcq.category}|${mcq.subsection || 'none'}|${mcq.subsubsection || 'none'}|${mcq.topic || 'general'}`;
  coverage[coverageKey] = {
    category: mcq.category,
    subsection: mcq.subsection || 'none',
    subsubsection: mcq.subsubsection || 'none',
    topic: mcq.topic || 'general',
    count: (coverage[coverageKey]?.count || 0) + 1,
    lastGenerated: new Date().toISOString(),
    questions: [...(coverage[coverageKey]?.questions || []), auditFilename]
  };

  fs.writeFileSync(coveragePath, JSON.stringify(coverage, null, 2));
  console.log('📊 Coverage updated');
}

// Update daily summary
function updateDailySummary(metadata: any, category: string): void {
  const auditDir = ensureAuditDir();
  const summaryPath = path.join(auditDir, 'daily_summary.json');
  const today = new Date().toISOString().split('T')[0];
  let summary = {};
  
  if (fs.existsSync(summaryPath)) {
    summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  }
  
  if (!summary[today]) {
    summary[today] = {
      total: 0,
      byCategory: {},
      byQuestionType: {},
      bySources: {}
    };
  }
  
  summary[today].total++;
  summary[today].byCategory[category] = (summary[today].byCategory[category] || 0) + 1;
  summary[today].byQuestionType[metadata.questionType] = 
    (summary[today].byQuestionType[metadata.questionType] || 0) + 1;
  
  Object.keys(metadata.sources).forEach(source => {
    summary[today].bySources[source] = 
      (summary[today].bySources[source] || 0) + metadata.sources[source];
  });
  
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log('📅 Daily summary updated');
}

// Main handler
export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('\n' + '='.repeat(60));
  console.log('🏥 MSRA MCQ GENERATION (Local Storage) - REQUEST RECEIVED');
  console.log('Method:', req.method);
  console.log('Time:', new Date().toISOString());
  console.log('='.repeat(60));

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const contentType = req.headers['content-type'] || '';
    console.log('📝 Content-Type:', contentType);

    let extractedText = '';
    let category = '';

    // Handle image upload or JSON text
    if (contentType.includes('multipart/form-data')) {
      console.log('📸 Processing image upload...');
      
      const uploadDir = path.join(process.cwd(), '/tmp/uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const form = new IncomingForm({ 
        uploadDir, 
        keepExtensions: true,
        maxFileSize: 10 * 1024 * 1024
      });
      
      const data = await new Promise<{ fields: formidable.Fields; files: formidable.Files }>((resolve, reject) => {
        form.parse(req, (err, fields, files) => {
          if (err) reject(err);
          else resolve({ fields, files });
        });
      });

      const file = Array.isArray(data.files.image) ? data.files.image[0] : data.files.image;
      if (!file || !file.filepath) {
        return res.status(400).json({ error: 'No image uploaded' });
      }

      extractedText = await extractTextFromImage(file.filepath);
      category = (Array.isArray(data.fields.category) ? data.fields.category[0] : data.fields.category || '').trim();

      fs.unlink(file.filepath, (err) => {
        if (err) console.error('Failed to delete temp file:', err);
      });
      
    } else if (contentType.includes('application/json')) {
      console.log('📄 Processing JSON text input...');
      
      const rawBody = await new Promise<string>((resolve, reject) => {
        let data = '';
        req.on('data', (chunk) => data += chunk);
        req.on('end', () => resolve(data));
        req.on('error', reject);
      });

      const body = JSON.parse(rawBody) as { text: string; category?: string };
      extractedText = body.text || '';
      category = (body.category || '').trim();
    } else {
      return res.status(400).json({ error: 'Unsupported content type' });
    }

    if (!extractedText.trim()) {
      return res.status(400).json({ error: 'No text extracted or provided' });
    }

    console.log('📊 Extracted Text Stats:');
    console.log(`  - Length: ${extractedText.length} characters`);
    console.log(`  - Preview: ${extractedText.substring(0, 150)}...`);

    // Predict category if not provided
    if (!category || !MSRA_CATEGORIES.includes(category)) {
      category = await predictCategory(extractedText);
    }

    console.log(`📁 Using Category: ${category}`);

    // =====================================================
    // MSRA RAG Pipeline (Simplified)
    // =====================================================
    
    console.log('\n🚀 Starting Simplified RAG Pipeline...');
    
    // Determine question type
    const questionType = await determineQuestionType(extractedText);
    console.log(`📋 Question Type: ${questionType}`);
    
    // Find relevant chunks
    const candidates = await findRelevantChunks(extractedText, 10, questionType);
    console.log(`🔍 Found ${candidates.length} candidate chunks`);
    
    // Rerank chunks
    const rerankedChunks = await rerankChunks(extractedText, candidates, 5);
    console.log(`🎯 Reranked to ${rerankedChunks.length} best chunks`);
    
    // Extract references
    const references = extractReferences(rerankedChunks);
    console.log(`📚 Extracted ${references.length} references`);
    
    // Combine context
    const context = rerankedChunks
      .map(chunk => `[Source: ${chunk.source} - ${chunk.topic_title}]\n${chunk.text}`)
      .join('\n\n---\n\n');
    
    // Calculate metadata
    const sourceCounts = rerankedChunks.reduce((acc, chunk) => {
      acc[chunk.source] = (acc[chunk.source] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const metadata = {
      questionType,
      totalFound: candidates.length,
      afterRerank: rerankedChunks.length,
      sources: sourceCounts
    };
    
    console.log('\n📊 RAG Summary:');
    console.log(`  - Question Type: ${metadata.questionType}`);
    console.log(`  - Chunks Found: ${metadata.totalFound}`);
    console.log(`  - After Reranking: ${metadata.afterRerank}`);
    console.log(`  - Sources: ${JSON.stringify(metadata.sources)}`);
    
    // =====================================================
    // Generate MCQ with GPT-4.1
    // =====================================================
    
    console.log('\n🤖 Generating MCQ with GPT-4.1...');
    
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const fullSystemPrompt = `${systemPromptMSRA}\n\n${getSubsectionAndSubsubsectionPromptMSRA(category)}`;

    const userPrompt = `
Original Question Input:
${extractedText}

Relevant Medical Knowledge from Authoritative Sources:
${context}

Available References for Citation:
${JSON.stringify(references, null, 2)}

Generate a completely rewritten MSRA MCQ based on this input, following all the rules in the system prompt. 
Make sure to cite the provided sources appropriately in your explanation.
`.trim();

    let gptResponse = '';
    try {
      const chatCompletion = await openai.chat.completions.create({
        model: 'gpt-4.1',
        messages: [
          { role: 'system', content: fullSystemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7
      });

      gptResponse = chatCompletion.choices[0]?.message?.content || '';
      console.log('✅ GPT-4.1 generation complete');
    } catch (openaiError: any) {
      console.error('❌ OpenAI Error:', openaiError);
      return res.status(500).json({ 
        error: 'Failed to generate MCQ', 
        detail: openaiError.message || '' 
      });
    }

    // Parse MCQ
    let mcq;
    try {
      mcq = JSON.parse(gptResponse);
      console.log('✅ MCQ JSON parsed successfully');
    } catch (parseError) {
      console.error('❌ Failed to parse GPT response');
      return res.status(500).json({ error: 'Invalid response format from GPT' });
    }

    // =====================================================
    // Save Audit Data Locally
    // =====================================================
    
    console.log('\n💾 Saving audit data locally...');
    
    const auditData = {
      timestamp: new Date().toISOString(),
      extractedText: extractedText.substring(0, 500),
      category,
      metadata,
      references,
      chunks: rerankedChunks.map(c => ({
        source: c.source,
        topic_title: c.topic_title,
        section_type: c.section_type,
        preview: c.text.substring(0, 200) + '...',
        full_text: c.text  // Include full text for audit analysis
      })),
      chunksUsedForContext: rerankedChunks.length,
      contextProvidedToGPT: context.substring(0, 1000) + '...', // Show what was sent to GPT
      mcq
    };
    
    const auditFilename = saveAuditData(auditData, category);
    updateCoverage(mcq, auditFilename);
    updateDailySummary(metadata, category);
    
    // =====================================================
    // Final Response
    // =====================================================
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ MSRA MCQ GENERATION COMPLETE');
    console.log(`📁 Audit saved to: msra_audit/${auditFilename}`);
    console.log('='.repeat(60) + '\n');

    return res.status(200).json({
      success: true,
      auditFile: auditFilename,
      extractedText: extractedText.substring(0, 200) + '...',
      ragMetadata: metadata,
      category,
      mcq
    });
    
  } catch (error: any) {
    console.error('\n❌ UNHANDLED ERROR:', error);
    return res.status(500).json({ 
      error: 'Server error', 
      detail: error.message || '' 
    });
  }
}