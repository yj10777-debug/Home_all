import { chromium, BrowserContext } from 'playwright';
import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = process.cwd();
const SECRETS_DIR = path.join(PROJECT_ROOT, 'secrets');
const STATE_FILE = path.join(SECRETS_DIR, 'asken-state.json');

function todayStr() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
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

    const browser = await chromium.launch({ headless });
    const context = await browser.newContext();

    try {
        const page = await context.newPage();

        // ログインページに遷移
        await page.goto('https://www.asken.jp/login', { waitUntil: 'domcontentloaded' });

        // メールアドレスとパスワードを入力
        await page.fill('input[name="login_id"], input[type="email"], #login_id, #email', email);
        await page.fill('input[name="password"], input[type="password"], #password', password);

        // ログインボタンをクリック
        await page.click('button[type="submit"], input[type="submit"], .btn-login, [data-testid="login-button"]');

        // ログイン後のリダイレクトを待つ（ログインページを離れるまで）
        await page.waitForURL((url) => !url.toString().includes('/login'), { timeout: 30000 });

        // wsp ページを踏んでセッション Cookie を確実に取得
        const t = todayStr();
        const warmupUrl = `https://www.asken.jp/wsp/comment/${t}`;
        await page.goto(warmupUrl, { waitUntil: 'networkidle' });

        // ログインページにリダイレクトされた場合はエラー
        if (page.url().includes('/login')) {
            throw new Error(`ログインに失敗しました。メールアドレスまたはパスワードを確認してください。（リダイレクト先: ${page.url()}）`);
        }

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
 * @returns セッションが有効そうなら true
 */
export function isSessionLikelyValid(): boolean {
    if (!fs.existsSync(STATE_FILE)) return false;

    // セッションファイルが24時間以上前なら期限切れとみなす
    const stat = fs.statSync(STATE_FILE);
    const ageMs = Date.now() - stat.mtimeMs;
    const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24時間
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
