"use client";

import { useState, useEffect } from "react";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";

interface SupabaseDoc {
  id: string;
  file_name: string;
  title: string;
  file_size: number;
}

interface ProcessedPage {
  pageNumber: number;
  characterCount: number;
  extractedText: string;
}

interface Chunk {
  chunkId: string;
  documentId: string;
  pageStart: number;
  pageEnd: number;
  chunkIndex: number;
  text: string;
  characterCount: number;
}

interface ChunkingResult {
  totalChunks: number;
  averageChunkSize: number;
  largestChunkSize: number;
  smallestChunkSize: number;
  chunks: Chunk[];
}

interface DocumentInfo {
  id: string;
  title: string;
  file_name: string;
  totalPages: number;
  totalCharacters: number;
}

interface ChunkEmbeddingStatus {
  status: "Pending" | "Generating" | "Completed" | "Failed";
  model: string;
  dimensions: number;
  generationTimeMs: number;
  stored: boolean;
  retryCount: number;
  error?: string;
  embedding?: number[];
}

interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  pageStart: number;
  pageEnd: number;
  chunkIndex: number;
  similarityScore: number;
  characterCount: number;
  preview: string;
  fullText: string;
}

interface RetrievalResult {
  query: string;
  provider: string;
  model: string;
  embeddingTimeMs: number;
  searchTimeMs: number;
  totalTimeMs: number;
  returnedChunks: number;
  averageSimilarity: number;
  results: RetrievedChunk[];
}

