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

vi.mock('../services/cloudprnt.service', () => ({
  cloudPrntService: {
    getPendingJob: vi.fn().mockResolvedValue(null),
    generateJobData: vi.fn().mockResolvedValue(Buffer.from('test-receipt-data')),
    markJobCompleted: vi.fn().mockResolvedValue(undefined),
    queueTestPrint: vi.fn(),
  },
}));

const prisma = getPrismaMock();

beforeEach(() => {
  resetPrismaMock();
  vi.clearAllMocks();
});

const POLL_URL = '/api/cloudprnt/cloudprnt';
const JOB_URL = '/api/cloudprnt/cloudprnt/job';

const MAC = 'AA:BB:CC:DD:EE:FF';
const PRINTER_ID = 'printer-00000000-0000-0000-0000-000000000001';
const JOB_ID = 'job-00000000-0000-0000-0000-000000000001';

const PRINTER = {
  id: PRINTER_ID,
  macAddress: MAC,
  restaurantId: 'f2cfe8dd-48f3-4596-ab1e-22a28b23ad38',
  name: 'Kitchen Printer',
  model: 'TSP143III',
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

const PRINT_JOB = {
  id: JOB_ID,
  printerId: PRINTER_ID,
  status: 'printing',
  orderId: 'order-00000000-0000-0000-0000-000000000001',
  jobData: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

// ============ GET /cloudprnt (poll) ============

describe('GET /api/cloudprnt/cloudprnt (poll for pending jobs)', () => {
  it('returns 400 when mac query param is missing', async () => {
    const res = await api.anonymous().get(POLL_URL);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing MAC address');
  });

  it('returns statusCode 200 when no job is pending', async () => {
    const { cloudPrntService } = await import('../services/cloudprnt.service');
    vi.mocked(cloudPrntService.getPendingJob).mockResolvedValueOnce(null);

    const res = await api.anonymous().get(`${POLL_URL}?mac=${encodeURIComponent(MAC)}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ statusCode: 200 });
    expect(res.body.jobReady).toBeUndefined();
  });

  it('returns jobReady true with mediaTypes when a job exists', async () => {
    const { cloudPrntService } = await import('../services/cloudprnt.service');
    vi.mocked(cloudPrntService.getPendingJob).mockResolvedValueOnce(PRINT_JOB as any);

    const res = await api.anonymous().get(`${POLL_URL}?mac=${encodeURIComponent(MAC)}`);
    expect(res.status).toBe(200);
    expect(res.body.jobReady).toBe(true);
    expect(res.body.mediaTypes).toContain('application/vnd.star.starprnt');
  });

  it('calls getPendingJob with the provided mac address', async () => {
    const { cloudPrntService } = await import('../services/cloudprnt.service');

    await api.anonymous().get(`${POLL_URL}?mac=${encodeURIComponent(MAC)}`);
    expect(cloudPrntService.getPendingJob).toHaveBeenCalledWith(MAC);
  });
});

// ============ GET /cloudprnt/job/:mac (download job data) ============

describe('GET /api/cloudprnt/cloudprnt/job/:mac (download job data)', () => {
  it('returns 404 when printer is not found', async () => {
    prisma.printer.findUnique.mockResolvedValueOnce(null);

    const res = await api.anonymous().get(`${JOB_URL}/${MAC}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Printer not found');
  });

  it('returns 404 when no print job with status printing exists', async () => {
    prisma.printer.findUnique.mockResolvedValueOnce(PRINTER);
    prisma.printJob.findFirst.mockResolvedValueOnce(null);

    const res = await api.anonymous().get(`${JOB_URL}/${MAC}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('No print job found');
  });

  it('returns binary receipt data with Star content type when printer and job exist', async () => {
    prisma.printer.findUnique.mockResolvedValueOnce(PRINTER);
    prisma.printJob.findFirst.mockResolvedValueOnce(PRINT_JOB);

    const receiptBuffer = Buffer.from('test-receipt-data');
    const { cloudPrntService } = await import('../services/cloudprnt.service');
    vi.mocked(cloudPrntService.generateJobData).mockResolvedValueOnce(receiptBuffer);

    const res = await api
      .anonymous()
      .get(`${JOB_URL}/${MAC}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/vnd.star.starprnt');
    expect(res.headers['x-star-printer-jobid']).toBe(JOB_ID);
    expect((res.body as Buffer).toString()).toBe('test-receipt-data');
  });

  it('looks up printer by macAddress from route param', async () => {
    prisma.printer.findUnique.mockResolvedValueOnce(null);

    await api.anonymous().get(`${JOB_URL}/${MAC}`);
    expect(prisma.printer.findUnique).toHaveBeenCalledWith({
      where: { macAddress: MAC },
    });
  });

  it('queries printJob with status printing ordered by createdAt asc', async () => {
    prisma.printer.findUnique.mockResolvedValueOnce(PRINTER);
    prisma.printJob.findFirst.mockResolvedValueOnce(null);

    await api.anonymous().get(`${JOB_URL}/${MAC}`);
    expect(prisma.printJob.findFirst).toHaveBeenCalledWith({
      where: { printerId: PRINTER_ID, status: 'printing' },
      orderBy: { createdAt: 'asc' },
    });
  });
});

// ============ DELETE /cloudprnt/job/:jobId (mark job completed) ============

describe('DELETE /api/cloudprnt/cloudprnt/job/:jobId (mark job completed)', () => {
  it('returns success true when job is marked completed', async () => {
    const res = await api.anonymous().delete(`${JOB_URL}/${JOB_ID}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  it('calls markJobCompleted with the provided jobId', async () => {
    const { cloudPrntService } = await import('../services/cloudprnt.service');

    await api.anonymous().delete(`${JOB_URL}/${JOB_ID}`);
    expect(cloudPrntService.markJobCompleted).toHaveBeenCalledWith(JOB_ID);
  });

  it('returns 500 when markJobCompleted throws', async () => {
    const { cloudPrntService } = await import('../services/cloudprnt.service');
    vi.mocked(cloudPrntService.markJobCompleted).mockRejectedValueOnce(
      new Error('Job not found in database'),
    );

    const res = await api.anonymous().delete(`${JOB_URL}/${JOB_ID}`);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Job not found in database');
  });
});
