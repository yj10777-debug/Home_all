import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
    const rows = await p.dailyData.findMany({
        where: { date: { gte: '2026-01-01', lte: '2026-02-14' }, steps: null },
        select: { date: true },
        orderBy: { date: 'asc' },
    });
    console.log(`歩数未取得: ${rows.length} 日`);
    rows.forEach(r => console.log(r.date));
    await p.$disconnect();
}
main();
