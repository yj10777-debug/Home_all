/**
 * Google OAuth 2.0 リフレッシュトークン取得スクリプト
 * トークン期限切れ（invalid_grant）時に再実行して新しい GOOGLE_REFRESH_TOKEN を取得する
 *
 * 使い方: .env.local に GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET を設定してから
 *   npx tsx scripts/google-auth.ts
 */
import http from "http";
import { URL } from "url";
import path from "path";
import fs from "fs";

// npx tsx で実行時は .env.local が自動読まれないため、ここで読み込む
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
const REDIRECT_URI = "http://localhost:3456/callback";
const SCOPES = "https://www.googleapis.com/auth/drive.readonly";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("GOOGLE_CLIENT_ID と GOOGLE_CLIENT_SECRET を .env.local に設定してください。");
  console.error("（プロジェクト直下の .env.local を読み込みます。カレントディレクトリがプロジェクト直下か確認してください）");
  process.exit(1);
}

// Step 1: 認証URLを表示
const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(SCOPES)}&access_type=offline&prompt=consent`;

console.log("\n=== Google OAuth 認証（リフレッシュトークン取得） ===");
console.log("\n以下のURLをブラウザで開いてください:\n");
console.log(authUrl);
console.log("\n認証後、自動的にリダイレクトされます...\n");

// Step 2: コールバックを受け取るローカルサーバー
const server = http.createServer(async (req, res) => {
  if (!req.url?.startsWith("/callback")) return;

  const url = new URL(req.url, `http://localhost:3456`);
  const code = url.searchParams.get("code");

  if (!code) {
    res.writeHead(400);
    res.end("エラー: 認証コードが見つかりません");
    return;
  }

  // Step 3: 認証コードをリフレッシュトークンに交換
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json() as any;

    if (tokenData.refresh_token) {
      console.log("\n✅ リフレッシュトークン取得成功!\n");
      console.log("⚠️  この実行で古いリフレッシュトークンは無効になります。");
      console.log("     .env.local と本番（Railway 等）の両方に、同じ値を設定してください。\n");
      console.log("以下を設定・更新してください:\n");
      console.log(`GOOGLE_REFRESH_TOKEN=${tokenData.refresh_token}`);
      console.log("");

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<h1>✅ 認証成功!</h1><p>ターミナルにトークンが表示されています。このページは閉じてOKです。</p>");
    } else {
      console.error("エラー:", tokenData);
      res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<h1>エラー</h1><pre>${JSON.stringify(tokenData, null, 2)}</pre>`);
    }
  } catch (e) {
    console.error("トークン交換エラー:", e);
    res.writeHead(500);
    res.end("エラー");
  }

  // サーバー終了
  setTimeout(() => { server.close(); process.exit(0); }, 1000);
});

server.listen(3456, () => {
  console.log("ローカルサーバー起動: http://localhost:3456");
});
