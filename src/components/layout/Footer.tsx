"use client";

import React from "react";
import Link from "next/link";
import Container from "./Container";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="relative border-t border-(--card-border) bg-(--background)/60 py-12 md:py-16 overflow-hidden">
      {/* Soft background ambient lighting for the footer base */}
      <div className="absolute -bottom-20 right-[15%] w-96 h-96 bg-indigo-500/5 rounded-full pointer-events-none blur-3xl" />
      <div className="absolute -bottom-20 left-[15%] w-96 h-96 bg-purple-500/5 rounded-full pointer-events-none blur-3xl" />

      <Container className="relative z-10">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-4">
          {/* Brand Info */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-linear-to-tr from-indigo-500 to-purple-600 shadow-md shadow-indigo-500/20">
                <span className="text-sm font-black text-white">K</span>
              </div>
              <span className="font-bold text-base text-(--foreground)">
                KnowledgeSearch
              </span>
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Your AI-powered second brain. Semantic search, document parsing, and natural dialogue on top of your personalized files.
            </p>
          </div>

          {/* Product Links */}
          <div>
            <h4 className="font-semibold text-(--foreground) text-sm mb-4">Product</h4>
            <ul className="space-y-2.5 text-sm text-zinc-500 dark:text-zinc-400">
              <li>
                <a href="#features" className="hover:text-(--foreground) transition-colors duration-200">
                  Features
                </a>
              </li>
              <li>
                <a href="#roadmap" className="hover:text-(--foreground) transition-colors duration-200">
                  Roadmap
                </a>
              </li>
              <li>
                <Link href="/docs" className="hover:text-(--foreground) transition-colors duration-200">
                  Documentation
                </Link>
              </li>
            </ul>
          </div>

          {/* Tech Stack Links */}
          <div>
            <h4 className="font-semibold text-(--foreground) text-sm mb-4">Tech Stack</h4>
            <ul className="space-y-2.5 text-sm text-zinc-500 dark:text-zinc-400">
              <li className="hover:text-(--foreground) transition-colors duration-200 cursor-default">Next.js 15</li>
              <li className="hover:text-(--foreground) transition-colors duration-200 cursor-default">Tailwind CSS</li>
              <li className="hover:text-(--foreground) transition-colors duration-200 cursor-default">PostgreSQL & pgvector</li>
              <li className="hover:text-(--foreground) transition-colors duration-200 cursor-default">Prisma ORM</li>
              <li className="hover:text-(--foreground) transition-colors duration-200 cursor-default">OpenAI / Gemini</li>
            </ul>
          </div>

          {/* Legal / Social */}
          <div>
            <h4 className="font-semibold text-(--foreground) text-sm mb-4">Github</h4>
            <ul className="space-y-2.5 text-sm text-zinc-500 dark:text-zinc-400">
              <li>
                <a href="#" className="hover:text-(--foreground) transition-colors duration-200">
                  Repository
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-(--foreground) transition-colors duration-200">
                  Issues
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-(--foreground) transition-colors duration-200">
                  Discussions
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-(--card-border) pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-400 dark:text-zinc-500">
          <p>© {currentYear} Personal Knowledge Search Engine. All rights reserved.</p>
          <div className="flex gap-6">
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-(--foreground) transition-colors duration-200">
              Privacy Policy
            </a>
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="hover:text-(--foreground) transition-colors duration-200">
              Terms of Service
            </a>
          </div>
        </div>
      </Container>
    </footer>
  );
}
