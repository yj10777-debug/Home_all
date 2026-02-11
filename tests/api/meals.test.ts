/**
 * Tests for /api/meals (GET, POST) and /api/meals/[id] (DELETE).
 * Prisma and auth are mocked via jest.mock.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

const mockFindMany = jest.fn();
const mockTransaction = jest.fn();
const mockFindUnique = jest.fn();
const mockFindUniqueOrThrow = jest.fn();
const mockCreate = jest.fn();
const mockCreateMany = jest.fn();
const mockDeleteMany = jest.fn();
const mockDelete = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    mealLog: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findUniqueOrThrow: (...args: unknown[]) => mockFindUniqueOrThrow(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
    },
    mealItem: {
      createMany: (...args: unknown[]) => mockCreateMany(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => mockTransaction(fn),
  },
}));

const mockGetUserIdFromRequest = jest.fn();
jest.mock('@/lib/auth', () => ({
  getUserIdFromRequest: (req: NextApiRequest) => {
    const result = mockGetUserIdFromRequest(req);
    // 同期関数モック: null の場合は UNAUTHORIZED を throw
    if (result === null) throw new Error('UNAUTHORIZED');
    return result;
  },
}));

function mockRes(): NextApiResponse & { _status?: number; _body?: unknown; _ended?: boolean } {
  const res = {
    _status: undefined as number | undefined,
    _body: undefined as unknown,
    _ended: false,
    status(code: number) {
      (this as typeof res)._status = code;
      return this;
    },
    json(body: unknown) {
      (this as typeof res)._body = body;
      (this as typeof res)._ended = true;
      return this;
    },
    end() {
      (this as typeof res)._ended = true;
      return this;
    },
    setHeader: jest.fn().mockReturnThis(),
  } as unknown as NextApiResponse & { _status?: number; _body?: unknown; _ended?: boolean };
  return res;
}

function mockReq(overrides: Partial<NextApiRequest> = {}): NextApiRequest {
  return {
    method: 'GET',
    headers: {},
    query: {},
    body: undefined,
    ...overrides,
  } as NextApiRequest;
}

const TEST_USER = 'user-test-123';
const VALID_PAYLOAD = {
  mealLog: {
    loggedAt: '2026-01-25T12:30:00+09:00',
    mealType: 'lunch',
    source: 'asken',
  },
  items: [
    { name: '鶏むね肉（皮なし）', amount: 150, unit: 'g', cal: 330, protein: 33, fat: 6, carb: 0 },
    { name: 'ごはん', amount: 150, unit: 'g', cal: 240, protein: 4, fat: 1, carb: 53 },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  // getUserIdFromRequest は同期関数 — userId 文字列を返す
  mockGetUserIdFromRequest.mockReturnValue(TEST_USER);
  const consoleSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
  (global as { _consoleInfoRestore?: jest.SpyInstance })._consoleInfoRestore = consoleSpy;
});

afterEach(() => {
  const rest = (global as { _consoleInfoRestore?: jest.SpyInstance })._consoleInfoRestore;
  if (rest) rest.mockRestore();
});

describe('GET /api/meals', () => {
  it('returns 401 when Authorization header is missing', async () => {
    mockGetUserIdFromRequest.mockReturnValueOnce(null);
    const handler = (await import('@/pages/api/meals/index')).default;
    const req = mockReq();
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(401);
    expect(res._body).toEqual({ error: 'Unauthorized' });
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('returns 200 and mealLogs for authenticated user', async () => {
    const mealLogs = [
      { id: 'm1', userId: TEST_USER, loggedAt: new Date(), mealType: 'lunch', items: [] },
    ];
    mockFindMany.mockResolvedValueOnce(mealLogs);
    const handler = (await import('@/pages/api/meals/index')).default;
    const req = mockReq({ method: 'GET', query: {} });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect((res._body as { mealLogs: unknown[] }).mealLogs).toEqual(mealLogs);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: TEST_USER }),
        include: { items: true },
        orderBy: { loggedAt: 'asc' },
      })
    );
  });

  it('uses query date when provided', async () => {
    mockFindMany.mockResolvedValueOnce([]);
    const handler = (await import('@/pages/api/meals/index')).default;
    const req = mockReq({ method: 'GET', query: { date: '2026-01-25' } });
    const res = mockRes();
    await handler(req, res);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          loggedAt: {
            gte: new Date('2026-01-25T00:00:00'),
            lte: new Date('2026-01-25T23:59:59.999'),
          },
        }),
      })
    );
  });

  it('returns 405 for method other than GET/POST', async () => {
    const handler = (await import('@/pages/api/meals/index')).default;
    const req = mockReq({ method: 'DELETE' });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(405);
    expect(res._body).toEqual({ error: 'Method Not Allowed' });
  });
});

describe('POST /api/meals', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetUserIdFromRequest.mockReturnValueOnce(null);
    const handler = (await import('@/pages/api/meals/index')).default;
    const req = mockReq({ method: 'POST', body: VALID_PAYLOAD });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(401);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON body', async () => {
    const handler = (await import('@/pages/api/meals/index')).default;
    const req = mockReq({ method: 'POST', body: 'not json {{' });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect((res._body as { error: string }).error).toBe('Invalid JSON');
  });

  it('returns 400 for validation error (missing mealType)', async () => {
    const handler = (await import('@/pages/api/meals/index')).default;
    const invalid = { ...VALID_PAYLOAD, mealLog: { ...VALID_PAYLOAD.mealLog, mealType: '' } };
    const req = mockReq({ method: 'POST', body: invalid });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect((res._body as { error: string }).error).toBe('Validation error');
  });

  it('returns 201 with created MealLog and items', async () => {
    const createdMeal = {
      id: 'meal-new-1',
      userId: TEST_USER,
      loggedAt: new Date('2026-01-25T12:30:00+09:00'),
      mealType: 'lunch',
      source: 'asken',
      note: null,
      items: [
        { id: 'i1', mealId: 'meal-new-1', name: '鶏むね肉（皮なし）', cal: 330, amount: 150, unit: 'g', protein: 33, fat: 6, carb: 0 },
        { id: 'i2', mealId: 'meal-new-1', name: 'ごはん', cal: 240, amount: 150, unit: 'g', protein: 4, fat: 1, carb: 53 },
      ],
    };
    // meals/index.ts は prisma.mealLog.create を直接呼ぶ（$transaction 不使用）
    mockCreate.mockResolvedValueOnce(createdMeal);
    const handler = (await import('@/pages/api/meals/index')).default;
    const req = mockReq({ method: 'POST', body: VALID_PAYLOAD });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(201);
    expect((res._body as { id: string }).id).toBe('meal-new-1');
    expect((res._body as { items: unknown[] }).items).toHaveLength(2);
  });
});

describe('DELETE /api/meals/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetUserIdFromRequest.mockReturnValueOnce(null);
    const handler = (await import('@/pages/api/meals/[id]')).default;
    const req = mockReq({ method: 'DELETE', query: { id: 'm1' } });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(401);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('returns 404 when meal does not exist', async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    const handler = (await import('@/pages/api/meals/[id]')).default;
    const req = mockReq({ method: 'DELETE', query: { id: 'nonexistent' } });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(404);
    expect(res._body).toEqual({ error: 'Not found' });
  });

  it('returns 403 when meal belongs to another user', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'm1', userId: 'other-user' });
    const handler = (await import('@/pages/api/meals/[id]')).default;
    const req = mockReq({ method: 'DELETE', query: { id: 'm1' } });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(403);
    expect(res._body).toEqual({ error: 'Forbidden' });
  });

  it('returns 204 and deletes meal + items', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'm1', userId: TEST_USER });
    mockTransaction.mockResolvedValueOnce(undefined);
    const handler = (await import('@/pages/api/meals/[id]')).default;
    const req = mockReq({ method: 'DELETE', query: { id: 'm1' } });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(204);
    expect(res._ended).toBe(true);
    expect(mockTransaction).toHaveBeenCalled();
  });

  it('returns 405 for non-DELETE method', async () => {
    const handler = (await import('@/pages/api/meals/[id]')).default;
    const req = mockReq({ method: 'GET', query: { id: 'm1' } });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(405);
  });
});
