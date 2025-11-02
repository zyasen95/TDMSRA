"use client";

import { useState, useEffect, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';

export default function MCQCard({ data, onAnswer, onNext, onPrev, questionNumber, totalQuestions, bulletMode }) {
  const [selected, setSelected] = useState(null);
  const [highlightedIndex, setHighlightedIndex] = useState(null);
  const [showSource, setShowSource] = useState(false); // <-- Collapsible source state

  // Always use data.user_answer as the initial selection for each question
  useEffect(() => {
    setSelected(data.user_answer || null);
    setHighlightedIndex(null);
    setShowSource(false); // <-- Collapse source on question change

    // ✅ Reset scroll position when moving to a new question
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [data.question_number, data.user_answer]);

  const handleSelect = (option) => {
    if (selected === null) {
      setSelected(option);
      onAnswer(option, false);
    }
  };

  const isCorrect = (option) => option === data.correct_answer;

  const explanationSections = useMemo(() => {
    if (!data.correct_answer_explanation_sections) return {};

    return {
      "Explanation": data.correct_answer_explanation_sections.explanation || "",
      "Key Points": data.correct_answer_explanation_sections.key_points || "",
      "Clinical Relevance": data.correct_answer_explanation_sections.clinical_relevance || "",
      "Memory Anchor": data.correct_answer_explanation_sections.memory_anchor || "",
    };
  }, [data.correct_answer_explanation_sections]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!selected) {
        if (e.key >= "1" && e.key <= "5") {
          const index = parseInt(e.key, 10) - 1;
          const option = data.options[index];
          if (option) {
            setHighlightedIndex(index);
            handleSelect(option);
          }
        }
      } else {
        if (e.key === "ArrowRight") {
          onNext();
        }
        if (e.key === "ArrowLeft") {
          onPrev();
        }
        if (e.key === "/") {
          e.preventDefault();
          const explanationSection = document.getElementById("explanation-section");
          if (explanationSection) {
            explanationSection.scrollIntoView({ behavior: "smooth" });
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [data, selected, onNext, onPrev]);

  // Custom markdown components for better table rendering
  const markdownComponents = {
    table: ({ children }) => (
      <div className="overflow-x-auto my-4">
        <table className="min-w-full divide-y divide-gray-300 border border-gray-300">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="bg-gray-50">
        {children}
      </thead>
    ),
    tbody: ({ children }) => (
      <tbody className="bg-white divide-y divide-gray-200">
        {children}
      </tbody>
    ),
    tr: ({ children }) => (
      <tr className="hover:bg-gray-50">
        {children}
      </tr>
    ),
    th: ({ children }) => (
      <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="px-3 py-2 text-sm text-gray-600 whitespace-nowrap">
        {children}
      </td>
    ),
  };

  return (
    <div className="relative w-full max-w-none md:max-w-4xl mx-auto p-4 sm:p-6 bg-white rounded-2xl shadow-md border">

      {/* Top Section: Arrows + Title + Category */}
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        {/* Left Arrow */}
        <button
          onClick={onPrev}
          className="bg-gray-100 p-1.5 sm:p-2 rounded-full hover:bg-gray-200"
        >
          <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5 text-gray-600" />
        </button>

        {/* Question Title */}
        <div className="text-lg sm:text-xl md:text-2xl font-bold text-gray-800 text-center flex-grow px-2">
          Question {questionNumber} {totalQuestions ? `of ${totalQuestions}` : ""}
        </div>

        {/* Right Arrow */}
        <button
          onClick={onNext}
          className="bg-gray-100 p-1.5 sm:p-2 rounded-full hover:bg-gray-200"
        >
          <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5 text-gray-600" />
        </button>

      </div>

      {/* Question Stem */}
      <div className="text-gray-800 text-sm sm:text-base md:text-md leading-relaxed mb-6 sm:mb-8 px-2 sm:px-0">
        {data.question}
      </div>

      {/* Options */}
      <div className="grid gap-3 sm:gap-4">
        {data.options.map((option, idx) => {
          let className = "p-3 sm:p-4 border rounded-xl cursor-pointer transition transform text-gray-800 text-sm sm:text-base";

          if (selected !== null) {
            if (isCorrect(option)) {
              className += " bg-green-300/40 border-green-400 text-green-900 font-semibold";
            } else if (selected === option) {
              className += " bg-red-300/40 border-red-400 text-red-900";
            } else {
              className += " opacity-50 text-gray-500";
            }
          } else {
            className += " hover:bg-gray-50 hover:scale-[1.02]";
          }

          if (highlightedIndex === idx) {
            className += " ring-2 ring-blue-400";
          }

          return (
            <div
              key={option}
              className={className}
              onClick={() => handleSelect(option)}
              role="option"
              data-testid={`option-${idx}`}
            >
              {selected && isCorrect(option) ? "✅ " : ""}
              {option}
            </div>
          );
        })}
      </div>

      {/* Explanation and Source */}
      {selected && (
        <>
          <div className="mt-6 sm:mt-8" id="explanation-section" data-explanation="true">
            {bulletMode ? (
              <div className="p-4 sm:p-6 rounded-xl text-gray-700">
                <h3 className="text-base sm:text-lg font-bold text-blue-700 mb-3 sm:mb-4">Bullet Explanation</h3>

                {/* Wrong answer bullet */}
                {selected !== data.correct_answer && (
                  <div className="mb-2 text-sm sm:text-base">
                    <p><span className="font-semibold">{selected}:</span> {data.bullet_explanations?.[selected]}</p>
                  </div>
                )}

                {/* Correct answer bullet */}
                <div className="text-sm sm:text-base">
                  <p><span className="font-semibold">{data.correct_answer}:</span> {data.bullet_explanations?.[data.correct_answer]}</p>
                </div>
              </div>
            ) : (
              <div className="p-4 sm:p-6 rounded-xl text-gray-700">
                {Object.entries(explanationSections).map(([title, content]) => {
                  if (!content) return null;
                  if (title === "Memory Anchor" && (content === "None available." || content.trim() === "")) {
                    return null;
                  }

                  return (
                    <section key={title} className="mb-4 sm:mb-6">
                      {title !== "Explanation" && (
                        <h2 className="text-base sm:text-lg font-bold text-gray-800 mb-2">{title}</h2>
                      )}
                      <div className="text-sm sm:text-base prose prose-sm sm:prose max-w-none">
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm]} 
                          rehypePlugins={[rehypeRaw]}
                          components={markdownComponents}
                        >
                          {String(content)}
                        </ReactMarkdown>
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </div>

          {/* Next Button */}
          <div className="mt-6 sm:mt-8 text-center sm:text-right">
            <button
              className="px-6 sm:px-8 py-2.5 sm:py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition font-semibold text-sm sm:text-base"
              onClick={onNext}
            >
              Next Question ➔
            </button>
          </div>
        </>
      )}

      {/* Responsive table styles */}
      <style jsx global>{`
        /* Mobile-optimized table styles */
        @media (max-width: 640px) {
          .prose table {
            font-size: 0.75rem;
          }
          
          .prose th,
          .prose td {
            padding: 0.5rem;
          }
        }

        /* Ensure tables are scrollable on mobile */
        .overflow-x-auto {
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin;
        }

        /* Style scrollbar for better visibility */
        .overflow-x-auto::-webkit-scrollbar {
          height: 6px;
        }

        .overflow-x-auto::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 3px;
        }

        .overflow-x-auto::-webkit-scrollbar-thumb {
          background: #888;
          border-radius: 3px;
        }

        .overflow-x-auto::-webkit-scrollbar-thumb:hover {
          background: #555;
        }

        /* Ensure proper text wrapping in markdown content */
        .prose {
          word-wrap: break-word;
          overflow-wrap: break-word;
        }

        /* Optimize list styling for mobile */
        @media (max-width: 640px) {
          .prose ul,
          .prose ol {
            padding-left: 1.5rem;
          }
          
          .prose li {
            margin-bottom: 0.25rem;
          }
        }
      `}</style>
    </div>
  );
}
