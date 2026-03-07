import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Prisma, PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';
import { sendProposal } from '../services/email.service';

const prisma = new PrismaClient();
const router = Router({ mergeParams: true });
export const publicRouter = Router();

// --- Zod schemas ---

const dietaryRequirementsSchema = z.object({
  vegetarian: z.number().int().min(0).default(0),
  vegan: z.number().int().min(0).default(0),
  glutenFree: z.number().int().min(0).default(0),
  nutAllergy: z.number().int().min(0).default(0),
  dairyFree: z.number().int().min(0).default(0),
  kosher: z.number().int().min(0).default(0),
  halal: z.number().int().min(0).default(0),
  other: z.string().default(''),
}).optional();

const deliveryDetailsSchema = z.object({
  driverName: z.string().optional(),
  driverPhone: z.string().optional(),
  loadTime: z.string().optional(),
  departureTime: z.string().optional(),
  arrivalTime: z.string().optional(),
  vehicleDescription: z.string().optional(),
  equipmentChecklist: z.array(z.string()).optional(),
  routeNotes: z.string().optional(),
  setupTime: z.string().optional(),
  breakdownTime: z.string().optional(),
}).optional();

const tastingSchema = z.object({
  id: z.string(),
  scheduledDate: z.string(),
  completedAt: z.string().optional(),
  attendees: z.string().default(''),
  notes: z.string().optional(),
  menuChangesRequested: z.string().optional(),
});

const packageSchema = z.object({
  id: z.string(),
  name: z.string(),
  tier: z.enum(['standard', 'premium', 'custom']),
  pricingModel: z.enum(['per_person', 'per_tray', 'flat']),
  pricePerUnit: z.number(),
  minimumHeadcount: z.number().int().min(0).default(0),
  description: z.string().optional(),
  menuItemIds: z.array(z.string()).default([]),
});

const milestoneSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  label: z.string(),
  percent: z.number().min(0).max(100),
  amountCents: z.number().int().min(0),
  dueDate: z.string().optional(),
  paidAt: z.string().optional(),
  invoiceId: z.string().optional(),
  reminderSentAt: z.string().optional(),
});

const createEventSchema = z.object({
  title: z.string().min(1),
  eventType: z.string().min(1),
  status: z.string().optional(),
  fulfillmentDate: z.string().refine((d) => !Number.isNaN(Date.parse(d)), 'Invalid date'),
  bookingDate: z.string().refine((d) => !Number.isNaN(Date.parse(d)), 'Invalid date').optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  headcount: z.number().int().min(1),
  locationType: z.string().optional(),
  locationAddress: z.string().optional(),
  clientName: z.string().min(1),
  clientPhone: z.string().optional(),
  clientEmail: z.string().optional(),
  companyName: z.string().optional(),
  notes: z.string().optional(),
  // Financial
  subtotalCents: z.number().int().min(0).optional(),
  serviceChargePercent: z.number().min(0).max(100).optional(),
  taxPercent: z.number().min(0).max(100).optional(),
  gratuityPercent: z.number().min(0).max(100).optional(),
  totalCents: z.number().int().min(0).optional(),
  paidCents: z.number().int().min(0).optional(),
  // JSON fields
  packages: z.array(packageSchema).optional(),
  selectedPackageId: z.string().optional(),
  milestones: z.array(milestoneSchema).optional(),
  dietaryRequirements: dietaryRequirementsSchema,
  tastings: z.array(tastingSchema).optional(),
  deliveryDetails: deliveryDetailsSchema,
  // Branding
  brandingLogoUrl: z.string().optional(),
  brandingColor: z.string().optional(),
  invoiceNotes: z.string().optional(),
});

const updateEventSchema = createEventSchema.partial().extend({
  contractUrl: z.string().nullable().optional(),
  contractSignedAt: z.string().nullable().optional(),
  estimateId: z.string().nullable().optional(),
  invoiceId: z.string().nullable().optional(),
});

const capacitySchema = z.object({
  maxEventsPerDay: z.number().int().min(1),
  maxHeadcountPerDay: z.number().int().min(1),
  conflictAlertsEnabled: z.boolean(),
});

// --- Helper: calculate fee amounts ---
function calculateFees(data: {
  subtotalCents?: number;
  serviceChargePercent?: number | null;
  taxPercent?: number | null;
  gratuityPercent?: number | null;
}): { serviceChargeCents: number; taxCents: number; gratuityCents: number; totalCents: number } {
  const subtotal = data.subtotalCents ?? 0;
  const serviceChargeCents = data.serviceChargePercent
    ? Math.round(subtotal * Number(data.serviceChargePercent) / 100)
    : 0;
  const taxable = subtotal + serviceChargeCents;
  const taxCents = data.taxPercent
    ? Math.round(taxable * Number(data.taxPercent) / 100)
    : 0;
  const gratuityCents = data.gratuityPercent
    ? Math.round(subtotal * Number(data.gratuityPercent) / 100)
    : 0;
  const totalCents = subtotal + serviceChargeCents + taxCents + gratuityCents;
  return { serviceChargeCents, taxCents, gratuityCents, totalCents };
}

