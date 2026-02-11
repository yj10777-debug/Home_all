import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";

const SECRETS_DIR = path.join(process.cwd(), "secrets");

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  if (!fs.existsSync(SECRETS_DIR)) {
    return res.status(200).json({ dates: [] });
  }
  const seen = new Set<string>();
  const files = fs.readdirSync(SECRETS_DIR);
  for (const f of files) {
    const m = f.match(/^(?:day|asken-day|strong-day)-(\d{4}-\d{2}-\d{2})\.json$/);
    if (m) seen.add(m[1]);
  }
  const dates = Array.from(seen).sort().reverse();
  return res.status(200).json({ dates });
}
