import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { MENU_TEMPLATES, type MenuTemplate } from '../data/menu-templates';
import { DEFAULT_PERMISSION_SETS } from '../data/default-permission-sets';
import { authService } from '../services/auth.service';
import { requireAuth, optionalAuth } from '../middleware/auth.middleware';

const router = Router();
const prisma = new PrismaClient();

// Vertical -> enabled modules mapping (must match frontend BUSINESS_VERTICAL_CATALOG in platform.model.ts)
const VERTICAL_MODULES: Record<string, string[]> = {
  food_and_drink: [
    'menu_management', 'table_management', 'kds', 'bookings',
    'catering', 'online_ordering', 'inventory', 'marketing', 'loyalty',
    'delivery', 'gift_cards', 'staff_scheduling', 'payroll',
    'reports', 'crm', 'multi_location',
  ],
  retail: [
    'inventory', 'online_ordering', 'marketing', 'loyalty',
    'gift_cards', 'staff_scheduling', 'payroll', 'reports',
    'crm', 'multi_location',
  ],
  grocery: [
    'inventory', 'online_ordering', 'marketing', 'loyalty',
    'gift_cards', 'staff_scheduling', 'payroll', 'reports',
    'crm', 'multi_location',
  ],
  beauty_wellness: [
    'appointments', 'inventory', 'marketing', 'loyalty',
    'gift_cards', 'staff_scheduling', 'payroll', 'reports',
    'crm', 'multi_location',
  ],
  healthcare: [
    'appointments', 'invoicing', 'marketing', 'staff_scheduling',
    'payroll', 'reports', 'crm',
  ],
  sports_fitness: [
    'appointments', 'inventory', 'marketing', 'loyalty',
    'gift_cards', 'staff_scheduling', 'payroll', 'reports',
    'crm', 'multi_location',
  ],
  home_repair: [
    'invoicing', 'marketing', 'staff_scheduling', 'payroll',
    'reports', 'crm',
  ],
  professional_services: [
    'invoicing', 'marketing', 'staff_scheduling', 'payroll',
    'reports', 'crm',
  ],
};

// US state tax rate approximations (state + average local rate)
const STATE_TAX_RATES: Record<string, number> = {
  AL: 9.22, AK: 1.76, AZ: 8.4, AR: 9.47, CA: 8.68,
  CO: 7.77, CT: 6.35, DE: 0, FL: 7.02, GA: 7.35,
  HI: 4.44, ID: 6.02, IL: 8.82, IN: 7, IA: 6.94,
  KS: 8.68, KY: 6, LA: 9.55, ME: 5.5, MD: 6,
  MA: 6.25, MI: 6, MN: 7.49, MS: 7.07, MO: 8.25,
  MT: 0, NE: 6.94, NV: 8.23, NH: 0, NJ: 6.63,
  NM: 7.72, NY: 8.52, NC: 6.99, ND: 6.96, OH: 7.24,
  OK: 8.98, OR: 0, PA: 6.34, RI: 7, SC: 7.44,
  SD: 6.4, TN: 9.55, TX: 8.2, UT: 7.19, VT: 6.24,
  VA: 5.75, WA: 9.29, WV: 6.55, WI: 5.43, WY: 5.36,
  DC: 6,
};

// ============ Merchant Profile ============

// GET /api/restaurant/:merchantId/merchant-profile
router.get('/:merchantId/merchant-profile', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { merchantProfile: true },
    });

    if (!restaurant) {
      res.status(404).json({ error: 'Restaurant not found' });
      return;
    }

    res.json(restaurant.merchantProfile ?? null);
  } catch (error) {
    console.error('Failed to load merchant profile:', error);
    res.status(500).json({ error: 'Failed to load merchant profile' });
  }
});

