"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { supabase } from "@/lib/supabase";
import BlurText from "@/components/ui/BlurText";
import dynamic from "next/dynamic";
import uploadAnimation from "../../public/upload.json";
import OrbitLoader from "@/components/app/OrbitLoader";
import NavbarLogo from "@/components/layout/NavbarLogo";
import ShinyText from "@/components/ui/ShinyText";
import LogoSVG from "@/components/layout/LogoSVG";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

/* ── Constants ─────────────────────────────────── */

const ROTATING_WORDS = [
  "build quizzes.",
  "practice smarter.",
  "master concepts.",
  "learn faster."
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
  "Operating Systems",
  "DBMS",
  "Computer Networks",
  "DSA",
  "Machine Learning",
  "Physics",
  "Biology",
  "Chemistry",
  "History",
];



const FooterLink = ({ href, text, onClick, target, rel }: { href?: string; text: string; onClick?: () => void; target?: string; rel?: string }) => {
  const [isHovered, setIsHovered] = useState(false);

  const content = (
    <ShinyText
      text={text}
      disabled={!isHovered}
      color={isHovered ? "var(--indigo-accent)" : "var(--text-2)"}
      shineColor="#ffffff"
      speed={0.8}
      spread={60}
      delay={2}
    />
  );

  const classes = "footer-link-shine cursor-pointer text-left flex items-center text-sm transition-all duration-300 hover:translate-x-0.5";

  if (onClick) {
    return (
      <button
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={onClick}
        className={classes}
      >
        {content}
      </button>
    );
  }

  return (
    <a
      href={href}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      target={target}
      rel={rel}
      className={classes}
    >
      {content}
    </a>
  );
};

/* ── Component ──────────────────────────────────── */

