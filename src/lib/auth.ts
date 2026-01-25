// src/lib/auth.ts
import type { NextApiRequest } from "next";
import jwt from "jsonwebtoken";

export function getUserIdFromRequest(req: NextApiRequest): string {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    throw new Error("UNAUTHORIZED");
  }
  const token = auth.slice("Bearer ".length).trim();

  const secret = process.env.SUPABASE_JWT_SECRET;

  // 開発用フォールバック（secret未設定なら dummy を許可）
  if (!secret) {
    if (token === "dummy") return "dev-user";
    // それ以外は最低限decodeしてsubを見る（開発用）
    const decoded = jwt.decode(token) as { sub?: string } | null;
    if (decoded?.sub) return decoded.sub;
    throw new Error("SERVER_CONFIG");
  }

  try {
    const payload = jwt.verify(token, secret) as { sub?: string };
    if (!payload?.sub) throw new Error("UNAUTHORIZED");
    return payload.sub;
  } catch {
    throw new Error("UNAUTHORIZED");
  }
}
