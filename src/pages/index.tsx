import { useState, useEffect, useCallback } from "react";
import Head from "next/head";
import { formatDistanceToNow } from "date-fns";
import { ja } from "date-fns/locale";
import { getEffectiveTodayStr } from "../lib/dateUtils";

const GOAL_CALORIES = 2267;
const GOAL_PFC = { protein: 150, fat: 54, carbs: 293 };

type PfcData = { protein: number; fat: number; carbs: number };
type PfcTarget = { key: keyof PfcData; label: string; name: string; color: string; bgColor: string };

const PFC_TARGETS: PfcTarget[] = [
    { key: "protein", label: "P", name: "たんぱく質", color: "#F59E0B", bgColor: "bg-amber-500" },
    { key: "fat", label: "F", name: "脂質", color: "#EF4444", bgColor: "bg-red-500" },
    { key: "carbs", label: "C", name: "炭水化物", color: "#3B82F6", bgColor: "bg-blue-500" },
];

import { getStoredSystemPrompt } from "../lib/aiPromptStorage";

export default function Home() {
    const [todayCalories, setTodayCalories] = useState(0);
    const [todayPfc, setTodayPfc] = useState<PfcData>({ protein: 0, fat: 0, carbs: 0 });
    const [hasPfcData, setHasPfcData] = useState(false);
    const [todaySteps, setTodaySteps] = useState<number | null>(null);
    const [todayExerciseCal, setTodayExerciseCal] = useState<number | null>(null);

    const [latestEval, setLatestEval] = useState<{ date: string; response: string; model: string } | null>(null);
    const [evaluating, setEvaluating] = useState(false);
    const [evalError, setEvalError] = useState<string | null>(null);

    const [loading, setLoading] = useState(true);
    const [mounted, setMounted] = useState(false); // ハイドレーション対策: 日付表示はクライアントのみ
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<{ askenCount: number; strongCount: number; errors: string[] } | null>(null);
    const [syncStatus, setSyncStatus] = useState<{ schedule: string; lastSync: { timestamp: string; askenCount: number; strongCount: number } | null } | null>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    /** キャッシュを使わず常に最新を取得するための fetch オプション */
    const noCache = { cache: "no-store" as RequestCache };

    const fetchData = useCallback(async () => {
        try {
            const todayStr = getEffectiveTodayStr();

            const [resDay, resEval, resSync] = await Promise.all([
                fetch(`/api/day/${todayStr}`, noCache),
                fetch("/api/ai/history?limit=1", noCache),
                fetch("/api/sync/status", noCache),
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

    /** タブに戻ったとき・再表示時に再取得して内容を最新にする */
    useEffect(() => {
        if (!mounted) return;
        const onVisibility = () => {
            if (document.visibilityState === "visible") fetchData();
        };
        document.addEventListener("visibilitychange", onVisibility);
        return () => document.removeEventListener("visibilitychange", onVisibility);
    }, [mounted, fetchData]);

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
            const systemPrompt = getStoredSystemPrompt();
            const body: { type: "daily"; trigger: "manual"; systemPrompt?: string } = { type: "daily", trigger: "manual" };
            if (systemPrompt) body.systemPrompt = systemPrompt;
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
        <div className="min-h-screen pb-20 bg-[var(--bg-page)]">
            <Head>
                <title>今日のサマリー - からだノート</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
            </Head>

            {/* 左タブは AppLayout で表示。ここでは日付のみ */}
            <header className="bg-[var(--bg-page)] border-b border-[var(--border-card)] sticky top-0 z-10 safe-area-top">
                <div className="px-4 md:px-6 lg:px-8 min-h-[3.5rem] py-3 flex items-center">
                    <h1 className="font-display text-lg font-bold text-[var(--text-primary)]">今日のサマリー</h1>
                    <span className="ml-3 text-[var(--text-tertiary)] text-sm">{getEffectiveTodayStr()}</span>
                </div>
            </header>

            <main className="w-full px-4 md:px-6 lg:px-8 py-6 space-y-6">
                {/* 今日のサマリー：横並び4カード */}
                <section aria-label="今日のサマリー">
                    <h2 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-4 px-1">今日のサマリー</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* カロリー */}
                        <div className="bg-[var(--bg-card)] rounded-xl p-4 border border-[var(--border-card)] flex items-center gap-3">
                            <div className="relative w-14 h-14 flex-shrink-0">
                                <svg className="w-full h-full transform -rotate-90" aria-hidden>
                                    <circle cx="28" cy="28" r="24" stroke="var(--bg-card)" strokeWidth="6" fill="none" />
                                    <circle
                                        cx="28" cy="28" r="24"
                                        stroke={isOverGoal ? "#dc2626" : "#059669"}
                                        strokeWidth="6" fill="none" strokeLinecap="round"
                                        strokeDasharray={151}
                                        strokeDashoffset={151 - Math.min(151, (todayCalories / GOAL_CALORIES) * 151)}
                                        className="transition-all duration-1000 ease-out"
                                    />
                                </svg>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="text-[9px] text-[var(--text-tertiary)] font-bold">Total</span>
                                    <span className="text-sm font-black text-[var(--text-primary)] leading-tight">{todayCalories}</span>
                                </div>
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider">今日のカロリー</p>
                                <p className="text-lg font-black text-[var(--text-primary)]">{todayCalories} <span className="text-[var(--text-tertiary)] font-normal text-sm">/ {GOAL_CALORIES}</span></p>
                                <p className={`text-xs font-medium mt-0.5 ${isOverGoal ? "text-red-400" : "text-[var(--primary)]"}`}>
                                    {isOverGoal ? `${todayCalories - GOAL_CALORIES} 超過` : `残り ${remaining} kcal`}
                                </p>
                            </div>
                        </div>

                        {/* PFC */}
                        <div className="bg-[var(--bg-card)] rounded-xl p-4 border border-[var(--border-card)]">
                            <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-3">PFCバランス</p>
                            <div className="space-y-2">
                                {PFC_TARGETS.map((t) => {
                                    const actual = todayPfc[t.key];
                                    const goal = GOAL_PFC[t.key];
                                    const pct = hasPfcData && goal > 0 ? Math.min(100, (actual / goal) * 100) : 0;
                                    return (
                                        <div key={t.key} className="flex items-center gap-2">
                                            <span className={`w-5 h-5 rounded flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 ${t.bgColor}`}>{t.label}</span>
                                            <div className="flex-1 h-1.5 bg-black/40 rounded-full overflow-hidden">
                                                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: t.color }} />
                                            </div>
                                            <span className="text-xs font-bold text-[var(--text-primary)] w-12 text-right tabular-nums">{hasPfcData ? Math.round(actual) : "--"}/{goal}</span>
                                        </div>
                                    );
                                })}
                            </div>
                            {!hasPfcData && <p className="text-[10px] text-[var(--text-tertiary)] mt-1">未取得</p>}
                        </div>

                        {/* 歩数 */}
                        <div className="bg-[var(--bg-card)] rounded-xl p-4 border border-[var(--border-card)]">
                            <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-1">歩数</p>
                            {todaySteps != null ? (
                                <>
                                    <p className="text-xl font-black text-[var(--text-primary)]">{todaySteps.toLocaleString()} <span className="text-sm font-medium text-[var(--text-tertiary)]">歩</span></p>
                                    {todayExerciseCal != null && todayExerciseCal > 0 && (
                                        <p className="text-xs text-[var(--primary)] font-medium mt-0.5">消費 {todayExerciseCal} kcal</p>
                                    )}
                                </>
                            ) : (
                                <p className="text-[var(--text-tertiary)] text-sm">—</p>
                            )}
                        </div>

                        {/* あすけん同期 */}
                        <div className="bg-[var(--bg-card)] rounded-xl p-4 border border-[var(--border-card)] flex flex-col">
                            <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">あすけん同期</p>
                            <button
                                onClick={handleAskenSync}
                                disabled={syncing}
                                className="min-h-[40px] py-2 bg-[var(--primary)] text-[var(--btn-primary-text)] text-sm font-bold rounded-lg disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-[var(--primary-hover)]"
                            >
                                {syncing ? <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> : null}
                                {syncing ? "取得中..." : "今すぐ取得"}
                            </button>
                            {syncStatus?.lastSync && (
                                <p className="text-[10px] text-[var(--text-tertiary)] mt-2" suppressHydrationWarning>最終: {formatRelativeTime(syncStatus.lastSync.timestamp)}</p>
                            )}
                            {syncResult && (
                                <p className={`text-[10px] mt-1 ${syncResult.errors.length > 0 ? "text-amber-400" : "text-[var(--primary)]"}`}>
                                    {syncResult.errors.length > 0 ? "エラーあり" : `あすけん ${syncResult.askenCount}日 / Strong ${syncResult.strongCount}日`}
                                </p>
                            )}
                        </div>
                    </div>
                </section>

                {/* AIアシスタント：横幅広め・表示領域を広く */}
                <section aria-label="AIアシスタントの分析">
                    <h2 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-4 px-1">AIアシスタントの分析</h2>
                    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-card)] overflow-hidden">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border-b border-[var(--border-card)]">
                            <div className="flex items-center gap-3">
                                <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-[var(--accent-muted)]">
                                    <span className="material-symbols-outlined text-[var(--primary)] text-2xl">psychology</span>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-[var(--text-primary)]">AI 食事評価</h3>
                                    <p className="text-xs text-[var(--text-tertiary)]">毎朝5時自動 or 手動実行</p>
                                </div>
                            </div>
                            <button
                                onClick={handleEvaluate}
                                disabled={evaluating}
                                className="min-h-[44px] px-5 py-2.5 bg-[var(--primary)] text-[var(--btn-primary-text)] text-sm font-bold rounded-lg disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-[var(--primary-hover)]"
                            >
                                {evaluating ? <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> : null}
                                {evaluating ? "評価中..." : "今日を評価"}
                            </button>
                        </div>
                        {evalError && (
                            <div className="mx-4 mt-2 rounded-lg p-2.5 text-sm text-red-400 border border-red-900/50 bg-red-900/20" role="alert">{evalError}</div>
                        )}
                        {latestEval ? (
                            <div className="border-t border-[var(--border-card)]">
                                <div className="flex items-center justify-between px-4 py-2 bg-[var(--bg-page)]/80 text-xs text-[var(--text-tertiary)]">
                                    <span>{latestEval.date}</span>
                                    <span>{latestEval.model}</span>
                                </div>
                                <pre
                                    className="p-5 md:p-8 text-xs md:text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap font-sans overflow-x-auto select-all cursor-text min-h-[280px] max-h-[70vh] overflow-y-auto"
                                    role="textbox"
                                    tabIndex={0}
                                    aria-label="AI評価本文（一括選択してコピーできます）"
                                >
                                    {latestEval.response}
                                </pre>
                            </div>
                        ) : (
                            <div className="p-8 text-center">
                                <p className="text-[var(--text-tertiary)]">まだ評価がありません。「今日を評価」を押すか、毎朝5時に前日分が自動生成されます。</p>
                            </div>
                        )}
                    </div>
                </section>
            </main>

        </div>
    );
}
