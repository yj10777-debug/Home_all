import { useEffect, useState, useCallback } from "react";
import Head from "next/head";
import Link from "next/link";
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import MonthCalendar from "../components/MonthCalendar";

/** API /api/days の日次サマリー（カレンダー用にマッピング） */
type CalendarDay = {
  date: string;
  score: number;
  hasStrong: boolean;
  hasEvaluation: boolean;
  steps: number | null;
  calories: number;
};

type ApiDay = {
  date: string;
  calories: number;
  pfc: { p: number; f: number; c: number };
  steps: number | null;
  hasStrong: boolean;
  hasEvaluation: boolean;
  score: number;
};

type DayDetail = {
  date: string;
  calories?: number;
  pfc?: { protein: number; fat: number; carbs: number };
  asken?: { items?: { mealType: string; name: string; amount: string; calories: number }[] };
};

const GOAL_CALORIES = 2267;
const GOAL_PFC = { protein: 150, fat: 54, carbs: 293 };

function toCalendarDay(d: ApiDay): CalendarDay {
  return {
    date: d.date,
    score: d.score,
    hasStrong: d.hasStrong,
    hasEvaluation: d.hasEvaluation,
    steps: d.steps,
    calories: d.calories,
  };
}

/**
 * カレンダー画面 — 参考デザイン: 月間サマリーカード＋カレンダー＋選択日の詳細パネル
 */
