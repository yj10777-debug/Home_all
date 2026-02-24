/**
 * ユーザーごとの目標・パーソナル設定のDB読み書き
 * userId = 認証の sub または "default"（未ログイン時）
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

/** 数値または数値文字列を number | null に変換（DB/JSON の型違いに対応） */
function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parsePersonal(json: unknown): Personal | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  const heightCm = toNumber(o.heightCm);
  const weightKg = toNumber(o.weightKg);
  const age = toNumber(o.age);
  if (heightCm === null && weightKg === null && age === null && !o.sex && !o.activityLevel) return null;
  return {
    heightCm,
    weightKg,
    age,
    sex: typeof o.sex === "string" ? o.sex : null,
    activityLevel: typeof o.activityLevel === "string" ? o.activityLevel : null,
  };
}

/** 未ログイン時・認証なし時につかうユーザーID */
export const DEFAULT_USER_ID = "default";

/**
 * 指定ユーザーの目標を取得。未設定ならデフォルト値。
 * userId が "default" で UserConfig に無い場合は従来の AppConfig を参照（移行用）
 */
export async function getGoals(userId: string = DEFAULT_USER_ID): Promise<Goals> {
  const row = await prisma.userConfig.findUnique({ where: { userId }, select: { goals: true } });
  if (row?.goals) {
    const parsed = parseGoals(row.goals);
    if (parsed) return parsed;
  }
  if (userId === DEFAULT_USER_ID) {
    const legacy = await prisma.appConfig.findUnique({ where: { id: 1 }, select: { goals: true } });
    const parsed = legacy?.goals ? parseGoals(legacy.goals) : null;
    if (parsed) {
      void setGoals(DEFAULT_USER_ID, parsed).catch(() => {}); // 1回だけ UserConfig へ移行
      return parsed;
    }
  }
  return DEFAULT_GOALS;
}

/**
 * 指定ユーザーのパーソナル設定を取得。
 * userId が "default" で UserConfig に無い場合は従来の AppConfig を参照（移行用）
 */
export async function getPersonal(userId: string = DEFAULT_USER_ID): Promise<Personal> {
  const row = await prisma.userConfig.findUnique({ where: { userId }, select: { personal: true } });
  if (row?.personal) {
    const parsed = parsePersonal(row.personal);
    if (parsed) return parsed;
  }
  if (userId === DEFAULT_USER_ID) {
    const legacy = await prisma.appConfig.findUnique({ where: { id: 1 }, select: { personal: true } });
    const parsed = legacy?.personal ? parsePersonal(legacy.personal) : null;
    if (parsed) {
      void setPersonal(DEFAULT_USER_ID, parsed).catch(() => {}); // 1回だけ UserConfig へ移行
      return parsed;
    }
  }
  return { ...DEFAULT_PERSONAL };
}

/** 指定ユーザーの目標を保存 */
export async function setGoals(userId: string, goals: Goals): Promise<void> {
  await prisma.userConfig.upsert({
    where: { userId },
    update: { goals: goals as object },
    create: { userId, goals: goals as object },
  });
}

/** 指定ユーザーのパーソナル設定を保存 */
export async function setPersonal(userId: string, personal: Personal): Promise<void> {
  await prisma.userConfig.upsert({
    where: { userId },
    update: { personal: personal as object },
    create: { userId, personal: personal as object },
  });
}

export { DEFAULT_GOALS, DEFAULT_PERSONAL };
