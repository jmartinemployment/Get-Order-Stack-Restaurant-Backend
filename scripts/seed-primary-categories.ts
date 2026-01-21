/**
 * Seed script for Primary Categories
 * 
 * This script:
 * 1. Creates the 5 primary categories (Appetizers, Entrees, Beverages, Desserts, Sides)
 * 2. Assigns existing menu categories (subcategories) to the appropriate primary category
 * 
 * Run after the main seed-taipa.ts script and after running the migration.
 * 
 * Usage: npx ts-node scripts/seed-primary-categories.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Primary category definitions with bilingual names
const primaryCategories = [
  {
    slug: 'appetizers',
    name: 'Entradas',
    nameEn: 'Appetizers',
    icon: '🥗',
    displayOrder: 1,
  },
  {
    slug: 'entrees',
    name: 'Platos Fuertes',
    nameEn: 'Entrees',
    icon: '🍽️',
    displayOrder: 2,
  },
  {
    slug: 'beverages',
    name: 'Bebidas',
    nameEn: 'Beverages',
    icon: '🥤',
    displayOrder: 3,
  },
  {
    slug: 'desserts',
    name: 'Postres',
    nameEn: 'Desserts',
    icon: '🍰',
    displayOrder: 4,
  },
  {
    slug: 'sides',
    name: 'Acompañamientos',
    nameEn: 'Sides',
    icon: '🥕',
    displayOrder: 5,
  },
];

// Mapping of existing subcategory names to their primary category slug
const subcategoryAssignments: Record<string, string> = {
  // Appetizers
  'Para Empezar a Enamorarte': 'appetizers',
  'In Ceviche We Trust': 'appetizers',
  'Las Sopas': 'appetizers',
  
  // Entrees
  'Del Mar Su Encanto': 'entrees',
  'Grill Me Up': 'entrees',
  'Wok Me Up': 'entrees',
  'Saving The Tradition': 'entrees',
  'Veggie Lovers': 'entrees',
  
  // Beverages
  'Beverages': 'beverages',
  'Coffee & Tea': 'beverages',
  'Beer': 'beverages',
  'Wine': 'beverages',
  'Cocktails': 'beverages',
  
  // Desserts
  'Desserts': 'desserts',
  
  // Sides
  'Sides': 'sides',
};

async function seed() {
  console.log('🌱 Starting Primary Categories seed...\n');

  try {
    // Get all restaurants
    const restaurants = await prisma.restaurant.findMany();
    
    if (restaurants.length === 0) {
      console.log('❌ No restaurants found. Run seed-taipa.ts first.');
      return;
    }

    for (const restaurant of restaurants) {
      console.log(`\n📍 Processing restaurant: ${restaurant.name} (${restaurant.slug})`);

      // Create primary categories for this restaurant
      const primaryCategoryMap = new Map<string, string>();

      for (const pcData of primaryCategories) {
        // Check if already exists
        const existing = await prisma.primaryCategory.findFirst({
          where: {
            restaurantId: restaurant.id,
            slug: pcData.slug,
          },
        });

        if (existing) {
          console.log(`   ⚠️  Primary category '${pcData.nameEn}' already exists, using existing...`);
          primaryCategoryMap.set(pcData.slug, existing.id);
          continue;
        }

        const primaryCategory = await prisma.primaryCategory.create({
          data: {
            restaurantId: restaurant.id,
            ...pcData,
          },
        });

        primaryCategoryMap.set(pcData.slug, primaryCategory.id);
        console.log(`   ✅ Created primary category: ${pcData.nameEn} (${pcData.name})`);
      }

      // Assign existing subcategories to primary categories
      const menuCategories = await prisma.menuCategory.findMany({
        where: { restaurantId: restaurant.id },
      });

      let assignedCount = 0;
      let skippedCount = 0;

      for (const menuCategory of menuCategories) {
        const primarySlug = subcategoryAssignments[menuCategory.name];

        if (!primarySlug) {
          console.log(`   ⚠️  No mapping for subcategory: '${menuCategory.name}' - skipped`);
          skippedCount++;
          continue;
        }

        const primaryCategoryId = primaryCategoryMap.get(primarySlug);

        if (!primaryCategoryId) {
          console.log(`   ❌ Primary category not found for slug: '${primarySlug}'`);
          continue;
        }

        await prisma.menuCategory.update({
          where: { id: menuCategory.id },
          data: { primaryCategoryId },
        });

        assignedCount++;
      }

      console.log(`   📂 Assigned ${assignedCount} subcategories to primary categories`);
      if (skippedCount > 0) {
        console.log(`   ⚠️  Skipped ${skippedCount} subcategories (no mapping)`);
      }
    }

    console.log('\n✅ Primary Categories seed completed!\n');

    // Summary
    const primaryCategoryCount = await prisma.primaryCategory.count();
    const assignedSubcategoryCount = await prisma.menuCategory.count({
      where: { primaryCategoryId: { not: null } },
    });
    const unassignedSubcategoryCount = await prisma.menuCategory.count({
      where: { primaryCategoryId: null },
    });

    console.log('📊 Summary:');
    console.log(`   Primary Categories: ${primaryCategoryCount}`);
    console.log(`   Assigned Subcategories: ${assignedSubcategoryCount}`);
    console.log(`   Unassigned Subcategories: ${unassignedSubcategoryCount}`);

  } catch (error) {
    console.error('❌ Seed failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seed();
