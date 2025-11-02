// pages/api/MSRAChatbot.ts - FIXED: Intelligent topic detection & context management

import { NextApiRequest, NextApiResponse } from "next";
import { OpenAI } from "openai";
import dotenv from "dotenv";
dotenv.config();

import {
  getSessionMemory,
  saveSessionMemory,
  addToTopicHistory,
  saveFinalAnswerToSession,
} from "../../lib/sessionMemory";
import { v4 as uuidv4 } from "uuid";
import { findRelevantMSRASections, rerankMSRASections } from "../../lib/MSRASupabaseStore";
import { msraSystemPrompt } from "../../lib/msraSystemPrompt";

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

function truncate(str: string, max = 1000) {
  return str.length > max ? str.slice(0, max) + "..." : str;
}

/**
 * 🆕 PRIORITY 1 & 2: Intelligent query classification
 * Determines if query is a follow-up to previous topic or a completely new topic
 */
async function classifyQueryIntent(
  openai: OpenAI,
  currentQuery: string,
  previousTopic: string | null,
  recentMessages: any[]
): Promise<{ isFollowUp: boolean; newTopic: string | null }> {
  
  // If no previous topic, it's definitely new
  if (!previousTopic || recentMessages.length === 0) {
    const newTopic = await extractFocusEntity(openai, currentQuery);
    return { isFollowUp: false, newTopic };
  }

  // Use GPT to determine if this is a follow-up or topic change
  const conversationContext = recentMessages.slice(-2).map((msg: any) => {
    if (msg.role === "user") return `User: ${msg.content}`;
    return `Assistant: ${msg.content.substring(0, 200)}...`;
  }).join("\n");

  const prompt = `You are analyzing a medical question conversation to determine intent.

Previous conversation topic: "${previousTopic}"

Recent conversation:
${conversationContext}

New user query: "${currentQuery}"

Task: Determine if the new query is:
A) A follow-up question about the SAME medical topic as before
B) A COMPLETELY NEW medical topic/question

Rules:
- Follow-up: Uses pronouns (it, that, this) OR asks clarifying questions about the same condition
- New topic: Asks about a different condition, symptom, or clinical scenario
- If unsure or query is long and specific, classify as NEW TOPIC

Examples:
- Previous: "asthma management" | Query: "what about in children?" → FOLLOW-UP
- Previous: "asthma management" | Query: "what are the red flags for back pain" → NEW TOPIC
- Previous: "hypertension" | Query: "tell me more about ACE inhibitors" → FOLLOW-UP
- Previous: "diabetes" | Query: "management of acute MI" → NEW TOPIC

Respond with ONLY one word: "FOLLOW-UP" or "NEW-TOPIC"`;

  try {
    const result = await openai.chat.completions.create({
      model: "gpt-4.1-nano-2025-04-14",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 10,
      temperature: 0,
    });

    const classification = result.choices[0]?.message?.content?.trim().toUpperCase() || "NEW-TOPIC";
    const isFollowUp = classification.includes("FOLLOW-UP");

    if (isFollowUp) {
      // It's a follow-up, keep the current focus
      return { isFollowUp: true, newTopic: previousTopic };
    } else {
      // New topic, extract the new focus
      const newTopic = await extractFocusEntity(openai, currentQuery);
      return { isFollowUp: false, newTopic };
    }
  } catch (error) {
    console.error("⚠️ Failed to classify query intent:", error);
    // Default to new topic to avoid polluting searches
    const newTopic = await extractFocusEntity(openai, currentQuery);
    return { isFollowUp: false, newTopic };
  }
}

async function extractFocusEntity(openai: OpenAI, text: string): Promise<string | null> {
  const result = await openai.chat.completions.create({
    model: "gpt-4.1-nano-2025-04-14",
    messages: [
      { role: "system", content: "Extract the main clinical topic or scenario this MSRA question is about. Return just the topic/condition name, or 'null' if unclear." },
      { role: "user", content: text },
    ],
    max_tokens: 20,
  });
  const raw = result.choices[0]?.message?.content?.toLowerCase() || "";
  if (raw.includes("null")) return null;
  return raw.trim();
}

// Helper will be rebound after stream starts
let _resForEvents: NextApiResponse | null = null;

