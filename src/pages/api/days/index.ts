import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";

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

    // 各日のサマリーを生成
    type DaySummary = {
      date: string;
      calories: number;
      steps: number | null;
      exerciseCalories: number | null;
      hasStrong: boolean;
    };

    const parseNumeric = (v: string) => {
      const m = v.match(/[\d.]+/);
      return m ? parseFloat(m[0]) : 0;
    };

    const days: DaySummary[] = records.map((r) => {
      // カロリー計算（nutrientsのエネルギー合計 + nutrientsにない食事タイプのitemsカロリー）
      let calories = 0;
      const nutrientMealTypes = new Set<string>();
      const nutrients = r.askenNutrients as Record<string, Record<string, string>> | null;
      if (nutrients) {
        for (const [mealType, meal] of Object.entries(nutrients)) {
          if (!meal) continue;
          nutrientMealTypes.add(mealType);
          const energy = meal["エネルギー"];
          if (energy) calories += parseNumeric(energy);
        }
      }
      const items = r.askenItems as Array<{ mealType: string; calories: number }> | null;
      if (items) {
        for (const item of items) {
          if (!nutrientMealTypes.has(item.mealType)) {
            calories += item.calories;
          }
        }
      }

      return {
        date: r.date,
        calories: Math.round(calories),
        steps: r.steps,
        exerciseCalories: r.exerciseCalories,
        hasStrong: !!r.strongData,
      };
    });

    return res.status(200).json({ dates: days.map(d => d.date), days });
  } catch (err) {
    console.error("GET /api/days error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
