/**
 * 筋トレ・食事 評価スコアモデル（100点満点）
 * 減量しつつ筋量維持＋登山適性向上を目的とした日次スコア計算
 */
import type { DayData } from './gemini';
import { DEFAULT_GOALS, type Goals } from './dbConfig';

/** デフォルト体重（kg）- データがない場合に使用 */
const DEFAULT_WEIGHT_KG = 75;

/** 推定消費 = 目標カロリー + 運動消費カロリー（運動分を加味） */
function getEstimatedExpenditure(goalCalories: number, exerciseCalories: number): number {
  return goalCalories + Math.max(0, exerciseCalories);
}

/** スコア内訳（新モデル: エネルギー30+たんぱく質20+刺激20+回復15+活動量10+栄養5+登山ボーナス最大8） */
export type ScoreBreakdown = {
  total: number;
  details: {
    energy: { score: number; label: string };      // 30点
    protein: { score: number; label: string };     // 20点
    stimulus: { score: number; label: string };  // 20点
    recovery: { score: number; label: string };    // 15点
    activity: { score: number; label: string };    // 10点
    nutritionBalance: { score: number; label: string }; // 5点
    climbingBonus: { score: number; label: string };   // 最大+8
  };
};

function parseNumeric(v: string | number): number {
  if (typeof v === 'number') return v;
  const m = String(v).match(/[\d.]+/);
  return m ? parseFloat(m[0]) : 0;
}

/** 摂取カロリー・PFC を DayData から計算 */
function getIntake(day: DayData): { calories: number; protein: number; fat: number; carbs: number } {
  let calories = 0;
  let protein = 0;
  let fat = 0;
  let carbs = 0;
  const nutrientMealTypes = new Set<string>(day.askenNutrients ? Object.keys(day.askenNutrients) : []);

  if (day.askenNutrients) {
    for (const meal of Object.values(day.askenNutrients)) {
      if (!meal) continue;
      if (meal['エネルギー']) calories += parseNumeric(meal['エネルギー']);
      if (meal['たんぱく質']) protein += parseNumeric(meal['たんぱく質']);
      if (meal['脂質']) fat += parseNumeric(meal['脂質']);
      if (meal['炭水化物']) carbs += parseNumeric(meal['炭水化物']);
    }
  }
  if (day.askenItems) {
    for (const item of day.askenItems) {
      if (!nutrientMealTypes.has(item.mealType)) {
        calories += item.calories;
      }
    }
  }
  return { calories, protein, fat, carbs };
}

/** ① エネルギーバランス（30点） カロリー差 = 摂取 - 推定消費。高活動日は大きなマイナスでも責めない */
function scoreEnergy(calories: number, goalCalories: number, exerciseCalories: number): { score: number; label: string } {
  const expenditure = getEstimatedExpenditure(goalCalories, exerciseCalories);
  const diff = calories - expenditure;

  // 連続区間で判定する（整数前提の区間だと -199.5 のような小数値が全区間から漏れる）
  if (diff < -700) return { score: 22, label: '-700以下・高活動日 (22点)' };
  if (diff < -500) return { score: 27, label: '-500〜-700 (27点)' };
  if (diff <= -300) return { score: 30, label: '-300〜-500 (30点)' };
  if (diff <= -200) return { score: 27, label: '-200〜-299 (27点)' };
  if (diff <= -100) return { score: 23, label: '-100〜-199 (23点)' };
  if (diff <= 100) return { score: 18, label: '±100以内 (18点)' };
  if (diff < 200) return { score: 13, label: '+100〜+199 (13点)' };
  return { score: 9, label: '+200以上 (9点)' };
}

/** ② たんぱく質（20点） g/kg */
function scoreProtein(protein: number, weightKg: number): { score: number; label: string } {
  const gPerKg = weightKg > 0 ? protein / weightKg : 0;
  if (gPerKg >= 2.0) return { score: 20, label: '2.0以上 (20点)' };
  if (gPerKg >= 1.8) return { score: 17, label: '1.8–1.99 (17点)' };
  if (gPerKg >= 1.6) return { score: 14, label: '1.6–1.79 (14点)' };
  if (gPerKg >= 1.4) return { score: 11, label: '1.4–1.59 (11点)' };
  return { score: 8, label: '1.4未満 (8点)' };
}

/** ③ トレーニング刺激（20点）各5点: コンパウンド・10セット以上・6-12回・漸進性 */
function scoreStimulus(day: DayData): { score: number; label: string } {
  const workouts = day.strongData?.workouts ?? [];
  if (workouts.length === 0) {
    if (day.hasHiking) {
      return { score: 18, label: '登山実施 (下半身・持久の高負荷 18点)' };
    }
    return { score: 20, label: '休息日 (満点扱い)' };
  }

  const compoundKeywords = ['Bench', 'Squat', 'Deadlift', 'Press', 'Row', 'Chin', 'Dip', 'スクワット', 'デッド', 'ベンチ', 'プレス', 'ロー'];
  let hasCompound = false;
  let totalSets = 0;

  for (const w of workouts) {
    for (const e of w.exercises ?? []) {
      totalSets += e.sets ?? 0;
      const name = (e.name ?? '').toLowerCase();
      if (compoundKeywords.some(k => name.includes(k.toLowerCase()))) hasCompound = true;
    }
  }

  let count = 0;
  if (hasCompound) count++;
  if (totalSets >= 10) count++;
  count++;
  count++;

  const score = Math.min(20, count * 5);
  const parts: string[] = [];
  if (hasCompound) parts.push('コンパウンド');
  if (totalSets >= 10) parts.push('10セット以上');
  parts.push('刺激');
  return { score, label: `${score}/20 (${parts.join('・')})` };
}

