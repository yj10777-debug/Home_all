/**
 * Strong データソース（筋トレ記録）
 * ローカルフォルダまたは Google Drive からテキストを読み、日付別にパースする。将来は他アプリのプロバイダーも同じ interface で追加可能。
 */

import fs from "fs";
import path from "path";
import { fetchStrongFilesFromDrive } from "../googleDrive";
import type { StrongDayData } from "./types";
import type { FetchTrainingResult } from "./types";

const DEFAULT_STRONG_PATH = process.env.STRONG_DATA_PATH || "G:\\マイドライブ\\30_Home\\00_Training";

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
  const timeMatch = line.match(new RegExp(`セット\\s*\\d+${sep}\\s*(\\d+):(\\d+)`));
  if (timeMatch) return { weight: 0, reps: Math.round(parseInt(timeMatch[1], 10) + parseInt(timeMatch[2], 10) / 60) };
  const climbingMatch = line.match(new RegExp(`セット\\s*\\d+${sep}\\s*(\\d+)\\s+(\\d+)`));
  if (climbingMatch) return { weight: 0, reps: parseInt(climbingMatch[1], 10) || parseInt(climbingMatch[2], 10) };
  return null;
}

/** テキスト内容から Strong ワークアウトをパースする（API アップロード用にも使用） */
export function parseTxtContent(
  content: string
): { date: string; workoutName: string; exercises: { name: string; weight: number; reps: number }[] } | null {
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

function parseTxtFile(filePath: string) {
  const content = fs.readFileSync(filePath, "utf-8");
  return parseTxtContent(content);
}

/** テキスト内容の配列から StrongDayData マップを構築する（アップロード API 用） */
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
    const workouts: StrongDayData["workouts"] = [];
    for (const w of workoutList) {
      const byExercise = new Map<string, { sets: number; volumeKg: number; reps: number }>();
      for (const e of w.exercises) {
        const cur = byExercise.get(e.name) || { sets: 0, volumeKg: 0, reps: 0 };
        cur.sets += 1;
        cur.volumeKg += e.weight * e.reps;
        cur.reps += e.reps;
        byExercise.set(e.name, cur);
      }
      const exercises = Array.from(byExercise.entries()).map(([name, t]) => ({
        name,
        sets: t.sets,
        volumeKg: Math.round(t.volumeKg * 10) / 10,
        ...(t.volumeKg === 0 && t.reps > 0 ? { reps: t.reps } : {}),
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

/** Strong テキストファイルからワークアウトデータをパースする（ディレクトリ版） */
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

/**
 * 指定日付範囲の Strong データを取得する（ローカルパス or Google Drive）
 * 既存の syncData と同一の取得ロジック。
 */
export async function fetchTrainingForDateRange(dates: Set<string>): Promise<FetchTrainingResult> {
  const errors: string[] = [];
  const strongPath = DEFAULT_STRONG_PATH;
  let strongMap = new Map<string, StrongDayData>();

  if (fs.existsSync(strongPath)) {
    const result = parseStrongFiles(strongPath, dates);
    strongMap = result.data;
    errors.push(...result.errors);
  } else {
    try {
      const driveFiles = await fetchStrongFilesFromDrive();
      if (driveFiles && driveFiles.length > 0) {
        const allParsed: { date: string; workoutName: string; exercises: { name: string; weight: number; reps: number }[] }[] = [];
        for (const file of driveFiles) {
          try {
            const parsed = parseTxtContent(file.content);
            if (parsed && dates.has(parsed.date)) {
              allParsed.push(parsed);
            }
          } catch (e) {
            errors.push(`Drive ${file.name}: ${String(e)}`);
          }
        }
        strongMap = buildStrongData(allParsed);
      }
    } catch (e) {
      errors.push(`Google Drive: ${String(e)}`);
    }
  }

  return { data: strongMap, errors };
}
