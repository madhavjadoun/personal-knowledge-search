"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { LottieRefCurrentProps } from "lottie-react";
import menuAnimation from "../../../public/menu2.json";
import BlurText from "@/components/ui/BlurText";
import { supabase } from "@/lib/supabase";
import OrbitLoader from "@/components/app/OrbitLoader";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

function SidebarToggle({ isOpen, onClick }: { isOpen: boolean; onClick: () => void }) {
  const lottieRef = useRef<LottieRefCurrentProps>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const prevIsOpen = useRef(isOpen);

  useEffect(() => {
    if (!mounted || !lottieRef.current) return;

    if (isOpen !== prevIsOpen.current) {
      if (isOpen) {
        lottieRef.current.playSegments([0, 62], true);
      } else {
        lottieRef.current.playSegments([62, 124], true);
      }
      prevIsOpen.current = isOpen;
    } else {
      if (isOpen) {
        lottieRef.current.goToAndStop(62, true);
      } else {
        lottieRef.current.goToAndStop(0, true);
      }
    }
  }, [isOpen, mounted]);

  if (!mounted) {
    return (
      <button
        onClick={onClick}
        className="p-1 rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center flex-shrink-0"
        style={{ width: "36px", height: "36px", color: "var(--text-2)" }}
        aria-label="Toggle sidebar"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className="p-1 rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center flex-shrink-0 lottie-menu-btn"
      style={{ width: "36px", height: "36px" }}
      aria-label="Toggle sidebar"
    >
      <div className="w-6.5 h-6.5 flex items-center justify-center">
        <Lottie
          lottieRef={lottieRef}
          animationData={menuAnimation}
          loop={false}
          autoplay={false}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </button>
  );
}

const NAV = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
  },
  {
    href: "/documents",
    label: "Documents",
    icon: (
      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  },
  {
    href: "/chat",
    label: "Quiz Generator",
    icon: (
      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
      </svg>
    ),
  },
];

