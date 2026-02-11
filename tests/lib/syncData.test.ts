/**
 * Tests for src/lib/syncData.ts
 * child_process, fs, Prisma をモックしてテスト
 */

import path from "path";
import { EventEmitter } from "events";

// ─── モック設定 ──────────────────────────────────────

/** spawn が返すプロセスのモック */
function createMockProcess(exitCode = 0, stdoutData = ""): EventEmitter & { stdout: EventEmitter; stderr: EventEmitter } {
  const proc = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  setTimeout(() => {
    if (stdoutData) proc.stdout.emit("data", Buffer.from(stdoutData));
    proc.emit("close", exitCode);
  }, 5);
  return proc;
}

const mockSpawn = jest.fn();
jest.mock("child_process", () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

const mockUpsert = jest.fn().mockResolvedValue({});
const mockCount = jest.fn().mockResolvedValue(10);

jest.mock("@/lib/prisma", () => ({
  prisma: {
    dailyData: {
      upsert: (...args: unknown[]) => mockUpsert(...args),
      count: () => mockCount(),
    },
  },
}));

jest.mock("fs", () => ({
  existsSync: jest.fn((p: string) => {
    const normalized = p.replace(/\\/g, "/");
    if (normalized.includes("asken-state.json")) return true;
    return false;
  }),
  readFileSync: jest.fn(() => { throw new Error("ENOENT"); }),
  readdirSync: jest.fn(() => []),
  statSync: jest.fn(() => { throw new Error("ENOENT"); }),
  mkdirSync: jest.fn(),
}));

// 環境変数
const ORIGINAL_ENV = process.env;
beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ORIGINAL_ENV, ASKEN_EMAIL: "test@test.com", ASKEN_PASSWORD: "pass" };
});
afterAll(() => { process.env = ORIGINAL_ENV; });

// ─── テスト ──────────────────────────────────────────

describe("syncData", () => {
  it("スクレイピング成功時に DB に upsert する", async () => {
    const sampleData = JSON.stringify({
      date: "2026-02-11",
      items: [{ mealType: "朝食", name: "パン", amount: "1枚", calories: 200 }],
      nutrients: { "朝食": { "エネルギー": "200kcal" } },
    });

    mockSpawn.mockImplementation(() => createMockProcess(0, sampleData));

    jest.resetModules();
    const { syncData } = await import("@/lib/syncData");
    const result = await syncData();

    // 4日分すべてに対して spawn が呼ばれること
    expect(mockSpawn).toHaveBeenCalledTimes(4);
    expect(result.askenCount).toBe(4);
    // DB に upsert が呼ばれること
    expect(mockUpsert).toHaveBeenCalled();
  });

  it("スクレイピング失敗時はエラーが記録される", async () => {
    mockSpawn.mockImplementation(() => {
      const proc = createMockProcess(1);
      setTimeout(() => proc.stderr.emit("data", Buffer.from("scrape failed")), 2);
      return proc;
    });

    jest.resetModules();
    const { syncData } = await import("@/lib/syncData");
    const result = await syncData();

    expect(mockSpawn).toHaveBeenCalledTimes(4);
    expect(result.askenCount).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("Asken");
  });
});
