/**
 * Tests for src/lib/googleFit.ts
 * parseFitResponse: dataset:aggregate のレスポンス JSON → FitDailyMetrics の変換ロジックを検証
 */

import { parseFitResponse, parseSleepSessions } from "@/lib/googleFit";

describe("parseFitResponse", () => {
  it("空レスポンスでも全フィールド undefined のオブジェクトを返す", () => {
    const result = parseFitResponse("2026-05-24", { bucket: [{ dataset: [] }] });
    expect(result.date).toBe("2026-05-24");
    expect(result.steps).toBeUndefined();
    expect(result.totalCalories).toBeUndefined();
    expect(result.avgHeartRate).toBeUndefined();
    expect(result.sleepMinutes).toBeUndefined();
  });

  it("歩数・カロリー・active_minutes・距離の合計を計算する", () => {
    const result = parseFitResponse("2026-05-24", {
      bucket: [
        {
          dataset: [
            // steps (intVal)
            { point: [{ value: [{ intVal: 3000 }] }, { value: [{ intVal: 2500 }] }] },
            // calories (fpVal)
            { point: [{ value: [{ fpVal: 1200.5 }] }, { value: [{ fpVal: 300.5 }] }] },
            // active_minutes (intVal)
            { point: [{ value: [{ intVal: 30 }] }] },
            // distance (fpVal)
            { point: [{ value: [{ fpVal: 1500 }] }, { value: [{ fpVal: 2500 }] }] },
            // heart_rate
            {},
            // weight
            {},
            // sleep
            {},
          ],
        },
      ],
    });
    expect(result.steps).toBe(5500);
    expect(result.totalCalories).toBeCloseTo(1501);
    expect(result.activeMinutes).toBe(30);
    expect(result.distanceMeters).toBe(4000);
  });

  it("心拍数の平均を四捨五入して返す", () => {
    const result = parseFitResponse("2026-05-24", {
      bucket: [
        {
          dataset: [
            {}, {}, {}, {},
            // heart_rate: 60, 80, 100 → avg 80
            { point: [{ value: [{ fpVal: 60 }] }, { value: [{ fpVal: 80 }] }, { value: [{ fpVal: 100 }] }] },
            {},
            {},
          ],
        },
      ],
    });
    expect(result.avgHeartRate).toBe(80);
  });

  it("体重は最新ポイントの値を採用する", () => {
    const result = parseFitResponse("2026-05-24", {
      bucket: [
        {
          dataset: [
            {}, {}, {}, {}, {},
            {
              point: [
                { endTimeNanos: "100", value: [{ fpVal: 70.5 }] },
                { endTimeNanos: "300", value: [{ fpVal: 70.2 }] }, // 最新
                { endTimeNanos: "200", value: [{ fpVal: 70.7 }] },
              ],
            },
            {},
          ],
        },
      ],
    });
    expect(result.weightKg).toBeCloseTo(70.2);
  });

  it("睡眠は awake(=1) を除外して分数を合計する", () => {
    // 1時間=3.6e+12 nanos
    const HOUR_NS = "3600000000000";
    const result = parseFitResponse("2026-05-24", {
      bucket: [
        {
          dataset: [
            {}, {}, {}, {}, {}, {},
            {
              point: [
                // 睡眠タイプ 2 (sleep) を 1時間
                { startTimeNanos: "0", endTimeNanos: HOUR_NS, value: [{ intVal: 2 }] },
                // 睡眠タイプ 4 (light) を 1時間
                { startTimeNanos: HOUR_NS, endTimeNanos: "7200000000000", value: [{ intVal: 4 }] },
                // 睡眠タイプ 1 (awake) は除外
                {
                  startTimeNanos: "7200000000000",
                  endTimeNanos: "10800000000000",
                  value: [{ intVal: 1 }],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(result.sleepMinutes).toBe(120); // 2時間
  });

  it("bucket がない場合も全 undefined になる", () => {
    const result = parseFitResponse("2026-05-24", {});
    expect(result.steps).toBeUndefined();
    expect(result.totalCalories).toBeUndefined();
  });
});

describe("parseSleepSessions", () => {
  // 1時間 = 3,600,000 ms
  const HOUR_MS = 3_600_000;

  it("セッションなしは undefined", () => {
    expect(parseSleepSessions({})).toBeUndefined();
    expect(parseSleepSessions({ session: [] })).toBeUndefined();
  });

  it("activityType=72 の合計分数を計算する", () => {
    const result = parseSleepSessions({
      session: [
        {
          activityType: 72,
          startTimeMillis: "0",
          endTimeMillis: String(7 * HOUR_MS), // 7時間
          application: { packageName: "com.apple.workout" },
        },
      ],
    });
    expect(result).toBe(7 * 60); // 420分
  });

  it("activityType が 72 以外は除外する", () => {
    const result = parseSleepSessions({
      session: [
        { activityType: 7, startTimeMillis: "0", endTimeMillis: String(HOUR_MS) }, // walking
        { activityType: 72, startTimeMillis: String(HOUR_MS), endTimeMillis: String(8 * HOUR_MS), application: { packageName: "com.apple.workout" } },
      ],
    });
    expect(result).toBe(7 * 60);
  });

  it("start/end 不正なセッションは除外する", () => {
    const result = parseSleepSessions({
      session: [
        { activityType: 72, startTimeMillis: "100", endTimeMillis: "50", application: { packageName: "com.apple.workout" } }, // 逆転
        { activityType: 72, application: { packageName: "com.apple.workout" } },                                              // 欠損
        { activityType: 72, startTimeMillis: "0", endTimeMillis: String(6 * HOUR_MS), application: { packageName: "com.apple.workout" } },
      ],
    });
    expect(result).toBe(6 * 60);
  });

  it("実睡眠と在床時間が混在する場合は短い方（実睡眠）を採用する", () => {
    const result = parseSleepSessions({
      session: [
        // Apple純正: 実睡眠 7時間
        { activityType: 72, startTimeMillis: String(HOUR_MS), endTimeMillis: String(8 * HOUR_MS), application: { packageName: "com.apple.workout" } },
        // AutoSleep: 在床時間 11時間
        { activityType: 72, startTimeMillis: "0", endTimeMillis: String(11 * HOUR_MS), application: { packageName: "com.tantsissa.autosleep" } },
      ],
    });
    expect(result).toBe(7 * 60); // 最小（実睡眠）が採用される
  });

  it("同一アプリ内での重複（分割報告）はオーバーラップマージで加算しない", () => {
    const result = parseSleepSessions({
      session: [
        // AutoSleep が同じ範囲を2回報告
        { activityType: 72, startTimeMillis: "0", endTimeMillis: String(11 * HOUR_MS), application: { packageName: "com.tantsissa.autosleep" } },
        { activityType: 72, startTimeMillis: "0", endTimeMillis: String(11 * HOUR_MS), application: { packageName: "com.tantsissa.autosleep" } },
      ],
    });
    expect(result).toBe(11 * 60); // 重複加算しないので 11h のみ
  });

  it("同一アプリの離れた区間（昼寝+夜の睡眠）は両方加算", () => {
    const result = parseSleepSessions({
      session: [
        // 昼寝 12:00 ~ 13:00
        { activityType: 72, startTimeMillis: String(12 * HOUR_MS), endTimeMillis: String(13 * HOUR_MS), application: { packageName: "com.apple.workout" } },
        // 夜の睡眠 23:00 ~ 翌7:00
        { activityType: 72, startTimeMillis: String(23 * HOUR_MS), endTimeMillis: String(31 * HOUR_MS), application: { packageName: "com.apple.workout" } },
      ],
    });
    // 昼寝1h + 夜睡眠8h = 9時間 = 540分
    expect(result).toBe(9 * 60);
  });

  it("アプリ情報が無いセッションも一つのグループとして扱う", () => {
    const result = parseSleepSessions({
      session: [
        { activityType: 72, startTimeMillis: "0", endTimeMillis: String(7 * HOUR_MS) },
        { activityType: 72, startTimeMillis: "0", endTimeMillis: String(8 * HOUR_MS) },
      ],
    });
    expect(result).toBe(8 * 60); // 同じ _unknown グループ内でマージ → 8h
  });
});
