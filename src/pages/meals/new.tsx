import { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { apiClient } from '../../lib/apiClient';

interface MealItemInput {
    name: string;
    cal: number;
}

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
            // Calculate ISO String from local input
            const date = new Date(loggedAt);
            const isoLoggedAt = date.toISOString();

            // Payload構造を { mealLog, items } に準拠させる
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
        <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
            <Head>
                <title>記録 - Nutrition App</title>
            </Head>

            <div style={{ marginBottom: '20px' }}>
                <Link href="/meals" style={{ color: 'blue' }}>&larr; 一覧に戻る</Link>
            </div>

            <h1>食事を記録</h1>

            {error && <p style={{ color: 'red', border: '1px solid red', padding: '10px' }}>{error}</p>}

            <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>日時:</label>
                    <input
                        type="datetime-local"
                        value={loggedAt}
                        onChange={(e) => setLoggedAt(e.target.value)}
                        required
                        style={{ width: '100%', padding: '8px' }}
                    />
                </div>

                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>種類:</label>
                    <select
                        value={mealType}
                        onChange={(e) => setMealType(e.target.value)}
                        style={{ width: '100%', padding: '8px' }}
                    >
                        <option value="Breakfast">Breakfast</option>
                        <option value="Lunch">Lunch</option>
                        <option value="Dinner">Dinner</option>
                        <option value="Snack">Snack</option>
                    </select>
                </div>

                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>ソース:</label>
                    <input
                        type="text"
                        value={source}
                        onChange={(e) => setSource(e.target.value)}
                        style={{ width: '100%', padding: '8px' }}
                    />
                </div>

                <div style={{ marginBottom: '20px', border: '1px solid #ddd', padding: '10px' }}>
                    <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold' }}>食品リスト:</label>
                    {items.map((item, index) => (
                        <div key={index} style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                            <input
                                type="text"
                                placeholder="食品名"
                                value={item.name}
                                onChange={(e) => handleItemChange(index, 'name', e.target.value)}
                                style={{ flex: 2, padding: '5px' }}
                                required
                            />
                            <input
                                type="number"
                                placeholder="kcal"
                                value={item.cal}
                                onChange={(e) => handleItemChange(index, 'cal', e.target.value)}
                                style={{ flex: 1, padding: '5px' }}
                                min="0"
                            />
                            <button
                                type="button"
                                onClick={() => handleRemoveItem(index)}
                                style={{ color: 'red', cursor: 'pointer' }}
                                disabled={items.length === 1}
                            >
                                削除
                            </button>
                        </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
                        <button
                            type="button"
                            onClick={handleAddItem}
                            style={{ padding: '5px 10px', cursor: 'pointer' }}
                        >
                            + 行を追加
                        </button>
                        <div style={{ fontWeight: 'bold' }}>
                            合計: {calculateTotal()} kcal
                        </div>
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={submitting}
                    style={{
                        width: '100%',
                        padding: '10px',
                        background: submitting ? '#ccc' : 'blue',
                        color: 'white',
                        border: 'none',
                        cursor: submitting ? 'not-allowed' : 'pointer'
                    }}
                >
                    {submitting ? '送信中...' : '登録する'}
                </button>
            </form>
        </div>
    );
}
