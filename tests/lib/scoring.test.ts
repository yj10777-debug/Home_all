/**
 * 筋トレ・食事 評価スコアモデル（scoring.ts）のユニットテスト
 * 現行配点（30/20/20/15/10/5＋登山ボーナスmax+8）に対応。
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

    it("摂取が推定消費より200以上多いとき9点", () => {
      const d = day({
        askenNutrients: { 朝食: { エネルギー: String(GOAL_CALORIES + 250) + "kcal" } },
      });
      const r = calculateDailyScore(d);
      expect(r.details.energy.score).toBe(9);
    });

    it("±100以内のとき18点", () => {
      const d = day({
        askenNutrients: { 朝食: { エネルギー: String(GOAL_CALORIES - 50) + "kcal" } },
      });
      const r = calculateDailyScore(d);
      expect(r.details.energy.score).toBe(18);
    });
  });

  describe("② たんぱく質（20点）", () => {
    it("2.0g/kg以上のとき20点（体重75kgで150g以上）", () => {
      const d = day({
        askenNutrients: { 朝食: { エネルギー: "2000kcal", たんぱく質: "160g" } },
      });
      const r = calculateDailyScore(d, 75);
      expect(r.details.protein.score).toBe(20);
    });

    it("1.4未満のとき8点", () => {
      const d = day({
        askenNutrients: { 朝食: { エネルギー: "2000kcal", たんぱく質: "80g" } },
      });
      const r = calculateDailyScore(d, 75);
      expect(r.details.protein.score).toBe(8);
    });
  });

  describe("③ トレーニング刺激（20点）", () => {
    it("筋トレなし＋登山なしの日は休息日として20点", () => {
      // 採点対象にするため食事を入れる
      const d = day({
        askenNutrients: { 朝食: { エネルギー: "2000kcal" } },
      });
      const r = calculateDailyScore(d);
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

    it("登山実施日は刺激18点", () => {
      const d = day({ hasHiking: true });
      const r = calculateDailyScore(d);
      expect(r.details.stimulus.score).toBe(18);
    });
  });

  describe("④ 回復（15点・睡眠ベース）", () => {
    it("睡眠データなしは満点扱い15点", () => {
      const d = day({ askenNutrients: { 朝食: { エネルギー: "2000kcal" } } });
      const r = calculateDailyScore(d);
      expect(r.details.recovery.score).toBe(15);
    });

    it("7時間以上は15点", () => {
      const d = day({
        askenNutrients: { 朝食: { エネルギー: "2000kcal" } },
        sleepMinutes: 7 * 60 + 30, // 7h30m
      });
      const r = calculateDailyScore(d);
      expect(r.details.recovery.score).toBe(15);
    });

    it("6.5h以上7h未満は13点", () => {
      const d = day({
        askenNutrients: { 朝食: { エネルギー: "2000kcal" } },
        sleepMinutes: 6 * 60 + 45, // 6h45m
      });
      const r = calculateDailyScore(d);
      expect(r.details.recovery.score).toBe(13);
    });

    it("6.0h以上6.5h未満は11点", () => {
      const d = day({
        askenNutrients: { 朝食: { エネルギー: "2000kcal" } },
        sleepMinutes: 6 * 60 + 15, // 6h15m
      });
      const r = calculateDailyScore(d);
      expect(r.details.recovery.score).toBe(11);
    });

    it("5.5h以上6.0h未満は8点", () => {
      const d = day({
        askenNutrients: { 朝食: { エネルギー: "2000kcal" } },
        sleepMinutes: 5 * 60 + 45, // 5h45m
      });
      const r = calculateDailyScore(d);
      expect(r.details.recovery.score).toBe(8);
    });

    it("5.5h未満は5点", () => {
      const d = day({
        askenNutrients: { 朝食: { エネルギー: "2000kcal" } },
        sleepMinutes: 4 * 60 + 30, // 4h30m
      });
      const r = calculateDailyScore(d);
      expect(r.details.recovery.score).toBe(5);
    });
  });

  describe("⑤ 活動量（10点）", () => {
    it("10000歩以上で10点", () => {
      const r = calculateDailyScore(day({ steps: 12000, askenNutrients: { 朝食: { エネルギー: "2000kcal" } } }));
      expect(r.details.activity.score).toBe(10);
    });

    it("8000-9999歩で8点", () => {
      const r = calculateDailyScore(day({ steps: 8500, askenNutrients: { 朝食: { エネルギー: "2000kcal" } } }));
      expect(r.details.activity.score).toBe(8);
    });

    it("4000歩未満で3点", () => {
      const r = calculateDailyScore(day({ steps: 3000, askenNutrients: { 朝食: { エネルギー: "2000kcal" } } }));
      expect(r.details.activity.score).toBe(3);
    });

    it("歩数データなしは3点", () => {
      const r = calculateDailyScore(day({ steps: null, askenNutrients: { 朝食: { エネルギー: "2000kcal" } } }));
      expect(r.details.activity.score).toBe(3);
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

    it("登山実施で+5、運動消費200kcal以上で+2", () => {
      const d = day({ hasHiking: true, exerciseCalories: 250 });
      const r = calculateDailyScore(d);
      expect(r.details.climbingBonus.score).toBe(7);
    });
  });

  describe("記録なし日", () => {
    it("食事・筋トレ・登山すべてないと total=0", () => {
      const r = calculateDailyScore(day());
      expect(r.total).toBe(0);
      expect(r.details.energy.label).toBe("記録なし");
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
        sleepMinutes: 480, // 8h
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
        exerciseCalories: 250,
        hasHiking: true,
      });
      const r = calculateDailyScore(d);
      expect(r.total).toBeLessThanOrEqual(100);
      expect(r.total).toBeGreaterThanOrEqual(0);
    });

    it("戻り値は ScoreBreakdown の形を満たす", () => {
      const r = calculateDailyScore(day({ steps: 5000, askenNutrients: { 朝食: { エネルギー: "2000kcal" } } }));
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
