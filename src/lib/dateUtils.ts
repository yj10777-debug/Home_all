/**
 * 日付ユーティリティ
 * 朝5時までは「前日」として扱う
 * すべての日付計算は JST (UTC+9) 固定で行う（サーバーTZに依存しない）
 */

/** 日付の境界時刻（この時刻より前は前日扱い） */
const DAY_BOUNDARY_HOUR = 5;

/** JST オフセット（ミリ秒） */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 指定時刻を JST に変換した Date を返す（UTC メソッドで JST の値を取得できる）
 */
function toJst(d: Date): Date {
  return new Date(d.getTime() + JST_OFFSET_MS);
}

/**
 * 朝5時までは前日として扱った「実効的な今日」を返す
 * @param now 基準時刻（デフォルト: 現在時刻）
 * @returns JST基準で朝5時前なら前日の Date、そうでなければ当日の Date
 */
export function getEffectiveToday(now?: Date): Date {
  const d = now ?? new Date();
  const jst = toJst(d);
  const jstHour = jst.getUTCHours();
  if (jstHour < DAY_BOUNDARY_HOUR) {
    // JST で前日にする（24時間引く）
    return new Date(d.getTime() - 24 * 60 * 60 * 1000);
  }
  return d;
}

/**
 * 任意の Date を JST 基準で "yyyy-MM-dd" にフォーマットする
 * date-fns の format はシステム TZ に依存するため、手動で JST フォーマットする
 */
export function formatDateJst(date: Date): string {
  const jst = toJst(date);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(jst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 実効的な今日を "yyyy-MM-dd" 文字列で返す（常に JST 基準）
 */
export function getEffectiveTodayStr(now?: Date): string {
  return formatDateJst(getEffectiveToday(now));
}
