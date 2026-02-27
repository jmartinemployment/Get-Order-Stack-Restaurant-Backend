import { vi } from 'vitest';

type MockFn = ReturnType<typeof vi.fn>;

interface ModelMock {
  findUnique: MockFn;
  findFirst: MockFn;
  findMany: MockFn;
  create: MockFn;
  createMany: MockFn;
  update: MockFn;
  updateMany: MockFn;
  upsert: MockFn;
  delete: MockFn;
  deleteMany: MockFn;
  count: MockFn;
  aggregate: MockFn;
  groupBy: MockFn;
  [key: string]: MockFn;
}

/**
 * Get the Prisma mock proxy for test assertions.
 * This returns the same singleton created by setup.ts via globalThis.
 *
 * Example:
 *   const prisma = getPrismaMock();
 *   prisma.combo.findMany.mockResolvedValue([{ id: '1', name: 'Test' }]);
 */
export function getPrismaMock(): Record<string, ModelMock> & {
  $transaction: MockFn;
  $connect: MockFn;
  $disconnect: MockFn;
  $queryRaw: MockFn;
  $executeRaw: MockFn;
} {
  return (globalThis as any).__prismaMockProxy;
}

/**
 * Reset all model mocks between tests.
 * Call this in beforeEach() to ensure test isolation.
 */
export function resetPrismaMock(): void {
  const modelCache = (globalThis as any).__prismaMockModelCache as Map<string, ModelMock>;
  const transactionMock = (globalThis as any).__prismaMockTransactionFn as MockFn;

  if (modelCache) {
    for (const model of modelCache.values()) {
      for (const [key, fn] of Object.entries(model)) {
        fn.mockReset();
        if (key === 'findMany' || key === 'groupBy') {
          fn.mockResolvedValue([]);
        } else if (key === 'count') {
          fn.mockResolvedValue(0);
        } else if (key === 'createMany' || key === 'updateMany' || key === 'deleteMany') {
          fn.mockResolvedValue({ count: 0 });
        } else {
          fn.mockResolvedValue(null);
        }
      }
    }
  }

  if (transactionMock) {
    transactionMock.mockReset();
    transactionMock.mockImplementation(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return arg((globalThis as any).__prismaMockProxy);
      }
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      return arg;
    });
  }
}
