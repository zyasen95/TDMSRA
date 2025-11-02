// components/ChunkCard.jsx - TUNED DIM (subtle) & stable glow overlay

import { motion } from 'framer-motion';
import { memo, useMemo, useState } from 'react';
import { ANIMATION_TIMING } from '@/lib/animationConfig';

const clamp01 = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
};

const sourceTheme = {
  'NICE CKS': { icon: '📘', ring: 'ring-sky-400', badge: 'text-sky-300' },
  'BNF':      { icon: '📗', ring: 'ring-emerald-400', badge: 'text-emerald-300' },
  'GMC':      { icon: '📜', ring: 'ring-amber-400', badge: 'text-amber-300' },
  'SIGN':     { icon: '📙', ring: 'ring-orange-400', badge: 'text-orange-300' },
  'DEFAULT':  { icon: '📚', ring: 'ring-slate-400', badge: 'text-slate-300' },
};

function RawChunkCard({ chunk, isSelected, isDimmed, showScore, index = 0 }) {
  const [showReasoning, setShowReasoning] = useState(false);

  // --- Defensive parsing of props ---
  const { source, title, similarity, reasoning, preview } = useMemo(() => {
    const src = typeof chunk?.source === 'string' && chunk.source.trim() ? chunk.source.trim() : 'DEFAULT';
    const ttl =
      (typeof chunk?.title === 'string' && chunk.title) ||
      (typeof chunk?.subtopic === 'string' && chunk.subtopic) ||
      (typeof chunk?.topic_title === 'string' && chunk.topic_title) ||
      'Untitled';
    const sim = clamp01(chunk?.similarity ?? chunk?.score ?? 0.8);
    const rawText =
      (typeof chunk?.content === 'string' && chunk.content) ||
      (typeof chunk?.text === 'string' && chunk.text) ||
      '';
    const prev = rawText.slice(0, 240);
    const reas = typeof chunk?.reasoning === 'string' ? chunk.reasoning : '';

    return { source: src, title: ttl, similarity: sim, reasoning: reas, preview: prev };
  }, [chunk]);

  const theme = sourceTheme[source] || sourceTheme.DEFAULT;
  const percentStr = `${Math.round(similarity * 100)}%`;
  const widthPct = `${Math.round(similarity * 100)}%`;

  // --- Variants (no discard; dim is very subtle) ---
  const variants = {
    initial: { opacity: 0, y: 18, scale: 0.95 },
    animate: {
      opacity: 1, y: 0, scale: 1,
      transition: { 
        delay: Math.min(index * ANIMATION_TIMING.cardEntrance.stagger, ANIMATION_TIMING.cardEntrance.maxDelay),
        duration: ANIMATION_TIMING.cardEntrance.duration,
      },
    },
    dimmed: {
      opacity: 0.85,          // was ~0.35 → subtle
      scale: 0.995,           // nearly full size
      filter: 'grayscale(0.15)', // very light desat
      transition: {
        duration: ANIMATION_TIMING.dim.duration,
        ease: ANIMATION_TIMING.dim.ease,
      },
    },
    selected: {
      scale: 1.0,
      opacity: 1,
      filter: 'grayscale(0)',
      transition: { 
        duration: ANIMATION_TIMING.select.duration,
        ease: ANIMATION_TIMING.select.ease,
      },
    },
  };

  // Treat 'glow' as selected for the base card to avoid variant swaps that can flicker.
  const animationState = isDimmed ? 'dimmed' : (isSelected ? 'selected' : 'animate');

  // Border/ring styling (keep vivid for selected; normal for dimmed)
  const borderClass = (() => {
    if (isSelected && isSelected !== 'glow') return 'border-emerald-500 ring-2 ring-emerald-500/50 shadow-emerald-500/20 shadow-lg';
    if (isDimmed) return 'border-slate-700'; // less faded border to keep presence
    return 'border-slate-700';
  })();

  const bgClass = (isSelected && isSelected !== 'glow') ? 'bg-emerald-950/40' : 'bg-slate-800/50';

  return (
    <motion.div
      variants={variants}
      initial="initial"
      animate={animationState}
      className={[
        'relative rounded-xl p-3.5 border-2 backdrop-blur-sm',
        bgClass,
        borderClass,
        'transition-colors duration-300',
        'cursor-pointer',
        'will-change-transform will-change-opacity',
      ].join(' ')}
      onHoverStart={() => setShowReasoning(true)}
      onHoverEnd={() => setShowReasoning(false)}
      style={{ transform: 'translateZ(0)' }}
    >
      {/* Glow overlay (kept stable; card itself has no box-shadow animation) */}
      {isSelected === 'glow' && (
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-emerald-400/50"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          style={{ boxShadow: '0 0 28px rgba(16,185,129,0.45)' }} // slightly reduced from 36px
        />
      )}

      {/* Header: source + icon */}
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-lg leading-none">{theme.icon}</span>
        <span className={`text-xs font-semibold ${isSelected ? 'text-emerald-300' : theme.badge}`}>
          {source === 'DEFAULT' ? 'Source' : source}
        </span>
      </div>

      {/* Title */}
      <div className={`text-xs font-medium mb-2 line-clamp-2 ${isSelected ? 'text-emerald-50' : 'text-slate-200'}`}>
        {title}
      </div>

      {/* Preview */}
      {preview && (
        <div className={`text-[11px] mb-2 line-clamp-3 ${isSelected ? 'text-emerald-200/80' : 'text-slate-400'}`}>
          {preview}
        </div>
      )}

      {/* Similarity bar */}
      {showScore && (
        <div className="flex items-center gap-2 mb-1.5">
          <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <motion.div
              className={isSelected ? 'h-full bg-emerald-400' : 'h-full bg-slate-400'}
              initial={{ width: 0 }}
              animate={{ width: widthPct }}
              transition={{ 
                duration: ANIMATION_TIMING.similarityBar.duration,
                delay: Math.min(index * ANIMATION_TIMING.cardEntrance.stagger, ANIMATION_TIMING.cardEntrance.maxDelay),
                ease: ANIMATION_TIMING.similarityBar.ease,
              }}
              style={{ minWidth: 0, willChange: 'width' }}
            />
          </div>
          <span className={`text-[10px] font-mono ${isSelected ? 'text-emerald-300' : 'text-slate-400'}`}>
            {percentStr}
          </span>
        </div>
      )}

      {/* Selected checkmark badge */}
      {isSelected && isSelected !== 'glow' && (
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 25 }}
          className="absolute -top-2 -right-2 w-7 h-7 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/50"
        >
          <span className="text-white text-sm font-bold">✓</span>
        </motion.div>
      )}

      {/* Reasoning tooltip on hover (only for selected) */}
      {showReasoning && reasoning && isSelected && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.2 }}
          className="absolute left-0 right-0 top-full mt-2 p-3 bg-slate-900/98 border-2 border-emerald-500/50 rounded-lg shadow-2xl z-10"
        >
          <div className="text-[11px] text-emerald-400 font-semibold mb-1.5 flex items-center gap-1.5">
            <span>✨</span><span>Why this was chosen</span>
          </div>
          <div className="text-[11px] text-slate-300 leading-relaxed">{reasoning}</div>
        </motion.div>
      )}
    </motion.div>
  );
}

export default memo(RawChunkCard);
