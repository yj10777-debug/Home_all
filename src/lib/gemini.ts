import { prisma } from "./prisma";
import { getGoals } from "./dbConfig";

/** あすけんの食事アイテム */
export type AskenItem = {
  mealType: string;
  name: string;
  amount: string;
  calories: number;
};

/** あすけんの栄養素（食事タイプ別） */
export type AskenNutrients = Record<string, Record<string, string>>;

/** 筋トレの種目 */
type StrongExercise = { name: string; sets: number; volumeKg: number };

/** 筋トレワークアウト */
type StrongWorkout = {
  title: string;
  totals: { sets: number; reps: number; volumeKg: number };
  exercises: StrongExercise[];
};

/** 筋トレデータ */
export type StrongData = {
  workouts: StrongWorkout[];
  totals: { workouts: number; sets: number; volumeKg: number };
};

/** DB から取得した日次データの構造 */
export type DayData = {
  date: string;
  askenItems: AskenItem[] | null;
  askenNutrients: AskenNutrients | null;
  strongData: StrongData | null;
  steps: number | null;
  exerciseCalories: number | null;
};

/** PFC 合計値 */
export type PfcTotals = { protein: number; fat: number; carbs: number };

export const GOAL_CALORIES = 2267;
export const GOAL_PFC: Readonly<PfcTotals> = {
  protein: 150,
  fat: 54,
  carbs: 293,
};

/**
 * DB から日次データを読み込む
 */
async function loadDayData(dateStr: string): Promise<DayData | null> {
  const record = await prisma.dailyData.findUnique({ where: { date: dateStr } });
  if (!record) return null;
  return {
    date: record.date,
    askenItems: record.askenItems as AskenItem[] | null,
    askenNutrients: record.askenNutrients as AskenNutrients | null,
    strongData: record.strongData as StrongData | null,
    steps: record.steps ?? null,
    exerciseCalories: record.exerciseCalories ?? null,
  };
}

/**
 * 栄養素テキストから数値を抽出する
 */
function parseNumericValue(value: string): number {
  const match = value.match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
}

/**
 * あすけん栄養素データからPFC合計を算出する
 */
function computePfc(nutrients?: AskenNutrients | null): PfcTotals {
  const totals: PfcTotals = { protein: 0, fat: 0, carbs: 0 };
  if (!nutrients) return totals;

  for (const meal of Object.values(nutrients)) {
    if (!meal) continue;
    const hasCarb = Object.prototype.hasOwnProperty.call(meal, "炭水化物");

    for (const [key, raw] of Object.entries(meal)) {
      const amount = parseNumericValue(raw);
      if (!amount) continue;

      if (key === "たんぱく質" || key === "タンパク質") {
        totals.protein += amount;
      } else if (key === "脂質") {
        totals.fat += amount;
      } else if (key === "炭水化物") {
        totals.carbs += amount;
      } else if (key === "糖質" && !hasCarb) {
        totals.carbs += amount;
      }
    }
  }

  return totals;
}

/**
 * 総カロリーを算出する
 * nutrients にデータがない食事タイプ（間食など）は items のカロリーで補完する
 */
function computeTotalCalories(nutrients?: AskenNutrients | null, items?: AskenItem[] | null): number {
  let total = 0;

  const nutrientMealTypes = new Set<string>();
  if (nutrients) {
    for (const [mealType, meal] of Object.entries(nutrients)) {
      if (!meal) continue;
      nutrientMealTypes.add(mealType);
      const energy = meal["エネルギー"];
      if (energy) total += parseNumericValue(energy);
    }
  }

  if (items) {
    for (const item of items) {
      if (!nutrientMealTypes.has(item.mealType)) {
        total += item.calories;
      }
    }
  }

  return total;
}

/**
 * items から nutrients に含まれない食事タイプのカロリー合計を算出する
 */
function computeSnackCalories(nutrients?: AskenNutrients | null, items?: AskenItem[] | null): number {
  if (!items) return 0;
  const nutrientMealTypes = new Set<string>();
  if (nutrients) {
    for (const mealType of Object.keys(nutrients)) {
      nutrientMealTypes.add(mealType);
    }
  }
  let total = 0;
  for (const item of items) {
    if (!nutrientMealTypes.has(item.mealType)) {
      total += item.calories;
    }
  }
  return total;
}

