import { useState, useEffect, useCallback } from "react";
import Head from "next/head";
import Link from "next/link";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { ja } from "date-fns/locale";

import MonthCalendar from "../components/MonthCalendar";

const GOAL_CALORIES = 2267;
const GOAL_PFC = { protein: 150, fat: 54, carbs: 293 };

type PfcData = { protein: number; fat: number; carbs: number };
type PfcTarget = { key: keyof PfcData; label: string; name: string; color: string; bgColor: string };

const PFC_TARGETS: PfcTarget[] = [
    { key: "protein", label: "P", name: "たんぱく質", color: "#F59E0B", bgColor: "bg-amber-500" },
    { key: "fat", label: "F", name: "脂質", color: "#EF4444", bgColor: "bg-red-500" },
    { key: "carbs", label: "C", name: "炭水化物", color: "#3B82F6", bgColor: "bg-blue-500" },
];

export default function Home() {
    const [todayCalories, setTodayCalories] = useState(0);
    const [todayPfc, setTodayPfc] = useState<PfcData>({ protein: 0, fat: 0, carbs: 0 });
    const [hasPfcData, setHasPfcData] = useState(false);
    const [todaySteps, setTodaySteps] = useState<number | null>(null);
    const [todayExerciseCal, setTodayExerciseCal] = useState<number | null>(null);

    const [calendarData, setCalendarData] = useState<any[]>([]);

    const [latestEval, setLatestEval] = useState<{ date: string; response: string; model: string } | null>(null);
    const [evaluating, setEvaluating] = useState(false);
    const [evalError, setEvalError] = useState<string | null>(null);

    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<{ askenCount: number; strongCount: number; errors: string[] } | null>(null);
    const [syncStatus, setSyncStatus] = useState<{ schedule: string; lastSync: { timestamp: string; askenCount: number; strongCount: number } | null } | null>(null);

    const fetchData = useCallback(async () => {
        try {
            // 1. 今日のデータを確認
            const now = new Date();
            // 朝5時までは前日扱い
            if (now.getHours() < 5) now.setDate(now.getDate() - 1);
            const todayStr = format(now, "yyyy-MM-dd");

            const resDay = await fetch(`/api/day/${todayStr}`);
            if (resDay.ok) {
                const data = await resDay.json();
                setTodayCalories(data.calories);
                if (data.pfc) {
                    setTodayPfc(data.pfc);
                    setHasPfcData(true);
                } else {
                    setHasPfcData(false);
                }
                setTodaySteps(data.steps ?? null);
                setTodayExerciseCal(data.exerciseCalories ?? null);
            }

            // 2. カレンダー用データ（全日）
            const resDays = await fetch('/api/days');
            if (resDays.ok) {
                const data = await resDays.json();
                setCalendarData(Array.isArray(data.days) ? data.days : []);
            }

            // 3. 最新のAI評価
            const resEval = await fetch('/api/ai/history?limit=1');
            if (resEval.ok) {
                const data = await resEval.json();
                const ev = data.evaluations?.[0];
                if (ev) setLatestEval({ date: ev.date, response: ev.response, model: ev.model });
            }

            // 4. 同期ステータス
            const resSync = await fetch('/api/sync/status');
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
            fetchData();
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
            const res = await fetch("/api/ai/evaluate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: "daily", trigger: "manual" }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Evaluation failed");
            // 最新評価を更新（APIは { success, evaluation } を返す）
            if (data.success && data.evaluation) {
                const ev = data.evaluation;
                setLatestEval({ date: ev.date, response: ev.response, model: ev.model });
            }
        } catch (e: any) {
            setEvalError(e.message);
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

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            <Head>
                <title>Nutrition Dashboard</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
            </Head>

            <header className="bg-white border-b border-gray-200 sticky top-0 z-10 safe-area-top">
                <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
                    <h1 className="text-lg font-bold bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">
                        Nutrition
                    </h1>
                    <Link href="/days" className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors">
                        履歴
                    </Link>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">

                {/* 上段: 今日のサマリー + カレンダー */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* 今日のサマリー（左） */}
                    <div className="lg:col-span-4 space-y-4">
                        {/* カロリー */}
                        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm relative overflow-hidden">
                            <div className="flex items-start gap-4">
                                <div className="relative w-20 h-20 flex-shrink-0">
                                    <svg className="w-full h-full transform -rotate-90">
                                        <circle cx="40" cy="40" r="36" stroke="#f3f4f6" strokeWidth="8" fill="none" />
                                        <circle
                                            cx="40" cy="40" r="36"
                                            stroke={isOverGoal ? "#ef4444" : "#10b981"}
                                            strokeWidth="8" fill="none"
                                            strokeDasharray={226}
                                            strokeDashoffset={226 - Math.min(226, (todayCalories / GOAL_CALORIES) * 226)}
                                            className="transition-all duration-1000 ease-out"
                                        />
                                    </svg>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                        <span className="text-[10px] text-gray-400">Total</span>
                                        <span className="text-sm font-bold text-gray-800">{todayCalories}</span>
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">今日のカロリー</h3>
                                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${isOverGoal ? 'bg-red-50 text-red-600' : remaining < 300 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
                                            }`}>
                                            {isOverGoal ? `${todayCalories - GOAL_CALORIES} 超過` : `残り ${remaining}`}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-1.5 text-center">
                                        <div className="bg-gray-50 rounded-md py-1.5">
                                            <p className="text-[10px] text-gray-400">目標</p>
                                            <p className="text-xs font-semibold">{GOAL_CALORIES.toLocaleString()}</p>
                                        </div>
                                        <div className="bg-gray-50 rounded-md py-1.5">
                                            <p className="text-[10px] text-gray-400">摂取</p>
                                            <p className="text-xs font-semibold">{todayCalories.toLocaleString()}</p>
                                        </div>
                                        <div className="bg-gray-50 rounded-md py-1.5">
                                            <p className="text-[10px] text-gray-400">残り</p>
                                            <p className={`text-xs font-semibold ${isOverGoal ? 'text-red-600' : 'text-emerald-600'}`}>
                                                {isOverGoal ? `-${(todayCalories - GOAL_CALORIES).toLocaleString()}` : remaining.toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* PFC */}
                        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">PFCバランス</h3>
                                {!hasPfcData && <span className="text-[10px] text-gray-400">未取得</span>}
                            </div>
                            <div className="space-y-3">
                                {PFC_TARGETS.map((t) => {
                                    const actual = todayPfc[t.key];
                                    const goal = GOAL_PFC[t.key];
                                    const pct = hasPfcData && goal > 0 ? Math.min(100, (actual / goal) * 100) : 0;
                                    return (
                                        <div key={t.key}>
                                            <div className="flex items-center justify-between mb-1">
                                                <div className="flex items-center gap-1.5">
                                                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-white text-[10px] font-bold ${t.bgColor}`}>{t.label}</span>
                                                    <span className="text-xs text-gray-600">{t.name}</span>
                                                </div>
                                                <span className="text-xs text-gray-700">{hasPfcData ? `${Math.round(actual)}` : "--"}<span className="text-gray-400">/{goal}g</span></span>
                                            </div>
                                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: t.color }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 歩数 */}
                        {todaySteps != null && (
                            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-lg">🚶</span>
                                        <div>
                                            <p className="text-[10px] text-gray-400 uppercase tracking-wider">歩数</p>
                                            <p className="text-lg font-bold text-gray-900">{todaySteps.toLocaleString()} <span className="text-xs font-normal text-gray-400">歩</span></p>
                                        </div>
                                    </div>
                                    {todayExerciseCal != null && todayExerciseCal > 0 && (
                                        <div className="text-right">
                                            <p className="text-[10px] text-gray-400">消費</p>
                                            <p className="text-sm font-semibold text-orange-500">{todayExerciseCal} kcal</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* カレンダー（右） */}
                    <div className="lg:col-span-8">
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm h-full p-4">
                            {loading ? (
                                <div className="h-[600px] w-full bg-gray-100 animate-pulse rounded-xl" />
                            ) : (
                                <MonthCalendar days={calendarData} />
                            )}
                        </div>
                    </div>
                </div>

                {/* 下段: あすけん同期 + 自動同期ステータス + AI */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* あすけん手動同期 */}
                    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center">
                                <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                            </div>
                            <h3 className="text-sm font-semibold text-gray-900">あすけん同期</h3>
                        </div>
                        <button
                            onClick={handleAskenSync}
                            disabled={syncing}
                            className="w-full py-2.5 bg-orange-500 text-white text-sm font-semibold rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                        >
                            {syncing && <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
                            {syncing ? "取得中..." : "今すぐ取得"}
                        </button>
                        {syncResult && (
                            <div className="mt-2 bg-gray-50 rounded-md p-2 text-xs text-gray-600">
                                あすけん {syncResult.askenCount}日 / Strong {syncResult.strongCount}日
                                {syncResult.errors.length > 0 && <p className="mt-1 text-amber-600 text-[10px]">{syncResult.errors.slice(0, 2).join(" / ")}</p>}
                            </div>
                        )}
                        {/* 自動同期ステータス（コンパクト） */}
                        {syncStatus && (
                            <div className="mt-3 pt-3 border-t border-gray-100">
                                <div className="flex items-center gap-2 mb-1.5">
                                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                                        自動
                                    </span>
                                    <span className="text-[10px] text-gray-400">{formatSchedule(syncStatus.schedule)}</span>
                                </div>
                                {syncStatus.lastSync && (
                                    <p className="text-[10px] text-gray-500">
                                        最終: {formatDistanceToNow(new Date(syncStatus.lastSync.timestamp), { addSuffix: true, locale: ja })}
                                        <span className="text-gray-400 ml-1">
                                            (あすけん {syncStatus.lastSync.askenCount}日 / Strong {syncStatus.lastSync.strongCount}日)
                                        </span>
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* AI 食事評価 */}
                    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center">
                                    <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                                </div>
                                <h3 className="text-sm font-semibold text-gray-900">AI 食事評価</h3>
                            </div>
                            <button
                                onClick={handleEvaluate}
                                disabled={evaluating}
                                className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-all active:scale-[0.98] flex items-center gap-1.5"
                            >
                                {evaluating && <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
                                {evaluating ? "評価中..." : "今日を評価"}
                            </button>
                        </div>
                        {evalError && <p className="text-xs text-red-500 mb-2">{evalError}</p>}
                        {latestEval ? (
                            <div className="bg-gray-50 rounded-lg p-3 max-h-48 overflow-y-auto">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] text-gray-500">{latestEval.date}</span>
                                    <span className="text-[10px] text-gray-400">{latestEval.model}</span>
                                </div>
                                <div className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed prose-sm">
                                    {latestEval.response}
                                </div>
                            </div>
                        ) : (
                            <p className="text-xs text-gray-400">まだ評価がありません。「今日を評価」を押すか、毎朝5時に自動で前日分が生成されます。</p>
                        )}
                        <p className="mt-2 text-[10px] text-gray-400">毎朝5時に前日分を自動評価 / 手動でいつでも実行可</p>
                    </div>
                </div>
            </main>
        </div>
    );
}
