/**
 * Tests for src/lib/googleFit.ts
 * parseFitResponse: dataset:aggregate のレスポンス JSON → FitDailyMetrics の変換ロジックを検証
 */

import { parseFitResponse } from "@/lib/googleFit";

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
