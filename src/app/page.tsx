"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import BlurText from "@/components/ui/BlurText";
import dynamic from "next/dynamic";
import uploadAnimation from "../../public/upload.json";
import OrbitLoader from "@/components/app/OrbitLoader";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

/* ── Constants ─────────────────────────────────── */

const ROTATING_WORDS = [
  "Find anything.",
  "Get answers.",
  "Discover insights.",
  "Search smarter.",
  "Learn faster.",
  "Chat with knowledge."
];

const letterVariants = {
  initial: { y: "100%", opacity: 0, filter: "blur(8px)" },
  animate: {
    y: "0%",
    opacity: 1,
    filter: "blur(0px)"
  },
  exit: {
    y: "-120%",
    opacity: 0,
    filter: "blur(8px)"
  }
};

const EXAMPLE_QUESTIONS = [
  "Summarize this document",
  "Generate MCQs",
  "Create revision notes",
  "Explain like I'm a beginner",
  "Extract key findings",
  "Find important formulas",
  "Generate interview questions",
  "Compare two documents",
];

const AI_RESPONSE_POOL = [
  {
    answer: "Based on the uploaded research paper, the key findings show that sparse attention networks decrease computational overhead by 40% while preserving 98% accuracy in sequence-to-sequence model tests.",
    source: "Attention_Research_Paper.pdf",
    score: "98%",
    ms: "115ms",
    retrieved_chunks: "3",
  },
  {
    answer: "This PDF contains a comprehensive description of quantum entanglement. In simple terms, it explains how paired particles remain connected across distances, exchanging states instantaneously without violating local constraints.",
    source: "Quantum_Physics_Intro.pdf",
    score: "95%",
    ms: "140ms",
    retrieved_chunks: "4",
  },
  {
    answer: "The key findings in this document show a 14% year-over-year revenue increase, driven primarily by enterprise SaaS subscriptions, though marketing acquisition costs rose by 8.4%.",
    source: "Q2_Financials_Report.pdf",
    score: "97%",
    ms: "110ms",
    retrieved_chunks: "2",
  },
  {
    answer: "Comparing both files: API_v1.json uses RESTful endpoints and traditional query params, whereas API_v2.md implements a GraphQL gateway, resulting in 30% fewer network hops for nested entities.",
    source: "API_Architecture_Compare.md",
    score: "94%",
    ms: "185ms",
    retrieved_chunks: "3",
  },
  {
    answer: "Study Plan: Week 1: Study vector spaces and metrics (Cosine, L2). Week 2: Configure pgvector indexes on local PostgreSQL tables. Week 3: Implement langchain splits and semantic ingestion loops.",
    source: "Vector_DB_Learning_Guide.md",
    score: "96%",
    ms: "138ms",
    retrieved_chunks: "3",
  },
  {
    answer: "The Prisma schema defines the database structure. It maps three model classes (User, Document, VectorChunk) directly to PostgreSQL relational tables, ensuring rigid compile-time type validation.",
    source: "schema.prisma",
    score: "98%",
    ms: "92ms",
    retrieved_chunks: "2",
  },
  {
    answer: "The RAG pipeline operates by: 1. Parsing user inputs into queries. 2. Querying pgvector for nearest context fragments. 3. Merging queries and contexts to format LLM system prompts.",
    source: "RAG_Knowledge_Flow.md",
    score: "97%",
    ms: "112ms",
    retrieved_chunks: "3",
  },
  {
    answer: "Comparing OpenAI text-embedding-3-small and Cohere v3 models: Cohere excels at multi-lingual token representations, whereas OpenAI text-embedding-3 shows 12% faster query indexing latencies.",
    source: "Embedding_Model_Comparisons.pdf",
    score: "94%",
    ms: "172ms",
    retrieved_chunks: "4",
  },
  {
    answer: "Prisma Schema exports the postgres connector specs: url = env('DATABASE_URL') and provider = 'postgresql'. It supports local ssl connections and connection pool parameter overrides.",
    source: "db_connection.prisma",
    score: "99%",
    ms: "82ms",
    retrieved_chunks: "2",
  }
];

const STATS = [
  { value: "< 200ms", label: "Response time" },
  { value: "5+",      label: "File formats"  },
  { value: "94%+",    label: "Avg accuracy"  },
  { value: "100%",    label: "Private & local" },
];

/* ── Component ──────────────────────────────────── */

