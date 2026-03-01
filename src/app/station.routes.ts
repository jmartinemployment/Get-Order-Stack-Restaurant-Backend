import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router({ mergeParams: true });

// --- Zod schemas ---

const createStationSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().max(20).optional(),
  displayOrder: z.number().int().min(0).default(0),
  isExpo: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

const updateStationSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  color: z.string().max(20).nullable().optional(),
  displayOrder: z.number().int().min(0).optional(),
  isExpo: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

const setCategoriesSchema = z.object({
  categoryIds: z.array(z.string().uuid()),
});

// --- Station CRUD ---

// GET /api/restaurant/:merchantId/stations
router.get('/', async (req: Request, res: Response) => {
  const restaurantId = req.params.merchantId;
  try {
    const stations = await prisma.station.findMany({
      where: { restaurantId },
      include: {
        categoryMappings: {
          select: { categoryId: true },
        },
      },
      orderBy: { displayOrder: 'asc' },
    });

    const result = stations.map(s => ({
      ...s,
      categoryIds: s.categoryMappings.map(m => m.categoryId),
      categoryMappings: undefined,
    }));

    res.json(result);
  } catch (error: unknown) {
    console.error('[Station] List error:', error);
    res.status(500).json({ error: 'Failed to list stations' });
  }
});

// POST /api/restaurant/:merchantId/stations
router.post('/', async (req: Request, res: Response) => {
  const restaurantId = req.params.merchantId;
  const parsed = createStationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }

  try {
    const station = await prisma.station.create({
      data: {
        restaurantId,
        ...parsed.data,
      },
    });
    res.status(201).json({ ...station, categoryIds: [] });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2002') {
      res.status(409).json({ error: `Station "${parsed.data.name}" already exists` });
      return;
    }
    console.error('[Station] Create error:', error);
    res.status(500).json({ error: 'Failed to create station' });
  }
});

// PATCH /api/restaurant/:merchantId/stations/:stationId
router.patch('/:stationId', async (req: Request, res: Response) => {
  const { restaurantId, stationId } = req.params;
  const parsed = updateStationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }

  try {
    const station = await prisma.station.update({
      where: { id: stationId, restaurantId },
      data: parsed.data,
      include: {
        categoryMappings: { select: { categoryId: true } },
      },
    });
    res.json({
      ...station,
      categoryIds: station.categoryMappings.map(m => m.categoryId),
      categoryMappings: undefined,
    });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Station not found' });
      return;
    }
    if ((error as { code?: string }).code === 'P2002') {
      res.status(409).json({ error: `Station name already exists` });
      return;
    }
    console.error('[Station] Update error:', error);
    res.status(500).json({ error: 'Failed to update station' });
  }
});

// DELETE /api/restaurant/:merchantId/stations/:stationId
router.delete('/:stationId', async (req: Request, res: Response) => {
  const { restaurantId, stationId } = req.params;
  try {
    await prisma.station.delete({
      where: { id: stationId, restaurantId },
    });
    res.json({ success: true });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Station not found' });
      return;
    }
    console.error('[Station] Delete error:', error);
    res.status(500).json({ error: 'Failed to delete station' });
  }
});

// --- Station-Category Mapping ---

// PUT /api/restaurant/:merchantId/stations/:stationId/categories
// Bulk set categories for a station (replaces existing mappings)
router.put('/:stationId/categories', async (req: Request, res: Response) => {
  const { restaurantId, stationId } = req.params;
  const parsed = setCategoriesSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }

  try {
    // Verify station belongs to restaurant
    const station = await prisma.station.findFirst({
      where: { id: stationId, restaurantId },
    });
    if (!station) {
      res.status(404).json({ error: 'Station not found' });
      return;
    }

    await prisma.$transaction([
      // Remove all existing mappings for this station
      prisma.stationCategoryMapping.deleteMany({
        where: { stationId },
      }),
      // Remove any mappings for these categories from OTHER stations (exclusivity)
      ...(parsed.data.categoryIds.length > 0
        ? [prisma.stationCategoryMapping.deleteMany({
            where: {
              restaurantId,
              categoryId: { in: parsed.data.categoryIds },
              stationId: { not: stationId },
            },
          })]
        : []),
      // Create new mappings
      ...(parsed.data.categoryIds.length > 0
        ? [prisma.stationCategoryMapping.createMany({
            data: parsed.data.categoryIds.map(categoryId => ({
              stationId,
              categoryId,
              restaurantId,
            })),
          })]
        : []),
    ]);

    res.json({ success: true, stationId, categoryIds: parsed.data.categoryIds });
  } catch (error: unknown) {
    console.error('[Station] Set categories error:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to set station categories', detail: message });
  }
});

export default router;

// --- Flat mapping list route (mounted separately) ---

export const stationCategoryMappingRouter = Router({ mergeParams: true });

// GET /api/restaurant/:merchantId/station-category-mappings
stationCategoryMappingRouter.get('/', async (req: Request, res: Response) => {
  const restaurantId = req.params.merchantId;
  try {
    const mappings = await prisma.stationCategoryMapping.findMany({
      where: { restaurantId },
      select: {
        stationId: true,
        categoryId: true,
      },
    });
    res.json(mappings);
  } catch (error: unknown) {
    console.error('[Station] List mappings error:', error);
    res.status(500).json({ error: 'Failed to list station-category mappings' });
  }
});
