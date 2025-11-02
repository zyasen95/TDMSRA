// lib/animationConfig.js - Centralized animation timing config

export const ANIMATION_TIMING = {
    // Chunk card entrance
    cardEntrance: {
      duration: 0.3,
      stagger: 0.05,
      maxDelay: 0.6,
    },
    
    // Reranking movement
    rerank: {
      duration: 0.7,
      ease: 'easeInOut',
    },
    
    // Dimming irrelevant
    dim: {
      duration: 0.4,
      ease: 'easeOut',
    },
    
    // Discard/fly-off
    discard: {
      duration: 0.9,
      ease: [0.4, 0.0, 0.2, 1], // Custom ease for smooth exit
    },
    
    // Selection highlight
    select: {
      duration: 0.35,
      ease: 'easeOut',
    },
    
    // Glow/flash effect
    glow: {
      duration: 0.8,
      repeat: 1,
      ease: 'easeInOut',
    },
    
    // Similarity bar fill
    similarityBar: {
      duration: 0.9,
      ease: [0.4, 0.0, 0.2, 1],
    },
  };
  
  export const SPRING_CONFIGS = {
    // For layout animations (reordering)
    layout: {
      type: 'spring',
      stiffness: 300,
      damping: 30,
    },
    
    // For bouncy effects
    bouncy: {
      type: 'spring',
      stiffness: 400,
      damping: 25,
    },
  };