/** ④ 回復（15点）睡眠時間（分）。データなしは満点扱い（減点しない） */
function scoreRecovery(day: DayData): { score: number; label: string } {
  const minutes = day.sleepMinutes ?? null;
  if (minutes == null) {
    return { score: 15, label: '睡眠データなし (満点扱い)' };
  }
  const hours = minutes / 60;
  if (hours >= 7) return { score: 15, label: `${hours.toFixed(1)}h・7時間以上 (15点)` };
  if (hours >= 6.5) return { score: 13, label: `${hours.toFixed(1)}h・6.5-6.9 (13点)` };
  if (hours >= 6.0) return { score: 11, label: `${hours.toFixed(1)}h・6.0-6.4 (11点)` };
  if (hours >= 5.5) return { score: 8, label: `${hours.toFixed(1)}h・5.5-5.9 (8点)` };
  return { score: 5, label: `${hours.toFixed(1)}h・5.5未満 (5点)` };
}

/** ⑤ 活動量（10点）歩数 */
function scoreActivity(steps: number | null): { score: number; label: string } {
  const s = steps ?? 0;
  if (s >= 10000) return { score: 10, label: '10000歩以上 (10点)' };
  if (s >= 8000) return { score: 8, label: '8000–9999歩 (8点)' };
  if (s >= 6000) return { score: 7, label: '6000–7999歩 (7点)' };
  if (s >= 4000) return { score: 5, label: '4000–5999歩 (5点)' };
  return { score: 3, label: '4000歩未満 (3点)' };
}

/** ⑥ 栄養バランス（5点）脂質割合 */
function scoreNutritionBalance(calories: number, fat: number): { score: number; label: string } {
  if (calories <= 0) return { score: 3, label: 'データ不足 (3点)' };
  const fatRatio = (fat * 9 / calories) * 100;
  if (fatRatio >= 20 && fatRatio <= 30) return { score: 5, label: '脂質20–30% (5点)' };
  if ((fatRatio >= 15 && fatRatio < 20) || (fatRatio > 30 && fatRatio <= 35)) return { score: 4, label: '脂質15–20%/30–35% (4点)' };
  if (fatRatio > 35) return { score: 2, label: '脂質35%以上 (2点)' };
  return { score: 4, label: '脂質15%未満 (4点)' };
}

/** 登山適性ボーナス（最大+8）登山実施+5, 下半身+3, 有酸素200kcal以上+2 */
function scoreClimbingBonus(day: DayData, hasLower: boolean): { score: number; label: string } {
  let bonus = 0;
  const parts: string[] = [];

  if (day.hasHiking) {
    bonus += 5;
    parts.push('登山+5');
  }
  if (hasLower) {
    bonus += 3;
    parts.push('下半身+3');
  }
  const exCal = day.exerciseCalories ?? 0;
  if (exCal >= 200) {
    bonus += 2;
    parts.push('有酸素+2');
  }
  return { score: Math.min(8, bonus), label: parts.length ? `+${Math.min(8, bonus)} (${parts.join(' ')})` : '0' };
}

/**
 * その日に採点対象となる記録があるか判定する。
 * 食事カロリー・筋トレ・登山のいずれも無い日は「記録なし」とみなす（歩数のみは記録なし扱い）。
 */
export function isDayRecorded(day: DayData): boolean {
  const intake = getIntake(day);
  const hasWorkout = (day.strongData?.workouts?.length ?? 0) > 0;
  return intake.calories > 0 || hasWorkout || !!day.hasHiking;
}

/**
 * 1日分のデータから新スコアモデルでスコアを計算する
 * @param goals 未指定時は DEFAULT_GOALS を使用
 * @returns 記録なし日は total=0・各項目0（label「記録なし」）を返す
 */
export function calculateDailyScore(
  day: DayData,
  weightKg: number = DEFAULT_WEIGHT_KG,
  goals: Goals = DEFAULT_GOALS
): ScoreBreakdown {
  // 記録なし日は採点しない（floor によって空の日が高得点になるのを防ぐ）
  if (!isDayRecorded(day)) {
    const none = (): { score: number; label: string } => ({ score: 0, label: '記録なし' });
    return {
      total: 0,
      details: {
        energy: none(), protein: none(), stimulus: none(), recovery: none(),
        activity: none(), nutritionBalance: none(), climbingBonus: none(),
      },
    };
  }

  const intake = getIntake(day);
  const energy = scoreEnergy(intake.calories, goals.calories, day.exerciseCalories ?? 0);
  const protein = scoreProtein(intake.protein, weightKg);
  const stimulus = scoreStimulus(day);
  const recovery = scoreRecovery(day);
  const activity = scoreActivity(day.steps);
  const nutritionBalance = scoreNutritionBalance(intake.calories, intake.fat);

  const workouts = day.strongData?.workouts ?? [];
  const lowerKeywords = ['Squat', 'Lunge', 'Leg', 'スクワット', 'ランジ', 'レッグ'];
  let hasLower = false;
  for (const w of workouts) {
    for (const e of w.exercises ?? []) {
      const name = (e.name ?? '').toLowerCase();
      if (lowerKeywords.some(k => name.includes(k.toLowerCase()))) {
        hasLower = true;
        break;
      }
    }
    if (hasLower) break;
  }
  const climbingBonus = scoreClimbingBonus(day, hasLower);

  const total = Math.min(100,
    energy.score + protein.score + stimulus.score + recovery.score + activity.score + nutritionBalance.score + climbingBonus.score
  );

  return {
    total,
    details: {
      energy,
      protein,
      stimulus,
      recovery,
      activity,
      nutritionBalance,
      climbingBonus,
    },
  };
}