/**
 * 食事アイテム一覧をテキストにまとめる
 */
function formatMealItems(items?: AskenItem[] | null): string {
  if (!items || items.length === 0) return "食事データなし";

  const byType: Record<string, AskenItem[]> = {};
  for (const item of items) {
    if (!byType[item.mealType]) byType[item.mealType] = [];
    byType[item.mealType].push(item);
  }

  const lines: string[] = [];
  for (const [mealType, mealItems] of Object.entries(byType)) {
    lines.push(`【${mealType}】`);
    for (const item of mealItems) {
      lines.push(`  - ${item.name} (${item.amount}) ${item.calories}kcal`);
    }
  }
  return lines.join("\n");
}

/**
 * 筋トレデータをテキストにまとめる
 */
function formatWorkouts(strong?: StrongData | null): string {
  if (!strong || !strong.workouts || strong.workouts.length === 0) {
    return "筋トレなし";
  }

  const lines: string[] = [];
  for (const w of strong.workouts) {
    lines.push(`【${w.title}】 合計: ${w.totals.sets}セット / ${w.totals.reps}レップ / ${w.totals.volumeKg}kg`);
    for (const e of w.exercises) {
      lines.push(`  - ${e.name}: ${e.sets}セット (${e.volumeKg}kg)`);
    }
  }
  return lines.join("\n");
}

/**
 * 指定日のデータをもとに Gem 貼り付け用の日次評価プロンプトを生成する
 * @param dateStr 対象日付 (YYYY-MM-DD)
 * @returns プロンプトテキスト
 * @throws データが見つからない場合
 */
export async function generateDailyPrompt(dateStr: string): Promise<string> {
  const [dayData, goals] = await Promise.all([loadDayData(dateStr), getGoals()]);
  if (!dayData) {
    throw new Error(`${dateStr} のデータが見つかりません。先にデータを同期してください。`);
  }

  const pfc = computePfc(dayData.askenNutrients);
  const totalCalories = computeTotalCalories(dayData.askenNutrients, dayData.askenItems);
  const snackCalories = computeSnackCalories(dayData.askenNutrients, dayData.askenItems);
  const mealText = formatMealItems(dayData.askenItems);
  const workoutText = formatWorkouts(dayData.strongData);
  const hasWorkout = !!dayData.strongData && (dayData.strongData.workouts?.length ?? 0) > 0;

  const fatRatio = totalCalories > 0 ? (pfc.fat * 9 / totalCalories) * 100 : 0;
  return `以下のデータをもとに、システムプロンプトの「筋トレ・食事 評価スコアモデル」に従い、総評（先に）・総合スコア・内訳の順で出力してください。

## 目標・参照
- 目標カロリー: ${goals.calories} kcal/日（推定消費の目安に使ってよい）
- 目標PFC: P${goals.protein}g / F${goals.fat}g / C${goals.carbs}g

## 今日の入力データ (${dateStr})

### 摂取
- 総摂取カロリー: ${totalCalories} kcal
- たんぱく質: ${Math.round(pfc.protein)}g
- 脂質: ${Math.round(pfc.fat)}g（脂質割合: ${fatRatio.toFixed(1)}%）
- 炭水化物: ${Math.round(pfc.carbs)}g
${snackCalories > 0 ? `- 間食 ${snackCalories} kcal 含む（PFC内訳不明）` : ""}

### 食事内容
${mealText}

### 筋トレ内容
${workoutText}
${hasWorkout ? "（コンパウンド有無・セット数・回数レンジ・漸進性を判定し、刺激スコアと登山ボーナスに反映すること）" : ""}

### 歩数・運動
${dayData.steps != null ? `歩数: ${dayData.steps.toLocaleString()} 歩` : "歩数: データなし"}
${dayData.exerciseCalories != null && dayData.exerciseCalories > 0 ? `運動消費: ${dayData.exerciseCalories} kcal（有酸素の目安に使ってよい）` : ""}

### その他
- 睡眠: データなし（スキップまたは中間点でよい）
- 体重・推定消費カロリー: データなし（目標${goals.calories}kcalを基準にエネルギーバランスを推定してよい）
- 体脂肪率: データなし

## 回答
・挨拶は書かず、1行目から総評（評価の要約・良かった点・改善点を1〜3文）を先に出力すること。
・空行のあと「総合スコア: XX点」と続け、内訳（エネルギー/30、たんぱく質/20、刺激/20、回復/15、活動量/10、栄養バランス/5、登山ボーナス）を簡潔に出力すること。`;
}

