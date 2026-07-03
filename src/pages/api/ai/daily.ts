import type { NextApiRequest, NextApiResponse } from "next";
import { generateDailyPrompt } from "../../../lib/gemini";
import { getEffectiveTodayStr } from "../../../lib/dateUtils";
import { toClientErrorMessage } from "../../../lib/apiError";

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
    (req.query.date as string) || getEffectiveTodayStr();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return res.status(400).json({ error: "日付の形式が不正です (YYYY-MM-DD)" });
  }

  try {
    const prompt = await generateDailyPrompt(dateStr);
    return res.status(200).json({ date: dateStr, prompt });
  } catch (e) {
    console.error("Daily prompt error:", e);
    // 404判定は内部メッセージに依存するため、判定後にクライアント向けメッセージへ変換する
    const isNotFound = e instanceof Error && e.message.includes("データが見つかりません");
    if (isNotFound) {
      return res.status(404).json({ error: toClientErrorMessage(e) });
    }
    return res.status(500).json({ error: toClientErrorMessage(e) });
  }
}
