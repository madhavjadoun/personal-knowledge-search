"use client";

import { useState, useRef, useEffect } from "react";
import AppShell from "@/components/app/AppShell";
import OrbitLoader from "@/components/app/OrbitLoader";

// ── Types ─────────────────────────────────────────────────────────────────────

type ConfidenceLevel = "High" | "Medium" | "Low";

interface PromptMetrics {
  promptCharacters: number;
  tokenEstimate: number;
  contextCharacters: number;
  chunksIncluded: number;
}

interface RetrievalMeta {
  provider: string;
  model: string;
  returnedChunks: number;
  averageSimilarity: number;
  confidence: ConfidenceLevel;
  totalTimeMs: number;
}

interface ChunkPreview {
  chunkId: string;
  documentId: string;
  pageStart: number;
  pageEnd: number;
  similarityScore: number;
  confidence: ConfidenceLevel;
  preview: string;
}

interface Msg {
  id: string;
  role: "user" | "assistant";
  text: string;
  error?: boolean;
  provider?: string;
  model?: string;
  generationTimeMs?: number;
  promptMetrics?: PromptMetrics;
  retrieval?: RetrievalMeta;
  chunks?: ChunkPreview[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CONFIDENCE_STYLES: Record<ConfidenceLevel, string> = {
  High:   "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Medium: "bg-amber-500/15  text-amber-400  border-amber-500/30",
  Low:    "bg-rose-500/15   text-rose-400   border-rose-500/30",
};

const CONFIDENCE_DOT: Record<ConfidenceLevel, string> = {
  High:   "bg-emerald-400",
  Medium: "bg-amber-400",
  Low:    "bg-rose-400",
};

function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${CONFIDENCE_STYLES[level]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${CONFIDENCE_DOT[level]}`} />
      {level} Confidence
    </span>
  );
}

// ── Static content ────────────────────────────────────────────────────────────

const INIT: Msg[] = [
  {
    id: "0",
    role: "assistant",
    text: "Hello! I'm your AI knowledge assistant. Ask me anything about your uploaded documents — I'll retrieve the most relevant context and generate a grounded answer using your local Qwen2.5 model.",
  },
];

const SUGGESTED = [
  "Summarize this document",
  "Generate viva questions",
  "Explain the main concepts",
  "What are the key findings?",
];

const HISTORY = {
  today: [
    { id: "h1", title: "Summarize Research Paper" },
    { id: "h2", title: "Vector Ingestion Pipeline" },
  ],
  yesterday: [
    { id: "h3", title: "Sentence Transformer Specs" },
    { id: "h4", title: "Supabase RLS Debugging" },
  ],
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>(INIT);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [expandedChunks, setExpandedChunks] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, thinking]);

  const toggleChunks = (msgId: string) => {
    setExpandedChunks((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  };

  // ── Send a message through the real RAG pipeline ──────────────────────────
  const send = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || thinking) return;
    setInput("");
    setThinking(true);

    const userMsg: Msg = { id: crypto.randomUUID(), role: "user", text };
    setMessages((prev) => [...prev, userMsg]);

    // Get session token for RLS
    let authHeader: Record<string, string> = {};
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        { auth: { persistSession: true, storage: localStorage } }
      );
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) authHeader = { Authorization: `Bearer ${token}` };
    } catch { /* proceed without token */ }

    try {
      const res = await fetch("/api/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ query: text, topK: 5, similarityThreshold: 0.3 }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            error: true,
            text: data.message || `Something went wrong (${data.code || res.status}).`,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            text: data.answer,
            provider: data.provider,
            model: data.model,
            generationTimeMs: data.generationTimeMs,
            promptMetrics: data.promptMetrics,
            retrieval: data.retrieval,
            chunks: data.chunks,
          },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          error: true,
          text: "Network error — could not reach the answer API. Is the dev server running?",
        },
      ]);
      console.error("[Chat] fetch error:", err);
    } finally {
      setThinking(false);
      inputRef.current?.focus();
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const loadHistoryItem = (title: string) => {
    setMessages([
      ...INIT,
      { id: crypto.randomUUID(), role: "user", text: `Load context: ${title}` },
      {
        id: crypto.randomUUID(),
        role: "assistant",
        text: `I have restored the session for "${title}". Ask me any questions about these documents.`,
      },
    ]);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AppShell
      title="AI Chat"
      subtitle="Semantic query workspace across indexed knowledge base."
      action={
        <button
          id="chat-reset-btn"
          onClick={() => { setMessages(INIT); setExpandedChunks(new Set()); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border border-[var(--border)] hover:bg-[var(--bg-2)] transition-colors text-[var(--text-2)] cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          Reset Session
        </button>
      }
    >
      <div
        className="max-w-6xl mx-auto flex gap-6 overflow-hidden"
        style={{ height: "calc(100vh - 52px - 148px)" }}
      >
        {/* Chat History Sidebar */}
        <aside className="hidden md:flex flex-col w-56 flex-shrink-0 glass-card rounded-xl overflow-hidden p-3.5 space-y-4">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-4)] mb-2">Today</h3>
            <div className="space-y-1">
              {HISTORY.today.map((item) => (
                <button key={item.id} id={`history-${item.id}`} onClick={() => loadHistoryItem(item.title)}
                  className="w-full text-left truncate text-sm px-2.5 py-1.5 rounded-lg text-[var(--text-3)] hover:bg-[var(--bg-2)] hover:text-[var(--text-1)] transition-colors cursor-pointer">
                  💬 {item.title}
                </button>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-4)] mb-2">Yesterday</h3>
            <div className="space-y-1">
              {HISTORY.yesterday.map((item) => (
                <button key={item.id} id={`history-${item.id}`} onClick={() => loadHistoryItem(item.title)}
                  className="w-full text-left truncate text-sm px-2.5 py-1.5 rounded-lg text-[var(--text-3)] hover:bg-[var(--bg-2)] hover:text-[var(--text-1)] transition-colors cursor-pointer">
                  💬 {item.title}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Main Conversation Window */}
        <div className="flex-1 flex flex-col min-w-0 glass-card rounded-xl overflow-hidden p-4">

          {/* Messages Feed */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-1 scroll-smooth">

            {/* Empty workspace state */}
            {messages.length === 1 && (
              <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-5">
                <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-[var(--bg-2)] border border-[var(--border)] text-[var(--text-4)]">
                  <svg className="w-5 h-5 text-[var(--indigo)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375" />
                  </svg>
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-[var(--text-2)]">Ask anything from your knowledge base.</h3>
                  <p className="text-sm text-[var(--text-4)] max-w-[320px]">
                    Answers are generated locally by Qwen2.5 and grounded strictly in your documents.
                    Out-of-domain queries are rejected automatically.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-[360px] w-full">
                  {SUGGESTED.map((prompt) => (
                    <button key={prompt} id={`suggested-${prompt.replace(/\s+/g, "-").toLowerCase()}`}
                      onClick={() => send(prompt)}
                      className="text-xs text-left px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-2)]/20 hover:bg-[var(--bg-2)] text-[var(--text-3)] hover:text-[var(--text-1)] hover:border-slate-300 dark:hover:border-zinc-700 transition-all font-medium cursor-pointer">
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Message list */}
            {messages.length > 1 && messages.map((m) =>
              m.role === "user" ? (
                /* ── User bubble ── */
                <div key={m.id} className="flex justify-end pl-10">
                  <div className="chat-user-bubble px-4 py-3 text-[16px] leading-[1.7] font-medium">{m.text}</div>
                </div>
              ) : (
                /* ── Assistant bubble ── */
                <div key={m.id} className="flex gap-3 items-start pr-10">
                  {/* AI avatar */}
                  <div className="flex-shrink-0 mt-0.5">
                    <div className={`h-7 w-7 rounded-lg flex items-center justify-center border border-[var(--border)] bg-[var(--bg-2)] ${m.error ? "text-red-400" : "text-[var(--indigo)]"}`}>
                      {m.error ? (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 21m0 0l-.813-5.096M9 21h3m-3.375-10.125h3.375" />
                        </svg>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0 space-y-2">

                    {/* ── PART 1: AI Answer (always first) ── */}
                    <div className={`chat-ai-bubble px-4 py-3 text-[16px] leading-[1.7] ${m.error ? "text-red-400" : "text-[var(--text-2)]"} whitespace-pre-wrap`}>
                      {m.text}
                    </div>

                    {/* ── PART 2: Pipeline metrics row ── */}
                    {!m.error && (m.retrieval || m.promptMetrics) && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[12px] font-medium text-[var(--text-4)]">
                        {m.retrieval?.confidence && <ConfidenceBadge level={m.retrieval.confidence} />}
                        {m.retrieval && (
                          <>
                            <span>🔍 {m.retrieval.returnedChunks} chunk{m.retrieval.returnedChunks !== 1 ? "s" : ""}</span>
                            <span>≈{(m.retrieval.averageSimilarity * 100).toFixed(1)}% avg sim</span>
                            <span>retrieval {m.retrieval.totalTimeMs}ms</span>
                          </>
                        )}
                        {m.generationTimeMs !== undefined && <span>⚡ gen {m.generationTimeMs}ms</span>}
                        {m.provider && m.model && <span>🤖 {m.provider}/{m.model}</span>}
                        {m.promptMetrics && <span>~{m.promptMetrics.tokenEstimate} tokens</span>}
                      </div>
                    )}

                    {/* ── PART 3: Retrieved chunks (collapsible, below answer) ── */}
                    {!m.error && m.chunks && m.chunks.length > 0 && (
                      <div className="mt-1">
                        <button
                          onClick={() => toggleChunks(m.id)}
                          className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--text-4)] hover:text-[var(--text-2)] transition-colors mb-2 cursor-pointer"
                        >
                          <svg
                            className={`w-3 h-3 transition-transform ${expandedChunks.has(m.id) ? "rotate-90" : ""}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                          </svg>
                          {expandedChunks.has(m.id) ? "Hide" : "Show"} {m.chunks.length} retrieved chunk{m.chunks.length !== 1 ? "s" : ""}
                        </button>

                        {expandedChunks.has(m.id) && (
                          <div className="space-y-2">
                            {m.chunks.map((chunk, idx) => (
                              <div
                                key={chunk.chunkId}
                                className="p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-2)]/30 space-y-1.5"
                              >
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <span className="text-[11px] font-bold text-[var(--text-4)] uppercase tracking-wider">
                                    Chunk {idx + 1} · Page {chunk.pageStart}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <ConfidenceBadge level={chunk.confidence} />
                                    <span className="text-[11px] font-mono text-[var(--text-4)]">
                                      {(chunk.similarityScore * 100).toFixed(1)}%
                                    </span>
                                  </div>
                                </div>
                                <p className="text-[13px] text-[var(--text-3)] leading-relaxed line-clamp-3">
                                  {chunk.preview}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            )}

            {/* Thinking indicator */}
            {thinking && (
              <div className="flex gap-3 items-start">
                <div className="h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0 border border-[var(--border)] bg-[var(--bg-2)] text-[var(--indigo)] mt-0.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 21m0 0l-.813-5.096M9 21h3m-3.375-10.125h3.375" />
                  </svg>
                </div>
                <div className="chat-ai-bubble flex items-center gap-3 px-4 py-3 text-sm text-[var(--text-2)]">
                  <OrbitLoader size={20} />
                  <div>
                    <p className="font-semibold text-[var(--text-1)]">Generating answer</p>
                    <p className="text-[13px] font-medium text-[var(--text-4)]">
                      Retrieving context → building prompt → Qwen2.5…
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input bar */}
          <div className="flex-shrink-0 pt-3">
            <div className="glass-chat-input rounded-xl p-3 flex flex-col">
              <textarea
                ref={inputRef}
                id="chat-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKey}
                placeholder="Ask anything about your documents…"
                rows={1}
                className="w-full resize-none bg-transparent text-sm leading-relaxed outline-none border-none p-0 text-[var(--text-1)]"
                style={{ maxHeight: "100px" }}
              />
              <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-[var(--border)]">
                <p className="text-xs text-[var(--text-4)]">
                  <kbd className="px-1.5 py-0.5 rounded font-mono text-[11px] bg-[var(--bg-2)] border border-[var(--border)] text-[var(--text-4)]">Enter</kbd>
                  {" "}to send · Shift+Enter for newline
                </p>
                <button
                  id="chat-send-btn"
                  onClick={() => send()}
                  disabled={!input.trim() || thinking}
                  className="grad-btn flex items-center gap-1.5 px-4.5 py-1.5 rounded-lg text-sm font-semibold"
                >
                  {thinking ? (
                    <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                    </svg>
                  )}
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
