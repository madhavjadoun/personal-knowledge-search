"use client";

import AppShell from "@/components/app/AppShell";

export default function ContactPage() {
  return (
    <AppShell title="Contact" subtitle="Have questions, suggestions, or found a bug?" publicPage={true} noSidebar={true}>
      <div className="max-w-2xl mx-auto glass-card rounded-2xl p-5 sm:p-8 space-y-6 text-sm text-[var(--text-2)] leading-relaxed min-w-0 overflow-hidden">
        <p className="font-semibold text-base text-[var(--text-1)]">
          I'd love to hear from you.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
          <div className="space-y-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-4)]">Developer</h4>
            <p className="text-sm font-bold text-[var(--text-1)]">Madhav Jadoun</p>
          </div>

          <div className="space-y-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-4)]">Email</h4>
            <p className="text-sm font-bold">
              <a href="mailto:madhavjadaun9@gmail.com" className="text-[var(--indigo)] hover:underline break-all">
                madhavjadaun9@gmail.com
              </a>
            </p>
          </div>

          <div className="space-y-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-4)]">GitHub</h4>
            <p className="text-sm font-bold">
              <a href="https://github.com/madhavjadoun" target="_blank" rel="noopener noreferrer" className="text-[var(--indigo)] hover:underline">
                github.com/madhavjadoun
              </a>
            </p>
          </div>

          <div className="space-y-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-4)]">Response Time</h4>
            <p className="text-sm font-bold text-[var(--text-1)]">Usually within 12-24 hours</p>
          </div>
        </div>

        <div className="space-y-2 pt-4 border-t border-[var(--border)]">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-4)]">Project Purpose</h4>
          <p className="text-xs font-semibold text-[var(--text-3)]">
            QuizGenerator is an AI-powered educational platform that converts PDF documents into interactive practice quizzes using OCR and Google's Gemini AI.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
