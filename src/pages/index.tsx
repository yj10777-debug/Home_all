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
    { key: "protein" as const, label: "P", name: "たんぱく質", color: "#8B5CF6", bgColor: "bg-violet-500", lightBg: "bg-violet-50", textColor: "text-violet-600" },
    { key: "fat" as const, label: "F", name: "脂質", color: "#F59E0B", bgColor: "bg-amber-500", lightBg: "bg-amber-50", textColor: "text-amber-600" },
    { key: "carbs" as const, label: "C", name: "炭水化物", color: "#3B82F6", bgColor: "bg-blue-500", lightBg: "bg-blue-50", textColor: "text-blue-600" },
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

    // Strong アップロード関連の state
    const [strongUploading, setStrongUploading] = useState(false);
    const [strongResult, setStrongResult] = useState<{ savedDays: number; parsedWorkouts: number; errors: string[] } | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);

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
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000); // 5分タイムアウト
            const res = await fetch("/api/sync", { method: "POST", signal: controller.signal });
            clearTimeout(timeout);
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

    /** Strong テキストファイルをアップロードする */
    const handleStrongUpload = async (fileList: FileList | null) => {
        if (!fileList || fileList.length === 0) return;

        setStrongUploading(true);
        setStrongResult(null);

        try {
            const files: { name: string; content: string }[] = [];
            for (let i = 0; i < fileList.length; i++) {
                const file = fileList[i];
                if (!file.name.endsWith('.txt')) continue;
                const content = await file.text();
                files.push({ name: file.name, content });
            }

            if (files.length === 0) {
                setStrongResult({ savedDays: 0, parsedWorkouts: 0, errors: [".txt ファイルが見つかりませんでした"] });
                return;
            }

            const res = await fetch("/api/sync/strong", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ files }),
            });
            const data = await res.json();

            if (res.ok && data.success) {
                setStrongResult({ savedDays: data.savedDays, parsedWorkouts: data.parsedWorkouts, errors: data.errors || [] });
                await fetchData();
            } else {
                setStrongResult({ savedDays: 0, parsedWorkouts: 0, errors: [data.error || "アップロードに失敗しました"] });
            }
        } catch (e) {
            setStrongResult({ savedDays: 0, parsedWorkouts: 0, errors: [String(e)] });
        } finally {
            setStrongUploading(false);
        }
    };

    /** ドラッグ&ドロップのハンドラ */
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    };
    const handleDragLeave = () => setIsDragOver(false);
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        handleStrongUpload(e.dataTransfer.files);
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
    const isOverGoal = todayCalories > GOAL_CALORIES;

    /** コピーボタンのラベルを返す */
    const getCopyButtonLabel = (state: CopyState, defaultLabel: string): string => {
        switch (state) {
            case "loading": return "生成中...";
            case "copied": return "コピーしました!";
            case "error": return "エラー";
            default: return defaultLabel;
        }
    };

    /** 円グラフ風のSVGリングコンポーネント */
    const CalorieRing = () => {
        const size = 180;
        const strokeWidth = 14;
        const radius = (size - strokeWidth) / 2;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (progress / 100) * circumference;

        return (
            <div className="relative inline-flex items-center justify-center">
                <svg width={size} height={size} className="-rotate-90">
                    {/* 背景リング */}
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        fill="none"
                        stroke="#F3F4F6"
                        strokeWidth={strokeWidth}
                    />
                    {/* 進捗リング */}
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        fill="none"
                        stroke={isOverGoal ? "#EF4444" : "#10B981"}
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        className="transition-all duration-700 ease-out"
                    />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-bold text-gray-900">{todayCalories.toLocaleString()}</span>
                    <span className="text-xs text-gray-400 mt-0.5">/ {GOAL_CALORIES.toLocaleString()} kcal</span>
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
            <Head>
                <title>Nutrition Tracker</title>
                <meta name="viewport" content="width=device-width, initial-scale=1" />
            </Head>

            {/* ヘッダー */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
                <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-lg flex items-center justify-center">
                            <span className="text-white text-sm font-bold">N</span>
                        </div>
                        <h1 className="text-xl font-bold text-gray-900">Nutrition Tracker</h1>
                    </div>
                    <nav className="flex items-center gap-6">
                        <Link href="/days" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
                            履歴
                        </Link>
                        <Link href="/meals" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
                            食事一覧
                        </Link>
                        <Link href="/meals/new" className="text-sm bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors font-medium">
                            + 食事を記録
                        </Link>
                    </nav>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 py-8">
                {/* 日付表示 */}
                <div className="mb-8">
                    <h2 className="text-2xl font-bold text-gray-900">
                        {format(new Date(), 'yyyy年M月d日')}
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">今日の栄養サマリー</p>
                </div>

                {/* メイングリッド: 左カラム(カロリー+PFC) + 右カラム(チャート) */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                    {/* 左カラム: カロリーリング + PFC */}
                    <div className="lg:col-span-1 space-y-6">
                        {/* カロリーリングカード */}
                        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">カロリー</h3>
                                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                                    isOverGoal
                                        ? 'bg-red-50 text-red-600'
                                        : remaining < 300
                                            ? 'bg-amber-50 text-amber-600'
                                            : 'bg-emerald-50 text-emerald-600'
                                }`}>
                                    {isOverGoal ? `${todayCalories - GOAL_CALORIES} kcal 超過` : `残り ${remaining} kcal`}
                                </span>
                            </div>
                            <div className="flex justify-center py-2">
                                <CalorieRing />
                            </div>
                            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                                <div className="bg-gray-50 rounded-lg py-2">
                                    <p className="text-xs text-gray-400">目標</p>
                                    <p className="text-sm font-semibold text-gray-700">{GOAL_CALORIES.toLocaleString()}</p>
                                </div>
                                <div className="bg-gray-50 rounded-lg py-2">
                                    <p className="text-xs text-gray-400">摂取</p>
                                    <p className="text-sm font-semibold text-gray-700">{todayCalories.toLocaleString()}</p>
                                </div>
                                <div className="bg-gray-50 rounded-lg py-2">
                                    <p className="text-xs text-gray-400">残り</p>
                                    <p className={`text-sm font-semibold ${isOverGoal ? 'text-red-600' : 'text-emerald-600'}`}>
                                        {isOverGoal ? `-${(todayCalories - GOAL_CALORIES).toLocaleString()}` : remaining.toLocaleString()}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* PFC カード */}
                        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                            <div className="flex items-center justify-between mb-5">
                                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">PFCバランス</h3>
                                {!hasPfcData && (
                                    <span className="text-xs text-gray-400">データ未取得</span>
                                )}
                            </div>
                            <div className="space-y-5">
                                {PFC_TARGETS.map((target) => {
                                    const actual = todayPfc[target.key];
                                    const goal = GOAL_PFC[target.key];
                                    const pct = hasPfcData && goal > 0 ? Math.min(100, (actual / goal) * 100) : 0;
                                    const remaining = Math.max(0, goal - actual);
                                    return (
                                        <div key={target.key}>
                                            <div className="flex items-center justify-between mb-1.5">
                                                <div className="flex items-center gap-2">
                                                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md text-white text-xs font-bold ${target.bgColor}`}>
                                                        {target.label}
                                                    </span>
                                                    <span className="text-sm text-gray-600">{target.name}</span>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-sm font-semibold text-gray-900">
                                                        {hasPfcData ? `${Math.round(actual)}g` : "--"}
                                                    </span>
                                                    <span className="text-xs text-gray-400 ml-1">/ {goal}g</span>
                                                </div>
                                            </div>
                                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all duration-700 ease-out`}
                                                    style={{ width: `${pct}%`, backgroundColor: target.color }}
                                                />
                                            </div>
                                            {hasPfcData && remaining > 0 && (
                                                <p className="text-xs text-gray-400 mt-1">あと {Math.round(remaining)}g</p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* 右カラム: 週間チャート */}
                    <div className="lg:col-span-2">
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm h-full">
                            {loading ? (
                                <div className="h-[400px] w-full bg-gray-100 animate-pulse rounded-2xl" />
                            ) : (
                                <WeeklyCaloriesChart data={weeklyData} goal={GOAL_CALORIES} />
                            )}
                        </div>
                    </div>
                </div>

                {/* 下段グリッド: データ同期 + Strong + AI評価 */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* データ同期カード */}
                    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                                <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="font-semibold text-gray-900">データ同期</h3>
                                <p className="text-xs text-gray-500">あすけん・Strong のデータを取得</p>
                            </div>
                        </div>
                        <button
                            onClick={handleSync}
                            disabled={syncing}
                            className="w-full py-3 px-4 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                        >
                            {syncing && (
                                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                            )}
                            {syncing ? "取得中..." : "今日までのデータを同期"}
                        </button>
                        {syncResult && (
                            <div className="mt-4 bg-gray-50 rounded-lg p-3">
                                <div className="flex items-center gap-4 text-sm">
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-2 h-2 bg-emerald-400 rounded-full" />
                                        <span className="text-gray-600">あすけん: <span className="font-medium">{syncResult.askenCount}日</span></span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-2 h-2 bg-blue-400 rounded-full" />
                                        <span className="text-gray-600">Strong: <span className="font-medium">{syncResult.strongCount}日</span></span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-2 h-2 bg-violet-400 rounded-full" />
                                        <span className="text-gray-600">統合: <span className="font-medium">{syncResult.dayCount}件</span></span>
                                    </div>
                                </div>
                                {syncResult.errors.length > 0 && (
                                    <p className="mt-2 text-xs text-amber-600 bg-amber-50 rounded-md p-2">
                                        {syncResult.errors.join(" / ")}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Strong アップロードカード */}
                    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="font-semibold text-gray-900">Strong 取り込み</h3>
                                <p className="text-xs text-gray-500">.txt ファイルをアップロード</p>
                            </div>
                        </div>

                        {/* ドラッグ&ドロップエリア */}
                        <label
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            className={`block w-full py-6 border-2 border-dashed rounded-xl text-center cursor-pointer transition-all ${
                                isDragOver
                                    ? 'border-blue-400 bg-blue-50'
                                    : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                            } ${strongUploading ? 'opacity-50 pointer-events-none' : ''}`}
                        >
                            <input
                                type="file"
                                accept=".txt"
                                multiple
                                className="hidden"
                                onChange={(e) => handleStrongUpload(e.target.files)}
                                disabled={strongUploading}
                            />
                            {strongUploading ? (
                                <div className="flex flex-col items-center gap-2">
                                    <svg className="w-6 h-6 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                    <span className="text-sm text-gray-500">処理中...</span>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center gap-1">
                                    <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                    </svg>
                                    <span className="text-sm text-gray-500 mt-1">ドラッグ&ドロップ</span>
                                    <span className="text-xs text-gray-400">または クリックして選択</span>
                                </div>
                            )}
                        </label>

                        {strongResult && (
                            <div className="mt-3 bg-gray-50 rounded-lg p-3">
                                <div className="flex items-center gap-3 text-sm">
                                    <span className="text-gray-600">
                                        <span className="font-medium">{strongResult.parsedWorkouts}</span> ワークアウト →
                                        <span className="font-medium"> {strongResult.savedDays}</span> 日分保存
                                    </span>
                                </div>
                                {strongResult.errors.length > 0 && (
                                    <p className="mt-1.5 text-xs text-amber-600 bg-amber-50 rounded-md p-2">
                                        {strongResult.errors.join(" / ")}
                                    </p>
                                )}
                            </div>
                        )}

                        <p className="mt-3 text-xs text-gray-400 leading-relaxed">
                            Google Drive の Strong フォルダから .txt を選択
                        </p>
                    </div>

                    {/* Gem AI 評価カード */}
                    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                                <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="font-semibold text-gray-900">Gem AI 評価</h3>
                                <p className="text-xs text-gray-500">プロンプトをコピーして Gem に貼り付け</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => handleCopyPrompt("daily")}
                                disabled={dailyCopyState === "loading"}
                                className={`py-3 px-4 font-semibold rounded-xl transition-all active:scale-[0.98] text-sm flex items-center justify-center gap-2 ${
                                    dailyCopyState === "copied"
                                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                        : dailyCopyState === "error"
                                            ? "bg-red-50 text-red-700 border border-red-200"
                                            : "bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                }`}
                            >
                                {dailyCopyState === "loading" && (
                                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                )}
                                {dailyCopyState === "copied" && (
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                                {getCopyButtonLabel(dailyCopyState, "今日の食事評価")}
                            </button>

                            <button
                                onClick={() => handleCopyPrompt("weekly")}
                                disabled={weeklyCopyState === "loading"}
                                className={`py-3 px-4 font-semibold rounded-xl transition-all active:scale-[0.98] text-sm flex items-center justify-center gap-2 ${
                                    weeklyCopyState === "copied"
                                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                        : weeklyCopyState === "error"
                                            ? "bg-red-50 text-red-700 border border-red-200"
                                            : "bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                }`}
                            >
                                {weeklyCopyState === "loading" && (
                                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                )}
                                {weeklyCopyState === "copied" && (
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                                {getCopyButtonLabel(weeklyCopyState, "週次まとめ")}
                            </button>
                        </div>

                        {copyError && (
                            <p className="mt-3 text-xs text-red-500 bg-red-50 rounded-lg p-2">{copyError}</p>
                        )}

                        <p className="mt-4 text-xs text-gray-400 leading-relaxed">
                            コピー後 → Gemini の「栄養トレーナー」Gem を開く → 貼り付けて送信
                        </p>
                    </div>
                </div>
            </main>
        </div>
    );
}
