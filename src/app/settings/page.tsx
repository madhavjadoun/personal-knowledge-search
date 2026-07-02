"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { supabase } from "@/lib/supabase";

// ─── Toggle Component ─────────────────────────────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      role="switch"
      aria-checked={checked}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none cursor-pointer flex-shrink-0 ${
        checked ? "bg-[var(--indigo)]" : "bg-zinc-200 dark:bg-zinc-700"
      }`}
    >
      <span
        className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
        style={{ width: "18px", height: "18px" }}
      />
    </button>
  );
}

// ─── Section Card ─────────────────────────────────────────────────────────────
function SettingSection({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[18px] overflow-hidden">
      {/* Section Header */}
      <div className="px-6 py-4 border-b border-[var(--border)] flex items-center gap-3 bg-[var(--bg-2)]/20">
        <div className="w-8 h-8 rounded-lg bg-[var(--bg-2)] flex items-center justify-center text-[var(--text-2)]">
          {icon}
        </div>
        <div>
          <p className="text-base font-extrabold text-[var(--text-1)]">{title}</p>
          {description && <p className="text-xs font-semibold text-[var(--text-3)] mt-0.5">{description}</p>}
        </div>
      </div>
      {/* Section Content */}
      <div className="divide-y divide-[var(--border)]">{children}</div>
    </div>
  );
}

// ─── Setting Row ──────────────────────────────────────────────────────────────
function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-6 py-5 flex items-center justify-between gap-6">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-extrabold text-[var(--text-1)]">{label}</p>
        {description && (
          <p className="text-[12px] font-semibold text-[var(--text-3)] mt-0.5 leading-relaxed">{description}</p>
        )}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

// ─── Danger Row ───────────────────────────────────────────────────────────────
function DangerRow({
  label,
  description,
  buttonLabel,
  buttonStyle = "mild",
  onClick,
}: {
  label: string;
  description: string;
  buttonLabel: string;
  buttonStyle?: "mild" | "severe";
  onClick: () => void;
}) {
  return (
    <div className="px-6 py-5 flex items-center justify-between gap-6">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-extrabold text-[var(--text-1)]">{label}</p>
        <p className="text-[12px] font-semibold text-[var(--text-3)] mt-0.5 leading-relaxed">{description}</p>
      </div>
      <button
        onClick={onClick}
        className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
          buttonStyle === "severe"
            ? "bg-red-600 text-white hover:bg-red-700 shadow-sm hover:shadow"
            : "bg-red-500/10 text-red-500 hover:bg-red-500/15 border border-red-500/20"
        }`}
      >
        {buttonLabel}
      </button>
    </div>
  );
}
export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [defaultMcqCount, setDefaultMcqCount] = useState<number>(10);
  const [shuffleQuestions, setShuffleQuestions] = useState<boolean>(false);
  const [autoShowExplanation, setAutoShowExplanation] = useState<boolean>(true);

  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [accountLoading, setAccountLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "error" | "success" } | null>(null);

  const showToast = (message: string, type: "error" | "success" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    async function loadSettings() {
      try {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push("/login"); return; }
        setUserId(user.id);
        setUserEmail(user.email || "");

        const activeTheme = document.documentElement.classList.contains("dark") ? "dark" : "light";
        setTheme(activeTheme);

        const count = localStorage.getItem(`settings_mcq_count_${user.id}`);
        if (count) setDefaultMcqCount(parseInt(count) || 10);

        const shuffle = localStorage.getItem(`settings_shuffle_${user.id}`);
        if (shuffle) setShuffleQuestions(shuffle === "true");

        const explain = localStorage.getItem(`settings_auto_show_explanation_${user.id}`);
        if (explain) setAutoShowExplanation(explain === "true");
      } catch (err) {
        console.error("Failed to load settings:", err);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, [router]);

  const handleToggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem("theme", next);
    setTheme(next);
    showToast(`Switched to ${next} mode`);
  };

  const handleSaveMcqCount = (val: number) => {
    setDefaultMcqCount(val);
    localStorage.setItem(`settings_mcq_count_${userId}`, String(val));
    showToast(`Default MCQ count set to ${val}`);
  };

  const handleClearCache = () => {
    localStorage.removeItem(`settings_mcq_count_${userId}`);
    localStorage.removeItem(`settings_shuffle_${userId}`);
    localStorage.removeItem(`settings_auto_show_explanation_${userId}`);
    setDefaultMcqCount(10);
    setShuffleQuestions(false);
    setAutoShowExplanation(true);
    showToast("Preferences reset to defaults.");
  };

  const triggerDeleteHistory = async () => {
    try {
      setHistoryLoading(true);
      const { data: docs } = await supabase.from("documents").select("id").eq("user_id", userId);

      if (!docs || docs.length === 0) {
        showToast("No quiz history to delete.");
        setShowHistoryModal(false);
        return;
      }

      const docIds = docs.map(d => d.id);
      const { data: quizzes } = await supabase.from("quizzes").select("id").in("document_id", docIds);

      if (quizzes && quizzes.length > 0) {
        const quizIds = quizzes.map(q => q.id);
        await supabase.from("quiz_questions").delete().in("quiz_id", quizIds);
      }
      await supabase.from("quizzes").delete().in("document_id", docIds);

      showToast("Quiz history cleared successfully.");
      setShowHistoryModal(false);
    } catch (err) {
      console.error(err);
      showToast("Failed to clear quiz history.", "error");
    } finally {
      setHistoryLoading(false);
    }
  };

  const triggerDeleteAccountData = async () => {
    try {
      setAccountLoading(true);
      const { data: docs } = await supabase.from("documents").select("id, file_name").eq("user_id", userId);

      if (docs && docs.length > 0) {
        const docIds = docs.map(d => d.id);
        const { data: quizzes } = await supabase.from("quizzes").select("id").in("document_id", docIds);
        if (quizzes && quizzes.length > 0) {
          await supabase.from("quiz_questions").delete().in("quiz_id", quizzes.map(q => q.id));
        }
        await supabase.from("quizzes").delete().in("document_id", docIds);
        await supabase.from("chunks").delete().in("document_id", docIds).eq("user_id", userId);
        for (const doc of docs) {
          await supabase.storage.from("documents").remove([`${userId}/${doc.file_name}`]);
        }
        await supabase.from("documents").delete().eq("user_id", userId);
      }

      showToast("All data deleted. Signing out...");
      setShowAccountModal(false);
      await supabase.auth.signOut();
      router.push("/login");
    } catch (err) {
      console.error(err);
      showToast("Failed to delete account data.", "error");
    } finally {
      setAccountLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (loading) {
    return (
      <AppShell title="Settings" subtitle="Configure your experience.">
        <div className="flex items-center justify-center py-32">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-[var(--indigo)] border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-semibold text-[var(--text-4)]">Loading preferences…</p>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Settings" subtitle="Manage your account, preferences and data.">
      <div className="max-w-3xl mx-auto space-y-5 pb-12 animate-in fade-in duration-300">

        {/* ── Account Info Banner ── */}
        <div className="bg-gradient-to-r from-[var(--indigo)]/10 via-[var(--bg-2)] to-[var(--surface)] border border-[var(--border)] rounded-[18px] px-6 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-full bg-[var(--indigo)]/15 flex items-center justify-center">
              <svg className="w-5 h-5 text-[var(--indigo)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
            <div>
              <p className="text-base font-extrabold text-[var(--text-1)]">Signed In</p>
              <p className="text-sm font-semibold text-[var(--text-2)] mt-0.5 truncate max-w-[280px]">{userEmail || "—"}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="px-4 py-2 text-xs font-bold border border-[var(--border)] rounded-xl hover:bg-[var(--bg-2)] text-[var(--text-2)] transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
            </svg>
            Sign Out
          </button>
        </div>

        {/* ── Appearance ── */}
        <SettingSection
          icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008z" /></svg>}
          title="Appearance"
          description="Customise how the interface looks."
        >
          <SettingRow
            label="Theme"
            description="Toggle between light and dark interface modes."
          >
            <button
              onClick={handleToggleTheme}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--border)] hover:bg-[var(--bg-2)] text-xs font-bold text-[var(--text-2)] transition-all cursor-pointer"
            >
              {theme === "light" ? (
                <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" /></svg>Dark Mode</>
              ) : (
                <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" /></svg>Light Mode</>
              )}
            </button>
          </SettingRow>
        </SettingSection>

        {/* ── Quiz Preferences ── */}
        <SettingSection
          icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" /></svg>}
          title="Quiz Preferences"
          description="Control quiz generation and flow defaults."
        >
          <SettingRow
            label="Default MCQ Count"
            description="Number of questions pre-filled when opening the quiz generator."
          >
            <select
              value={defaultMcqCount}
              onChange={e => handleSaveMcqCount(parseInt(e.target.value))}
              className="h-9 px-3 border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text-2)] bg-[var(--surface)] focus:border-[var(--indigo)] focus:outline-none transition-all cursor-pointer"
            >
              {[5, 10, 15, 20, 30, 50].map(n => (
                <option key={n} value={n}>{n} Questions</option>
              ))}
            </select>
          </SettingRow>

          <SettingRow
            label="Shuffle Option Order"
            description="Randomise the order of answer choices for each question."
          >
            <Toggle
              checked={shuffleQuestions}
              onChange={() => {
                const next = !shuffleQuestions;
                setShuffleQuestions(next);
                localStorage.setItem(`settings_shuffle_${userId}`, String(next));
                showToast(`Shuffle options ${next ? "enabled" : "disabled"}.`);
              }}
            />
          </SettingRow>

          <SettingRow
            label="Auto-Show Explanations"
            description="Automatically reveal explanations after answering incorrectly."
          >
            <Toggle
              checked={autoShowExplanation}
              onChange={() => {
                const next = !autoShowExplanation;
                setAutoShowExplanation(next);
                localStorage.setItem(`settings_auto_show_explanation_${userId}`, String(next));
                showToast(`Auto explanations ${next ? "enabled" : "disabled"}.`);
              }}
            />
          </SettingRow>
        </SettingSection>

        {/* ── Storage & Cache ── */}
        <SettingSection
          icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 2.625c0 2.278-3.694 4.125-8.25 4.125S3.75 11.153 3.75 9" /></svg>}
          title="Storage & Cache"
          description="Manage locally stored preferences and cached data."
        >
          <SettingRow
            label="Reset Local Preferences"
            description="Restore all settings above to their factory defaults. No data is deleted from the server."
          >
            <button
              onClick={handleClearCache}
              className="h-9 px-4 border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text-2)] hover:bg-[var(--bg-2)] transition-colors cursor-pointer"
            >
              Reset Defaults
            </button>
          </SettingRow>
        </SettingSection>

        {/* ── Danger Zone ── */}
        <div className="bg-[var(--surface)] border border-red-200 dark:border-red-900/40 rounded-[18px] overflow-hidden">
          <div className="px-6 py-4 border-b border-red-100 dark:border-red-900/30 flex items-center gap-3 bg-red-500/[0.03]">
            <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <p className="text-base font-extrabold text-red-600 dark:text-red-400">Danger Zone</p>
              <p className="text-xs font-semibold text-red-500/80 dark:text-red-400/70 mt-0.5">These actions are permanent and cannot be undone.</p>
            </div>
          </div>
          <div className="divide-y divide-red-100 dark:divide-red-900/30">
            <DangerRow
              label="Clear Quiz History"
              description="Permanently delete all quiz attempts and score records. Your uploaded documents will remain intact."
              buttonLabel="Clear History"
              buttonStyle="mild"
              onClick={() => setShowHistoryModal(true)}
            />
            <DangerRow
              label="Purge All Account Data"
              description="Delete all uploaded PDFs, knowledge chunks, quiz records, and metadata. You will be signed out immediately."
              buttonLabel="Purge Data"
              buttonStyle="severe"
              onClick={() => setShowAccountModal(true)}
            />
          </div>
        </div>
      </div>

      {/* ── Delete History Modal ── */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200 px-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[20px] max-w-[420px] w-full p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-4 mb-5">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--text-1)]">Clear Quiz History?</h3>
                <p className="text-xs text-[var(--text-3)] mt-1 leading-relaxed">All your past quiz attempts, scores, and accuracy records will be permanently deleted. This cannot be undone.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2.5">
              <button onClick={() => setShowHistoryModal(false)} disabled={historyLoading} className="px-4 py-2 border border-[var(--border)] rounded-xl text-xs font-semibold hover:bg-[var(--bg-2)] transition-colors cursor-pointer">Cancel</button>
              <button onClick={triggerDeleteHistory} disabled={historyLoading} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer min-w-[100px] justify-center">
                {historyLoading ? <><svg className="animate-spin h-3 w-3 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4}/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Deleting…</> : "Clear History"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Purge Account Modal ── */}
      {showAccountModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200 px-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[20px] max-w-[420px] w-full p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-4 mb-5">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--text-1)]">Purge All Account Data?</h3>
                <p className="text-xs text-[var(--text-3)] mt-1 leading-relaxed">This will permanently erase <span className="font-semibold text-red-500">every document, quiz, chunk, and score</span> associated with your account. You will be signed out. This is irreversible.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2.5">
              <button onClick={() => setShowAccountModal(false)} disabled={accountLoading} className="px-4 py-2 border border-[var(--border)] rounded-xl text-xs font-semibold hover:bg-[var(--bg-2)] transition-colors cursor-pointer">Cancel</button>
              <button onClick={triggerDeleteAccountData} disabled={accountLoading} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer min-w-[110px] justify-center">
                {accountLoading ? <><svg className="animate-spin h-3 w-3 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4}/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Purging…</> : "Purge Data"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl border animate-in fade-in slide-in-from-bottom-4 duration-200 ${
          toast.type === "error"
            ? "bg-red-600 text-white border-red-700"
            : "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 border-zinc-800 dark:border-slate-200"
        }`}>
          {toast.type === "success" ? (
            <svg className="w-4 h-4 flex-shrink-0 text-emerald-400 dark:text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
          ) : (
            <svg className="w-4 h-4 flex-shrink-0 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
          )}
          <span className="text-xs font-semibold">{toast.message}</span>
        </div>
      )}
    </AppShell>
  );
}
