import { useEffect, useState } from "react";
import Link from "next/link";
import Head from "next/head";
import { parseISO, format, isValid } from "date-fns";

type DaySummary = {
  date: string;
  calories: number;
  steps: number | null;
  exerciseCalories: number | null;
  hasStrong: boolean;
};

const GOAL_CALORIES = 2267;

export default function DaysIndex() {
  const [days, setDays] = useState<DaySummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/days")
      .then((r) => r.json())
      .then((data) => setDays(data.days || []))
      .catch(() => setDays([]))
      .finally(() => setLoading(false));
  }, []);

  /** 日付文字列を読みやすくフォーマット */
  const formatDateLabel = (d: string) => {
    const parsed = parseISO(d);
    if (!isValid(parsed)) return d;
    return format(parsed, "yyyy年M月d日 (EEE)");
  };

  /** 月ごとにグルーピング */
  const groupByMonth = (dayList: DaySummary[]) => {
    const groups: Record<string, DaySummary[]> = {};
    for (const d of dayList) {
      const parsed = parseISO(d.date);
      const monthKey = isValid(parsed) ? format(parsed, "yyyy年M月") : "不明";
      if (!groups[monthKey]) groups[monthKey] = [];
      groups[monthKey].push(d);
    }
    return groups;
  };

  /** カロリーの色を決定 */
  const getCalorieColor = (cal: number) => {
    if (cal === 0) return "text-gray-400";
    const diff = Math.abs(cal - GOAL_CALORIES) / GOAL_CALORIES;
    if (diff <= 0.1) return "text-emerald-600";
    if (diff <= 0.2) return "text-amber-600";
    return "text-red-600";
  };

  const grouped = groupByMonth(days);

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      <Head>
        <title>履歴 - Nutrition Tracker</title>
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
              <h1 className="text-xl font-bold text-gray-900">履歴</h1>
              <p className="text-xs text-gray-500">日付別データ一覧</p>
            </div>
          </div>
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
            ダッシュボード
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-20 bg-gray-100 animate-pulse rounded-xl" />
            ))}
          </div>
        ) : days.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-gray-500 text-lg">登録された日付がありません</p>
            <p className="text-sm text-gray-400 mt-1">データを同期すると表示されます</p>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(grouped).map(([month, monthDays]) => (
              <section key={month}>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {month}
                  <span className="text-xs font-normal text-gray-400">({monthDays.length}日分)</span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {monthDays.map((d) => (
                    <Link
                      key={d.date}
                      href={`/day/${d.date}`}
                      className="group block bg-white rounded-xl border border-gray-200 p-4 hover:border-emerald-300 hover:shadow-md transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-800 group-hover:text-emerald-600 transition-colors">
                            {formatDateLabel(d.date)}
                          </p>
                          <div className="flex items-center gap-3 mt-1.5">
                            {/* カロリー */}
                            <span className={`text-sm font-semibold ${getCalorieColor(d.calories)}`}>
                              {d.calories > 0 ? `${d.calories.toLocaleString()} kcal` : "--"}
                            </span>
                            {/* 歩数 */}
                            {d.steps != null && (
                              <span className="text-xs text-gray-500 flex items-center gap-0.5">
                                🚶 {d.steps.toLocaleString()} 歩
                              </span>
                            )}
                            {/* 筋トレ */}
                            {d.hasStrong && (
                              <span className="text-xs text-violet-500 font-medium">💪</span>
                            )}
                          </div>
                        </div>
                        <svg className="w-4 h-4 text-gray-300 group-hover:text-emerald-500 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
