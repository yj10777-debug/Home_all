/**
 * 目標算出ロジック（goalsPurpose.ts）のユニットテスト
 * Mifflin-St Jeor 式による BMR/TDEE 計算と PFC 配分、クランプ処理を検証する。
 */
import { computeGoalsFromPersonal, getPfcRatios, getCaloriePurpose } from "@/lib/goalsPurpose";
import type { Personal } from "@/lib/dbConfig";

function personal(overrides: Partial<Personal> = {}): Personal {
  return {
    heightCm: 172,
    weightKg: 75,
    age: 35,
    sex: "male",
    activityLevel: "medium",
    ...overrides,
  };
}

describe("computeGoalsFromPersonal", () => {
  it("男性・中活動の基本ケース（Mifflin-St Jeor × 1.55）", () => {
    // BMR = 10*75 + 6.25*172 - 5*35 + 5 = 750 + 1075 - 175 + 5 = 1655
    // TDEE = 1655 * 1.55 = 2565.25 → 2565
    const g = computeGoalsFromPersonal(personal());
    expect(g).not.toBeNull();
    expect(g!.calories).toBe(2565);
    // たんぱく質 = 75 * 1.6 = 120g
    expect(g!.protein).toBe(120);
    // 脂質 = 25%カロリー / 9
    expect(g!.fat).toBe(Math.round((2565 * 0.25) / 9));
  });

  it("女性は BMR が -166 差（-161 と +5 の差）", () => {
    const male = computeGoalsFromPersonal(personal({ sex: "male" }))!;
    const female = computeGoalsFromPersonal(personal({ sex: "female" }))!;
    // TDEE差 = 166 * 1.55 = 257.3 → 丸めで±1許容
    expect(male.calories - female.calories).toBeGreaterThanOrEqual(256);
    expect(male.calories - female.calories).toBeLessThanOrEqual(258);
  });

  it("身長・体重が無ければ null", () => {
    expect(computeGoalsFromPersonal(personal({ heightCm: null }))).toBeNull();
    expect(computeGoalsFromPersonal(personal({ weightKg: null }))).toBeNull();
    expect(computeGoalsFromPersonal(personal({ weightKg: 0 }))).toBeNull();
  });

  it("年齢未設定は30歳として計算する", () => {
    const withAge30 = computeGoalsFromPersonal(personal({ age: 30 }))!;
    const withoutAge = computeGoalsFromPersonal(personal({ age: null }))!;
    expect(withoutAge.calories).toBe(withAge30.calories);
  });

  it("不明な活動レベルは 1.375 にフォールバック", () => {
    const low = computeGoalsFromPersonal(personal({ activityLevel: "low" }))!;
    const unknown = computeGoalsFromPersonal(personal({ activityLevel: "unknown" }))!;
    expect(unknown.calories).toBe(low.calories);
  });

  it("カロリーは 1200〜4000、たんぱく質は 50〜250 にクランプされる", () => {
    const tiny = computeGoalsFromPersonal(
      personal({ heightCm: 100, weightKg: 25, age: 90, sex: "female", activityLevel: "very_low" })
    )!;
    expect(tiny.calories).toBe(1200);
    expect(tiny.protein).toBeGreaterThanOrEqual(50);

    const huge = computeGoalsFromPersonal(
      personal({ heightCm: 210, weightKg: 180, age: 18, activityLevel: "high" })
    )!;
    expect(huge.calories).toBe(4000);
    expect(huge.protein).toBe(250); // 180*1.6=288 → 250にクランプ
  });

  it("PFC合計カロリーが目標カロリーとほぼ一致する（丸め誤差の範囲）", () => {
    const g = computeGoalsFromPersonal(personal())!;
    const total = g.protein * 4 + g.fat * 9 + g.carbs * 4;
    expect(Math.abs(total - g.calories)).toBeLessThanOrEqual(12); // 各項の丸めで最大±12kcal
  });
});

describe("getPfcRatios", () => {
  it("比率の合計が約100%になる", () => {
    const r = getPfcRatios({ calories: 2267, protein: 150, fat: 54, carbs: 293 });
    expect(r.p + r.f + r.c).toBeGreaterThanOrEqual(99);
    expect(r.p + r.f + r.c).toBeLessThanOrEqual(101);
  });

  it("ゼロ目標では0を返す（ゼロ除算しない）", () => {
    expect(getPfcRatios({ calories: 0, protein: 0, fat: 0, carbs: 0 })).toEqual({ p: 0, f: 0, c: 0 });
  });
});

describe("getCaloriePurpose", () => {
  it("境界値でラベルが正しく切り替わる", () => {
    expect(getCaloriePurpose(1799)).toBe("減量（やや強め）");
    expect(getCaloriePurpose(1800)).toBe("減量");
    expect(getCaloriePurpose(2100)).toBe("維持");
    expect(getCaloriePurpose(2400)).toBe("維持");
    expect(getCaloriePurpose(2401)).toBe("増量（緩やか）");
    expect(getCaloriePurpose(2701)).toBe("増量");
  });
});
