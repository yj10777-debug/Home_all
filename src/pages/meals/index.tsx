import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { apiClient } from '../../lib/apiClient';

interface MealItem {
    id: number;
    name: string;
    cal: number;
}

interface Meal {
    id: number;
    loggedAt: string;
    mealType: string;
    items: MealItem[];
}

/** 食事タイプの色 */
const MEAL_TYPE_STYLE: Record<string, { bg: string; text: string }> = {
    Breakfast: { bg: "bg-amber-50", text: "text-amber-700" },
    Lunch: { bg: "bg-blue-50", text: "text-blue-700" },
    Dinner: { bg: "bg-indigo-50", text: "text-indigo-700" },
    Snack: { bg: "bg-pink-50", text: "text-pink-700" },
};

export default function MealsIndex() {
    const [meals, setMeals] = useState<Meal[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [date, setDate] = useState<string>(
        new Date().toISOString().split('T')[0]
    );

    const fetchMeals = async (targetDate: string) => {
        setLoading(true);
        setError(null);
        try {
            const data = await apiClient<{ mealLogs: Meal[] }>(`/meals?date=${targetDate}`);
            const list = data?.mealLogs;
            setMeals(Array.isArray(list) ? list : []);
        } catch (err: any) {
            setError(err.message || '食事データの取得に失敗しました');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMeals(date);
    }, [date]);

    const handleDelete = async (id: number) => {
        if (!confirm('本当に削除しますか？')) return;
        try {
            await apiClient(`/meals/${id}`, { method: 'DELETE' });
            fetchMeals(date);
        } catch (err: any) {
            alert(err.message || '削除に失敗しました');
        }
    };

    const calculateTotalCal = (items: MealItem[]) => {
        return items.reduce((sum, item) => sum + item.cal, 0);
    };

    const totalDayCal = meals.reduce((sum, m) => sum + calculateTotalCal(m.items), 0);

    return (
        <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
            <Head>
                <title>食事一覧 - Nutrition Tracker</title>
            </Head>

            {/* ヘッダー */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
                <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <Link href="/" className="text-gray-400 hover:text-gray-600 transition-colors">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900">食事一覧</h1>
                            <p className="text-xs text-gray-500">日別の食事記録</p>
                        </div>
                    </div>
                    <Link
                        href="/meals/new"
                        className="text-sm bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors font-medium"
                    >
                        + 新しい食事
                    </Link>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-6 py-8">
                {/* 日付セレクタ */}
                <div className="flex items-center gap-4 mb-6">
                    <label className="text-sm font-medium text-gray-600">日付:</label>
                    <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white"
                    />
                    {!loading && meals.length > 0 && (
                        <span className="text-sm text-gray-500">
                            合計: <span className="font-semibold text-gray-700">{totalDayCal.toLocaleString()} kcal</span>
                        </span>
                    )}
                </div>

                {/* コンテンツ */}
                {loading ? (
                    <div className="space-y-3">
                        {[...Array(3)].map((_, i) => (
                            <div key={i} className="h-20 bg-gray-100 animate-pulse rounded-xl" />
                        ))}
                    </div>
                ) : error ? (
                    <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 text-sm">
                        {error}
                    </div>
                ) : !Array.isArray(meals) || meals.length === 0 ? (
                    <div className="text-center py-16">
                        <div className="w-14 h-14 bg-gray-100 rounded-full mx-auto flex items-center justify-center mb-4">
                            <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                        </div>
                        <p className="text-gray-500">この日のデータはありません</p>
                        <Link href="/meals/new" className="text-emerald-600 hover:underline text-sm mt-2 inline-block">
                            食事を記録する
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {meals.map((meal) => {
                            const style = MEAL_TYPE_STYLE[meal.mealType] ?? { bg: "bg-gray-50", text: "text-gray-700" };
                            const cal = calculateTotalCal(meal.items);
                            return (
                                <div key={meal.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-3">
                                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-md ${style.bg} ${style.text}`}>
                                                {meal.mealType}
                                            </span>
                                            <span className="text-sm text-gray-500">
                                                {new Date(meal.loggedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <span className="text-sm font-semibold text-gray-800">{cal.toLocaleString()} kcal</span>
                                            <button
                                                onClick={() => handleDelete(meal.id)}
                                                className="text-xs text-gray-400 hover:text-red-500 transition-colors p-1"
                                                title="削除"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                    {meal.items.length > 0 && (
                                        <div className="ml-1 space-y-0.5">
                                            {meal.items.map((item) => (
                                                <div key={item.id} className="flex items-center justify-between text-sm">
                                                    <span className="text-gray-600">{item.name}</span>
                                                    <span className="text-gray-400 tabular-nums">{item.cal} kcal</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>
        </div>
    );
}
