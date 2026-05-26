/**
 * Google Fitness REST API クライアント（AppleWatch → iPhone ヘルスケア → Google Fit 同期データ取得用）
 *
 * !!! 重要 !!!
 * Google Fit API は 2026-06-30 をもって終了予定。
 * 代替経路の候補（実装着手順）:
 *   1. iOS「Health Auto Export」アプリで Google Drive 連携 → 既存 googleDrive.ts で取り込み
 *   2. HealthKit → ショートカットアプリで JSON 出力 → Drive 経由
 *   3. ユーザー自前の中継 Worker
 * src/lib/sources/appleHealth.ts のインターフェースを変えずに、本ファイルの実装を差し替えるだけで移行できる構成にしている。
 */

import { getGoogleAccessToken, getGoogleOAuthConfig } from "./googleAuth";

const FIT_AGGREGATE_URL = "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate";
const FIT_SESSIONS_URL = "https://www.googleapis.com/fitness/v1/users/me/sessions";
/** Google が提供する安静時心拍の派生データソース */
const RESTING_HR_DATA_SOURCE_ID =
  "derived:com.google.heart_rate.bpm:com.google.android.gms:resting_heart_rate<-merge_heart_rate_bpm";
/** ActivityType 72 = SLEEP（Fit のセッション分類） */
const ACTIVITY_TYPE_SLEEP = 72;

/** Fit API で取得する日次健康データ */
export type FitDailyMetrics = {
  date: string;
  steps?: number;
  activeCalories?: number;
  totalCalories?: number;
  activeMinutes?: number;
  distanceMeters?: number;
  avgHeartRate?: number;
  restingHeartRate?: number;
  sleepMinutes?: number;
  weightKg?: number;
  raw?: unknown;
};

type FitPointValue = { intVal?: number; fpVal?: number };
type FitPoint = {
  startTimeNanos?: string;
  endTimeNanos?: string;
  dataTypeName?: string;
  value?: FitPointValue[];
};
type FitDataset = { dataSourceId?: string; point?: FitPoint[] };
type FitBucket = { startTimeMillis?: string; endTimeMillis?: string; dataset?: FitDataset[] };
type FitAggregateResponse = { bucket?: FitBucket[] };

const DAY_MS = 24 * 60 * 60 * 1000;

/** 日付 (YYYY-MM-DD) の JST 0:00 を UTC ミリ秒で返す */
function jstMidnightMillis(date: string): number {
  return new Date(`${date}T00:00:00+09:00`).getTime();
}

/** 設定済みかどうか */
export function isGoogleFitConfigured(): boolean {
  return getGoogleOAuthConfig() !== null;
}

/**
 * 単一データタイプの値合計を取り出す（intVal または fpVal を合算）
 */
function sumPoints(dataset: FitDataset | undefined, kind: "int" | "fp"): number | undefined {
  if (!dataset?.point || dataset.point.length === 0) return undefined;
  let total = 0;
  for (const p of dataset.point) {
    const v = p.value?.[0];
    if (!v) continue;
    if (kind === "int") {
      if (typeof v.intVal === "number") total += v.intVal;
    } else {
      if (typeof v.fpVal === "number") total += v.fpVal;
    }
  }
  return total;
}

/** 数値ポイントの平均値（fpVal） */
function avgFpPoints(dataset: FitDataset | undefined): number | undefined {
  if (!dataset?.point || dataset.point.length === 0) return undefined;
  let sum = 0;
  let count = 0;
  for (const p of dataset.point) {
    const v = p.value?.[0];
    if (v && typeof v.fpVal === "number") {
      sum += v.fpVal;
      count += 1;
    }
  }
  return count > 0 ? sum / count : undefined;
}

/** 最新ポイントの fpVal を返す（体重用） */
function latestFpPoint(dataset: FitDataset | undefined): number | undefined {
  if (!dataset?.point || dataset.point.length === 0) return undefined;
  let latest: { t: number; v: number } | null = null;
  for (const p of dataset.point) {
    const v = p.value?.[0];
    if (!v || typeof v.fpVal !== "number") continue;
    const t = p.endTimeNanos ? Number(p.endTimeNanos) : 0;
    if (!latest || t > latest.t) latest = { t, v: v.fpVal };
  }
  return latest?.v;
}

/** 睡眠セグメントの合計分数を計算（startTime/endTime の差分） */
function sleepMinutesFromSegments(dataset: FitDataset | undefined): number | undefined {
  if (!dataset?.point || dataset.point.length === 0) return undefined;
  let totalNanos = 0;
  for (const p of dataset.point) {
    if (!p.startTimeNanos || !p.endTimeNanos) continue;
    // sleep_type: 1=awake は除外、それ以外（2:sleep, 4:light, 5:deep, 6:rem）を加算
    const segType = p.value?.[0]?.intVal;
    if (segType === 1) continue;
    const start = Number(p.startTimeNanos);
    const end = Number(p.endTimeNanos);
    if (end > start) totalNanos += end - start;
  }
  if (totalNanos === 0) return undefined;
  return Math.round(totalNanos / 1_000_000 / 60_000); // nanos → ms → minutes
}

