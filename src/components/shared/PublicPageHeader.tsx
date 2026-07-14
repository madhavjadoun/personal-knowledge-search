"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import NavbarLogo from "@/components/layout/NavbarLogo";

export default function PublicPageHeader() {
  const router = useRouter();
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "dark" : "light");
  }, []);

  const toggleTheme = () => {
    if (theme === "light") {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
      setTheme("dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
      setTheme("light");
    }
  };

  const navLinks: { name: string; href: string }[] = [];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur-md transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-20 h-16 flex items-center justify-between min-w-0">
        
        {/* Left Side: Brand Logo */}
        <Link href="/" className="flex items-center min-w-0 cursor-pointer">
          <NavbarLogo />
        </Link>

        {/* Center: Nav links (hidden on mobile) */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-[var(--text-3)]">
          {navLinks.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              className="hover:text-[var(--text-1)] transition-colors py-1 px-1 cursor-pointer"
            >
              {link.name}
            </Link>
          ))}
        </nav>

        {/* Right Side: Auth buttons + Theme toggle */}
        <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
          
          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg border border-[var(--border)] text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--bg-2)] transition-all duration-200 cursor-pointer active:scale-95 flex items-center justify-center h-8 w-8"
            aria-label="Toggle Theme"
          >
            {theme === "light" ? (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707m12.728 12.728L12 12m0 0a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>

          <button
            onClick={() => router.push("/login")}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[var(--border)] transition-all duration-[250ms] cursor-pointer hover:bg-[var(--bg-2)] hover:text-[var(--text-1)] hover:-translate-y-0.5 active:translate-y-0 shadow-xs whitespace-nowrap hidden xs:block"
          >
            Sign in
          </button>

          <button
            onClick={() => router.push("/login")}
            className="grad-btn px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-[250ms] hover:-translate-y-0.5 flex items-center gap-1 group shadow-xs active:translate-y-0 whitespace-nowrap"
          >
            Get started
            <span className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
          </button>

          {/* Mobile menu trigger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-3)] hover:text-[var(--text-1)] cursor-pointer"
            aria-label="Toggle mobile menu"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile nav dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-[var(--border)] bg-[var(--bg)] px-4 py-3 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
          {navLinks.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-sm font-semibold text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors cursor-pointer"
            >
              {link.name}
            </Link>
          ))}
          <div className="border-t border-[var(--border)] pt-2 flex flex-col gap-2">
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                router.push("/login");
              }}
              className="w-full text-center text-xs font-semibold py-2.5 rounded-lg border border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--bg-2)] cursor-pointer"
            >
              Sign in
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