// PATCH /api/restaurant/:merchantId/merchant-profile
router.patch('/:merchantId/merchant-profile', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const updates = req.body;

    const currentProfile = await loadMerchantProfile(restaurantId);
    if (currentProfile === null) {
      res.status(404).json({ error: 'Restaurant not found' });
      return;
    }

    const merged = { ...currentProfile, ...updates };

    const data: Record<string, unknown> = { merchantProfile: merged };
    if (typeof updates.businessName === 'string' && updates.businessName.trim()) {
      data.name = updates.businessName.trim();
    }

    const restaurant = await prisma.restaurant.update({
      where: { id: restaurantId },
      data,
      select: { merchantProfile: true, name: true },
    });

    res.json(restaurant.merchantProfile);
  } catch (error) {
    console.error('Failed to save merchant profile:', error);
    res.status(500).json({ error: 'Failed to save merchant profile' });
  }
});

// ============ Menu Templates ============

// GET /api/platform/menu-templates?vertical=...
router.get('/menu-templates', (_req: Request, res: Response) => {
  const vertical = _req.query['vertical'] as string | undefined;
  if (vertical) {
    res.json(MENU_TEMPLATES.filter(t => t.vertical === vertical));
  } else {
    res.json(MENU_TEMPLATES);
  }
});

// POST /api/restaurant/:merchantId/apply-menu-template
router.post('/:merchantId/apply-menu-template', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const { templateId } = req.body;

    const template: MenuTemplate | undefined = MENU_TEMPLATES.find(t => t.id === templateId);
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });
    if (!restaurant) {
      res.status(404).json({ error: 'Restaurant not found' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      const createdItemsByName = new Map<string, string>();

      for (const cat of template.categories) {
        const category = await tx.menuCategory.create({
          data: {
            restaurantId,
            name: cat.name,
            displayOrder: cat.sortOrder,
            active: true,
          },
        });

        for (const item of cat.items) {
          const createdItem = await tx.menuItem.create({
            data: {
              restaurantId,
              categoryId: category.id,
              name: item.name,
              description: item.description ?? '',
              price: item.price,
              displayOrder: item.sortOrder,
              prepTimeMinutes: item.prepTimeMinutes,
              available: true,
            },
          });
          createdItemsByName.set(item.name, createdItem.id);
        }
      }

      // Create modifier groups and link to items
      for (const mg of template.modifierGroups) {
        const modifierGroup = await tx.modifierGroup.create({
          data: {
            restaurantId,
            name: mg.name,
            required: mg.required,
            multiSelect: mg.multiSelect,
            minSelections: mg.minSelections,
            maxSelections: mg.maxSelections,
            displayOrder: mg.sortOrder,
            active: true,
          },
        });

        for (const mod of mg.modifiers) {
          await tx.modifier.create({
            data: {
              modifierGroupId: modifierGroup.id,
              name: mod.name,
              priceAdjustment: mod.priceAdjustment,
              isDefault: mod.isDefault,
              displayOrder: mod.sortOrder,
              available: true,
            },
          });
        }

        const targetItemNames = mg.applyTo === 'all'
          ? [...createdItemsByName.keys()]
          : mg.applyTo;

        let linkOrder = 1;
        for (const itemName of targetItemNames) {
          const itemId = createdItemsByName.get(itemName);
          if (itemId) {
            await tx.menuItemModifierGroup.create({
              data: {
                menuItemId: itemId,
                modifierGroupId: modifierGroup.id,
                displayOrder: linkOrder++,
              },
            });
          }
        }
      }
    });

    res.json({ success: true, categoriesCreated: template.categories.length, itemsCreated: template.itemCount });
  } catch (error) {
    console.error('Failed to apply menu template:', error);
    res.status(500).json({ error: 'Failed to apply menu template' });
  }
});

// ============ Tax Rate Lookup ============

// GET /api/platform/tax-rate?state=...&zip=...
router.get('/tax-rate', (req: Request, res: Response) => {
  const state = (req.query['state'] as string ?? '').toUpperCase();
  const rate = STATE_TAX_RATES[state];

  if (rate === undefined) {
    res.json({ taxRate: 0, source: 'unknown' });
    return;
  }

  res.json({ taxRate: rate, source: 'state_average', state });
});

