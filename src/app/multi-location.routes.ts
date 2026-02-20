import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';

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
    console.error('[MultiLocation] List groups error:', error);
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
    console.error('[MultiLocation] Create group error:', error);
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
    console.error('[MultiLocation] Update group error:', error);
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
    console.error('[MultiLocation] Delete group error:', error);
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
    console.error('[MultiLocation] List members error:', error);
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
    console.error('[MultiLocation] Add member error:', error);
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
    console.error('[MultiLocation] Remove member error:', error);
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
      const data = locationMap.get(r.id)!;
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
    console.error('[MultiLocation] Cross-location report error:', error);
    res.status(500).json({ error: 'Failed to generate cross-location report' });
  }
});

// =====================
// MENU SYNC
// =====================

// POST /:groupId/sync-menu/preview
router.post('/:groupId/sync-menu/preview', async (req: Request, res: Response) => {
  const parsed = syncMenuPreviewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }

  try {
    // Source menu items
    const sourceItems = await prisma.menuItem.findMany({
      where: { restaurantId: parsed.data.sourceRestaurantId },
      select: { id: true, name: true, price: true, categoryId: true, description: true },
    });

    const sourceCategories = await prisma.menuCategory.findMany({
      where: { restaurantId: parsed.data.sourceRestaurantId },
      select: { id: true, name: true },
    });

    const sourceCatMap = new Map(sourceCategories.map((c) => [c.id, c.name]));

    // Per-target diff
    const targets: Array<{
      restaurantId: string;
      toAdd: number;
      toUpdate: number;
      toSkip: number;
      conflicts: number;
      details: Array<{ itemName: string; action: string; reason?: string }>;
    }> = [];

    for (const targetId of parsed.data.targetRestaurantIds) {
      const targetItems = await prisma.menuItem.findMany({
        where: { restaurantId: targetId },
        select: { name: true, price: true },
      });

      const targetNameSet = new Map(targetItems.map((ti) => [ti.name.toLowerCase(), ti]));

      let toAdd = 0;
      let toUpdate = 0;
      let toSkip = 0;
      let conflicts = 0;
      const details: Array<{ itemName: string; action: string; reason?: string }> = [];

      for (const si of sourceItems) {
        const existing = targetNameSet.get(si.name.toLowerCase());
        if (!existing) {
          toAdd++;
          details.push({ itemName: si.name, action: 'add' });
        } else if (Number(existing.price) !== Number(si.price)) {
          conflicts++;
          details.push({
            itemName: si.name,
            action: 'conflict',
            reason: `Price differs: source $${si.price} vs target $${existing.price}`,
          });
        } else {
          toSkip++;
          details.push({ itemName: si.name, action: 'skip' });
        }
      }

      targets.push({ restaurantId: targetId, toAdd, toUpdate, toSkip, conflicts, details });
    }

    res.json({
      sourceRestaurantId: parsed.data.sourceRestaurantId,
      sourceItemCount: sourceItems.length,
      sourceCategoryCount: sourceCategories.length,
      targets,
    });
  } catch (error: unknown) {
    console.error('[MultiLocation] Sync preview error:', error);
    res.status(500).json({ error: 'Failed to generate sync preview' });
  }
});

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
      // Ensure categories exist on target
      const targetCategories = await prisma.menuCategory.findMany({
        where: { restaurantId: targetId },
      });
      const targetCatByName = new Map(targetCategories.map((c) => [c.name.toLowerCase(), c]));

      const catIdMap = new Map<string, string>(); // source cat ID -> target cat ID

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

      // Sync items
      const targetItems = await prisma.menuItem.findMany({
        where: { restaurantId: targetId },
      });
      const targetItemByName = new Map(targetItems.map((ti) => [ti.name.toLowerCase(), ti]));

      for (const si of sourceItems) {
        const existing = targetItemByName.get(si.name.toLowerCase());
        const targetCatId = catIdMap.get(si.categoryId);

        if (!targetCatId) {
          totalSkipped++;
          continue;
        }

        if (!existing) {
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
          totalAdded++;
        } else if (Number(existing.price) !== Number(si.price)) {
          totalConflicts++;
        } else {
          totalSkipped++;
        }
      }
    }

    // Log the sync
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
    console.error('[MultiLocation] Menu sync error:', error);
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
    console.error('[MultiLocation] Sync history error:', error);
    res.status(500).json({ error: 'Failed to load sync history' });
  }
});

