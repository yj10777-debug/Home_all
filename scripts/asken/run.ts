import { chromium, BrowserContext } from 'playwright';
import path from 'path';
import fs from 'fs';

import { scrapeDay } from './scrapeDay';
import { scrapeAdviceNutrients, AdviceMealType } from './scrapeAdvice';
import { autoLogin, isSessionLikelyValid } from './login';
import type { DayResult } from './types';

const PROJECT_ROOT = process.cwd();
const SECRETS_DIR = path.join(PROJECT_ROOT, 'secrets');
const STATE_FILE = path.join(SECRETS_DIR, 'asken-state.json');

/** 朝5時までは前日として扱う */
function todayStr() {
    const now = new Date();
    // JST = UTC+9
    const jstHour = (now.getUTCHours() + 9) % 24;
    const effective = jstHour < 5 ? new Date(now.getTime() - 86400000) : now;
    const y = effective.getFullYear();
    const m = String(effective.getMonth() + 1).padStart(2, '0');
    const d = String(effective.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** 栄養素の文字列を正規化する */
function normalizeValue(val: string): string {
    let s = val.replace(/\s+/g, '');
    s = s.replace(/ug/gi, 'µg').replace(/μg/g, 'µg');
    return s;
}

function normalizeNutrients(record: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(record)) {
        out[k] = normalizeValue(v);
    }
    return out;
}

/**
 * セッションの有効性を実際にページアクセスして確認する
 * @returns ログインページにリダイレクトされなければ true
 */
async function verifySession(context: BrowserContext, dateStr: string): Promise<boolean> {
    const page = await context.newPage();
    try {
        const url = `https://www.asken.jp/wsp/comment/${dateStr}`;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        return !page.url().includes('login');
    } catch {
        return false;
    } finally {
        await page.close();
    }
}

/**
 * あすけんのスクレイピングを実行する
 * セッション切れの場合は自動で再ログインしてリトライする
 */
async function run() {
    const targetDate = process.argv[2] || todayStr();
    const headless = process.env.HEADLESS === 'true';

    // セッションファイルが古い or 存在しない場合は事前にログイン
    if (!isSessionLikelyValid()) {
        console.log("セッションが無効です。自動ログインを実行します...");
        await autoLogin({ headless });
    }

    if (!fs.existsSync(STATE_FILE)) {
        console.error(`State file not found: ${STATE_FILE}`);
        console.error("自動ログインに失敗しました。ASKEN_EMAIL / ASKEN_PASSWORD を確認してください。");
        process.exit(1);
    }

    let browser = await chromium.launch({ headless });
    let context = await browser.newContext({ storageState: STATE_FILE });

    try {
        // セッションの有効性を実際に確認
        const isValid = await verifySession(context, targetDate);

        if (!isValid) {
            // セッション切れ → 再ログイン
            console.log("セッションが切れています。再ログインします...");
            await context.close();
            await browser.close();

            await autoLogin({ headless });

            // 新しいセッションでブラウザを再起動
            browser = await chromium.launch({ headless });
            context = await browser.newContext({ storageState: STATE_FILE });

            // 再ログイン後も失敗する場合はエラー
            const retryValid = await verifySession(context, targetDate);
            if (!retryValid) {
                throw new Error("再ログイン後もセッションが無効です。認証情報を確認してください。");
            }
        }

        // スクレイピング実行
        const items = await scrapeDay(targetDate, context);

        const getNutrients = async (mealType: AdviceMealType) => {
            try {
                return await scrapeAdviceNutrients({ context, dateStr: targetDate, mealType });
            } catch (e) {
                console.error(`Failed to get advice for ${mealType}:`, e);
                return {};
            }
        };

        const breakfast = normalizeNutrients(await getNutrients('朝食'));
        const lunch = normalizeNutrients(await getNutrients('昼食'));
        const dinner = normalizeNutrients(await getNutrients('夕食'));

        const result: DayResult = {
            date: targetDate,
            items,
            nutrients: {
                朝食: breakfast,
                昼食: lunch,
                夕食: dinner,
            },
        };

        // stdout に出力
        console.log(JSON.stringify(result, null, 2));

        // ファイルに保存
        fs.mkdirSync(SECRETS_DIR, { recursive: true });
        const outFile = path.join(SECRETS_DIR, `asken-day-${targetDate}.json`);
        fs.writeFileSync(outFile, JSON.stringify(result, null, 2), 'utf-8');
        console.log(`Saved: ${outFile}`);

    } catch (e) {
        console.error('Fatal Error:', e);
        process.exit(1);
    } finally {
        await context.close();
        await browser.close();
    }
}

run();