// ============ Business Hours ============

// POST /api/restaurant/:merchantId/business-hours
router.post('/:merchantId/business-hours', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const hours = req.body;

    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { businessHours: hours },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to save business hours:', error);
    res.status(500).json({ error: 'Failed to save business hours' });
  }
});

// GET /api/restaurant/:merchantId/business-hours/check
// Returns whether the restaurant is currently open based on stored business hours
interface BusinessHoursDay {
  day: string;
  open: string;
  close: string;
  closed: boolean;
}

const DAYS_OF_WEEK = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

function findNextOpenSlot(
  hours: BusinessHoursDay[],
  currentDayIndex: number,
  currentDay: string,
  currentTime: string,
  todayHours: BusinessHoursDay | undefined,
): { nextOpenDay: string | null; nextOpenTime: string | null } {
  if (todayHours && !todayHours.closed && currentTime < todayHours.open) {
    return { nextOpenDay: currentDay, nextOpenTime: todayHours.open };
  }

  for (let offset = 1; offset <= 7; offset++) {
    const checkDayIndex = (currentDayIndex + offset) % 7;
    const checkDay = DAYS_OF_WEEK[checkDayIndex];
    const dayHours = hours.find(h => h.day === checkDay);

    if (dayHours && !dayHours.closed) {
      return { nextOpenDay: checkDay, nextOpenTime: dayHours.open };
    }
  }

  return { nextOpenDay: null, nextOpenTime: null };
}

function computeBusinessHoursStatus(
  hours: BusinessHoursDay[] | null,
): Record<string, unknown> {
  const now = new Date();
  const currentDayIndex = now.getDay();
  const currentDay = DAYS_OF_WEEK[currentDayIndex];
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  if (!hours || !Array.isArray(hours) || hours.length === 0) {
    return { isOpen: true, currentDay, openTime: null, closeTime: null, nextOpenDay: null, nextOpenTime: null, specialHoursReason: null };
  }

  const todayHours = hours.find(h => h.day === currentDay);
  let isOpen = false;
  let openTime: string | null = null;
  let closeTime: string | null = null;

  if (todayHours && !todayHours.closed) {
    openTime = todayHours.open;
    closeTime = todayHours.close;
    isOpen = currentTime >= todayHours.open && currentTime < todayHours.close;
  }

  const { nextOpenDay, nextOpenTime } = isOpen
    ? { nextOpenDay: null, nextOpenTime: null }
    : findNextOpenSlot(hours, currentDayIndex, currentDay, currentTime, todayHours);

  return { isOpen, currentDay, openTime, closeTime, nextOpenDay, nextOpenTime, specialHoursReason: null };
}

router.get('/:merchantId/business-hours/check', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { businessHours: true },
    });

    if (!restaurant) {
      res.status(404).json({ error: 'Restaurant not found' });
      return;
    }

    res.json(computeBusinessHoursStatus(restaurant.businessHours as unknown as BusinessHoursDay[] | null));
  } catch (error) {
    console.error('Failed to check business hours:', error);
    res.status(500).json({ error: 'Failed to check business hours' });
  }
});

// ============ New Onboarding Endpoints (Step-by-step) ============

