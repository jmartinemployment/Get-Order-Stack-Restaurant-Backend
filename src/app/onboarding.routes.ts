import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { MENU_TEMPLATES } from '../data/menu-templates';
import { authService } from '../services/auth.service';

const router = Router();
const prisma = new PrismaClient();

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

// GET /api/restaurant/:restaurantId/merchant-profile
router.get('/:restaurantId/merchant-profile', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
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

// PATCH /api/restaurant/:restaurantId/merchant-profile
router.patch('/:restaurantId/merchant-profile', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const updates = req.body;

    const existing = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { merchantProfile: true },
    });

    if (!existing) {
      res.status(404).json({ error: 'Restaurant not found' });
      return;
    }

    const currentProfile = (existing.merchantProfile as Record<string, unknown>) ?? {};
    const merged = { ...currentProfile, ...updates };

    const restaurant = await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { merchantProfile: merged },
      select: { merchantProfile: true },
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

// POST /api/restaurant/:restaurantId/apply-menu-template
router.post('/:restaurantId/apply-menu-template', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const { templateId } = req.body;

    const template = MENU_TEMPLATES.find(t => t.id === templateId);
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
          await tx.menuItem.create({
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

// POST /api/restaurant/:restaurantId/business-hours
router.post('/:restaurantId/business-hours', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
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

// ============ Onboarding Create ============

// POST /api/onboarding/create
router.post('/create', async (req: Request, res: Response) => {
  try {
    const {
      businessName,
      address,
      verticals,
      primaryVertical,
      complexity,
      defaultDeviceMode,
      taxLocale,
      businessHours,
      paymentProcessor,
      menuTemplateId,
      ownerPin,
      ownerEmail,
      ownerPassword,
    } = req.body;

    if (!businessName || !ownerEmail || !ownerPassword) {
      res.status(400).json({ error: 'Business name, owner email, and password are required' });
      return;
    }

    const slug = businessName
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replaceAll(/^-|-$/g, '');

    const result = await prisma.$transaction(async (tx) => {
      // Create restaurant
      const restaurant = await tx.restaurant.create({
        data: {
          name: businessName,
          slug: slug + '-' + Date.now().toString(36),
          address: address?.street ?? null,
          city: address?.city ?? null,
          state: address?.state ?? null,
          zip: address?.zip ?? null,
          phone: address?.phone ?? null,
          taxRate: (taxLocale?.taxRate ?? 0) / 100,
          merchantProfile: {
            id: crypto.randomUUID(),
            businessName,
            address: address ?? null,
            verticals: verticals ?? ['food_and_drink'],
            primaryVertical: primaryVertical ?? 'food_and_drink',
            complexity: complexity ?? 'full',
            enabledModules: [],
            defaultDeviceMode: defaultDeviceMode ?? 'full_service',
            taxLocale: taxLocale ?? { taxRate: 0, taxInclusive: false, currency: 'USD', defaultLanguage: 'en' },
            businessHours: businessHours ?? [],
            onboardingComplete: true,
            createdAt: new Date().toISOString(),
          },
          businessHours: businessHours ?? null,
          active: true,
        },
      });

      // Create user
      const hashedPassword = await authService.hashPassword(ownerPassword);
      const user = await tx.user.create({
        data: {
          email: ownerEmail,
          passwordHash: hashedPassword,
          firstName: ownerPin?.displayName?.split(' ')[0] ?? 'Owner',
          lastName: ownerPin?.displayName?.split(' ').slice(1).join(' ') ?? '',
          role: 'owner',
          isActive: true,
        },
      });

      // Create user-restaurant access
      await tx.userRestaurantAccess.create({
        data: {
          userId: user.id,
          restaurantId: restaurant.id,
          role: 'owner',
        },
      });

      // Create owner PIN
      if (ownerPin?.pin) {
        await tx.staffPin.create({
          data: {
            restaurantId: restaurant.id,
            pin: ownerPin.pin,
            name: ownerPin.displayName ?? 'Owner',
            role: 'owner',
          },
        });
      }

      // Apply menu template if selected
      if (menuTemplateId) {
        const template = MENU_TEMPLATES.find(t => t.id === menuTemplateId);
        if (template) {
          for (const cat of template.categories) {
            const category = await tx.menuCategory.create({
              data: {
                restaurantId: restaurant.id,
                name: cat.name,
                displayOrder: cat.sortOrder,
                active: true,
              },
            });

            for (const item of cat.items) {
              await tx.menuItem.create({
                data: {
                  restaurantId: restaurant.id,
                  categoryId: category.id,
                  name: item.name,
                  description: item.description ?? '',
                  price: item.price,
                  displayOrder: item.sortOrder,
                  prepTimeMinutes: item.prepTimeMinutes,
                  available: true,
                },
              });
            }
          }
        }
      }

      return { restaurant, user };
    });

    // Create session + JWT outside transaction (authService uses its own prisma)
    const loginResult = await authService.loginUser(ownerEmail, ownerPassword, 'Onboarding Wizard');

    if (!loginResult.success) {
      // Restaurant created but login failed — still return restaurant ID
      res.status(201).json({
        restaurantId: result.restaurant.id,
        token: null,
        restaurant: {
          id: result.restaurant.id,
          name: result.restaurant.name,
          slug: result.restaurant.slug,
        },
      });
      return;
    }

    res.status(201).json({
      restaurantId: result.restaurant.id,
      token: loginResult.token,
      restaurant: {
        id: result.restaurant.id,
        name: result.restaurant.name,
        slug: result.restaurant.slug,
      },
    });
    return;

    res.status(201).json(result);
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
