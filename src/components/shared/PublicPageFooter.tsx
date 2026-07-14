"use client";

import React from "react";
import Link from "next/link";

export default function PublicPageFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="w-full bg-[var(--surface-2)] border-t border-[var(--border)] py-20 md:py-28 overflow-hidden transition-colors duration-200">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-20">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12 items-start">

          {/* Column 1: Logo & Brand Description */}
          <div className="md:col-span-6 space-y-3">
            <Link href="/" className="font-serif text-3xl font-bold tracking-tight text-[var(--text-1)] select-none hover:opacity-90 transition-opacity">
              Quiz<span style={{ color: '#0d9488' }}>Gens</span>
            </Link>
            <p className="text-xs text-[var(--text-3)] font-normal leading-relaxed max-w-[280px]">
              © {currentYear} QuizGens. Dedicated to the pursuit of knowledge.
            </p>
          </div>

          {/* Column 2: FEATURES */}
          <div className="md:col-span-3 space-y-4">
            <h4 className="text-[11px] font-extrabold uppercase tracking-widest text-[var(--text-1)]" style={{ letterSpacing: '0.1em' }}>
              Features
            </h4>
            <ul className="space-y-3 text-[13px] font-medium text-[var(--text-3)] select-none">
              <li>Smart Generation</li>
              <li>Adaptive Learning</li>
              <li>Analytics</li>
              <li>Intelligent OCR</li>
              <li>Instant Explanations</li>
            </ul>
          </div>

          {/* Column 3: RESOURCES */}
          <div className="md:col-span-3 space-y-4">
            <h4 className="text-[11px] font-extrabold uppercase tracking-widest text-[var(--text-1)]" style={{ letterSpacing: '0.1em' }}>
              Resources
            </h4>
            <ul className="space-y-3 text-xs text-[var(--text-3)] font-semibold">
              <li>
                <Link href="/tools" className="hover:text-[var(--text-1)] transition-colors duration-150">
                  Tools Directory
                </Link>
              </li>
              <li>
                <a href="/faq" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--text-1)] transition-colors duration-150">
                  FAQ Help
                </a>
              </li>
              <li>
                <a href="/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--text-1)] transition-colors duration-150">
                  Privacy Policy
                </a>
              </li>
              <li>
                <a href="/terms" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--text-1)] transition-colors duration-150">
                  Terms of Service
                </a>
              </li>
              <li>
                <a href="/contact" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--text-1)] transition-colors duration-150">
                  Contact
                </a>
              </li>
            </ul>
          </div>

        </div>
      </div>
    </footer>
  );
}
