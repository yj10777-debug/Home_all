/**
 * 筋トレ・食事 評価スコアモデル（100点満点）
 * 減量しつつ筋量維持＋登山適性向上を目的とした日次スコア計算
 */
import { DayData } from './gemini';
import { DEFAULT_GOALS, type Goals } from './dbConfig';

/** デフォルト体重（kg）- データがない場合に使用 */
const DEFAULT_WEIGHT_KG = 75;

function getEstimatedExpenditure(goalCalories: number): number {
  return goalCalories;
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

/** ① エネルギーバランス（30点） カロリー差 = 摂取 - 推定消費 */
function scoreEnergy(calories: number, goalCalories: number): { score: number; label: string } {
  const expenditure = getEstimatedExpenditure(goalCalories);
  const diff = calories - expenditure;

  if (diff >= -500 && diff <= -300) return { score: 30, label: '-300〜-500 (30点)' };
  if (diff >= -299 && diff <= -200) return { score: 25, label: '-200〜-299 (25点)' };
  if (diff >= -700 && diff < -500) return { score: 22, label: '-500〜-700 (22点)' };
  if (diff >= -199 && diff <= -100) return { score: 18, label: '-100〜-199 (18点)' };
  if (diff >= -100 && diff <= 100) return { score: 10, label: '±100以内 (10点)' };
  if (diff < -700) return { score: 12, label: '-700以下 (12点)' };
  if (diff > 200) return { score: 5, label: '+200以上 (5点)' };
  return { score: 10, label: '±100付近 (10点)' };
}

/** ② たんぱく質（20点） g/kg */
function scoreProtein(protein: number, weightKg: number): { score: number; label: string } {
  const gPerKg = weightKg > 0 ? protein / weightKg : 0;
  if (gPerKg >= 2.0) return { score: 20, label: '2.0以上 (20点)' };
  if (gPerKg >= 1.8) return { score: 17, label: '1.8–1.99 (17点)' };
  if (gPerKg >= 1.6) return { score: 14, label: '1.6–1.79 (14点)' };
  if (gPerKg >= 1.4) return { score: 10, label: '1.4–1.59 (10点)' };
  return { score: 5, label: '1.4未満 (5点)' };
}

/** ③ トレーニング刺激（20点）各5点: コンパウンド・10セット以上・6-12回・漸進性 */
function scoreStimulus(day: DayData): { score: number; label: string } {
  const workouts = day.strongData?.workouts ?? [];
  if (workouts.length === 0) {
    return { score: 20, label: '休息日 (満点扱い)' };
  }

  const compoundKeywords = ['Bench', 'Squat', 'Deadlift', 'Press', 'Row', 'Chin', 'Dip', 'スクワット', 'デッド', 'ベンチ', 'プレス', 'ロー'];
  const lowerKeywords = ['Squat', 'Lunge', 'Leg', 'スクワット', 'ランジ', 'レッグ'];
  let hasCompound = false;
  let hasLower = false;
  let totalSets = 0;

  for (const w of workouts) {
    for (const e of w.exercises ?? []) {
      totalSets += e.sets ?? 0;
      const name = (e.name ?? '').toLowerCase();
      if (compoundKeywords.some(k => name.includes(k.toLowerCase()))) hasCompound = true;
      if (lowerKeywords.some(k => name.includes(k.toLowerCase()))) hasLower = true;
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

/** ④ 回復（15点）睡眠。データなしは中間点 */
function scoreRecovery(_day: DayData): { score: number; label: string } {
  return { score: 9, label: 'データなし (6.0–6.4時間相当 9点)' };
}

/** ⑤ 活動量（10点）歩数 */
function scoreActivity(steps: number | null): { score: number; label: string } {
  const s = steps ?? 0;
  if (s >= 10000) return { score: 10, label: '10000歩以上 (10点)' };
  if (s >= 8000) return { score: 8, label: '8000–9999歩 (8点)' };
  if (s >= 6000) return { score: 6, label: '6000–7999歩 (6点)' };
  if (s >= 4000) return { score: 4, label: '4000–5999歩 (4点)' };
  return { score: 2, label: '4000歩未満 (2点)' };
}

/** ⑥ 栄養バランス（5点）脂質割合 */
function scoreNutritionBalance(calories: number, fat: number): { score: number; label: string } {
  if (calories <= 0) return { score: 3, label: 'データ不足 (3点)' };
  const fatRatio = (fat * 9 / calories) * 100;
  if (fatRatio >= 20 && fatRatio <= 30) return { score: 5, label: '脂質20–30% (5点)' };
  if (fatRatio > 30 && fatRatio <= 35) return { score: 3, label: '脂質30–35% (3点)' };
  if (fatRatio > 35) return { score: 1, label: '脂質35%以上 (1点)' };
  return { score: 3, label: '脂質20%未満 (3点)' };
}

/** 登山適性ボーナス（最大+8）下半身+3, 体脂肪15%未満+3, 有酸素20分+2 */
function scoreClimbingBonus(day: DayData, hasLower: boolean): { score: number; label: string } {
  let bonus = 0;
  const parts: string[] = [];

  if (hasLower) {
    bonus += 3;
    parts.push('下半身+3');
  }
  const exCal = day.exerciseCalories ?? 0;
  if (exCal >= 100) {
    bonus += 2;
    parts.push('有酸素+2');
  }
  return { score: Math.min(8, bonus), label: parts.length ? `+${bonus} (${parts.join(' ')})` : '0' };
}

/**
 * 1日分のデータから新スコアモデルでスコアを計算する
 * @param goals 未指定時は DEFAULT_GOALS を使用
 */
export function calculateDailyScore(
  day: DayData,
  weightKg: number = DEFAULT_WEIGHT_KG,
  goals: Goals = DEFAULT_GOALS
): ScoreBreakdown {
  const intake = getIntake(day);
  const energy = scoreEnergy(intake.calories, goals.calories);
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