export default function CalendarPage() {
  const [days, setDays] = useState<CalendarDay[]>([]);
  const [apiDays, setApiDays] = useState<ApiDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayDetail, setDayDetail] = useState<DayDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    fetch("/api/days", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        const list = (data.days || []) as ApiDay[];
        setApiDays(list);
        setDays(list.map(toCalendarDay));
      })
      .catch(() => setDays([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedDate) {
      setDayDetail(null);
      return;
    }
    setDetailLoading(true);
    fetch(`/api/day/${selectedDate}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setDayDetail)
      .catch(() => setDayDetail(null))
      .finally(() => setDetailLoading(false));
  }, [selectedDate]);

  const onMonthChange = useCallback((month: Date) => setCurrentMonth(month), []);

  const monthDays = days.filter((d) => {
    const parsed = parseISO(d.date);
    return isWithinInterval(parsed, { start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });
  });
  const monthApiDays = apiDays.filter((d) => {
    const parsed = parseISO(d.date);
    return isWithinInterval(parsed, { start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });
  });
  const withCalories = monthDays.filter((d) => d.calories > 0);
  const monthlyAvgKcal =
    withCalories.length > 0
      ? Math.round(withCalories.reduce((s, d) => s + d.calories, 0) / withCalories.length)
      : 0;
  const goalMetCount = monthDays.filter(
    (d) => (d.hasEvaluation && d.score >= 80) || (d.calories > 0 && Math.abs(d.calories - GOAL_CALORIES) / GOAL_CALORIES <= 0.1)
  ).length;
  const adherence = withCalories.length > 0 ? Math.round((goalMetCount / withCalories.length) * 100) : 0;
  const daysWithPfc = monthApiDays.filter((d) => d.pfc?.p != null);
  const avgP =
    daysWithPfc.length > 0
      ? Math.round(daysWithPfc.reduce((s, d) => s + (d.pfc?.p ?? 0), 0) / daysWithPfc.length)
      : 0;

  const totalCalories = dayDetail?.calories ?? 0;
  const pfc = dayDetail?.pfc ?? { protein: 0, fat: 0, carbs: 0 };
  const kcalLeft = Math.max(0, GOAL_CALORIES - totalCalories);
  const circumference = 2 * Math.PI * 48;
  const calPct = Math.min(1, totalCalories / GOAL_CALORIES);
  const calOffset = circumference * (1 - calPct);

  const groupedMeals: Record<string, { name: string; amount: string; calories: number }[]> = {};
  if (dayDetail?.asken?.items) {
    for (const item of dayDetail.asken.items) {
      const type = item.mealType || "その他";
      if (!groupedMeals[type]) groupedMeals[type] = [];
      groupedMeals[type].push({ name: item.name, amount: item.amount, calories: item.calories });
    }
  }

  const mealLabels: Record<string, string> = { 朝食: "朝食", 昼食: "昼食", 夕食: "夕食", 間食: "間食" };

  return (
    <>
      <Head>
        <title>栄養カレンダー — からだノート</title>
      </Head>
      <main className="p-4 sm:p-6 min-h-full">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-1 flex items-center gap-2">
            <span className="material-symbols-outlined text-[var(--primary)]">calendar_month</span>
            栄養カレンダー
          </h1>
          <p className="text-[var(--text-tertiary)] text-sm mb-6">マクロとカロリー目標を追跡</p>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-[var(--text-tertiary)] text-sm">
              読み込み中...
            </div>
          ) : (
            <>
              {/* 月間サマリーカード（参考デザイン 4枚） */}
              <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-xl p-4">
                  <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-1">月間平均</p>
                  <p className="text-xl font-black text-[var(--text-primary)] tabular-nums">
                    {monthlyAvgKcal > 0 ? `${monthlyAvgKcal.toLocaleString()} kcal` : "—"}
                  </p>
                  <p className="text-[10px] text-[var(--text-tertiary)]">{format(currentMonth, "yyyy年M月", { locale: ja })}</p>
                </div>
                <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-xl p-4">
                  <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-1">タンパク質目標</p>
                  <p className="text-xl font-black text-[var(--primary)] tabular-nums">{GOAL_PFC.protein}g</p>
                  <p className="text-[10px] text-[var(--text-tertiary)]">平均 {avgP > 0 ? `${avgP}g/日` : "—"}</p>
                </div>
                <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-xl p-4">
                  <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-1">達成率</p>
                  <p className="text-xl font-black text-[var(--text-primary)] tabular-nums">{adherence}%</p>
                  <p className="text-[10px] text-[var(--text-tertiary)]">{goalMetCount}日 / {withCalories.length}日</p>
                </div>
                <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-xl p-4">
                  <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-1">記録日数</p>
                  <p className="text-xl font-black text-[var(--text-primary)] tabular-nums">{monthDays.length}</p>
                  <p className="text-[10px] text-[var(--text-tertiary)]">{format(currentMonth, "yyyy年M月", { locale: ja })}</p>
                </div>
              </section>

              {/* 2カラム: カレンダー | 選択日詳細 */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-[var(--bg-sidebar)] rounded-xl border border-[var(--border-card)] p-4 sm:p-6">
                  <MonthCalendar
                    days={days}
                    selectedDate={selectedDate}
                    onSelectDate={setSelectedDate}
                    showCaloriesInCell
                    onMonthChange={onMonthChange}
                  />
                </div>

                <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-xl p-4 sm:p-6 h-fit">
                  <h2 className="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-4">
                    {selectedDate
                      ? (() => {
                          try {
                            return format(parseISO(selectedDate), "M月d日 (EEE)", { locale: ja });
                          } catch {
                            return selectedDate;
                          }
                        })()
                      : "日付を選択"}
                  </h2>
                  {detailLoading ? (
                    <div className="flex items-center justify-center py-12 text-[var(--text-tertiary)] text-sm">
                      読み込み中...
                    </div>
                  ) : !selectedDate ? (
                    <p className="text-[var(--text-tertiary)] text-sm">カレンダーで日付をクリックすると詳細が表示されます</p>
                  ) : !dayDetail ? (
                    <p className="text-[var(--text-tertiary)] text-sm">この日のデータはありません</p>
                  ) : (
                    <div className="space-y-5">
                      {/* 円形プログレス（参考: KCAL LEFT） */}
                      <div className="flex flex-col items-center">
                        <div className="relative w-32 h-32 flex items-center justify-center">
                          <svg className="w-full h-full transform -rotate-90" aria-hidden>
                            <circle cx="64" cy="64" r="48" fill="transparent" stroke="#1a331a" strokeWidth="10" />
                            <circle
                              cx="64"
                              cy="64"
                              r="48"
                              fill="transparent"
                              stroke={totalCalories > GOAL_CALORIES ? "#ef4444" : "#19e619"}
                              strokeDasharray={circumference}
                              strokeDashoffset={calOffset}
                              strokeLinecap="round"
                              strokeWidth="10"
                              className="transition-all duration-500"
                            />
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-lg font-black text-[var(--text-primary)] tabular-nums">{totalCalories}</span>
                            <span className="text-[10px] text-[var(--text-tertiary)]">残り {kcalLeft} kcal</span>
                          </div>
                        </div>
                      </div>
                      {/* PFC */}
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div>
                          <p className="text-[var(--text-tertiary)]">P</p>
                          <p className="font-bold text-[var(--primary)]">{Math.round(pfc.protein)}g</p>
                          <p className="text-[var(--text-tertiary)]">目標 {GOAL_PFC.protein}g</p>
                        </div>
                        <div>
                          <p className="text-[var(--text-tertiary)]">F</p>
                          <p className="font-bold text-blue-400">{Math.round(pfc.fat)}g</p>
                          <p className="text-[var(--text-tertiary)]">目標 {GOAL_PFC.fat}g</p>
                        </div>
                        <div>
                          <p className="text-[var(--text-tertiary)]">C</p>
                          <p className="font-bold text-orange-400">{Math.round(pfc.carbs)}g</p>
                          <p className="text-[var(--text-tertiary)]">目標 {GOAL_PFC.carbs}g</p>
                        </div>
                      </div>
                      {/* 食事セクション */}
                      <div className="space-y-3">
                        {Object.entries(groupedMeals).map(([mealType, items]) => {
                          const total = items.reduce((s, i) => s + i.calories, 0);
                          return (
                            <div key={mealType}>
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-xs font-bold text-[var(--text-tertiary)] uppercase">
                                  {mealLabels[mealType] ?? mealType}
                                </span>
                                <span className="text-[10px] text-[var(--text-tertiary)]">{total} kcal</span>
                              </div>
                              <ul className="space-y-1">
                                {items.slice(0, 3).map((item, i) => (
                                  <li key={i} className="text-xs text-[var(--text-secondary)] truncate">
                                    {item.name} {item.calories}kcal
                                  </li>
                                ))}
                                {items.length > 3 && (
                                  <li className="text-[10px] text-[var(--text-tertiary)]">他 {items.length - 3} 件</li>
                                )}
                              </ul>
                            </div>
                          );
                        })}
                        {Object.keys(groupedMeals).length === 0 && (
                          <p className="text-[var(--text-tertiary)] text-xs">食事データなし</p>
                        )}
                      </div>
                      <Link
                        href={`/day/${selectedDate}`}
                        className="block w-full text-center py-2.5 rounded-lg bg-[var(--accent-muted)] text-[var(--primary)] font-medium text-sm border border-[var(--primary)]/30 hover:bg-[var(--accent-muted)] transition-colors transition-colors"
                      >
                        日別詳細を見る
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
