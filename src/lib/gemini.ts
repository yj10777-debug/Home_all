import { prisma } from "./prisma";
import { getGoals } from "./dbConfig";
import { getWorkLocation } from "./googleCalendar";
import { calculateDailyScore, isDayRecorded } from "./scoring";

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
  hasHiking?: boolean;
  // AppleWatch / Google Fit 由来の健康指標（任意）
  totalCalories?: number | null;
  restingHeartRate?: number | null;
  avgHeartRate?: number | null;
  sleepMinutes?: number | null;
  distanceMeters?: number | null;
  activeMinutes?: number | null;
  weightKg?: number | null;
};

/** PFC 合計値 */
export type PfcTotals = { protein: number; fat: number; carbs: number };

export const GOAL_CALORIES = 2267;
/** 採点時に仮定する体重（kg）。たんぱく質 g/kg 判定に使用 */
export const ASSUMED_WEIGHT_KG = 75;
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
    hasHiking: record.hasHiking ?? false,
    totalCalories: record.totalCalories ?? null,
    restingHeartRate: record.restingHeartRate ?? null,
    avgHeartRate: record.avgHeartRate ?? null,
    sleepMinutes: record.sleepMinutes ?? null,
    distanceMeters: record.distanceMeters ?? null,
    activeMinutes: record.activeMinutes ?? null,
    weightKg: record.weightKg ?? null,
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
 * @param trigger 実行トリガー（"manual" の場合は現在時刻を考慮したアドバイスを追加）
 * @returns プロンプトテキスト
 * @throws データが見つからない場合
 */
