/**
 * globalErrorHandler — FEATURE-15 Tests
 *
 * Covers:
 * - Returns 500 with generic message in production
 * - Returns 500 with error details in non-production
 * - Logs error with method, path, ip, stack via logger.error
 * - Handles errors without stack trace
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { globalErrorHandler } from './error-handler';
import { Request, Response, NextFunction } from 'express';

vi.mock('../utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import { logger } from '../utils/logger';
const mockLogger = logger as unknown as { error: ReturnType<typeof vi.fn> };

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    path: '/test',
    ip: '127.0.0.1',
    ...overrides,
  } as Request;
}

function mockRes(): Response & { _status: number; _json: unknown } {
  const res = {
    _status: 0,
    _json: null,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(data: unknown) {
      res._json = data;
      return res;
    },
  };
  return res as unknown as Response & { _status: number; _json: unknown };
}

const noop: NextFunction = () => {};

describe('globalErrorHandler', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    vi.clearAllMocks();
  });

  it('returns 500 with generic message in production', () => {
    process.env.NODE_ENV = 'production';
    const res = mockRes();
    globalErrorHandler(new Error('secret details'), mockReq(), res as unknown as Response, noop);
    expect(res._status).toBe(500);
    expect((res._json as { error: string }).error).toBe('Internal server error');
    expect((res._json as Record<string, unknown>).stack).toBeUndefined();
  });

  it('returns 500 with error details in non-production', () => {
    process.env.NODE_ENV = 'development';
    const res = mockRes();
    globalErrorHandler(new Error('debug info'), mockReq(), res as unknown as Response, noop);
    expect(res._status).toBe(500);
    expect((res._json as { error: string }).error).toBe('debug info');
    expect((res._json as { stack?: string }).stack).toBeDefined();
  });

  it('returns 500 with error details in test environment', () => {
    process.env.NODE_ENV = 'test';
    const res = mockRes();
    globalErrorHandler(new Error('test error'), mockReq(), res as unknown as Response, noop);
    expect(res._status).toBe(500);
    expect((res._json as { error: string }).error).toBe('test error');
  });

  it('logs error with structured metadata', () => {
    const req = mockReq({ method: 'POST', path: '/api/login', ip: '10.0.0.1' });
    const error = new Error('Something broke');
    globalErrorHandler(error, req, mockRes() as unknown as Response, noop);

    expect(mockLogger.error).toHaveBeenCalledWith('Unhandled error', expect.objectContaining({
      message: 'Something broke',
      method: 'POST',
      path: '/api/login',
      ip: '10.0.0.1',
    }));
  });

  it('logs stack trace when available', () => {
    const error = new Error('with stack');
    globalErrorHandler(error, mockReq(), mockRes() as unknown as Response, noop);

    const logCall = mockLogger.error.mock.calls[0][1];
    expect(logCall.stack).toBeDefined();
    expect(logCall.stack).toContain('Error: with stack');
  });
});
