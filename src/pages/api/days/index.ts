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
      select: { date: true },
      orderBy: { date: "desc" },
    });
    const dates = records.map((r) => r.date);
    return res.status(200).json({ dates });
  } catch (err) {
    console.error("GET /api/days error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