export async function generateDailyPrompt(dateStr: string, trigger: "manual" | "cron" = "cron"): Promise<string> {
  const [dayData, goals, workLocation] = await Promise.all([
    loadDayData(dateStr),
    getGoals(),
    getWorkLocation(dateStr),
  ]);
  if (!dayData) {
    throw new Error(`${dateStr} のデータが見つかりません。先にデータを同期してください。`);
  }

  const pfc = computePfc(dayData.askenNutrients);
  const totalCalories = computeTotalCalories(dayData.askenNutrients, dayData.askenItems);
  const snackCalories = computeSnackCalories(dayData.askenNutrients, dayData.askenItems);
  const mealText = formatMealItems(dayData.askenItems);
  const workoutText = formatWorkouts(dayData.strongData);

  const workLocationLabel = workLocation ?? "データなし";
  const exerciseCalories = dayData.exerciseCalories != null && dayData.exerciseCalories > 0 ? dayData.exerciseCalories : 0;
  // AppleWatch 由来の総消費カロリー（BMR含む）があれば、推定消費よりこちらを優先（精度高い）
  const measuredTotalExpenditure = dayData.totalCalories != null && dayData.totalCalories > 0 ? Math.round(dayData.totalCalories) : null;
  const estimatedExpenditure = goals.calories + exerciseCalories;
  const usedExpenditure = measuredTotalExpenditure ?? estimatedExpenditure;
  const expenditureLabel = measuredTotalExpenditure != null
    ? `${measuredTotalExpenditure} kcal（AppleWatch 実測の総消費）`
    : `${estimatedExpenditure} kcal（目標 ${goals.calories} ＋ 運動消費 ${exerciseCalories}）`;
  const calorieDiff = Math.round(totalCalories - usedExpenditure);
  // 体重は AppleWatch/ヘルスケアで取れていればそれを優先
  const effectiveWeightKg = dayData.weightKg != null && dayData.weightKg > 0 ? dayData.weightKg : ASSUMED_WEIGHT_KG;
  const proteinPerKg = effectiveWeightKg > 0 ? (pfc.protein / effectiveWeightKg).toFixed(2) : "不明";
  const fatRatioPct = totalCalories > 0 ? Math.round((pfc.fat * 9 / totalCalories) * 100) : 0;

  // 確定スコア（アプリ側で確定計算。AIには再計算させず転記させる）
  const sc = calculateDailyScore(dayData, effectiveWeightKg, goals);
  const unrecordedNote = sc.total === 0
    ? "\n※この日は食事・筋トレ・登山の記録がないため採点対象外（0点）。総評では責めず、まず記録を残すことを前向きに促すこと。"
    : "";
  const scoreBlock = `## 確定スコア（再計算せず、総合スコアと内訳にこの数値をそのまま転記すること）${unrecordedNote}
- 総合スコア: ${sc.total}点
- エネルギー: ${sc.details.energy.score}/30
- たんぱく質: ${sc.details.protein.score}/20
- 刺激: ${sc.details.stimulus.score}/20
- 回復: ${sc.details.recovery.score}/15
- 活動量: ${sc.details.activity.score}/10
- 栄養バランス: ${sc.details.nutritionBalance.score}/5
- 登山ボーナス: +${sc.details.climbingBonus.score}`;

  // 体の状態セクション（AppleWatch/Google Fit 経由のデータ）
  const bodyLines: string[] = [];
  if (dayData.weightKg != null) bodyLines.push(`- 体重: ${dayData.weightKg.toFixed(1)} kg`);
  if (dayData.sleepMinutes != null) {
    const h = Math.floor(dayData.sleepMinutes / 60);
    const m = dayData.sleepMinutes % 60;
    bodyLines.push(`- 睡眠時間: ${h}時間${m}分（${(dayData.sleepMinutes / 60).toFixed(1)}h）`);
  }
  if (dayData.restingHeartRate != null) bodyLines.push(`- 安静時心拍数: ${dayData.restingHeartRate} bpm`);
  if (dayData.avgHeartRate != null) bodyLines.push(`- 平均心拍数: ${dayData.avgHeartRate} bpm`);
  if (dayData.activeMinutes != null) bodyLines.push(`- 活動時間: ${dayData.activeMinutes} 分`);
  if (dayData.distanceMeters != null) bodyLines.push(`- 移動距離: ${(dayData.distanceMeters / 1000).toFixed(2)} km`);
  const bodySection = bodyLines.length > 0
    ? `\n## 体の状態（AppleWatch/ヘルスケア由来）\n${bodyLines.join("\n")}\n`
    : "";

  return `以下のデータをもとに、システムプロンプトの「評価スコアモデル」に従って今日を採点し、良かった点を認めたうえで、残りの食事で何を食べるべきかを前向きに提案してください。

## 目標
- カロリー: ${goals.calories} kcal/日（減量目的のため、推定消費に対し -300〜-500kcal が理想）
- たんぱく質(P): ${goals.protein}g / 脂質(F): ${goals.fat}g / 炭水化物(C): ${goals.carbs}g
- 体重: ${effectiveWeightKg}kg${dayData.weightKg != null ? "（実測）" : "（仮定）"}

## 勤務形態
- ${workLocationLabel}（出社＝通勤・外出あり、在宅＝平日在宅、休日＝土日。在宅日は歩数少なめ・活動量低めでも許容してよい）

## 今日の摂取状況 (${dateStr})
- 合計カロリー: ${totalCalories} kcal${snackCalories > 0 ? `（うち間食 ${snackCalories} kcal。間食はPFC内訳不明のためカロリーのみ加算）` : ""}
- 消費カロリー: ${expenditureLabel}
- カロリー収支: ${calorieDiff >= 0 ? "+" : ""}${calorieDiff} kcal（マイナス＝減量に有利）
- たんぱく質: ${Math.round(pfc.protein)}g（${proteinPerKg}g/kg・目標まであと ${Math.max(0, Math.round(goals.protein - pfc.protein))}g）
- 脂質: ${Math.round(pfc.fat)}g（目標まであと ${Math.max(0, Math.round(goals.fat - pfc.fat))}g・脂質エネルギー比 ${fatRatioPct}%）
- 炭水化物: ${Math.round(pfc.carbs)}g（目標まであと ${Math.max(0, Math.round(goals.carbs - pfc.carbs))}g）

## 食事内容
${mealText}

## 筋トレ内容
${workoutText}

## 登山
- ${dayData.hasHiking ? "この日は登山を実施（下半身・有酸素を含む高負荷活動。トレーニング刺激と登山ボーナスに反映すること）" : "登山なし"}

## 運動・歩数
${dayData.steps != null ? `- 歩数: ${dayData.steps.toLocaleString()} 歩` : "- 歩数データなし"}
${exerciseCalories > 0 ? `- 運動消費カロリー: ${exerciseCalories} kcal` : "- 運動消費カロリーデータなし"}
${bodySection}
${scoreBlock}

## 回答ルール
- 総合スコアと内訳は上記「確定スコア」の数値をそのまま転記する（自分で再計算・推定しない）。
- あなたの役割は、確定スコアを踏まえた前向きな総評と、残りの食事で食べるべきメニュー3つ（各カロリー・PFC付き）の提案。
- 出力形式はシステムプロンプトの指示に従う。${trigger === "manual" ? generateManualAdviceSection() : ""}`;
}

