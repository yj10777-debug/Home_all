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
    <div className="min-h-screen font-sans" style={{ backgroundColor: "var(--bg-page)", color: "var(--text-primary)" }}>
      <Head>
        <title>履歴 - Nutrition Tracker</title>
      </Head>

      <header className="bg-[var(--bg-card)] sticky top-0 z-20" style={{ boxShadow: "var(--shadow-card)" }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/" className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--bg-page)] transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-[var(--text-primary)]">履歴</h1>
              <p className="text-sm text-[var(--text-tertiary)]">日付別データ一覧</p>
            </div>
          </div>
          <Link href="/" className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors py-2 px-3 rounded-xl min-h-[44px] inline-flex items-center">
            ダッシュボード
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <h2 className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-4 px-1">
          履歴一覧
        </h2>
        {loading ? (
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 list-none p-0 m-0">
            {[...Array(6)].map((_, i) => (
              <li key={i} className="h-20 rounded-[var(--radius-card)] animate-pulse" style={{ backgroundColor: "var(--bg-page)" }} />
            ))}
          </ul>
        ) : days.length === 0 ? (
          <div className="text-center py-16 rounded-[var(--radius-card)] border border-dashed" style={{ borderColor: "var(--border-card)", backgroundColor: "var(--bg-card)" }}>
            <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center mb-3" style={{ backgroundColor: "var(--bg-page)" }}>
              <svg className="w-7 h-7 text-[var(--text-tertiary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-base font-medium text-[var(--text-secondary)]">登録された日付がありません</p>
            <p className="text-sm text-[var(--text-tertiary)] mt-1">トップの「今すぐ取得」でデータを同期してください</p>
          </div>
        ) : (
          <div className="space-y-6" role="list">
            {Object.entries(grouped).map(([month, monthDays]) => (
              <section key={month} aria-labelledby={`month-${month}`}>
                <h3 id={`month-${month}`} className="text-sm font-semibold text-[var(--text-secondary)] mb-3 flex items-center gap-2">
                  <span aria-hidden>{month}</span>
                  <span className="text-xs font-normal text-[var(--text-tertiary)]">({monthDays.length}日)</span>
                </h3>
                <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 list-none p-0 m-0">
                  {monthDays.map((d) => (
                    <li key={d.date}>
                      <Link
                        href={`/day/${d.date}`}
                        className="group flex items-center gap-4 bg-[var(--bg-card)] rounded-[var(--radius-card)] p-4 transition-all hover:shadow-md border-l-4 min-h-[72px]"
                        style={{ border: "1px solid var(--border-card)", borderLeftColor: "var(--accent)", boxShadow: "var(--shadow-card)" }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-[var(--text-primary)] group-hover:opacity-80 transition-opacity text-sm sm:text-base">
                            {formatDateLabel(d.date)}
                          </p>
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            <span className={`text-sm font-semibold tabular-nums ${getCalorieColor(d.calories)}`}>
                              {d.calories > 0 ? `${d.calories.toLocaleString()} kcal` : "—"}
                            </span>
                            {d.steps != null && (
                              <span className="text-xs text-[var(--text-secondary)]">🚶 {d.steps.toLocaleString()}歩</span>
                            )}
                            {d.hasStrong && <span className="text-xs text-violet-500">💪</span>}
                          </div>
                        </div>
                        <svg className="w-4 h-4 text-[var(--text-tertiary)] group-hover:text-[var(--accent)] transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
