import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { subDays, startOfDay, endOfDay, format } from 'date-fns';

const prisma = new PrismaClient();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    try {
        const today = new Date();
        const sevenDaysAgo = subDays(today, 6); // Include today, so go back 6 days

        const startDate = startOfDay(sevenDaysAgo);
        const endDate = endOfDay(today);

        // Fetch logs
        const logs = await prisma.mealLog.findMany({
            where: {
                loggedAt: {
                    gte: startDate,
                    lte: endDate,
                },
            },
            include: {
                items: true,
            },
        });

        // Map and Group by date (YYYY-MM-DD)
        const dailyStats = new Map<string, number>();

        // Initialize last 7 days with 0
        for (let i = 0; i <= 6; i++) {
            const date = subDays(today, i);
            const dateStr = format(date, 'yyyy-MM-dd');
            dailyStats.set(dateStr, 0);
        }

        logs.forEach(log => {
            const dateStr = format(new Date(log.loggedAt), 'yyyy-MM-dd');

            let calories = 0;
            if (log.totalCal !== null && log.totalCal !== undefined) {
                calories = log.totalCal;
            } else {
                // Sum items if totalCal is missing
                calories = log.items.reduce((sum, item) => sum + (item.cal || 0), 0);
            }

            const current = dailyStats.get(dateStr) || 0;
            dailyStats.set(dateStr, current + calories);
        });

        // Convert to array and sort by date
        const result = Array.from(dailyStats.entries())
            .map(([date, calories]) => ({
                date,
                calories: Math.round(calories), // Round to integer
            }))
            .sort((a, b) => a.date.localeCompare(b.date));

        res.status(200).json(result);

    } catch (error) {
        console.error('Error fetching weekly stats:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}
