/**
 * あすけん + Strong の同期オーケストレーション
 * データ取得は sources/asken と sources/strong に委譲。既存の API 互換のため parseTxtContent / buildStrongData / parseStrongFiles は re-export。
 */

import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { getEffectiveToday, getEffectiveTodayStr, formatDateJst } from "./dateUtils";
import { fetchNutritionForDate, readNutritionFallbackFile } from "./sources/asken";
import {
  fetchTrainingForDateRange,
  parseTxtContent,
  buildStrongData,
  parseStrongFiles,
} from "./sources/strong";
import type { NutritionDayResult } from "./sources/types";
import type { StrongDayData } from "./sources/types";

// 既存 API（api/sync/strong 等）のため re-export
export { parseTxtContent, buildStrongData, parseStrongFiles };

/**
 * 日付範囲を生成する
 * @param from 開始日 (YYYY-MM-DD)。省略時は前日〜当日の2日分（今すぐ取得用）
 * @param to 終了日 (YYYY-MM-DD)。省略時は today
 */
function getTargetDates(from?: string, to?: string): string[] {
  const endDate = to ? new Date(to + "T00:00:00") : getEffectiveToday();
  const startDate = from ? new Date(from + "T00:00:00") : new Date(endDate.getTime() - 86400000);
  const dates: string[] = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    dates.push(formatDateJst(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

/** 日付 d が「今日」から何日前か（正の数＝過去） */
function daysAgo(dateStr: string, todayStr: string): number {
  const d = new Date(dateStr + "T00:00:00").getTime();
  const t = new Date(todayStr + "T00:00:00").getTime();
  return Math.floor((t - d) / 86400000);
}

/**
 * あすけん + Strong データを取得し、DB に upsert する
 * @param options.from 開始日 (YYYY-MM-DD)。省略時は前日〜当日の2日分
 * @param options.to 終了日 (YYYY-MM-DD)。省略時は today
 * @param options.skipExistingPastDays この日数より前の日付は、既にあすけんデータがあれば取得をスキップ（過去分cron用）
 */
export async function syncData(options?: { from?: string; to?: string; skipExistingPastDays?: number }): Promise<{
  askenCount: number;
  strongCount: number;
  dayCount: number;
  errors: string[];
}> {
  const errors: string[] = [];
  const targetDates = getTargetDates(options?.from, options?.to);
  const dateRange = new Set(targetDates);
  const todayStr = getEffectiveTodayStr();
  const skipThreshold = options?.skipExistingPastDays ?? 0;

  const upsertAskenDay = async (date: string, data: NutritionDayResult) => {
    const payload = {
      askenItems: data.items as unknown as Prisma.InputJsonValue,
      askenNutrients: data.nutrients as unknown as Prisma.InputJsonValue,
      steps: data.exercise?.steps ?? null,
      exerciseCalories: data.exercise?.calories ?? null,
    };
    await prisma.dailyData.upsert({
      where: { date },
      update: payload,
      create: { date, ...payload },
    });
  };

  let askenCount = 0;
  for (const d of targetDates) {
    if (skipThreshold > 0 && daysAgo(d, todayStr) >= skipThreshold) {
      const existing = await prisma.dailyData.findUnique({
        where: { date: d },
        select: { askenItems: true, askenNutrients: true },
      });
      const hasAsken = existing && (
        (Array.isArray(existing.askenItems) && existing.askenItems.length > 0) ||
        (existing.askenNutrients && typeof existing.askenNutrients === "object" && Object.keys(existing.askenNutrients as object).length > 0)
      );
      if (hasAsken) continue;
    }

    const result = await fetchNutritionForDate(d);
    if (result.ok && result.data) {
      try {
        await upsertAskenDay(d, result.data);
        askenCount += 1;
      } catch (e) {
        errors.push(`DB保存 Asken ${d}: ${String(e)}`);
      }
    } else if (result.ok) {
      const fileData = readNutritionFallbackFile(d);
      if (fileData) {
        try {
          const existing = await prisma.dailyData.findUnique({ where: { date: d }, select: { date: true } });
          if (!existing) {
            await upsertAskenDay(d, fileData);
            askenCount += 1;
          } else {
            errors.push(`Asken ${d}: 取得結果を取得できませんでした（既存データは上書きしません）`);
          }
        } catch (e) {
          errors.push(`DB保存 Asken(file) ${d}: ${String(e)}`);
        }
      }
    } else if (result.error) {
      errors.push(`Asken ${d}: ${result.error}`);
    }
  }

  const { data: strongMap, errors: strongErrors } = await fetchTrainingForDateRange(dateRange);
  errors.push(...strongErrors);

  let strongCount = 0;
  for (const [dateStr, strongData] of strongMap) {
    try {
      await prisma.dailyData.upsert({
        where: { date: dateStr },
        update: {
          strongData: strongData as unknown as Prisma.InputJsonValue,
        },
        create: {
          date: dateStr,
          strongData: strongData as unknown as Prisma.InputJsonValue,
        },
      });
      strongCount += 1;
    } catch (e) {
      errors.push(`DB保存 Strong ${dateStr}: ${String(e)}`);
    }
  }

  for (const d of targetDates) {
    try {
      await prisma.dailyData.upsert({
        where: { date: d },
        create: { date: d },
        update: {},
      });
    } catch (e) {
      errors.push(`DailyData確保 ${d}: ${String(e)}`);
    }
  }

  const dayCount = await prisma.dailyData.count();

  return { askenCount, strongCount, dayCount, errors };
}
