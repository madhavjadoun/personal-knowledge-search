"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import BlurText from "@/components/ui/BlurText";
import { supabase } from "@/lib/supabase";

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
  "Summarize my research paper",
  "Explain this PDF in simple words",
  "What are the key findings?",
  "Compare two uploaded documents",
  "Find all mentions of Prisma",
  "Generate interview questions",
  "Create revision notes",
  "Find important formulas",
  "Explain pgvector embeddings",
  "What changed between documents?",
  "Extract action items",
  "Generate a project roadmap",
  "Convert notes into flashcards",
  "Explain this topic like I'm a beginner",
  "What are the risks mentioned?",
  "Create a study plan from my notes",
];

const AI_RESPONSE_POOL = [
  {
    answer: "Based on the uploaded research paper, the key findings show that sparse attention networks decrease computational overhead by 40% while preserving 98.2% accuracy in sequence-to-sequence model tests.",
    source: "Attention_Research_Paper.pdf",
    score: "98.2%",
    ms: "115ms",
    retrieval: "0.965",
    ext: "PDF",
  },
  {
    answer: "This PDF contains a comprehensive description of quantum entanglement. In simple terms, it explains how paired particles remain connected across distances, exchanging states instantaneously without violating local constraints.",
    source: "Quantum_Physics_Intro.pdf",
    score: "95.6%",
    ms: "140ms",
    retrieval: "0.912",
    ext: "PDF",
  },
  {
    answer: "The key findings in this document show a 14% year-over-year revenue increase, driven primarily by enterprise SaaS subscriptions, though marketing acquisition costs rose by 8.4%.",
    source: "Q2_Financials_Report.pdf",
    score: "97.1%",
    ms: "110ms",
    retrieval: "0.948",
    ext: "PDF",
  },
  {
    answer: "Comparing both files: API_v1.json uses RESTful endpoints and traditional query params, whereas API_v2.md implements a GraphQL gateway, resulting in 30% fewer network hops for nested entities.",
    source: "API_Architecture_Compare.md",
    score: "94.2%",
    ms: "185ms",
    retrieval: "0.915",
    ext: "MD",
  },
  {
    answer: "Study Plan: Week 1: Study vector spaces and metrics (Cosine, L2). Week 2: Configure pgvector indexes on local PostgreSQL tables. Week 3: Implement langchain splits and semantic ingestion loops.",
    source: "Vector_DB_Learning_Guide.md",
    score: "96.0%",
    ms: "138ms",
    retrieval: "0.925",
    ext: "MD",
  },
  {
    answer: "The Prisma schema defines the database structure. It maps three model classes (User, Document, VectorChunk) directly to PostgreSQL relational tables, ensuring rigid compile-time type validation.",
    source: "schema.prisma",
    score: "98.5%",
    ms: "92ms",
    retrieval: "0.963",
    ext: "SQL",
  },
  {
    answer: "The RAG pipeline operates by: 1. Parsing user inputs into queries. 2. Querying pgvector for nearest context fragments. 3. Merging queries and contexts to format LLM system prompts.",
    source: "RAG_Knowledge_Flow.md",
    score: "97.9%",
    ms: "112ms",
    retrieval: "0.958",
    ext: "MD",
  },
  {
    answer: "Comparing OpenAI text-embedding-3-small and Cohere v3 models: Cohere excels at multi-lingual token representations, whereas OpenAI text-embedding-3 shows 12% faster query indexing latencies.",
    source: "Embedding_Model_Comparisons.pdf",
    score: "94.8%",
    ms: "172ms",
    retrieval: "0.901",
    ext: "PDF",
  },
  {
    answer: "Prisma Schema exports the postgres connector specs: url = env('DATABASE_URL') and provider = 'postgresql'. It supports local ssl connections and connection pool parameter overrides.",
    source: "db_connection.prisma",
    score: "99.0%",
    ms: "82ms",
    retrieval: "0.985",
    ext: "SQL",
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
  const [currentAnswer, setCurrentAnswer] = useState("RAG embeds your query into a vector, retrieves the top-k similar chunks from pgvector, then feeds those as context to the LLM — giving you grounded, accurate answers straight from your own documents.");
  const [currentSource, setCurrentSource] = useState("RAG_Knowledge_Flow.md");
  const [currentScore, setCurrentScore] = useState("94.2%");
  const [currentMs, setCurrentMs] = useState("140ms");
  const [currentRetrieval, setCurrentRetrieval] = useState("0.942");
  const [currentExt, setCurrentExt] = useState("MD");

  // Premium Theme Toggle
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // Randomized visible questions
  const [visibleQuestions, setVisibleQuestions] = useState<string[]>([]);

  const typeIntervalRef = useRef<NodeJS.Timeout | null>(null);

  /* Welcome page theme initialization */
  useEffect(() => {
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

  /* Shuffling 6 user-focused questions on refresh */
  useEffect(() => {
    const shuffled = [...EXAMPLE_QUESTIONS].sort(() => 0.5 - Math.random());
    setVisibleQuestions(shuffled.slice(0, 6));
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
    }, 1600);
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
    
    setCurrentAnswer(response.answer);
    setCurrentSource(response.source);
    setCurrentScore(response.score);
    setCurrentMs(response.ms);
    setCurrentRetrieval(response.retrieval);
    setCurrentExt(response.ext);
    
    triggerTypeEffect(response.answer);
  };

  /* Upload logic */
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadFileToSupabase = async (file: File) => {
    setDropped(file.name);
    setUploadError(null);
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
      // 1. Upload to Supabase Storage bucket 'documents'
      const storagePath = `uploads/${Date.now()}_${file.name}`;
      const { data: storageData, error: storageError } = await supabase.storage
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

      // Redirect to dashboard page
      setTimeout(() => {
        router.push("/dashboard");
      }, 1500);

    } catch (err: any) {
      clearInterval(progressInterval);
      console.error("Upload failed:", err);
      setUploadError(err.message || "An unexpected error occurred during upload.");
      setDropped(null);
      setProgress(0);
      alert("Upload failed: " + (err.message || "Unknown error"));
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
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden app-bg">
      {/* ── Aurora glows ── */}
      <div className="aurora-tl" />
      <div className="aurora-br" />
      <div className="aurora-accent" />

      {/* Floating Header with CTA buttons in top right */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-end px-6 sm:px-10 lg:px-16 py-6">
        <div className="flex items-center gap-3">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-center hover:scale-[1.03]"
            style={{
              borderColor: "var(--border)",
              background: "var(--surface)",
              color: "var(--text-1)",
              boxShadow: "var(--shadow-sm)",
            }}
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
            className="text-xs font-semibold px-4 py-2 rounded-xl transition-all cursor-pointer"
            style={{ color: "var(--text-1)", border: "1px solid var(--border)", background: "var(--surface)" }}
          >
            Sign in
          </button>
          <div className="grad-border rounded-xl">
            <button
              onClick={() => router.push("/login")}
              className="grad-btn flex items-center gap-1.5 px-4 py-2 rounded-[11px] text-xs font-semibold cursor-pointer"
            >
              Get started
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ── Main grid ── */}
      <div className="relative z-10 w-full max-w-7xl mx-auto flex items-center min-h-screen px-6 sm:px-10 lg:px-16 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 w-full items-start">

          {/* ══════════════════════════════
              LEFT — Content column
          ══════════════════════════════ */}
          <div className="flex flex-col gap-7 max-w-[530px] lg:max-w-none">
            {/* Brand + logo */}
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

            {/* ── Big Heading with rotating word ── */}
            <div>
              <div
                className="text-[42px] lg:text-[58px] font-black leading-[1.04]"
                style={{ color: "var(--text-1)", letterSpacing: "-0.042em" }}
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
                            background: "linear-gradient(135deg, var(--indigo) 0%, var(--violet) 60%, var(--cyan) 100%)",
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                            backgroundClip: "text",
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
              <p className="text-base mt-4 leading-relaxed font-medium" style={{ color: "var(--text-2)", maxWidth: "450px", letterSpacing: "-0.01em" }}>
                <BlurText
                  text="Your AI-powered second brain. Upload any document, ask questions in plain language, and get cited, accurate answers in under 200ms."
                  delay={45}
                />
              </p>

              {/* Premium Trust Strip */}
              <div className="flex items-center gap-4 text-[10px] font-mono tracking-wide text-zinc-400 dark:text-zinc-500 mt-5 pt-3 border-t max-w-[450px]" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                  <span>Private</span>
                </div>
                <span className="text-zinc-300 dark:text-zinc-700">·</span>
                <div className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
                  <span>Local First</span>
                </div>
                <span className="text-zinc-300 dark:text-zinc-700">·</span>
                <div className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                  <span>Source Citations</span>
                </div>
                <span className="text-zinc-300 dark:text-zinc-700">·</span>
                <div className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span>Semantic</span>
                </div>
              </div>
            </div>

            {/* ── Example question chips ── */}
            <div className="space-y-2.5">
              <p className="text-[10px] font-black uppercase tracking-[0.12em]" style={{ color: "var(--text-3)" }}>
                ✦ Try asking your documents
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[160px] overflow-y-auto pr-1">
                {visibleQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => handleQuestionClick(q, i)}
                    className="text-[11px] text-left px-3 py-2 rounded-lg font-medium transition-all duration-200 cursor-pointer border hover:scale-[1.01]"
                    style={{
                      background: activeQ === i ? "rgba(99, 102, 241, 0.08)" : "var(--surface)",
                      border: `1px solid ${activeQ === i ? "rgba(99, 102, 241, 0.28)" : "var(--border)"}`,
                      color: activeQ === i ? "var(--indigo)" : "var(--text-2)",
                      transform: activeQ === i ? "translateY(-1px)" : "translateY(0)",
                      boxShadow: activeQ === i ? "0 4px 12px rgba(99, 102, 241, 0.1)" : "none",
                    }}
                    onMouseEnter={e => {
                      if (activeQ !== i) {
                        e.currentTarget.style.borderColor = "var(--border-accent)";
                        e.currentTarget.style.background = "var(--bg-2)";
                        e.currentTarget.style.color = "var(--text-1)";
                        e.currentTarget.style.boxShadow = "0 4px 12px rgba(99, 102, 241, 0.05)";
                      }
                    }}
                    onMouseLeave={e => {
                      if (activeQ !== i) {
                        e.currentTarget.style.borderColor = "var(--border)";
                        e.currentTarget.style.background = "var(--surface)";
                        e.currentTarget.style.color = "var(--text-2)";
                        e.currentTarget.style.boxShadow = "none";
                      }
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Mini AI Demo ── */}
            <div
              className="rounded-xl overflow-hidden p-4 space-y-4 shadow-sm"
              style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
            >
              {/* Demo topbar */}
              <div
                className="flex items-center justify-between pb-3"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    {["#FF5F57", "#FEBC2E", "#28C840"].map(c => (
                      <span key={c} className="h-2.5 w-2.5 rounded-full" style={{ background: c, opacity: 0.8 }} />
                    ))}
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-wider ml-1.5" style={{ color: "var(--text-3)" }}>Semantic Preview</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-md font-semibold" style={{ background: "rgba(5,150,105,0.08)", color: "#10b981" }}>
                    ● Online
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-md" style={{ background: "var(--bg-3)", color: "var(--text-3)" }}>
                    {currentMs}
                  </span>
                </div>
              </div>

              {/* User message bubble */}
              <div className="flex justify-end pl-10">
                <div className="chat-user-bubble px-4 py-3 text-xs max-w-full">
                  <p className="font-semibold text-white text-right leading-relaxed" style={{ color: "#ffffff" }}>{currentQuestion}</p>
                </div>
              </div>

              {/* AI answer bubble */}
              <div className="flex justify-start pr-10">
                <div className="chat-ai-bubble px-4 py-3.5 text-xs w-full">
                  {showAnswer ? (
                    <div className="space-y-3">
                      <p className="leading-relaxed font-medium" style={{ color: "var(--text-1)" }}>
                        {typedAnswer}
                        {!demoReady && (
                          <span
                            className="inline-block w-[2px] h-3.5 ml-0.5 align-middle animate-pulse"
                            style={{ background: "var(--indigo)", borderRadius: "1px" }}
                          />
                        )}
                      </p>
                      {demoReady && (
                        <motion.div
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.4 }}
                          className="flex items-center justify-between border-t pt-2.5 flex-wrap gap-2"
                          style={{ borderColor: "var(--border)" }}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] uppercase tracking-wider font-bold" style={{ color: "var(--text-3)" }}>Source:</span>
                            <span
                              className="text-[10px] px-2 py-0.5 rounded-md font-semibold"
                              style={{ background: "rgba(99, 102, 241, 0.08)", color: "var(--indigo)", border: "1px solid rgba(99, 102, 241, 0.15)" }}
                            >
                              📄 {currentSource}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1">
                              <span className="text-[9px] uppercase tracking-wider font-bold" style={{ color: "var(--text-3)" }}>Similarity:</span>
                              <span className="text-[10px] font-mono font-bold" style={{ color: "var(--text-2)" }}>{currentRetrieval}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[9px] uppercase tracking-wider font-bold" style={{ color: "var(--text-3)" }}>Confidence:</span>
                              <span
                                className="text-[10px] px-2 py-0.5 rounded-md font-bold"
                                style={{ background: "rgba(6,182,212,0.08)", color: "var(--cyan)", border: "1px solid rgba(6,182,212,0.15)" }}
                              >
                                {currentScore} Accuracy
                              </span>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2.5 py-1">
                      {[100, 85, 60].map((w, i) => (
                        <div
                          key={i}
                          className="h-2.5 rounded-full animate-pulse"
                          style={{ background: "var(--bg-3)", width: `${w}%` }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Stats strip ── */}
            <div
              className="grid grid-cols-4 gap-4 px-5 py-4 rounded-xl"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              {STATS.map((s, i) => (
                <div key={i} className="text-center">
                  <p
                    className="text-xl font-black"
                    style={{
                      letterSpacing: "-0.03em",
                      background: "linear-gradient(135deg, var(--indigo), var(--violet))",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    {s.value}
                  </p>
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium uppercase mt-0.5 tracking-wider">
                    {s.label}
                  </p>
                </div>
              ))}
            </div>

            {/* Trust line */}
            <p className="text-[11px] font-mono text-center lg:text-left" style={{ color: "var(--text-3)" }}>
              pgvector · sentence-transformers · Next.js 15 · PostgreSQL
            </p>
          </div>

          {/* ══════════════════════════════
              RIGHT — Hero upload card
          ══════════════════════════════ */}
          <div className="relative flex items-center justify-center w-full lg:translate-y-12 translate-y-0">

            {/* Soft bloom behind the card */}
            <div
              className="absolute inset-0 -m-10 rounded-[40px] pointer-events-none"
              style={{
                background: "radial-gradient(ellipse at 55% 45%, rgba(79,70,229,0.11) 0%, rgba(124,58,237,0.07) 50%, transparent 75%)",
                filter: "blur(16px)",
              }}
            />



            {/* Card — layered depth + glass */}
            <div
              className="w-full max-w-[500px] relative z-10 rounded-2xl p-[1.5px]"
              style={{
                background: "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)",
                boxShadow: "0 24px 48px -12px rgba(0, 0, 0, 0.35)"
              }}
            >
              <div className="glass-card rounded-[15px] overflow-hidden" style={{ border: "1px solid var(--border-strong)" }}>
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
                      AI Knowledge Ingestion
                    </p>
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--text-3)" }}>
                      PDF · TXT · DOCX · Markdown · Images
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
                      minHeight: "220px",
                      border: `2px dashed ${dragging ? "var(--indigo)" : dropped ? "rgba(10,185,129,0.4)" : "var(--border-strong)"}`,
                      background: dragging
                        ? "rgba(99,102,241,0.08)"
                        : dropped
                        ? "rgba(16,185,129,0.03)"
                        : "var(--bg-2)",
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
                            <p className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>
                              Indexing <span style={{ color: "var(--indigo)" }}>{dropped}</span>
                            </p>
                            <div className="w-full max-w-[220px]">
                              <div className="h-1 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                                <div
                                  className="h-full rounded-full transition-all duration-300"
                                  style={{ width: `${progress}%`, background: "linear-gradient(90deg, var(--cyan), var(--indigo))" }}
                                />
                              </div>
                              <p className="text-[10px] mt-1.5 text-center font-mono" style={{ color: "var(--text-3)" }}>{progress}% Complete</p>
                            </div>
                          </>
                        ) : (
                          <>
                            <div
                              className="h-10 w-10 rounded-full flex items-center justify-center animate-bounce"
                              style={{ background: "rgba(5,150,105,0.10)" }}
                            >
                              <svg className="w-5 h-5" style={{ color: "#059669" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                            </div>
                            <p className="text-sm font-semibold text-emerald-500">
                              Engine Ingestion Successful
                            </p>
                            <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">Document chunks stored in pgvector</p>
                            <p className="text-xs" style={{ color: "var(--text-3)" }}>Opening dashboard…</p>
                          </>
                        )}
                      </div>
                    ) : (
                      /* Default state */
                      <div className="w-full flex flex-col items-center justify-center p-4">
                        {/* Upload icon */}
                        <div
                          className="h-11 w-11 rounded-2xl flex items-center justify-center mb-3 transition-transform duration-200"
                          style={{
                            background: dragging ? "rgba(99,102,241,0.10)" : "var(--bg)",
                            border: "1px solid var(--border)",
                            transform: dragging ? "scale(1.08)" : "scale(1)",
                          }}
                        >
                          <svg
                            className="w-5 h-5 transition-colors"
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
                          PDF · TXT · DOCX · Markdown · Images
                        </p>

                        <input
                          ref={fileRef}
                          type="file"
                          accept=".pdf,.txt,.md,.sql,.py,.json"
                          className="hidden"
                          onChange={onFileChange}
                        />
                      </div>
                    )}
                  </div>

                  {/* Upload button */}
                  {!dropped && (
                    <div
                      className="rounded-xl p-[1.5px]"
                      style={{
                        background: "linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.01))",
                      }}
                    >
                      <button
                        onClick={() => fileRef.current?.click()}
                        className="grad-btn w-full flex items-center justify-center gap-2 py-3 rounded-[11px] text-sm font-semibold cursor-pointer shadow-md shadow-indigo-500/5 hover:shadow-indigo-500/10 transition-all duration-200 active:scale-[0.98] hover:scale-[1.01]"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.1}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                        </svg>
                        Upload Knowledge
                      </button>
                    </div>
                  )}

                  {/* Knowledge Pipeline (glowing visual process) */}
                  <div className="space-y-2 pt-1">
                    <p className="text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--text-3)" }}>
                      AI Knowledge Pipeline
                    </p>
                    <div className="flex items-center justify-between text-[10px] font-mono py-2.5 px-3 rounded-xl border bg-black/[0.01] dark:bg-white/[0.01]" style={{ borderColor: "var(--border)" }}>
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
                                className={`h-1.5 w-1.5 rounded-full transition-all duration-300 ${isStepActive
                                  ? "bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.9)] scale-110"
                                  : isStepCompleted
                                    ? "bg-emerald-500"
                                    : "bg-zinc-300 dark:bg-zinc-700"
                                }`}
                              />
                              <span
                                className={`font-semibold transition-colors duration-300 ${isStepActive
                                  ? "text-indigo-500 font-bold"
                                  : isStepCompleted
                                    ? "text-emerald-500"
                                    : "text-zinc-400 dark:text-zinc-500"
                                }`}
                              >
                                {st.name}
                              </span>
                            </div>
                            {idx < arr.length - 1 && (
                              <span className="text-zinc-300 dark:text-zinc-700 mx-auto opacity-30 text-[8px]">→</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Live indexing activity section */}
                  <div className="space-y-2 pt-2">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                      <span className="text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--text-3)" }}>
                        Live Pipeline Ingestion log
                      </span>
                      <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                    </div>

                    <div className="space-y-1.5 font-mono text-[10px] p-3 rounded-lg border bg-black/[0.02] dark:bg-white/[0.02]" style={{ borderColor: "var(--border)" }}>
                      <div className="flex items-center justify-between text-[9px] pb-1.5 border-b uppercase tracking-wider font-bold mb-1.5" style={{ borderColor: "var(--border)", color: "var(--text-3)" }}>
                        <span>Stream Ingestion</span>
                        <span className="flex items-center gap-1 text-emerald-500 font-semibold">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Realtime
                        </span>
                      </div>

                      {dropped ? (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400">
                            <div className="flex items-center gap-2">
                              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-ping" />
                              <span className="font-semibold text-zinc-700 dark:text-zinc-300">{dropped}</span>
                            </div>
                            <span>{progress}%</span>
                          </div>
                          <div className="text-zinc-400 dark:text-zinc-500 leading-normal whitespace-pre-line font-medium text-[9px]">
                            {`> Parsing uploaded document... OK`}
                            {progress >= 20 && `\n> Splitting chunks... Done`}
                            {progress >= 50 && `\n> Generating vector embeddings... Done`}
                            {progress >= 80 && `\n> Storing in vector database... Ready`}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400">
                            <div className="flex items-center gap-2">
                              <span className="text-emerald-500 font-bold">✓</span>
                              <span className="font-semibold text-zinc-700 dark:text-zinc-300">Climate_Change_Report.pdf</span>
                            </div>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold uppercase">Indexed</span>
                          </div>
                          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400">
                            <div className="flex items-center gap-2">
                              <span className="text-emerald-500 font-bold">✓</span>
                              <span className="font-semibold text-zinc-700 dark:text-zinc-300">French_History_Notes.md</span>
                            </div>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-600 dark:text-violet-400 font-bold uppercase">Embedded</span>
                          </div>
                          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400">
                            <div className="flex items-center gap-2">
                              <span className="text-emerald-500 font-bold">✓</span>
                              <span className="font-semibold text-zinc-700 dark:text-zinc-300">Lecture_Transcript.txt</span>
                            </div>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 font-bold uppercase">Processed</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card footer */}
                  <div
                    className="flex items-center justify-between pt-2"
                    style={{ borderTop: "1px solid var(--border)" }}
                  >
                    <p className="text-[10px]" style={{ color: "var(--text-3)" }}>
                      {dropped ? "4 documents · 1,364 vector chunks" : "3 documents · 1,240 vector chunks"}
                    </p>
                    <button
                      onClick={() => router.push("/dashboard")}
                      className="text-[10px] font-medium transition-colors cursor-pointer"
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
