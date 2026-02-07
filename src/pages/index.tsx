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

    const GOAL_CALORIES = 2000;

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch('/api/stats/weekly-calories');
                if (res.ok) {
                    const data = await res.json();
                    setWeeklyData(data);

                    // Calculate today's calories
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

                {/* Quick Actions */}
                <nav className="grid grid-cols-2 gap-4">
                    <Link href="/meals/new" className="block group">
                        <div className="bg-blue-600 text-white p-4 rounded-xl shadow-lg shadow-blue-200 hover:shadow-blue-300 transition-all active:scale-95 text-center">
                            <span className="block text-2xl mb-1">✏️</span>
                            <span className="font-bold">食事を記録</span>
                        </div>
                    </Link>
                    <Link href="/meals" className="block group">
                        <div className="bg-white text-gray-700 border border-gray-200 p-4 rounded-xl hover:bg-gray-50 transition-all active:scale-95 text-center">
                            <span className="block text-2xl mb-1">📋</span>
                            <span className="font-bold">履歴を見る</span>
                        </div>
                    </Link>
                </nav>
            </main>
        </div>
    );
}
