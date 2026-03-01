import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// ============ Primary Categories CRUD ============

/**
 * GET /:merchantId/primary-categories
 * Get all primary categories for a restaurant with their subcategory counts
 */
router.get('/:merchantId/primary-categories', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const { lang } = req.query;

    const categories = await prisma.primaryCategory.findMany({
      where: { restaurantId, active: true },
      orderBy: { displayOrder: 'asc' },
      include: {
        menuCategories: {
          where: { active: true },
          orderBy: { displayOrder: 'asc' },
          select: { 
            id: true, 
            name: true, 
            nameEn: true,
            displayOrder: true
          }
        }
      }
    });

    const result = categories.map(cat => ({
      id: cat.id,
      slug: cat.slug,
      name: lang === 'en' && cat.nameEn ? cat.nameEn : cat.name,
      nameEs: cat.name,
      nameEn: cat.nameEn,
      icon: cat.icon,
      displayOrder: cat.displayOrder,
      subcategoryCount: cat.menuCategories.length,
      subcategories: cat.menuCategories.map(sub => ({
        id: sub.id,
        name: lang === 'en' && sub.nameEn ? sub.nameEn : sub.name,
        nameEs: sub.name,
        nameEn: sub.nameEn
      }))
    }));

    res.json(result);
  } catch (error) {
    console.error('Error fetching primary categories:', error);
    res.status(500).json({ error: 'Failed to fetch primary categories' });
  }
});

/**
 * POST /:merchantId/primary-categories
 * Create a new primary category
 */
router.post('/:merchantId/primary-categories', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const { slug, name, nameEn, icon } = req.body;

    if (!slug || !name) {
      res.status(400).json({ error: 'slug and name are required' });
      return;
    }

    const maxOrder = await prisma.primaryCategory.aggregate({
      where: { restaurantId },
      _max: { displayOrder: true }
    });

    const category = await prisma.primaryCategory.create({
      data: {
        restaurantId,
        slug: slug.toLowerCase().replace(/\s+/g, '-'),
        name,
        nameEn,
        icon,
        displayOrder: (maxOrder._max.displayOrder || 0) + 1
      }
    });

    res.status(201).json(category);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(400).json({ error: 'A primary category with this slug already exists' });
      return;
    }
    console.error('Error creating primary category:', error);
    res.status(500).json({ error: 'Failed to create primary category' });
  }
});

/**
 * PATCH /:merchantId/primary-categories/:categoryId
 * Update a primary category (rename, change icon, reorder, deactivate)
 */
router.patch('/:merchantId/primary-categories/:categoryId', async (req: Request, res: Response) => {
  try {
    const { categoryId } = req.params;
    const { slug, name, nameEn, icon, displayOrder, active } = req.body;

    const category = await prisma.primaryCategory.update({
      where: { id: categoryId },
      data: {
        ...(slug !== undefined && { slug: slug.toLowerCase().replace(/\s+/g, '-') }),
        ...(name !== undefined && { name }),
        ...(nameEn !== undefined && { nameEn }),
        ...(icon !== undefined && { icon }),
        ...(displayOrder !== undefined && { displayOrder }),
        ...(active !== undefined && { active })
      }
    });

    res.json(category);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(400).json({ error: 'A primary category with this slug already exists' });
      return;
    }
    console.error('Error updating primary category:', error);
    res.status(500).json({ error: 'Failed to update primary category' });
  }
});

/**
 * DELETE /:merchantId/primary-categories/:categoryId
 * Delete a primary category (subcategories are unlinked, not deleted)
 */
