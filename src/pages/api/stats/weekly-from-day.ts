import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { subDays, format } from "date-fns";

const SECRETS_DIR = path.join(process.cwd(), "secrets");

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const today = new Date();
    const dailyStats: { date: string; calories: number }[] = [];

    for (let i = 0; i <= 6; i++) {
      const d = subDays(today, 6 - i);
      const dateStr = format(d, "yyyy-MM-dd");
      let calories = 0;

      const dayPath = path.join(SECRETS_DIR, `day-${dateStr}.json`);
      const askenPath = path.join(SECRETS_DIR, `asken-day-${dateStr}.json`);

      if (fs.existsSync(dayPath)) {
        const data = JSON.parse(fs.readFileSync(dayPath, "utf-8"));
        const items = data?.asken?.items ?? [];
        calories = items.reduce((s: number, it: { calories?: number }) => s + (it.calories ?? 0), 0);
      } else if (fs.existsSync(askenPath)) {
        const data = JSON.parse(fs.readFileSync(askenPath, "utf-8"));
        const items = data?.items ?? [];
        calories = items.reduce((s: number, it: { calories?: number }) => s + (it.calories ?? 0), 0);
      }

      dailyStats.push({ date: dateStr, calories: Math.round(calories) });
    }

    res.status(200).json(dailyStats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
}
