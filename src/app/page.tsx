"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { supabase } from "@/lib/supabase";
import dynamic from "next/dynamic";
import uploadAnimation from "../../public/upload.json";
import OrbitLoader from "@/components/app/OrbitLoader";
import NavbarLogo from "@/components/layout/NavbarLogo";
import LogoSVG from "@/components/layout/LogoSVG";
import Image from "next/image";
import BlurText from "@/components/ui/BlurText";
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







const FooterLink = ({ href, text, onClick, target, rel }: { href?: string; text: string; onClick?: () => void; target?: string; rel?: string }) => {
  const classes = "cursor-pointer text-left flex items-center text-sm font-medium text-[var(--text-3)] hover:text-[var(--text-1)] transition-all duration-300 hover:translate-x-0.5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--indigo-accent)] rounded py-0.5";

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className={classes}
      >
        {text}
      </button>
    );
  }

  return (
    <a
      href={href}
      target={target}
      rel={rel}
      className={classes}
    >
      {text}
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

  const [dragging, setDragging] = useState(false);
  const [dropped, setDropped] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [toast, setToast] = useState<{
    type: "error" | "success" | "warning";
    title: string;
    subtitle?: string;
    action?: string;
  } | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

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

  // Rotating word
  const [wordIndex, setWordIndex] = useState(0);

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
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      let session = sessionData?.session;
      const user = session?.user ?? null;

      if (sessionError || !session || !user) {
        clearInterval(progressInterval);
        setDropped(null);
        setProgress(0);
        if (process.env.NODE_ENV !== "production") {
          console.error("[Upload] Auth check failed:", sessionError?.message);
        }
        setShowAuthModal(true);
        return;
      }

      // If the token is about to expire, force a refresh before uploading
      if (session.expires_at && Date.now() / 1000 > session.expires_at - 60) {
        const { data: refreshedSessionData, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) console.warn("[Upload] Refresh failed:", refreshError.message);
        session = refreshedSessionData.session || session;
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("user_id", user.id);

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 
        (process.env.NODE_ENV === "production" 
          ? "https://quizgenerator-production.up.railway.app" 
          : "http://127.0.0.1:8000");
      const uploadUrl = `${apiUrl}/documents/upload`;
      const uploadHeaders = {
        "Authorization": `Bearer ${session.access_token}`,
      };

      const processResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: uploadHeaders,
        body: formData,
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

      // ── Success feedback ──
      const isImage = /\.(png|jpe?g|webp)$/i.test(file.name);
      showToast(
        "Upload Successful",
        "success",
        isImage
          ? "Image indexed successfully. Ready for quiz generation."
          : "Document indexed successfully. Ready for quiz generation.",
      );

      setTimeout(() => { router.push("/dashboard"); }, 1500);

    } catch (err) {
      clearInterval(progressInterval);
      console.error("[Upload] Final caught error:", err);
      setDropped(null);
      setProgress(0);
      const rawMsg = err && typeof err === "object" && "message" in err
        ? String((err as Record<string, unknown>).message)
        : String(err);
      const { title, subtitle, action } = parseUploadError(rawMsg);
      showToast(title, "error", subtitle, action);
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

      {/* Top Header */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 sm:px-6 lg:px-20 py-4 sm:py-5 border-b border-[var(--border)] bg-[var(--bg)] min-w-0">
        <div className="flex items-center min-w-0 flex-shrink">
          <NavbarLogo />
        </div>

        <div className="flex items-center gap-2 sm:gap-5 flex-shrink-0">
          <button
            onClick={() => router.push("/login")}
            className="text-xs font-semibold px-3 sm:px-4 py-2 rounded-lg border border-[var(--border)] transition-all duration-[250ms] cursor-pointer hover:bg-[var(--bg-2)] hover:text-[var(--text-1)] hover:-translate-y-0.5 shadow-sm active:translate-y-0 whitespace-nowrap"
          >
            Sign in
          </button>

          <button
            onClick={() => router.push("/login")}
            className="grad-btn px-3 sm:px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-[250ms] hover:-translate-y-0.5 flex items-center gap-1.5 group shadow-sm active:translate-y-0 whitespace-nowrap"
          >
            Get started
            <span className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <motion.div ref={heroRef} className="relative z-10 w-full max-w-7xl mx-auto flex flex-col justify-center px-4 sm:px-12 lg:px-20 pt-28 sm:pt-36 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-[72px] w-full items-start">

          {/* LEFT — Content Column (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-8 lg:gap-10 max-w-[530px] lg:max-w-none">

            {/* Title with integrated rotating text */}
            <div>
              <h1
                className="text-[30px] xs:text-[34px] sm:text-[48px] lg:text-[60px] font-bold leading-[1.0] text-[var(--text-1)] tracking-tight"
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

              {/* Subheading */}
              <p className="text-[18px] lg:text-[20px] font-normal leading-[1.6] text-[var(--text-2)] mt-6 max-w-[640px]">
                <BlurText
                  text="Upload searchable or scanned PDFs, lecture slides, and notes. Our OCR pipeline extracts the text, chunks the content, and generates interactive MCQ practice tests in seconds."
                  delay={45}
                />
              </p>

            </div>

            {/* Why QuizGens Section */}
            <div className="space-y-5 pt-8 border-t border-[var(--border)]">
              <h3 className="text-lg font-semibold text-[var(--text-1)] tracking-tight">
                <BlurText text="Why QuizGens" delay={40} />
              </h3>
              <ul className="space-y-3.5">
                {[
                  { bold: "Generates accurate quizzes", rest: "from your study material." },
                  { bold: "Supports searchable", rest: "and scanned PDFs." },
                  { bold: "Fast, private,", rest: "and reliable." },
                  { bold: "Built for students", rest: "and educators." }
                ].map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-sm text-[var(--text-3)]">
                    <svg className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 mt-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>
                      <strong className="font-semibold text-[var(--text-1)] mr-1">
                        <BlurText text={item.bold} delay={30} />
                      </strong>{" "}
                      <BlurText text={item.rest} delay={30} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>

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
            <div className="w-full max-w-[540px] mx-auto lg:ml-auto lg:mr-0 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl overflow-hidden shadow-sm">

              {/* Card Header */}
              <div
                className="px-4 sm:px-6 py-4 flex items-start sm:items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--bg-2)] min-w-0"
              >
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-[var(--text-1)]">
                    AI Quiz Generator
                  </h3>
                  <p className="text-[10px] text-[var(--text-3)] mt-0.5 break-words">
                    Select searchable or scanned PDFs to generate practice tests.
                  </p>
                </div>

                {/* Decorative dots */}
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-1.5 w-1.5 rounded-full bg-[var(--border-strong)]" />
                  ))}
                </div>
              </div>

              {/* Card Body */}
              <div className="p-4 sm:p-6 space-y-5">

                {/* Drag drop zone */}
                <div
                  onClick={() => !dropped && fileRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  className="rounded-xl flex flex-col items-center justify-center text-center cursor-pointer border-2 border-dashed relative p-4 sm:p-6 bg-[var(--bg-2)] group min-h-[160px] sm:min-h-[200px]"
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
                      <span className="text-[8px] font-mono bg-[var(--bg-3)] px-2 py-0.5 rounded mt-3 text-[var(--text-3)]">
                        Searchable & Scanned PDFs (Max 25MB)
                      </span>
                    </div>
                  )}

                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/pdf,.pdf,image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
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

                {/* Upload Tips */}
                <div className="space-y-3.5 pt-4 border-t border-[var(--border)]">
                  <h4 className="text-xs font-semibold text-[var(--text-1)] tracking-tight">
                    Upload Tips
                  </h4>
                  <ul className="space-y-3">
                    {[
                      "Use clear, readable PDFs for the best results.",
                      "Scanned notes and documents are fully supported.",
                      "Larger files may take slightly longer to process.",
                      "Generates 10–50 high-quality MCQs automatically.",
                      "Download your quiz and start practicing instantly."
                    ].map((tip, idx) => (
                      <li key={idx} className="flex items-start gap-2.5 text-xs text-[var(--text-3)] leading-relaxed">
                        <svg className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
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
          <h3 className="text-lg font-semibold text-[var(--text-1)] tracking-tight">
            How It Works
          </h3>
          <p className="text-xs text-[var(--text-3)] max-w-lg mx-auto">
            Turn any document into high-yield interactive practice tests in four simple steps
          </p>
        </div>

        {/* Cards — single unified layout */}
        <div className="flex flex-col lg:flex-row items-center gap-4">

          {/* Card 1 */}
          <motion.div
            variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { type: "spring", damping: 20, stiffness: 80 } } }}
            className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-6 flex flex-row lg:flex-col items-center lg:items-center text-left lg:text-center gap-4 lg:gap-0 lg:space-y-4 w-full lg:flex-1"
          >
            <div className="h-10 w-10 rounded-lg flex-shrink-0 flex items-center justify-center bg-[var(--bg-2)] border border-[var(--border)]">
              <Image src="/how-it-works-1.png" alt="Upload" width={20} height={20} className="object-contain dark:invert" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-[var(--text-1)]">Upload Learning Material</h4>
              <p className="text-[11px] text-[var(--text-3)] leading-relaxed">Supports searchable and scanned PDFs</p>
            </div>
          </motion.div>

          {/* Arrow 1 — desktop only */}
          <motion.div
            className="hidden lg:block flex-shrink-0"
            animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.2, 0.8], filter: ["drop-shadow(0 0 0px transparent)", "drop-shadow(0 0 8px var(--text-1))", "drop-shadow(0 0 0px transparent)"] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: 0 }}
          >
            <svg className="w-7 h-7 text-[var(--text-1)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </motion.div>

          {/* Card 2 */}
          <motion.div
            variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { type: "spring", damping: 20, stiffness: 80, delay: 0.1 } } }}
            className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-6 flex flex-row lg:flex-col items-center lg:items-center text-left lg:text-center gap-4 lg:gap-0 lg:space-y-4 w-full lg:flex-1"
          >
            <div className="h-10 w-10 rounded-lg flex-shrink-0 flex items-center justify-center bg-[var(--bg-2)] border border-[var(--border)]">
              <Image src="/how-it-works-2.png" alt="Processing" width={20} height={20} className="object-contain dark:invert" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-[var(--text-1)]">AI Processing</h4>
              <p className="text-[11px] text-[var(--text-3)] leading-relaxed">OCR + smart text extraction</p>
            </div>
          </motion.div>

          {/* Arrow 2 — desktop only */}
          <motion.div
            className="hidden lg:block flex-shrink-0"
            animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.2, 0.8], filter: ["drop-shadow(0 0 0px transparent)", "drop-shadow(0 0 8px var(--text-1))", "drop-shadow(0 0 0px transparent)"] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
          >
            <svg className="w-7 h-7 text-[var(--text-1)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </motion.div>

          {/* Card 3 */}
          <motion.div
            variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { type: "spring", damping: 20, stiffness: 80, delay: 0.2 } } }}
            className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-6 flex flex-row lg:flex-col items-center lg:items-center text-left lg:text-center gap-4 lg:gap-0 lg:space-y-4 w-full lg:flex-1"
          >
            <div className="h-10 w-10 rounded-lg flex-shrink-0 flex items-center justify-center bg-[var(--bg-2)] border border-[var(--border)]">
              <Image src="/how-it-works-3.png" alt="Generate" width={20} height={20} className="object-contain dark:invert" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-[var(--text-1)]">Generate Quiz</h4>
              <p className="text-[11px] text-[var(--text-3)] leading-relaxed">Create 10–50 AI-generated MCQs</p>
            </div>
          </motion.div>

          {/* Arrow 3 — desktop only */}
          <motion.div
            className="hidden lg:block flex-shrink-0"
            animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.2, 0.8], filter: ["drop-shadow(0 0 0px transparent)", "drop-shadow(0 0 8px var(--text-1))", "drop-shadow(0 0 0px transparent)"] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: 1.6 }}
          >
            <svg className="w-7 h-7 text-[var(--text-1)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </motion.div>

          {/* Card 4 */}
          <motion.div
            variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { type: "spring", damping: 20, stiffness: 80, delay: 0.3 } } }}
            className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-6 flex flex-row lg:flex-col items-center lg:items-center text-left lg:text-center gap-4 lg:gap-0 lg:space-y-4 w-full lg:flex-1"
          >
            <div className="h-10 w-10 rounded-lg flex-shrink-0 flex items-center justify-center bg-[var(--bg-2)] border border-[var(--border)]">
              <Image src="/how-it-works-4.png" alt="Learn" width={20} height={20} className="object-contain dark:invert" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-[var(--text-1)]">Practice & Learn</h4>
              <p className="text-[11px] text-[var(--text-3)] leading-relaxed">Instant scoring with explanations</p>
            </div>
          </motion.div>
        </div>
      </motion.div>

      <footer className="w-full text-[var(--text-1)] mt-24 sm:mt-32">
        <style dangerouslySetInnerHTML={{ __html: `
          .custom-page-footer-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 40px;
            align-items: start;
          }
          @media (min-width: 1024px) {
            .custom-page-footer-grid {
              grid-template-columns: 1.8fr 1fr 1fr !important;
              gap: 80px !important;
            }
          }
          .custom-page-footer-container {
            max-width: 1400px !important;
            margin-left: auto !important;
            margin-right: auto !important;
            padding: 40px 16px !important;
            width: 100%;
          }
          @media (min-width: 640px) {
            .custom-page-footer-container {
              padding: 60px 24px !important;
            }
          }
          @media (min-width: 1024px) {
            .custom-page-footer-container {
              padding: 80px 40px !important;
            }
          }
        `}} />
        <div className="custom-page-footer-container">
          <div className="custom-page-footer-grid">
            
            {/* Column 1: Logo + Brand + Description + Socials */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="flex-shrink-0" style={{ height: '24px', width: '24px', maxWidth: '90px' }}>
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
              <p 
                className="text-sm text-[var(--text-3)] leading-relaxed font-normal"
                style={{ 
                  maxWidth: '340px', 
                  whiteSpace: 'normal', 
                  wordBreak: 'normal', 
                  overflowWrap: 'break-word' 
                }}
              >
                Generate high-quality AI practice quizzes from searchable and scanned PDFs with intelligent text extraction.
              </p>
              
              {/* Social icons row below description */}
              <div className="flex items-center gap-[16px] pt-2">
                <a 
                  href="https://github.com/madhavjadoun" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="flex items-center justify-center h-9 w-9 rounded-lg bg-[var(--bg-2)] border border-[var(--border)] text-[var(--text-3)] hover:text-[var(--text-1)] hover:border-[var(--text-2)] hover:bg-[var(--bg-3)] transition-all duration-200"
                  aria-label="GitHub"
                >
                  <svg className="w-4.5 h-4.5" fill="currentColor" viewBox="0 0 24 24">
                    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.167 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.137 20.164 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
                  </svg>
                </a>
                
                <a 
                  href="mailto:madhavjadaun9@gmail.com" 
                  className="flex items-center justify-center h-9 w-9 rounded-lg bg-[var(--bg-2)] border border-[var(--border)] text-[var(--text-3)] hover:text-[var(--text-1)] hover:border-[var(--text-2)] hover:bg-[var(--bg-3)] transition-all duration-200"
                  aria-label="Email"
                >
                  <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </a>

                <a 
                  href="https://linkedin.com" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="flex items-center justify-center h-9 w-9 rounded-lg bg-[var(--bg-2)] border border-[var(--border)] text-[var(--text-3)] hover:text-[var(--text-1)] hover:border-[var(--text-2)] hover:bg-[var(--bg-3)] transition-all duration-200"
                  aria-label="LinkedIn"
                >
                  <svg className="w-4.5 h-4.5" fill="currentColor" viewBox="0 0 24 24">
                    <path fillRule="evenodd" d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.779-1.75-1.75s.784-1.75 1.75-1.75 1.75.779 1.75 1.75-.784 1.75-1.75 1.75zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" clipRule="evenodd" />
                  </svg>
                </a>
              </div>

              {/* Product Hunt Review Badge */}
              <div className="pt-3">
                <a 
                  href="https://www.producthunt.com/products/quizgens/reviews/new?utm_source=badge-product_review&utm_medium=badge&utm_source=badge-quizgens" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-block transition-transform hover:scale-[1.02] duration-200"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img 
                    src="/ph-light.svg" 
                    alt="QuizGens - Generate AI-powered quizzes from PDFs in seconds. | Product Hunt" 
                    style={{ width: "250px", height: "54px" }} 
                    width={250} 
                    height={54} 
                    className="block dark:hidden"
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img 
                    src="/ph-dark.svg" 
                    alt="QuizGens - Generate AI-powered quizzes from PDFs in seconds. | Product Hunt" 
                    style={{ width: "250px", height: "54px" }} 
                    width={250} 
                    height={54} 
                    className="hidden dark:block"
                  />
                </a>
              </div>
            </div>

            {/* Column 2: FEATURES */}
            <div className="custom-footer-col-min space-y-4">
              <h5 className="text-xs font-bold uppercase tracking-wider text-[var(--text-1)]" style={{ letterSpacing: '0.1em' }}>
                Features
              </h5>
              <ul className="space-y-3 font-normal text-sm text-[var(--text-3)] whitespace-nowrap">
                <li className="py-0.5 flex items-center">
                  AI Quiz Generation
                </li>
                <li className="py-0.5 flex items-center">
                  Smart PDF OCR
                </li>
                <li className="py-0.5 flex items-center">
                  Quiz History
                </li>
                <li className="py-0.5 flex items-center">
                  Analytics
                </li>
                <li className="py-0.5 flex items-center">
                  Download Reports
                </li>
              </ul>
            </div>

            {/* Column 3: RESOURCES */}
            <div className="custom-footer-col-min space-y-4">
              <h5 className="text-xs font-bold uppercase tracking-wider text-[var(--text-1)]" style={{ letterSpacing: '0.1em' }}>
                Resources
              </h5>
              <ul className="space-y-3 font-normal text-sm text-[var(--text-3)] whitespace-nowrap">
                <li>
                  <FooterLink 
                    href="/privacy" 
                    target="_blank"
                    rel="noopener noreferrer"
                    text="Privacy Policy"
                  />
                </li>
                <li>
                  <FooterLink 
                    href="/terms" 
                    target="_blank"
                    rel="noopener noreferrer"
                    text="Terms of Service"
                  />
                </li>
                <li>
                  <FooterLink 
                    href="/faq" 
                    target="_blank"
                    rel="noopener noreferrer"
                    text="FAQ"
                  />
                </li>
                <li>
                  <FooterLink 
                    href="/contact" 
                    target="_blank"
                    rel="noopener noreferrer"
                    text="Contact"
                  />
                </li>
              </ul>
            </div>

          </div>

          {/* Thin divider */}
          {/* Thin divider */}
          <div className="border-t border-[var(--border)] pt-8 mt-8">
            
            {/* Bottom Footer: Centered */}
            <div className="flex flex-col items-center justify-center gap-2 text-center text-xs text-[var(--text-4)] font-medium">
              <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 text-center">
                <span>© 2026 QuizGenerator</span>
                <span className="hidden sm:inline">•</span>
                <span>Built with FastAPI • Gemini • Supabase</span>
              </div>
              <div>
                <span>Made for students ❤️ by Madhav Jadoun</span>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </motion.div>
    
    {/* Toast Notification */}
    {toast && (
      <div
        role="alert"
        aria-live="assertive"
        className="fixed bottom-5 right-5 z-50 flex items-start gap-3 rounded-xl animate-in fade-in slide-in-from-bottom-4 duration-300 overflow-hidden sm:max-w-sm"
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
                onClick={() => { setToast(null); fileRef.current?.click(); }}
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

    {/* Centered Authentication Required Modal */}
    {showAuthModal && (
      <>
        {/* Backdrop Overlay (Sibling to prevent layout flex constraints) */}
        <div 
          className="fixed inset-0 w-screen h-screen z-50 backdrop-blur-[10px] animate-in fade-in duration-200"
          style={{ backgroundColor: "rgba(15, 23, 42, 0.45)" }}
          onClick={() => setShowAuthModal(false)}
        />
        
        {/* Modal Card Box */}
        <div 
          className="fixed z-[51] bg-white dark:bg-[#121826] flex flex-col items-center text-center flex-shrink-0 animate-in zoom-in-95 duration-200"
          style={{ 
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '420px', 
            maxWidth: 'calc(100vw - 32px)',
            borderRadius: '24px',
            border: '1px solid rgba(15, 23, 42, 0.06)',
            boxShadow: '0 24px 80px rgba(15, 23, 42, 0.12)',
            padding: '36px'
          }}
        >
          {/* Circular Shield Icon */}
          <div 
            className="rounded-full bg-[#f8fafc] dark:bg-[#1e293b] border border-zinc-200/50 dark:border-[#24324a] flex items-center justify-center text-[#0f172a] dark:text-[#f8fafc] shadow-sm flex-shrink-0"
            style={{ 
              width: "48px", 
              height: "48px",
              marginBottom: "20px"
            }}
          >
            <svg className="w-5.5 h-5.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          
          <div className="space-y-2 flex-shrink-0 mb-6">
            <h3 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight">Sign in to continue</h3>
            <p 
              className="text-xs text-zinc-500 dark:text-zinc-400 font-medium"
              style={{
                maxWidth: "340px",
                margin: "auto",
                lineHeight: "1.6"
              }}
            >
              Upload PDFs, generate AI quizzes and sync your progress securely across all devices.
            </p>
          </div>
          
          <div className="flex items-center gap-3 w-full mb-6 flex-shrink-0">
            <button
              onClick={() => setShowAuthModal(false)}
              className="flex-1 text-xs font-bold transition-all cursor-pointer flex items-center justify-center flex-shrink-0 hover:bg-[#f8fafc] dark:hover:bg-zinc-800"
              style={{
                height: "48px",
                borderRadius: "12px",
                border: "1px solid var(--border)",
                backgroundColor: "transparent",
                color: "var(--text-3)"
              }}
            >
              Not Now
            </button>
            <button
              onClick={() => {
                setShowAuthModal(false);
                router.push("/login");
              }}
              className="flex-1 text-xs font-bold transition-all shadow-md hover:translate-y-[-1px] cursor-pointer flex items-center justify-center gap-1.5 flex-shrink-0 grad-btn"
              style={{
                height: "48px",
                borderRadius: "12px",
                border: "none"
              }}
            >
              Continue <span className="text-sm font-normal">→</span>
            </button>
          </div>
          
          {/* Trust Text */}
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium flex items-center gap-1 flex-shrink-0">
            <span>✓</span> Protected by secure authentication.
          </p>
        </div>
      </>
    )}
  </div>
);
}
