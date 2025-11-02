// components/ThinkingPanel.jsx - FALLBACK/LOW-COUNT HANDLING (safe, non-breaking)

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useMemo } from 'react';
import ChunkCard from './ChunkCard';

const STAGE_CONFIG = {
  idle: { label: 'Ready...', icon: '💤', color: 'text-slate-400' },
  classifying: { label: 'Classifying question...', icon: '🔍', color: 'text-blue-400' },
  classified: { label: 'Question type identified', icon: '✓', color: 'text-emerald-400' },
  searching: { label: 'Searching knowledge base...', icon: '📚', color: 'text-purple-400' },
  query_optimisation: { label: 'Optimising search query...', icon: '🎯', color: 'text-blue-400' },
  vector_search: { label: 'Vector similarity search...', icon: '🧮', color: 'text-purple-400' },
  chunks_found: { label: 'Found relevant chunks', icon: '📦', color: 'text-amber-400' },
  reranking: { label: 'Reranking for relevance...', icon: '⚖️', color: 'text-cyan-400' },
  relevance_evaluated: { label: 'Relevance evaluated', icon: '✓', color: 'text-emerald-400' },
  discarding_irrelevant: { label: 'Filtering results...', icon: '🗑️', color: 'text-amber-400' },
  selected: { label: 'Final selection complete', icon: '🎯', color: 'text-green-400' },
  complete: { label: 'Ready to respond', icon: '✅', color: 'text-emerald-500' },
};

// Steps (unchanged)
const LOADING_STEPS = [
  { key: 'question_type', label: 'Determining question type' },
  { key: 'optimise',      label: 'Optimising search query' },
  { key: 'search',        label: 'Searching for relevant chunks using vector similarity' },
  { key: 'embedding',     label: 'Generating embedding for search' },
];

const STAGE_ORDER = [
  'idle','classifying','classified','query_optimisation','searching','vector_search',
  'chunks_found','reranking','relevance_evaluated','discarding_irrelevant','selected','complete',
];

const stageIndex = (s) => {
  const i = STAGE_ORDER.indexOf(s);
  return i === -1 ? 0 : i;
};

// --- Subtle UI accents (no external deps; inline, minimal) ---
function GuruAugmentNotice({ lowered, count }) {
  return (
    <div className="mb-4 rounded-lg border border-cyan-400/20 bg-slate-800/60 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-sm">🧠</span>
        <p className="text-sm text-slate-200">
          {lowered
            ? 'Applied relaxed search threshold. Augmenting with intrinsic knowledge.'
            : 'Limited matches. Augmenting with intrinsic knowledge.'}
          {typeof count === 'number' && (
            <span className="text-slate-400"> ({count} chunk{count === 1 ? '' : 's'} found)</span>
          )}
        </p>
      </div>
    </div>
  );
}

