import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { format, subDays } from "date-fns";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { fetchStrongFilesFromDrive } from "./googleDrive";
import { getEffectiveToday } from "./dateUtils";

const SECRETS_DIR = path.join(process.cwd(), "secrets");
const DEFAULT_STRONG_PATH = process.env.STRONG_DATA_PATH || "G:\\マイドライブ\\30_Home\\00_Training";
const ASKEN_STATE_FILE = path.join(SECRETS_DIR, "asken-state.json");

// ─── 型定義 ─────────────────────────────────────────

type AskenItem = { mealType: string; name: string; amount: string; calories: number };
type AskenExercise = { steps: number; calories: number };
type AskenDayResult = { date: string; items: AskenItem[]; nutrients: Partial<Record<string, Record<string, string>>>; exercise?: AskenExercise };

type StrongExercise = { name: string; sets: number; volumeKg: number };
type StrongWorkout = { title: string; totals: { sets: number; reps: number; volumeKg: number }; exercises: StrongExercise[] };
type StrongDayData = { workouts: StrongWorkout[]; totals: { workouts: number; sets: number; volumeKg: number } };

// ─── ユーティリティ ─────────────────────────────────

/**
 * 日付範囲を生成する
 * @param from 開始日 (YYYY-MM-DD)。省略時は today-3
 * @param to 終了日 (YYYY-MM-DD)。省略時は today
 */
function getTargetDates(from?: string, to?: string): string[] {
  const endDate = to ? new Date(to + "T00:00:00") : getEffectiveToday();
  const startDate = from ? new Date(from + "T00:00:00") : subDays(endDate, 3);
  const dates: string[] = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    dates.push(format(current, "yyyy-MM-dd"));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

/**
 * あすけんスクレイピングを子プロセスで実行し、結果を返す
 * 成功時は stdout の JSON をパースして返す
 */
function runAskenForDate(dateStr: string): Promise<{ ok: boolean; data?: AskenDayResult; error?: string }> {
  return new Promise((resolve) => {
    if (!process.env.ASKEN_EMAIL || !process.env.ASKEN_PASSWORD) {
      if (!fs.existsSync(ASKEN_STATE_FILE)) {
        resolve({ ok: false, error: "ASKEN_EMAIL / ASKEN_PASSWORD が未設定で、asken-state.json もありません。" });
        return;
      }
    }
    const proc = spawn("npx", ["tsx", "scripts/asken/run.ts", dateStr], {
      cwd: process.cwd(),
      env: { ...process.env, HEADLESS: "true" },
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
      // stdout から JSON をパース（run.ts は JSON + "Saved: ..." を出力する）
      try {
        // 最初の有効な JSON ブロックを抽出
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[0]) as AskenDayResult;
          resolve({ ok: true, data });
        } else {
          // JSONが見つからない場合、stdoutの先頭をエラーとして記録
          console.warn(`Asken ${dateStr}: stdout に JSON が見つかりません: ${stdout.slice(0, 200)}`);
          resolve({ ok: true });
        }
      } catch (parseErr) {
        console.warn(`Asken ${dateStr}: JSON パース失敗:`, parseErr, stdout.slice(0, 200));
        resolve({ ok: true }); // パース失敗でも scrape 自体は成功
      }
    });
    proc.on("error", (e) => resolve({ ok: false, error: String(e) }));
  });
}

// ─── Strong パーサー ────────────────────────────────

function parseDate(line: string): string | null {
  const m = line.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

function parseSetLine(line: string): { weight: number; reps: number } | null {
  const sep = "[:：]";
  const kgMatch = line.match(new RegExp(`セット\\s*\\d+${sep}\\s*([\\d.]+)\\s*kg\\s*×\\s*(\\d+)`));
  if (kgMatch) return { weight: parseFloat(kgMatch[1]), reps: parseInt(kgMatch[2], 10) };
  const repsMatch = line.match(new RegExp(`セット\\s*\\d+${sep}\\s*(\\d+)\\s*レップス`));
  if (repsMatch) return { weight: 0, reps: parseInt(repsMatch[1], 10) };
  const climbingMatch = line.match(new RegExp(`セット\\s*\\d+${sep}\\s*(\\d+)\\s+(\\d+)`));
  if (climbingMatch) return { weight: 0, reps: parseInt(climbingMatch[1], 10) || parseInt(climbingMatch[2], 10) };
  return null;
}

/**
 * テキスト内容から Strong ワークアウトをパースする（APIアップロード用にも使用）
 */
export function parseTxtContent(content: string): { date: string; workoutName: string; exercises: { name: string; weight: number; reps: number }[] } | null {
  const lines = content.split(/\r?\n/).map((l) => l.trim());
  let workoutName = "";
  let dateStr: string | null = null;
  const exercises: { name: string; weight: number; reps: number }[] = [];
  let currentExercise = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (line.startsWith("http")) break;
    if (i === 0) { workoutName = line; continue; }
    if (i === 1) { dateStr = parseDate(line); continue; }
    if (i === 2 && !line.startsWith("セット")) { currentExercise = line; continue; }

    const setData = parseSetLine(line);
    if (setData) {
      exercises.push({ name: currentExercise || "不明", weight: setData.weight, reps: setData.reps });
    } else if (!line.startsWith("セット")) {
      currentExercise = line;
    }
  }
  if (!dateStr) return null;
  return { date: dateStr, workoutName, exercises };
}