// POST /api/onboarding/restaurant — Create an incomplete restaurant for the authenticated user
router.post('/restaurant', requireAuth, async (req: Request, res: Response) => {
  try {
    const { businessName, address, primaryVertical, defaultDeviceMode, businessCategory } = req.body;

    if (!businessName) {
      res.status(400).json({ error: 'Business name is required' });
      return;
    }

    const parsedAddr = parseAddress(address as Record<string, unknown> | undefined);
    if (!parsedAddr) {
      res.status(400).json({ error: 'Address, city, state, and zip are required' });
      return;
    }
    const { street, city: addrCity, state: addrState, zip: addrZip } = parsedAddr;

    const teamMemberId = req.user!.teamMemberId;

    const member = await prisma.teamMember.findUnique({
      where: { id: teamMemberId },
      select: { id: true, email: true },
    });

    if (!member?.email) {
      res.status(401).json({ error: 'Authenticated user not found' });
      return;
    }

    // Clean up any incomplete restaurants this user previously created
    const existingAccess = await prisma.userRestaurantAccess.findMany({
      where: { teamMemberId, role: 'owner' },
      include: { restaurant: { select: { id: true, merchantProfile: true } } },
    });

    for (const access of existingAccess) {
      const profile = access.restaurant.merchantProfile as Record<string, unknown> | null;
      const isIncomplete = profile?.['onboardingComplete'] !== true;
      if (isIncomplete) {
        await prisma.restaurant.delete({ where: { id: access.restaurant.id } });
      }
    }

    const slug = businessName
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replaceAll(/^-|-$/g, '');

    const vertical = primaryVertical ?? 'food_and_drink';
    const restaurant = await prisma.restaurant.create({
      data: {
        name: businessName,
        slug: `${slug}-${Date.now().toString(36)}`,
        email: member.email,
        address: street,
        city: addrCity,
        state: addrState,
        zip: addrZip,
        phone: address?.phone ?? '',
        taxRate: 0,
        active: true,
        merchantProfile: {
          id: crypto.randomUUID(),
          businessName,
          address: address ?? null,
          verticals: [vertical],
          primaryVertical: vertical,
          complexity: 'full',
          enabledModules: VERTICAL_MODULES[vertical] ?? [],
          defaultDeviceMode: defaultDeviceMode ?? 'full_service',
          taxLocale: { taxRate: 0, taxInclusive: false, currency: 'USD', defaultLanguage: 'en' },
          businessHours: [],
          businessCategory: businessCategory ?? null,
          onboardingComplete: false,
          createdAt: new Date().toISOString(),
        },
      },
      select: { id: true, name: true, slug: true },
    });

    await prisma.userRestaurantAccess.create({
      data: { teamMemberId, restaurantId: restaurant.id, role: 'owner' },
    });

    res.status(201).json({ restaurantId: restaurant.id, name: restaurant.name, slug: restaurant.slug });
  } catch (error) {
    console.error('Create onboarding restaurant error:', error);
    res.status(500).json({ error: 'Failed to create restaurant' });
  }
});

function buildProfileUpdates(
  body: Record<string, unknown>,
  currentProfile: Record<string, unknown>,
): Record<string, unknown> {
  const { businessName, primaryVertical, verticals, defaultDeviceMode,
          taxLocale, businessHours, businessCategory, address, menuTemplateId, ownerPin } = body as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const updates: Record<string, unknown> = {};
  if (businessName !== undefined) updates['businessName'] = businessName;
  if (primaryVertical !== undefined) updates['primaryVertical'] = primaryVertical;
  if (verticals !== undefined) {
    updates['verticals'] = verticals;
    updates['enabledModules'] = VERTICAL_MODULES[(primaryVertical ?? currentProfile['primaryVertical']) as string] ?? [];
  }
  if (defaultDeviceMode !== undefined) updates['defaultDeviceMode'] = defaultDeviceMode;
  if (taxLocale !== undefined) updates['taxLocale'] = taxLocale;
  if (businessHours !== undefined) updates['businessHours'] = businessHours;
  if (businessCategory !== undefined) updates['businessCategory'] = businessCategory;
  if (address !== undefined) updates['address'] = address;
  if (menuTemplateId !== undefined) updates['menuTemplateId'] = menuTemplateId;
  if (ownerPin !== undefined) updates['ownerPin'] = ownerPin;
  return updates;
}

