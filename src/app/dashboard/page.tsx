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
      <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
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
      <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
      </svg>
    ),
    accentColor: "var(--violet)",
  },
  {
    href: "/documents",
    label: "Browse Index",
    sub: "View all indexed files",
    icon: (
      <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
      </svg>
    ),
    accentColor: "var(--cyan)",
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

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);

        // 1. Fetch documents metadata
        const { data: dbDocs, error: docsError } = await supabase
          .from("documents")
          .select("file_name, file_size, created_at")
          .order("created_at", { ascending: false });

        if (docsError) throw docsError;
        const documents = dbDocs || [];

        // 2. Fetch chunks count
        let chunkCount = 0;
        try {
          const { count, error } = await supabase
            .from("chunks")
            .select("*", { count: "exact", head: true });
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

        // 4. Map stats
        const liveStats: StatItem[] = [
          {
            label: "Documents",
            value: totalDocsCount.toString(),
            delta: `+${totalDocsCount} total indexed`,
            deltaUp: true,
            accentColor: "var(--indigo)",
            accentBg: "rgba(79,70,229,0.07)",
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
            accentColor: "var(--violet)",
            accentBg: "rgba(124,58,237,0.07)",
            icon: (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 2.625c0 2.278-3.694 4.125-8.25 4.125S3.75 11.153 3.75 9" />
              </svg>
            ),
          },
          {
            label: "AI Conversations",
            value: "0",
            delta: "RAG logs",
            deltaUp: null,
            accentColor: "var(--cyan)",
            accentBg: "rgba(6,182,212,0.07)",
            icon: (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
              </svg>
            ),
          },
          {
            label: "Storage Used",
            value: formatBytes(totalStorageBytes),
            delta: `of 100 MB · ${storagePercent}%`,
            deltaUp: null,
            progress: storagePercent,
            accentColor: "#059669",
            accentBg: "rgba(5,150,105,0.07)",
            icon: (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
              </svg>
            ),
          },
        ];

        // 5. Map recent documents (first 4 items)
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
    <AppShell title="Dashboard" subtitle={`Workspace overview · ${stats[0]?.value || 0} documents indexed`}>
      <div className="max-w-6xl mx-auto space-y-5">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <OrbitLoader size={44} />
            <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500">
              Loading Supabase Workspace Metrics...
            </p>
          </div>
        ) : (
          <>
            {/* ── Stats grid ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
              {stats.map((s) => (
                <div
                  key={s.label}
                  className="glass-card rounded-xl p-4 relative overflow-hidden"
                >
                  {/* Top gradient accent line */}
                  <div
                    className="absolute top-0 left-0 right-0 h-[2px] rounded-t-xl"
                    style={{
                      background: `linear-gradient(90deg, ${s.accentColor}, transparent 80%)`,
                    }}
                  />
                  {/* Ambient corner glow for depth */}
                  <div
                    className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full pointer-events-none"
                    style={{
                      background: `radial-gradient(circle at center, ${s.accentColor.replace("var(", "").replace(")", "")} 0%, transparent 70%)`,
                      opacity: 0.07,
                      filter: "blur(8px)",
                    }}
                  />

                  <div className="flex items-center justify-between mb-3">
                    <span
                      className="text-[10px] font-semibold uppercase tracking-widest"
                      style={{ color: "var(--text-3)" }}
                    >
                      {s.label}
                    </span>
                    <span
                      className="flex items-center justify-center p-1.5 rounded-lg"
                      style={{
                        background: s.accentBg,
                        color: s.accentColor,
                        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.60), 0 1px 3px rgba(0,0,0,0.06)",
                      }}
                    >
                      {s.icon}
                    </span>
                  </div>

                  <p
                    className="text-2xl font-bold tracking-tight"
                    style={{ color: "var(--text-1)", letterSpacing: "-0.032em" }}
                  >
                    {s.value}
                  </p>

                  {s.progress !== undefined ? (
                    <div className="mt-2.5">
                      <div
                        className="h-1 rounded-full overflow-hidden"
                        style={{ background: "var(--bg-3)" }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${s.progress}%`,
                            background: `linear-gradient(90deg, ${s.accentColor}, var(--violet))`,
                          }}
                        />
                      </div>
                      <p className="text-[10px] mt-1.5" style={{ color: "var(--text-3)" }}>{s.delta}</p>
                    </div>
                  ) : (
                    <p className="text-[10px] mt-1.5" style={{ color: "var(--text-3)" }}>{s.delta}</p>
                  )}
                </div>
              ))}
            </div>

            {/* ── Two-column section ── */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-3.5">
              {/* Recent documents — 3 cols */}
              <div className="glass-card rounded-xl overflow-hidden lg:col-span-3">
                <div
                  className="flex items-center justify-between px-5 py-3.5"
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  <p
                    className="text-sm font-semibold"
                    style={{ color: "var(--text-1)", letterSpacing: "-0.018em" }}
                  >
                    Recent Documents
                  </p>
                  <Link
                    href="/documents"
                    className="text-xs font-medium transition-colors"
                    style={{ color: "var(--indigo)" }}
                  >
                    View all →
                  </Link>
                </div>

                <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {recentDocs.length === 0 ? (
                    <div className="text-center py-10 space-y-2">
                      <p className="text-xs font-medium" style={{ color: "var(--text-3)" }}>
                        No recent documents indexed
                      </p>
                    </div>
                  ) : (
                    recentDocs.map((doc) => (
                      <div
                        key={doc.name}
                        className="flex items-center gap-3 px-5 py-3 transition-colors"
                        style={{ cursor: "default" }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.background = "rgba(79,70,229,0.03)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.background = "transparent";
                        }}
                      >
                        <div
                          className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
                        >
                          <svg className="w-3.5 h-3.5" style={{ color: "var(--text-3)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                          </svg>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            className="text-xs font-medium truncate"
                            style={{ color: "var(--text-1)" }}
                          >
                            {doc.name}
                          </p>
                          <p className="text-[10px]" style={{ color: "var(--text-3)" }}>
                            {doc.date} · {doc.size}
                          </p>
                        </div>
                        <span className="badge badge-success flex-shrink-0">
                          <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
                            <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                          </svg>
                          Ready
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* AI Activity — 2 cols (Static placeholders) */}
              <div className="glass-card rounded-xl overflow-hidden lg:col-span-2">
                <div
                  className="flex items-center justify-between px-5 py-3.5"
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  <p
                    className="text-sm font-semibold"
                    style={{ color: "var(--text-1)", letterSpacing: "-0.018em" }}
                  >
                    Retrieval Log
                  </p>
                  <Link
                    href="/chat"
                    className="text-xs font-medium transition-colors"
                    style={{ color: "var(--indigo)" }}
                  >
                    Open chat →
                  </Link>
                </div>
                <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                  <div className="text-center py-10">
                    <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500">
                      Logs will appear after chat queries
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Quick actions ── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {QUICK.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="glass-card rounded-xl p-4 flex items-center gap-3 group"
                >
                  <div
                    className="h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-200 group-hover:scale-105"
                    style={{
                      background: `color-mix(in srgb, ${item.accentColor} 10%, transparent)`,
                      color: item.accentColor,
                    }}
                  >
                    {item.icon}
                  </div>
                  <div className="min-w-0">
                    <p
                      className="text-sm font-semibold"
                      style={{ color: "var(--text-1)", letterSpacing: "-0.016em" }}
                    >
                      {item.label}
                    </p>
                    <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
                      {item.sub}
                    </p>
                  </div>
                  <svg
                    className="w-3.5 h-3.5 ml-auto flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity -translate-x-1 group-hover:translate-x-0 duration-200"
                    style={{ color: "var(--text-3)" }}
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
