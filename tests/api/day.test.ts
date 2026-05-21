/**
 * GET /api/day/[date] のテスト
 * 該当行がない場合は 200 でゼロを返すことを確認
 */

import type { NextApiRequest, NextApiResponse } from "next";

const mockFindUnique = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    dailyData: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

function createRes(): NextApiResponse & { _status?: number; _json?: unknown; _headers?: Record<string, string> } {
  const res = {
    _status: undefined as number | undefined,
    _json: undefined as unknown,
    _headers: {} as Record<string, string>,
    status(code: number) {
      (this as typeof res)._status = code;
      return this;
    },
    setHeader(name: string, value: string) {
      (this as typeof res)._headers![name] = value;
      return this;
    },
    json(body: unknown) {
      (this as typeof res)._json = body;
      return this;
    },
    end() {
      return this;
    },
  };
  return res as NextApiResponse & { _status?: number; _json?: unknown; _headers?: Record<string, string> };
}

describe("GET /api/day/[date]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("該当行がない場合は 200 で calories:0, pfc:0 を返す", async () => {
    mockFindUnique.mockResolvedValue(null);

    const handler = (await import("@/pages/api/day/[date]")).default;
    const req = { method: "GET", query: { date: "2026-02-24" } } as unknown as NextApiRequest;
    const res = createRes();

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json).toEqual({
      date: "2026-02-24",
      calories: 0,
      pfc: { protein: 0, fat: 0, carbs: 0 },
      steps: null,
      exerciseCalories: null,
    });
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { date: "2026-02-24" } });
  });

  it("該当行がある場合は 200 でデータを返す", async () => {
    mockFindUnique.mockResolvedValue({
      date: "2026-02-24",
      askenNutrients: { 朝食: { エネルギー: "500kcal", たんぱく質: "20g", 脂質: "15g", 炭水化物: "60g" } },
      askenItems: null,
      strongData: null,
      steps: 8000,
      exerciseCalories: 100,
    });

    const handler = (await import("@/pages/api/day/[date]")).default;
    const req = { method: "GET", query: { date: "2026-02-24" } } as unknown as NextApiRequest;
    const res = createRes();

    await handler(req, res);

    expect(res._status).toBe(200);
    const body = res._json as Record<string, unknown>;
    expect(body.date).toBe("2026-02-24");
    expect(body.calories).toBe(500);
    expect((body.pfc as Record<string, number>).protein).toBe(20);
    expect(body.steps).toBe(8000);
    expect(body.exerciseCalories).toBe(100);
  });

  it("日付が不正な場合は 400 を返す", async () => {
    const handler = (await import("@/pages/api/day/[date]")).default;
    const req = { method: "GET", query: { date: "invalid" } } as unknown as NextApiRequest;
    const res = createRes();

    await handler(req, res);

    expect(res._status).toBe(400);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });
});