export default function WelcomePage() {
  const router  = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [mounted, setMounted] = useState(false);

  // Upload state
  const [dragging, setDragging] = useState(false);
  const [dropped,  setDropped]  = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // Rotating word
  const [wordIndex, setWordIndex] = useState(0);

  // AI demo
  const [showAnswer,  setShowAnswer]  = useState(false);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [demoReady,   setDemoReady]   = useState(false);

  // Active question chip & custom pool states
  const [activeQ, setActiveQ] = useState<number | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState("What is the RAG knowledge flow in my docs?");
  const [currentSource, setCurrentSource] = useState("RAG_Knowledge_Flow.md");
  const [currentScore, setCurrentScore] = useState("94%");
  const [currentMs, setCurrentMs] = useState("140ms");
  const [currentRetrieval, setCurrentRetrieval] = useState("3");

  // Premium Theme Toggle
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // Shuffled visible questions
  const [visibleQuestions, setVisibleQuestions] = useState<string[]>([]);

  const typeIntervalRef = useRef<NodeJS.Timeout | null>(null);

  /* Welcome page theme initialization */
  useEffect(() => {
    setMounted(true);
    const savedTheme = localStorage.getItem("theme") as "light" | "dark" | null;
    const isDeviceDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initialTheme = savedTheme || (isDeviceDark ? "dark" : "light");
    
    setTheme(initialTheme);
    if (initialTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  /* Check session on mount to redirect authenticated users */
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push("/dashboard");
      }
    };
    checkAuth();
  }, [router]);

  /* Shuffling 6 user-focused questions on refresh */
  useEffect(() => {
    const shuffled = [...EXAMPLE_QUESTIONS].sort(() => 0.5 - Math.random());
    setVisibleQuestions(shuffled.slice(0, 8));
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    if (newTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  /* Rotate words every 2.0s */
  useEffect(() => {
    const iv = setInterval(() => setWordIndex(i => (i + 1) % ROTATING_WORDS.length), 2000);
    return () => clearInterval(iv);
  }, []);

  const triggerTypeEffect = (fullAnswer: string) => {
    setShowAnswer(true);
    setDemoReady(false);
    setTypedAnswer("");
    let i = 0;
    
    if (typeIntervalRef.current) {
      clearInterval(typeIntervalRef.current);
    }
    
    typeIntervalRef.current = setInterval(() => {
      i += 4;
      setTypedAnswer(fullAnswer.slice(0, i));
      if (i >= fullAnswer.length) {
        clearInterval(typeIntervalRef.current!);
        setDemoReady(true);
      }
    }, 18);
  };

  /* Auto-play AI demo on mount */
  useEffect(() => {
    const t1 = setTimeout(() => {
      triggerTypeEffect("RAG embeds your query into a vector, retrieves the top-k similar chunks from pgvector, then feeds those as context to the LLM — giving you grounded, accurate answers straight from your own documents.");
    }, 1200);
    return () => {
      clearTimeout(t1);
      if (typeIntervalRef.current) clearInterval(typeIntervalRef.current);
    };
  }, []);

  const handleQuestionClick = (q: string, idx: number) => {
    setActiveQ(idx);
    setCurrentQuestion(q);
    
    // Pick a random response from the pool
    const randomIndex = Math.floor(Math.random() * AI_RESPONSE_POOL.length);
    const response = AI_RESPONSE_POOL[randomIndex];
    
    setCurrentSource(response.source);
    setCurrentScore(response.score);
    setCurrentMs(response.ms);
    setCurrentRetrieval(response.retrieved_chunks);
    
    triggerTypeEffect(response.answer);
  };

  /* Upload logic */
  const uploadFileToSupabase = async (file: File) => {
    setDropped(file.name);
    setProgress(5);

    // Dynamic progress simulation
    let currentProgress = 5;
    const progressInterval = setInterval(() => {
      if (currentProgress < 85) {
        currentProgress += Math.floor(Math.random() * 8) + 3;
        setProgress(Math.min(currentProgress, 85));
      }
    }, 200);

    try {
      // ── DIAGNOSTIC STEP 0: Full session audit ──────────────────────────────
      // Use getSession() NOT getUser().
      // getUser() validates the JWT server-side but the STORAGE client uses the
      // cached access_token from the session object. If they diverge, storage
      // sends the request as `anon` even though getUser() returned a user.
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const session = sessionData?.session;
      const user = session?.user ?? null;

      console.group("[Upload Diagnostic]");
      console.log("Session error:", sessionError?.message ?? "none");
      console.log("Session exists:", !!session);
      console.log("Access token present:", !!session?.access_token);
      console.log("Access token preview:", session?.access_token?.slice(0, 40) + "...");
      console.log("Token expires at:", session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : "N/A");
      console.log("Token expired:", session?.expires_at ? Date.now() / 1000 > session.expires_at : "unknown");
      console.log("Current User ID:", user?.id ?? "NULL — not authenticated");
      console.log("User email:", user?.email ?? "N/A");
      console.log("Bucket name:", "documents");
      console.log("Upload path:", user ? `${user.id}/${file.name}` : "N/A");
      console.log("File name:", file.name);
      console.log("File size:", file.size);
      console.groupEnd();

      if (sessionError || !session || !user) {
        clearInterval(progressInterval);
        setDropped(null);
        setProgress(0);
        console.error("[Upload] Auth check failed. sessionError:", sessionError, "session:", session);
        alert("Authentication error: You must be signed in to upload. Redirecting to sign in...");
        router.push("/login");
        return;
      }

      // If the token is about to expire, force a refresh before uploading
      if (session.expires_at && Date.now() / 1000 > session.expires_at - 60) {
        console.log("[Upload] Token near expiry, refreshing...");
        const { error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) console.warn("[Upload] Refresh failed:", refreshError.message);
      }

      // ── STEP 1: Storage upload ─────────────────────────────────────────────
      const storagePath = `${user.id}/${file.name}`;
      console.log("[Upload] Starting storage upload to:", `documents/${storagePath}`);

      const { data: storageData, error: storageError } = await supabase.storage
        .from("documents")
        .upload(storagePath, file, {
          cacheControl: "3600",
          upsert: true
        });

      // ── Full storage error dump ────────────────────────────────────────────
      if (storageError) {
        console.group("[Upload] Storage error — full dump");
        console.error("error.message:", storageError.message);
        console.error("error.name:", storageError.name);
        console.error("error (full object):", JSON.stringify(storageError, null, 2));
        console.groupEnd();
        throw storageError;
      }

      console.log("[Upload] Storage upload succeeded:", storageData);

      // ── STEP 2: Get public URL ─────────────────────────────────────────────
      const { data: { publicUrl } } = supabase.storage
        .from("documents")
        .getPublicUrl(storagePath);

      // ── STEP 3: DB insert ─────────────────────────────────────────────────
      console.log("[Upload] Inserting into documents table. user_id:", user.id);
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
        console.error("[Upload] DB insert error:", JSON.stringify(dbError, null, 2));
        throw dbError;
      }

      console.log("[Upload] DB insert succeeded.");
      clearInterval(progressInterval);
      setProgress(100);

      setTimeout(() => { router.push("/dashboard"); }, 1500);

    } catch (err) {
      clearInterval(progressInterval);
      console.error("[Upload] Final caught error:", err);
      setDropped(null);
      setProgress(0);
      const errMsg = err && typeof err === "object" && "message" in err
        ? String((err as Record<string, unknown>).message)
        : String(err);
      alert("Upload failed: " + errMsg);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) uploadFileToSupabase(f);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) uploadFileToSupabase(f);
  };

  /* ── Render ──────────────────────────────────── */

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden bg-slate-50 dark:bg-[#0B1220] transition-colors duration-200">
      
      {/* Top Header */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-6 sm:px-10 lg:px-16 py-5 border-b border-slate-200/60 dark:border-zinc-800 bg-white/70 dark:bg-[#111827]/70 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div
            className="h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: "var(--indigo)" }}
          >
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <span className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            KnowledgeSearch
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 transition-all cursor-pointer flex items-center justify-center hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-600 dark:text-slate-300"
            aria-label="Toggle theme"
          >
            {theme === "light" ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m0 13.5V21M4.22 4.22l1.59 1.59m11.18 11.18l1.59 1.59M3 12h2.25m13.5 0H21M5.81 18.31l1.59-1.59M18.31 5.81l-1.59 1.59M12 7.5A4.5 4.5 0 117.5 12 4.5 4.5 0 0112 7.5z" />
              </svg>
            )}
          </button>

          <button
            onClick={() => router.push("/login")}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 transition-all cursor-pointer hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-slate-200"
          >
            Sign in
          </button>
          
          <button
            onClick={() => router.push("/login")}
            className="grad-btn px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
          >
            Get started
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="relative z-10 w-full max-w-7xl mx-auto flex items-center min-h-screen px-6 sm:px-10 lg:px-16 pt-24 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 w-full items-start">

          {/* LEFT — Content Column (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-6.5 max-w-[530px] lg:max-w-none">
            
            {/* Title with rotating text & BlurText */}
            <div>
              <div
                className="text-[42px] lg:text-[58px] font-black leading-[1.04] text-slate-900 dark:text-white"
                style={{ letterSpacing: "-0.042em" }}
              >
                <BlurText text="Upload once." delay={130} />
              </div>

              {/* Rotating animated word */}
              <div
                className="text-[42px] lg:text-[58px] font-black leading-[1.04] mt-1 relative overflow-hidden h-[1.2em]"
                style={{ letterSpacing: "-0.042em" }}
              >
                <AnimatePresence mode="popLayout">
                  <motion.span
                    key={wordIndex}
                    className="inline-block"
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    {ROTATING_WORDS[wordIndex].split("").map((char, index, arr) => {
                      const delay = (arr.length - 1 - index) * 0.025;
                      return (
                        <motion.span
                          key={index}
                          variants={letterVariants}
                          transition={{
                            type: "spring",
                            damping: 30,
                            stiffness: 400,
                            delay: delay
                          }}
                          className="inline-block"
                          style={{
                            display: "inline-block",
                            whiteSpace: "pre",
                            color: "var(--indigo)",
                          }}
                        >
                          {char}
                        </motion.span>
                      );
                    })}
                  </motion.span>
                </AnimatePresence>
              </div>

              {/* Subheading with BlurText */}
              <p className="text-sm mt-4 leading-relaxed text-slate-500 dark:text-zinc-400 font-normal max-w-[480px]">
                <BlurText
                  text="Upload PDFs, notes, research papers and documents. Ask questions in natural language and get cited answers instantly."
                  delay={45}
                />
              </p>

              {/* Trust Strip */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] font-mono uppercase tracking-wider text-slate-400 dark:text-zinc-500 mt-5 pt-3.5 border-t border-slate-200 dark:border-zinc-800">
                <span>Private</span>
                <span className="text-slate-300 dark:text-zinc-700">·</span>
                <span>Local First</span>
                <span className="text-slate-300 dark:text-zinc-700">·</span>
                <span>Source Citations</span>
                <span className="text-slate-300 dark:text-zinc-700">·</span>
                <span>Semantic Search</span>
              </div>
            </div>

            {/* Example questions */}
            <div className="space-y-2.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-zinc-500">
                ✦ Try asking your documents
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {visibleQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => handleQuestionClick(q, i)}
                    className="text-[11px] text-left px-3 py-2 rounded-lg font-medium transition-all duration-150 cursor-pointer border"
                    style={{
                      background: activeQ === i ? "var(--bg-2)" : "var(--surface)",
                      border: `1px solid ${activeQ === i ? "var(--indigo)" : "var(--border)"}`,
                      color: activeQ === i ? "var(--indigo)" : "var(--text-2)",
                    }}
                    onMouseEnter={e => {
                      if (activeQ !== i) {
                        e.currentTarget.style.borderColor = "var(--border-strong)";
                        e.currentTarget.style.color = "var(--text-1)";
                      }
                    }}
                    onMouseLeave={e => {
                      if (activeQ !== i) {
                        e.currentTarget.style.borderColor = "var(--border)";
                        e.currentTarget.style.color = "var(--text-2)";
                      }
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {/* Semantic Preview Card */}
            <div
              className="rounded-xl p-4 space-y-3.5 border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#111827] shadow-sm"
            >
              <div
                className="flex items-center justify-between pb-2.5 border-b border-slate-200/60 dark:border-zinc-800/80"
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">Semantic Preview</span>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">
                    ● Ready
                  </span>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400">
                    {currentMs}
                  </span>
                </div>
              </div>

              {/* User question */}
              <div className="flex justify-end">
                <div className="chat-user-bubble px-3.5 py-2.5 text-xs max-w-full font-medium">
                  {currentQuestion}
                </div>
              </div>

              {/* AI response */}
              <div className="flex justify-start">
                <div className="chat-ai-bubble px-3.5 py-2.5 text-xs w-full">
                  {showAnswer ? (
                    <div className="space-y-3">
                      <p className="leading-relaxed text-slate-800 dark:text-slate-200">
                        {typedAnswer}
                        {!demoReady && (
                          <span
                            className="inline-block w-[2px] h-3.5 ml-0.5 align-middle animate-pulse bg-blue-600"
                          />
                        )}
                      </p>
                      {demoReady && (
                        <div
                          className="flex items-center justify-between border-t border-slate-200/60 dark:border-zinc-800/80 pt-2.5 flex-wrap gap-2 text-[10px]"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-400 dark:text-zinc-500">Source:</span>
                            <span className="px-1.5 py-0.5 rounded bg-blue-500/5 text-blue-600 dark:text-blue-400 border border-blue-500/10 font-medium">
                              📄 {currentSource}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1">
                              <span className="font-bold text-slate-400 dark:text-zinc-500">Chunks:</span>
                              <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{currentRetrieval}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="font-bold text-slate-400 dark:text-zinc-500">Confidence:</span>
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">
                                {currentScore}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2.5 py-1">
                      {[100, 85, 60].map((w, i) => (
                        <div
                          key={i}
                          className="h-2 rounded bg-slate-100 dark:bg-zinc-800 animate-pulse"
                          style={{ width: `${w}%` }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Stats strip */}
            <div
              className="grid grid-cols-4 gap-2.5 px-3 py-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#111827]"
            >
              {STATS.map((s, i) => (
                <div key={i} className="text-center">
                  <p
                    className="text-base font-bold text-blue-600 dark:text-blue-400"
                    style={{ letterSpacing: "-0.02em" }}
                  >
                    {s.value}
                  </p>
                  <p className="text-[9px] text-slate-400 dark:text-zinc-500 font-bold uppercase mt-0.5 tracking-wider">
                    {s.label}
                  </p>
                </div>
              ))}
            </div>

          </div>

          {/* RIGHT — Hero Upload/Ingestion Box (7 cols) */}
          <div className="lg:col-span-7 flex flex-col justify-center w-full">
            <div className="w-full max-w-[540px] mx-auto rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#111827] shadow-md overflow-hidden">
              
              {/* Card Header */}
              <div
                className="px-6 py-4 flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-[#1f2937]/10"
              >
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    AI Knowledge Ingestion
                  </h3>
                  <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">
                    Select PDFs, markdown files, or plaintext to chunk and index.
                  </p>
                </div>
                
                {/* Decorative dots */}
                <div className="flex items-center gap-1.5">
                  {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
                    <div key={c} className="h-2 w-2 rounded-full" style={{ background: c, opacity: 0.7 }} />
                  ))}
                </div>
              </div>

              {/* Card Body */}
              <div className="p-6 space-y-5">
                
                {/* Drag drop zone */}
                <div
                  onClick={() => !dropped && fileRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  className="rounded-xl flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 border-2 border-dashed relative p-6 bg-slate-50/50 dark:bg-[#0f172a]/30 group"
                  style={{
                    minHeight: "200px",
                    borderColor: dragging ? "var(--indigo)" : dropped ? "#16A34A" : "var(--border-strong)",
                  }}
                >
                  {dropped ? (
                    <div className="flex flex-col items-center gap-3 w-full max-w-[280px]">
                      {progress < 100 ? (
                        <>
                          <OrbitLoader size={40} />
                          <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                            Indexing <span className="text-blue-600 dark:text-blue-400">{dropped}</span>
                          </p>
                          <div className="w-full">
                            <div className="h-1 rounded-full overflow-hidden bg-slate-200 dark:bg-zinc-800">
                              <div
                                  className="h-full rounded-full bg-blue-600"
                                  style={{ width: `${progress}%` }}
                              />
                            </div>
                            <p className="text-[9px] mt-1 text-center font-mono text-slate-400 dark:text-zinc-500">{progress}% Complete</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="h-9 w-9 rounded-full flex items-center justify-center bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                          <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                            Document Ingestion Completed
                          </p>
                          <p className="text-[9px] text-slate-400 dark:text-zinc-500 font-mono">Vector embeddings synced to pgvector</p>
                          <p className="text-xs" style={{ color: "var(--text-3)" }}>Opening dashboard…</p>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-3">
                      <div className="w-14 h-14 flex items-center justify-center mb-2.5 lottie-upload">
                        {mounted ? (
                          <Lottie
                            animationData={uploadAnimation}
                            loop={true}
                            autoplay={true}
                            style={{ width: "100%", height: "100%" }}
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
                            <svg className="w-4 h-4 text-slate-400 dark:text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                            </svg>
                          </div>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {dragging ? "Release to drop file" : "Drag and drop your file here"}
                      </p>
                      <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">
                        or click to browse local files
                      </p>
                      <span className="text-[8px] font-mono bg-slate-200/50 dark:bg-zinc-800 px-2 py-0.5 rounded mt-3 text-slate-500 dark:text-zinc-400">
                        PDF, TXT, MD, SQL, PY, JSON (Max 10MB)
                      </span>
                    </div>
                  )}

                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.txt,.md,.sql,.py,.json"
                    className="hidden"
                    onChange={onFileChange}
                  />
                </div>

                {/* Upload Action Button */}
                {!dropped && (
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="grad-btn w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold cursor-pointer shadow-sm"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                    Select File
                  </button>
                )}

                {/* Pipeline visualizer */}
                <div className="space-y-2">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                    Ingestion Pipeline
                  </p>
                  
                  <div className="flex items-center justify-between text-[9px] font-mono py-2.5 px-3 rounded-lg border border-slate-100 dark:border-zinc-800/80 bg-slate-50/20 dark:bg-black/10">
                    {[
                      { name: "File", min: 0, max: 20 },
                      { name: "Chunking", min: 20, max: 50 },
                      { name: "Embedding", min: 50, max: 80 },
                      { name: "Retrieval", min: 80, max: 100 },
                      { name: "Answer", min: 100, max: 100 }
                    ].map((st, idx, arr) => {
                      const isStepActive = progress >= st.min && progress < st.max;
                      const isStepCompleted = progress >= st.max;
                      return (
                        <div key={st.name} className="flex items-center gap-1 flex-1 justify-center last:flex-none">
                          <div className="flex items-center gap-1">
                            <span
                              className={`h-1.5 w-1.5 rounded-full transition-all duration-300 ${
                                isStepActive
                                  ? "bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.6)] scale-110"
                                  : isStepCompleted
                                    ? "bg-green-600"
                                    : "bg-slate-300 dark:bg-zinc-700"
                              }`}
                            />
                            <span
                              className={`font-semibold transition-colors duration-300 ${
                                isStepActive
                                  ? "text-blue-600 font-bold"
                                  : isStepCompleted
                                    ? "text-green-600"
                                    : "text-slate-400 dark:text-zinc-500"
                              }`}
                            >
                              {st.name}
                            </span>
                          </div>
                          {idx < arr.length - 1 && (
                            <span className="text-slate-300 dark:text-zinc-800 mx-auto opacity-40 text-[7px]">→</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Pipeline Log */}
                <div className="space-y-1.5">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                    Stream Pipeline Log
                  </p>

                  <div className="space-y-1.5 font-mono text-[9px] p-3 rounded-lg border border-slate-100 dark:border-zinc-800/80 bg-slate-50/20 dark:bg-black/10 text-slate-600 dark:text-slate-400 min-h-[64px]">
                    {dropped ? (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-slate-800 dark:text-slate-200">
                          <span className="font-semibold">{dropped}</span>
                          <span className="font-bold text-blue-600 dark:text-blue-400">{progress}%</span>
                        </div>
                        <div className="leading-relaxed whitespace-pre font-medium text-[8px] text-slate-500 dark:text-zinc-500">
                          {`> Parsing uploaded document... OK`}
                          {progress >= 20 && `\n> Splitting chunks... Done`}
                          {progress >= 50 && `\n> Generating vector embeddings... Done`}
                          {progress >= 80 && `\n> Storing in vector database... Ready`}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-2.5 text-center text-slate-400 dark:text-zinc-500">
                        <p className="font-medium">No knowledge indexed yet</p>
                        <p className="text-[8px] mt-0.5 text-slate-300 dark:text-zinc-600">Upload your first document to begin.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Footer */}
                <div
                  className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-zinc-800 text-[10px]"
                >
                  <span className="text-slate-400 dark:text-zinc-500">
                    Storage status: Active
                  </span>
                  
                  <button
                    onClick={() => router.push("/dashboard")}
                    className="font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    Open dashboard →
                  </button>
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
