import { prisma } from "./prisma";

// ─── 型定義 ───────────────────────────────────────────

/** あすけんの食事アイテム */
type AskenItem = {
  mealType: string;
  name: string;
  amount: string;
  calories: number;
};

/** あすけんの栄養素（食事タイプ別） */
type AskenNutrients = Record<string, Record<string, string>>;

/** 筋トレの種目 */
type StrongExercise = { name: string; sets: number; volumeKg: number };

/** 筋トレワークアウト */
type StrongWorkout = {
  title: string;
  totals: { sets: number; reps: number; volumeKg: number };
  exercises: StrongExercise[];
};

/** 筋トレデータ */
type StrongData = {
  workouts: StrongWorkout[];
  totals: { workouts: number; sets: number; volumeKg: number };
};

/** DB から取得した日次データの構造 */
type DayData = {
  date: string;
  askenItems: AskenItem[] | null;
  askenNutrients: AskenNutrients | null;
  strongData: StrongData | null;
  steps: number | null;
  exerciseCalories: number | null;
};

/** PFC 合計値 */
type PfcTotals = { protein: number; fat: number; carbs: number };

// ─── 定数 ─────────────────────────────────────────────

const GOAL_CALORIES = 2267;
const GOAL_PFC: Readonly<PfcTotals> = {
  protein: 150,
  fat: 54,
  carbs: 293,
};

// ─── ユーティリティ ───────────────────────────────────

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

// ─── プロンプト生成（日次） ──────────────────────────

/**
 * 指定日のデータをもとに Gem 貼り付け用の日次評価プロンプトを生成する
 * @param dateStr 対象日付 (YYYY-MM-DD)
 * @returns プロンプトテキスト
 * @throws データが見つからない場合
 */
export async function generateDailyPrompt(dateStr: string): Promise<string> {
  const dayData = await loadDayData(dateStr);
  if (!dayData) {
    throw new Error(`${dateStr} のデータが見つかりません。先にデータを同期してください。`);
  }

  const pfc = computePfc(dayData.askenNutrients);
  const totalCalories = computeTotalCalories(dayData.askenNutrients, dayData.askenItems);
  const snackCalories = computeSnackCalories(dayData.askenNutrients, dayData.askenItems);
  const remainingCalories = Math.max(0, GOAL_CALORIES - totalCalories);
  const mealText = formatMealItems(dayData.askenItems);
  const workoutText = formatWorkouts(dayData.strongData);
  const hasWorkout = !!dayData.strongData && (dayData.strongData.workouts?.length ?? 0) > 0;

  return `以下のデータをもとに、今日の食事と筋トレの評価と、残りの食事で何を食べるべきかを提案してください。

## 目標
- カロリー: ${GOAL_CALORIES} kcal/日
- たんぱく質(P): ${GOAL_PFC.protein}g / 脂質(F): ${GOAL_PFC.fat}g / 炭水化物(C): ${GOAL_PFC.carbs}g

## 今日の摂取状況 (${dateStr})
- 合計カロリー: ${totalCalories} kcal（残り ${remainingCalories} kcal）${snackCalories > 0 ? `\n  ※ 間食 ${snackCalories} kcal を含む（間食はPFC内訳不明のためカロリーのみ加算）` : ""}
- たんぱく質: ${Math.round(pfc.protein)}g（目標まであと ${Math.max(0, Math.round(GOAL_PFC.protein - pfc.protein))}g）
- 脂質: ${Math.round(pfc.fat)}g（目標まであと ${Math.max(0, Math.round(GOAL_PFC.fat - pfc.fat))}g）
- 炭水化物: ${Math.round(pfc.carbs)}g（目標まであと ${Math.max(0, Math.round(GOAL_PFC.carbs - pfc.carbs))}g）

## 食事内容
${mealText}

## 筋トレ内容
${workoutText}

## 運動・歩数
${dayData.steps != null ? `- 歩数: ${dayData.steps.toLocaleString()} 歩` : "- 歩数データなし"}
${dayData.exerciseCalories != null && dayData.exerciseCalories > 0 ? `- 運動消費カロリー: ${dayData.exerciseCalories} kcal` : ""}

## 回答ルール
以下のスコアリングアルゴリズム（100点満点減点方式）に従って得点を算出し、各セクションの得点と理由を示した上でアドバイスしてください。

### 食事評価（50点）
1. カロリー収支（20点）: 目標${GOAL_CALORIES}kcalとの乖離で判定
   - ±10%以内: 減点なし / ±10-20%: -10点 / ±20%超: -20点
2. タンパク質充足（15点）: 体重×2.0g以上=減点なし / ×1.6-1.9g=-5点 / ×1.6g未満=-15点
   ※体重は75kgと仮定（目標タンパク=${GOAL_PFC.protein}g）
3. PFCバランス（10点）: P:25-35%, F:20-30%, C:40-55%
   - 全項目範囲内: 減点なし / 1項目範囲外: -5点 / 2項目以上: -10点
4. 食事タイミング（5点）: 3-5時間間隔で分散=減点なし / 極端な偏り=-5点

### 筋トレ評価（30点）
1. トレーニング実施（10点）: 実施=減点なし / 未実施（計画的休息除く）=セクション全体0点
2. 漸進性過負荷（10点）: 前回比增加=+10点 / 維持=+5点 / 低下=0点
3. 総負荷量（5点）: 推奨範囲内=減点なし / 範囲外=-5点
4. 種目構成（5点）: コンパウンド含有=減点なし / アイソレーションのみ=-3点

### 生活習慣評価（20点）
1. 睡眠時間（10点）: 7時間以上=減点なし / 6-7時間=-5点 / 6時間未満=-10点
   ※睡眠データがない場合はスキップ（満点扱い）
2. 活動量（10点）: 8000歩以上=減点なし / 5000-8000歩=-5点 / 5000歩未満=-10点

### 回答フォーマット
1. **総合スコア: XX/100点** を最初に明示
2. 各セクションの得点内訳と理由を簡潔に
3. 改善点と残りの食事で食べるべきメニューを3つ提案（各カロリー・PFC付き）`;
}

