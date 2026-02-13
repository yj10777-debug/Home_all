import { chromium, BrowserContext } from 'playwright';
import path from 'path';
import fs from 'fs';
import type { ScrapedItem } from './types';

const PROJECT_ROOT = process.cwd();
const SECRETS_DIR = path.join(PROJECT_ROOT, 'secrets');
const STATE_FILE = path.join(SECRETS_DIR, 'asken-state.json');
const ERROR_SCREENSHOT = path.join(SECRETS_DIR, 'asken-error.png');
const ERROR_HTML = path.join(SECRETS_DIR, 'asken-error.html');

const MEAL_BLOCKS = [
    { id: 'karute_report_breakfast', mealType: '朝食' },
    { id: 'karute_report_lunch', mealType: '昼食' },
    { id: 'karute_report_dinner', mealType: '夕食' },
    { id: 'karute_report_sweets', mealType: '間食' },
    { id: 'karute_report_snack', mealType: '間食' }, // Fallback for extra stacks
] as const;

export async function scrapeDay(dateStr: string, existingContext?: BrowserContext): Promise<ScrapedItem[]> {
    let browser = null;
    let context = existingContext;
    let page = null;

    // If no context provided, handle standalone execution (backward compatibility or manual run)
    if (!context) {
        if (!fs.existsSync(STATE_FILE)) {
            throw new Error(`State file not found at ${STATE_FILE}. Run login script first.`);
        }
        browser = await chromium.launch({ headless: false });
        context = await browser.newContext({ storageState: STATE_FILE });
    }

    try {
        page = await context.newPage();

        const url = `https://www.asken.jp/wsp/comment/${dateStr}`;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // ページ内のコンテンツがレンダリングされるまで待機
        await page.waitForSelector('#karute_report_breakfast, #karute_report_lunch, #karute_report_dinner', { timeout: 10000 }).catch(() => {
            // セレクタが見つからない場合もログインチェックに進む
        });

        if (page.url().includes('login')) {
            throw new Error('Redirected to login page.');
        }

        const items: ScrapedItem[] = await page.evaluate((blocks) => {
            const results: ScrapedItem[] = [];

            for (const block of blocks) {
                const container = document.getElementById(block.id);
                if (!container) continue;

                const rows = Array.from(container.querySelectorAll('table tr'));

                for (const row of rows) {
                    const cells = Array.from(row.querySelectorAll('td'))
                        .map(td => td.textContent?.trim() ?? '')
                        .filter(Boolean);

                    if (cells.length < 3) continue;

                    // Typically: Name, Amount, Kcal
                    // Assuming columns: [Name, Amount, Kcal]
                    const [name, amount, kcalText] = cells;
                    const kcalMatch = kcalText.match(/(\d+)\s*kcal/i);
                    if (!kcalMatch) continue;

                    results.push({
                        mealType: block.mealType,
                        name,
                        amount,
                        calories: Number(kcalMatch[1]),
                    });
                }
            }
            return results;
        }, MEAL_BLOCKS);

        return items;

    } catch (err) {
        console.error(`Scrape error (${dateStr}):`, err);
        if (page) {
            await page.screenshot({ path: ERROR_SCREENSHOT, fullPage: true });
            fs.writeFileSync(ERROR_HTML, await page.content());
        }
        throw err;
    } finally {
        if (page) await page.close();
        if (browser) await browser.close();
    }
}
