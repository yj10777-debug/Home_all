/**
 * 日付ユーティリティ
 * 朝5時までは「前日」として扱う
 */
import { format, subDays } from "date-fns";

/** 日付の境界時刻（この時刻より前は前日扱い） */
const DAY_BOUNDARY_HOUR = 5;

/**
 * 朝5時までは前日として扱った「実効的な今日」を返す
 * @param now 基準時刻（デフォルト: 現在時刻）
 * @returns JST基準で朝5時前なら前日の Date、そうでなければ当日の Date
 */
export function getEffectiveToday(now?: Date): Date {
  const d = now ?? new Date();
  // JST = UTC+9
  const jstHour = (d.getUTCHours() + 9) % 24;
  if (jstHour < DAY_BOUNDARY_HOUR) {
    return subDays(d, 1);
  }
  return d;
}

/**
 * 実効的な今日を "yyyy-MM-dd" 文字列で返す
 */
export function getEffectiveTodayStr(now?: Date): string {
  return format(getEffectiveToday(now), "yyyy-MM-dd");
}