/**
 * 手動実行時のみ付与する「今から寝るまでにできること」セクションを生成する
 * 現在時刻（JST）を基準に、残り時間で取れるアクションをAIに提案させる
 */
function generateManualAdviceSection(): string {
  const now = new Date();
  // JST（UTC+9）に変換
  const jstOffset = 9 * 60;
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
  const jst = new Date(utcMs + jstOffset * 60 * 1000);
  const hours = jst.getHours();
  const minutes = jst.getMinutes();
  const timeStr = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;

  return `

## 今から寝るまでにできること（現在 ${timeStr}）
以下を踏まえて、今日の残り時間でスコアを上げるために取れる**具体的なアクション**を優先度順に提案してください。
- 現在時刻は ${timeStr} です。就寝は24:00頃と仮定してください。
- 減点されている項目を中心に、残り時間で現実的に改善できることに絞ること。
- 食事の提案は具体的メニュー名・量・PFCを明記すること。
- 筋トレ未実施なら、今からでも可能な短時間メニューを提案（遅い時間帯なら翌日への持ち越しでもOK）。
- 歩数不足なら、散歩の時間・距離の目安を提案。
- 既に達成済みの項目は「維持でOK」と簡潔に。
- 3〜5個の箇条書きで、最も効果の高いものから順に。`;
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

  const goals = await getGoals();

  const saturdayStr = dateStrs[6];
  const dailySummaries: string[] = [];
  const dailyScoreLines: string[] = [];
  let weekTotalCalories = 0;
  let weekTotalProtein = 0;
  let weekTotalFat = 0;
  let weekTotalCarbs = 0;
  let workoutDays = 0;
  let totalVolume = 0;
  let weekTotalScore = 0;
  let scoredDays = 0;
  // 健康指標（AppleWatch由来）の集計
  let weekTotalSteps = 0;
  let stepsDays = 0;
  let weekTotalSleepMinutes = 0;
  let sleepDays = 0;
  let weekTotalRestingHR = 0;
  let restingHRDays = 0;
  let weekTotalActiveMinutes = 0;
  let activeMinutesDays = 0;
  let weekTotalCalBalance = 0;
  let calBalanceDays = 0;
  let latestWeightKg: number | null = null;

  for (const dateStr of dateStrs) {
    const record = recordMap.get(dateStr);
    if (!record) {
      dailySummaries.push(`${dateStr}: データなし`);
      dailyScoreLines.push(`${dateStr}: データなし`);
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

    const dayData: DayData = {
      date: record.date,
      askenItems: items,
      askenNutrients: nutrients,
      strongData: strong,
      steps: record.steps ?? null,
      exerciseCalories: record.exerciseCalories ?? null,
      hasHiking: record.hasHiking ?? false,
      totalCalories: record.totalCalories ?? null,
      restingHeartRate: record.restingHeartRate ?? null,
      avgHeartRate: record.avgHeartRate ?? null,
      sleepMinutes: record.sleepMinutes ?? null,
      distanceMeters: record.distanceMeters ?? null,
      activeMinutes: record.activeMinutes ?? null,
      weightKg: record.weightKg ?? null,
    };

    // 食事・筋トレ・登山のいずれも無い日は「記録なし」とし、採点・週平均から除外する
    if (!isDayRecorded(dayData)) {
      dailySummaries.push(`${dateStr}: 記録なし`);
      dailyScoreLines.push(`${dateStr}: 記録なし`);
      continue;
    }

    const hiking = (record.hasHiking ?? false) ? " / 登山あり⛰️" : "";
    dailySummaries.push(
      `${dateStr}: ${cal}kcal / P${Math.round(pfc.protein)}g F${Math.round(pfc.fat)}g C${Math.round(pfc.carbs)}g / ${workoutSummary}${hiking}`
    );

    // 健康指標を集計
    if (record.steps != null) { weekTotalSteps += record.steps; stepsDays++; }
    if (record.sleepMinutes != null) { weekTotalSleepMinutes += record.sleepMinutes; sleepDays++; }
    if (record.restingHeartRate != null) { weekTotalRestingHR += record.restingHeartRate; restingHRDays++; }
    if (record.activeMinutes != null) { weekTotalActiveMinutes += record.activeMinutes; activeMinutesDays++; }
    if (record.totalCalories != null) {
      weekTotalCalBalance += cal - record.totalCalories;
      calBalanceDays++;
    }
    if (record.weightKg != null) latestWeightKg = record.weightKg;

    // 日別の確定スコア（アプリ側で確定計算）。体重が取れていればそれを使う。
    const effectiveWeight = record.weightKg ?? ASSUMED_WEIGHT_KG;
    const sc = calculateDailyScore(dayData, effectiveWeight, goals);
    weekTotalScore += sc.total;
    scoredDays++;
    dailyScoreLines.push(`${dateStr}: ${sc.total}点`);
  }

  const avgCalories = Math.round(weekTotalCalories / 7);
  const avgProtein = Math.round(weekTotalProtein / 7);
  const avgFat = Math.round(weekTotalFat / 7);
  const avgCarbs = Math.round(weekTotalCarbs / 7);
  const avgScore = scoredDays > 0 ? Math.round(weekTotalScore / scoredDays) : 0;
  const avgSteps = stepsDays > 0 ? Math.round(weekTotalSteps / stepsDays) : null;
  const avgSleepHours = sleepDays > 0 ? (weekTotalSleepMinutes / sleepDays / 60).toFixed(1) : null;
  const avgRestingHR = restingHRDays > 0 ? Math.round(weekTotalRestingHR / restingHRDays) : null;
  const avgActiveMinutes = activeMinutesDays > 0 ? Math.round(weekTotalActiveMinutes / activeMinutesDays) : null;
  const avgCalBalance = calBalanceDays > 0 ? Math.round(weekTotalCalBalance / calBalanceDays) : null;

  const healthLines: string[] = [];
  if (avgSteps != null) healthLines.push(`- 平均歩数: ${avgSteps.toLocaleString()} 歩/日`);
  if (avgActiveMinutes != null) healthLines.push(`- 平均活動時間: ${avgActiveMinutes} 分/日`);
  if (avgCalBalance != null) healthLines.push(`- 平均カロリー収支: ${avgCalBalance >= 0 ? "+" : ""}${avgCalBalance} kcal/日（実測総消費との差）`);
  if (avgSleepHours != null) healthLines.push(`- 平均睡眠: ${avgSleepHours}時間`);
  if (avgRestingHR != null) healthLines.push(`- 平均安静時心拍: ${avgRestingHR} bpm`);
  if (latestWeightKg != null) healthLines.push(`- 直近体重: ${latestWeightKg.toFixed(1)} kg`);
  const healthSection = healthLines.length > 0
    ? `\n## 週間健康指標（AppleWatch由来）\n${healthLines.join("\n")}\n`
    : "";

  const weeklyScoreBlock = `## 確定スコア（再計算せず、日別スコアと週平均にこの数値をそのまま転記すること）
${dailyScoreLines.join("\n")}
- 週平均スコア: ${avgScore}点（記録あり${scoredDays}日の平均）`;

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
${healthSection}
${weeklyScoreBlock}

## 回答ルール
- 日別スコアと週平均スコアは上記「確定スコア」の数値をそのまま転記する（再計算しない）。
- まず良かった点を具体的な日付とともに認める（前向きなトーン）。
- 構成: 1) 週全体の総評（週平均スコアに触れる）、2) 良かった日・ポイント、3) 次に伸ばせる日・ポイント、4) 来週に向けた具体的アドバイス。`;
}

/**
 * 専用 Gem に設定するシステムプロンプトを返す
 * 筋トレ・食事 評価スコアモデル（100点満点・単一ファイル版）
 */
export function getGemSystemPrompt(): string {
  return `あなたは栄養管理と筋トレに詳しい、前向きで親身なパーソナルトレーナーです。