// --- Helper: log activity ---
async function logActivity(
  jobId: string,
  action: string,
  description: string,
  actorType: 'operator' | 'client' | 'system' = 'operator',
  metadata?: Record<string, unknown>,
): Promise<void> {
  await prisma.cateringActivity.create({
    data: { jobId, action, description, actorType, metadata: metadata as Prisma.InputJsonValue ?? undefined },
  });
}

// --- Event CRUD Routes ---

// GET /api/merchant/:merchantId/catering/events
router.get('/:merchantId/catering/events', async (req: Request, res: Response) => {
  try {
    const { merchantId } = req.params;
    const events = await prisma.cateringEvent.findMany({
      where: { restaurantId: merchantId },
      orderBy: { fulfillmentDate: 'asc' },
    });
    res.json(events);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[catering] GET events error:', msg);
    res.status(500).json({ error: 'Failed to fetch catering events', detail: msg });
  }
});

// POST /api/merchant/:merchantId/catering/events
router.post('/:merchantId/catering/events', async (req: Request, res: Response) => {
  try {
    const { merchantId } = req.params;
    const parsed = createEventSchema.parse(req.body);

    const fees = calculateFees(parsed);

    const event = await prisma.cateringEvent.create({
      data: {
        restaurantId: merchantId,
        title: parsed.title,
        eventType: parsed.eventType,
        status: parsed.status ?? 'inquiry',
        fulfillmentDate: new Date(parsed.fulfillmentDate),
        bookingDate: parsed.bookingDate ? new Date(parsed.bookingDate) : new Date(),
        startTime: parsed.startTime,
        endTime: parsed.endTime,
        headcount: parsed.headcount,
        locationType: parsed.locationType ?? 'on_site',
        locationAddress: parsed.locationAddress ?? null,
        clientName: parsed.clientName,
        clientPhone: parsed.clientPhone ?? null,
        clientEmail: parsed.clientEmail ?? null,
        companyName: parsed.companyName ?? null,
        notes: parsed.notes ?? null,
        subtotalCents: parsed.subtotalCents ?? 0,
        serviceChargePercent: parsed.serviceChargePercent ?? null,
        serviceChargeCents: fees.serviceChargeCents,
        taxPercent: parsed.taxPercent ?? null,
        taxCents: fees.taxCents,
        gratuityPercent: parsed.gratuityPercent ?? null,
        gratuityCents: fees.gratuityCents,
        totalCents: parsed.totalCents ?? fees.totalCents,
        paidCents: parsed.paidCents ?? 0,
        packages: parsed.packages ?? [],
        selectedPackageId: parsed.selectedPackageId ?? null,
        milestones: parsed.milestones ?? [],
        dietaryRequirements: parsed.dietaryRequirements ?? null,
        tastings: parsed.tastings ?? null,
        deliveryDetails: parsed.deliveryDetails ?? null,
        brandingLogoUrl: parsed.brandingLogoUrl ?? null,
        brandingColor: parsed.brandingColor ?? null,
        invoiceNotes: parsed.invoiceNotes ?? null,
      },
    });

    await logActivity(event.id, 'created', `Job "${event.title}" created`, 'operator');

    res.status(201).json(event);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
    res.status(500).json({ error: 'Failed to create catering event' });
  }
});

// GET /api/merchant/:merchantId/catering/events/:id
router.get('/:merchantId/catering/events/:id', async (req: Request, res: Response) => {
  try {
    const { merchantId, id } = req.params;
    const event = await prisma.cateringEvent.findFirst({
      where: { id, restaurantId: merchantId },
    });
    if (!event) {
      res.status(404).json({ error: 'Catering event not found' });
      return;
    }
    res.json(event);
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to fetch catering event' });
  }
});

