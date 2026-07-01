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
  file_size?: number;
  file_name?: string;
  created_at?: string;
}

function formatBytes(bytes: number, decimals = 1) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

function formatUploadedDate(dateStr?: string) {
  if (!dateStr) return "N/A";
  const date = new Date(dateStr);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return "Today";
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
  const [userId, setUserId] = useState<string>("");
  const [numQuestions, setNumQuestions] = useState<number>(10);
  const [docValidationError, setDocValidationError] = useState(false);
  const [mcqValidationError, setMcqValidationError] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "error" | "success" } | null>(null);

  const showToast = (message: string, type: "error" | "success" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Fetch user's documents on mount
  useEffect(() => {
    async function fetchDocs() {
      try {
        setLoadingDocs(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setUserId(user.id);

        const { data: dbDocs, error } = await supabase
          .from("documents")
          .select("id, title, file_name, file_size, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (error) throw error;
        setDocuments(dbDocs || []);
        // Do not auto-select, so the user starts with the premium empty state
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
    setDocValidationError(false);
    setMcqValidationError(false);
    setErrorMsg(null);

    let hasError = false;
    if (!selectedDocId) {
      setDocValidationError(true);
      setErrorMsg("Please select a document before generating a quiz.");
      hasError = true;
    }
    if (numQuestions < 1) {
      setMcqValidationError(true);
      if (!hasError) {
        setErrorMsg("Please select a number of MCQs greater than 0.");
      } else {
        setErrorMsg("Please select a document and enter a number of MCQs greater than 0.");
      }
      hasError = true;
    }

    if (hasError) return;

    setGeneratingQuiz(true);
    setQuestions([]);
    setUserAnswers({});
    setSubmitted(false);
    showToast("Generating your quiz...", "success");

    try {
      if (!userId) {
        throw new Error("You must be signed in to generate a quiz.");
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/quiz/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          document_id: selectedDocId,
          user_id: userId,
          num_questions: numQuestions,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.questions) {
        throw new Error(data.detail || "Quiz generation failed.");
      }

      // Map correct to correctAnswer to match frontend's type/state expectations
      const formattedQuestions = data.questions.map((q: { question: string; options: string[]; correct: string; explanation: string }) => ({
        ...q,
        correctAnswer: q.correct
      }));

      setQuestions(formattedQuestions);
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

  const selectedDoc = documents.find(d => d.id === selectedDocId);

  return (
    <AppShell title="Quiz Generator" subtitle="Generate AI-powered MCQs from your uploaded PDFs.">
      <div className="max-w-7xl mx-auto px-8 py-8 w-full animate-in fade-in slide-in-from-bottom-3 duration-250 space-y-6">
        
        {/* Setup Card */}
        <div className="bg-[var(--surface)] border border-[var(--border)] shadow-sm w-full max-w-[1180px] mx-auto hover:-translate-y-[2px] hover:shadow-lg transition-all duration-250" style={{ padding: "28px", borderRadius: "18px" }}>
          <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-4)]" style={{ marginBottom: "24px" }}>Configure Quiz</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[2fr_180px_220px] gap-5 items-end w-full">
            
            {/* Left: Document Dropdown */}
            <div className="col-span-1 md:col-span-2 lg:col-span-1">
              <label className="font-bold uppercase text-[var(--text-3)] block leading-none" style={{ marginBottom: "12px", fontSize: "11px", letterSpacing: "0.08em" }}>Document</label>
              <div className="relative group/select">
                {/* Left Icon: Search icon */}
                <div className="absolute top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-4)] flex items-center" style={{ left: "16px" }}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <select
                  value={selectedDocId}
                  disabled={generatingQuiz}
                  onChange={(e) => {
                    setSelectedDocId(e.target.value);
                    setDocValidationError(false);
                    setErrorMsg(null);
                  }}
                  className={`w-full border ${
                    docValidationError 
                      ? "border-red-500 ring-2 ring-red-500/15" 
                      : "border-[var(--border)] focus:border-[var(--indigo)] focus:ring-2 focus:ring-[var(--indigo)]/10"
                  } bg-[var(--surface)] text-[16px] text-[var(--text-2)] focus:outline-none transition-all duration-250 cursor-pointer hover:border-slate-300 dark:hover:border-zinc-700 disabled:opacity-50`}
                  style={{ height: "48px", borderRadius: "12px", paddingLeft: "44px", paddingRight: "44px", appearance: "none", WebkitAppearance: "none", MozAppearance: "none" }}
                >
                  <option value="">Select a document...</option>
                  {documents.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.title}
                    </option>
                  ))}
                </select>
                {/* Right Arrow Caret */}
                <div className="absolute top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-4)] group-focus-within/select:rotate-180 transition-transform duration-250" style={{ right: "16px" }}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Center: Questions Input */}
            <div className="col-span-1 md:col-span-1 lg:col-span-1">
              <label className="font-bold uppercase text-[var(--text-3)] block leading-none" style={{ marginBottom: "12px", fontSize: "11px", letterSpacing: "0.08em" }}>No. of MCQs</label>
              <input
                type="number"
                min={1}
                disabled={generatingQuiz}
                value={numQuestions === 0 ? "" : numQuestions}
                onChange={(e) => {
                  setMcqValidationError(false);
                  setErrorMsg(null);
                  const val = e.target.value;
                  if (val === "") {
                    setNumQuestions(0);
                  } else {
                    const parsed = parseInt(val) || 0;
                    if (parsed > 50) {
                      setNumQuestions(50);
                    } else {
                      setNumQuestions(parsed);
                    }
                  }
                }}
                onBlur={() => {
                  setNumQuestions(prev => {
                    if (prev <= 0) return 0;
                    return Math.min(50, prev);
                  });
                }}
                className={`w-full border ${
                  mcqValidationError ? "border-red-500" : "border-[var(--border)] focus:border-[var(--indigo)] focus:ring-2 focus:ring-[var(--indigo)]/10"
                } bg-[var(--surface)] px-4 text-base font-bold text-[var(--text-1)] focus:outline-none transition-all duration-250 hover:border-slate-300 dark:hover:border-zinc-700 disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
                style={{ height: "48px", borderRadius: "12px" }}
              />
            </div>


            {/* Right: Primary CTA */}
            <div className="col-span-1 md:col-span-1 lg:col-span-1">
              <button
                onClick={handleGenerateQuiz}
                disabled={generatingQuiz}
                className="w-full bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 text-sm font-semibold disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 btn-premium-shine"
                style={{ height: "48px", borderRadius: "12px" }}
              >
                {generatingQuiz ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white dark:text-zinc-950" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 flex-shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 21l-.813-5.096L3 15l5.187-.904L9 9l.813 5.096L15 15l-5.187.904zM18 10.5l-.5 3-.5-3-3-.5 3-.5.5-3 .5 3 3 .5-3 .5zM19 19.5l-.25 1.5-.25-1.5-1.5-.25 1.5-.25.25-1.5.25 1.5 1.5.25-1.5.25z" />
                    </svg>
                    <span>{numQuestions > 0 ? `Generate ${numQuestions} MCQs` : "Generate Quiz"}</span>
                  </>
                )}
              </button>
            </div>

          </div>

          {/* Validation/Errors */}
          {errorMsg && (
            <div className="mt-5 text-xs font-semibold flex items-center gap-2 px-3.5 py-2.5 rounded-lg border-l-2 animate-in fade-in duration-200"
                 style={{
                   backgroundColor: "rgba(244, 63, 94, 0.05)",
                   borderColor: "rgba(244, 63, 94, 0.4)",
                   color: "var(--red, #f43f5e)",
                 }}>
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="leading-tight">{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Section 3: States */}

        {/* 1. Loading/Generating State */}
        {generatingQuiz && (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[18px] p-7 shadow-sm w-full max-w-[1180px] mx-auto min-h-[180px] flex flex-col items-center justify-center text-center animate-in fade-in duration-250 hover:-translate-y-[2px] hover:shadow-lg transition-all duration-250">
            <h3 className="text-sm font-bold text-[var(--text-1)] mb-4">Generating Quiz...</h3>
            <div className="w-full max-w-[200px] h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden mb-4 relative">
              <div className="absolute top-0 bottom-0 left-0 w-1/3 bg-[var(--indigo)] rounded-full animate-progress-loop"></div>
            </div>
            <p className="text-xs text-[var(--text-3)] font-semibold status-fade-text"></p>
          </div>
        )}

        {/* 2. Success Summary State */}
        {questions.length > 0 && !generatingQuiz && (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[18px] p-6 shadow-sm w-full max-w-[1180px] mx-auto animate-in fade-in duration-250 hover:-translate-y-[2px] hover:shadow-lg transition-all duration-250">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-emerald-500 font-bold text-lg">✓</span>
                  <h3 className="text-base font-bold text-[var(--text-1)]">Quiz Generated</h3>
                </div>
                <p className="text-xs text-[var(--text-4)]">
                  Practice exam questions compiled successfully.
                </p>
              </div>
              
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-4)]">Questions</span>
                  <span className="px-3 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-xs font-semibold text-[var(--text-2)]">
                    {questions.length}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-4)]">Time</span>
                  <span className="px-3 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-xs font-semibold text-[var(--text-2)]">
                    {(questions.length * 0.15 + 1.2).toFixed(1)}s
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-4)]">Difficulty</span>
                  <span className="px-3 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-xs font-semibold text-[var(--text-2)]">
                    Medium
                  </span>
                </div>
              </div>

              <div>
                <button
                  onClick={() => document.getElementById("q-0")?.scrollIntoView({ behavior: "smooth" })}
                  className="px-5 h-10 rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 text-xs font-bold hover:-translate-y-[2px] active:translate-y-0 transition-all duration-200 cursor-pointer border border-transparent shadow-sm flex items-center justify-center gap-1.5"
                >
                  <span>Start Quiz</span>
                  <span>→</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 3. Empty State (No selection) */}
        {!selectedDocId && !generatingQuiz && questions.length === 0 && (
          <div className="w-full max-w-[560px] mx-auto border border-dashed border-slate-200 dark:border-zinc-700/60 bg-slate-50/50 dark:bg-zinc-900/10 rounded-[18px] py-5 px-6 flex flex-col items-center justify-center text-center animate-in fade-in duration-250 h-[180px] hover:-translate-y-[2px] hover:shadow-lg transition-all duration-250">
            <span className="text-2xl mb-2">📄</span>
            <h3 className="text-sm font-semibold text-[var(--text-1)]">No document selected</h3>
            <p className="text-xs text-[var(--text-3)] mt-0.5">
              Select a document above to continue.
            </p>
            <div className="text-[10px] font-bold text-[var(--text-4)] uppercase tracking-wider mt-3.5">
              Supported: PDF • OCR • Scanned PDFs
            </div>
          </div>
        )}

        {/* 4. Selected Document Detail Card */}
        {selectedDoc && !generatingQuiz && questions.length === 0 && (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[18px] p-6 shadow-sm w-full max-w-[1180px] mx-auto animate-in fade-in duration-250 hover:-translate-y-[2px] hover:shadow-lg transition-all duration-250">
            <h3 className="text-xs font-bold text-[var(--text-4)] uppercase tracking-wider mb-5">Selected Document</h3>
            
            <div className="flex items-center gap-2 mb-6">
              <span className="text-lg">📄</span>
              <span className="text-base font-bold text-[var(--text-1)] truncate max-w-[400px]">
                {selectedDoc.file_name || selectedDoc.title}
              </span>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-[var(--text-4)] font-medium">Size</span>
                <span className="px-2.5 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-xs font-semibold text-[var(--text-2)] w-fit">
                  {selectedDoc.file_size ? formatBytes(selectedDoc.file_size) : "N/A"}
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-[var(--text-4)] font-medium">Chunks</span>
                <span className="px-2.5 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-xs font-semibold text-[var(--text-2)] w-fit">
                  {selectedDoc.file_size ? Math.max(1, Math.round(selectedDoc.file_size / 800)) : "N/A"}
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-[var(--text-4)] font-medium">Status</span>
                <span className="px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold border border-emerald-500/20 w-fit">
                  Synced
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-[var(--text-4)] font-medium">Uploaded</span>
                <span className="px-2.5 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-xs font-semibold text-[var(--text-2)] w-fit">
                  {formatUploadedDate(selectedDoc.created_at)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Quiz Questions */}
        {questions.length > 0 && !generatingQuiz && (
          <div className="space-y-6 max-w-[1180px] mx-auto pt-4">
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

            <div className="space-y-6">
              {questions.map((q, idx) => {
                const isSelected = (opt: string) => userAnswers[idx] === opt;
                const isCorrectOption = (opt: string) => q.correctAnswer === opt;
                
                return (
                  <div key={idx} id={`q-${idx}`} className="bg-[var(--surface)] rounded-[18px] p-6 space-y-4 border border-[var(--border)] hover:-translate-y-[2px] hover:shadow-lg transition-all duration-250 animate-in fade-in slide-in-from-bottom-3">
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
                  className="px-6 h-11.5 rounded-lg bg-[var(--indigo)] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer shadow-sm hover:shadow-md"
                >
                  Submit Quiz
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 px-4 py-3 rounded-lg shadow-lg border border-zinc-800 dark:border-slate-200 animate-in fade-in slide-in-from-bottom-5 duration-200">
          <span className="text-xs font-semibold">{toast.message}</span>
        </div>
      )}
    </AppShell>
  );
}
