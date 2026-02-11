import type { NextApiRequest, NextApiResponse } from "next";
import { getGemSystemPrompt } from "../../../lib/gemini";

/**
 * Gem 用システムプロンプト取得エンドポイント
 *
 * GET /api/ai/gem-prompt — 専用 Gem に設定するシステムプロンプトを返す
 */
export default function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const systemPrompt = getGemSystemPrompt();
  return res.status(200).json({ systemPrompt });
}
