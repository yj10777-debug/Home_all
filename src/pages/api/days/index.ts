import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { calculateDailyScore } from "../../../lib/scoring";
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

    // 評価済みの日付を取得
    const evaluations = await prisma.aiEvaluation.findMany({
      select: { date: true },
      distinct: ['date'],
    });
    const evaluatedDates = new Set(evaluations.map(e => e.date));

    // 各日のサマリーを生成
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
      // カロリー・PFC計算
      let calories = 0;
      let p = 0, f = 0, c = 0;

      const nutrientMealTypes = new Set<string>();
      const nutrients = r.askenNutrients as AskenNutrients | null;

      if (nutrients) {
        for (const [mealType, meal] of Object.entries(nutrients)) {
          if (!meal) continue;
          nutrientMealTypes.add(mealType);
          if (meal["エネルギー"]) calories += parseNumeric(meal["エネルギー"]);
          if (meal["たんぱく質"]) p += parseNumeric(meal["たんぱく質"]);
          if (meal["脂質"]) f += parseNumeric(meal["脂質"]);
          if (meal["炭水化物"]) c += parseNumeric(meal["炭水化物"]);
        }
      }

      const items = r.askenItems as AskenItem[] | null;
      if (items) {
        for (const item of items) {
          if (!nutrientMealTypes.has(item.mealType)) {
            calories += item.calories;
            // itemsにはPFC情報がないため加算できない（カロリーのみ）
          }
        }
      }

      // スコア計算のために DayData 型を作成
      const dayData: DayData = {
        date: r.date,
        askenItems: items,
        askenNutrients: nutrients,
        strongData: r.strongData as StrongData | null,
        steps: r.steps ?? null,
        exerciseCalories: r.exerciseCalories ?? null,
      };

      const scoreResult = calculateDailyScore(dayData);
      const hasEvaluation = evaluatedDates.has(r.date);

      return {
        date: r.date,
        calories: Math.round(calories),
        pfc: { p: Math.round(p), f: Math.round(f), c: Math.round(c) },
        steps: r.steps,
        exerciseCalories: r.exerciseCalories,
        hasStrong: !!r.strongData,
        hasEvaluation,
        score: scoreResult.total,
      };
    });

    return res.status(200).json({ dates: days.map(d => d.date), days });
  } catch (err) {
    console.error("GET /api/days error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
