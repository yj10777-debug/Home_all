import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
config({ quiet: true });

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

/**
 * secrets/asken-state.json に保存されたセッション（手動エクスポートしたCookie、
 * または autoLogin() が保存したもの）が実際に有効かどうかを検証する使い捨てスクリプト。
 *
 * 背景: 2026-07 のあすけんサイト刷新でBot対策(自動化検出)が導入され、
 * Playwright による新規ログインは（stealthプラグイン・実Chromeバイナリ・
 * 人間らしい操作を試しても）高確率で拒否されることが判明した。既存の
 * ブラウザセッション（Cookie）だけが通るため、運用は以下のようになる:
 *
 *   1. 手元のブラウザ（Chrome等）で https://www.asken.jp/login から通常通りログインする
 *   2. 拡張機能等で Cookie を Playwright の storageState 形式でエクスポートする
 *      （最低限 storageState.json の `cookies` 配列に asken.jp ドメインの
 *        Cookie 一式、特に PSID_0 / ASKEN_PORTAL_AUTO / AP_LASTLOGIN_* が
 *        含まれていればよい。`origins` は空でも可）
 *   3. そのファイルを secrets/asken-state.json として配置する
 *   4. 本スクリプトで有効性を確認する:
 *        npx tsx scripts/asken/check-login.ts [YYYY-MM-DD]
 *
 * 使い方:
 *   npx tsx scripts/asken/check-login.ts            # 今日の日付でチェック
 *   npx tsx scripts/asken/check-login.ts 2026-07-11  # 指定日でチェック
 *   HEADLESS=false npx tsx scripts/asken/check-login.ts  # ブラウザを表示して確認
 */

const PROJECT_ROOT = process.cwd();
const SECRETS_DIR = path.join(PROJECT_ROOT, 'secrets');
const STATE_FILE = path.join(SECRETS_DIR, 'asken-state.json');

function todayStr() {
    const now = new Date();
    const jstHour = (now.getUTCHours() + 9) % 24;
    const effective = jstHour < 5 ? new Date(now.getTime() - 86400000) : now;
    const y = effective.getFullYear();
    const m = String(effective.getMonth() + 1).padStart(2, '0');
    const d = String(effective.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export type VerifySessionResult =
    | { valid: true; status: number | undefined; hasKarute: boolean; url: string }
    | { valid: false; reason: 'missing-state-file' | 'redirected-to-login'; url?: string };

/**
 * secrets/asken-state.json のセッションが実際に有効かどうかを、実アクセスで検証する。
 * session-guard.ts と check-login.ts の CLI 本体の両方から呼ばれる共有ロジック。
 * Cookie値はログに出さない。
 */
export async function verifySession(dateStr: string = todayStr()): Promise<VerifySessionResult> {
    const headless = process.env.HEADLESS !== 'false';

    if (!fs.existsSync(STATE_FILE)) {
        return { valid: false, reason: 'missing-state-file' };
    }

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
        storageState: STATE_FILE,
        userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
        locale: 'ja-JP',
        timezoneId: 'Asia/Tokyo',
    });

    try {
        const page = await context.newPage();
        const url = `https://www.asken.jp/wsp/comment/${dateStr}`;
        const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        const finalUrl = page.url();
        const isValid = !finalUrl.includes('/login');

        if (isValid) {
            const hasKarute = await page
                .evaluate(() => !!document.querySelector('[id^="karute_report_"]'))
                .catch(() => false);
            return { valid: true, status: res?.status(), hasKarute, url };
        } else {
            return { valid: false, reason: 'redirected-to-login', url: finalUrl };
        }
    } finally {
        await context.close();
        await browser.close();
    }
}

async function main() {
    const dateStr = process.argv[2] || todayStr();

    if (!fs.existsSync(STATE_FILE)) {
        console.error(`✗ セッションファイルが見つかりません: ${STATE_FILE}`);
        console.error('  手動ログインでエクスポートしたCookieを上記パスに配置してください。');
        process.exit(1);
    }

    const stat = fs.statSync(STATE_FILE);
    const ageHours = (Date.now() - stat.mtimeMs) / (60 * 60 * 1000);
    console.log(`state file: ${STATE_FILE} (更新から ${ageHours.toFixed(1)} 時間経過)`);

    const result = await verifySession(dateStr);

    if (result.valid) {
        console.log(`✓ セッション有効 (HTTP ${result.status}) — ${result.url}`);
        console.log(`  karute_report 要素の存在: ${result.hasKarute}`);
        process.exit(0);
    } else if (result.reason === 'redirected-to-login') {
        console.error(`✗ セッション無効 — ログインページへリダイレクトされました: ${result.url}`);
        console.error('  手動ブラウザで再ログインし、Cookieを再エクスポートしてください:');
        console.error(`    ${STATE_FILE}`);
        process.exit(1);
    } else {
        console.error(`✗ セッションファイルが見つかりません: ${STATE_FILE}`);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch((e) => {
        console.error('チェック中にエラー:', e);
        process.exit(1);
    });
}
