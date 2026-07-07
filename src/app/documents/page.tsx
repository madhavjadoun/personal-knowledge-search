"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import AppShell from "@/components/app/AppShell";
import OrbitLoader from "@/components/app/OrbitLoader";
import { supabase } from "@/lib/supabase";
import FormattedDateTime from "@/components/shared/FormattedDateTime";

interface SupabaseDoc {
  id: string;
  title?: string | null;
  file_name: string;
  file_url: string;
  file_size: number;
  created_at: string;
}




/* Format bytes helper */
function formatBytes(bytes: number, decimals = 1) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

const STORAGE_BUCKET = "documents";

function getDocumentDisplayName(doc: SupabaseDoc) {
  return doc.title?.trim() || doc.file_name;
}

export default function DocumentsPage() {
  const [docs, setDocs] = useState<SupabaseDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [progress, setProgress] = useState(0);
  const [userId, setUserId] = useState<string>("");
  const [docToDelete, setDocToDelete] = useState<SupabaseDoc | null>(null);
  const [toast, setToast] = useState<{
    type: "error" | "success" | "warning";
    title: string;
    subtitle?: string;
    action?: string;
  } | null>(null);

  const showToast = (
    title: string,
    type: "error" | "success" | "warning" = "success",
    subtitle?: string,
    action?: string,
  ) => {
    setToast({ title, type, subtitle, action });
    setTimeout(() => setToast(null), type === "error" ? 6000 : 4000);
  };

  /**
   * Maps raw backend error strings to human-friendly toast payloads.
   */
  const parseUploadError = (raw: string): { title: string; subtitle: string; action?: string } => {
    const msg = raw.toLowerCase();
    if (msg.includes("no readable text") || msg.includes("ocr failed") || msg.includes("no text")) {
      return {
        title: "Couldn't read the image",
        subtitle: "No readable text was detected. Try uploading a clearer image with visible printed text.",
        action: "Choose Another Image",
      };
    }
    if (msg.includes("unsupported file type") || msg.includes("unsupported image type") || msg.includes("not a valid pdf")) {
      return {
        title: "Unsupported File",
        subtitle: "Only PDF, PNG, JPG, JPEG and WEBP are supported.",
      };
    }
    if (msg.includes("too large") || msg.includes("413") || msg.includes("payload too large")) {
      return {
        title: "File Too Large",
        subtitle: "Maximum upload size is 25 MB. Please compress the file and try again.",
      };
    }
    if (msg.includes("password") || msg.includes("encrypted")) {
      return {
        title: "Password-Protected File",
        subtitle: "Please remove the password from this file before uploading.",
      };
    }
    if (msg.includes("no pages") || msg.includes("empty")) {
      return {
        title: "Empty File",
        subtitle: "The uploaded file appears to be empty or has no readable pages.",
      };
    }
    if (msg.includes("rate limit") || msg.includes("too many")) {
      return {
        title: "Too Many Uploads",
        subtitle: "You've hit the upload limit. Please wait a moment before trying again.",
      };
    }
    return {
      title: "Upload Failed",
      subtitle: "Something went wrong while uploading. Please try again.",
    };
  };

  const getStoragePath = (doc: SupabaseDoc): string => {
    // If the file_url is already just the relative storage path (doesn't start with HTTP/HTTPS)
    if (doc.file_url && !doc.file_url.startsWith("http://") && !doc.file_url.startsWith("https://")) {
      return doc.file_url;
    }
    const legacyMarker = `/${STORAGE_BUCKET}/`;
    const markerIndex = doc.file_url.indexOf(legacyMarker);
    if (markerIndex !== -1) {
      const afterBucket = decodeURIComponent(doc.file_url.substring(markerIndex + legacyMarker.length));
      if (userId && afterBucket.startsWith(userId + "/")) {
        return afterBucket;
      }
      return userId ? `${userId}/${doc.file_name}` : doc.file_name;
    }
    return userId ? `${userId}/${doc.file_name}` : doc.file_name;
  };

  const handlePreview = async (doc: SupabaseDoc, e: React.MouseEvent) => {
    e.preventDefault();
    try {
      if (!userId) {
        showToast("You must be signed in to preview documents.", "error");
        return;
      }

      const storagePath = getStoragePath(doc);

      // Check if the file exists in Supabase Storage before opening
      const pathParts = storagePath.split("/");
      const folder = pathParts.length > 1 ? pathParts.slice(0, -1).join("/") : "";
      const filename = pathParts[pathParts.length - 1];

      const { data: files, error: listError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .list(folder || undefined, {
          search: filename
        });

      const exists = files?.some(f => f.name === filename);

      if (listError || !exists) {
        showToast("This document no longer exists in storage.", "error");
        return;
      }

      // Fetch bucket metadata to see if it is public or private
      let fileUrl = "";
      try {
        const { data: bucketInfo } = await supabase.storage.getBucket(STORAGE_BUCKET);
        if (bucketInfo?.public) {
          const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
          fileUrl = data.publicUrl;
        } else {
          const { data, error: signError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .createSignedUrl(storagePath, 300);
          if (signError || !data?.signedUrl) throw signError || new Error("No signed url");
          fileUrl = data.signedUrl;
        }
      } catch {
        // Fallback: Try generating signed URL first, if fails fallback to public URL
        const { data, error: signError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .createSignedUrl(storagePath, 300);
        if (!signError && data?.signedUrl) {
          fileUrl = data.signedUrl;
        } else {
          const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
          fileUrl = data.publicUrl;
        }
      }

      // Open the URL in a new tab
      window.open(fileUrl, "_blank", "noopener,noreferrer");

    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.error("Preview failed:", err);
      }
      showToast("Error loading document preview.", "error");
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocs = async () => {
    try {
      setLoading(true);
      // Artificial delay of 1 second for loader visualization
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Get current user — required for user-scoped query
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("user_id", user.id)          // Only fetch this user's documents
        .order("created_at", { ascending: false });

      if (error) throw error;
      setDocs(data || []);
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.error("Error fetching documents:", err);
      }
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
      const token = data.session?.access_token;
      const authenticatedUserId = data.session?.user?.id || userId;

      if (error || !token || !authenticatedUserId) {
        clearInterval(progressInterval);
        setUploading(false);
        setProgress(0);
        showToast("Session Expired", "error", "Please sign in again.");
        setTimeout(() => {
          window.location.href = "/login";
        }, 2500);
        return;
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("user_id", authenticatedUserId);

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 
        (process.env.NODE_ENV === "production" 
          ? "https://quizgenerator-production.up.railway.app" 
          : "http://127.0.0.1:8000");
      const uploadUrl = `${apiUrl}/documents/upload`;
      const uploadHeaders = {
        "Authorization": `Bearer ${token}`,
      };

      const processResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: uploadHeaders,
        body: formData
      });

      if (!processResponse.ok) {
        const errText = await processResponse.text();
        let errMsg = errText;
        try {
          const errObj = JSON.parse(errText);
          if (errObj && typeof errObj === "object" && "detail" in errObj) {
            errMsg = String(errObj.detail);
          }
        } catch {}
        throw new Error(errMsg || `Document upload/processing failed with status: ${processResponse.status}`);
      }

      clearInterval(progressInterval);
      setProgress(100);
      await fetchDocs();

      // ── Success feedback ──
      const isImage = /\.(png|jpe?g|webp)$/i.test(file.name);
      showToast(
        "Upload Successful",
        "success",
        isImage
          ? "Image indexed successfully. Ready for quiz generation."
          : "Document indexed successfully. Ready for quiz generation.",
      );

      setTimeout(() => { setUploading(false); setProgress(0); }, 1000);

    } catch (err) {
      clearInterval(progressInterval);
      if (process.env.NODE_ENV !== "production") {
        console.error("Upload failed:", err);
      }
      const rawMsg = err && typeof err === "object" && "message" in err ? String((err as Record<string, unknown>).message) : String(err);
      const { title, subtitle, action } = parseUploadError(rawMsg);
      showToast(title, "error", subtitle, action);
      setUploading(false);
      setProgress(0);
    } finally {
      // Reset input value to allow uploading same file again
      if (e.target) e.target.value = "";
    }
  };

  const handleDelete = async (doc: SupabaseDoc) => {
    try {
      if (!userId) throw new Error("You must be signed in to delete documents.");

      const storagePath = getStoragePath(doc);

      // 1. Delete all chunks belonging to this document (prevent orphan data)
      const { error: chunkDeleteError } = await supabase
        .from("chunks")
        .delete()
        .eq("document_id", doc.id)
        .eq("user_id", userId);

      if (chunkDeleteError) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("Failed to delete chunks (may have CASCADE):", chunkDeleteError);
        }
      }

      // 2. Delete from Supabase Storage
      if (storagePath) {
        await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
      }

      // 3. Delete row from 'documents' table
      // RLS ensures the user can only delete their own rows
      const { error: dbError } = await supabase
        .from("documents")
        .delete()
        .eq("id", doc.id)
        .eq("user_id", userId); // extra safety filter

      if (dbError) throw dbError;

      // 4. Refresh list
      await fetchDocs();
      showToast("Document deleted successfully.", "success");
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.error("Delete failed:", err);
      }
      const errMsg = err && typeof err === "object" && "message" in err ? String((err as Record<string, unknown>).message) : String(err);
      showToast("Failed to delete document: " + errMsg, "error");
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
            accept="application/pdf,.pdf,image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
            className="hidden"
          />
          <button
            onClick={triggerUploadClick}
            disabled={uploading}
            className="grad-btn flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer shadow-sm hover:shadow hover:-translate-y-0.5 active:translate-y-0 max-w-full min-w-0"
          >
            {uploading ? (
              <svg className="w-4 h-4 animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            )}
            <span className="truncate">{uploading ? `Indexing ${progress}%` : "Upload File"}</span>
          </button>
        </>
      }
    >
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Ingestion progress banner */}
        {uploading && (
          <div
            className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-4 sm:px-6 py-4 sm:py-5 rounded-xl border border-[var(--border)] bg-[var(--bg-2)]/30"
          >
            <OrbitLoader size={36} />

            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--text-1)]">
                Indexing <span className="font-normal text-[var(--text-3)]">{uploadName}</span>
              </p>
              <p className="text-xs font-normal text-[var(--text-4)] mt-0.5 leading-relaxed">
                Parsing text chunks and building vector embeddings...
              </p>
              <div className="mt-2 h-1 rounded-full overflow-hidden bg-[var(--bg-3)]">
                <div
                  className="h-full rounded-full bg-[var(--indigo)] transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <span className="text-sm font-semibold font-mono text-[var(--text-1)] tabular-nums flex-shrink-0 self-end sm:self-auto">
              {progress}%
            </span>
          </div>
        )}

        {/* Documents Cards Grid wrapper */}
        <div className="border border-[#E5E7EB] dark:border-slate-800 bg-white dark:bg-[#151d2f] rounded-xl overflow-hidden">
          {/* Section header with compact statistics pills */}
          <div
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 sm:px-6 py-4 sm:py-5 border-b border-[var(--border)]"
          >
            <div>
              <h3 className="text-card-label text-[var(--text-1)]">
                Knowledge Library
              </h3>
              <p className="text-[13px] font-normal text-[var(--text-3)] mt-0.5 leading-relaxed">
                Active documents indexed in vector database
              </p>
            </div>

            {/* Statistics compact pills */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg-2)] border border-[var(--border)] text-[var(--text-3)]">
                <span>Documents</span>
                <span className="font-semibold font-mono tabular-nums text-[var(--text-1)]">{docs.length}</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg-2)] border border-[var(--border)] text-[var(--text-3)]">
                <span>Storage</span>
                <span className="font-semibold font-mono tabular-nums text-[var(--text-1)]">{formatBytes(totalStorage, 0)}</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg-2)] border border-[var(--border)] text-[var(--text-3)]">
                <span>Chunks</span>
                <span className="font-semibold font-mono tabular-nums text-[var(--text-1)]">{docs.reduce((sum, doc) => sum + Math.max(1, Math.round(doc.file_size / 800)), 0)}</span>
              </div>
            </div>
          </div>

          {/* Cards content or loaders */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <OrbitLoader size={40} />
              <p className="text-sm font-medium text-[var(--text-4)]">
                Syncing with vector index...
              </p>
            </div>
          ) : docs.length === 0 ? (
            <div className="text-center py-24 px-4 space-y-4">
              <div className="h-12 w-12 rounded-xl flex items-center justify-center mx-auto bg-[var(--bg-2)] border border-[var(--border)] text-[var(--text-4)]">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25" />
                </svg>
              </div>
              <div className="space-y-1">
                <p className="text-base font-semibold text-[var(--text-1)] tracking-tight">
                  No documents found
                </p>
                <p className="text-sm font-normal text-[var(--text-3)] max-w-[280px] mx-auto leading-relaxed">
                  Upload your first document to begin building a searchable knowledge base.
                </p>
              </div>
              <button
                onClick={triggerUploadClick}
                className="grad-btn px-5 py-2.5 rounded-xl text-sm font-semibold cursor-pointer inline-flex items-center gap-1.5 shadow-sm hover:shadow"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Upload your first document
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 p-4 sm:p-6 bg-[var(--bg-2)]/30">
              {docs.map((doc) => {
                const displayName = getDocumentDisplayName(doc);
                const lastDot = doc.file_name.lastIndexOf(".");
                const ext = lastDot !== -1 ? doc.file_name.substring(lastDot + 1).toUpperCase() : "PDF";
                const chunksCount = Math.max(1, Math.round(doc.file_size / 800));

                return (
                  <div
                    key={doc.id}
                    className="bg-white dark:bg-[#151d2f] border border-[#E5E7EB] dark:border-slate-800 rounded-xl px-4 sm:px-6 py-4 flex flex-col justify-between lg:h-[148px] relative group hover:-translate-y-0.5 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-300 min-w-0 overflow-hidden"
                  >
                    {/* Top Row: Ext badge, Filename, Synced status */}
                    <div className="space-y-3 sm:space-y-4 min-w-0">
                      <div className="flex items-start sm:items-center justify-between gap-2 sm:gap-3 min-w-0">
                        <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1">
                          <span
                            className="w-9 h-5 text-[10px] font-bold uppercase tracking-wider rounded border flex items-center justify-center flex-shrink-0 bg-[var(--bg-2)] border border-[var(--border)] text-[var(--text-3)]"
                          >
                            {ext}
                          </span>
                          <span
                            className="text-sm sm:text-[15px] font-semibold text-[var(--text-1)] truncate leading-6 min-w-0 tracking-tight"
                            title={displayName}
                          >
                            {displayName}
                          </span>
                        </div>

                        <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-[var(--bg-2)] border border-[var(--border)] text-[var(--text-4)] px-1.5 py-0.5 rounded flex-shrink-0 leading-4">
                          ✓ Synced
                        </span>
                      </div>

                      {/* Compact Metadata Row */}
                      <div className="text-xs sm:text-[13px] font-normal text-[var(--text-4)] flex flex-wrap items-center gap-5 md:pl-[50px] leading-relaxed min-w-0">
                        <span className="whitespace-nowrap">{formatBytes(doc.file_size, 0)}</span>
                        <span className="whitespace-nowrap">{chunksCount} chunks</span>
                        <span className="whitespace-nowrap"><FormattedDateTime date={doc.created_at} /></span>
                      </div>
                    </div>

                    {/* Actions Panel */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 mt-auto border-t border-[var(--border)] w-full min-w-0">
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4 md:pl-[50px] min-w-0 flex-1">
                        <button
                          onClick={(e) => handlePreview(doc, e)}
                          className="flex items-center justify-center sm:justify-start gap-1.5 text-[13px] font-semibold text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors group/preview cursor-pointer bg-transparent border-0 p-0 flex-shrink-0"
                        >
                          <svg className="w-4 h-4 flex-shrink-0 text-[var(--text-4)] group-hover/preview:text-[var(--text-2)] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span>Preview</span>
                        </button>

                        <Link
                          href={`/chat?docId=${doc.id}`}
                          className="flex items-center justify-center gap-1.5 px-3 sm:px-4 h-8 text-[11px] font-semibold text-white dark:text-[var(--text-inv)] bg-[var(--indigo)] hover:bg-[var(--indigo)]/90 rounded-lg transition-all cursor-pointer shadow-sm hover:shadow text-center leading-none min-w-0 w-full sm:w-auto"
                        >
                          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 21l-.813-5.096L3 15l5.187-.904L9 9l.813 5.096L15 15l-5.187.904zM18 10.5l-.5 3-.5-3-3-.5 3-.5.5-3 .5 3 3 .5-3 .5zM19 19.5l-.25 1.5-.25-1.5-1.5-.25 1.5-.25.25-1.5.25 1.5 1.5.25-1.5.25z" />
                          </svg>
                          <span className="truncate">Generate Quiz</span>
                        </Link>
                      </div>

                      <button
                        onClick={() => setDocToDelete(doc)}
                        className="w-8 h-8 rounded-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700/60 shadow-sm flex items-center justify-center text-[var(--text-4)] hover:text-red-500 hover:bg-red-500/10 hover:border-red-500/20 opacity-100 sm:opacity-0 scale-100 sm:scale-95 sm:group-hover:opacity-100 sm:group-hover:scale-100 transition-all duration-200 cursor-pointer flex-shrink-0 self-end sm:self-auto"
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

      {/* Delete Confirmation Modal */}
      {docToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs">
          <div className="glass-card rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl border border-[var(--border)] animate-in fade-in zoom-in-95 duration-200 bg-[var(--surface-2)]">
            <h3 className="text-base font-semibold text-[var(--text-1)] tracking-tight">Delete Document</h3>
            <p className="text-sm font-normal text-[var(--text-3)] mt-2 leading-relaxed break-words">
              Are you sure you want to delete <span className="font-semibold text-[var(--text-1)]">&quot;{getDocumentDisplayName(docToDelete)}&quot;</span>? This action cannot be undone.
            </p>
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 mt-5">
              <button
                onClick={() => setDocToDelete(null)}
                className="px-4 py-2 text-xs font-semibold rounded-lg hover:bg-black/5 dark:hover:bg-white/5 border border-[var(--border)] transition-colors cursor-pointer text-[var(--text-2)]"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const doc = docToDelete;
                  setDocToDelete(null);
                  await handleDelete(doc);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-5 sm:max-w-sm z-50 flex items-start gap-3 rounded-xl animate-in fade-in slide-in-from-bottom-4 duration-300 overflow-hidden"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-strong)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10)",
          }}
        >
          {/* Left accent stripe */}
          <span
            className="absolute left-0 top-0 bottom-0 w-1 flex-shrink-0"
            style={{
              background:
                toast.type === "success"
                  ? "#10b981"
                  : toast.type === "warning"
                  ? "#f59e0b"
                  : "#ef4444",
            }}
            aria-hidden="true"
          />

          {/* Pad content away from stripe */}
          <div className="flex items-start gap-3 pl-5 pr-4 py-4 w-full">
            {/* Icon */}
            <span className="mt-0.5 flex-shrink-0">
              {toast.type === "success" && (
                <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="#10b981" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              )}
              {toast.type === "warning" && (
                <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="#f59e0b" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              )}
              {toast.type === "error" && (
                <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="#ef4444" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              )}
            </span>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p
                className="text-sm font-semibold leading-tight"
                style={{ color: "var(--text-1)" }}
              >
                {toast.title}
              </p>
              {toast.subtitle && (
                <p
                  className="text-xs mt-1 leading-snug"
                  style={{ color: "var(--text-2)" }}
                >
                  {toast.subtitle}
                </p>
              )}
              {toast.action && (
                <button
                  onClick={() => { setToast(null); fileInputRef.current?.click(); }}
                  className="mt-2 text-xs font-semibold underline-offset-2 hover:underline focus:outline-none cursor-pointer transition-colors"
                  style={{ color: "var(--indigo-accent)" }}
                >
                  {toast.action}
                </button>
              )}
            </div>

            {/* Dismiss */}
            <button
              onClick={() => setToast(null)}
              className="flex-shrink-0 transition-colors cursor-pointer rounded p-0.5 -mr-0.5"
              style={{ color: "var(--text-3)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--text-1)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--text-3)")}
              aria-label="Dismiss notification"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
