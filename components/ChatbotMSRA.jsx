// components/ChatbotMSRA.jsx - PATCHED (GURU branding, cleaner output, prominent Show thinking button)

"use client";

import { useState, useRef, useEffect } from "react";
import { GraduationCap, X, Send, ArrowDown, Maximize2, Minimize2, Brain } from 'lucide-react';
import ReactMarkdown from "react-markdown";
import remarkGfm from 'remark-gfm';
import DOMPurify from "dompurify";
import { motion } from "framer-motion";
import ThinkingPanel from './ThinkingPanel';

const thinkingMessages = ["Analysing question...", "Searching MSRA content...", "Preparing response..."];
const isLikelyHTML = (str) => /<\/?[a-z][\s\S]*>/i.test(str);

const PILL_DURATION = 150;
const CLOSE_DELAY = 150;

/** --- NEW: Gentle markdown cleanup to avoid over-bulleted and numbered titles --- */
const SECTION_TITLES = new Set([
  "Clinical relevance","Memory anchor","Key points","References","Summary","Red flags",
  "Explanation","Diagnosis","Management","Investigations","Investigation","Treatment",
  "Differential diagnosis","Prognosis","Epidemiology","Pathophysiology","Risk factors",
]);

function cleanBotText(raw) {
  if (!raw || typeof raw !== "string") return raw;

  // Early exit if it looks like raw HTML (handled by HTML branch)
  if (isLikelyHTML(raw)) return raw;

  // Normalise line endings
  let text = raw.replace(/\r\n/g, "\n");

  const lines = text.split("\n");
  const nonEmpty = lines.filter(l => l.trim().length > 0);
  const bulletish = nonEmpty.filter(l => /^\s*[-*•]\s+/.test(l)).length;
  // More aggressive threshold: remove bullets if more than 40% of lines have them
  const overBulleted = nonEmpty.length > 0 && (bulletish / nonEmpty.length) > 0.4;

  const out = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // If the whole answer is over-bulleted, remove leading bullets for paragraph lines
    if (overBulleted) {
      line = line.replace(/^\s*[-*•]\s+/, "");
    }
    
    // Always remove bullets from lines that start with bold text (section headers)
    if (/^\s*[-*•]\s+\*\*/.test(line)) {
      line = line.replace(/^\s*[-*•]\s+/, "");
    }

    // Strip leading single-number enumeration (common "1. Title" artefact)
    line = line.replace(/^\s*\d+\.\s+(.*)$/, "$1");

    // If a line starts with a bullet then a bold/section title, drop the bullet
    line = line.replace(/^\s*[-*•]\s+(\*\*[^*]+?\*\*:?\s*.*)$/, "$1");

    // If it's a "Title: body..." line, ensure body goes to next line and insert a blank line
    const m = line.match(/^\s*(\*\*?)([^*:\n]{3,80}?)(\*\*?)\s*:?\s*(.+)?$/);
    if (m) {
      const maybeTitle = m[2].trim();
      const isKnownTitle = SECTION_TITLES.has(maybeTitle.replace(/\s+/g, " "));
      // Also treat obvious title-cased lines ending with ":" as headings
      const looksLikeTitle = isKnownTitle || (/^[A-Z][A-Za-z /&+-]{2,}$/.test(maybeTitle) && /:\s*$/.test(line));
      if (isKnownTitle || looksLikeTitle) {
        // Normalise to bold title on its own line
        const body = (m[4] || "").trim();
        out.push(`**${maybeTitle}**:`);
        if (body) out.push(body);
        out.push(""); // blank line after section start
        continue;
      }
    }
    
    // Remove bullets from standalone sentences (complete thoughts with punctuation)
    if (/^\s*[-*•]\s+[A-Z][^.!?]*[.!?]\s*$/.test(line)) {
      line = line.replace(/^\s*[-*•]\s+/, "");
    }

    out.push(line);
  }

  // Ensure a clear gap after any bolded section header "**Title**:"
  let cleaned = out.join("\n")
    .replace(/(\*\*[^*]+?\*\*:\s*)\n(?!\n)/g, "$1\n\n") // force blank line after headers
    .replace(/\n{3,}/g, "\n\n"); // collapse excessive blank lines

  return cleaned.trim();
}

