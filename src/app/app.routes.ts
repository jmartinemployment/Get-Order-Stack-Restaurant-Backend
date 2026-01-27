import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { translationService } from '../services/translation.service';
import { aiCostService } from '../services/ai-cost.service';
import { taxService } from '../services/tax.service';
import { updateOrderStatus, getOrderStatusHistory } from '../services/order-status.service';
import { stripeService } from '../services/stripe.service';
import { broadcastOrderEvent, sendOrderEventToDevice, broadcastToSourceAndKDS } from '../services/socket.service';

const router = Router();
const prisma = new PrismaClient();

function generateOrderNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD-${timestamp}-${random}`;
}

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
    const data = req.body;

    const restaurant = await prisma.restaurant.update({
      where: { id: restaurantId },
      data
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
      generatedDescEn = await aiCostService.generateEnglishDescription(name, description, restaurant?.cuisineType || undefined);
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
        name, description, restaurant?.cuisineType || undefined
      );
    }

    // Auto-estimate cost if not provided
    let aiData: any = {};
    if (!cost) {
      const estimation = await aiCostService.estimateCost(
        name, description, Number(price), restaurant?.cuisineType || undefined
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
        name || currentItem?.name || '',
        description || currentItem?.description || '',
        restaurant?.cuisineType || undefined
      );
    }

    // Re-estimate cost if price changed
    if (price !== undefined && !cost && !currentItem?.cost) {
      const estimation = await aiCostService.estimateCost(
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
        restaurantId, tableNumber, tableName, capacity, section, posX, posY
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
      item.name, item.description, Number(item.price), restaurant?.cuisineType || undefined
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
      item.name, item.description, restaurant?.cuisineType || undefined
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
        item.name, item.description, Number(item.price), restaurant?.cuisineType || undefined
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
        item.name, item.description, restaurant?.cuisineType || undefined
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
    const { status, orderType, sourceDeviceId, limit = '50' } = req.query;

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
        ...(sourceDeviceId && { sourceDeviceId: sourceDeviceId as string })
      },
      include: {
        orderItems: {
          include: { modifiers: true }
        },
        customer: true,
        table: true
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit as string)
    });
    res.json(orders);
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
        orderItems: {
          include: { menuItem: true, modifiers: true }
        },
        customer: true,
        table: true
      }
    });

    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    res.json(order);
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
      deliveryAddress, deliveryLat, deliveryLng
    } = req.body;

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

    // Handle customer info - support both formats
    let customerId = null;
    const resolvedCustomerName = customerInfo?.firstName 
      ? `${customerInfo.firstName}${customerInfo.lastName ? ' ' + customerInfo.lastName : ''}`
      : customerName;
    const resolvedPhone = customerInfo?.phone || customerPhone;
    const resolvedEmail = customerInfo?.email || customerEmail;

    if (resolvedEmail || resolvedPhone || resolvedCustomerName) {
      let firstName = customerInfo?.firstName;
      let lastName = customerInfo?.lastName;
      if (!firstName && resolvedCustomerName) {
        const nameParts = resolvedCustomerName.trim().split(' ');
        firstName = nameParts[0];
        lastName = nameParts.slice(1).join(' ') || null;
      }

      const customer = await prisma.customer.create({
        data: {
          restaurantId,
          firstName,
          lastName,
          email: resolvedEmail,
          phone: resolvedPhone
        }
      });
      customerId = customer.id;
    }

    let subtotal = 0;
    const orderItemsData = [];

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

      orderItemsData.push({
        menuItem: { connect: { id: menuItem.id } },
        menuItemName: menuItem.name,
        quantity: item.quantity,
        unitPrice: menuItem.price,
        modifiersPrice,
        totalPrice: itemTotal,
        specialInstructions: item.specialInstructions,
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
        deliveryAddress,
        deliveryLat,
        deliveryLng,
        scheduledTime: scheduledTime ? new Date(scheduledTime) : null,
        orderItems: { create: orderItemsData }
      },
      include: {
        orderItems: { include: { modifiers: true } },
        customer: true,
        table: true
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
    }

    // Log sourceDeviceId for debugging
    console.log(`[Order Create] Order ${order.orderNumber} created with sourceDeviceId: ${order.sourceDeviceId || 'NONE'}`);

    // Broadcast new order to KDS devices + source POS only (not other POS devices)
    broadcastToSourceAndKDS(restaurantId, order.sourceDeviceId, 'order:new', order);

    res.status(201).json(order);
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
        statusHistory: { orderBy: { createdAt: 'asc' } }
      }
    });

    // Broadcast status update to source device + KDS devices only
    // Other POS devices don't need updates for orders they didn't create
    if (order) {
      console.log(`[Order Status] Order ${order.orderNumber} -> ${status}, sourceDeviceId: ${order.sourceDeviceId || 'NONE'}`);
      broadcastToSourceAndKDS(order.restaurantId, order.sourceDeviceId, 'order:updated', order);
    }

    res.json(order);
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: 'Failed to update order status' });
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


// Update individual order item status (for KDS)
router.patch('/:restaurantId/orders/:orderId/items/:itemId/status', async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    const { status } = req.body;

    const updateData: any = { status };
    if (status === 'preparing') {
      updateData.sentToKitchenAt = new Date();
    }
    if (status === 'completed') {
      updateData.completedAt = new Date();
    }

    const orderItem = await prisma.orderItem.update({
      where: { id: itemId },
      data: updateData,
      include: { modifiers: true }
    });

    res.json(orderItem);
  } catch (error) {
    console.error('Error updating order item status:', error);
    res.status(500).json({ error: 'Failed to update order item status' });
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

// ============ Payments (Stripe) ============

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
        total: true
      }
    });

    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    let stripeStatus = null;
    if (order.stripePaymentIntentId) {
      const result = await stripeService.getPaymentIntent(order.stripePaymentIntentId);
      if (result.success && result.paymentIntent) {
        stripeStatus = {
          status: result.paymentIntent.status,
          amount: result.paymentIntent.amount / 100,
          currency: result.paymentIntent.currency
        };
      }
    }

    res.json({
      orderId: order.id,
      orderNumber: order.orderNumber,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      total: order.total,
      stripe: stripeStatus
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

    if (!order.stripePaymentIntentId) {
      res.status(400).json({ error: 'No payment intent found for this order' });
      return;
    }

    const result = await stripeService.cancelPaymentIntent(order.stripePaymentIntentId);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    await prisma.order.update({
      where: { id: orderId },
      data: { paymentStatus: 'cancelled' }
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

    if (!order.stripePaymentIntentId) {
      res.status(400).json({ error: 'No payment intent found for this order' });
      return;
    }

    if (order.paymentStatus !== 'paid') {
      res.status(400).json({ error: 'Order has not been paid' });
      return;
    }

    const result = await stripeService.createRefund(
      order.stripePaymentIntentId,
      amount
    );

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    const refundStatus = amount && amount < Number(order.total) ? 'partial_refund' : 'refunded';

    await prisma.order.update({
      where: { id: orderId },
      data: { paymentStatus: refundStatus }
    });

    res.json({
      success: true,
      refundId: result.refund?.id,
      amount: result.refund?.amount ? result.refund.amount / 100 : null,
      status: result.refund?.status
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
