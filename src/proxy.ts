/**
 * アプリ全体のBasic認証（opt-in）— Next.js 16 の Proxy 規約（旧 middleware）
 *
 * BASIC_AUTH_USER / BASIC_AUTH_PASS を両方設定したときだけ有効になる。
 * 未設定なら何もしない（段階導入・ローカル開発への影響なし）。
 *
 * 目的: 本番URLを知られた場合の健康データ閲覧・/api/sync 起動・
 * システムプロンプト書換を防ぐ（シングルユーザー前提のためログインUIは作らない）。
 *
 * 機械アクセス（session-guard / push-session / 外部cron）は
 * x-cron-secret ヘッダが CRON_SECRET と一致すれば素通しする
 * （各APIの個別検証はそのまま生きる）。
 */
import { NextRequest, NextResponse } from "next/server";

/** タイミング差を抑えた文字列比較（長さが違っても全文字を比較する） */
function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export function proxy(req: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASS;
  if (!user || !pass) return NextResponse.next(); // 未設定なら無効

  // 機械アクセス: x-cron-secret が一致すればBasic認証を免除
  const cronSecret = process.env.CRON_SECRET;
  const headerSecret = req.headers.get("x-cron-secret");
  if (cronSecret && headerSecret && safeEqual(headerSecret, cronSecret)) {
    return NextResponse.next();
  }

  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    try {
      const decoded = atob(auth.slice("Basic ".length));
      const sep = decoded.indexOf(":");
      const u = decoded.slice(0, sep);
      const p = decoded.slice(sep + 1);
      if (safeEqual(u, user) && safeEqual(p, pass)) {
        return NextResponse.next();
      }
    } catch {
      /* 不正なBase64は認証失敗として扱う */
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="nutrition-app"' },
  });
}

export const config = {
  // 静的アセットは対象外（ページ・API・データはすべて保護）
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
