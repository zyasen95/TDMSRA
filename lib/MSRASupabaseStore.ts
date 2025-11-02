// lib/rag/MSRASupabaseStore.ts
// FIXED: Added threshold parameter for dynamic similarity control

import { supabaseAdmin as supabase } from '../utils/supabase-admin';
import { OpenAI } from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* ──────────────────────────────────────────────────────────
   📊 Types
   ────────────────────────────────────────────────────────── */
export interface MSRAChunk {
  chunk_id: string;
  source: string;
  topic: string;
  topic_title: string;
  section_type: string;
  text: string;
  url: string;
  citation: string;
  similarity?: number;
}

export interface Reference {
  source: string;
  topic_title: string;
  citation: string;
  url: string;
}

/* ──────────────────────────────────────────────────────────
   🎯 Generate Optimized Search Query
   ────────────────────────────────────────────────────────── */
export async function generateOptimizedSearchQuery(ocrText: string): Promise<string> {
  console.log('\n🎯 Generating optimized search query from OCR text...');
  
  const prompt = `
You are a medical educator analyzing a potentially garbled OCR extraction from an MSRA exam question.

OCR Text (may contain errors):
"${ocrText}"

Your task:
1. Identify the core medical topic/condition being discussed
2. Extract key clinical terms, drug names, procedures, or symptoms
3. Generate a keyword-rich paragraph (100-150 words) that would match well with medical databases

The paragraph should include:
- The likely medical condition or clinical scenario
- Related symptoms, signs, and investigations
- Relevant treatments or management approaches
- Associated complications or differentials
- Proper medical terminology

Even if the OCR is garbled, use context clues to infer the medical topic.
For example: "ancy" likely means "pregnancy", "mergency dept" means "emergency department"

Return ONLY the optimized search paragraph, no explanations.
`.trim();

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 200
    });

    const optimizedQuery = response.choices[0]?.message?.content?.trim() || ocrText;
    console.log('✅ Optimized search query generated');
    console.log(`📝 Query preview: ${optimizedQuery.substring(0, 150)}...`);
    
    return optimizedQuery;
  } catch (error) {
    console.warn('⚠️ Failed to optimize search query, using original text');
    return ocrText;
  }
}

/* ──────────────────────────────────────────────────────────
   🔍 1. Determine Question Type
   ────────────────────────────────────────────────────────── */
export async function determineQuestionType(query: string): Promise<'professional' | 'clinical'> {
  console.log('\n📋 Determining question type...');
  
  const prompt = `
Analyze this MSRA question and determine its type:

Question: "${query}"

Classify as either:
- "professional": Questions about ethics, GMC guidance, professional standards, patient communication, consent, capacity, confidentiality, workplace issues
- "clinical": Questions about diagnosis, treatment, prescribing, clinical guidelines, investigations, management

Return ONLY the single word: "professional" or "clinical"
`.trim();

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 10
    });

    const type = response.choices[0]?.message?.content?.trim().toLowerCase();
    const result = (type === 'professional') ? 'professional' : 'clinical';
    
    console.log(`✅ Question type determined: ${result}`);
    return result;
  } catch (error) {
    console.warn('⚠️ Failed to determine question type, defaulting to clinical');
    return 'clinical';
  }
}

/* ──────────────────────────────────────────────────────────
   🔍 2. Vector Search with Configurable Threshold
   🆕 PRIORITY 3: Added threshold parameter
   ────────────────────────────────────────────────────────── */