function buildDirectDbUpdates(body: Record<string, unknown>): Record<string, unknown> {
  const { businessName, address, taxLocale, businessHours } = body as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const direct: Record<string, unknown> = {};
  if (typeof businessName === 'string' && businessName.trim()) direct['name'] = businessName.trim();
  if (address?.street) direct['address'] = address.street;
  if (address?.city) direct['city'] = address.city;
  if (address?.state) direct['state'] = address.state;
  if (address?.zip) direct['zip'] = address.zip;
  if (address?.phone) direct['phone'] = address.phone;
  if (taxLocale?.taxRate !== undefined) direct['taxRate'] = taxLocale.taxRate / 100;
  if (businessHours !== undefined) direct['businessHours'] = businessHours;
  return direct;
}

// PATCH /api/onboarding/restaurant/:id — Update restaurant fields during wizard
router.patch('/restaurant/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.id;
    const teamMemberId = req.user!.teamMemberId;

    if (!await verifyOwnerAccess(teamMemberId, restaurantId)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const currentProfile = await loadMerchantProfile(restaurantId);
    if (currentProfile === null) {
      res.status(404).json({ error: 'Restaurant not found' });
      return;
    }

    const profileUpdates = buildProfileUpdates(req.body as Record<string, unknown>, currentProfile);
    const directUpdates = buildDirectDbUpdates(req.body as Record<string, unknown>);

    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { merchantProfile: { ...currentProfile, ...profileUpdates }, ...directUpdates } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Update onboarding restaurant error:', error);
    res.status(500).json({ error: 'Failed to update restaurant' });
  }
});

// POST /api/onboarding/restaurant/:id/complete — Finalize onboarding
router.post('/restaurant/:id/complete', requireAuth, async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.id;
    const teamMemberId = req.user!.teamMemberId;

    if (!await verifyOwnerAccess(teamMemberId, restaurantId)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, name: true, slug: true, merchantProfile: true },
    });

    if (!restaurant) {
      res.status(404).json({ error: 'Restaurant not found' });
      return;
    }

    const currentProfile = (restaurant.merchantProfile as Record<string, unknown>) ?? {};
    const menuTemplateId = currentProfile['menuTemplateId'] as string | undefined;
    const ownerPin = currentProfile['ownerPin'] as { pin?: string; displayName?: string } | undefined;
    const primaryVertical = (currentProfile['primaryVertical'] as string) ?? 'food_and_drink';
    const defaultDeviceMode = (currentProfile['defaultDeviceMode'] as string) ?? 'full_service';

    await prisma.$transaction(async (tx) => {
      // Seed default permission sets
      const createdPermSets = await seedDefaultPermissionSets(tx, restaurantId);
      const fullAccessSetId = createdPermSets.find(s => s.name === 'Full Access')?.id ?? null;

      // Create owner PIN if provided
      if (ownerPin?.pin) {
        const hashedPin = await authService.hashPin(ownerPin.pin);
        await createOwnerPin(tx, restaurantId, teamMemberId, { pin: hashedPin, displayName: ownerPin.displayName }, fullAccessSetId);
      }

      // Apply menu template if specified
      if (menuTemplateId) {
        await applyMenuTemplate(tx, restaurantId, menuTemplateId);
      }

      // Mark onboarding complete
      const finalProfile = {
        ...currentProfile,
        onboardingComplete: true,
        defaultDeviceMode,
        primaryVertical,
        verticals: currentProfile['verticals'] ?? [primaryVertical],
        enabledModules: VERTICAL_MODULES[primaryVertical] ?? [],
        menuTemplateId: undefined,
        ownerPin: undefined,
      };
      delete finalProfile['menuTemplateId'];
      delete finalProfile['ownerPin'];

      await tx.restaurant.update({
        where: { id: restaurantId },
        data: { merchantProfile: finalProfile as any, active: true }, // eslint-disable-line @typescript-eslint/no-explicit-any
      });
    });

    res.status(200).json({ restaurantId: restaurant.id, name: restaurant.name, slug: restaurant.slug });
  } catch (error) {
    console.error('Complete onboarding error:', error);
    res.status(500).json({ error: 'Failed to complete onboarding' });
  }
});

