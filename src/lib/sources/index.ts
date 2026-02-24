/**
 * データソース拡張レイヤー
 * 栄養・トレーニングの取得をプロバイダーで抽象化。あすけん・Strong は現状の実装、将来他アプリを追加可能。
 */

export * from "./types";
export { getAskenCredentials } from "./credentials";
export { fetchNutritionForDate, readNutritionFallbackFile } from "./asken";
export {
  fetchTrainingForDateRange,
  parseTxtContent,
  buildStrongData,
  parseStrongFiles,
} from "./strong";