function GuruFallbackPanel({ lowered }) {
  return (
    <div className="mt-6 rounded-xl border border-emerald-400/15 bg-slate-800/60 p-5">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-2xl">🧠</span>
        <h4 className="text-white font-semibold tracking-wide">
          Applying Guru intrinsic knowledge
        </h4>
      </div>
      <p className="text-sm text-slate-300 leading-relaxed">
        {lowered
          ? 'No close matches found even after a relaxed threshold. I’ll synthesise an evidence-based answer using medical priors and exam heuristics.'
          : 'No close matches found. I’ll synthesise an evidence-based answer using medical priors and exam heuristics.'}
      </p>
      <div className="mt-3 h-1 rounded bg-slate-700 overflow-hidden">
        <motion.div
          initial={{ x: '-100%' }}
          animate={{ x: ['-100%', '100%'] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
          className="h-full w-1/3 bg-gradient-to-r from-emerald-400/40 via-emerald-300/30 to-transparent"
        />
      </div>
    </div>
  );
}

export default function ThinkingPanel({ show, onClose, thinkingState }) {
  const [displayChunks, setDisplayChunks] = useState([]);
  const [chunkStates, setChunkStates] = useState({}); 
  const [showGlow, setShowGlow] = useState(false);
  const [chunksInitialized, setChunksInitialized] = useState(false);
  const [questionType, setQuestionType] = useState(null);

  const stage = thinkingState?.stage || 'idle';
  const chunks = thinkingState?.chunks || [];
  const selectedChunks = thinkingState?.selectedChunks || [];
  const selectedIds = useMemo(() => new Set(selectedChunks.map(c => c.id)), [selectedChunks]);

  // Optional hints from backend (safe if absent)
  const loweredThreshold = Boolean(thinkingState?.loweredThreshold || thinkingState?.relaxedSearch);
  const guruLabel = thinkingState?.guruLabel || 'Applying Guru intrinsic knowledge';

  // Track question type
  useEffect(() => {
    if (thinkingState?.questionType) setQuestionType(thinkingState.questionType);
  }, [thinkingState?.questionType]);

  // Mount chunks once, preserve order
  useEffect(() => {
    if (chunks.length > 0 && !chunksInitialized) {
      setDisplayChunks(chunks);
      setChunksInitialized(true);
      const initialStates = {};
      chunks.forEach((chunk) => { initialStates[chunk.id] = 'visible'; });
      setChunkStates(initialStates);
    }
  }, [chunks, chunksInitialized]);

  // Reset when closing
  useEffect(() => {
    if (!show) {
      setDisplayChunks([]);
      setChunkStates({});
      setShowGlow(false);
      setChunksInitialized(false);
      setQuestionType(null);
    }
  }, [show]);

  // Highlight selection quickly after chunks appear (visual only)
  useEffect(() => {
    if ((stage === 'relevance_evaluated' || stage === 'selected') && displayChunks.length > 0) {
      setChunkStates(prev => {
        const next = { ...prev };
        displayChunks.forEach((chunk) => {
          next[chunk.id] = selectedIds.has(chunk.id) ? 'selected' : 'dimmed';
        });
        return next;
      });
    }
  }, [stage, selectedIds, displayChunks.length]);

  // Subtle glow loop (unchanged cadence from previous tuned version)
  useEffect(() => {
    if (stage === 'selected' && selectedChunks.length > 0) {
      const t1 = setTimeout(() => {
        setShowGlow(true);
        const t2 = setTimeout(() => setShowGlow(false), 2200);
        return () => clearTimeout(t2);
      }, 400);
      return () => clearTimeout(t1);
    }
  }, [stage, selectedChunks.length]);

  const panelVariants = {
    hidden: { x: '-100%', opacity: 0, transition: { duration: 0.3, ease: 'easeInOut' } },
    visible: { x: 0, opacity: 1, transition: { duration: 0.4, ease: 'easeOut' } }
  };

  const currentStage = STAGE_CONFIG[stage] || STAGE_CONFIG.idle;

  const visibleChunks = displayChunks;
  const shouldShowScore = displayChunks.length > 0;

  // Active/complete logic for brighter steps (already tuned down elsewhere)
  const { isStepActive, isStepComplete } = useMemo(() => {
    const idx = stageIndex(stage);
    const active = (key) => {
      switch (key) {
        case 'question_type': return ['classifying','classified'].includes(stage);
        case 'optimise':      return stage === 'query_optimisation';
        case 'search':
        case 'embedding':     return ['searching','vector_search'].includes(stage);
        default:              return false;
      }
    };
    const complete = (key) => {
      switch (key) {
        case 'question_type': return idx >= stageIndex('classified');
        case 'optimise':      return idx >= stageIndex('query_optimisation');
        case 'search':
        case 'embedding':     return idx >= stageIndex('chunks_found');
        default:              return false;
      }
    };
    return { isStepActive: active, isStepComplete: complete };
  }, [stage]);

  // --- Fallback detection (non-breaking, pure UI) ---
  const searchConcluded =
    stageIndex(stage) >= stageIndex('reranking') ||
    stageIndex(stage) >= stageIndex('relevance_evaluated') ||
    stageIndex(stage) >= stageIndex('selected') ||
    stageIndex(stage) >= stageIndex('complete');

  const noChunksAtAll = (chunks.length === 0) && (displayChunks.length === 0);
  const fallbackActive = searchConcluded && noChunksAtAll;

  // Low-count augmentation notice (keeps normal rendering)
  const showAugmentNotice = !fallbackActive && (
    (loweredThreshold && (chunks.length > 0 || displayChunks.length > 0)) ||
    (displayChunks.length > 0 && displayChunks.length < 2) // tweak threshold if you like
  );

  return (
    <AnimatePresence>
      {show && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="fixed left-0 top-0 h-full w-[480px] bg-slate-900/95 backdrop-blur-md border-r border-slate-700 shadow-2xl z-50 overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-700/50">
              <div className="flex items-center gap-3">
                <motion.span
                  animate={{ 
                    rotate: ['searching','query_optimisation','vector_search','reranking'].includes(stage) ? 360 : 0 
                  }}
                  transition={{ 
                    duration: 2.6,
                    repeat: ['searching','query_optimisation','vector_search','reranking'].includes(stage) ? Infinity : 0, 
                    ease: "linear" 
                  }}
                  className="text-2xl"
                >
                  {currentStage.icon}
                </motion.span>
                <div>
                  <h3 className="text-lg font-bold text-white">Thinking Process</h3>
                  <p className={`text-sm ${currentStage.color} font-medium`}>{currentStage.label}</p>
                </div>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Stage Dots */}
            <div className="px-6 py-4 bg-slate-800/50">
              <div className="flex items-center gap-2">
                {Object.keys(STAGE_CONFIG).filter(s => s !== 'idle').map((stageKey, idx) => {
                  const stages = Object.keys(STAGE_CONFIG).filter(s => s !== 'idle');
                  const stageIdx = stages.indexOf(stage);
                  const isComplete = idx <= stageIdx;
                  const isCurrent = stageKey === stage;
                  return (
                    <div key={stageKey} className="flex items-center">
                      <motion.div
                        className={`w-2 h-2 rounded-full ${
                          isComplete ? 'bg-emerald-500' : 'bg-slate-600'
                        } ${isCurrent ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-slate-900' : ''}`}
                        animate={isCurrent ? { scale: [1, 1.2, 1] } : {}}
                        transition={{ duration: 2.0, repeat: Infinity }}
                      />
                      {idx < stages.length - 1 && (
                        <div className={`w-6 h-0.5 ${isComplete ? 'bg-emerald-500/40' : 'bg-slate-600'}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Main */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              {/* Fallback panel when search concluded but no chunks at all */}
              {fallbackActive && (
                <GuruFallbackPanel lowered={loweredThreshold} />
              )}

              {/* Loading Steps (only show if not in fallback and chunks not yet initialised) */}
              {!fallbackActive && !chunksInitialized && (
                <div className="space-y-16 mt-4">
                  {LOADING_STEPS.map((step, index) => {
                    const completed = isStepComplete(step.key);
                    const active = !completed && isStepActive(step.key);
                    const nextStepExists = index < LOADING_STEPS.length - 1;

                    return (
                      <motion.div
                        key={step.key}
                        initial={{ opacity: 0, x: -50 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 1.25, duration: 0.5 }}
                        className="relative flex items-start gap-6"
                      >
                        {/* Connector */}
                        {nextStepExists && (
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: (completed || active) ? '64px' : '0px' }}
                            transition={{ duration: 0.6, delay: completed ? 0.25 : 0 }}
                            className="absolute left-[18px] top-[32px] w-1 bg-gradient-to-b from-cyan-400 via-blue-500 to-transparent rounded-full"
                            style={{
                              boxShadow: active ? '0 0 14px rgba(34, 211, 238, 0.6)' : 'none'
                            }}
                          />
                        )}
                        
                        {/* Status dot (already tuned down) */}
                        <motion.div
                          className={`relative z-10 w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center ${
                            completed 
                              ? 'bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600' 
                              : active 
                              ? 'bg-gradient-to-br from-cyan-300 via-cyan-400 to-blue-500' 
                              : 'bg-slate-700 border-2 border-slate-600'
                          }`}
                          style={{
                            boxShadow: completed 
                              ? '0 0 6px rgba(16,185,129,0.35), 0 0 10px rgba(16,185,129,0.15)'
                              : active 
                              ? '0 0 6px rgba(34,211,238,0.35), 0 0 10px rgba(34,211,238,0.15)'
                              : 'none'
                          }}
                          animate={active ? { scale: [1, 1.05, 1] } : {}}
                          transition={{ duration: 2.4, repeat: active ? Infinity : 0, ease: 'easeInOut' }}
                        >
                          {completed && (
                            <motion.div
                              initial={{ scale: 0, rotate: -180 }}
                              animate={{ scale: 1, rotate: 0 }}
                              transition={{ type: 'spring', stiffness: 380, damping: 16, delay: 0.15 }}
                            >
                              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </motion.div>
                          )}
                          {active && (
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{ duration: 2.6, repeat: Infinity, ease: 'linear' }}
                              className="w-5 h-5 border-3 border-white border-t-transparent rounded-full"
                            />
                          )}
                        </motion.div>

                        {/* Step text (already toned down) */}
                        <div className="flex-1 pt-1">
                          <p
                            className={`text-lg font-bold leading-relaxed ${(completed || active) ? 'text-white' : 'text-slate-500'}`}
                            style={{
                              textShadow: active
                                ? '0 0 2px rgba(34,211,238,0.25), 0 0 4px rgba(34,211,238,0.15)'
                                : completed
                                ? '0 0 2px rgba(16,185,129,0.2), 0 0 3px rgba(16,185,129,0.1)'
                                : 'none'
                            }}
                          >
                            {step.label}
                            {step.key === 'question_type' && questionType && (
                              <motion.span 
                                initial={{ scale: 0, x: -20 }}
                                animate={{ scale: 1, x: 0 }}
                                transition={{ type: 'spring', stiffness: 280, damping: 22, delay: 0.25 }}
                                className="ml-3 px-3 py-1 rounded-md text-sm font-semibold bg-slate-800/60 text-emerald-300 uppercase tracking-wide border border-emerald-500/30"
                                style={{ boxShadow: '0 0 4px rgba(16,185,129,0.25)', letterSpacing: '0.05em' }}
                              >
                                {questionType}
                              </motion.span>
                            )}
                          </p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}

              {/* Augment notice (low-count or lowered threshold), above the chunk list */}
              {showAugmentNotice && (
                <GuruAugmentNotice lowered={loweredThreshold} count={displayChunks.length || chunks.length} />
              )}

              {/* Chunks (no reordering) */}
              {chunksInitialized && displayChunks.length > 0 && (
                <div className="flex flex-col gap-3">
                  {visibleChunks.map((chunk, index) => {
                    const state = chunkStates[chunk.id] || 'visible';
                    const isSelected = selectedIds.has(chunk.id);
                    const isDimmed = state === 'dimmed';
                    return (
                      <ChunkCard
                        key={chunk.id}
                        chunk={chunk}
                        isSelected={isSelected ? (showGlow ? 'glow' : true) : false}
                        isDimmed={isDimmed}
                        isRelevant={null}
                        showScore={shouldShowScore}
                        index={index}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-slate-700/50 p-4 bg-slate-800/50">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>
                  {fallbackActive ? (
                    <>
                      <span className="text-emerald-400 font-semibold">Guru mode</span>
                      <span className="ml-2 text-slate-300">No chunks available</span>
                    </>
                  ) : (displayChunks.length > 0 ? (
                    <>
                      {stage === 'selected' || stage === 'complete' ? (
                        <>
                          <span className="text-emerald-400 font-semibold">{selectedChunks.length}</span>
                          {' selected from '}
                          <span className="text-slate-300">{displayChunks.length}</span>
                          {' chunks'}
                        </>
                      ) : (
                        <>
                          <span className="text-slate-300 font-semibold">{displayChunks.length}</span>
                          {' chunks found'}
                        </>
                      )}
                    </>
                  ) : (
                    <span className="text-slate-300">Searching…</span>
                  ))}
                </span>

                {/* Subtle label when augmenting or fallback */}
                {(fallbackActive || showAugmentNotice) && (
                  <span className="text-cyan-300/80">{guruLabel}</span>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
