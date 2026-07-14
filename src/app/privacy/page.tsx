"use client";

import AppShell from "@/components/app/AppShell";

export default function PrivacyPage() {
  return (
    <AppShell title="Privacy Policy" subtitle="Last Updated: July 2026" publicPage={true} noSidebar={true}>
      <div className="max-w-3xl mx-auto glass-card rounded-2xl p-8 space-y-6 text-sm text-[var(--text-2)] leading-relaxed">
        <p className="font-semibold text-base text-[var(--text-1)]">
          QuizGens respects your privacy. This application is built for educational purposes and only collects the information necessary to provide its core features.
        </p>

        <div className="space-y-3 pt-2">
          <h3 className="text-base font-bold text-[var(--text-1)]">Information We Collect</h3>
          <ul className="list-disc pl-5 space-y-1.5 font-medium">
            <li>Name and email address (via Google Authentication)</li>
            <li>Uploaded PDF files, study images, whiteboard snaps, and pasted text notes</li>
            <li>Generated quizzes (MCQ, True/False, and Fill-in-the-Blanks) and history</li>
            <li>Basic usage information required to improve the application</li>
          </ul>
        </div>

        <div className="space-y-3 pt-2">
          <h3 className="text-base font-bold text-[var(--text-1)]">How Your Data Is Used</h3>
          <p className="font-medium">Your information is used only to:</p>
          <ul className="list-disc pl-5 space-y-1.5 font-medium">
            <li>Authenticate your account</li>
            <li>Store uploaded documents, images, and notes securely</li>
            <li>Generate AI-powered quizzes</li>
            <li>Save your quiz history and progress</li>
            <li>Improve application performance</li>
          </ul>
          <p className="font-semibold text-[var(--text-1)] pt-1">
            Your uploaded documents are never sold or shared with third parties.
          </p>
        </div>

        <div className="space-y-3 pt-2">
          <h3 className="text-base font-bold text-[var(--text-1)]">Data Storage</h3>
          <p className="font-medium">
            All user data is securely stored using Supabase. Authentication is handled through secure OAuth providers.
          </p>
        </div>

        <div className="space-y-3 pt-2">
          <h3 className="text-base font-bold text-[var(--text-1)]">AI Processing</h3>
          <p className="font-medium">
            Uploaded documents may be processed by Google&apos;s Gemini API only for generating quiz questions. Documents are not used to train public AI models through this application.
          </p>
        </div>

        <div className="space-y-3 pt-2">
          <h3 className="text-base font-bold text-[var(--text-1)]">Your Rights</h3>
          <p className="font-medium">
            You may delete your documents and quiz history at any time from your account.
          </p>
        </div>

        <div className="space-y-3 pt-2">
          <h3 className="text-base font-bold text-[var(--text-1)]">Contact</h3>
          <p className="font-medium">
            For any privacy-related questions, please contact:<br />
            Email: <a href="mailto:support@quizgens.tech" className="text-[var(--indigo)] hover:underline">support@quizgens.tech</a>
          </p>
        </div>

        <div className="border-t border-[var(--border)] pt-4 text-xs text-[var(--text-4)] font-medium">
          This project is developed for educational purposes as a student project.
        </div>
      </div>
    </AppShell>
  );
}
