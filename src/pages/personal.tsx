import { useState, useEffect, useCallback } from "react";
import Head from "next/head";
import type { Personal, Goals } from "../lib/dbConfig";
import { getCaloriePurpose, getPfcRatios, computeGoalsFromPersonal } from "../lib/goalsPurpose";

const DEFAULT_GOALS: Goals = { calories: 2267, protein: 150, fat: 54, carbs: 293 };

const ACTIVITY_LEVEL_ORDER: Record<string, number> = {
  very_low: 0,
  low: 1,
  medium: 2,
  high: 3,
};

type DayRow = { date: string; hasStrong: boolean; steps?: number | null };

/** 直近14日間の筋トレ日数・平均歩数（強度は問わない）を算出。画面表示用 */
function getRecentActivityStats(
  days: DayRow[],
  withinDays = 14
): { workoutDays: number; avgSteps: number | null } {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - withinDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const recent = days.filter((d) => d.date >= cutoffStr);
  const workoutDays = recent.filter((d) => d.hasStrong).length;
  const stepsValues = recent.map((d) => d.steps).filter((s): s is number => typeof s === "number" && s >= 0);
  const avgSteps =
    stepsValues.length > 0 ? Math.round(stepsValues.reduce((a, b) => a + b, 0) / stepsValues.length) : null;
  return { workoutDays, avgSteps };
}

/** 上記の数値から推奨活動レベルを算出（筋トレ少なくても歩数多ければ高いを推奨） */
function getRecommendedActivityLevel(days: DayRow[], withinDays = 14): { level: string; workoutDays: number; avgSteps: number | null } | null {
  const { workoutDays, avgSteps } = getRecentActivityStats(days, withinDays);
  const levelFromWorkout =
    workoutDays >= 6 ? 3 : workoutDays >= 3 ? 2 : workoutDays >= 1 ? 1 : 0;
  const levelFromSteps =
    avgSteps == null ? 0 : avgSteps >= 12000 ? 3 : avgSteps >= 8000 ? 2 : avgSteps >= 5000 ? 1 : 0;
  const combinedLevel = Math.max(levelFromWorkout, levelFromSteps);
  const level =
    combinedLevel >= 3 ? "high" : combinedLevel >= 2 ? "medium" : combinedLevel >= 1 ? "low" : null;
  if (!level) return null;
  return { level, workoutDays, avgSteps };
}

const ACTIVITY_OPTIONS: { value: string; label: string; description: string }[] = [
  { value: "", label: "未選択", description: "" },
  {
    value: "very_low",
    label: "非常に低い",
    description: "ほぼ在宅・運動ほぼなし（歩数少なめ、デスク中心）",
  },
  {
    value: "low",
    label: "低い",
    description: "在宅メイン・通勤少なめ、運動は週1未満",
  },
  {
    value: "medium",
    label: "普通",
    description: "出社あり・筋トレや運動が週1〜2程度",
  },
  {
    value: "high",
    label: "高い",
    description: "筋トレ週3以上（例: 在宅3・出社2で筋トレ週4 → ここ）",
  },
];

const SEX_OPTIONS = [
  { value: "", label: "未選択" },
  { value: "male", label: "男性" },
  { value: "female", label: "女性" },
];

/** API の personal をフォーム用に正規化（数値・文字列混在対策） */
function normalizePersonal(raw: unknown): Personal {
  if (!raw || typeof raw !== "object") {
    return { heightCm: null, weightKg: null, age: null, sex: null, activityLevel: null };
  }
  const o = raw as Record<string, unknown>;
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" ? (Number(v) || null) : null;
  return {
    heightCm: num(o.heightCm),
    weightKg: num(o.weightKg),
    age: num(o.age),
    sex: typeof o.sex === "string" ? o.sex : null,
    activityLevel: typeof o.activityLevel === "string" ? o.activityLevel : null,
  };
}

function bmiLabel(heightCm: number, weightKg: number): string {
  if (heightCm <= 0) return "";
  const h = heightCm / 100;
  const bmi = weightKg / (h * h);
  if (bmi < 18.5) return "BMI やせ";
  if (bmi < 25) return "BMI 普通";
  if (bmi < 30) return "BMI 肥満1度";
  return "BMI 肥満2度～";
}