ユーザーの目的は「減量しつつ筋量維持＋登山適性向上」。渡されたデータを下記「評価スコアモデル」で採点し、まず良かった点を具体的に認めたうえで、次の一手を励ましながら助言してください。

■ 基本姿勢（厳守）
・ユーザーのやる気を引き出すことを最優先する。できている点を必ず最初に具体的に挙げて認める。
・足りない点は「減点」「ダメ」ではなく「次に伸ばせる余地」として前向きに書く。冷たい断定や厳しい言い回しは避ける。
・休息日・登山日など筋トレをしていない日を一律に責めない（③のルールに従う）。
・「承知しました」等の挨拶や前置きは書かない。簡潔に、要点のみ。

■ 入力データ（渡されたもののみ使用。無い項目は満点扱いまたはスキップ）
体重 / 摂取カロリー / 推定消費カロリー / カロリー収支 / たんぱく質 / 脂質 / 炭水化物 / 筋トレ内容 / 歩数 / 運動消費カロリー / 登山実施フラグ / 睡眠（任意）

────────────────────────
評価スコアモデル（合計100点 ＋ 登山ボーナス）。各項目「満点に対しどれだけ取れたか」の加点方式で考える。

① エネルギーバランス（30点）
カロリー収支 = 摂取カロリー − 推定消費カロリー（推定消費 = 目標カロリー ＋ 運動消費カロリー）
減量目的の理想は -300〜-500。下記の区間は重複しない。収支の数値が入る区間を1つだけ選ぶこと（数値が大きくマイナスなら必ず一番上の区間）。
・-700未満（大きなマイナス。登山日・高活動日に多い） → 22
・-700〜-500 → 27
・-500〜-300（理想） → 30
・-300〜-200 → 27
・-200〜-100 → 23
・-100〜+100 → 18
・+100〜+200 → 13
・+200より大きい → 9
※登山日・運動消費が多い高活動日は、大きなマイナス収支でも問題なし。-700未満でも22点を下限とし責めない。むしろ「よく動いた」と認める。