export default function MSRAChatbot() {
  const [morphStage, setMorphStage] = useState("closed");
  const [expanded, setExpanded] = useState(false);

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [thinkingIndex, setThinkingIndex] = useState(0);
  const [hasStartedResponse, setHasStartedResponse] = useState(false);

  // Thinking Panel State
  const [showThinking, setShowThinking] = useState(false);
  const [thinkingPanelOpen, setThinkingPanelOpen] = useState(false);
  const [thinkingState, setThinkingState] = useState({
    stage: 'idle',
    questionType: undefined,
    chunks: [],
    selectedChunks: [],
    avgSimilarity: 0,
    showScores: true,
  });

  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const inputRef = useRef(null);
  const controllerRef = useRef(null);

  const isOpen = morphStage === "pill" || morphStage === "open";

  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => setThinkingIndex((p) => (p + 1) % thinkingMessages.length), 2000);
    return () => clearInterval(interval);
  }, [loading]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === "Escape") closeChat(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen]);

  useEffect(() => {
    if (morphStage === "open") {
      window.dispatchEvent(new Event('msra-chatbot-opened'));
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [morphStage]);

  useEffect(() => {
    if (isAtBottom && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading, isAtBottom]);

  useEffect(() => {
    return () => {
      controllerRef.current?.abort?.();
    };
  }, []);

  const handleScroll = () => {
    if (!chatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    setIsAtBottom(scrollTop + clientHeight >= scrollHeight - 10);
  };

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  function openChat() {
    setMorphStage("pill");
    setTimeout(() => setMorphStage("open"), PILL_DURATION);
  }
  
  function closeChat() {
    setMorphStage("pill");
    setExpanded(false);
    setThinkingPanelOpen(false);
    window.dispatchEvent(new Event('msra-chatbot-collapsed'));
    setTimeout(() => { 
      setMorphStage("closed"); 
      window.dispatchEvent(new Event('msra-chatbot-closed')); 
    }, CLOSE_DELAY);
  }

  const parseSSEEvent = (chunk) => {
    const lines = chunk.split('\n');
    let eventType = null;
    let eventData = null;

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventType = line.substring(6).trim();
      } else if (line.startsWith('data:')) {
        try {
          eventData = JSON.parse(line.substring(5).trim());
        } catch (e) {
          // Not JSON, probably regular content
          return null;
        }
      }
    }

    if (eventType === 'thinking' && eventData) {
      return eventData;
    }
    return null;
  };

  const handleThinkingEvent = (event) => {
    const { stage, data } = event;
    
    switch (stage) {
      case 'classifying':
        setThinkingState(prev => ({ ...prev, stage: 'classifying' }));
        break;
        
      case 'classified':
        setThinkingState(prev => ({ 
          ...prev, 
          stage: 'classified',
          questionType: data.questionType 
        }));
        break;
        
      case 'searching':
        setThinkingState(prev => ({ ...prev, stage: 'searching' }));
        break;
        
      case 'chunks_found':
        setThinkingState(prev => ({ 
          ...prev, 
          stage: 'chunks_found',
          chunks: data.chunks || [],
          avgSimilarity: data.avgSimilarity || 0,
          showScores: (data.avgSimilarity || 0) > 0.65
        }));
        break;
        
      case 'reranking':
        setThinkingState(prev => ({ ...prev, stage: 'reranking' }));
        break;
        
      case 'selected':
        setThinkingState(prev => {
          // Update chunks with relevance info
          const updatedChunks = prev.chunks.map((chunk, i) => ({
            ...chunk,
            isRelevant: data.relevanceMap?.[i.toString()] === 'RELEVANT'
          }));
          
          // Add reasoning to relevant chunks
          const selectedChunks = data.selectedChunks || [];
          const chunksWithReasoning = updatedChunks.map(chunk => {
            const selected = selectedChunks.find(sc => 
              sc.source === chunk.source && sc.title === chunk.title
            );
            return selected ? { ...chunk, reasoning: selected.reasoning } : chunk;
          });
          
          return {
            ...prev,
            stage: 'selected',
            chunks: chunksWithReasoning,
            selectedChunks: selectedChunks
          };
        });
        break;
        
      case 'complete':
        setThinkingState(prev => ({ ...prev, stage: 'complete' }));
        break;
    }
  };

  const sendMessage = async () => {
    if (loading) return;
    if (!input.trim()) return;

    controllerRef.current?.abort?.();
    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const userMessage = { type: 'user', text: input };
      setMessages(prev => [...prev, userMessage]);
      setInput("");
      setLoading(true);
      setHasStartedResponse(false);

      // Always reset thinking state for new prompts
      // Close panel first to force a visual refresh
      setThinkingPanelOpen(false);
      
      setThinkingState({
        stage: 'idle',
        questionType: undefined,
        chunks: [],
        selectedChunks: [],
        avgSimilarity: 0,
        showScores: true,
      });
      
      // Only reopen the panel if user has enabled "Show thinking"
      // Small delay to ensure the close animation completes and state clears
      if (showThinking) {
        setTimeout(() => setThinkingPanelOpen(true), 50);
      }

      const response = await fetch("/api/MSRAChatbot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
        body: JSON.stringify({ 
          text: userMessage.text,
          showThinking: showThinking 
        }),
        signal: controller.signal,
        cache: "no-store",
        keepalive: false,
      });

      if (!response.ok || !response.body) throw new Error(`Server error: ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      setMessages(prev => [...prev, { type: 'bot', text: '' }]);
      setHasStartedResponse(true);

      let tempText = '';
      let lastChunkTs = Date.now();
      let buffer = '';

      while (true) {
        if (Date.now() - lastChunkTs > 35000) {
          controller.abort();
          throw new Error('Connection stalled. Partial answer shown.');
        }

        const result = await reader.read().catch((err) => {
          if (err?.name === 'AbortError') return { value: undefined, done: true };
          throw err;
        });
        
        const { value, done } = result;
        if (done) break;

        lastChunkTs = Date.now();
        const chunkValue = decoder.decode(value, { stream: true });
        if (!chunkValue) continue;

        // Check for SSE events
        if (showThinking && chunkValue.includes('event: thinking')) {
          buffer += chunkValue;
          const lines = buffer.split('\n\n');
          
          // Process complete events
          for (let i = 0; i < lines.length - 1; i++) {
            const event = parseSSEEvent(lines[i]);
            if (event) {
              handleThinkingEvent(event);
            }
          }
          
          // Keep incomplete event in buffer
          buffer = lines[lines.length - 1];
          continue;
        }

        // Regular content (stream)
        tempText += chunkValue;
        setMessages(prev => {
          const updated = [...prev];
          const last = updated.length - 1;
          if (updated[last]?.type === 'bot') {
            // --- NEW: clean formatting before rendering ---
            updated[last] = { ...updated[last], text: cleanBotText(tempText) };
          }
          return updated;
        });
      }

    } catch (error) {
      const msg = (error instanceof Error) ? error.message : 'Error connecting to server.';
      setMessages(prev => {
        const updated = [...prev];
        const last = updated.length - 1;
        if (updated[last]?.type === 'bot' && updated[last].text) {
          updated[last] = { ...updated[last], text: `${updated[last].text}\n\n*${msg}*` };
          return updated;
        }
        return [...prev, { type: 'bot', text: msg }];
      });
    } finally {
      setLoading(false);
      controllerRef.current = null;
    }
  };

  function BotMessage({ text }) {
    if (isLikelyHTML(text)) {
      const clean = DOMPurify.sanitize(text, {
        ALLOWED_TAGS: ["p","b","i","em","strong","ul","ol","li","br","span","h1","h2","h3","h4"],
        ALLOWED_ATTR: []
      });
      return <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: clean }} />;
    }

    const cleaned = cleanBotText(text);

    return (
      <div className="prose prose-sm max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({node, ...props}) => <p className="mb-3 last:mb-0" {...props} />, // more gap between paragraphs
            ul: ({node, ...props}) => <ul className="list-disc list-inside mb-2 space-y-1" {...props} />,
            ol: ({node, ...props}) => <ol className="list-decimal list-inside mb-2 space-y-1" {...props} />,
            li: ({node, ...props}) => <li className="text-sm leading-relaxed" {...props} />,
            strong: ({node, ...props}) => <strong className="font-bold text-emerald-600" {...props} />,
            em: ({node, ...props}) => <em className="italic text-gray-700" {...props} />,
            code: ({node, inline, ...props}) =>
              inline ? (
                <code className="px-1.5 py-0.5 bg-gray-100 text-emerald-600 rounded text-xs font-mono" {...props} />
              ) : (
                <code className="block p-3 bg-gray-100 text-gray-800 rounded-lg text-xs font-mono overflow-x-auto mb-2" {...props} />
              ),
            h1: ({node, ...props}) => <h1 className="text-lg font-bold mb-2 mt-4" {...props} />,
            h2: ({node, ...props}) => <h2 className="text-base font-bold mb-2 mt-3" {...props} />,
            h3: ({node, ...props}) => <h3 className="text-sm font-bold mb-2 mt-2" {...props} />,
            h4: ({node, ...props}) => <h4 className="text-sm font-semibold mb-1.5 mt-2" {...props} />,
          }}
        >
          {cleaned}
        </ReactMarkdown>
      </div>
    );
  }

  function getMorphClasses() {
    if (morphStage === "closed") return "w-20 h-20 rounded-full";
    if (morphStage === "pill") return "w-96 max-w-[calc(100vw-32px)] h-20 rounded-full";
    if (expanded) return "w-[calc(100vw-16px)] h-[calc(100vh-16px)] md:w-[90vw] md:h-[90vh] rounded-2xl md:rounded-3xl";
    return "w-96 max-w-[calc(100vw-16px)] h-[600px] max-h-[calc(100vh-100px)] md:h-[600px] rounded-2xl md:rounded-3xl";
  }
  
  const morphBg = (morphStage === "closed") ? "bg-gradient-to-br from-emerald-500 to-teal-500 border-white/20" : "bg-white border-emerald-300";
  const morphShadow = "shadow-2xl border-2 transition-all duration-200";

  return (
    <>
      <div id="msra-chatbot-root">
        <motion.div
          className={`fixed bottom-2 right-2 md:bottom-6 md:right-6 z-50 flex flex-col overflow-hidden ${getMorphClasses()} ${morphBg} ${morphShadow}`}
          style={{ maxHeight: expanded ? 'calc(100dvh - 16px)' : undefined }}
          animate={{ 
            x: 0, // Keep chatbot fixed - no shift
          }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          whileHover={morphStage === "closed" ? { scale: 1.05 } : {}}
          whileTap={morphStage === "closed" ? { scale: 0.95 } : {}}
          onClick={() => { if (morphStage === "closed") openChat(); }}
        >
          {/* Closed state */}
          {morphStage === "closed" && (
            <motion.div
              className="flex items-center justify-center w-full h-full"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2 }}
            >
              <GraduationCap className="h-10 w-10 text-white drop-shadow-sm" />
            </motion.div>
          )}

          {/* Pill state */}
          {morphStage === "pill" && (
            <motion.div
              className="flex items-center justify-center w-full h-full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex items-center gap-3 text-emerald-600">
                <GraduationCap className="h-6 w-6 animate-pulse" />
                <span className="font-medium">GURU</span>
              </div>
            </motion.div>
          )}

          {/* Open state */}
          {morphStage === "open" && (
            <motion.div
              className="flex flex-col h-full w-full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.3 }}
            >
              {/* Header */}
              <div className="flex justify-between items-center p-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold">
                <div className="flex items-center gap-2">
                  <GraduationCap className="h-5 w-5" />
                  <span>GURU</span>
                </div>
                <div className="flex items-center space-x-2">
                  {/* --- NEW: Prominent Show thinking button --- */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowThinking(prev => !prev);
                    }}
                    className={`px-3 py-1.5 rounded-md border transition-all focus:outline-none focus:ring-2 focus:ring-white/30 font-medium text-xs md:text-sm flex items-center gap-2 ${
                      showThinking
                        ? 'bg-white text-emerald-700 border-white/40 hover:bg-white/90'
                        : 'bg-white/20 text-white border-white/30 hover:bg-white/30'
                    }`}
                    aria-label="Toggle thinking visualisation"
                    title="Show Thinking Process"
                  >
                    <Brain className="h-4 w-4" />
                    {showThinking ? 'Hide thinking' : 'Show thinking'}
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpanded(prev => {
                        const next = !prev;
                        window.dispatchEvent(new Event(next ? 'msra-chatbot-expanded' : 'msra-chatbot-collapsed'));
                        return next;
                      });
                    }}
                    className="p-1 hover:bg-white/20 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-white/30"
                    aria-label={expanded ? "Minimise" : "Maximise"}
                  >
                    {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); closeChat(); }}
                    className="p-1 hover:bg-white/20 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-white/30"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div
                ref={chatContainerRef}
                onScroll={handleScroll}
                className="flex-1 p-4 space-y-4 overflow-y-auto text-sm bg-gray-50/50"
              >
                {messages.map((msg, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className={`p-3 rounded-2xl shadow-sm transition-all duration-300 ${
                      msg.type === 'user'
                        ? 'max-w-[80%] ml-auto bg-emerald-500 text-white'
                        : 'w-full bg-white text-gray-800 border border-gray-100'
                    }`}
                  >
                    {msg.type === "bot" ? <BotMessage text={msg.text} /> : <div>{msg.text}</div>}
                  </motion.div>
                ))}

                {loading && !hasStartedResponse && (
                  <div className="flex items-center justify-center py-4 pointer-events-none select-none outline-none focus:outline-none focus:ring-0 ring-0">
                    <span className="text-sm text-gray-500 [animation:fade_1.6s_ease-in-out_infinite]">
                      {thinkingMessages[thinkingIndex]}
                    </span>
                    <style jsx>{`
                      @keyframes fade { 0%,100% { opacity: .7 } 50% { opacity: 1 } }
                    `}</style>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Scroll to bottom button */}
              {!isAtBottom && (
                <motion.div
                  className="absolute bottom-20 left-1/2 transform -translate-x-1/2"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                >
                  <button
                    onClick={scrollToBottom}
                    className="p-2 bg-white rounded-full border border-emerald-200 hover:bg-emerald-50 transition-all shadow-lg hover:shadow-xl"
                    aria-label="Scroll to bottom"
                  >
                    <ArrowDown className="h-4 w-4 text-emerald-500" />
                  </button>
                </motion.div>
              )}

              {/* Input area */}
              <div className="flex items-center p-3 md:p-4 border-t border-gray-200 bg-white">
                <input
                  ref={inputRef}
                  className="flex-1 p-2.5 md:p-3 rounded-full bg-gray-50 border border-gray-200 text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition-all"
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask GURU about MSRA scenarios..."
                  onKeyDown={(e) => e.key === 'Enter' && !loading && sendMessage()}
                  style={{ fontSize: '16px' }}
                />
                <button
                  onClick={sendMessage}
                  disabled={loading || !input.trim()}
                  className="ml-2 md:ml-3 p-2.5 md:p-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 disabled:from-gray-300 disabled:to-gray-300 text-white rounded-full transition-all duration-200 hover:scale-105 disabled:scale-100 shadow-md hover:shadow-lg flex items-center justify-center"
                  aria-label="Send"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>

      {/* Thinking Panel */}
      <ThinkingPanel
        key={messages.length}
        show={thinkingPanelOpen}
        onClose={() => setThinkingPanelOpen(false)}
        thinkingState={thinkingState}
      />
    </>
  );
}