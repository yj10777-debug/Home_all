/**
 * Google Fit バックフィルスクリプト
 *
 * Fit が保持している範囲（おおむね過去90日）を一括取得して DailyData に流し込む。
 * 1日ずつ順次取得し、appleHealth.ts → googleFit.ts 経由で 100ms/req のレート制御がかかる。
 *
 * 使い方:
 *   npx tsx scripts/backfill-fit.ts                 # 過去90日 (today-89 〜 today)
 *   npx tsx scripts/backfill-fit.ts 2026-03-01       # 指定日 〜 today
 *   npx tsx scripts/backfill-fit.ts 2026-03-01 2026-04-30  # 指定範囲
 *   npx tsx scripts/backfill-fit.ts --force          # 既に同期済みの日も強制再取得
 *   npx tsx scripts/backfill-fit.ts 2026-05-20 2026-05-26 --force
 */

import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
config({ quiet: true });

import { Prisma } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { fetchHealthForDateRange } from '../src/lib/sources/appleHealth';
import { formatDateJst, getEffectiveToday } from '../src/lib/dateUtils';
import type { HealthDayData } from '../src/lib/sources/types';

/** YYYY-MM-DD 文字列の妥当性チェック */
function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T00:00:00').getTime());
}

/** from〜to (inclusive) の日付配列 (JST) */
function dateRange(from: string, to: string): string[] {
  const start = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');
  const dates: string[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    dates.push(formatDateJst(new Date(t)));
  }
  return dates;
}

async function upsertHealthDay(date: string, data: HealthDayData) {
  const payload: Prisma.DailyDataUpdateInput = {
    healthSyncedAt: new Date(),
    healthRaw: (data.raw ?? null) as unknown as Prisma.InputJsonValue,
  };
  if (data.steps != null) payload.steps = data.steps;
  if (data.activeCalories != null) payload.exerciseCalories = data.activeCalories;
  if (data.totalCalories != null) payload.totalCalories = data.totalCalories;
  if (data.restingHeartRate != null) payload.restingHeartRate = data.restingHeartRate;
  if (data.avgHeartRate != null) payload.avgHeartRate = data.avgHeartRate;
  if (data.sleepMinutes != null) payload.sleepMinutes = data.sleepMinutes;
  if (data.distanceMeters != null) payload.distanceMeters = data.distanceMeters;
  if (data.activeMinutes != null) payload.activeMinutes = data.activeMinutes;
  if (data.weightKg != null) payload.weightKg = data.weightKg;

  await prisma.dailyData.upsert({
    where: { date },
    update: payload,
    create: { ...(payload as Prisma.DailyDataCreateInput), date },
  });
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const force = rawArgs.includes('--force');
  const args = rawArgs.filter((a) => a !== '--force');
  const todayStr = formatDateJst(getEffectiveToday());

  let from: string;
  let to: string;

  if (args.length === 0) {
    // 過去90日（今日含む）
    const start = new Date(getEffectiveToday().getTime() - 89 * 86400000);
    from = formatDateJst(start);
    to = todayStr;
  } else if (args.length === 1) {
    if (!isValidDate(args[0])) {
      console.error('日付形式エラー。YYYY-MM-DD で指定してください。');
      process.exit(1);
    }
    from = args[0];
    to = todayStr;
  } else {
    if (!isValidDate(args[0]) || !isValidDate(args[1])) {
      console.error('日付形式エラー。YYYY-MM-DD で指定してください。');
      process.exit(1);
    }
    from = args[0];
    to = args[1];
  }

  const dates = dateRange(from, to);
  console.log(`Google Fit バックフィル: ${from} 〜 ${to} (${dates.length}日)${force ? ' [--force]' : ''}`);

  let targetDates: string[];
  if (force) {
    targetDates = dates;
    console.log(`既同期日も含めて全日再取得: ${targetDates.length}日\n`);
  } else {
    // 既存データを事前取得して進捗判断（既に同期済みの日は再取得しない）
    const existing = await prisma.dailyData.findMany({
      where: { date: { in: dates } },
      select: { date: true, healthSyncedAt: true },
    });
    const synced = new Set(existing.filter((r) => r.healthSyncedAt != null).map((r) => r.date));
    targetDates = dates.filter((d) => !synced.has(d));
    console.log(`既に同期済み: ${synced.size}日 / 取得対象: ${targetDates.length}日\n`);
  }

  if (targetDates.length === 0) {
    console.log('全て同期済みです。何もしません。');
    await prisma.$disconnect();
    return;
  }

  const { data: healthMap, errors } = await fetchHealthForDateRange(new Set(targetDates));

  let successCount = 0;
  let emptyCount = 0;
  let dbErrorCount = 0;

  for (const date of targetDates) {
    const day = healthMap.get(date);
    if (!day) {
      console.log(`⚠️  ${date}: データ取得失敗またはデータなし`);
      emptyCount++;
      continue;
    }
    try {
      await upsertHealthDay(date, day);
      const summary = [
        day.steps != null ? `${day.steps.toLocaleString()}歩` : null,
        day.totalCalories != null ? `${Math.round(day.totalCalories)}kcal` : null,
        day.avgHeartRate != null ? `心拍${day.avgHeartRate}` : null,
        day.sleepMinutes != null ? `睡眠${Math.floor(day.sleepMinutes / 60)}h${day.sleepMinutes % 60}m` : null,
        day.weightKg != null ? `体重${day.weightKg.toFixed(1)}kg` : null,
      ].filter(Boolean).join(' / ');
      console.log(`✅ ${date}: ${summary || '(値なし)'}`);
      successCount++;
    } catch (e) {
      console.error(`❌ ${date}: DB保存失敗: ${String(e)}`);
      dbErrorCount++;
    }
  }

  if (errors.length > 0) {
    console.log(`\nAPI エラー: ${errors.length}件`);
    for (const e of errors.slice(0, 5)) console.log(`  - ${e.slice(0, 200)}`);
    if (errors.length > 5) console.log(`  ...他 ${errors.length - 5} 件`);
  }

  console.log(`\n完了: 成功=${successCount}, データなし=${emptyCount}, DB エラー=${dbErrorCount}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
