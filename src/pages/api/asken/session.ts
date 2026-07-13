import type { NextApiRequest, NextApiResponse } from "next";
import {
  CookieParseError,
  buildStorageState,
  checkAuthCookies,
  normalizeStorageStateInput,
  parseCookiesFromText,
  writeStorageState,
} from "../../../lib/askenCookies";

/**
 * POST /api/asken/session
 *
 * ローカルで手動更新した「あすけん」のセッションCookieを、Railway本番（揮発FS）へ
 * 再デプロイ無しで反映するためのエンドポイント。scripts/asken/push-session.ts から呼ばれる。
 *
 * 認証: x-cron-secret ヘッダー（または Authorization: Bearer）が env CRON_SECRET と
 * 一致しなければ 401。CRON_SECRET が未設定の場合は常に 500（フェイルクローズ。
 * /api/sync/cron と異なり開発環境でもバイパスしない — このAPIはファイル書き込みを伴うため）。
 *
 * ボディ: { storageState: {...} } または { cookieHeader: "..." } のどちらか。
 * Cookie値はレスポンス・ログのいずれにも含めない（Cookie名と件数のみ）。
 */

function getProvidedSecret(req: NextApiRequest): string | undefined {
  const headerSecret = req.headers["x-cron-secret"];
  if (typeof headerSecret === "string" && headerSecret) return headerSecret;

  const authHeader = req.headers["authorization"];
  if (typeof authHeader === "string" && authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  return undefined;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // 未設定は常にフェイルクローズ（ファイル書き込みAPIのため、開発環境でもバイパスしない）
    return res.status(500).json({ error: "CRON_SECRET is not configured" });
  }

  const provided = getProvidedSecret(req);
  if (provided !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const body = (req.body ?? {}) as {
      storageState?: unknown;
      cookieHeader?: string;
    };

    let storageState;
    if (body.storageState !== undefined) {
      storageState = normalizeStorageStateInput(body.storageState);
    } else if (typeof body.cookieHeader === "string" && body.cookieHeader.trim()) {
      const cookies = parseCookiesFromText(body.cookieHeader);
      storageState = buildStorageState(cookies);
    } else {
      return res.status(400).json({ error: "storageState または cookieHeader を指定してください" });
    }

    writeStorageState(storageState);
    const { hasAuthCookies } = checkAuthCookies(storageState.cookies);

    return res.status(200).json({
      ok: true,
      cookieCount: storageState.cookies.length,
      hasAuthCookies,
    });
  } catch (e) {
    if (e instanceof CookieParseError) {
      return res.status(400).json({ error: e.message });
    }
    console.error("asken session 反映エラー:", e);
    return res.status(500).json({ error: "内部エラーが発生しました" });
  }
}
