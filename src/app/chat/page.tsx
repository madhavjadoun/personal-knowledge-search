"use client";

import { useState, useEffect } from "react";
import AppShell from "@/components/app/AppShell";
import { supabase } from "@/lib/supabase";
import OrbitLoader from "@/components/app/OrbitLoader";

interface MCQQuestion {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

interface DocumentItem {
  id: string;
  title: string;
}

export default function QuizPage() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>("");
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);
  const [questions, setQuestions] = useState<MCQQuestion[]>([]);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch user's documents on mount
  useEffect(() => {
    async function fetchDocs() {
      try {
        setLoadingDocs(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: dbDocs, error } = await supabase
          .from("documents")
          .select("id, title")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (error) throw error;
        setDocuments(dbDocs || []);
        if (dbDocs && dbDocs.length > 0) {
          setSelectedDocId(dbDocs[0].id);
        }
      } catch (err) {
        console.error("Failed to load documents:", err);
        setErrorMsg("Failed to load documents. Please check your connection.");
      } finally {
        setLoadingDocs(false);
      }
    }

    fetchDocs();
  }, []);

  // Trigger quiz generation from selected PDF
  const handleGenerateQuiz = async () => {
    if (!selectedDocId) return;
    setGeneratingQuiz(true);
    setErrorMsg(null);
    setQuestions([]);
    setUserAnswers({});
    setSubmitted(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/answer", {
        method: "POST",
        headers,
        body: JSON.stringify({ documentId: selectedDocId }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Quiz generation failed.");
      }

      setQuestions(data.questions);
    } catch (err) {
      console.error("Quiz error:", err);
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setGeneratingQuiz(false);
    }
  };

  const handleSelectOption = (qIdx: number, option: string) => {
    if (submitted) return;
    setUserAnswers((prev) => ({
      ...prev,
      [qIdx]: option,
    }));
  };

  const handleSubmitQuiz = () => {
    // Calculate score
    let correctCount = 0;
    questions.forEach((q, idx) => {
      if (userAnswers[idx] === q.correctAnswer) {
        correctCount++;
      }
    });
    setScore(correctCount);
    setSubmitted(true);
  };

  return (
    <AppShell title="Quiz Generator" subtitle="Generate MCQ quizzes directly from your uploaded PDF notes">
      <div className="max-w-4xl mx-auto space-y-6 pb-12">
        {/* Setup Card */}
        <div className="glass-card rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-bold text-[var(--text-1)]">Configure Your Quiz</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-4)]">Select Document</label>
              {loadingDocs ? (
                <div className="h-10.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] animate-pulse flex items-center px-3 text-sm text-[var(--text-4)]">
                  Loading documents...
                </div>
              ) : documents.length === 0 ? (
                <div className="h-10.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] flex items-center px-3 text-sm text-[var(--text-4)]">
                  No documents found. Please upload a PDF first in Documents.
                </div>
              ) : (
                <select
                  value={selectedDocId}
                  onChange={(e) => setSelectedDocId(e.target.value)}
                  className="w-full h-10.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-2)] focus:outline-none focus:border-[var(--indigo)] cursor-pointer"
                >
                  {documents.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.title}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <button
                onClick={handleGenerateQuiz}
                disabled={generatingQuiz || documents.length === 0}
                className="w-full h-10.5 rounded-lg bg-[var(--indigo)] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer flex items-center justify-center gap-2"
              >
                {generatingQuiz ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Generating...
                  </>
                ) : (
                  "Generate 10 MCQs"
                )}
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-sm text-rose-400">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Loading State */}
        {generatingQuiz && (
          <div className="glass-card rounded-xl p-12 flex flex-col items-center justify-center space-y-4">
            <OrbitLoader />
            <div className="text-center space-y-1">
              <p className="text-base font-semibold text-[var(--text-2)]">Creating MCQ Quiz</p>
              <p className="text-xs text-[var(--text-4)]">Reading PDF pages, generating distractors & mapping explanations...</p>
            </div>
          </div>
        )}

        {/* Quiz Questions */}
        {questions.length > 0 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[var(--text-1)]">Practice Quiz</h2>
              {submitted && (
                <div className={`px-4 py-1.5 rounded-full border text-sm font-bold flex items-center gap-2 ${
                  score >= 7 
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                    : score >= 5 
                    ? "bg-amber-500/10 text-amber-400 border-amber-500/20" 
                    : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                }`}>
                  Score: {score} / {questions.length} ({Math.round((score / questions.length) * 100)}%)
                </div>
              )}
            </div>

            <div className="space-y-4">
              {questions.map((q, idx) => {
                const isSelected = (opt: string) => userAnswers[idx] === opt;
                const isCorrectOption = (opt: string) => q.correctAnswer === opt;
                
                return (
                  <div key={idx} className="glass-card rounded-xl p-6 space-y-4 border border-[var(--border)]">
                    <div className="flex gap-2 items-start">
                      <span className="font-semibold text-sm text-[var(--indigo)] bg-[var(--indigo)]/10 px-2 py-0.5 rounded-md">Q{idx + 1}</span>
                      <h3 className="text-[15px] font-semibold text-[var(--text-2)] pt-0.5">{q.question}</h3>
                    </div>

                    <div className="grid grid-cols-1 gap-2.5 pl-9">
                      {q.options.map((opt) => {
                        let optStyle = "border-[var(--border)] bg-[var(--surface)] text-[var(--text-3)] hover:border-slate-300 dark:hover:border-zinc-700";
                        
                        if (submitted) {
                          if (isCorrectOption(opt)) {
                            optStyle = "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 font-medium";
                          } else if (isSelected(opt)) {
                            optStyle = "border-rose-500/40 bg-rose-500/10 text-rose-400";
                          } else {
                            optStyle = "opacity-60 border-[var(--border)] bg-[var(--surface)] text-[var(--text-3)]";
                          }
                        } else if (isSelected(opt)) {
                          optStyle = "border-[var(--indigo)] bg-[var(--indigo)]/5 text-[var(--text-1)] font-medium";
                        }

                        return (
                          <button
                            key={opt}
                            disabled={submitted}
                            onClick={() => handleSelectOption(idx, opt)}
                            className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-all flex items-center justify-between ${optStyle} ${
                              !submitted ? "cursor-pointer active:scale-[0.995]" : "cursor-default"
                            }`}
                          >
                            <span>{opt}</span>
                            {submitted && isCorrectOption(opt) && (
                              <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                            )}
                            {submitted && isSelected(opt) && !isCorrectOption(opt) && (
                              <svg className="w-4 h-4 text-rose-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Explanations shown for wrong answers after submission */}
                    {submitted && !isSelected(q.correctAnswer) && (
                      <div className="pl-9 mt-2.5">
                        <div className="p-3.5 rounded-lg bg-indigo-500/5 border border-indigo-500/15 text-[13px] leading-relaxed text-[var(--text-3)]">
                          <p className="font-semibold text-[var(--indigo)] mb-1">Explanation from PDF:</p>
                          <p className="italic">&ldquo;{q.explanation}&rdquo;</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Quiz submission actions */}
            {!submitted && (
              <div className="flex justify-end pt-4">
                <button
                  onClick={handleSubmitQuiz}
                  disabled={Object.keys(userAnswers).length < questions.length}
                  className="px-6 h-11.5 rounded-lg bg-[var(--indigo)] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer"
                >
                  Submit Quiz
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
