/**
 * Tests for /api/ai/daily, /api/ai/weekly, /api/ai/gem-prompt endpoints
 * gemini モジュールをモックしてエンドポイントのロジックをテストする
 */

import type { NextApiRequest, NextApiResponse } from "next";

// ─── gemini モック ──────────────────────────────────

const mockGenerateDailyPrompt = jest.fn();
const mockGenerateWeeklyPrompt = jest.fn();
const mockGetGemSystemPrompt = jest.fn();

jest.mock("@/lib/gemini", () => ({
  generateDailyPrompt: (...args: unknown[]) => mockGenerateDailyPrompt(...args),
  generateWeeklyPrompt: (...args: unknown[]) => mockGenerateWeeklyPrompt(...args),
  getGemSystemPrompt: (...args: unknown[]) => mockGetGemSystemPrompt(...args),
}));

// ─── ヘルパー ──────────────────────────────────────

function mockRes(): NextApiResponse & { _status?: number; _body?: unknown; _ended?: boolean } {
  const res = {
    _status: undefined as number | undefined,
    _body: undefined as unknown,
    _ended: false,
    status(code: number) {
      (this as typeof res)._status = code;
      return this;
    },
    json(body: unknown) {
      (this as typeof res)._body = body;
      (this as typeof res)._ended = true;
      return this;
    },
    end() {
      (this as typeof res)._ended = true;
      return this;
    },
    setHeader: jest.fn().mockReturnThis(),
  } as unknown as NextApiResponse & { _status?: number; _body?: unknown; _ended?: boolean };
  return res;
}

function mockReq(overrides: Partial<NextApiRequest> = {}): NextApiRequest {
  return {
    method: "GET",
    headers: {},
    query: {},
    body: undefined,
    ...overrides,
  } as NextApiRequest;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── /api/ai/daily テスト ──────────────────────────

describe("GET /api/ai/daily", () => {
  it("プロンプトを生成して 200 で返す", async () => {
    mockGenerateDailyPrompt.mockResolvedValueOnce("テストプロンプト");

    const handler = (await import("@/pages/api/ai/daily")).default;
    const req = mockReq({ method: "GET", query: { date: "2026-02-11" } });
    const res = mockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect((res._body as { date: string; prompt: string }).date).toBe("2026-02-11");
    expect((res._body as { date: string; prompt: string }).prompt).toBe("テストプロンプト");
    expect(mockGenerateDailyPrompt).toHaveBeenCalledWith("2026-02-11");
  });

  it("不正な日付形式で 400 を返す", async () => {
    const handler = (await import("@/pages/api/ai/daily")).default;
    const req = mockReq({ method: "GET", query: { date: "invalid" } });
    const res = mockRes();
    await handler(req, res);

    expect(res._status).toBe(400);
    expect((res._body as { error: string }).error).toContain("日付の形式が不正");
  });

  it("データが見つからない場合 404 を返す", async () => {
    mockGenerateDailyPrompt.mockRejectedValueOnce(
      new Error("2099-01-01 のデータが見つかりません。先にデータを同期してください。")
    );

    const handler = (await import("@/pages/api/ai/daily")).default;
    const req = mockReq({ method: "GET", query: { date: "2099-01-01" } });
    const res = mockRes();
    await handler(req, res);

    expect(res._status).toBe(404);
    expect((res._body as { error: string }).error).toContain("データが見つかりません");
  });

  it("POST で 405 を返す", async () => {
    const handler = (await import("@/pages/api/ai/daily")).default;
    const req = mockReq({ method: "POST" });
    const res = mockRes();
    await handler(req, res);

    expect(res._status).toBe(405);
  });
});

// ─── /api/ai/weekly テスト ─────────────────────────

describe("GET /api/ai/weekly", () => {
  it("プロンプトを生成して 200 で返す", async () => {
    mockGenerateWeeklyPrompt.mockResolvedValueOnce("週次テストプロンプト");

    const handler = (await import("@/pages/api/ai/weekly")).default;
    const req = mockReq({ method: "GET", query: { weekStart: "2026-02-01" } });
    const res = mockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    const body = res._body as { weekStart: string; weekEnd: string; prompt: string };
    expect(body.weekStart).toBe("2026-02-01");
    expect(body.weekEnd).toBe("2026-02-07");
    expect(body.prompt).toBe("週次テストプロンプト");
    expect(mockGenerateWeeklyPrompt).toHaveBeenCalledWith("2026-02-01");
  });

  it("不正な日付形式で 400 を返す", async () => {
    const handler = (await import("@/pages/api/ai/weekly")).default;
    const req = mockReq({ method: "GET", query: { weekStart: "bad" } });
    const res = mockRes();
    await handler(req, res);

    expect(res._status).toBe(400);
  });

  it("POST で 405 を返す", async () => {
    const handler = (await import("@/pages/api/ai/weekly")).default;
    const req = mockReq({ method: "POST" });
    const res = mockRes();
    await handler(req, res);

    expect(res._status).toBe(405);
  });
});

// ─── /api/ai/gem-prompt テスト ─────────────────────

describe("GET /api/ai/gem-prompt", () => {
  it("システムプロンプトを 200 で返す", async () => {
    mockGetGemSystemPrompt.mockReturnValueOnce("テストシステムプロンプト");

    const handler = (await import("@/pages/api/ai/gem-prompt")).default;
    const req = mockReq({ method: "GET" });
    const res = mockRes();
    handler(req, res);

    expect(res._status).toBe(200);
    expect((res._body as { systemPrompt: string }).systemPrompt).toBe("テストシステムプロンプト");
  });

  it("DELETE で 405 を返す", async () => {
    const handler = (await import("@/pages/api/ai/gem-prompt")).default;
    const req = mockReq({ method: "DELETE" });
    const res = mockRes();
    handler(req, res);

    expect(res._status).toBe(405);
  });
});
