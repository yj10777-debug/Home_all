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
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    setFetchError(null);
    fetch("/api/days", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`API ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setDays(Array.isArray(data.days) ? data.days : []);
      })
      .catch((e) => {
        setDays([]);
        setFetchError(e instanceof Error ? e.message : "取得に失敗しました");
      })
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

  /** カロリーの色を決定（テーマの primary を使用） */
  const getCalorieColor = (cal: number) => {
    if (cal === 0) return "text-[var(--text-tertiary)]";
    const diff = Math.abs(cal - GOAL_CALORIES) / GOAL_CALORIES;
    if (diff <= 0.1) return "text-[var(--primary)]";
    if (diff <= 0.2) return "text-amber-400";
    return "text-red-400";
  };

  const grouped = groupByMonth(days);

  return (
    <div className="min-h-screen font-sans bg-[var(--bg-page)] text-[var(--text-primary)]">
      <Head>
        <title>履歴 - からだノート</title>
      </Head>

      <header className="bg-[var(--bg-page)] border-b border-[var(--border-card)] sticky top-0 z-20">
        <div className="px-4 md:px-6 lg:px-8 py-4">
          <h1 className="text-xl font-bold text-[var(--text-primary)]">履歴</h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-0.5">日付別データ一覧</p>
        </div>
      </header>

      <main className="w-full px-4 md:px-6 lg:px-8 py-8">
        <h2 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-4 px-1">
          履歴一覧
        </h2>
        {fetchError && (
          <div className="mb-4 p-3 rounded-lg bg-amber-900/30 border border-amber-600/50 text-amber-200 text-sm" role="alert">
            {fetchError}
          </div>
        )}
        {loading ? (
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 list-none p-0 m-0">
            {[...Array(6)].map((_, i) => (
              <li key={i} className="h-20 rounded-xl bg-[var(--bg-card)] border border-[var(--border-card)] animate-pulse" />
            ))}
          </ul>
        ) : days.length === 0 ? (
          <div className="text-center py-16 rounded-xl border border-dashed border-[var(--border-card)] bg-[var(--bg-card)]">
            <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center mb-3 bg-[var(--bg-page)]">
              <span className="material-symbols-outlined text-4xl text-[var(--text-tertiary)]">calendar_today</span>
            </div>
            <p className="text-base font-medium text-[var(--text-primary)]">登録された日付がありません</p>
            <p className="text-sm text-[var(--text-tertiary)] mt-1">トップの「今すぐ取得」でデータを同期してください</p>
          </div>
        ) : (
          <div className="space-y-6" role="list">
            {Object.entries(grouped).map(([month, monthDays]) => (
              <section key={month} aria-labelledby={`month-${month}`}>
                <h3 id={`month-${month}`} className="text-sm font-bold text-[var(--text-secondary)] mb-3 flex items-center gap-2">
                  <span aria-hidden>{month}</span>
                  <span className="text-xs font-normal text-[var(--text-tertiary)]">({monthDays.length}日)</span>
                </h3>
                <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 list-none p-0 m-0">
                  {monthDays.map((d) => (
                    <li key={d.date}>
                      <Link
                        href={`/day/${d.date}`}
                        className="group flex items-center gap-4 bg-[var(--bg-card)] rounded-xl p-4 transition-all hover:bg-[var(--bg-card-hover)] border border-[var(--border-card)] hover:border-[var(--primary)]/30 min-h-[72px] border-l-4 border-l-[var(--primary)]"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-[var(--text-primary)] group-hover:text-[var(--primary)] transition-colors text-sm sm:text-base">
                            {formatDateLabel(d.date)}
                          </p>
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            <span className={`text-sm font-bold tabular-nums ${getCalorieColor(d.calories)}`}>
                              {d.calories > 0 ? `${d.calories.toLocaleString()} kcal` : "—"}
                            </span>
                            {d.steps != null && (
                              <span className="text-xs text-[var(--text-tertiary)]">🚶 {d.steps.toLocaleString()}歩</span>
                            )}
                            {d.hasStrong && <span className="text-xs text-violet-400">💪</span>}
                          </div>
                        </div>
                        <span className="material-symbols-outlined text-[var(--text-tertiary)] group-hover:text-[var(--primary)] transition-colors flex-shrink-0 text-xl">chevron_right</span>
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
