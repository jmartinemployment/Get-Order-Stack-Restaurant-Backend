import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { authService } from '../services/auth.service';
import { broadcastToSourceAndKDS } from '../services/socket.service';
import { enrichOrderResponse } from '../utils/order-enrichment';

const router = Router({ mergeParams: true });
const prisma = new PrismaClient();

// ============ Zod Schemas ============

const addItemSchema = z.object({
  menuItemId: z.string().optional(),
  menuItemName: z.string().min(1),
  quantity: z.number().int().min(1),
  unitPrice: z.number().min(0),
  modifiers: z.array(z.object({
    modifierId: z.string().optional(),
    modifierName: z.string(),
    priceAdjustment: z.number(),
  })).default([]),
  seatNumber: z.number().int().min(1).optional(),
  specialInstructions: z.string().optional(),
  courseGuid: z.string().optional(),
});

const splitSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('by_item'),
    itemGuids: z.array(z.string()).min(1),
    targetCheckGuid: z.string().optional(),
  }),
  z.object({
    mode: z.literal('by_equal'),
    numberOfWays: z.number().int().min(2),
  }),
  z.object({
    mode: z.literal('by_seat'),
  }),
]);

const mergeSchema = z.object({
  checkGuids: z.array(z.string()).min(2),
});

const transferSchema = z.object({
  targetTableId: z.string().min(1),
});

const voidSchema = z.object({
  reason: z.string().min(1),
  voidedBy: z.string().min(1),
  managerPin: z.string().optional(),
});

const compSchema = z.object({
  reason: z.string().min(1),
  compBy: z.string().min(1),
  managerPin: z.string().optional(),
});

const discountSchema = z.object({
  type: z.enum(['percentage', 'flat', 'comp']),
  value: z.number().min(0),
  reason: z.string().min(1),
  appliedBy: z.string().min(1),
  managerPin: z.string().optional(),
});

const openTabSchema = z.object({
  checkGuid: z.string().min(1),
  tabName: z.string().min(1),
  preauthId: z.string().optional(),
});

const closeTabSchema = z.object({
  checkGuid: z.string().min(1),
});

// ============ Shared Include ============

const CHECK_ORDER_INCLUDE = {
  orderItems: { include: { modifiers: true } },
  checks: {
    include: {
      items: { include: { modifiers: true } },
      discounts: true,
      voidedItems: true,
    },
    orderBy: { displayNumber: 'asc' as const },
  },
  customer: true,
  table: true,
  marketplaceOrder: true,
} as const;

// ============ Helpers ============

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function validateManagerPin(restaurantId: string, pin: string): Promise<{ valid: boolean; staffName?: string }> {
  const ROLE_RANK: Record<string, number> = {
    staff: 1,
    manager: 2,
    owner: 3,
    super_admin: 4,
  };

  const result = await authService.verifyStaffPin(restaurantId, pin);
  if (!result.success || !result.staffPin) {
    return { valid: false };
  }
  const rank = ROLE_RANK[result.staffPin.role] ?? 0;
  if (rank < 2) {
    return { valid: false };
  }
  return { valid: true, staffName: result.staffPin.name };
}

async function recalculateCheck(checkId: string, taxRate: number): Promise<void> {
  const check = await prisma.orderCheck.findUnique({
    where: { id: checkId },
    include: { items: true, discounts: true },
  });
  if (!check) return;

  // Sum non-comped items
  let subtotal = 0;
  for (const item of check.items) {
    if (!item.isComped) {
      subtotal += Number(item.totalPrice);
    }
  }

  // Subtract discounts
  let discountTotal = 0;
  for (const d of check.discounts) {
    if (d.type === 'percentage') {
      discountTotal += round2(subtotal * Number(d.value) / 100);
    } else if (d.type === 'flat') {
      discountTotal += Number(d.value);
    } else if (d.type === 'comp') {
      discountTotal += Number(d.value);
    }
  }

  subtotal = round2(Math.max(0, subtotal - discountTotal));
  const tax = round2(subtotal * taxRate);
  const tip = Number(check.tip);
  const total = round2(subtotal + tax + tip);

  await prisma.orderCheck.update({
    where: { id: checkId },
    data: { subtotal, tax, total },
  });
}

