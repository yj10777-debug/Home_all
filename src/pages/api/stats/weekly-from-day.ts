import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";

/** 栄養素テキストからカロリー数値を抽出する */
function parseKcal(value: unknown): number {
  if (typeof value !== "string") return 0;
  const match = value.match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
}

/** DailyData レコードから合計カロリーを算出する */
function extractCalories(record: {
  askenItems: unknown;
  askenNutrients: unknown;
}): number {
  let total = 0;
  const nutrientMealTypes = new Set<string>();

  // nutrients からカロリー取得
  const nutrients = record.askenNutrients as Record<string, Record<string, unknown>> | null;
  if (nutrients && typeof nutrients === "object") {
    for (const [mealType, meal] of Object.entries(nutrients)) {
      if (!meal) continue;
      nutrientMealTypes.add(mealType);
      const energy = meal["エネルギー"] ?? meal["エネルギー(kcal)"];
      total += parseKcal(energy);
    }
  }

  // nutrients にない食事タイプ（間食等）を items から補完
  const items = record.askenItems as Array<{ calories?: number; mealType?: string }> | null;
  if (Array.isArray(items)) {
    for (const item of items) {
      if (!item) continue;
      if (item.mealType && !nutrientMealTypes.has(item.mealType)) {
        total += typeof item.calories === "number" ? item.calories : 0;
      }
    }
  }

  return Math.round(total);
}

/**
 * 週間カロリー統計エンドポイント（DB版）
 * GET /api/stats/weekly-from-day — 直近7日分のカロリーデータを返す
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    // 直近7件を取得し、あすけんデータがあるものだけフィルタ
    const records = await prisma.dailyData.findMany({
      orderBy: { date: "desc" },
      take: 14, // 余裕を持って取得し、後でフィルタ
      select: { date: true, askenItems: true, askenNutrients: true },
    });

    const filtered = records.filter((r) => r.askenNutrients !== null).slice(0, 7);

    const dailyStats = filtered
      .map((r) => ({
        date: r.date,
        calories: extractCalories(r),
      }))
      .filter((d) => d.calories > 0)
      .sort((a, b) => a.date.localeCompare(b.date));

    return res.status(200).json(dailyStats);
  } catch (err) {
    console.error("GET /api/stats/weekly-from-day error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