export default function WelcomePage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const isHeroInView = useInView(heroRef, { once: false, amount: 0.15 });
  const sectionRef = useRef<HTMLDivElement>(null);
  const isSectionInView = useInView(sectionRef, { once: false, amount: 0.15 });

  const [mounted, setMounted] = useState(false);

  // Upload state
  const [dragging, setDragging] = useState(false);
  const [dropped, setDropped] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // Rotating word
  const [wordIndex, setWordIndex] = useState(0);

  // Shuffled visible questions
  const [visibleQuestions, setVisibleQuestions] = useState<string[]>([]);

  /* Welcome page theme initialization */
  useEffect(() => {
    setMounted(true);
    document.documentElement.classList.remove("dark");
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

  /* Shuffling 5 user-focused questions on refresh */
  useEffect(() => {
    const shuffled = [...EXAMPLE_QUESTIONS].sort(() => 0.5 - Math.random());
    setVisibleQuestions(shuffled.slice(0, 5));
  }, []);

  /* Rotate words every 2.0s */
  useEffect(() => {
    const iv = setInterval(() => setWordIndex(i => (i + 1) % ROTATING_WORDS.length), 2000);
    return () => clearInterval(iv);
  }, []);



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

      // Trigger RAG document parsing pipeline asynchronously
      console.log("[Upload] Triggering PDF document processing...");
      fetch("/api/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({
          storagePath,
          fileName: file.name
        })
      }).then(async res => {
        if (!res.ok) {
          const errText = await res.text();
          console.error("[Upload] Document processing error:", errText);
        } else {
          console.log("[Upload] Document processing triggered/finished successfully.");
        }
      }).catch(err => {
        console.error("[Upload] Document processing trigger failed:", err);
      });

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
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden bg-[var(--bg)] transition-colors duration-200">

      {/* ── Aurora Glow (behind everything) ── */}
      <div className="aurora-tl" />
      <div className="aurora-br" />
      <div className="aurora-accent" />



      {/* Top Header */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-6 sm:px-12 lg:px-20 py-5 border-b border-[var(--border)] bg-[var(--surface)] backdrop-blur-md">
        <div className="flex items-center">
          <NavbarLogo />
        </div>

        <div className="flex items-center gap-5">
          <button
            onClick={() => router.push("/login")}
            className="text-xs font-semibold px-4 py-2 rounded-lg border border-[var(--border)] transition-all duration-[250ms] cursor-pointer hover:bg-[var(--bg-2)] hover:text-[var(--text-1)] hover:-translate-y-0.5 shadow-sm active:translate-y-0"
          >
            Sign in
          </button>

          <button
            onClick={() => router.push("/login")}
            className="grad-btn px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-[250ms] hover:-translate-y-0.5 flex items-center gap-1.5 group shadow-sm active:translate-y-0"
          >
            Get started
            <span className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <motion.div ref={heroRef} className="relative z-10 w-full max-w-7xl mx-auto flex flex-col justify-center px-4 sm:px-12 lg:px-20 pt-20 pb-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-[72px] w-full items-start">

          {/* LEFT — Content Column (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-6.5 max-w-[530px] lg:max-w-none">

            {/* Title with integrated rotating text */}
            <div>
              <h1
                className="text-[30px] xs:text-[34px] sm:text-[48px] lg:text-[60px] font-bold leading-[1.0] text-[var(--text-1)]"
                style={{ letterSpacing: "-0.03em" }}
              >
                <BlurText
                  text="Turn any document"
                  delay={40}
                />{" "}
                <br className="hidden sm:inline" />
                <BlurText
                  text="into an AI quiz to"
                  delay={40}
                  className="mr-2"
                />
                <span className="relative inline-block overflow-hidden h-[1.2em] whitespace-nowrap align-bottom text-[var(--indigo-accent)]">
                  <AnimatePresence mode="popLayout">
                    <motion.span
                      key={wordIndex}
                      className="inline-block will-change-[transform,opacity,filter]"
                      style={{ willChange: "transform, opacity, filter" }}
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
                            className="inline-block will-change-[transform,opacity,filter]"
                            style={{
                              display: "inline-block",
                              whiteSpace: "pre",
                              color: "var(--indigo-accent)",
                              willChange: "transform, opacity, filter"
                            }}
                          >
                            {char}
                          </motion.span>
                        );
                      })}
                    </motion.span>
                  </AnimatePresence>
                </span>
              </h1>

              {/* Subheading with BlurText */}
              <p className="text-[18px] lg:text-[20px] font-normal leading-[1.6] text-[var(--text-2)] mt-4 max-w-[640px]">
                <BlurText
                  text="Upload searchable or scanned PDFs, lecture slides, and notes. Our OCR pipeline extracts the text, chunks the content, and generates interactive MCQ practice tests in seconds."
                  delay={45}
                />
              </p>

            </div>

            {/* Categories & Trust Strip Container */}
            <motion.div
              initial="hidden"
              animate={isHeroInView ? "visible" : "hidden"}
              variants={{
                hidden: { opacity: 0, y: 15, transition: { duration: 0 } },
                visible: { opacity: 1, y: 0, transition: { duration: 0.6, delay: 0.2 } }
              }}
              className="space-y-6"
            >
              {/* Trust Strip */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] font-mono uppercase tracking-wider text-[var(--text-4)] pt-3.5 border-t border-[var(--border)]">
                <span>Private</span>
                <span className="text-[var(--border)]">·</span>
                <span>OCR Scanning</span>
                <span className="text-[var(--border)]">·</span>
                <span>Instant MCQs</span>
                <span className="text-[var(--border)]">·</span>
                <span>Study Aids</span>
              </div>

              {/* Inline query chips */}
              <div className="space-y-2.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-4)]">
                  ✦ Practice Categories
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {visibleQuestions.map((q, i) => (
                    <span
                      key={i}
                      className="text-[11px] px-2.5 py-1 rounded-full font-medium transition-all duration-150 border border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:border-[var(--border-strong)] hover:text-[var(--text-1)] hover:bg-[var(--bg-2)] cursor-default select-none"
                    >
                      {q}
                    </span>
                  ))}
                </div>
              </div>
            </motion.div>





          </div>

          {/* RIGHT — Hero Upload/Ingestion Box (7 cols) */}
          <motion.div
            initial="hidden"
            animate={isHeroInView ? "visible" : "hidden"}
            variants={{
              hidden: { opacity: 0, x: 25, transition: { duration: 0 } },
              visible: { opacity: 1, x: 0, transition: { type: "spring", damping: 20, stiffness: 80, delay: 0.1 } }
            }}
            className="lg:col-span-7 flex flex-col justify-center w-full"
          >
            <div className="w-full max-w-[540px] mx-auto lg:ml-auto lg:mr-0 glass-card rounded-xl overflow-hidden">

              {/* Card Header */}
              <div
                className="px-6 py-4 flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-2)]/30"
              >
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-1)]">
                    AI Quiz Generator
                  </h3>
                  <p className="text-[10px] text-[var(--text-3)] mt-0.5">
                    Select searchable or scanned PDFs to generate practice tests.
                  </p>
                </div>

                {/* Decorative dots */}
                <div className="flex items-center gap-1.5">
                  {["#E9EEFF", "#DDF7F5", "#FFF1E6"].map((c) => (
                    <div key={c} className="h-2 w-2 rounded-full border border-[var(--border)]" style={{ background: c }} />
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
                  className="rounded-xl flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 border-2 border-dashed relative p-4 sm:p-6 bg-[var(--bg-2)]/30 group min-h-[160px] sm:min-h-[200px]"
                  style={{
                    borderColor: dragging ? "var(--indigo)" : dropped ? "#16A34A" : "var(--border-strong)",
                  }}
                >
                  {dropped ? (
                    <div className="flex flex-col items-center gap-3 w-full max-w-[280px]">
                      {progress < 100 ? (
                        <>
                          <OrbitLoader size={40} />
                          <p className="text-xs font-semibold text-[var(--text-1)]">
                            Generating Quiz <span className="text-[var(--text-2)]">{dropped}</span>
                          </p>
                          <div className="w-full">
                            <div className="h-1 rounded-full overflow-hidden bg-[var(--bg-3)]">
                              <div
                                className="h-full rounded-full bg-[var(--indigo)]"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <p className="text-[9px] mt-1 text-center font-mono text-[var(--text-4)]">{progress}% Complete</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="h-9 w-9 rounded-full flex items-center justify-center bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                          <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                            Quiz Generation Completed
                          </p>
                          <p className="text-[9px] text-[var(--text-4)] font-mono">Practice quiz ready for review</p>
                          <p className="text-xs text-[var(--text-3)]">Opening dashboard…</p>
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
                          <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-[var(--surface)] border border-[var(--border)]">
                            <svg className="w-4 h-4 text-[var(--text-4)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                            </svg>
                          </div>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-[var(--text-2)]">
                        {dragging ? "Release to drop file" : "Drag and drop your PDF here"}
                      </p>
                      <p className="text-[10px] text-[var(--text-4)] mt-0.5">
                        or click to browse local files
                      </p>
                      <span className="text-[8px] font-mono bg-[var(--bg-2)] px-2 py-0.5 rounded mt-3 text-[var(--text-3)]">
                        Searchable & Scanned PDFs (Max 25MB)
                      </span>
                    </div>
                  )}

                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf"
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
                  <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-4)]">
                    Quiz Generation Pipeline
                  </p>

                  <div className="flex items-center justify-between text-[9px] font-mono py-2.5 px-3 rounded-lg border border-[var(--border)] bg-[var(--bg-2)]/30">
                    {[
                      { name: "Upload", min: 0, max: 20 },
                      { name: "OCR", min: 20, max: 50 },
                      { name: "Chunking", min: 50, max: 80 },
                      { name: "AI Quiz", min: 80, max: 100 },
                      { name: "Ready", min: 100, max: 100 }
                    ].map((st, idx, arr) => {
                      const isStepActive = progress >= st.min && progress < st.max;
                      const isStepCompleted = progress >= st.max;
                      return (
                        <div key={st.name} className="flex items-center gap-1 flex-1 justify-center last:flex-none">
                          <div className="flex items-center gap-1">
                            <span
                              className={`h-1.5 w-1.5 rounded-full transition-all duration-300 ${isStepActive
                                ? "bg-[var(--indigo)] scale-110"
                                : isStepCompleted
                                  ? "bg-green-600"
                                  : "bg-[var(--bg-3)]"
                                }`}
                            />
                            <span
                              className={`font-semibold transition-colors duration-300 ${isStepActive
                                ? "text-[var(--text-1)] font-bold"
                                : isStepCompleted
                                  ? "text-green-600"
                                  : "text-[var(--text-4)]"
                                }`}
                            >
                              {st.name}
                            </span>
                          </div>
                          {idx < arr.length - 1 && (
                            <span className="text-[var(--border)] mx-auto opacity-40 text-[7px]">→</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Pipeline Log */}
                <div className="space-y-1.5">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-4)]">
                    Quiz Generation Log
                  </p>

                  <div className="space-y-1.5 font-mono text-[9px] p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-2)]/30 text-[var(--text-3)] min-h-[64px]">
                    {dropped ? (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[var(--text-1)]">
                          <span className="font-semibold">{dropped}</span>
                          <span className="font-bold text-[var(--text-2)]">{progress}%</span>
                        </div>
                        <div className="leading-relaxed whitespace-pre font-medium text-[8px] text-[var(--text-4)]">
                          {`> Uploading and scanning document... OK`}
                          {progress >= 20 && `\n> Running OCR text extraction... Done`}
                          {progress >= 50 && `\n> Splitting text into context chunks... Done`}
                          {progress >= 80 && `\n> Generating MCQs via Gemini AI... Ready`}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-2.5 text-center text-[var(--text-4)]">
                        <p className="font-medium">No quiz generated yet</p>
                        <p className="text-[8px] mt-0.5 text-[var(--text-4)]">Upload a PDF to generate a practice quiz.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Footer */}
                <div
                  className="flex items-center justify-between pt-3 border-t border-[var(--border)] text-[10px] text-[var(--text-4)] gap-2"
                >
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold text-[8px] uppercase tracking-wider border border-emerald-500/10">
                      OCR Ready
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-[var(--indigo)]/10 text-[var(--indigo)] dark:text-[var(--indigo-accent)] font-semibold text-[8px] uppercase tracking-wider border border-[var(--indigo)]/10">
                      AI Powered
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold text-[8px] uppercase tracking-wider border border-amber-500/10">
                      10–50 MCQs
                    </span>
                  </div>

                  <button
                    onClick={() => router.push("/dashboard")}
                    className="font-semibold text-[var(--text-2)] hover:underline cursor-pointer flex-shrink-0"
                  >
                    Open dashboard →
                  </button>
                </div>

              </div>
            </div>
          </motion.div>
        </div>

      {/* How It Works Section */}
      <motion.div
        ref={sectionRef}
        initial="hidden"
        animate={isSectionInView ? "visible" : "hidden"}
        variants={{
          hidden: { opacity: 0, y: 15, transition: { duration: 0 } },
          visible: {
            opacity: 1,
            y: 0,
            transition: {
              duration: 0.5,
              staggerChildren: 0.12
            }
          }
        }}
        className="w-full mt-16 sm:mt-24 space-y-10 relative"
      >
        {/* Section Header */}
        <div className="text-center space-y-2.5">
          <h3 className="text-lg font-bold text-[var(--text-1)] tracking-tight">
            How It Works
          </h3>
          <p className="text-xs text-[var(--text-3)] max-w-lg mx-auto">
            Turn any document into high-yield interactive practice tests in four simple steps
          </p>
        </div>

        {/* Stepper Grid Container */}
        <div className="relative">
          
          {/* Horizontal dashed connector line for desktop */}
          <div className="absolute top-[52px] left-[12%] right-[12%] h-[2px] hidden lg:block z-0">
            <svg className="w-full h-[2px]">
              <motion.line
                x1="0%"
                y1="50%"
                x2="100%"
                y2="50%"
                stroke="url(#line-grad-horizontal)"
                strokeWidth="2"
                strokeDasharray="6 6"
                variants={{
                  hidden: { pathLength: 0, transition: { duration: 0 } },
                  visible: { pathLength: 1, transition: { duration: 1.6, ease: [0.25, 1, 0.5, 1], delay: 0.25 } }
                }}
              />
              <defs>
                <linearGradient id="line-grad-horizontal" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="var(--indigo)" />
                  <stop offset="50%" stopColor="var(--indigo-accent)" stopOpacity="0.7" />
                  <stop offset="100%" stopColor="var(--emerald-500)" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          {/* Vertical dashed connector line for mobile */}
          <div className="absolute left-[50px] top-12 bottom-12 w-[2px] block md:hidden z-0">
            <svg className="w-[2px] h-full">
              <motion.line
                x1="50%"
                y1="0%"
                x2="50%"
                y2="100%"
                stroke="url(#line-grad-vertical)"
                strokeWidth="2"
                strokeDasharray="6 6"
                variants={{
                  hidden: { pathLength: 0, transition: { duration: 0 } },
                  visible: { pathLength: 1, transition: { duration: 1.6, ease: [0.25, 1, 0.5, 1] } }
                }}
              />
              <defs>
                <linearGradient id="line-grad-vertical" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--indigo)" />
                  <stop offset="50%" stopColor="var(--indigo-accent)" stopOpacity="0.7" />
                  <stop offset="100%" stopColor="var(--emerald-500)" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          {/* Steps Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">

            {/* Step 1 */}
            <motion.div
              variants={{
                hidden: { opacity: 0, y: 25, transition: { duration: 0 } },
                visible: { opacity: 1, y: 0, transition: { type: "spring", damping: 20, stiffness: 80 } }
              }}
              whileHover={{ y: -5, transition: { type: "spring", damping: 20, stiffness: 200 } }}
              className="glass-card rounded-xl p-6 flex flex-row lg:flex-col items-center text-left lg:text-center gap-4 lg:gap-0 lg:space-y-4 relative z-10 group overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-[var(--indigo-accent)]/5 hover:border-[var(--indigo)]/20"
            >
              <motion.div
                animate={{ y: [0, -4, 0] }}
                transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                className="h-13 w-13 rounded-2xl flex items-center justify-center bg-indigo-500/10 border border-indigo-500/20 text-[var(--indigo-accent)] shadow-sm flex-shrink-0 group-hover:rotate-[4deg] transition-transform duration-300"
              >
                <svg className="w-6.5 h-6.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </motion.div>

              <div className="space-y-1">
                <h4 className="text-sm font-bold text-[var(--text-1)]">Upload PDF</h4>
                <p className="text-[11px] text-[var(--text-3)] leading-relaxed">
                  Supports searchable and scanned PDFs
                </p>
              </div>
            </motion.div>

            {/* Step 2 */}
            <motion.div
              variants={{
                hidden: { opacity: 0, y: 25, transition: { duration: 0 } },
                visible: { opacity: 1, y: 0, transition: { type: "spring", damping: 20, stiffness: 80 } }
              }}
              whileHover={{ y: -5, transition: { type: "spring", damping: 20, stiffness: 200 } }}
              className="glass-card rounded-xl p-6 flex flex-row lg:flex-col items-center text-left lg:text-center gap-4 lg:gap-0 lg:space-y-4 relative z-10 group overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-[var(--indigo-accent)]/5 hover:border-[var(--indigo)]/20"
            >
              <motion.div
                animate={{ y: [0, -4, 0] }}
                transition={{ repeat: Infinity, duration: 3, ease: "easeInOut", delay: 0.2 }}
                className="h-13 w-13 rounded-2xl flex items-center justify-center bg-indigo-500/10 border border-indigo-500/20 text-[var(--indigo-accent)] shadow-sm flex-shrink-0 group-hover:rotate-[4deg] transition-transform duration-300"
              >
                <svg className="w-6.5 h-6.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1m-1.636 6.364l-.707-.707M12 20v1m-6.364-1.636l.707-.707M3 12h1m1.636-6.364l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
                </svg>
              </motion.div>

              <div className="space-y-1">
                <h4 className="text-sm font-bold text-[var(--text-1)]">AI Processing</h4>
                <p className="text-[11px] text-[var(--text-3)] leading-relaxed">
                  OCR + smart text extraction
                </p>
              </div>
            </motion.div>

            {/* Step 3 */}
            <motion.div
              variants={{
                hidden: { opacity: 0, y: 25, transition: { duration: 0 } },
                visible: { opacity: 1, y: 0, transition: { type: "spring", damping: 20, stiffness: 80 } }
              }}
              whileHover={{ y: -5, transition: { type: "spring", damping: 20, stiffness: 200 } }}
              className="glass-card rounded-xl p-6 flex flex-row lg:flex-col items-center text-left lg:text-center gap-4 lg:gap-0 lg:space-y-4 relative z-10 group overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-[var(--indigo-accent)]/5 hover:border-[var(--indigo)]/20"
            >
              <motion.div
                animate={{ y: [0, -4, 0] }}
                transition={{ repeat: Infinity, duration: 3, ease: "easeInOut", delay: 0.4 }}
                className="h-13 w-13 rounded-2xl flex items-center justify-center bg-indigo-500/10 border border-indigo-500/20 text-[var(--indigo-accent)] shadow-sm flex-shrink-0 group-hover:rotate-[4deg] transition-transform duration-300"
              >
                <svg className="w-6.5 h-6.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </motion.div>

              <div className="space-y-1">
                <h4 className="text-sm font-bold text-[var(--text-1)]">Generate Quiz</h4>
                <p className="text-[11px] text-[var(--text-3)] leading-relaxed">
                  Create 10–50 AI-generated MCQs
                </p>
              </div>
            </motion.div>

            {/* Step 4 */}
            <motion.div
              variants={{
                hidden: { opacity: 0, y: 25, transition: { duration: 0 } },
                visible: { opacity: 1, y: 0, transition: { type: "spring", damping: 20, stiffness: 80 } }
              }}
              whileHover={{ y: -5, transition: { type: "spring", damping: 20, stiffness: 200 } }}
              className="glass-card rounded-xl p-6 flex flex-row lg:flex-col items-center text-left lg:text-center gap-4 lg:gap-0 lg:space-y-4 relative z-10 group overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-[var(--indigo-accent)]/5 hover:border-[var(--indigo)]/20"
            >
              <motion.div
                animate={{ y: [0, -4, 0] }}
                transition={{ repeat: Infinity, duration: 3, ease: "easeInOut", delay: 0.6 }}
                className="h-13 w-13 rounded-2xl flex items-center justify-center bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 shadow-sm flex-shrink-0 group-hover:rotate-[4deg] transition-transform duration-300"
              >
                <svg className="w-6.5 h-6.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </motion.div>

              <div className="space-y-1">
                <h4 className="text-sm font-bold text-[var(--text-1)]">Practice & Learn</h4>
                <p className="text-[11px] text-[var(--text-3)] leading-relaxed">
                  Instant scoring with explanations
                </p>
              </div>
            </motion.div>

          </div>
        </div>
      </motion.div>

      {/* Professional Footer */}
      <footer className="w-full mt-24 border-t border-[var(--border)] pt-12 pb-8 bg-[var(--surface)]/30 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-12 lg:px-20">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10 lg:gap-16 pb-10">
            {/* Logo and Brand details */}
            <div className="md:col-span-5 space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 flex-shrink-0 footer-logo-container">
                  <LogoSVG
                    type="icon"
                    animate={false}
                    className="w-full h-full object-contain dark:invert dark:hue-rotate-180"
                  />
                </div>
                <span className="text-base font-bold tracking-tight text-[var(--text-1)]">
                  QuizGenerator
                </span>
              </div>
              <p className="text-sm text-[var(--text-3)] leading-relaxed max-w-[280px] font-normal">
                Generate high-quality practice quizzes directly from searchable and scanned PDFs with smart text extraction.
              </p>
            </div>

            {/* Quick Links */}
            <div className="md:col-span-3 space-y-4">
              <h5 className="text-sm font-bold uppercase tracking-wider text-[var(--text-1)]">Quick Links</h5>
              <ul className="space-y-3 font-normal">
                <li>
                  <FooterLink 
                    onClick={() => router.push("/")} 
                    text="Home"
                  />
                </li>
                <li>
                  <FooterLink 
                    onClick={() => router.push("/dashboard")} 
                    text="Dashboard"
                  />
                </li>
                <li>
                  <FooterLink 
                    onClick={() => router.push("/")} 
                    text="Upload"
                  />
                </li>
                <li>
                  <FooterLink 
                    onClick={() => router.push("/")} 
                    text="Generate Quiz"
                  />
                </li>
              </ul>
            </div>

            {/* Resources */}
            <div className="md:col-span-2 space-y-4">
              <h5 className="text-sm font-bold uppercase tracking-wider text-[var(--text-1)]">Resources</h5>
              <ul className="space-y-3 font-normal">
                <li>
                  <FooterLink 
                    href="#" 
                    text="Privacy Policy"
                  />
                </li>
                <li>
                  <FooterLink 
                    href="#" 
                    text="Terms of Service"
                  />
                </li>
                <li>
                  <FooterLink 
                    href="#" 
                    text="Contact Us"
                  />
                </li>
              </ul>
            </div>

            {/* Contact details */}
            <div className="md:col-span-2 space-y-4">
              <h5 className="text-sm font-bold uppercase tracking-wider text-[var(--text-1)]">Connect</h5>
              <ul className="space-y-3 font-normal">
                <li>
                  <FooterLink 
                    href="https://github.com" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    text="GitHub"
                  />
                </li>
                <li>
                  <FooterLink 
                    href="mailto:support@quizgenerator.com" 
                    text="Email"
                  />
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom Copyright */}
          <div className="flex flex-col sm:flex-row items-center justify-between pt-6 border-t border-[var(--border)] text-xs text-[var(--text-4)] font-medium">
            <p>© 2026 QuizGenerator. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </motion.div>
  </div>
);
}