// Helper to emit SSE-style events that your ThinkingPanel reads
function emitThinkingEvent(res: NextApiResponse, stage: string, data: any = {}) {
  try {
    const eventData = JSON.stringify({ stage, data });
    res.write(`event: thinking\ndata: ${eventData}\n\n`);
    // @ts-ignore
    res.flush?.();
  } catch (e) {
    console.error("Failed to emit thinking event:", e);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    // @ts-ignore
    req.socket?.setKeepAlive?.(true);
    // @ts-ignore
    req.socket?.setTimeout?.(0);
  } catch {}

  try {
    const bufs: Buffer[] = [];
    for await (const c of req) bufs.push(c);
    const body = Buffer.concat(bufs).toString();
    const { text, sessionId: bodySid, showThinking } = JSON.parse(body);
    if (!text?.trim()) return res.status(400).json({ error: "No text provided" });

    // --- Session cookie (no auth needed) ---
    // @ts-ignore
    const cookieSid = req.cookies?.td_msra_sessionId;
    const sessionId = bodySid || cookieSid || uuidv4();
    if (!cookieSid) {
      res.setHeader("Set-Cookie", `td_msra_sessionId=${sessionId}; Path=/; Max-Age=604800; SameSite=Lax`);
    }

    const session: any = await getSessionMemory(sessionId, "msra");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCachedTokens = 0;
    const primaryModel = "gpt-4.1-2025-04-14";

    // ---------- STREAM SETUP (must happen BEFORE any writes) ----------
    let streamStarted = false;
    let streamCtrl: { isClosed: () => boolean; stop: () => void } | null = null;

    const beginStream = () => {
      if (streamStarted) return streamCtrl!;
      streamStarted = true;

      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("Transfer-Encoding", "chunked");
      res.setHeader("X-Accel-Buffering", "no");
      res.setHeader("Content-Encoding", "identity");
      res.setHeader("Vary", "Accept-Encoding");
      // @ts-ignore
      res.flushHeaders?.();

      const heartbeat = setInterval(() => {
        try {
          res.write("\n");
        } catch {}
      }, 15000);
      let closed = false;
      const onClose = () => {
        closed = true;
        clearInterval(heartbeat);
      };
      res.on("close", onClose);
      res.on("error", onClose);

      _resForEvents = res;

      streamCtrl = {
        isClosed: () => closed,
        stop: () => {
          clearInterval(heartbeat);
          res.removeListener("close", onClose);
          res.removeListener("error", onClose);
        },
      };
      return streamCtrl!;
    };

    // Wrap any "thinking" emit to guarantee the stream is started BEFORE writing
    const safeEmitThinking = (stage: string, data: any = {}) => {
      if (!streamStarted) beginStream();
      emitThinkingEvent(res, stage, data);
    };

    // 🆕 PRIORITY 1 & 2: Build recent conversation context
    const recentMessages = session.questionHistory.slice(-2).flatMap((pair: any) => [
      { role: "user", content: truncate(pair.q) },
      { role: "assistant", content: truncate(pair.a) },
    ]);

    // 🆕 PRIORITY 1 & 2: Intelligent query classification
    console.log("\n🧠 Analyzing query intent...");
    console.log(`📌 Current focus: ${session.currentFocus || "none"}`);
    console.log(`📝 User query: ${text}`);

    const { isFollowUp, newTopic } = await classifyQueryIntent(
      openai,
      text,
      session.currentFocus,
      recentMessages
    );

    totalInputTokens += 100; // Estimation for classification + extraction

    console.log(`✅ Classification: ${isFollowUp ? "FOLLOW-UP" : "NEW TOPIC"}`);
    console.log(`🎯 Topic: ${newTopic || "unknown"}`);

    // 🆕 PRIORITY 4: Update session context intelligently
    let focusedText = text;
    if (isFollowUp && session.currentFocus) {
      // Only add context if it's a genuine follow-up
      focusedText = `In the context of ${session.currentFocus}, ${text}`;
      console.log(`🔗 Enhanced query: ${focusedText}`);
    } else {
      // New topic: clear old focus and set new one
      if (newTopic && newTopic !== session.currentFocus) {
        console.log(`🔄 Topic changed: "${session.currentFocus}" → "${newTopic}"`);
        session.currentFocus = newTopic;
      }
    }

    const streamLLM = async (messages: any[]) => {
      if (!streamStarted) beginStream();

      const ctrl = streamCtrl!;
      const stream = await openai.chat.completions.create({ model: primaryModel, messages, stream: true });

      let full = "";
      try {
        for await (const chunk of stream) {
          if (ctrl.isClosed()) break;
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) {
            full += content;
            try {
              res.write(content);
              // @ts-ignore
              res.flush?.();
            } catch {
              break;
            }
          }
          // @ts-ignore
          if (chunk.usage) {
            // @ts-ignore
            totalInputTokens += chunk.usage.prompt_tokens || 0;
            // @ts-ignore
            totalOutputTokens += chunk.usage.completion_tokens || 0;
            // @ts-ignore
            totalCachedTokens += chunk.usage.prompt_tokens_details?.cached_tokens || 0;
          }
        }
      } finally {
        ctrl.stop();
      }

      if (totalOutputTokens === 0) totalOutputTokens = Math.ceil(full.length / 4);
      if (totalInputTokens === 0) {
        const inputLength = messages.reduce((acc, msg: any) => acc + (msg.content?.length || 0), 0);
        totalInputTokens = Math.ceil(inputLength / 4);
      }

      try {
        res.write("\n");
      } catch {}

      saveFinalAnswerToSession(session, full);
      await saveSessionMemory(sessionId, session, "msra", null);

      console.log(`📊 Tokens: ${totalInputTokens} in, ${totalOutputTokens} out, ${totalCachedTokens} cached`);

      try {
        res.end();
      } catch {}
    };

    // Classify intent: check if query contains MSRA-related keywords
    const msraKeywords = ["scenario", "patient", "clinical", "management", "diagnosis", "treatment", "msra", "sra", "gp", "consultation"];
    const isMSRAQuery = msraKeywords.some((kw) => focusedText.toLowerCase().includes(kw)) || focusedText.length > 30;

    if (isMSRAQuery) {
      // Question type classification happens in MSRASupabaseStore.determineQuestionType()
      // via findRelevantMSRASections() - no need to duplicate it here
      
      if (showThinking) safeEmitThinking("searching", {});
      if (showThinking) safeEmitThinking("query_optimisation", {});
      if (showThinking) safeEmitThinking("vector_search", {});

      // 🆕 PRIORITY 3: MSRA RAG query path with threshold parameter
      const defaultThreshold = 0.65;
      const lowThreshold = 0.45;
      
      let candidates = await findRelevantMSRASections(focusedText, 8, defaultThreshold);
      let loweredThreshold = false;
      totalInputTokens += 300; // embedding generation estimate

      // If no results, retry with lower threshold
      if (candidates.length === 0) {
        console.log(`⚠️ No chunks found at ${defaultThreshold} threshold, retrying at ${lowThreshold}...`);
        loweredThreshold = true;
        candidates = await findRelevantMSRASections(focusedText, 8, lowThreshold);
        
        if (candidates.length === 0) {
          console.log("⚠️ Still no chunks found, falling back to intrinsic knowledge");
          if (showThinking) {
            safeEmitThinking("complete", { loweredThreshold, noChunksFound: true });
          }
          await streamLLM([
            { role: "system", content: msraSystemPrompt },
            ...recentMessages,
            { role: "user", content: focusedText },
          ]);
          return;
        }
      }

      const avgSimilarity = candidates.length > 0 ? candidates.reduce((sum, c) => sum + (c.similarity || 0), 0) / candidates.length : 0;

      if (showThinking && candidates.length > 0) {
        const chunks = candidates.map((c, i) => ({
          id: `chunk-${i}`,
          source: c.topic,
          title: c.subtopic,
          similarity: c.similarity,
          content: c.content,
          text: c.content,
        }));

        safeEmitThinking("chunks_found", {
          chunks,
          count: chunks.length,
          avgSimilarity,
          loweredThreshold,
        });
      }

      if (showThinking) safeEmitThinking("reranking", {});

      const reranked = await rerankMSRASections(focusedText, candidates, 2);
      totalInputTokens += 400;
      totalOutputTokens += 50;

      // Map relevance flags
      const selectedIndices = new Set<number>();
      reranked.forEach((selected) => {
        const idx = candidates.findIndex((c) => c.topic === selected.topic && c.subtopic === selected.subtopic);
        if (idx !== -1) selectedIndices.add(idx);
      });

      const relevanceMap: Record<string, "RELEVANT" | "IRRELEVANT"> = {};
      candidates.forEach((_, i) => {
        relevanceMap[i.toString()] = selectedIndices.has(i) ? "RELEVANT" : "IRRELEVANT";
      });

      if (showThinking) {
        safeEmitThinking("relevance_evaluated", {
          relevanceMap,
          relevantCount: selectedIndices.size,
          totalCount: candidates.length,
        });
        safeEmitThinking("discarding_irrelevant", {
          discardCount: candidates.length - selectedIndices.size,
        });
      }

      // 🆕 PRIORITY 5: Removed chunk reasoning generation
      // Previously had: selectedWithReasoning with gpt-4.1-nano calls
      // Now we directly use the reranked chunks without generating reasoning

      if (showThinking) {
        const selectedChunks = reranked.map((s, i) => {
          const originalIdx = candidates.findIndex((c) => c.topic === s.topic && c.subtopic === s.subtopic);
          return {
            id: `chunk-${originalIdx}`,
            source: s.topic,
            title: s.subtopic,
            similarity: 0.95,
            isRelevant: true,
            content: s.content,
            text: s.content,
          };
        });

        safeEmitThinking("selected", {
          selectedChunks,
          selectionCount: selectedChunks.length,
        });
      }

      const context = reranked
        .map((s: any) => `**${s.topic} - ${s.subtopic}**\n${s.content}`)
        .join("\n\n");

      session.questionHistory.push({ q: text, a: "" });
      addToTopicHistory(session, reranked[0]?.topic || "MSRA Topic");
      await saveSessionMemory(sessionId, session, "msra", null);

      if (showThinking) safeEmitThinking("complete", { loweredThreshold });

      const messages = [
        { role: "system", content: msraSystemPrompt },
        ...recentMessages,
        { role: "user", content: focusedText },
        {
          role: "system",
          content: `Here are relevant sections from the MSRA study materials:\n\n${context}\n\nUse this information to provide an accurate, exam-focused response.`,
        },
      ];

      await streamLLM(messages);
      return;
    }

    // General query path (no RAG)
    await streamLLM([{ role: "system", content: msraSystemPrompt }, ...recentMessages, { role: "user", content: focusedText }]);
  } catch (err: any) {
    console.error("MSRA API Error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal Server Error", detail: err?.message || String(err) });
    } else {
      try {
        res.end();
      } catch {}
    }
  }
}