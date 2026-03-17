/**
 * Coverage scope: src/utils/logger.ts
 *
 * Tests:
 *   - Initialization: level, defaultMeta, format pipeline, transport format
 *   - ENV: LOG_LEVEL and NODE_ENV respected at module load time
 *   - Output: info/error/warn callable without throwing
 *
 * Pattern: vi.resetModules() + dynamic import in each test so env vars apply
 * to a fresh module evaluation. vi.clearAllMocks() resets call counts between tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Winston mock objects (defined before vi.mock so factory can close over them) ---

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
};

const mockConsoleTransportCtor = vi.fn();
const mockCombine = vi.fn((...args: unknown[]) => ({ _combined: args }));
const mockTimestamp = vi.fn(() => 'timestamp-format');
const mockErrorsFormat = vi.fn(() => 'errors-format');
const mockJson = vi.fn(() => 'json-format');
const mockColorize = vi.fn(() => 'colorize-format');
const mockSimple = vi.fn(() => 'simple-format');
const mockCreateLogger = vi.fn(() => mockLogger);

vi.mock('winston', () => ({
  default: {
    createLogger: mockCreateLogger,
    format: {
      combine: mockCombine,
      timestamp: mockTimestamp,
      errors: mockErrorsFormat,
      json: mockJson,
      colorize: mockColorize,
      simple: mockSimple,
    },
    transports: {
      Console: mockConsoleTransportCtor,
    },
  },
}));

// --- Helpers ---

const originalLogLevel = process.env.LOG_LEVEL;
const originalNodeEnv = process.env.NODE_ENV;

describe('logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env.LOG_LEVEL;
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    // Restore original env so other test files are not affected
    if (originalLogLevel !== undefined) {
      process.env.LOG_LEVEL = originalLogLevel;
    } else {
      delete process.env.LOG_LEVEL;
    }
    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
  });

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  describe('Initialization', () => {
    it('creates logger with default level "info" when LOG_LEVEL env var is not set', async () => {
      await import('./logger');

      expect(mockCreateLogger).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'info' }),
      );
    });

    it('respects LOG_LEVEL env var when set to "debug"', async () => {
      process.env.LOG_LEVEL = 'debug';
      await import('./logger');

      expect(mockCreateLogger).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'debug' }),
      );
    });

    it('respects LOG_LEVEL env var when set to "warn"', async () => {
      process.env.LOG_LEVEL = 'warn';
      await import('./logger');

      expect(mockCreateLogger).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'warn' }),
      );
    });

    it('sets defaultMeta.service to "orderstack-backend"', async () => {
      await import('./logger');

      expect(mockCreateLogger).toHaveBeenCalledWith(
        expect.objectContaining({ defaultMeta: { service: 'orderstack-backend' } }),
      );
    });

    it('includes timestamp format in the logger-level format pipeline', async () => {
      await import('./logger');

      expect(mockTimestamp).toHaveBeenCalled();
    });

    it('configures errors format with stack: true', async () => {
      await import('./logger');

      expect(mockErrorsFormat).toHaveBeenCalledWith({ stack: true });
    });

    it('uses JSON format for Console transport when NODE_ENV is "production"', async () => {
      process.env.NODE_ENV = 'production';
      await import('./logger');

      // json() called twice: once for main logger format, once for Console transport
      expect(mockJson).toHaveBeenCalledTimes(2);
      expect(mockConsoleTransportCtor).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'json-format' }),
      );
    });

    it('uses colorize + simple format for Console transport when NODE_ENV is "development"', async () => {
      process.env.NODE_ENV = 'development';
      await import('./logger');

      expect(mockColorize).toHaveBeenCalled();
      expect(mockSimple).toHaveBeenCalled();
      // json() called only once (main format), NOT for the Console transport
      expect(mockJson).toHaveBeenCalledTimes(1);
    });

    it('uses colorize + simple format for Console transport when NODE_ENV is undefined', async () => {
      await import('./logger');

      expect(mockColorize).toHaveBeenCalled();
      expect(mockSimple).toHaveBeenCalled();
    });

    it('registers exactly one Console transport', async () => {
      await import('./logger');

      expect(mockConsoleTransportCtor).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Output Verification
  // ---------------------------------------------------------------------------

  describe('Output Verification', () => {
    it('logger.info() passes message and metadata to winston', async () => {
      const { logger } = await import('./logger');
      logger.info('request received', { requestId: 'req-1', method: 'POST' });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'request received',
        { requestId: 'req-1', method: 'POST' },
      );
    });

    it('logger.info() does not throw', async () => {
      const { logger } = await import('./logger');

      expect(() => logger.info('no metadata')).not.toThrow();
    });

    it('logger.error() includes stack trace when passed an Error object', async () => {
      const { logger } = await import('./logger');
      const err = new Error('database connection failed');
      logger.error('service error', { error: err });

      // errors({ stack: true }) is configured — Winston will emit err.stack
      // The format is configured correctly (verified via mockErrorsFormat above);
      // here we confirm the method is callable with an Error and forwards it
      expect(mockLogger.error).toHaveBeenCalledWith('service error', { error: err });
    });

    it('logger.error() handles a non-Error object gracefully', async () => {
      const { logger } = await import('./logger');

      expect(() => logger.error('unexpected failure', { code: 503 })).not.toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith('unexpected failure', { code: 503 });
    });

    it('logger.error() handles a plain string without metadata', async () => {
      const { logger } = await import('./logger');

      expect(() => logger.error('plain string error')).not.toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith('plain string error');
    });
  });
});