export async function findRelevantChunks(
  query: string,
  limit: number = 20,
  questionType: 'professional' | 'clinical',
  threshold: number = 0.65  // 🆕 Added threshold parameter
): Promise<MSRAChunk[]> {
  console.log('\n🔍 Searching for relevant chunks using vector similarity...');
  console.log(`📝 Original OCR text: "${query.substring(0, 150)}..."`);
  console.log(`🎯 Question type: ${questionType}`);
  console.log(`🎚️ Similarity threshold: ${threshold}`);
  
  // Generate optimized search query from potentially garbled OCR
  const optimizedQuery = await generateOptimizedSearchQuery(query);
  
  try {
    // Generate embedding for the optimized query
    console.log('🧮 Generating embedding for search...');
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-large',  // Using 3072 dimension model to match your database
      input: optimizedQuery
    });
    
    const queryEmbedding = embeddingResponse.data[0].embedding;
    console.log('✅ Embedding generated');
    
    // 🆕 Use the provided threshold parameter
    const { data, error } = await supabase.rpc('match_msra_chunks', {
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: limit
    });
    
    if (error) {
      console.error('❌ Vector search failed:', error);
      // Fallback to text search if vector search fails
      return fallbackTextSearch(optimizedQuery, limit, questionType);
    }
    
    // Filter by source based on question type (optional post-filtering)
    let results = data || [];
    if (questionType === 'professional') {
      // Prioritize GMC sources for professional questions
      results = [
        ...results.filter((r: any) => r.source === 'GMC'),
        ...results.filter((r: any) => r.source !== 'GMC')
      ].slice(0, limit);
    }
    
    console.log(`✅ Found ${results.length} similar chunks`);
    
    // Log similarity scores and sources
    if (results.length > 0) {
      console.log('📊 Top matches:');
      results.slice(0, 5).forEach((chunk: any, i: number) => {
        console.log(`  ${i + 1}. [${chunk.source}] ${chunk.topic_title} (similarity: ${(chunk.similarity * 100).toFixed(1)}%)`);
      });
    }
    
    return results;
    
  } catch (error) {
    console.error('❌ Embedding generation failed:', error);
    // Fallback to text search
    return fallbackTextSearch(optimizedQuery, limit, questionType);
  }
}

/* ──────────────────────────────────────────────────────────
   🔍 Fallback Text Search (if vector search fails)
   ────────────────────────────────────────────────────────── */
