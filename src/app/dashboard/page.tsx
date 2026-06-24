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
}

interface RecentDoc {
  name: string;
  date: string;
  size: string;
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
    label: "Start AI Chat",
    sub: "Query across your documents",
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

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        // Artificial delay of 1 second for loader visualization
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // 0. Resolve the currently authenticated user
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return; // AppShell will redirect to /login if not authenticated

        // 1. Fetch this user's documents metadata only
        const { data: dbDocs, error: docsError } = await supabase
          .from("documents")
          .select("file_name, file_size, created_at")
          .eq("user_id", user.id)         // isolate to this user
          .order("created_at", { ascending: false });

        if (docsError) throw docsError;
        const documents = dbDocs || [];
        setHasDocs(documents.length > 0);

        // 2. Fetch this user's chunk count only
        let chunkCount = 0;
        try {
          const { count, error } = await supabase
            .from("chunks")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id);     // isolate to this user
          if (!error && count !== null) {
            chunkCount = count;
          }
        } catch (e) {
          console.warn("Could not query chunks count:", e);
        }

        // 3. Perform calculations
        const totalDocsCount = documents.length;
        const totalStorageBytes = documents.reduce((acc, d) => acc + (d.file_size || 0), 0);
        
        // Calculate storage progress percent of a mock 100MB limit
        const storageLimit = 100 * 1024 * 1024; // 100 MB
        const storagePercent = Math.min(Math.round((totalStorageBytes / storageLimit) * 100), 100);

        // 4. Calculate dynamic last indexed relative date
        let lastIndexedStr = "Never";
        if (documents.length > 0) {
          const lastDocDate = new Date(documents[0].created_at);
          const diffMs = new Date().getTime() - lastDocDate.getTime();
          const diffMins = Math.floor(diffMs / 60000);
          if (diffMins < 1) lastIndexedStr = "Just now";
          else if (diffMins < 60) lastIndexedStr = `${diffMins}m ago`;
          else {
            const diffHrs = Math.floor(diffMins / 60);
            if (diffHrs < 24) lastIndexedStr = `${diffHrs}h ago`;
            else lastIndexedStr = lastDocDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          }
        }

        // 5. Map stats
        const liveStats: StatItem[] = [
          {
            label: "Documents Indexed",
            value: totalDocsCount.toString(),
            delta: `total files`,
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
            label: "Knowledge Chunks",
            value: chunkCount.toLocaleString(),
            delta: "vector splits",
            deltaUp: null,
            accentColor: "var(--indigo)",
            accentBg: "var(--bg-2)",
            icon: (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 2.625c0 2.278-3.694 4.125-8.25 4.125S3.75 11.153 3.75 9" />
              </svg>
            ),
          },
          {
            label: "Last Indexed",
            value: lastIndexedStr,
            delta: "sync delay",
            deltaUp: null,
            accentColor: "var(--indigo)",
            accentBg: "var(--bg-2)",
            icon: (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ),
          },
          {
            label: "Storage Used",
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
          name: d.file_name,
          date: new Date(d.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          size: formatBytes(d.file_size),
          status: "Ready",
        }));

        setStats(liveStats);
        setRecentDocs(liveRecentDocs);
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
      <div className="max-w-6xl mx-auto space-y-5">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <OrbitLoader size={44} />
            <p className="text-sm font-semibold text-zinc-400 dark:text-zinc-500">
              Loading workspace metrics...
            </p>
          </div>
        ) : (
          <>
            {/* Stats grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {stats.map((s) => (
                <div
                  key={s.label}
                  className="glass-card rounded-xl p-4 relative overflow-hidden"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                      {s.label}
                    </span>
                    <span
                      className="flex items-center justify-center p-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-zinc-800"
                    >
                      {s.icon}
                    </span>
                  </div>

                  <p
                    className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white"
                    style={{ letterSpacing: "-0.03em" }}
                  >
                    {s.value}
                  </p>

                  {s.progress !== undefined ? (
                    <div className="mt-3">
                      <div
                        className="h-1 rounded-full overflow-hidden bg-slate-200 dark:bg-zinc-800"
                      >
                        <div
                          className="h-full rounded-full bg-blue-600"
                          style={{ width: `${s.progress}%` }}
                        />
                      </div>
                      <p className="text-xs font-medium text-slate-400 dark:text-zinc-500 mt-1.5 font-mono">{s.delta}</p>
                    </div>
                  ) : (
                    <p className="text-xs font-medium text-slate-400 dark:text-zinc-500 mt-1.5 font-mono">{s.delta}</p>
                  )}
                </div>
              ))}
            </div>

            {/* Two-column section */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              
              {/* Recent documents — 3 cols */}
              <div className="glass-card rounded-xl overflow-hidden lg:col-span-3 flex flex-col justify-between">
                <div>
                  <div
                    className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-zinc-800"
                  >
                    <p className="text-sm font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                      Recent Documents
                    </p>
                    <Link
                      href="/documents"
                      className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      View all →
                    </Link>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                    {!hasDocs ? (
                      <div className="text-center py-16 px-4 space-y-2">
                        <p className="text-sm font-semibold text-slate-400 dark:text-zinc-500">
                          No recent documents indexed
                        </p>
                        <p className="text-xs text-slate-300 dark:text-zinc-600 max-w-[240px] mx-auto">
                          Upload your first document on the landing page or the documents library to get started.
                        </p>
                      </div>
                    ) : (
                      recentDocs.map((doc) => (
                        <div
                          key={doc.name}
                          className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-slate-50 dark:hover:bg-zinc-800/40"
                          style={{ cursor: "default" }}
                        >
                          <div
                            className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-800"
                          >
                            <svg className="w-4 h-4 text-slate-400 dark:text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
                              {doc.name}
                            </p>
                            <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">
                              {doc.date} · {doc.size}
                            </p>
                          </div>
                          <span className="badge badge-success flex-shrink-0">
                            Ready
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Sidebar Content (Health, Ingestion Log, and Prompts) — 2 cols */}
              <div className="space-y-4 lg:col-span-2">
                
                {/* Knowledge Health Card */}
                <div className="glass-card rounded-xl p-4.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">Knowledge Health</h3>
                    <span className="badge badge-success">
                      ● Healthy
                    </span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Status</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">Ready for Search</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Index Status</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">Fully Synced</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Last Sync</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {hasDocs ? "Just now" : "Never"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Activity Ingestion Timeline */}
                <div className="glass-card rounded-xl p-4.5 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">Activity Timeline</h3>
                  {!hasDocs ? (
                    <p className="text-xs text-slate-400 dark:text-zinc-500 py-2">
                      No activity logged. Upload a document to start the sync pipeline.
                    </p>
                  ) : (
                    <div className="relative pl-4 space-y-3 border-l border-slate-200 dark:border-zinc-800 text-sm ml-1.5 py-1">
                      <div className="relative">
                        <div className="absolute -left-[20.5px] top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        <p className="font-semibold text-slate-800 dark:text-slate-200 text-xs">Knowledge ready</p>
                        <p className="text-[11px] text-slate-400 dark:text-zinc-500">Embeddings loaded into pgvector</p>
                      </div>
                      <div className="relative">
                        <div className="absolute -left-[20.5px] top-1.5 h-1.5 w-1.5 rounded-full bg-blue-500" />
                        <p className="font-semibold text-slate-800 dark:text-slate-200 text-xs">Embeddings completed</p>
                        <p className="text-[11px] text-slate-400 dark:text-zinc-500">Vectors computed using Gemini model</p>
                      </div>
                      <div className="relative">
                        <div className="absolute -left-[20.5px] top-1.5 h-1.5 w-1.5 rounded-full bg-blue-500" />
                        <p className="font-semibold text-slate-800 dark:text-slate-200 text-xs">Chunks generated</p>
                        <p className="text-[11px] text-slate-400 dark:text-zinc-500">Text split into overlapping chunks</p>
                      </div>
                      <div className="relative">
                        <div className="absolute -left-[20.5px] top-1.5 h-1.5 w-1.5 rounded-full bg-blue-500" />
                        <p className="font-semibold text-slate-800 dark:text-slate-200 text-xs">Document uploaded</p>
                        <p className="text-[11px] text-slate-400 dark:text-zinc-500">Metadata indexed successfully</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Suggested Questions Card */}
                <div className="glass-card rounded-xl p-4.5 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">Suggested Actions</h3>
                  <div className="flex flex-col gap-2">
                    {[
                      { q: "Generate MCQs", path: "/chat" },
                      { q: "Summarize document", path: "/chat" },
                      { q: "Create flashcards", path: "/chat" },
                      { q: "Generate viva questions", path: "/chat" }
                    ].map((item) => (
                      <Link
                        key={item.q}
                        href={item.path}
                        className="text-sm text-left px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-800/80 bg-white dark:bg-[#111827] text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:border-slate-300 dark:hover:border-zinc-700 transition-colors font-medium cursor-pointer"
                      >
                        {item.q}
                      </Link>
                    ))}
                  </div>
                </div>

              </div>

            </div>

            {/* Quick actions */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {QUICK.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="glass-card rounded-xl p-4 flex items-center gap-3 group"
                >
                  <div
                    className="h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-200 group-hover:scale-105"
                    style={{
                      background: "var(--bg-2)",
                      color: "var(--indigo)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {item.icon}
                  </div>
                  <div className="min-w-0">
                    <p
                      className="text-sm font-semibold text-slate-800 dark:text-slate-100"
                    >
                      {item.label}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">
                      {item.sub}
                    </p>
                  </div>
                  <svg
                    className="w-3.5 h-3.5 ml-auto flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity -translate-x-1 group-hover:translate-x-0 duration-200 text-slate-400 dark:text-zinc-500"
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
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
