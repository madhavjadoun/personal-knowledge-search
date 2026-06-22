"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => router.push("/dashboard"), 700);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden app-bg"
    >
      {/* Aurora glows */}
      <div className="aurora-tl" />
      <div className="aurora-br" />
      <div className="aurora-accent" />

      {/* Login card */}
      <div className="relative z-10 w-full max-w-[360px]">

        {/* Logo + heading */}
        <div className="flex flex-col items-center mb-7">
          <div className="grad-border rounded-xl mb-4">
            <div
              className="h-10 w-10 rounded-[10px] flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, var(--indigo), var(--violet))",
                boxShadow: "0 4px 16px rgba(79,70,229,0.28)",
              }}
            >
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
          </div>

          <h2
            className="text-xl font-bold"
            style={{ color: "var(--text-1)", letterSpacing: "-0.028em" }}
          >
            Welcome back
          </h2>
          <p className="text-sm mt-1" style={{ color: "var(--text-2)" }}>
            Sign in to your workspace
          </p>
        </div>

        {/* Glassmorphic form card with gradient border */}
        <div
          className="grad-border-subtle grad-border rounded-2xl"
        >
          <div
            className="rounded-[15px] p-6 space-y-4"
            style={{
              background: "rgba(255,255,255,0.88)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
            }}
          >
            {/* Email */}
            <div className="space-y-1.5">
              <label
                className="block text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-3)", letterSpacing: "0.06em" }}
              >
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="input-base"
                autoComplete="email"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  className="block text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text-3)", letterSpacing: "0.06em" }}
                >
                  Password
                </label>
                <button
                  type="button"
                  className="text-xs font-medium transition-colors"
                  style={{ color: "var(--indigo)" }}
                >
                  Forgot?
                </button>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input-base"
                autoComplete="current-password"
              />
            </div>

            {/* Submit */}
            <div className="grad-border rounded-xl pt-1">
              <button
                onClick={handleContinue}
                disabled={loading}
                className="grad-btn w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-[11px] text-sm"
              >
                {loading ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Signing in…
                  </>
                ) : (
                  "Continue →"
                )}
              </button>
            </div>
          </div>
        </div>

        <p className="text-center text-xs mt-5" style={{ color: "var(--text-3)" }}>
          New to KnowledgeSearch?{" "}
          <button
            onClick={() => router.push("/")}
            className="font-medium transition-colors"
            style={{ color: "var(--indigo)" }}
          >
            Get started
          </button>
        </p>
      </div>
    </div>
  );
}
