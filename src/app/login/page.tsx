"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";

const ROTATING_WORDS = ["organized.", "searchable.", "connected.", "ready."];

function RotatingText() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % ROTATING_WORDS.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const word = ROTATING_WORDS[index];

  const charVariants = {
    hidden: { opacity: 0, y: 15, filter: "blur(6px)" },
    visible: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: {
        type: "spring" as const,
        damping: 25,
        stiffness: 300,
      }
    },
    exit: {
      opacity: 0,
      y: -15,
      filter: "blur(6px)",
      transition: {
        duration: 0.25,
      }
    }
  };

  return (
    <span className="block text-[var(--indigo)] relative h-[1.25em] overflow-hidden mt-1">
      <AnimatePresence mode="popLayout">
        <motion.span
          key={index}
          className="absolute left-0 top-0 flex flex-wrap"
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          {word.split("").map((char, charIdx) => (
            <motion.span
              key={charIdx}
              variants={charVariants}
              transition={{
                delay: charIdx * 0.03,
              }}
              style={{ display: "inline-block", whiteSpace: "pre" }}
            >
              {char}
            </motion.span>
          ))}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Auth state states
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  
  // Loading and feedback states
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Theme support
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // Show error passed back from /auth/callback (e.g. user cancelled Google login)
  useEffect(() => {
    const urlError = searchParams.get("error");
    if (urlError) {
      setErrorMessage(decodeURIComponent(urlError));
    }
  }, [searchParams]);

  // Redirect already-authenticated users and listen for OAuth session arrival
  useEffect(() => {
    // Immediate check — covers page refresh while logged in
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.replace("/dashboard");
      }
    };
    checkAuth();

    // Real-time listener — fires when the OAuth callback sets the session
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session) {
          router.replace("/dashboard");
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [router]);

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

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (!email) {
      setErrorMessage("Please enter your email address.");
      return;
    }
    if (!password) {
      setErrorMessage("Please enter your password.");
      return;
    }
    if (mode === "signup" && !agreeTerms) {
      setErrorMessage("You must agree to the Terms of Service.");
      return;
    }

    setLoading(true);
    
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        
        setSuccessMessage("Sign in successful! Redirecting...");
        setTimeout(() => {
          router.push("/dashboard");
        }, 800);
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + "/dashboard",
          }
        });
        if (error) throw error;

        if (data.session) {
          setSuccessMessage("Account created successfully! Redirecting...");
          setTimeout(() => {
            router.push("/dashboard");
          }, 800);
        } else {
          setSuccessMessage("Account created! Please check your email for a confirmation link.");
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "An authentication error occurred.";
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async (e: React.MouseEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    setGoogleLoading(true);
    
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          // Redirect to the server-side callback route which exchanges the
          // authorization code for a session, then forwards to /dashboard.
          redirectTo: window.location.origin + "/auth/callback",
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        }
      });
      if (error) throw error;
      // Note: setGoogleLoading stays true here — the page will navigate away.
      // If the user cancels, the /auth/callback route redirects back with ?error
      // and the URL error useEffect above will reset loading via errorMessage.
    } catch (err) {
      const message = err instanceof Error ? err.message : "An error occurred starting Google OAuth.";
      setErrorMessage(message);
      setGoogleLoading(false);
    }
  };

  // Entrance variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        duration: 0.4,
        when: "beforeChildren",
        staggerChildren: 0.08,
      }
    }
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: "spring" as const,
        damping: 24,
        stiffness: 170,
      }
    }
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="min-h-screen w-full flex flex-col lg:flex-row bg-[var(--bg)] transition-colors duration-200 overflow-x-hidden"
    >
      
      {/* LEFT COLUMN: Brand Panel (Desktop only) */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-20 bg-slate-50/50 dark:bg-[#0B1220] border-r border-[var(--border)] relative overflow-hidden select-none">
        
        {/* Top Header Logo */}
        <div className="flex items-center gap-3 relative z-10">
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: "var(--indigo)" }}
          >
            <svg className="w-4.5 h-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <span className="text-sm font-bold tracking-tight text-[var(--text-1)]">
            KnowledgeSearch
          </span>
        </div>

        {/* Core Value Proposition & Flat Trust Bullets */}
        <div className="my-auto space-y-12 max-w-md relative z-10">
          <div className="space-y-4">
            <h1 className="text-3xl lg:text-4xl font-extrabold tracking-tight text-[var(--text-1)] leading-[1.1]">
              Your personal document library,
              <RotatingText />
            </h1>
            <p className="text-sm text-[var(--text-2)] leading-relaxed pt-2">
              Connect notes, research documents, and manual files into a unified indexing pipeline. Query your knowledge base with trusted citations.
            </p>
          </div>

          <div className="space-y-4 pt-2">
            {[
              "Source-backed answers",
              "Private knowledge workspace",
              "Secure document storage"
            ].map((bullet, idx) => (
              <div key={idx} className="flex items-center gap-3 text-sm text-[var(--text-2)] font-medium">
                <span className="text-emerald-500 font-bold flex-shrink-0 text-base">✓</span>
                <span>{bullet}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Flat minimal trust statement */}
        <div className="text-xs text-[var(--text-3)] font-medium relative z-10">
          SOC2 Type II certified • Data Private
        </div>
      </div>

      {/* RIGHT COLUMN: Auth Form Panel */}
      <div className="w-full lg:w-1/2 flex flex-col justify-between p-6 sm:p-12 lg:p-20 min-h-screen relative">
        
        {/* Header toolbar with Theme Toggle & Mobile Logo */}
        <div className="flex items-center justify-between w-full">
          {/* Mobile-only logo */}
          <div className="flex items-center gap-2 lg:hidden">
            <div
              className="h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: "var(--indigo)" }}
            >
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <span className="text-sm font-semibold tracking-tight text-[var(--text-1)]">
              KnowledgeSearch
            </span>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 transition-all cursor-pointer flex items-center justify-center hover:bg-slate-100 dark:hover:bg-zinc-800 text-[var(--text-2)]"
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
          </div>
        </div>

        {/* Authentication Card (Middle) */}
        <div className="my-auto w-full max-w-[440px] mx-auto py-8">
          <motion.div
            variants={cardVariants}
            className="bg-[var(--surface)] border border-slate-200/80 dark:border-zinc-800/80 rounded-[16px] shadow-[0_8px_30px_rgb(0,0,0,0.03)] p-8 sm:p-10 space-y-6"
          >
            
            {/* Header text */}
            <div className="space-y-1">
              <h2 className="text-xl font-bold tracking-tight text-[var(--text-1)]">
                {mode === "signin" ? "Sign in to account" : "Create an account"}
              </h2>
              <p className="text-xs text-[var(--text-3)] leading-relaxed">
                {mode === "signin"
                  ? "Welcome back! Enter your credentials to access your documents."
                  : "Get started with your private, secure knowledge workspace."}
              </p>
            </div>

            {/* Error Message banner */}
            {errorMessage && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-medium flex items-center gap-2">
                <svg className="w-4.5 h-4.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Success Message banner */}
            {successMessage && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium flex items-center gap-2">
                <svg className="w-4.5 h-4.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>{successMessage}</span>
              </div>
            )}

            {/* Continue with Google button */}
            <motion.button
              whileHover={{ y: -2 }}
              whileTap={{ y: 0 }}
              onClick={handleGoogleAuth}
              disabled={googleLoading || loading}
              className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-xs font-semibold text-[var(--text-2)] hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors shadow-[0_1px_2px_rgba(0,0,0,0.03)] cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
            >
              {googleLoading ? (
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24" width="16" height="16">
                  <path
                    fill="#4285F4"
                    d="M15.545 10.29h-7.5v3.075h4.312C12.062 14.512 11.233 15.225 9.87 16.037l2.64 2.05c1.543-1.425 2.435-3.525 2.435-6.002 0-.613-.055-1.205-.159-1.795z"
                  />
                  <path
                    fill="#34A853"
                    d="M8.045 18c2.16 0 3.975-.717 5.3-1.95l-2.64-2.05c-.732.493-1.668.788-2.66.788-2.046 0-3.78-1.383-4.398-3.24L.917 13.627C2.235 16.242 4.93 18 8.045 18z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M3.647 11.548a4.776 4.776 0 010-3.097L.917 6.373a7.994 7.994 0 000 7.25l2.73-2.075z"
                  />
                  <path
                    fill="#EA4335"
                    d="M8.045 5.922c1.178 0 2.235.405 3.068 1.192l2.3-2.3C12.015 3.513 10.205 3 8.045 3a7.994 7.994 0 00-7.128 4.373l2.73 2.075c.618-1.857 2.352-3.24 4.398-3.24z"
                  />
                </svg>
              )}
              <span>{googleLoading ? "Connecting…" : "Continue with Google"}</span>
            </motion.button>

            {/* Divider line */}
            <div className="relative flex items-center justify-center py-1">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[var(--border)]" />
              </div>
              <span className="relative px-3 bg-[var(--surface)] text-[9px] font-bold uppercase tracking-wider text-[var(--text-3)]">
                or continue with email
              </span>
            </div>

            {/* Email/Password form */}
            <form onSubmit={handleAuthSubmit} className="space-y-5">
              
              {/* Email Address */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-3)]">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="input-base text-xs py-2 px-3 border border-slate-200 dark:border-zinc-800 bg-[var(--surface)] focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10 transition-all duration-150 rounded-lg outline-none"
                  disabled={loading || googleLoading}
                  autoComplete="email"
                />
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-3)]">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="input-base text-xs py-2 px-3 border border-slate-200 dark:border-zinc-800 bg-[var(--surface)] focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10 transition-all duration-150 rounded-lg outline-none pr-10 w-full"
                    disabled={loading || googleLoading}
                    autoComplete="current-password"
                  />
                  {/* Show/Hide password toggle */}
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={loading || googleLoading}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors cursor-pointer"
                  >
                    {showPassword ? (
                      <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Extra Form Actions */}
              {mode === "signin" ? (
                <div className="flex items-center justify-between pt-0.5">
                  <label className="flex items-center gap-2 text-xs text-[var(--text-2)] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      disabled={loading || googleLoading}
                      className="h-3.5 w-3.5 rounded border-slate-300 dark:border-zinc-800 text-[var(--indigo)] focus:ring-[var(--indigo)] accent-blue-600 cursor-pointer"
                    />
                    <span>Remember me</span>
                  </label>
                  
                  <button
                    type="button"
                    onClick={() => alert("Password reset code triggered in demo workspace.")}
                    disabled={loading || googleLoading}
                    className="text-xs font-semibold text-[var(--indigo)] hover:underline cursor-pointer bg-transparent border-0 p-0"
                  >
                    Forgot password?
                  </button>
                </div>
              ) : (
                <div className="pt-0.5">
                  <label className="flex items-start gap-2.5 text-xs text-[var(--text-2)] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={agreeTerms}
                      onChange={(e) => setAgreeTerms(e.target.checked)}
                      disabled={loading || googleLoading}
                      className="h-3.5 w-3.5 rounded border-slate-300 dark:border-zinc-800 text-[var(--indigo)] focus:ring-[var(--indigo)] accent-blue-600 mt-0.5 cursor-pointer"
                    />
                    <span className="leading-snug">
                      I agree to the{" "}
                      <a href="#" className="font-semibold text-[var(--indigo)] hover:underline">Terms of Service</a>
                      {" "}and{" "}
                      <a href="#" className="font-semibold text-[var(--indigo)] hover:underline">Privacy Policy</a>.
                    </span>
                  </label>
                </div>
              )}

              {/* Submit CTA button with 2px upward hover motion */}
              <motion.button
                whileHover={{ y: -2 }}
                whileTap={{ y: 0 }}
                type="submit"
                disabled={loading || googleLoading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white cursor-pointer transition-colors shadow-sm disabled:opacity-50 disabled:pointer-events-none mt-3"
              >
                {loading ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>
                      {mode === "signin" ? "Signing in…" : "Creating account…"}
                    </span>
                  </>
                ) : (
                  <span>
                    {mode === "signin" ? "Sign In" : "Create Account"}
                  </span>
                )}
              </motion.button>
            </form>

          </motion.div>

          {/* Form Toggle Switcher */}
          <div className="text-center text-xs text-[var(--text-3)] mt-6">
            {mode === "signin" ? (
              <>
                New to KnowledgeSearch?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage("");
                    setMode("signup");
                  }}
                  className="font-semibold text-[var(--indigo)] hover:underline cursor-pointer bg-transparent border-0 p-0"
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage("");
                    setMode("signin");
                  }}
                  className="font-semibold text-[var(--indigo)] hover:underline cursor-pointer bg-transparent border-0 p-0"
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>

        {/* Small Legal/Privacy Footer */}
        <div className="w-full text-center text-[10px] text-[var(--text-3)] mt-auto pt-6 border-t border-slate-100 dark:border-zinc-800/60 select-none">
          <span>Protected by reCAPTCHA • </span>
          <a href="#" className="hover:underline">Privacy Policy</a>
          <span> • </span>
          <a href="#" className="hover:underline">Terms of Service</a>
        </div>
      </div>
      
    </motion.div>
  );
}

/**
 * LoginPage wraps LoginContent in a Suspense boundary.
 * This is required by Next.js App Router when a component uses useSearchParams().
 */
export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen w-full bg-[var(--bg)]" />}>
      <LoginContent />
    </Suspense>
  );
}
