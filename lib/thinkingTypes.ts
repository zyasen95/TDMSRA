// lib/thinkingTypes.ts

export type ThinkingStage = 
  | 'idle'
  | 'classifying'
  | 'searching'
  | 'chunks_found'
  | 'reranking'
  | 'selected'
  | 'complete';

export interface ChunkData {
  id: string;
  source: string;
  title: string;
  similarity: number;
  isRelevant?: boolean;
  reasoning?: string;
}

export interface ThinkingEvent {
  stage: ThinkingStage;
  data?: {
    questionType?: 'clinical' | 'professional';
    chunks?: ChunkData[];
    count?: number;
    avgSimilarity?: number;
    selectedChunks?: ChunkData[];
    discardedChunks?: ChunkData[];
    relevanceMap?: Record<string, 'RELEVANT' | 'IRRELEVANT'>;
  };
}

export interface ThinkingState {
  stage: ThinkingStage;
  questionType?: 'clinical' | 'professional';
  chunks: ChunkData[];
  selectedChunks: ChunkData[];
  avgSimilarity: number;
  showScores: boolean;
}