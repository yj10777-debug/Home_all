/**
 * AppleWatch / Google Fit データソース
 * 内部実装は googleFit.ts（Google Fitness REST API）。Fit API 終了後は別実装に差し替える。
 * 上位レイヤ（syncData.ts）はこのファイルの interface だけを見る。
 */

import { fetchFitDailyAggregateRange } from "../googleFit";
import type { FetchHealthResult, HealthDayData } from "./types";

/**
 * 日付集合に対するヘルスケアデータをまとめて取得する。
 * 未設定時は空 Map を返す（エラー扱いではない）。
 */
export async function fetchHealthForDateRange(dates: Set<string>): Promise<FetchHealthResult> {
  const errors: string[] = [];
  const result = new Map<string, HealthDayData>();

  if (dates.size === 0) return { data: result, errors };

  try {
    const dateList = Array.from(dates).sort();
    const fitResult = await fetchFitDailyAggregateRange(dateList);
    if (fitResult === null) {
      // 未設定時はスキップ
      return { data: result, errors };
    }
    errors.push(...fitResult.errors);
    for (const [date, m] of fitResult.data) {
      const day: HealthDayData = {
        date,
        steps: m.steps,
        activeCalories: m.activeCalories,
        totalCalories: m.totalCalories,
        restingHeartRate: m.restingHeartRate,
        avgHeartRate: m.avgHeartRate,
        sleepMinutes: m.sleepMinutes,
        distanceMeters: m.distanceMeters,
        activeMinutes: m.activeMinutes,
        weightKg: m.weightKg,
        raw: m.raw,
      };
      result.set(date, day);
    }
  } catch (e) {
    errors.push(`Health: ${String(e)}`);
  }

  return { data: result, errors };
}
