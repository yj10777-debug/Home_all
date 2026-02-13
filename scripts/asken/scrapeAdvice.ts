import { BrowserContext, Page } from 'playwright';
import { MealType } from './types';

// Only breakfast, lunch, dinner have advice slots
export type AdviceMealType = Extract<MealType, '朝食' | '昼食' | '夕食'>;

const ADVICE_SLOT: Record<AdviceMealType, number> = {
    朝食: 3,
    昼食: 4,
    夕食: 5,
};

function normalizeText(s: string): string {
    return s
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\r/g, '')
        .trim();
}

// Extract "Nutrient + Value + Unit" from text block
function extractNutrientsFromText(text: string): Record<string, string> {
    const t = normalizeText(text);

    const keys = [
        'エネルギー',
        'たんぱく質', 'タンパク質',
        '脂質',
        '炭水化物', '糖質',
        '食物繊維',
        '食塩相当量',
        'ナトリウム',
        'カリウム',
        'カルシウム',
        '鉄',
        'ビタミンA', 'ビタミンB1', 'ビタミンB2', 'ビタミンB6', 'ビタミンB12',
        'ビタミンC', 'ビタミンD', 'ビタミンE',
        '葉酸',
    ];

    const out: Record<string, string> = {};

    for (const key of keys) {
        // Regex: Key followed by optional colon, number (float), unit
        const re = new RegExp(`${key}\\s*[:：]?\\s*([0-9]+(?:\\.[0-9]+)?)\\s*(kcal|g|mg|µg|ug)`, 'i');
        const m = t.match(re);
        if (m) {
            const val = m[1];
            let unit = m[2];
            if (unit.toLowerCase() === 'ug') unit = 'µg';

            // Normalize key
            let normKey = key;
            if (normKey === 'タンパク質') normKey = 'たんぱく質';

            out[normKey] = `${val}${unit}`;
        }
    }
    return out;
}

export async function scrapeAdviceNutrients(params: {
    context: BrowserContext;
    dateStr: string;
    mealType: AdviceMealType;
}): Promise<Record<string, string>> {
    const { context, dateStr, mealType } = params;
    const slot = ADVICE_SLOT[mealType];
    const url = `https://www.asken.jp/wsp/advice/${dateStr}/${slot}`;

    const page: Page = await context.newPage();
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // テーブルのレンダリングを待機
        await page.waitForSelector('table', { timeout: 10000 }).catch(() => { });

        if (page.url().includes('login')) {
            throw new Error(`Redirected to login while opening advice page: ${mealType} ${url}`);
        }

        // Strategy: Extract all text from tables, find the one with most nutrient matches
        const tableTexts = await page.$$eval('table', (tables) =>
            tables.map((t) => (t as HTMLElement).innerText ?? '').filter(Boolean)
        );

        let best: Record<string, string> = {};
        for (const tt of tableTexts) {
            const nu = extractNutrientsFromText(tt);
            if (Object.keys(nu).length > Object.keys(best).length) best = nu;
        }

        // Fallback: Check entire body if table extraction failed
        if (Object.keys(best).length === 0) {
            const bodyText = await page.evaluate(() => document.body?.innerText ?? '');
            best = extractNutrientsFromText(bodyText);
        }

        return best;
    } finally {
        await page.close();
    }
}
