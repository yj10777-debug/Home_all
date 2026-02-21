import type { NextApiRequest, NextApiResponse } from "next";
import { syncData } from "../../../lib/syncData";

/** スクレイピングは時間がかかるためタイムアウトを延長 */
export const config = {
  maxDuration: 300, // 5分
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    // body から日付範囲を取得（省略時はデフォルト: 当日1日分）
    const { from, to } = (req.body ?? {}) as { from?: string; to?: string };

    const result = await syncData({ from, to });
    return res.status(200).json({
      success: true,
      askenCount: result.askenCount,
      strongCount: result.strongCount,
      dayCount: result.dayCount,
      errors: result.errors,
    });
  } catch (e) {
    console.error("Sync error:", e);
    return res.status(500).json({
      success: false,
      error: String(e),
    });
  }
}
