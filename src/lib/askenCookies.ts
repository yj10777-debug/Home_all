/**
 * あすけんのCookie（storageState）変換・書き込みロジック。
 *
 * scripts/asken/import-cookies.ts（CLI）と src/pages/api/asken/session.ts（本番反映API）の
 * 両方から共有される。Cookie値をログ・例外メッセージに含めないこと。
 */
import fs from "fs";
import path from "path";

export type PlaywrightCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Strict" | "Lax" | "None";
};

export type StorageState = {
  cookies: PlaywrightCookie[];
  origins: unknown[];
};

/** 認証に必須なCookie名（値は扱わない） */
export const EXPECTED_AUTH_COOKIE_NAMES = ["PSID_0", "ASKEN_PORTAL_AUTO"];

export function getSecretsDir(projectRoot: string = process.cwd()): string {
  return path.join(projectRoot, "secrets");
}

export function getStateFilePath(projectRoot: string = process.cwd()): string {
  return path.join(getSecretsDir(projectRoot), "asken-state.json");
}

/** Cookie-Editor 等の sameSite 表記を Playwright 形式へ正規化 */
export function normalizeSameSite(raw: unknown): "Strict" | "Lax" | "None" {
  const s = String(raw ?? "").toLowerCase();
  if (s === "strict") return "Strict";
  if (s === "no_restriction" || s === "none") return "None";
  // lax / unspecified / null / undefined はすべて Lax に寄せる（あすけんの実挙動に合わせた安全側）
  return "Lax";
}

/** 任意のエクスポート要素を Playwright Cookie に変換（変換不能なら null） */
export function toPlaywrightCookie(raw: any): PlaywrightCookie | null {
  if (!raw || typeof raw.name !== "string" || typeof raw.value !== "string") return null;

  let domain: string = raw.domain ?? "";
  if (!domain) return null;
  // hostOnly=true の場合、先頭ドットを付けない。falseまたはドメイン先頭がドットならそのまま。
  if (raw.hostOnly === false && !domain.startsWith(".")) {
    domain = "." + domain;
  }

  // expirationDate(秒, 小数あり) / expires(秒 or 日付文字列) / セッションCookie(なし)
  let expires = -1;
  const exp = raw.expirationDate ?? raw.expires;
  if (typeof exp === "number" && Number.isFinite(exp)) {
    expires = Math.floor(exp);
  } else if (typeof exp === "string" && exp) {
    const n = Number(exp);
    if (Number.isFinite(n)) expires = Math.floor(n);
    else {
      const t = Date.parse(exp);
      if (Number.isFinite(t)) expires = Math.floor(t / 1000);
    }
  }

  return {
    name: raw.name,
    value: raw.value,
    domain,
    path: raw.path ?? "/",
    expires,
    httpOnly: !!raw.httpOnly,
    secure: !!raw.secure,
    sameSite: normalizeSameSite(raw.sameSite),
  };
}

/**
 * 任意のテキストから Cookie 部分を抽出する。
 * - 生ヘッダ "Cookie: a=b; c=d"
 * - cURL の "-H 'cookie: a=b; c=d'" / "-b 'a=b; c=d'"
 * - 値だけ "a=b; c=d"
 * のいずれにも対応。見つからなければ元テキストをそのまま返す。
 */
