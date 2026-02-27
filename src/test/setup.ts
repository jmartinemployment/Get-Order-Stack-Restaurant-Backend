import { vi, beforeEach } from 'vitest';

// Set env vars BEFORE any app code imports (auth.service.ts throws without JWT_SECRET)
process.env.JWT_SECRET = 'test-secret-key-for-integration-tests';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key_for_integration_tests';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_fake';
process.env.DELIVERY_CREDENTIALS_ENCRYPTION_KEY = 'test-encryption-key-32-chars-long!';
process.env.PAYPAL_CLIENT_ID = 'test-paypal-client-id';
process.env.PAYPAL_CLIENT_SECRET = 'test-paypal-client-secret';
process.env.PAYPAL_PARTNER_ID = 'test-paypal-partner-id';
process.env.PAYPAL_BN_CODE = 'test-paypal-bn-code';
process.env.PAYPAL_MODE = 'sandbox';
process.env.PAYPAL_WEBHOOK_ID = 'test-paypal-webhook-id';

// Mock @prisma/client globally — every file that does `new PrismaClient()` gets a mock.
// vi.mock factory runs in a hoisted scope, so we inline the proxy creation here.
vi.mock('@prisma/client', () => {
  // The actual proxy is defined in prisma-mock.ts and imported by tests.
  // Here we just need PrismaClient constructor to return the same shared singleton.
  // We use globalThis to share the instance between setup.ts and prisma-mock.ts.
  if (!(globalThis as any).__prismaMockProxy) {
    const modelCache = new Map();

    function createModelMock() {
      return {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({}),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        upsert: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        count: vi.fn().mockResolvedValue(0),
        aggregate: vi.fn().mockResolvedValue({}),
        groupBy: vi.fn().mockResolvedValue([]),
      };
    }

    const transactionMock = vi.fn(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return arg((globalThis as any).__prismaMockProxy);
      }
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      return arg;
    });

    const proxy = new Proxy(
      {
        $transaction: transactionMock,
        $connect: vi.fn().mockResolvedValue(undefined),
        $disconnect: vi.fn().mockResolvedValue(undefined),
        $queryRaw: vi.fn().mockResolvedValue([]),
        $executeRaw: vi.fn().mockResolvedValue(0),
      } as Record<string, unknown>,
      {
        get(target, prop: string) {
          if (prop in target) return target[prop];
          if (!modelCache.has(prop)) {
            modelCache.set(prop, createModelMock());
          }
          return modelCache.get(prop)!;
        },
      },
    );

    (globalThis as any).__prismaMockProxy = proxy;
    (globalThis as any).__prismaMockModelCache = modelCache;
    (globalThis as any).__prismaMockTransactionFn = transactionMock;
  }

  // Use a class so `new PrismaClient()` works correctly
  class MockPrismaClient {
    constructor() {
      return (globalThis as any).__prismaMockProxy;
    }
  }

  return {
    PrismaClient: MockPrismaClient,
  };
});

// Mock Stripe to prevent API key validation
vi.mock('stripe', () => {
  class MockStripe {
    paymentIntents = {
      create: vi.fn().mockResolvedValue({ id: 'pi_test', client_secret: 'secret' }),
      retrieve: vi.fn().mockResolvedValue({ id: 'pi_test' }),
    };
    accounts = {
      create: vi.fn().mockResolvedValue({ id: 'acct_test' }),
    };
    accountLinks = {
      create: vi.fn().mockResolvedValue({ url: 'https://connect.stripe.com/test' }),
    };
    webhooks = {
      constructEvent: vi.fn(),
    };
    subscriptions = {
      create: vi.fn().mockResolvedValue({ id: 'sub_test' }),
    };
  }
  return { default: MockStripe };
});

// Mock socket.io service to prevent real WebSocket connections
vi.mock('../services/socket.service', () => ({
  initializeSocketServer: vi.fn(),
  broadcastToSourceAndKDS: vi.fn(),
  broadcastToRestaurant: vi.fn(),
  getIO: vi.fn(() => ({
    to: vi.fn(() => ({ emit: vi.fn() })),
    emit: vi.fn(),
  })),
}));

// Suppress console.error/debug in tests (keep console.log for debugging)
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'debug').mockImplementation(() => {});
});
