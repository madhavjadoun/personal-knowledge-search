"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import AppShell from "@/components/app/AppShell";
import { supabase } from "@/lib/supabase";
import OrbitLoader from "@/components/app/OrbitLoader";

interface StatItem {
  label: string;
  value: string;
  delta: string;
  deltaUp: boolean | null;
  accentColor: string;
  accentBg: string;
  progress?: number;
  icon: React.ReactNode;
  isActivity?: boolean;
  activityData?: {
    quizzesToday: number;
    mcqsToday: number;
    lastTime: string | null;
  };
}

interface RecentDoc {
  name: string;
  date: string;
  size: string;
  chunks: number;
  status: string;
}

const QUICK = [
  {
    href: "/documents",
    label: "Upload Document",
    sub: "Add PDFs, notes, or text files",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
      </svg>
    ),
    accentColor: "var(--indigo)",
  },
  {
    href: "/chat",
    label: "Generate PDF Quiz",
    sub: "Create MCQ quizzes from your files",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
      </svg>
    ),
    accentColor: "var(--indigo)",
  },
  {
    href: "/documents",
    label: "Browse Index",
    sub: "View all indexed files",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
      </svg>
    ),
    accentColor: "var(--indigo)",
  },
];

/* Format bytes helper */
function formatBytes(bytes: number, decimals = 1) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<StatItem[]>([]);
  const [recentDocs, setRecentDocs] = useState<RecentDoc[]>([]);
  const [hasDocs, setHasDocs] = useState(false);
  const [recentLogs, setRecentLogs] = useState<{ title: string; desc: string; time: string; type: string }[]>([]);
  const [resetsIn, setResetsIn] = useState("");
  const [creditsResetAt, setCreditsResetAt] = useState<string | null>(null);

  useEffect(() => {
    const updateResetsIn = () => {
      if (!creditsResetAt) {
        setResetsIn("Resets soon");
        return;
      }

      const nowMs = Date.now();
      const resetMs = new Date(creditsResetAt).getTime();
      const diffMs = Math.max(0, resetMs - nowMs);
      const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      setResetsIn(`Resets in ${diffHrs}h ${diffMins}m`);
    };

    updateResetsIn();
    const interval = setInterval(updateResetsIn, 60000);
    return () => clearInterval(interval);
  }, [creditsResetAt]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        // Artificial delay of 1 second for loader visualization
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // 0. Resolve the currently authenticated user
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return; // AppShell will redirect to /login if not authenticated

        // Fetch daily credit balance from backend
        let creditsRemaining = 30;
        let creditsLimit = 30;
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
              creditsRemaining = credData.credits_remaining;
              creditsLimit = credData.credits_limit;
              setCreditsResetAt(credData.reset_at ?? null);
            }
          }
        } catch (credErr) {
          console.warn("Failed to fetch credits in dashboard:", credErr);
        }

        // 1. Fetch this user's documents metadata
        const { data: dbDocs, error: docsError } = await supabase
          .from("documents")
          .select("id, title, file_name, file_size, created_at")
          .eq("user_id", user.id)         // isolate to this user
          .order("created_at", { ascending: false });

        if (docsError) throw docsError;
        const documents = dbDocs || [];
        setHasDocs(documents.length > 0);

        // 2. Fetch user's quizzes and calculate stats
        let quizzesCount = 0;
        let questionsSolved = 0;
        let totalAccuracy = 0;
        let completedQuizzesCount = 0;
        let recentCompletedQuizzes: any[] = [];

        // Daily activity tracking
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        let quizzesGeneratedToday = 0;
        let mcqsGeneratedToday = 0;
        let lastQuizTime: string | null = null;
        
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;
          if (token) {
            let apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
            if (apiUrl.includes("localhost")) apiUrl = apiUrl.replace("localhost", "127.0.0.1");
            const res = await fetch(`${apiUrl}/quiz/user-history`, {
              headers: { "Authorization": `Bearer ${token}` },
            });
            if (res.ok) {
              const quizData = await res.json();
              const dbQuizzes = quizData.quizzes || [];
              quizzesCount = dbQuizzes.length;
              
              dbQuizzes.forEach((q: any) => {
                // Track today's activity
                const quizDate = new Date(q.created_at);
                if (quizDate >= todayStart) {
                  quizzesGeneratedToday++;
                  mcqsGeneratedToday += (q.total_questions || 0);
                }

                if (q.status && q.status !== "generated") {
                  try {
                    const attempt = JSON.parse(q.status);
                    if (attempt && attempt.completed) {
                      completedQuizzesCount++;
                      questionsSolved += (attempt.correct || 0);
                      totalAccuracy += (attempt.accuracy || 0);
                      recentCompletedQuizzes.push({
                        id: q.id,
                        title: attempt.title,
                        accuracy: attempt.accuracy,
                        created_at: q.created_at,
                        docId: q.document_id
                      });
                    }
                  } catch (e) {
                    // Ignore status parse errors
                  }
                }
              });

              if (dbQuizzes.length > 0) {
                const lastQuizDate = new Date(dbQuizzes[0].created_at);
                lastQuizTime = lastQuizDate.toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit"
                });
              }
            }
          }
        } catch (historyErr) {
          console.warn("Failed to fetch user history in dashboard:", historyErr);
        }
        
        const avgAccuracy = completedQuizzesCount > 0 ? Math.round(totalAccuracy / completedQuizzesCount) : 0;
        const creditsProgress = (creditsRemaining / creditsLimit) * 100;

        // 3. Perform calculations
        const totalDocsCount = documents.length;
        const totalStorageBytes = documents.reduce((acc, d) => acc + (d.file_size || 0), 0);
        
        // Calculate storage progress percent of a mock 100MB limit
        const storageLimit = 100 * 1024 * 1024; // 100 MB
        const storagePercent = Math.min(Math.round((totalStorageBytes / storageLimit) * 100), 100);

        // 4. Map stats
        const liveStats: StatItem[] = [
          {
            label: "Documents Indexed",
            value: totalDocsCount.toString(),
            delta: `total assets`,
            deltaUp: null,
            accentColor: "var(--indigo)",
            accentBg: "var(--bg-2)",
            icon: (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            ),
          },
          {
            label: "Today's Credits",
            value: `${creditsRemaining} / ${creditsLimit} MCQs Remaining`,
            delta: `Resets at midnight`,
            deltaUp: null,
            progress: creditsProgress,
            accentColor: "var(--indigo)",
            accentBg: "var(--bg-2)",
            icon: (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
              </svg>
            ),
          },
          {
            label: "Today's Activity",
            value: "",
            delta: "",
            deltaUp: null,
            accentColor: "var(--indigo)",
            accentBg: "var(--bg-2)",
            isActivity: true,
            activityData: {
              quizzesToday: quizzesGeneratedToday,
              mcqsToday: mcqsGeneratedToday,
              lastTime: lastQuizTime
            },
            icon: (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ),
          },
          {
            label: "Workspace Storage",
            value: formatBytes(totalStorageBytes),
            delta: `${storagePercent}% of 100 MB`,
            deltaUp: null,
            progress: storagePercent,
            accentColor: "var(--indigo)",
            accentBg: "var(--bg-2)",
            icon: (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
              </svg>
            ),
          },
        ];

        // 6. Map recent documents (first 4 items)
        const liveRecentDocs: RecentDoc[] = documents.slice(0, 4).map((d) => ({
          name: d.title || d.file_name,
          date: new Date(d.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          size: formatBytes(d.file_size),
          chunks: Math.max(1, Math.round(d.file_size / 800)),
          status: "Ready",
        }));

        // 7. Dynamic activity log stream
        const logs: typeof recentLogs = [];
        
        // Show recent completed quizzes
        recentCompletedQuizzes.slice(0, 2).forEach((q) => {
          const docTitle = documents.find(d => d.id === q.docId)?.title || "document";
          logs.push({
            title: `Quiz completed: ${q.title}`,
            type: "retrieval",
            desc: `Scored with ${q.accuracy}% accuracy using ${docTitle}`,
            time: new Date(q.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
          });
        });

        if (documents.length > 0) {
          documents.slice(0, 1).forEach((d) => {
            const chunksCount = Math.max(1, Math.round(d.file_size / 800));
            logs.push({
              title: `${d.title || d.file_name} indexed`,
              type: "index",
              desc: `Completed vector ingestion and sync with pgvector`,
              time: "Just now"
            });
            logs.push({
              title: `${chunksCount} chunks generated`,
              type: "chunk",
              desc: `Split document into overlap fragments of 800 bytes`,
              time: "Just now"
            });
          });
        }

        setStats(liveStats);
        setRecentDocs(liveRecentDocs);
        setRecentLogs(logs);
      } catch (err) {
        console.error("Error loading dashboard data from Supabase:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  return (
    <AppShell title="Dashboard" subtitle="Overview of your private knowledge base.">
      <div className="max-w-7xl mx-auto space-y-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <OrbitLoader size={44} />
            <p className="text-sm font-medium text-[var(--text-4)]">
              Loading workspace metrics...
            </p>
          </div>
        ) : (
          <>
            {/* ── Stats grid ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {stats.map((s) => (
                <div
                  key={s.label}
                  className="glass-card rounded-2xl p-5 sm:p-6 relative overflow-hidden flex flex-col justify-between min-h-[168px] min-w-0"
                >
                  {/* Card header: label + icon */}
                  <div>
                    <div className="flex items-start justify-between mb-4 gap-2">
                      <span className="text-[11px] font-semibold tracking-widest uppercase text-[var(--text-4)] leading-tight mt-0.5 select-none">
                        {s.label}
                      </span>
                      <span className="flex items-center justify-center p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-2)] bg-[var(--bg-2)] flex-shrink-0">
                        {s.icon}
                      </span>
                    </div>

                    {/* Card body: activity variant vs. value */}
                    {s.isActivity && s.activityData ? (
                      s.activityData.quizzesToday === 0 ? (
                        <p className="text-[13px] font-medium text-[var(--text-3)] mt-5 leading-relaxed">
                          No quiz generated today.
                        </p>
                      ) : (
                        <div className="space-y-2 mt-1 min-w-0">
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-[12px] font-medium text-[var(--text-3)] min-w-0 leading-snug">Quizzes Generated</span>
                            <span className="text-stat-value text-base flex-shrink-0">{s.activityData.quizzesToday}</span>
                          </div>
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-[12px] font-medium text-[var(--text-3)] min-w-0 leading-snug">MCQs Generated</span>
                            <span className="text-stat-value text-base flex-shrink-0">{s.activityData.mcqsToday}</span>
                          </div>
                          {s.activityData.lastTime && (
                            <div className="flex justify-between items-center gap-2">
                              <span className="text-[12px] font-medium text-[var(--text-3)] min-w-0 leading-snug">Last Quiz Time</span>
                              <span className="text-stat-value text-base flex-shrink-0">{s.activityData.lastTime}</span>
                            </div>
                          )}
                        </div>
                      )
                    ) : (
                      <p className="text-[22px] sm:text-2xl font-bold text-[var(--text-1)] tracking-tight leading-tight break-words mt-1">
                        {s.value}
                      </p>
                    )}
                  </div>

                  {/* Card footer: progress bar + delta */}
                  {!s.isActivity && (
                    <div className="mt-5">
                      {s.progress !== undefined && (
                        <div className="h-[3px] rounded-full overflow-hidden bg-[var(--bg-3)] mb-2.5">
                          <div
                            className="h-full rounded-full bg-[var(--indigo)] transition-all duration-500"
                            style={{ width: `${s.progress}%` }}
                          />
                        </div>
                      )}
                      <p className="text-[11.5px] font-medium text-[var(--text-4)] leading-snug">
                        {s.label === "Today's Credits" ? resetsIn : s.delta}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* ── Asymmetrical operational grid layout ── */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

              {/* LEFT COLUMN: Recent Documents & Activity Log (3/5 width) */}
              <div className="lg:col-span-3 space-y-5">

                {/* Recent Documents Card */}
                <div className="glass-card rounded-2xl overflow-hidden">
                  {/* Card header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-5 sm:px-6 py-4 sm:py-5 border-b border-[var(--border)]">
                    <p className="text-[11px] font-semibold tracking-widest uppercase text-[var(--text-2)] select-none">
                      Recent Documents
                    </p>
                    <Link
                      href="/documents"
                      className="text-[11.5px] font-semibold text-[var(--text-4)] hover:text-[var(--indigo)] transition-colors whitespace-nowrap tracking-tight"
                    >
                      View all →
                    </Link>
                  </div>

                  {/* Document rows */}
                  <div className="divide-y divide-[var(--border)]">
                    {!hasDocs ? (
                      <div className="text-center py-14 px-6 space-y-2">
                        <p className="text-[15px] font-semibold text-[var(--text-1)] tracking-tight">
                          No documents indexed yet
                        </p>
                        <p className="text-[12.5px] font-normal text-[var(--text-3)] max-w-[260px] mx-auto leading-relaxed">
                          Upload your first document to begin building a searchable knowledge base.
                        </p>
                      </div>
                    ) : (
                      recentDocs.map((doc) => (
                        <div
                          key={doc.name}
                          className="flex items-center gap-3 sm:gap-4 px-5 sm:px-6 py-3.5 sm:py-4 transition-colors duration-150 hover:bg-[var(--bg-2)]/60 min-w-0"
                          style={{ cursor: "default" }}
                        >
                          {/* File icon */}
                          <div className="h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-[var(--bg-2)] border border-[var(--border)]">
                            <svg className="w-4 h-4 text-[var(--text-2)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                          </div>
                          {/* Doc name + metadata */}
                          <div className="min-w-0 flex-1">
                            <p className="text-[13.5px] font-semibold text-[var(--text-1)] truncate leading-snug tracking-tight">
                              {doc.name}
                            </p>
                            <p className="text-[11.5px] font-normal text-[var(--text-4)] mt-0.5 truncate">
                              {doc.date} · {doc.size} ·{" "}
                              <span className="font-semibold text-[var(--text-3)] tabular-nums">{doc.chunks} chunks</span>
                            </p>
                          </div>
                          {/* Status badge */}
                          <span className="text-[10px] font-semibold tracking-wider uppercase text-[var(--text-4)] border border-[var(--border)] px-2 py-0.5 rounded-md flex-shrink-0 select-none bg-[var(--bg-2)]">
                            Ready
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Live Activity Stream Panel */}
                <div className="glass-card rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-5 sm:px-6 py-4 sm:py-5 border-b border-[var(--border)]">
                    <h3 className="text-[11px] font-semibold tracking-widest uppercase text-[var(--text-2)] select-none">Recent Activity</h3>
                  </div>

                  <div className="p-5 sm:p-6">
                    {!hasDocs ? (
                      <p className="text-[12.5px] font-medium text-[var(--text-3)] py-5 text-center leading-relaxed">
                        No activity logged. Upload a document to start the sync pipeline.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {recentLogs.map((log, idx) => (
                          <div key={idx} className="flex gap-3.5 items-start">
                            {/* Activity type icon */}
                            <div className="mt-0.5 flex-shrink-0">
                              <span className="h-6 w-6 rounded-lg flex items-center justify-center bg-[var(--bg-2)] border border-[var(--border)] text-[10px] leading-none select-none">
                                {log.type === "index" && "📌"}
                                {log.type === "chunk" && "✂️"}
                                {log.type === "upload" && "📦"}
                                {log.type === "retrieval" && "⚡"}
                              </span>
                            </div>
                            {/* Log content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-baseline gap-2">
                                <p className="text-[13px] font-semibold text-[var(--text-1)] truncate tracking-tight leading-snug">{log.title}</p>
                                <span className="text-[10px] font-mono font-medium text-[var(--text-4)] flex-shrink-0 tabular-nums">{log.time}</span>
                              </div>
                              <p className="text-[11.5px] font-normal text-[var(--text-3)] mt-0.5 leading-relaxed">{log.desc}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* RIGHT COLUMN: Status & Actions Sidebar (2/5 width) */}
              <div className="space-y-5 lg:col-span-2">

                {/* Index Status Card */}
                <div className="glass-card rounded-2xl overflow-hidden">
                  <div className="px-5 sm:px-6 py-4 sm:py-5 border-b border-[var(--border)]">
                    <h3 className="text-[11px] font-semibold tracking-widest uppercase text-[var(--text-2)] select-none">Index Status</h3>
                  </div>
                  <div className="px-5 sm:px-6 py-4 space-y-0 divide-y divide-[var(--border)]">
                    <div className="flex items-center justify-between py-3">
                      <span className="text-[12.5px] font-medium text-[var(--text-3)]">Knowledge Base</span>
                      <span className="text-[12.5px] font-semibold text-[var(--text-1)] tracking-tight">Synced</span>
                    </div>
                    <div className="flex items-center justify-between py-3">
                      <span className="text-[12.5px] font-medium text-[var(--text-3)]">Last Synced</span>
                      <span className="text-[12.5px] font-semibold text-[var(--text-1)] tracking-tight">
                        {hasDocs ? "Up to date" : "No files indexed"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Workspace Actions Card */}
                <div className="glass-card rounded-2xl overflow-hidden">
                  <div className="px-5 sm:px-6 py-4 sm:py-5 border-b border-[var(--border)]">
                    <h3 className="text-[11px] font-semibold tracking-widest uppercase text-[var(--text-2)] select-none">Workspace Actions</h3>
                  </div>
                  <div className="p-3 sm:p-4 flex flex-col gap-1.5">
                    {[
                      { q: "Generate New Quiz", path: "/chat" },
                      { q: "Upload Document", path: "/documents" },
                      { q: "View Quiz History", path: "/history" },
                      { q: "Browse Documents", path: "/documents" }
                    ].map((item) => (
                      <Link
                        key={item.q}
                        href={item.path}
                        className="text-[13px] font-semibold text-left px-4 py-2.5 rounded-xl border border-[var(--border)] bg-transparent text-[var(--text-1)] hover:text-[var(--indigo)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-2)] active:scale-[0.99] transition-all duration-150 tracking-tight cursor-pointer flex items-center justify-between group/btn"
                      >
                        <span>{item.q}</span>
                        <svg
                          className="w-3 h-3 opacity-0 group-hover/btn:opacity-60 transition-opacity duration-150 text-[var(--text-3)] flex-shrink-0"
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </Link>
                    ))}
                  </div>
                </div>

              </div>

            </div>

            {/* ── Quick actions ── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {QUICK.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="glass-card rounded-2xl px-5 py-4 flex items-center gap-4 group"
                >
                  {/* Icon container */}
                  <div className="h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-[var(--bg-2)] border border-[var(--border)] text-[var(--text-2)] transition-all duration-200 group-hover:scale-[1.06] group-hover:border-[var(--border-strong)]">
                    {item.icon}
                  </div>
                  {/* Label block */}
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-semibold text-[var(--text-1)] tracking-tight leading-snug">
                      {item.label}
                    </p>
                    <p className="text-[11.5px] font-normal text-[var(--text-4)] mt-0.5 leading-snug truncate">
                      {item.sub}
                    </p>
                  </div>
                  {/* Trailing arrow */}
                  <svg
                    className="w-3 h-3 ml-auto flex-shrink-0 opacity-0 group-hover:opacity-50 transition-all duration-200 -translate-x-0.5 group-hover:translate-x-0 text-[var(--text-3)]"
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
