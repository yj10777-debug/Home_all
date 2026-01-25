import type { NextApiRequest, NextApiResponse } from 'next';
import { getUserIdFromRequest } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createMealSchema } from '@/lib/schemas/meal';
import type { MealLog, MealItem } from '@prisma/client';

export type MealLogWithItems = MealLog & { items: MealItem[] };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'GET') {
    let userId: string;
    try {
      userId = getUserIdFromRequest(req);
    } catch (e: any) {
      if (e.message === 'UNAUTHORIZED') {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      console.error(e);
      return res.status(500).json({ error: 'Server configuration error' });
    }
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const dateStr = (req.query.date as string) || new Date().toISOString().slice(0, 10);
    const parsed = /^\d{4}-\d{2}-\d{2}$/.exec(dateStr);
    const date = parsed ? parsed[0] : new Date().toISOString().slice(0, 10);
    const start = new Date(`${date}T00:00:00`);
    const end = new Date(`${date}T23:59:59.999`);

    try {
      const mealLogs = await prisma.mealLog.findMany({
        where: { userId, loggedAt: { gte: start, lte: end } },
        include: { items: true },
        orderBy: { loggedAt: 'asc' },
      });
      return res.status(200).json({ mealLogs });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'Unexpected error' });
    }
  }

  if (req.method === 'POST') {
    let userId: string;
    try {
      userId = getUserIdFromRequest(req);
    } catch (e: any) {
      // auth.ts が投げる種別に合わせる
      if (e.message === 'UNAUTHORIZED') {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      console.error(e);
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // userId が空/undefinedなら即エラー
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    let body: unknown;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      return res.status(400).json({ error: 'Invalid JSON', details: [] });
    }
    const parsed = createMealSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation error',
        details: parsed.error.flatten(),
      });
    }

    const { mealLog: ml, items } = parsed.data;

    try {
      const created = await prisma.mealLog.create({
        data: {
          loggedAt: new Date(ml.loggedAt),
          mealType: ml.mealType,
          source: ml.source ?? null,
          note: ml.note ?? null,

          user: {
            connectOrCreate: {
              where: { id: userId },
              create: { id: userId },
            },
          },

          items: {
            create: items.map((it) => ({
              name: it.name,
              amount: it.amount ?? null,
              unit: it.unit ?? null,
              cal: it.cal ?? null,
              protein: it.protein ?? null,
              fat: it.fat ?? null,
              carb: it.carb ?? null,
            })),
          },
        },
        include: { items: true },
      });

      const result = created as MealLogWithItems;
      console.info(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          userId,
          operation: 'create',
          id: result.id,
        })
      );
      return res.status(201).json(result);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'Unexpected error' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method Not Allowed' });
}
