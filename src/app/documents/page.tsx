"use client";

import { useState } from "react";
import AppShell from "@/components/app/AppShell";
import OrbitLoader from "@/components/app/OrbitLoader";

interface Doc {
  name: string;
  ext: string;
  size: string;
  chunks: number;
  date: string;
  status: "Ready" | "Processing" | "Failed";
}

const INIT: Doc[] = [
  { name: "Standard_Layout_Notes", ext: "PDF", size: "1.2 MB", chunks: 48, date: "Jun 22, 2026", status: "Ready" },
  { name: "Sentence_Transformers_Specs", ext: "TXT", size: "340 KB", chunks: 14, date: "Jun 21, 2026", status: "Ready" },
  { name: "Vector_DB_Prisma_Schema", ext: "SQL", size: "12 KB", chunks: 6, date: "Jun 19, 2026", status: "Ready" },
  { name: "RAG_Knowledge_Flow", ext: "MD", size: "85 KB", chunks: 22, date: "Jun 15, 2026", status: "Ready" },
  { name: "Research_Paper_Embeddings", ext: "PDF", size: "8.4 MB", chunks: 210, date: "Jun 10, 2026", status: "Ready" },
];

const POOL = [
  { name: "API_Endpoint_Specs", ext: "JSON", size: "24 KB", chunks: 9 },
  { name: "Prisma_Migrations_Log", ext: "TXT", size: "56 KB", chunks: 18 },
  { name: "System_Architecture", ext: "PDF", size: "2.1 MB", chunks: 86 },
  { name: "Vector_Similarity_Script", ext: "PY", size: "18 KB", chunks: 7 },
  { name: "LLM_Context_Window_Specs", ext: "MD", size: "64 KB", chunks: 20 },
];

/* Color config per extension */
const EXT_STYLE: Record<string, { bg: string; color: string }> = {
  PDF:  { bg: "rgba(239,68,68,0.08)",   color: "#DC2626" },
  TXT:  { bg: "rgba(59,130,246,0.08)",  color: "#2563EB" },
  SQL:  { bg: "rgba(16,185,129,0.08)",  color: "#059669" },
  MD:   { bg: "rgba(124,58,237,0.08)",  color: "#7C3AED" },
  JSON: { bg: "rgba(245,158,11,0.08)",  color: "#D97706" },
  PY:   { bg: "rgba(6,182,212,0.08)",   color: "#0891B2" },
};