// PATCH /api/merchant/:merchantId/catering/events/:id
router.patch('/:merchantId/catering/events/:id', async (req: Request, res: Response) => {
  try {
    const { merchantId, id } = req.params;
    const parsed = updateEventSchema.parse(req.body);

    const existing = await prisma.cateringEvent.findFirst({
      where: { id, restaurantId: merchantId },
    });
    if (!existing) {
      res.status(404).json({ error: 'Catering event not found' });
      return;
    }

    const data: Record<string, unknown> = { updatedAt: new Date() };

    // Map simple fields
    if (parsed.title !== undefined) data.title = parsed.title;
    if (parsed.eventType !== undefined) data.eventType = parsed.eventType;
    if (parsed.status !== undefined) data.status = parsed.status;
    if (parsed.fulfillmentDate !== undefined) data.fulfillmentDate = new Date(parsed.fulfillmentDate);
    if (parsed.bookingDate !== undefined) data.bookingDate = new Date(parsed.bookingDate);
    if (parsed.startTime !== undefined) data.startTime = parsed.startTime;
    if (parsed.endTime !== undefined) data.endTime = parsed.endTime;
    if (parsed.headcount !== undefined) data.headcount = parsed.headcount;
    if (parsed.locationType !== undefined) data.locationType = parsed.locationType;
    if (parsed.locationAddress !== undefined) data.locationAddress = parsed.locationAddress ?? null;
    if (parsed.clientName !== undefined) data.clientName = parsed.clientName;
    if (parsed.clientPhone !== undefined) data.clientPhone = parsed.clientPhone ?? null;
    if (parsed.clientEmail !== undefined) data.clientEmail = parsed.clientEmail ?? null;
    if (parsed.companyName !== undefined) data.companyName = parsed.companyName ?? null;
    if (parsed.notes !== undefined) data.notes = parsed.notes ?? null;

    // Financial
    if (parsed.subtotalCents !== undefined) data.subtotalCents = parsed.subtotalCents;
    if (parsed.serviceChargePercent !== undefined) data.serviceChargePercent = parsed.serviceChargePercent ?? null;
    if (parsed.taxPercent !== undefined) data.taxPercent = parsed.taxPercent ?? null;
    if (parsed.gratuityPercent !== undefined) data.gratuityPercent = parsed.gratuityPercent ?? null;
    if (parsed.paidCents !== undefined) data.paidCents = parsed.paidCents;

    // Recalculate fees if any financial field changed
    if (parsed.subtotalCents !== undefined || parsed.serviceChargePercent !== undefined ||
        parsed.taxPercent !== undefined || parsed.gratuityPercent !== undefined) {
      const fees = calculateFees({
        subtotalCents: parsed.subtotalCents ?? Number(existing.subtotalCents),
        serviceChargePercent: parsed.serviceChargePercent ?? (existing.serviceChargePercent != null ? Number(existing.serviceChargePercent) : null),
        taxPercent: parsed.taxPercent ?? (existing.taxPercent != null ? Number(existing.taxPercent) : null),
        gratuityPercent: parsed.gratuityPercent ?? (existing.gratuityPercent != null ? Number(existing.gratuityPercent) : null),
      });
      data.serviceChargeCents = fees.serviceChargeCents;
      data.taxCents = fees.taxCents;
      data.gratuityCents = fees.gratuityCents;
      data.totalCents = parsed.totalCents ?? fees.totalCents;
    } else if (parsed.totalCents !== undefined) {
      data.totalCents = parsed.totalCents;
    }

    // JSON fields
    if (parsed.packages !== undefined) data.packages = parsed.packages;
    if (parsed.selectedPackageId !== undefined) data.selectedPackageId = parsed.selectedPackageId ?? null;
    if (parsed.milestones !== undefined) data.milestones = parsed.milestones;
    if (parsed.dietaryRequirements !== undefined) data.dietaryRequirements = parsed.dietaryRequirements ?? null;
    if (parsed.tastings !== undefined) data.tastings = parsed.tastings ?? null;
    if (parsed.deliveryDetails !== undefined) data.deliveryDetails = parsed.deliveryDetails ?? null;

    // Documents
    if (parsed.contractUrl !== undefined) data.contractUrl = parsed.contractUrl ?? null;
    if (parsed.contractSignedAt !== undefined) data.contractSignedAt = parsed.contractSignedAt ? new Date(parsed.contractSignedAt) : null;
    if (parsed.estimateId !== undefined) data.estimateId = parsed.estimateId ?? null;
    if (parsed.invoiceId !== undefined) data.invoiceId = parsed.invoiceId ?? null;

    // Branding
    if (parsed.brandingLogoUrl !== undefined) data.brandingLogoUrl = parsed.brandingLogoUrl ?? null;
    if (parsed.brandingColor !== undefined) data.brandingColor = parsed.brandingColor ?? null;
    if (parsed.invoiceNotes !== undefined) data.invoiceNotes = parsed.invoiceNotes ?? null;

    const updated = await prisma.cateringEvent.update({
      where: { id },
      data,
    });

    // Log status change
    if (parsed.status !== undefined && parsed.status !== existing.status) {
      await logActivity(id, 'status_changed', `Status changed from ${existing.status} to ${parsed.status}`, 'operator', {
        oldStatus: existing.status,
        newStatus: parsed.status,
      });
    }

    res.json(updated);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
    res.status(500).json({ error: 'Failed to update catering event' });
  }
});

