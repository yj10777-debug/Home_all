import { chromium } from 'playwright';
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

(async () => {
    if (!fs.existsSync(SECRETS_DIR)) fs.mkdirSync(SECRETS_DIR, { recursive: true });

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    // 入口はどっちでもいいが、最終的に wsp を踏むのが重要
    await page.goto('https://www.asken.jp/login', { waitUntil: 'domcontentloaded' });

    console.log('👉 ブラウザでログインしてください（完了したら自動検知します）');

    // 「loginを抜けた」だけだと早すぎる場合があるので少し強めに待つ
    await page.waitForURL((url) => !url.toString().includes('/login'), { timeout: 0 });

    // ★ここが本命：wspページを踏んで、そのoriginのlocalStorage/cookieをstateに入れる
    const t = todayStr();
    const warmupUrl = `https://www.asken.jp/wsp/comment/${t}`;
    console.log('Warming up wsp origin:', warmupUrl);
    await page.goto(warmupUrl, { waitUntil: 'networkidle' });

    // まだ login に飛ぶなら、ここで止める（stateを汚さない）
    if (page.url().includes('/login')) {
        throw new Error(`Warmup failed: redirected to login: ${page.url()}`);
    }
    await page.goto(warmupUrl, { waitUntil: 'networkidle' });
    console.log('Warmup landed URL:', page.url());
    if (page.url().includes('/login')) {
        throw new Error(`Warmup failed: redirected to login: ${page.url()}`);
    }


    await context.storageState({ path: STATE_FILE });
    console.log(`✅ State saved to ${STATE_FILE}`);

    await browser.close();
})();
