import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { MENU_TEMPLATES, type MenuTemplate } from '../data/menu-templates';
import { DEFAULT_PERMISSION_SETS } from '../data/default-permission-sets';
import { authService } from '../services/auth.service';
import { optionalAuth } from '../middleware/auth.middleware';

const router = Router();
const prisma = new PrismaClient();

// Vertical -> enabled modules mapping (must match frontend BUSINESS_VERTICAL_CATALOG in platform.model.ts)
const VERTICAL_MODULES: Record<string, string[]> = {
  food_and_drink: [
    'menu_management', 'table_management', 'kds', 'reservations',
    'online_ordering', 'inventory', 'marketing', 'loyalty',
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
// Supports two flows:
// 1. Authenticated (JWT present from /signup) — uses existing TeamMember, creates restaurant + links
// 2. Unauthenticated (ownerEmail + ownerPassword) — creates TeamMember + restaurant in one transaction
router.post('/create', optionalAuth, async (req: Request, res: Response) => {
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

    if (!businessName) {
      res.status(400).json({ error: 'Business name is required' });
      return;
    }

    // Determine user source: authenticated JWT or inline creation
    const isAuthenticated = !!req.user;

    if (!isAuthenticated && (!ownerEmail || !ownerPassword)) {
      res.status(400).json({ error: 'Business name, owner email, and password are required' });
      return;
    }

    // Look up authenticated team member if present
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
            enabledModules: VERTICAL_MODULES[primaryVertical ?? 'food_and_drink'] ?? [],
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

      // Create or reuse team member
      let teamMemberId: string;
      if (existingMember) {
        // Authenticated flow — update existing TeamMember's restaurantId
        teamMemberId = existingMember.id;
        await tx.teamMember.update({
          where: { id: existingMember.id },
          data: { restaurantId: restaurant.id },
        });
      } else {
        // Legacy flow — create TeamMember with passwordHash inline
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
            restaurantId: restaurant.id,
          },
        });
        teamMemberId = member.id;
      }

      // Create user-restaurant access
      await tx.userRestaurantAccess.create({
        data: {
          teamMemberId,
          restaurantId: restaurant.id,
          role: 'owner',
        },
      });

      // Seed default permission sets
      const createdPermSets: { id: string; name: string }[] = [];
      for (const def of DEFAULT_PERMISSION_SETS) {
        const ps = await tx.permissionSet.create({
          data: {
            restaurantId: restaurant.id,
            name: def.name,
            permissions: def.permissions,
            isDefault: true,
          },
        });
        createdPermSets.push({ id: ps.id, name: ps.name });
      }
      const fullAccessSetId = createdPermSets.find(s => s.name === 'Full Access')?.id ?? null;

      // Create owner PIN + link to the TeamMember with Full Access permission set
      if (ownerPin?.pin) {
        // Update the TeamMember with the Full Access permission set
        await tx.teamMember.update({
          where: { id: teamMemberId },
          data: {
            permissionSetId: fullAccessSetId,
          },
        });

        // Create a job for the owner
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
            restaurantId: restaurant.id,
            teamMemberId,
            pin: ownerPin.pin,
            name: ownerPin.displayName ?? 'Owner',
            role: 'team_member',
          },
        });
      }

      // Create browser device for the onboarding user
      const device = await tx.device.create({
        data: {
          restaurantId: restaurant.id,
          deviceName: 'Browser',
          deviceType: 'terminal',
          posMode: defaultDeviceMode ?? 'full_service',
          status: 'active',
          pairedAt: new Date(),
          hardwareInfo: { platform: 'Browser' },
        },
      });

      // Apply menu template if selected
      if (menuTemplateId) {
        const template: MenuTemplate | undefined = MENU_TEMPLATES.find(t => t.id === menuTemplateId);
        if (template) {
          // Track created items by name for modifier group assignment
          const createdItemsByName = new Map<string, string>();

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
              const createdItem = await tx.menuItem.create({
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
              createdItemsByName.set(item.name, createdItem.id);
            }
          }

          // Create modifier groups and link to items
          for (const mg of template.modifierGroups) {
            const modifierGroup = await tx.modifierGroup.create({
              data: {
                restaurantId: restaurant.id,
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

            // Link modifier group to applicable menu items
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
      }

      return { restaurant, teamMemberId, device };
    });

    // For authenticated flow, return existing token info (no re-login needed)
    if (isAuthenticated) {
      res.status(201).json({
        restaurantId: result.restaurant.id,
        deviceId: result.device.id,
        token: null, // Frontend already has a valid token
        restaurant: {
          id: result.restaurant.id,
          name: result.restaurant.name,
          slug: result.restaurant.slug,
        },
      });
      return;
    }

    // Legacy flow: create session + JWT
    const loginResult = await authService.loginUser(ownerEmail, ownerPassword, 'Onboarding Wizard');

    if (!loginResult.success) {
      res.status(201).json({
        restaurantId: result.restaurant.id,
        deviceId: result.device.id,
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
      deviceId: result.device.id,
      token: loginResult.token,
      restaurant: {
        id: result.restaurant.id,
        name: result.restaurant.name,
        slug: result.restaurant.slug,
      },
    });
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
