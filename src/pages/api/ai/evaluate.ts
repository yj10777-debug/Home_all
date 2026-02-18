import type { NextApiRequest, NextApiResponse } from "next";
import { runDailyEvaluation, runWeeklyEvaluation } from "../../../lib/aiEvaluator";
import { getEffectiveTodayStr } from "../../../lib/dateUtils";
import { isGeminiConfigured } from "../../../lib/geminiClient";

/**
 * POST /api/ai/evaluate
 * AI評価を実行してDBに保存する
 * body: { date?: string, type?: "daily" | "weekly", trigger?: "manual" | "cron" }
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  if (!isGeminiConfigured()) {
    return res.status(400).json({ error: "GEMINI_API_KEY が設定されていません" });
  }

  const {
    date = getEffectiveTodayStr(),
    type = "daily",
    trigger = "manual",
    systemPrompt,
  } = (req.body ?? {}) as {
    date?: string;
    type?: "daily" | "weekly";
    trigger?: "manual" | "cron";
    systemPrompt?: string;
  };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "日付の形式が不正です (YYYY-MM-DD)" });
  }

  try {
    const result =
      type === "weekly"
        ? await runWeeklyEvaluation(date, trigger, systemPrompt)
        : await runDailyEvaluation(date, trigger, systemPrompt);

    return res.status(200).json({ success: true, evaluation: result });
  } catch (e) {
    console.error("AI evaluation error:", e);
    return res.status(500).json({
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
