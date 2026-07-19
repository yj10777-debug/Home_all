/**
 * 日付ユーティリティ（dateUtils.ts）のユニットテスト
 * 「朝5時までは前日扱い」のJST境界と、サーバーTZ非依存のフォーマットを検証する。
 * すべて固定時刻（UTCエポック）を渡すため、実行環境のTZに関係なく同じ結果になる。
 */
import { getEffectiveToday, getEffectiveTodayStr, formatDateJst } from "@/lib/dateUtils";

/** JSTの年月日時分からUTCのDateを作る補助 */
function jst(y: number, mo: number, d: number, h: number, mi = 0): Date {
  return new Date(Date.UTC(y, mo - 1, d, h - 9, mi));
}

describe("formatDateJst", () => {
  it("UTC深夜（JST朝）はJSTの日付でフォーマットされる", () => {
    // UTC 2026-07-18 22:00 = JST 2026-07-19 07:00
    expect(formatDateJst(new Date(Date.UTC(2026, 6, 18, 22, 0)))).toBe("2026-07-19");
  });

  it("JST日中はそのままの日付", () => {
    expect(formatDateJst(jst(2026, 7, 19, 12))).toBe("2026-07-19");
  });

  it("月またぎ・年またぎも正しい", () => {
    expect(formatDateJst(jst(2026, 8, 1, 0, 30))).toBe("2026-08-01");
    expect(formatDateJst(jst(2027, 1, 1, 3))).toBe("2027-01-01");
  });
});

describe("getEffectiveTodayStr（朝5時境界）", () => {
  it("JST 04:59 は前日扱い", () => {
    expect(getEffectiveTodayStr(jst(2026, 7, 19, 4, 59))).toBe("2026-07-18");
  });

  it("JST 05:00 は当日扱い", () => {
    expect(getEffectiveTodayStr(jst(2026, 7, 19, 5, 0))).toBe("2026-07-19");
  });

  it("JST 23:30 は当日扱い", () => {
    expect(getEffectiveTodayStr(jst(2026, 7, 19, 23, 30))).toBe("2026-07-19");
  });

  it("月初のJST早朝は前月末になる", () => {
    expect(getEffectiveTodayStr(jst(2026, 8, 1, 2, 0))).toBe("2026-07-31");
  });

  it("元日のJST早朝は前年大晦日になる", () => {
    expect(getEffectiveTodayStr(jst(2027, 1, 1, 3, 0))).toBe("2026-12-31");
  });
});

describe("getEffectiveToday", () => {
  it("5時前は24時間前のDateを返す", () => {
    const now = jst(2026, 7, 19, 3, 0);
    const effective = getEffectiveToday(now);
    expect(now.getTime() - effective.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("5時以降は同じ時刻のDateを返す", () => {
    const now = jst(2026, 7, 19, 9, 0);
    expect(getEffectiveToday(now).getTime()).toBe(now.getTime());
  });
});
