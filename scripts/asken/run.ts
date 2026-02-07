import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

import { scrapeDay } from './scrapeDay';
import { scrapeAdviceNutrients, AdviceMealType } from './scrapeAdvice';
import type { DayResult } from './types';

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


// Helper to normalize nutrient strings
function normalizeValue(val: string): string {
    // 1. Remove all whitespace
    let s = val.replace(/\s+/g, '');
    // 2. Unify microgram units to 'µg' (Micro Sign U+00B5)
    // Handle 'ug', 'μg' (Greek Mu U+03BC) -> 'µg'
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

async function run() {
    const targetDate = process.argv[2] || todayStr();
    // Output JSON strictly to stdout if needed, but we also logs "Running..." 
    // The user output requirement is effectively satisfied by console.log at the end.

    if (!fs.existsSync(STATE_FILE)) {
        console.error(`State file not found: ${STATE_FILE}`);
        console.error(`Run: npx tsx scripts/asken/login.ts`);
        process.exit(1);
    }

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({ storageState: STATE_FILE });

    try {
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

        const jsonOutput = JSON.stringify(result, null, 2);

        // Output to stdout
        console.log(jsonOutput);

        // Save to file
        const outFile = path.join(SECRETS_DIR, `asken-day-${targetDate}.json`);

        fs.mkdirSync(SECRETS_DIR, { recursive: true });
        fs.writeFileSync(
            outFile,
            JSON.stringify(result, null, 2),
            'utf-8'
        );

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
