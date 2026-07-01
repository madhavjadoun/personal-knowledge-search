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

  // New SaaS Polishing States
  const [currentQuizId, setCurrentQuizId] = useState<string>("");
  const [difficulty, setDifficulty] = useState<string>("Medium");
  const [startTime, setStartTime] = useState<number | null>(null);
  const [timeTaken, setTimeTaken] = useState<number>(0);

  // Daily credit system
  const [creditsInfo, setCreditsInfo] = useState<{
    used: number;
    limit: number;
    remaining: number;
    resetAt: string;
  } | null>(null);
  const [isCreditsError, setIsCreditsError] = useState(false);

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

        // Check if docId query param exists to auto-select it
        if (typeof window !== "undefined") {
          const params = new URLSearchParams(window.location.search);
          const docIdParam = params.get("docId");
          if (docIdParam) {
            setSelectedDocId(docIdParam);
          }
        }

        // Fetch daily credit balance
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;
          if (token) {
            let apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
            if (apiUrl.includes("localhost")) apiUrl = apiUrl.replace("localhost", "127.0.0.1");
            const credRes = await fetch(`${apiUrl}/credits/status`, {
              headers: { "Authorization": `Bearer ${token}` },
            });
            if (credRes.ok) {
              const credData = await credRes.json();
              setCreditsInfo({
                used:      credData.credits_used,
                limit:     credData.credits_limit,
                remaining: credData.credits_remaining,
                resetAt:   credData.reset_at,
              });
            }
          }
        } catch (credErr) {
          console.warn("Failed to fetch credit status:", credErr);
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

  // Load default settings (MCQ count)
  useEffect(() => {
    async function loadDefaultSettings() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const storedCount = localStorage.getItem(`settings_mcq_count_${user.id}`);
        if (storedCount) {
          setNumQuestions(parseInt(storedCount) || 10);
        }
      }
    }
    loadDefaultSettings();
  }, []);

  // Load existing quiz from URL query parameters (for review mode)
  useEffect(() => {
    async function loadQuizFromUrl() {
      if (typeof window === "undefined" || documents.length === 0) return;
      const params = new URLSearchParams(window.location.search);
      const quizIdParam = params.get("quizId");
      const reviewParam = params.get("review");

      if (quizIdParam) {
        try {
          setGeneratingQuiz(true);
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;
          if (!token) {
            throw new Error("Unable to retrieve authentication token. Please sign in again.");
          }

          let apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
          if (apiUrl.includes("localhost")) {
            apiUrl = apiUrl.replace("localhost", "127.0.0.1");
          }

          const res = await fetch(`${apiUrl}/quiz/${quizIdParam}`, {
            headers: {
              "Authorization": `Bearer ${token}`,
            },
          });

          if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.detail || "Server failed to load quiz details.");
          }

          const quizData = await res.json();

          const dbQuestions = (quizData.quiz_questions || []).sort((a: any, b: any) => a.order_index - b.order_index);
          const mappedQuestions = dbQuestions.map((q: any) => ({
            question: q.question,
            options: [q.option_a, q.option_b, q.option_c, q.option_d],
            correctAnswer: q.correct_option === "A" ? q.option_a : q.correct_option === "B" ? q.option_b : q.correct_option === "C" ? q.option_c : q.option_d,
            explanation: q.explanation
          }));

          setQuestions(mappedQuestions);
          setCurrentQuizId(quizIdParam);
          setSelectedDocId(quizData.document_id);

          if (quizData.status && quizData.status !== "generated") {
            try {
              const attempt = JSON.parse(quizData.status);
              if (attempt && attempt.completed) {
                setUserAnswers(attempt.user_answers || {});
                setScore(attempt.correct || 0);
                setDifficulty(attempt.difficulty || "Medium");
                setTimeTaken(attempt.time_taken || 0);
                if (reviewParam === "true") {
                  setSubmitted(true);
                }
              }
            } catch (e) {
              console.error("Failed to parse quiz status JSON:", e);
            }
          }
        } catch (err) {
          console.error("Failed to load quiz from URL:", err);
          showToast("Failed to load quiz.", "error");
        } finally {
          setGeneratingQuiz(false);
        }
      }
    }
    loadQuizFromUrl();
  }, [documents]);

  // Trigger quiz generation from selected PDF
  const handleGenerateQuiz = async () => {
    if (generatingQuiz) return;
    setDocValidationError(false);
    setMcqValidationError(false);
    setErrorMsg(null);
    setIsCreditsError(false);

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
    setStartTime(null);
    setTimeTaken(0);
    showToast("Generating your quiz...", "success");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        throw new Error("Unable to retrieve authentication token. Please sign in again.");
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/quiz/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          document_id: selectedDocId,
          num_questions: numQuestions,
        }),
      });

      const data = await res.json();

      // Handle 402 Insufficient Credits specifically
      if (res.status === 402) {
        // Refresh credits state so the badge updates
        if (data.detail) {
          // Extract remaining from error detail if possible, else refetch
          try {
            const { data: { session: s2 } } = await supabase.auth.getSession();
            if (s2?.access_token) {
              let apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
              if (apiUrl.includes("localhost")) apiUrl = apiUrl.replace("localhost", "127.0.0.1");
              const credRes = await fetch(`${apiUrl}/credits/status`, {
                headers: { "Authorization": `Bearer ${s2.access_token}` },
              });
              if (credRes.ok) {
                const credData = await credRes.json();
                setCreditsInfo({ used: credData.credits_used, limit: credData.credits_limit, remaining: credData.credits_remaining, resetAt: credData.reset_at });
              }
            }
          } catch (_) {/* silent */}
        }
        setIsCreditsError(true);
        throw new Error(data.detail || "You have run out of daily credits.");
      }

      if (!res.ok || !data.questions) {
        throw new Error(data.detail || "Quiz generation failed.");
      }

      // Map correct to correctAnswer to match frontend's type/state expectations
      const formattedQuestions = data.questions.map((q: { question: string; options: string[]; correct: string; explanation: string }) => ({
        ...q,
        correctAnswer: q.correct
      }));

      setQuestions(formattedQuestions);
      setCurrentQuizId(data.quiz_id);

      // Update credits badge optimistically from API response
      if (typeof data.credits_remaining === "number") {
        setCreditsInfo(prev => prev ? ({
          ...prev,
          remaining: data.credits_remaining,
          used: prev.limit - data.credits_remaining,
        }) : null);
      }
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

  const handleSubmitQuiz = async () => {
    // Calculate score
    let correctCount = 0;
    questions.forEach((q, idx) => {
      if (userAnswers[idx] === q.correctAnswer) {
        correctCount++;
      }
    });
    setScore(correctCount);
    setSubmitted(true);

    const timeTakenSec = startTime ? Math.round((Date.now() - startTime) / 1000) : 0;
    setTimeTaken(timeTakenSec);

    // Save attempt to backend
    if (currentQuizId) {
      try {
        // Convert numeric keys to string for consistent JSON serialization
        const stringifiedAnswers: Record<string, string> = {};
        Object.entries(userAnswers).forEach(([k, v]) => {
          stringifiedAnswers[String(k)] = v;
        });

        const docTitle = documents.find(d => d.id === selectedDocId)?.title 
          || documents.find(d => d.id === selectedDocId)?.file_name 
          || "Quiz";

        const attemptData = {
          completed: true,
          correct: correctCount,
          wrong: questions.length - correctCount,
          accuracy: Math.round((correctCount / questions.length) * 100),
          time_taken: timeTakenSec,
          difficulty: difficulty,
          title: `${docTitle} — Practice Quiz`,
          user_answers: stringifiedAnswers
        };

        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          throw new Error("Unable to retrieve authentication token. Please sign in again.");
        }

        // Call backend API /quiz/submit to update the quiz securely with service role key after verifying ownership
        let apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
        if (apiUrl.includes("localhost")) {
          apiUrl = apiUrl.replace("localhost", "127.0.0.1");
        }
        const submitRes = await fetch(`${apiUrl}/quiz/submit`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify({
            quiz_id: currentQuizId,
            status: JSON.stringify(attemptData),
            total_questions: questions.length,
          }),
        });

        if (!submitRes.ok) {
          const errData = await submitRes.json();
          throw new Error(errData.detail || "Server failed to save quiz attempt.");
        }

        showToast("Quiz submitted & saved to history!", "success");
      } catch (err) {
        console.error("Failed to save quiz attempt:", err);
        showToast("Failed to persist quiz results to history.", "error");
      }
    } else {
      showToast("Quiz completed! (No quiz ID — results not persisted.)", "error");
    }
  };

  const handleDownloadReport = () => {
    const totalQ = questions.length;
    const formatTimeTaken = (sec: number) => {
      if (!sec) return "N/A";
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return m > 0 ? `${m}m ${s}s` : `${s}s`;
    };
    
    const reportData = {
      title: `${selectedDoc?.title || "Quiz"} - Practice`,
      docName: selectedDoc?.title || selectedDoc?.file_name || "Document",
      dateStr: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      totalQuestions: totalQ,
      correctAnswers: score,
      wrongAnswers: totalQ - score,
      accuracy: Math.round((score / totalQ) * 100),
      timeTaken: formatTimeTaken(timeTaken),
      questions: questions.map((q, idx) => ({
        question: q.question,
        options: q.options,
        correctAnswer: q.correctAnswer,
        userAnswer: userAnswers[idx] || "",
        explanation: q.explanation
      }))
    };
    
    import("@/utils/pdfGenerator").then((mod) => {
      mod.downloadQuizReport(reportData);
    });
  };

  const selectedDoc = documents.find(d => d.id === selectedDocId);

  return (
    <AppShell title="Quiz Generator" subtitle="Generate AI-powered MCQs from your uploaded PDFs.">
      <div className="max-w-7xl mx-auto px-8 py-8 w-full animate-in fade-in slide-in-from-bottom-3 duration-250 space-y-6">
        
        {/* Setup Card */}
        <div className="bg-[var(--surface)] border border-[var(--border)] shadow-sm w-full max-w-[1180px] mx-auto hover:-translate-y-[2px] hover:shadow-lg transition-all duration-250" style={{ padding: "28px", borderRadius: "18px" }}>
          
          {/* Card header row: title + credit badge */}
          <div className="flex items-center justify-between" style={{ marginBottom: "24px" }}>
            <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-4)]">Configure Quiz</h3>
            {creditsInfo !== null && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--text-4)]">Daily Credits</span>
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full"
                  style={{
                    background: creditsInfo.remaining === 0
                      ? "rgba(244,63,94,0.1)"
                      : creditsInfo.remaining <= 10
                      ? "rgba(251,191,36,0.12)"
                      : "rgba(99,102,241,0.1)",
                    color: creditsInfo.remaining === 0
                      ? "#f43f5e"
                      : creditsInfo.remaining <= 10
                      ? "#d97706"
                      : "var(--indigo)",
                    border: `1px solid ${creditsInfo.remaining === 0 ? "rgba(244,63,94,0.25)" : creditsInfo.remaining <= 10 ? "rgba(251,191,36,0.3)" : "rgba(99,102,241,0.2)"}`,
                  }}
                >
                  {/* Bolt icon */}
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                  </svg>
                  {creditsInfo.remaining} / {creditsInfo.limit} left
                </span>
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[2fr_160px_140px_200px] gap-5 items-end w-full">
            
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

            {/* Middle Left: Difficulty Dropdown */}
            <div className="col-span-1 md:col-span-1 lg:col-span-1">
              <label className="font-bold uppercase text-[var(--text-3)] block leading-none" style={{ marginBottom: "12px", fontSize: "11px", letterSpacing: "0.08em" }}>Difficulty</label>
              <div className="relative group/select">
                <select
                  value={difficulty}
                  disabled={generatingQuiz}
                  onChange={(e) => setDifficulty(e.target.value)}
                  className="w-full border border-[var(--border)] focus:border-[var(--indigo)] focus:ring-2 focus:ring-[var(--indigo)]/10 bg-[var(--surface)] text-[16px] text-[var(--text-2)] focus:outline-none transition-all duration-250 cursor-pointer hover:border-slate-300 dark:hover:border-zinc-700 disabled:opacity-50"
                  style={{ height: "48px", borderRadius: "12px", paddingLeft: "16px", paddingRight: "44px", appearance: "none", WebkitAppearance: "none", MozAppearance: "none" }}
                >
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
                {/* Right Arrow Caret */}
                <div className="absolute top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-4)] group-focus-within/select:rotate-180 transition-transform duration-250" style={{ right: "16px" }}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Middle Right: Questions Input */}
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
                  setIsCreditsError(false);
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
                  mcqValidationError
                    ? "border-red-500"
                    : creditsInfo && numQuestions > creditsInfo.remaining && numQuestions > 0
                    ? "border-amber-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/10"
                    : "border-[var(--border)] focus:border-[var(--indigo)] focus:ring-2 focus:ring-[var(--indigo)]/10"
                } bg-[var(--surface)] px-4 text-base font-bold text-[var(--text-1)] focus:outline-none transition-all duration-250 hover:border-slate-300 dark:hover:border-zinc-700 disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
                style={{ height: "48px", borderRadius: "12px" }}
              />
              {/* Real-time credit warning under the input */}
              {creditsInfo && numQuestions > 0 && numQuestions > creditsInfo.remaining && (
                <div className="flex items-center gap-1.5 mt-1.5 animate-in fade-in duration-150">
                  <svg className="w-3 h-3 flex-shrink-0" style={{ color: "#d97706" }} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span className="text-[11px] font-semibold" style={{ color: "#d97706" }}>
                    Only {creditsInfo.remaining} credit{creditsInfo.remaining !== 1 ? "s" : ""} left today
                  </span>
                </div>
              )}
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
            isCreditsError ? (
              /* ── Credits exhausted — special amber banner ── */
              <div
                className="mt-5 flex items-start gap-3 px-4 py-3.5 rounded-xl border animate-in fade-in duration-200"
                style={{
                  backgroundColor: "rgba(251, 191, 36, 0.08)",
                  borderColor: "rgba(251, 191, 36, 0.35)",
                }}
              >
                {/* Bolt icon */}
                <div className="flex-shrink-0 mt-0.5" style={{ color: "#d97706" }}>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-bold" style={{ color: "#d97706" }}>Daily credit limit reached</span>
                  <span className="text-xs" style={{ color: "#92400e", opacity: 0.85 }}>
                    You&apos;ve used all {creditsInfo?.limit ?? 30} of your free credits for today.
                    Your credits reset at midnight UTC
                    {creditsInfo?.resetAt ? (() => {
                      const t = new Date(creditsInfo.resetAt);
                      return ` (${t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} your time)`;
                    })() : "."}
                  </span>
                </div>
              </div>
            ) : (
              /* ── Generic error ── */
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
            )
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
                    {difficulty}
                  </span>
                </div>
              </div>

              <div>
                <button
                  onClick={() => {
                    if (!startTime) setStartTime(Date.now());
                    document.getElementById("q-0")?.scrollIntoView({ behavior: "smooth" });
                  }}
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
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleDownloadReport}
                    className="px-4 py-1.5 rounded-lg border border-[var(--border)] text-xs font-semibold hover:bg-[var(--bg-2)] transition-colors cursor-pointer flex items-center gap-1.5"
                    style={{ color: "var(--text-1)" }}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    <span>Download Report</span>
                  </button>
                  <div className={`px-4 py-1.5 rounded-full border text-sm font-bold flex items-center gap-2 ${
                    score >= 7 
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                      : score >= 5 
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/20" 
                      : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                  }`}>
                    Score: {score} / {questions.length} ({Math.round((score / questions.length) * 100)}%)
                  </div>
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
                      {q.options.map((opt, oIdx) => {
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
                            <span>
                              <strong className="mr-1.5 text-[var(--text-2)]">{String.fromCharCode(65 + oIdx)}.</strong>
                              {opt}
                            </span>
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
