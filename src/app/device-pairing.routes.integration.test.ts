import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api } from '../test/request-helper';
import { getPrismaMock, resetPrismaMock } from '../test/prisma-mock';

vi.mock('../services/auth.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/auth.service')>();
  return {
    ...actual,
    authService: {
      ...actual.authService,
      validateSession: vi.fn().mockResolvedValue(true),
      verifyToken: actual.authService.verifyToken,
    },
  };
});

const prisma = getPrismaMock();

beforeEach(() => {
  resetPrismaMock();
});

const DEVICE_ID = '11111111-1111-4111-a111-111111111111';

// ============ POST /pair ============

describe('POST /api/devices/pair', () => {
  it('returns 400 for invalid code format', async () => {
    const res = await api.anonymous().post('/api/devices/pair').send({ code: 'AB' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when code not found', async () => {
    prisma.device.findUnique.mockResolvedValue(null);

    const res = await api.anonymous().post('/api/devices/pair').send({ code: 'AB12C' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid pairing code');
  });

  it('returns 400 when device already paired', async () => {
    prisma.device.findUnique.mockResolvedValue({
      id: DEVICE_ID,
      status: 'active',
      deviceCode: 'AB12C',
      expiresAt: new Date(Date.now() + 60_000),
    });

    const res = await api.anonymous().post('/api/devices/pair').send({ code: 'AB12C' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Device has already been paired or revoked');
  });

  it('returns 400 when code expired', async () => {
    prisma.device.findUnique.mockResolvedValue({
      id: DEVICE_ID,
      status: 'pending',
      deviceCode: 'AB12C',
      expiresAt: new Date(Date.now() - 60_000), // expired
    });

    const res = await api.anonymous().post('/api/devices/pair').send({ code: 'AB12C' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Pairing code has expired');
  });

  it('pairs device successfully', async () => {
    prisma.device.findUnique.mockResolvedValue({
      id: DEVICE_ID,
      status: 'pending',
      deviceCode: 'AB12C',
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.device.update.mockResolvedValue({
      id: DEVICE_ID,
      status: 'active',
      deviceCode: null,
      pairedAt: new Date(),
    });

    const res = await api.anonymous().post('/api/devices/pair').send({ code: 'AB12C' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
    expect(res.body.deviceCode).toBeNull();
  });
});

// ============ GET /devices/:id ============

describe('GET /api/devices/:id', () => {
  it('returns device by ID', async () => {
    prisma.device.findUnique.mockResolvedValue({
      id: DEVICE_ID,
      deviceName: 'POS Terminal 1',
      status: 'active',
      mode: null,
    });

    const res = await api.owner.get(`/api/devices/${DEVICE_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.deviceName).toBe('POS Terminal 1');
  });

  it('returns 404 when device not found', async () => {
    prisma.device.findUnique.mockResolvedValue(null);

    const res = await api.owner.get(`/api/devices/${DEVICE_ID}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Device not found');
  });
});