// GET /api/onboarding/restaurant/:id/status — Get onboarding status
router.get('/restaurant/:id/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.id;
    const teamMemberId = req.user!.teamMemberId;

    const access = await prisma.userRestaurantAccess.findUnique({
      where: { teamMemberId_restaurantId: { teamMemberId, restaurantId } },
    });

    if (!access) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, name: true, merchantProfile: true },
    });

    if (!restaurant) {
      res.status(404).json({ error: 'Restaurant not found' });
      return;
    }

    const profile = restaurant.merchantProfile as Record<string, unknown> | null;
    const onboardingComplete = profile?.['onboardingComplete'] === true;

    res.json({ restaurantId: restaurant.id, onboardingComplete, businessName: restaurant.name });
  } catch (error) {
    console.error('Get onboarding status error:', error);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

// ============ Onboarding Create (Legacy) ============

async function verifyOwnerAccess(teamMemberId: string, restaurantId: string): Promise<boolean> {
  const access = await prisma.userRestaurantAccess.findUnique({
    where: { teamMemberId_restaurantId: { teamMemberId, restaurantId } },
  });
  return access?.role === 'owner';
}

interface ParsedAddress { street: string; city: string; state: string; zip: string }

function parseAddress(address: Record<string, unknown> | undefined): ParsedAddress | null {
  const street = (address?.street as string | undefined)?.trim() ?? '';
  const city = (address?.city as string | undefined)?.trim() ?? '';
  const state = (address?.state as string | undefined)?.trim() ?? '';
  const zip = (address?.zip as string | undefined)?.trim() ?? '';
  if (!street || !city || !state || !zip) return null;
  return { street, city, state, zip };
}

async function loadMerchantProfile(
  restaurantId: string,
): Promise<Record<string, unknown> | null> {
  const existing = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { merchantProfile: true },
  });
  if (!existing) return null;
  return (existing.merchantProfile as Record<string, unknown>) ?? {};
}

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function seedDefaultPermissionSets(
  tx: TxClient,
  restaurantId: string,
): Promise<{ id: string; name: string }[]> {
  const createdPermSets: { id: string; name: string }[] = [];
  for (const def of DEFAULT_PERMISSION_SETS) {
    const ps = await tx.permissionSet.create({
      data: {
        restaurantId,
        name: def.name,
        permissions: def.permissions,
        isDefault: true,
      },
    });
    createdPermSets.push({ id: ps.id, name: ps.name });
  }
  return createdPermSets;
}

async function applyMenuTemplate(
  tx: TxClient,
  restaurantId: string,
  menuTemplateId: string,
): Promise<void> {
  const template: MenuTemplate | undefined = MENU_TEMPLATES.find(t => t.id === menuTemplateId);
  if (!template) return;

  const createdItemsByName = new Map<string, string>();

  for (const cat of template.categories) {
    const category = await tx.menuCategory.create({
      data: {
        restaurantId,
        name: cat.name,
        displayOrder: cat.sortOrder,
        active: true,
      },
    });

    for (const item of cat.items) {
      const createdItem = await tx.menuItem.create({
        data: {
          restaurantId,
          categoryId: category.id,
          name: item.name,
          description: item.description ?? '',
          price: item.price,
          displayOrder: item.sortOrder,
          prepTimeMinutes: item.prepTimeMinutes,
          available: true,
        },
      });
      createdItemsByName.set(item.name, createdItem.id);
    }
  }

  for (const mg of template.modifierGroups) {
    const modifierGroup = await tx.modifierGroup.create({
      data: {
        restaurantId,
        name: mg.name,
        required: mg.required,
        multiSelect: mg.multiSelect,
        minSelections: mg.minSelections,
        maxSelections: mg.maxSelections,
        displayOrder: mg.sortOrder,
        active: true,
      },
    });

    for (const mod of mg.modifiers) {
      await tx.modifier.create({
        data: {
          modifierGroupId: modifierGroup.id,
          name: mod.name,
          priceAdjustment: mod.priceAdjustment,
          isDefault: mod.isDefault,
          displayOrder: mod.sortOrder,
          available: true,
        },
      });
    }

    const targetItemNames = mg.applyTo === 'all'
      ? [...createdItemsByName.keys()]
      : mg.applyTo;

    let linkOrder = 1;
    for (const itemName of targetItemNames) {
      const itemId = createdItemsByName.get(itemName);
      if (itemId) {
        await tx.menuItemModifierGroup.create({
          data: {
            menuItemId: itemId,
            modifierGroupId: modifierGroup.id,
            displayOrder: linkOrder++,
          },
        });
      }
    }
  }
}

