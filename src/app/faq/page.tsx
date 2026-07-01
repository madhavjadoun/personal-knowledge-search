"use client";

import AppShell from "@/components/app/AppShell";
import { useState } from "react";

const FAQ_ITEMS = [
  {
    q: "What file types are supported?",
    a: "Currently PDF documents are supported, including searchable and scanned PDFs."
  },
  {
    q: "How many questions can I generate?",
    a: "You can generate between 5 and 50 AI-generated multiple choice questions per quiz."
  },
  {
    q: "Are scanned PDFs supported?",
    a: "Yes. OCR is used to extract text from scanned documents."
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
    q: "Is QuizGenerator free?",
    a: "Yes. The application is available for educational purposes with a daily quiz generation limit."
  },
  {
    q: "Who developed this project?",
    a: "QuizGenerator was developed as a student project by Madhav Jadoun."
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
                className="w-full text-left px-6 py-4.5 flex justify-between items-start gap-4 hover:bg-[var(--bg-2)]/30 transition-colors cursor-pointer"
              >
                <div className="flex gap-3 text-sm font-bold text-[var(--text-1)]">
                  <span className="text-[var(--indigo)] select-none flex-shrink-0 w-5">0{idx + 1}</span>
                  <span>{item.q}</span>
                </div>
                <span className={`text-[var(--text-3)] transition-transform duration-200 mt-0.5 ${isOpen ? "rotate-180" : ""}`}>
                  ▼
                </span>
              </button>
              {isOpen && (
                <div className="pl-14 pr-6 pb-4.5 pt-1 text-xs font-semibold text-[var(--text-2)] leading-relaxed animate-in fade-in slide-in-from-top-1 duration-150">
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
