import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const logs = await prisma.scrapingLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        date: true,
        source: true,
        status: true,
        message: true,
        details: true,
        createdAt: true,
      },
    });
    return res.status(200).json({ logs });
  } catch (e) {
    console.error("ScrapingLog 取得エラー:", e);
    return res.status(500).json({ error: String(e) });
  }
}
