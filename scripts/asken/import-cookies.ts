/**
 * ブラウザからエクスポートしたあすけんのCookieを Playwright storageState 形式に変換し、
 * secrets/asken-state.json として配置する。
 *
 * あすけんのBot対策により自動ログインが不可能になったため、
 * 「通常ブラウザで手動ログイン → Cookieをエクスポート → 本スクリプトで配置」という運用を行う。
 *
 * 入力元は2通り:
 *   (1) クリップボードから直接（推奨・最速）:
 *         npx tsx scripts/asken/import-cookies.ts --clipboard
 *       DevTools の Network タブ等で Cookie ヘッダをコピーした直後にこのコマンドを実行するだけでよい。
 *   (2) ファイルパス指定（従来通り）:
 *         npx tsx scripts/asken/import-cookies.ts <保存したファイルのパス>
 *
 * 入力の中身は2形式に対応（拡張子や中身から自動判別、(1)(2)共通）:
 *   (A) Cookie-Editor 等の JSON エクスポート（配列 / { cookies: [...] } / Playwright storageState）
 *   (B) DevTools の Network タブでコピーした生の Cookie ヘッダ文字列
 *       例: "PSID_0=xxxx; ASKEN_PORTAL_AUTO=1; csrfToken=yyyy"
 *       （"Cookie:" プレフィックスや "Copy as cURL" の出力でも可）
 *       この形式はメタ情報が無いため domain=".asken.jp" / secure / httpOnly を既定補完する。
 *
 * 使い方:
 *   1. 普段使いのブラウザで https://www.asken.jp/login に通常ログイン
 *      （「次回から自動的にログイン」にチェックを入れると Cookie が約30日有効）
 *   2. F12 → Network → ページ再読込 → 先頭の document リクエスト →
 *      Request Headers の "Cookie" 値をコピー（Ctrl+C）
 *   3. 本スクリプトを実行:
 *        npx tsx scripts/asken/import-cookies.ts --clipboard
 *      （または、ファイルに保存してから: npx tsx scripts/asken/import-cookies.ts <パス>）
 *   4. 検証:
 *        npx tsx scripts/asken/check-login.ts
 *
 * Cookie値は標準出力に一切表示しない（Cookie名と件数のみ表示）。
 */
import fs from "fs";
import {
  CookieParseError,
  checkAuthCookies,
  buildStorageState,
  parseCookiesFromText,
  writeStorageState,
} from "../../src/lib/askenCookies";
import { readClipboardText } from "./clipboard";

function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("使い方:");
    console.error("  npx tsx scripts/asken/import-cookies.ts --clipboard        (クリップボードから読み取り)");
    console.error("  npx tsx scripts/asken/import-cookies.ts <保存したファイルのパス>");
    process.exit(1);
  }

  let rawText: string;
  if (arg === "--clipboard" || arg === "-c") {
    try {
      rawText = readClipboardText().trim();
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
    if (!rawText) {
      console.error("クリップボードが空です。Cookieヘッダをコピーしてから実行してください。");
      process.exit(1);
    }
  } else {
    if (!fs.existsSync(arg)) {
      console.error(`ファイルが見つかりません: ${arg}`);
      process.exit(1);
    }
    rawText = fs.readFileSync(arg, "utf-8").trim();
    if (!rawText) {
      console.error(`ファイルが空です（0バイト）: ${arg}`);
      process.exit(1);
    }
  }

  let cookies;
  try {
    cookies = parseCookiesFromText(rawText);
  } catch (e) {
    if (e instanceof CookieParseError) {
      console.error(e.message);
      process.exit(1);
    }
    throw e;
  }

  const { names, missing } = checkAuthCookies(cookies);
  const storageState = buildStorageState(cookies);
  const stateFile = writeStorageState(storageState);

  console.log(`✓ ${cookies.length} 件のCookieを ${stateFile} に配置しました`);
  console.log(`  含まれるCookie名: ${names.sort().join(", ")}`);
  if (missing.length > 0) {
    console.warn(`⚠ 認証に重要なCookieが見つかりません: ${missing.join(", ")}`);
    console.warn("  ログイン状態でエクスポートできているか確認してください。");
  }
  console.log("次に検証してください: npx tsx scripts/asken/check-login.ts");
}

main();
