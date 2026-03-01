import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api } from '../test/request-helper';
import { getPrismaMock, resetPrismaMock } from '../test/prisma-mock';
import { RESTAURANT_ID } from '../test/fixtures';

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

vi.mock('../utils/device-code', () => ({
  generateDeviceCode: vi.fn().mockResolvedValue('AB12C'),
}));

const prisma = getPrismaMock();

const BASE_URL = `/api/merchant/${RESTAURANT_ID}/devices`;
const DEVICE_ID = '11111111-1111-4111-a111-111111111111';

const DEVICE = {
  id: DEVICE_ID,
  restaurantId: RESTAURANT_ID,
  deviceCode: 'AB12C',
  deviceName: 'Front Counter POS',
  deviceType: 'terminal',
  posMode: 'quick_service',
  modeId: null,
  locationId: null,
  status: 'pending',
  lastSeenAt: null,
  pairedAt: null,
  hardwareInfo: null,
  expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  mode: null,
};

const BROWSER_DEVICE = {
  id: DEVICE_ID,
  restaurantId: RESTAURANT_ID,
  deviceCode: null,
  deviceName: 'Browser',
  deviceType: 'terminal',
  posMode: 'full_service',
  modeId: null,
  locationId: null,
  status: 'active',
  lastSeenAt: null,
  pairedAt: new Date('2025-01-01'),
  hardwareInfo: { platform: 'MacIntel' },
  expiresAt: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

beforeEach(() => {
  resetPrismaMock();
});

// ============ GET /:merchantId/devices ============

describe('GET /api/merchant/:merchantId/devices', () => {
  it('returns 401 without auth token', async () => {
    const res = await api.anonymous().get(BASE_URL);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  it('returns empty array when no devices exist', async () => {
    prisma.device.findMany.mockResolvedValue([]);

    const res = await api.owner.get(BASE_URL);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns devices with isOnline computed field', async () => {
    prisma.device.findMany.mockResolvedValue([DEVICE]);

    const res = await api.owner.get(BASE_URL);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(DEVICE_ID);
    expect(res.body[0].deviceName).toBe('Front Counter POS');
    expect(res.body[0]).toHaveProperty('isOnline');
    expect(res.body[0].isOnline).toBe(false);
  });

  it('marks device online when lastSeenAt is within 30 seconds', async () => {
    const recentDevice = { ...DEVICE, lastSeenAt: new Date(Date.now() - 10_000) };
    prisma.device.findMany.mockResolvedValue([recentDevice]);

    const res = await api.owner.get(BASE_URL);
    expect(res.status).toBe(200);
    expect(res.body[0].isOnline).toBe(true);
  });

  it('accepts status query filter', async () => {
    prisma.device.findMany.mockResolvedValue([]);

    const res = await api.owner.get(`${BASE_URL}?status=active`);
    expect(res.status).toBe(200);
    expect(prisma.device.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'active' }),
      }),
    );
  });

  it('accepts type query filter', async () => {
    prisma.device.findMany.mockResolvedValue([]);

    const res = await api.owner.get(`${BASE_URL}?type=kds`);
    expect(res.status).toBe(200);
    expect(prisma.device.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deviceType: 'kds' }),
      }),
    );
  });
});

// ============ POST /:merchantId/devices ============

