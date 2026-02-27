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

const BASE_URL = `/api/restaurant/${RESTAURANT_ID}/printer-profiles`;
const PROFILE_ID = '11111111-1111-4111-a111-111111111111';
const PRINTER_ID = '22222222-2222-4222-a222-222222222222';

// ============ GET /printer-profiles ============

describe('GET /printer-profiles', () => {
  it('returns 401 without auth', async () => {
    const res = await api.anonymous().get(BASE_URL);
    expect(res.status).toBe(401);
  });

  it('returns printer profiles', async () => {
    prisma.printerProfile.findMany.mockResolvedValue([]);

    const res = await api.owner.get(BASE_URL);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ============ POST /printer-profiles ============

describe('POST /printer-profiles', () => {
  it('creates a printer profile', async () => {
    prisma.printerProfile.create.mockResolvedValue({
      id: PROFILE_ID,
      name: 'Main Profile',
      isDefault: false,
      routingRules: [],
    });

    const res = await api.owner.post(BASE_URL).send({
      name: 'Main Profile',
      isDefault: false,
      routingRules: [],
    });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Main Profile');
  });

  it('creates with routing rules', async () => {
    const rules = [
      { jobType: 'customer_receipt', printerId: PRINTER_ID, copies: 1, enabled: true },
      { jobType: 'kitchen_ticket', printerId: PRINTER_ID, copies: 2, enabled: true },
    ];
    prisma.printerProfile.create.mockResolvedValue({
      id: PROFILE_ID,
      name: 'Full Profile',
      isDefault: true,
      routingRules: rules,
    });
    prisma.printerProfile.updateMany.mockResolvedValue({ count: 0 });

    const res = await api.owner.post(BASE_URL).send({
      name: 'Full Profile',
      isDefault: true,
      routingRules: rules,
    });
    expect(res.status).toBe(201);
  });

  it('returns 400 for missing name', async () => {
    const res = await api.owner.post(BASE_URL).send({ isDefault: false });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid jobType in routing rule', async () => {
    const res = await api.owner.post(BASE_URL).send({
      name: 'Test',
      routingRules: [{ jobType: 'invalid', printerId: PRINTER_ID, copies: 1 }],
    });
    expect(res.status).toBe(400);
  });
});

// ============ PATCH /printer-profiles/:id ============

describe('PATCH /printer-profiles/:id', () => {
  it('updates a printer profile', async () => {
    prisma.printerProfile.findFirst.mockResolvedValue({ id: PROFILE_ID, restaurantId: RESTAURANT_ID });
    prisma.printerProfile.update.mockResolvedValue({ id: PROFILE_ID, name: 'Updated Profile' });

    const res = await api.owner.patch(`${BASE_URL}/${PROFILE_ID}`).send({ name: 'Updated Profile' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Profile');
  });

  it('returns 404 when profile not found', async () => {
    prisma.printerProfile.findFirst.mockResolvedValue(null);

    const res = await api.owner.patch(`${BASE_URL}/${PROFILE_ID}`).send({ name: 'Updated' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Printer profile not found');
  });
});

// ============ DELETE /printer-profiles/:id ============

describe('DELETE /printer-profiles/:id', () => {
  it('deletes a printer profile', async () => {
    prisma.printerProfile.findFirst.mockResolvedValue({ id: PROFILE_ID, restaurantId: RESTAURANT_ID });
    prisma.printerProfile.delete.mockResolvedValue({ id: PROFILE_ID });

    const res = await api.owner.delete(`${BASE_URL}/${PROFILE_ID}`);
    expect(res.status).toBe(204);
  });

  it('returns 404 when profile not found', async () => {
    prisma.printerProfile.findFirst.mockResolvedValue(null);

    const res = await api.owner.delete(`${BASE_URL}/${PROFILE_ID}`);
    expect(res.status).toBe(404);
  });
});
