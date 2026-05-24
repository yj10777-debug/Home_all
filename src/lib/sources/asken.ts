/**
 * あすけんデータソース（栄養・歩数等）
 * スクレイピング子プロセスを実行し、1日分のデータを返す。将来は他アプリのプロバイダーも同じ interface で追加可能。
 */

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { getAskenCredentials } from "./credentials";
import type { NutritionDayResult, FetchNutritionResult } from "./types";
import { prisma } from "../prisma";

const SECRETS_DIR = path.join(process.cwd(), "secrets");
const ASKEN_STATE_FILE = path.join(SECRETS_DIR, "asken-state.json");

/** ScrapingLog テーブルにログを保存（失敗しても本処理は継続） */
async function saveScrapingLog(dateStr: string, status: string, message: string, details?: string) {
  try {
    await prisma.scrapingLog.create({
      data: { date: dateStr, source: "asken", status, message, details },
    });
  } catch (e) {
    console.warn("ScrapingLog 保存失敗:", e);
  }
}

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
      const msg = "ASKEN_EMAIL / ASKEN_PASSWORD が未設定で、asken-state.json もありません。";
      await saveScrapingLog(dateStr, "error", msg);
      return { ok: false, error: msg };
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

    proc.on("close", async (code) => {
      if (code !== 0) {
        const errorMsg = stderr.slice(0, 500) || `exit ${code}`;
        await saveScrapingLog(dateStr, "error", errorMsg, stderr);
        resolve({ ok: false, error: errorMsg });
        return;
      }
      try {
        // dotenv のログ出力が stdout に混入する場合があるため
        // "date" キーを持つ JSON ブロックを明示的に検索する
        const jsonMatch = stdout.match(/(\{"date"[\s\S]*\})\s*$/);
        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[0]) as NutritionDayResult;
          await saveScrapingLog(dateStr, "ok", `${data.items?.length ?? 0}件取得`);
          resolve({ ok: true, data });
        } else {
          const msg = `stdout に JSON が見つかりません: ${stdout.slice(0, 200)}`;
          console.warn(`Asken ${dateStr}:`, msg);
          await saveScrapingLog(dateStr, "error", msg, stdout.slice(0, 2000));
          resolve({ ok: true });
        }
      } catch (parseErr) {
        const msg = `JSON パース失敗: ${String(parseErr)}`;
        console.warn(`Asken ${dateStr}:`, msg, stdout.slice(0, 200));
        await saveScrapingLog(dateStr, "error", msg, stdout.slice(0, 2000));
        resolve({ ok: true });
      }
    });

    proc.on("error", async (e) => {
      const msg = String(e);
      await saveScrapingLog(dateStr, "error", msg);
      resolve({ ok: false, error: msg });
    });
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
