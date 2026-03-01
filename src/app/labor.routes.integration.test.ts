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

vi.mock('../services/labor.service', () => ({
  laborService: {
    getShifts: vi.fn().mockResolvedValue([]),
    createShift: vi.fn().mockResolvedValue({ id: 'shift-1', staffPinId: 'pin-1', date: '2026-02-25', startTime: '09:00', endTime: '17:00', position: 'server', breakMinutes: 0 }),
    updateShift: vi.fn().mockResolvedValue({ id: 'shift-1', staffPinId: 'pin-1', date: '2026-02-25', startTime: '10:00', endTime: '18:00', position: 'cook', breakMinutes: 30 }),
    deleteShift: vi.fn().mockResolvedValue(undefined),
    publishWeek: vi.fn().mockResolvedValue({ published: 5 }),
    clockIn: vi.fn().mockResolvedValue({ id: 'entry-1', staffPinId: 'pin-1', clockIn: '2026-02-25T09:00:00Z', clockOut: null }),
    clockOut: vi.fn().mockResolvedValue({ id: 'entry-1', staffPinId: 'pin-1', clockIn: '2026-02-25T09:00:00Z', clockOut: '2026-02-25T17:00:00Z' }),
    getActiveClocks: vi.fn().mockResolvedValue([]),
    getLaborReport: vi.fn().mockResolvedValue({ totalHours: 40, totalCost: 600, entries: [] }),
    getLaborRecommendations: vi.fn().mockResolvedValue([]),
    getTargets: vi.fn().mockResolvedValue([]),
    setTarget: vi.fn().mockResolvedValue({ dayOfWeek: 1, targetPercent: 25, targetCost: 500 }),
  },
}));

const prisma = getPrismaMock();

beforeEach(() => {
  resetPrismaMock();
  vi.clearAllMocks();
});

const BASE_URL = `/api/merchant/${RESTAURANT_ID}`;
const STAFF_PIN_ID = '11111111-1111-4111-a111-111111111111';
const SHIFT_ID = '22222222-2222-4222-a222-222222222222';
const TIME_ENTRY_ID = '33333333-3333-4333-a333-333333333333';
const TEMPLATE_ID = '44444444-4444-4444-a444-444444444444';
const EDIT_ID = '55555555-5555-4555-a555-555555555555';
const SWAP_REQUEST_ID = '66666666-6666-4666-a666-666666666666';
const NOTIFICATION_ID = '77777777-7777-4777-a777-777777777777';

// ============ Staff Pins ============

describe('GET /:merchantId/staff/pins', () => {
  const url = `${BASE_URL}/staff/pins`;

  it('returns 401 without auth', async () => {
    const res = await api.anonymous().get(url);
    expect(res.status).toBe(401);
  });

  it('returns staff pins', async () => {
    prisma.staffPin.findMany.mockResolvedValue([
      { id: 'pin-1', name: 'Alice', role: 'server' },
      { id: 'pin-2', name: 'Bob', role: 'cook' },
    ]);

    const res = await api.owner.get(url);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].name).toBe('Alice');
  });

  it('returns empty array when no pins', async () => {
    prisma.staffPin.findMany.mockResolvedValue([]);
    const res = await api.owner.get(url);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 500 on database error', async () => {
    prisma.staffPin.findMany.mockRejectedValue(new Error('DB error'));
    const res = await api.owner.get(url);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to fetch staff pins');
  });
});

// ============ Shifts ============

