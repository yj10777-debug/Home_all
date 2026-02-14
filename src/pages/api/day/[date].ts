import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import type { AskenItem, AskenNutrients } from "../../../lib/gemini";

const parseNumeric = (v: string) => {
  const m = v.match(/[\d.]+/);
  return m ? parseFloat(m[0]) : 0;
};

/**
 * 日次データ取得エンドポイント
 * GET /api/day/[date] — 指定日のデータを返す（index トップページ用に calories, pfc を含む）
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const date = req.query.date as string;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "Invalid date. Use YYYY-MM-DD" });
  }

  try {
    const daily = await prisma.dailyData.findUnique({ where: { date } });
    if (!daily) {
      return res.status(404).json({ error: "Not found" });
    }

    const nutrients = daily.askenNutrients as AskenNutrients | null;
    const items = daily.askenItems as AskenItem[] | null;
    let calories = 0;
    let protein = 0;
    let fat = 0;
    let carbs = 0;
    const nutrientMealTypes = new Set<string>();

    if (nutrients) {
      for (const [mealType, meal] of Object.entries(nutrients)) {
        if (!meal) continue;
        nutrientMealTypes.add(mealType);
        if (meal["エネルギー"]) calories += parseNumeric(meal["エネルギー"]);
        if (meal["たんぱく質"]) protein += parseNumeric(meal["たんぱく質"]);
        if (meal["脂質"]) fat += parseNumeric(meal["脂質"]);
        if (meal["炭水化物"]) carbs += parseNumeric(meal["炭水化物"]);
      }
    }
    if (items) {
      for (const item of items) {
        if (!nutrientMealTypes.has(item.mealType)) calories += item.calories;
      }
    }

    const data: Record<string, unknown> = {
      date,
      calories: Math.round(calories),
      pfc: { protein: Math.round(protein), fat: Math.round(fat), carbs: Math.round(carbs) },
    };

    if (daily.askenItems || daily.askenNutrients) {
      data.asken = {
        date,
        items: daily.askenItems ?? [],
        nutrients: daily.askenNutrients ?? {},
      };
    }
    if (daily.strongData) {
      data.strong = {
        date,
        ...(daily.strongData as Record<string, unknown>),
      };
    }
    if (daily.steps != null) data.steps = daily.steps;
    if (daily.exerciseCalories != null) data.exerciseCalories = daily.exerciseCalories;

    return res.status(200).json(data);
  } catch (err) {
    console.error("GET /api/day error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