async function recalculateOrderTotals(orderId: string): Promise<void> {
  const checks = await prisma.orderCheck.findMany({
    where: { orderId },
  });

  let subtotal = 0;
  let tax = 0;
  let tip = 0;
  let total = 0;

  for (const check of checks) {
    subtotal += Number(check.subtotal);
    tax += Number(check.tax);
    tip += Number(check.tip);
    total += Number(check.total);
  }

  await prisma.order.update({
    where: { id: orderId },
    data: {
      subtotal: round2(subtotal),
      tax: round2(tax),
      tip: round2(tip),
      total: round2(total),
    },
  });
}

async function fetchAndBroadcast(orderId: string, restaurantId: string): Promise<any> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: CHECK_ORDER_INCLUDE,
  });
  if (!order) return null;

  const enriched = enrichOrderResponse(order);
  broadcastToSourceAndKDS(restaurantId, order.sourceDeviceId, 'order:updated', enriched);
  return enriched;
}

async function getTaxRate(restaurantId: string): Promise<number> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { taxRate: true },
  });
  return Number(restaurant?.taxRate ?? 0.07);
}

// ============ Routes ============

// 1. POST /:orderId/checks — Create empty check
router.post('/:orderId/checks', async (req: Request, res: Response) => {
  try {
    const { restaurantId, orderId } = req.params;

    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
    });
    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    const checkCount = await prisma.orderCheck.count({ where: { orderId } });

    const check = await prisma.orderCheck.create({
      data: {
        orderId,
        restaurantId,
        displayNumber: checkCount + 1,
      },
      include: {
        items: { include: { modifiers: true } },
        discounts: true,
        voidedItems: true,
      },
    });

    await fetchAndBroadcast(orderId, restaurantId);
    res.status(201).json(check);
  } catch (error: unknown) {
    console.error('[Check] Error creating check:', error);
    res.status(500).json({ error: 'Failed to create check' });
  }
});

// 2. POST /:orderId/checks/:checkGuid/items — Add item to check
router.post('/:orderId/checks/:checkGuid/items', async (req: Request, res: Response) => {
  try {
    const { restaurantId, orderId, checkGuid } = req.params;
    const parsed = addItemSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid item data', details: parsed.error.issues });
      return;
    }

    const data = parsed.data;
    const check = await prisma.orderCheck.findFirst({
      where: { id: checkGuid, orderId },
    });
    if (!check) {
      res.status(404).json({ error: 'Check not found' });
      return;
    }

    const modifiersPrice = data.modifiers.reduce((sum, m) => sum + m.priceAdjustment, 0);
    const totalPrice = round2((data.unitPrice + modifiersPrice) * data.quantity);

    const item = await prisma.$transaction(async (tx) => {
      const checkItem = await tx.checkItem.create({
        data: {
          checkId: checkGuid,
          orderId,
          menuItemId: data.menuItemId,
          menuItemName: data.menuItemName,
          quantity: data.quantity,
          unitPrice: data.unitPrice,
          modifiersPrice,
          totalPrice,
          specialInstructions: data.specialInstructions,
          seatNumber: data.seatNumber,
          courseGuid: data.courseGuid,
          modifiers: {
            create: data.modifiers.map(m => ({
              modifierId: m.modifierId,
              modifierName: m.modifierName,
              priceAdjustment: m.priceAdjustment,
            })),
          },
        },
        include: { modifiers: true },
      });

      // Also create a matching OrderItem for KDS visibility
      await tx.orderItem.create({
        data: {
          orderId,
          menuItemId: data.menuItemId,
          menuItemName: data.menuItemName,
          quantity: data.quantity,
          unitPrice: data.unitPrice,
          modifiersPrice,
          totalPrice,
          specialInstructions: data.specialInstructions,
          fulfillmentStatus: 'NEW',
          courseGuid: data.courseGuid,
          modifiers: {
            create: data.modifiers.map(m => ({
              modifierId: m.modifierId,
              modifierName: m.modifierName,
              priceAdjustment: m.priceAdjustment,
            })),
          },
        },
      });

      return checkItem;
    });

    const taxRate = await getTaxRate(restaurantId);
    await recalculateCheck(checkGuid, taxRate);
    await recalculateOrderTotals(orderId);
    await fetchAndBroadcast(orderId, restaurantId);

    res.status(201).json(item);
  } catch (error: unknown) {
    console.error('[Check] Error adding item:', error);
    res.status(500).json({ error: 'Failed to add item to check' });
  }
});

