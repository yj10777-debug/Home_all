/**
 * Health Auto Export (iOS アプリ) 経由のヘルスデータ取り込み
 *
 * iOS「Health Auto Export」が Apple Health の指標を JSON で Google Drive に
 * 定期エクスポートしている前提。Google Fit REST API 終了(2026-06-30)後の
 * 移行先として、appleHealth.ts から環境変数 HEALTH_SOURCE=drive で
 * 切り替えて使う。
 *
 * 想定 JSON フォーマット（Health Auto Export 既定）:
 * {
 *   "data": {
 *     "metrics": [
 *       {
 *         "name": "step_count",
 *         "units": "count",
 *         "data": [
 *           { "date": "2026-05-24 00:00:00 +0900", "qty": 8234.0 }
 *         ]
 *       },
 *       ...
 *     ]
 *   }
 * }
 *
 * 1日分の各指標が `data[]` 内の1ポイントとして並ぶ。日付は JST 想定。
 */

import { getGoogleAccessToken, getGoogleOAuthConfig } from "./googleAuth";
import type { HealthDayData } from "./sources/types";

const DRIVE_API = "https://www.googleapis.com/drive/v3";

type HaeMetricPoint = {
  date?: string;
  qty?: number;
  // sleep_analysis は qty ではなく inBedStart/inBedEnd/sleepStart/sleepEnd を持つ場合あり
  sleepStart?: string;
  sleepEnd?: string;
  inBedStart?: string;
  inBedEnd?: string;
  // 心拍は Min/Avg/Max が分かれる場合あり
  Min?: number;
  Avg?: number;
  Max?: number;
};

type HaeMetric = {
  name?: string;
  units?: string;
  data?: HaeMetricPoint[];
};

type HaeExport = {
  data?: {
    metrics?: HaeMetric[];
  };
};

