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

  /** カロリーの色を決定（ダークテーマ用） */
  const getCalorieColor = (cal: number) => {
    if (cal === 0) return "text-slate-500";
    const diff = Math.abs(cal - GOAL_CALORIES) / GOAL_CALORIES;
    if (diff <= 0.1) return "text-[#19e619]";
    if (diff <= 0.2) return "text-amber-400";
    return "text-red-400";
  };

  const grouped = groupByMonth(days);

  return (
    <div className="min-h-screen font-sans bg-[#112211] text-slate-100">
      <Head>
        <title>履歴 - Nutrition Tracker</title>
      </Head>

      <header className="bg-[#112211] border-b border-[#244724] sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/" className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
              <span className="material-symbols-outlined text-xl">arrow_back</span>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-white">履歴</h1>
              <p className="text-sm text-slate-400">日付別データ一覧</p>
            </div>
          </div>
          <Link href="/" className="text-sm font-medium text-slate-400 hover:text-white transition-colors py-2 px-3 rounded-xl min-h-[44px] inline-flex items-center hover:bg-white/5">
            ダッシュボード
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 px-1">
          履歴一覧
        </h2>
        {loading ? (
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 list-none p-0 m-0">
            {[...Array(6)].map((_, i) => (
              <li key={i} className="h-20 rounded-xl bg-[#1a331a] border border-[#244724] animate-pulse" />
            ))}
          </ul>
        ) : days.length === 0 ? (
          <div className="text-center py-16 rounded-xl border border-dashed border-[#244724] bg-[#1a331a]">
            <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center mb-3 bg-[#112211]">
              <span className="material-symbols-outlined text-4xl text-slate-500">calendar_today</span>
            </div>
            <p className="text-base font-medium text-white">登録された日付がありません</p>
            <p className="text-sm text-slate-400 mt-1">トップの「今すぐ取得」でデータを同期してください</p>
          </div>
        ) : (
          <div className="space-y-6" role="list">
            {Object.entries(grouped).map(([month, monthDays]) => (
              <section key={month} aria-labelledby={`month-${month}`}>
                <h3 id={`month-${month}`} className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
                  <span aria-hidden>{month}</span>
                  <span className="text-xs font-normal text-slate-500">({monthDays.length}日)</span>
                </h3>
                <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 list-none p-0 m-0">
                  {monthDays.map((d) => (
                    <li key={d.date}>
                      <Link
                        href={`/day/${d.date}`}
                        className="group flex items-center gap-4 bg-[#1a331a] rounded-xl p-4 transition-all hover:bg-[#214021] border border-[#244724] hover:border-[#19e619]/30 min-h-[72px] border-l-4 border-l-[#19e619]"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-white group-hover:text-[#19e619] transition-colors text-sm sm:text-base">
                            {formatDateLabel(d.date)}
                          </p>
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            <span className={`text-sm font-bold tabular-nums ${getCalorieColor(d.calories)}`}>
                              {d.calories > 0 ? `${d.calories.toLocaleString()} kcal` : "—"}
                            </span>
                            {d.steps != null && (
                              <span className="text-xs text-slate-400">🚶 {d.steps.toLocaleString()}歩</span>
                            )}
                            {d.hasStrong && <span className="text-xs text-violet-400">💪</span>}
                          </div>
                        </div>
                        <span className="material-symbols-outlined text-slate-500 group-hover:text-[#19e619] transition-colors flex-shrink-0 text-xl">chevron_right</span>
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
