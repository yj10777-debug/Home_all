/**
 * 目標値に対する目的・説明ラベル（UI表示用）
 * からだ設定から目標PFCを算出するロジック（初期ユーザー用）
 */

import type { Goals, Personal } from "./dbConfig";

/** 活動レベル別の活動係数（TDEE = BMR × 係数） */
const ACTIVITY_FACTOR: Record<string, number> = {
  very_low: 1.2,
  low: 1.375,
  medium: 1.55,
  high: 1.725,
};

/**
 * からだ設定（身長・体重・年齢・性別・活動レベル）から目標カロリー・PFCを算出する。
 * 初期ユーザーは手動で目標を入れず、この算出値を使う想定。
 * @returns 算出可能な場合のみ Goals、不足時は null
 */
export function computeGoalsFromPersonal(personal: Personal): Goals | null {
  const { heightCm, weightKg, age, sex, activityLevel } = personal;
  if (heightCm == null || heightCm <= 0 || weightKg == null || weightKg <= 0) return null;
  const ageNum = age ?? 30;
  const factor = activityLevel ? ACTIVITY_FACTOR[activityLevel] ?? 1.375 : 1.375;
  const bmr =
    sex === "female"
      ? 10 * weightKg + 6.25 * heightCm - 5 * ageNum - 161
      : 10 * weightKg + 6.25 * heightCm - 5 * ageNum + 5;
  const tdee = Math.round(bmr * factor);
  const calories = Math.max(1200, Math.min(4000, tdee));
  const proteinG = Math.round(weightKg * 1.6);
  const protein = Math.max(50, Math.min(250, proteinG));
  const fatKcal = calories * 0.25;
  const fat = Math.round(fatKcal / 9);
  const carbsKcal = Math.max(0, calories - protein * 4 - fat * 9);
  const carbs = Math.round(carbsKcal / 4);
  return { calories, protein, fat, carbs };
}

/** カロリー目標の目安目的 */
export function getCaloriePurpose(calories: number): string {
  if (calories < 1800) return "減量（やや強め）";
  if (calories < 2100) return "減量";
  if (calories <= 2400) return "維持";
  if (calories <= 2700) return "増量（緩やか）";
  return "増量";
}

/** PFC のカロリー割合を計算（%）。総カロリーは P*4 + F*9 + C*4 で算出 */
export function getPfcRatios(goals: Goals): { p: number; f: number; c: number } {
  const total = goals.protein * 4 + goals.fat * 9 + goals.carbs * 4;
  if (total <= 0) return { p: 0, f: 0, c: 0 };
  return {
    p: Math.round((goals.protein * 4 / total) * 100),
    f: Math.round((goals.fat * 9 / total) * 100),
    c: Math.round((goals.carbs * 4 / total) * 100),
  };
}

/** たんぱく質目標の目安（体重あたり想定） */
export function getProteinPurpose(protein: number, weightKg: number | null): string {
  if (weightKg == null || weightKg <= 0) return "筋トレ・維持向け";
  const gPerKg = protein / weightKg;
  if (gPerKg >= 2) return "筋肥大・積極的増量向け";
  if (gPerKg >= 1.6) return "筋トレ・維持向け";
  if (gPerKg >= 1.2) return "一般維持向け";
  return "最低限";
}
