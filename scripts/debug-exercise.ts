import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const OUT_DIR = path.join(process.cwd(), 'secrets');

async function main() {
    const email = process.env.ASKEN_EMAIL;
    const password = process.env.ASKEN_PASSWORD;
    if (!email || !password) {
        console.error('ASKEN_EMAIL / ASKEN_PASSWORD 未設定');
        return;
    }

    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const loginPage = await ctx.newPage();

    // 同一セッションでログイン
    console.log('ログイン中...');
    await loginPage.goto('https://www.asken.jp/login', { waitUntil: 'domcontentloaded' });
    await loginPage.fill('#CustomerMemberEmail', email);
    await loginPage.fill('#CustomerMemberPasswdPlain', password);
    await loginPage.click('#SubmitSubmit');
    await loginPage.waitForURL(url => !url.toString().includes('/login'), { timeout: 30000 });
    console.log('ログイン完了:', loginPage.url());
    await loginPage.close();

    // 2/13（歩数が取得できた日）のページ
    const page = await ctx.newPage();
    console.log('\n=== 2026-02-13 ===');
    await page.goto('https://www.asken.jp/my_record/karute_report/20260213', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
    });

    console.log('URL:', page.url());

    // ログインリダイレクトチェック
    if (page.url().includes('/login')) {
        console.error('ログインページにリダイレクトされた');
        await browser.close();
        return;
    }

    // 15秒待つ（SPAレンダリング）
    console.log('15秒待機...');
    await page.waitForTimeout(15000);

    // ページタイトル
    const title = await page.title();
    console.log('Title:', title);

    // karute_report IDs
    const ids = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('[id*="karute"], [id*="exercise"], [id*="report"]'))
            .map(el => ({ id: el.id, tag: el.tagName, text: (el.textContent || '').substring(0, 80) }));
    });
    console.log('\n=== report/exercise IDs ===');
    ids.forEach(el => console.log(`${el.id} (${el.tag}): ${el.text}`));

    // 「歩」を含むテキスト
    const stepsLines = await page.evaluate(() => {
        return (document.body.innerText || '').split('\n').filter(l => l.includes('歩')).slice(0, 10);
    });
    console.log('\n=== 歩を含む行 ===');
    stepsLines.forEach(l => console.log(l));

    // kcal を含むテキスト（先頭表示文字列）
    const kcalLines = await page.evaluate(() => {
        return (document.body.innerText || '').split('\n').filter(l => l.includes('kcal') || l.includes('カロリー')).slice(0, 10);
    });
    console.log('\n=== kcal/カロリーを含む行 ===');
    kcalLines.forEach(l => console.log(l));

    // スクリーンショット
    await page.screenshot({ path: path.join(OUT_DIR, 'debug-page2.png'), fullPage: true });
    console.log('\nスクリーンショット保存: secrets/debug-page2.png');

    await browser.close();
}

main().catch(console.error);
