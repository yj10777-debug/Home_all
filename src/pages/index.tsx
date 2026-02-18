import { useState, useEffect, useCallback } from "react";
import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";
import { formatDistanceToNow } from "date-fns";
import { ja } from "date-fns/locale";
import { getEffectiveTodayStr } from "../lib/dateUtils";

// 日付表示でハイドレーション不整合を防ぐため、カレンダーはクライアントのみでレンダー
const MonthCalendar = dynamic(() => import("../components/MonthCalendar"), {
    ssr: false,
    loading: () => <div className="h-[600px] w-full bg-gray-100 animate-pulse rounded-xl" />,
});

const GOAL_CALORIES = 2267;
const GOAL_PFC = { protein: 150, fat: 54, carbs: 293 };

type PfcData = { protein: number; fat: number; carbs: number };
type PfcTarget = { key: keyof PfcData; label: string; name: string; color: string; bgColor: string };

const PFC_TARGETS: PfcTarget[] = [
    { key: "protein", label: "P", name: "たんぱく質", color: "#F59E0B", bgColor: "bg-amber-500" },
    { key: "fat", label: "F", name: "脂質", color: "#EF4444", bgColor: "bg-red-500" },
    { key: "carbs", label: "C", name: "炭水化物", color: "#3B82F6", bgColor: "bg-blue-500" },
];

/** localStorage に保存する AI システムプロンプトのキー */
const AI_PROMPT_STORAGE_KEY = "nutrition-ai-system-prompt";

