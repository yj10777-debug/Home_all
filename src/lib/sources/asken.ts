/**
 * あすけんデータソース（栄養・歩数等）
 * スクレイピング子プロセスを実行し、1日分のデータを返す。将来は他アプリのプロバイダーも同じ interface で追加可能。
 */

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { getAskenCredentials } from "./credentials";
import type { NutritionDayResult, FetchNutritionResult } from "./types";

const SECRETS_DIR = path.join(process.cwd(), "secrets");
const ASKEN_STATE_FILE = path.join(SECRETS_DIR, "asken-state.json");

/**
 * あすけんスクレイピングを子プロセスで実行し、1日分のデータを返す
 * @param dateStr YYYY-MM-DD
 * @param userId 未指定時は "default"。認証情報は getAskenCredentials(userId) で取得（現状は env のみ）
 */
export async function fetchNutritionForDate(
  dateStr: string,
  userId?: string
): Promise<FetchNutritionResult> {
  const credentials = await getAskenCredentials(userId ?? "default");
  if (!credentials) {
    if (!fs.existsSync(ASKEN_STATE_FILE)) {
      return { ok: false, error: "ASKEN_EMAIL / ASKEN_PASSWORD が未設定で、asken-state.json もありません。" };
    }
  }

  const env = {
    ...process.env,
    HEADLESS: "true",
    ...(credentials ? { ASKEN_EMAIL: credentials.email, ASKEN_PASSWORD: credentials.password } : {}),
  };

  return new Promise((resolve) => {
    const proc = spawn("npx", ["tsx", "scripts/asken/run.ts", dateStr], {
      cwd: process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d) => { stdout += d.toString(); });
    proc.stderr?.on("data", (d) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code !== 0) {
        resolve({ ok: false, error: stderr.slice(0, 500) || `exit ${code}` });
        return;
      }
      try {
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[0]) as NutritionDayResult;
          resolve({ ok: true, data });
        } else {
          console.warn(`Asken ${dateStr}: stdout に JSON が見つかりません: ${stdout.slice(0, 200)}`);
          resolve({ ok: true });
        }
      } catch (parseErr) {
        console.warn(`Asken ${dateStr}: JSON パース失敗:`, parseErr, stdout.slice(0, 200));
        resolve({ ok: true });
      }
    });
    proc.on("error", (e) => resolve({ ok: false, error: String(e) }));
  });
}

/**
 * あすけんのキャッシュファイル（asken-day-${date}.json）から取得する
 * スクレイピング未実行時や失敗時のフォールバック用
 */
export function readNutritionFallbackFile(dateStr: string): NutritionDayResult | null {
  const jsonPath = path.join(SECRETS_DIR, `asken-day-${dateStr}.json`);
  if (!fs.existsSync(jsonPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as NutritionDayResult;
  } catch {
    return null;
  }
}
