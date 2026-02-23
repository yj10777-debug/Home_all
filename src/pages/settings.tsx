import { useState, useEffect } from "react";
import Head from "next/head";
import { AI_PROMPT_STORAGE_KEY } from "../lib/aiPromptStorage";

export default function SettingsPage() {
  const [promptDraft, setPromptDraft] = useState("");
  const [promptLoading, setPromptLoading] = useState(true);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

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

  return (
    <>
      <Head><title>設定 - Nutrition</title></Head>
      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-bold text-white mb-1">設定</h1>
          <p className="text-slate-400 text-sm mb-6">AI評価用のシステムプロンプトを編集できます。</p>
          <div className="bg-[#1a331a] border border-[#244724] rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-2">AI プロンプト</h2>
            <p className="text-slate-400 text-xs mb-4">空のまま保存するとデフォルトが使われます。</p>
            {promptLoading ? (
              <div className="h-48 bg-[#112211] rounded-lg animate-pulse flex items-center justify-center text-slate-500 text-sm">読み込み中...</div>
            ) : (
              <textarea
                value={promptDraft}
                onChange={(e) => setPromptDraft(e.target.value)}
                placeholder="システムプロンプト（空ならデフォルト）"
                className="w-full min-h-[200px] p-3 rounded-lg text-sm border border-[#244724] bg-[#112211] text-white placeholder-slate-500"
                spellCheck={false}
              />
            )}
            {savedMessage && <p className="mt-2 text-sm text-[#19e619]" role="status">{savedMessage}</p>}
            <div className="flex flex-wrap gap-2 mt-4">
              <button type="button" onClick={handleSave} disabled={promptLoading} className="px-4 py-2 bg-[#19e619] text-[#112211] text-sm font-bold rounded-lg hover:bg-[#15c515] disabled:opacity-50">保存</button>
              <button type="button" onClick={handleResetDefault} disabled={promptLoading} className="px-4 py-2 text-sm font-medium rounded-lg border border-[#244724] text-slate-300 hover:bg-white/5 disabled:opacity-50">デフォルトに戻す</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
