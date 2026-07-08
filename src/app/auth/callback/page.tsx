"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // 1. Handle error states from OAuth provider
    const errorParam = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    if (process.env.NODE_ENV !== "production") {
      console.log("─── [Client Auth Callback] ───");
      console.log("Current window.location.origin:", typeof window !== "undefined" ? window.location.origin : "SSR/undefined");
      console.log("Current window.location.href:", typeof window !== "undefined" ? window.location.href : "SSR/undefined");
      console.log("OAuth errorParam:", errorParam);
      console.log("OAuth errorDescription:", errorDescription);
    }

    if (errorParam) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[Auth Callback] OAuth Error parameter found:", errorParam, errorDescription);
      }
      // Map technical OAuth errors to clean user-facing messages
      let friendlyMessage: string;
      if (errorParam === "access_denied") {
        friendlyMessage = "Sign-in cancelled.";
      } else if (errorParam === "server_error") {
        friendlyMessage = "Something went wrong. Please try again.";
      } else if (errorParam === "temporarily_unavailable") {
        friendlyMessage = "Google sign-in is temporarily unavailable.";
      } else {
        friendlyMessage = errorDescription || "Sign-in failed. Please try again.";
      }
      const loginUrl = `/login?error=${encodeURIComponent(friendlyMessage)}`;
      router.replace(loginUrl);
      return;
    }

    // 2. Check if session is already present
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (process.env.NODE_ENV !== "production") {
        console.log("[Auth Callback] getSession output:", !!session);
      }
      if (session) {
        if (process.env.NODE_ENV !== "production") {
          console.log("[Auth Callback] Existing session found, redirecting to dashboard.");
        }
        router.replace("/dashboard");
      }
    };
    checkSession();

    // 3. Listen for real-time authentication state changes (such as automatic PKCE exchange)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (process.env.NODE_ENV !== "production") {
        console.log("[Auth Callback] Auth state changed event:", event, "session established:", !!session);
      }
      if (session) {
        if (process.env.NODE_ENV !== "production") {
          console.log("[Auth Callback] Session established via change event, redirecting to dashboard.");
          console.log("───────────────────────────────");
        }
        router.replace("/dashboard");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router, searchParams]);

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#0B1220] text-slate-200">
      <div className="flex flex-col items-center gap-4">
        {/* Spinner */}
        <svg
          className="w-8 h-8 animate-spin text-blue-500"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        <p className="text-sm font-semibold text-slate-400 animate-pulse">
          Completing sign in…
        </p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen w-full flex items-center justify-center bg-[#0B1220]">
        <svg className="w-8 h-8 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    }>
      <AuthCallbackContent />
    </Suspense>
  );
}