async function createOwnerPin(
  tx: TxClient,
  restaurantId: string,
  teamMemberId: string,
  ownerPin: { pin: string; displayName?: string },
  fullAccessSetId: string | null,
): Promise<void> {
  await tx.teamMember.update({
    where: { id: teamMemberId },
    data: { permissionSetId: fullAccessSetId },
  });

  await tx.teamMemberJob.create({
    data: {
      teamMemberId,
      jobTitle: 'Owner',
      hourlyRate: 0,
      isTipEligible: false,
      isPrimary: true,
      overtimeEligible: false,
    },
  });

  await tx.staffPin.create({
    data: {
      restaurantId,
      teamMemberId,
      pin: ownerPin.pin,
      name: ownerPin.displayName ?? 'Owner',
      role: 'team_member',
    },
  });
}

// --- Helpers for POST /create ---

function buildMerchantProfile(body: Record<string, unknown>): Record<string, unknown> {
  const { businessName, address, verticals, primaryVertical, complexity, defaultDeviceMode, taxLocale, businessHours, businessCategory } = body;
  return {
    id: crypto.randomUUID(),
    businessName,
    address: address ?? null,
    verticals: verticals ?? ['food_and_drink'],
    primaryVertical: primaryVertical ?? 'food_and_drink',
    complexity: complexity ?? 'full',
    enabledModules: VERTICAL_MODULES[(primaryVertical as string) ?? 'food_and_drink'] ?? [],
    defaultDeviceMode: defaultDeviceMode ?? 'full_service',
    taxLocale: taxLocale ?? { taxRate: 0, taxInclusive: false, currency: 'USD', defaultLanguage: 'en' },
    businessHours: businessHours ?? [],
    businessCategory: businessCategory ?? null,
    onboardingComplete: true,
    createdAt: new Date().toISOString(),
  };
}

async function createOrReuseTeamMember(
  tx: TxClient,
  restaurantId: string,
  existingMember: { id: string } | null,
  ownerEmail: string,
  ownerPassword: string,
  ownerPin: { displayName?: string } | undefined,
): Promise<string> {
  if (existingMember) {
    await tx.teamMember.update({
      where: { id: existingMember.id },
      data: { restaurantId },
    });
    return existingMember.id;
  }

  const hashedPassword = await authService.hashPassword(ownerPassword);
  const ownerDisplayName = ownerPin?.displayName ?? 'Owner';
  const member = await tx.teamMember.create({
    data: {
      email: ownerEmail,
      passwordHash: hashedPassword,
      firstName: ownerPin?.displayName?.split(' ')[0] ?? 'Owner',
      lastName: ownerPin?.displayName?.split(' ').slice(1).join(' ') ?? '',
      displayName: ownerDisplayName,
      role: 'owner',
      isActive: true,
      restaurantId,
    },
  });
  return member.id;
}

function buildOnboardingResponse(
  restaurant: { id: string; name: string; slug: string },
  deviceId: string,
  token: string | null,
): Record<string, unknown> {
  return {
    restaurantId: restaurant.id,
    deviceId,
    token,
    restaurant: { id: restaurant.id, name: restaurant.name, slug: restaurant.slug },
  };
}

