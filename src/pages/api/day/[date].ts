import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";

/**
 * 日次データ取得エンドポイント
 * GET /api/day?date=YYYY-MM-DD
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

    // フロントとの互換性を維持するレスポンス構造
    const data: Record<string, unknown> = { date };
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

    // 歩数・運動消費カロリー
    if (daily.steps != null) data.steps = daily.steps;
    if (daily.exerciseCalories != null) data.exerciseCalories = daily.exerciseCalories;

    return res.status(200).json(data);
  } catch (err) {
    console.error("GET /api/day error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
