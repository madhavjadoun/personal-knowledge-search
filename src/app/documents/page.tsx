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

/* Color config per extension */
const EXT_STYLE: Record<string, { bg: string; color: string }> = {
  PDF:  { bg: "rgba(239,68,68,0.08)",   color: "#DC2626" },
  TXT:  { bg: "rgba(59,130,246,0.08)",  color: "#2563EB" },
  SQL:  { bg: "rgba(16,185,129,0.08)",  color: "#059669" },
  MD:   { bg: "rgba(124,58,237,0.08)",  color: "#7C3AED" },
  JSON: { bg: "rgba(245,158,11,0.08)",  color: "#D97706" },
  PY:   { bg: "rgba(6,182,212,0.08)",   color: "#0891B2" },
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
      const { error: dbError } = await supabase
        .from("documents")
        .insert([{
          user_id: user.id,
          title: file.name,
          file_name: file.name,
          file_url: publicUrl,
          file_size: file.size,
          created_at: new Date().toISOString()
        }]);

      if (dbError) {
        console.error("[Documents Upload] DB insert error:", JSON.stringify(dbError, null, 2));
        throw dbError;
      }

      console.log("[Documents Upload] DB insert succeeded.");
      clearInterval(progressInterval);
      setProgress(100);
      await fetchDocs();
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

      // 1. Delete from Supabase Storage
      if (storagePath) {
        await supabase.storage.from("documents").remove([storagePath]);
      }

      // 2. Delete row from 'documents' table
      // RLS ensures the user can only delete their own rows
      const { error: dbError } = await supabase
        .from("documents")
        .delete()
        .eq("id", doc.id)
        .eq("user_id", user.id); // extra safety filter

      if (dbError) throw dbError;

      // 3. Refresh list
      await fetchDocs();
    } catch (err) {
      console.error("Delete failed:", err);
      const errMsg = err && typeof err === "object" && "message" in err ? String((err as Record<string, unknown>).message) : String(err);
      alert("Failed to delete document: " + errMsg);
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
            className="flex items-center gap-4 px-5 py-4 rounded-xl border border-blue-500/10 bg-blue-500/5"
          >
            <OrbitLoader size={36} />

            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Indexing <span className="text-blue-600 dark:text-blue-400">{uploadName}</span>
              </p>
              <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">
                Parsing text chunks and building vector embeddings...
              </p>
              <div className="mt-2 h-1 rounded-full overflow-hidden bg-slate-200 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <span className="text-sm font-bold font-mono text-blue-600 dark:text-blue-400">
              {progress}%
            </span>
          </div>
        )}

        {/* Documents Cards Grid wrapper */}
        <div className="glass-card rounded-xl overflow-hidden border border-slate-200 dark:border-zinc-800">
          {/* Section header */}
          <div
            className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-zinc-800"
          >
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                Knowledge Library
              </h3>
              <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">
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
              <p className="text-sm font-semibold text-slate-400 dark:text-zinc-500">
                Syncing with vector index...
              </p>
            </div>
          ) : docs.length === 0 ? (
            <div className="text-center py-20 px-4 space-y-3.5">
              <div className="h-10 w-10 rounded-lg flex items-center justify-center mx-auto bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-400 dark:text-zinc-500">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25" />
                </svg>
              </div>
              <div className="space-y-1">
                <p className="text-base font-semibold text-slate-800 dark:text-slate-200">
                  No documents found
                </p>
                <p className="text-sm text-slate-400 dark:text-zinc-500 max-w-[280px] mx-auto leading-relaxed">
                  Upload notes, PDFs, or code files to construct your semantic AI search space.
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-5 bg-slate-50/30 dark:bg-black/10">
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
                    className="glass-card rounded-xl p-4.5 flex flex-col justify-between h-[155px] relative group hover:border-slate-300 dark:hover:border-zinc-700/80"
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
                            className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate"
                            title={doc.file_name}
                          >
                            {doc.file_name}
                          </span>
                        </div>
                        
                        <span className="badge badge-success flex-shrink-0 text-[11px] py-0.5 px-1.5">
                          Ready
                        </span>
                      </div>

                      <div className="text-xs text-slate-400 dark:text-zinc-500 space-y-1 font-mono">
                        <p>Size: {formatBytes(doc.file_size)}</p>
                        <p>Uploaded: {formattedDate}</p>
                      </div>
                    </div>

                    {/* Actions panel */}
                    <div
                      className="flex items-center justify-between pt-3 mt-auto border-t border-slate-100 dark:border-zinc-800/80"
                    >
                      <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                        <a
                          href={doc.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          Preview
                        </a>
                        <span className="text-slate-300 dark:text-zinc-800">·</span>
                        
                        <Link
                          href="/chat"
                          className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          Ask AI
                        </Link>
                        <span className="text-slate-300 dark:text-zinc-800">·</span>

                        <button
                          onClick={() => alert("Reindexing document...")}
                          className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                        >
                          Reindex
                        </button>
                      </div>

                      {/* Delete icon */}
                      <button
                        onClick={() => handleDelete(doc)}
                        className="p-1 rounded hover:bg-red-500/10 text-slate-400 hover:text-red-500 transition-colors cursor-pointer inline-flex items-center justify-center"
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
      </div>
    </AppShell>
  );
}