export default function DocumentsPage() {
  const [docs, setDocs] = useState<Doc[]>(INIT);
  const [uploading, setUploading] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [progress, setProgress] = useState(0);

  const totalChunks = docs.reduce((s, d) => s + d.chunks, 0);
  const readyCount = docs.filter((d) => d.status === "Ready").length;

  const handleUpload = () => {
    if (uploading) return;
    const available = POOL.filter((f) => !docs.some((d) => d.name === f.name));
    if (!available.length) return;
    const pick = available[Math.floor(Math.random() * available.length)];

    setUploadName(`${pick.name}.${pick.ext.toLowerCase()}`);
    setUploading(true);
    setProgress(0);

    const pending: Doc = {
      name: pick.name, ext: pick.ext, size: pick.size, chunks: 0,
      date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      status: "Processing",
    };
    setDocs((prev) => [pending, ...prev]);

    let p = 0;
    const iv = setInterval(() => {
      p += 18 + Math.random() * 14;
      setProgress(Math.min(Math.round(p), 100));
      if (p >= 100) {
        clearInterval(iv);
        setUploading(false);
        setDocs((prev) =>
          prev.map((d) =>
            d.name === pick.name ? { ...d, chunks: pick.chunks, status: "Ready" } : d
          )
        );
      }
    }, 380);
  };

  return (
    <AppShell
      title="Documents"
      subtitle={`${readyCount} of ${docs.length} indexed · ${totalChunks.toLocaleString()} chunks`}
      action={
        <button
          onClick={handleUpload}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
          style={{
            background: "linear-gradient(135deg, var(--indigo), var(--violet))",
            color: "white",
            boxShadow: "0 2px 8px rgba(79,70,229,0.25)",
            opacity: uploading ? 0.6 : 1,
            pointerEvents: uploading ? "none" : "auto",
          }}
        >
          {uploading ? (
            <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          )}
          {uploading ? `${progress}%` : "Upload"}
        </button>
      }
    >
      <div className="max-w-5xl mx-auto space-y-4">

        {/* ── Orbit Loader upload banner ── */}
        {uploading && (
          <div
            className="flex items-center gap-4 px-5 py-4 rounded-xl"
            style={{
              background: "rgba(79,70,229,0.05)",
              border: "1px solid rgba(79,70,229,0.14)",
            }}
          >
            {/* Orbit loader — shown ONLY during upload processing */}
            <OrbitLoader size={36} />

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium" style={{ color: "var(--text-1)", letterSpacing: "-0.014em" }}>
                Indexing <span style={{ color: "var(--indigo)", fontWeight: 600 }}>{uploadName}</span>
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
                Chunking and embedding into pgvector store…
              </p>
              <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${progress}%`,
                    background: "linear-gradient(90deg, var(--indigo), var(--violet))",
                  }}
                />
              </div>
            </div>

            <span
              className="text-sm font-semibold font-mono flex-shrink-0"
              style={{ color: "var(--indigo)" }}
            >
              {progress}%
            </span>
          </div>
        )}

        {/* ── Documents table card ── */}
        <div className="glass-card rounded-xl overflow-hidden">

          {/* Card header */}
          <div
            className="flex items-center justify-between px-5 py-3.5"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <div>
              <p
                className="text-sm font-semibold"
                style={{ color: "var(--text-1)", letterSpacing: "-0.018em" }}
              >
                Knowledge Index
              </p>
              <p className="text-[10px]" style={{ color: "var(--text-3)" }}>
                {totalChunks.toLocaleString()} total vector chunks
              </p>
            </div>

            {/* Mini stat pills */}
            <div className="flex items-center gap-2">
              <span
                className="text-[10px] font-semibold px-2 py-1 rounded-lg"
                style={{ background: "rgba(5,150,105,0.08)", color: "#059669", border: "1px solid rgba(5,150,105,0.14)" }}
              >
                {readyCount} indexed
              </span>
              <span
                className="text-[10px] font-semibold px-2 py-1 rounded-lg"
                style={{ background: "var(--bg-2)", color: "var(--text-2)", border: "1px solid var(--border)" }}
              >
                {docs.length} total
              </span>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["File", "Type", "Size", "Chunks", "Indexed", "Status"].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-2.5 text-left text-[9px] font-semibold uppercase tracking-widest"
                      style={{ color: "var(--text-3)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {docs.map((doc) => {
                  const ext = EXT_STYLE[doc.ext] ?? { bg: "var(--bg-2)", color: "var(--text-2)" };
                  return (
                    <tr
                      key={doc.name}
                      style={{ borderBottom: "1px solid var(--border)", transition: "background 0.12s" }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.background = "rgba(79,70,229,0.025)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background = "transparent";
                      }}
                    >
                      {/* File name */}
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className="h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
                          >
                            <svg className="w-3.5 h-3.5" style={{ color: "var(--text-3)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                          </div>
                          <span
                            className="text-xs font-medium truncate max-w-[160px]"
                            style={{ color: "var(--text-1)" }}
                          >
                            {doc.name}.{doc.ext.toLowerCase()}
                          </span>
                        </div>
                      </td>

                      {/* Extension badge */}
                      <td className="px-5 py-3">
                        <span
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded-md"
                          style={{ background: ext.bg, color: ext.color }}
                        >
                          {doc.ext}
                        </span>
                      </td>

                      <td className="px-5 py-3 text-xs font-mono" style={{ color: "var(--text-2)" }}>
                        {doc.size}
                      </td>
                      <td className="px-5 py-3 text-xs" style={{ color: "var(--text-2)" }}>
                        {doc.chunks > 0 ? doc.chunks.toLocaleString() : "—"}
                      </td>
                      <td className="px-5 py-3 text-xs" style={{ color: "var(--text-3)" }}>
                        {doc.date}
                      </td>

                      {/* Status */}
                      <td className="px-5 py-3">
                        {doc.status === "Processing" ? (
                          <span className="badge badge-pending flex items-center gap-1.5">
                            {/* Mini orbit used ONLY during processing */}
                            <span className="orbit-loader" style={{ "--ol-size": "14px" } as React.CSSProperties}>
                              <span className="ring ring-1" style={{ borderWidth: "1.5px" }} />
                              <span className="ring ring-2" style={{ borderWidth: "1.5px" }} />
                            </span>
                            Processing
                          </span>
                        ) : doc.status === "Ready" ? (
                          <span className="badge badge-success">
                            <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
                              <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                            </svg>
                            Ready
                          </span>
                        ) : (
                          <span className="badge" style={{ background: "rgba(239,68,68,0.08)", color: "#DC2626", border: "1px solid rgba(239,68,68,0.15)" }}>
                            Failed
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
