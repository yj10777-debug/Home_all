import type { NextApiRequest, NextApiResponse } from "next";
import { format } from "date-fns";
import { generateDailyPrompt } from "../../../lib/gemini";

/**
 * 日次プロンプト生成エンドポイント
 *
 * GET /api/ai/daily?date=YYYY-MM-DD — Gem 貼り付け用プロンプトを生成
 *   date 省略時は今日の日付を使用
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const dateStr =
    (req.query.date as string) || format(new Date(), "yyyy-MM-dd");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return res.status(400).json({ error: "日付の形式が不正です (YYYY-MM-DD)" });
  }

  try {
    const prompt = await generateDailyPrompt(dateStr);
    return res.status(200).json({ date: dateStr, prompt });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    if (errMsg.includes("データが見つかりません")) {
      return res.status(404).json({ error: errMsg });
    }
    return res.status(500).json({ error: errMsg });
  }
}
