/**
 * Google OAuth 2.0 共通モジュール
 * リフレッシュトークン → アクセストークンの交換を担当。
 * Google Drive / Google Fit など複数の API クライアントから利用する。
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
};

/** 環境変数から OAuth 設定を取得。未設定なら null */
export function getGoogleOAuthConfig(): GoogleOAuthConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  return { clientId, clientSecret, refreshToken };
}

/** リフレッシュトークンからアクセストークンを取得 */
export async function getGoogleAccessToken(config: GoogleOAuthConfig): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    const hint =
      err.includes("invalid_grant") || err.includes("Token has been expired or revoked")
        ? " → リフレッシュトークンが期限切れまたは無効です。プロジェクトで `npx tsx scripts/google-auth.ts` を実行して再認証し、表示された GOOGLE_REFRESH_TOKEN を .env に設定してください。"
        : "";
    throw new Error(`アクセストークン取得失敗: ${res.status} ${err}${hint}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}