// DELETE /api/merchant/:merchantId/catering/events/:id
router.delete('/:merchantId/catering/events/:id', async (req: Request, res: Response) => {
  try {
    const { merchantId, id } = req.params;

    const existing = await prisma.cateringEvent.findFirst({
      where: { id, restaurantId: merchantId },
    });
    if (!existing) {
      res.status(404).json({ error: 'Catering event not found' });
      return;
    }

    await prisma.cateringEvent.delete({ where: { id } });
    res.status(204).send();
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to delete catering event' });
  }
});

// --- Milestone Pay ---

// PATCH /api/merchant/:merchantId/catering/events/:id/milestones/:milestoneId/pay
router.patch('/:merchantId/catering/events/:id/milestones/:milestoneId/pay', async (req: Request, res: Response) => {
  try {
    const { merchantId, id, milestoneId } = req.params;

    const job = await prisma.cateringEvent.findFirst({
      where: { id, restaurantId: merchantId },
    });
    if (!job) {
      res.status(404).json({ error: 'Catering event not found' });
      return;
    }

    const milestones = (job.milestones as Array<{ id: string; label: string; amountCents: number; paidAt?: string }>);
    const milestone = milestones.find(m => m.id === milestoneId);
    if (!milestone) {
      res.status(404).json({ error: 'Milestone not found' });
      return;
    }

    milestone.paidAt = new Date().toISOString();
    const paidCents = milestones
      .filter(m => m.paidAt)
      .reduce((sum, m) => sum + m.amountCents, 0);

    const updated = await prisma.cateringEvent.update({
      where: { id },
      data: { milestones, paidCents },
    });

    await logActivity(id, 'milestone_paid', `Milestone "${milestone.label}" marked as paid ($${(milestone.amountCents / 100).toFixed(2)})`, 'operator', {
      milestoneId,
      amountCents: milestone.amountCents,
    });

    res.json(updated);
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to mark milestone paid' });
  }
});

// --- Clone Job ---

// POST /api/merchant/:merchantId/catering/events/:id/clone
router.post('/:merchantId/catering/events/:id/clone', async (req: Request, res: Response) => {
  try {
    const { merchantId, id } = req.params;

    const source = await prisma.cateringEvent.findFirst({
      where: { id, restaurantId: merchantId },
    });
    if (!source) {
      res.status(404).json({ error: 'Catering event not found' });
      return;
    }

    // Reset milestones to unpaid
    const milestones = (source.milestones as Array<{ id: string; paidAt?: string; reminderSentAt?: string }>).map(m => ({
      ...m,
      id: crypto.randomUUID(),
      paidAt: undefined,
      reminderSentAt: undefined,
    }));

    const clone = await prisma.cateringEvent.create({
      data: {
        restaurantId: merchantId,
        title: `${source.title} (Copy)`,
        eventType: source.eventType,
        status: 'inquiry',
        fulfillmentDate: source.fulfillmentDate,
        bookingDate: new Date(),
        startTime: source.startTime,
        endTime: source.endTime,
        headcount: source.headcount,
        locationType: source.locationType,
        locationAddress: source.locationAddress,
        clientName: source.clientName,
        clientPhone: source.clientPhone,
        clientEmail: source.clientEmail,
        companyName: source.companyName,
        notes: source.notes,
        subtotalCents: source.subtotalCents,
        serviceChargePercent: source.serviceChargePercent,
        serviceChargeCents: source.serviceChargeCents,
        taxPercent: source.taxPercent,
        taxCents: source.taxCents,
        gratuityPercent: source.gratuityPercent,
        gratuityCents: source.gratuityCents,
        totalCents: source.totalCents,
        paidCents: 0,
        packages: source.packages ?? [],
        selectedPackageId: source.selectedPackageId,
        milestones,
        dietaryRequirements: source.dietaryRequirements,
        deliveryDetails: source.deliveryDetails,
        brandingLogoUrl: source.brandingLogoUrl,
        brandingColor: source.brandingColor,
        invoiceNotes: source.invoiceNotes,
      },
    });

    await logActivity(clone.id, 'created', `Job cloned from "${source.title}"`, 'operator', { sourceJobId: id });

    res.status(201).json(clone);
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to clone catering event' });
  }
});

// --- Proposal Token ---

