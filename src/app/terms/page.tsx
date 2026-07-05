"use client";

import AppShell from "@/components/app/AppShell";

export default function TermsPage() {
  return (
    <AppShell title="Terms of Service" subtitle="Last Updated: July 2026" publicPage={true} noSidebar={true}>
      <div className="max-w-3xl mx-auto glass-card rounded-2xl p-8 space-y-6 text-sm text-[var(--text-2)] leading-relaxed">
        <p className="font-semibold text-base text-[var(--text-1)]">
          Welcome to QuizGenerator. By using this application, you agree to the following terms.
        </p>

        <div className="space-y-3 pt-2">
          <h3 className="text-base font-bold text-[var(--text-1)]">Acceptable Use</h3>
          <p className="font-medium">You agree to:</p>
          <ul className="list-disc pl-5 space-y-1.5 font-medium">
            <li>Upload only documents you own or have permission to use.</li>
            <li>Use the platform for educational and learning purposes.</li>
            <li>Avoid uploading harmful or illegal content.</li>
          </ul>
        </div>

        <div className="space-y-3 pt-2">
          <h3 className="text-base font-bold text-[var(--text-1)]">AI Generated Content</h3>
          <p className="font-medium">
            Quiz questions are generated using Artificial Intelligence.
          </p>
          <p className="font-medium">
            While every effort is made to provide accurate questions, AI-generated content may occasionally contain mistakes. Users should verify important educational information independently.
          </p>
        </div>

        <div className="space-y-3 pt-2">
          <h3 className="text-base font-bold text-[var(--text-1)]">Service Availability</h3>
          <p className="font-medium">
            The application is provided on a best-effort basis. Features may change, improve, or become temporarily unavailable without prior notice.
          </p>
        </div>

        <div className="space-y-3 pt-2">
          <h3 className="text-base font-bold text-[var(--text-1)]">Account Responsibility</h3>
          <p className="font-medium">
            You are responsible for maintaining the security of your own account.
          </p>
        </div>

        <div className="space-y-3 pt-2">
          <h3 className="text-base font-bold text-[var(--text-1)]">Limitation of Liability</h3>
          <p className="font-medium">
            QuizGenerator is a student project and is provided &quot;as is&quot; without warranties of any kind.
          </p>
        </div>

        <div className="space-y-3 pt-2">
          <h3 className="text-base font-bold text-[var(--text-1)]">Contact</h3>
          <p className="font-medium">
            Questions regarding these terms can be sent to:<br />
            Email: <a href="mailto:madhavjadaun9@gmail.com" className="text-[var(--indigo)] hover:underline">madhavjadaun9@gmail.com</a>
          </p>
        </div>
      </div>
    </AppShell>
  );
}