// =====================
// SETTINGS PROPAGATION
// =====================

// POST /:groupId/propagate-settings
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
      const target = await prisma.restaurant.findUnique({
        where: { id: targetId },
        select: { aiSettings: true },
      });

      if (!target) continue;

      switch (parsed.data.settingsType) {
        case 'ai': {
          if (!parsed.data.overrideExisting && target.aiSettings) continue;
          await prisma.restaurant.update({
            where: { id: targetId },
            data: { aiSettings: source.aiSettings },
          });
          updatedCount++;
          break;
        }
        case 'loyalty': {
          const sourceConfig = await prisma.restaurantLoyaltyConfig.findUnique({
            where: { restaurantId: parsed.data.sourceRestaurantId },
          });
          if (!sourceConfig) continue;

          const targetConfig = await prisma.restaurantLoyaltyConfig.findUnique({
            where: { restaurantId: targetId },
          });

          if (!parsed.data.overrideExisting && targetConfig) continue;

          await prisma.restaurantLoyaltyConfig.upsert({
            where: { restaurantId: targetId },
            create: {
              restaurantId: targetId,
              enabled: sourceConfig.enabled,
              pointsPerDollar: sourceConfig.pointsPerDollar,
              pointsRedemptionRate: sourceConfig.pointsRedemptionRate,
              tierSilverMin: sourceConfig.tierSilverMin,
              tierGoldMin: sourceConfig.tierGoldMin,
              tierPlatinumMin: sourceConfig.tierPlatinumMin,
              silverMultiplier: sourceConfig.silverMultiplier,
              goldMultiplier: sourceConfig.goldMultiplier,
              platinumMultiplier: sourceConfig.platinumMultiplier,
            },
            update: {
              enabled: sourceConfig.enabled,
              pointsPerDollar: sourceConfig.pointsPerDollar,
              pointsRedemptionRate: sourceConfig.pointsRedemptionRate,
              tierSilverMin: sourceConfig.tierSilverMin,
              tierGoldMin: sourceConfig.tierGoldMin,
              tierPlatinumMin: sourceConfig.tierPlatinumMin,
              silverMultiplier: sourceConfig.silverMultiplier,
              goldMultiplier: sourceConfig.goldMultiplier,
              platinumMultiplier: sourceConfig.platinumMultiplier,
            },
          });
          updatedCount++;
          break;
        }
        case 'pricing':
        case 'delivery':
        case 'payment': {
          // These are stored in aiSettings JSON on the Restaurant model
          // Propagate the relevant sub-key
          const sourceSettings = (source.aiSettings as Record<string, unknown>) ?? {};
          const targetSettings = (target?.aiSettings as Record<string, unknown>) ?? {};

          const keyMap: Record<string, string> = {
            pricing: 'onlinePricing',
            delivery: 'deliverySettings',
            payment: 'paymentSettings',
          };

          const settingsKey = keyMap[parsed.data.settingsType];
          if (!sourceSettings[settingsKey]) continue;

          if (!parsed.data.overrideExisting && targetSettings[settingsKey]) continue;

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
          updatedCount++;
          break;
        }
      }
    }

    res.json({
      settingsType: parsed.data.settingsType,
      targetCount: parsed.data.targetRestaurantIds.length,
      updatedCount,
    });
  } catch (error: unknown) {
    console.error('[MultiLocation] Propagate settings error:', error);
    res.status(500).json({ error: 'Failed to propagate settings' });
  }
});

export default router;