// POST /api/merchant/:merchantId/catering/events/:id/proposal
router.post('/:merchantId/catering/events/:id/proposal', async (req: Request, res: Response) => {
  try {
    const { merchantId, id } = req.params;

    const job = await prisma.cateringEvent.findFirst({
      where: { id, restaurantId: merchantId },
    });
    if (!job) {
      res.status(404).json({ error: 'Catering event not found' });
      return;
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const proposalToken = await prisma.cateringProposalToken.create({
      data: { jobId: id, token, expiresAt },
    });

    await prisma.cateringEvent.update({
      where: { id },
      data: { estimateId: token, status: job.status === 'inquiry' ? 'proposal_sent' : job.status },
    });

    await logActivity(id, 'proposal_sent', 'Proposal generated and ready to send', 'operator', { token });

    // Send proposal email (non-blocking — failure does not fail the API response)
    if (job.clientEmail) {
      try {
        const restaurant = await prisma.restaurant.findUnique({ where: { id: merchantId }, select: { name: true, defaultBrandingColor: true } });
        const proposalUrl = `${process.env.FRONTEND_URL ?? 'https://www.getorderstack.com'}/catering/proposal/${token}`;
        await sendProposal(
          { title: job.title, clientEmail: job.clientEmail, clientName: job.clientName ?? undefined, fulfillmentDate: job.fulfillmentDate.toISOString(), headcount: job.headcount ?? undefined, totalCents: job.totalCents },
          proposalUrl,
          restaurant?.name ?? 'OrderStack',
          restaurant?.defaultBrandingColor ?? null,
        );
      } catch (emailError: unknown) {
        console.error('[Catering] Failed to send proposal email:', emailError);
      }
    }

    res.status(201).json({ token, url: `/catering/proposal/${token}`, expiresAt: proposalToken.expiresAt });
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to generate proposal' });
  }
});

// --- Public Proposal Routes (no auth) ---

// GET /api/catering/proposal/:token
publicRouter.get('/catering/proposal/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const proposalToken = await prisma.cateringProposalToken.findUnique({
      where: { token },
      include: { job: { include: { restaurant: { select: { name: true, logo: true, address: true, phone: true } } } } },
    });

    if (!proposalToken) {
      res.status(404).json({ error: 'Proposal not found' });
      return;
    }

    if (proposalToken.expiresAt < new Date()) {
      res.status(410).json({ error: 'Proposal has expired' });
      return;
    }

    // Mark as viewed
    if (!proposalToken.viewedAt) {
      await prisma.cateringProposalToken.update({
        where: { token },
        data: { viewedAt: new Date() },
      });
      await logActivity(proposalToken.jobId, 'proposal_viewed', 'Client viewed the proposal', 'client');
    }

    res.json(proposalToken.job);
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to fetch proposal' });
  }
});

// POST /api/catering/proposal/:token/approve
publicRouter.post('/catering/proposal/:token/approve', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { packageId } = req.body;

    const proposalToken = await prisma.cateringProposalToken.findUnique({
      where: { token },
      include: { job: true },
    });

    if (!proposalToken) {
      res.status(404).json({ error: 'Proposal not found' });
      return;
    }

    if (proposalToken.expiresAt < new Date()) {
      res.status(410).json({ error: 'Proposal has expired' });
      return;
    }

    if (proposalToken.approvedAt) {
      res.status(409).json({ error: 'Proposal already approved' });
      return;
    }

    const job = proposalToken.job;
    const packages = job.packages as Array<{ id: string; name: string; pricePerUnit: number; pricingModel: string }>;
    const selectedPkg = packages.find(p => p.id === packageId);
    if (!selectedPkg) {
      res.status(400).json({ error: 'Invalid package selection' });
      return;
    }

    // Calculate subtotal from package
    let subtotalCents = 0;
    if (selectedPkg.pricingModel === 'per_person') {
      subtotalCents = Math.round(selectedPkg.pricePerUnit * job.headcount * 100);
    } else if (selectedPkg.pricingModel === 'per_tray') {
      subtotalCents = Math.round(selectedPkg.pricePerUnit * 100);
    } else {
      subtotalCents = Math.round(selectedPkg.pricePerUnit * 100);
    }

    const fees = calculateFees({
      subtotalCents,
      serviceChargePercent: job.serviceChargePercent != null ? Number(job.serviceChargePercent) : null,
      taxPercent: job.taxPercent != null ? Number(job.taxPercent) : null,
      gratuityPercent: job.gratuityPercent != null ? Number(job.gratuityPercent) : null,
    });

    // Update milestones with calculated amounts
    const milestones = (job.milestones as Array<{ id: string; percent: number; amountCents: number }>).map(m => ({
      ...m,
      amountCents: Math.round(fees.totalCents * m.percent / 100),
    }));

    await prisma.cateringEvent.update({
      where: { id: job.id },
      data: {
        selectedPackageId: packageId,
        subtotalCents,
        serviceChargeCents: fees.serviceChargeCents,
        taxCents: fees.taxCents,
        gratuityCents: fees.gratuityCents,
        totalCents: fees.totalCents,
        milestones,
        status: 'contract_signed',
        contractSignedAt: new Date(),
      },
    });

    await prisma.cateringProposalToken.update({
      where: { token },
      data: { approvedAt: new Date() },
    });

    await logActivity(job.id, 'proposal_approved', `Client selected "${selectedPkg.name}" package`, 'client', {
      packageId,
      packageName: selectedPkg.name,
      subtotalCents,
      totalCents: fees.totalCents,
    });

    res.json({ success: true, packageName: selectedPkg.name, totalCents: fees.totalCents });
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to approve proposal' });
  }
});

