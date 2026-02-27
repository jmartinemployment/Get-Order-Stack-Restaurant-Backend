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

vi.mock('../services/printer.service', () => ({
  printerService: {
    findAll: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 'p1', name: 'Kitchen Printer', model: 'Star TSP143' }),
    update: vi.fn().mockResolvedValue({ id: 'p1', name: 'Updated Printer' }),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../services/cloudprnt.service', () => ({
  cloudPrntService: {
    queueTestPrint: vi.fn().mockResolvedValue('job-123'),
    getPendingJob: vi.fn(),
    generateJobData: vi.fn(),
    markJobCompleted: vi.fn(),
  },
}));

const prisma = getPrismaMock();

beforeEach(() => {
  resetPrismaMock();
  vi.clearAllMocks();
});

const BASE_URL = `/api/restaurant/${RESTAURANT_ID}/printers`;
const PRINTER_ID = '11111111-1111-4111-a111-111111111111';

// ============ GET /api/restaurant/:restaurantId/printers ============

describe('GET /printers', () => {
  it('returns 401 without auth', async () => {
    const res = await api.anonymous().get(BASE_URL);
    expect(res.status).toBe(401);
  });

  it('returns 200 with an array of printers', async () => {
    const { printerService } = await import('../services/printer.service');
    vi.mocked(printerService.findAll).mockResolvedValue([
      { id: 'p1', name: 'Kitchen Printer', model: 'Star TSP143', macAddress: 'AA:BB:CC:DD:EE:FF' } as any,
      { id: 'p2', name: 'Bar Printer', model: 'Star TSP654', macAddress: '11:22:33:44:55:66' } as any,
    ]);

    const res = await api.owner.get(BASE_URL);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].id).toBe('p1');
    expect(res.body[1].id).toBe('p2');
  });

  it('returns 200 with empty array when no printers exist', async () => {
    const { printerService } = await import('../services/printer.service');
    vi.mocked(printerService.findAll).mockResolvedValue([]);

    const res = await api.owner.get(BASE_URL);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ============ POST /api/restaurant/:restaurantId/printers ============

describe('POST /printers', () => {
  const validBody = {
    name: 'Kitchen Printer',
    model: 'Star TSP143',
    macAddress: 'AA:BB:CC:DD:EE:FF',
  };

  it('returns 401 without auth', async () => {
    const res = await api.anonymous().post(BASE_URL).send(validBody);
    expect(res.status).toBe(401);
  });

  it('returns 201 on successful registration', async () => {
    const { printerService } = await import('../services/printer.service');
    vi.mocked(printerService.create).mockResolvedValue({
      printer: { id: 'p1', name: 'Kitchen Printer', model: 'Star TSP143' },
      cloudPrntConfig: { serverUrl: 'http://localhost/api/cloudprnt?mac=AA:BB:CC:DD:EE:FF', instructions: '' },
    } as any);

    const res = await api.owner.post(BASE_URL).send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.printer.id).toBe('p1');
  });

  it('returns 400 when name is missing', async () => {
    const res = await api.owner.post(BASE_URL).send({ model: 'Star TSP143', macAddress: 'AA:BB:CC:DD:EE:FF' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/i);
  });

  it('returns 400 when model is missing', async () => {
    const res = await api.owner.post(BASE_URL).send({ name: 'Kitchen Printer', macAddress: 'AA:BB:CC:DD:EE:FF' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/model/i);
  });

  it('returns 400 when macAddress is missing', async () => {
    const res = await api.owner.post(BASE_URL).send({ name: 'Kitchen Printer', model: 'Star TSP143' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/macAddress/i);
  });

  it('returns 400 when service throws an error', async () => {
    const { printerService } = await import('../services/printer.service');
    vi.mocked(printerService.create).mockRejectedValue(new Error('Invalid MAC address format'));

    const res = await api.owner.post(BASE_URL).send(validBody);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid MAC address format');
  });
});

// ============ PATCH /api/restaurant/:restaurantId/printers/:printerId ============

describe('PATCH /printers/:printerId', () => {
  const url = `${BASE_URL}/${PRINTER_ID}`;

  it('returns 200 on successful update', async () => {
    const { printerService } = await import('../services/printer.service');
    vi.mocked(printerService.update).mockResolvedValue({ id: PRINTER_ID, name: 'Updated Printer' } as any);

    const res = await api.owner.patch(url).send({ name: 'Updated Printer' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(PRINTER_ID);
    expect(res.body.name).toBe('Updated Printer');
  });

  it('returns 400 when service throws an error', async () => {
    const { printerService } = await import('../services/printer.service');
    vi.mocked(printerService.update).mockRejectedValue(new Error(`Printer not found: ${PRINTER_ID}`));

    const res = await api.owner.patch(url).send({ name: 'Updated Printer' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Printer not found');
  });

  it('returns 401 without auth', async () => {
    const res = await api.anonymous().patch(url).send({ name: 'Updated Printer' });
    expect(res.status).toBe(401);
  });
});

// ============ DELETE /api/restaurant/:restaurantId/printers/:printerId ============

describe('DELETE /printers/:printerId', () => {
  const url = `${BASE_URL}/${PRINTER_ID}`;

  it('returns 200 with success:true on deletion', async () => {
    const { printerService } = await import('../services/printer.service');
    vi.mocked(printerService.delete).mockResolvedValue(undefined);

    const res = await api.owner.delete(url);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  it('returns 400 when service throws an error', async () => {
    const { printerService } = await import('../services/printer.service');
    vi.mocked(printerService.delete).mockRejectedValue(new Error(`Printer not found: ${PRINTER_ID}`));

    const res = await api.owner.delete(url);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Printer not found');
  });

  it('returns 401 without auth', async () => {
    const res = await api.anonymous().delete(url);
    expect(res.status).toBe(401);
  });
});

// ============ POST /api/restaurant/:restaurantId/printers/:printerId/test ============

describe('POST /printers/:printerId/test', () => {
  const url = `${BASE_URL}/${PRINTER_ID}/test`;

  it('returns 200 with jobId on success', async () => {
    const { cloudPrntService } = await import('../services/cloudprnt.service');
    vi.mocked(cloudPrntService.queueTestPrint).mockResolvedValue('job-123');

    const res = await api.owner.post(url);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.jobId).toBe('job-123');
  });

  it('returns 400 when service throws an error', async () => {
    const { cloudPrntService } = await import('../services/cloudprnt.service');
    vi.mocked(cloudPrntService.queueTestPrint).mockRejectedValue(new Error('Printer is offline'));

    const res = await api.owner.post(url);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Printer is offline');
  });

  it('returns 401 without auth', async () => {
    const res = await api.anonymous().post(url);
    expect(res.status).toBe(401);
  });
});
