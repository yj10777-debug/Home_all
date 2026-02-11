import { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { apiClient } from '../../lib/apiClient';

interface MealItemInput {
    name: string;
    cal: number;
}

const MEAL_TYPES = [
    { value: "Breakfast", label: "朝食", icon: "🌅" },
    { value: "Lunch", label: "昼食", icon: "☀️" },
    { value: "Dinner", label: "夕食", icon: "🌙" },
    { value: "Snack", label: "間食", icon: "🍪" },
];

export default function NewMeal() {
    const router = useRouter();
    const [loggedAt, setLoggedAt] = useState('');
    const [mealType, setMealType] = useState('Snack');
    const [source, setSource] = useState('asken');
    const [items, setItems] = useState<MealItemInput[]>([{ name: '', cal: 0 }]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleAddItem = () => {
        setItems([...items, { name: '', cal: 0 }]);
    };

    const handleRemoveItem = (index: number) => {
        const newItems = [...items];
        newItems.splice(index, 1);
        setItems(newItems);
    };

    const handleItemChange = (index: number, field: keyof MealItemInput, value: string | number) => {
        const newItems = [...items];
        if (field === 'cal') {
            newItems[index] = { ...newItems[index], [field]: Number(value) };
        } else {
            newItems[index] = { ...newItems[index], [field]: value as string };
        }
        setItems(newItems);
    };

    const calculateTotal = () => {
        return items.reduce((sum, item) => sum + (item.cal || 0), 0);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!loggedAt) {
            alert('日時を入力してください');
            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            const date = new Date(loggedAt);
            const isoLoggedAt = date.toISOString();

            const payload = {
                mealLog: {
                    loggedAt: isoLoggedAt,
                    mealType,
                    source
                },
                items: items.filter(i => i.name.trim() !== '')
            };

            await apiClient('/meals', {
                method: 'POST',
                body: payload
            });

            router.push('/meals');
        } catch (err: any) {
            setError(err.message || '登録に失敗しました');
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
            <Head>
                <title>食事を記録 - Nutrition Tracker</title>
            </Head>

            {/* ヘッダー */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
                <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <Link href="/meals" className="text-gray-400 hover:text-gray-600 transition-colors">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900">食事を記録</h1>
                            <p className="text-xs text-gray-500">新しい食事を追加</p>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-2xl mx-auto px-6 py-8">
                {error && (
                    <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 text-sm mb-6 flex items-center gap-2">
                        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* 日時 */}
                    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">日時</label>
                        <input
                            type="datetime-local"
                            value={loggedAt}
                            onChange={(e) => setLoggedAt(e.target.value)}
                            required
                            className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white"
                        />
                    </div>

                    {/* 食事タイプ */}
                    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                        <label className="block text-sm font-semibold text-gray-700 mb-3">食事タイプ</label>
                        <div className="grid grid-cols-4 gap-2">
                            {MEAL_TYPES.map((type) => (
                                <button
                                    key={type.value}
                                    type="button"
                                    onClick={() => setMealType(type.value)}
                                    className={`py-3 px-3 rounded-xl border text-sm font-medium transition-all ${
                                        mealType === type.value
                                            ? 'bg-emerald-50 border-emerald-300 text-emerald-700 shadow-sm'
                                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                    }`}
                                >
                                    <span className="block text-xl mb-1">{type.icon}</span>
                                    {type.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* ソース */}
                    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">ソース</label>
                        <input
                            type="text"
                            value={source}
                            onChange={(e) => setSource(e.target.value)}
                            className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white"
                            placeholder="asken, manual, etc."
                        />
                    </div>

                    {/* 食品リスト */}
                    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <label className="text-sm font-semibold text-gray-700">食品リスト</label>
                            <span className="text-sm font-semibold text-gray-700">
                                合計: <span className="text-emerald-600">{calculateTotal().toLocaleString()} kcal</span>
                            </span>
                        </div>
                        <div className="space-y-3">
                            {items.map((item, index) => (
                                <div key={index} className="flex items-center gap-3">
                                    <input
                                        type="text"
                                        placeholder="食品名"
                                        value={item.name}
                                        onChange={(e) => handleItemChange(index, 'name', e.target.value)}
                                        className="flex-[2] px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                        required
                                    />
                                    <div className="relative flex-1">
                                        <input
                                            type="number"
                                            placeholder="0"
                                            value={item.cal || ''}
                                            onChange={(e) => handleItemChange(index, 'cal', e.target.value)}
                                            className="w-full px-3 py-2.5 pr-12 border border-gray-300 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                            min="0"
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">kcal</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveItem(index)}
                                        disabled={items.length === 1}
                                        className="p-2 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                        title="削除"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                        <button
                            type="button"
                            onClick={handleAddItem}
                            className="mt-4 w-full py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:text-emerald-600 hover:border-emerald-300 transition-colors flex items-center justify-center gap-1"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                            行を追加
                        </button>
                    </div>

                    {/* 登録ボタン */}
                    <button
                        type="submit"
                        disabled={submitting}
                        className="w-full py-4 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] text-base flex items-center justify-center gap-2"
                    >
                        {submitting && (
                            <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                        )}
                        {submitting ? '送信中...' : '登録する'}
                    </button>
                </form>
            </main>
        </div>
    );
}
