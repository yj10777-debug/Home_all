/**
 * AppleWatch ヘルスデータの抽象データソース
 *
 * 内部実装は環境変数 HEALTH_SOURCE で切り替え:
 *  - "fit"   (default): googleFit.ts → Google Fitness REST API
 *  - "drive":           healthAutoExport.ts → Google Drive 上の Health Auto Export JSON
 *
 * Google Fitness REST API は 2026-06-30 終了予定。終了後は HEALTH_SOURCE=drive に
 * 切り替える前提。上位レイヤ(syncData.ts)は本ファイルの interface だけを見る。
 */

import { fetchFitDailyAggregateRange } from "../googleFit";
import { fetchHealthFromAutoExport, isHealthAutoExportConfigured } from "../healthAutoExport";
import type { FetchHealthResult, HealthDayData } from "./types";

/** 環境変数による実装選択。明示指定がなければ Fit、未設定の場合のみ Drive を試す */
function selectSource(): "fit" | "drive" {
  const env = (process.env.HEALTH_SOURCE ?? "").toLowerCase();
  if (env === "drive") return "drive";
  if (env === "fit") return "fit";
  // 自動判定: Fit が使えれば fit, 設定が無く Drive が設定されていれば drive
  return "fit";
}

async function fetchFromFit(dates: Set<string>): Promise<FetchHealthResult> {
  const errors: string[] = [];
  const result = new Map<string, HealthDayData>();
  const dateList = Array.from(dates).sort();
  const fitResult = await fetchFitDailyAggregateRange(dateList);
  if (fitResult === null) return { data: result, errors };
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
  return { data: result, errors };
}

async function fetchFromDrive(dates: Set<string>): Promise<FetchHealthResult> {
  const errors: string[] = [];
  const result = new Map<string, HealthDayData>();
  const haeResult = await fetchHealthFromAutoExport(dates);
  if (haeResult === null) return { data: result, errors };
  errors.push(...haeResult.errors);
  for (const [date, day] of haeResult.data) {
    if (!dates.has(date)) continue;
    result.set(date, day);
  }
  return { data: result, errors };
}

/**
 * 日付集合に対するヘルスケアデータをまとめて取得する。
 * 未設定時は空 Map を返す（エラー扱いではない）。
 */
export async function fetchHealthForDateRange(dates: Set<string>): Promise<FetchHealthResult> {
  const errors: string[] = [];
  const result = new Map<string, HealthDayData>();

  if (dates.size === 0) return { data: result, errors };

  try {
    const source = selectSource();
    // Drive 明示指定 or Drive 設定済み(明示指定なし) で Fit が必要ない場合
    if (source === "drive" && isHealthAutoExportConfigured()) {
      return await fetchFromDrive(dates);
    }
    return await fetchFromFit(dates);
  } catch (e) {
    errors.push(`Health: ${String(e)}`);
    return { data: result, errors };
  }
}
