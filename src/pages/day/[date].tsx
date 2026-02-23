import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Link from "next/link";
import Head from "next/head";
import { getStoredSystemPrompt } from "../../lib/aiPromptStorage";

type StrongExercise = { name: string; sets: number; volumeKg?: number; reps?: number };
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
  calories?: number;
  pfc?: { protein: number; fat: number; carbs: number };
  asken?: { date?: string; items?: AskenItem[]; nutrients?: Record<string, Record<string, string>> };
  strong?: StrongData | null;
};

const GOAL_CALORIES = 2267;
const GOAL_PFC = { protein: 150, fat: 54, carbs: 293 };

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

type AiEval = { id: string; response: string; model: string; trigger: string; createdAt: string };

export default function DayPage() {
  const router = useRouter();
  const { date } = router.query;
  const [data, setData] = useState<DayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // AI 評価
  const [aiEval, setAiEval] = useState<AiEval | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);

  useEffect(() => {
    if (!date || typeof date !== "string") return;
    const noCache = { cache: "no-store" as RequestCache };
    fetch(`/api/day/${date}`, noCache)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then(setData)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));

    // AI 評価履歴を取得（常に最新を取得）
    fetch(`/api/ai/history?date=${date}&type=daily`, noCache)
      .then((r) => r.json())
      .then((d) => {
        if (d.evaluations?.length > 0) setAiEval(d.evaluations[0]);
      })
      .catch(() => {});
  }, [date]);

  /** AI 評価を手動実行 */
  const handleEvaluate = async () => {
    if (!date || typeof date !== "string") return;
    setEvaluating(true);
    setEvalError(null);
    try {
      const systemPrompt = getStoredSystemPrompt();
      const body: { date: string; type: "daily"; trigger: "manual"; systemPrompt?: string } = { date, type: "daily", trigger: "manual" };
      if (systemPrompt) body.systemPrompt = systemPrompt;
      const res = await fetch("/api/ai/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (res.ok && d.success) {
        setAiEval({ id: d.evaluation.id, response: d.evaluation.response, model: d.evaluation.model, trigger: d.evaluation.trigger, createdAt: d.evaluation.createdAt });
      } else {
        setEvalError(d.error || "評価に失敗しました");
      }
    } catch (e) {
      setEvalError(e instanceof Error ? e.message : String(e));
    } finally { setEvaluating(false); }
  };

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

  // 合計カロリー（API の calories を優先、なければ items から算出）
  const totalCalories = data?.calories ?? data?.asken?.items?.reduce((sum, i) => sum + (i.calories || 0), 0) ?? 0;
  const pfc = data?.pfc ?? { protein: 0, fat: 0, carbs: 0 };
  const kcalLeft = Math.max(0, GOAL_CALORIES - totalCalories);
  const circumference = 2 * Math.PI * 70;
  const calPct = Math.min(1, totalCalories / GOAL_CALORIES);
  const calOffset = circumference * (1 - calPct);

  const formatDateLabel = (d: string) => {
    try {
      const [y, m, day] = d.split("-").map(Number);
      const date = new Date(y, m - 1, day);
      return date.toLocaleDateString("ja-JP", { month: "long", day: "numeric", year: "numeric" });
    } catch {
      return d;
    }
  };

  return (
    <div className="min-h-screen bg-[#112211] text-slate-100 font-sans">
      <Head>
        <title>{date} - Nutrition</title>
      </Head>

      <header className="bg-[#112211] border-b border-[#244724] sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/days" className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
              <span className="material-symbols-outlined text-xl">arrow_back</span>
            </Link>
            <div>
              <h1 className="text-lg font-bold text-white">{date ? formatDateLabel(date) : date}</h1>
              <p className="text-xs text-[#19e619] font-medium">日別レポート</p>
            </div>
          </div>
          <Link href="/" className="text-sm font-medium text-slate-400 hover:text-white transition-colors py-2 px-3 rounded-lg">
            ダッシュボード
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 pb-24">
        {loading ? (
          <div className="space-y-6">
            <div className="h-64 bg-[#1a331a] border border-[#244724] rounded-2xl animate-pulse" />
            <div className="h-48 bg-[#1a331a] border border-[#244724] rounded-xl animate-pulse" />
          </div>
        ) : notFound || !data ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-[#1a331a] border border-[#244724] rounded-full mx-auto flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-4xl text-slate-500">info</span>
            </div>
            <p className="text-slate-400 text-lg">この日のデータはありません</p>
            <Link href="/days" className="text-[#19e619] hover:underline text-sm mt-2 inline-block font-medium">
              日付一覧に戻る
            </Link>
          </div>
        ) : (
          <>
            {/* ドーナツ＋PFC（参考デザイン右パネル風） */}
            <div className="bg-[#1a331a] border border-[#244724] rounded-2xl p-6 mb-6">
              <div className="flex flex-col items-center justify-center">
                <div className="relative w-40 h-40 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90" aria-hidden>
                    <circle cx="80" cy="80" fill="transparent" r="70" stroke="#1a331a" strokeWidth="12" />
                    <circle
                      cx="80" cy="80" fill="transparent" r="70"
                      stroke={totalCalories > GOAL_CALORIES ? "#ef4444" : "#19e619"}
                      strokeDasharray={circumference}
                      strokeDashoffset={calOffset}
                      strokeLinecap="round"
                      strokeWidth="12"
                      className="transition-all duration-500"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-black text-white tabular-nums">{totalCalories}</span>
                    <span className="text-xs uppercase font-bold text-slate-400 tracking-wider">残り: {kcalLeft} kcal</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 w-full mt-6">
                  <div className="flex flex-col items-center text-center">
                    <span className="text-xs font-bold text-slate-400 mb-1">たんぱく質</span>
                    <span className="text-lg font-black text-[#19e619]">{Math.round(pfc.protein)}g</span>
                    <span className="text-[10px] text-slate-500">目標: {GOAL_PFC.protein}g</span>
                  </div>
                  <div className="flex flex-col items-center text-center">
                    <span className="text-xs font-bold text-slate-400 mb-1">炭水化物</span>
                    <span className="text-lg font-black text-orange-400">{Math.round(pfc.carbs)}g</span>
                    <span className="text-[10px] text-slate-500">目標: {GOAL_PFC.carbs}g</span>
                  </div>
                  <div className="flex flex-col items-center text-center">
                    <span className="text-xs font-bold text-slate-400 mb-1">脂質</span>
                    <span className="text-lg font-black text-blue-400">{Math.round(pfc.fat)}g</span>
                    <span className="text-[10px] text-slate-500">目標: {GOAL_PFC.fat}g</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 食事セクション（朝食/昼食/夕食/間食） */}
            <div className="space-y-6">
              {Object.keys(groupedMeals).length > 0 ? (
                Object.entries(groupedMeals).map(([mealType, items]) => {
                  const mealTotal = items.reduce((s, i) => s + (i.calories || 0), 0);
                  return (
                    <div key={mealType} className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                          {MEAL_TYPE_LABELS[mealType] ?? mealType}
                        </h4>
                        <span className="text-xs font-medium text-slate-500">{mealTotal} kcal</span>
                      </div>
                      <div className="space-y-2">
                        {items.map((item, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-3 p-3 rounded-lg bg-[#1a331a] border border-[#244724] hover:border-[#19e619]/30 transition-all"
                          >
                            <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center text-xl shrink-0">
                              {mealType === "朝食" ? "🥣" : mealType === "昼食" ? "🍽️" : mealType === "夕食" ? "🍴" : "🍪"}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-white truncate">{item.name}</p>
                              <p className="text-xs text-slate-400 font-medium truncate">
                                {item.amount && `${item.amount} • `}{item.calories} kcal
                              </p>
                            </div>
                            <span className="text-sm font-bold text-slate-300 tabular-nums">{item.calories}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="flex flex-col gap-3">
                  <h4 className="text-sm font-bold uppercase tracking-wider text-slate-300">食事</h4>
                  <div className="rounded-lg border border-dashed border-[#244724] p-6 text-center text-slate-500 text-sm">
                    食事データなし
                  </div>
                </div>
              )}
            </div>

            {/* 筋トレカード */}
            <div className="mt-8 bg-[#1a331a] border border-[#244724] rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-[#19e619]/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#19e619] text-xl">fitness_center</span>
                </div>
                <h2 className="font-bold text-white text-lg">筋トレ (Strong)</h2>
              </div>
              {hasStrong ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-[#112211] rounded-lg p-3 text-center border border-[#244724]">
                      <p className="text-xs text-slate-500">ワークアウト</p>
                      <p className="text-lg font-bold text-white">{data.strong!.totals?.workouts ?? data.strong!.workouts!.length}</p>
                    </div>
                    <div className="bg-[#112211] rounded-lg p-3 text-center border border-[#244724]">
                      <p className="text-xs text-slate-500">セット数</p>
                      <p className="text-lg font-bold text-white">{data.strong!.totals?.sets ?? 0}</p>
                    </div>
                    <div className="bg-[#112211] rounded-lg p-3 text-center border border-[#244724]">
                      <p className="text-xs text-slate-500">ボリューム</p>
                      <p className="text-lg font-bold text-white">
                        {data.strong!.totals?.volumeKg != null ? `${data.strong!.totals.volumeKg.toLocaleString()} kg` : "-"}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {data.strong!.workouts!.map((w, i) => (
                      <div key={i} className="border border-[#244724] rounded-lg p-4 bg-[#112211]">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-white">{w.title ?? "ワークアウト"}</span>
                          {w.totals && (
                            <span className="text-xs text-slate-500 bg-[#1a331a] px-2 py-1 rounded-md">
                              {w.totals.sets} sets
                              {w.totals.volumeKg != null && ` / ${w.totals.volumeKg.toLocaleString()} kg`}
                            </span>
                          )}
                        </div>
                        {w.exercises && w.exercises.length > 0 && (
                          <div className="space-y-1.5">
                            {w.exercises.map((e, j) => (
                              <div key={j} className="flex items-center justify-between text-sm py-1.5 border-b border-[#244724]/50 last:border-b-0 text-slate-300">
                                <span>{e.name}</span>
                                <div className="flex items-center gap-3 text-slate-500 text-xs">
                                  <span>{e.sets} sets</span>
                                  {e.reps != null && (e.volumeKg === 0 || e.volumeKg == null) ? (
                                    <span className="font-medium text-slate-400">{e.reps} 分</span>
                                  ) : e.volumeKg != null && e.volumeKg > 0 ? (
                                    <span className="font-medium text-slate-400">{e.volumeKg.toLocaleString()} kg</span>
                                  ) : null}
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
                <div className="text-center py-8 rounded-lg border border-dashed border-[#244724] text-slate-500 text-sm">
                  この日の筋トレデータはありません
                </div>
              )}
            </div>

            {/* AI 評価 */}
            <div className="mt-8 bg-[#1a331a] border border-[#244724] rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#19e619]/10 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[#19e619] text-xl">psychology</span>
                  </div>
                  <h2 className="font-bold text-white text-lg">AI 食事評価</h2>
                </div>
                <button
                  onClick={handleEvaluate}
                  disabled={evaluating}
                  className="px-4 py-2 bg-[#19e619] text-[#112211] text-sm font-bold rounded-lg hover:bg-[#15c515] disabled:opacity-50 transition-all active:scale-[0.98] flex items-center gap-2"
                >
                  {evaluating && <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
                  {evaluating ? "評価中..." : aiEval ? "再評価" : "この日を評価"}
                </button>
              </div>
              {evalError && <p className="text-sm text-red-400 mb-3">{evalError}</p>}
              {aiEval ? (
                <div>
                  <div className="flex items-center gap-3 mb-3 text-xs text-slate-500">
                    <span>{aiEval.model}</span>
                    <span>{aiEval.trigger === "cron" ? "自動評価" : "手動評価"}</span>
                    <span>{new Date(aiEval.createdAt).toLocaleString("ja-JP")}</span>
                  </div>
                  <div className="bg-[#112211] border border-[#244724] rounded-lg p-5 text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                    {aiEval.response}
                  </div>
                </div>
              ) : (
                <p className="text-slate-400 text-sm py-4 text-center">
                  まだこの日のAI評価はありません。ボタンを押すと評価を生成します。
                </p>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