// 3. PATCH /:orderId/checks/:checkGuid/split — Split check
router.patch('/:orderId/checks/:checkGuid/split', async (req: Request, res: Response) => {
  try {
    const { restaurantId, orderId, checkGuid } = req.params;
    const parsed = splitSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid split data', details: parsed.error.issues });
      return;
    }

    const data = parsed.data;
    const taxRate = await getTaxRate(restaurantId);

    const sourceCheck = await prisma.orderCheck.findFirst({
      where: { id: checkGuid, orderId },
      include: { items: { include: { modifiers: true } } },
    });
    if (!sourceCheck) {
      res.status(404).json({ error: 'Check not found' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      if (data.mode === 'by_item') {
        // Move specified items to a new or existing check
        let targetCheckId = data.targetCheckGuid;

        if (!targetCheckId) {
          const checkCount = await tx.orderCheck.count({ where: { orderId } });
          const newCheck = await tx.orderCheck.create({
            data: {
              orderId,
              restaurantId,
              displayNumber: checkCount + 1,
            },
          });
          targetCheckId = newCheck.id;
        }

        await tx.checkItem.updateMany({
          where: { id: { in: data.itemGuids }, checkId: checkGuid },
          data: { checkId: targetCheckId },
        });

      } else if (data.mode === 'by_equal') {
        // Round-robin items across N new checks
        const items = sourceCheck.items;
        const numberOfWays = data.numberOfWays;
        const checkCount = await tx.orderCheck.count({ where: { orderId } });

        // Create N-1 new checks (source check is check 1)
        const newCheckIds: string[] = [checkGuid];
        for (let i = 1; i < numberOfWays; i++) {
          const newCheck = await tx.orderCheck.create({
            data: {
              orderId,
              restaurantId,
              displayNumber: checkCount + i,
            },
          });
          newCheckIds.push(newCheck.id);
        }

        // Round-robin assign items
        for (let i = 0; i < items.length; i++) {
          const targetIdx = i % numberOfWays;
          if (targetIdx !== 0) {
            await tx.checkItem.update({
              where: { id: items[i].id },
              data: { checkId: newCheckIds[targetIdx] },
            });
          }
        }

      } else if (data.mode === 'by_seat') {
        // Group items by seat number into separate checks
        const seatMap = new Map<number, string[]>();
        for (const item of sourceCheck.items) {
          const seat = item.seatNumber ?? 0;
          const existing = seatMap.get(seat);
          if (existing) {
            existing.push(item.id);
          } else {
            seatMap.set(seat, [item.id]);
          }
        }

        if (seatMap.size <= 1) {
          // All items on same seat, nothing to split
          return;
        }

        const checkCount = await tx.orderCheck.count({ where: { orderId } });
        let idx = 0;
        for (const [, itemIds] of seatMap) {
          if (idx === 0) {
            // Keep first seat group on source check
            idx++;
            continue;
          }
          const newCheck = await tx.orderCheck.create({
            data: {
              orderId,
              restaurantId,
              displayNumber: checkCount + idx,
            },
          });
          await tx.checkItem.updateMany({
            where: { id: { in: itemIds } },
            data: { checkId: newCheck.id },
          });
          idx++;
        }
      }
    });

    // Recalculate all checks for this order
    const allChecks = await prisma.orderCheck.findMany({ where: { orderId } });
    for (const c of allChecks) {
      await recalculateCheck(c.id, taxRate);
    }
    await recalculateOrderTotals(orderId);

    const enriched = await fetchAndBroadcast(orderId, restaurantId);
    res.json(enriched);
  } catch (error: unknown) {
    console.error('[Check] Error splitting check:', error);
    res.status(500).json({ error: 'Failed to split check' });
  }
});

