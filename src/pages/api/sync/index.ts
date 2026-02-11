import type { NextApiRequest, NextApiResponse } from "next";
import { syncData } from "../../../lib/syncData";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const result = await syncData();
    return res.status(200).json({
      success: true,
      askenCount: result.askenCount,
      strongCount: result.strongCount,
      dayCount: result.dayCount,
      errors: result.errors,
    });
  } catch (e) {
    console.error("Sync error:", e);
    return res.status(500).json({
      success: false,
      error: String(e),
    });
  }
}
