// lib/sessionMemory.ts - Enhanced with mode and RAG caching (backward compatible)

import { supabaseAdmin } from "../utils/supabase-admin";

export interface SessionMemory {
  questionHistory: Array<{ q: string; a: string }>;
  topicHistory: string[];
  currentFocus: string | null;
  
  // 🆕 Optional additions for multi-mode system
  mode?: "teaching" | "informative" | "socratic";
  ragCache?: {
    topic: string;
    chunks: any[];
    cachedAt: string;
    expiresAt: string;
  };
}

export async function getSessionMemory(
  sessionId: string,
  botType: string = 'mrcs' // default to mrcs for backwards compatibility
): Promise<SessionMemory> {
  const { data, error } = await supabaseAdmin
    .from("session_memory")
    .select("data")
    .eq("session_id", sessionId)
    .eq("bot_type", botType)
    .single();

  if (error || !data) {
    return { 
      questionHistory: [], 
      topicHistory: [], 
      currentFocus: null,
      mode: "teaching" // Default mode for new sessions
    };
  }

  // Return existing data with optional new fields
  const sessionData = data.data as SessionMemory;
  return {
    ...sessionData,
    mode: sessionData.mode || "teaching" // Ensure mode exists
  };
}

export async function saveSessionMemory(
  sessionId: string,
  session: SessionMemory,
  botType: string = 'mrcs',
  userId?: string | null
): Promise<void> {
  const payload: any = {
    session_id: sessionId,
    bot_type: botType,
    data: session,
    updated_at: new Date().toISOString(),
  };

  if (userId) {
    payload.user_id = userId;
  }

  const { error } = await supabaseAdmin
    .from("session_memory")
    .upsert(payload, {
      onConflict: "session_id,bot_type",
    });

  if (error) {
    console.error("❌ Session save error:", error);
  }
}

export function addToTopicHistory(session: SessionMemory, topic: string) {
  if (!session.topicHistory.includes(topic)) {
    session.topicHistory.push(topic);
  }
}

export function saveFinalAnswerToSession(session: SessionMemory, answer: string) {
  if (session.questionHistory.length > 0) {
    session.questionHistory[session.questionHistory.length - 1].a = answer;
  }
}

// 🆕 Additional helper functions for RAG cache management

/**
 * Clear RAG cache manually (useful for testing or maintenance)
 */
export function clearRagCache(session: SessionMemory): void {
  if (session.ragCache) {
    delete session.ragCache;
    console.log("🗑️ Manually cleared RAG cache");
  }
}

/**
 * Get cache statistics for debugging
 */
export function getRagCacheStats(session: SessionMemory): {
  hasCache: boolean;
  topic?: string;
  chunkCount?: number;
  age?: number;
  expiresIn?: number;
} {
  if (!session.ragCache) {
    return { hasCache: false };
  }

  const now = new Date();
  const cachedAt = new Date(session.ragCache.cachedAt);
  const expiresAt = new Date(session.ragCache.expiresAt);
  
  return {
    hasCache: true,
    topic: session.ragCache.topic,
    chunkCount: session.ragCache.chunks.length,
    age: now.getTime() - cachedAt.getTime(), // milliseconds
    expiresIn: expiresAt.getTime() - now.getTime(), // milliseconds
  };
}