/**
 * 日曜起点の1週間分データをもとに Gem 貼り付け用の週次評価プロンプトを生成する
 * @param sundayStr 週の開始日（日曜） (YYYY-MM-DD)
 * @returns プロンプトテキスト
 */
export async function generateWeeklyPrompt(sundayStr: string): Promise<string> {
  const [year, month, day] = sundayStr.split("-").map(Number);
  const dateStrs: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(year, month - 1, day + i);
    dateStrs.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }

  const records = await prisma.dailyData.findMany({
    where: { date: { in: dateStrs } },
  });
  const recordMap = new Map(records.map((r) => [r.date, r]));

  const saturdayStr = dateStrs[6];
  const dailySummaries: string[] = [];
  let weekTotalCalories = 0;
  let weekTotalProtein = 0;
  let weekTotalFat = 0;
  let weekTotalCarbs = 0;
  let workoutDays = 0;
  let totalVolume = 0;

  for (const dateStr of dateStrs) {
    const record = recordMap.get(dateStr);
    if (!record) {
      dailySummaries.push(`${dateStr}: データなし`);
      continue;
    }

    const nutrients = record.askenNutrients as AskenNutrients | null;
    const items = record.askenItems as AskenItem[] | null;
    const strong = record.strongData as StrongData | null;

    const cal = computeTotalCalories(nutrients, items);
    const pfc = computePfc(nutrients);
    weekTotalCalories += cal;
    weekTotalProtein += pfc.protein;
    weekTotalFat += pfc.fat;
    weekTotalCarbs += pfc.carbs;

    const hasWorkout = !!strong && (strong.workouts?.length ?? 0) > 0;
    if (hasWorkout && strong) {
      workoutDays++;
      totalVolume += strong.totals?.volumeKg ?? 0;
    }

    const workoutSummary = hasWorkout && strong
      ? `筋トレあり(${strong.workouts.map((w) => w.title).join(", ")} / ${strong.totals?.volumeKg ?? 0}kg)`
      : "筋トレなし";

    dailySummaries.push(
      `${dateStr}: ${cal}kcal / P${Math.round(pfc.protein)}g F${Math.round(pfc.fat)}g C${Math.round(pfc.carbs)}g / ${workoutSummary}`
    );
  }

  const avgCalories = Math.round(weekTotalCalories / 7);
  const avgProtein = Math.round(weekTotalProtein / 7);
  const avgFat = Math.round(weekTotalFat / 7);
  const avgCarbs = Math.round(weekTotalCarbs / 7);

  const goals = await getGoals();

  return `以下の1週間分のデータを総合的に評価し、改善点と良かった点をまとめてください。

## 目標（1日あたり）
- カロリー: ${goals.calories} kcal
- たんぱく質(P): ${goals.protein}g / 脂質(F): ${goals.fat}g / 炭水化物(C): ${goals.carbs}g

## 週間データ (${sundayStr} 〜 ${saturdayStr})
${dailySummaries.join("\n")}

## 週間集計
- 平均カロリー: ${avgCalories} kcal/日（目標: ${goals.calories}）
- 平均PFC: P${avgProtein}g / F${avgFat}g / C${avgCarbs}g
- 筋トレ日数: ${workoutDays}日 / 合計ボリューム: ${totalVolume}kg

## 回答ルール
1. 1週間の全体的な評価（カロリー・PFCの達成度、筋トレとの連動性）
2. 良かったポイント（具体的な日付やメニューを挙げて）
3. 改善ポイント（具体的な日付や不足を挙げて）
4. 来週に向けたアドバイス`;
}

