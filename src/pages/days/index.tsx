import { useEffect, useState } from "react";
import Link from "next/link";
import Head from "next/head";

export default function DaysIndex() {
  const [dates, setDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/days")
      .then((r) => r.json())
      .then((data) => setDates(data.dates || []))
      .catch(() => setDates([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      <Head>
        <title>日付一覧 - データ管理</title>
      </Head>
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-800">日付一覧</h1>
          <Link href="/" className="text-sm text-blue-600 hover:underline">トップ</Link>
        </div>
      </header>
      <main className="max-w-md mx-auto px-4 py-6">
        <p className="text-sm text-gray-500 mb-4">あすけん（食事）・Strong（筋トレ）の統合データ</p>
        {loading ? (
          <div className="text-gray-500">読み込み中...</div>
        ) : dates.length === 0 ? (
          <p className="text-gray-500">登録された日付がありません。</p>
        ) : (
          <ul className="space-y-1">
            {dates.map((d) => (
              <li key={d}>
                <Link href={`/day/${d}`} className="block py-3 px-4 bg-white rounded-lg shadow-sm border border-gray-100 hover:bg-gray-50">
                  {d}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
