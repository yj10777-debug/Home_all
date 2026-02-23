import { useEffect, useState, useMemo } from "react";
import Head from "next/head";
import Link from "next/link";
import { format, parseISO, isValid, subMonths, startOfDay, isWithinInterval } from "date-fns";
import { ja } from "date-fns/locale";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  BarChart,
  Bar,
  Cell,
} from "recharts";

type DaySummary = {
  date: string;
  calories: number;
  pfc: { p: number; f: number; c: number };
  steps: number | null;
  hasStrong: boolean;
  hasEvaluation: boolean;
  score: number;
};

const GOAL_CALORIES = 2267;
const GOAL_PROTEIN = 150;

type PeriodKey = "1M" | "3M" | "6M" | "All";

/**
 * アナリティクス画面 — 参考デザイン: 期間フィルター・メトリクスカード・推移グラフ・目標進捗・一覧テーブル
 */
export default function AnalyticsPage() {
  const [days, setDays] = useState<DaySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodKey>("1M");

  useEffect(() => {
    fetch("/api/days", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setDays(data.days || []))
      .catch(() => setDays([]))
      .finally(() => setLoading(false));
  }, []);

  const now = startOfDay(new Date());
  const periodStart =
    period === "1M" ? subMonths(now, 1) : period === "3M" ? subMonths(now, 3) : period === "6M" ? subMonths(now, 6) : null;

  const filteredDays = useMemo(() => {
    if (!periodStart) return [...days].sort((a, b) => a.date.localeCompare(b.date));
    const end = startOfDay(new Date());
    return days
      .filter((d) => {
        const parsed = parseISO(d.date);
        return isValid(parsed) && isWithinInterval(parsed, { start: periodStart, end });
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [days, period, periodStart]);

  const prevPeriodDays = useMemo(() => {
    if (!periodStart) return [];
    const prevStart =
      period === "1M" ? subMonths(periodStart, 1) : period === "3M" ? subMonths(periodStart, 3) : subMonths(periodStart, 6);
    return days.filter((d) => {
      const parsed = parseISO(d.date);
      return isValid(parsed) && isWithinInterval(parsed, { start: prevStart, end: periodStart });
    });
  }, [days, period, periodStart]);

  const withCalories = filteredDays.filter((d) => d.calories > 0);
  const withScore = filteredDays.filter((d) => d.hasEvaluation);
  const avgCalories =
    withCalories.length > 0 ? Math.round(withCalories.reduce((s, d) => s + d.calories, 0) / withCalories.length) : 0;
  const avgScore =
    withScore.length > 0 ? Math.round(withScore.reduce((s, d) => s + d.score, 0) / withScore.length) : 0;
  const avgProtein =
    withCalories.length > 0
      ? Math.round(withCalories.reduce((s, d) => s + (d.pfc?.p ?? 0), 0) / withCalories.length)
      : 0;
  const goalMetDays = filteredDays.filter(
    (d) =>
      (d.hasEvaluation && d.score >= 80) ||
      (d.calories > 0 && Math.abs(d.calories - GOAL_CALORIES) / GOAL_CALORIES <= 0.1)
  ).length;
  const adherence = withCalories.length > 0 ? Math.round((goalMetDays / withCalories.length) * 100) : 0;

  const prevWithCalories = prevPeriodDays.filter((d) => d.calories > 0);
  const prevAvgCalories =
    prevWithCalories.length > 0
      ? Math.round(prevWithCalories.reduce((s, d) => s + d.calories, 0) / prevWithCalories.length)
      : 0;
  const prevWithScore = prevPeriodDays.filter((d) => d.hasEvaluation);
  const prevAvgScore =
    prevWithScore.length > 0 ? Math.round(prevWithScore.reduce((s, d) => s + d.score, 0) / prevWithScore.length) : 0;
  const prevAvgProtein =
    prevWithCalories.length > 0
      ? Math.round(prevWithCalories.reduce((s, d) => s + (d.pfc?.p ?? 0), 0) / prevWithCalories.length)
      : 0;

  const calorieDiff = prevAvgCalories > 0 ? ((avgCalories - prevAvgCalories) / prevAvgCalories) * 100 : 0;
  const scoreDiff = prevAvgScore > 0 ? avgScore - prevAvgScore : 0;
  const proteinDiff = prevAvgProtein > 0 ? avgProtein - prevAvgProtein : 0;

  const chartData = useMemo(
    () =>
      filteredDays.map((d) => ({
        date: d.date,
        calories: d.calories,
        score: d.hasEvaluation ? d.score : null,
        protein: d.pfc?.p ?? null,
      })),
    [filteredDays]
  );

  const scoreColor = (score: number) => {
    if (score >= 80) return "text-[#19e619]";
    if (score >= 60) return "text-amber-400";
    return "text-red-400";
  };

  const calorieColor = (cal: number) => {
    if (cal === 0) return "text-slate-500";
    const diff = Math.abs(cal - GOAL_CALORIES) / GOAL_CALORIES;
    if (diff <= 0.1) return "text-[#19e619]";
    if (diff <= 0.2) return "text-amber-400";
    return "text-red-400";
  };

  const proteinProgress = Math.min(100, Math.round((avgProtein / GOAL_PROTEIN) * 100));
  const adherenceProgress = adherence;
  const calorieGoalProgress = Math.min(100, Math.round((avgCalories / GOAL_CALORIES) * 100));

  const periodLabels: Record<PeriodKey, string> = { "1M": "1ヶ月", "3M": "3ヶ月", "6M": "6ヶ月", All: "全期間" };

  return (
    <>
      <Head>
        <title>進捗とアナリティクス — Nutrition</title>
      </Head>
      <main className="p-4 sm:p-6 min-h-full">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
            <span className="material-symbols-outlined text-[#19e619]">analytics</span>
            進捗とアナリティクス
          </h1>
          <p className="text-slate-400 text-sm mb-6">脂肪減少から筋肉増強までの推移を可視化</p>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
              読み込み中...
            </div>
          ) : (
            <div className="space-y-6">
              {/* 期間フィルター + Export（参考デザイン） */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-1 p-1 bg-[#1a331a] rounded-lg border border-[#244724]">
                  {(["1M", "3M", "6M", "All"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPeriod(p)}
                      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                        period === p
                          ? "bg-[#19e619] text-[#112211]"
                          : "text-slate-400 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      {periodLabels[p]}
                    </button>
                  ))}
                </div>
              </div>

              {/* メトリクスカード 4枚（前期間比） */}
              <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-[#1a331a] border border-[#244724] rounded-xl p-4">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">平均カロリー</p>
                  <p className={`text-xl font-black tabular-nums ${calorieColor(avgCalories)}`}>
                    {avgCalories > 0 ? `${avgCalories.toLocaleString()}` : "—"}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {prevAvgCalories > 0 && (
                      <span className={calorieDiff >= 0 ? "text-amber-400" : "text-[#19e619]"}>
                        {calorieDiff >= 0 ? "↑" : "↓"} {Math.abs(calorieDiff).toFixed(1)}% vs 前期間
                      </span>
                    )}
                    {prevAvgCalories === 0 && "前期間データなし"}
                  </p>
                </div>
                <div className="bg-[#1a331a] border border-[#244724] rounded-xl p-4">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">平均スコア</p>
                  <p className={`text-xl font-black tabular-nums ${scoreColor(avgScore)}`}>
                    {withScore.length > 0 ? avgScore : "—"}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {prevAvgScore > 0 && (
                      <span className={scoreDiff >= 0 ? "text-[#19e619]" : "text-amber-400"}>
                        {scoreDiff >= 0 ? "↑" : "↓"} {Math.abs(scoreDiff)} pt vs 前期間
                      </span>
                    )}
                  </p>
                </div>
                <div className="bg-[#1a331a] border border-[#244724] rounded-xl p-4">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">タンパク質 (平均)</p>
                  <p className="text-xl font-black text-[#19e619] tabular-nums">
                    {avgProtein > 0 ? `${avgProtein}g` : "—"}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {prevAvgProtein > 0 && (
                      <span className={proteinDiff >= 0 ? "text-[#19e619]" : "text-amber-400"}>
                        {proteinDiff >= 0 ? "↑" : "↓"} {Math.abs(proteinDiff)}g vs 前期間
                      </span>
                    )}
                  </p>
                </div>
                <div className="bg-[#1a331a] border border-[#244724] rounded-xl p-4">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">記録日数</p>
                  <p className="text-xl font-black text-white tabular-nums">{filteredDays.length}</p>
                  <p className="text-[10px] text-slate-500">{periodLabels[period]}</p>
                </div>
              </section>

              {/* カロリー・スコア推移（折れ線グラフ） */}
              {chartData.length > 0 && (
                <section className="bg-[#1a331a] border border-[#244724] rounded-xl p-4">
                  <h2 className="text-sm font-bold text-slate-300 mb-3">カロリー・スコア推移</h2>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#244724" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(v) => (isValid(parseISO(v)) ? format(parseISO(v), "M/d", { locale: ja }) : v)}
                          tick={{ fontSize: 10, fill: "#94a3b8" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          yAxisId="cal"
                          tick={{ fontSize: 10, fill: "#94a3b8" }}
                          axisLine={false}
                          tickLine={false}
                          width={36}
                          tickFormatter={(v) => v.toLocaleString()}
                        />
                        <YAxis
                          yAxisId="score"
                          orientation="right"
                          domain={[0, 100]}
                          tick={{ fontSize: 10, fill: "#94a3b8" }}
                          axisLine={false}
                          tickLine={false}
                          width={28}
                        />
                        <Tooltip
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length || label == null) return null;
                            const labelStr = String(label);
                            const d = payload[0]?.payload;
                            const parsed = parseISO(labelStr);
                            return (
                              <div className="bg-[#0e1c0e] border border-[#244724] rounded-lg px-3 py-2 shadow-xl text-xs">
                                <p className="text-slate-400 mb-1">
                                  {isValid(parsed) ? format(parsed, "yyyy/M/d (EEE)", { locale: ja }) : labelStr}
                                </p>
                                <p className="text-white font-bold">{d?.calories ?? 0} kcal</p>
                                {d?.score != null && (
                                  <p className={scoreColor(d.score)}>スコア {d.score}</p>
                                )}
                              </div>
                            );
                          }}
                        />
                        <ReferenceLine yAxisId="cal" y={GOAL_CALORIES} stroke="#ef4444" strokeDasharray="4 4" strokeOpacity={0.7} />
                        <Line
                          yAxisId="cal"
                          type="monotone"
                          dataKey="calories"
                          stroke="#19e619"
                          strokeWidth={2}
                          dot={{ fill: "#19e619", r: 3 }}
                          connectNulls
                        />
                        <Line
                          yAxisId="score"
                          type="monotone"
                          dataKey="score"
                          stroke="#a78bfa"
                          strokeWidth={2}
                          dot={{ fill: "#a78bfa", r: 3 }}
                          connectNulls
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </section>
              )}

              {/* 目標進捗（円形プログレス 3つ） */}
              <section className="bg-[#1a331a] border border-[#244724] rounded-xl p-4">
                <h2 className="text-sm font-bold text-slate-300 mb-4">目標進捗</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <div className="flex flex-col items-center">
                    <div className="relative w-24 h-24 flex items-center justify-center">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle cx="48" cy="48" r="40" fill="transparent" stroke="#1a331a" strokeWidth="8" />
                        <circle
                          cx="48"
                          cy="48"
                          r="40"
                          fill="transparent"
                          stroke="#19e619"
                          strokeDasharray={2 * Math.PI * 40}
                          strokeDashoffset={2 * Math.PI * 40 * (1 - calorieGoalProgress / 100)}
                          strokeLinecap="round"
                          strokeWidth="8"
                        />
                      </svg>
                      <span className="absolute text-lg font-bold text-white">{calorieGoalProgress}%</span>
                    </div>
                    <p className="text-xs font-bold text-slate-400 mt-2">カロリー目標</p>
                    <p className="text-[10px] text-slate-500 text-center">目標 {GOAL_CALORIES} kcal/日</p>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="relative w-24 h-24 flex items-center justify-center">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle cx="48" cy="48" r="40" fill="transparent" stroke="#1a331a" strokeWidth="8" />
                        <circle
                          cx="48"
                          cy="48"
                          r="40"
                          fill="transparent"
                          stroke="#19e619"
                          strokeDasharray={2 * Math.PI * 40}
                          strokeDashoffset={2 * Math.PI * 40 * (1 - proteinProgress / 100)}
                          strokeLinecap="round"
                          strokeWidth="8"
                        />
                      </svg>
                      <span className="absolute text-lg font-bold text-white">{proteinProgress}%</span>
                    </div>
                    <p className="text-xs font-bold text-slate-400 mt-2">タンパク質</p>
                    <p className="text-[10px] text-slate-500 text-center">目標 {GOAL_PROTEIN}g/日</p>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="relative w-24 h-24 flex items-center justify-center">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle cx="48" cy="48" r="40" fill="transparent" stroke="#1a331a" strokeWidth="8" />
                        <circle
                          cx="48"
                          cy="48"
                          r="40"
                          fill="transparent"
                          stroke="#19e619"
                          strokeDasharray={2 * Math.PI * 40}
                          strokeDashoffset={2 * Math.PI * 40 * (1 - adherenceProgress / 100)}
                          strokeLinecap="round"
                          strokeWidth="8"
                        />
                      </svg>
                      <span className="absolute text-lg font-bold text-white">{adherenceProgress}%</span>
                    </div>
                    <p className="text-xs font-bold text-slate-400 mt-2">達成率</p>
                    <p className="text-[10px] text-slate-500 text-center">目標達成した日 / 記録日</p>
                  </div>
                </div>
              </section>

              {/* カロリー棒グラフ + スコア（参考: Volume vs Weight） */}
              {chartData.length > 0 && (
                <section className="bg-[#1a331a] border border-[#244724] rounded-xl p-4">
                  <h2 className="text-sm font-bold text-slate-300 mb-3">日別カロリー・スコア</h2>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData.slice(-14)} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#244724" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(v) => (isValid(parseISO(v)) ? format(parseISO(v), "M/d", { locale: ja }) : v)}
                          tick={{ fontSize: 10, fill: "#94a3b8" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: "#94a3b8" }}
                          axisLine={false}
                          tickLine={false}
                          width={40}
                          tickFormatter={(v) => v.toLocaleString()}
                        />
                        <Tooltip
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length || label == null) return null;
                            const labelStr = String(label);
                            const d = payload[0]?.payload;
                            const parsed = parseISO(labelStr);
                            return (
                              <div className="bg-[#0e1c0e] border border-[#244724] rounded-lg px-3 py-2 shadow-xl text-xs">
                                <p className="text-slate-400 mb-1">
                                  {isValid(parsed) ? format(parsed, "M/d (EEE)", { locale: ja }) : labelStr}
                                </p>
                                <p className="text-white font-bold">{d?.calories ?? 0} kcal</p>
                                {d?.score != null && <p className={scoreColor(d.score)}>スコア {d.score}</p>}
                              </div>
                            );
                          }}
                        />
                        <ReferenceLine y={GOAL_CALORIES} stroke="#ef4444" strokeDasharray="4 4" strokeOpacity={0.6} />
                        <Bar dataKey="calories" radius={[4, 4, 0, 0]} barSize={20}>
                          {chartData.slice(-14).map((entry, i) => (
                            <Cell
                              key={i}
                              fill={entry.calories > GOAL_CALORIES ? "#f59e0b" : "#19e619"}
                              fillOpacity={0.9}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>
              )}

              {/* 最近の日別一覧（参考: Recent Personal Records テーブル） */}
              <section className="bg-[#1a331a] border border-[#244724] rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-slate-300">日別データ</h2>
                  <Link href="/days" className="text-xs font-medium text-[#19e619] hover:underline">
                    履歴一覧
                  </Link>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-slate-500 text-xs uppercase tracking-wider border-b border-[#244724]">
                        <th className="text-left py-2 px-2">日付</th>
                        <th className="text-right py-2 px-2">カロリー</th>
                        <th className="text-right py-2 px-2">スコア</th>
                        <th className="text-right py-2 px-2">P</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDays.slice(0, 15).map((d) => (
                        <tr key={d.date} className="border-b border-[#244724]/50 hover:bg-[#214021]/50">
                          <td className="py-2.5 px-2 text-slate-300">
                            {isValid(parseISO(d.date)) ? format(parseISO(d.date), "M/d (EEE)", { locale: ja }) : d.date}
                          </td>
                          <td className={`py-2.5 px-2 text-right font-medium tabular-nums ${calorieColor(d.calories)}`}>
                            {d.calories > 0 ? `${d.calories}` : "—"}
                          </td>
                          <td className={`py-2.5 px-2 text-right font-medium tabular-nums ${d.hasEvaluation ? scoreColor(d.score) : "text-slate-500"}`}>
                            {d.hasEvaluation ? d.score : "—"}
                          </td>
                          <td className="py-2.5 px-2 text-right text-slate-400 tabular-nums">{d.pfc?.p ?? "—"}</td>
                          <td className="py-2.5 px-2">
                            <Link
                              href={`/day/${d.date}`}
                              className="text-slate-500 hover:text-[#19e619] transition-colors inline-flex"
                              aria-label="詳細"
                            >
                              <span className="material-symbols-outlined text-lg">chevron_right</span>
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
