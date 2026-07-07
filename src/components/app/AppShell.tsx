"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import BlurText from "@/components/ui/BlurText";
import { supabase } from "@/lib/supabase";
import OrbitLoader from "@/components/app/OrbitLoader";
import NavbarLogo from "@/components/layout/NavbarLogo";

function SidebarToggle({ isOpen, onClick }: { isOpen: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="p-1 rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center flex-shrink-0 cursor-pointer"
      style={{ width: "36px", height: "36px", color: isOpen ? "var(--text-3)" : "var(--text-1)" }}
      aria-label="Toggle sidebar"
    >
      <svg className="w-5.5 h-5.5 transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
        {isOpen ? (
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        )}
      </svg>
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
  {
    href: "/history",
    label: "Quiz History",
    icon: (
      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: (
      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.43l-1.003.828c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.297 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.43l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.991l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

interface AppShellProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  publicPage?: boolean;
  noSidebar?: boolean;
}

export default function AppShell({ children, title, subtitle, action, publicPage = false, noSidebar = false }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Supabase Auth states
  const [user, setUser] = useState<import("@supabase/supabase-js").User | null>(null);
  const [userLoading, setUserLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const checkUser = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        if (publicPage) {
          if (mounted) {
            setUser(null);
            setUserLoading(false);
          }
        } else {
          if (mounted) router.push("/login");
        }
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
        if (!publicPage) {
          router.push("/login");
        } else {
          setUser(null);
        }
      } else if (session?.user) {
        setUser(session.user);
        setUserLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router, publicPage]);

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowLogoutModal(false);
      }
    };
    if (showLogoutModal) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showLogoutModal]);


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

  const userName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split("@")[0] || "User";
  const userInitials = userName.slice(0, 2).toUpperCase();
  const userAvatar = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  /* ── Sidebar content ── */
  const SidebarContent = () => (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">

      {/* Brand */}
      {/* Sidebar Header */}
      <div className="flex items-center justify-between gap-2.5 p-4 border-b border-[var(--border)] bg-[var(--surface)]">
        <NavbarLogo />
        <div className="hidden md:block">
          <SidebarToggle isOpen={sidebarOpen} onClick={handleToggle} />
        </div>
        <div className="block md:hidden">
          <SidebarToggle isOpen={mobileOpen} onClick={() => setMobileOpen(false)} />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 min-h-0 overflow-hidden p-2.5 flex flex-col gap-0.5">
        <p
          className="text-page-eyebrow px-2 pb-1.5 pt-1"
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

      {/* Footer */}
      <footer className="mt-auto border-t border-[var(--border)] px-5 py-4 shrink-0 flex flex-col gap-1.5">
        {/* Footer links */}
        <div className="relative z-20 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs font-medium text-[var(--text-4)] select-none">
          <a href="/faq" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--text-2)] transition-colors relative z-30">FAQ</a>
          <span className="text-[var(--border-strong)] select-none">•</span>
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--text-2)] transition-colors relative z-30">Privacy</a>
          <span className="text-[var(--border-strong)] select-none">•</span>
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--text-2)] transition-colors relative z-30">Terms</a>
          <span className="text-[var(--border-strong)] select-none">•</span>
          <a href="/contact" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--text-2)] transition-colors relative z-30">Contact</a>
        </div>
        {/* Version */}
        <div className="text-[11px] font-medium text-[var(--text-4)] text-center mt-1">
          Version 1.0.0
        </div>
      </footer>
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
    <div className="fixed inset-0 flex overflow-hidden app-bg" style={{ height: "100vh" }}>

      {/* ── Aurora Glow (behind everything) ── */}
      <div className="aurora-tl" />
      <div className="aurora-br" />
      <div className="aurora-accent" />

      {/* ── Desktop Sidebar ── */}
      {!noSidebar && (
        <aside
          className="glass-sidebar hidden md:flex flex-col flex-shrink-0 z-10 transition-all duration-300 ease-in-out"
          style={{
            width: sidebarOpen ? "240px" : "0px",
            opacity: sidebarOpen ? 1 : 0,
            borderRight: sidebarOpen ? "1px solid var(--border)" : "none",
            overflow: "hidden",
            height: "100vh",
          }}
        >
          <div className="flex h-full min-h-0 flex-col overflow-hidden" style={{ width: "240px", flexShrink: 0 }}>
            <SidebarContent />
          </div>
        </aside>
      )}

      {/* ── Mobile Sidebar Overlay ── */}
      {!noSidebar && mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="glass-sidebar relative flex w-60 flex-col overflow-hidden z-10" style={{ height: "100vh" }}>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* ── Main Column ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden relative z-10">

        {/* Top navbar */}
        <header
          className="glass-nav flex-shrink-0 flex items-center justify-between gap-2 px-4 sm:px-5 h-[56px] min-w-0"
        >
          <div className="flex items-center gap-2 sm:gap-3.5 min-w-0 flex-1 overflow-hidden">
            {noSidebar ? (
              <Link href="/" className="flex items-center gap-2 text-xs font-semibold text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                <span>Back to Home</span>
              </Link>
            ) : (
              <>
                {/* Desktop toggle visible when sidebar is closed */}
                {!sidebarOpen && (
                  <div className="hidden md:block">
                    <SidebarToggle isOpen={sidebarOpen} onClick={handleToggle} />
                  </div>
                )}
                {/* Mobile toggle visible when mobile menu is closed */}
                {!mobileOpen && (
                  <div className="block md:hidden">
                    <SidebarToggle isOpen={mobileOpen} onClick={() => setMobileOpen(true)} />
                  </div>
                )}
              </>
            )}

            {/* Premium Breadcrumb Header */}
            {!noSidebar && (
              <div className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-[var(--text-4)] select-none min-w-0 truncate">
                <span className="flex-shrink-0">Workspace</span>
                <span className="text-[var(--text-4)] font-normal flex-shrink-0">/</span>
                <span className="font-semibold text-[var(--text-1)] truncate tracking-tight">{title}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-3.5 flex-shrink-0 min-w-0">
            <div className="min-w-0 max-w-[45vw] sm:max-w-none">{action}</div>

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="p-2.5 rounded-lg transition-all hover:bg-black/5 dark:hover:bg-white/5 hover:scale-[1.05] active:scale-95 cursor-pointer"
              style={{ color: "var(--text-2)" }}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? (
                <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                </svg>
              ) : (
                <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                </svg>
              )}
            </button>

            {/* User avatar / sign-out button */}
            {user && (userAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={userAvatar}
                alt={userName}
                onClick={() => setShowLogoutModal(true)}
                className="h-9 w-9 rounded-xl object-cover cursor-pointer flex-shrink-0 hover:opacity-85 hover:scale-[1.05] active:scale-95 transition-all shadow-sm"
                referrerPolicy="no-referrer"
                title="Log out"
              />
            ) : (
              <div
                onClick={() => setShowLogoutModal(true)}
                className="h-9 w-9 rounded-xl flex items-center justify-center text-white text-xs font-bold cursor-pointer flex-shrink-0 hover:opacity-85 hover:scale-[1.05] active:scale-95 transition-all shadow-sm"
                style={{ background: "linear-gradient(135deg, var(--indigo), var(--violet))" }}
                title="Log out"
              >
                {userInitials}
              </div>
            ))}
          </div>
        </header>

        {/* Scrollable page content */}
        <main className={`flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-5 lg:p-6 ${noSidebar ? "max-w-5xl mx-auto w-full" : ""}`}>

          {/* ── Page Hero Header ── */}
          <div className="mb-8">
            {title === "Documents" ? (
              <div className="flex flex-col gap-1">
                <div className="text-xs font-semibold tracking-wider uppercase flex items-center mb-1">
                  <span className="text-[#94A3B8]">Workspace</span>
                  <span className="mx-1.5 text-[#94A3B8] font-normal">/</span>
                  <span className="text-[#0F172A] dark:text-slate-100 font-bold">Documents</span>
                </div>
              </div>
            ) : (
              <>
                <p className="text-page-eyebrow mb-1">
                  Workspace
                </p>
                <h2
                  className="text-2xl lg:text-3xl font-semibold tracking-tight"
                  style={{ color: "var(--text-1)", letterSpacing: "-0.03em", lineHeight: 1.1 }}
                >
                  <BlurText text={title} delay={140} />
                </h2>
              </>
            )}
            {subtitle && (
              <p
                className="text-sm lg:text-base mt-2 font-normal leading-relaxed text-description"
                style={{ letterSpacing: "-0.011em" }}
              >
                <BlurText text={subtitle} delay={80} />
              </p>
            )}
          </div>

          {children}
        </main>
      </div>

      {/* ── Logout Confirmation Modal ── */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/45 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => setShowLogoutModal(false)}
          />
          {/* Modal Container */}
          <div
            className="relative bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 shadow-2xl max-w-sm w-full z-10 transition-all duration-300 transform scale-100"
            role="dialog"
            aria-modal="true"
          >
            <h3 className="text-[17px] font-semibold text-[var(--text-1)] tracking-tight">
              Sign out?
            </h3>
            <p className="text-[13px] font-normal text-[var(--text-3)] mt-2 leading-relaxed">
              Are you sure you want to sign out of QuizGenerator?
            </p>
            <div className="flex gap-2.5 mt-5">
              <button
                type="button"
                onClick={() => setShowLogoutModal(false)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-3)] text-sm font-semibold hover:bg-[var(--bg-2)] hover:text-[var(--text-1)] transition-all cursor-pointer active:scale-98"
                autoFocus
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-500 transition-all cursor-pointer active:scale-98 shadow-sm"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
