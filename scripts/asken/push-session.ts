/**
 * ローカルの secrets/asken-state.json を Railway 本番（または任意の APP_BASE_URL）へ送信する。
 *
 * 本番の揮発FSでは再デプロイのたびに secrets/asken-state.json が消えるため、
 * ローカルで手動更新したセッションを再デプロイ無しで反映するために使う。
 *
 * 使い方:
 *   npx tsx scripts/asken/push-session.ts                       (.env.local の APP_BASE_URL を使用)
 *   npx tsx scripts/asken/push-session.ts https://xxx.up.railway.app  (URLを直接指定)
 *
 * 必須環境変数: CRON_SECRET（送信先APIの認証。/api/asken/session と同じ値）
 * Cookie値は標準出力に一切表示しない。
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ quiet: true });

import fs from "fs";
import path from "path";

const PROJECT_ROOT = process.cwd();
const STATE_FILE = path.join(PROJECT_ROOT, "secrets", "asken-state.json");

async function main() {
  const baseUrl = process.argv[2] || process.env.APP_BASE_URL;
  if (!baseUrl) {
    console.error("送信先が指定されていません。APP_BASE_URL を .env.local に設定するか、引数でURLを渡してください。");
    console.error("例: npx tsx scripts/asken/push-session.ts https://your-app.up.railway.app");
    process.exit(1);
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("CRON_SECRET が未設定です。.env.local に設定してください（本番の /api/asken/session と同じ値）。");
    process.exit(1);
  }

  if (!fs.existsSync(STATE_FILE)) {
    console.error(`セッションファイルが見つかりません: ${STATE_FILE}`);
    console.error("先に npx tsx scripts/asken/import-cookies.ts --clipboard を実行してください。");
    process.exit(1);
  }

  const storageState = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  const cookieCount = Array.isArray(storageState?.cookies) ? storageState.cookies.length : 0;

  const url = new URL("/api/asken/session", baseUrl).toString();
  console.log(`送信先: ${url} (Cookie ${cookieCount} 件)`);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cron-secret": secret,
    },
    body: JSON.stringify({ storageState }),
  });

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* ボディなし・非JSON */
  }

  if (!res.ok) {
    console.error(`✗ 送信失敗 (HTTP ${res.status})`);
    console.error(json ?? (await res.text().catch(() => "")));
    process.exit(1);
  }

  console.log(`✓ 送信成功 (HTTP ${res.status})`);
  console.log("  レスポンス:", json);
}

main().catch((e) => {
  console.error("送信中にエラー:", e instanceof Error ? e.message : e);
  process.exit(1);
});
