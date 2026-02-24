import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { calculateDailyScore } from "../../../lib/scoring";
import { getGoals } from "../../../lib/dbConfig";
import { getUserIdForConfig } from "../../../lib/auth";
import type { DayData, AskenItem, AskenNutrients, StrongData } from "../../../lib/gemini";

/**
 * 日付一覧取得エンドポイント
 * GET /api/days — DB に登録されている全日付を返す
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const userId = getUserIdForConfig(req);
    let goals;
    try {
      goals = await getGoals(userId);
    } catch (e) {
      console.warn("GET /api/days getGoals failed, using defaults:", e);
      goals = { calories: 2267, protein: 150, fat: 54, carbs: 293 };
    }

    const records = await prisma.dailyData.findMany({
      select: {
        date: true,
        askenItems: true,
        askenNutrients: true,
        strongData: true,
        steps: true,
        exerciseCalories: true,
      },
      orderBy: { date: "desc" },
    });

    let evaluatedDates = new Set<string>();
    try {
      const evaluations = await prisma.aiEvaluation.findMany({
        select: { date: true },
        distinct: ["date"],
      });
      evaluatedDates = new Set(evaluations.map((e) => e.date));
    } catch (e) {
      console.warn("GET /api/days aiEvaluation findMany failed:", e);
    }

    type DaySummary = {
      date: string;
      calories: number;
      pfc: { p: number; f: number; c: number };
      steps: number | null;
      exerciseCalories: number | null;
      hasStrong: boolean;
      hasEvaluation: boolean;
      score: number;
    };

    const parseNumeric = (v: string) => {
      const m = v.match(/[\d.]+/);
      return m ? parseFloat(m[0]) : 0;
    };

    const days: DaySummary[] = records.map((r) => {
      let calories = 0;
      let p = 0, f = 0, c = 0;

      const nutrientMealTypes = new Set<string>();
      const nutrients = r.askenNutrients as AskenNutrients | null;

      if (nutrients && typeof nutrients === "object") {
        for (const [mealType, meal] of Object.entries(nutrients)) {
          if (!meal || typeof meal !== "object") continue;
          nutrientMealTypes.add(mealType);
          if (meal["エネルギー"]) calories += parseNumeric(String(meal["エネルギー"]));
          if (meal["たんぱく質"]) p += parseNumeric(String(meal["たんぱく質"]));
          if (meal["脂質"]) f += parseNumeric(String(meal["脂質"]));
          if (meal["炭水化物"]) c += parseNumeric(String(meal["炭水化物"]));
        }
      }

      const items = r.askenItems as AskenItem[] | null;
      if (Array.isArray(items)) {
        for (const item of items) {
          if (item && typeof item.calories === "number" && !nutrientMealTypes.has(item.mealType)) {
            calories += item.calories;
          }
        }
      }

      let score = 0;
      try {
        const dayData: DayData = {
          date: r.date,
          askenItems: items ?? null,
          askenNutrients: nutrients ?? null,
          strongData: (r.strongData as StrongData) ?? null,
          steps: r.steps ?? null,
          exerciseCalories: r.exerciseCalories ?? null,
        };
        score = calculateDailyScore(dayData, undefined, goals).total;
      } catch (e) {
        console.warn(`GET /api/days score failed for ${r.date}:`, e);
      }

      return {
        date: r.date,
        calories: Math.round(calories),
        pfc: { p: Math.round(p), f: Math.round(f), c: Math.round(c) },
        steps: r.steps,
        exerciseCalories: r.exerciseCalories,
        hasStrong: !!r.strongData,
        hasEvaluation: evaluatedDates.has(r.date),
        score,
      };
    });

    res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.status(200).json({ dates: days.map((d) => d.date), days });
  } catch (err) {
    console.error("GET /api/days error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
