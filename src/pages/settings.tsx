import { useState, useEffect } from "react";
import Head from "next/head";
import { AI_PROMPT_STORAGE_KEY } from "../lib/aiPromptStorage";
import { getStoredTheme, setStoredTheme, type ThemeId } from "../lib/themeStorage";

const THEME_OPTIONS: { id: ThemeId; label: string; description: string }[] = [
  { id: "default", label: "デフォルト（緑）", description: "アプリの標準テーマ" },
  { id: "light", label: "白", description: "明るい背景" },
  { id: "dark", label: "黒", description: "ダークモード" },
  { id: "pink", label: "ピンク", description: "女性に使いやすいローズ系" },
  { id: "ocean", label: "オーシャンブルー", description: "落ち着いた青系・信頼感" },
];

export default function SettingsPage() {
  const [promptDraft, setPromptDraft] = useState("");
  const [promptLoading, setPromptLoading] = useState(true);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeId>("default");
  const [themeMounted, setThemeMounted] = useState(false);

  useEffect(() => {
    setThemeMounted(true);
    setTheme(getStoredTheme());
  }, []);

  useEffect(() => {
    setPromptLoading(true);
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(AI_PROMPT_STORAGE_KEY) : null;
    if (saved != null && saved !== "") {
      setPromptDraft(saved);
      setPromptLoading(false);
      return;
    }
    fetch("/api/ai/gem-prompt")
      .then((r) => r.json())
      .then((data) => {
        if (data?.systemPrompt) setPromptDraft(data.systemPrompt);
      })
      .catch(() => {})
      .finally(() => setPromptLoading(false));
  }, []);

  const handleSave = () => {
    const v = promptDraft.trim();
    if (typeof window !== "undefined") {
      if (v !== "") window.localStorage.setItem(AI_PROMPT_STORAGE_KEY, v);
      else window.localStorage.removeItem(AI_PROMPT_STORAGE_KEY);
    }
    setSavedMessage("保存しました。次回の「今日を評価」から反映されます。");
    setTimeout(() => setSavedMessage(null), 4000);
  };

  const handleResetDefault = () => {
    setPromptLoading(true);
    fetch("/api/ai/gem-prompt")
      .then((r) => r.json())
      .then((data) => {
        if (data?.systemPrompt) setPromptDraft(data.systemPrompt);
      })
      .catch(() => {})
      .finally(() => setPromptLoading(false));
  };

  const handleThemeChange = (id: ThemeId) => {
    setStoredTheme(id);
    setTheme(id);
  };

  return (
    <>
      <Head><title>設定 - からだノート</title></Head>
      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-1">設定</h1>
          <p className="text-[var(--text-tertiary)] text-sm mb-6">テーマとAI評価用のシステムプロンプトを編集できます。</p>

          <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-xl p-6 mb-6">
            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-2">色のテーマ</h2>
            <p className="text-[var(--text-tertiary)] text-xs mb-4">画面の見た目を切り替えます。</p>
            {themeMounted && (
              <div className="flex flex-wrap gap-2">
                {THEME_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleThemeChange(opt.id)}
                    className={`px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                      theme === opt.id
                        ? "bg-[var(--primary)] text-[var(--btn-primary-text)] border-[var(--primary)]"
                        : "bg-transparent border-[var(--border-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"
                    }`}
                    aria-pressed={theme === opt.id}
                    aria-label={`テーマ: ${opt.label}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-xl p-6">
            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-2">AI プロンプト</h2>
            <p className="text-[var(--text-tertiary)] text-xs mb-4">空のまま保存するとデフォルトが使われます。</p>
            {promptLoading ? (
              <div className="h-48 bg-[var(--bg-input)] rounded-lg animate-pulse flex items-center justify-center text-[var(--text-tertiary)] text-sm">読み込み中...</div>
            ) : (
              <textarea
                value={promptDraft}
                onChange={(e) => setPromptDraft(e.target.value)}
                placeholder="システムプロンプト（空ならデフォルト）"
                className="w-full min-h-[200px] p-3 rounded-lg text-sm border border-[var(--border-card)] bg-[var(--bg-input)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)]"
                spellCheck={false}
              />
            )}
            {savedMessage && <p className="mt-2 text-sm text-[var(--primary)]" role="status">{savedMessage}</p>}
            <div className="flex flex-wrap gap-2 mt-4">
              <button type="button" onClick={handleSave} disabled={promptLoading} className="px-4 py-2 bg-[var(--primary)] text-[var(--btn-primary-text)] text-sm font-bold rounded-lg hover:bg-[var(--primary-hover)] disabled:opacity-50">保存</button>
              <button type="button" onClick={handleResetDefault} disabled={promptLoading} className="px-4 py-2 text-sm font-medium rounded-lg border border-[var(--border-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] disabled:opacity-50">デフォルトに戻す</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
