import { useState, useEffect } from "react";
import Head from "next/head";
import { getStoredTheme, setStoredTheme, type ThemeId } from "../lib/themeStorage";

const THEME_OPTIONS: { id: ThemeId; label: string; description: string }[] = [
  { id: "default", label: "デフォルト（緑）", description: "アプリの標準テーマ" },
  { id: "light", label: "白", description: "明るい背景" },
  { id: "dark", label: "黒", description: "ダークモード" },
  { id: "pink", label: "ピンク", description: "女性に使いやすいローズ系" },
  { id: "ocean", label: "オーシャンブルー", description: "落ち着いた青系・信頼感" },
];

type ScrapingLogEntry = {
  id: string;
  date: string;
  source: string;
  status: string;
  message: string | null;
  details: string | null;
  createdAt: string;
};

export default function SettingsPage() {
  const [promptDraft, setPromptDraft] = useState("");
  const [promptLoading, setPromptLoading] = useState(true);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeId>("default");
  const [themeMounted, setThemeMounted] = useState(false);
  const [scrapingLogs, setScrapingLogs] = useState<ScrapingLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  useEffect(() => {
    setThemeMounted(true);
    setTheme(getStoredTheme());
  }, []);

  useEffect(() => {
    setPromptLoading(true);
    fetch("/api/ai/gem-prompt")
      .then((r) => r.json())
      .then((data) => {
        if (data?.systemPrompt) setPromptDraft(data.systemPrompt);
        else setPromptDraft("");
      })
      .catch(() => {})
      .finally(() => setPromptLoading(false));
  }, []);

  const handleSave = () => {
    const v = promptDraft.trim();
    setSavedMessage("保存中...");
    fetch("/api/settings/system-prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systemPrompt: v !== "" ? v : null }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data?.success) {
          setSavedMessage("保存しました。手動評価・自動評価（cron）の両方に反映されます。");
        } else {
          setSavedMessage(data?.error || "保存に失敗しました");
        }
      })
      .catch(() => setSavedMessage("保存に失敗しました"))
      .finally(() => {
        setTimeout(() => setSavedMessage(null), 4000);
      });
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

  const loadLogs = () => {
    setLogsLoading(true);
    fetch("/api/sync/logs?limit=50")
      .then((r) => r.json())
      .then((data) => setScrapingLogs(data.logs ?? []))
      .catch(() => {})
      .finally(() => setLogsLoading(false));
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

          {/* スクレイピングログ */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-xl p-6 mb-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">スクレイピングログ</h2>
              <button
                type="button"
                onClick={loadLogs}
                disabled={logsLoading}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] disabled:opacity-50"
              >
                {logsLoading ? "読み込み中..." : "ログを表示"}
              </button>
            </div>
            <p className="text-[var(--text-tertiary)] text-xs mb-4">あすけんのデータ取得履歴とエラーを確認できます。</p>
            {scrapingLogs.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--border-card)] text-[var(--text-tertiary)]">
                      <th className="text-left py-1.5 pr-3 font-medium">日付</th>
                      <th className="text-left py-1.5 pr-3 font-medium">ソース</th>
                      <th className="text-left py-1.5 pr-3 font-medium">状態</th>
                      <th className="text-left py-1.5 pr-3 font-medium">メッセージ</th>
                      <th className="text-left py-1.5 font-medium">実行時刻</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scrapingLogs.map((log) => (
                      <>
                        <tr
                          key={log.id}
                          className="border-b border-[var(--border-card)] hover:bg-[var(--bg-card-hover)] cursor-pointer"
                          onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                        >
                          <td className="py-1.5 pr-3 font-mono text-[var(--text-primary)]">{log.date}</td>
                          <td className="py-1.5 pr-3 text-[var(--text-secondary)]">{log.source}</td>
                          <td className="py-1.5 pr-3">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              log.status === "ok"
                                ? "bg-green-500/20 text-green-400"
                                : log.status === "skipped"
                                ? "bg-yellow-500/20 text-yellow-400"
                                : "bg-red-500/20 text-red-400"
                            }`}>
                              {log.status}
                            </span>
                          </td>
                          <td className="py-1.5 pr-3 text-[var(--text-secondary)] max-w-[240px] truncate">{log.message ?? "—"}</td>
                          <td className="py-1.5 text-[var(--text-tertiary)] whitespace-nowrap">{new Date(log.createdAt).toLocaleString("ja-JP")}</td>
                        </tr>
                        {expandedLog === log.id && log.details && (
                          <tr key={`${log.id}-detail`} className="bg-[var(--bg-input)]">
                            <td colSpan={5} className="py-2 px-3">
                              <pre className="text-[10px] text-[var(--text-secondary)] whitespace-pre-wrap break-all max-h-48 overflow-y-auto">{log.details}</pre>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {scrapingLogs.length === 0 && !logsLoading && (
              <p className="text-[var(--text-tertiary)] text-xs">「ログを表示」を押すと直近50件を表示します。</p>
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
