"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import AppShell from "@/components/app/AppShell";
import OrbitLoader from "@/components/app/OrbitLoader";
import { supabase } from "@/lib/supabase";

interface SupabaseDoc {
  id: string;
  file_name: string;
  file_url: string;
  file_size: number;
  created_at: string;
}

interface SearchTestResult {
  page_number: number;
  similarity: number;
  content: string;
}

/* Color config per extension */
const EXT_STYLE: Record<string, { bg: string; color: string }> = {
  PDF: { bg: "rgba(239,68,68,0.08)", color: "#DC2626" },
  TXT: { bg: "rgba(59,130,246,0.08)", color: "#2563EB" },
  SQL: { bg: "rgba(16,185,129,0.08)", color: "#059669" },
  MD: { bg: "rgba(124,58,237,0.08)", color: "#7C3AED" },
  JSON: { bg: "rgba(245,158,11,0.08)", color: "#D97706" },
  PY: { bg: "rgba(6,182,212,0.08)", color: "#0891B2" },
};

/* Format bytes helper */
function formatBytes(bytes: number, decimals = 1) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

export default function DocumentsPage() {
  const [docs, setDocs] = useState<SupabaseDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [progress, setProgress] = useState(0);

  const [searchQuestion, setSearchQuestion] = useState("");
  const [searchDocId, setSearchDocId] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchAnswer, setSearchAnswer] = useState("");
  const [searchSources, setSearchSources] = useState<SearchTestResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showDeveloperPanel, setShowDeveloperPanel] = useState(false);
  const [activeProvider, setActiveProvider] = useState("Gemini");

  // Sync latest document ID to searchDocId if searchDocId is currently empty or stale
  useEffect(() => {
    if (docs.length > 0) {
      const docExists = docs.some(d => d.id === searchDocId);
      if (!docExists) {
        setSearchDocId(docs[0].id);
      }
    } else {
      setSearchDocId("");
    }
  }, [docs, searchDocId]);

  // Log selected document ID when it changes (temporary developer log)
  useEffect(() => {
    console.log("Selected document_id:", searchDocId || "none");
  }, [searchDocId]);

  // Retrieve active provider configuration on mount
  useEffect(() => {
    fetch("/api/search")
      .then((res) => res.json())
      .then((data) => {
        if (data.provider) {
          setActiveProvider(data.provider);
        }
      })
      .catch((err) => console.error("Failed to fetch active AI provider:", err));
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocs = async () => {
    try {
      setLoading(true);
      // Artificial delay of 1 second for loader visualization
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Get current user — required for user-scoped query
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("user_id", user.id)          // Only fetch this user's documents
        .order("created_at", { ascending: false });

      if (error) throw error;
      setDocs(data || []);
    } catch (err) {
      console.error("Error fetching documents:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocs();
  }, []);

  const triggerUploadClick = () => {
    if (uploading) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const { data, error } = await supabase.auth.getSession();

    console.log("========== SESSION ==========");
    console.log("Session:", data.session);
    console.log("User:", data.session?.user);
    console.log("User ID:", data.session?.user?.id);
    console.log("Error:", error);
    console.log("=============================");
    if (!file) return;

    setUploadName(file.name);
    setUploading(true);
    setProgress(5);

    // Simulate upload progress
    let currentProgress = 5;
    const progressInterval = setInterval(() => {
      if (currentProgress < 85) {
        currentProgress += Math.floor(Math.random() * 8) + 3;
        setProgress(Math.min(currentProgress, 85));
      }
    }, 200);

    try {
      // ── DIAGNOSTIC: Full session audit before storage upload ────────────────
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const session = sessionData?.session;
      const user = session?.user ?? null;

      console.group("[Documents Upload Diagnostic]");
      console.log("Session error:", sessionError?.message ?? "none");
      console.log("Session exists:", !!session);
      console.log("Access token present:", !!session?.access_token);
      console.log("Access token preview:", session?.access_token?.slice(0, 40) + "...");
      console.log("Token expires at:", session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : "N/A");
      console.log("Token expired:", session?.expires_at ? Date.now() / 1000 > session.expires_at : "unknown");
      console.log("Current User ID:", user?.id ?? "NULL — not authenticated");
      console.log("Bucket:", "documents");
      console.log("Upload path:", user ? `${user.id}/${file.name}` : "N/A");
      console.groupEnd();

      if (sessionError || !session || !user) {
        clearInterval(progressInterval);
        setUploading(false);
        setProgress(0);
        console.error("[Documents Upload] Auth check failed:", sessionError);
        alert("Authentication error: You must be signed in to upload. Redirecting...");
        window.location.href = "/login";
        return;
      }

      // Refresh token if near expiry
      if (session.expires_at && Date.now() / 1000 > session.expires_at - 60) {
        console.log("[Documents Upload] Token near expiry, refreshing...");
        const { error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) console.warn("[Documents Upload] Refresh failed:", refreshError.message);
      }

      // ── Storage upload ──────────────────────────────────────────────────
      const storagePath = `${user.id}/${file.name}`;
      console.log("[Documents Upload] Storage path:", storagePath);

      const { data: storageData, error: storageError } = await supabase.storage
        .from("documents")
        .upload(storagePath, file, { cacheControl: "3600", upsert: true });

      if (storageError) {
        console.group("[Documents Upload] Storage error — full dump");
        console.error("error.message:", storageError.message);
        console.error("error.name:", storageError.name);
        console.error("error (full object):", JSON.stringify(storageError, null, 2));
        console.groupEnd();
        throw storageError;
      }

      console.log("[Documents Upload] Storage upload succeeded:", storageData);

      // ── Public URL ────────────────────────────────────────────────────
      const { data: { publicUrl } } = supabase.storage
        .from("documents")
        .getPublicUrl(storagePath);

      // ── DB insert ──────────────────────────────────────────────────────
      console.log("[Documents Upload] Inserting into documents table. user_id:", user.id);
      const { data: dbData, error: dbError } = await supabase
        .from("documents")
        .insert([{
          user_id: user.id,
          title: file.name,
          file_name: file.name,
          file_url: publicUrl,
          file_size: file.size,
          created_at: new Date().toISOString()
        }])
        .select("id")
        .single();

      if (dbError || !dbData) {
        console.error("[Documents Upload] DB insert error:", JSON.stringify(dbError, null, 2));
        throw dbError || new Error("Failed to retrieve new document ID");
      }

      const documentId = dbData.id;
      console.log("[Documents Upload] DB insert succeeded. Generated ID:", documentId);

      console.log("[Documents Upload] Triggering PDF document processing...");
      const { data: freshSessionData, error: freshSessionError } = await supabase.auth.getSession();
      if (freshSessionError || !freshSessionData.session) {
        throw new Error("Unable to authenticate processing request: " + (freshSessionError?.message || "No session"));
      }

      const accessToken = freshSessionData.session.access_token;
      const processResponse = await fetch("/api/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          storagePath,
          documentId,
        })
      });

      if (!processResponse.ok) {
        const errText = await processResponse.text();
        let errMsg = errText;
        try {
          const errObj = JSON.parse(errText);
          if (errObj && typeof errObj === "object" && "error" in errObj) {
            errMsg = String(errObj.error);
          }
        } catch {}
        throw new Error(errMsg || `RAG processing failed with status: ${processResponse.status}`);
      }

      console.log("[Documents Upload] RAG processing complete.");

      clearInterval(progressInterval);
      setProgress(100);
      await fetchDocs();
      setSearchDocId(documentId);
      setTimeout(() => { setUploading(false); setProgress(0); }, 1000);

    } catch (err) {
      clearInterval(progressInterval);
      console.error("Upload failed:", err);
      const errMsg = err && typeof err === "object" && "message" in err ? String((err as Record<string, unknown>).message) : String(err);
      alert("Upload failed: " + errMsg);
      setUploading(false);
      setProgress(0);
    } finally {
      // Reset input value to allow uploading same file again
      if (e.target) e.target.value = "";
    }
  };

  const handleDelete = async (doc: SupabaseDoc) => {
    if (!confirm(`Are you sure you want to delete "${doc.file_name}"?`)) return;

    try {
      // Get current user to verify ownership (RLS also enforces this server-side)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("You must be signed in to delete documents.");

      // Reconstruct the user-scoped storage path: {user_id}/{filename}
      // New uploads use this format. Legacy uploads fall back to URL parsing.
      const legacyMarker = "/documents/";
      const markerIndex = doc.file_url.indexOf(legacyMarker);
      let storagePath = "";
      if (markerIndex !== -1) {
        const afterBucket = decodeURIComponent(doc.file_url.substring(markerIndex + legacyMarker.length));
        // Check if the path already starts with the user's ID (new format)
        if (afterBucket.startsWith(user.id + "/")) {
          storagePath = afterBucket;
        } else {
          // Prefer reconstructing from user_id + filename for new-format files
          storagePath = `${user.id}/${doc.file_name}`;
        }
      } else {
        storagePath = `${user.id}/${doc.file_name}`;
      }

      // 1. Delete all chunks belonging to this document (prevent orphan data)
      const { error: chunkDeleteError } = await supabase
        .from("chunks")
        .delete()
        .eq("document_id", doc.id);

      if (chunkDeleteError) {
        console.warn("Failed to delete chunks (may have CASCADE):", chunkDeleteError);
      }

      // 2. Delete from Supabase Storage
      if (storagePath) {
        await supabase.storage.from("documents").remove([storagePath]);
      }

      // 3. Delete row from 'documents' table
      // RLS ensures the user can only delete their own rows
      const { error: dbError } = await supabase
        .from("documents")
        .delete()
        .eq("id", doc.id)
        .eq("user_id", user.id); // extra safety filter

      if (dbError) throw dbError;

      // 4. Refresh list
      await fetchDocs();
    } catch (err) {
      console.error("Delete failed:", err);
      const errMsg = err && typeof err === "object" && "message" in err ? String((err as Record<string, unknown>).message) : String(err);
      alert("Failed to delete document: " + errMsg);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuestion.trim()) return;

    setIsSearching(true);
    setSearchError(null);
    setSearchAnswer("");
    setSearchSources([]);

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData?.session) {
        throw new Error("Failed to retrieve user session. Please try logging in again.");
      }

      const response = await fetch("/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${sessionData.session.access_token}`,
        },
        body: JSON.stringify({
          question: searchQuestion,
          documentId: searchDocId || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `Search failed with status: ${response.status}`);
      }

      setSearchAnswer(data.answer || "");
      setSearchSources(data.sources || []);
    } catch (err) {
      console.error("[RAG Search Test] Error:", err);
      setSearchError(err instanceof Error ? err.message : "An unknown error occurred during search");
    } finally {
      setIsSearching(false);
    }
  };

  const readyCount = docs.length;
  const totalStorage = docs.reduce((s, d) => s + d.file_size, 0);

  return (
    <AppShell
      title="Documents"
      subtitle={`${readyCount} indexed · ${formatBytes(totalStorage)} storage used`}
      action={
        <>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".pdf,.txt,.md,.sql,.py,.json"
            className="hidden"
          />
          <button
            onClick={triggerUploadClick}
            disabled={uploading}
            className="grad-btn flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all cursor-pointer"
          >
            {uploading ? (
              <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            )}
            {uploading ? `Indexing ${progress}%` : "Upload File"}
          </button>
        </>
      }
    >
      <div className="max-w-5xl mx-auto space-y-4">
        {/* Ingestion progress banner */}
        {uploading && (
          <div
            className="flex items-center gap-4 px-5 py-4 rounded-xl border border-[var(--border)] bg-[var(--bg-2)]/30"
          >
            <OrbitLoader size={36} />

            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--text-1)]">
                Indexing <span className="text-[var(--text-2)]">{uploadName}</span>
              </p>
              <p className="text-xs text-[var(--text-4)] mt-0.5">
                Parsing text chunks and building vector embeddings...
              </p>
              <div className="mt-2 h-1 rounded-full overflow-hidden bg-[var(--bg-3)]">
                <div
                  className="h-full rounded-full bg-[var(--indigo)] transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <span className="text-sm font-bold font-mono text-[var(--text-2)]">
              {progress}%
            </span>
          </div>
        )}

        {/* Documents Cards Grid wrapper */}
        <div className="glass-card rounded-xl overflow-hidden">
          {/* Section header */}
          <div
            className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]"
          >
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-4)]">
                Knowledge Library
              </h3>
              <p className="text-[13px] font-normal text-[var(--text-4)] mt-0.5">
                {docs.length} active documents indexed in vector database
              </p>
            </div>

            {/* Total count badges */}
            <div className="flex items-center gap-2">
              <span className="badge badge-success text-xs">
                {docs.length} Active
              </span>
            </div>
          </div>

          {/* Cards content or loaders */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <OrbitLoader size={40} />
              <p className="text-sm font-semibold text-[var(--text-4)]">
                Syncing with vector index...
              </p>
            </div>
          ) : docs.length === 0 ? (
            <div className="text-center py-20 px-4 space-y-3.5">
              <div className="h-10 w-10 rounded-lg flex items-center justify-center mx-auto bg-[var(--bg-2)] border border-[var(--border)] text-[var(--text-4)]">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25" />
                </svg>
              </div>
              <div className="space-y-1">
                <p className="text-base font-semibold text-[var(--text-2)]">
                  No documents found
                </p>
                <p className="text-sm text-[var(--text-4)] max-w-[280px] mx-auto leading-relaxed">
                  Upload your first document to begin building a searchable knowledge base.
                </p>
              </div>
              <button
                onClick={triggerUploadClick}
                className="grad-btn px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer inline-flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Upload your first document
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-5 bg-[var(--bg-2)]/30">
              {docs.map((doc) => {
                const lastDot = doc.file_name.lastIndexOf(".");
                const ext = lastDot !== -1 ? doc.file_name.substring(lastDot + 1).toUpperCase() : "PDF";
                const extStyle = EXT_STYLE[ext] ?? { bg: "var(--bg-2)", color: "var(--text-2)" };
                const formattedDate = new Date(doc.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                });

                return (
                  <div
                    key={doc.id}
                    className="glass-card rounded-xl p-4.5 flex flex-col justify-between h-[168px] relative group hover:border-slate-300 dark:hover:border-zinc-700/80"
                  >
                    {/* Document details */}
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="text-[11px] font-bold px-1.5 py-0.5 rounded"
                            style={{ background: extStyle.bg, color: extStyle.color }}
                          >
                            {ext}
                          </span>
                          <span
                            className="text-[16px] font-semibold text-[var(--text-2)] truncate"
                            title={doc.file_name}
                          >
                            {doc.file_name}
                          </span>
                        </div>

                        <span className="badge badge-success flex-shrink-0 text-[10px] py-0.5 px-1.5">
                          Synced
                        </span>
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-[12px] font-medium text-[var(--text-4)]">Size</span>
                          <span className="text-[13px] font-medium text-[var(--text-2)]">{formatBytes(doc.file_size)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[12px] font-medium text-[var(--text-4)]">Segments</span>
                          <span className="text-[13px] font-medium text-[var(--text-2)]">{Math.max(1, Math.round(doc.file_size / 800))} chunks</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[12px] font-medium text-[var(--text-4)]">Uploaded</span>
                          <span className="text-[13px] font-medium text-[var(--text-2)]">{formattedDate}</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions panel */}
                    <div
                      className="flex items-center justify-between pt-3 mt-auto border-t border-[var(--border)]"
                    >
                      <div className="flex items-center gap-2 text-xs font-medium text-[var(--text-3)]">
                        <a
                          href={doc.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-[var(--text-1)] transition-colors"
                        >
                          Preview
                        </a>
                        <span className="text-[var(--border)]">·</span>

                        <Link
                          href="/chat"
                          className="hover:text-[var(--text-1)] transition-colors"
                        >
                          Ask AI
                        </Link>
                        <span className="text-[var(--border)]">·</span>

                        <button
                          onClick={() => alert("Reindexing document...")}
                          className="hover:text-[var(--text-1)] transition-colors cursor-pointer"
                        >
                          Reindex
                        </button>
                      </div>

                      {/* Delete icon */}
                      <button
                        onClick={() => handleDelete(doc)}
                        className="p-1 rounded hover:bg-red-500/10 text-[var(--text-4)] hover:text-red-500 transition-colors cursor-pointer inline-flex items-center justify-center"
                        title="Delete document"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
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

        {/* RAG Search Test Section (Temporary Developer Tool) */}
        <div className="glass-card rounded-xl overflow-hidden border border-dashed border-zinc-500/50 p-5 mt-6 bg-[var(--bg-2)]/20">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3 mb-4">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--indigo)] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[var(--indigo)] animate-pulse" />
                RAG Search Test (Developer Tool)
              </h3>
              <p className="text-[12px] text-[var(--text-4)] mt-0.5">
                Directly query the vector database using pgvector.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-zinc-500/10 text-[var(--text-3)] border border-[var(--border)]">
                Provider: {activeProvider}
              </span>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-[var(--indigo)] border border-indigo-500/20">
                Temporary Panel
              </span>
            </div>
          </div>

          <form onSubmit={handleSearch} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 space-y-1.5">
                <label className="text-xs font-semibold text-[var(--text-3)]" htmlFor="rag-question">
                  Question *
                </label>
                <input
                  id="rag-question"
                  type="text"
                  placeholder="Enter your test question here..."
                  value={searchQuestion}
                  onChange={(e) => setSearchQuestion(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg-2)] text-[var(--text-1)] focus:outline-none focus:border-[var(--indigo)] transition-colors"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[var(--text-3)]" htmlFor="rag-doc-id">
                  Current Document
                </label>
                <select
                  id="rag-doc-id"
                  value={searchDocId}
                  onChange={(e) => setSearchDocId(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg-2)] text-[var(--text-1)] focus:outline-none focus:border-[var(--indigo)] transition-colors"
                >
                  <option value="">All Documents</option>
                  {docs.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.file_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isSearching || !searchQuestion.trim()}
                className="grad-btn px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {isSearching ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Searching Vector Index...
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    Search Chunks
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Search Error banner */}
          {searchError && (
            <div className="mt-4 p-3 rounded-lg border border-red-500/20 bg-red-500/5 text-red-500 text-xs font-medium">
              Error querying retrieval API: {searchError}
            </div>
          )}

          {/* Search Results */}
          {!isSearching && searchAnswer && (
            <div className="mt-6 space-y-5 border-t border-[var(--border)] pt-5">
              {/* AI Answer Card */}
              <div className="glass-card p-5 bg-[var(--bg-2)]/40 rounded-xl space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-md flex items-center justify-center bg-[var(--indigo)] text-white">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 21l8.904-4.452M18 10.5V18a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18V6a2.25 2.25 0 012.25-2.25h9.75m1.5 0v3m0-3h3m-3 9h.008v.008H18.75V12" />
                    </svg>
                  </div>
                  <h4 className="text-sm font-bold text-[var(--text-1)]">
                    AI Answer
                  </h4>
                </div>
                <p className="text-[14px] text-[var(--text-2)] leading-relaxed whitespace-pre-wrap">
                  {searchAnswer}
                </p>
              </div>

              {/* Sources */}
              {searchSources.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-3)] block">
                    Sources
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {searchSources.map((source, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-[var(--bg-2)] text-[var(--text-2)] border border-[var(--border)]"
                      >
                        <span className="text-[var(--text-4)]">Page</span>
                        <strong className="font-mono text-[var(--text-1)]">{source.page_number}</strong>
                        <span className="text-[var(--border)]">|</span>
                        <span className="text-[var(--text-4)]">Similarity:</span>
                        <span className="font-mono text-[var(--indigo)]">{(source.similarity * 100).toFixed(0)}%</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Retrieved Chunks (collapsible developer section) */}
              <div className="border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--bg-3)]/10">
                <button
                  type="button"
                  onClick={() => setShowDeveloperPanel(!showDeveloperPanel)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-[var(--bg-2)]/30 hover:bg-[var(--bg-2)]/60 text-xs font-semibold text-[var(--text-3)] transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-[var(--text-4)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                    </svg>
                    Retrieved Chunks (Developer Diagnostics)
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-[var(--bg-3)] border border-[var(--border)] text-[10px] font-mono">
                      {searchSources.length} Chunks
                    </span>
                    <svg
                      className={`w-3.5 h-3.5 transform transition-transform duration-200 ${showDeveloperPanel ? "rotate-180" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </span>
                </button>

                {showDeveloperPanel && (
                  <div className="p-4 border-t border-[var(--border)] bg-[var(--bg-2)]/10 space-y-3">
                    {searchSources.map((result, idx) => (
                      <div
                        key={idx}
                        className="p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-2)]/40 hover:bg-[var(--bg-2)]/60 transition-all space-y-2.5"
                      >
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <div className="flex items-center gap-2">
                            <span className="text-[var(--text-4)]">Page:</span>
                            <span className="px-1.5 py-0.5 rounded bg-[var(--bg-3)] text-[var(--text-2)] border border-[var(--border)] font-mono">
                              {result.page_number}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[var(--text-4)]">Similarity:</span>
                            <span
                              className={`px-1.5 py-0.5 rounded font-mono border ${
                                result.similarity > 0.7
                                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                  : result.similarity > 0.4
                                  ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                  : "bg-zinc-500/10 text-[var(--text-3)] border-[var(--border)]"
                              }`}
                            >
                              {(result.similarity * 100).toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        <p className="text-[13px] text-[var(--text-2)] leading-relaxed bg-[var(--bg-1)] p-3 rounded-lg border border-[var(--border)] font-mono whitespace-pre-wrap max-h-[160px] overflow-y-auto">
                          {result.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Empty state search results */}
          {!isSearching && !searchAnswer && searchQuestion.trim() && !searchError && (
            <div className="mt-4 text-center py-6 border border-dashed border-[var(--border)] rounded-lg text-xs text-[var(--text-4)]">
              No results returned. Try another question or check if embeddings are generated.
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
