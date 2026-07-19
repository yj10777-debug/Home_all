/**
 * あすけんCookie変換ロジック（askenCookies.ts）のユニットテスト
 * Cookie-Editor JSON / storageState / 生ヘッダ / cURL の各入力形式と
 * 正規化・バリデーションを検証する。
 */
import {
  toPlaywrightCookie,
  normalizeSameSite,
  extractCookieString,
  parseCookieHeader,
  parseCookiesFromText,
  normalizeStorageStateInput,
  checkAuthCookies,
  CookieParseError,
} from "@/lib/askenCookies";

describe("normalizeSameSite", () => {
  it("strict/no_restriction/none を Playwright 形式へ正規化する", () => {
    expect(normalizeSameSite("strict")).toBe("Strict");
    expect(normalizeSameSite("no_restriction")).toBe("None");
    expect(normalizeSameSite("none")).toBe("None");
  });

  it("lax・不明値・null は Lax に寄せる", () => {
    expect(normalizeSameSite("lax")).toBe("Lax");
    expect(normalizeSameSite("unspecified")).toBe("Lax");
    expect(normalizeSameSite(null)).toBe("Lax");
    expect(normalizeSameSite(undefined)).toBe("Lax");
  });
});

describe("toPlaywrightCookie", () => {
  it("Cookie-Editor 形式の要素を変換する", () => {
    const c = toPlaywrightCookie({
      name: "PSID_0",
      value: "abc",
      domain: ".asken.jp",
      path: "/",
      expirationDate: 1780000000.5,
      httpOnly: true,
      secure: true,
      sameSite: "no_restriction",
    });
    expect(c).toEqual({
      name: "PSID_0",
      value: "abc",
      domain: ".asken.jp",
      path: "/",
      expires: 1780000000,
      httpOnly: true,
      secure: true,
      sameSite: "None",
    });
  });

  it("hostOnly=false でドメイン先頭にドットを付ける", () => {
    const c = toPlaywrightCookie({ name: "a", value: "b", domain: "asken.jp", hostOnly: false });
    expect(c?.domain).toBe(".asken.jp");
  });

  it("name/value が文字列でない・domainが無い場合は null", () => {
    expect(toPlaywrightCookie(null)).toBeNull();
    expect(toPlaywrightCookie({})).toBeNull();
    expect(toPlaywrightCookie({ name: "a", value: 1 })).toBeNull();
    expect(toPlaywrightCookie({ name: "a", value: "b" })).toBeNull();
  });

  it("expires 未指定はセッションCookie (-1) 扱い、path 未指定は /", () => {
    const c = toPlaywrightCookie({ name: "a", value: "b", domain: ".asken.jp" });
    expect(c?.expires).toBe(-1);
    expect(c?.path).toBe("/");
  });
});

describe("extractCookieString", () => {
  it("生ヘッダ形式から値部分を抽出する", () => {
    expect(extractCookieString("Cookie: a=b; c=d").trim()).toBe("a=b; c=d");
  });

  it("cURL の -H 'cookie: ...' から抽出する", () => {
    expect(extractCookieString("curl -H 'cookie: a=b; c=d' https://x").trim()).toBe("a=b; c=d");
  });

  it("cURL の -b '...' から抽出する", () => {
    expect(extractCookieString("curl -b 'a=b; c=d' https://x").trim()).toBe("a=b; c=d");
  });

  it("該当しなければ元テキストを返す", () => {
    expect(extractCookieString("a=b; c=d")).toBe("a=b; c=d");
  });
});

describe("parseCookieHeader", () => {
  it("名前=値の組を asken.jp ドメインのCookieに変換する", () => {
    const cookies = parseCookieHeader("PSID_0=xxx; ASKEN_PORTAL_AUTO=yyy");
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toMatchObject({ name: "PSID_0", value: "xxx", domain: ".asken.jp", expires: -1 });
  });

  it("空要素・=を含まない要素は無視する", () => {
    expect(parseCookieHeader("a=b;; ;novalue")).toHaveLength(1);
  });
});

describe("parseCookiesFromText", () => {
  it("Cookie-Editor のJSON配列を受け付け asken.jp のみ残す", () => {
    const json = JSON.stringify([
      { name: "PSID_0", value: "x", domain: ".asken.jp" },
      { name: "other", value: "y", domain: ".example.com" },
    ]);
    const cookies = parseCookiesFromText(json);
    expect(cookies).toHaveLength(1);
    expect(cookies[0].name).toBe("PSID_0");
  });

  it("{ cookies: [...] } 形式（storageState）も受け付ける", () => {
    const json = JSON.stringify({ cookies: [{ name: "a", value: "b", domain: "www.asken.jp" }] });
    expect(parseCookiesFromText(json)).toHaveLength(1);
  });

  it("生Cookieヘッダにフォールバックする", () => {
    expect(parseCookiesFromText("PSID_0=x; A=b")).toHaveLength(2);
  });

  it("空入力・asken.jp のCookieゼロは CookieParseError", () => {
    expect(() => parseCookiesFromText("")).toThrow(CookieParseError);
    expect(() =>
      parseCookiesFromText(JSON.stringify([{ name: "a", value: "b", domain: ".example.com" }]))
    ).toThrow(CookieParseError);
    expect(() => parseCookiesFromText(JSON.stringify({ cookies: [] }))).toThrow(CookieParseError);
  });
});

describe("normalizeStorageStateInput", () => {
  it("asken.jp のCookieのみ残した StorageState を返す", () => {
    const state = normalizeStorageStateInput({
      cookies: [
        { name: "PSID_0", value: "x", domain: ".asken.jp" },
        { name: "other", value: "y", domain: ".example.com" },
      ],
    });
    expect(state.cookies).toHaveLength(1);
    expect(state.origins).toEqual([]);
  });

  it("cookies が配列でない・該当ゼロは CookieParseError", () => {
    expect(() => normalizeStorageStateInput(null)).toThrow(CookieParseError);
    expect(() => normalizeStorageStateInput({})).toThrow(CookieParseError);
    expect(() => normalizeStorageStateInput({ cookies: "x" })).toThrow(CookieParseError);
    expect(() =>
      normalizeStorageStateInput({ cookies: [{ name: "a", value: "b", domain: ".example.com" }] })
    ).toThrow(CookieParseError);
  });
});

describe("checkAuthCookies", () => {
  it("必須Cookieが揃っていれば hasAuthCookies=true", () => {
    const cookies = parseCookieHeader("PSID_0=x; ASKEN_PORTAL_AUTO=y; extra=z");
    const r = checkAuthCookies(cookies);
    expect(r.hasAuthCookies).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it("不足があれば missing に列挙される", () => {
    const cookies = parseCookieHeader("PSID_0=x");
    const r = checkAuthCookies(cookies);
    expect(r.hasAuthCookies).toBe(false);
    expect(r.missing).toEqual(["ASKEN_PORTAL_AUTO"]);
  });
});