type FitSession = {
  id?: string;
  name?: string;
  startTimeMillis?: string;
  endTimeMillis?: string;
  activityType?: number;
  application?: { packageName?: string };
};
type FitSessionsResponse = { session?: FitSession[] };

/** 区間配列を開始順にソートしオーバーラップする部分をマージして総分数を返す */
function mergeAndSumMinutes(intervals: Array<[number, number]>): number {
  if (intervals.length === 0) return 0;
  intervals.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const cur of intervals) {
    const last = merged[merged.length - 1];
    if (last && cur[0] <= last[1]) {
      last[1] = Math.max(last[1], cur[1]);
    } else {
      merged.push([cur[0], cur[1]]);
    }
  }
  const totalMs = merged.reduce((sum, [s, e]) => sum + (e - s), 0);
  return Math.round(totalMs / 60000);
}

/**
 * Sessions API レスポンスから睡眠セッション合計分数を計算（テスト用に export）
 *
 * 同じ夜の睡眠が複数アプリ（Apple workout, AutoSleep, Google純正など）から
 * 報告されることがあるが、各アプリで定義が異なる:
 *  - Apple workout: 実睡眠時間（推定）
 *  - AutoSleep など: 在床時間（消灯〜起床）— Apple より長くなる傾向
 *
 * 重複加算を避けつつ「在床時間」で水増しされないよう、
 * **アプリ別に区間をマージして総分数を計算 → アプリ間で最小値を採用**する。
 * これにより最も保守的（タイトな）睡眠時間が選ばれる。
 */
export function parseSleepSessions(data: FitSessionsResponse): number | undefined {
  const sessions = data.session ?? [];
  if (sessions.length === 0) return undefined;

  // アプリパッケージ別に区間をグループ化
  const byApp = new Map<string, Array<[number, number]>>();
  for (const s of sessions) {
    if (s.activityType !== ACTIVITY_TYPE_SLEEP) continue;
    const ss = s.startTimeMillis ? Number(s.startTimeMillis) : 0;
    const se = s.endTimeMillis ? Number(s.endTimeMillis) : 0;
    if (se <= ss) continue;
    const app = s.application?.packageName ?? "_unknown";
    if (!byApp.has(app)) byApp.set(app, []);
    byApp.get(app)!.push([ss, se]);
  }
  if (byApp.size === 0) return undefined;

  // 各アプリの合計分数を計算 → 最小値を採用（最も保守的）
  let minMinutes: number | undefined;
  for (const intervals of byApp.values()) {
    const minutes = mergeAndSumMinutes(intervals);
    if (minutes === 0) continue;
    if (minMinutes === undefined || minutes < minMinutes) minMinutes = minutes;
  }
  return minMinutes;
}

