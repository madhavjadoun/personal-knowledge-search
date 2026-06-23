"use client";

import { useState, useEffect, useRef } from "react";
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
      const { data, error } = await supabase
        .from("documents")
        .select("*")
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
      // 1. Upload to Supabase Storage bucket 'documents'
      const storagePath = `uploads/${Date.now()}_${file.name}`;
      const { error: storageError } = await supabase.storage
        .from("documents")
        .upload(storagePath, file, {
          cacheControl: "3600",
          upsert: false
        });

      if (storageError) throw storageError;

      // 2. Get uploaded file public URL
      const { data: { publicUrl } } = supabase.storage
        .from("documents")
        .getPublicUrl(storagePath);

      // 3. Save metadata into 'documents' table
      const { error: dbError } = await supabase
        .from("documents")
        .insert([
          {
            file_name: file.name,
            file_url: publicUrl,
            file_size: file.size,
            created_at: new Date().toISOString()
          }
        ]);

      if (dbError) throw dbError;

      clearInterval(progressInterval);
      setProgress(100);
      
      // Refresh documents
      await fetchDocs();

      setTimeout(() => {
        setUploading(false);
        setProgress(0);
      }, 1000);

    } catch (err: any) {
      clearInterval(progressInterval);
      console.error("Upload failed:", err);
      alert("Upload failed: " + (err.message || "Unknown error"));
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
      // Parse storage path from public URL
      const bucketMarker = "/documents/";
      const markerIndex = doc.file_url.indexOf(bucketMarker);
      let storagePath = "";
      if (markerIndex !== -1) {
        storagePath = decodeURIComponent(doc.file_url.substring(markerIndex + bucketMarker.length));
      } else {
        storagePath = decodeURIComponent(doc.file_url.split("/").pop() || "");
      }

      // 1. Delete from Supabase Storage
      if (storagePath) {
        await supabase.storage.from("documents").remove([storagePath]);
      }

      // 2. Delete row from 'documents' table
      const { error: dbError } = await supabase
        .from("documents")
        .delete()
        .eq("id", doc.id);

      if (dbError) throw dbError;

      // 3. Refresh list
      await fetchDocs();
    } catch (err: any) {
      console.error("Delete failed:", err);
      alert("Failed to delete document: " + (err.message || "Unknown error"));
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
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer"
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
        </>
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
            <OrbitLoader size={36} />

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium" style={{ color: "var(--text-1)", letterSpacing: "-0.014em" }}>
                Indexing <span style={{ color: "var(--indigo)", fontWeight: 600 }}>{uploadName}</span>
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
                Uploading to storage and indexing in Supabase…
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
                {docs.length} indexed files
              </p>
            </div>

            {/* Mini stat pills */}
            <div className="flex items-center gap-2">
              <span
                className="text-[10px] font-semibold px-2 py-1 rounded-lg"
                style={{ background: "rgba(5,150,105,0.08)", color: "#059669", border: "1px solid rgba(5,150,105,0.14)" }}
              >
                {docs.length} active
              </span>
              <span
                className="text-[10px] font-semibold px-2 py-1 rounded-lg"
                style={{ background: "var(--bg-2)", color: "var(--text-2)", border: "1px solid var(--border)" }}
              >
                {formatBytes(totalStorage)} storage
              </span>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <OrbitLoader size={40} />
                <p className="text-xs font-semibold" style={{ color: "var(--text-3)" }}>
                  Connecting to Supabase Database...
                </p>
              </div>
            ) : docs.length === 0 ? (
              <div className="text-center py-16 space-y-2">
                <p className="text-sm font-medium" style={{ color: "var(--text-2)" }}>
                  No documents found
                </p>
                <p className="text-xs" style={{ color: "var(--text-3)" }}>
                  Upload your first file to get started indexing.
                </p>
              </div>
            ) : (
              <table className="w-full" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {["File", "Type", "Size", "Uploaded At", "Status", "Actions"].map((h) => (
                      <th
                        key={h}
                        className={`px-5 py-2.5 text-[9px] font-semibold uppercase tracking-widest ${
                          h === "Actions" ? "text-right" : "text-left"
                        }`}
                        style={{ color: "var(--text-3)" }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {docs.map((doc) => {
                    const lastDot = doc.file_name.lastIndexOf(".");
                    const name = lastDot !== -1 ? doc.file_name.substring(0, lastDot) : doc.file_name;
                    const ext = lastDot !== -1 ? doc.file_name.substring(lastDot + 1).toUpperCase() : "PDF";
                    const extStyle = EXT_STYLE[ext] ?? { bg: "var(--bg-2)", color: "var(--text-2)" };
                    const formattedDate = new Date(doc.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    });

                    return (
                      <tr
                        key={doc.id}
                        style={{ borderBottom: "1px solid var(--border)", transition: "background 0.12s" }}
                        className="hover:bg-zinc-500/2"
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
                              className="text-xs font-medium truncate max-w-[240px]"
                              style={{ color: "var(--text-1)" }}
                            >
                              {doc.file_name}
                            </span>
                          </div>
                        </td>

                        {/* Extension badge */}
                        <td className="px-5 py-3">
                          <span
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded-md"
                            style={{ background: extStyle.bg, color: extStyle.color }}
                          >
                            {ext}
                          </span>
                        </td>

                        <td className="px-5 py-3 text-xs font-mono" style={{ color: "var(--text-2)" }}>
                          {formatBytes(doc.file_size)}
                        </td>
                        <td className="px-5 py-3 text-xs" style={{ color: "var(--text-3)" }}>
                          {formattedDate}
                        </td>

                        {/* Status */}
                        <td className="px-5 py-3">
                          <span className="badge badge-success">
                            <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
                              <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                            </svg>
                            Ready
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-3 text-right">
                          <button
                            onClick={() => handleDelete(doc)}
                            className="p-1.5 rounded-lg hover:bg-red-500/10 text-zinc-400 hover:text-red-500 transition-colors cursor-pointer inline-flex items-center justify-center"
                            title="Delete document"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
