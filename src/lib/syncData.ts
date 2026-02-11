import fs from "fs";
import path from "path";

const SECRETS_DIR = path.join(process.cwd(), "secrets");
const DEFAULT_STRONG_PATH = "G:\\マイドライブ\\30_Home\\00_Training";

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

function parseTxtFile(filePath: string): { date: string; workoutName: string; exercises: { name: string; weight: number; reps: number }[] } | null {
  const content = fs.readFileSync(filePath, "utf-8");
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

export function parseStrongFromFolder(dirPath: string): { strongCount: number; errors: string[] } {
  const errors: string[] = [];
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    return { strongCount: 0, errors: [`フォルダが見つかりません: ${dirPath}`] };
  }

  const byDate = new Map<string, { workoutName: string; exercises: { name: string; weight: number; reps: number }[] }[]>();
  const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".txt"));

  for (const f of files) {
    try {
      const parsed = parseTxtFile(path.join(dirPath, f));
      if (!parsed) continue;
      if (!byDate.has(parsed.date)) byDate.set(parsed.date, []);
      byDate.get(parsed.date)!.push({ workoutName: parsed.workoutName, exercises: parsed.exercises });
    } catch (e) {
      errors.push(`${f}: ${String(e)}`);
    }
  }

  fs.mkdirSync(SECRETS_DIR, { recursive: true });

  for (const [dateStr, workoutList] of byDate) {
    const workouts: { title: string; totals: { sets: number; reps: number; volumeKg: number }; exercises: { name: string; sets: number; volumeKg: number }[] }[] = [];
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
    const dayData = {
      date: dateStr,
      workouts,
      totals: { workouts: workouts.length, sets: workouts.reduce((s, w) => s + w.totals.sets, 0), volumeKg: Math.round(totalVolume * 10) / 10 },
    };
    fs.writeFileSync(path.join(SECRETS_DIR, `strong-day-${dateStr}.json`), JSON.stringify(dayData, null, 2), "utf-8");
  }

  return { strongCount: byDate.size, errors };
}

export function buildDayFiles(): { dayCount: number } {
  if (!fs.existsSync(SECRETS_DIR)) return { dayCount: 0 };
  const files = fs.readdirSync(SECRETS_DIR);
  const seen = new Set<string>();
  for (const f of files) {
    const m = f.match(/^asken-day-(\d{4}-\d{2}-\d{2})\.json$/);
    if (m) seen.add(m[1]);
  }
  for (const f of files) {
    const m = f.match(/^strong-day-(\d{4}-\d{2}-\d{2})\.json$/);
    if (m) seen.add(m[1]);
  }

  const dates = Array.from(seen).sort();
  for (const d of dates) {
    const dayData: Record<string, unknown> = { date: d };
    const askenPath = path.join(SECRETS_DIR, `asken-day-${d}.json`);
    const strongPath = path.join(SECRETS_DIR, `strong-day-${d}.json`);
    if (fs.existsSync(askenPath)) dayData.asken = JSON.parse(fs.readFileSync(askenPath, "utf-8"));
    if (fs.existsSync(strongPath)) dayData.strong = JSON.parse(fs.readFileSync(strongPath, "utf-8"));
    fs.writeFileSync(path.join(SECRETS_DIR, `day-${d}.json`), JSON.stringify(dayData, null, 2), "utf-8");
  }
  return { dayCount: dates.length };
}

export function syncData(): { strongCount: number; dayCount: number; errors: string[] } {
  const strongPath = process.env.STRONG_TRAINING_PATH || DEFAULT_STRONG_PATH;
  const { strongCount, errors } = parseStrongFromFolder(strongPath);
  const { dayCount } = buildDayFiles();
  return { strongCount, dayCount, errors };
}
