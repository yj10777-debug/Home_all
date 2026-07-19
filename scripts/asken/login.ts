import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
config({ quiet: true });

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = process.cwd();
const SECRETS_DIR = path.join(PROJECT_ROOT, 'secrets');
const STATE_FILE = path.join(SECRETS_DIR, 'asken-state.json');

/** 朝5時までは前日として扱う（サーバーTZに依存せずJST基準で計算する） */
function todayStr() {
    const now = new Date();
    // JST = UTC+9 に平行移動し、UTCメソッドでJSTの暦日を取得する
    const jst = new Date(now.getTime() + 9 * 3600000);
    const effective = jst.getUTCHours() < 5 ? new Date(jst.getTime() - 86400000) : jst;
    const y = effective.getUTCFullYear();
    const m = String(effective.getUTCMonth() + 1).padStart(2, '0');
    const d = String(effective.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * あすけんの認証情報を環境変数から取得する
 * @throws 環境変数が未設定の場合
 */
function getCredentials(): { email: string; password: string } {
    const email = process.env.ASKEN_EMAIL;
    const password = process.env.ASKEN_PASSWORD;
    if (!email || !password) {
        throw new Error(
            "ASKEN_EMAIL と ASKEN_PASSWORD が設定されていません。.env.local に追加してください。"
        );
    }
    return { email, password };
}

/**
 * Playwright で あすけんに自動ログインし、セッション状態を保存する
 * @param options.headless ヘッドレスモードで実行するか（デフォルト: true）
 * @returns 保存先のパス
 */
export async function autoLogin(options?: { headless?: boolean }): Promise<string> {
    const { email, password } = getCredentials();
    const headless = options?.headless ?? true;

    if (!fs.existsSync(SECRETS_DIR)) fs.mkdirSync(SECRETS_DIR, { recursive: true });

    const browser = await chromium.launch({
        headless,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
        ],
    });
    const context = await browser.newContext({
        userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
        locale: 'ja-JP',
        timezoneId: 'Asia/Tokyo',
    });
    // webdriver フラグを隠してBot検出を回避
    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    try {
        const page = await context.newPage();

        // ログインページに遷移
        await page.goto('https://www.asken.jp/login', { waitUntil: 'domcontentloaded' });

        // メールアドレスとパスワードを入力
        // 2026-07 のサイト改修で input の id 属性が削除されたため name 属性で特定する
        // （旧 id もフォールバックとして残す）
        await page.fill('input[name="CustomerMember[email]"], #CustomerMemberEmail', email);
        await page.fill('input[name="CustomerMember[passwd_plain]"], #CustomerMemberPasswdPlain', password);

        // ログインボタンをクリック（現行: type=image の input[name="Submit[submit]"]）
        await page.click('input[name="Submit[submit]"], #SubmitSubmit');

        // ログイン後のリダイレクトを待つ（ログインページを離れるまで）
        await page.waitForURL((url) => !url.toString().includes('/login'), { timeout: 30000 });

        // wsp ページを踏んでセッション Cookie を確実に取得
        const t = todayStr();
        const warmupUrl = `https://www.asken.jp/wsp/comment/${t}`;
        await page.goto(warmupUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // ログインページにリダイレクトされた場合はエラー
        if (page.url().includes('/login')) {
            // デバッグ用: ログイン失敗時のスクリーンショットを保存
            await page.screenshot({ path: path.join(SECRETS_DIR, 'login-failed.png'), fullPage: true });
            fs.writeFileSync(path.join(SECRETS_DIR, 'login-failed.html'), await page.content());
            throw new Error(
                `自動ログインに失敗しました（リダイレクト先: ${page.url()}）。\n` +
                `メールアドレス/パスワードが正しい場合、あすけん側のBot対策により新規ログインが` +
                `拒否されている可能性があります（2026-07 のサイト刷新以降に確認済み）。\n` +
                `対処: 手動でブラウザからログインし、Cookieをエクスポートして ` +
                `${STATE_FILE} に配置してください（詳細は README/CLAUDE.md の手順を参照）。`
            );
        }

        // デバッグ用: ログイン成功後のスクリーンショットを保存
        await page.screenshot({ path: path.join(SECRETS_DIR, 'login-success.png'), fullPage: true });

        // セッション状態を保存
        await context.storageState({ path: STATE_FILE });
        console.log(`セッション保存完了: ${STATE_FILE}`);

        return STATE_FILE;
    } finally {
        await context.close();
        await browser.close();
    }
}

/**
 * 保存済みセッションが有効かどうかを簡易チェックする
 * セッションファイルの存在と最終更新日を確認する
 *
 * 2026-07: あすけんのサイト刷新でBot対策(自動化検出)が導入され、
 * Playwright（playwright-extra+stealth、実Chromeバイナリ、人間らしい操作を試しても）
 * による新規ログインは高確率で拒否されることが判明した。既存セッション（ブラウザで
 * 手動ログインしてエクスポートしたCookie = secrets/asken-state.json）だけが通る。
 * そのため「ファイルが古ければ即座に自動再ログインを試みる」旧ロジックは、
 * まだ十分有効な手動セッションを無駄に破棄しにいく方向に働いてしまう。
 * 実際の有効性は run.ts の verifySession()（実際に /wsp/ にアクセスして判定）に
 * 委ね、ここでは「ファイルが存在し、かつ極端に古すぎない（=放置されたゴミではない）」
 * ことだけを緩く確認する。
 * @returns セッションが有効そうなら true
 */
export function isSessionLikelyValid(): boolean {
    if (!fs.existsSync(STATE_FILE)) return false;

    // セッションファイルがあまりに古い（30日以上）場合のみ期限切れとみなす。
    // 実際の可否は run.ts の verifySession() が都度ネットワークで確認する。
    const stat = fs.statSync(STATE_FILE);
    const ageMs = Date.now() - stat.mtimeMs;
    const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30日
    return ageMs < MAX_AGE_MS;
}

/**
 * セッションが無効な場合に自動的に再ログインする
 * @param context 現在の BrowserContext
 * @returns 再ログインが行われた場合 true
 */
export async function ensureSession(options?: { headless?: boolean }): Promise<void> {
    if (!isSessionLikelyValid()) {
        console.log("セッションが期限切れです。自動ログインを実行します...");
        await autoLogin(options);
    }
}

// CLI から直接実行された場合
const isDirectRun = process.argv[1]?.replace(/\\/g, '/').includes('scripts/asken/login');
if (isDirectRun) {
    const headless = process.env.HEADLESS === 'true';
    autoLogin({ headless })
        .then(() => console.log("ログイン完了"))
        .catch((e) => {
            console.error("ログイン失敗:", e);
            process.exit(1);
        });
}
