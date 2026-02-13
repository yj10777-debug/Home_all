/**
 * 定期同期 & AI評価スケジューラー
 * node-cron で定期的にデータ同期APIとAI評価APIを呼び出す
 *
 * 環境変数:
 *   CRON_SCHEDULE: データ同期cron式（デフォルト: "0 9,11,13,16,19,21,22,23 * * *"）
 *   CRON_SECRET: 内部API認証用シークレット
 *   PORT: Next.jsサーバーのポート（デフォルト: 3000）
 */
import cron from "node-cron";

const SYNC_SCHEDULE = process.env.CRON_SCHEDULE || "0 9,11,13,16,19,21,22,23 * * *";
const AI_EVAL_SCHEDULE = "0 5 * * *"; // 毎日朝5時（JST）に前日のAI評価を実行
const SECRET = process.env.CRON_SECRET || "";
const PORT = process.env.PORT || "3000";
const BASE_URL = `http://localhost:${PORT}`;

/** 共通ヘッダー */
function getHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(SECRET ? { "x-cron-secret": SECRET } : {}),
  };
}

/** データ同期APIを呼び出す */
async function triggerSync() {
  const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  console.log(`[cron-sync] ${now} 同期を開始...`);

  try {
    const res = await fetch(`${BASE_URL}/api/sync/cron`, {
      method: "POST",
      headers: getHeaders(),
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

/**
 * 前日の日次AI評価を実行する
 * 朝5時に呼ばれるので、前日 = 昨日の日付
 */
async function triggerDailyAiEvaluation() {
  const now = new Date();
  // 前日の日付を計算（JST基準）
  const yesterday = new Date(now.getTime() - 86400000);
  const y = yesterday.getFullYear();
  const m = String(yesterday.getMonth() + 1).padStart(2, "0");
  const d = String(yesterday.getDate()).padStart(2, "0");
  // UTCで計算しているので、JSTに変換
  const jstYesterday = new Date(now.getTime() + 9 * 3600000 - 86400000);
  const dateStr = `${jstYesterday.getFullYear()}-${String(jstYesterday.getMonth() + 1).padStart(2, "0")}-${String(jstYesterday.getDate()).padStart(2, "0")}`;

  console.log(`[cron-ai] 前日(${dateStr})のAI評価を開始...`);

  try {
    const res = await fetch(`${BASE_URL}/api/ai/evaluate`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        date: dateStr,
        type: "daily",
        trigger: "cron",
      }),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      console.log(`[cron-ai] 完了 — ${dateStr} の評価を保存 (model: ${data.evaluation.model})`);
    } else {
      console.error(`[cron-ai] エラー:`, data.error || data);
    }
  } catch (e) {
    console.error(`[cron-ai] 通信失敗:`, e);
  }
}

// スケジュール登録
if (!cron.validate(SYNC_SCHEDULE)) {
  console.error(`[cron-sync] 無効なcron式: ${SYNC_SCHEDULE}`);
  process.exit(1);
}

console.log(`[cron] スケジューラー起動`);
console.log(`[cron]   データ同期: ${SYNC_SCHEDULE}`);
console.log(`[cron]   AI評価: ${AI_EVAL_SCHEDULE} (前日分)`);
console.log(`[cron]   タイムゾーン: Asia/Tokyo`);

// データ同期スケジュール
cron.schedule(SYNC_SCHEDULE, triggerSync, {
  timezone: "Asia/Tokyo",
});

// AI評価スケジュール（毎日朝5時）
cron.schedule(AI_EVAL_SCHEDULE, triggerDailyAiEvaluation, {
  timezone: "Asia/Tokyo",
});

// 起動時に1回実行はしない（サーバー起動直後はまだ準備中の可能性があるため）
if (process.env.CRON_RUN_ON_START === "1") {
  setTimeout(triggerSync, 30000);
}
