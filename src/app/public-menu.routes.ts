import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

/**
 * Returns true if the entity is visible on the 'online' channel.
 * Empty channelVisibility array = visible on all channels (backward compatible).
 */
function isOnlineVisible(channelVisibility: string[]): boolean {
  return channelVisibility.length === 0 || channelVisibility.includes('online');
}

/**
 * GET /api/public/:merchantSlug/menu
 *
 * Public (no auth) endpoint for customer-facing online ordering.
 * Returns restaurant info, online-visible categories, and active non-86'd items
 * filtered by channel visibility.
 */
router.get('/:merchantSlug/menu', async (req: Request, res: Response) => {
  try {
    const { merchantSlug } = req.params;

    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: merchantSlug },
      select: {
        id: true,
        name: true,
        slug: true,
        logo: true,
        address: true,
        city: true,
        state: true,
        zip: true,
        phone: true,
        businessHours: true,
        pickupEnabled: true,
        deliveryEnabled: true,
        dineInEnabled: true,
        active: true,
      },
    });

    if (!restaurant || !restaurant.active) {
      res.status(404).json({ error: 'Restaurant not found' });
      return;
    }

    // Fetch active categories, then filter by online channel visibility
    const allCategories = await prisma.menuCategory.findMany({
      where: {
        restaurantId: restaurant.id,
        active: true,
      },
      select: {
        id: true,
        name: true,
        nameEn: true,
        description: true,
        descriptionEn: true,
        image: true,
        displayOrder: true,
        primaryCategoryId: true,
        channelVisibility: true,
      },
      orderBy: { displayOrder: 'asc' },
    });

    const categories = allCategories.filter(c => isOnlineVisible(c.channelVisibility));
    const onlineCategoryIds = new Set(categories.map(c => c.id));

    // Fetch active, non-86'd items, then filter by channel + category
    const allItems = await prisma.menuItem.findMany({
      where: {
        restaurantId: restaurant.id,
        available: true,
        eightySixed: false,
      },
      select: {
        id: true,
        name: true,
        nameEn: true,
        description: true,
        descriptionEn: true,
        price: true,
        image: true,
        categoryId: true,
        popular: true,
        dietary: true,
        prepTimeMinutes: true,
        displayOrder: true,
        channelVisibility: true,
      },
      orderBy: { displayOrder: 'asc' },
    });

    const items = allItems.filter(i =>
      isOnlineVisible(i.channelVisibility) && onlineCategoryIds.has(i.categoryId)
    );

    // Load modifier groups for filtered items
    const itemIds = items.map(i => i.id);
    const modifierGroups = await prisma.menuItemModifierGroup.findMany({
      where: { menuItemId: { in: itemIds } },
      include: {
        modifierGroup: {
          include: {
            modifiers: {
              where: { available: true },
              orderBy: { displayOrder: 'asc' },
              select: {
                id: true,
                name: true,
                nameEn: true,
                priceAdjustment: true,
                isDefault: true,
                displayOrder: true,
              },
            },
          },
        },
      },
    });

    // Group modifiers by item
    const modifiersByItem = new Map<string, typeof modifierGroups>();
    for (const mg of modifierGroups) {
      const list = modifiersByItem.get(mg.menuItemId) ?? [];
      list.push(mg);
      modifiersByItem.set(mg.menuItemId, list);
    }

    // Build items with modifiers (strip channelVisibility from response)
    const itemsWithModifiers = items.map(item => ({
      id: item.id,
      name: item.name,
      nameEn: item.nameEn,
      description: item.description,
      descriptionEn: item.descriptionEn,
      price: Number(item.price),
      image: item.image,
      categoryId: item.categoryId,
      popular: item.popular,
      dietary: item.dietary,
      prepTimeMinutes: item.prepTimeMinutes,
      displayOrder: item.displayOrder,
      modifierGroups: (modifiersByItem.get(item.id) ?? []).map(mg => ({
        id: mg.modifierGroup.id,
        name: mg.modifierGroup.name,
        required: mg.modifierGroup.required,
        minSelections: mg.modifierGroup.minSelections,
        maxSelections: mg.modifierGroup.maxSelections,
        modifiers: mg.modifierGroup.modifiers.map(m => ({
          id: m.id,
          name: m.name,
          nameEn: m.nameEn,
          priceAdjustment: Number(m.priceAdjustment),
          isDefault: m.isDefault,
          displayOrder: m.displayOrder,
        })),
      })),
    }));

    // Group items by category (strip channelVisibility from category response)
    const categoryMap = new Map(categories.map(c => [c.id, {
      id: c.id,
      name: c.name,
      nameEn: c.nameEn,
      description: c.description,
      descriptionEn: c.descriptionEn,
      image: c.image,
      displayOrder: c.displayOrder,
      primaryCategoryId: c.primaryCategoryId,
      items: [] as typeof itemsWithModifiers,
    }]));
    for (const item of itemsWithModifiers) {
      categoryMap.get(item.categoryId)?.items.push(item);
    }

    // Determine if currently open based on business hours
    const now = new Date();
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const todayName = dayNames[now.getDay()];
    let isOpen = false;
    let nextOpenTime: string | null = null;

    if (restaurant.businessHours && Array.isArray(restaurant.businessHours)) {
      const todayHours = (restaurant.businessHours as Array<{ day: string; open: string; close: string; isClosed?: boolean }>)
        .find(h => h.day === todayName);
      if (todayHours && !todayHours.isClosed) {
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        isOpen = currentTime >= todayHours.open && currentTime < todayHours.close;
        if (!isOpen && currentTime < todayHours.open) {
          nextOpenTime = todayHours.open;
        }
      }
      if (!isOpen && !nextOpenTime) {
        for (let offset = 1; offset <= 7; offset++) {
          const nextDay = dayNames[(now.getDay() + offset) % 7];
          const nextHours = (restaurant.businessHours as Array<{ day: string; open: string; close: string; isClosed?: boolean }>)
            .find(h => h.day === nextDay);
          if (nextHours && !nextHours.isClosed) {
            nextOpenTime = `${nextDay} ${nextHours.open}`;
            break;
          }
        }
      }
    }

    res.json({
      restaurant: {
        name: restaurant.name,
        slug: restaurant.slug,
        logo: restaurant.logo,
        address: restaurant.address,
        city: restaurant.city,
        state: restaurant.state,
        zip: restaurant.zip,
        phone: restaurant.phone,
        businessHours: restaurant.businessHours,
        pickupEnabled: restaurant.pickupEnabled,
        deliveryEnabled: restaurant.deliveryEnabled,
        dineInEnabled: restaurant.dineInEnabled,
      },
      onlineStatus: {
        isOpen,
        nextOpenTime,
      },
      categories: [...categoryMap.values()].filter(c => c.items.length > 0),
    });
  } catch (error: unknown) {
    console.error('[Public Menu] Error:', error);
    res.status(500).json({ error: 'Failed to load menu' });
  }
});

export default router;