/** "2026-05-24 00:00:00 +0900" のような Health Auto Export 形式の日付文字列を YYYY-MM-DD (JST) に変換 */
function extractDateJst(s: string | undefined): string | null {
  if (!s) return null;
  // 単純に先頭10文字を取る（JST想定なのでタイムゾーン換算は不要）
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/**
 * Health Auto Export の JSON をパースして日付ごとの HealthDayData にまとめる
 * テストから直接呼べるよう export。
 */
export function parseHealthAutoExport(json: HaeExport): Map<string, HealthDayData> {
  const result = new Map<string, HealthDayData>();
  const metrics = json.data?.metrics ?? [];

  const getOrCreate = (date: string): HealthDayData => {
    let day = result.get(date);
    if (!day) {
      day = { date };
      result.set(date, day);
    }
    return day;
  };

  // 距離はマイル等の場合があるので単位を見る
  function distanceToMeters(qty: number, units?: string): number {
    if (!units) return qty;
    const u = units.toLowerCase();
    if (u === "m" || u === "meter" || u === "meters") return qty;
    if (u === "km") return qty * 1000;
    if (u === "mi" || u === "mile" || u === "miles") return qty * 1609.344;
    if (u === "ft" || u === "foot" || u === "feet") return qty * 0.3048;
    return qty; // 不明時はそのまま
  }
  // 体重 kg 単位の場合のみ採用、lb は変換
  function weightToKg(qty: number, units?: string): number {
    if (!units) return qty;
    const u = units.toLowerCase();
    if (u === "kg" || u === "kilogram" || u === "kilograms") return qty;
    if (u === "lb" || u === "lbs" || u === "pound" || u === "pounds") return qty * 0.45359237;
    if (u === "g" || u === "gram") return qty / 1000;
    return qty;
  }

  for (const metric of metrics) {
    const name = metric.name ?? "";
    const points = metric.data ?? [];

    for (const point of points) {
      // sleep_analysis は qty を持たないことがあるので別ルートで処理
      if (name === "sleep_analysis") {
        const start = point.sleepStart ?? point.inBedStart;
        const end = point.sleepEnd ?? point.inBedEnd;
        // 日付は終了時刻の日付（起床日）を採用
        const date = extractDateJst(end) || extractDateJst(point.date);
        if (!date || !start || !end) continue;
        const startMs = new Date(start).getTime();
        const endMs = new Date(end).getTime();
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;
        const minutes = Math.round((endMs - startMs) / 60000);
        const day = getOrCreate(date);
        day.sleepMinutes = (day.sleepMinutes ?? 0) + minutes;
        continue;
      }

      const date = extractDateJst(point.date);
      if (!date) continue;
      const day = getOrCreate(date);
      const qty = typeof point.qty === "number" ? point.qty : null;

      switch (name) {
        case "step_count":
          if (qty != null) day.steps = (day.steps ?? 0) + Math.round(qty);
          break;
        case "active_energy":
        case "active_energy_burned":
          if (qty != null) day.activeCalories = (day.activeCalories ?? 0) + qty;
          break;
        case "basal_energy_burned":
          if (qty != null) {
            // 基礎代謝。total = active + basal で集計
            day.totalCalories = (day.totalCalories ?? 0) + qty;
          }
          break;
        case "heart_rate":
          // Avg があればそれを優先、qty しか無ければそれを使う
          if (typeof point.Avg === "number") {
            day.avgHeartRate = Math.round(point.Avg);
          } else if (qty != null && day.avgHeartRate == null) {
            day.avgHeartRate = Math.round(qty);
          }
          break;
        case "resting_heart_rate":
          if (qty != null) day.restingHeartRate = Math.round(qty);
          break;
        case "weight_body_mass":
        case "body_mass":
          if (qty != null) day.weightKg = weightToKg(qty, metric.units);
          break;
        case "walking_running_distance":
        case "distance_walking_running":
          if (qty != null) {
            day.distanceMeters = (day.distanceMeters ?? 0) + distanceToMeters(qty, metric.units);
          }
          break;
        case "apple_exercise_time":
        case "exercise_time":
          if (qty != null) day.activeMinutes = (day.activeMinutes ?? 0) + Math.round(qty);
          break;
      }
    }
  }

  // active + basal → totalCalories の集計（basal だけ来ていた場合の補正）
  for (const day of result.values()) {
    if (day.activeCalories != null && day.totalCalories != null) {
      // basal を入れていたところに active を加算
      day.totalCalories += day.activeCalories;
    } else if (day.activeCalories != null && day.totalCalories == null) {
      // basal が来なかった場合は active を total の代用とする（厳密ではないが Fit と同じ扱い）
      day.totalCalories = day.activeCalories;
    }
  }

  return result;
}

/** Health Auto Export 用フォルダIDの環境変数キー */
const HAE_FOLDER_ENV = "GOOGLE_DRIVE_HEALTH_FOLDER_ID";

export function isHealthAutoExportConfigured(): boolean {
  return !!process.env[HAE_FOLDER_ENV] && getGoogleOAuthConfig() !== null;
}

/** フォルダ内の .json ファイル一覧を取得（nextPageToken を辿り全件取得。日次でファイルが増えるため 1000 件超でも取得漏れが起きないようにする） */
async function listJsonFiles(
  accessToken: string,
  folderId: string,
  modifiedAfterIso?: string
): Promise<{ id: string; name: string }[]> {
  let query = `'${folderId}' in parents and mimeType='application/json' and trashed=false`;
  // 同期対象期間より十分前のファイルを除外（フォルダが日次で成長しても全件DLしない）
  if (modifiedAfterIso) query += ` and modifiedTime > '${modifiedAfterIso}'`;
  const fields = "nextPageToken,files(id,name,modifiedTime)";

  const allFiles: { id: string; name: string }[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: query,
      fields,
      orderBy: "modifiedTime desc",
      pageSize: "1000",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`${DRIVE_API}/files?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`HAE フォルダ一覧取得失敗: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { files: { id: string; name: string }[]; nextPageToken?: string };
    allFiles.push(...(data.files || []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return allFiles;
}

async function downloadJson(accessToken: string, fileId: string): Promise<HaeExport> {
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`HAE ファイルダウンロード失敗: ${res.status}`);
  return (await res.json()) as HaeExport;
}

export type HaeRangeResult = {
  data: Map<string, HealthDayData>;
  errors: string[];
};

/**
 * Google Drive 上の Health Auto Export JSON 全件をスキャンし、指定日付集合に
 * 該当する HealthDayData を返す。
 */
export async function fetchHealthFromAutoExport(targetDates: Set<string>): Promise<HaeRangeResult | null> {
  const config = getGoogleOAuthConfig();
  const folderId = process.env[HAE_FOLDER_ENV];
  if (!config || !folderId) return null;

  const result = new Map<string, HealthDayData>();
  const errors: string[] = [];

  let accessToken: string;
  try {
    accessToken = await getGoogleAccessToken(config);
  } catch (e) {
    errors.push(`HAE アクセストークン取得失敗: ${String(e)}`);
    return { data: result, errors };
  }

  // 対象期間の最古日から30日前より後に更新されたファイルだけ取得する
  // （HAEのエクスポートはデータ日の直後に書かれるため十分な余裕）
  let modifiedAfterIso: string | undefined;
  const sortedDates = Array.from(targetDates).sort();
  if (sortedDates.length > 0) {
    const oldest = new Date(sortedDates[0] + "T00:00:00Z");
    if (!Number.isNaN(oldest.getTime())) {
      modifiedAfterIso = new Date(oldest.getTime() - 30 * 86400000).toISOString();
    }
  }

  let files: { id: string; name: string }[];
  try {
    files = await listJsonFiles(accessToken, folderId, modifiedAfterIso);
  } catch (e) {
    errors.push(`HAE 一覧取得失敗: ${String(e)}`);
    return { data: result, errors };
  }

  for (const file of files) {
    try {
      const json = await downloadJson(accessToken, file.id);
      const parsed = parseHealthAutoExport(json);
      for (const [date, day] of parsed) {
        if (!targetDates.has(date)) continue;
        // 一覧は modifiedTime 降順のため先勝ち＝最新更新のファイルが優先
        //（従来の無条件 set は最後に処理される最古ファイルが勝つバグだった）
        if (result.has(date)) continue;
        result.set(date, day);
      }
    } catch (e) {
      errors.push(`HAE ${file.name}: ${String(e)}`);
    }
    // 対象日がすべて揃ったら残りのダウンロードを省略
    if (result.size >= targetDates.size) break;
  }

  return { data: result, errors };
}