// POST /api/onboarding/create
// Supports two flows:
// 1. Authenticated (JWT present from /signup) — uses existing TeamMember, creates restaurant + links
// 2. Unauthenticated (ownerEmail + ownerPassword) — creates TeamMember + restaurant in one transaction
router.post('/create', optionalAuth, async (req: Request, res: Response) => {
  try {
    const {
      businessName, address, defaultDeviceMode, taxLocale, businessHours,
      menuTemplateId, ownerPin, ownerEmail, ownerPassword,
    } = req.body;

    if (!businessName) {
      res.status(400).json({ error: 'Business name is required' });
      return;
    }

    const isAuthenticated = !!req.user;

    if (!isAuthenticated && (!ownerEmail || !ownerPassword)) {
      res.status(400).json({ error: 'Business name, owner email, and password are required' });
      return;
    }

    const parsedAddr = parseAddress(address as Record<string, unknown> | undefined);
    if (!parsedAddr) {
      res.status(400).json({ error: 'Address, city, state, and zip are required' });
      return;
    }
    const { street, city: addrCity, state: addrState, zip: addrZip } = parsedAddr;

    let existingMember: { id: string; email: string | null; firstName: string | null; lastName: string | null } | null = null;
    if (isAuthenticated) {
      existingMember = await prisma.teamMember.findUnique({
        where: { id: req.user!.teamMemberId },
        select: { id: true, email: true, firstName: true, lastName: true },
      });
      if (!existingMember) {
        res.status(401).json({ error: 'Authenticated user not found' });
        return;
      }
    }

    const slug = businessName
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replaceAll(/^-|-$/g, '');

    const result = await prisma.$transaction(async (tx) => {
      const ownerEmailForRestaurant = existingMember?.email ?? ownerEmail ?? '';
      if (!ownerEmailForRestaurant) {
        throw new Error('Owner email is required to create a restaurant');
      }

      const restaurant = await tx.restaurant.create({
        data: {
          name: businessName,
          slug: `${slug}-${Date.now().toString(36)}`,
          email: ownerEmailForRestaurant,
          address: street, city: addrCity, state: addrState, zip: addrZip,
          phone: address?.phone ?? '',
          taxRate: (taxLocale?.taxRate ?? 0) / 100,
          merchantProfile: buildMerchantProfile(req.body) as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- Prisma Json field
          businessHours: businessHours ?? null,
          active: true,
        },
      });

      const teamMemberId = await createOrReuseTeamMember(
        tx, restaurant.id, existingMember, ownerEmail, ownerPassword, ownerPin,
      );

      await tx.userRestaurantAccess.create({
        data: { teamMemberId, restaurantId: restaurant.id, role: 'owner' },
      });

      const createdPermSets = await seedDefaultPermissionSets(tx, restaurant.id);
      const fullAccessSetId = createdPermSets.find(s => s.name === 'Full Access')?.id ?? null;

      if (ownerPin?.pin) {
        await createOwnerPin(tx, restaurant.id, teamMemberId, ownerPin, fullAccessSetId);
      }

      const device = await tx.device.create({
        data: {
          restaurantId: restaurant.id, deviceName: 'Browser', deviceType: 'terminal',
          posMode: defaultDeviceMode ?? 'full_service', status: 'active',
          pairedAt: new Date(), hardwareInfo: { platform: 'Browser' },
        },
      });

      if (menuTemplateId) {
        await applyMenuTemplate(tx, restaurant.id, menuTemplateId);
      }

      return { restaurant, teamMemberId, device };
    });

    if (isAuthenticated) {
      res.status(201).json(buildOnboardingResponse(result.restaurant, result.device.id, null));
      return;
    }

    const loginResult = await authService.loginUser(ownerEmail, ownerPassword, 'Onboarding Wizard');
    const token = loginResult.success ? loginResult.token : null;
    res.status(201).json(buildOnboardingResponse(result.restaurant, result.device.id, token));
  } catch (error) {
    console.error('Onboarding create error:', error);
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      res.status(409).json({ error: 'An account with this email already exists' });
      return;
    }
    res.status(500).json({ error: 'Failed to create account' });
  }
});

export default router;
