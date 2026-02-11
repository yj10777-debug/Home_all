import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";

const SECRETS_DIR = path.join(process.cwd(), "secrets");

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const date = req.query.date as string;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "Invalid date. Use YYYY-MM-DD" });
  }

  let data: Record<string, unknown>;
  const dayPath = path.join(SECRETS_DIR, `day-${date}.json`);
  const askenPath = path.join(SECRETS_DIR, `asken-day-${date}.json`);
  const strongPath = path.join(SECRETS_DIR, `strong-day-${date}.json`);

  if (fs.existsSync(dayPath)) {
    data = JSON.parse(fs.readFileSync(dayPath, "utf-8"));
  } else if (fs.existsSync(askenPath)) {
    const asken = JSON.parse(fs.readFileSync(askenPath, "utf-8"));
    data = { date, asken };
  } else if (fs.existsSync(strongPath)) {
    data = { date, strong: JSON.parse(fs.readFileSync(strongPath, "utf-8")) };
  } else {
    return res.status(404).json({ error: "Not found" });
  }

  if (!data.strong && fs.existsSync(strongPath)) {
    data.strong = JSON.parse(fs.readFileSync(strongPath, "utf-8"));
  }

  return res.status(200).json(data);
}
