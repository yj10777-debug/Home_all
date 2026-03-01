import type { NextApiRequest, NextApiResponse } from "next";
import { setSystemPrompt, DEFAULT_USER_ID } from "../../../lib/dbConfig";

/**
 * AI 評価用システムプロンプトをサーバーに保存する
 * 保存後は手動評価・cron の両方で同じプロンプトが使われる
 *
 * POST /api/settings/system-prompt
 * body: { systemPrompt?: string } — 空または未指定でデフォルト使用
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { systemPrompt } = (req.body ?? {}) as { systemPrompt?: string };
  try {
    await setSystemPrompt(DEFAULT_USER_ID, systemPrompt ?? null);
    return res.status(200).json({ success: true });
  } catch (e) {
    console.error("system-prompt save error:", e);
    return res.status(500).json({ error: "保存に失敗しました" });
  }
}
