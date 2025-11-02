"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/router";
import AppLayout from "../components/AppLayout";
import MCQCard from "../components/MCQCard";
import ProgressRing from "../components/ProgressRing";
import { ChevronsUp } from "lucide-react";
import ChatbotMSRA from "../components/ChatbotMSRA";
import rawQuestions from "../data/msra_questions.json";

/* ---------- helpers ---------- */
const pickRandom = (arr, n) =>
  arr
    .map(v => ({ v, s: Math.random() }))
    .sort((a, b) => a.s - b.s)
    .slice(0, n)
    .map(o => o.v);

// cheap dataset fingerprint to detect bank/ordering changes
const makeFingerprint = (pool) => {
  const ids = pool.map(q => q.question_number ?? q.id ?? "").slice(0, 200);
  return `${pool.length}::${ids.join(",")}`;
};

/**
 * Local session storage keys
 * We keep answers + index in localStorage to allow refresh/resume.
 */
const sessionKey = (id) => `custom_session_${id}`;

/* ---------- NORMALISER (ensures sections exist + arrays → markdown bullets) ---------- */
const toMarkdown = (val) => {
  if (val == null) return "";
  if (Array.isArray(val)) {
    const items = val.map(v => String(v ?? "").trim()).filter(Boolean);
    return items.length ? items.map(v => `- ${v}`).join("\n") : "";
  }
  return String(val).trim();
};

const normaliseQuestion = (q) => {
  // Prefer native sections; otherwise wrap any flat "explanation" so normal mode renders.
  const src = q?.correct_answer_explanation_sections || (q?.explanation
    ? { explanation: String(q.explanation || "").trim() }
    : null);

  const normSections = src
    ? {
        explanation: toMarkdown(src.explanation),
        key_points: toMarkdown(src.key_points),
        clinical_relevance: toMarkdown(src.clinical_relevance),
        memory_anchor: toMarkdown(src.memory_anchor),
      }
    : null;

  return {
    ...q,
    correct_answer_explanation_sections: normSections
  };
};

