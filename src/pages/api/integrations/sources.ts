import type { NextApiRequest, NextApiResponse } from "next";

/**
 * GET /api/integrations/sources
 * 利用可能なデータソース一覧を返す。現状は固定リスト。将来は DB の Integration と連携して「接続済み」などを返す想定。
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const sources = [
    { id: "asken", name: "あすけん", type: "nutrition", description: "食事・栄養・歩数" },
    { id: "strong", name: "Strong", type: "training", description: "筋トレ記録" },
  ];

  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  return res.status(200).json({ sources });
}