export function extractCookieString(text: string): string {
  // cURL: -H '...cookie: X' / -b 'X' / --cookie "X"
  const mH = text.match(/-H\s+(['"])\s*cookie\s*:\s*([\s\S]*?)\1/i);
  if (mH) return mH[2];
  const mB = text.match(/(?:-b|--cookie)\s+(['"])([\s\S]*?)\1/i);
  if (mB) return mB[2];
  // ヘッダブロック: "cookie:" 以降を次の改行まで
  const mHeader = text.match(/(?:^|\n)\s*cookie\s*:\s*([^\n]*)/i);
  if (mHeader) return mHeader[1];
  return text;
}

/** 生の Cookie ヘッダ文字列を Playwright Cookie 配列へ変換（メタ情報は既定補完） */
export function parseCookieHeader(text: string): PlaywrightCookie[] {
  const body = extractCookieString(text).trim();
  const out: PlaywrightCookie[] = [];
  for (const part of body.split(";")) {
    const seg = part.trim();
    if (!seg) continue;
    const eq = seg.indexOf("=");
    if (eq <= 0) continue;
    const name = seg.slice(0, eq).trim();
    const value = seg.slice(eq + 1).trim();
    if (!name) continue;
    out.push({
      name,
      value,
      domain: ".asken.jp", // メタ情報が無いため親ドメインで補完（サブドメインにも送られる）
      path: "/",
      expires: -1, // セッションCookie扱い（verifySession が実アクセスで有効性判定）
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    });
  }
  return out;
}

export class CookieParseError extends Error {}

/**
 * 任意の入力テキスト（JSON エクスポート or 生Cookieヘッダ/cURL）から
 * asken.jp ドメインの Playwright Cookie 配列を抽出する。
 * 解釈できない・該当ドメインが1件もない場合は CookieParseError を投げる。
 * Cookie値は例外メッセージに含めない。
 */
export function parseCookiesFromText(rawText: string): PlaywrightCookie[] {
  const text = rawText.trim();
  if (!text) {
    throw new CookieParseError("入力が空です。");
  }

  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* 生ヘッダ形式へフォールバック */
  }

  let cookies: PlaywrightCookie[];

  if (parsed !== null) {
    // 受け付ける形: (a) Cookie-Editor の配列  (b) { cookies: [...] }  (c) Playwright storageState そのもの
    const rawCookies: any[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.cookies)
        ? parsed.cookies
        : [];
    if (rawCookies.length === 0) {
      throw new CookieParseError(
        "Cookie配列が見つかりません。Cookie-Editor の「Export」→ JSON 形式か、{ \"cookies\": [...] } 形式で保存してください。"
      );
    }
    cookies = rawCookies
      .map(toPlaywrightCookie)
      .filter((c): c is PlaywrightCookie => c !== null);
  } else {
    cookies = parseCookieHeader(text);
    if (cookies.length === 0) {
      throw new CookieParseError(
        "Cookieを解釈できませんでした。JSONエクスポート、または \"名前=値; 名前=値\" 形式のCookieヘッダを保存してください。"
      );
    }
  }

  cookies = cookies.filter((c) => c.domain.includes("asken.jp"));

  if (cookies.length === 0) {
    throw new CookieParseError("asken.jp のCookieが1件も見つかりませんでした。エクスポート対象ドメインを確認してください。");
  }

  return cookies;
}

export function buildStorageState(cookies: PlaywrightCookie[]): StorageState {
  return { cookies, origins: [] };
}

/** 認証に重要なCookieの充足状況を判定する（値は見ない） */
export function checkAuthCookies(cookies: PlaywrightCookie[]): {
  names: string[];
  missing: string[];
  hasAuthCookies: boolean;
} {
  const names = [...new Set(cookies.map((c) => c.name))];
  const nameSet = new Set(names);
  const missing = EXPECTED_AUTH_COOKIE_NAMES.filter((n) => !nameSet.has(n));
  return { names, missing, hasAuthCookies: missing.length === 0 };
}

/** storageState を secrets/asken-state.json に書き込む */
export function writeStorageState(storageState: StorageState, projectRoot: string = process.cwd()): string {
  const secretsDir = getSecretsDir(projectRoot);
  const stateFile = getStateFilePath(projectRoot);
  fs.mkdirSync(secretsDir, { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(storageState, null, 2), "utf-8");
  return stateFile;
}

/**
 * 任意の storageState 風オブジェクト（{ cookies: [...] }）を検証し、
 * asken.jp ドメインの Cookie のみを残した正規化済み StorageState を返す。
 * 不正・空の場合は CookieParseError を投げる。
 */
export function normalizeStorageStateInput(input: unknown): StorageState {
  if (!input || typeof input !== "object" || !Array.isArray((input as any).cookies)) {
    throw new CookieParseError("storageState.cookies が配列ではありません。");
  }
  const cookies = (input as any).cookies
    .map(toPlaywrightCookie)
    .filter((c: PlaywrightCookie | null): c is PlaywrightCookie => c !== null)
    .filter((c: PlaywrightCookie) => c.domain.includes("asken.jp"));

  if (cookies.length === 0) {
    throw new CookieParseError("asken.jp のCookieが1件も見つかりませんでした。");
  }
  return buildStorageState(cookies);
}