/** ファイルパスから読み込むラッパー（ローカル同期用） */
function parseTxtFile(filePath: string) {
  const content = fs.readFileSync(filePath, "utf-8");
  return parseTxtContent(content);
}

/**
 * テキスト内容の配列から StrongDayData マップを構築する（アップロード API 用）
 */
export function buildStrongData(
  parsed: { date: string; workoutName: string; exercises: { name: string; weight: number; reps: number }[] }[]
): Map<string, StrongDayData> {
  const byDate = new Map<string, { workoutName: string; exercises: { name: string; weight: number; reps: number }[] }[]>();

  for (const p of parsed) {
    if (!byDate.has(p.date)) byDate.set(p.date, []);
    byDate.get(p.date)!.push({ workoutName: p.workoutName, exercises: p.exercises });
  }

  const result = new Map<string, StrongDayData>();
  for (const [dateStr, workoutList] of byDate) {
    const workouts: StrongWorkout[] = [];
    for (const w of workoutList) {
      const byExercise = new Map<string, { sets: number; volumeKg: number }>();
      for (const e of w.exercises) {
        const cur = byExercise.get(e.name) || { sets: 0, volumeKg: 0 };
        cur.sets += 1;
        cur.volumeKg += e.weight * e.reps;
        byExercise.set(e.name, cur);
      }
      const exercises = Array.from(byExercise.entries()).map(([name, t]) => ({
        name,
        sets: t.sets,
        volumeKg: Math.round(t.volumeKg * 10) / 10,
      }));
      const volumeKg = w.exercises.reduce((s, e) => s + e.weight * e.reps, 0);
      workouts.push({
        title: w.workoutName,
        totals: { sets: w.exercises.length, reps: w.exercises.reduce((s, e) => s + e.reps, 0), volumeKg: Math.round(volumeKg * 10) / 10 },
        exercises,
      });
    }
    const totalVolume = workouts.reduce((s, w) => s + w.totals.volumeKg, 0);
    result.set(dateStr, {
      workouts,
      totals: { workouts: workouts.length, sets: workouts.reduce((s, w) => s + w.totals.sets, 0), volumeKg: Math.round(totalVolume * 10) / 10 },
    });
  }

  return result;
}

/**
 * Strong テキストファイルからワークアウトデータをパースする（ディレクトリ版）
 * @returns 日付ごとの StrongDayData マップ
 */
export function parseStrongFiles(
  dirPath: string,
  dateRange?: Set<string>
): { data: Map<string, StrongDayData>; errors: string[] } {
  const errors: string[] = [];

  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    return { data: new Map(), errors: [`フォルダが見つかりません: ${dirPath}`] };
  }

  const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".txt"));
  const allParsed: { date: string; workoutName: string; exercises: { name: string; weight: number; reps: number }[] }[] = [];

  for (const f of files) {
    try {
      const parsed = parseTxtFile(path.join(dirPath, f));
      if (!parsed) continue;
      if (dateRange && !dateRange.has(parsed.date)) continue;
      allParsed.push(parsed);
    } catch (e) {
      errors.push(`${f}: ${String(e)}`);
    }
  }

  return { data: buildStrongData(allParsed), errors };
}

// ─── メイン同期処理 ─────────────────────────────────

/**
 * あすけん + Strong データを取得し、DB に upsert する
 * @param options.from 開始日 (YYYY-MM-DD)。省略時は today-3
 * @param options.to 終了日 (YYYY-MM-DD)。省略時は today
 */
