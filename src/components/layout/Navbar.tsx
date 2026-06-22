"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Container from "./Container";
import Button from "@/components/ui/Button";

export default function Navbar() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    // Determine current theme on mount
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

  const navItems = [
    { name: "Features", href: "#features", external: false },
    { name: "How It Works", href: "#how-it-works", external: false },
    { name: "Tech Stack", href: "#tech-stack", external: false },
    { name: "AI Chat", href: "#chat-demo-section", external: false },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-(--card-border) bg-(--background)/75 backdrop-blur-xl transition-all duration-300">
      {/* Decorative gradient border at the very bottom of navbar */}
      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-linear-to-r from-transparent via-indigo-500/15 to-transparent pointer-events-none" />

      <Container className="flex h-16 items-center justify-between">
        {/* Logo / Brand Name */}
        <Link href="/" className="flex items-center gap-2.5 group select-none">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-tr from-indigo-500 to-purple-600 shadow-md shadow-indigo-500/20 group-hover:shadow-indigo-500/35 transition-all duration-300">
            <span className="text-lg font-black text-white">K</span>
            <div className="absolute inset-0 -z-10 rounded-xl bg-indigo-500 blur-md opacity-0 group-hover:opacity-40 transition-opacity duration-300"></div>
          </div>
          <span className="font-bold text-lg tracking-tight bg-linear-to-r from-(--foreground) to-(--foreground)/70 bg-clip-text text-transparent group-hover:from-(--foreground) group-hover:to-(--foreground)/90 transition-colors">
            KnowledgeSearch
          </span>
        </Link>

        {/* Navigation Links */}
        <nav className="hidden md:flex items-center gap-3 text-sm font-medium text-zinc-500 dark:text-zinc-400 relative">
          {navItems.map((item) => {
            const linkClasses = "relative px-3.5 py-2 hover:text-(--foreground) hover:bg-(--foreground)/5 rounded-lg transition-all duration-200 select-none";

            return item.external ? (
              <Link
                key={item.name}
                href={item.href}
                className={linkClasses}
              >
                {item.name}
              </Link>
            ) : (
              <a
                key={item.name}
                href={item.href}
                className={linkClasses}
              >
                {item.name}
              </a>
            );
          })}
        </nav>

        {/* Action Buttons */}
        <div className="flex items-center gap-4">
          {/* Premium Theme Toggle Button (CSS transition-based) */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 bg-zinc-100/50 dark:bg-zinc-900/50 backdrop-blur-xs transition-all duration-200 cursor-pointer select-none active:scale-95"
            aria-label="Toggle Theme"
          >
            <div className="flex items-center justify-center transition-transform duration-200 hover:rotate-12">
              {theme === "light" ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707m12.728 12.728L12 12m0 0a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </div>
          </button>

          <Link href="/dashboard">
            <Button variant="glass" size="sm" className="hidden sm:inline-flex border-white/5 hover:bg-white/5">
              Sign In
            </Button>
          </Link>
          <Link href="/dashboard">
            <Button variant="primary" size="sm">
              Get Started
            </Button>
          </Link>
        </div>
      </Container>
    </header>
  );
}
