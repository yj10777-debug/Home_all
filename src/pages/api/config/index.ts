import type { NextApiRequest, NextApiResponse } from "next";
import { getGoals, getPersonal, setGoals, setPersonal, type Goals, type Personal } from "../../../lib/dbConfig";

/**
 * GET /api/config — 目標・パーソナル設定を返す
 * POST /api/config — body: { goals?, personal? } で更新
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    try {
      const [goals, personal] = await Promise.all([getGoals(), getPersonal()]);
      return res.status(200).json({ goals, personal });
    } catch (e) {
      console.error("GET /api/config error:", e);
      return res.status(500).json({ error: "設定の取得に失敗しました" });
    }
  }

  if (req.method === "POST") {
    try {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
      if (body.goals != null) {
        const g = body.goals as Goals;
        if (
          typeof g.calories === "number" &&
          typeof g.protein === "number" &&
          typeof g.fat === "number" &&
          typeof g.carbs === "number" &&
          g.calories >= 0 &&
          g.protein >= 0 &&
          g.fat >= 0 &&
          g.carbs >= 0
        ) {
          await setGoals({ calories: g.calories, protein: g.protein, fat: g.fat, carbs: g.carbs });
        }
      }
      if (body.personal != null) {
        const p = body.personal as Personal;
        await setPersonal({
          heightCm: p.heightCm ?? null,
          weightKg: p.weightKg ?? null,
          age: p.age ?? null,
          sex: p.sex ?? null,
          activityLevel: p.activityLevel ?? null,
        });
      }
      const [goals, personal] = await Promise.all([getGoals(), getPersonal()]);
      return res.status(200).json({ goals, personal });
    } catch (e) {
      console.error("POST /api/config error:", e);
      return res.status(500).json({ error: "設定の保存に失敗しました" });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).json({ error: "Method Not Allowed" });
}
