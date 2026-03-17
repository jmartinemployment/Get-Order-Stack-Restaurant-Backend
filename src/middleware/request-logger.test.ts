/**
 * requestLogger — FEATURE-15 Tests
 *
 * Covers:
 * - Skips logging for /health endpoint
 * - Logs info for 2xx responses
 * - Logs warn for 4xx responses
 * - Logs error for 5xx responses
 * - Includes method, path, status, duration, userId, ip in log
 * - Calls next() for all requests
 * - Handles missing user object gracefully
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestLogger } from './request-logger';
import { Request, Response } from 'express';
import { EventEmitter } from 'node:events';

vi.mock('../utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import { logger } from '../utils/logger';
const mockLogger = logger as unknown as Record<string, ReturnType<typeof vi.fn>>;

function createMockReq(overrides: Partial<Request & { user?: { teamMemberId?: string } }> = {}): Request {
  return {
    method: 'GET',
    path: '/api/test',
    ip: '127.0.0.1',
    ...overrides,
  } as unknown as Request;
}

function createMockRes(statusCode: number): Response & EventEmitter {
  const emitter = new EventEmitter();
  const res = Object.assign(emitter, {
    statusCode,
    getHeader: vi.fn(),
    setHeader: vi.fn(),
  });
  return res as unknown as Response & EventEmitter;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('requestLogger', () => {
  it('calls next() for every request', () => {
    const next = vi.fn();
    requestLogger(createMockReq(), createMockRes(200) as unknown as Response, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('skips logging for /health endpoint', () => {
    const next = vi.fn();
    const res = createMockRes(200);
    requestLogger(createMockReq({ path: '/health' }), res as unknown as Response, next);

    expect(next).toHaveBeenCalledOnce();
    // Emit finish — should not log
    res.emit('finish');
    expect(mockLogger.info).not.toHaveBeenCalled();
    expect(mockLogger.warn).not.toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('logs info for 200 response', () => {
    const next = vi.fn();
    const res = createMockRes(200);
    requestLogger(createMockReq(), res as unknown as Response, next);
    res.emit('finish');

    expect(mockLogger.info).toHaveBeenCalledWith('HTTP request', expect.objectContaining({
      method: 'GET',
      path: '/api/test',
      status: 200,
    }));
  });

  it('logs info for 201 response', () => {
    const next = vi.fn();
    const res = createMockRes(201);
    requestLogger(createMockReq(), res as unknown as Response, next);
    res.emit('finish');

    expect(mockLogger.info).toHaveBeenCalled();
  });

  it('logs warn for 400 response', () => {
    const next = vi.fn();
    const res = createMockRes(400);
    requestLogger(createMockReq(), res as unknown as Response, next);
    res.emit('finish');

    expect(mockLogger.warn).toHaveBeenCalledWith('HTTP request', expect.objectContaining({
      status: 400,
    }));
  });

  it('logs warn for 401 response', () => {
    const next = vi.fn();
    const res = createMockRes(401);
    requestLogger(createMockReq(), res as unknown as Response, next);
    res.emit('finish');

    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('logs warn for 404 response', () => {
    const next = vi.fn();
    const res = createMockRes(404);
    requestLogger(createMockReq(), res as unknown as Response, next);
    res.emit('finish');

    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('logs error for 500 response', () => {
    const next = vi.fn();
    const res = createMockRes(500);
    requestLogger(createMockReq(), res as unknown as Response, next);
    res.emit('finish');

    expect(mockLogger.error).toHaveBeenCalledWith('HTTP request', expect.objectContaining({
      status: 500,
    }));
  });

  it('logs error for 503 response', () => {
    const next = vi.fn();
    const res = createMockRes(503);
    requestLogger(createMockReq(), res as unknown as Response, next);
    res.emit('finish');

    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('includes userId when user is present on request', () => {
    const next = vi.fn();
    const req = createMockReq({ user: { teamMemberId: 'user-123' } } as Partial<Request>);
    const res = createMockRes(200);
    requestLogger(req, res as unknown as Response, next);
    res.emit('finish');

    expect(mockLogger.info).toHaveBeenCalledWith('HTTP request', expect.objectContaining({
      userId: 'user-123',
    }));
  });

  it('userId is undefined when no user on request', () => {
    const next = vi.fn();
    const res = createMockRes(200);
    requestLogger(createMockReq(), res as unknown as Response, next);
    res.emit('finish');

    expect(mockLogger.info).toHaveBeenCalledWith('HTTP request', expect.objectContaining({
      userId: undefined,
    }));
  });

  it('includes ip address', () => {
    const next = vi.fn();
    const res = createMockRes(200);
    requestLogger(createMockReq({ ip: '10.0.0.5' }), res as unknown as Response, next);
    res.emit('finish');

    expect(mockLogger.info).toHaveBeenCalledWith('HTTP request', expect.objectContaining({
      ip: '10.0.0.5',
    }));
  });

  it('includes duration (non-negative number)', () => {
    const next = vi.fn();
    const res = createMockRes(200);
    requestLogger(createMockReq(), res as unknown as Response, next);
    res.emit('finish');

    const logMeta = mockLogger.info.mock.calls[0][1];
    expect(typeof logMeta.duration).toBe('number');
    expect(logMeta.duration).toBeGreaterThanOrEqual(0);
  });
});
