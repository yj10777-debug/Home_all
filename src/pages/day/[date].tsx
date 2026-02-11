import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Link from "next/link";
import Head from "next/head";

type StrongExercise = { name: string; sets: number; volumeKg?: number };
type StrongWorkout = {
  title?: string;
  totals?: { sets: number; reps?: number; volumeKg?: number };
  exercises?: StrongExercise[];
};
type StrongData = {
  date?: string;
  workouts?: StrongWorkout[];
  totals?: { workouts: number; sets: number; volumeKg?: number };
};
type AskenItem = { mealType: string; name: string; amount: string; calories: number };
type DayData = {
  date: string;
  asken?: { date?: string; items?: AskenItem[]; nutrients?: Record<string, Record<string, string>> };
  strong?: StrongData | null;
};

/** 食事タイプの日本語マッピング */
const MEAL_TYPE_LABELS: Record<string, string> = {
  "朝食": "朝食",
  "昼食": "昼食",
  "夕食": "夕食",
  "間食": "間食",
};

/** 食事タイプごとのアイコン色 */
const MEAL_TYPE_COLORS: Record<string, string> = {
  "朝食": "bg-amber-400",
  "昼食": "bg-blue-400",
  "夕食": "bg-indigo-400",
  "間食": "bg-pink-400",
};

export default function DayPage() {
  const router = useRouter();
  const { date } = router.query;
  const [data, setData] = useState<DayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!date || typeof date !== "string") return;
    fetch(`/api/day?date=${date}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then(setData)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [date]);

  if (!date || typeof date !== "string") return null;

  const hasStrong = data?.strong && (data.strong.workouts?.length ?? 0) > 0;

  // 食事アイテムをmealTypeごとにグルーピング
  const groupedMeals: Record<string, AskenItem[]> = {};
  if (data?.asken?.items) {
    for (const item of data.asken.items) {
      const type = item.mealType || "その他";
      if (!groupedMeals[type]) groupedMeals[type] = [];
      groupedMeals[type].push(item);
    }
  }

  // 合計カロリー
  const totalCalories = data?.asken?.items?.reduce((sum, i) => sum + (i.calories || 0), 0) ?? 0;

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      <Head>
        <title>{date} - Nutrition Tracker</title>
      </Head>

      {/* ヘッダー */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/days" className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{date}</h1>
              <p className="text-xs text-gray-500">日別レポート</p>
            </div>
          </div>
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
            ダッシュボード
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-[400px] bg-gray-100 animate-pulse rounded-2xl" />
            <div className="h-[400px] bg-gray-100 animate-pulse rounded-2xl" />
          </div>
        ) : notFound || !data ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-gray-500 text-lg">この日のデータはありません</p>
            <Link href="/days" className="text-emerald-600 hover:underline text-sm mt-2 inline-block">
              日付一覧に戻る
            </Link>
          </div>
        ) : (
          <>
            {/* サマリーバー */}
            {data.asken && (
              <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-6 shadow-sm">
                <div className="flex items-center gap-6 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">合計カロリー:</span>
                    <span className="text-xl font-bold text-gray-900">{totalCalories.toLocaleString()} kcal</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">品目数:</span>
                    <span className="text-lg font-semibold text-gray-700">{data.asken.items?.length ?? 0}</span>
                  </div>
                  {hasStrong && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">ワークアウト:</span>
                      <span className="text-lg font-semibold text-gray-700">{data.strong!.workouts!.length}回</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 食事カード */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
                    </svg>
                  </div>
                  <h2 className="font-semibold text-gray-900 text-lg">食事内容</h2>
                </div>

                {Object.keys(groupedMeals).length > 0 ? (
                  <div className="space-y-5">
                    {Object.entries(groupedMeals).map(([mealType, items]) => {
                      const mealTotal = items.reduce((s, i) => s + (i.calories || 0), 0);
                      return (
                        <div key={mealType}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className={`w-2.5 h-2.5 rounded-full ${MEAL_TYPE_COLORS[mealType] ?? 'bg-gray-400'}`} />
                              <span className="text-sm font-semibold text-gray-700">
                                {MEAL_TYPE_LABELS[mealType] ?? mealType}
                              </span>
                            </div>
                            <span className="text-sm font-medium text-gray-500">{mealTotal} kcal</span>
                          </div>
                          <div className="ml-5 space-y-1">
                            {items.map((item, i) => (
                              <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-b-0">
                                <div>
                                  <span className="text-sm text-gray-700">{item.name}</span>
                                  {item.amount && (
                                    <span className="text-xs text-gray-400 ml-2">{item.amount}</span>
                                  )}
                                </div>
                                <span className="text-sm text-gray-500 tabular-nums">{item.calories} kcal</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm py-4 text-center">食事データなし</p>
                )}
              </div>

              {/* 筋トレカード */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <h2 className="font-semibold text-gray-900 text-lg">筋トレ (Strong)</h2>
                </div>

                {hasStrong ? (
                  <div className="space-y-5">
                    {/* サマリー */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-blue-50 rounded-xl p-3 text-center">
                        <p className="text-xs text-blue-500">ワークアウト</p>
                        <p className="text-lg font-bold text-blue-700">
                          {data.strong!.totals?.workouts ?? data.strong!.workouts!.length}
                        </p>
                      </div>
                      <div className="bg-blue-50 rounded-xl p-3 text-center">
                        <p className="text-xs text-blue-500">セット数</p>
                        <p className="text-lg font-bold text-blue-700">{data.strong!.totals?.sets ?? 0}</p>
                      </div>
                      <div className="bg-blue-50 rounded-xl p-3 text-center">
                        <p className="text-xs text-blue-500">ボリューム</p>
                        <p className="text-lg font-bold text-blue-700">
                          {data.strong!.totals?.volumeKg != null
                            ? `${data.strong!.totals.volumeKg.toLocaleString()} kg`
                            : "-"}
                        </p>
                      </div>
                    </div>

                    {/* ワークアウト一覧 */}
                    <div className="space-y-4">
                      {data.strong!.workouts!.map((w, i) => (
                        <div key={i} className="border border-gray-100 rounded-xl p-4">
                          <div className="flex items-center justify-between mb-3">
                            <span className="font-medium text-gray-800">{w.title ?? "ワークアウト"}</span>
                            {w.totals && (
                              <span className="text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded-md">
                                {w.totals.sets} sets
                                {w.totals.volumeKg != null && ` / ${w.totals.volumeKg.toLocaleString()} kg`}
                              </span>
                            )}
                          </div>
                          {w.exercises && w.exercises.length > 0 && (
                            <div className="space-y-1.5">
                              {w.exercises.map((e, j) => (
                                <div key={j} className="flex items-center justify-between text-sm py-1 border-b border-gray-50 last:border-b-0">
                                  <span className="text-gray-600">{e.name}</span>
                                  <div className="flex items-center gap-3 text-gray-500 text-xs">
                                    <span>{e.sets} sets</span>
                                    {e.volumeKg != null && (
                                      <span className="font-medium text-gray-700">{e.volumeKg.toLocaleString()} kg</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-10">
                    <div className="w-12 h-12 bg-gray-100 rounded-full mx-auto flex items-center justify-center mb-3">
                      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                      </svg>
                    </div>
                    <p className="text-gray-400 text-sm">この日の筋トレデータはありません</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
