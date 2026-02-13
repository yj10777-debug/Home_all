import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { WeeklyCaloriesChart } from '../components/WeeklyCaloriesChart';
import { format, formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';
import { getEffectiveToday, getEffectiveTodayStr } from '../lib/dateUtils';

type WeeklyData = { date: string; calories: number };
type PfcKey = "protein" | "fat" | "carbs";
type PfcTotals = Record<PfcKey, number>;

const INITIAL_PFC: PfcTotals = { protein: 0, fat: 0, carbs: 0 };
const GOAL_CALORIES = 2267;
const GOAL_PFC: Readonly<PfcTotals> = { protein: 150, fat: 54, carbs: 293 };

const PFC_TARGETS = [
    { key: "protein" as const, label: "P", name: "たんぱく質", color: "#8B5CF6", bgColor: "bg-violet-500" },
    { key: "fat" as const, label: "F", name: "脂質", color: "#F59E0B", bgColor: "bg-amber-500" },
    { key: "carbs" as const, label: "C", name: "炭水化物", color: "#3B82F6", bgColor: "bg-blue-500" },
] as const;

type CopyState = "idle" | "loading" | "copied" | "error";

/** 同期ステータス */
type SyncStatus = {
    lastSync: {
        timestamp: string;
        askenCount: number;
        strongCount: number;
        dayCount: number;
        errors: string[];
    } | null;
    schedule: string;
    googleDriveConfigured: boolean;
    askenConfigured: boolean;
};

export default function Home() {
    const router = useRouter();
    const [weeklyData, setWeeklyData] = useState<WeeklyData[]>([]);
    const [loading, setLoading] = useState(true);
    const [todayCalories, setTodayCalories] = useState(0);
    const [todayPfc, setTodayPfc] = useState<PfcTotals>({ ...INITIAL_PFC });
    const [hasPfcData, setHasPfcData] = useState(false);

    // 同期ステータス
    const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);

    // あすけん手動同期
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<{ askenCount: number; strongCount: number; dayCount: number; errors: string[] } | null>(null);

    // プロンプトコピー
    const [dailyCopyState, setDailyCopyState] = useState<CopyState>("idle");
    const [weeklyCopyState, setWeeklyCopyState] = useState<CopyState>("idle");
    const [copyError, setCopyError] = useState<string | null>(null);

    const parseNumericValue = (value: unknown): number => {
        if (typeof value !== "string") return 0;
        const match = value.match(/[\d.]+/);
        return match ? parseFloat(match[0]) : 0;
    };

    const computePfcTotals = (nutrients?: Record<string, Record<string, string>>): PfcTotals => {
        const totals: PfcTotals = { ...INITIAL_PFC };
        if (!nutrients) return totals;
        for (const meal of Object.values(nutrients)) {
            if (!meal) continue;
            const hasCarb = Object.prototype.hasOwnProperty.call(meal, "炭水化物");
            for (const [key, raw] of Object.entries(meal)) {
                const amount = parseNumericValue(raw);
                if (!amount) continue;
                if (key === "たんぱく質" || key === "タンパク質") totals.protein += amount;
                else if (key === "脂質") totals.fat += amount;
                else if (key === "炭水化物") totals.carbs += amount;
                else if (key === "糖質" && !hasCarb) totals.carbs += amount;
            }
        }
        return totals;
    };

    const fetchData = async () => {
        setLoading(true);
        setHasPfcData(false);
        try {
            const res = await fetch('/api/stats/weekly-from-day');
            if (res.ok) {
                const data = await res.json();
                setWeeklyData(data);
                const todayStr = getEffectiveTodayStr();
                const todayEntry = data.find((d: WeeklyData) => d.date === todayStr);
                setTodayCalories(todayEntry?.calories || 0);
            } else { setWeeklyData([]); setTodayCalories(0); }

            const todayStr = getEffectiveTodayStr();
            let foundPfc = false;
            try {
                const dayRes = await fetch(`/api/day?date=${todayStr}`);
                if (dayRes.ok) {
                    const dayData = await dayRes.json();
                    const nutrients = (dayData?.asken?.nutrients ?? dayData?.nutrients) as Record<string, Record<string, string>> | undefined;
                    if (nutrients && Object.keys(nutrients).length > 0) {
                        setTodayPfc(computePfcTotals(nutrients));
                        foundPfc = true;
                    } else { setTodayPfc({ ...INITIAL_PFC }); }
                } else { setTodayPfc({ ...INITIAL_PFC }); }
            } catch { setTodayPfc({ ...INITIAL_PFC }); }
            setHasPfcData(foundPfc);
        } catch { setWeeklyData([]); setTodayCalories(0); setTodayPfc({ ...INITIAL_PFC }); setHasPfcData(false); }
        finally { setLoading(false); }
    };

    /** 同期ステータスを取得 */
    const fetchSyncStatus = async () => {
        try {
            const res = await fetch('/api/sync/status');
            if (res.ok) {
                const data = await res.json();
                setSyncStatus(data);
            }
        } catch {
            // 静かに失敗
        }
    };

    /** あすけん同期を手動実行 */
    const handleAskenSync = async () => {
        setSyncing(true);
        setSyncResult(null);
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);
            const res = await fetch("/api/sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
                signal: controller.signal,
            });
            clearTimeout(timeout);
            const data = await res.json();
            if (res.ok && data.success) {
                setSyncResult({ askenCount: data.askenCount ?? 0, strongCount: data.strongCount, dayCount: data.dayCount, errors: data.errors || [] });
                await fetchData();
                await fetchSyncStatus();
            } else {
                setSyncResult({ askenCount: 0, strongCount: 0, dayCount: 0, errors: [data.error || "取得に失敗しました"] });
            }
        } catch (e) {
            setSyncResult({ askenCount: 0, strongCount: 0, dayCount: 0, errors: [String(e)] });
        } finally { setSyncing(false); }
    };

    const handleCopyPrompt = useCallback(async (type: "daily" | "weekly") => {
        const setState = type === "daily" ? setDailyCopyState : setWeeklyCopyState;
        setState("loading");
        setCopyError(null);
        try {
            const todayStr = getEffectiveTodayStr();
            const url = type === "daily" ? `/api/ai/daily?date=${todayStr}` : `/api/ai/weekly`;
            const res = await fetch(url);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "プロンプトの生成に失敗しました");
            await navigator.clipboard.writeText(data.prompt);
            setState("copied");
            setTimeout(() => setState("idle"), 2000);
        } catch (e) {
            setState("error");
            setCopyError(e instanceof Error ? e.message : String(e));
            setTimeout(() => { setState("idle"); setCopyError(null); }, 3000);
        }
    }, []);

    /** チャートのバーがクリックされた時 */
    const handleBarClick = (date: string) => {
        router.push(`/day/${date}`);
    };

    useEffect(() => {
        fetchData();
        fetchSyncStatus();
        // 60秒ごとにステータスを更新
        const interval = setInterval(fetchSyncStatus, 60000);
        return () => clearInterval(interval);
    }, []);

    const remaining = Math.max(0, GOAL_CALORIES - todayCalories);
    const progress = Math.min(100, (todayCalories / GOAL_CALORIES) * 100);
    const isOverGoal = todayCalories > GOAL_CALORIES;

    const getCopyButtonLabel = (state: CopyState, label: string) => {
        if (state === "loading") return "生成中...";
        if (state === "copied") return "コピー済!";
        if (state === "error") return "エラー";
        return label;
    };

    /** cron式を人間が読める形式に変換 */
    const formatSchedule = (schedule: string): string => {
        // "0 8,12,19,23 * * *" のような形式をパース
        const parts = schedule.split(" ");
        if (parts.length >= 2) {
            const hours = parts[1];
            if (hours.includes(",")) {
                return `毎日 ${hours.split(",").map(h => `${h}:00`).join("・")}`;
            }
            return `毎日 ${hours}:00`;
        }
        return schedule;
    };

    /** カロリーリング（コンパクト版） */
    const CalorieRing = () => {
        const size = 140;
        const sw = 12;
        const r = (size - sw) / 2;
        const c = 2 * Math.PI * r;
        const o = c - (progress / 100) * c;
        return (
            <div className="relative inline-flex items-center justify-center">
                <svg width={size} height={size} className="-rotate-90">
                    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#F3F4F6" strokeWidth={sw} />
                    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={isOverGoal ? "#EF4444" : "#10B981"} strokeWidth={sw} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={o} className="transition-all duration-700 ease-out" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold text-gray-900">{todayCalories.toLocaleString()}</span>
                    <span className="text-[10px] text-gray-400">/ {GOAL_CALORIES.toLocaleString()} kcal</span>
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
            <Head><title>Nutrition Tracker</title></Head>

            {/* ヘッダー（コンパクト） */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
                <div className="max-w-7xl mx-auto px-4 py-2.5 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-md flex items-center justify-center">
                            <span className="text-white text-xs font-bold">N</span>
                        </div>
                        <h1 className="text-lg font-bold text-gray-900">Nutrition Tracker</h1>
                        <span className="text-xs text-gray-400 ml-2 hidden sm:inline">{format(getEffectiveToday(), 'yyyy/M/d')}</span>
                    </div>
                    <nav className="flex items-center gap-4">
                        <Link href="/days" className="text-xs text-gray-500 hover:text-gray-900">履歴</Link>
                        <Link href="/meals" className="text-xs text-gray-500 hover:text-gray-900">食事一覧</Link>
                    </nav>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 py-4">
                {/* 上段: カロリー + PFC + チャート */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-4">
                    {/* カロリー + PFC（左） */}
                    <div className="lg:col-span-4 flex flex-col gap-4">
                        {/* カロリーリング + サマリー */}
                        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                            <div className="flex items-start gap-4">
                                <CalorieRing />
                                <div className="flex-1 pt-2">
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">今日のカロリー</h3>
                                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                                            isOverGoal ? 'bg-red-50 text-red-600' : remaining < 300 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
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
                    </div>

                    {/* チャート（右） */}
                    <div className="lg:col-span-8">
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm h-full">
                            {loading ? (
                                <div className="h-[280px] w-full bg-gray-100 animate-pulse rounded-xl" />
                            ) : (
                                <WeeklyCaloriesChart data={weeklyData} goal={GOAL_CALORIES} onBarClick={handleBarClick} />
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

                    {/* Gem AI 評価 */}
                    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center">
                                <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                            </div>
                            <h3 className="text-sm font-semibold text-gray-900">Gem AI 評価</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => handleCopyPrompt("daily")} disabled={dailyCopyState === "loading"}
                                className={`py-2 text-xs font-semibold rounded-lg transition-all active:scale-[0.98] ${dailyCopyState === "copied" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : dailyCopyState === "error" ? "bg-red-50 text-red-700" : "bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"}`}>
                                {getCopyButtonLabel(dailyCopyState, "今日の食事評価")}
                            </button>
                            <button onClick={() => handleCopyPrompt("weekly")} disabled={weeklyCopyState === "loading"}
                                className={`py-2 text-xs font-semibold rounded-lg transition-all active:scale-[0.98] ${weeklyCopyState === "copied" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : weeklyCopyState === "error" ? "bg-red-50 text-red-700" : "bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"}`}>
                                {getCopyButtonLabel(weeklyCopyState, "週次まとめ")}
                            </button>
                        </div>
                        {copyError && <p className="mt-2 text-[10px] text-red-500">{copyError}</p>}
                        <p className="mt-2 text-[10px] text-gray-400">コピー → Gemini Gem に貼り付けて送信</p>
                    </div>
                </div>
            </main>
        </div>
    );
}
