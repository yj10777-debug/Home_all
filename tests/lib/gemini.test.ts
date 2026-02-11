/**
 * Tests for src/lib/gemini.ts
 * Prisma をモックしてプロンプト生成ロジックをテストする
 */

// ─── Prisma モック ──────────────────────────────────

const mockFindUnique = jest.fn();
const mockFindMany = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    dailyData: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── generateDailyPrompt テスト ─────────────────────

describe("generateDailyPrompt", () => {
  it("データが存在しない日付の場合エラーをスローする", async () => {
    mockFindUnique.mockResolvedValueOnce(null);

    const { generateDailyPrompt } = await import("@/lib/gemini");
    await expect(generateDailyPrompt("2099-01-01")).rejects.toThrow(
      "データが見つかりません"
    );
  });

  it("食事データからプロンプトを正しく生成する", async () => {
    mockFindUnique.mockResolvedValueOnce({
      date: "2026-02-11",
      askenItems: [{ mealType: "朝食", name: "パン", amount: "2枚", calories: 300 }],
      askenNutrients: {
        "朝食": { "エネルギー": "300kcal", "たんぱく質": "10g", "脂質": "5g", "炭水化物": "50g" },
      },
      strongData: null,
    });

    const { generateDailyPrompt } = await import("@/lib/gemini");
    const prompt = await generateDailyPrompt("2026-02-11");

    expect(prompt).toContain("2026-02-11");
    expect(prompt).toContain("300 kcal");
    expect(prompt).toContain("パン");
    expect(prompt).toContain("たんぱく質: 10g");
    expect(prompt).toContain("筋トレなしの日の栄養戦略");
  });

  it("筋トレデータがある場合はプロンプトに含まれる", async () => {
    mockFindUnique.mockResolvedValueOnce({
      date: "2026-02-11",
      askenItems: [{ mealType: "昼食", name: "プロテイン", amount: "1杯", calories: 150 }],
      askenNutrients: { "昼食": { "エネルギー": "150kcal", "たんぱく質": "30g", "脂質": "1g", "炭水化物": "5g" } },
      strongData: {
        workouts: [{
          title: "胸トレ",
          totals: { sets: 10, reps: 80, volumeKg: 2000 },
          exercises: [{ name: "Bench Press", sets: 5, volumeKg: 1000 }],
        }],
        totals: { workouts: 1, sets: 10, volumeKg: 2000 },
      },
    });

    const { generateDailyPrompt } = await import("@/lib/gemini");
    const prompt = await generateDailyPrompt("2026-02-11");

    expect(prompt).toContain("Bench Press");
    expect(prompt).toContain("胸トレ");
    expect(prompt).toContain("筋トレ内容を踏まえた栄養面のアドバイス");
  });

  it("PFC の残り量が正しく計算される", async () => {
    mockFindUnique.mockResolvedValueOnce({
      date: "2026-02-11",
      askenItems: [],
      askenNutrients: {
        "朝食": { "エネルギー": "500kcal", "たんぱく質": "40g", "脂質": "20g", "炭水化物": "60g" },
        "昼食": { "エネルギー": "700kcal", "たんぱく質": "50g", "脂質": "15g", "炭水化物": "100g" },
      },
      strongData: null,
    });

    const { generateDailyPrompt } = await import("@/lib/gemini");
    const prompt = await generateDailyPrompt("2026-02-11");

    expect(prompt).toContain("たんぱく質: 90g");
    expect(prompt).toContain("目標まであと 60g");
    expect(prompt).toContain("脂質: 35g");
    expect(prompt).toContain("残り 1067 kcal");
  });

  it("間食のカロリーが nutrients にない場合 items から補完される", async () => {
    mockFindUnique.mockResolvedValueOnce({
      date: "2026-02-11",
      askenItems: [
        { mealType: "朝食", name: "パン", amount: "1枚", calories: 200 },
        { mealType: "間食", name: "クッキー", amount: "3本", calories: 117 },
        { mealType: "間食", name: "アイス", amount: "1個", calories: 269 },
      ],
      askenNutrients: {
        "朝食": { "エネルギー": "500kcal", "たんぱく質": "10g", "脂質": "5g", "炭水化物": "80g" },
      },
      strongData: null,
    });

    const { generateDailyPrompt } = await import("@/lib/gemini");
    const prompt = await generateDailyPrompt("2026-02-11");

    expect(prompt).toContain("合計カロリー: 886 kcal");
    expect(prompt).toContain("間食 386 kcal を含む");
    expect(prompt).toContain("残り 1381 kcal");
    expect(prompt).toContain("クッキー");
    expect(prompt).toContain("アイス");
  });
});

// ─── generateWeeklyPrompt テスト ────────────────────

describe("generateWeeklyPrompt", () => {
  it("7日分のデータを集約してプロンプトを生成する", async () => {
    const records = [];
    for (let i = 1; i <= 7; i++) {
      records.push({
        date: `2026-02-0${i}`,
        askenItems: [{ mealType: "昼食", name: "テスト食", amount: "1人前", calories: 500 }],
        askenNutrients: {
          "昼食": { "エネルギー": "500kcal", "たんぱく質": "30g", "脂質": "10g", "炭水化物": "60g" },
        },
        strongData: i % 2 === 0 ? {
          workouts: [{ title: "テストワークアウト", totals: { sets: 5, reps: 50, volumeKg: 1000 }, exercises: [] }],
          totals: { workouts: 1, sets: 5, volumeKg: 1000 },
        } : null,
      });
    }
    mockFindMany.mockResolvedValueOnce(records);

    const { generateWeeklyPrompt } = await import("@/lib/gemini");
    const prompt = await generateWeeklyPrompt("2026-02-01");

    expect(prompt).toContain("2026-02-01");
    expect(prompt).toContain("2026-02-07");
    expect(prompt).toContain("平均カロリー: 500 kcal/日");
    expect(prompt).toContain("筋トレ日数: 3日");
    expect(prompt).toContain("合計ボリューム: 3000kg");
  });

  it("データがない日は「データなし」と表示される", async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        date: "2026-02-01",
        askenItems: [],
        askenNutrients: { "朝食": { "エネルギー": "200kcal" } },
        strongData: null,
      },
    ]);

    const { generateWeeklyPrompt } = await import("@/lib/gemini");
    const prompt = await generateWeeklyPrompt("2026-02-01");

    expect(prompt).toContain("データなし");
    const datalessCount = (prompt.match(/データなし/g) || []).length;
    expect(datalessCount).toBe(6);
  });
});

// ─── getGemSystemPrompt テスト ──────────────────────

describe("getGemSystemPrompt", () => {
  it("システムプロンプトを返す", async () => {
    const { getGemSystemPrompt } = await import("@/lib/gemini");
    const prompt = getGemSystemPrompt();

    expect(prompt).toContain("パーソナルトレーナー");
    expect(prompt).toContain("2267");
    expect(prompt).toContain("P150g");
    expect(prompt).toContain("日本語");
  });
});
