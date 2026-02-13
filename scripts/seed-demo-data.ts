/**
 * Master seed script for operational demo data
 * Populates Taipa restaurants with tables, inventory, customers, orders, and reservations
 *
 * Run: npx tsx scripts/seed-demo-data.ts
 */

import { PrismaClient } from '@prisma/client';
import { seedAuth } from './seed-auth';
import { seedTables } from './seed-tables';
import { seedInventory } from './seed-inventory';
import { seedCustomers } from './seed-customers';
import { seedOrders } from './seed-orders';
import { seedReservations } from './seed-reservations';

const prisma = new PrismaClient();

async function seedDemoData() {
  console.log('🌱 Starting demo data seed for Taipa restaurants...\n');

  // Find existing Taipa restaurants
  const restaurants = await prisma.restaurant.findMany({
    where: { slug: { in: ['taipa-kendall', 'taipa-coral-gables'] } },
    select: { id: true, slug: true },
  });

  if (restaurants.length === 0) {
    console.error('❌ No Taipa restaurants found! Run seed-taipa.ts first.');
    return;
  }

  console.log(`Found ${restaurants.length} Taipa restaurants:`);
  for (const r of restaurants) {
    console.log(`   ${r.slug} -> ${r.id}`);
  }

  const restaurantIds = restaurants.map(r => r.id);

  // Run seeds in dependency order
  // 0. Auth — restaurant group, users, access, PINs, stations
  await seedAuth();

  // 1. Tables, Inventory, Customers — no dependencies on each other
  await seedTables(restaurantIds);
  await seedInventory(restaurantIds);
  await seedCustomers(restaurantIds);

  // 2. Orders — needs menu items + customers + tables
  await seedOrders(restaurantIds);

  // 3. Reservations — needs customers + tables
  await seedReservations(restaurantIds);

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 SEED COMPLETE — Database Summary:');
  console.log('='.repeat(50));

  const counts = await Promise.all([
    prisma.restaurant.count(),
    prisma.user.count(),
    prisma.userRestaurantAccess.count(),
    prisma.staffPin.count(),
    prisma.station.count(),
    prisma.restaurantTable.count(),
    prisma.inventoryItem.count(),
    prisma.inventoryLog.count(),
    prisma.customer.count(),
    prisma.order.count(),
    prisma.orderItem.count(),
    prisma.reservation.count(),
    prisma.menuItem.count(),
    prisma.menuCategory.count(),
  ]);

  const labels = [
    'Restaurants', 'Users', 'Access Records', 'Staff PINs', 'Stations',
    'Tables', 'Inventory Items', 'Inventory Logs',
    'Customers', 'Orders', 'Order Items', 'Reservations',
    'Menu Items', 'Menu Categories',
  ];

  for (let i = 0; i < labels.length; i++) {
    console.log(`   ${labels[i].padEnd(20)} ${counts[i]}`);
  }

  console.log('\n✅ All demo data seeded successfully!');
}

seedDemoData()
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
