/**
 * 指定日付範囲で syncData を実行する（テスト・手動用）
 * 例: npx tsx scripts/sync-range.ts 2026-02-17 2026-02-24
 */
require("dotenv").config();
require("dotenv").config({ path: ".env.local" });

import { syncData } from "../src/lib/syncData";
import { format, subDays } from "date-fns";
import { getEffectiveToday } from "../src/lib/dateUtils";

async function main() {
  const args = process.argv.slice(2);
  const from = args[0];
  const to = args[1];

  const endDate = getEffectiveToday();
  const startDate = subDays(endDate, 6); // デフォルト: 過去7日間
  const fromStr = from || format(startDate, "yyyy-MM-dd");
  const toStr = to || format(endDate, "yyyy-MM-dd");

  console.log(`同期範囲: ${fromStr} 〜 ${toStr}`);
  const result = await syncData({ from: fromStr, to: toStr });
  console.log("結果:", {
    askenCount: result.askenCount,
    strongCount: result.strongCount,
    dayCount: result.dayCount,
    errors: result.errors,
  });
  if (result.errors.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