export default function Home() {
    const [todayCalories, setTodayCalories] = useState(0);
    const [todayPfc, setTodayPfc] = useState<PfcData>({ protein: 0, fat: 0, carbs: 0 });
    const [hasPfcData, setHasPfcData] = useState(false);
    const [todaySteps, setTodaySteps] = useState<number | null>(null);
    const [todayExerciseCal, setTodayExerciseCal] = useState<number | null>(null);

    const [calendarData, setCalendarData] = useState<{ date: string; score: number; hasStrong: boolean; hasEvaluation: boolean; steps: number | null; calories: number }[]>([]);

    const [latestEval, setLatestEval] = useState<{ date: string; response: string; model: string } | null>(null);
    const [evaluating, setEvaluating] = useState(false);
    const [evalError, setEvalError] = useState<string | null>(null);

    const [loading, setLoading] = useState(true);
    const [mounted, setMounted] = useState(false); // ハイドレーション対策: 日付表示はクライアントのみ
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<{ askenCount: number; strongCount: number; errors: string[] } | null>(null);
    const [syncStatus, setSyncStatus] = useState<{ schedule: string; lastSync: { timestamp: string; askenCount: number; strongCount: number } | null } | null>(null);

    /** AIプロンプト設定モーダル */
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [promptDraft, setPromptDraft] = useState("");
    const [promptLoading, setPromptLoading] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    /** 設定モーダルを開いたときにプロンプトを読み込む */
    useEffect(() => {
        if (!settingsOpen || !mounted) return;
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
    }, [settingsOpen, mounted]);

    const fetchData = useCallback(async () => {
        try {
            const todayStr = getEffectiveTodayStr();

            const [resDay, resDays, resEval, resSync] = await Promise.all([
                fetch(`/api/day/${todayStr}`),
                fetch('/api/days'),
                fetch('/api/ai/history?limit=1'),
                fetch('/api/sync/status'),
            ]);

            if (resDay.ok) {
                const data = await resDay.json();
                const cal = typeof data.calories === "number" ? data.calories : 0;
                setTodayCalories(cal);
                const pfc = data.pfc && typeof data.pfc === "object"
                    ? {
                        protein: typeof data.pfc.protein === "number" ? data.pfc.protein : 0,
                        fat: typeof data.pfc.fat === "number" ? data.pfc.fat : 0,
                        carbs: typeof data.pfc.carbs === "number" ? data.pfc.carbs : 0,
                    }
                    : { protein: 0, fat: 0, carbs: 0 };
                setTodayPfc(pfc);
                setHasPfcData(!!(data.pfc && (data.pfc.protein > 0 || data.pfc.fat > 0 || data.pfc.carbs > 0)));
                setTodaySteps(data.steps ?? null);
                setTodayExerciseCal(data.exerciseCalories ?? null);
            }

            if (resDays.ok) {
                const data = await resDays.json();
                setCalendarData(Array.isArray(data.days) ? data.days : []);
            }

            if (resEval.ok) {
                const data = await resEval.json();
                const ev = data.evaluations?.[0];
                if (ev) setLatestEval({ date: ev.date, response: ev.response, model: ev.model });
            }

            if (resSync.ok) {
                const data = await resSync.json();
                setSyncStatus(data);
            }

        } catch (error) {
            console.error("Failed to fetch data", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleAskenSync = async () => {
        setSyncing(true);
        setSyncResult(null);
        try {
            const res = await fetch("/api/sync", { method: "POST" });
            const data = await res.json();
            const errors = data.errors || [];
            if (!res.ok && data.error) errors.push(data.error);
            setSyncResult({
                askenCount: data.askenCount ?? 0,
                strongCount: data.strongCount ?? 0,
                errors,
            });
            await fetchData();
        } catch (e) {
            console.error(e);
            setSyncResult({ askenCount: 0, strongCount: 0, errors: ["通信エラー"] });
        } finally {
            setSyncing(false);
        }
    };

    const handleEvaluate = async () => {
        setEvaluating(true);
        setEvalError(null);
        try {
            const systemPrompt = typeof window !== "undefined" ? window.localStorage.getItem(AI_PROMPT_STORAGE_KEY) : null;
            const body: { type: "daily"; trigger: "manual"; systemPrompt?: string } = { type: "daily", trigger: "manual" };
            if (systemPrompt != null && systemPrompt.trim() !== "") body.systemPrompt = systemPrompt;
            const res = await fetch("/api/ai/evaluate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Evaluation failed");
            // 最新評価を更新（APIは { success, evaluation } を返す）
            if (data.success && data.evaluation) {
                const ev = data.evaluation;
                setLatestEval({ date: ev.date, response: ev.response, model: ev.model });
            }
        } catch (e) {
            setEvalError(e instanceof Error ? e.message : "不明なエラー");
        } finally {
            setEvaluating(false);
        }
    };

    const isOverGoal = todayCalories > GOAL_CALORIES * 1.1; // 10%許容
    const remaining = Math.max(0, GOAL_CALORIES - todayCalories);

    // スケジュールフォーマット
    const formatSchedule = (cron: string) => {
        if (cron === "0 5,12,19 * * *") return "毎日 5時/12時/19時";
        return cron;
    };

    // 相対時間表示（不正日付・ハイドレーション対策）
    const formatRelativeTime = (timestamp: string): string => {
        if (!mounted) return ""; // 初回レンダーでは空（SSR/ハイドレーション時の不一致を防ぐ）
        try {
            const d = new Date(timestamp);
            if (isNaN(d.getTime())) return "";
            return formatDistanceToNow(d, { addSuffix: true, locale: ja });
        } catch {
            return "";
        }
    };

    return (
        <div className="min-h-screen pb-20" style={{ backgroundColor: "var(--bg-page)" }}>
            <Head>
                <title>Nutrition Dashboard</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
            </Head>

            <header className="bg-[var(--bg-card)] sticky top-0 z-10 safe-area-top" style={{ boxShadow: "var(--shadow-card)" }}>
                <div className="max-w-4xl mx-auto px-4 min-h-[4rem] py-3 flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-bold tracking-tight" style={{ color: "var(--accent)" }}>
                            Nutrition
                        </h1>
                        <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{getEffectiveTodayStr()}</p>
                    </div>
                    <nav className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setSettingsOpen(true)}
                            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-[var(--radius-button)] border border-[var(--border-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-tertiary)] transition-colors"
                            aria-label="AIプロンプト設定"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        </button>
                        <Link href="/days" className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors py-2.5 px-4 rounded-[var(--radius-button)] min-h-[44px] inline-flex items-center border border-[var(--border-card)] hover:border-[var(--text-tertiary)]">
                            履歴
                        </Link>
                    </nav>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 py-6 space-y-8">
                {/* セクション見出し用スタイル: ラベル + 余白 */}
                <section className="space-y-4" aria-label="今日のサマリー">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        <h2 className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider px-1 lg:col-span-4">
                            今日のサマリー
                        </h2>
                        <h2 className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider px-1 lg:col-span-8 lg:col-start-5">
                            AI評価
                        </h2>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* 左: カロリー・PFC・歩数 */}
                    <div className="lg:col-span-4 space-y-4">
                        {/* カロリー */}
                        <div className="bg-[var(--bg-card)] rounded-[var(--radius-card)] p-5 relative overflow-hidden" style={{ boxShadow: "var(--shadow-card)", border: "1px solid var(--border-card)" }}>
                            <div className="flex items-start gap-4">
                                <div className="relative w-20 h-20 flex-shrink-0">
                                    <svg className="w-full h-full transform -rotate-90" aria-hidden>
                                        <circle cx="40" cy="40" r="36" stroke="var(--border-card)" strokeWidth="8" fill="none" />
                                        <circle
                                            cx="40" cy="40" r="36"
                                            stroke={isOverGoal ? "#dc2626" : "#059669"}
                                            strokeWidth="8" fill="none"
                                            strokeLinecap="round"
                                            strokeDasharray={226}
                                            strokeDashoffset={226 - Math.min(226, (todayCalories / GOAL_CALORIES) * 226)}
                                            className="transition-all duration-1000 ease-out"
                                        />
                                    </svg>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                        <span className="text-[10px] text-[var(--text-tertiary)]">Total</span>
                                        <span className="text-base font-bold text-[var(--text-primary)]">{todayCalories}</span>
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-2">
                                        <h2 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">今日のカロリー</h2>
                                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${isOverGoal ? "bg-red-50 text-red-600" : remaining < 300 ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"}`}>
                                            {isOverGoal ? `${todayCalories - GOAL_CALORIES} 超過` : `残り ${remaining}`}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 text-center">
                                        <div className="bg-[var(--bg-page)] rounded-lg py-2">
                                            <p className="text-[10px] text-[var(--text-tertiary)]">目標</p>
                                            <p className="text-sm font-semibold text-[var(--text-primary)]">{GOAL_CALORIES.toLocaleString()}</p>
                                        </div>
                                        <div className="bg-[var(--bg-page)] rounded-lg py-2">
                                            <p className="text-[10px] text-[var(--text-tertiary)]">摂取</p>
                                            <p className="text-sm font-semibold text-[var(--text-primary)]">{todayCalories.toLocaleString()}</p>
                                        </div>
                                        <div className="bg-[var(--bg-page)] rounded-lg py-2">
                                            <p className="text-[10px] text-[var(--text-tertiary)]">残り</p>
                                            <p className={`text-sm font-semibold ${isOverGoal ? "text-red-600" : "text-emerald-600"}`}>
                                                {isOverGoal ? `-${(todayCalories - GOAL_CALORIES).toLocaleString()}` : remaining.toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* PFC */}
                        <div className="bg-[var(--bg-card)] rounded-[var(--radius-card)] p-5" style={{ boxShadow: "var(--shadow-card)", border: "1px solid var(--border-card)" }}>
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">PFCバランス</h2>
                                {!hasPfcData && <span className="text-xs text-[var(--text-tertiary)]">未取得</span>}
                            </div>
                            <div className="space-y-4">
                                {PFC_TARGETS.map((t) => {
                                    const actual = todayPfc[t.key];
                                    const goal = GOAL_PFC[t.key];
                                    const pct = hasPfcData && goal > 0 ? Math.min(100, (actual / goal) * 100) : 0;
                                    return (
                                        <div key={t.key}>
                                            <div className="flex items-center justify-between mb-1.5">
                                                <div className="flex items-center gap-2">
                                                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md text-white text-xs font-bold ${t.bgColor}`}>{t.label}</span>
                                                    <span className="text-sm text-[var(--text-secondary)]">{t.name}</span>
                                                </div>
                                                <span className="text-sm text-[var(--text-primary)]">{hasPfcData ? Math.round(actual) : "--"}<span className="text-[var(--text-tertiary)]">/{goal}g</span></span>
                                            </div>
                                            <div className="h-2 bg-[var(--bg-page)] rounded-full overflow-hidden">
                                                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: t.color }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 歩数 */}
                        {todaySteps != null && (
                            <div className="bg-[var(--bg-card)] rounded-[var(--radius-card)] p-5" style={{ boxShadow: "var(--shadow-card)", border: "1px solid var(--border-card)" }}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <span className="text-2xl" aria-hidden>🚶</span>
                                        <div>
                                            <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider">歩数</p>
                                            <p className="text-lg font-bold text-[var(--text-primary)]">{todaySteps.toLocaleString()} <span className="text-sm font-normal text-[var(--text-tertiary)]">歩</span></p>
                                        </div>
                                    </div>
                                    {todayExerciseCal != null && todayExerciseCal > 0 && (
                                        <div className="text-right">
                                            <p className="text-[10px] text-[var(--text-tertiary)]">消費</p>
                                            <p className="text-sm font-semibold" style={{ color: "var(--accent)" }}>{todayExerciseCal} kcal</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* 今すぐ取得（歩数の下にまとめ） */}
                        <div className="bg-[var(--bg-card)] rounded-[var(--radius-card)] p-4 flex flex-col" style={{ boxShadow: "var(--shadow-card)", border: "1px solid var(--border-card)" }}>
                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "var(--accent-muted)" }}>
                                    <svg className="w-4 h-4" style={{ color: "var(--accent)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                </div>
                                <h3 className="text-sm font-semibold text-[var(--text-primary)]">あすけん同期</h3>
                            </div>
                            <button
                                onClick={handleAskenSync}
                                disabled={syncing}
                                className="w-full min-h-[44px] py-2.5 text-white text-sm font-semibold rounded-[var(--radius-button)] disabled:opacity-50 transition-all active:scale-[0.98] flex items-center justify-center gap-2 hover:opacity-90"
                                style={{ backgroundColor: "var(--accent)" }}
                            >
                                {syncing ? <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> : null}
                                {syncing ? "取得中..." : "今すぐ取得"}
                            </button>
                            {syncResult && (
                                <div className="mt-2 rounded-lg p-2 text-xs flex items-start gap-2 border-l-4" style={{ backgroundColor: "var(--bg-page)", borderLeftColor: syncResult.errors.length > 0 ? "#d97706" : "#059669" }} role="status">
                                    <span aria-hidden>{syncResult.errors.length > 0 ? "⚠️" : "✓"}</span>
                                    <div>
                                        <p className="text-[var(--text-primary)] font-medium">あすけん {syncResult.askenCount}日 / Strong {syncResult.strongCount}日</p>
                                        {syncResult.errors.length > 0 && <p className="mt-0.5 text-amber-600 text-[10px]">{syncResult.errors.slice(0, 2).join(" / ")}</p>}
                                    </div>
                                </div>
                            )}
                            {syncStatus && (
                                <div className="mt-2 pt-2 border-t" style={{ borderColor: "var(--border-card)" }}>
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                                            <span className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />自動
                                        </span>
                                        <span className="text-[10px] text-[var(--text-tertiary)]">{formatSchedule(syncStatus.schedule)}</span>
                                    </div>
                                    {syncStatus.lastSync && (
                                        <p className="text-[10px] text-[var(--text-secondary)]" suppressHydrationWarning>
                                            最終: {formatRelativeTime(syncStatus.lastSync.timestamp)}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 右: AI評価 + カレンダー（同じ幅 8 列・AI評価を上に配置） */}
                    <div className="lg:col-span-8 space-y-2">
                        {/* AI評価（カレンダーと同じ幅） */}
                        <div aria-label="AI評価">
                            <div className="bg-[var(--bg-card)] rounded-[var(--radius-card)] p-4" style={{ boxShadow: "var(--shadow-card)", border: "1px solid var(--border-card)" }}>
                                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                                    <div className="flex items-center gap-3 flex-shrink-0">
                                        <div className="w-10 h-10 rounded-[var(--radius-button)] flex items-center justify-center" style={{ backgroundColor: "var(--accent-muted)" }}>
                                            <svg className="w-5 h-5" style={{ color: "var(--accent)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                                        </div>
                                        <div>
                                            <h3 className="text-base font-semibold text-[var(--text-primary)]">AI 食事評価</h3>
                                            <p className="text-xs text-[var(--text-tertiary)]">毎朝5時自動 or 手動実行</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleEvaluate}
                                        disabled={evaluating}
                                        className="min-h-[44px] px-4 py-2 text-white text-sm font-semibold rounded-[var(--radius-button)] disabled:opacity-50 transition-all active:scale-[0.98] flex items-center justify-center gap-2 hover:opacity-90 flex-shrink-0"
                                        style={{ backgroundColor: "var(--accent)" }}
                                    >
                                        {evaluating ? <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> : null}
                                        {evaluating ? "評価中..." : "今日を評価"}
                                    </button>
                                </div>
                                {evalError && (
                                    <div className="mt-3 rounded-lg p-2.5 text-sm text-red-600 border border-red-200 bg-red-50/50" role="alert">{evalError}</div>
                                )}
                                {latestEval ? (
                                    <div className="mt-3 rounded-lg p-3 border border-[var(--border-card)]" style={{ backgroundColor: "var(--bg-page)" }}>
                                        <div className="flex items-center justify-between mb-1.5 text-xs text-[var(--text-tertiary)]">
                                            <span>{latestEval.date}</span>
                                            <span>{latestEval.model}</span>
                                        </div>
                                        <div className="text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap max-h-28 overflow-y-auto">
                                            {latestEval.response}
                                        </div>
                                    </div>
                                ) : (
                                    <p className="mt-2 text-sm text-[var(--text-tertiary)]">まだ評価がありません。「今日を評価」を押すか、毎朝5時に前日分が自動生成されます。</p>
                                )}
                            </div>
                        </div>

                        {/* カレンダー（縦を少し小さく） */}
                        <div aria-label="カレンダー">
                            <div className="bg-[var(--bg-card)] rounded-[var(--radius-card)] p-4" style={{ boxShadow: "var(--shadow-card)", border: "1px solid var(--border-card)" }}>
                                {loading ? (
                                    <div className="h-[360px] w-full rounded-xl animate-pulse grid grid-cols-7 gap-1.5" style={{ backgroundColor: "var(--bg-page)" }}>
                                        {[...Array(35)].map((_, i) => (
                                            <div key={i} className="rounded-xl opacity-50" style={{ backgroundColor: "var(--border-card)", minHeight: 52 }} />
                                        ))}
                                    </div>
                                ) : (
                                    <MonthCalendar days={calendarData} compact />
                                )}
                            </div>
                        </div>
                    </div>
                    </div>
                </section>
            </main>

            {/* AIプロンプト設定モーダル */}
            {settingsOpen && (
                <div
                    className="fixed inset-0 z-20 flex items-center justify-center p-4"
                    style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
                    onClick={() => setSettingsOpen(false)}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="settings-modal-title"
                >
                    <div
                        className="bg-[var(--bg-card)] rounded-[var(--radius-card)] w-full max-w-2xl max-h-[90vh] flex flex-col border border-[var(--border-card)]"
                        style={{ boxShadow: "var(--shadow-card)" }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: "var(--border-card)" }}>
                            <h2 id="settings-modal-title" className="text-lg font-semibold text-[var(--text-primary)]">AI プロンプト設定</h2>
                            <button
                                type="button"
                                onClick={() => setSettingsOpen(false)}
                                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--bg-page)]"
                                aria-label="閉じる"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <div className="p-4 flex-1 min-h-0 flex flex-col gap-3">
                            <p className="text-sm text-[var(--text-secondary)]">AI評価で使うシステムプロンプトを編集できます。空のまま保存するとデフォルトが使われます。</p>
                            {promptLoading ? (
                                <div className="flex-1 min-h-[200px] rounded-lg animate-pulse flex items-center justify-center" style={{ backgroundColor: "var(--bg-page)" }}>
                                    <span className="text-sm text-[var(--text-tertiary)]">読み込み中...</span>
                                </div>
                            ) : (
                                <textarea
                                    value={promptDraft}
                                    onChange={(e) => setPromptDraft(e.target.value)}
                                    placeholder="システムプロンプト（空ならデフォルトを使用）"
                                    className="w-full flex-1 min-h-[240px] p-3 rounded-lg text-sm resize-y border"
                                    style={{ backgroundColor: "var(--bg-page)", borderColor: "var(--border-card)", color: "var(--text-primary)" }}
                                    spellCheck={false}
                                />
                            )}
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        const v = promptDraft.trim();
                                        if (v !== "") window.localStorage.setItem(AI_PROMPT_STORAGE_KEY, v);
                                        else window.localStorage.removeItem(AI_PROMPT_STORAGE_KEY);
                                        setSettingsOpen(false);
                                    }}
                                    className="min-h-[44px] px-4 py-2 text-white text-sm font-semibold rounded-[var(--radius-button)] hover:opacity-90"
                                    style={{ backgroundColor: "var(--accent)" }}
                                >
                                    保存して閉じる
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setPromptLoading(true);
                                        fetch("/api/ai/gem-prompt")
                                            .then((r) => r.json())
                                            .then((data) => { if (data?.systemPrompt) setPromptDraft(data.systemPrompt); })
                                            .catch(() => {})
                                            .finally(() => setPromptLoading(false));
                                    }}
                                    className="min-h-[44px] px-4 py-2 text-sm font-medium rounded-[var(--radius-button)] border"
                                    style={{ borderColor: "var(--border-card)", color: "var(--text-secondary)" }}
                                >
                                    デフォルトに戻す
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSettingsOpen(false)}
                                    className="min-h-[44px] px-4 py-2 text-sm font-medium rounded-[var(--radius-button)] border"
                                    style={{ borderColor: "var(--border-card)", color: "var(--text-tertiary)" }}
                                >
                                    キャンセル
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
