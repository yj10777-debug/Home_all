import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { isGoogleDriveConfigured } from "../../../lib/googleDrive";

/**
 * GET /api/sync/status
 * 最終同期時刻・結果とスケジュール設定を返す
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const log = await prisma.syncLog.findUnique({ where: { id: 1 } });
    const schedule = process.env.CRON_SCHEDULE || "0 8,12,19,23 * * *";

    res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.status(200).json({
      lastSync: log
        ? {
            timestamp: log.timestamp.toISOString(),
            askenCount: log.askenCount,
            strongCount: log.strongCount,
            dayCount: log.dayCount,
            errors: log.errors ? JSON.parse(log.errors) : [],
          }
        : null,
      schedule,
      googleDriveConfigured: isGoogleDriveConfigured(),
      askenConfigured: !!(process.env.ASKEN_EMAIL && process.env.ASKEN_PASSWORD),
    });
  } catch (e) {
    console.error("Sync status error:", e);
    return res.status(500).json({ error: String(e) });
  }
}