/**
 * 専用 Gem に設定するシステムプロンプトを返す
 * 筋トレ・食事 評価スコアモデル（100点満点・単一ファイル版）
 */
export function getGemSystemPrompt(): string {
  return `あなたは栄養管理と筋トレに詳しいパーソナルトレーナーです。
ユーザーから食事・筋トレ・歩数などのデータが渡されるので、下記の「筋トレ・食事 評価スコアモデル」に従い100点満点でスコアリングし、総評とスコア内訳を出力してください。

■ 回答のルール（厳守）
・「はい」「お任せください」「承知しました」などの挨拶や無駄な前置きは一切書かない。
・回答は必ず総評から始める。1〜3文で、評価の要約・良かった点・改善点を簡潔に書く。そのあとで総合スコアと内訳を書く。
・簡潔に、要点のみを書く。冗長な表現は避ける。

■ 目的
減量しつつ筋量維持＋登山適性向上

■ 入力データ（渡されたもののみ使用。ない項目はスキップまたは仮定してよい）
・体重（kg） ・摂取カロリー（kcal） ・推定消費カロリー（kcal）
・たんぱく質摂取量（g） ・脂質摂取量（g） ・総摂取カロリー（kcal）
・トレーニング内容：コンパウンド種目有無（Yes/No）、合計セット数、主な回数レンジ、漸進性有無（Yes/No）
・睡眠時間（h） ・歩数 ・体脂肪率（任意） ・有酸素時間（任意）

────────────────────────
① エネルギーバランス（30点）
カロリー差 = 摂取カロリー - 推定消費カロリー
-300〜-500 → 30点  -200〜-299 → 25点  -500〜-700 → 22点  -100〜-199 → 18点
±100以内 → 10点   -700以下 → 12点   +200以上 → 5点

② たんぱく質（20点）
g/kg = たんぱく質摂取量 ÷ 体重
2.0以上 → 20点  1.8–1.99 → 17点  1.6–1.79 → 14点  1.4–1.59 → 10点  1.4未満 → 5点
※体重が不明な場合は目標P${GOAL_PFC.protein}gを充足していれば高得点とする

③ トレーニング刺激（20点）各5点
・コンパウンド種目あり ・合計10セット以上 ・6–12回レンジ中心 ・漸進性あり
刺激スコア = 該当数 × 5

④ 回復（15点）
7時間以上 → 15点  6.5–6.9時間 → 12点  6.0–6.4時間 → 9点  5.5–5.9時間 → 6点  5.5時間未満 → 3点
※睡眠6時間未満の場合、エネルギー項目から-3点補正
※睡眠データなしの場合はスキップ（満点扱いまたは中間点）

⑤ 活動量（10点）
10000歩以上 → 10点  8000–9999歩 → 8点  6000–7999歩 → 6点  4000–5999歩 → 4点  4000歩未満 → 2点

⑥ 栄養バランス（5点）
脂質割合 = (脂質g × 9) ÷ 総摂取カロリー
20–30% → 5点  30–35% → 3点  35%以上 → 1点

■ 登山適性ボーナス（最大+8点）
・下半身種目あり → +3  ・体脂肪率15%未満 → +3  ・有酸素20分以上 → +2
※最終スコア上限は100点

■ 総合スコア計算
総合スコア = エネルギー + たんぱく質 + 刺激 + 回復 + 活動量 + 栄養バランス + 登山ボーナス

■ 評価基準
85–100 → 非常に良い（理想減量）  75–84 → 良い  65–74 → 及第点  50–64 → 改善必要  50未満 → 方向修正必要

■ 出力形式（この順で出力すること）
1. 総評: 1行目から。評価基準に沿った一言と、良かった点・改善点・アドバイスを1〜3文で簡潔に（挨拶なし）。
2. 空行のあと「総合スコア: XX点」と書く。
3. 内訳: エネルギー: X/30 たんぱく質: X/20 刺激: X/20 回復: X/15 活動量: X/10 栄養バランス: X/5 登山ボーナス: +X
4. 週次まとめの場合は、日別スコアと週全体の傾向・良かった日・改善が必要な日を具体的に。`;
}