async function fallbackTextSearch(
  query: string,
  limit: number,
  questionType: 'professional' | 'clinical'
): Promise<MSRAChunk[]> {
  console.log('⚠️ Falling back to text search...');
  
  // Extract key terms from the query
  const searchTerms = extractSearchTerms(query);
  console.log(`🔑 Search terms: ${searchTerms.join(', ')}`);
  
  // Build source filter based on question type
  let sourceFilter: string[] = [];
  if (questionType === 'professional') {
    sourceFilter = ['GMC'];
  } else {
    sourceFilter = ['BNF', 'NICE CKS'];
  }
  
  try {
    // Use Postgres full-text search with optimized terms
    let results: MSRAChunk[] = [];
    
    // Search with source filter
    for (const source of sourceFilter) {
      const { data, error } = await supabase
        .from('msra_knowledge_blocks')
        .select(`
          chunk_id,
          source,
          topic,
          topic_title,
          section_type,
          text,
          url,
          citation
        `)
        .eq('source', source)
        .textSearch('text', searchTerms.join(' | '), {
          type: 'websearch',
          config: 'english'
        })
        .limit(Math.ceil(limit / sourceFilter.length));
      
      if (data) results.push(...data);
    }
    
    // If still no results, try without source filter
    if (results.length === 0) {
      console.log('⚠️ No results with source filter, searching all sources...');
      const { data } = await supabase
        .from('msra_knowledge_blocks')
        .select(`
          chunk_id,
          source,
          topic,
          topic_title,
          section_type,
          text,
          url,
          citation
        `)
        .textSearch('text', searchTerms.join(' | '), {
          type: 'websearch',
          config: 'english'
        })
        .limit(limit);
      
      if (data) results = data;
    }
    
    console.log(`✅ Text search found ${results.length} results`);
    
    // Log source distribution
    const sourceCounts = results.reduce((acc, chunk) => {
      acc[chunk.source] = (acc[chunk.source] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.log('📊 Source distribution:', sourceCounts);
    
    return results;
    
  } catch (error) {
    console.error('❌ Text search also failed:', error);
    return [];
  }
}

/* ──────────────────────────────────────────────────────────
   🔧 3. Extract Search Terms
   ────────────────────────────────────────────────────────── */
function extractSearchTerms(query: string): string[] {
  // Remove common words and extract key medical terms
  const stopWords = new Set([
    'what', 'which', 'how', 'when', 'where', 'who', 'why',
    'is', 'are', 'was', 'were', 'been', 'be', 'being',
    'have', 'has', 'had', 'do', 'does', 'did',
    'will', 'would', 'could', 'should', 'may', 'might',
    'the', 'a', 'an', 'and', 'or', 'but', 'if', 'for',
    'with', 'without', 'to', 'from', 'of', 'in', 'on', 'at'
  ]);
  
  // Extract words
  const words = query.toLowerCase()
    .replace(/[^\w\s-]/g, ' ')  // Keep hyphens for medical terms
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
  
  // Prioritize medical terms (simple heuristic)
  const medicalTerms = words.filter(word => 
    word.includes('-') ||  // Hyphenated medical terms
    word.endsWith('itis') || word.endsWith('osis') || word.endsWith('emia') ||  // Medical suffixes
    word.endsWith('pathy') || word.endsWith('ectomy') || word.endsWith('graphy') ||
    word.length > 6  // Longer words tend to be more specific
  );
  
  // Return medical terms first, then other terms
  const allTerms = [...new Set([...medicalTerms, ...words])];
  return allTerms.slice(0, 8);  // Limit to 8 terms
}

/* ──────────────────────────────────────────────────────────
   🔧 4. Rerank Chunks with GPT-4.1-mini
   ────────────────────────────────────────────────────────── */
export async function rerankChunks(
  query: string,
  chunks: MSRAChunk[],
  topN: number = 5
): Promise<MSRAChunk[]> {
  console.log(`\n🔧 Reranking ${chunks.length} chunks (target: up to ${topN} relevant)...`);
  
  if (chunks.length === 0) return [];
  if (chunks.length <= 3) return chunks; // If very few chunks, use them all
  
  // Stage 1: Evaluate relevance of each chunk
  const relevancePrompt = `
You are a medical educator evaluating chunks for an MSRA question.

Original question (may be garbled OCR): "${query}"

Evaluate EACH chunk below for relevance to answering this MSRA question.

BE VERY STRICT:
- RELEVANT: ONLY if the chunk directly discusses the specific medical topic in the question
  (e.g., if question is about SVT, chunk must be about arrhythmias/SVT, NOT general cardiovascular topics)
- IRRELEVANT: Everything else (including tangentially related topics)

Examples of IRRELEVANT chunks:
- Question about maternal death → Chunk about general pregnancy/abortion procedures
- Question about aspirin overdose → Chunk about vaccines or paracetamol overdose  
- Question about SVT management → Chunk about CVD risk assessment

Chunks to evaluate:
${chunks.map((chunk, i) => `
[${i}] Source: ${chunk.source} - Topic: ${chunk.topic_title}
Preview: ${chunk.text.substring(0, 250)}...
`).join('\n')}

Return a JSON object mapping indices to relevance (ONLY "RELEVANT" or "IRRELEVANT"):
Example: {"0": "RELEVANT", "1": "IRRELEVANT", "2": "IRRELEVANT", ...}
`.trim();

  try {
    const relevanceResponse = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [{ role: 'user', content: relevancePrompt }],
      temperature: 0.1,
      max_tokens: 200
    });

    const relevanceMap = JSON.parse(
      relevanceResponse.choices[0]?.message?.content?.match(/\{.*\}/)?.[0] || '{}'
    );
    
    console.log('📊 Relevance evaluation:', relevanceMap);
    
    // Only keep RELEVANT chunks
    const relevant: MSRAChunk[] = [];
    
    chunks.forEach((chunk, i) => {
      const relevance = relevanceMap[i.toString()]?.toUpperCase();
      if (relevance === 'RELEVANT') {
        relevant.push(chunk);
      }
    });
    
    console.log(`✅ Found: ${relevant.length} relevant chunks out of ${chunks.length}`);
    
    // If no relevant chunks found, return empty array with warning
    if (relevant.length === 0) {
      console.warn('⚠️ No relevant chunks found for this question');
      console.log('📝 This may indicate missing content in the knowledge base for this topic');
      return [];
    }
    
    // Return only truly relevant chunks (up to topN)
    const selectedChunks = relevant.slice(0, topN);
    
    const selectedSources = selectedChunks.map(c => `${c.source}: ${c.topic_title}`);
    console.log(`📌 Final selection (${selectedChunks.length} chunks):`, selectedSources);
    
    return selectedChunks;
    
  } catch (error) {
    console.error('⚠️ Reranking failed, using first 3 chunks:', error);
    return chunks.slice(0, Math.min(3, chunks.length));
  }
}

/* ──────────────────────────────────────────────────────────
   📚 5. Extract References for Citation
   ────────────────────────────────────────────────────────── */
export function extractReferences(chunks: MSRAChunk[]): Reference[] {
  console.log('\n📚 Extracting references from chunks...');
  
  // Deduplicate by source + topic_title
  const uniqueRefs = new Map<string, Reference>();
  
  chunks.forEach(chunk => {
    const key = `${chunk.source}-${chunk.topic_title}`;
    if (!uniqueRefs.has(key)) {
      uniqueRefs.set(key, {
        source: chunk.source,
        topic_title: chunk.topic_title || 'General',
        citation: chunk.citation || `© ${chunk.source} 2025`,
        url: chunk.url || ''
      });
    }
  });
  
  const references = Array.from(uniqueRefs.values());
  console.log(`✅ Extracted ${references.length} unique references:`, 
    references.map(r => `${r.source}: ${r.topic_title}`));
  
  return references;
}

/* ──────────────────────────────────────────────────────────
   💬 CHATBOT-SPECIFIC FUNCTIONS
   🆕 PRIORITY 3: Added threshold parameter
   ────────────────────────────────────────────────────────── */

/**
 * Find relevant MSRA sections for chatbot queries
 * Wrapper around findRelevantChunks with simplified return type
 * 🆕 Now accepts optional threshold parameter
 */
export async function findRelevantMSRASections(
  query: string,
  topN: number = 5,
  threshold: number = 0.65  // 🆕 Added threshold parameter with default
): Promise<Array<{ topic: string; subtopic: string; content: string; similarity: number }>> {
  console.log(`\n🔍 Finding relevant MSRA sections for chatbot (limit: ${topN}, threshold: ${threshold})...`);
  
  // Determine question type
  const questionType = await determineQuestionType(query);
  
  // 🆕 Pass threshold through to findRelevantChunks
  const chunks = await findRelevantChunks(query, topN * 3, questionType, threshold);
  
  if (chunks.length === 0) {
    console.log('⚠️ No relevant sections found');
    return [];
  }
  
  // Convert to simplified format for chatbot
  return chunks.map(chunk => ({
    topic: chunk.source,
    subtopic: chunk.topic_title,
    content: chunk.text,
    similarity: chunk.similarity || 0.8
  }));
}

/**
 * Rerank MSRA sections for chatbot
 * Wrapper around rerankChunks with simplified return type
 */
export async function rerankMSRASections(
  query: string,
  sections: Array<{ topic: string; subtopic: string; content: string }>,
  topN: number = 2
): Promise<Array<{ topic: string; subtopic: string; content: string }>> {
  console.log(`\n🔧 Reranking ${sections.length} sections for chatbot...`);
  
  if (sections.length === 0) return [];
  if (sections.length <= topN) return sections;
  
  // Convert sections back to MSRAChunk format for reranking
  const chunks: MSRAChunk[] = sections.map((section, i) => ({
    chunk_id: `chat_${i}`,
    source: section.topic,
    topic: section.topic.toLowerCase(),
    topic_title: section.subtopic,
    section_type: 'content',
    text: section.content,
    url: '',
    citation: `© ${section.topic} 2025`
  }));
  
  // Use existing rerank function
  const reranked = await rerankChunks(query, chunks, topN);
  
  // Convert back to simplified format
  return reranked.map(chunk => ({
    topic: chunk.source,
    subtopic: chunk.topic_title,
    content: chunk.text
  }));
}