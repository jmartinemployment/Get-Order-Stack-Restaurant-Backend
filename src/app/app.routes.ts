import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { translationService } from '../services/translation.service';
import { aiCostService } from '../services/ai-cost.service';
import { taxService } from '../services/tax.service';
import { updateOrderStatus, getOrderStatusHistory } from '../services/order-status.service';
import { stripeService } from '../services/stripe.service';
import { paypalService } from '../services/paypal.service';
import { broadcastOrderEvent, sendOrderEventToDevice, broadcastToSourceAndKDS } from '../services/socket.service';
import { cloudPrntService } from '../services/cloudprnt.service';
import { notificationService } from '../services/notification.service';
import { enrichOrderResponse } from '../utils/order-enrichment';
import { validateDiningData } from '../validators/dining.validator';
import { AISettingsPatchSchema } from '../validators/settings.validator';
import { loyaltyService } from '../services/loyalty.service';
import { coursePacingService } from '../services/course-pacing.service';
import { orderThrottlingService } from '../services/order-throttling.service';
import { authService } from '../services/auth.service';

const router = Router();
const prisma = new PrismaClient();
const ORDER_INCLUDE = {
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

async function loadOrderWithRelations(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: ORDER_INCLUDE,
  });
}

async function broadcastUpdatedOrders(orderIds: string[]): Promise<void> {
  const uniqueOrderIds = [...new Set(orderIds)];
  for (const orderId of uniqueOrderIds) {
    const order = await loadOrderWithRelations(orderId);
    if (!order) continue;
    const enriched = enrichOrderResponse(order);
    broadcastToSourceAndKDS(order.restaurantId, order.sourceDeviceId, 'order:updated', enriched);
  }
}

function generateOrderNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD-${timestamp}-${random}`;
}

// ============ Staff PIN Validation ============

const ROLE_RANK: Record<string, number> = {
  staff: 1,
  manager: 2,
  owner: 3,
  super_admin: 4,
};

router.post('/:restaurantId/auth/validate-pin', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const { pin, requiredRole = 'manager' } = req.body;

    if (!pin) {
      res.status(400).json({ error: 'pin is required' });
      return;
    }

    const result = await authService.verifyStaffPin(restaurantId, pin);

    if (!result.success || !result.staffPin) {
      res.json({ valid: false });
      return;
    }

    const staffRank = ROLE_RANK[result.staffPin.role] ?? 0;
    const requiredRank = ROLE_RANK[requiredRole as string] ?? 2;

    if (staffRank < requiredRank) {
      res.json({ valid: false });
      return;
    }

    // Load permissions from linked TeamMember's PermissionSet
    let permissions: Record<string, boolean> = {};
    const staffPin = await prisma.staffPin.findUnique({
      where: { id: result.staffPin.id },
      include: {
        teamMember: {
          include: { permissionSet: true },
        },
      },
    });
    if (staffPin?.teamMember?.permissionSet) {
      permissions = staffPin.teamMember.permissionSet.permissions as Record<string, boolean>;
    }

    res.json({
      valid: true,
      staffPinId: result.staffPin.id,
      name: result.staffPin.name,
      role: result.staffPin.role,
      permissions,
    });
  } catch (error) {
    console.error('[Auth] Error validating PIN:', error);
    res.status(500).json({ error: 'Failed to validate PIN' });
  }
});

// ============ Restaurant ============

router.post('/', async (req: Request, res: Response) => {
  try {
    const { 
      slug, name, description, logo, phone, email, 
      address, city, state = 'FL', zip, cuisineType, tier,
      monthlyRevenue, deliveryPercent, platformsUsed, posSystem,
      taxRate, deliveryEnabled, pickupEnabled, dineInEnabled
    } = req.body;

    // Auto-lookup tax rate if ZIP provided but taxRate not specified
    let finalTaxRate = taxRate;
    if (zip && (taxRate === undefined || taxRate === null)) {
      const taxInfo = await taxService.getTaxRateByZip(zip, state);
      finalTaxRate = taxInfo.rate;
      console.log(`[Restaurant] Auto-set tax rate for ${zip}: ${finalTaxRate} (source: ${taxInfo.source})`);
    }

    const restaurant = await prisma.restaurant.create({
      data: {
        slug, name, description, logo, phone, email,
        address, city, state, zip, cuisineType, tier,
        monthlyRevenue, deliveryPercent, platformsUsed, posSystem,
        taxRate: finalTaxRate ?? 0.07,
        deliveryEnabled, pickupEnabled, dineInEnabled
      }
    });
    res.status(201).json(restaurant);
  } catch (error) {
    console.error('Error creating restaurant:', error);
    res.status(500).json({ error: 'Failed to create restaurant' });
  }
});

router.get('/:restaurantId', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId }
    });
    if (!restaurant) {
      res.status(404).json({ error: 'Restaurant not found' });
      return;
    }
    res.json(restaurant);
  } catch (error) {
    console.error('Error fetching restaurant:', error);
    res.status(500).json({ error: 'Failed to fetch restaurant' });
  }
});

router.get('/slug/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug }
    });
    if (!restaurant) {
      res.status(404).json({ error: 'Restaurant not found' });
      return;
    }
    res.json(restaurant);
  } catch (error) {
    console.error('Error fetching restaurant by slug:', error);
    res.status(500).json({ error: 'Failed to fetch restaurant' });
  }
});

router.patch('/:restaurantId', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const data = { ...(req.body as Record<string, unknown>) };

    if ('aiSettings' in data && data.aiSettings !== undefined) {
      const parsedSettings = AISettingsPatchSchema.safeParse(data.aiSettings);
      if (!parsedSettings.success) {
        res.status(400).json({
          error: 'Invalid aiSettings payload',
          details: parsedSettings.error.issues.map(issue => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        });
        return;
      }
      data.aiSettings = parsedSettings.data;
    }

    const restaurant = await prisma.restaurant.update({
      where: { id: restaurantId },
      data: data as any,
    });
    res.json(restaurant);
  } catch (error) {
    console.error('Error updating restaurant:', error);
    res.status(500).json({ error: 'Failed to update restaurant' });
  }
});

// ============ Full Menu (with modifiers) ============

router.get('/:restaurantId/menu', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const { includeUnavailable, lang } = req.query;

    const categories = await prisma.menuCategory.findMany({
      where: { 
        restaurantId,
        active: true
      },
      orderBy: { displayOrder: 'asc' },
      include: {
        menuItems: {
          where: includeUnavailable === 'true' 
            ? {} 
            : { available: true, eightySixed: false },
          orderBy: { displayOrder: 'asc' },
          include: {
            modifierGroups: {
              orderBy: { displayOrder: 'asc' },
              include: {
                modifierGroup: {
                  include: {
                    modifiers: {
                      where: { available: true },
                      orderBy: { displayOrder: 'asc' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    // Transform to cleaner structure
    const menu = categories.map(cat => ({
      id: cat.id,
      name: lang === 'en' && cat.nameEn ? cat.nameEn : cat.name,
      description: lang === 'en' && cat.descriptionEn ? cat.descriptionEn : cat.description,
      image: cat.image,
      items: cat.menuItems.map(item => ({
        id: item.id,
        name: lang === 'en' && item.nameEn ? item.nameEn : item.name,
        description: lang === 'en' && item.descriptionEn ? item.descriptionEn : item.description,
        price: item.price,
        image: item.image,
        popular: item.popular,
        dietary: item.dietary,
        prepTimeMinutes: item.prepTimeMinutes,
        modifierGroups: item.modifierGroups.map(mg => ({
          id: mg.modifierGroup.id,
          name: lang === 'en' && mg.modifierGroup.nameEn ? mg.modifierGroup.nameEn : mg.modifierGroup.name,
          description: mg.modifierGroup.description,
          required: mg.modifierGroup.required,
          multiSelect: mg.modifierGroup.multiSelect,
          minSelections: mg.modifierGroup.minSelections,
          maxSelections: mg.modifierGroup.maxSelections,
          modifiers: mg.modifierGroup.modifiers.map(mod => ({
            id: mod.id,
            name: lang === 'en' && mod.nameEn ? mod.nameEn : mod.name,
            priceAdjustment: mod.priceAdjustment,
            isDefault: mod.isDefault
          }))
        }))
      }))
    }));

    res.json(menu);
  } catch (error) {
    console.error('Error fetching menu:', error);
    res.status(500).json({ error: 'Failed to fetch menu' });
  }
});

// ============ Categories ============

router.get('/:restaurantId/menu/categories', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const categories = await prisma.menuCategory.findMany({
      where: { restaurantId },
      orderBy: { displayOrder: 'asc' }
    });
    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

router.post('/:restaurantId/menu/categories', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const { name, nameEn, description, descriptionEn, image, active = true } = req.body;

    // Get restaurant for cuisine type
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId }
    });

    // Auto-generate English description if not provided
    let generatedDescEn = descriptionEn;
    if (!descriptionEn && description) {
      generatedDescEn = await aiCostService.generateEnglishDescription(restaurantId, name, description, restaurant?.cuisineType || undefined);
    }

    const maxOrder = await prisma.menuCategory.aggregate({
      where: { restaurantId },
      _max: { displayOrder: true }
    });

    const category = await prisma.menuCategory.create({
      data: {
        restaurantId, name, nameEn, description, 
        descriptionEn: generatedDescEn, image, active,
        displayOrder: (maxOrder._max.displayOrder || 0) + 1
      }
    });
    res.status(201).json(category);
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

router.patch('/:restaurantId/menu/categories/:categoryId', async (req: Request, res: Response) => {
  try {
    const { restaurantId, categoryId } = req.params;
    const { name, nameEn, description, descriptionEn, image, active, displayOrder } = req.body;

    let generatedDescEn: string | null | undefined = descriptionEn;

    // Regenerate English description if description changed and no manual override
    if (description !== undefined && descriptionEn === undefined) {
      const restaurant = await prisma.restaurant.findUnique({
        where: { id: restaurantId }
      });
      const category = await prisma.menuCategory.findUnique({
        where: { id: categoryId }
      });
      generatedDescEn = description
        ? await aiCostService.generateEnglishDescription(
            restaurantId,
            name || category?.name || '',
            description,
            restaurant?.cuisineType || undefined
          )
        : null;
    }

    const category = await prisma.menuCategory.update({
      where: { id: categoryId },
      data: {
        ...(name !== undefined && { name }),
        ...(nameEn !== undefined && { nameEn }),
        ...(description !== undefined && { description }),
        ...(generatedDescEn !== undefined && { descriptionEn: generatedDescEn }),
        ...(image !== undefined && { image }),
        ...(active !== undefined && { active }),
        ...(displayOrder !== undefined && { displayOrder })
      }
    });
    res.json(category);
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

router.delete('/:restaurantId/menu/categories/:categoryId', async (req: Request, res: Response) => {
  try {
    const { categoryId } = req.params;
    await prisma.menuItem.deleteMany({ where: { categoryId } });
    await prisma.menuCategory.delete({ where: { id: categoryId } });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// ============ Menu Items ============

router.get('/:restaurantId/menu/items', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const items = await prisma.menuItem.findMany({
      where: { restaurantId },
      orderBy: [{ categoryId: 'asc' }, { displayOrder: 'asc' }],
      include: {
        modifierGroups: {
          include: {
            modifierGroup: {
              include: { modifiers: true }
            }
          }
        }
      }
    });
    res.json(items);
  } catch (error) {
    console.error('Error fetching menu items:', error);
    res.status(500).json({ error: 'Failed to fetch menu items' });
  }
});

router.get('/:restaurantId/menu/items/:itemId', async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    const item = await prisma.menuItem.findUnique({
      where: { id: itemId },
      include: { 
        category: true,
        modifierGroups: {
          include: {
            modifierGroup: {
              include: { modifiers: { where: { available: true } } }
            }
          }
        }
      }
    });
    if (!item) {
      res.status(404).json({ error: 'Menu item not found' });
      return;
    }
    res.json(item);
  } catch (error) {
    console.error('Error fetching menu item:', error);
    res.status(500).json({ error: 'Failed to fetch menu item' });
  }
});

router.post('/:restaurantId/menu/items', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const { 
      categoryId, name, nameEn, description, descriptionEn, 
      price, cost, image, available = true, dietary = [],
      prepTimeMinutes, modifierGroupIds = []
    } = req.body;

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId }
    });

    // Auto-generate English description if not provided
    let generatedDescEn = descriptionEn;
    if (!descriptionEn && description) {
      generatedDescEn = await aiCostService.generateEnglishDescription(
        restaurantId, name, description, restaurant?.cuisineType || undefined
      );
    }

    // Auto-estimate cost if not provided
    let aiData: any = {};
    if (!cost) {
      const estimation = await aiCostService.estimateCost(
        restaurantId, name, description, Number(price), restaurant?.cuisineType || undefined
      );
      if (estimation) {
        aiData = {
          aiEstimatedCost: estimation.estimatedCost,
          aiSuggestedPrice: estimation.suggestedPrice,
          aiProfitMargin: estimation.profitMargin,
          aiConfidence: estimation.confidence,
          aiLastUpdated: new Date()
        };
      }
    }

    const maxOrder = await prisma.menuItem.aggregate({
      where: { restaurantId, categoryId },
      _max: { displayOrder: true }
    });

    const item = await prisma.menuItem.create({
      data: {
        restaurantId, categoryId, name, nameEn, description, 
        descriptionEn: generatedDescEn, price, cost, image,
        available, dietary, eightySixed: false, prepTimeMinutes,
        displayOrder: (maxOrder._max.displayOrder || 0) + 1,
        ...aiData,
        modifierGroups: {
          create: modifierGroupIds.map((groupId: string, index: number) => ({
            modifierGroupId: groupId,
            displayOrder: index
          }))
        }
      },
      include: {
        modifierGroups: {
          include: { modifierGroup: true }
        }
      }
    });
    res.status(201).json(item);
  } catch (error) {
    console.error('Error creating menu item:', error);
    res.status(500).json({ error: 'Failed to create menu item' });
  }
});

router.patch('/:restaurantId/menu/items/:itemId', async (req: Request, res: Response) => {
  try {
    const { restaurantId, itemId } = req.params;
    const {
      categoryId, name, nameEn, description, descriptionEn, price, cost, image,
      available, eightySixed, eightySixReason, popular, dietary, displayOrder,
      prepTimeMinutes, modifierGroupIds
    } = req.body;

    let generatedDescEn: string | null | undefined = descriptionEn;
    let aiData: any = {};

    const [currentItem, restaurant] = await Promise.all([
      prisma.menuItem.findUnique({ where: { id: itemId } }),
      prisma.restaurant.findUnique({ where: { id: restaurantId } })
    ]);

    // Regenerate English description if changed
    if ((name !== undefined || description !== undefined) && descriptionEn === undefined) {
      generatedDescEn = await aiCostService.generateEnglishDescription(
        restaurantId,
        name || currentItem?.name || '',
        description || currentItem?.description || '',
        restaurant?.cuisineType || undefined
      );
    }

    // Re-estimate cost if price changed
    if (price !== undefined && !cost && !currentItem?.cost) {
      const estimation = await aiCostService.estimateCost(
        restaurantId,
        name || currentItem?.name || '',
        description || currentItem?.description || '',
        Number(price),
        restaurant?.cuisineType || undefined
      );
      if (estimation) {
        aiData = {
          aiEstimatedCost: estimation.estimatedCost,
          aiSuggestedPrice: estimation.suggestedPrice,
          aiProfitMargin: estimation.profitMargin,
          aiConfidence: estimation.confidence,
          aiLastUpdated: new Date()
        };
      }
    }

    // Update modifier group links if provided
    if (modifierGroupIds !== undefined) {
      await prisma.menuItemModifierGroup.deleteMany({
        where: { menuItemId: itemId }
      });
      if (modifierGroupIds.length > 0) {
        await prisma.menuItemModifierGroup.createMany({
          data: modifierGroupIds.map((groupId: string, index: number) => ({
            menuItemId: itemId,
            modifierGroupId: groupId,
            displayOrder: index
          }))
        });
      }
    }

    const item = await prisma.menuItem.update({
      where: { id: itemId },
      data: {
        ...(categoryId !== undefined && { categoryId }),
        ...(name !== undefined && { name }),
        ...(nameEn !== undefined && { nameEn }),
        ...(description !== undefined && { description }),
        ...(generatedDescEn !== undefined && { descriptionEn: generatedDescEn }),
        ...(price !== undefined && { price }),
        ...(cost !== undefined && { cost }),
        ...(image !== undefined && { image }),
        ...(available !== undefined && { available }),
        ...(eightySixed !== undefined && { eightySixed }),
        ...(eightySixReason !== undefined && { eightySixReason }),
        ...(popular !== undefined && { popular }),
        ...(dietary !== undefined && { dietary }),
        ...(displayOrder !== undefined && { displayOrder }),
        ...(prepTimeMinutes !== undefined && { prepTimeMinutes }),
        ...aiData
      },
      include: {
        modifierGroups: {
          include: { modifierGroup: true }
        }
      }
    });
    res.json(item);
  } catch (error) {
    console.error('Error updating menu item:', error);
    res.status(500).json({ error: 'Failed to update menu item' });
  }
});

router.patch('/:restaurantId/menu/items/:itemId/86', async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    const { eightySixed, reason } = req.body;

    const item = await prisma.menuItem.update({
      where: { id: itemId },
      data: {
        eightySixed,
        eightySixReason: eightySixed ? reason : null
      }
    });
    res.json(item);
  } catch (error) {
    console.error('Error toggling 86 status:', error);
    res.status(500).json({ error: 'Failed to update 86 status' });
  }
});

router.delete('/:restaurantId/menu/items/:itemId', async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    await prisma.menuItemModifierGroup.deleteMany({ where: { menuItemId: itemId } });
    await prisma.menuItem.delete({ where: { id: itemId } });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting menu item:', error);
    res.status(500).json({ error: 'Failed to delete menu item' });
  }
});

// ============ Modifier Groups ============

router.get('/:restaurantId/modifiers', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const groups = await prisma.modifierGroup.findMany({
      where: { restaurantId },
      orderBy: { displayOrder: 'asc' },
      include: {
        modifiers: { orderBy: { displayOrder: 'asc' } }
      }
    });
    res.json(groups);
  } catch (error) {
    console.error('Error fetching modifier groups:', error);
    res.status(500).json({ error: 'Failed to fetch modifier groups' });
  }
});

router.post('/:restaurantId/modifiers', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const { 
      name, nameEn, description, descriptionEn,
      required = false, multiSelect = false, 
      minSelections = 0, maxSelections = null,
      modifiers = []
    } = req.body;

    const maxOrder = await prisma.modifierGroup.aggregate({
      where: { restaurantId },
      _max: { displayOrder: true }
    });

    const group = await prisma.modifierGroup.create({
      data: {
        restaurantId, name, nameEn, description, descriptionEn,
        required, multiSelect, minSelections, maxSelections,
        displayOrder: (maxOrder._max.displayOrder || 0) + 1,
        modifiers: {
          create: modifiers.map((mod: any, index: number) => ({
            name: mod.name,
            nameEn: mod.nameEn,
            priceAdjustment: mod.priceAdjustment || 0,
            isDefault: mod.isDefault || false,
            displayOrder: index
          }))
        }
      },
      include: { modifiers: true }
    });
    res.status(201).json(group);
  } catch (error) {
    console.error('Error creating modifier group:', error);
    res.status(500).json({ error: 'Failed to create modifier group' });
  }
});

router.patch('/:restaurantId/modifiers/:groupId', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const { 
      name, nameEn, description, descriptionEn,
      required, multiSelect, minSelections, maxSelections,
      active, displayOrder
    } = req.body;

    const group = await prisma.modifierGroup.update({
      where: { id: groupId },
      data: {
        ...(name !== undefined && { name }),
        ...(nameEn !== undefined && { nameEn }),
        ...(description !== undefined && { description }),
        ...(descriptionEn !== undefined && { descriptionEn }),
        ...(required !== undefined && { required }),
        ...(multiSelect !== undefined && { multiSelect }),
        ...(minSelections !== undefined && { minSelections }),
        ...(maxSelections !== undefined && { maxSelections }),
        ...(active !== undefined && { active }),
        ...(displayOrder !== undefined && { displayOrder })
      },
      include: { modifiers: true }
    });
    res.json(group);
  } catch (error) {
    console.error('Error updating modifier group:', error);
    res.status(500).json({ error: 'Failed to update modifier group' });
  }
});

router.delete('/:restaurantId/modifiers/:groupId', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    await prisma.modifier.deleteMany({ where: { modifierGroupId: groupId } });
    await prisma.menuItemModifierGroup.deleteMany({ where: { modifierGroupId: groupId } });
    await prisma.modifierGroup.delete({ where: { id: groupId } });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting modifier group:', error);
    res.status(500).json({ error: 'Failed to delete modifier group' });
  }
});

// ============ Individual Modifiers ============

router.post('/:restaurantId/modifiers/:groupId/options', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const { name, nameEn, priceAdjustment = 0, isDefault = false } = req.body;

    const maxOrder = await prisma.modifier.aggregate({
      where: { modifierGroupId: groupId },
      _max: { displayOrder: true }
    });

    const modifier = await prisma.modifier.create({
      data: {
        modifierGroupId: groupId,
        name, nameEn, priceAdjustment, isDefault,
        displayOrder: (maxOrder._max.displayOrder || 0) + 1
      }
    });
    res.status(201).json(modifier);
  } catch (error) {
    console.error('Error creating modifier:', error);
    res.status(500).json({ error: 'Failed to create modifier' });
  }
});

router.patch('/:restaurantId/modifiers/:groupId/options/:modifierId', async (req: Request, res: Response) => {
  try {
    const { modifierId } = req.params;
    const { name, nameEn, priceAdjustment, isDefault, available, displayOrder } = req.body;

    const modifier = await prisma.modifier.update({
      where: { id: modifierId },
      data: {
        ...(name !== undefined && { name }),
        ...(nameEn !== undefined && { nameEn }),
        ...(priceAdjustment !== undefined && { priceAdjustment }),
        ...(isDefault !== undefined && { isDefault }),
        ...(available !== undefined && { available }),
        ...(displayOrder !== undefined && { displayOrder })
      }
    });
    res.json(modifier);
  } catch (error) {
    console.error('Error updating modifier:', error);
    res.status(500).json({ error: 'Failed to update modifier' });
  }
});

router.delete('/:restaurantId/modifiers/:groupId/options/:modifierId', async (req: Request, res: Response) => {
  try {
    const { modifierId } = req.params;
    await prisma.modifier.delete({ where: { id: modifierId } });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting modifier:', error);
    res.status(500).json({ error: 'Failed to delete modifier' });
  }
});

// ============ Tables ============

router.get('/:restaurantId/tables', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const tables = await prisma.restaurantTable.findMany({
      where: { restaurantId, active: true },
      orderBy: { tableNumber: 'asc' }
    });
    res.json(tables);
  } catch (error) {
    console.error('Error fetching tables:', error);
    res.status(500).json({ error: 'Failed to fetch tables' });
  }
});

router.post('/:restaurantId/tables', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const { tableNumber, tableName, capacity = 4, section, posX, posY } = req.body;

    const table = await prisma.restaurantTable.create({
      data: {
        restaurantId, tableNumber, tableName, capacity, section, posX, posY, updatedAt: new Date()
      }
    });
    res.status(201).json(table);
  } catch (error) {
    console.error('Error creating table:', error);
    res.status(500).json({ error: 'Failed to create table' });
  }
});

router.patch('/:restaurantId/tables/:tableId', async (req: Request, res: Response) => {
  try {
    const { tableId } = req.params;
    const { tableNumber, tableName, capacity, section, status, posX, posY, active } = req.body;

    const table = await prisma.restaurantTable.update({
      where: { id: tableId },
      data: {
        ...(tableNumber !== undefined && { tableNumber }),
        ...(tableName !== undefined && { tableName }),
        ...(capacity !== undefined && { capacity }),
        ...(section !== undefined && { section }),
        ...(status !== undefined && { status }),
        ...(posX !== undefined && { posX }),
        ...(posY !== undefined && { posY }),
        ...(active !== undefined && { active })
      }
    });
    res.json(table);
  } catch (error) {
    console.error('Error updating table:', error);
    res.status(500).json({ error: 'Failed to update table' });
  }
});

router.delete('/:restaurantId/tables/:tableId', async (req: Request, res: Response) => {
  try {
    const { tableId } = req.params;
    await prisma.restaurantTable.delete({ where: { id: tableId } });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting table:', error);
    res.status(500).json({ error: 'Failed to delete table' });
  }
});

// ============ Reservations ============

router.get('/:restaurantId/reservations', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const { status, date } = req.query;

    const where: Record<string, unknown> = { restaurantId };
    if (status) {
      where.status = { in: (status as string).split(',') };
    }
    if (date) {
      const dayStart = new Date(date as string);
      const dayEnd = new Date(date as string);
      dayEnd.setDate(dayEnd.getDate() + 1);
      where.reservationTime = { gte: dayStart, lt: dayEnd };
    }

    const reservations = await prisma.reservation.findMany({
      where,
      include: { customer: true },
      orderBy: { reservationTime: 'asc' }
    });
    res.json(reservations);
  } catch (error) {
    console.error('Error fetching reservations:', error);
    res.status(500).json({ error: 'Failed to fetch reservations' });
  }
});

router.post('/:restaurantId/reservations', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const {
      customerName, customerPhone, customerEmail,
      partySize, reservationTime, tableNumber, specialRequests
    } = req.body;

    if (!customerName || !customerPhone || !partySize || !reservationTime) {
      res.status(400).json({ error: 'customerName, customerPhone, partySize, and reservationTime are required' });
      return;
    }

    const reservation = await prisma.reservation.create({
      data: {
        restaurantId,
        customerName,
        customerPhone,
        customerEmail,
        partySize,
        reservationTime: new Date(reservationTime),
        tableNumber,
        specialRequests
      },
      include: { customer: true }
    });
    res.status(201).json(reservation);
  } catch (error) {
    console.error('Error creating reservation:', error);
    res.status(500).json({ error: 'Failed to create reservation' });
  }
});

router.get('/:restaurantId/reservations/:reservationId', async (req: Request, res: Response) => {
  try {
    const { reservationId } = req.params;
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { customer: true }
    });
    if (!reservation) {
      res.status(404).json({ error: 'Reservation not found' });
      return;
    }
    res.json(reservation);
  } catch (error) {
    console.error('Error fetching reservation:', error);
    res.status(500).json({ error: 'Failed to fetch reservation' });
  }
});

router.patch('/:restaurantId/reservations/:reservationId', async (req: Request, res: Response) => {
  try {
    const { reservationId } = req.params;
    const { status, tableNumber, partySize, reservationTime, specialRequests, customerName, customerPhone, customerEmail } = req.body;

    const reservation = await prisma.reservation.update({
      where: { id: reservationId },
      data: {
        ...(status !== undefined && { status }),
        ...(tableNumber !== undefined && { tableNumber }),
        ...(partySize !== undefined && { partySize }),
        ...(reservationTime !== undefined && { reservationTime: new Date(reservationTime) }),
        ...(specialRequests !== undefined && { specialRequests }),
        ...(customerName !== undefined && { customerName }),
        ...(customerPhone !== undefined && { customerPhone }),
        ...(customerEmail !== undefined && { customerEmail })
      },
      include: { customer: true }
    });
    res.json(reservation);
  } catch (error) {
    console.error('Error updating reservation:', error);
    res.status(500).json({ error: 'Failed to update reservation' });
  }
});

router.delete('/:restaurantId/reservations/:reservationId', async (req: Request, res: Response) => {
  try {
    const { reservationId } = req.params;
    await prisma.reservation.delete({ where: { id: reservationId } });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting reservation:', error);
    res.status(500).json({ error: 'Failed to delete reservation' });
  }
});

// ============ AI Endpoints ============

router.post('/:restaurantId/menu/items/:itemId/estimate-cost', async (req: Request, res: Response) => {
  try {
    const { restaurantId, itemId } = req.params;

    const [item, restaurant] = await Promise.all([
      prisma.menuItem.findUnique({ where: { id: itemId } }),
      prisma.restaurant.findUnique({ where: { id: restaurantId } })
    ]);

    if (!item) {
      res.status(404).json({ error: 'Menu item not found' });
      return;
    }

    const estimation = await aiCostService.estimateCost(
      restaurantId, item.name, item.description, Number(item.price), restaurant?.cuisineType || undefined
    );

    if (!estimation) {
      res.status(500).json({ error: 'Failed to estimate cost' });
      return;
    }

    const updated = await prisma.menuItem.update({
      where: { id: itemId },
      data: {
        aiEstimatedCost: estimation.estimatedCost,
        aiSuggestedPrice: estimation.suggestedPrice,
        aiProfitMargin: estimation.profitMargin,
        aiConfidence: estimation.confidence,
        aiLastUpdated: new Date()
      }
    });

    res.json({ item: updated, estimation });
  } catch (error) {
    console.error('Error estimating cost:', error);
    res.status(500).json({ error: 'Failed to estimate cost' });
  }
});

router.post('/:restaurantId/menu/items/:itemId/generate-description', async (req: Request, res: Response) => {
  try {
    const { restaurantId, itemId } = req.params;

    const [item, restaurant] = await Promise.all([
      prisma.menuItem.findUnique({ where: { id: itemId } }),
      prisma.restaurant.findUnique({ where: { id: restaurantId } })
    ]);

    if (!item) {
      res.status(404).json({ error: 'Menu item not found' });
      return;
    }

    const descriptionEn = await aiCostService.generateEnglishDescription(
      restaurantId, item.name, item.description, restaurant?.cuisineType || undefined
    );

    if (!descriptionEn) {
      res.status(500).json({ error: 'Failed to generate description' });
      return;
    }

    const updated = await prisma.menuItem.update({
      where: { id: itemId },
      data: { descriptionEn }
    });

    res.json(updated);
  } catch (error) {
    console.error('Error generating description:', error);
    res.status(500).json({ error: 'Failed to generate description' });
  }
});

router.post('/:restaurantId/menu/estimate-all-costs', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;

    const [items, restaurant] = await Promise.all([
      prisma.menuItem.findMany({ where: { restaurantId, aiEstimatedCost: null } }),
      prisma.restaurant.findUnique({ where: { id: restaurantId } })
    ]);

    let estimated = 0;
    for (const item of items) {
      const estimation = await aiCostService.estimateCost(
        restaurantId, item.name, item.description, Number(item.price), restaurant?.cuisineType || undefined
      );

      if (estimation) {
        await prisma.menuItem.update({
          where: { id: item.id },
          data: {
            aiEstimatedCost: estimation.estimatedCost,
            aiSuggestedPrice: estimation.suggestedPrice,
            aiProfitMargin: estimation.profitMargin,
            aiConfidence: estimation.confidence,
            aiLastUpdated: new Date()
          }
        });
        estimated++;
      }
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    res.json({ message: 'Cost estimation complete', itemsProcessed: items.length, itemsEstimated: estimated });
  } catch (error) {
    console.error('Error estimating costs:', error);
    res.status(500).json({ error: 'Failed to estimate costs' });
  }
});

router.post('/:restaurantId/menu/generate-all-descriptions', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;

    const [items, restaurant] = await Promise.all([
      prisma.menuItem.findMany({ where: { restaurantId, descriptionEn: null } }),
      prisma.restaurant.findUnique({ where: { id: restaurantId } })
    ]);

    let generated = 0;
    for (const item of items) {
      const descriptionEn = await aiCostService.generateEnglishDescription(
        restaurantId, item.name, item.description, restaurant?.cuisineType || undefined
      );

      if (descriptionEn) {
        await prisma.menuItem.update({
          where: { id: item.id },
          data: { descriptionEn }
        });
        generated++;
      }
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    res.json({ message: 'Description generation complete', itemsProcessed: items.length, itemsGenerated: generated });
  } catch (error) {
    console.error('Error generating descriptions:', error);
    res.status(500).json({ error: 'Failed to generate descriptions' });
  }
});

// ============ Orders (with modifiers) ============

router.get('/:restaurantId/orders', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const {
      status,
      orderType,
      sourceDeviceId,
      deliveryStatus,
      approvalStatus,
      limit = '50'
    } = req.query;

    // Support comma-separated status values (e.g., "pending,confirmed,preparing,ready")
    let statusFilter: any = undefined;
    if (status) {
      const statuses = (status as string).split(',').map(s => s.trim());
      statusFilter = statuses.length === 1 ? statuses[0] : { in: statuses };
    }

    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        ...(statusFilter && { status: statusFilter }),
        ...(orderType && { orderType: orderType as string }),
        ...(sourceDeviceId && { sourceDeviceId: sourceDeviceId as string }),
        ...(deliveryStatus && { deliveryStatus: deliveryStatus as string }),
        ...(approvalStatus && { approvalStatus: approvalStatus as string }),
      },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: Number.parseInt(limit as string, 10)
    });
    res.json(orders.map(enrichOrderResponse));
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

router.get('/:restaurantId/orders/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        ...ORDER_INCLUDE,
        orderItems: { include: { menuItem: true, modifiers: true } },
      },
    });

    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    res.json(enrichOrderResponse(order));
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

router.post('/:restaurantId/orders', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const {
      customerInfo, customerName, customerPhone, customerEmail,
      orderType, orderSource = 'online', tableId, tableNumber, serverId,
      sourceDeviceId,
      items, specialInstructions, scheduledTime,
      deliveryAddress, deliveryLat, deliveryLng,
      deliveryInfo, curbsideInfo, cateringInfo,
      courses = [],
      loyaltyPointsRedeemed: reqLoyaltyPointsRedeemed = 0,
    } = req.body;

    // Require sourceDeviceId for all POS orders
    if (orderSource === 'pos' && !sourceDeviceId) {
      res.status(400).json({ error: 'sourceDeviceId is required for POS orders' });
      return;
    }

    // Get restaurant for tax rate
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId }
    });

    if (!restaurant) {
      res.status(404).json({ error: 'Restaurant not found' });
      return;
    }

    // Resolve table ID from tableNumber if provided
    let resolvedTableId = tableId;
    if (!tableId && tableNumber) {
      const table = await prisma.restaurantTable.findFirst({
        where: {
          restaurantId,
          tableNumber: String(tableNumber)
        }
      });
      if (table) {
        resolvedTableId = table.id;
      }
    }

    // Build customer info object for validation
    const customerData = customerInfo ?? (customerName ? {
      firstName: customerName.split(' ')[0],
      lastName: customerName.split(' ').slice(1).join(' '),
      phone: customerPhone,
      email: customerEmail,
    } : undefined);

    // Validate dining requirements
    const validation = validateDiningData(orderType, {
      customerInfo: customerData,
      deliveryInfo,
      curbsideInfo,
      cateringInfo,
      tableId: resolvedTableId,
      tableNumber,
      orderSource,
    });

    if (!validation.valid) {
      res.status(400).json({
        error: 'Invalid dining option data',
        details: validation.errors,
      });
      return;
    }

    // Handle customer info - support both formats
    let customerId = null;
    const resolvedCustomerName = customerInfo?.firstName 
      ? `${customerInfo.firstName}${customerInfo.lastName ? ' ' + customerInfo.lastName : ''}`
      : customerName;
    const resolvedPhone = customerInfo?.phone || customerPhone;
    const resolvedEmail = customerInfo?.email || customerEmail;

    {
      let firstName = customerInfo?.firstName;
      let lastName = customerInfo?.lastName;
      if (!firstName && resolvedCustomerName) {
        const nameParts = resolvedCustomerName.trim().split(' ');
        firstName = nameParts[0];
        lastName = nameParts.slice(1).join(' ') || null;
      }

      // Dedup by phone when available (loyalty requires stable customer identity)
      if (resolvedPhone) {
        const customer = await prisma.customer.upsert({
          where: {
            restaurantId_phone: { restaurantId, phone: resolvedPhone }
          },
          update: {
            firstName: firstName ?? undefined,
            lastName: lastName ?? undefined,
            email: resolvedEmail ?? undefined,
          },
          create: {
            restaurantId,
            firstName,
            lastName,
            email: resolvedEmail,
            phone: resolvedPhone,
          },
        });
        customerId = customer.id;
      } else if (resolvedEmail || resolvedCustomerName) {
        // No phone — can't dedup, create fresh (guest orders)
        const customer = await prisma.customer.create({
          data: {
            restaurantId,
            firstName,
            lastName,
            email: resolvedEmail,
            phone: resolvedPhone,
          }
        });
        customerId = customer.id;
      }
    }

    let subtotal = 0;
    const orderItemsData = [];

    const courseByGuid = new Map<string, { name?: string; sortOrder?: number }>();
    if (Array.isArray(courses)) {
      for (const course of courses) {
        if (!course || typeof course !== 'object') continue;
        const guid = (course as Record<string, unknown>).guid;
        if (typeof guid !== 'string' || !guid) continue;
        const name = (course as Record<string, unknown>).name;
        const sortOrderRaw = (course as Record<string, unknown>).sortOrder;
        const sortOrder = Number(sortOrderRaw);
        courseByGuid.set(guid, {
          name: typeof name === 'string' ? name : undefined,
          sortOrder: Number.isFinite(sortOrder) ? sortOrder : undefined,
        });
      }
    }

    let firstCourseSortOrder: number | null = null;
    if (Array.isArray(items)) {
      for (const item of items) {
        if (!item?.course?.guid) continue;
        const courseGuid = String(item.course.guid);
        const fallbackSort = courseByGuid.get(courseGuid)?.sortOrder;
        const sortOrderRaw = item.course.sortOrder ?? fallbackSort;
        const sortOrder = Number(sortOrderRaw);
        const normalizedSort = Number.isFinite(sortOrder) ? sortOrder : 0;
        if (firstCourseSortOrder === null || normalizedSort < firstCourseSortOrder) {
          firstCourseSortOrder = normalizedSort;
        }
      }
    }

    for (const item of items) {
      const menuItem = await prisma.menuItem.findUnique({
        where: { id: item.menuItemId }
      });

      if (!menuItem) {
        res.status(400).json({ error: `Menu item ${item.menuItemId} not found` });
        return;
      }

      if (menuItem.eightySixed) {
        res.status(400).json({ error: `${menuItem.name} is currently unavailable` });
        return;
      }

      // Calculate modifier prices
      let modifiersPrice = 0;
      const modifiersData = [];

      if (item.modifiers && item.modifiers.length > 0) {
        for (const mod of item.modifiers) {
          const modifier = await prisma.modifier.findUnique({
            where: { id: mod.modifierId }
          });
          if (modifier) {
            modifiersPrice += Number(modifier.priceAdjustment);
            modifiersData.push({
              modifier: { connect: { id: modifier.id } },
              modifierName: modifier.name,
              priceAdjustment: modifier.priceAdjustment
            });
          }
        }
      }

      const itemTotal = (Number(menuItem.price) + modifiersPrice) * item.quantity;
      subtotal += itemTotal;

      const rawCourse = item.course as Record<string, unknown> | undefined;
      const courseGuid = typeof rawCourse?.guid === 'string' ? rawCourse.guid : undefined;
      const fallbackCourse = courseGuid ? courseByGuid.get(courseGuid) : undefined;
      const rawCourseName = rawCourse?.name;
      const courseName = typeof rawCourseName === 'string'
        ? rawCourseName
        : fallbackCourse?.name;
      const rawSortOrder = rawCourse?.sortOrder ?? fallbackCourse?.sortOrder;
      const courseSortOrder = Number(rawSortOrder);
      const normalizedCourseSortOrder = Number.isFinite(courseSortOrder) ? courseSortOrder : 0;

      const isFirstCourseItem = courseGuid
        ? (firstCourseSortOrder === null || normalizedCourseSortOrder === firstCourseSortOrder)
        : false;
      const fulfillmentStatus = courseGuid
        ? (isFirstCourseItem ? 'SENT' : 'HOLD')
        : 'SENT';
      const courseFireStatus = courseGuid
        ? (isFirstCourseItem ? 'FIRED' : 'PENDING')
        : null;
      const courseFiredAt = courseGuid && isFirstCourseItem ? new Date() : null;
      const sentToKitchenAt = fulfillmentStatus === 'HOLD' ? null : new Date();

      orderItemsData.push({
        menuItem: { connect: { id: menuItem.id } },
        menuItemName: menuItem.name,
        quantity: item.quantity,
        unitPrice: menuItem.price,
        modifiersPrice,
        totalPrice: itemTotal,
        specialInstructions: item.specialInstructions,
        fulfillmentStatus,
        courseGuid: courseGuid ?? null,
        courseName: courseGuid ? (courseName ?? courseGuid) : null,
        courseSortOrder: courseGuid ? normalizedCourseSortOrder : null,
        courseFireStatus,
        courseFiredAt,
        sentToKitchenAt,
        modifiers: { create: modifiersData }
      });
    }

    // Calculate tax (Florida: simple rate, future: category-based per state)
    const tax = Math.round(subtotal * Number(restaurant.taxRate || 0.07) * 100) / 100;
    const total = subtotal + tax;

    const order = await prisma.order.create({
      data: {
        restaurantId,
        customerId,
        tableId: resolvedTableId,
        serverId,
        sourceDeviceId,
        orderNumber: generateOrderNumber(),
        orderType,
        orderSource,
        status: 'pending',
        subtotal,
        tax,
        total,
        specialInstructions,
        deliveryAddress: deliveryInfo?.address ?? deliveryAddress,
        deliveryLat,
        deliveryLng,
        deliveryAddress2: deliveryInfo?.address2,
        deliveryCity: deliveryInfo?.city,
        deliveryStateUs: deliveryInfo?.state,
        deliveryZip: deliveryInfo?.zip,
        deliveryNotes: deliveryInfo?.deliveryNotes,
        deliveryStatus: orderType === 'delivery' ? 'PREPARING' : null,
        deliveryEstimatedAt: deliveryInfo?.estimatedDeliveryTime ? new Date(deliveryInfo.estimatedDeliveryTime) : null,
        vehicleDescription: curbsideInfo?.vehicleDescription,
        eventDate: cateringInfo?.eventDate ? new Date(cateringInfo.eventDate) : null,
        eventTime: cateringInfo?.eventTime,
        headcount: cateringInfo?.headcount,
        eventType: cateringInfo?.eventType,
        setupRequired: cateringInfo?.setupRequired ?? false,
        depositAmount: cateringInfo?.depositAmount,
        depositPaid: cateringInfo?.depositPaid ?? false,
        cateringInstructions: cateringInfo?.specialInstructions,
        approvalStatus: orderType === 'catering' ? 'NEEDS_APPROVAL' : null,
        scheduledTime: scheduledTime ? new Date(scheduledTime) : null,
        orderItems: { create: orderItemsData }
      },
      include: {
        orderItems: { include: { modifiers: true } },
        customer: true,
        table: true,
        marketplaceOrder: true,
      }
    });

    if (customerId) {
      await prisma.customer.update({
        where: { id: customerId },
        data: {
          totalOrders: { increment: 1 },
          totalSpent: { increment: total },
          lastOrderDate: new Date()
        }
      });

      // Award and redeem loyalty points
      const loyaltyConfig = await loyaltyService.getConfig(restaurantId);
      if (loyaltyConfig.enabled) {
        const customer = await prisma.customer.findUnique({ where: { id: customerId } });
        if (customer) {
          const tier = loyaltyService.calculateTier(customer.totalPointsEarned, loyaltyConfig);
          const pointsEarned = loyaltyService.calculatePointsEarned(subtotal, loyaltyConfig, tier);

          let discountFromRedemption = 0;
          const loyaltyPointsRedeemedInt = Number.parseInt(String(reqLoyaltyPointsRedeemed), 10) || 0;
          if (loyaltyPointsRedeemedInt > 0) {
            await loyaltyService.redeemPoints(customerId, order.id, loyaltyPointsRedeemedInt, restaurantId);
            discountFromRedemption = loyaltyService.calculateDiscount(loyaltyPointsRedeemedInt, loyaltyConfig);
          }

          if (pointsEarned > 0) {
            await loyaltyService.awardPoints(customerId, order.id, pointsEarned, restaurantId);
          }

          await prisma.order.update({
            where: { id: order.id },
            data: {
              loyaltyPointsEarned: pointsEarned,
              loyaltyPointsRedeemed: loyaltyPointsRedeemedInt,
              discount: discountFromRedemption,
            },
          });
        }
      }
    }

    const isRushOrder = Boolean((req.body as Record<string, unknown>)['isRush'])
      || /(^|\W)rush(\W|$)/i.test(String(specialInstructions ?? ''));
    await orderThrottlingService.applyAutoThrottleForNewOrder(restaurantId, order.id, { isRush: isRushOrder });

    const throttlingEvaluation = await orderThrottlingService.evaluateAndRelease(restaurantId);
    if (throttlingEvaluation.releasedOrderIds.length > 0) {
      await broadcastUpdatedOrders(throttlingEvaluation.releasedOrderIds.filter(id => id !== order.id));
    }

    const latestOrder = await loadOrderWithRelations(order.id);

    // Log sourceDeviceId for debugging
    console.log(`[Order Create] Order ${order.orderNumber} created with sourceDeviceId: ${order.sourceDeviceId || 'NONE'}`);

    // Broadcast new order to KDS devices + source POS only (not other POS devices)
    const enrichedOrder = enrichOrderResponse(latestOrder ?? order);
    broadcastToSourceAndKDS(restaurantId, order.sourceDeviceId, 'order:new', enrichedOrder);

    res.status(201).json(enrichedOrder);
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

router.patch('/:restaurantId/orders/:orderId/status', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { status, changedBy, note, cancellationReason, cancelledBy } = req.body;

    const result = await updateOrderStatus(orderId, status, {
      changedBy,
      note,
      cancellationReason,
      cancelledBy
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        orderItems: { include: { modifiers: true } },
        customer: true,
        table: true,
        marketplaceOrder: true,
        statusHistory: { orderBy: { createdAt: 'asc' } }
      }
    });

    // Reverse loyalty points on cancellation
    if (status === 'cancelled' && order?.customerId) {
      await loyaltyService.reverseOrder(order.id, order.restaurantId);
    }

    const releasedOrderIds = order
      ? (await orderThrottlingService.evaluateAndRelease(order.restaurantId)).releasedOrderIds
      : [];

    // Broadcast status update to source device + KDS devices only
    // Other POS devices don't need updates for orders they didn't create
    if (order) {
      console.log(`[Order Status] Order ${order.orderNumber} -> ${status}, sourceDeviceId: ${order.sourceDeviceId || 'NONE'}`);
      const enrichedOrder = enrichOrderResponse(order);
      broadcastToSourceAndKDS(order.restaurantId, order.sourceDeviceId, 'order:updated', enrichedOrder);

      // Queue print job + send notifications when order becomes ready
      if (status === 'ready') {
        cloudPrntService.queuePrintJob(orderId).catch((error: unknown) => {
          console.error(`[Order Status] Failed to queue print job for order ${order.orderNumber}:`, error);
        });
        notificationService.onOrderReady(orderId).catch((error: unknown) => {
          console.error(`[Order Status] Failed to send notification for order ${order.orderNumber}:`, error);
        });
      }
    }

    if (releasedOrderIds.length > 0) {
      await broadcastUpdatedOrders(releasedOrderIds.filter(id => id !== orderId));
    }

    res.json(enrichOrderResponse(order));
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// Fire a course (HOLD -> SENT) for KDS course pacing.
router.patch('/:restaurantId/orders/:orderId/fire-course', async (req: Request, res: Response) => {
  try {
    const { restaurantId, orderId } = req.params;
    const { courseGuid } = req.body as { courseGuid?: string };

    if (!courseGuid) {
      res.status(400).json({ error: 'courseGuid is required' });
      return;
    }

    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      include: ORDER_INCLUDE,
    });

    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    const now = new Date();
    const updatedCount = await prisma.orderItem.updateMany({
      where: {
        orderId,
        courseGuid,
      },
      data: {
        status: 'preparing',
        fulfillmentStatus: 'SENT',
        courseFireStatus: 'FIRED',
        courseFiredAt: now,
        courseReadyAt: null,
        sentToKitchenAt: now,
      },
    });

    if (updatedCount.count === 0) {
      res.status(404).json({ error: 'Course not found on order' });
      return;
    }

    const updatedOrder = await prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });

    if (!updatedOrder) {
      res.status(500).json({ error: 'Failed to load updated order' });
      return;
    }

    const enriched = enrichOrderResponse(updatedOrder);
    broadcastToSourceAndKDS(updatedOrder.restaurantId, updatedOrder.sourceDeviceId, 'order:updated', enriched);
    res.json(enriched);
  } catch (error: unknown) {
    console.error('[Course Pacing] Error firing course:', error);
    res.status(500).json({ error: 'Failed to fire course' });
  }
});

// Fire an individual held item now (prep-time staggering override).
router.patch('/:restaurantId/orders/:orderId/fire-item', async (req: Request, res: Response) => {
  try {
    const { restaurantId, orderId } = req.params;
    const { selectionGuid } = req.body as { selectionGuid?: string };

    if (!selectionGuid) {
      res.status(400).json({ error: 'selectionGuid is required' });
      return;
    }

    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
    });

    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    const item = await prisma.orderItem.findFirst({
      where: { id: selectionGuid, orderId },
    });

    if (!item) {
      res.status(404).json({ error: 'Order item not found' });
      return;
    }

    const now = new Date();
    await prisma.orderItem.update({
      where: { id: selectionGuid },
      data: {
        status: 'preparing',
        fulfillmentStatus: 'ON_THE_FLY',
        sentToKitchenAt: now,
        ...(item.courseGuid ? {
          courseFireStatus: 'FIRED',
          courseFiredAt: item.courseFiredAt ?? now,
          courseReadyAt: null,
        } : {}),
      },
    });

    const updatedOrder = await prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });

    if (!updatedOrder) {
      res.status(500).json({ error: 'Failed to load updated order' });
      return;
    }

    const enriched = enrichOrderResponse(updatedOrder);
    broadcastToSourceAndKDS(updatedOrder.restaurantId, updatedOrder.sourceDeviceId, 'order:updated', enriched);
    res.json(enriched);
  } catch (error: unknown) {
    console.error('[Course Pacing] Error firing item:', error);
    res.status(500).json({ error: 'Failed to fire item' });
  }
});

// Course pacing metrics for adaptive auto-fire timing.
router.get('/:restaurantId/course-pacing/metrics', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const lookbackDays = Number.parseInt(String(req.query.lookbackDays ?? '30'), 10);
    const metrics = await coursePacingService.getRestaurantMetrics(restaurantId, lookbackDays);
    res.json(metrics);
  } catch (error) {
    console.error('[Course Pacing] Error loading pacing metrics:', error);
    res.status(500).json({ error: 'Failed to load course pacing metrics' });
  }
});

router.get('/:restaurantId/throttling/status', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const evaluation = await orderThrottlingService.evaluateAndRelease(restaurantId);
    if (evaluation.releasedOrderIds.length > 0) {
      await broadcastUpdatedOrders(evaluation.releasedOrderIds);
    }
    const status = await orderThrottlingService.getStatus(restaurantId);
    res.json(status);
  } catch (error) {
    console.error('[Order Throttling] Error loading throttling status:', error);
    res.status(500).json({ error: 'Failed to load order throttling status' });
  }
});

router.post('/:restaurantId/orders/:orderId/throttle/hold', async (req: Request, res: Response) => {
  try {
    const { restaurantId, orderId } = req.params;
    const held = await orderThrottlingService.holdOrderManually(restaurantId, orderId);
    if (!held) {
      res.status(404).json({ error: 'Order not found or cannot be held' });
      return;
    }

    const updatedOrder = await loadOrderWithRelations(orderId);
    if (!updatedOrder) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    const enriched = enrichOrderResponse(updatedOrder);
    broadcastToSourceAndKDS(updatedOrder.restaurantId, updatedOrder.sourceDeviceId, 'order:updated', enriched);
    res.json(enriched);
  } catch (error) {
    console.error('[Order Throttling] Error holding order:', error);
    res.status(500).json({ error: 'Failed to hold order' });
  }
});

router.post('/:restaurantId/orders/:orderId/throttle/release', async (req: Request, res: Response) => {
  try {
    const { restaurantId, orderId } = req.params;
    const released = await orderThrottlingService.releaseOrderManually(restaurantId, orderId);
    if (!released) {
      res.status(404).json({ error: 'Order not found or not in held state' });
      return;
    }

    const updatedOrder = await loadOrderWithRelations(orderId);
    if (!updatedOrder) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    const enriched = enrichOrderResponse(updatedOrder);
    broadcastToSourceAndKDS(updatedOrder.restaurantId, updatedOrder.sourceDeviceId, 'order:updated', enriched);
    res.json(enriched);
  } catch (error) {
    console.error('[Order Throttling] Error releasing order:', error);
    res.status(500).json({ error: 'Failed to release order' });
  }
});

// Get order status history
router.get('/:restaurantId/orders/:orderId/history', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const history = await getOrderStatusHistory(orderId);
    res.json(history);
  } catch (error) {
    console.error('Error getting order status history:', error);
    res.status(500).json({ error: 'Failed to get order status history' });
  }
});

// Reprint order receipt
router.post('/:restaurantId/orders/:orderId/reprint', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const jobId = await cloudPrntService.queuePrintJob(orderId);
    res.json({ success: true, jobId });
  } catch (error) {
    console.error('Error reprinting order:', error);
    res.status(500).json({ error: 'Failed to reprint order' });
  }
});


// Update individual order item status (for KDS)
router.patch('/:restaurantId/orders/:orderId/items/:itemId/status', async (req: Request, res: Response) => {
  try {
    const { restaurantId, orderId, itemId } = req.params;
    const { status } = req.body;

    const updateData: any = { status };
    if (status === 'preparing') {
      updateData.sentToKitchenAt = new Date();
      updateData.fulfillmentStatus = 'SENT';
    }
    if (status === 'completed') {
      updateData.completedAt = new Date();
      updateData.fulfillmentStatus = 'SENT';
    }

    const orderItem = await prisma.orderItem.update({
      where: { id: itemId },
      data: updateData,
      include: { modifiers: true }
    });

    // Mark the whole course as READY when all items in that course are completed.
    if (status === 'completed' && orderItem.courseGuid) {
      const remaining = await prisma.orderItem.count({
        where: {
          orderId,
          courseGuid: orderItem.courseGuid,
          status: { not: 'completed' },
        },
      });

      if (remaining === 0) {
        await prisma.orderItem.updateMany({
          where: {
            orderId,
            courseGuid: orderItem.courseGuid,
          },
          data: {
            courseFireStatus: 'READY',
            courseReadyAt: new Date(),
          },
        });
      }
    }

    const throttlingEvaluation = await orderThrottlingService.evaluateAndRelease(restaurantId);

    const updatedOrder = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      include: ORDER_INCLUDE,
    });

    if (updatedOrder) {
      const enriched = enrichOrderResponse(updatedOrder);
      broadcastToSourceAndKDS(updatedOrder.restaurantId, updatedOrder.sourceDeviceId, 'order:updated', enriched);
    }

    if (throttlingEvaluation.releasedOrderIds.length > 0) {
      await broadcastUpdatedOrders(throttlingEvaluation.releasedOrderIds.filter(id => id !== orderId));
    }

    res.json(orderItem);
  } catch (error) {
    console.error('Error updating order item status:', error);
    res.status(500).json({ error: 'Failed to update order item status' });
  }
});

// Batch mark items as ready (per-station partial completion)
router.patch('/:restaurantId/orders/:orderId/items/ready', async (req: Request, res: Response) => {
  try {
    const { restaurantId, orderId } = req.params;
    const { itemIds, stationId, stationName } = req.body;

    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      res.status(400).json({ error: 'itemIds array is required' });
      return;
    }

    // Update each item status to 'completed' (ready)
    await prisma.orderItem.updateMany({
      where: {
        id: { in: itemIds },
        orderId,
      },
      data: {
        status: 'completed',
        completedAt: new Date(),
        fulfillmentStatus: 'SENT',
      },
    });

    // Check if ALL items on the order are now completed
    const remainingItems = await prisma.orderItem.count({
      where: {
        orderId,
        status: { not: 'completed' },
      },
    });

    const allReady = remainingItems === 0;

    // If all items ready, auto-transition order to 'ready'
    if (allReady) {
      await prisma.order.update({
        where: { id: orderId },
        data: { status: 'ready' },
      });
    }

    // Get updated item names for the notification
    const updatedItems = await prisma.orderItem.findMany({
      where: { id: { in: itemIds } },
      select: { id: true, menuItemName: true, status: true },
    });

    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      include: ORDER_INCLUDE,
    });

    if (order) {
      const enriched = enrichOrderResponse(order);

      // Emit items:ready to source device only
      if (order.sourceDeviceId) {
        sendOrderEventToDevice(restaurantId, order.sourceDeviceId, 'items:ready', {
          orderId,
          stationId: stationId ?? '',
          stationName: stationName ?? 'Station',
          items: updatedItems.map(i => ({ id: i.id, name: i.menuItemName, status: i.status })),
          allReady,
        });
      }

      // Broadcast order:updated to source + KDS
      broadcastToSourceAndKDS(order.restaurantId, order.sourceDeviceId, 'order:updated', enriched);
    }

    res.json({
      itemIds,
      allReady,
      items: updatedItems,
    });
  } catch (error) {
    console.error('Error marking items ready:', error);
    res.status(500).json({ error: 'Failed to mark items as ready' });
  }
});

router.delete('/:restaurantId/orders/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    
    // Delete modifiers first
    const orderItems = await prisma.orderItem.findMany({ where: { orderId } });
    for (const item of orderItems) {
      await prisma.orderItemModifier.deleteMany({ where: { orderItemId: item.id } });
    }
    
    await prisma.orderItem.deleteMany({ where: { orderId } });
    await prisma.order.delete({ where: { id: orderId } });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({ error: 'Failed to delete order' });
  }
});

// ============ Payments ============

// Create payment intent for an order
router.post('/:restaurantId/orders/:orderId/payment-intent', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    const order = await prisma.order.findUnique({
      where: { id: orderId }
    });

    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    const result = await stripeService.createPaymentIntent({
      orderId,
      amount: Number(order.total)
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({
      clientSecret: result.clientSecret,
      paymentIntentId: result.paymentIntentId
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({ error: 'Failed to create payment intent' });
  }
});

// Create PayPal order for an order
router.post('/:restaurantId/orders/:orderId/paypal-create', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    const result = await paypalService.createOrder({
      orderId,
      amount: Number(order.total),
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({ paypalOrderId: result.paypalOrderId });
  } catch (error) {
    console.error('Error creating PayPal order:', error);
    res.status(500).json({ error: 'Failed to create PayPal order' });
  }
});

// Capture PayPal order
router.post('/:restaurantId/orders/:orderId/paypal-capture', async (req: Request, res: Response) => {
  try {
    const { restaurantId, orderId } = req.params;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    if (!order.paypalOrderId) {
      res.status(400).json({ error: 'No PayPal order found for this order' });
      return;
    }

    const result = await paypalService.captureOrder(order.paypalOrderId, orderId);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    const updatedOrder = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        orderItems: { include: { modifiers: true } },
        customer: true,
        table: true,
        marketplaceOrder: true,
        restaurant: true,
      },
    });

    if (updatedOrder) {
      const enriched = enrichOrderResponse(updatedOrder);
      broadcastToSourceAndKDS(restaurantId, updatedOrder.sourceDeviceId, 'order:updated', enriched);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error capturing PayPal order:', error);
    res.status(500).json({ error: 'Failed to capture PayPal order' });
  }
});

// Get payment status for an order
router.get('/:restaurantId/orders/:orderId/payment-status', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        paymentStatus: true,
        paymentMethod: true,
        stripePaymentIntentId: true,
        paypalOrderId: true,
        paypalCaptureId: true,
        total: true,
      }
    });

    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    let processorData = null;
    if (order.stripePaymentIntentId) {
      const result = await stripeService.getPaymentIntent(order.stripePaymentIntentId);
      if (result.success && result.paymentIntent) {
        processorData = {
          processor: 'stripe',
          status: result.paymentIntent.status,
          amount: result.paymentIntent.amount / 100,
          currency: result.paymentIntent.currency,
        };
      }
    } else if (order.paypalOrderId) {
      const result = await paypalService.getOrderStatus(order.paypalOrderId);
      if (result.success) {
        processorData = {
          processor: 'paypal',
          status: result.status,
          paypalOrderId: result.paypalOrderId,
        };
      }
    }

    res.json({
      orderId: order.id,
      orderNumber: order.orderNumber,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      total: order.total,
      processorData,
    });
  } catch (error) {
    console.error('Error getting payment status:', error);
    res.status(500).json({ error: 'Failed to get payment status' });
  }
});

// Cancel payment intent
router.post('/:restaurantId/orders/:orderId/cancel-payment', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    const order = await prisma.order.findUnique({
      where: { id: orderId }
    });

    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    let result: { success: boolean; error?: string };

    if (order.stripePaymentIntentId) {
      result = await stripeService.cancelPaymentIntent(order.stripePaymentIntentId);
    } else if (order.paypalOrderId) {
      result = await paypalService.cancelOrder(order.paypalOrderId);
    } else {
      res.status(400).json({ error: 'No payment found for this order' });
      return;
    }

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    await prisma.order.update({
      where: { id: orderId },
      data: { paymentStatus: 'cancelled' },
    });

    res.json({ success: true, message: 'Payment cancelled' });
  } catch (error) {
    console.error('Error cancelling payment:', error);
    res.status(500).json({ error: 'Failed to cancel payment' });
  }
});

// Refund payment
router.post('/:restaurantId/orders/:orderId/refund', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { amount } = req.body;

    const order = await prisma.order.findUnique({
      where: { id: orderId }
    });

    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    if (order.paymentStatus !== 'paid') {
      res.status(400).json({ error: 'Order has not been paid' });
      return;
    }

    let refundResponse: { success: boolean; refundId?: string; amount?: number | null; status?: string; error?: string };

    if (order.stripePaymentIntentId) {
      const result = await stripeService.createRefund(order.stripePaymentIntentId, amount);
      refundResponse = {
        success: result.success,
        refundId: result.refund?.id,
        amount: result.refund?.amount ? result.refund.amount / 100 : null,
        status: result.refund?.status,
        error: result.error,
      };
    } else if (order.paypalCaptureId) {
      const result = await paypalService.refundCapture(order.paypalCaptureId, amount);
      refundResponse = {
        success: result.success,
        refundId: result.refundId,
        amount: result.amount ?? null,
        status: result.status,
        error: result.error,
      };
    } else {
      res.status(400).json({ error: 'No refundable payment found for this order' });
      return;
    }

    if (!refundResponse.success) {
      res.status(400).json({ error: refundResponse.error });
      return;
    }

    const refundStatus = amount && amount < Number(order.total) ? 'partial_refund' : 'refunded';

    await prisma.order.update({
      where: { id: orderId },
      data: { paymentStatus: refundStatus },
    });

    res.json({
      success: true,
      refundId: refundResponse.refundId,
      amount: refundResponse.amount,
      status: refundResponse.status,
    });
  } catch (error) {
    console.error('Error processing refund:', error);
    res.status(500).json({ error: 'Failed to process refund' });
  }
});

// ============ Tax Lookup ============

router.get('/tax-rate/:zipCode', async (req: Request, res: Response) => {
  try {
    const { zipCode } = req.params;
    const { state = 'FL' } = req.query;
    
    const taxInfo = await taxService.getTaxRateByZip(zipCode, state as string);
    res.json(taxInfo);
  } catch (error) {
    console.error('Error looking up tax rate:', error);
    res.status(500).json({ error: 'Failed to lookup tax rate' });
  }
});

export default router;
