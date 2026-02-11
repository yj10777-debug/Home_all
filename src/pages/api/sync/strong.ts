import type { NextApiRequest, NextApiResponse } from "next";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { parseTxtContent, buildStrongData } from "../../../lib/syncData";

/**
 * POST /api/sync/strong
 * Strong テキストファイルの内容を受け取り、パースして DB に保存する
 * body: { files: { name: string; content: string }[] }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { files } = req.body as { files?: { name: string; content: string }[] };
    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: "ファイルが指定されていません" });
    }

    const errors: string[] = [];
    const allParsed: { date: string; workoutName: string; exercises: { name: string; weight: number; reps: number }[] }[] = [];

    // 各ファイルをパース
    for (const file of files) {
      try {
        const parsed = parseTxtContent(file.content);
        if (parsed) {
          allParsed.push(parsed);
        } else {
          errors.push(`${file.name}: パースできませんでした（日付が見つかりません）`);
        }
      } catch (e) {
        errors.push(`${file.name}: ${String(e)}`);
      }
    }

    // StrongDayData を構築して DB に upsert
    const strongMap = buildStrongData(allParsed);
    let savedCount = 0;

    for (const [dateStr, strongData] of strongMap) {
      try {
        await prisma.dailyData.upsert({
          where: { date: dateStr },
          update: {
            strongData: strongData as unknown as Prisma.InputJsonValue,
          },
          create: {
            date: dateStr,
            strongData: strongData as unknown as Prisma.InputJsonValue,
          },
        });
        savedCount += 1;
      } catch (e) {
        errors.push(`DB保存 ${dateStr}: ${String(e)}`);
      }
    }

    return res.status(200).json({
      success: true,
      filesReceived: files.length,
      parsedWorkouts: allParsed.length,
      savedDays: savedCount,
      errors,
    });
  } catch (e) {
    console.error("Strong upload error:", e);
    return res.status(500).json({ error: String(e) });
  }
}

/** ファイルサイズ制限を緩和（デフォルト1MB → 10MB） */
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};