export default function DevPage() {
  // Lock this page to development environment only
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  const [docs, setDocs] = useState<SupabaseDoc[]>([]);
  const [selectedDocId, setSelectedDocId] = useState("");
  const [maxChunkCharacters, setMaxChunkCharacters] = useState(500);
  const [overlapCharacters, setOverlapCharacters] = useState(50);
  
  const [loading, setLoading] = useState(false);
  const [embeddingLoading, setEmbeddingLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Results
  const [docInfo, setDocInfo] = useState<DocumentInfo | null>(null);
  const [pages, setPages] = useState<ProcessedPage[]>([]);
  const [chunksResult, setChunksResult] = useState<ChunkingResult | null>(null);
  const [chunkEmbeddingStatuses, setChunkEmbeddingStatuses] = useState<Record<string, ChunkEmbeddingStatus>>({});
  const [forceRegenerate, setForceRegenerate] = useState(false);

  // Retrieval state
  const [retrievalQuery, setRetrievalQuery] = useState("");
  const [retrievalTopK, setRetrievalTopK] = useState(5);
  const [retrievalThreshold, setRetrievalThreshold] = useState(0.3);
  const [retrievalDocId, setRetrievalDocId] = useState("");
  const [retrievalLoading, setRetrievalLoading] = useState(false);
  const [retrievalResult, setRetrievalResult] = useState<RetrievalResult | null>(null);
  const [retrievalError, setRetrievalError] = useState<string | null>(null);
  const [expandedResults, setExpandedResults] = useState<Record<number, boolean>>({});

  // AI answer state
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiGenerationMs, setAiGenerationMs] = useState<number | null>(null);
  const [aiModel, setAiModel] = useState<string | null>(null);
  const [aiConfidence, setAiConfidence] = useState<string | null>(null);

  // UI state
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedChunks, setExpandedChunks] = useState<Record<number, boolean>>({});
  const [showPages, setShowPages] = useState(false);
  const [copyStatus, setCopyStatus] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchDocs = async () => {
      try {
        const { data, error: dbError } = await supabase
          .from("documents")
          .select("id, file_name, title, file_size")
          .order("created_at", { ascending: false });

        if (dbError) throw dbError;
        setDocs(data || []);
        if (data && data.length > 0) {
          setSelectedDocId(data[0].id);
        }
      } catch (err) {
        console.error("Failed to load documents list:", err);
        setError("Failed to fetch uploaded documents from database.");
      }
    };
    fetchDocs();
  }, []);

  const handleProcess = async () => {
    if (!selectedDocId) {
      setError("Please select a document first.");
      return;
    }

    setLoading(true);
    setError(null);
    setDocInfo(null);
    setPages([]);
    setChunksResult(null);
    setChunkEmbeddingStatuses({});
    setExpandedChunks({});

    try {
      // 1. Query database chunks to check if the document already has persisted vectors
      const { data: dbChunks, error: dbError } = await supabase
        .from("chunks")
        .select("id, document_id, page_number, chunk_index, content, embedding, created_at")
        .eq("document_id", selectedDocId)
        .order("chunk_index", { ascending: true });

      if (dbError) {
        console.warn("[Dev Page] Failed to query existing database chunks:", dbError.message);
      }

      if (dbChunks && dbChunks.length > 0) {
        console.log(`[Dev Page] Found ${dbChunks.length} persisted chunks in database. Loading directly.`);

        const docRecord = docs.find((d) => d.id === selectedDocId);

        // Fetch document pages to display in Page Viewer
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token;

        const res = await fetch("/api/dev/chunk", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({
            documentId: selectedDocId,
            maxChunkCharacters,
            overlapCharacters,
          }),
        });
        const parseData = await res.json();

        setDocInfo(parseData.documentInfo || {
          id: selectedDocId,
          title: docRecord?.title || "Document",
          file_name: docRecord?.file_name || "document.pdf",
          totalPages: parseData.documentInfo?.totalPages || 1,
          totalCharacters: dbChunks.reduce((sum, c) => sum + c.content.length, 0),
        });

        setPages(parseData.pages || []);

        setChunksResult({
          totalChunks: dbChunks.length,
          averageChunkSize: Math.round(dbChunks.reduce((acc, c) => acc + c.content.length, 0) / dbChunks.length),
          largestChunkSize: Math.max(...dbChunks.map((c) => c.content.length)),
          smallestChunkSize: Math.min(...dbChunks.map((c) => c.content.length)),
          chunks: dbChunks.map((c) => ({
            chunkId: c.id,
            documentId: c.document_id,
            pageStart: c.page_number,
            pageEnd: c.page_number,
            chunkIndex: c.chunk_index,
            text: c.content,
            characterCount: c.content.length,
          })),
        });

        // Initialize status as Completed for all database chunks
        const dbStatus: Record<string, ChunkEmbeddingStatus> = {};
        dbChunks.forEach((c) => {
          dbStatus[c.id] = {
            status: "Completed",
            model: "Database (Persisted)",
            dimensions: c.embedding ? c.embedding.length : 0,
            generationTimeMs: 0,
            stored: true,
            retryCount: 0,
            embedding: c.embedding || undefined,
          };
        });
        setChunkEmbeddingStatuses(dbStatus);
        setLoading(false);
        return;
      }

      // 2. Fall back to on-the-fly parsing & chunking if not in database
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const res = await fetch("/api/dev/chunk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          documentId: selectedDocId,
          maxChunkCharacters,
          overlapCharacters,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Request failed with status ${res.status}`);
      }

      setDocInfo(data.documentInfo);
      setPages(data.pages);
      setChunksResult(data.chunks);

      // Initialize all chunk embedding statuses to Pending
      const initialStatus: Record<string, ChunkEmbeddingStatus> = {};
      data.chunks.chunks.forEach((c: Chunk) => {
        initialStatus[c.chunkId] = {
          status: "Pending",
          model: "Pending",
          dimensions: 0,
          generationTimeMs: 0,
          stored: false,
          retryCount: 0,
        };
      });
      setChunkEmbeddingStatuses(initialStatus);

    } catch (err) {
      console.error("[Dev Page] Process error:", err);
      const errMsg = err instanceof Error ? err.message : "An unexpected error occurred during processing.";
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateEmbeddings = async () => {
    if (!chunksResult || !selectedDocId) return;

    setEmbeddingLoading(true);
    setError(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    // We process the chunks in client-side batches of 10 to show real-time progress on screen
    const BATCH_SIZE = 10;
    const allChunks = chunksResult.chunks;

    // Convert Chunk to the Input shape expected by the embed API
    const chunkInputs = allChunks.map((c) => ({
      chunkId: c.chunkId,
      documentId: selectedDocId,
      text: c.text,
      pageStart: c.pageStart,
      pageEnd: c.pageEnd,
      chunkIndex: c.chunkIndex,
    }));

    for (let offset = 0; offset < chunkInputs.length; offset += BATCH_SIZE) {
      const batch = chunkInputs.slice(offset, offset + BATCH_SIZE);

      // Set these chunks to Generating
      setChunkEmbeddingStatuses((prev) => {
        const next = { ...prev };
        batch.forEach((c) => {
          if (next[c.chunkId]) {
            next[c.chunkId].status = "Generating";
          }
        });
        return next;
      });

      try {
        const res = await fetch("/api/dev/embed", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({
            documentId: selectedDocId,
            chunks: batch,
            forceRegenerate,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `Batch request failed with status ${res.status}`);
        }

        // Update status for this batch
        setChunkEmbeddingStatuses((prev) => {
          const next = { ...prev };
          data.results.forEach((r: unknown) => {
            const resObj = r as {
              chunkId: string;
              status: "Pending" | "Generating" | "Completed" | "Failed";
              model: string;
              dimensions: number;
              generationTimeMs: number;
              stored: boolean;
              retryCount: number;
              error?: string;
              embedding?: number[];
            };
            next[resObj.chunkId] = {
              status: resObj.status,
              model: resObj.model,
              dimensions: resObj.dimensions,
              generationTimeMs: resObj.generationTimeMs,
              stored: resObj.stored,
              retryCount: resObj.retryCount,
              error: resObj.error,
              embedding: resObj.embedding,
            };
          });
          return next;
        });

      } catch (err) {
        console.error("[Dev Page] Batch embedding generation error:", err);
        const errMsg = err instanceof Error ? err.message : "Failed to call embedding route";
        // Mark this batch as Failed
        setChunkEmbeddingStatuses((prev) => {
          const next = { ...prev };
          batch.forEach((c) => {
            next[c.chunkId] = {
              status: "Failed",
              model: "Error",
              dimensions: 0,
              generationTimeMs: 0,
              stored: false,
              retryCount: 0,
              error: errMsg,
            };
          });
          return next;
        });
      }
    }

    setEmbeddingLoading(false);
  };

  const handleCopy = async (chunkId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus((prev) => ({ ...prev, [chunkId]: "Copied!" }));
      setTimeout(() => {
        setCopyStatus((prev) => ({ ...prev, [chunkId]: "" }));
      }, 1500);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  const handleExport = () => {
    if (!chunksResult || !docInfo) return;
    const exportData = {
      document: docInfo,
      config: { maxChunkCharacters, overlapCharacters },
      chunks: chunksResult.chunks.map((c) => {
        const info = chunkEmbeddingStatuses[c.chunkId];
        return {
          chunkId: c.chunkId,
          documentId: c.documentId,
          pageStart: c.pageStart,
          pageEnd: c.pageEnd,
          chunkIndex: c.chunkIndex,
          text: c.text,
          characterCount: c.characterCount,
          embedding: info?.embedding || null,
          embeddingInfo: info ? {
            status: info.status,
            model: info.model,
            dimensions: info.dimensions,
            generationTimeMs: info.generationTimeMs,
            stored: info.stored,
            retryCount: info.retryCount,
            error: info.error,
          } : null,
        };
      }),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chunks_with_embeddings_${docInfo.file_name.replace(/\.[^/.]+$/, "")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSearch = async () => {
    const q = retrievalQuery.trim();
    if (!q) {
      setRetrievalError("Please enter a query.");
      return;
    }
    setRetrievalLoading(true);
    setRetrievalError(null);
    setRetrievalResult(null);
    setExpandedResults({});
    setAiAnswer(null);
    setAiGenerationMs(null);
    setAiModel(null);
    setAiConfidence(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      // Call /api/answer — full RAG pipeline: retrieval + prompt builder + LLM
      const res = await fetch("/api/answer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          query: q,
          topK: retrievalTopK,
          similarityThreshold: retrievalThreshold,
          filterDocumentId: retrievalDocId || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.code) {
        throw new Error(data.message || `Search failed with status ${res.status}`);
      }

      // Store AI answer
      setAiAnswer(data.answer || null);
      setAiGenerationMs(data.generationTimeMs ?? null);
      setAiModel(data.model ?? null);
      setAiConfidence(data.retrieval?.confidence ?? null);

      // Reconstruct a RetrievalResult-compatible shape from the answer response
      const retrieval = data.retrieval || {};
      const chunks = (data.chunks || []) as Array<{
        chunkId: string;
        documentId: string;
        pageStart: number;
        pageEnd: number;
        chunkIndex: number;
        similarityScore: number;
        confidence: string;
        preview: string;
      }>;

      setRetrievalResult({
        query: q,
        provider: retrieval.provider || "",
        model: retrieval.model || "",
        embeddingTimeMs: data.promptMetrics?.contextCharacters ?? 0,
        searchTimeMs: retrieval.totalTimeMs ?? 0,
        totalTimeMs: retrieval.totalTimeMs ?? 0,
        returnedChunks: retrieval.returnedChunks ?? chunks.length,
        averageSimilarity: retrieval.averageSimilarity ?? 0,
        results: chunks.map((c) => ({
          chunkId: c.chunkId,
          documentId: c.documentId,
          pageStart: c.pageStart,
          pageEnd: c.pageEnd,
          chunkIndex: 0,
          similarityScore: c.similarityScore,
          characterCount: c.preview?.length ?? 0,
          preview: c.preview,
          fullText: c.preview,
        })),
      });
    } catch (err) {
      setRetrievalError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setRetrievalLoading(false);
    }
  };

  const handleExpandAll = () => {
    if (!chunksResult) return;
    const newExpanded: Record<number, boolean> = {};
    chunksResult.chunks.forEach((c) => {
      newExpanded[c.chunkIndex] = true;
    });
    setExpandedChunks(newExpanded);
  };

  const handleCollapseAll = () => {
    setExpandedChunks({});
  };

  const toggleChunkExpand = (index: number) => {
    setExpandedChunks((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  // Filter chunks in real time
  const filteredChunks = chunksResult
    ? chunksResult.chunks.filter((c) =>
        c.text.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  // Top Summary calculations
  const totalChunksCount = chunksResult?.totalChunks || 0;
  let embeddedCount = 0;
  let pendingCount = 0;
  let failedCount = 0;
  let totalGenTime = 0;
  let totalGenCount = 0;
  let totalDimensions = 0;
  let dimensionCount = 0;

  Object.values(chunkEmbeddingStatuses).forEach((s) => {
    if (s.status === "Completed") {
      embeddedCount++;
      if (s.generationTimeMs > 0) {
        totalGenTime += s.generationTimeMs;
        totalGenCount++;
      }
      if (s.dimensions > 0) {
        totalDimensions += s.dimensions;
        dimensionCount++;
      }
    } else if (s.status === "Generating" || s.status === "Pending") {
      pendingCount++;
    } else if (s.status === "Failed") {
      failedCount++;
    }
  });

  const avgGenTime = totalGenCount > 0 ? Math.round(totalGenTime / totalGenCount) : 0;
  const avgDimensions = dimensionCount > 0 ? Math.round(totalDimensions / dimensionCount) : 0;

  return (
    <div className="p-8 max-w-7xl mx-auto font-sans text-slate-800 bg-white min-h-screen">
      {/* Header */}
      <header className="border-b border-slate-200 pb-4 mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-indigo-600">
          🛠️ RAG Diagnostics Console (Sprint 3 - Embeddings & Vector Storage)
        </h1>
        <p className="text-slate-500 text-xs mt-1">
          Development Mode Only. Process document text, verify sentence-level sliding chunk ranges, generate vector embeddings, and inspect dimensions.
        </p>
      </header>

      {/* Control Panel */}
      <section className="bg-slate-50 border border-slate-200 rounded-lg p-5 mb-8">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">
          Configuration & Document Selection
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-600">Select Document</label>
            <select
              value={selectedDocId}
              onChange={(e) => setSelectedDocId(e.target.value)}
              className="px-3 py-1.5 text-sm rounded border border-slate-300 bg-white focus:outline-none focus:border-indigo-500"
            >
              {docs.length === 0 ? (
                <option value="">No documents found</option>
              ) : (
                docs.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.file_name} ({Math.round(doc.file_size / 1024)} KB)
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-600">Max Chunk Size (Chars)</label>
            <input
              type="number"
              value={maxChunkCharacters}
              onChange={(e) => setMaxChunkCharacters(Math.max(10, Number(e.target.value)))}
              className="px-3 py-1.5 text-sm rounded border border-slate-300 bg-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-600">Overlap Size (Chars)</label>
            <input
              type="number"
              value={overlapCharacters}
              onChange={(e) => setOverlapCharacters(Math.max(0, Number(e.target.value)))}
              className="px-3 py-1.5 text-sm rounded border border-slate-300 bg-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <button
            onClick={handleProcess}
            disabled={loading || !selectedDocId}
            className="px-4 py-2 text-sm font-semibold rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Processing..." : "Process & Chunk Document"}
          </button>
        </div>

        {chunksResult && (
          <div className="mt-5 pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="force-regen"
                checked={forceRegenerate}
                onChange={(e) => setForceRegenerate(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
              />
              <label htmlFor="force-regen" className="text-xs font-semibold text-slate-600 cursor-pointer">
                Force Regenerate Embeddings (Bypass cached DB check)
              </label>
            </div>
            
            <button
              onClick={handleGenerateEmbeddings}
              disabled={embeddingLoading || chunksResult.totalChunks === 0}
              className="px-4 py-2 text-sm font-bold rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
            >
              {embeddingLoading ? "Generating Vectors..." : "⚡ Generate & Store Embeddings"}
            </button>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded text-xs font-medium">
            Error: {error}
          </div>
        )}
      </section>

      {/* Main Content Layout */}
      {docInfo && chunksResult && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Stats & Info & Pages */}
          <div className="space-y-6">
            {/* TOP SUMMARY */}
            <div className="border border-slate-200 rounded-lg p-5 bg-indigo-50/20">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3 pb-1 border-b border-slate-100">
                Vector Summary
              </h3>
              <div className="grid grid-cols-2 gap-3 text-center mb-3">
                <div className="p-2 bg-white rounded border border-slate-200">
                  <div className="text-lg font-bold text-slate-800">{totalChunksCount}</div>
                  <div className="text-[10px] text-slate-400 font-semibold uppercase">Total Chunks</div>
                </div>
                <div className="p-2 bg-emerald-50 rounded border border-emerald-200">
                  <div className="text-lg font-bold text-emerald-600">{embeddedCount}</div>
                  <div className="text-[10px] text-emerald-500 font-semibold uppercase">Embedded</div>
                </div>
                <div className="p-2 bg-amber-50 rounded border border-amber-200">
                  <div className="text-lg font-bold text-amber-600">{pendingCount}</div>
                  <div className="text-[10px] text-amber-500 font-semibold uppercase">Pending</div>
                </div>
                <div className="p-2 bg-red-50 rounded border border-red-200">
                  <div className="text-lg font-bold text-red-600">{failedCount}</div>
                  <div className="text-[10px] text-red-500 font-semibold uppercase">Failed</div>
                </div>
              </div>
              
              <div className="text-xs space-y-2 pt-2 border-t border-slate-100">
                <div className="flex justify-between">
                  <span className="text-slate-600">Avg Generation Time:</span>
                  <span className="font-semibold">{avgGenTime} ms/chunk</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Average Dimensions:</span>
                  <span className="font-semibold">{avgDimensions} dims</span>
                </div>
              </div>
            </div>

            {/* DOCUMENT INFO */}
            <div className="border border-slate-200 rounded-lg p-5">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3 pb-1 border-b border-slate-100">
                Document Info
              </h3>
              <div className="text-xs space-y-2">
                <p><strong className="text-slate-600">ID:</strong> <span className="font-mono bg-slate-100 px-1 rounded">{docInfo.id}</span></p>
                <p><strong className="text-slate-600">Filename:</strong> {docInfo.file_name}</p>
                <p><strong className="text-slate-600">Total Pages:</strong> {docInfo.totalPages}</p>
                <p><strong className="text-slate-600">Total Characters:</strong> {docInfo.totalCharacters.toLocaleString()}</p>
              </div>
            </div>

            {/* CHUNKING STATISTICS */}
            <div className="border border-slate-200 rounded-lg p-5">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3 pb-1 border-b border-slate-100">
                Chunk Metrics
              </h3>
              <div className="text-xs space-y-2">
                <p><strong className="text-slate-600">Average Size:</strong> {chunksResult.averageChunkSize} chars</p>
                <p><strong className="text-slate-600">Largest Chunk:</strong> {chunksResult.largestChunkSize} chars</p>
                <p><strong className="text-slate-600">Smallest Chunk:</strong> {chunksResult.smallestChunkSize} chars</p>
              </div>
            </div>

            {/* PAGE VIEWER */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setShowPages(!showPages)}
                className="w-full flex items-center justify-between px-5 py-3.5 bg-slate-50 text-sm font-semibold border-b border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <span>📄 Page Viewer ({pages.length} Pages)</span>
                <span>{showPages ? "▼" : "▶"}</span>
              </button>

              {showPages && (
                <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto p-4 space-y-4">
                  {pages.map((p) => (
                    <div key={p.pageNumber} className="pt-3 first:pt-0 space-y-1.5 text-xs">
                      <div className="flex justify-between items-center bg-slate-50 p-1.5 rounded border border-slate-200">
                        <strong className="text-slate-700">Page {p.pageNumber}</strong>
                        <span className="text-slate-400">{p.characterCount} chars</span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-slate-600 bg-slate-50/30 p-2 rounded border border-slate-100 whitespace-pre-wrap font-mono max-h-36 overflow-y-auto">
                        {p.extractedText}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Chunk & Vector Viewer */}
          <div className="lg:col-span-2 space-y-4">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-lg p-4">
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <span className="text-slate-400 text-xs">🔍</span>
                <input
                  type="text"
                  placeholder="Filter chunks instantly..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent text-sm border-b border-slate-300 focus:outline-none focus:border-indigo-500 py-0.5"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleExpandAll}
                  className="px-2.5 py-1 text-xs font-semibold rounded border border-slate-300 hover:bg-white text-slate-600"
                >
                  Expand All
                </button>
                <button
                  onClick={handleCollapseAll}
                  className="px-2.5 py-1 text-xs font-semibold rounded border border-slate-300 hover:bg-white text-slate-600"
                >
                  Collapse All
                </button>
                <button
                  onClick={handleExport}
                  className="px-2.5 py-1 text-xs font-semibold rounded bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  Export JSON
                </button>
              </div>
            </div>

            {/* CHUNK VIEWER LIST */}
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs text-slate-400 px-1">
                <span>Showing {filteredChunks.length} of {chunksResult.totalChunks} chunks</span>
              </div>

              {filteredChunks.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-slate-200 rounded-lg text-slate-400 text-sm">
                  No matching chunks found.
                </div>
              ) : (
                filteredChunks.map((chunk) => {
                  const isExpanded = !!expandedChunks[chunk.chunkIndex];
                  const previewText = chunk.text.slice(0, 120) + (chunk.text.length > 120 ? "..." : "");

                  // Embedding Status Metadata
                  const embeddingInfo = chunkEmbeddingStatuses[chunk.chunkId] || {
                    status: "Pending",
                    model: "N/A",
                    dimensions: 0,
                    generationTimeMs: 0,
                    stored: false,
                    retryCount: 0,
                  };

                  let statusColor = "bg-slate-100 text-slate-600 border-slate-200";
                  if (embeddingInfo.status === "Generating") {
                    statusColor = "bg-amber-100 text-amber-800 border-amber-200 animate-pulse";
                  } else if (embeddingInfo.status === "Completed") {
                    statusColor = "bg-emerald-100 text-emerald-800 border-emerald-200";
                  } else if (embeddingInfo.status === "Failed") {
                    statusColor = "bg-red-100 text-red-800 border-red-200";
                  }

                  return (
                    <div
                      key={chunk.chunkId}
                      className="border border-slate-200 rounded-lg overflow-hidden bg-white hover:border-slate-300 transition-colors"
                    >
                      {/* Chunk Header */}
                      <div className="flex items-center justify-between bg-slate-50/50 px-4 py-2.5 border-b border-slate-100 text-xs">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-bold text-indigo-600">
                            Index #{chunk.chunkIndex}
                          </span>
                          <span className="text-slate-300">|</span>
                          <span className="text-slate-500 font-mono text-[10px]" title={chunk.chunkId}>
                            ID: {chunk.chunkId.slice(0, 8)}...{chunk.chunkId.slice(-8)}
                          </span>
                          <span className="text-slate-300">|</span>
                          <span className="text-slate-500">
                            Pages {chunk.pageStart} to {chunk.pageEnd}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400 text-[10px] mr-1">
                            {chunk.characterCount} chars
                          </span>
                          <button
                            onClick={() => handleCopy(chunk.chunkId, chunk.text)}
                            className="px-2 py-0.5 text-[10px] border border-slate-200 rounded hover:bg-white text-slate-600 active:bg-slate-100"
                          >
                            {copyStatus[chunk.chunkId] || "Copy"}
                          </button>
                          <button
                            onClick={() => toggleChunkExpand(chunk.chunkIndex)}
                            className="px-2 py-0.5 text-[10px] bg-slate-200 hover:bg-slate-300 rounded text-slate-700"
                          >
                            {isExpanded ? "Collapse" : "Expand"}
                          </button>
                        </div>
                      </div>

                      {/* Vector Ingestion Status Meta Card */}
                      <div className="bg-slate-50/20 border-b border-slate-100 px-4 py-2 text-[10px] flex flex-wrap justify-between items-center gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded border text-[9px] font-bold ${statusColor}`}>
                            {embeddingInfo.status}
                          </span>
                          <span className="text-slate-400 font-medium">
                            Model: <strong className="text-slate-600">{embeddingInfo.model}</strong>
                          </span>
                          {embeddingInfo.dimensions > 0 && (
                            <>
                              <span className="text-slate-300">|</span>
                              <span className="text-slate-400 font-medium">
                                Dimensions: <strong className="text-slate-600">{embeddingInfo.dimensions}d</strong>
                              </span>
                            </>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-slate-400 font-medium">
                          {embeddingInfo.generationTimeMs > 0 && (
                            <span>Time: <strong className="text-slate-600">{embeddingInfo.generationTimeMs}ms</strong></span>
                          )}
                          <span>Stored: <strong className={embeddingInfo.stored ? "text-emerald-600" : "text-slate-600"}>{embeddingInfo.stored ? "Yes" : "No"}</strong></span>
                          {embeddingInfo.retryCount > 0 && (
                            <span className="text-red-500 font-semibold">Retries: {embeddingInfo.retryCount}</span>
                          )}
                        </div>
                      </div>

                      {/* Chunk Body */}
                      <div className="p-4 text-xs leading-relaxed text-slate-600 whitespace-pre-wrap">
                        {isExpanded ? (
                          <div className="space-y-2">
                            <p className="bg-slate-50 p-2.5 rounded border border-slate-100 text-slate-700 font-mono">
                              {chunk.text}
                            </p>
                            {embeddingInfo.error && (
                              <p className="text-red-600 bg-red-50 p-2 rounded border border-red-100 font-mono text-[10px]">
                                Error: {embeddingInfo.error}
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="text-slate-500 italic">
                            {previewText}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          RETRIEVAL SECTION
      ═══════════════════════════════════════════════════════════════════════ */}
      <section className="mt-10 pt-8 border-t-2 border-indigo-100">
        <h2 className="text-xl font-bold text-indigo-600 mb-1">🔍 Retrieval Engine</h2>
        <p className="text-xs text-slate-400 mb-6">
          Semantic similarity search over stored embeddings. Documents must be processed and embedded first.
        </p>

        {/* Search Controls */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 mb-6">
          <div className="flex flex-col gap-3">
            <div className="flex gap-3 items-end flex-wrap">
              <div className="flex-1 min-w-[260px] flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-600">Search Query</label>
                <input
                  type="text"
                  value={retrievalQuery}
                  onChange={(e) => setRetrievalQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="Enter a natural language query…"
                  className="px-3 py-2 text-sm rounded border border-slate-300 bg-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-600">Top K</label>
                <select
                  value={retrievalTopK}
                  onChange={(e) => setRetrievalTopK(Number(e.target.value))}
                  className="px-3 py-2 text-sm rounded border border-slate-300 bg-white focus:outline-none focus:border-indigo-500"
                >
                  <option value={3}>Top 3</option>
                  <option value={5}>Top 5</option>
                  <option value={10}>Top 10</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-600">Min Similarity</label>
                <input
                  type="number"
                  step="0.05"
                  min={0}
                  max={1}
                  value={retrievalThreshold}
                  onChange={(e) => setRetrievalThreshold(Math.min(1, Math.max(0, Number(e.target.value))))}
                  className="w-24 px-3 py-2 text-sm rounded border border-slate-300 bg-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-600">Filter Document</label>
                <select
                  value={retrievalDocId}
                  onChange={(e) => setRetrievalDocId(e.target.value)}
                  className="px-3 py-2 text-sm rounded border border-slate-300 bg-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">All Documents</option>
                  {docs.map((doc) => (
                    <option key={doc.id} value={doc.id}>{doc.file_name}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleSearch}
                disabled={retrievalLoading || !retrievalQuery.trim()}
                className="px-5 py-2 text-sm font-bold rounded bg-violet-600 hover:bg-violet-700 text-white disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
              >
                {retrievalLoading ? "Searching…" : "🔍 Search"}
              </button>
            </div>
          </div>

          {retrievalError && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-xs font-medium">
              {retrievalError}
            </div>
          )}
        </div>

        {/* Results */}
        {retrievalResult && (
          <div className="space-y-6">

            {/* ── AI ANSWER BOX (appears first, above retrieval cards) ── */}
            {aiAnswer && (
              <div className="border-2 border-emerald-400 rounded-xl bg-emerald-50/60 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-emerald-800 flex items-center gap-2">
                    🤖 AI Answer
                    {aiConfidence && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        aiConfidence === "High"   ? "bg-emerald-100 text-emerald-700 border-emerald-300" :
                        aiConfidence === "Medium" ? "bg-amber-100  text-amber-700  border-amber-300"  :
                                                    "bg-rose-100   text-rose-700   border-rose-300"
                      }`}>
                        {aiConfidence} Confidence
                      </span>
                    )}
                  </h3>
                  <div className="flex items-center gap-3 text-[11px] text-emerald-700 font-medium">
                    {aiModel && <span>Model: {aiModel}</span>}
                    {aiGenerationMs !== null && <span>⚡ {aiGenerationMs}ms</span>}
                  </div>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {aiAnswer}
                </p>
              </div>
            )}

            {/* ── Retrieval grid (Query Meta + Chunk Cards) ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Query Meta + Summary */}
            <div className="space-y-4">
              {/* Query Info */}
              <div className="border border-slate-200 rounded-lg p-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 pb-1 border-b border-slate-100">
                  Query Embedding
                </h3>
                <div className="text-xs space-y-2">
                  <p className="bg-slate-50 p-2 rounded border border-slate-100 text-slate-700 italic">
                    &ldquo;{retrievalResult.query}&rdquo;
                  </p>
                  <p><strong className="text-slate-600">Provider:</strong> {retrievalResult.provider}</p>
                  <p><strong className="text-slate-600">Model:</strong> {retrievalResult.model}</p>
                  <p><strong className="text-slate-600">Embedding Time:</strong> {retrievalResult.embeddingTimeMs}ms</p>
                  <p className="text-emerald-600 font-semibold text-[10px] pt-1">✓ Query Embedding Generated</p>
                </div>
              </div>

              {/* Summary */}
              <div className="border border-violet-200 rounded-lg p-4 bg-violet-50/20">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 pb-1 border-b border-violet-100">
                  Search Summary
                </h3>
                <div className="text-xs space-y-2">
                  <p><strong className="text-slate-600">Search Time:</strong> {retrievalResult.searchTimeMs}ms</p>
                  <p><strong className="text-slate-600">Embedding Time:</strong> {retrievalResult.embeddingTimeMs}ms</p>
                  <p><strong className="text-slate-600">Total Time:</strong> {retrievalResult.totalTimeMs}ms</p>
                  <p><strong className="text-slate-600">Returned Chunks:</strong> {retrievalResult.returnedChunks}</p>
                  <p><strong className="text-slate-600">Avg Similarity:</strong> {(retrievalResult.averageSimilarity * 100).toFixed(2)}%</p>
                </div>
              </div>
            </div>

            {/* Right: Result Cards */}
            <div className="lg:col-span-2 space-y-3">
              <p className="text-xs text-slate-400 px-1">
                {retrievalResult.returnedChunks} chunk{retrievalResult.returnedChunks !== 1 ? "s" : ""} retrieved, ranked by cosine similarity
              </p>

              {retrievalResult.results.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-slate-200 rounded-lg text-slate-400 text-sm">
                  No chunks matched this query above the similarity threshold.
                </div>
              ) : (
                retrievalResult.results.map((chunk, rank) => {
                  const isExpanded = !!expandedResults[rank];
                  const pct = (chunk.similarityScore * 100).toFixed(1);
                  const barWidth = Math.round(chunk.similarityScore * 100);

                  // Colour-code the score bar
                  const barColor =
                    chunk.similarityScore >= 0.75
                      ? "bg-emerald-500"
                      : chunk.similarityScore >= 0.5
                      ? "bg-amber-400"
                      : "bg-slate-400";

                  return (
                    <div
                      key={chunk.chunkId}
                      className="border border-slate-200 rounded-lg overflow-hidden bg-white hover:border-violet-300 transition-colors"
                    >
                      {/* Card header */}
                      <div className="flex items-center justify-between bg-slate-50/60 px-4 py-2.5 border-b border-slate-100">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                          <span className="font-bold text-violet-700">#{rank + 1}</span>
                          <span className="text-slate-300">|</span>
                          <span className="font-semibold text-slate-700">{pct}% similar</span>
                          <span className="text-slate-300">|</span>
                          <span className="text-slate-500">Pages {chunk.pageStart}–{chunk.pageEnd}</span>
                          <span className="text-slate-300">|</span>
                          <span className="text-slate-400 text-[10px] font-mono" title={chunk.chunkId}>
                            {chunk.chunkId.slice(0, 8)}…
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400 text-[10px]">{chunk.characterCount} chars</span>
                          <button
                            onClick={() =>
                              setExpandedResults((p) => ({ ...p, [rank]: !p[rank] }))
                            }
                            className="px-2 py-0.5 text-[10px] bg-slate-200 hover:bg-slate-300 rounded text-slate-700"
                          >
                            {isExpanded ? "Collapse" : "Expand"}
                          </button>
                        </div>
                      </div>

                      {/* Similarity bar */}
                      <div className="px-4 pt-2">
                        <div className="h-1 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${barColor} transition-all`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </div>

                      {/* Chunk meta row */}
                      <div className="px-4 py-2.5 text-[10px] text-slate-500 flex flex-wrap gap-x-4 gap-y-1.5 bg-slate-50/20 border-t border-b border-slate-100">
                        <span><strong>Rank:</strong> #{rank + 1}</span>
                        <span><strong>Chunk ID:</strong> <span className="font-mono text-[9px]">{chunk.chunkId}</span></span>
                        <span><strong>Document:</strong> <span className="font-mono text-[9px]">{chunk.documentId}</span></span>
                        <span><strong>Chunk Index:</strong> #{chunk.chunkIndex}</span>
                        <span><strong>Page:</strong> {chunk.pageStart}</span>
                        <span><strong>Character Count:</strong> {chunk.characterCount}</span>
                        <span><strong>Raw Cosine Similarity:</strong> {chunk.similarityScore.toFixed(6)}</span>
                        <span><strong>Final Similarity Score:</strong> {(chunk.similarityScore * 100).toFixed(2)}%</span>
                      </div>

                      {/* Text */}
                      <div className="px-4 py-3 text-xs text-slate-600">
                        {isExpanded ? (
                          <div className="space-y-2">
                            <p className="bg-slate-50 p-2.5 rounded border border-slate-100 text-slate-700 font-mono leading-relaxed whitespace-pre-wrap">
                              {chunk.fullText}
                            </p>
                          </div>
                        ) : (
                          <p className="italic text-slate-500">{chunk.preview}</p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          </div>
        )}
      </section>
    </div>
  );
}
