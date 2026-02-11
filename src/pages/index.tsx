import { useEffect, useState } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { WeeklyCaloriesChart } from '../components/WeeklyCaloriesChart';
import { format } from 'date-fns';

type WeeklyData = {
    date: string;
    calories: number;
};

export default function Home() {
    const [weeklyData, setWeeklyData] = useState<WeeklyData[]>([]);
    const [loading, setLoading] = useState(true);
    const [todayCalories, setTodayCalories] = useState(0);
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<{ strongCount: number; dayCount: number; errors: string[] } | null>(null);

    const GOAL_CALORIES = 2000;

    const fetchData = async () => {
        try {
            const res = await fetch('/api/stats/weekly-from-day');
            if (res.ok) {
                const data = await res.json();
                setWeeklyData(data);
                const todayStr = format(new Date(), 'yyyy-MM-dd');
                const todayEntry = data.find((d: WeeklyData) => d.date === todayStr);
                setTodayCalories(todayEntry?.calories || 0);
            }
        } catch (error) {
            console.error('Failed to fetch stats', error);
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
                setSyncResult({ strongCount: data.strongCount, dayCount: data.dayCount, errors: data.errors || [] });
                await fetchData();
            } else {
                setSyncResult({ strongCount: 0, dayCount: 0, errors: [data.error || "取得に失敗しました"] });
            }
        } catch (e) {
            setSyncResult({ strongCount: 0, dayCount: 0, errors: [String(e)] });
        } finally {
            setSyncing(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const remaining = Math.max(0, GOAL_CALORIES - todayCalories);
    const progress = Math.min(100, (todayCalories / GOAL_CALORIES) * 100);

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
                <section className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <button
                        onClick={handleSync}
                        disabled={syncing}
                        className="w-full py-3 px-4 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                    >
                        {syncing ? "取得中..." : "🔄 データを取得（あすけん・Strong 今日まで）"}
                    </button>
                    {syncResult && (
                        <p className="mt-2 text-sm text-gray-600">
                            Strong: {syncResult.strongCount}日分 / day統合: {syncResult.dayCount}件
                            {syncResult.errors.length > 0 && (
                                <span className="block text-amber-600 mt-1">{syncResult.errors.join(" ")}</span>
                            )}
                        </p>
                    )}
                </section>

                {/* Quick Actions */}
                <nav className="grid grid-cols-2 gap-4">
                    <Link href="/meals/new" className="block group">
                        <div className="bg-blue-600 text-white p-4 rounded-xl shadow-lg shadow-blue-200 hover:shadow-blue-300 transition-all active:scale-95 text-center">
                            <span className="block text-2xl mb-1">✏️</span>
                            <span className="font-bold">食事を記録</span>
                        </div>
                    </Link>
                    <Link href="/days" className="block group">
                        <div className="bg-white text-gray-700 border border-gray-200 p-4 rounded-xl hover:bg-gray-50 transition-all active:scale-95 text-center">
                            <span className="block text-2xl mb-1">📅</span>
                            <span className="font-bold">日付一覧</span>
                        </div>
                    </Link>
                </nav>
            </main>
        </div>
    );
}
