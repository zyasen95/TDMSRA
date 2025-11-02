"use client";

import { useEffect, useState } from "react";

function SmallRing({ value, label, color }) {
  const [offset, setOffset] = useState(0);

  const size = 120;
  const strokeWidth = 10;
  const center = size / 2;
  const radius = center - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    const progressOffset = ((100 - value) / 100) * circumference;
    setOffset(progressOffset);
  }, [value, circumference]);

  return (
    <div className="relative w-32 h-32">
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
      >
        <circle
          stroke="#e5e7eb"
          fill="transparent"
          strokeWidth={strokeWidth}
          r={radius}
          cx={center}
          cy={center}
        />
        <circle
          stroke={color}
          fill="transparent"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          r={radius}
          cx={center}
          cy={center}
          className="transition-all duration-300"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-lg font-bold text-gray-800">{value}%</span>
        <span className="text-xs text-gray-500">{label}</span>
      </div>
    </div>
  );
}

export default function ProgressRing({ percentage, currentQuestion, totalQuestions, chatbotActive, chatbotExpanded, className }) {
  const [offset, setOffset] = useState(0);

  const size = 120;
  const strokeWidth = 10;
  const center = size / 2;
  const radius = center - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;

  const questionProgress = Math.round((currentQuestion / totalQuestions) * 100);

  useEffect(() => {
    const progressOffset = ((100 - percentage) / 100) * circumference;
    setOffset(progressOffset);
  }, [percentage, circumference]);

  if (chatbotExpanded) {
    return null; // 👈 if DISSECT is expanded fullscreen, hide all rings
  }

  if (chatbotActive) {
    const container = className || "fixed top-14 right-4.5 bg-white/80 backdrop-blur-md shadow-lg rounded-full p-4 z-50";
    // Chatbot open (small) → show full original single big ring
    return (
      <div className={container}>
        <svg
          width={size}
          height={size}
          className="transform -rotate-90"
        >
          <circle
            stroke="#e5e7eb"
            fill="transparent"
            strokeWidth={strokeWidth}
            r={radius}
            cx={center}
            cy={center}
          />
          <circle
            stroke="#10b981"
            fill="transparent"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            r={radius}
            cx={center}
            cy={center}
            className="transition-all duration-300"
          />
        </svg>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
          <span className="text-lg font-bold text-gray-800">{currentQuestion}</span>
          <span className="text-xs text-gray-500">{percentage}% Correct</span>
        </div>
      </div>
    );
  } else {
    const container = className || "fixed top-18 right-6 flex flex-col items-center space-y-4 z-50";
    // Chatbot closed → show two mini rings
    return (
      <div className={container}>
        <SmallRing value={percentage} label="Correct" color="#10b981" />
        <SmallRing value={questionProgress} label="Done" color="#3b82f6" />
      </div>
    );
  }
}
