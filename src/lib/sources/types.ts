/**
 * データソース拡張用の型・インターフェース
 * 現状はあすけん・Strong のみ。将来他アプリ対応時に同じ型で扱う。
 */

/** あすけんの1食分アイテム */
export type NutritionItem = {
  mealType: string;
  name: string;
  amount: string;
  calories: number;
};

/** あすけんの運動データ（歩数・消費カロリー） */
export type NutritionExercise = { steps: number; calories: number };

/** 1日分の栄養データ取得結果（あすけんスクレイピング等） */
export type NutritionDayResult = {
  date: string;
  items: NutritionItem[];
  nutrients: Partial<Record<string, Record<string, string>>>;
  exercise?: NutritionExercise;
};

/** Strong 1種目の集計 */
export type StrongExercise = {
  name: string;
  sets: number;
  volumeKg: number;
  reps?: number;
};

/** Strong 1ワークアウト */
export type StrongWorkout = {
  title: string;
  totals: { sets: number; reps: number; volumeKg: number };
  exercises: StrongExercise[];
};

/** 1日分のトレーニングデータ（Strong パース結果） */
export type StrongDayData = {
  workouts: StrongWorkout[];
  totals: { workouts: number; sets: number; volumeKg: number };
};

/** 栄養データ取得の戻り値（1日分） */
export type FetchNutritionResult = {
  ok: boolean;
  data?: NutritionDayResult;
  error?: string;
};

/** トレーニングデータ取得の戻り値（複数日） */
export type FetchTrainingResult = {
  data: Map<string, StrongDayData>;
  errors: string[];
};

/** 栄養データソース（あすけん・将来の他アプリ）のインターフェース */
export interface INutritionSource {
  fetchForDate(date: string, userId?: string): Promise<FetchNutritionResult>;
}

/** トレーニングデータソース（Strong・将来の他アプリ）のインターフェース */
export interface ITrainingSource {
  fetchForDateRange(dates: Set<string>): Promise<FetchTrainingResult>;
}
