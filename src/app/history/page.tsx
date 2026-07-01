"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/app/AppShell";
import { supabase } from "@/lib/supabase";
import OrbitLoader from "@/components/app/OrbitLoader";
import { CheckCircle2, Target, Brain, Download as DownloadIcon, BookOpen, FileText } from "lucide-react";

interface QuizAttempt {
  completed: boolean;
  correct: number;
  wrong: number;
  accuracy: number;
  time_taken: number;
  difficulty: string;
  title: string;
  user_answers: Record<string, string>;
}

interface DBQuiz {
  id: string;
  document_id: string;
  created_at: string;
  total_questions: number;
  status: string;
  quiz_questions: Array<{
    id: string;
    question: string;
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
    correct_option: string;
    explanation: string;
    order_index: number;
  }>;
}

export default function HistoryPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [quizzes, setQuizzes] = useState<DBQuiz[]>([]);
  const [docMap, setDocMap] = useState<Record<string, string>>({});
  const [quizToDelete, setQuizToDelete] = useState<DBQuiz | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "error" | "success" } | null>(null);
  const [quizToDownload, setQuizToDownload] = useState<DBQuiz | null>(null);
  const [includeAnswers, setIncludeAnswers] = useState(true);

  const [downloadedCount, setDownloadedCount] = useState(0);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const downloadedList = JSON.parse(localStorage.getItem("downloaded_reports") || "[]");
      const currentUserQuizIds = new Set(quizzes.map(q => q.id));
      const userDownloads = downloadedList.filter((id: string) => currentUserQuizIds.has(id));
      setDownloadedCount(userDownloads.length);
    }
  }, [quizzes]);

  const showToast = (message: string, type: "error" | "success" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchHistory = async () => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        router.push("/login");
        return;
      }

      // 1. Fetch user's documents to create doc ID-to-title mapping on frontend
      const { data: docs, error: docsError } = await supabase
        .from("documents")
        .select("id, title, file_name");

      if (docsError) throw docsError;

      const mapping: Record<string, string> = {};
      (docs || []).forEach(d => {
        mapping[d.id] = d.title || d.file_name || "Untitled Document";
      });
      setDocMap(mapping);

      // 2. Fetch quizzes associated with user's documents via secure backend API
      let apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
      if (apiUrl.includes("localhost")) {
        apiUrl = apiUrl.replace("localhost", "127.0.0.1");
      }
      console.log("Debugging fetchHistory — apiUrl:", apiUrl);
      console.log("Debugging fetchHistory — token exists:", !!token, "length:", token?.length);
      const res = await fetch(`${apiUrl}/quiz/user-history`, {
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Server failed to fetch quiz history.");
      }

      const quizData = await res.json();
      setQuizzes(quizData.quizzes || []);
    } catch (err) {
      console.error("Failed to load history:", err);
      showToast("Error loading quiz history.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const parseAttempt = (status: string, fallbackTitle: string): QuizAttempt => {
    if (status && status !== "generated") {
      try {
        const attempt = JSON.parse(status);
        if (attempt && attempt.completed) {
          return {
            completed: true,
            correct: attempt.correct || 0,
            wrong: attempt.wrong || 0,
            accuracy: attempt.accuracy || 0,
            time_taken: attempt.time_taken || 0,
            difficulty: attempt.difficulty || "Medium",
            title: attempt.title || fallbackTitle,
            user_answers: attempt.user_answers || {}
          };
        }
      } catch (e) {
        // status is just a plain string
      }
    }
    return {
      completed: false,
      correct: 0,
      wrong: 0,
      accuracy: 0,
      time_taken: 0,
      difficulty: "Medium",
      title: fallbackTitle,
      user_answers: {}
    };
  };

  const formatTime = (seconds: number) => {
    if (!seconds || seconds <= 0) return "--:--";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const handleDownload = (quiz: DBQuiz, withAnswers: boolean) => {
    const docName = docMap[quiz.document_id] || "Document";
    const fallbackTitle = `${docName} Quiz`;
    const attempt = parseAttempt(quiz.status, fallbackTitle);

    const questionsList = (quiz.quiz_questions || [])
      .sort((a, b) => a.order_index - b.order_index)
      .map((q) => {
        const getAnswerText = (optLetter: string) => {
          if (optLetter === "A") return q.option_a;
          if (optLetter === "B") return q.option_b;
          if (optLetter === "C") return q.option_c;
          return q.option_d;
        };

        const correctAnswer = getAnswerText(q.correct_option);
        return {
          question: q.question,
          options: [q.option_a, q.option_b, q.option_c, q.option_d],
          correctAnswer,
          userAnswer: attempt.user_answers[String(q.order_index)] || "",
          explanation: q.explanation
        };
      });

    const reportData = {
      title: attempt.title,
      docName,
      dateStr: new Date(quiz.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      totalQuestions: quiz.total_questions,
      correctAnswers: attempt.correct,
      wrongAnswers: attempt.wrong,
      accuracy: attempt.accuracy,
      timeTaken: formatTime(attempt.time_taken),
      questions: questionsList
    };

    import("@/utils/pdfGenerator").then((mod) => {
      mod.downloadQuizReport(reportData, withAnswers);

      // Track download in localStorage
      if (typeof window !== "undefined") {
        const downloadedList = JSON.parse(localStorage.getItem("downloaded_reports") || "[]");
        if (!downloadedList.includes(quiz.id)) {
          downloadedList.push(quiz.id);
          localStorage.setItem("downloaded_reports", JSON.stringify(downloadedList));
          const currentUserQuizIds = new Set(quizzes.map(q => q.id));
          const userDownloads = downloadedList.filter((id: string) => currentUserQuizIds.has(id));
          setDownloadedCount(userDownloads.length);
        }
      }
    });
  };

  const triggerDeleteQuiz = async () => {
    if (!quizToDelete) return;
    try {
      setDeleting(true);
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("No token");

      let apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
      if (apiUrl.includes("localhost")) {
        apiUrl = apiUrl.replace("localhost", "127.0.0.1");
      }

      const res = await fetch(`${apiUrl}/quiz/${quizToDelete.id}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Server failed to delete quiz.");
      }

      showToast("Quiz deleted successfully.", "success");
      setQuizzes(prev => prev.filter(q => q.id !== quizToDelete.id));
      setQuizToDelete(null);
    } catch (err) {
      console.error("Delete failed:", err);
      showToast("Failed to delete quiz.", "error");
    } finally {
      setDeleting(false);
    }
  };

  const [clearAllConfirm, setClearAllConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);

  const triggerClearAll = async () => {
    try {
      setClearing(true);
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("No token");

      let apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
      if (apiUrl.includes("localhost")) {
        apiUrl = apiUrl.replace("localhost", "127.0.0.1");
      }

      const res = await fetch(`${apiUrl}/quiz/clear-all`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Server failed to clear quiz history.");
      }

      showToast("All quiz history cleared successfully.", "success");
      setQuizzes([]);
      setClearAllConfirm(false);
    } catch (err) {
      console.error("Clear all failed:", err);
      showToast("Failed to clear quiz history.", "error");
    } finally {
      setClearing(false);
    }
  };

  const completedQuizzes = quizzes.filter(q => {
    const attempt = parseAttempt(q.status, "");
    return attempt.completed;
  });
  const completedCount = completedQuizzes.length;
  const avgAccuracy = completedCount > 0
    ? Math.round(completedQuizzes.reduce((acc, q) => acc + parseAttempt(q.status, "").accuracy, 0) / completedCount)
    : 0;
  const questionsSolved = completedQuizzes.reduce((acc, q) => acc + parseAttempt(q.status, "").correct, 0);

  return (
    <AppShell title="Quiz History" subtitle="Review your past AI quiz attempts and performance.">
      <div className="max-w-7xl mx-auto space-y-7">

        {/* Top Summary Cards */}
        {!loading && quizzes.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="border border-[var(--border)] bg-white dark:bg-[#151d2f] rounded-[12px] p-5 flex items-center justify-between hover:-translate-y-0.5 hover:shadow-md hover:border-indigo-500/20 dark:hover:border-indigo-400/20 transition-all duration-300 cursor-pointer">
              <div className="space-y-1">
                <p className="text-[12px] font-medium text-[var(--text-3)]">Completed</p>
                <p className="text-2xl font-bold text-[var(--text-1)]">{completedCount}</p>
              </div>
              <CheckCircle2 className="w-5 h-5 text-[var(--text-3)] opacity-80" strokeWidth={1.5} />
            </div>

            <div className="border border-[var(--border)] bg-white dark:bg-[#151d2f] rounded-[12px] p-5 flex items-center justify-between hover:-translate-y-0.5 hover:shadow-md hover:border-indigo-500/20 dark:hover:border-indigo-400/20 transition-all duration-300 cursor-pointer">
              <div className="space-y-1">
                <p className="text-[12px] font-medium text-[var(--text-3)]">Total Quizzes</p>
                <p className="text-2xl font-bold text-[var(--text-1)]">{quizzes.length}</p>
              </div>
              <BookOpen className="w-5 h-5 text-[var(--text-3)] opacity-80" strokeWidth={1.5} />
            </div>

            <div className="border border-[var(--border)] bg-white dark:bg-[#151d2f] rounded-[12px] p-5 flex items-center justify-between hover:-translate-y-0.5 hover:shadow-md hover:border-indigo-500/20 dark:hover:border-indigo-400/20 transition-all duration-300 cursor-pointer">
              <div className="space-y-1">
                <p className="text-[12px] font-medium text-[var(--text-3)]">Documents Practiced</p>
                <p className="text-2xl font-bold text-[var(--text-1)]">{new Set(quizzes.map(q => q.document_id)).size}</p>
              </div>
              <FileText className="w-5 h-5 text-[var(--text-3)] opacity-80" strokeWidth={1.5} />
            </div>

            <div className="border border-[var(--border)] bg-white dark:bg-[#151d2f] rounded-[12px] p-5 flex items-center justify-between hover:-translate-y-0.5 hover:shadow-md hover:border-indigo-500/20 dark:hover:border-indigo-400/20 transition-all duration-300 cursor-pointer">
              <div className="space-y-1">
                <p className="text-[12px] font-medium text-[var(--text-3)]">Downloads</p>
                <p className="text-2xl font-bold text-[var(--text-1)]">{downloadedCount}</p>
              </div>
              <DownloadIcon className="w-5 h-5 text-[var(--text-3)] opacity-80" strokeWidth={1.5} />
            </div>
          </div>
        )}

        {/* Header Actions row */}
        {!loading && quizzes.length > 0 && (
          <div className="flex justify-between items-center bg-[var(--bg-2)]/60 border border-[var(--border)] rounded-xl p-4">
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold text-[var(--text-1)]">Recent Attempts</h3>
              <p className="text-[11px] text-[var(--text-3)] font-medium">
                {completedCount === 1 ? "1 Completed Quiz" : `${completedCount} Completed Quizzes`}
              </p>
            </div>
            <button
              onClick={() => setClearAllConfirm(true)}
              className="px-3.5 py-1.5 border border-[var(--border)] hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-500 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 h-9"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <span>Clear History</span>
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <OrbitLoader size={44} />
            <p className="text-sm font-semibold text-zinc-400 dark:text-zinc-500">
              Loading your quiz history...
            </p>
          </div>
        ) : quizzes.length === 0 ? (
          <div className="w-full max-w-[560px] mx-auto border border-dashed border-[var(--border)] bg-[var(--bg-2)]/30 rounded-[12px] py-12 px-6 flex flex-col items-center justify-center text-center animate-in fade-in duration-250 min-h-[250px]">
            <span className="text-4xl mb-4">🎉</span>
            <h3 className="text-base font-bold text-[var(--text-1)]">No quizzes yet</h3>
            <p className="text-xs text-[var(--text-3)] mt-1.5 max-w-[320px] leading-relaxed font-medium">
              Generate your first practice quiz to see your history and download performance reports here.
            </p>
            <Link
              href="/chat"
              className="grad-btn mt-6 px-5 py-2.5 rounded-lg text-xs font-bold cursor-pointer inline-flex items-center gap-1.5 hover:-translate-y-0.5 transition-all duration-300"
            >
              Generate Quiz
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {quizzes.map((quiz) => {
              const docName = docMap[quiz.document_id] || "Untitled Document";
              const fallbackTitle = `${docName} Quiz`;
              const attempt = parseAttempt(quiz.status, fallbackTitle);
              const formattedDate = new Date(quiz.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric"
              });

              return (
                <div
                  key={quiz.id}
                  className="border border-[var(--border)] bg-white dark:bg-[#151d2f] rounded-[12px] p-4 flex flex-col justify-between min-h-[190px] hover:-translate-y-0.5 hover:shadow-md hover:border-indigo-500/20 dark:hover:border-indigo-400/20 transition-all duration-300"
                >
                  <div className="space-y-3">
                    {/* Header Row */}
                    <div className="flex justify-between items-start gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="text-sm font-bold text-[var(--text-1)]">
                            Practice Quiz
                          </h4>
                          <span className="text-[9px] font-mono bg-[var(--bg-2)] text-[var(--text-3)] px-1.5 py-0.5 rounded border border-[var(--border)] font-medium">
                            #{quiz.id.slice(0, 5).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <p className="text-[10px] font-semibold text-[var(--text-2)] flex items-center gap-1">
                            <span className="text-xs">📄</span>
                            <span className="truncate max-w-[150px]">{docName}</span>
                          </p>
                          <p className="text-[9px] font-medium text-[var(--text-4)]">
                            Created {formattedDate}
                          </p>
                        </div>
                      </div>

                      {/* Completed badge */}
                      <span className="px-1.5 py-0.5 rounded border border-[var(--border)] text-[9px] font-semibold text-[var(--text-3)] bg-transparent select-none">
                        {attempt.completed ? "Completed" : "Generated"}
                      </span>
                    </div>

                    {/* Stats Rows */}
                    <div className="border-t border-[var(--border)] pt-3 space-y-1.5">
                      <div className="flex justify-between text-[11px] font-medium">
                        <span className="text-[var(--text-3)]">Questions</span>
                        <span className="text-[var(--text-1)]">{quiz.total_questions}</span>
                      </div>
                      <div className="flex justify-between text-[11px] font-medium">
                        <span className="text-[var(--text-3)]">Accuracy</span>
                        <span className="text-[var(--text-1)]">
                          {attempt.completed ? `${attempt.accuracy}%` : "--:--"}
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] font-medium">
                        <span className="text-[var(--text-3)]">Duration</span>
                        <span className="text-[var(--text-1)]">
                          {attempt.completed ? formatTime(attempt.time_taken) : "--:--"}
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] font-medium">
                        <span className="text-[var(--text-3)]">Difficulty</span>
                        <span className="text-[var(--text-1)] capitalize">{attempt.difficulty}</span>
                      </div>
                    </div>

                    {/* View Analytics link */}
                    {attempt.completed && (
                      <button
                        onClick={() => router.push(`/chat?quizId=${quiz.id}&review=true`)}
                        className="text-[11px] font-medium text-[var(--indigo-accent)] hover:underline flex items-center gap-1 mt-0.5 cursor-pointer"
                      >
                        View Analytics →
                      </button>
                    )}
                  </div>

                  {/* Actions Footer */}
                  <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-[var(--border)]">
                    {attempt.completed ? (
                      <button
                        onClick={() => router.push(`/chat?quizId=${quiz.id}&review=true`)}
                        className="flex-1 py-1.5 text-center border border-[var(--border)] hover:bg-[var(--bg-2)] text-[11px] font-bold text-[var(--text-2)] rounded-lg transition-all cursor-pointer h-8 flex items-center justify-center"
                      >
                        Review
                      </button>
                    ) : (
                      <div className="flex-1 text-center py-1.5 text-[11px] font-medium text-[var(--text-3)] italic h-8 flex items-center justify-center border border-dashed border-[var(--border)] rounded-lg">
                        Review unavailable
                      </div>
                    )}
                    
                    <button
                      onClick={() => router.push(`/chat?docId=${quiz.document_id}`)}
                      className="flex-1 py-1.5 text-center bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 hover:opacity-90 text-[11px] font-bold rounded-lg transition-all cursor-pointer h-8 flex items-center justify-center gap-1 btn-premium-shine"
                    >
                      <svg className="w-3 h-3 flex-shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 21l-.813-5.096L3 15l5.187-.904L9 9l.813 5.096L15 15l-5.187.904zM18 10.5l-.5 3-.5-3-3-.5 3-.5.5-3 .5 3 3 .5-3 .5zM19 19.5l-.25 1.5-.25-1.5-1.5-.25 1.5-.25.25-1.5.25 1.5 1.5.25-1.5.25z" />
                      </svg>
                      <span>Retake</span>
                    </button>
                    
                    {/* PDF Report Download */}
                    <button
                      onClick={() => {
                        setQuizToDownload(quiz);
                        setIncludeAnswers(true);
                      }}
                      disabled={!attempt.completed}
                      className="p-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--bg-2)] text-[var(--text-2)] transition-colors cursor-pointer disabled:opacity-30 group relative w-8 h-8 flex items-center justify-center"
                      title="Download PDF Report"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                      
                      {/* Custom Tooltip */}
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 bg-zinc-900 text-[10px] text-white rounded font-bold opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10 shadow">
                        Download Report
                      </span>
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => setQuizToDelete(quiz)}
                      className="p-1.5 rounded-lg border border-[var(--border)] hover:border-red-500/50 hover:bg-red-500/10 text-[var(--text-2)] hover:text-red-500 transition-all cursor-pointer w-8 h-8 flex items-center justify-center"
                      title="Delete Quiz"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {quizToDelete && (
        <div className="fixed inset-0 bg-black/45 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="bg-[#121826] border border-[#24324a] rounded-xl max-w-[400px] w-full p-6 shadow-xl space-y-6 mx-4 animate-in zoom-in-95 duration-200">
            <div className="space-y-2">
              <h3 className="text-base font-bold text-[#f8fafc]">Delete Quiz Attempt</h3>
              <p className="text-xs text-[#94a3b8] leading-relaxed font-medium">
                Are you sure you want to delete this quiz history record? This action is permanent and cannot be undone.
              </p>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setQuizToDelete(null)}
                disabled={deleting}
                className="px-4 py-2 border border-[#24324a] hover:bg-[#151d2f] text-xs font-bold text-[#cbd5e1] rounded-lg transition-all cursor-pointer h-9 flex items-center"
              >
                Cancel
              </button>
              <button
                onClick={triggerDeleteQuiz}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer h-9"
              >
                {deleting && (
                  <svg className="animate-spin h-3 w-3 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                )}
                <span>Delete Quiz</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Confirmation Modal */}
      {clearAllConfirm && (
        <div className="fixed inset-0 bg-black/45 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="bg-[#121826] border border-[#24324a] rounded-xl max-w-[400px] w-full p-6 shadow-xl space-y-6 mx-4 animate-in zoom-in-95 duration-200">
            <div className="space-y-2">
              <h3 className="text-base font-bold text-[#f8fafc]">Clear Quiz History</h3>
              <p className="text-xs text-[#94a3b8] leading-relaxed font-medium">
                Are you sure you want to clear your entire quiz history? This will permanently delete all records, scores, and questions. This action is irreversible.
              </p>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setClearAllConfirm(false)}
                disabled={clearing}
                className="px-4 py-2 border border-[#24324a] hover:bg-[#151d2f] text-xs font-bold text-[#cbd5e1] rounded-lg transition-all cursor-pointer h-9 flex items-center"
              >
                Cancel
              </button>
              <button
                onClick={triggerClearAll}
                disabled={clearing}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer h-9"
              >
                {clearing && (
                  <svg className="animate-spin h-3 w-3 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                )}
                <span>Clear All History</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Download Options Modal */}
      {quizToDownload && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#121826] border border-[var(--border)] rounded-xl max-w-[400px] w-full p-6 shadow-xl space-y-5 mx-4 animate-in zoom-in-95 duration-200">
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-[var(--text-1)]">Download Quiz Report</h3>
              <p className="text-xs text-[var(--text-3)] leading-relaxed font-medium">
                Export a clean PDF for revision or sharing.
              </p>
            </div>

            <div className="flex items-center justify-between p-3.5 bg-[var(--bg-2)]/60 border border-[var(--border)] rounded-lg hover:border-[var(--text-4)]/30 transition-colors duration-200">
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-[var(--text-2)]">Include Answers & Explanations</p>
                <p className="text-[10px] text-[var(--text-4)]">Include correct answers and detailed AI explanations.</p>
              </div>
              <div className="flex items-center gap-2.5">
                <span 
                  className={`text-[10px] font-black tracking-wider transition-colors duration-200 ${
                    includeAnswers 
                      ? "text-black dark:text-white" 
                      : "text-zinc-500 dark:text-zinc-400"
                  }`}
                >
                  {includeAnswers ? "YES" : "NO"}
                </span>
                <button
                  type="button"
                  onClick={() => setIncludeAnswers(!includeAnswers)}
                  className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none"
                  style={{
                    backgroundColor: includeAnswers ? '#000000' : '#a9a9a9'
                  }}
                >
                  <span
                    className="pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-md"
                    style={{
                      position: 'absolute',
                      top: '2px',
                      left: includeAnswers ? '18px' : '2px',
                      transition: 'left 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                  />
                </button>
              </div>
            </div>

            {/* List of included items */}
            <div className="space-y-2 border-t border-[var(--border)] pt-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-4)]">
                Your PDF will include
              </p>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-[var(--text-2)] font-semibold">
                <li className="flex items-center gap-1.5">
                  <span style={{ color: 'var(--indigo-accent)' }}>✓</span> Questions
                </li>
                <li className="flex items-center gap-1.5">
                  <span style={{ color: 'var(--indigo-accent)' }}>✓</span> Options
                </li>
                {includeAnswers && (
                  <>
                    <li className="flex items-center gap-1.5 transition-all duration-200 animate-in fade-in slide-in-from-left-1">
                      <span style={{ color: 'var(--indigo-accent)' }}>✓</span> Correct Answer
                    </li>
                    <li className="flex items-center gap-1.5 transition-all duration-200 animate-in fade-in slide-in-from-left-1">
                      <span style={{ color: 'var(--indigo-accent)' }}>✓</span> Explanation
                    </li>
                  </>
                )}
              </ul>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border)]">
              <button
                onClick={() => setQuizToDownload(null)}
                className="px-4 py-2 border border-[var(--border)] hover:border-[var(--text-4)]/45 hover:bg-[var(--bg-2)] text-xs font-bold text-[var(--text-2)] rounded-lg transition-all duration-200 cursor-pointer h-9 flex items-center justify-center"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleDownload(quizToDownload, includeAnswers);
                  setQuizToDownload(null);
                }}
                style={{ backgroundColor: 'var(--indigo-accent)' }}
                className="px-4 py-2 hover:opacity-90 text-white rounded-lg text-xs font-bold transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer h-9 shadow-sm"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                <span>Download PDF</span>
              </button>
            </div>

            <div className="text-[9px] text-[var(--text-4)] text-center pt-1 font-medium select-none">
              Generated locally • Secure • No data shared.
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center bg-[#151d2f] text-[#f8fafc] px-4 py-3 rounded-lg shadow-lg border border-[#24324a] animate-in fade-in slide-in-from-bottom-5 duration-200">
          <span className="text-xs font-semibold">{toast.message}</span>
        </div>
      )}
    </AppShell>
  );
}