export async function syncData(options?: { from?: string; to?: string }): Promise<{
  askenCount: number;
  strongCount: number;
  dayCount: number;
  errors: string[];
}> {
  const errors: string[] = [];
  const targetDates = getTargetDates(options?.from, options?.to);
  const dateRange = new Set(targetDates);

  // あすけんデータ取得 → DB に upsert
  const upsertAskenDay = async (date: string, data: AskenDayResult) => {
    const payload = {
      askenItems: data.items as unknown as Prisma.InputJsonValue,
      askenNutrients: data.nutrients as unknown as Prisma.InputJsonValue,
      steps: data.exercise?.steps ?? null,
      exerciseCalories: data.exercise?.calories ?? null,
    };
    await prisma.dailyData.upsert({
      where: { date },
      update: payload,
      create: { date, ...payload },
    });
  };

  let askenCount = 0;
  for (const d of targetDates) {
    const result = await runAskenForDate(d);
    if (result.ok && result.data) {
      try {
        await upsertAskenDay(d, result.data);
        askenCount += 1;
      } catch (e) {
        errors.push(`DB保存 Asken ${d}: ${String(e)}`);
      }
    } else if (result.ok) {
      // stdout パースできなかった場合: 既存データがある日はファイルで上書きしない
      // （ファイルは前回取得の古い内容の可能性があり、追加入力後の更新が反映されなくなる）
      const jsonPath = path.join(SECRETS_DIR, `asken-day-${d}.json`);
      if (fs.existsSync(jsonPath)) {
        try {
          const existing = await prisma.dailyData.findUnique({ where: { date: d }, select: { date: true } });
          if (!existing) {
            // 新規の日付のみファイルから投入（初回取得の取りこぼし対策）
            const fileData = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as AskenDayResult;
            await upsertAskenDay(d, fileData);
            askenCount += 1;
          } else {
            errors.push(`Asken ${d}: 取得結果を取得できませんでした（既存データは上書きしません）`);
          }
        } catch (e) {
          errors.push(`DB保存 Asken(file) ${d}: ${String(e)}`);
        }
      }
    } else if (result.error) {
      errors.push(`Asken ${d}: ${result.error}`);
    }
  }

  // Strong データ取得 → DB に upsert
  // 1) ローカルフォルダがあればそちらから読む
  // 2) なければ Google Drive API から取得
  const strongPath = DEFAULT_STRONG_PATH;
  let strongMap = new Map<string, StrongDayData>();

  console.log(`Strong: パス "${strongPath}" を確認中...`);
  if (fs.existsSync(strongPath)) {
    console.log(`Strong: ローカルフォルダからファイルを読み込み中...`);
    // ローカルフォルダから読み込み
    const { data, errors: strongErrors } = parseStrongFiles(strongPath, dateRange);
    strongMap = data;
    console.log(`Strong: ${strongMap.size} 日分のデータを検出 (対象範囲: ${Array.from(dateRange).join(", ")})`);
    errors.push(...strongErrors);
  } else {
    // Google Drive から取得を試みる
    try {
      const driveFiles = await fetchStrongFilesFromDrive();
      if (driveFiles && driveFiles.length > 0) {
        console.log(`Google Drive: ${driveFiles.length} 件のファイルを取得`);
        const allParsed: { date: string; workoutName: string; exercises: { name: string; weight: number; reps: number }[] }[] = [];
        for (const file of driveFiles) {
          try {
            const parsed = parseTxtContent(file.content);
            if (parsed) {
              if (!dateRange || dateRange.has(parsed.date)) {
                allParsed.push(parsed);
              }
            }
          } catch (e) {
            errors.push(`Drive ${file.name}: ${String(e)}`);
          }
        }
        strongMap = buildStrongData(allParsed);
      } else if (driveFiles === null) {
        console.log("Google Drive 未設定（Strong スキップ）");
      }
    } catch (e) {
      errors.push(`Google Drive: ${String(e)}`);
    }
  }

  let strongCount = 0;
  for (const [dateStr, strongData] of strongMap) {
    try {
      await prisma.dailyData.upsert({
        where: { date: dateStr },
        update: {
          strongData: strongData as unknown as Prisma.InputJsonValue,
        },
        create: {
          date: dateStr,
          strongData: strongData as unknown as Prisma.InputJsonValue,
        },
      });
      strongCount += 1;
    } catch (e) {
      errors.push(`DB保存 Strong ${dateStr}: ${String(e)}`);
    }
  }

  // dayCount = DB の DailyData レコード数
  const dayCount = await prisma.dailyData.count();

  return { askenCount, strongCount, dayCount, errors };
}
