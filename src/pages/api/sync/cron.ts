import type { NextApiRequest, NextApiResponse } from "next";
import { syncData } from "../../../lib/syncData";
import { prisma } from "../../../lib/prisma";
import { getEffectiveToday, formatDateJst } from "../../../lib/dateUtils";

/** スクレイピングは時間がかかるためタイムアウトを延長 */
export const config = {
  maxDuration: 300, // 5分
};

/** 過去分同期の日数（朝5時cron用） */
const PAST_SYNC_DAYS = 30;
/** この日数より前の日は「既に取得済みならスキップ」 */
const SKIP_EXISTING_PAST_DAYS = 3;

/**
 * POST /api/sync/cron
 * cron スケジューラーから呼び出される内部同期エンドポイント
 * body.pastOnly === true のときは過去30日間を対象に、3日以上前は未取得のみ取得
 * CRON_SECRET が設定されている場合は x-cron-secret ヘッダーで認証
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // シークレット認証（設定されている場合のみ）
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = req.headers["x-cron-secret"];
    if (provided !== secret) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  try {
    const body = (req.body ?? {}) as { pastOnly?: boolean };
    const result = body.pastOnly
      ? await syncData({
          from: formatDateJst(new Date(getEffectiveToday().getTime() - (PAST_SYNC_DAYS - 1) * 86400000)),
          to: formatDateJst(getEffectiveToday()),
          skipExistingPastDays: SKIP_EXISTING_PAST_DAYS,
        })
      : await syncData();

    // 最終同期時刻を記録
    try {
      await prisma.syncLog.upsert({
        where: { id: 1 },
        update: {
          timestamp: new Date(),
          askenCount: result.askenCount,
          strongCount: result.strongCount,
          dayCount: result.dayCount,
          errors: JSON.stringify(result.errors),
        },
        create: {
          id: 1,
          timestamp: new Date(),
          askenCount: result.askenCount,
          strongCount: result.strongCount,
          dayCount: result.dayCount,
          errors: JSON.stringify(result.errors),
        },
      });
    } catch (logErr) {
      console.error("SyncLog 保存失敗:", logErr);
    }

    return res.status(200).json({
      success: true,
      askenCount: result.askenCount,
      strongCount: result.strongCount,
      dayCount: result.dayCount,
      errors: result.errors,
    });
  } catch (e) {
    console.error("Cron sync error:", e);
    return res.status(500).json({
      success: false,
      error: String(e),
    });
  }
}