// --- Public Portal Route ---

// GET /api/catering/portal/:token
publicRouter.get('/catering/portal/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const proposalToken = await prisma.cateringProposalToken.findUnique({
      where: { token },
      include: {
        job: {
          include: {
            restaurant: { select: { name: true, logo: true, address: true, phone: true } },
            activities: { orderBy: { createdAt: 'desc' }, take: 50 },
          },
        },
      },
    });

    if (!proposalToken) {
      res.status(404).json({ error: 'Portal not found' });
      return;
    }

    if (proposalToken.expiresAt < new Date()) {
      res.status(410).json({ error: 'Portal link has expired' });
      return;
    }

    res.json(proposalToken.job);
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to fetch portal data' });
  }
});

// --- Activity Timeline ---

// GET /api/merchant/:merchantId/catering/events/:id/activity
router.get('/:merchantId/catering/events/:id/activity', async (req: Request, res: Response) => {
  try {
    const { merchantId, id } = req.params;

    const job = await prisma.cateringEvent.findFirst({
      where: { id, restaurantId: merchantId },
    });
    if (!job) {
      res.status(404).json({ error: 'Catering event not found' });
      return;
    }

    const activities = await prisma.cateringActivity.findMany({
      where: { jobId: id },
      orderBy: { createdAt: 'desc' },
    });

    res.json(activities);
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to fetch activity timeline' });
  }
});

// --- Contract Upload ---

// POST /api/merchant/:merchantId/catering/events/:id/contract
router.post('/:merchantId/catering/events/:id/contract', async (req: Request, res: Response) => {
  try {
    const { merchantId, id } = req.params;
    const { contractUrl } = req.body;

    if (!contractUrl) {
      res.status(400).json({ error: 'contractUrl is required' });
      return;
    }

    const job = await prisma.cateringEvent.findFirst({
      where: { id, restaurantId: merchantId },
    });
    if (!job) {
      res.status(404).json({ error: 'Catering event not found' });
      return;
    }

    const updated = await prisma.cateringEvent.update({
      where: { id },
      data: { contractUrl },
    });

    await logActivity(id, 'contract_uploaded', 'Contract document uploaded', 'operator');

    res.json(updated);
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to upload contract' });
  }
});

// --- Client History ---

// GET /api/merchant/:merchantId/catering/clients
router.get('/:merchantId/catering/clients', async (req: Request, res: Response) => {
  try {
    const { merchantId } = req.params;

    const jobs = await prisma.cateringEvent.findMany({
      where: { restaurantId: merchantId },
      select: {
        clientName: true,
        clientEmail: true,
        companyName: true,
        totalCents: true,
        status: true,
        fulfillmentDate: true,
      },
    });

    // Aggregate by clientEmail (or clientName if no email)
    const clientMap = new Map<string, {
      clientName: string;
      clientEmail: string | null;
      companyName: string | null;
      totalJobs: number;
      completedJobs: number;
      totalRevenueCents: number;
      lastEventDate: string;
    }>();

    for (const job of jobs) {
      const key = job.clientEmail ?? job.clientName;
      const existing = clientMap.get(key);
      const eventDate = job.fulfillmentDate.toISOString().split('T')[0];

      if (existing) {
        existing.totalJobs += 1;
        if (job.status === 'completed') existing.completedJobs += 1;
        existing.totalRevenueCents += job.totalCents;
        if (eventDate > existing.lastEventDate) existing.lastEventDate = eventDate;
      } else {
        clientMap.set(key, {
          clientName: job.clientName,
          clientEmail: job.clientEmail,
          companyName: job.companyName,
          totalJobs: 1,
          completedJobs: job.status === 'completed' ? 1 : 0,
          totalRevenueCents: job.totalCents,
          lastEventDate: eventDate,
        });
      }
    }

    res.json([...clientMap.values()].sort((a, b) => b.totalRevenueCents - a.totalRevenueCents));
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to fetch client history' });
  }
});

// --- Prep List ---

