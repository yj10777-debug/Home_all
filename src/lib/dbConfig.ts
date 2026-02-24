/**
 * アプリ設定（目標・パーソナル）のDB読み書き
 * 常に id=1 の AppConfig レコードを使用
 */

import { prisma } from "./prisma";

export type Goals = {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
};

export type Personal = {
  heightCm: number | null;
  weightKg: number | null;
  age: number | null;
  sex: string | null;
  activityLevel: string | null;
};

const DEFAULT_GOALS: Goals = {
  calories: 2267,
  protein: 150,
  fat: 54,
  carbs: 293,
};

const DEFAULT_PERSONAL: Personal = {
  heightCm: null,
  weightKg: null,
  age: null,
  sex: null,
  activityLevel: null,
};

function parseGoals(json: unknown): Goals | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  const calories = typeof o.calories === "number" ? o.calories : null;
  const protein = typeof o.protein === "number" ? o.protein : null;
  const fat = typeof o.fat === "number" ? o.fat : null;
  const carbs = typeof o.carbs === "number" ? o.carbs : null;
  if (calories == null || protein == null || fat == null || carbs == null) return null;
  if (calories < 0 || protein < 0 || fat < 0 || carbs < 0) return null;
  return { calories, protein, fat, carbs };
}

function parsePersonal(json: unknown): Personal | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  return {
    heightCm: typeof o.heightCm === "number" ? o.heightCm : null,
    weightKg: typeof o.weightKg === "number" ? o.weightKg : null,
    age: typeof o.age === "number" ? o.age : null,
    sex: typeof o.sex === "string" ? o.sex : null,
    activityLevel: typeof o.activityLevel === "string" ? o.activityLevel : null,
  };
}

export async function getGoals(): Promise<Goals> {
  const row = await prisma.appConfig.findUnique({ where: { id: 1 }, select: { goals: true } });
  const parsed = row?.goals ? parseGoals(row.goals) : null;
  return parsed ?? DEFAULT_GOALS;
}

export async function getPersonal(): Promise<Personal> {
  const row = await prisma.appConfig.findUnique({ where: { id: 1 }, select: { personal: true } });
  const parsed = row?.personal ? parsePersonal(row.personal) : null;
  return parsed ?? { ...DEFAULT_PERSONAL };
}

export async function setGoals(goals: Goals): Promise<void> {
  await prisma.appConfig.upsert({
    where: { id: 1 },
    update: { goals: goals as object },
    create: { id: 1, goals: goals as object },
  });
}

export async function setPersonal(personal: Personal): Promise<void> {
  await prisma.appConfig.upsert({
    where: { id: 1 },
    update: { personal: personal as object },
    create: { id: 1, personal: personal as object },
  });
}

export { DEFAULT_GOALS, DEFAULT_PERSONAL };
