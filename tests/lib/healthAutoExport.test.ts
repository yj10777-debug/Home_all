/**
 * Health Auto Export パーステスト
 */
import { parseHealthAutoExport } from "@/lib/healthAutoExport";

describe("parseHealthAutoExport", () => {
  it("空入力で空Mapを返す", () => {
    expect(parseHealthAutoExport({}).size).toBe(0);
    expect(parseHealthAutoExport({ data: {} }).size).toBe(0);
    expect(parseHealthAutoExport({ data: { metrics: [] } }).size).toBe(0);
  });

  it("step_count を日付別に集計する", () => {
    const result = parseHealthAutoExport({
      data: {
        metrics: [
          {
            name: "step_count",
            units: "count",
            data: [
              { date: "2026-05-24 00:00:00 +0900", qty: 8000 },
              { date: "2026-05-25 00:00:00 +0900", qty: 12500 },
            ],
          },
        ],
      },
    });
    expect(result.get("2026-05-24")?.steps).toBe(8000);
    expect(result.get("2026-05-25")?.steps).toBe(12500);
  });

  it("active_energy + basal_energy_burned を合算して totalCalories を作る", () => {
    const result = parseHealthAutoExport({
      data: {
        metrics: [
          {
            name: "active_energy",
            units: "kcal",
            data: [{ date: "2026-05-24 00:00:00 +0900", qty: 500 }],
          },
          {
            name: "basal_energy_burned",
            units: "kcal",
            data: [{ date: "2026-05-24 00:00:00 +0900", qty: 1700 }],
          },
        ],
      },
    });
    const day = result.get("2026-05-24");
    expect(day?.activeCalories).toBe(500);
    expect(day?.totalCalories).toBe(2200);
  });

  it("active_energy のみのときは total = active で代用", () => {
    const result = parseHealthAutoExport({
      data: {
        metrics: [
          {
            name: "active_energy",
            units: "kcal",
            data: [{ date: "2026-05-24 00:00:00 +0900", qty: 500 }],
          },
        ],
      },
    });
    const day = result.get("2026-05-24");
    expect(day?.activeCalories).toBe(500);
    expect(day?.totalCalories).toBe(500);
  });

  it("heart_rate は Avg を優先採用する", () => {
    const result = parseHealthAutoExport({
      data: {
        metrics: [
          {
            name: "heart_rate",
            units: "bpm",
            data: [{ date: "2026-05-24 00:00:00 +0900", Min: 50, Avg: 68, Max: 140 }],
          },
        ],
      },
    });
    expect(result.get("2026-05-24")?.avgHeartRate).toBe(68);
  });

  it("resting_heart_rate を取得する", () => {
    const result = parseHealthAutoExport({
      data: {
        metrics: [
          {
            name: "resting_heart_rate",
            units: "bpm",
            data: [{ date: "2026-05-24 00:00:00 +0900", qty: 56 }],
          },
        ],
      },
    });
    expect(result.get("2026-05-24")?.restingHeartRate).toBe(56);
  });

  it("weight_body_mass は kg/lb をkgに正規化", () => {
    const kg = parseHealthAutoExport({
      data: {
        metrics: [
          {
            name: "weight_body_mass",
            units: "kg",
            data: [{ date: "2026-05-24 00:00:00 +0900", qty: 70.5 }],
          },
        ],
      },
    });
    expect(kg.get("2026-05-24")?.weightKg).toBeCloseTo(70.5);

    const lb = parseHealthAutoExport({
      data: {
        metrics: [
          {
            name: "weight_body_mass",
            units: "lb",
            data: [{ date: "2026-05-24 00:00:00 +0900", qty: 155 }],
          },
        ],
      },
    });
    expect(lb.get("2026-05-24")?.weightKg).toBeCloseTo(155 * 0.45359237, 2);
  });

  it("距離はマイル/メートルを正しく変換", () => {
    const m = parseHealthAutoExport({
      data: {
        metrics: [
          {
            name: "walking_running_distance",
            units: "m",
            data: [{ date: "2026-05-24 00:00:00 +0900", qty: 5000 }],
          },
        ],
      },
    });
    expect(m.get("2026-05-24")?.distanceMeters).toBe(5000);

    const km = parseHealthAutoExport({
      data: {
        metrics: [
          {
            name: "walking_running_distance",
            units: "km",
            data: [{ date: "2026-05-24 00:00:00 +0900", qty: 5 }],
          },
        ],
      },
    });
    expect(km.get("2026-05-24")?.distanceMeters).toBe(5000);

    const mi = parseHealthAutoExport({
      data: {
        metrics: [
          {
            name: "walking_running_distance",
            units: "mi",
            data: [{ date: "2026-05-24 00:00:00 +0900", qty: 1 }],
          },
        ],
      },
    });
    expect(mi.get("2026-05-24")?.distanceMeters).toBeCloseTo(1609.344);
  });

  it("apple_exercise_time を活動時間として取得", () => {
    const result = parseHealthAutoExport({
      data: {
        metrics: [
          {
            name: "apple_exercise_time",
            units: "min",
            data: [{ date: "2026-05-24 00:00:00 +0900", qty: 60 }],
          },
        ],
      },
    });
    expect(result.get("2026-05-24")?.activeMinutes).toBe(60);
  });

  it("sleep_analysis を起床日に紐付けて分数集計", () => {
    const result = parseHealthAutoExport({
      data: {
        metrics: [
          {
            name: "sleep_analysis",
            data: [
              {
                sleepStart: "2026-05-23T23:00:00+09:00",
                sleepEnd: "2026-05-24T07:00:00+09:00", // 8時間
              },
            ],
          },
        ],
      },
    });
    expect(result.get("2026-05-24")?.sleepMinutes).toBe(8 * 60);
  });

  it("複数指標が同じ日に集約される", () => {
    const result = parseHealthAutoExport({
      data: {
        metrics: [
          { name: "step_count", data: [{ date: "2026-05-24 00:00:00 +0900", qty: 8000 }] },
          { name: "active_energy", data: [{ date: "2026-05-24 00:00:00 +0900", qty: 500 }] },
          { name: "heart_rate", data: [{ date: "2026-05-24 00:00:00 +0900", Avg: 70 }] },
          { name: "resting_heart_rate", data: [{ date: "2026-05-24 00:00:00 +0900", qty: 56 }] },
        ],
      },
    });
    const day = result.get("2026-05-24");
    expect(day?.steps).toBe(8000);
    expect(day?.activeCalories).toBe(500);
    expect(day?.avgHeartRate).toBe(70);
    expect(day?.restingHeartRate).toBe(56);
  });
});