describe('GET /:merchantId/staff/shifts', () => {
  const url = `${BASE_URL}/staff/shifts`;

  it('returns 400 without date params', async () => {
    const res = await api.owner.get(url);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('startDate and endDate query params are required');
  });

  it('returns shifts with date range', async () => {
    const { laborService } = await import('../services/labor.service');
    vi.mocked(laborService.getShifts).mockResolvedValue([
      { staffPinId: STAFF_PIN_ID, id: 'shift-1', date: '2026-02-25', startTime: '09:00', endTime: '17:00' },
    ] as any);

    const res = await api.owner.get(`${url}?startDate=2026-02-24&endDate=2026-02-28`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('filters by staffPinId when provided', async () => {
    const { laborService } = await import('../services/labor.service');
    vi.mocked(laborService.getShifts).mockResolvedValue([
      { staffPinId: STAFF_PIN_ID, id: 'shift-1' },
      { staffPinId: 'other-pin', id: 'shift-2' },
    ] as any);

    const res = await api.owner.get(`${url}?startDate=2026-02-24&endDate=2026-02-28&staffPinId=${STAFF_PIN_ID}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].staffPinId).toBe(STAFF_PIN_ID);
  });

  it('returns 500 on service error', async () => {
    const { laborService } = await import('../services/labor.service');
    vi.mocked(laborService.getShifts).mockRejectedValue(new Error('DB error'));

    const res = await api.owner.get(`${url}?startDate=2026-02-24&endDate=2026-02-28`);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to fetch shifts');
  });
});

describe('POST /:merchantId/staff/shifts', () => {
  const url = `${BASE_URL}/staff/shifts`;

  const validShift = {
    staffPinId: STAFF_PIN_ID,
    date: '2026-02-25',
    startTime: '09:00',
    endTime: '17:00',
    position: 'server',
  };

  it('creates a shift with valid data', async () => {
    const res = await api.owner.post(url).send(validShift);
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('shift-1');
  });

  it('returns 400 for invalid Zod data — missing position', async () => {
    const res = await api.owner.post(url).send({
      staffPinId: STAFF_PIN_ID,
      date: '2026-02-25',
      startTime: '09:00',
      endTime: '17:00',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid shift data');
    expect(res.body.details).toBeDefined();
  });

  it('returns 400 for invalid time format', async () => {
    const res = await api.owner.post(url).send({
      ...validShift,
      startTime: '9am',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid shift data');
  });

  it('returns 400 for invalid position enum', async () => {
    const res = await api.owner.post(url).send({
      ...validShift,
      position: 'janitor',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid shift data');
  });

  it('returns 409 on CONFLICT error from service', async () => {
    const { laborService } = await import('../services/labor.service');
    vi.mocked(laborService.createShift).mockRejectedValueOnce(new Error('CONFLICT: Overlapping shift'));

    const res = await api.owner.post(url).send(validShift);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Overlapping shift');
  });

  it('returns 500 on generic service error', async () => {
    const { laborService } = await import('../services/labor.service');
    vi.mocked(laborService.createShift).mockRejectedValueOnce(new Error('DB error'));

    const res = await api.owner.post(url).send(validShift);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to create shift');
  });
});

describe('POST /:merchantId/staff/shifts/publish', () => {
  const url = `${BASE_URL}/staff/shifts/publish`;

  it('publishes a week with valid data', async () => {
    const res = await api.owner.post(url).send({ weekStartDate: '2026-02-23' });
    expect(res.status).toBe(200);
    expect(res.body.published).toBe(5);
  });

  it('returns 400 for missing weekStartDate', async () => {
    const res = await api.owner.post(url).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid publish data');
  });
});

describe('PATCH /:merchantId/staff/shifts/:id', () => {
  const url = `${BASE_URL}/staff/shifts/${SHIFT_ID}`;

  it('updates a shift with valid data', async () => {
    const res = await api.owner.patch(url).send({ startTime: '10:00' });
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid time format', async () => {
    const res = await api.owner.patch(url).send({ startTime: 'bad' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid shift data');
  });

  it('returns 409 on CONFLICT error', async () => {
    const { laborService } = await import('../services/labor.service');
    vi.mocked(laborService.updateShift).mockRejectedValueOnce(new Error('CONFLICT: Overlapping shift'));

    const res = await api.owner.patch(url).send({ startTime: '10:00' });
    expect(res.status).toBe(409);
  });
});

describe('DELETE /:merchantId/staff/shifts/:id', () => {
  const url = `${BASE_URL}/staff/shifts/${SHIFT_ID}`;

  it('deletes a shift', async () => {
    const res = await api.owner.delete(url);
    expect(res.status).toBe(204);
  });

  it('returns 500 on service error', async () => {
    const { laborService } = await import('../services/labor.service');
    vi.mocked(laborService.deleteShift).mockRejectedValueOnce(new Error('DB error'));

    const res = await api.owner.delete(url);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to delete shift');
  });
});

// ============ Time Clock ============

describe('POST /:merchantId/staff/clock-in', () => {
  const url = `${BASE_URL}/staff/clock-in`;

  it('clocks in with valid data', async () => {
    const res = await api.owner.post(url).send({ staffPinId: STAFF_PIN_ID });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('entry-1');
  });

  it('returns 400 for invalid staffPinId', async () => {
    const res = await api.owner.post(url).send({ staffPinId: 'not-a-uuid' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid clock-in data');
  });

  it('returns 409 when already clocked in', async () => {
    const { laborService } = await import('../services/labor.service');
    vi.mocked(laborService.clockIn).mockRejectedValueOnce(new Error('ALREADY_CLOCKED_IN: Staff already clocked in'));

    const res = await api.owner.post(url).send({ staffPinId: STAFF_PIN_ID });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Staff already clocked in');
  });
});

describe('POST /:merchantId/staff/clock-out/:id', () => {
  const url = `${BASE_URL}/staff/clock-out/${TIME_ENTRY_ID}`;

  it('clocks out with valid data', async () => {
    const res = await api.owner.post(url).send({});
    expect(res.status).toBe(200);
  });

  it('clocks out with break minutes', async () => {
    const res = await api.owner.post(url).send({ breakMinutes: 30, notes: 'Lunch break' });
    expect(res.status).toBe(200);
  });

  it('returns 400 for break minutes exceeding max', async () => {
    const res = await api.owner.post(url).send({ breakMinutes: 200 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid clock-out data');
  });
});

describe('GET /:merchantId/staff/active-clocks', () => {
  const url = `${BASE_URL}/staff/active-clocks`;

  it('returns active clocks', async () => {
    const res = await api.owner.get(url);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 500 on service error', async () => {
    const { laborService } = await import('../services/labor.service');
    vi.mocked(laborService.getActiveClocks).mockRejectedValueOnce(new Error('DB error'));

    const res = await api.owner.get(url);
    expect(res.status).toBe(500);
  });
});

// ============ Labor Report ============

describe('GET /:merchantId/staff/labor-report', () => {
  const url = `${BASE_URL}/staff/labor-report`;

  it('returns 400 without date params', async () => {
    const res = await api.owner.get(url);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('startDate and endDate query params are required');
  });

  it('returns labor report with date range', async () => {
    const res = await api.owner.get(`${url}?startDate=2026-02-24&endDate=2026-02-28`);
    expect(res.status).toBe(200);
    expect(res.body.totalHours).toBe(40);
  });
});

// ============ Labor Recommendations ============

describe('GET /:merchantId/staff/labor-recommendations', () => {
  const url = `${BASE_URL}/staff/labor-recommendations`;

  it('returns recommendations', async () => {
    const res = await api.owner.get(url);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ============ Labor Targets ============

describe('GET /:merchantId/staff/labor-targets', () => {
  const url = `${BASE_URL}/staff/labor-targets`;

  it('returns targets', async () => {
    const res = await api.owner.get(url);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('PUT /:merchantId/staff/labor-targets', () => {
  const url = `${BASE_URL}/staff/labor-targets`;

  it('sets a target with valid data', async () => {
    const res = await api.owner.put(url).send({ dayOfWeek: 1, targetPercent: 25 });
    expect(res.status).toBe(200);
    expect(res.body.dayOfWeek).toBe(1);
  });

  it('returns 400 for invalid dayOfWeek', async () => {
    const res = await api.owner.put(url).send({ dayOfWeek: 8, targetPercent: 25 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid labor target data');
  });

  it('returns 400 for targetPercent over 100', async () => {
    const res = await api.owner.put(url).send({ dayOfWeek: 1, targetPercent: 150 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid labor target data');
  });
});

// ============ Schedule Templates ============

describe('GET /:merchantId/staff/schedule-templates', () => {
  const url = `${BASE_URL}/staff/schedule-templates`;

  it('returns templates', async () => {
    prisma.scheduleTemplate.findMany.mockResolvedValue([]);
    const res = await api.owner.get(url);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 500 on database error', async () => {
    prisma.scheduleTemplate.findMany.mockRejectedValue(new Error('DB error'));
    const res = await api.owner.get(url);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to fetch schedule templates');
  });
});

describe('POST /:merchantId/staff/schedule-templates', () => {
  const url = `${BASE_URL}/staff/schedule-templates`;

  it('returns 400 for missing name', async () => {
    const res = await api.owner.post(url).send({ weekStartDate: '2026-02-23' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Template name is required');
  });

  it('returns 400 for missing weekStartDate', async () => {
    const res = await api.owner.post(url).send({ name: 'My Template' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('weekStartDate is required');
  });

  it('returns 400 when no shifts found for the week', async () => {
    prisma.shift.findMany.mockResolvedValue([]);
    const res = await api.owner.post(url).send({ name: 'My Template', weekStartDate: '2026-02-23' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No shifts found for this week');
  });

  it('creates a template when shifts exist', async () => {
    prisma.shift.findMany.mockResolvedValue([
      { id: 'shift-1', staffPinId: 'pin-1', staffPin: { name: 'Alice' }, date: new Date('2026-02-25'), startTime: '09:00', endTime: '17:00', position: 'server', breakMinutes: 0 },
    ]);
    prisma.scheduleTemplate.create.mockResolvedValue({
      id: TEMPLATE_ID,
      restaurantId: RESTAURANT_ID,
      name: 'My Template',
      createdBy: 'manager',
      createdAt: new Date('2026-02-25'),
      shifts: [
        { staffPinId: 'pin-1', staffName: 'Alice', dayOfWeek: 3, startTime: '09:00', endTime: '17:00', position: 'server', breakMinutes: 0 },
      ],
    });

    const res = await api.owner.post(url).send({ name: 'My Template', weekStartDate: '2026-02-23' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('My Template');
    expect(res.body.shifts).toHaveLength(1);
  });
});

describe('POST /:merchantId/staff/schedule-templates/:templateId/apply', () => {
  const url = `${BASE_URL}/staff/schedule-templates/${TEMPLATE_ID}/apply`;

  it('returns 400 for missing weekStartDate', async () => {
    const res = await api.owner.post(url).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('weekStartDate is required');
  });

  it('returns 404 when template not found', async () => {
    prisma.scheduleTemplate.findFirst.mockResolvedValue(null);
    const res = await api.owner.post(url).send({ weekStartDate: '2026-03-02' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Template not found');
  });

  it('applies template and creates shifts', async () => {
    prisma.scheduleTemplate.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      restaurantId: RESTAURANT_ID,
      name: 'My Template',
      shifts: [
        { staffPinId: 'pin-1', staffName: 'Alice', dayOfWeek: 1, startTime: '09:00', endTime: '17:00', position: 'server', breakMinutes: 0 },
      ],
    });

    const createdShift = {
      id: 'new-shift-1',
      restaurantId: RESTAURANT_ID,
      staffPinId: 'pin-1',
      staffPin: { name: 'Alice', role: 'server' },
      date: new Date('2026-03-03'),
      startTime: '09:00',
      endTime: '17:00',
      position: 'server',
      breakMinutes: 0,
      notes: null,
      isPublished: false,
    };
    prisma.$transaction.mockResolvedValue([createdShift]);

    const res = await api.owner.post(url).send({ weekStartDate: '2026-03-02' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].staffPinId).toBe('pin-1');
  });
});

describe('DELETE /:merchantId/staff/schedule-templates/:templateId', () => {
  const url = `${BASE_URL}/staff/schedule-templates/${TEMPLATE_ID}`;

  it('returns 404 when template not found', async () => {
    prisma.scheduleTemplate.findFirst.mockResolvedValue(null);
    const res = await api.owner.delete(url);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Template not found');
  });

  it('deletes template', async () => {
    prisma.scheduleTemplate.findFirst.mockResolvedValue({ id: TEMPLATE_ID, restaurantId: RESTAURANT_ID });
    prisma.scheduleTemplate.delete.mockResolvedValue({ id: TEMPLATE_ID });

    const res = await api.owner.delete(url);
    expect(res.status).toBe(204);
  });
});

// ============ Copy Week ============

describe('POST /:merchantId/staff/copy-week', () => {
  const url = `${BASE_URL}/staff/copy-week`;

  it('returns 400 for missing targetWeekStart', async () => {
    const res = await api.owner.post(url).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('targetWeekStart is required');
  });

  it('returns 400 when no shifts in previous week', async () => {
    prisma.shift.findMany.mockResolvedValue([]);
    const res = await api.owner.post(url).send({ targetWeekStart: '2026-03-02' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No shifts found in previous week');
  });

  it('copies previous week shifts', async () => {
    prisma.shift.findMany.mockResolvedValue([
      { id: 'shift-1', staffPinId: 'pin-1', staffPin: { name: 'Alice', role: 'server' }, date: new Date('2026-02-24'), startTime: '09:00', endTime: '17:00', position: 'server', breakMinutes: 0 },
    ]);

    const newShift = {
      id: 'new-shift-1',
      restaurantId: RESTAURANT_ID,
      staffPinId: 'pin-1',
      staffPin: { name: 'Alice', role: 'server' },
      date: new Date('2026-03-03'),
      startTime: '09:00',
      endTime: '17:00',
      position: 'server',
      breakMinutes: 0,
      notes: null,
      isPublished: false,
    };
    prisma.$transaction.mockResolvedValue([newShift]);

    const res = await api.owner.post(url).send({ targetWeekStart: '2026-03-02' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(1);
  });
});

// ============ Live Labor Snapshot ============

describe('GET /:merchantId/staff/labor-live', () => {
  const url = `${BASE_URL}/staff/labor-live`;

  it('returns live labor snapshot', async () => {
    prisma.timeEntry.findMany.mockResolvedValue([]);
    prisma.order.findMany.mockResolvedValue([]);

    const res = await api.owner.get(url);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('clockedInCount');
    expect(res.body).toHaveProperty('currentHourlyCost');
    expect(res.body).toHaveProperty('todayRevenue');
    expect(res.body).toHaveProperty('laborPercent');
  });

  it('returns 500 on database error', async () => {
    prisma.timeEntry.findMany.mockRejectedValue(new Error('DB error'));
    const res = await api.owner.get(url);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to fetch live labor snapshot');
  });
});

// ============ Notifications ============

describe('GET /:merchantId/staff/notifications', () => {
  const url = `${BASE_URL}/staff/notifications`;

  it('returns 400 without pinId', async () => {
    const res = await api.owner.get(url);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('pinId query param is required');
  });

  it('returns notifications for a pin', async () => {
    prisma.staffNotification.findMany.mockResolvedValue([]);
    const res = await api.owner.get(`${url}?pinId=${STAFF_PIN_ID}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('PATCH /:merchantId/staff/notifications/:notificationId/read', () => {
  const url = `${BASE_URL}/staff/notifications/${NOTIFICATION_ID}/read`;

  it('marks notification as read', async () => {
    prisma.staffNotification.update.mockResolvedValue({ id: NOTIFICATION_ID, isRead: true });
    const res = await api.owner.patch(url);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 500 on database error', async () => {
    prisma.staffNotification.update.mockRejectedValue(new Error('DB error'));
    const res = await api.owner.patch(url);
    expect(res.status).toBe(500);
  });
});

describe('POST /:merchantId/staff/notifications/schedule-published', () => {
  const url = `${BASE_URL}/staff/notifications/schedule-published`;

  it('returns 400 without weekStart', async () => {
    const res = await api.owner.post(url).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('weekStart is required');
  });

  it('returns sent 0 when no shifts in week', async () => {
    prisma.shift.findMany.mockResolvedValue([]);
    const res = await api.owner.post(url).send({ weekStart: '2026-02-23' });
    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(0);
  });

  it('sends notifications to staff with shifts', async () => {
    prisma.shift.findMany.mockResolvedValue([
      { staffPinId: 'pin-1' },
      { staffPinId: 'pin-2' },
      { staffPinId: 'pin-1' }, // duplicate
    ]);
    prisma.staffNotification.createMany.mockResolvedValue({ count: 2 });

    const res = await api.owner.post(url).send({ weekStart: '2026-02-23' });
    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(2);
  });
});

describe('POST /:merchantId/staff/notifications/announcement', () => {
  const url = `${BASE_URL}/staff/notifications/announcement`;

  it('returns 400 for missing message', async () => {
    const res = await api.owner.post(url).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('message is required');
  });

  it('returns 400 for empty message', async () => {
    const res = await api.owner.post(url).send({ message: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('message is required');
  });

  it('sends announcement to specific recipients', async () => {
    prisma.staffNotification.createMany.mockResolvedValue({ count: 2 });
    const res = await api.owner.post(url).send({
      message: 'Team meeting at 3pm',
      recipientPinIds: ['pin-1', 'pin-2'],
    });
    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(2);
  });

  it('sends announcement to all staff when no recipients specified', async () => {
    prisma.staffPin.findMany.mockResolvedValue([{ id: 'pin-1' }, { id: 'pin-2' }, { id: 'pin-3' }]);
    prisma.staffNotification.createMany.mockResolvedValue({ count: 3 });

    const res = await api.owner.post(url).send({ message: 'Team meeting at 3pm' });
    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(3);
  });
});

// ============ Workweek Config ============

describe('GET /:merchantId/staff/workweek-config', () => {
  const url = `${BASE_URL}/staff/workweek-config`;

  it('returns defaults when no config exists', async () => {
    prisma.workweekConfig.findUnique.mockResolvedValue(null);
    const res = await api.owner.get(url);
    expect(res.status).toBe(200);
    expect(res.body.weekStartDay).toBe(0);
    expect(res.body.overtimeThresholdHours).toBe(40);
    expect(res.body.overtimeMultiplier).toBe(1.5);
  });

  it('returns existing config', async () => {
    prisma.workweekConfig.findUnique.mockResolvedValue({
      weekStartDay: 1,
      dayStartTime: '06:00',
      overtimeThresholdHours: 40,
      overtimeMultiplier: 1.5,
    });
    const res = await api.owner.get(url);
    expect(res.status).toBe(200);
    expect(res.body.weekStartDay).toBe(1);
  });
});

describe('PUT /:merchantId/staff/workweek-config', () => {
  const url = `${BASE_URL}/staff/workweek-config`;

  const validConfig = {
    weekStartDay: 1,
    dayStartTime: '06:00',
    overtimeThresholdHours: 40,
    overtimeMultiplier: 1.5,
  };

  it('saves valid config', async () => {
    prisma.workweekConfig.upsert.mockResolvedValue({
      weekStartDay: 1,
      dayStartTime: '06:00',
      overtimeThresholdHours: 40,
      overtimeMultiplier: 1.5,
    });

    const res = await api.owner.put(url).send(validConfig);
    expect(res.status).toBe(200);
    expect(res.body.weekStartDay).toBe(1);
  });

  it('returns 400 for invalid dayStartTime format', async () => {
    const res = await api.owner.put(url).send({ ...validConfig, dayStartTime: 'bad' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid workweek config');
  });

  it('returns 400 for weekStartDay out of range', async () => {
    const res = await api.owner.put(url).send({ ...validConfig, weekStartDay: 10 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid workweek config');
  });

  it('returns 400 for overtimeMultiplier out of range', async () => {
    const res = await api.owner.put(url).send({ ...validConfig, overtimeMultiplier: 5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid workweek config');
  });
});

// ============ Timecard Edit Requests ============

describe('POST /:merchantId/staff/timecard-edits', () => {
  const url = `${BASE_URL}/staff/timecard-edits`;

  const validEdit = {
    timeEntryId: TIME_ENTRY_ID,
    editType: 'clock_in_time',
    originalValue: '2026-02-25T09:00:00Z',
    newValue: '2026-02-25T08:45:00Z',
    reason: 'Forgot to clock in on time',
  };

  it('creates edit request with valid data', async () => {
    prisma.timeEntry.findFirst.mockResolvedValue({ id: TIME_ENTRY_ID, restaurantId: RESTAURANT_ID, staffPinId: 'pin-1' });
    prisma.timecardEditRequest.create.mockResolvedValue({
      id: EDIT_ID,
      timeEntryId: TIME_ENTRY_ID,
      staffPinId: 'pin-1',
      staffPin: { name: 'Alice' },
      editType: 'clock_in_time',
      originalValue: '2026-02-25T09:00:00Z',
      newValue: '2026-02-25T08:45:00Z',
      reason: 'Forgot to clock in on time',
      status: 'pending',
      createdAt: new Date('2026-02-25'),
    });

    const res = await api.owner.post(url).send(validEdit);
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(EDIT_ID);
    expect(res.body.status).toBe('pending');
  });

  it('returns 400 for invalid editType', async () => {
    const res = await api.owner.post(url).send({ ...validEdit, editType: 'invalid_type' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid edit request');
  });

  it('returns 400 for missing reason', async () => {
    const res = await api.owner.post(url).send({ ...validEdit, reason: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid edit request');
  });

  it('returns 404 when time entry not found', async () => {
    prisma.timeEntry.findFirst.mockResolvedValue(null);
    const res = await api.owner.post(url).send(validEdit);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Time entry not found');
  });
});

describe('PATCH /:merchantId/staff/timecard-edits/:editId/approve', () => {
  const url = `${BASE_URL}/staff/timecard-edits/${EDIT_ID}/approve`;

  it('returns 400 for missing respondedBy', async () => {
    const res = await api.owner.patch(url).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid response data');
  });

  it('returns 404 when edit request not found', async () => {
    prisma.timecardEditRequest.findFirst.mockResolvedValue(null);
    const res = await api.owner.patch(url).send({ respondedBy: 'manager-1' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Edit request not found or already processed');
  });

  it('approves edit request and applies change', async () => {
    prisma.timecardEditRequest.findFirst.mockResolvedValue({
      id: EDIT_ID,
      restaurantId: RESTAURANT_ID,
      timeEntryId: TIME_ENTRY_ID,
      editType: 'clock_in_time',
      newValue: '2026-02-25T08:45:00Z',
      status: 'pending',
    });

    const updatedEdit = {
      id: EDIT_ID,
      timeEntryId: TIME_ENTRY_ID,
      staffPinId: 'pin-1',
      staffPin: { name: 'Alice' },
      editType: 'clock_in_time',
      originalValue: '2026-02-25T09:00:00Z',
      newValue: '2026-02-25T08:45:00Z',
      reason: 'Forgot',
      status: 'approved',
      respondedBy: 'manager-1',
      respondedAt: new Date('2026-02-25T12:00:00Z'),
      createdAt: new Date('2026-02-25'),
    };
    prisma.$transaction.mockResolvedValue([updatedEdit, {}]);

    const res = await api.owner.patch(url).send({ respondedBy: 'manager-1' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('approved');
  });
});

describe('PATCH /:merchantId/staff/timecard-edits/:editId/deny', () => {
  const url = `${BASE_URL}/staff/timecard-edits/${EDIT_ID}/deny`;

  it('returns 404 when edit request not found', async () => {
    prisma.timecardEditRequest.findFirst.mockResolvedValue(null);
    const res = await api.owner.patch(url).send({ respondedBy: 'manager-1' });
    expect(res.status).toBe(404);
  });

  it('denies edit request', async () => {
    prisma.timecardEditRequest.findFirst.mockResolvedValue({
      id: EDIT_ID,
      restaurantId: RESTAURANT_ID,
      status: 'pending',
    });
    prisma.timecardEditRequest.update.mockResolvedValue({
      id: EDIT_ID,
      timeEntryId: TIME_ENTRY_ID,
      staffPinId: 'pin-1',
      staffPin: { name: 'Alice' },
      editType: 'clock_in_time',
      originalValue: '2026-02-25T09:00:00Z',
      newValue: '2026-02-25T08:45:00Z',
      reason: 'Forgot',
      status: 'denied',
      respondedBy: 'manager-1',
      respondedAt: new Date('2026-02-25T12:00:00Z'),
      createdAt: new Date('2026-02-25'),
    });

    const res = await api.owner.patch(url).send({ respondedBy: 'manager-1' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('denied');
  });
});

// ============ Validate Clock-In ============

describe('POST /:merchantId/staff/validate-clock-in', () => {
  const url = `${BASE_URL}/staff/validate-clock-in`;

  it('returns 400 for invalid staffPinId', async () => {
    const res = await api.owner.post(url).send({ staffPinId: 'not-uuid' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid data');
  });

  it('returns allowed true when enforcement is disabled', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({ aiSettings: {} });
    const res = await api.owner.post(url).send({ staffPinId: STAFF_PIN_ID });
    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(true);
  });

  it('returns allowed false when no shift scheduled', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({
      aiSettings: { scheduleEnforcement: { enabled: true, gracePeriodMinutes: 15 } },
    });
    prisma.shift.findMany.mockResolvedValue([]);

    const res = await api.owner.post(url).send({ staffPinId: STAFF_PIN_ID });
    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(false);
    expect(res.body.blockReason).toBe('No shift scheduled for today');
    expect(res.body.requiresManagerOverride).toBe(true);
  });
});

// ============ Clock-In with Override ============

describe('POST /:merchantId/staff/clock-in-with-override', () => {
  const url = `${BASE_URL}/staff/clock-in-with-override`;

  it('returns 400 for invalid data', async () => {
    const res = await api.owner.post(url).send({ staffPinId: 'bad' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid override data');
  });

  it('returns 403 for invalid manager pin', async () => {
    prisma.staffPin.findFirst.mockResolvedValue(null);
    const res = await api.owner.post(url).send({
      staffPinId: STAFF_PIN_ID,
      managerPin: '1234',
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Invalid manager PIN');
  });

  it('clocks in with valid manager override', async () => {
    prisma.staffPin.findFirst.mockResolvedValue({ id: 'mgr-pin', name: 'Manager Bob', role: 'manager' });

    const res = await api.owner.post(url).send({
      staffPinId: STAFF_PIN_ID,
      managerPin: '1234',
    });
    expect(res.status).toBe(201);
    expect(res.body.overrideBy).toBe('Manager Bob');
  });

  it('returns 409 when already clocked in', async () => {
    prisma.staffPin.findFirst.mockResolvedValue({ id: 'mgr-pin', name: 'Manager Bob', role: 'manager' });
    const { laborService } = await import('../services/labor.service');
    vi.mocked(laborService.clockIn).mockRejectedValueOnce(new Error('ALREADY_CLOCKED_IN: Staff already clocked in'));

    const res = await api.owner.post(url).send({
      staffPinId: STAFF_PIN_ID,
      managerPin: '1234',
    });
    expect(res.status).toBe(409);
  });
});

// ============ Auto Clock-Out ============

describe('POST /:merchantId/staff/auto-clock-out', () => {
  const url = `${BASE_URL}/staff/auto-clock-out`;

  it('returns disabled message when auto clock-out is off', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({ aiSettings: {} });
    const res = await api.owner.post(url).send({});
    expect(res.status).toBe(200);
    expect(res.body.closedEntries).toBe(0);
    expect(res.body.message).toBe('Auto clock-out is disabled');
  });

  it('returns 0 closedEntries when no open entries', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({
      aiSettings: { autoClockOut: { enabled: true, mode: 'after_shift_end', delayMinutes: 30 } },
    });
    prisma.timeEntry.findMany.mockResolvedValue([]);

    const res = await api.owner.post(url).send({});
    expect(res.status).toBe(200);
    expect(res.body.closedEntries).toBe(0);
  });

  it('returns 500 on database error', async () => {
    prisma.restaurant.findUnique.mockRejectedValue(new Error('DB error'));
    const res = await api.owner.post(url).send({});
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to run auto clock-out');
  });
});

// ============ Swap Requests ============

describe('POST /:merchantId/staff/swap-requests', () => {
  const url = `${BASE_URL}/staff/swap-requests`;

  it('returns 400 for missing fields', async () => {
    const res = await api.owner.post(url).send({ shiftId: SHIFT_ID });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('shiftId, requestorPinId, and reason are required');
  });

  it('creates swap request with valid data', async () => {
    prisma.swapRequest.create.mockResolvedValue({
      id: SWAP_REQUEST_ID,
      shiftId: SHIFT_ID,
      shift: { date: new Date('2026-02-25'), startTime: '09:00', endTime: '17:00', position: 'server' },
      requestorPinId: STAFF_PIN_ID,
      requestor: { id: STAFF_PIN_ID, name: 'Alice' },
      targetPinId: null,
      reason: 'Sick day',
      status: 'pending',
      createdAt: new Date('2026-02-25'),
      respondedAt: null,
      respondedBy: null,
    });

    const res = await api.owner.post(url).send({
      shiftId: SHIFT_ID,
      requestorPinId: STAFF_PIN_ID,
      reason: 'Sick day',
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(SWAP_REQUEST_ID);
    expect(res.body.status).toBe('pending');
  });
});

describe('PATCH /:merchantId/staff/swap-requests/:requestId', () => {
  const url = `${BASE_URL}/staff/swap-requests/${SWAP_REQUEST_ID}`;

  it('returns 400 for missing status', async () => {
    const res = await api.owner.patch(url).send({ respondedBy: 'manager-1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('status and respondedBy are required');
  });

  it('returns 400 for invalid status value', async () => {
    const res = await api.owner.patch(url).send({ status: 'maybe', respondedBy: 'manager-1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('status must be "approved" or "rejected"');
  });

  it('returns 404 when swap request not found (P2025)', async () => {
    prisma.swapRequest.update.mockRejectedValue({ code: 'P2025' });
    const res = await api.owner.patch(url).send({ status: 'approved', respondedBy: 'manager-1' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Swap request not found');
  });

  it('approves swap request', async () => {
    prisma.swapRequest.update.mockResolvedValue({
      id: SWAP_REQUEST_ID,
      shiftId: SHIFT_ID,
      shift: { date: new Date('2026-02-25'), startTime: '09:00', endTime: '17:00', position: 'server' },
      requestorPinId: STAFF_PIN_ID,
      requestor: { id: STAFF_PIN_ID, name: 'Alice' },
      targetPinId: null,
      reason: 'Sick day',
      status: 'approved',
      createdAt: new Date('2026-02-25'),
      respondedAt: new Date('2026-02-25T12:00:00Z'),
      respondedBy: 'manager-1',
    });

    const res = await api.owner.patch(url).send({ status: 'approved', respondedBy: 'manager-1' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('approved');
  });
});

// ============ Staff Earnings ============

describe('GET /:merchantId/staff/:staffPinId/earnings', () => {
  const url = `${BASE_URL}/staff/${STAFF_PIN_ID}/earnings`;

  it('returns 400 without date params', async () => {
    const res = await api.owner.get(url);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('startDate and endDate query params are required');
  });

  it('returns earnings for period', async () => {
    prisma.timeEntry.findMany.mockResolvedValue([]);
    prisma.workweekConfig.findUnique.mockResolvedValue(null);
    prisma.order.findMany.mockResolvedValue([]);
    prisma.staffPin.count.mockResolvedValue(5);

    const res = await api.owner.get(`${url}?startDate=2026-02-17&endDate=2026-02-23`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('regularHours');
    expect(res.body).toHaveProperty('overtimeHours');
    expect(res.body).toHaveProperty('totalEarnings');
    expect(res.body.totalHours).toBe(0);
  });
});

// ============ Staff Availability ============

describe('GET /:merchantId/staff/:staffPinId/availability', () => {
  const url = `${BASE_URL}/staff/${STAFF_PIN_ID}/availability`;

  it('returns availability preferences', async () => {
    prisma.staffAvailability.findMany.mockResolvedValue([]);
    const res = await api.owner.get(url);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('PUT /:merchantId/staff/:staffPinId/availability', () => {
  const url = `${BASE_URL}/staff/${STAFF_PIN_ID}/availability`;

  it('returns 400 for missing preferences array', async () => {
    const res = await api.owner.put(url).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('preferences array is required');
  });

  it('saves availability preferences', async () => {
    prisma.$transaction.mockResolvedValue([
      { dayOfWeek: 1, isAvailable: true, preferredStart: '09:00', preferredEnd: '17:00', notes: null },
    ]);

    const res = await api.owner.put(url).send({
      preferences: [
        { dayOfWeek: 1, isAvailable: true, preferredStart: '09:00', preferredEnd: '17:00' },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});
