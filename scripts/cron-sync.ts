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
import { syncData } from "../src/lib/syncData";
import { prisma } from "../src/lib/prisma";
import { getEffectiveToday, formatDateJst } from "../src/lib/dateUtils";

const SYNC_SCHEDULE = process.env.CRON_SCHEDULE || "0 9,11,13,16,19,21,22,23 * * *";
const PAST_SYNC_SCHEDULE = "0 5 * * *"; // 毎日朝5時（JST）に過去分を同期（未取得の日のみ）
const AI_EVAL_SCHEDULE = "0 5 * * *"; // 毎日朝5時（JST）に前日のAI評価を実行
const SECRET = process.env.CRON_SECRET || "";
const PORT = process.env.PORT || "3000";
const BASE_URL = `http://localhost:${PORT}`;

/** 過去分同期の日数（/api/sync/cron と揃える） */
const PAST_SYNC_DAYS = 30;
/** この日数より前の日は「既に取得済みならスキップ」 */
const SKIP_EXISTING_PAST_DAYS = 3;

/** 共通ヘッダー（AI評価APIの呼び出しで使用） */
function getHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(SECRET ? { "x-cron-secret": SECRET } : {}),
  };
}

/** 同期結果を SyncLog(id=1) に記録する（/api/sync/cron と同一処理） */
async function recordSyncLog(result: {
  askenCount: number;
  strongCount: number;
  dayCount: number;
  errors: string[];
}) {
  try {
    await prisma.syncLog.upsert({
      where: { id: 1 },
      update: {
        timestamp: new Date(),
        askenCount: result.askenCount,
        strongCount: result.strongCount,
        dayCount: result.dayCount,
        errors: JSON.stringify(result.errors),
      },
      create: {
        id: 1,
        timestamp: new Date(),
        askenCount: result.askenCount,
        strongCount: result.strongCount,
        dayCount: result.dayCount,
        errors: JSON.stringify(result.errors),
      },
    });
  } catch (logErr) {
    console.error("[cron] SyncLog 保存失敗:", logErr);
  }
}

/**
 * データ同期（前日〜当日の2日分）
 * 以前は自身の /api/sync/cron を fetch していたが、CRON_SECRET 未設定だと
 * 本番でフェイルクローズ(500)になり cron が機能しなかったため、syncData を
 * 同一プロセスで直接呼ぶ方式に変更（認証不要・自己HTTPホップ不要）。
 */
async function triggerSync() {
  const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  console.log(`[cron-sync] ${now} 同期を開始...`);

  try {
    const result = await syncData();
    await recordSyncLog(result);
    console.log(
      `[cron-sync] 完了 — あすけん: ${result.askenCount}日, Strong: ${result.strongCount}日, 計: ${result.dayCount}件`
    );
    if (result.errors?.length > 0) {
      console.log(`[cron-sync] 警告: ${result.errors.join(" / ")}`);
    }
  } catch (e) {
    console.error(`[cron-sync] 同期失敗:`, e);
  }
}

/** 過去分同期（朝5時用・過去30日で3日以上前は未取得のみ取得） */
async function triggerPastSync() {
  const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  console.log(`[cron-past] ${now} 過去分同期を開始...`);

  try {
    const result = await syncData({
      from: formatDateJst(
        new Date(getEffectiveToday().getTime() - (PAST_SYNC_DAYS - 1) * 86400000)
      ),
      to: formatDateJst(getEffectiveToday()),
      skipExistingPastDays: SKIP_EXISTING_PAST_DAYS,
    });
    await recordSyncLog(result);
    console.log(
      `[cron-past] 完了 — あすけん: ${result.askenCount}日, Strong: ${result.strongCount}日, 計: ${result.dayCount}件`
    );
    if (result.errors?.length > 0) {
      console.log(`[cron-past] 警告: ${result.errors.join(" / ")}`);
    }
  } catch (e) {
    console.error(`[cron-past] 同期失敗:`, e);
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
console.log(`[cron]   データ同期(2日): ${SYNC_SCHEDULE}`);
console.log(`[cron]   過去分同期(未取得のみ): ${PAST_SYNC_SCHEDULE}`);
console.log(`[cron]   AI評価: ${AI_EVAL_SCHEDULE} (前日分)`);
console.log(`[cron]   タイムゾーン: Asia/Tokyo`);

// データ同期スケジュール（前日〜当日の2日分）
cron.schedule(SYNC_SCHEDULE, triggerSync, {
  timezone: "Asia/Tokyo",
});

// 過去分同期（毎日朝5時・過去30日で3日以上前は未取得のみ取得）
cron.schedule(PAST_SYNC_SCHEDULE, triggerPastSync, {
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
