/**
 * 歩数バックフィルスクリプト（並列実行版）
 * 既存の run.ts を子プロセスとして呼び出し、5並列で実行して高速化する
 */
import { spawn } from 'child_process';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 並列実行数
const CONCURRENCY = 5;

/** run.ts を子プロセスとして実行 */
function runAsken(dateStr: string): Promise<{ date: string; result: { steps: number; calories: number } | null }> {
    return new Promise((resolve) => {
        const proc = spawn('npx', ['tsx', 'scripts/asken/run.ts', dateStr], {
            cwd: process.cwd(),
            env: { ...process.env, HEADLESS: 'true' },
            shell: true,
        });

        let stdout = '';
        let stderr = '';
        proc.stdout?.on('data', (d) => { stdout += d.toString(); });
        proc.stderr?.on('data', (d) => { stderr += d.toString(); });

        proc.on('close', (code) => {
            if (code !== 0) {
                // console.error(`  [${dateStr}] run.ts exit ${code}: ${stderr.substring(0, 50)}...`);
                resolve({ date: dateStr, result: null });
                return;
            }

            try {
                const jsonMatch = stdout.match(/\{[\s\S]*\}/);
                if (!jsonMatch) {
                    resolve({ date: dateStr, result: null });
                    return;
                }
                const data = JSON.parse(jsonMatch[0]);
                if (data.exercise) {
                    resolve({
                        date: dateStr,
                        result: {
                            steps: data.exercise.steps || 0,
                            calories: data.exercise.calories || 0,
                        },
                    });
                } else {
                    resolve({ date: dateStr, result: null });
                }
            } catch {
                resolve({ date: dateStr, result: null });
            }
        });
    });
}

async function main() {
    // 歩数未取得 or 誤って0歩の日付を取得
    // すでに取得済みのものもあるので、steps: null or 0 のものだけ対象にする
    // ただし0歩は「データなし」の意味で残したい場合もあるが、今回は全部再取得する
    const rows = await prisma.dailyData.findMany({
        where: {
            date: { gte: '2026-01-01', lte: '2026-02-14' },
            OR: [{ steps: null }, { steps: 0 }],
        },
        select: { date: true },
        orderBy: { date: 'asc' },
    });

    if (rows.length === 0) {
        console.log('歩数未取得の日付はありません');
        await prisma.$disconnect();
        return;
    }

    console.log(`対象: ${rows.length} 日 (並列数: ${CONCURRENCY})`);
    const dates = rows.map(r => r.date);

    let successCount = 0;
    let noDataCount = 0;
    let errorCount = 0;

    // チャンク処理関数
    const processChunk = async (chunkDates: string[]) => {
        const promises = chunkDates.map(d => runAsken(d));
        const results = await Promise.all(promises);

        for (const res of results) {
            if (res.result && res.result.steps > 0) {
                await prisma.dailyData.update({
                    where: { date: res.date },
                    data: {
                        steps: res.result.steps,
                        exerciseCalories: res.result.calories,
                    },
                });
                console.log(`✅ ${res.date}: ${res.result.steps.toLocaleString()}歩 / ${res.result.calories}kcal`);
                successCount++;
            } else if (res.result) {
                console.log(`⚠️ ${res.date}: データなし`);
                // 0歩として記録しないでおくか、明示的に0にするか。run.tsの結果があれば一応信頼して0を入れてもいいが、
                // 今回は「データなし」を維持したいので更新しない（or nullのまま）
                // ただし既に0が入っている場合はそのまま
                noDataCount++;
            } else {
                console.log(`❌ ${res.date}: 取得失敗`);
                errorCount++;
            }
        }
    };

    // 全体をチャンクに分けて実行
    for (let i = 0; i < dates.length; i += CONCURRENCY) {
        const chunk = dates.slice(i, i + CONCURRENCY);
        console.log(`Processing chunk ${i / CONCURRENCY + 1}/${Math.ceil(dates.length / CONCURRENCY)} (${chunk.join(', ')})...`);
        await processChunk(chunk);
    }

    await prisma.$disconnect();
    console.log(`\n完了: 成功=${successCount}, データなし=${noDataCount}, エラー=${errorCount}`);
}

main().catch(console.error);