router.delete('/:merchantId/primary-categories/:categoryId', async (req: Request, res: Response) => {
  try {
    const { categoryId } = req.params;

    // Unlink subcategories first (set their primaryCategoryId to null)
    await prisma.menuCategory.updateMany({
      where: { primaryCategoryId: categoryId },
      data: { primaryCategoryId: null }
    });

    await prisma.primaryCategory.delete({
      where: { id: categoryId }
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting primary category:', error);
    res.status(500).json({ error: 'Failed to delete primary category' });
  }
});

/**
 * POST /:merchantId/primary-categories/reorder
 * Reorder primary categories
 */
router.post('/:merchantId/primary-categories/reorder', async (req: Request, res: Response) => {
  try {
    const { order } = req.body; // [{ id: 'xxx', displayOrder: 0 }, ...]

    if (!Array.isArray(order)) {
      res.status(400).json({ error: 'order must be an array' });
      return;
    }

    for (const item of order) {
      await prisma.primaryCategory.update({
        where: { id: item.id },
        data: { displayOrder: item.displayOrder }
      });
    }

    res.json({ success: true, updated: order.length });
  } catch (error) {
    console.error('Error reordering primary categories:', error);
    res.status(500).json({ error: 'Failed to reorder primary categories' });
  }
});

// ============ Subcategory Assignment ============

/**
 * PATCH /:merchantId/menu/categories/:categoryId/assign
 * Assign a subcategory to a primary category (or unassign with null)
 */
router.patch('/:merchantId/menu/categories/:categoryId/assign', async (req: Request, res: Response) => {
  try {
    const { categoryId } = req.params;
    const { primaryCategoryId } = req.body; // null to unassign

    const category = await prisma.menuCategory.update({
      where: { id: categoryId },
      data: { primaryCategoryId }
    });

    res.json(category);
  } catch (error) {
    console.error('Error assigning category:', error);
    res.status(500).json({ error: 'Failed to assign category' });
  }
});

/**
 * POST /:merchantId/primary-categories/:primaryCategoryId/assign-bulk
 * Bulk assign multiple subcategories to a primary category
 */
router.post('/:merchantId/primary-categories/:primaryCategoryId/assign-bulk', async (req: Request, res: Response) => {
  try {
    const { primaryCategoryId } = req.params;
    const { categoryIds } = req.body; // array of subcategory IDs

    if (!Array.isArray(categoryIds)) {
      res.status(400).json({ error: 'categoryIds must be an array' });
      return;
    }

    await prisma.menuCategory.updateMany({
      where: { id: { in: categoryIds } },
      data: { primaryCategoryId }
    });

    res.json({ success: true, assigned: categoryIds.length });
  } catch (error) {
    console.error('Error bulk assigning categories:', error);
    res.status(500).json({ error: 'Failed to bulk assign categories' });
  }
});

// ============ Hierarchical Menu Endpoint ============

/**
 * GET /:merchantId/menu/grouped
 * Get full menu grouped by primary category -> subcategory -> items
 * 
 * Response structure:
 * [
 *   {
 *     id: "primary-uuid",
 *     slug: "beverages",
 *     name: "Bebidas",
 *     icon: "🥤",
 *     subcategories: [
 *       {
 *         id: "sub-uuid",
 *         name: "Cerveza",
 *         items: [{ id, name, price, ... }]
 *       }
 *     ]
 *   }
 * ]
 */
router.get('/:merchantId/menu/grouped', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const { lang, includeUnavailable } = req.query;

    // Fetch primary categories with nested subcategories and items
    const primaryCategories = await prisma.primaryCategory.findMany({
      where: { restaurantId, active: true },
      orderBy: { displayOrder: 'asc' },
      include: {
        menuCategories: {
          where: { active: true },
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
        }
      }
    });

    // Also fetch any "orphan" subcategories (not assigned to any primary)
    const orphanCategories = await prisma.menuCategory.findMany({
      where: { 
        restaurantId, 
        active: true,
        primaryCategoryId: null 
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

    // Transform helper for menu items
    const transformItem = (item: any) => ({
      id: item.id,
      categoryId: item.categoryId,
      name: lang === 'en' && item.nameEn ? item.nameEn : item.name,
      nameEs: item.name,
      nameEn: item.nameEn,
      description: item.description,
      descriptionEn: item.descriptionEn,
      price: item.price,
      image: item.image,
      imageUrl: item.image,
      popular: item.popular,
      isActive: item.available !== false,
      available: item.available !== false,
      eightySixed: item.eightySixed ?? false,
      dietary: item.dietary,
      prepTimeMinutes: item.prepTimeMinutes,
      displayOrder: item.displayOrder ?? 0,
      sku: item.sku ?? null,
      modifierGroups: item.modifierGroups.map((mg: any) => ({
        id: mg.modifierGroup.id,
        name: lang === 'en' && mg.modifierGroup.nameEn ? mg.modifierGroup.nameEn : mg.modifierGroup.name,
        description: mg.modifierGroup.description,
        required: mg.modifierGroup.required,
        multiSelect: mg.modifierGroup.multiSelect,
        minSelections: mg.modifierGroup.minSelections,
        maxSelections: mg.modifierGroup.maxSelections,
        modifiers: mg.modifierGroup.modifiers.map((mod: any) => ({
          id: mod.id,
          name: lang === 'en' && mod.nameEn ? mod.nameEn : mod.name,
          priceAdjustment: mod.priceAdjustment,
          isDefault: mod.isDefault
        }))
      }))
    });

    // Transform helper for subcategories
    const transformSubcategory = (cat: any) => ({
      id: cat.id,
      name: lang === 'en' && cat.nameEn ? cat.nameEn : cat.name,
      nameEs: cat.name,
      nameEn: cat.nameEn,
      description: cat.description,
      descriptionEn: cat.descriptionEn,
      image: cat.image,
      displayOrder: cat.displayOrder ?? 0,
      isActive: cat.active !== false,
      items: cat.menuItems.map(transformItem)
    });

    // Build the grouped response
    const grouped = primaryCategories.map(pc => ({
      id: pc.id,
      slug: pc.slug,
      name: lang === 'en' && pc.nameEn ? pc.nameEn : pc.name,
      nameEs: pc.name,
      nameEn: pc.nameEn,
      icon: pc.icon,
      displayOrder: pc.displayOrder,
      subcategories: pc.menuCategories.map(transformSubcategory)
    }));

    // Handle orphan categories (no primary category assigned)
    if (orphanCategories.length > 0) {
      if (primaryCategories.length === 0) {
        // No primary categories exist (e.g. fresh onboarding) — return orphans
        // as flat top-level categories so the frontend receives MenuCategory[]
        // with items directly, instead of a nested wrapper.
        res.json(orphanCategories.map(transformSubcategory));
        return;
      }
      // Mix of primary and orphan — group orphans under "Other"
      grouped.push({
        id: 'uncategorized',
        slug: 'other',
        name: lang === 'en' ? 'Other' : 'Otros',
        nameEs: 'Otros',
        nameEn: 'Other',
        icon: '📋',
        displayOrder: 999,
        subcategories: orphanCategories.map(transformSubcategory)
      });
    }

    res.json(grouped);
  } catch (error) {
    console.error('Error fetching grouped menu:', error);
    res.status(500).json({ error: 'Failed to fetch grouped menu' });
  }
});

export default router;