/* ---------- Component ---------- */
export default function CustomQuizPage() {
  const router = useRouter();

  // ---------- URL params ----------
  const getParams = () => {
    if (typeof window === "undefined") return {};
    const params = new URLSearchParams(window.location.search);
    const rawCount = params.get("count");
    const parsedCount =
      rawCount != null && rawCount !== "" ? parseInt(rawCount, 10) : undefined;

    return {
      tags: params.get("tags") || "",
      mode: (params.get("mode") || "mcqs").toLowerCase(), // "mcqs" | "flashcards" | "mixed"
      count: Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : undefined,
      newSession: params.get("new") === "1" || params.get("new") === "true",
    };
  };

  // ---------- STATE ----------
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [bulletMode, setBulletMode] = useState(false);

  // guard rapid double-submits
  const lastAnswerTimeRef = useRef(0);

  // ---------- INITIALISE ----------
  useEffect(() => {
    const load = () => {
      if (typeof window === "undefined") return;

      const { tags, mode, count, newSession } = getParams();

      if (localStorage.getItem("custom-mode") === "bullet") setBulletMode(true);

      let sid = localStorage.getItem("custom-session-id");
      if (newSession) {
        localStorage.removeItem("custom-session-id");
        sid = null;
      }

      // Build pool
      const pool = Array.isArray(rawQuestions) ? rawQuestions : [];
      const poolFingerprint = makeFingerprint(pool);
      let filtered = pool;

      // ---- Tag filtering ----
      if (tags) {
        const rawTagStr = decodeURIComponent(tags).trim();
        const rawLower = rawTagStr.toLowerCase();

        let exact = pool.filter(
          (q) => q.subsection && q.subsection.toLowerCase() === rawLower
        );

        if (!exact.length) {
          const parts =
            rawTagStr.includes("(") && rawTagStr.includes(")")
              ? rawTagStr.slice(
                  rawTagStr.indexOf("(") + 1,
                  rawTagStr.lastIndexOf(")")
                )
              : rawTagStr;
          const lowers = parts
            .split(",")
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean);

          exact = pool.filter((q) => {
            const subHit =
              q.subsection &&
              lowers.some((tag) => q.subsection.toLowerCase().includes(tag));
            const catHit =
              q.category &&
              lowers.some((tag) => q.category.toLowerCase().includes(tag));
            const kwHit =
              Array.isArray(q.keywords) &&
              q.keywords.some((k) =>
                lowers.some((tag) => (k || "").toLowerCase().includes(tag))
              );
            return subHit || catHit || kwHit;
          });
        }
        filtered = exact.length ? exact : pool;
      }

      // Mode filter (MCQs vs flashcards)
      if (mode === "mcqs") filtered = filtered.filter((q) => !q.is_flashcard);
      if (mode === "flashcards") filtered = filtered.filter((q) => q.is_flashcard);

      if (!filtered.length) {
        filtered = pool.slice();
      }

      // Default to ALL filtered questions if count is missing/invalid
      const desiredCount = Number.isFinite(count) && count > 0 ? count : filtered.length;

      // ---- Resume gate: only resume if session matches dataset & is sensible ----
      const shouldResume = (existing) => {
        if (!existing) return false;

        if (existing.fingerprint !== poolFingerprint) return false;

        if (!Array.isArray(existing.questionIds) || existing.questionIds.length < 2)
          return false;

        if (desiredCount > existing.questionIds.length) return false;

        const poolIds = new Set(pool.map((q) => q.question_number));
        const overlap = existing.questionIds.filter((id) => poolIds.has(id));
        if (overlap.length < Math.min(2, existing.questionIds.length)) return false;

        return true;
      };

      const existing = sid
        ? JSON.parse(localStorage.getItem(sessionKey(sid)) || "null")
        : null;

      if (sid && shouldResume(existing)) {
        // Rebuild questions in saved order + NORMALISE
        const qs = pool
          .filter((q) => existing.questionIds.includes(q.question_number))
          .map((q) => {
            const prev = existing.answers?.find(
              (a) => a.questionId === q.question_number
            );
            const base = prev ? { ...q, user_answer: prev.selectedOption } : q;
            return normaliseQuestion(base);
          });

        setQuestions(qs);
        setAnswers(existing.answers || []);
        setCurrentIndex(existing.currentIndex || 0);
        setSessionId(sid);
        return;
      }

      // Fresh session
      const chosen = pickRandom(
        filtered,
        Math.min(desiredCount, filtered.length)
      );

      // NORMALISE chosen questions before setting (arrays → Markdown bullets)
      const normalised = chosen.map(normaliseQuestion);

      const newId =
        sid || (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2));

      const questionIds = normalised.map((q) => q.question_number);
      localStorage.setItem("custom-session-id", newId);
      localStorage.setItem(
        sessionKey(newId),
        JSON.stringify({
          id: newId,
          fingerprint: poolFingerprint,
          questionIds,
          answers: [],
          currentIndex: 0,
          desiredCount,
          createdAt: new Date().toISOString(),
        })
      );

      setSessionId(newId);
      setQuestions(normalised);
      setAnswers([]);
      setCurrentIndex(0);
    };

    load();
  }, []);

  // ---------- persistence ----------
  const persistSession = useCallback(
    (updatedAnswers, idx) => {
      if (!sessionId) return;
      const existing =
        JSON.parse(localStorage.getItem(sessionKey(sessionId)) || "null") || {};
      const questionIds =
        existing.questionIds ||
        (questions.length ? questions.map((q) => q.question_number) : []);
      const payload = {
        ...existing,
        id: sessionId,
        questionIds,
        answers: updatedAnswers,
        currentIndex: idx,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(sessionKey(sessionId), JSON.stringify(payload));
    },
    [sessionId, questions]
  );

  // ---------- end session ----------
  const endSessionAndReset = useCallback(() => {
    if (!sessionId) return;
    const existing = JSON.parse(
      localStorage.getItem(sessionKey(sessionId)) || "null"
    );
    if (existing) {
      localStorage.setItem(
        sessionKey(sessionId),
        JSON.stringify({
          ...existing,
          completed: true,
          updatedAt: new Date().toISOString(),
        })
      );
    }
    localStorage.removeItem("custom-session-id");
    router.push("/");
  }, [sessionId, router]);

  // ---------- navigation ----------
  const handlePrev = useCallback(() => {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  }, [currentIndex]);

  const handleNext = useCallback(() => {
    if (currentIndex + 1 < questions.length) setCurrentIndex((i) => i + 1);
    else endSessionAndReset();
  }, [currentIndex, questions.length, endSessionAndReset]);

  // ---------- answer handler ----------
  const handleAnswer = async (selectedOption, guessed = false) => {
    const now = Date.now();
    if (now - lastAnswerTimeRef.current < 300) return; // basic debounce
    lastAnswerTimeRef.current = now;

    if (!questions.length || sessionId == null) return;

    const q = questions[currentIndex];
    const correct = selectedOption === q.correct_answer;

    setAnswers((prev) => {
      const exists = prev.find((a) => a.questionId === q.question_number);
      const updated = exists
        ? prev.map((a) =>
            a.questionId === q.question_number
              ? { ...a, selectedOption, correct, guessed }
              : a
          )
        : [
            ...prev,
            { questionId: q.question_number, selectedOption, correct, guessed },
          ];

      // reflect UI
      setQuestions((curr) =>
        curr.map((qq) =>
          qq.question_number === q.question_number
            ? { ...qq, user_answer: selectedOption }
            : qq
        )
      );

      // persist locally
      persistSession(updated, currentIndex);

      return updated;
    });
  };

  // ---------- hotkeys ----------
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (
        t &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
      )
        return;

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          handlePrev();
          break;
        case "ArrowRight":
        case "Enter":
          e.preventDefault();
          handleNext();
          break;
        case "1":
        case "2":
        case "3":
        case "4":
        case "5": {
          e.preventDefault();
          const idx = parseInt(e.key, 10) - 1;
          const all = document.querySelectorAll(
            'button[role="option"], .answer-option, .mcq-option, .option-button, [data-testid*="option"]'
          );
          if (all[idx]) all[idx].click();
          break;
        }
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handlePrev, handleNext]);

  // ---------- loading guard ----------
  if (!questions.length) {
    return (
      <AppLayout>
        <div className="text-center p-10 text-gray-500">Loading your session…</div>
      </AppLayout>
    );
  }

  // ---------- derived ----------
  const q = questions[currentIndex];
  const answeredCount = answers.length;
  const correctSoFar = answers.filter((a) => a.correct).length;
  const percentCorrect = answeredCount
    ? Math.round((correctSoFar / answeredCount) * 100)
    : 0;

  // ---------- render ----------
  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center px-2 py-6 md:p-8 w-full">
        <div className="w-full flex justify-center">
          <div className="w-full max-w-7xl flex gap-8">
            {/* MCQ area */}
            <div className="w-full md:max-w-4xl">
              <MCQCard
                data={q}
                onAnswer={handleAnswer}
                onNext={handleNext}
                onPrev={handlePrev}
                questionNumber={currentIndex + 1}
                totalQuestions={questions.length}
                bulletMode={bulletMode}
              />
            </div>

            {/* Side controls */}
            <div className="hidden md:block w-44 flex-shrink-0">
              <div className="sticky top-24 w-44 space-y-4">
                <div
                  className="bg-white rounded-xl shadow-lg px-4 py-5"
                  style={{ minHeight: "240px" }}
                >
                  <h3 className="text-sm font-semibold text-gray-800 mb-3 text-center">
                    Your Session
                  </h3>
                  <div className="flex flex-col items-center">
                    <ProgressRing
                      percentage={percentCorrect}
                      currentQuestion={currentIndex + 1}
                      totalQuestions={questions.length}
                      chatbotActive={false}
                      chatbotExpanded={false}
                      className="relative flex flex-col items-center space-y-3"
                    />
                  </div>
                </div>

                <button
                  onClick={() => {
                    const newMode = !bulletMode;
                    setBulletMode(newMode);
                    localStorage.setItem(
                      "custom-mode",
                      newMode ? "bullet" : "normal"
                    );
                  }}
                  className={`w-full py-3 px-2 rounded-xl font-semibold transition-all text-sm ${
                    bulletMode
                      ? "bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg"
                      : "bg-gray-300 text-gray-700"
                  } hover:scale-105 hover:shadow-lg`}
                >
                  <div className="flex items-center justify-center gap-1">
                    <ChevronsUp className="h-4 w-4" />
                    Bullet Mode
                  </div>
                </button>

                <button
                  onClick={endSessionAndReset}
                  className="w-full py-3 px-2 rounded-xl bg-white text-red-500 border-2 border-red-500 font-semibold hover:bg-red-50 transition-all text-sm"
                >
                  End Session
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile controls */}
        <div className="mt-4 mb-20 w-full md:hidden px-2 space-y-3">
          <div className="bg-white rounded-xl shadow-md px-4 py-3 flex items-center justify-between">
            {/* Score Ring */}
            <div className="flex flex-col items-center">
              <div className="relative">
                <svg className="w-12 h-12 -rotate-90">
                  <circle cx="24" cy="24" r="20" stroke="#e5e7eb" strokeWidth="3" fill="none" />
                  <circle
                    cx="24" cy="24" r="20"
                    stroke={percentCorrect >= 70 ? "#10b981" : percentCorrect >= 50 ? "#f59e0b" : "#ef4444"}
                    strokeWidth="3" fill="none"
                    strokeDasharray={`${2 * Math.PI * 20}`}
                    strokeDashoffset={`${2 * Math.PI * 20 * (1 - percentCorrect / 100)}`}
                    className="transition-all duration-300"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xs font-bold text-gray-800">{percentCorrect}%</span>
                </div>
              </div>
              <span className="text-[10px] text-gray-500 mt-1">Score</span>
            </div>

            {/* Progress Ring */}
            <div className="flex flex-col items-center">
              <div className="relative">
                <svg className="w-12 h-12 -rotate-90">
                  <circle cx="24" cy="24" r="20" stroke="#e5e7eb" strokeWidth="3" fill="none" />
                  <circle
                    cx="24" cy="24" r="20"
                    stroke="#3b82f6" strokeWidth="3" fill="none"
                    strokeDasharray={`${2 * Math.PI * 20}`}
                    strokeDashoffset={`${2 * Math.PI * 20 * (1 - (currentIndex + 1) / questions.length)}`}
                    className="transition-all duration-300"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[10px] font-bold text-gray-800">
                    {currentIndex + 1}/{questions.length}
                  </span>
                </div>
              </div>
              <span className="text-[10px] text-gray-500 mt-1">Progress</span>
            </div>

            {/* Bullet Toggle */}
            <button
              onClick={() => {
                const newMode = !bulletMode;
                setBulletMode(newMode);
                localStorage.setItem("custom-mode", newMode ? "bullet" : "normal");
              }}
              className={`py-2 px-4 rounded-lg font-semibold transition-all text-sm ${
                bulletMode
                  ? "bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-md"
                  : "bg-gray-200 text-gray-700"
              } flex items-center gap-1`}
            >
              <ChevronsUp className="h-4 w-4" />
              <span>Bullet</span>
            </button>
          </div>

          <button
            onClick={endSessionAndReset}
            className="w-full py-3 rounded-xl bg-white text-red-500 border-2 border-red-500 font-semibold"
          >
            End Session
          </button>
        </div>

        {/* Chatbot */}
        <div className="chatbot-wrapper" style={{ position: "relative", zIndex: 10 }}>
          <ChatbotMSRA />
        </div>
      </div>
    </AppLayout>
  );
}
