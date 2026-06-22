"use client";

import { useState, useRef, useEffect } from "react";
import AppShell from "@/components/app/AppShell";
import OrbitLoader from "@/components/app/OrbitLoader";

interface Msg {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: string[];
  ms?: number;
}

const SOURCES = [
  "RAG_Knowledge_Flow.md",
  "Sentence_Transformers_Specs.txt",
  "Vector_DB_Prisma_Schema.sql",
  "Standard_Layout_Notes.pdf",
  "Research_Paper_Embeddings.pdf",
];

const REPLIES = [
  (q: string) => ({
    text: `Based on your indexed documents, I found relevant context matching "${q}". The RAG flow document describes how vector embeddings are generated using sentence transformers, then stored in pgvector for cosine similarity lookup.`,
    sources: [SOURCES[0], SOURCES[1]],
    ms: 143,
  }),
  (q: string) => ({
    text: `Semantic search complete for "${q}". In your Prisma schema, the vector index is defined with cosine similarity — computed similarity score: 0.914. The index spans ${Math.floor(Math.random() * 30 + 10)} matched chunks.`,
    sources: [SOURCES[2]],
    ms: 198,
  }),
  (q: string) => ({
    text: `Found 3 highly relevant chunks for "${q}" across your knowledge base. The research paper (page 4) explains how sentence transformers project text into high-dimensional vector space, achieving state-of-the-art recall on retrieval benchmarks.`,
    sources: [SOURCES[3], SOURCES[4]],
    ms: 221,
  }),
];

const INIT: Msg[] = [
  {
    id: "0",
    role: "assistant",
    text: "Hello! I'm your AI knowledge assistant. Ask me anything about your uploaded documents — I'll search the vector index and surface the most relevant information with source citations.",
  },
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>(INIT);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, thinking]);

  const send = async () => {
    const text = input.trim();
    if (!text || thinking) return;
    setInput("");
    setThinking(true);

    const userMsg: Msg = { id: Math.random().toString(), role: "user", text };
    setMessages((p) => [...p, userMsg]);

    await new Promise((r) => setTimeout(r, 900 + Math.random() * 600));

    const pick = REPLIES[Math.floor(Math.random() * REPLIES.length)](text);
    const aiMsg: Msg = { id: Math.random().toString(), role: "assistant", ...pick };
    setMessages((p) => [...p, aiMsg]);
    setThinking(false);
    inputRef.current?.focus();
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <AppShell
      title="AI Chat"
      subtitle="Semantic search across your knowledge index"
      action={
        <button
          onClick={() => setMessages(INIT)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ color: "var(--text-2)", border: "1px solid var(--border)", background: "var(--surface)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = "var(--border-accent)";
            (e.currentTarget as HTMLElement).style.color = "var(--text-1)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
            (e.currentTarget as HTMLElement).style.color = "var(--text-2)";
          }}
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          New session
        </button>
      }
    >
      <div
        className="max-w-3xl mx-auto flex flex-col"
        style={{ height: "calc(100vh - 52px - 48px)" }}
      >

        {/* ── Message thread ── */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto space-y-5 py-2 pr-0.5"
        >
          {messages.map((m) =>
            m.role === "user" ? (
              /* User bubble — premium gradient with inset highlight */
              <div key={m.id} className="flex justify-end">
                <div
                  className="chat-user-bubble max-w-[70%] px-4 py-3.5 text-sm leading-relaxed text-white"
                  style={{ letterSpacing: "-0.012em" }}
                >
                  {m.text}
                </div>
              </div>
            ) : (
              /* Assistant bubble */
              <div key={m.id} className="flex gap-3 items-start">
                {/* AI avatar */}
                <div className="flex-shrink-0 mt-0.5">
                  <div
                    className="h-7 w-7 rounded-lg flex items-center justify-center"
                    style={{
                      background: "rgba(79,70,229,0.08)",
                      border: "1px solid rgba(79,70,229,0.14)",
                    }}
                  >
                    <svg className="w-3.5 h-3.5" style={{ color: "var(--indigo)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 21m0 0l-.813-5.096M9 21h3m-3.375-10.125h3.375m-.11 5.612l1.647-3.294a1.249 1.249 0 112.236 1.118l-1.647 3.294a1.249 1.249 0 11-2.236-1.118zm1.09-5.612L10.5 4.5M9 21V12.75" />
                    </svg>
                  </div>
                </div>

                <div className="flex-1 min-w-0 space-y-2">
                  {/* AI message — glass bubble with inset highlight */}
                  <div
                    className="chat-ai-bubble px-4 py-3.5 text-sm leading-relaxed max-w-[85%]"
                    style={{
                      color: "var(--text-1)",
                      letterSpacing: "-0.012em",
                    }}
                  >
                    {m.text}
                  </div>

                  {/* Sources + latency */}
                  {(m.sources || m.ms) && (
                    <div className="flex flex-wrap gap-1.5 items-center pl-1 mt-1">
                      {m.sources?.map((s) => (
                        <span
                          key={s}
                          className="text-[10px] font-medium px-2 py-0.5 rounded-md"
                          style={{
                            background: "rgba(79,70,229,0.08)",
                            color: "var(--indigo)",
                            border: "1px solid rgba(79,70,229,0.14)",
                            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.55)",
                          }}
                        >
                          {s}
                        </span>
                      ))}
                      {m.ms && (
                        <span
                          className="ml-auto text-[10px] font-mono flex items-center gap-1"
                          style={{ color: "var(--text-3)" }}
                        >
                          <span style={{ color: "var(--cyan)", fontSize: "8px" }}>●</span>
                          {m.ms}ms
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          )}

          {/* ── Orbit Loader — shown ONLY while AI is thinking ── */}
          {thinking && (
            <div className="flex gap-3 items-start">
              <div
                className="h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{
                  background: "rgba(79,70,229,0.08)",
                  border: "1px solid rgba(79,70,229,0.14)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.60)",
                }}
              >
                <svg className="w-3.5 h-3.5" style={{ color: "var(--indigo)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 21m0 0l-.813-5.096M9 21h3m-3.375-10.125h3.375" />
                </svg>
              </div>

              <div
                className="chat-ai-bubble flex items-center gap-3 px-4 py-3 text-sm"
              >
                <OrbitLoader size={22} />
                <div>
                  <p className="text-xs font-medium" style={{ color: "var(--text-1)", letterSpacing: "-0.012em" }}>Searching vector index</p>
                  <p className="text-[10px]" style={{ color: "var(--text-3)" }}>Retrieving relevant document chunks…</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Input area ── */}
        <div className="flex-shrink-0 pt-3">
          {/* Gradient border wrapper on focus */}
          <div
            className="glass-chat-input rounded-2xl transition-all"
            style={{ padding: "12px 14px" }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder="Ask anything about your documents…"
              rows={1}
              className="w-full resize-none bg-transparent text-sm leading-relaxed outline-none"
              style={{
                color: "var(--text-1)",
                letterSpacing: "-0.012em",
                maxHeight: "120px",
              }}
            />

            <div
              className="flex items-center justify-between mt-2.5 pt-2.5"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <p className="text-[10px]" style={{ color: "var(--text-3)" }}>
                <kbd
                  className="px-1.5 py-0.5 rounded font-mono text-[9px]"
                  style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
                >
                  Enter
                </kbd>
                {" "}to send · Shift+Enter for newline
              </p>

              <button
                onClick={send}
                disabled={!input.trim() || thinking}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold grad-btn"
              >
                {thinking ? (
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                  </svg>
                )}
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
