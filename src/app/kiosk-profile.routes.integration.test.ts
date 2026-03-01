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

const BASE_URL = `/api/merchant/${RESTAURANT_ID}/kiosk-profiles`;
const PROFILE_ID = '11111111-1111-4111-a111-111111111111';

const VALID_PROFILE = {
  name: 'Lobby Kiosk',
  posMode: 'quick_service',
  welcomeMessage: 'Welcome! Place your order here.',
  showImages: true,
  enabledCategories: [],
  requireNameForOrder: false,
  maxIdleSeconds: 120,
  enableAccessibility: false,
};

// ============ GET /kiosk-profiles ============

describe('GET /kiosk-profiles', () => {
  it('returns 401 without auth', async () => {
    const res = await api.anonymous().get(BASE_URL);
    expect(res.status).toBe(401);
  });

  it('returns kiosk profiles', async () => {
    prisma.kioskProfile.findMany.mockResolvedValue([]);

    const res = await api.owner.get(BASE_URL);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ============ POST /kiosk-profiles ============

describe('POST /kiosk-profiles', () => {
  it('creates a kiosk profile', async () => {
    prisma.kioskProfile.create.mockResolvedValue({ id: PROFILE_ID, ...VALID_PROFILE });

    const res = await api.owner.post(BASE_URL).send(VALID_PROFILE);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Lobby Kiosk');
  });

  it('returns 400 for missing name', async () => {
    const res = await api.owner.post(BASE_URL).send({ ...VALID_PROFILE, name: '' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid posMode', async () => {
    const res = await api.owner.post(BASE_URL).send({ ...VALID_PROFILE, posMode: 'invalid' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for maxIdleSeconds below minimum', async () => {
    const res = await api.owner.post(BASE_URL).send({ ...VALID_PROFILE, maxIdleSeconds: 10 });
    expect(res.status).toBe(400);
  });

  it('returns 400 for maxIdleSeconds above maximum', async () => {
    const res = await api.owner.post(BASE_URL).send({ ...VALID_PROFILE, maxIdleSeconds: 700 });
    expect(res.status).toBe(400);
  });
});

// ============ PATCH /kiosk-profiles/:id ============

describe('PATCH /kiosk-profiles/:id', () => {
  it('updates a kiosk profile', async () => {
    prisma.kioskProfile.findFirst.mockResolvedValue({ id: PROFILE_ID, restaurantId: RESTAURANT_ID });
    prisma.kioskProfile.update.mockResolvedValue({ id: PROFILE_ID, name: 'Updated Kiosk' });

    const res = await api.owner.patch(`${BASE_URL}/${PROFILE_ID}`).send({ name: 'Updated Kiosk' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Kiosk');
  });

  it('returns 404 when profile not found', async () => {
    prisma.kioskProfile.findFirst.mockResolvedValue(null);

    const res = await api.owner.patch(`${BASE_URL}/${PROFILE_ID}`).send({ name: 'Updated' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Kiosk profile not found');
  });
});

// ============ DELETE /kiosk-profiles/:id ============

describe('DELETE /kiosk-profiles/:id', () => {
  it('deletes a kiosk profile', async () => {
    prisma.kioskProfile.findFirst.mockResolvedValue({ id: PROFILE_ID, restaurantId: RESTAURANT_ID });
    prisma.kioskProfile.delete.mockResolvedValue({ id: PROFILE_ID });

    const res = await api.owner.delete(`${BASE_URL}/${PROFILE_ID}`);
    expect(res.status).toBe(204);
  });

  it('returns 404 when profile not found', async () => {
    prisma.kioskProfile.findFirst.mockResolvedValue(null);

    const res = await api.owner.delete(`${BASE_URL}/${PROFILE_ID}`);
    expect(res.status).toBe(404);
  });
});
