import type { NextApiRequest } from "next";
import jwt from "jsonwebtoken";
import { DEFAULT_USER_ID } from "./dbConfig";

/** 設定取得用: 認証があれば sub、なければ "default" を返す（例外を出さない） */
export function getUserIdForConfig(req: NextApiRequest): string {
  try {
    return getUserIdFromRequest(req);
  } catch {
    return DEFAULT_USER_ID;
  }
}

export function getUserIdFromRequest(req: NextApiRequest): string {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    throw new Error("UNAUTHORIZED");
  }
  const token = auth.slice("Bearer ".length).trim();

  const secret = process.env.SUPABASE_JWT_SECRET;

  if (!secret) {
    if (token === "dummy") return "dev-user";
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
