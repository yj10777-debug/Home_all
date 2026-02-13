import type { NextApiRequest, NextApiResponse } from "next";
import { format, previousSunday } from "date-fns";
import { generateWeeklyPrompt } from "../../../lib/gemini";
import { getEffectiveToday } from "../../../lib/dateUtils";

/**
 * 直近の日曜起点の週開始日を取得する
 */
function getLatestWeekStart(referenceDate: Date): string {
  const prevSun = previousSunday(referenceDate);
  return format(prevSun, "yyyy-MM-dd");
}

/**
 * 週次プロンプト生成エンドポイント
 *
 * GET /api/ai/weekly?weekStart=YYYY-MM-DD — Gem 貼り付け用の週次プロンプトを生成
 *   weekStart 省略時は直近の日曜を自動判定
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const weekStart =
    (req.query.weekStart as string) || getLatestWeekStart(getEffectiveToday());

  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return res.status(400).json({ error: "日付の形式が不正です (YYYY-MM-DD)" });
  }

  try {
    const prompt = await generateWeeklyPrompt(weekStart);

    const [year, month, day] = weekStart.split("-").map(Number);
    const sat = new Date(year, month - 1, day + 6);
    const weekEnd = `${sat.getFullYear()}-${String(sat.getMonth() + 1).padStart(2, "0")}-${String(sat.getDate()).padStart(2, "0")}`;

    return res.status(200).json({ weekStart, weekEnd, prompt });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ error: errMsg });
  }
}