// ─── プロンプト生成（週次） ──────────────────────────

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

  // 7日分を一括取得
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

  return `以下の1週間分のデータを総合的に評価し、改善点と良かった点をまとめてください。

## 目標（1日あたり）
- カロリー: ${GOAL_CALORIES} kcal
- たんぱく質(P): ${GOAL_PFC.protein}g / 脂質(F): ${GOAL_PFC.fat}g / 炭水化物(C): ${GOAL_PFC.carbs}g

## 週間データ (${sundayStr} 〜 ${saturdayStr})
${dailySummaries.join("\n")}

## 週間集計
- 平均カロリー: ${avgCalories} kcal/日（目標: ${GOAL_CALORIES}）
- 平均PFC: P${avgProtein}g / F${avgFat}g / C${avgCarbs}g
- 筋トレ日数: ${workoutDays}日 / 合計ボリューム: ${totalVolume}kg

## 回答ルール
1. 1週間の全体的な評価（カロリー・PFCの達成度、筋トレとの連動性）
2. 良かったポイント（具体的な日付やメニューを挙げて）
3. 改善ポイント（具体的な日付や不足を挙げて）
4. 来週に向けたアドバイス`;
}

// ─── Gem 用システムプロンプト ─────────────────────────

/**
 * 専用 Gem に設定するシステムプロンプトを返す
 */
export function getGemSystemPrompt(): string {
  return `あなたは栄養管理と筋トレに詳しいパーソナルトレーナーです。
ユーザーから食事・筋トレ・歩数データが貼り付けられるので、100点満点の減点方式でスコアリングし、アドバイスしてください。

## ユーザープロフィール
- 生年月日: 1993/10/4（32歳）
- 身長: 173cm
- 增量期の筋トレ初心者
- 勤務形態: 週2出社、週3在宅
- 目標カロリー: ${GOAL_CALORIES} kcal/日
- 目標PFC: P${GOAL_PFC.protein}g / F${GOAL_PFC.fat}g / C${GOAL_PFC.carbs}g
- あすけんで食事記録、Strongアプリで筋トレ記録、ヘルスケア連携で歩数計測

## 回答ルール
- 日本語で回答する
- 最初に「総合スコア: XX/100点」を明示する
- 各セクションの得点内訳と理由を簡潔に記載
- 改善点と提案メニューを3つ（各PFC・カロリー付き）
- 週次まとめの場合は、週全体の傾向・良かった日・改善が必要な日を具体的に挙げる`;
}
