import type { NextApiRequest } from "next";
import jwt from "jsonwebtoken";
import { DEFAULT_USER_ID } from "./dbConfig";

// jsonwebtoken は署名検証(jwt.verify)専用に使用する。
// 署名検証なしで sub を信用する jwt.decode によるフォールバックは行わない（なりすまし防止）。

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
    // 本番では SUPABASE_JWT_SECRET 必須。未設定時はフェイルクローズし、
    // 開発環境でのみ "dummy" トークンを許可する（署名検証なしのフォールバックは行わない）
    if (process.env.NODE_ENV !== "production" && token === "dummy") return "dev-user";
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
