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

const BASE_URL = `/api/restaurant/${RESTAURANT_ID}/device-modes`;
const MODE_ID = '11111111-1111-4111-a111-111111111111';

const VALID_MODE = {
  name: 'Full Service Mode',
  deviceType: 'terminal',
  isDefault: false,
  settings: {
    checkout: {
      defaultOrderType: 'dine-in',
      requireTableSelection: true,
      skipPaymentScreen: false,
      autoSendToKds: false,
      showTipPrompt: true,
      tipPresets: [15, 18, 20, 25],
    },
    receipt: {
      autoPrintReceipt: false,
      autoPrintKitchenTicket: true,
      printerProfileId: null,
    },
    security: {
      requirePinPerTransaction: false,
      inactivityTimeoutMinutes: 15,
      lockOnSleep: true,
    },
    display: {
      fontSize: 'medium',
      showImages: true,
      gridColumns: 3,
      categoryDisplayMode: 'tabs',
    },
  },
};

// ============ GET /device-modes ============

describe('GET /device-modes', () => {
  it('returns 401 without auth', async () => {
    const res = await api.anonymous().get(BASE_URL);
    expect(res.status).toBe(401);
  });

  it('returns device modes', async () => {
    prisma.deviceMode.findMany.mockResolvedValue([]);

    const res = await api.owner.get(BASE_URL);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ============ POST /device-modes ============

describe('POST /device-modes', () => {
  it('creates a device mode', async () => {
    prisma.deviceMode.create.mockResolvedValue({ id: MODE_ID, ...VALID_MODE });

    const res = await api.owner.post(BASE_URL).send(VALID_MODE);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Full Service Mode');
  });

  it('unsets existing default when creating default mode', async () => {
    prisma.deviceMode.updateMany.mockResolvedValue({ count: 1 });
    prisma.deviceMode.create.mockResolvedValue({ id: MODE_ID, ...VALID_MODE, isDefault: true });

    const res = await api.owner.post(BASE_URL).send({ ...VALID_MODE, isDefault: true });
    expect(res.status).toBe(201);
  });

  it('returns 400 for missing name', async () => {
    const res = await api.owner.post(BASE_URL).send({ ...VALID_MODE, name: '' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid deviceType', async () => {
    const res = await api.owner.post(BASE_URL).send({ ...VALID_MODE, deviceType: 'invalid' });
    expect(res.status).toBe(400);
  });
});

// ============ PATCH /device-modes/:id ============

describe('PATCH /device-modes/:id', () => {
  it('updates a device mode', async () => {
    prisma.deviceMode.findFirst.mockResolvedValue({ id: MODE_ID, restaurantId: RESTAURANT_ID, deviceType: 'terminal' });
    prisma.deviceMode.update.mockResolvedValue({ id: MODE_ID, name: 'Updated Mode' });

    const res = await api.owner.patch(`${BASE_URL}/${MODE_ID}`).send({ name: 'Updated Mode' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Mode');
  });

  it('returns 404 when mode not found', async () => {
    prisma.deviceMode.findFirst.mockResolvedValue(null);

    const res = await api.owner.patch(`${BASE_URL}/${MODE_ID}`).send({ name: 'Updated' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Device mode not found');
  });
});

// ============ DELETE /device-modes/:id ============

describe('DELETE /device-modes/:id', () => {
  it('deletes a device mode', async () => {
    prisma.deviceMode.findFirst.mockResolvedValue({ id: MODE_ID, restaurantId: RESTAURANT_ID });
    prisma.device.count.mockResolvedValue(0);
    prisma.deviceMode.delete.mockResolvedValue({ id: MODE_ID });

    const res = await api.owner.delete(`${BASE_URL}/${MODE_ID}`);
    expect(res.status).toBe(204);
  });

  it('returns 404 when mode not found', async () => {
    prisma.deviceMode.findFirst.mockResolvedValue(null);

    const res = await api.owner.delete(`${BASE_URL}/${MODE_ID}`);
    expect(res.status).toBe(404);
  });

  it('returns 409 when devices are using the mode', async () => {
    prisma.deviceMode.findFirst.mockResolvedValue({ id: MODE_ID, restaurantId: RESTAURANT_ID });
    prisma.device.count.mockResolvedValue(3);

    const res = await api.owner.delete(`${BASE_URL}/${MODE_ID}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('3 device(s) are using it');
  });
});
