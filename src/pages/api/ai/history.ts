import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";

/**
 * GET /api/ai/history?date=YYYY-MM-DD&type=daily
 * 指定日のAI評価履歴を取得する
 *
 * GET /api/ai/history?limit=10
 * 最新のAI評価履歴を取得する
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { date, type, limit } = req.query as {
      date?: string;
      type?: string;
      limit?: string;
    };

    // 特定の日付を指定した場合
    if (date) {
      const where: { date: string; type?: string } = { date };
      if (type) where.type = type;

      const evaluations = await prisma.aiEvaluation.findMany({
        where,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          date: true,
          type: true,
          model: true,
          response: true,
          trigger: true,
          createdAt: true,
        },
      });

      return res.status(200).json({ evaluations });
    }

    // 最新の評価一覧
    const take = Math.min(parseInt(limit || "20", 10) || 20, 100);
    const evaluations = await prisma.aiEvaluation.findMany({
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        date: true,
        type: true,
        model: true,
        response: true,
        trigger: true,
        createdAt: true,
      },
    });

    return res.status(200).json({ evaluations });
  } catch (e) {
    console.error("AI history error:", e);
    return res.status(500).json({ error: String(e) });
  }
}
