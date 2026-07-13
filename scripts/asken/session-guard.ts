/**
 * あすけんセッションの定期監視。
 *
 * 1. secrets/asken-state.json のセッションを実アクセスで検証する（check-login.ts の verifySession を再利用）
 * 2. 有効なら「今日と前2日」を同期する（syncData を直接呼び出し）
 * 3. 無効ならWindowsデスクトップ通知を出す（Cookie/パスワードは一切含めない）
 *
 * Windows タスクスケジューラから定期実行する想定（scripts/asken/setup-schedule.ps1 参照）。
 * 手動実行:
 *   npx tsx scripts/asken/session-guard.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ quiet: true });

import { format, subDays } from "date-fns";
import { getEffectiveToday } from "../../src/lib/dateUtils";
import { syncData } from "../../src/lib/syncData";
import { verifySession } from "./check-login";
import { notifyWindows } from "./notify";

const NOTIFY_TITLE = "あすけんセッション切れ";
const NOTIFY_MESSAGE =
  "あすけんセッションが切れました。Chromeで再ログイン後、Cookieヘッダをコピーして " +
  "npx tsx scripts/asken/import-cookies.ts --clipboard を実行してください";

/** 有効セッション時に同期する過去日数（今日を含む） */
const SYNC_DAYS = 3;

async function main() {
  console.log(`[session-guard] 開始: ${new Date().toISOString()}`);

  const result = await verifySession();

  if (!result.valid) {
    const reason = result.reason === "missing-state-file" ? "セッションファイルが存在しません" : "ログインページへリダイレクトされました";
    console.error(`[session-guard] ✗ セッション無効（${reason}）。通知を送信します。`);
    notifyWindows(NOTIFY_TITLE, NOTIFY_MESSAGE);
    process.exitCode = 1;
    return;
  }

  console.log(`[session-guard] ✓ セッション有効 (HTTP ${result.status})`);

  const endDate = getEffectiveToday();
  const startDate = subDays(endDate, SYNC_DAYS - 1);
  const fromStr = format(startDate, "yyyy-MM-dd");
  const toStr = format(endDate, "yyyy-MM-dd");

  console.log(`[session-guard] 同期範囲: ${fromStr} 〜 ${toStr}`);
  try {
    const syncResult = await syncData({ from: fromStr, to: toStr });
    console.log("[session-guard] 同期結果:", {
      askenCount: syncResult.askenCount,
      strongCount: syncResult.strongCount,
      dayCount: syncResult.dayCount,
      errors: syncResult.errors,
    });
    if (syncResult.errors.length > 0) {
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("[session-guard] 同期中にエラー:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("[session-guard] 予期しないエラー:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
