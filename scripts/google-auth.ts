/**
 * Google OAuth 2.0 リフレッシュトークン取得スクリプト
 * 1回だけ実行してトークンを取得する
 */
import http from "http";
import { URL } from "url";

const CLIENT_ID = "1024157818151-setsmc76u3kmisgjq4onk4nh2ap0f6ue.apps.googleusercontent.com";
const CLIENT_SECRET = "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";
const REDIRECT_URI = "http://localhost:3456/callback";
const SCOPES = "https://www.googleapis.com/auth/drive.readonly";

// Step 1: 認証URLを表示
const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(SCOPES)}&access_type=offline&prompt=consent`;

console.log("\n=== Google OAuth 認証 ===");
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
      console.log("以下を .env.local と Railway の Variables に追加してください:\n");
      console.log(`GOOGLE_CLIENT_ID=${CLIENT_ID}`);
      console.log(`GOOGLE_CLIENT_SECRET=${CLIENT_SECRET}`);
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
