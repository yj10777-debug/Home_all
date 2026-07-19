/**
 * Basic認証プロキシ（src/proxy.ts、Next.js 16のProxy規約）のユニットテスト
 * BASIC_AUTH_USER / BASIC_AUTH_PASS 未設定時は無効、
 * 設定時はBasic認証または x-cron-secret 一致のみ通過することを検証する。
 */
import { NextRequest } from "next/server";
import { proxy as middleware } from "@/proxy";

function req(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, { headers });
}

function basic(user: string, pass: string): string {
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

const ENV_KEYS = ["BASIC_AUTH_USER", "BASIC_AUTH_PASS", "CRON_SECRET"] as const;
const saved: Record<string, string | undefined> = {};

beforeAll(() => {
  ENV_KEYS.forEach((k) => { saved[k] = process.env[k]; });
});

afterAll(() => {
  ENV_KEYS.forEach((k) => {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  });
});

describe("middleware (Basic認証未設定)", () => {
  beforeEach(() => {
    delete process.env.BASIC_AUTH_USER;
    delete process.env.BASIC_AUTH_PASS;
    delete process.env.CRON_SECRET;
  });

  it("認証なしで素通しする（既存動作を変えない）", () => {
    const res = middleware(req("http://localhost:3000/api/days"));
    expect(res.status).toBe(200);
  });

  it("ユーザーのみ設定（パスワード未設定）でも無効のまま", () => {
    process.env.BASIC_AUTH_USER = "admin";
    const res = middleware(req("http://localhost:3000/"));
    expect(res.status).toBe(200);
  });
});

describe("middleware (Basic認証有効)", () => {
  beforeEach(() => {
    process.env.BASIC_AUTH_USER = "admin";
    process.env.BASIC_AUTH_PASS = "s3cret";
    process.env.CRON_SECRET = "cron-xyz";
  });

  it("認証ヘッダなしは 401 + WWW-Authenticate", () => {
    const res = middleware(req("http://localhost:3000/"));
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toMatch(/^Basic/);
  });

  it("正しいBasic認証で通過する", () => {
    const res = middleware(
      req("http://localhost:3000/api/days", { authorization: basic("admin", "s3cret") })
    );
    expect(res.status).toBe(200);
  });

  it("誤ったパスワード・ユーザーは 401", () => {
    expect(
      middleware(req("http://localhost:3000/", { authorization: basic("admin", "wrong") })).status
    ).toBe(401);
    expect(
      middleware(req("http://localhost:3000/", { authorization: basic("bad", "s3cret") })).status
    ).toBe(401);
  });

  it("壊れたBase64は 401", () => {
    const res = middleware(
      req("http://localhost:3000/", { authorization: "Basic %%%broken%%%" })
    );
    expect(res.status).toBe(401);
  });

  it("x-cron-secret が一致すれば機械アクセスとして通過する", () => {
    const res = middleware(
      req("http://localhost:3000/api/sync/status", { "x-cron-secret": "cron-xyz" })
    );
    expect(res.status).toBe(200);
  });

  it("x-cron-secret 不一致は 401", () => {
    const res = middleware(
      req("http://localhost:3000/api/sync/status", { "x-cron-secret": "wrong" })
    );
    expect(res.status).toBe(401);
  });

  it("パスワードに : を含んでも認証できる", () => {
    process.env.BASIC_AUTH_PASS = "pa:ss:wd";
    const res = middleware(
      req("http://localhost:3000/", { authorization: basic("admin", "pa:ss:wd") })
    );
    expect(res.status).toBe(200);
  });

  it("CRON_SECRET 未設定なら x-cron-secret ヘッダでは通過できない", () => {
    delete process.env.CRON_SECRET;
    const res = middleware(
      req("http://localhost:3000/api/sync/status", { "x-cron-secret": "anything" })
    );
    expect(res.status).toBe(401);
  });
});