interface AppShellProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export default function AppShell({ children, title, subtitle, action }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [docCount, setDocCount] = useState<number | null>(null);
  const [storageUsed, setStorageUsed] = useState<number>(0);

  // Supabase Auth states
  const [user, setUser] = useState<import("@supabase/supabase-js").User | null>(null);
  const [userLoading, setUserLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const checkUser = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        if (mounted) router.push("/login");
      } else {
        if (mounted) {
          setUser(currentUser);
          setUserLoading(false);
        }
      }
    };

    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        router.push("/login");
      } else if (session?.user) {
        setUser(session.user);
        setUserLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        // Get current user so we only count their own documents
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
          .from("documents")
          .select("file_size")
          .eq("user_id", user.id);   // only this user's documents
        if (!error && data) {
          setDocCount(data.length);
          const total = data.reduce((acc: number, d: { file_size: number }) => acc + (d.file_size || 0), 0);
          setStorageUsed(total);
        }
      } catch (e) {
        console.warn("Failed to fetch sidebar counts:", e);
      }
    };
    fetchCounts();
    const interval = setInterval(fetchCounts, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
    
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);

    const obs = new MutationObserver(() => {
      setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    
    return () => {
      obs.disconnect();
      window.removeEventListener("resize", checkMobile);
    };
  }, []);

  const activeOpenState = isMobile ? mobileOpen : sidebarOpen;

  const handleToggle = () => {
    if (isMobile) {
      setMobileOpen(!mobileOpen);
    } else {
      setSidebarOpen(!sidebarOpen);
    }
  };

  const toggleTheme = () => {
    const isDark = document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", !isDark);
    localStorage.setItem("theme", isDark ? "light" : "dark");
    setTheme(isDark ? "light" : "dark");
  };

  const userEmail = user?.email || "";
  const userName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split("@")[0] || "User";
  const userInitials = userName.slice(0, 2).toUpperCase();
  const userAvatar = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  /* ── Sidebar content ── */
  const SidebarContent = () => (
    <div className="flex flex-col h-full">

      {/* Brand */}
      <div
        className="flex items-center gap-2.5 px-4 py-[14px]"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        {/* Logo mark with semantic design tokens */}
        <div className="grad-border rounded-[10px] flex-shrink-0">
          <div
            className="h-7 w-7 rounded-[9px] flex items-center justify-center border border-[var(--border)]"
            style={{
              background: "var(--logo-bg)",
              boxShadow: "var(--logo-shadow)",
            }}
          >
            <svg className="w-3.5 h-3.5 text-[var(--bg)] dark:text-[var(--text-1)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
        </div>
        <div>
          <p
            className="text-sm font-semibold tracking-tight leading-none text-[var(--text-1)]"
            style={{ letterSpacing: "-0.024em" }}
          >
            KnowledgeSearch
          </p>
          <p className="text-[10px] mt-0.5 text-[var(--text-4)] font-medium">
            Research Workspace
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2.5 flex flex-col gap-0.5">
        <p
          className="text-[9px] font-semibold uppercase tracking-widest px-2 pb-1.5 pt-1 text-[var(--text-4)]"
        >
          Workspace
        </p>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={`nav-item${pathname === item.href ? " active" : ""}`}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Bottom section */}
      <div style={{ borderTop: "1px solid var(--border)" }} className="p-3.5 space-y-3">
        {/* System Status Card */}
        <div
          className="p-3 rounded-xl space-y-3"
          style={{
            background: "var(--bg-2)/30",
            border: "1px solid var(--border)",
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-4)]">System Status</span>
            <span className="flex items-center gap-1 text-[9px] font-semibold text-emerald-600 dark:text-emerald-500">
              <span className="relative flex h-1 w-1">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1 w-1 bg-emerald-500" />
              </span>
              Online
            </span>
          </div>

          {/* Status Indicators Grid */}
          <div className="grid grid-cols-3 gap-1 border-b border-[var(--border)] pb-2.5 text-[9px] font-semibold text-[var(--text-3)]">
            <div className="flex flex-col items-center p-1 rounded bg-[var(--bg)] border border-[var(--border)]/50">
              <span className="text-emerald-500 leading-none">●</span>
              <span className="text-[8px] font-mono text-[var(--text-4)] mt-0.5">Storage</span>
              <span className="font-bold text-[8px] mt-0.5 text-[var(--text-2)]">Active</span>
            </div>
            <div className="flex flex-col items-center p-1 rounded bg-[var(--bg)] border border-[var(--border)]/50">
              <span className="text-emerald-500 leading-none">●</span>
              <span className="text-[8px] font-mono text-[var(--text-4)] mt-0.5">Index</span>
              <span className="font-bold text-[8px] mt-0.5 text-[var(--text-2)]">Ready</span>
            </div>
            <div className="flex flex-col items-center p-1 rounded bg-[var(--bg)] border border-[var(--border)]/50">
              <span className="text-emerald-500 leading-none">●</span>
              <span className="text-[8px] font-mono text-[var(--text-4)] mt-0.5">Retrieval</span>
              <span className="font-bold text-[8px] mt-0.5 text-[var(--text-2)]">Online</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] text-[var(--text-3)]">
              <span>Indexed Files</span>
              <span className="font-semibold text-[var(--text-2)]">{docCount !== null ? docCount : "..."}</span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-[var(--text-3)]">
              <span>Vector Storage</span>
              <span className="font-semibold text-[var(--text-2)]">
                {(() => {
                  if (storageUsed === 0) return "0 Bytes";
                  const k = 1024;
                  const sizes = ["Bytes", "KB", "MB", "GB"];
                  const i = Math.floor(Math.log(storageUsed) / Math.log(k));
                  return parseFloat((storageUsed / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
                })()} / 100 MB
              </span>
            </div>
            <div className="h-1 rounded-full overflow-hidden bg-[var(--bg-3)]">
              <div
                className="h-full rounded-full transition-all duration-300 bg-[var(--indigo)]"
                style={{
                  width: `${Math.min(Math.round((storageUsed / (100 * 1024 * 1024)) * 100), 100)}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* User row */}
        <div className="flex items-center justify-between px-1 py-1">
          <div className="flex items-center gap-2 min-w-0">
            {userAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={userAvatar}
                alt={userName}
                className="h-7 w-7 rounded-lg object-cover flex-shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div
                className="h-7 w-7 rounded-lg flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                style={{ background: "linear-gradient(135deg, var(--indigo), var(--violet))" }}
              >
                {userInitials}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold truncate" style={{ color: "var(--text-1)", letterSpacing: "-0.014em" }}>
                {userName}
              </p>
              <p className="text-[10px] truncate" style={{ color: "var(--text-3)" }}>
                {userEmail}
              </p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-zinc-400 hover:text-red-500 transition-colors flex-shrink-0"
            title="Log out"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );

  if (userLoading) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[var(--bg)]">
        <OrbitLoader size={48} />
        <p className="text-xs text-[var(--text-3)] mt-4 font-mono animate-pulse">Establishing secure session…</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex overflow-hidden app-bg">

      {/* ── Aurora Glow (behind everything) ── */}
      <div className="aurora-tl" />
      <div className="aurora-br" />
      <div className="aurora-accent" />

      {/* ── Desktop Sidebar ── */}
      <aside
        className="glass-sidebar hidden md:flex flex-col flex-shrink-0 h-full relative z-10 transition-all duration-300 ease-in-out"
        style={{
          width: sidebarOpen ? "224px" : "0px",
          opacity: sidebarOpen ? 1 : 0,
          borderRight: sidebarOpen ? "1px solid var(--border)" : "none",
          overflow: "hidden",
        }}
      >
        <div style={{ width: "224px", height: "100%", flexShrink: 0 }}>
          <SidebarContent />
        </div>
      </aside>

      {/* ── Mobile Sidebar Overlay ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="glass-sidebar relative flex flex-col h-full z-10" style={{ width: "224px" }}>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* ── Main Column ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden relative z-10">

        {/* Top navbar */}
        <header
          className="glass-nav flex-shrink-0 flex items-center justify-between px-5 h-[52px]"
        >
          <div className="flex items-center gap-3 min-w-0">
            {/* Sidebar Toggle Button (Lottie animated) */}
            <SidebarToggle isOpen={activeOpenState} onClick={handleToggle} />

            <div className="min-w-0">
              <h1
                className="text-sm font-semibold truncate"
                style={{ color: "var(--text-1)", letterSpacing: "-0.02em" }}
              >
                {title}
              </h1>
              {subtitle && (
                <p className="text-[11px] truncate" style={{ color: "var(--text-3)" }}>
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {action}

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              style={{ color: "var(--text-2)" }}
              aria-label="Toggle theme"
            >
              {theme === "light" ? (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                </svg>
              )}
            </button>

            {/* User avatar / sign-out button */}
            {userAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={userAvatar}
                alt={userName}
                onClick={handleSignOut}
                className="h-7 w-7 rounded-lg object-cover cursor-pointer flex-shrink-0 hover:opacity-85 transition-opacity"
                referrerPolicy="no-referrer"
                title="Log out"
              />
            ) : (
              <div
                onClick={handleSignOut}
                className="h-7 w-7 rounded-lg flex items-center justify-center text-white text-[10px] font-bold cursor-pointer flex-shrink-0 hover:opacity-85 transition-opacity"
                style={{ background: "linear-gradient(135deg, var(--indigo), var(--violet))" }}
                title="Log out"
              >
                {userInitials}
              </div>
            )}
          </div>
        </header>

        {/* Scrollable page content */}
        <main className="flex-1 overflow-y-auto p-5 lg:p-6">

          {/* ── Page Hero Header ── */}
          <div className="mb-8">
            <p
              className="text-[12px] font-medium tracking-[0.08em] mb-1 text-[var(--text-4)] uppercase"
            >
              Workspace
            </p>
            <h2
              className="text-2xl lg:text-3xl font-bold"
              style={{ color: "var(--text-1)", letterSpacing: "-0.025em", lineHeight: 1.15 }}
            >
              <BlurText text={title} delay={140} />
            </h2>
            {subtitle && (
              <p
                className="text-sm lg:text-base mt-2 font-normal leading-[1.6]"
                style={{ color: "var(--text-3)", letterSpacing: "-0.011em" }}
              >
                <BlurText text={subtitle} delay={80} />
              </p>
            )}
          </div>

          {children}
        </main>
      </div>
    </div>
  );
}
