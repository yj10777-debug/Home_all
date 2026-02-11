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

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      <Head>
        <title>{date} - データ管理</title>
      </Head>
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-800">{date}</h1>
          <Link href="/days" className="text-sm text-blue-600 hover:underline">日付一覧</Link>
        </div>
      </header>
      <main className="max-w-md mx-auto px-4 py-6 space-y-6">
        {loading ? (
          <div className="text-gray-500">読み込み中...</div>
        ) : notFound || !data ? (
          <p className="text-gray-500 py-8">データなし</p>
        ) : (
          <>
            {data.asken && (
              <section className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <h2 className="font-bold text-gray-800 mb-3">あすけん（食事）</h2>
                {data.asken.items && data.asken.items.length > 0 ? (
                  <ul className="space-y-2">
                    {data.asken.items.map((item, i) => (
                      <li key={i} className="text-sm">
                        <span className="text-gray-500">{item.mealType}</span> {item.name} — {item.calories} kcal
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-500 text-sm">データなし</p>
                )}
              </section>
            )}
            <section className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
              <h2 className="font-bold text-gray-800 mb-3">Strong（筋トレ）</h2>
              {hasStrong ? (
                <div className="space-y-4">
                  <div className="text-sm text-gray-600">
                    workouts {data.strong!.totals?.workouts ?? data.strong!.workouts!.length ?? 0}件 / sets {data.strong!.totals?.sets ?? 0}
                    {data.strong!.totals?.volumeKg != null && ` / volumeKg ${data.strong!.totals.volumeKg}`}
                  </div>
                  <ul className="space-y-4">
                    {data.strong!.workouts!.map((w, i) => (
                      <li key={i} className="text-sm border-t border-gray-100 pt-3 first:border-t-0 first:pt-0">
                        <div className="font-medium text-gray-800">
                          {w.title ?? "ワークアウト"}
                          {w.totals && (
                            <span className="text-gray-500 font-normal ml-2">
                              — sets {w.totals.sets}
                              {w.totals.volumeKg != null && ` / ${w.totals.volumeKg} kg`}
                            </span>
                          )}
                        </div>
                        {w.exercises && w.exercises.length > 0 && (
                          <ul className="mt-1 ml-3 space-y-1 text-gray-600">
                            {w.exercises.map((e, j) => (
                              <li key={j}>
                                {e.name} — {e.sets} sets
                                {e.volumeKg != null && ` (${e.volumeKg} kg)`}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-gray-500 text-sm">Strongデータなし</p>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
