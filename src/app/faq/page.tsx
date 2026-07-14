"use client";

import AppShell from "@/components/app/AppShell";
import { useState } from "react";

const FAQ_ITEMS = [
  {
    q: "What file types and study inputs are supported?",
    a: "You can upload PDF documents, scanned textbook images, whiteboard screenshots (PNG, JPG, JPEG), or directly paste your copy-pasted text notes."
  },
  {
    q: "Which quiz formats can I create?",
    a: "QuizGens supports Multiple Choice Questions (MCQs), True/False evaluations, and sentence Fill in the Blanks formats."
  },
  {
    q: "How many questions can I generate?",
    a: "You can customize your desired number of questions in your settings page or directly in the chat generation window."
  },
  {
    q: "Are scanned documents and screenshots supported?",
    a: "Yes. Advanced OCR scanner models extract text from scanned worksheets, photos of notes, and presentation slides."
  },
  {
    q: "Which AI model is used?",
    a: "Quiz generation is powered by Google's Gemini API."
  },
  {
    q: "Is my data secure?",
    a: "Yes. Documents, quizzes and history are securely stored using Supabase."
  },
  {
    q: "Can I delete my documents?",
    a: "Yes. Documents and related quiz history can be removed from your account."
  },
  {
    q: "Why are some AI questions incorrect?",
    a: "AI-generated questions are automatically created from document content and may occasionally contain inaccuracies. Please verify important answers from your source material."
  },
  {
    q: "Is QuizGens free?",
    a: "Yes. The application is available for educational purposes with a daily quiz generation limit."
  },
  {
    q: "Who developed this project?",
    a: "QuizGens was developed as a student project by Madhav Jadoun."
  }
];

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <AppShell title="FAQ" subtitle="Frequently Asked Questions" publicPage={true} noSidebar={true}>
      <div className="max-w-3xl mx-auto space-y-4">
        {FAQ_ITEMS.map((item, idx) => {
          const isOpen = openIndex === idx;
          return (
            <div 
              key={idx}
              className="glass-card rounded-xl overflow-hidden transition-all duration-200"
            >
              <button
                onClick={() => setOpenIndex(isOpen ? null : idx)}
                className="w-full text-left px-4 sm:px-6 py-4 flex justify-between items-start gap-3 sm:gap-4 hover:bg-[var(--bg-2)]/30 transition-colors cursor-pointer"
              >
                <div className="flex gap-3 text-sm font-bold text-[var(--text-1)] min-w-0 flex-1">
                  <span className="text-[var(--indigo)] select-none flex-shrink-0 w-5">
                    {idx + 1 < 10 ? `0${idx + 1}` : idx + 1}
                  </span>
                  <span className="break-words">{item.q}</span>
                </div>
                <span className={`text-[var(--text-3)] transition-transform duration-200 mt-0.5 ${isOpen ? "rotate-180" : ""}`}>
                  ▼
                </span>
              </button>
              {isOpen && (
                <div className="pl-10 sm:pl-14 pr-4 sm:pr-6 pb-4.5 pt-1 text-xs font-semibold text-[var(--text-2)] leading-relaxed break-words animate-in fade-in slide-in-from-top-1 duration-150">
                  {item.a}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
