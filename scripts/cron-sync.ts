/**
 * 定期同期スケジューラー
 * node-cron で毎日指定時刻にデータ同期APIを呼び出す
 *
 * 環境変数:
 *   CRON_SCHEDULE: cron式（デフォルト: "0 8,12,19,23 * * *" = 毎日 8:00, 12:00, 19:00, 23:00）
 *   CRON_SECRET: 内部API認証用シークレット
 *   PORT: Next.jsサーバーのポート（デフォルト: 3000）
 */
import cron from "node-cron";

const SCHEDULE = process.env.CRON_SCHEDULE || "0 8,12,19,23 * * *";
const SECRET = process.env.CRON_SECRET || "";
const PORT = process.env.PORT || "3000";
const BASE_URL = `http://localhost:${PORT}`;

/** 同期APIを呼び出す */
async function triggerSync() {
  const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  console.log(`[cron-sync] ${now} 同期を開始...`);

  try {
    const res = await fetch(`${BASE_URL}/api/sync/cron`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(SECRET ? { "x-cron-secret": SECRET } : {}),
      },
      body: JSON.stringify({}),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      console.log(
        `[cron-sync] 完了 — あすけん: ${data.askenCount}日, Strong: ${data.strongCount}日, 計: ${data.dayCount}件`
      );
      if (data.errors?.length > 0) {
        console.log(`[cron-sync] 警告: ${data.errors.join(" / ")}`);
      }
    } else {
      console.error(`[cron-sync] エラー:`, data.error || data);
    }
  } catch (e) {
    console.error(`[cron-sync] 通信失敗:`, e);
  }
}

// スケジュール登録
if (!cron.validate(SCHEDULE)) {
  console.error(`[cron-sync] 無効なcron式: ${SCHEDULE}`);
  process.exit(1);
}

console.log(`[cron-sync] スケジューラー起動 — schedule: ${SCHEDULE}`);
console.log(`[cron-sync] タイムゾーン: Asia/Tokyo`);

cron.schedule(SCHEDULE, triggerSync, {
  timezone: "Asia/Tokyo",
});

// 起動時に1回実行はしない（サーバー起動直後はまだ準備中の可能性があるため）
// 手動で初回実行したい場合は環境変数 CRON_RUN_ON_START=1 を設定
if (process.env.CRON_RUN_ON_START === "1") {
  // サーバー起動を待つため30秒後に実行
  setTimeout(triggerSync, 30000);
}