// 4. POST /:orderId/checks/:checkGuid/merge — Merge checks
router.post('/:orderId/checks/:checkGuid/merge', async (req: Request, res: Response) => {
  try {
    const { restaurantId, orderId, checkGuid } = req.params;
    const parsed = mergeSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid merge data', details: parsed.error.issues });
      return;
    }

    const { checkGuids } = parsed.data;
    const survivorId = checkGuid;
    const sourceIds = checkGuids.filter(id => id !== survivorId);

    if (sourceIds.length === 0) {
      res.status(400).json({ error: 'Must include at least one check to merge besides the target' });
      return;
    }

    const taxRate = await getTaxRate(restaurantId);

    await prisma.$transaction(async (tx) => {
      // Move all items from source checks to survivor
      await tx.checkItem.updateMany({
        where: { checkId: { in: sourceIds }, orderId },
        data: { checkId: survivorId },
      });

      // Move all discounts from source checks to survivor
      await tx.checkDiscount.updateMany({
        where: { checkId: { in: sourceIds } },
        data: { checkId: survivorId },
      });

      // Move voided items audit trail
      await tx.checkVoidedItem.updateMany({
        where: { checkId: { in: sourceIds } },
        data: { checkId: survivorId },
      });

      // Delete source checks
      await tx.orderCheck.deleteMany({
        where: { id: { in: sourceIds }, orderId },
      });
    });

    await recalculateCheck(survivorId, taxRate);
    await recalculateOrderTotals(orderId);

    const enriched = await fetchAndBroadcast(orderId, restaurantId);
    res.json(enriched);
  } catch (error: unknown) {
    console.error('[Check] Error merging checks:', error);
    res.status(500).json({ error: 'Failed to merge checks' });
  }
});

