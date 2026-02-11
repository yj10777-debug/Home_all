import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { WeeklyCaloriesChart } from '../components/WeeklyCaloriesChart';
import { format } from 'date-fns';

type WeeklyData = {
    date: string;
    calories: number;
};

type PfcKey = "protein" | "fat" | "carbs";
type PfcTotals = Record<PfcKey, number>;

const INITIAL_PFC: PfcTotals = { protein: 0, fat: 0, carbs: 0 };

const GOAL_CALORIES = 2267;
const GOAL_PFC: Readonly<PfcTotals> = {
    protein: 150,
    fat: 54,
    carbs: 293,
};

const PFC_TARGETS = [
    { key: "protein" as const, label: "P", name: "たんぱく質", color: "bg-purple-500" },
    { key: "fat" as const, label: "F", name: "脂質", color: "bg-amber-500" },
    { key: "carbs" as const, label: "C", name: "炭水化物", color: "bg-blue-500" },
] as const;

/** コピー成功時のフィードバック表示用の型 */
type CopyState = "idle" | "loading" | "copied" | "error";

export default function Home() {
    const [weeklyData, setWeeklyData] = useState<WeeklyData[]>([]);
    const [loading, setLoading] = useState(true);
    const [todayCalories, setTodayCalories] = useState(0);
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<{ askenCount: number; strongCount: number; dayCount: number; errors: string[] } | null>(null);
    const [todayPfc, setTodayPfc] = useState<PfcTotals>({ ...INITIAL_PFC });
    const [hasPfcData, setHasPfcData] = useState(false);

    // プロンプトコピー関連の state
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

                if (key === "たんぱく質" || key === "タンパク質") {
                    totals.protein += amount;
                } else if (key === "脂質") {
                    totals.fat += amount;
                } else if (key === "炭水化物") {
                    totals.carbs += amount;
                } else if (key === "糖質" && !hasCarb) {
                    totals.carbs += amount;
                }
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
                const todayStr = format(new Date(), 'yyyy-MM-dd');
                const todayEntry = data.find((d: WeeklyData) => d.date === todayStr);
                setTodayCalories(todayEntry?.calories || 0);
            } else {
                setWeeklyData([]);
                setTodayCalories(0);
            }

            const todayStr = format(new Date(), 'yyyy-MM-dd');
            let foundPfc = false;
            try {
                const dayRes = await fetch(`/api/day?date=${todayStr}`);
                if (dayRes.ok) {
                    const dayData = await dayRes.json();
                    const nutrients = (dayData?.asken?.nutrients ?? dayData?.nutrients) as Record<string, Record<string, string>> | undefined;
                    if (nutrients && Object.keys(nutrients).length > 0) {
                        const totals = computePfcTotals(nutrients);
                        setTodayPfc(totals);
                        foundPfc = true;
                    } else {
                        setTodayPfc({ ...INITIAL_PFC });
                    }
                } else {
                    setTodayPfc({ ...INITIAL_PFC });
                }
            } catch (error) {
                console.error('Failed to fetch day data', error);
                setTodayPfc({ ...INITIAL_PFC });
            }

            setHasPfcData(foundPfc);
        } catch (error) {
            console.error('Failed to fetch stats', error);
            setWeeklyData([]);
            setTodayCalories(0);
            setTodayPfc({ ...INITIAL_PFC });
            setHasPfcData(false);
        } finally {
            setLoading(false);
        }
    };

    const handleSync = async () => {
        setSyncing(true);
        setSyncResult(null);
        try {
            const res = await fetch("/api/sync", { method: "POST" });
            const data = await res.json();
            if (res.ok && data.success) {
                setSyncResult({ askenCount: data.askenCount ?? 0, strongCount: data.strongCount, dayCount: data.dayCount, errors: data.errors || [] });
                await fetchData();
            } else {
                setSyncResult({ askenCount: 0, strongCount: 0, dayCount: 0, errors: [data.error || "取得に失敗しました"] });
            }
        } catch (e) {
            setSyncResult({ askenCount: 0, strongCount: 0, dayCount: 0, errors: [String(e)] });
        } finally {
            setSyncing(false);
        }
    };

    /** プロンプトを取得してクリップボードにコピーする */
    const handleCopyPrompt = useCallback(async (type: "daily" | "weekly") => {
        const setState = type === "daily" ? setDailyCopyState : setWeeklyCopyState;
        setState("loading");
        setCopyError(null);

        try {
            const todayStr = format(new Date(), 'yyyy-MM-dd');
            const url = type === "daily"
                ? `/api/ai/daily?date=${todayStr}`
                : `/api/ai/weekly`;

            const res = await fetch(url);
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "プロンプトの生成に失敗しました");
            }

            await navigator.clipboard.writeText(data.prompt);
            setState("copied");

            // 2秒後にリセット
            setTimeout(() => setState("idle"), 2000);
        } catch (e) {
            setState("error");
            setCopyError(e instanceof Error ? e.message : String(e));
            // 3秒後にリセット
            setTimeout(() => {
                setState("idle");
                setCopyError(null);
            }, 3000);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, []);

    const remaining = Math.max(0, GOAL_CALORIES - todayCalories);
    const progress = Math.min(100, (todayCalories / GOAL_CALORIES) * 100);

    /** コピーボタンのラベルを返す */
    const getCopyButtonLabel = (state: CopyState, defaultLabel: string): string => {
        switch (state) {
            case "loading": return "生成中...";
            case "copied": return "コピーしました!";
            case "error": return "エラー";
            default: return defaultLabel;
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
            <Head>
                <title>Nutrition App</title>
            </Head>

            <header className="bg-white shadow-sm sticky top-0 z-10">
                <div className="max-w-md mx-auto px-4 py-4 flex justify-between items-center">
                    <h1 className="text-xl font-bold text-gray-800">Nutrition App</h1>
                    <div className="text-sm text-gray-500">
                        Today
                    </div>
                </div>
            </header>

            <main className="max-w-md mx-auto px-4 py-6 space-y-6">
                {/* Summary Card */}
                <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gray-100">
                        <div
                            className={`h-full ${progress > 100 ? 'bg-red-500' : 'bg-green-500'} transition-all duration-500`}
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <div className="flex justify-between items-end mb-2">
                        <div>
                            <p className="text-sm text-gray-500 mb-1">今日の摂取カロリー</p>
                            <div className="flex items-baseline gap-2">
                                <span className="text-3xl font-bold text-gray-900">{todayCalories}</span>
                                <span className="text-sm text-gray-500">/ {GOAL_CALORIES} kcal</span>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-gray-400">あと</p>
                            <p className={`text-xl font-bold ${remaining < 200 ? 'text-red-500' : 'text-green-600'}`}>
                                {remaining} kcal
                            </p>
                        </div>
                    </div>
                    <div className="mt-4">
                        <div className="flex justify-between text-xs text-gray-500 uppercase tracking-wide">
                            <span>PFCバランス</span>
                            <span>目標 {GOAL_PFC.protein}/{GOAL_PFC.fat}/{GOAL_PFC.carbs} g</span>
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-2">
                            {PFC_TARGETS.map((target) => {
                                const actual = todayPfc[target.key];
                                const goal = GOAL_PFC[target.key];
                                const progressWidth = hasPfcData && goal > 0 ? Math.min(100, (actual / goal) * 100) : 0;
                                return (
                                    <div key={target.key} className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                                        <div className="flex justify-between text-xs text-gray-500">
                                            <span>{target.label}</span>
                                            <span>{GOAL_PFC[target.key]}g</span>
                                        </div>
                                        <div className="mt-1 flex items-baseline gap-1">
                                            <span className="text-lg font-semibold text-gray-900">
                                                {hasPfcData ? Math.round(actual) : "--"}
                                            </span>
                                            <span className="text-xs text-gray-500">g</span>
                                        </div>
                                        <p className="text-[10px] text-gray-400 mt-0.5">{target.name}</p>
                                        <div className="h-1.5 bg-white rounded-full mt-2 overflow-hidden">
                                            <div
                                                className={`h-full ${target.color} transition-all duration-500`}
                                                style={{ width: `${progressWidth}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        {!hasPfcData && (
                            <p className="mt-2 text-xs text-gray-400">PFCデータが未取得です。同期後に表示されます。</p>
                        )}
                    </div>
                </section>

                {/* Dashboard Chart */}
                <section>
                    {loading ? (
                        <div className="h-[300px] w-full bg-gray-200 animate-pulse rounded-xl"></div>
                    ) : (
                        <WeeklyCaloriesChart data={weeklyData} goal={GOAL_CALORIES} />
                    )}
                </section>

                {/* データ取得 */}
                <section className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 space-y-3">
                    <button
                        onClick={handleSync}
                        disabled={syncing}
                        className="w-full py-3 px-4 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                    >
                        {syncing ? "取得中..." : "データを取得（あすけん・Strong 今日まで）"}
                    </button>
                    {syncResult && (
                        <p className="mt-2 text-sm text-gray-600">
                            あすけん: {syncResult.askenCount}日分 / Strong: {syncResult.strongCount}日分 / day統合: {syncResult.dayCount}件
                            {syncResult.errors.length > 0 && (
                                <span className="block text-amber-600 mt-1">{syncResult.errors.join(" ")}</span>
                            )}
                        </p>
                    )}
                </section>

                {/* Gem 用プロンプトコピー */}
                <section className="bg-white p-5 rounded-2xl shadow-sm border border-indigo-100">
                    <div className="flex items-center gap-2 mb-3">
                        <span className="text-lg">&#x2728;</span>
                        <h2 className="font-bold text-gray-800">Gem AI 評価</h2>
                    </div>
                    <p className="text-xs text-gray-500 mb-4">
                        プロンプトをコピーして Gemini の専用 Gem に貼り付けてください
                    </p>

                    <div className="space-y-2">
                        <button
                            onClick={() => handleCopyPrompt("daily")}
                            disabled={dailyCopyState === "loading"}
                            className={`w-full py-3 px-4 font-bold rounded-xl transition-all active:scale-[0.98] text-sm ${
                                dailyCopyState === "copied"
                                    ? "bg-green-100 text-green-700 border border-green-300"
                                    : dailyCopyState === "error"
                                        ? "bg-red-100 text-red-700 border border-red-300"
                                        : "bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            }`}
                        >
                            {getCopyButtonLabel(dailyCopyState, "今日の食事評価プロンプトをコピー")}
                        </button>

                        <button
                            onClick={() => handleCopyPrompt("weekly")}
                            disabled={weeklyCopyState === "loading"}
                            className={`w-full py-3 px-4 font-bold rounded-xl transition-all active:scale-[0.98] text-sm ${
                                weeklyCopyState === "copied"
                                    ? "bg-green-100 text-green-700 border border-green-300"
                                    : weeklyCopyState === "error"
                                        ? "bg-red-100 text-red-700 border border-red-300"
                                        : "bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            }`}
                        >
                            {getCopyButtonLabel(weeklyCopyState, "週次まとめプロンプトをコピー")}
                        </button>
                    </div>

                    {copyError && (
                        <p className="mt-2 text-xs text-red-500">{copyError}</p>
                    )}

                    <p className="mt-3 text-[10px] text-gray-400 leading-relaxed">
                        コピー後 → Gemini の「栄養トレーナー」Gem を開く → 貼り付けて送信
                    </p>
                </section>

                {/* Quick Actions */}
                <nav className="grid grid-cols-2 gap-4">
                    <Link href="/meals/new" className="block group">
                        <div className="bg-blue-600 text-white p-4 rounded-xl shadow-lg shadow-blue-200 hover:shadow-blue-300 transition-all active:scale-95 text-center">
                            <span className="block text-2xl mb-1">&#x270F;&#xFE0F;</span>
                            <span className="font-bold">食事を記録</span>
                        </div>
                    </Link>
                    <Link href="/days" className="block group">
                        <div className="bg-white text-gray-700 border border-gray-200 p-4 rounded-xl hover:bg-gray-50 transition-all active:scale-95 text-center">
                            <span className="block text-2xl mb-1">&#x1F4C5;</span>
                            <span className="font-bold">日付一覧</span>
                        </div>
                    </Link>
                </nav>
            </main>
        </div>
    );
}
