/**
 * Quick test script to verify menu items exist
 * Run with: npx tsx scripts/verify-menu.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Check specific restaurant
  const restaurantId = '96816829-87e3-4b6a-9f6c-613e4b3ab522';
  const menuItemId = '612ba048-5777-44fa-92ae-39092246af45';

  console.log('\n🔍 Checking restaurant...');
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { id: true, name: true, slug: true }
  });

  if (restaurant) {
    console.log(`✅ Restaurant found: ${restaurant.name} (${restaurant.slug})`);
  } else {
    console.log('❌ Restaurant NOT found!');
    console.log('\nAvailable restaurants:');
    const restaurants = await prisma.restaurant.findMany({
      select: { id: true, name: true, slug: true }
    });
    restaurants.forEach(r => console.log(`  - ${r.name} (${r.slug}): ${r.id}`));
    await prisma.$disconnect();
    return;
  }

  console.log('\n🔍 Checking menu item...');
  const menuItem = await prisma.menuItem.findUnique({
    where: { id: menuItemId },
    select: { id: true, name: true, price: true, restaurantId: true }
  });

  if (menuItem) {
    console.log(`✅ Menu item found: ${menuItem.name} ($${menuItem.price})`);
    if (menuItem.restaurantId !== restaurantId) {
      console.log(`⚠️  Warning: Menu item belongs to different restaurant: ${menuItem.restaurantId}`);
    }
  } else {
    console.log('❌ Menu item NOT found!');
    console.log('\nFirst 5 menu items for this restaurant:');
    const items = await prisma.menuItem.findMany({
      where: { restaurantId },
      take: 5,
      select: { id: true, name: true, price: true }
    });
    if (items.length === 0) {
      console.log('  No menu items found for this restaurant');
    } else {
      items.forEach(i => console.log(`  - ${i.name} ($${i.price}): ${i.id}`));
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);