// 5. POST /:orderId/checks/:checkGuid/transfer — Transfer check to another table
router.post('/:orderId/checks/:checkGuid/transfer', async (req: Request, res: Response) => {
  try {
    const { restaurantId, orderId, checkGuid } = req.params;
    const parsed = transferSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid transfer data', details: parsed.error.issues });
      return;
    }

    const { targetTableId } = parsed.data;

    // Verify target table exists
    const targetTable = await prisma.restaurantTable.findFirst({
      where: { id: targetTableId, restaurantId },
    });
    if (!targetTable) {
      res.status(404).json({ error: 'Target table not found' });
      return;
    }

    // Find or create an order on the target table
    let targetOrder = await prisma.order.findFirst({
      where: {
        restaurantId,
        tableId: targetTableId,
        status: { in: ['pending', 'confirmed', 'preparing'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!targetOrder) {
      // Create a new order on the target table
      const timestamp = Date.now().toString(36).toUpperCase();
      const random = Math.random().toString(36).substring(2, 6).toUpperCase();
      const orderNumber = `ORD-${timestamp}-${random}`;

      const sourceOrder = await prisma.order.findUnique({ where: { id: orderId } });

      targetOrder = await prisma.order.create({
        data: {
          restaurantId,
          tableId: targetTableId,
          orderNumber,
          orderType: 'dine-in',
          orderSource: sourceOrder?.orderSource ?? 'pos',
          sourceDeviceId: sourceOrder?.sourceDeviceId,
          status: 'confirmed',
          subtotal: 0,
          tax: 0,
          total: 0,
        },
      });
    }

    const taxRate = await getTaxRate(restaurantId);

    // Move the check and its items to the target order
    await prisma.$transaction(async (tx) => {
      await tx.orderCheck.update({
        where: { id: checkGuid },
        data: { orderId: targetOrder!.id },
      });

      await tx.checkItem.updateMany({
        where: { checkId: checkGuid },
        data: { orderId: targetOrder!.id },
      });

      await tx.checkDiscount.updateMany({
        where: { checkId: checkGuid },
        data: { orderId: targetOrder!.id },
      });

      await tx.checkVoidedItem.updateMany({
        where: { checkId: checkGuid },
        data: { orderId: targetOrder!.id },
      });
    });

    // Recalculate both orders
    await recalculateCheck(checkGuid, taxRate);
    await recalculateOrderTotals(orderId);
    await recalculateOrderTotals(targetOrder.id);

    // Broadcast both orders
    await fetchAndBroadcast(orderId, restaurantId);
    const enriched = await fetchAndBroadcast(targetOrder.id, restaurantId);

    res.json({ sourceOrderId: orderId, targetOrderId: targetOrder.id, enriched });
  } catch (error: unknown) {
    console.error('[Check] Error transferring check:', error);
    res.status(500).json({ error: 'Failed to transfer check' });
  }
});

// 6. PATCH /:orderId/checks/:checkGuid/items/:itemGuid/void — Void item
router.patch('/:orderId/checks/:checkGuid/items/:itemGuid/void', async (req: Request, res: Response) => {
  try {
    const { restaurantId, orderId, checkGuid, itemGuid } = req.params;
    const parsed = voidSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid void data', details: parsed.error.issues });
      return;
    }

    const { reason, voidedBy, managerPin } = parsed.data;

    let managerApproval: string | undefined;
    if (managerPin) {
      const pinResult = await validateManagerPin(restaurantId, managerPin);
      if (!pinResult.valid) {
        res.status(403).json({ error: 'Invalid manager PIN' });
        return;
      }
      managerApproval = pinResult.staffName;
    }

    const item = await prisma.checkItem.findFirst({
      where: { id: itemGuid, checkId: checkGuid },
    });
    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const taxRate = await getTaxRate(restaurantId);

    await prisma.$transaction(async (tx) => {
      // Create audit trail
      await tx.checkVoidedItem.create({
        data: {
          checkId: checkGuid,
          checkItemId: itemGuid,
          orderId,
          menuItemName: item.menuItemName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          voidReason: reason,
          voidedBy,
          managerApproval,
        },
      });

      // Delete the item and its modifiers
      await tx.checkItemModifier.deleteMany({ where: { checkItemId: itemGuid } });
      await tx.checkItem.delete({ where: { id: itemGuid } });
    });

    await recalculateCheck(checkGuid, taxRate);
    await recalculateOrderTotals(orderId);

    const enriched = await fetchAndBroadcast(orderId, restaurantId);
    res.json(enriched);
  } catch (error: unknown) {
    console.error('[Check] Error voiding item:', error);
    res.status(500).json({ error: 'Failed to void item' });
  }
});

// 7. PATCH /:orderId/checks/:checkGuid/items/:itemGuid/comp — Comp item
router.patch('/:orderId/checks/:checkGuid/items/:itemGuid/comp', async (req: Request, res: Response) => {
  try {
    const { restaurantId, orderId, checkGuid, itemGuid } = req.params;
    const parsed = compSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid comp data', details: parsed.error.issues });
      return;
    }

    const { reason, compBy, managerPin } = parsed.data;

    let compApprovedBy: string | undefined;
    if (managerPin) {
      const pinResult = await validateManagerPin(restaurantId, managerPin);
      if (!pinResult.valid) {
        res.status(403).json({ error: 'Invalid manager PIN' });
        return;
      }
      compApprovedBy = pinResult.staffName;
    }

    const item = await prisma.checkItem.findFirst({
      where: { id: itemGuid, checkId: checkGuid },
    });
    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    await prisma.checkItem.update({
      where: { id: itemGuid },
      data: {
        isComped: true,
        compReason: reason,
        compBy,
        compApprovedBy,
        compAt: new Date(),
      },
    });

    const taxRate = await getTaxRate(restaurantId);
    await recalculateCheck(checkGuid, taxRate);
    await recalculateOrderTotals(orderId);

    const enriched = await fetchAndBroadcast(orderId, restaurantId);
    res.json(enriched);
  } catch (error: unknown) {
    console.error('[Check] Error comping item:', error);
    res.status(500).json({ error: 'Failed to comp item' });
  }
});

// 8. POST /:orderId/checks/:checkGuid/discount — Apply discount
router.post('/:orderId/checks/:checkGuid/discount', async (req: Request, res: Response) => {
  try {
    const { restaurantId, orderId, checkGuid } = req.params;
    const parsed = discountSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid discount data', details: parsed.error.issues });
      return;
    }

    const { type, value, reason, appliedBy, managerPin } = parsed.data;

    let approvedBy: string | undefined;
    if (managerPin) {
      const pinResult = await validateManagerPin(restaurantId, managerPin);
      if (!pinResult.valid) {
        res.status(403).json({ error: 'Invalid manager PIN' });
        return;
      }
      approvedBy = pinResult.staffName;
    }

    const check = await prisma.orderCheck.findFirst({
      where: { id: checkGuid, orderId },
    });
    if (!check) {
      res.status(404).json({ error: 'Check not found' });
      return;
    }

    await prisma.checkDiscount.create({
      data: {
        checkId: checkGuid,
        orderId,
        type,
        value,
        reason,
        appliedBy,
        approvedBy,
      },
    });

    const taxRate = await getTaxRate(restaurantId);
    await recalculateCheck(checkGuid, taxRate);
    await recalculateOrderTotals(orderId);

    const enriched = await fetchAndBroadcast(orderId, restaurantId);
    res.json(enriched);
  } catch (error: unknown) {
    console.error('[Check] Error applying discount:', error);
    res.status(500).json({ error: 'Failed to apply discount' });
  }
});

