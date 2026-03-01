import type { NextApiRequest, NextApiResponse } from "next";
import { getGemSystemPrompt } from "../../../lib/gemini";
import { getSystemPrompt } from "../../../lib/dbConfig";

/**
 * Gem 用システムプロンプト取得エンドポイント
 * 設定画面で保存したプロンプトがあればそれを返し、なければデフォルトを返す
 *
 * GET /api/ai/gem-prompt — 専用 Gem に設定するシステムプロンプトを返す
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const saved = await getSystemPrompt();
  const systemPrompt = saved ?? getGemSystemPrompt();
  return res.status(200).json({ systemPrompt });
}