② たんぱく質（20点）
g/kg = たんぱく質摂取量 ÷ 体重（体重不明なら目標P${GOAL_PFC.protein}gに対する達成率で代用）
2.0以上 → 20  /  1.8–1.99 → 17  /  1.6–1.79 → 14  /  1.4–1.59 → 11  /  1.4未満 → 8（1.4未満は必ず8点。高くしない）

③ トレーニング刺激（20点）
・筋トレを実施した日: 次の各5点の合計。コンパウンド種目あり / 合計10セット以上 / 6–12回レンジ中心 / 漸進性あり。
・登山を実施した日（筋トレなしでも）: 下半身・全身持久の高負荷刺激として 18点 を基準に評価。
・筋トレも登山もない日: 計画的な休息日とみなし 満点(20点)扱い。休んだことを責めない。

④ 回復（15点）
7時間以上 → 15  /  6.5–6.9 → 13  /  6.0–6.4 → 11  /  5.5–5.9 → 8  /  5.5未満 → 5
※睡眠データがない場合は満点(15点)扱いとし、減点しない。ただしその際は「睡眠が良好だった」と断定せず、「睡眠は記録なしのため満点扱い」として総評で触れること。

⑤ 活動量（10点）
10000歩以上 → 10  /  8000–9999 → 9  /  6000–7999 → 7  /  4000–5999 → 5  /  4000未満 → 3

⑥ 栄養バランス（5点）
プロンプトに記載の「脂質エネルギー比 ○%」をそのまま使う（自分で再計算しない）。
20–30% → 5  /  15–20%または30–35% → 4  /  15%未満 → 4  /  35%超 → 2

■ 登山ボーナス（最大+8点。最終スコア上限100）。次の該当分を必ず合算する（省略禁止）。
・登山実施フラグあり → 必ず +5 を計上（下半身・有酸素を兼ねた登山適性向上の直接活動）
・筋トレで下半身種目あり → +3
・運動消費200kcal以上の有酸素 → +2
（合算し最大+8。例: 登山フラグあり＋運動消費200kcal以上 = +7）

■ 総合スコア = ①+②+③+④+⑤+⑥ ＋ 登山ボーナス（上限100）

■ 評価基準（前向きな表現で）
85–100 → 非常に良い  75–84 → 良い  65–74 → 及第点・あと一歩  55–64 → 伸びしろあり  55未満 → 仕切り直して前進

■ スコアの扱い（重要）
・日次・週次いずれも、プロンプトに「確定スコア」が与えられる。スコア（日次の総合・内訳、週次の日別・週平均）は必ずその数値をそのまま転記し、自分で再計算・推定しないこと。
・上記①〜⑥と登山ボーナスの基準は、総評で「なぜこの点なのか」を説明するための参考。点数自体は確定スコアに従う。

■ 出力形式（この順）
1. 総評（1行目から、挨拶なし）: まず良かった点を具体的に1つ以上認め、続いて次の一手を1〜2文。前向きなトーンで合計2〜3文。
2. 空行のあと「総合スコア: XX点」（確定スコアの値）。
3. 内訳: エネルギー: X/30 たんぱく質: X/20 刺激: X/20 回復: X/15 活動量: X/10 栄養バランス: X/5 登山ボーナス: +X（すべて確定スコアの値）
4. 残りの食事で食べるべきメニューを3つ提案（各カロリー・PFC付き）。
5. 週次まとめの場合は、与えられた確定スコアの日別スコア・週平均スコアをそのまま転記し、週全体の傾向・良かった日・次に伸ばせる日を具体的に。
`;
}