// 9. POST /:orderId/preauth — Open tab with optional pre-authorization
router.post('/:orderId/preauth', async (req: Request, res: Response) => {
  try {
    const { restaurantId, orderId } = req.params;
    const parsed = openTabSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid tab data', details: parsed.error.issues });
      return;
    }

    const { checkGuid, tabName, preauthId } = parsed.data;

    const check = await prisma.orderCheck.findFirst({
      where: { id: checkGuid, orderId },
    });
    if (!check) {
      res.status(404).json({ error: 'Check not found' });
      return;
    }

    await prisma.orderCheck.update({
      where: { id: checkGuid },
      data: {
        tabName,
        tabOpenedAt: new Date(),
        preauthId: preauthId ?? null,
      },
    });

    const enriched = await fetchAndBroadcast(orderId, restaurantId);
    res.json(enriched);
  } catch (error: unknown) {
    console.error('[Check] Error opening tab:', error);
    res.status(500).json({ error: 'Failed to open tab' });
  }
});

// 10. POST /:orderId/close-tab — Close tab
router.post('/:orderId/close-tab', async (req: Request, res: Response) => {
  try {
    const { restaurantId, orderId } = req.params;
    const parsed = closeTabSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid close tab data', details: parsed.error.issues });
      return;
    }

    const { checkGuid } = parsed.data;

    const check = await prisma.orderCheck.findFirst({
      where: { id: checkGuid, orderId },
    });
    if (!check) {
      res.status(404).json({ error: 'Check not found' });
      return;
    }

    await prisma.orderCheck.update({
      where: { id: checkGuid },
      data: {
        tabClosedAt: new Date(),
        paymentStatus: 'CLOSED',
      },
    });

    const enriched = await fetchAndBroadcast(orderId, restaurantId);
    res.json(enriched);
  } catch (error: unknown) {
    console.error('[Check] Error closing tab:', error);
    res.status(500).json({ error: 'Failed to close tab' });
  }
});

export default router;
