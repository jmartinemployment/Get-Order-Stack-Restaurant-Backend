import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient, Prisma } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();
const router = Router({ mergeParams: true });

// --- Zod Schemas ---

const createLocationGroupSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  restaurantIds: z.array(z.string().uuid()).optional(),
});

const updateLocationGroupSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  restaurantIds: z.array(z.string().uuid()).optional(),
});

const addMemberSchema = z.object({
  restaurantId: z.string().uuid(),
});

const syncMenuPreviewSchema = z.object({
  sourceRestaurantId: z.string().uuid(),
  targetRestaurantIds: z.array(z.string().uuid()).min(1),
});

const syncMenuExecuteSchema = z.object({
  sourceRestaurantId: z.string().uuid(),
  targetRestaurantIds: z.array(z.string().uuid()).min(1),
  syncedBy: z.string().optional(),
});

const propagateSettingsSchema = z.object({
  settingsType: z.enum(['ai', 'pricing', 'loyalty', 'delivery', 'payment']),
  sourceRestaurantId: z.string().uuid(),
  targetRestaurantIds: z.array(z.string().uuid()).min(1),
  overrideExisting: z.boolean().default(false),
});

// =====================
// LOCATION GROUP CRUD
// =====================

// GET /:groupId/location-groups
router.get('/:groupId/location-groups', async (req: Request, res: Response) => {
  const { groupId } = req.params;
  try {
    const groups = await prisma.locationGroup.findMany({
      where: { restaurantGroupId: groupId },
      include: {
        _count: { select: { members: true } },
        members: {
          include: { restaurant: { select: { id: true, name: true, slug: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });

    const result = groups.map((g) => ({
      ...g,
      memberCount: g._count.members,
      _count: undefined,
    }));

    res.json(result);
  } catch (error: unknown) {
    logger.error('[MultiLocation] List groups error:', error);
    res.status(500).json({ error: 'Failed to list location groups' });
  }
});

// POST /:groupId/location-groups
router.post('/:groupId/location-groups', async (req: Request, res: Response) => {
  const { groupId } = req.params;
  const parsed = createLocationGroupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }

  try {
    const group = await prisma.$transaction(async (tx) => {
      const created = await tx.locationGroup.create({
        data: {
          restaurantGroupId: groupId,
          name: parsed.data.name,
          description: parsed.data.description,
        },
      });

      if (parsed.data.restaurantIds && parsed.data.restaurantIds.length > 0) {
        await tx.locationGroupMember.createMany({
          data: parsed.data.restaurantIds.map((rid) => ({
            locationGroupId: created.id,
            restaurantId: rid,
          })),
        });
      }

      return tx.locationGroup.findUnique({
        where: { id: created.id },
        include: {
          _count: { select: { members: true } },
          members: {
            include: { restaurant: { select: { id: true, name: true, slug: true } } },
          },
        },
      });
    });

    res.status(201).json(group);
  } catch (error: unknown) {
    logger.error('[MultiLocation] Create group error:', error);
    res.status(500).json({ error: 'Failed to create location group' });
  }
});

// PATCH /:groupId/location-groups/:locationGroupId
router.patch('/:groupId/location-groups/:locationGroupId', async (req: Request, res: Response) => {
  const { groupId, locationGroupId } = req.params;
  const parsed = updateLocationGroupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }

  try {
    const group = await prisma.$transaction(async (tx) => {
      const updateData: Record<string, unknown> = {};
      if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
      if (parsed.data.description !== undefined) updateData.description = parsed.data.description;

      await tx.locationGroup.update({
        where: { id: locationGroupId, restaurantGroupId: groupId },
        data: updateData,
      });

      // Sync members if provided
      if (parsed.data.restaurantIds !== undefined) {
        await tx.locationGroupMember.deleteMany({ where: { locationGroupId } });
        if (parsed.data.restaurantIds.length > 0) {
          await tx.locationGroupMember.createMany({
            data: parsed.data.restaurantIds.map((rid) => ({
              locationGroupId,
              restaurantId: rid,
            })),
          });
        }
      }

      return tx.locationGroup.findUnique({
        where: { id: locationGroupId },
        include: {
          _count: { select: { members: true } },
          members: {
            include: { restaurant: { select: { id: true, name: true, slug: true } } },
          },
        },
      });
    });

    res.json(group);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Location group not found' });
      return;
    }
    logger.error('[MultiLocation] Update group error:', error);
    res.status(500).json({ error: 'Failed to update location group' });
  }
});

// DELETE /:groupId/location-groups/:locationGroupId
router.delete('/:groupId/location-groups/:locationGroupId', async (req: Request, res: Response) => {
  const { groupId, locationGroupId } = req.params;
  try {
    await prisma.locationGroup.delete({
      where: { id: locationGroupId, restaurantGroupId: groupId },
    });
    res.json({ success: true });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Location group not found' });
      return;
    }
    logger.error('[MultiLocation] Delete group error:', error);
    res.status(500).json({ error: 'Failed to delete location group' });
  }
});

// =====================
// GROUP MEMBERS
// =====================

// GET /:groupId/location-groups/:locationGroupId/members
router.get('/:groupId/location-groups/:locationGroupId/members', async (req: Request, res: Response) => {
  const { locationGroupId } = req.params;
  try {
    const members = await prisma.locationGroupMember.findMany({
      where: { locationGroupId },
      include: { restaurant: { select: { id: true, name: true, slug: true, city: true, state: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json(members);
  } catch (error: unknown) {
    logger.error('[MultiLocation] List members error:', error);
    res.status(500).json({ error: 'Failed to list members' });
  }
});

// POST /:groupId/location-groups/:locationGroupId/members
router.post('/:groupId/location-groups/:locationGroupId/members', async (req: Request, res: Response) => {
  const { locationGroupId } = req.params;
  const parsed = addMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }

  try {
    const member = await prisma.locationGroupMember.create({
      data: {
        locationGroupId,
        restaurantId: parsed.data.restaurantId,
      },
      include: { restaurant: { select: { id: true, name: true, slug: true } } },
    });
    res.status(201).json(member);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2002') {
      res.status(409).json({ error: 'Restaurant is already a member of this group' });
      return;
    }
    logger.error('[MultiLocation] Add member error:', error);
    res.status(500).json({ error: 'Failed to add member' });
  }
});

// DELETE /:groupId/location-groups/:locationGroupId/members/:memberId
router.delete('/:groupId/location-groups/:locationGroupId/members/:memberId', async (req: Request, res: Response) => {
  const { memberId } = req.params;
  try {
    await prisma.locationGroupMember.delete({ where: { id: memberId } });
    res.json({ success: true });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Member not found' });
      return;
    }
    logger.error('[MultiLocation] Remove member error:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// =====================
// CROSS-LOCATION REPORT
// =====================

// GET /:groupId/cross-location-report
router.get('/:groupId/cross-location-report', async (req: Request, res: Response) => {
  const { groupId } = req.params;
  const days = Number.parseInt(req.query.days as string, 10) || 30;
  const since = new Date();
  since.setDate(since.getDate() - days);

  try {
    // Get all restaurants in this group
    const restaurants = await prisma.restaurant.findMany({
      where: { restaurantGroupId: groupId },
      select: { id: true, name: true, slug: true },
    });

    if (restaurants.length === 0) {
      res.json({ days, locations: [] });
      return;
    }

    const restaurantIds = restaurants.map((r) => r.id);

    // Aggregate orders per restaurant
    const orders = await prisma.order.findMany({
      where: {
        restaurantId: { in: restaurantIds },
        createdAt: { gte: since },
        status: { notIn: ['cancelled'] },
      },
      select: { restaurantId: true, total: true, customerId: true },
    });

    // Build per-location KPIs
    const locationMap = new Map<string, { revenue: number; orderCount: number; customerIds: Set<string> }>();
    for (const r of restaurants) {
      locationMap.set(r.id, { revenue: 0, orderCount: 0, customerIds: new Set() });
    }

    for (const o of orders) {
      const loc = locationMap.get(o.restaurantId);
      if (loc) {
        loc.revenue += Number(o.total);
        loc.orderCount++;
        if (o.customerId) loc.customerIds.add(o.customerId);
      }
    }

    const locations = restaurants.map((r) => {
      const data = locationMap.get(r.id);
      return {
        restaurantId: r.id,
        name: r.name,
        slug: r.slug,
        revenue: Math.round(data.revenue * 100) / 100,
        orderCount: data.orderCount,
        averageOrderValue: data.orderCount > 0
          ? Math.round((data.revenue / data.orderCount) * 100) / 100
          : 0,
        customerCount: data.customerIds.size,
        laborCostPercent: 0, // placeholder — requires labor module integration
        foodCostPercent: 0,  // placeholder — requires food cost module integration
      };
    });

    // Sort by revenue desc
    locations.sort((a, b) => b.revenue - a.revenue);

    res.json({ days, locations });
  } catch (error: unknown) {
    logger.error('[MultiLocation] Cross-location report error:', error);
    res.status(500).json({ error: 'Failed to generate cross-location report' });
  }
});

// =====================
// MENU SYNC
// =====================

// --- Helper: diff source items against a target restaurant ---

interface SyncPreviewDetail {
  itemName: string;
  action: string;
  reason?: string;
}

interface SyncPreviewTarget {
  restaurantId: string;
  toAdd: number;
  toUpdate: number;
  toSkip: number;
  conflicts: number;
  details: SyncPreviewDetail[];
}

async function diffSourceItemsAgainstTarget(
  targetId: string,
  sourceItems: Array<{ name: string; price: unknown }>,
): Promise<SyncPreviewTarget> {
  const targetItems = await prisma.menuItem.findMany({
    where: { restaurantId: targetId },
    select: { name: true, price: true },
  });

  const targetNameSet = new Map(targetItems.map((ti) => [ti.name.toLowerCase(), ti]));

  let toAdd = 0;
  let toSkip = 0;
  let conflicts = 0;
  const details: SyncPreviewDetail[] = [];

  for (const si of sourceItems) {
    const existing = targetNameSet.get(si.name.toLowerCase());
    if (!existing) {
      toAdd++;
      details.push({ itemName: si.name, action: 'add' });
    } else if (Number(existing.price) === Number(si.price)) {
      toSkip++;
      details.push({ itemName: si.name, action: 'skip' });
    } else {
      conflicts++;
      details.push({
        itemName: si.name,
        action: 'conflict',
        reason: `Price differs: source $${Number(si.price)} vs target $${Number(existing.price)}`,
      });
    }
  }

  return { restaurantId: targetId, toAdd, toUpdate: 0, toSkip, conflicts, details };
}

// POST /:groupId/sync-menu/preview
router.post('/:groupId/sync-menu/preview', async (req: Request, res: Response) => {
  const parsed = syncMenuPreviewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }

  try {
    const sourceItems = await prisma.menuItem.findMany({
      where: { restaurantId: parsed.data.sourceRestaurantId },
      select: { id: true, name: true, price: true, categoryId: true, description: true },
    });

    const sourceCategories = await prisma.menuCategory.findMany({
      where: { restaurantId: parsed.data.sourceRestaurantId },
      select: { id: true, name: true },
    });

    const targets: SyncPreviewTarget[] = [];
    for (const targetId of parsed.data.targetRestaurantIds) {
      targets.push(await diffSourceItemsAgainstTarget(targetId, sourceItems));
    }

    res.json({
      sourceRestaurantId: parsed.data.sourceRestaurantId,
      sourceItemCount: sourceItems.length,
      sourceCategoryCount: sourceCategories.length,
      targets,
    });
  } catch (error: unknown) {
    logger.error('[MultiLocation] Sync preview error:', error);
    res.status(500).json({ error: 'Failed to generate sync preview' });
  }
});

type SourceCategory = Awaited<ReturnType<typeof prisma.menuCategory.findMany>>[number];

async function ensureCategoriesOnTarget(
  targetId: string,
  sourceCategories: SourceCategory[],
): Promise<Map<string, string>> {
  const targetCategories = await prisma.menuCategory.findMany({
    where: { restaurantId: targetId },
  });
  const targetCatByName = new Map(targetCategories.map((c) => [c.name.toLowerCase(), c]));
  const catIdMap = new Map<string, string>();

  for (const sc of sourceCategories) {
    const existing = targetCatByName.get(sc.name.toLowerCase());
    if (existing) {
      catIdMap.set(sc.id, existing.id);
    } else {
      const newCat = await prisma.menuCategory.create({
        data: {
          restaurantId: targetId,
          name: sc.name,
          nameEn: sc.nameEn,
          description: sc.description,
          descriptionEn: sc.descriptionEn,
          displayOrder: sc.displayOrder,
          active: sc.active,
        },
      });
      catIdMap.set(sc.id, newCat.id);
    }
  }

  return catIdMap;
}

type SourceItem = Awaited<ReturnType<typeof prisma.menuItem.findMany>>[number];

interface SyncItemCounts {
  added: number;
  skipped: number;
  conflicts: number;
}

async function syncItemsToTarget(
  targetId: string,
  sourceItems: SourceItem[],
  catIdMap: Map<string, string>,
): Promise<SyncItemCounts> {
  const targetItems = await prisma.menuItem.findMany({
    where: { restaurantId: targetId },
  });
  const targetItemByName = new Map(targetItems.map((ti) => [ti.name.toLowerCase(), ti]));

  let added = 0;
  let skipped = 0;
  let conflicts = 0;

  for (const si of sourceItems) {
    const existing = targetItemByName.get(si.name.toLowerCase());
    const targetCatId = catIdMap.get(si.categoryId);

    if (!targetCatId) {
      skipped++;
      continue;
    }

    if (existing) {
      if (Number(existing.price) === Number(si.price)) {
        skipped++;
      } else {
        conflicts++;
      }
    } else {
      await prisma.menuItem.create({
        data: {
          restaurantId: targetId,
          categoryId: targetCatId,
          name: si.name,
          nameEn: si.nameEn,
          description: si.description,
          descriptionEn: si.descriptionEn,
          price: si.price,
          cost: si.cost,
          image: si.image,
          available: si.available,
          popular: si.popular,
          dietary: si.dietary,
          displayOrder: si.displayOrder,
          prepTimeMinutes: si.prepTimeMinutes,
          taxCategory: si.taxCategory,
        },
      });
      added++;
    }
  }

  return { added, skipped, conflicts };
}

// POST /:groupId/sync-menu
router.post('/:groupId/sync-menu', async (req: Request, res: Response) => {
  const { groupId } = req.params;
  const parsed = syncMenuExecuteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }

  try {
    const sourceItems = await prisma.menuItem.findMany({
      where: { restaurantId: parsed.data.sourceRestaurantId },
      include: { category: { select: { name: true } } },
    });

    const sourceCategories = await prisma.menuCategory.findMany({
      where: { restaurantId: parsed.data.sourceRestaurantId },
    });

    let totalAdded = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalConflicts = 0;

    for (const targetId of parsed.data.targetRestaurantIds) {
      const catIdMap = await ensureCategoriesOnTarget(targetId, sourceCategories);
      const counts = await syncItemsToTarget(targetId, sourceItems, catIdMap);
      totalAdded += counts.added;
      totalSkipped += counts.skipped;
      totalConflicts += counts.conflicts;
    }

    await prisma.menuSyncLog.create({
      data: {
        restaurantGroupId: groupId,
        sourceRestaurantId: parsed.data.sourceRestaurantId,
        targetRestaurantIds: parsed.data.targetRestaurantIds,
        itemsAdded: totalAdded,
        itemsUpdated: totalUpdated,
        itemsSkipped: totalSkipped,
        conflicts: totalConflicts,
        syncedBy: parsed.data.syncedBy,
      },
    });

    res.json({
      itemsAdded: totalAdded,
      itemsUpdated: totalUpdated,
      itemsSkipped: totalSkipped,
      conflicts: totalConflicts,
    });
  } catch (error: unknown) {
    logger.error('[MultiLocation] Menu sync error:', error);
    res.status(500).json({ error: 'Failed to sync menu' });
  }
});

// GET /:groupId/sync-menu/history
router.get('/:groupId/sync-menu/history', async (req: Request, res: Response) => {
  const { groupId } = req.params;
  try {
    const logs = await prisma.menuSyncLog.findMany({
      where: { restaurantGroupId: groupId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(logs);
  } catch (error: unknown) {
    logger.error('[MultiLocation] Sync history error:', error);
    res.status(500).json({ error: 'Failed to load sync history' });
  }
});

// =====================
// SETTINGS PROPAGATION
// =====================

async function propagateAiSettings(
  targetId: string,
  sourceAiSettings: unknown,
  targetAiSettings: unknown,
  overrideExisting: boolean,
): Promise<boolean> {
  if (!overrideExisting && targetAiSettings) return false;
  await prisma.restaurant.update({
    where: { id: targetId },
    data: { aiSettings: sourceAiSettings as Prisma.InputJsonValue },
  });
  return true;
}

async function propagateLoyaltySettings(
  sourceRestaurantId: string,
  targetId: string,
  overrideExisting: boolean,
): Promise<boolean> {
  const sourceConfig = await prisma.restaurantLoyaltyConfig.findUnique({
    where: { restaurantId: sourceRestaurantId },
  });
  if (!sourceConfig) return false;

  const targetConfig = await prisma.restaurantLoyaltyConfig.findUnique({
    where: { restaurantId: targetId },
  });
  if (!overrideExisting && targetConfig) return false;

  const loyaltyData = {
    enabled: sourceConfig.enabled,
    pointsPerDollar: sourceConfig.pointsPerDollar,
    pointsRedemptionRate: sourceConfig.pointsRedemptionRate,
    tierSilverMin: sourceConfig.tierSilverMin,
    tierGoldMin: sourceConfig.tierGoldMin,
    tierPlatinumMin: sourceConfig.tierPlatinumMin,
    silverMultiplier: sourceConfig.silverMultiplier,
    goldMultiplier: sourceConfig.goldMultiplier,
    platinumMultiplier: sourceConfig.platinumMultiplier,
  };

  await prisma.restaurantLoyaltyConfig.upsert({
    where: { restaurantId: targetId },
    create: { restaurantId: targetId, ...loyaltyData },
    update: loyaltyData,
  });
  return true;
}

const JSON_SETTINGS_KEY_MAP: Record<string, string> = {
  pricing: 'onlinePricing',
  delivery: 'deliverySettings',
  payment: 'paymentSettings',
};

async function propagateJsonSubkey(
  targetId: string,
  settingsType: string,
  sourceAiSettings: unknown,
  targetAiSettings: unknown,
  overrideExisting: boolean,
): Promise<boolean> {
  const sourceSettings = (sourceAiSettings as Record<string, unknown>) ?? {};
  const targetSettings = (targetAiSettings as Record<string, unknown>) ?? {};
  const settingsKey = JSON_SETTINGS_KEY_MAP[settingsType];

  if (!sourceSettings[settingsKey]) return false;
  if (!overrideExisting && targetSettings[settingsKey]) return false;

  const merged = {
    ...targetSettings,
    [settingsKey]: sourceSettings[settingsKey],
  } as Record<string, unknown>;

  await prisma.restaurant.update({
    where: { id: targetId },
    data: {
      aiSettings: merged as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- Prisma Json field
    },
  });
  return true;
}

// POST /:groupId/propagate-settings
async function propagateToTarget(
  targetId: string,
  settingsType: string,
  sourceRestaurantId: string,
  sourceAiSettings: unknown,
  overrideExisting: boolean,
): Promise<boolean> {
  const target = await prisma.restaurant.findUnique({
    where: { id: targetId },
    select: { aiSettings: true },
  });
  if (!target) return false;

  switch (settingsType) {
    case 'ai':
      return propagateAiSettings(targetId, sourceAiSettings, target.aiSettings, overrideExisting);
    case 'loyalty':
      return propagateLoyaltySettings(sourceRestaurantId, targetId, overrideExisting);
    case 'pricing':
    case 'delivery':
    case 'payment':
      return propagateJsonSubkey(targetId, settingsType, sourceAiSettings, target.aiSettings, overrideExisting);
    default:
      return false;
  }
}

router.post('/:groupId/propagate-settings', async (req: Request, res: Response) => {
  const parsed = propagateSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }

  try {
    const source = await prisma.restaurant.findUnique({
      where: { id: parsed.data.sourceRestaurantId },
      select: { aiSettings: true, taxRate: true },
    });

    if (!source) {
      res.status(404).json({ error: 'Source restaurant not found' });
      return;
    }

    let updatedCount = 0;
    for (const targetId of parsed.data.targetRestaurantIds) {
      const didUpdate = await propagateToTarget(
        targetId, parsed.data.settingsType, parsed.data.sourceRestaurantId,
        source.aiSettings, parsed.data.overrideExisting,
      );
      if (didUpdate) updatedCount++;
    }

    res.json({
      settingsType: parsed.data.settingsType,
      targetCount: parsed.data.targetRestaurantIds.length,
      updatedCount,
    });
  } catch (error: unknown) {
    logger.error('[MultiLocation] Propagate settings error:', error);
    res.status(500).json({ error: 'Failed to propagate settings' });
  }
});

export default router;
