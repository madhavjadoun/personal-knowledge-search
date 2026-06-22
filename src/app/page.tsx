"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

const FEATURES = [
  "Semantic vector search across all documents",
  "PDF, TXT, Markdown, SQL, Python support",
  "Real-time AI-powered answers in under 200ms",
  "Powered by pgvector · sentence-transformers · RAG",
];

const SAMPLE_FILES = [
  { name: "Research_Paper_Embeddings.pdf", ext: "PDF", size: "8.4 MB", chunks: 210 },
  { name: "RAG_Knowledge_Flow.md",         ext: "MD",  size: "85 KB",  chunks: 22  },
  { name: "Vector_DB_Prisma_Schema.sql",   ext: "SQL", size: "12 KB",  chunks: 6   },
];

const EXT_COLOR: Record<string, { bg: string; text: string }> = {
  PDF: { bg: "rgba(239,68,68,0.09)",  text: "#DC2626" },
  MD:  { bg: "rgba(124,58,237,0.09)", text: "#7C3AED" },
  SQL: { bg: "rgba(16,185,129,0.09)", text: "#059669" },
};

export default function WelcomePage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dropped, setDropped]   = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const simulateUpload = (name: string) => {
    setDropped(name);
    let p = 0;
    const iv = setInterval(() => {
      p += 20 + Math.random() * 18;
      setProgress(Math.min(Math.round(p), 100));
      if (p >= 100) { clearInterval(iv); setTimeout(() => router.push("/login"), 600); }
    }, 220);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) simulateUpload(f.name);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) simulateUpload(f.name);
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden app-bg"
    >
      {/* ── Aurora glows ── */}
      <div className="aurora-tl" />
      <div className="aurora-br" />
      <div className="aurora-accent" />

      {/* ── Main grid ── */}
      <div className="relative z-10 w-full max-w-7xl mx-auto flex items-center min-h-screen px-6 sm:px-10 lg:px-16 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-20 w-full items-center">

          {/* ══════════════════════════════
              LEFT — Content column
          ══════════════════════════════ */}
          <div className="flex flex-col gap-9 max-w-[500px] lg:max-w-none">

            {/* Logo + brand */}
            <div className="flex items-center gap-2.5">
              <div
                className="h-8 w-8 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "linear-gradient(135deg, var(--indigo), var(--violet))", boxShadow: "0 4px 14px rgba(79,70,229,0.28)" }}
              >
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <span className="text-sm font-semibold" style={{ color: "var(--text-1)", letterSpacing: "-0.018em" }}>
                KnowledgeSearch
              </span>
            </div>

            {/* Headline + description */}
            <div className="space-y-4">
              <h1
                className="text-4xl lg:text-5xl leading-[1.1] font-bold"
                style={{ color: "var(--text-1)", letterSpacing: "-0.034em" }}
              >
                Your knowledge,
                <br />
                <span
                  style={{
                    background: "linear-gradient(135deg, var(--indigo), var(--violet))",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  instantly searchable.
                </span>
              </h1>
              <p
                className="text-base leading-relaxed"
                style={{ color: "var(--text-2)", maxWidth: "380px" }}
              >
                Upload any document and ask questions in plain language.
                Get accurate answers powered by AI and semantic vector search.
              </p>
            </div>

            {/* Feature bullets */}
            <ul className="space-y-3">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-3">
                  {/* Check mark */}
                  <span
                    className="flex-shrink-0 h-5 w-5 rounded-full flex items-center justify-center"
                    style={{ background: "rgba(79,70,229,0.10)" }}
                  >
                    <svg className="w-3 h-3" style={{ color: "var(--indigo)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </span>
                  <span className="text-sm" style={{ color: "var(--text-2)", letterSpacing: "-0.012em" }}>{f}</span>
                </li>
              ))}
            </ul>

            {/* CTA buttons */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="grad-border rounded-xl">
                <button
                  onClick={() => router.push("/login")}
                  className="grad-btn flex items-center gap-2 px-6 py-2.5 rounded-[11px] text-sm"
                >
                  Get started free
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </button>
              </div>

              <button
                onClick={() => router.push("/login")}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-all"
                style={{ color: "var(--text-1)", border: "1px solid var(--border)", background: "var(--surface)" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "var(--border-accent)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                }}
              >
                Sign in
              </button>
            </div>

            {/* Trust line */}
            <p className="text-[11px] font-mono" style={{ color: "var(--text-3)" }}>
              pgvector · sentence-transformers · Next.js 15 · PostgreSQL
            </p>
          </div>

          {/* ══════════════════════════════
              RIGHT — Hero upload card
          ══════════════════════════════ */}
          <div className="relative flex items-center justify-center w-full">

            {/* Soft bloom behind the card */}
            <div
              className="absolute inset-0 -m-10 rounded-[40px] pointer-events-none"
              style={{
                background: "radial-gradient(ellipse at 55% 45%, rgba(79,70,229,0.11) 0%, rgba(124,58,237,0.07) 50%, transparent 75%)",
                filter: "blur(16px)",
              }}
            />

            {/* Card — gradient border + glass */}
            <div className="grad-border rounded-2xl w-full max-w-[500px] relative">
              <div
                className="rounded-[15px] overflow-hidden"
                style={{
                  background: "rgba(255,255,255,0.88)",
                  backdropFilter: "blur(28px) saturate(180%)",
                  WebkitBackdropFilter: "blur(28px) saturate(180%)",
                  boxShadow: "0 24px 80px rgba(0,0,0,0.10), 0 8px 24px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)",
                }}
              >
                {/* Card header bar */}
                <div
                  className="px-6 py-4 flex items-center justify-between"
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  <div>
                    <p
                      className="text-sm font-semibold"
                      style={{ color: "var(--text-1)", letterSpacing: "-0.018em" }}
                    >
                      Upload Documents
                    </p>
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--text-3)" }}>
                      PDF · TXT · Markdown · SQL · Python
                    </p>
                  </div>
                  {/* Window controls (decorative) */}
                  <div className="flex items-center gap-1.5">
                    {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
                      <div key={c} className="h-2.5 w-2.5 rounded-full" style={{ background: c, opacity: 0.7 }} />
                    ))}
                  </div>
                </div>

                {/* Card body */}
                <div className="p-6 space-y-4">

                  {/* ── Upload zone ── */}
                  <div
                    onClick={() => !dropped && fileRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={onDrop}
                    className="rounded-xl flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 relative overflow-hidden"
                    style={{
                      minHeight: "196px",
                      border: `2px dashed ${dragging ? "var(--indigo)" : dropped ? "rgba(5,150,105,0.5)" : "var(--border-strong)"}`,
                      background: dragging
                        ? "rgba(79,70,229,0.04)"
                        : dropped
                        ? "rgba(5,150,105,0.03)"
                        : "rgba(248,248,250,0.8)",
                      transform: dragging ? "scale(1.008)" : "scale(1)",
                    }}
                  >
                    {dropped ? (
                      /* Success / progress state */
                      <div className="flex flex-col items-center gap-3 px-6">
                        {progress < 100 ? (
                          <>
                            {/* Mini orbit loader inline */}
                            <div className="orbit-loader" style={{ "--ol-size": "36px" } as React.CSSProperties}>
                              <div className="ring ring-1" />
                              <div className="ring ring-2" />
                              <div className="ring ring-3" />
                            </div>
                            <p className="text-sm font-medium" style={{ color: "var(--text-1)" }}>
                              Indexing <span style={{ color: "var(--indigo)" }}>{dropped}</span>
                            </p>
                            <div className="w-full max-w-[220px]">
                              <div className="h-1 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                                <div
                                  className="h-full rounded-full transition-all duration-300"
                                  style={{ width: `${progress}%`, background: "linear-gradient(90deg, var(--indigo), var(--violet))" }}
                                />
                              </div>
                              <p className="text-[10px] mt-1.5 text-center" style={{ color: "var(--text-3)" }}>{progress}%</p>
                            </div>
                          </>
                        ) : (
                          <>
                            <div
                              className="h-10 w-10 rounded-full flex items-center justify-center"
                              style={{ background: "rgba(5,150,105,0.10)" }}
                            >
                              <svg className="w-5 h-5" style={{ color: "#059669" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                            </div>
                            <p className="text-sm font-medium" style={{ color: "#059669" }}>
                              Indexed successfully
                            </p>
                            <p className="text-xs" style={{ color: "var(--text-3)" }}>Redirecting…</p>
                          </>
                        )}
                      </div>
                    ) : (
                      /* Default state */
                      <>
                        {/* Upload icon */}
                        <div
                          className="h-12 w-12 rounded-2xl flex items-center justify-center mb-4 transition-transform duration-200"
                          style={{
                            background: dragging ? "rgba(79,70,229,0.10)" : "var(--bg-2)",
                            border: "1px solid var(--border)",
                            transform: dragging ? "scale(1.08)" : "scale(1)",
                          }}
                        >
                          <svg
                            className="w-6 h-6 transition-colors"
                            style={{ color: dragging ? "var(--indigo)" : "var(--text-3)" }}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                          </svg>
                        </div>

                        <p
                          className="text-sm font-semibold"
                          style={{ color: dragging ? "var(--indigo)" : "var(--text-1)", letterSpacing: "-0.016em" }}
                        >
                          {dragging ? "Release to upload" : "Drop files here"}
                        </p>
                        <p className="text-xs mt-1" style={{ color: "var(--text-3)" }}>
                          or{" "}
                          <span style={{ color: "var(--indigo)", fontWeight: 500, textDecoration: "underline", textUnderlineOffset: "2px" }}>
                            browse files
                          </span>
                        </p>
                        <p className="text-[10px] mt-3 font-mono" style={{ color: "var(--text-3)" }}>
                          PDF · TXT · MD · SQL · PY · JSON
                        </p>

                        <input
                          ref={fileRef}
                          type="file"
                          accept=".pdf,.txt,.md,.sql,.py,.json"
                          className="hidden"
                          onChange={onFileChange}
                        />
                      </>
                    )}
                  </div>

                  {/* Upload button */}
                  {!dropped && (
                    <div className="grad-border rounded-xl">
                      <button
                        onClick={() => fileRef.current?.click()}
                        className="grad-btn w-full flex items-center justify-center gap-2 py-2.5 rounded-[11px] text-sm"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.1}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                        </svg>
                        Upload & Index Document
                      </button>
                    </div>
                  )}

                  {/* Divider */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                    <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
                      Recently indexed
                    </span>
                    <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                  </div>

                  {/* Sample files */}
                  <div className="space-y-2">
                    {SAMPLE_FILES.map((file) => {
                      const c = EXT_COLOR[file.ext] ?? { bg: "var(--bg-2)", text: "var(--text-2)" };
                      return (
                        <div
                          key={file.name}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors"
                          style={{
                            background: "var(--bg)",
                            border: "1px solid var(--border)",
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLElement).style.borderColor = "var(--border-accent)";
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                          }}
                        >
                          {/* File icon */}
                          <div
                            className="h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                          >
                            <svg className="w-3.5 h-3.5" style={{ color: "var(--text-3)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                          </div>

                          {/* Name + size */}
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-medium truncate" style={{ color: "var(--text-1)", letterSpacing: "-0.012em" }}>
                              {file.name}
                            </p>
                            <p className="text-[9px] font-mono" style={{ color: "var(--text-3)" }}>
                              {file.size} · {file.chunks} chunks
                            </p>
                          </div>

                          {/* Ext badge + ready */}
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span
                              className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                              style={{ background: c.bg, color: c.text }}
                            >
                              {file.ext}
                            </span>
                            <span className="badge badge-success">
                              <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
                                <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                              </svg>
                              Ready
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Card footer */}
                  <div
                    className="flex items-center justify-between pt-2"
                    style={{ borderTop: "1px solid var(--border)" }}
                  >
                    <p className="text-[10px]" style={{ color: "var(--text-3)" }}>
                      5 documents · 1,240 vector chunks
                    </p>
                    <button
                      onClick={() => router.push("/dashboard")}
                      className="text-[10px] font-medium transition-colors"
                      style={{ color: "var(--indigo)" }}
                    >
                      Open dashboard →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* END right column */}

        </div>
      </div>
    </div>
  );
}
