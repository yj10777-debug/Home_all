/**
 * 筋トレ・食事 評価スコアモデル（scoring.ts）のユニットテスト
 */
import { calculateDailyScore } from "@/lib/scoring";
import type { DayData } from "@/lib/gemini";
import { GOAL_CALORIES } from "@/lib/gemini";

function day(overrides: Partial<DayData> = {}): DayData {
  return {
    date: "2026-02-15",
    askenItems: null,
    askenNutrients: null,
    strongData: null,
    steps: null,
    exerciseCalories: null,
    ...overrides,
  };
}

describe("calculateDailyScore", () => {
  describe("① エネルギーバランス（30点）", () => {
    it("摂取が推定消費より300-500少ないとき30点", () => {
      const d = day({
        askenNutrients: { 朝食: { エネルギー: String(GOAL_CALORIES - 400) + "kcal" } },
      });
      const r = calculateDailyScore(d);
      expect(r.details.energy.score).toBe(30);
    });

    it("摂取が推定消費より200以上多いとき5点", () => {
      const d = day({
        askenNutrients: { 朝食: { エネルギー: String(GOAL_CALORIES + 250) + "kcal" } },
      });
      const r = calculateDailyScore(d);
      expect(r.details.energy.score).toBe(5);
    });

    it("±100以内のとき10点", () => {
      const d = day({
        askenNutrients: { 朝食: { エネルギー: String(GOAL_CALORIES - 50) + "kcal" } },
      });
      const r = calculateDailyScore(d);
      expect(r.details.energy.score).toBe(10);
    });
  });

  describe("② たんぱく質（20点）", () => {
    it("2.0g/kg以上のとき20点（体重75kgで150g以上）", () => {
      const d = day({
        askenNutrients: { 朝食: { たんぱく質: "160g" } },
      });
      const r = calculateDailyScore(d, 75);
      expect(r.details.protein.score).toBe(20);
    });

    it("1.4未満のとき5点", () => {
      const d = day({
        askenNutrients: { 朝食: { たんぱく質: "80g" } },
      });
      const r = calculateDailyScore(d, 75);
      expect(r.details.protein.score).toBe(5);
    });
  });

  describe("③ トレーニング刺激（20点）", () => {
    it("筋トレなしの日は休息日として20点", () => {
      const r = calculateDailyScore(day());
      expect(r.details.stimulus.score).toBe(20);
    });

    it("コンパウンド・10セット以上で実施日は加点", () => {
      const d = day({
        strongData: {
          workouts: [{
            title: "A",
            totals: { sets: 12, reps: 10, volumeKg: 1000 },
            exercises: [
              { name: "Squat", sets: 5, volumeKg: 500 },
              { name: "Bench Press", sets: 5, volumeKg: 500 },
            ],
          }],
          totals: { workouts: 1, sets: 12, volumeKg: 1000 },
        },
      });
      const r = calculateDailyScore(d);
      expect(r.details.stimulus.score).toBe(20);
    });
  });

  describe("④ 回復（15点）", () => {
    it("睡眠データなしのときは中間点", () => {
      const r = calculateDailyScore(day());
      expect(r.details.recovery.score).toBe(9);
    });
  });

  describe("⑤ 活動量（10点）", () => {
    it("10000歩以上で10点", () => {
      const r = calculateDailyScore(day({ steps: 12000 }));
      expect(r.details.activity.score).toBe(10);
    });

    it("8000-9999歩で8点", () => {
      const r = calculateDailyScore(day({ steps: 8500 }));
      expect(r.details.activity.score).toBe(8);
    });

    it("4000歩未満で2点", () => {
      const r = calculateDailyScore(day({ steps: 3000 }));
      expect(r.details.activity.score).toBe(2);
    });

    it("歩数データなしは2点", () => {
      const r = calculateDailyScore(day({ steps: null }));
      expect(r.details.activity.score).toBe(2);
    });
  });

  describe("⑥ 栄養バランス（5点）", () => {
    it("脂質20-30%で5点", () => {
      const d = day({
        askenNutrients: {
          朝食: {
            エネルギー: "2000kcal",
            たんぱく質: "100g",
            脂質: "55g",
            炭水化物: "200g",
          },
        },
      });
      const r = calculateDailyScore(d);
      expect(r.details.nutritionBalance.score).toBe(5);
    });
  });

  describe("登山ボーナス", () => {
    it("下半身種目ありで+3", () => {
      const d = day({
        strongData: {
          workouts: [{
            title: "Leg",
            totals: { sets: 10, reps: 10, volumeKg: 500 },
            exercises: [{ name: "Squat", sets: 5, volumeKg: 500 }],
          }],
          totals: { workouts: 1, sets: 10, volumeKg: 500 },
        },
      });
      const r = calculateDailyScore(d);
      expect(r.details.climbingBonus.score).toBe(3);
    });
  });

  describe("総合スコア", () => {
    it("合計は100を超えない", () => {
      const d = day({
        askenNutrients: {
          朝食: {
            エネルギー: String(GOAL_CALORIES - 400),
            たんぱく質: "160g",
            脂質: "60g",
            炭水化物: "200g",
          },
        },
        steps: 15000,
        strongData: {
          workouts: [{
            title: "Full",
            totals: { sets: 15, reps: 10, volumeKg: 2000 },
            exercises: [
              { name: "Squat", sets: 5, volumeKg: 800 },
              { name: "Bench Press", sets: 5, volumeKg: 600 },
            ],
          }],
          totals: { workouts: 1, sets: 15, volumeKg: 2000 },
        },
        exerciseCalories: 150,
      });
      const r = calculateDailyScore(d);
      expect(r.total).toBeLessThanOrEqual(100);
      expect(r.total).toBeGreaterThanOrEqual(0);
    });

    it("データほぼなしでも0以上100以下", () => {
      const r = calculateDailyScore(day());
      expect(r.total).toBeGreaterThanOrEqual(0);
      expect(r.total).toBeLessThanOrEqual(100);
    });

    it("戻り値は ScoreBreakdown の形を満たす", () => {
      const r = calculateDailyScore(day({ steps: 5000 }));
      expect(r).toHaveProperty("total");
      expect(r).toHaveProperty("details");
      expect(r.details).toHaveProperty("energy");
      expect(r.details).toHaveProperty("protein");
      expect(r.details).toHaveProperty("stimulus");
      expect(r.details).toHaveProperty("recovery");
      expect(r.details).toHaveProperty("activity");
      expect(r.details).toHaveProperty("nutritionBalance");
      expect(r.details).toHaveProperty("climbingBonus");
      expect(typeof r.total).toBe("number");
    });
  });
});
