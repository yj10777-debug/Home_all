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

/**
 * 本番同期の停止とみなす経過時間。
 * Railway cron は1日複数回（CRON_SCHEDULE、既定は 8,12,19,23時）で最大間隔は半日程度のため、
 * 24時間更新が無ければ「本番もローカルも同期していない」異常とみなす。
 * （2026-07-04〜07-11 にRailway同期が8日間無音で停止した事例への対策）
 */
const PROD_STALL_HOURS = 24;

/**
 * 本番（APP_BASE_URL）の死活と最終同期の鮮度を確認する。
 * ローカル同期の前に呼ぶこと — 自分の同期で lastSync を更新してしまうと
 * 停止期間を検知できなくなるため。
 */
async function checkProdSyncHealth(): Promise<void> {
  const baseUrl = process.env.APP_BASE_URL;
  if (!baseUrl) return; // 未設定ならスキップ（ローカル専用運用）

  let json: { lastSync?: { timestamp?: string } | null };
  try {
    // 本番でBasic認証(middleware)が有効な場合に備え、機械アクセス用の
    // x-cron-secret を付与する（未設定でも害はない）
    const headers: Record<string, string> = {};
    if (process.env.CRON_SECRET) headers["x-cron-secret"] = process.env.CRON_SECRET;
    const res = await fetch(new URL("/api/sync/status", baseUrl).toString(), { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    json = await res.json();
  } catch (e) {
    const msg = `本番 (${baseUrl}) の /api/sync/status に到達できません。Railwayのデプロイ/クラッシュ状況を確認してください`;
    console.error(`[session-guard] ✗ ${msg}:`, e instanceof Error ? e.message : e);
    notifyWindows("Railway疎通エラー", msg);
    process.exitCode = 1;
    return;
  }

  const ts = json?.lastSync?.timestamp;
  if (!ts) {
    console.warn("[session-guard] 本番の lastSync が未記録です（初回同期前？）");
    return;
  }

  const ageHours = (Date.now() - new Date(ts).getTime()) / 3600000;
  if (ageHours >= PROD_STALL_HOURS) {
    const msg =
      `同期が ${Math.floor(ageHours)} 時間更新されていません（最終: ${ts}）。` +
      "Railwayの稼働状況とあすけんセッションを確認してください";
    console.error(`[session-guard] ✗ ${msg}`);
    notifyWindows("同期停止の疑い", msg);
    process.exitCode = 1;
  } else {
    console.log(`[session-guard] ✓ 同期は正常（${ageHours.toFixed(1)} 時間前に更新）`);
  }
}

async function main() {
  console.log(`[session-guard] 開始: ${new Date().toISOString()}`);

  // 本番の死活・同期鮮度チェック（ローカル同期で lastSync を更新する前に行う）
  await checkProdSyncHealth();

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
