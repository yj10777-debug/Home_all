import type { NextApiRequest, NextApiResponse } from 'next';
import { getUserIdFromRequest } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
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

  if (req.method !== 'DELETE') {
    res.setHeader('Allow', ['DELETE']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const id = req.query.id as string;
  if (!id) {
    return res.status(400).json({ error: 'Missing meal id' });
  }

  try {
    const existing = await prisma.mealLog.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Not found' });
    }
    if (existing.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.mealItem.deleteMany({ where: { mealId: id } });
      await tx.mealLog.delete({ where: { id } });
    });

    console.info(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        userId,
        operation: 'delete',
        id,
      })
    );
    return res.status(204).end();
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Unexpected error' });
  }
}