describe('POST /api/merchant/:merchantId/devices', () => {
  const validBody = {
    deviceName: 'Front Counter POS',
    deviceType: 'terminal',
    posMode: 'quick_service',
  };

  it('returns 401 without auth token', async () => {
    const res = await api.anonymous().post(BASE_URL).send(validBody);
    expect(res.status).toBe(401);
  });

  it('creates a device and returns 201 with deviceCode', async () => {
    prisma.device.create.mockResolvedValue(DEVICE);

    const res = await api.owner.post(BASE_URL).send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(DEVICE_ID);
    expect(res.body.deviceName).toBe('Front Counter POS');
    expect(prisma.device.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          restaurantId: RESTAURANT_ID,
          deviceCode: 'AB12C',
          deviceName: 'Front Counter POS',
          deviceType: 'terminal',
          posMode: 'quick_service',
          status: 'pending',
        }),
      }),
    );
  });

  it('creates a device with optional modeId and locationId', async () => {
    const modeId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
    const locationId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
    prisma.device.create.mockResolvedValue({ ...DEVICE, modeId, locationId });

    const res = await api.owner.post(BASE_URL).send({ ...validBody, modeId, locationId });
    expect(res.status).toBe(201);
    expect(prisma.device.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ modeId, locationId }),
      }),
    );
  });

  it('returns 400 when deviceName is missing', async () => {
    const res = await api.owner.post(BASE_URL).send({ deviceType: 'terminal' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 400 when deviceName is empty string', async () => {
    const res = await api.owner.post(BASE_URL).send({ ...validBody, deviceName: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 400 when deviceName exceeds 100 characters', async () => {
    const res = await api.owner.post(BASE_URL).send({
      ...validBody,
      deviceName: 'A'.repeat(101),
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 400 when deviceType is invalid', async () => {
    const res = await api.owner.post(BASE_URL).send({ ...validBody, deviceType: 'tablet' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 400 when deviceType is missing', async () => {
    const res = await api.owner.post(BASE_URL).send({ deviceName: 'POS 1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

});

// ============ POST /:merchantId/devices/register-browser ============

describe('POST /api/merchant/:merchantId/devices/register-browser', () => {
  const REGISTER_URL = `${BASE_URL}/register-browser`;

  const validBody = {
    posMode: 'full_service',
  };

  it('returns 401 without auth token', async () => {
    const res = await api.anonymous().post(REGISTER_URL).send(validBody);
    expect(res.status).toBe(401);
  });

  it('registers a browser device and returns 201', async () => {
    prisma.device.create.mockResolvedValue(BROWSER_DEVICE);

    const res = await api.owner.post(REGISTER_URL).send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.deviceName).toBe('Browser');
    expect(res.body.deviceType).toBe('terminal');
    expect(res.body.status).toBe('active');
    expect(prisma.device.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          restaurantId: RESTAURANT_ID,
          deviceName: 'Browser',
          deviceType: 'terminal',
          posMode: 'full_service',
          status: 'active',
        }),
      }),
    );
  });

  it('registers a browser device with optional hardwareInfo', async () => {
    const hardwareInfo = { platform: 'MacIntel', osVersion: '14.0', screenSize: '1920x1080' };
    prisma.device.create.mockResolvedValue({ ...BROWSER_DEVICE, hardwareInfo });

    const res = await api.owner.post(REGISTER_URL).send({ ...validBody, hardwareInfo });
    expect(res.status).toBe(201);
    expect(prisma.device.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ hardwareInfo }),
      }),
    );
  });

  it('returns 400 when posMode is missing', async () => {
    const res = await api.owner.post(REGISTER_URL).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 400 when posMode is invalid', async () => {
    const res = await api.owner.post(REGISTER_URL).send({ posMode: 'invalid_mode' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

});

// ============ GET /:merchantId/devices/:id ============

describe('GET /api/merchant/:merchantId/devices/:id', () => {
  const url = `${BASE_URL}/${DEVICE_ID}`;

  it('returns 401 without auth token', async () => {
    const res = await api.anonymous().get(url);
    expect(res.status).toBe(401);
  });

  it('returns the device when found', async () => {
    prisma.device.findFirst.mockResolvedValue(DEVICE);

    const res = await api.owner.get(url);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(DEVICE_ID);
    expect(res.body.deviceName).toBe('Front Counter POS');
    expect(prisma.device.findFirst).toHaveBeenCalledWith({
      where: { id: DEVICE_ID, restaurantId: RESTAURANT_ID },
      include: { mode: true, teamMember: { select: { id: true, displayName: true } } },
    });
  });

  it('returns 404 when device does not exist', async () => {
    prisma.device.findFirst.mockResolvedValue(null);

    const res = await api.owner.get(url);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Device not found');
  });
});

// ============ PATCH /:merchantId/devices/:id ============

describe('PATCH /api/merchant/:merchantId/devices/:id', () => {
  const url = `${BASE_URL}/${DEVICE_ID}`;

  it('returns 401 without auth token', async () => {
    const res = await api.anonymous().patch(url).send({ deviceName: 'Updated POS' });
    expect(res.status).toBe(401);
  });

  it('updates the device and returns 200', async () => {
    const updated = { ...DEVICE, deviceName: 'Updated POS', status: 'active' };
    prisma.device.findFirst.mockResolvedValue(DEVICE);
    prisma.device.update.mockResolvedValue(updated);

    const res = await api.owner.patch(url).send({ deviceName: 'Updated POS', status: 'active' });
    expect(res.status).toBe(200);
    expect(res.body.deviceName).toBe('Updated POS');
    expect(res.body.status).toBe('active');
    expect(prisma.device.update).toHaveBeenCalledWith({
      where: { id: DEVICE_ID },
      data: { deviceName: 'Updated POS', status: 'active' },
    });
  });

  it('returns 404 when device does not exist', async () => {
    prisma.device.findFirst.mockResolvedValue(null);

    const res = await api.owner.patch(url).send({ deviceName: 'Updated POS' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Device not found');
  });

  it('returns 400 when deviceName is empty string', async () => {
    const res = await api.owner.patch(url).send({ deviceName: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 400 when deviceName exceeds 100 characters', async () => {
    const res = await api.owner.patch(url).send({ deviceName: 'A'.repeat(101) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 400 when status is an invalid enum value', async () => {
    const res = await api.owner.patch(url).send({ status: 'broken' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 400 when posMode is an invalid enum value', async () => {
    const res = await api.owner.patch(url).send({ posMode: 'cafe' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });
});

// ============ DELETE /:merchantId/devices/:id ============

describe('DELETE /api/merchant/:merchantId/devices/:id', () => {
  const url = `${BASE_URL}/${DEVICE_ID}`;

  it('returns 401 without auth token', async () => {
    const res = await api.anonymous().delete(url);
    expect(res.status).toBe(401);
  });

  it('deletes the device and returns 204', async () => {
    prisma.device.findFirst.mockResolvedValue(DEVICE);
    prisma.device.delete.mockResolvedValue(DEVICE);

    const res = await api.owner.delete(url);
    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
    expect(prisma.device.delete).toHaveBeenCalledWith({ where: { id: DEVICE_ID } });
  });

  it('returns 404 when device does not exist', async () => {
    prisma.device.findFirst.mockResolvedValue(null);

    const res = await api.owner.delete(url);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Device not found');
  });
});

// ============ POST /:merchantId/devices/:id/heartbeat ============

describe('POST /api/merchant/:merchantId/devices/:id/heartbeat', () => {
  const url = `${BASE_URL}/${DEVICE_ID}/heartbeat`;

  it('returns 401 without auth token', async () => {
    const res = await api.anonymous().post(url);
    expect(res.status).toBe(401);
  });

  it('updates lastSeenAt and returns success', async () => {
    const lastSeenAt = new Date();
    prisma.device.update.mockResolvedValue({ ...DEVICE, lastSeenAt });

    const res = await api.owner.post(url);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('lastSeenAt');
    expect(prisma.device.update).toHaveBeenCalledWith({
      where: { id: DEVICE_ID },
      data: { lastSeenAt: expect.any(Date) },
    });
  });

});
