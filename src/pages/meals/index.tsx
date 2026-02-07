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
            // レスポンスの型指定を修正し、mealLogsを受け取る形式に対応
            const data = await apiClient<{ mealLogs: Meal[] }>(`/meals?date=${targetDate}`);

            // 安全にmealLogsを取り出し、配列でない場合は空配列をセットする
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
            // Reload current list
            fetchMeals(date);
        } catch (err: any) {
            alert(err.message || '削除に失敗しました');
        }
    };

    const calculateTotalCal = (items: MealItem[]) => {
        return items.reduce((sum, item) => sum + item.cal, 0);
    };

    return (
        <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
            <Head>
                <title>食事一覧 - Nutrition App</title>
            </Head>

            <div style={{ marginBottom: '20px' }}>
                <Link href="/" style={{ marginRight: '20px', color: 'blue' }}>&larr; Home</Link>
                <Link href="/meals/new" style={{ color: 'blue' }}>+ 新しい食事</Link>
            </div>

            <h1>食事一覧</h1>

            <div style={{ marginBottom: '20px' }}>
                <label style={{ marginRight: '10px' }}>日付:</label>
                <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                />
            </div>

            {loading && <p>読み込み中...</p>}
            {error && <p style={{ color: 'red' }}>{error}</p>}

            {!loading && !error && (
                <>
                    {/* 配列チェックを追加し、配列でない場合も考慮する */}
                    {!Array.isArray(meals) || meals.length === 0 ? (
                        <p>データがありません</p>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #ccc' }}>
                            <thead>
                                <tr style={{ background: '#f0f0f0' }}>
                                    <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>時間</th>
                                    <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>種類</th>
                                    <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>品目数</th>
                                    <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>合計カロリー</th>
                                    <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'center' }}>操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Array.isArray(meals) && meals.map((meal) => (
                                    <tr key={meal.id}>
                                        <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                                            {new Date(meal.loggedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                        <td style={{ border: '1px solid #ccc', padding: '8px' }}>{meal.mealType}</td>
                                        <td style={{ border: '1px solid #ccc', padding: '8px' }}>{meal.items.length}</td>
                                        <td style={{ border: '1px solid #ccc', padding: '8px' }}>{calculateTotalCal(meal.items)} kcal</td>
                                        <td style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'center' }}>
                                            <button
                                                onClick={() => handleDelete(meal.id)}
                                                style={{ color: 'red', cursor: 'pointer' }}
                                            >
                                                削除
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </>
            )}
        </div>
    );
}