export default function PersonalPage() {
  const [personal, setPersonal] = useState<Personal>({
    heightCm: null,
    weightKg: null,
    age: null,
    sex: null,
    activityLevel: null,
  });
  const [goals, setGoals] = useState<Goals>(DEFAULT_GOALS);
  const [loading, setLoading] = useState(true);
  /** DB から設定を取得済みか。推奨ポップアップはこの後にのみ表示する */
  const [configLoaded, setConfigLoaded] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [recommendPopup, setRecommendPopup] = useState<{
    recommended: string;
    workoutDaysIn14: number;
    avgSteps: number | null;
  } | null>(null);
  const [recentStats, setRecentStats] = useState<{ workoutDays: number; avgSteps: number | null } | null>(null);

  // 初回表示・再表示時に必ず DB から設定を取得して表示する
  useEffect(() => {
    let cancelled = false;
    fetch("/api/config", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) return r.json().then((data) => ({ ok: false, data }));
        return r.json().then((data) => ({ ok: true, data }));
      })
      .then(({ ok, data }) => {
        if (cancelled) return;
        setConfigLoaded(true);
        if (!ok || data?.error) return;
        const personalData = normalizePersonal(data?.personal);
        const goalsData = data?.goals ?? DEFAULT_GOALS;
        setPersonal(personalData);
        const computed = computeGoalsFromPersonal(personalData);
        const isDefaultGoals =
          goalsData.calories === DEFAULT_GOALS.calories &&
          goalsData.protein === DEFAULT_GOALS.protein &&
          goalsData.fat === DEFAULT_GOALS.fat &&
          goalsData.carbs === DEFAULT_GOALS.carbs;
        if (computed && isDefaultGoals) {
          setGoals(computed);
        } else {
          setGoals(goalsData);
        }
      })
      .catch(() => {
        if (!cancelled) setConfigLoaded(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // 推奨ポップアップは「設定読込済み」かつ「すでに活動レベルを登録済み」のときだけ表示（未登録時は出さない）
  useEffect(() => {
    if (loading || !configLoaded) return;
    const hasActivityLevel = personal.activityLevel != null && personal.activityLevel !== "";
    if (!hasActivityLevel) return;
    fetch("/api/days", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        const days = data?.days as DayRow[] | undefined;
        if (!Array.isArray(days) || days.length === 0) {
          setRecentStats(null);
          return;
        }
        setRecentStats(getRecentActivityStats(days));
        const result = getRecommendedActivityLevel(days);
        if (!result) return;
        const currentOrder = ACTIVITY_LEVEL_ORDER[personal.activityLevel ?? ""] ?? -1;
        const recommendedOrder = ACTIVITY_LEVEL_ORDER[result.level] ?? 0;
        if (recommendedOrder <= currentOrder) return;
        setRecommendPopup({
          recommended: result.level,
          workoutDaysIn14: result.workoutDays,
          avgSteps: result.avgSteps,
        });
      })
      .catch(() => setRecentStats(null));
  }, [loading, configLoaded, personal.activityLevel]);

  const handlePersonalChange = <K extends keyof Personal>(field: K, value: Personal[K]) => {
    setPersonal((prev) => ({ ...prev, [field]: value }));
  };

  const handleGoalsChange = (field: keyof Goals, value: number) => {
    setGoals((prev) => ({ ...prev, [field]: Math.max(0, value) }));
  };

  const applyRecommendation = useCallback(() => {
    if (!recommendPopup) return;
    const newLevel = recommendPopup.recommended;
    setPersonal((prev) => ({ ...prev, activityLevel: newLevel }));
    setRecommendPopup(null);
    fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        personal: {
          heightCm: personal.heightCm ?? null,
          weightKg: personal.weightKg ?? null,
          age: personal.age ?? null,
          sex: personal.sex ?? null,
          activityLevel: newLevel,
        },
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data?.personal) setPersonal(normalizePersonal(data.personal));
        setSaved("活動レベルを更新しました。");
        setTimeout(() => setSaved(null), 3000);
      })
      .catch(() => {});
  }, [recommendPopup, personal.heightCm, personal.weightKg, personal.age, personal.sex]);

  const handleSave = () => {
    setSaved(null);
    fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        personal: {
          heightCm: personal.heightCm ?? null,
          weightKg: personal.weightKg ?? null,
          age: personal.age ?? null,
          sex: personal.sex ?? null,
          activityLevel: personal.activityLevel ?? null,
        },
        goals,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data?.personal) setPersonal(normalizePersonal(data.personal));
        if (data?.goals) setGoals(data.goals);
        setSaved("保存しました。");
        setTimeout(() => setSaved(null), 3000);
      })
      .catch(() => setSaved("保存に失敗しました。"));
  };

  const bmi =
    personal.heightCm != null &&
    personal.heightCm > 0 &&
    personal.weightKg != null &&
    personal.weightKg > 0
      ? bmiLabel(personal.heightCm, personal.weightKg)
      : null;
  const ratios = getPfcRatios(goals);
  const caloriePurpose = getCaloriePurpose(goals.calories);

  const recommendedLabel = recommendPopup
    ? ACTIVITY_OPTIONS.find((o) => o.value === recommendPopup.recommended)?.label ?? recommendPopup.recommended
    : "";

  return (
    <>
      <Head>
        <title>パーソナル - からだノート</title>
      </Head>

      {recommendPopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="recommend-title"
        >
          <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-xl shadow-xl max-w-sm w-full p-5">
            <h2 id="recommend-title" className="text-lg font-bold text-[var(--text-primary)] mb-2">
              活動レベルの変更を推奨します
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              直近14日間の入力データ（筋トレ<strong>{recommendPopup.workoutDaysIn14}日</strong>
              {recommendPopup.avgSteps != null && (
                <>・平均歩数<strong>{recommendPopup.avgSteps.toLocaleString()}歩</strong>/日</>
              )}
              ）から、設定を「<strong>{recommendedLabel}</strong>」にすると入力と一致しやすくなります。
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setRecommendPopup(null)}
                className="px-3 py-2 text-sm font-medium rounded-lg border border-[var(--border-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"
              >
                閉じる
              </button>
              <button
                type="button"
                onClick={applyRecommendation}
                className="px-3 py-2 text-sm font-bold rounded-lg bg-[var(--primary)] text-[var(--btn-primary-text)] hover:bg-[var(--primary-hover)]"
              >
                「{recommendedLabel}」に変更する
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-1">パーソナル</h1>
          <p className="text-[var(--text-tertiary)] text-sm mb-6">体や数値はここで入力できます。データがなくても設定して保存できます。</p>

          {loading ? (
            <div className="h-64 bg-[var(--bg-card)] rounded-xl animate-pulse flex items-center justify-center text-[var(--text-tertiary)] text-sm">
              読み込み中...
            </div>
          ) : (
            <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-xl p-6 space-y-6">
              {/* からだ */}
              <section>
                <h2 className="text-sm font-bold text-[var(--text-primary)] mb-3">からだ</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-[var(--text-tertiary)] mb-0.5">身長 (cm)</label>
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={personal.heightCm ?? ""}
                      onChange={(e) =>
                        handlePersonalChange("heightCm", e.target.value === "" ? null : Number(e.target.value))
                      }
                      placeholder="170"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] text-[var(--text-primary)] text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--text-tertiary)] mb-0.5">体重 (kg)</label>
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={personal.weightKg ?? ""}
                      onChange={(e) =>
                        handlePersonalChange("weightKg", e.target.value === "" ? null : Number(e.target.value))
                      }
                      placeholder="70"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] text-[var(--text-primary)] text-sm"
                    />
                    {bmi && <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{bmi}</p>}
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--text-tertiary)] mb-0.5">年齢 (歳)</label>
                    <input
                      type="number"
                      min={0}
                      max={120}
                      value={personal.age ?? ""}
                      onChange={(e) =>
                        handlePersonalChange("age", e.target.value === "" ? null : Number(e.target.value))
                      }
                      placeholder="35"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] text-[var(--text-primary)] text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--text-tertiary)] mb-0.5">性別</label>
                    <select
                      value={personal.sex ?? ""}
                      onChange={(e) => handlePersonalChange("sex", e.target.value || null)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] text-[var(--text-primary)] text-sm"
                    >
                      {SEX_OPTIONS.map((opt) => (
                        <option key={opt.value || "n"} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-[var(--text-tertiary)] mb-0.5">活動レベル</label>
                    <div className="mb-2 px-2.5 py-2 rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] text-[var(--text-secondary)] text-xs">
                      {recentStats != null ? (
                        <>
                          <span className="font-medium text-[var(--text-primary)]">直近14日間:</span>
                          {" "}
                          平均歩数 {recentStats.avgSteps != null ? `${recentStats.avgSteps.toLocaleString()}歩/日` : "—"}
                          {" ・ "}
                          筋トレ {recentStats.workoutDays}日
                        </>
                      ) : (
                        <span className="text-[var(--text-tertiary)]">直近14日間のデータはまだありません。</span>
                      )}
                      <p className="text-[10px] text-[var(--text-tertiary)] mt-1">
                        {recentStats != null ? "この数値に合わせて選ぶか、" : ""}お手持ちの環境に合わせて活動レベルを選んでください。
                      </p>
                    </div>
                    <select
                      value={personal.activityLevel ?? ""}
                      onChange={(e) => handlePersonalChange("activityLevel", e.target.value || null)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] text-[var(--text-primary)] text-sm"
                    >
                      {ACTIVITY_OPTIONS.map((opt) => (
                        <option key={opt.value || "n"} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    {personal.activityLevel && (
                      <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
                        {ACTIVITY_OPTIONS.find((o) => o.value === personal.activityLevel)?.description}
                      </p>
                    )}
                  </div>
                </div>
              </section>

              {/* 目標 */}
              <section>
                <h2 className="text-sm font-bold text-[var(--text-primary)] mb-1">目標（カロリー・PFC）</h2>
                <p className="text-[10px] text-[var(--text-tertiary)] mb-2">
                  {computeGoalsFromPersonal(personal)
                    ? "身長・体重・年齢・活動レベルから自動算出しています。変更して保存もできます。"
                    : "はじめはそのままでOK。からだを入力すると自動算出されます。あとから変更もできます。"}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs text-[var(--text-tertiary)] mb-0.5">カロリー (kcal)</label>
                    <input
                      type="number"
                      min={0}
                      value={goals.calories}
                      onChange={(e) => handleGoalsChange("calories", Number(e.target.value) || 0)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] text-[var(--text-primary)] text-sm"
                    />
                    <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{caloriePurpose}</p>
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--text-tertiary)] mb-0.5">P (g)</label>
                    <input
                      type="number"
                      min={0}
                      value={goals.protein}
                      onChange={(e) => handleGoalsChange("protein", Number(e.target.value) || 0)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] text-[var(--text-primary)] text-sm"
                    />
                    <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{ratios.p}%</p>
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--text-tertiary)] mb-0.5">F (g)</label>
                    <input
                      type="number"
                      min={0}
                      value={goals.fat}
                      onChange={(e) => handleGoalsChange("fat", Number(e.target.value) || 0)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] text-[var(--text-primary)] text-sm"
                    />
                    <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{ratios.f}%</p>
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--text-tertiary)] mb-0.5">C (g)</label>
                    <input
                      type="number"
                      min={0}
                      value={goals.carbs}
                      onChange={(e) => handleGoalsChange("carbs", Number(e.target.value) || 0)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] text-[var(--text-primary)] text-sm"
                    />
                    <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{ratios.c}%</p>
                  </div>
                </div>
                <p className="text-[10px] text-[var(--text-tertiary)] mt-1">目安: ～1800 減量 / ～2400 維持 / 2400+ 増量</p>
              </section>

              {saved && <p className="text-sm text-[var(--primary)]" role="status">{saved}</p>}
              <button
                type="button"
                onClick={handleSave}
                className="px-4 py-2 bg-[var(--primary)] text-[var(--btn-primary-text)] text-sm font-bold rounded-lg hover:bg-[var(--primary-hover)]"
              >
                保存
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