// GET /api/merchant/:merchantId/catering/prep-list?date=YYYY-MM-DD
router.get('/:merchantId/catering/prep-list', async (req: Request, res: Response) => {
  try {
    const { merchantId } = req.params;
    const { date } = req.query;

    if (!date || typeof date !== 'string') {
      res.status(400).json({ error: 'date query parameter is required (YYYY-MM-DD)' });
      return;
    }

    const targetDate = new Date(date);
    const jobs = await prisma.cateringEvent.findMany({
      where: {
        restaurantId: merchantId,
        fulfillmentDate: targetDate,
        status: { notIn: ['cancelled', 'inquiry'] },
      },
    });

    res.json({
      date,
      jobCount: jobs.length,
      totalGuests: jobs.reduce((sum, j) => sum + j.headcount, 0),
      jobs: jobs.map(j => ({
        id: j.id,
        title: j.title,
        headcount: j.headcount,
        startTime: j.startTime,
        packages: j.packages,
        selectedPackageId: j.selectedPackageId,
        dietaryRequirements: j.dietaryRequirements,
        deliveryDetails: j.deliveryDetails,
      })),
    });
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to generate prep list' });
  }
});

// --- Deferred Revenue Report ---

// GET /api/merchant/:merchantId/reports/catering/deferred
router.get('/:merchantId/reports/catering/deferred', async (req: Request, res: Response) => {
  try {
    const { merchantId } = req.params;

    const jobs = await prisma.cateringEvent.findMany({
      where: {
        restaurantId: merchantId,
        status: { notIn: ['cancelled'] },
      },
      select: {
        id: true,
        title: true,
        fulfillmentDate: true,
        totalCents: true,
        paidCents: true,
      },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const entries = jobs.map(j => {
      const fulfilled = j.fulfillmentDate <= today;
      const recognizedCents = fulfilled ? j.totalCents : 0;
      return {
        jobId: j.id,
        title: j.title,
        fulfillmentDate: j.fulfillmentDate.toISOString().split('T')[0],
        totalCents: j.totalCents,
        paidCents: j.paidCents,
        recognizedCents,
        deferredCents: j.totalCents - recognizedCents,
      };
    });

    res.json(entries);
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to generate deferred revenue report' });
  }
});

// --- Job Performance Report ---

// GET /api/merchant/:merchantId/reports/catering/performance
router.get('/:merchantId/reports/catering/performance', async (req: Request, res: Response) => {
  try {
    const { merchantId } = req.params;

    const jobs = await prisma.cateringEvent.findMany({
      where: { restaurantId: merchantId },
      select: {
        id: true,
        status: true,
        eventType: true,
        totalCents: true,
        paidCents: true,
        fulfillmentDate: true,
      },
    });

    const totalJobs = jobs.length;
    const completedJobs = jobs.filter(j => j.status === 'completed').length;
    const cancelledJobs = jobs.filter(j => j.status === 'cancelled').length;
    const activeJobs = jobs.filter(j => j.status !== 'completed' && j.status !== 'cancelled');
    const totalRevenue = jobs.filter(j => j.status !== 'cancelled').reduce((sum, j) => sum + j.totalCents, 0);
    const avgJobValue = activeJobs.length > 0
      ? Math.round(activeJobs.reduce((sum, j) => sum + j.totalCents, 0) / activeJobs.length)
      : 0;
    const closeRate = totalJobs > 0 ? Math.round((completedJobs / totalJobs) * 100) : 0;

    // Revenue by event type
    const revenueByType: Record<string, number> = {};
    for (const j of jobs.filter(j => j.status !== 'cancelled')) {
      revenueByType[j.eventType] = (revenueByType[j.eventType] ?? 0) + j.totalCents;
    }

    // Revenue by month
    const revenueByMonth: Record<string, number> = {};
    for (const j of jobs.filter(j => j.status !== 'cancelled')) {
      const month = j.fulfillmentDate.toISOString().slice(0, 7);
      revenueByMonth[month] = (revenueByMonth[month] ?? 0) + j.totalCents;
    }

    res.json({
      totalJobs,
      completedJobs,
      cancelledJobs,
      totalRevenue,
      avgJobValue,
      closeRate,
      revenueByType,
      revenueByMonth,
    });
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to generate performance report' });
  }
});

// --- Lead Capture (Public) ---

// POST /api/catering/lead/:merchantSlug
publicRouter.post('/catering/lead/:merchantSlug', async (req: Request, res: Response) => {
  try {
    const { merchantSlug } = req.params;

    const restaurant = await prisma.restaurant.findFirst({
      where: { slug: merchantSlug },
    });
    if (!restaurant) {
      res.status(404).json({ error: 'Business not found' });
      return;
    }

    const leadSchema = z.object({
      clientName: z.string().min(1),
      clientEmail: z.string().email(),
      clientPhone: z.string().optional(),
      companyName: z.string().optional(),
      eventType: z.string().default('other'),
      estimatedDate: z.string().optional(),
      estimatedHeadcount: z.number().int().min(1).optional(),
      message: z.string().optional(),
    });

    const parsed = leadSchema.parse(req.body);

    const event = await prisma.cateringEvent.create({
      data: {
        restaurantId: restaurant.id,
        title: `Inquiry from ${parsed.clientName}`,
        eventType: parsed.eventType,
        status: 'inquiry',
        fulfillmentDate: parsed.estimatedDate ? new Date(parsed.estimatedDate) : new Date(),
        bookingDate: new Date(),
        startTime: '00:00',
        endTime: '00:00',
        headcount: parsed.estimatedHeadcount ?? 1,
        locationType: 'on_site',
        clientName: parsed.clientName,
        clientEmail: parsed.clientEmail,
        clientPhone: parsed.clientPhone ?? null,
        companyName: parsed.companyName ?? null,
        notes: parsed.message ?? null,
      },
    });

    await logActivity(event.id, 'lead_submitted', `New inquiry submitted by ${parsed.clientName}`, 'client');

    res.status(201).json({ success: true, eventId: event.id });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
    res.status(500).json({ error: 'Failed to submit inquiry' });
  }
});

// --- Capacity Settings Routes ---

// GET /api/merchant/:merchantId/catering/capacity
router.get('/:merchantId/catering/capacity', async (req: Request, res: Response) => {
  try {
    const { merchantId } = req.params;
    const settings = await prisma.cateringCapacitySettings.findUnique({
      where: { restaurantId: merchantId },
    });
    res.json(settings ?? {
      maxEventsPerDay: 3,
      maxHeadcountPerDay: 200,
      conflictAlertsEnabled: true,
    });
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to fetch capacity settings' });
  }
});

// PUT /api/merchant/:merchantId/catering/capacity
router.put('/:merchantId/catering/capacity', async (req: Request, res: Response) => {
  try {
    const { merchantId } = req.params;
    const parsed = capacitySchema.parse(req.body);
    const settings = await prisma.cateringCapacitySettings.upsert({
      where: { restaurantId: merchantId },
      create: {
        restaurantId: merchantId,
        maxEventsPerDay: parsed.maxEventsPerDay,
        maxHeadcountPerDay: parsed.maxHeadcountPerDay,
        conflictAlertsEnabled: parsed.conflictAlertsEnabled,
      },
      update: {
        maxEventsPerDay: parsed.maxEventsPerDay,
        maxHeadcountPerDay: parsed.maxHeadcountPerDay,
        conflictAlertsEnabled: parsed.conflictAlertsEnabled,
      },
    });
    res.json(settings);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
    res.status(500).json({ error: 'Failed to save capacity settings' });
  }
});

// --- Package Templates ---

const packageTemplateSchema = z.object({
  name: z.string().min(1),
  tier: z.enum(['standard', 'premium', 'custom']),
  pricingModel: z.enum(['per_person', 'per_tray', 'flat']),
  pricePerUnitCents: z.number().int().nonnegative(),
  minimumHeadcount: z.number().int().min(1).default(1),
  description: z.string().optional(),
  menuItemIds: z.array(z.string()).default([]),
});

router.get('/:merchantId/catering/packages', async (req, res) => {
  const { merchantId } = req.params;
  try {
    const templates = await prisma.cateringPackageTemplate.findMany({
      where: { merchantId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(templates);
  } catch {
    res.status(500).json({ error: 'Failed to load package templates' });
  }
});

router.post('/:merchantId/catering/packages', async (req, res) => {
  const { merchantId } = req.params;
  try {
    const parsed = packageTemplateSchema.parse(req.body);
    const template = await prisma.cateringPackageTemplate.create({
      data: {
        merchantId,
        name: parsed.name,
        tier: parsed.tier,
        pricingModel: parsed.pricingModel,
        pricePerUnitCents: parsed.pricePerUnitCents,
        minimumHeadcount: parsed.minimumHeadcount,
        description: parsed.description,
        menuItemIds: parsed.menuItemIds,
      },
    });
    res.status(201).json(template);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
    res.status(500).json({ error: 'Failed to create package template' });
  }
});

router.patch('/:merchantId/catering/packages/:templateId', async (req, res) => {
  const { merchantId, templateId } = req.params;
  try {
    const parsed = packageTemplateSchema.partial().parse(req.body);
    const template = await prisma.cateringPackageTemplate.update({
      where: { id: templateId, merchantId },
      data: parsed,
    });
    res.json(template);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
    res.status(500).json({ error: 'Failed to update package template' });
  }
});

router.delete('/:merchantId/catering/packages/:templateId', async (req, res) => {
  const { merchantId, templateId } = req.params;
  try {
    await prisma.cateringPackageTemplate.update({
      where: { id: templateId, merchantId },
      data: { isActive: false },
    });
    res.status(204).send();
  } catch {
    res.status(500).json({ error: 'Failed to delete package template' });
  }
});

export default router;
