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

const prisma = getPrismaMock();

beforeEach(() => {
  resetPrismaMock();
});

const BASE_URL = `/api/restaurant/${RESTAURANT_ID}/peripherals`;
const PERIPHERAL_ID = '11111111-1111-4111-a111-111111111111';
const PARENT_DEVICE_ID = '22222222-2222-4222-a222-222222222222';

// ============ GET /peripherals ============

describe('GET /peripherals', () => {
  it('returns 401 without auth', async () => {
    const res = await api.anonymous().get(BASE_URL);
    expect(res.status).toBe(401);
  });

  it('returns peripherals list', async () => {
    prisma.peripheralDevice.findMany.mockResolvedValue([]);

    const res = await api.owner.get(BASE_URL);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('filters by parentDeviceId query param', async () => {
    prisma.peripheralDevice.findMany.mockResolvedValue([]);

    const res = await api.owner.get(`${BASE_URL}?parentDeviceId=${PARENT_DEVICE_ID}`);
    expect(res.status).toBe(200);
  });
});

// ============ POST /peripherals ============

describe('POST /peripherals', () => {
  const VALID_PERIPHERAL = {
    parentDeviceId: PARENT_DEVICE_ID,
    type: 'cash_drawer',
    name: 'Main Cash Drawer',
    connectionType: 'usb',
  };

  it('creates a peripheral', async () => {
    prisma.device.findFirst.mockResolvedValue({ id: PARENT_DEVICE_ID, restaurantId: RESTAURANT_ID });
    prisma.peripheralDevice.create.mockResolvedValue({ id: PERIPHERAL_ID, ...VALID_PERIPHERAL });

    const res = await api.owner.post(BASE_URL).send(VALID_PERIPHERAL);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Main Cash Drawer');
  });

  it('returns 400 when parent device not found', async () => {
    prisma.device.findFirst.mockResolvedValue(null);

    const res = await api.owner.post(BASE_URL).send(VALID_PERIPHERAL);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Parent device not found in this restaurant');
  });

  it('returns 400 for invalid type', async () => {
    const res = await api.owner.post(BASE_URL).send({ ...VALID_PERIPHERAL, type: 'invalid' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid connectionType', async () => {
    const res = await api.owner.post(BASE_URL).send({ ...VALID_PERIPHERAL, connectionType: 'wifi' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing name', async () => {
    const res = await api.owner.post(BASE_URL).send({ ...VALID_PERIPHERAL, name: '' });
    expect(res.status).toBe(400);
  });
});

// ============ DELETE /peripherals/:id ============

describe('DELETE /peripherals/:id', () => {
  it('deletes a peripheral', async () => {
    prisma.peripheralDevice.findFirst.mockResolvedValue({ id: PERIPHERAL_ID, restaurantId: RESTAURANT_ID });
    prisma.peripheralDevice.delete.mockResolvedValue({ id: PERIPHERAL_ID });

    const res = await api.owner.delete(`${BASE_URL}/${PERIPHERAL_ID}`);
    expect(res.status).toBe(204);
  });

  it('returns 404 when peripheral not found', async () => {
    prisma.peripheralDevice.findFirst.mockResolvedValue(null);

    const res = await api.owner.delete(`${BASE_URL}/${PERIPHERAL_ID}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Peripheral not found');
  });
});
