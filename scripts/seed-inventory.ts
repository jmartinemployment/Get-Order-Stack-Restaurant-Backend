/**
 * Seed script for Inventory Items + Logs
 * Creates ~15 inventory items per Taipa location (30 total)
 * With 3-5 inventory log entries per item over the last 7 days
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface InventoryDef {
  name: string;
  unit: string;
  currentStock: number;
  minStock: number;
  maxStock: number;
  costPerUnit: number;
  supplier: string;
  category: string;
  expiresInDays?: number; // null = no expiration tracking
}

const inventoryItems: InventoryDef[] = [
  // Proteins (perishable — short shelf life)
  { name: 'Chicken Breast', unit: 'lbs', currentStock: 50, minStock: 15, maxStock: 80, costPerUnit: 3.50, supplier: 'Sysco', category: 'protein', expiresInDays: 5 },
  { name: 'Beef (Lomo)', unit: 'lbs', currentStock: 30, minStock: 10, maxStock: 60, costPerUnit: 8.75, supplier: 'Sysco', category: 'protein', expiresInDays: 4 },
  { name: 'Shrimp (16/20)', unit: 'lbs', currentStock: 25, minStock: 8, maxStock: 50, costPerUnit: 9.50, supplier: 'Ocean Fresh', category: 'protein', expiresInDays: 3 },
  { name: 'Octopus', unit: 'lbs', currentStock: 5, minStock: 5, maxStock: 30, costPerUnit: 12, supplier: 'Ocean Fresh', category: 'protein', expiresInDays: -5 },
  { name: 'White Fish Fillet', unit: 'lbs', currentStock: 20, minStock: 8, maxStock: 40, costPerUnit: 6.25, supplier: 'Ocean Fresh', category: 'protein', expiresInDays: 1 },
  // Produce (perishable)
  { name: 'Tomatoes', unit: 'lbs', currentStock: 40, minStock: 10, maxStock: 60, costPerUnit: 1.75, supplier: 'Local Farm Co', category: 'produce', expiresInDays: 6 },
  { name: 'Red Onions', unit: 'lbs', currentStock: 35, minStock: 10, maxStock: 50, costPerUnit: 0.85, supplier: 'Local Farm Co', category: 'produce' },
  { name: 'Avocados', unit: 'units', currentStock: 8, minStock: 10, maxStock: 40, costPerUnit: 1.50, supplier: 'Local Farm Co', category: 'produce', expiresInDays: -3 },
  { name: 'Limes', unit: 'units', currentStock: 50, minStock: 20, maxStock: 100, costPerUnit: 0.25, supplier: 'Local Farm Co', category: 'produce', expiresInDays: 10 },
  { name: 'Cilantro', unit: 'bunches', currentStock: 10, minStock: 4, maxStock: 20, costPerUnit: 0.75, supplier: 'Local Farm Co', category: 'produce', expiresInDays: 2 },
  { name: 'Aji Amarillo Paste', unit: 'lbs', currentStock: 8, minStock: 3, maxStock: 15, costPerUnit: 5.50, supplier: 'Peru Imports', category: 'produce' },
  { name: 'Rocoto Paste', unit: 'lbs', currentStock: 2, minStock: 2, maxStock: 10, costPerUnit: 6, supplier: 'Peru Imports', category: 'produce', expiresInDays: -7 },
  // Staples (long shelf life — no expiration)
  { name: 'White Rice', unit: 'lbs', currentStock: 60, minStock: 20, maxStock: 100, costPerUnit: 0.65, supplier: 'Sysco', category: 'staple' },
  { name: 'Corn Tortillas', unit: 'units', currentStock: 200, minStock: 50, maxStock: 400, costPerUnit: 0.08, supplier: 'Sysco', category: 'staple', expiresInDays: 0 },
  { name: 'Cooking Oil', unit: 'gal', currentStock: 10, minStock: 3, maxStock: 20, costPerUnit: 4.25, supplier: 'Sysco', category: 'staple' },
];

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(Math.floor(Math.random() * 12) + 7, Math.floor(Math.random() * 60), 0, 0);
  return d;
}

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(23, 59, 59, 0);
  return d;
}

export async function seedInventory(restaurantIds: string[]) {
  console.log('\n📦 Seeding inventory...');

  for (const restaurantId of restaurantIds) {
    const existing = await prisma.inventoryItem.count({ where: { restaurantId } });

    // If items already exist, just update expiration dates
    if (existing > 0) {
      console.log(`   📝 Updating expiration dates for restaurant ${restaurantId}...`);
      for (const itemDef of inventoryItems) {
        if (itemDef.expiresInDays !== undefined) {
          await prisma.inventoryItem.updateMany({
            where: { restaurantId, name: itemDef.name },
            data: { expirationDate: daysFromNow(itemDef.expiresInDays) },
          });
        }
      }
      console.log(`   ✅ Updated expiration dates`);
      continue;
    }

    for (const itemDef of inventoryItems) {
      const item = await prisma.inventoryItem.create({
        data: {
          restaurantId,
          name: itemDef.name,
          unit: itemDef.unit,
          currentStock: itemDef.currentStock,
          minStock: itemDef.minStock,
          maxStock: itemDef.maxStock,
          costPerUnit: itemDef.costPerUnit,
          supplier: itemDef.supplier,
          category: itemDef.category,
          lastRestocked: daysAgo(2),
          lastCountDate: daysAgo(1),
          expirationDate: itemDef.expiresInDays !== undefined ? daysFromNow(itemDef.expiresInDays) : null,
        },
      });

      // Create 3-5 log entries per item over the last 7 days
      const logCount = 3 + Math.floor(Math.random() * 3);
      let runningStock = itemDef.maxStock;

      for (let i = 0; i < logCount; i++) {
        const day = 7 - Math.floor((i / logCount) * 7);
        const isRestock = i === 0;
        const changeAmount = isRestock
          ? Math.round(itemDef.maxStock * 0.5)
          : -Math.round(Math.random() * (itemDef.maxStock * 0.15) + 1);

        const previousStock = runningStock;
        const newStock = Math.max(0, runningStock + changeAmount);
        runningStock = newStock;

        await prisma.inventoryLog.create({
          data: {
            inventoryItemId: item.id,
            previousStock,
            newStock,
            changeAmount,
            reason: isRestock ? 'Weekly restock delivery' : 'Daily kitchen usage',
            createdBy: isRestock ? 'manager' : 'kitchen',
            createdAt: daysAgo(day),
          },
        });
      }
    }
    console.log(`   ✅ Created ${inventoryItems.length} inventory items with logs for restaurant ${restaurantId}`);
  }

  const total = await prisma.inventoryItem.count();
  const logTotal = await prisma.inventoryLog.count();
  console.log(`   📊 Total inventory items: ${total}, logs: ${logTotal}`);
}

// Allow standalone execution
if (require.main === module) {
  (async () => {
    const restaurants = await prisma.restaurant.findMany({
      where: { slug: { in: ['taipa-kendall', 'taipa-coral-gables'] } },
      select: { id: true, slug: true },
    });
    console.log(`Found ${restaurants.length} Taipa restaurants`);
    await seedInventory(restaurants.map(r => r.id));
  })()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
}