/** Sessions API で睡眠セッション合計分数を取得（失敗時 undefined） */
async function fetchSleepMinutesFromSessions(
  accessToken: string,
  startMs: number,
  endMs: number,
): Promise<number | undefined> {
  const startISO = new Date(startMs).toISOString();
  const endISO = new Date(endMs).toISOString();
  const url = `${FIT_SESSIONS_URL}?startTime=${encodeURIComponent(startISO)}&endTime=${encodeURIComponent(endISO)}&activityType=${ACTIVITY_TYPE_SLEEP}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    console.error(`Fit sessions 取得失敗: ${res.status} ${await res.text()}`);
    return undefined;
  }
  const data = (await res.json()) as FitSessionsResponse;
  return parseSleepSessions(data);
}

/** 安静時心拍を取得（派生データソース。失敗時 undefined） */
async function fetchRestingHeartRate(
  accessToken: string,
  startMs: number,
  endMs: number,
): Promise<number | undefined> {
  const body = {
    aggregateBy: [
      {
        dataTypeName: "com.google.heart_rate.bpm",
        dataSourceId: RESTING_HR_DATA_SOURCE_ID,
      },
    ],
    bucketByTime: { durationMillis: DAY_MS },
    startTimeMillis: startMs,
    endTimeMillis: endMs,
  };
  const res = await fetch(FIT_AGGREGATE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    // 派生データソース未対応時は静かにスキップ
    return undefined;
  }
  const data = (await res.json()) as FitAggregateResponse;
  const ds = data.bucket?.[0]?.dataset?.[0];
  const avg = avgFpPoints(ds);
  return avg != null ? Math.round(avg) : undefined;
}

/**
 * 1日分の Fit 集計データを取得
 * dataSourceId を渡さない場合 Google が公開しているデフォルトの merged データソースを使う。
 */
async function fetchOneDay(accessToken: string, date: string): Promise<FitDailyMetrics | null> {
  const startMs = jstMidnightMillis(date);
  const endMs = startMs + DAY_MS;

  const body = {
    aggregateBy: [
      { dataTypeName: "com.google.step_count.delta" },
      { dataTypeName: "com.google.calories.expended" },
      { dataTypeName: "com.google.active_minutes" },
      { dataTypeName: "com.google.distance.delta" },
      { dataTypeName: "com.google.heart_rate.bpm" },
      { dataTypeName: "com.google.weight" },
      { dataTypeName: "com.google.sleep.segment" },
    ],
    bucketByTime: { durationMillis: DAY_MS },
    startTimeMillis: startMs,
    endTimeMillis: endMs,
  };

  const res = await fetch(FIT_AGGREGATE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Fit dataset:aggregate 失敗 ${date}: ${res.status} ${err}`);
  }

  const data = (await res.json()) as FitAggregateResponse;
  const metrics = parseFitResponse(date, data);

  // 補助APIで sleep / resting_heart_rate を並列取得（失敗してもメイン結果は壊さない）
  // 「当日の睡眠」= 前日 21:00 〜 当日 12:00 に終了したセッションと定義する。
  // 当日深夜〜朝の起床までを含み、当夜の入眠（24時以降）は翌日の睡眠としてカウント。
  // これにより同じ日に「前夜の睡眠＋当夜の入眠」が両方カウントされる二重計上を防ぐ。
  const sleepWindowStartMs = startMs - 3 * 60 * 60 * 1000; // 前日 21:00
  const sleepWindowEndMs = startMs + 12 * 60 * 60 * 1000;  // 当日 12:00
  const [sessionSleep, restingHR] = await Promise.all([
    fetchSleepMinutesFromSessions(accessToken, sleepWindowStartMs, sleepWindowEndMs),
    fetchRestingHeartRate(accessToken, startMs, endMs),
  ]);
  // Sessions API 由来があれば優先（segment 由来より精度が高いことが多い）
  if (sessionSleep != null) metrics.sleepMinutes = sessionSleep;
  if (restingHR != null) metrics.restingHeartRate = restingHR;

  return metrics;
}

/** Fit レスポンスを FitDailyMetrics にパース（テストから直接呼べるよう export） */
export function parseFitResponse(date: string, data: FitAggregateResponse): FitDailyMetrics {
  const bucket = data.bucket?.[0];
  const datasets = bucket?.dataset ?? [];

  // dataset の順序はリクエストの aggregateBy 順に対応
  const [stepsDs, caloriesDs, activeMinDs, distanceDs, heartRateDs, weightDs, sleepDs] = datasets;

  const steps = sumPoints(stepsDs, "int");
  const totalCalories = sumPoints(caloriesDs, "fp");
  const activeMinutes = sumPoints(activeMinDs, "int");
  const distanceMeters = sumPoints(distanceDs, "fp");
  const avgHeartRate = avgFpPoints(heartRateDs);
  const weightKg = latestFpPoint(weightDs);
  const sleepMinutes = sleepMinutesFromSegments(sleepDs);

  return {
    date,
    steps,
    totalCalories,
    activeMinutes,
    distanceMeters,
    avgHeartRate: avgHeartRate != null ? Math.round(avgHeartRate) : undefined,
    weightKg,
    sleepMinutes,
    raw: data,
  };
}

export type FitRangeResult = {
  data: Map<string, FitDailyMetrics>;
  errors: string[];
};

/**
 * 日付リストから日次集計を取得（順次実行・100ms 間隔で軽くレート制御）
 * 未設定時は null を返してスキップ。
 */
export async function fetchFitDailyAggregateRange(dates: string[]): Promise<FitRangeResult | null> {
  const config = getGoogleOAuthConfig();
  if (!config) return null;

  const result = new Map<string, FitDailyMetrics>();
  const errors: string[] = [];

  let accessToken: string;
  try {
    accessToken = await getGoogleAccessToken(config);
  } catch (e) {
    errors.push(`Fit アクセストークン取得失敗: ${String(e)}`);
    return { data: result, errors };
  }

  for (const date of dates) {
    try {
      const metrics = await fetchOneDay(accessToken, date);
      if (metrics) result.set(date, metrics);
    } catch (e) {
      const msg = `Google Fit ${date}: ${String(e)}`;
      console.error(msg);
      errors.push(msg);
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  return { data: result, errors };
}
