/**
 * Seed script for Restaurant Tables
 * Creates 12 tables per Taipa location (24 total)
 * Sections: Main Floor (tables 1-8) and Patio (P1-P4)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface TableDef {
  tableNumber: string;
  tableName: string;
  capacity: number;
  section: string;
  status: string;
  posX: number;
  posY: number;
}

const tables: TableDef[] = [
  // Main Floor — Tables 1-8
  { tableNumber: '1', tableName: 'Table 1', capacity: 2, section: 'Main Floor', status: 'available', posX: 100, posY: 100 },
  { tableNumber: '2', tableName: 'Table 2', capacity: 2, section: 'Main Floor', status: 'available', posX: 250, posY: 100 },
  { tableNumber: '3', tableName: 'Table 3', capacity: 4, section: 'Main Floor', status: 'occupied', posX: 400, posY: 100 },
  { tableNumber: '4', tableName: 'Table 4', capacity: 4, section: 'Main Floor', status: 'occupied', posX: 100, posY: 250 },
  { tableNumber: '5', tableName: 'Table 5', capacity: 4, section: 'Main Floor', status: 'reserved', posX: 250, posY: 250 },
  { tableNumber: '6', tableName: 'Table 6', capacity: 6, section: 'Main Floor', status: 'available', posX: 400, posY: 250 },
  { tableNumber: '7', tableName: 'Table 7', capacity: 6, section: 'Main Floor', status: 'dirty', posX: 100, posY: 400 },
  { tableNumber: '8', tableName: 'Table 8', capacity: 4, section: 'Main Floor', status: 'available', posX: 250, posY: 400 },
  // Patio — Tables P1-P4
  { tableNumber: 'P1', tableName: 'Patio 1', capacity: 4, section: 'Patio', status: 'available', posX: 550, posY: 100 },
  { tableNumber: 'P2', tableName: 'Patio 2', capacity: 6, section: 'Patio', status: 'occupied', posX: 550, posY: 250 },
  { tableNumber: 'P3', tableName: 'Patio 3', capacity: 8, section: 'Patio', status: 'available', posX: 550, posY: 400 },
  { tableNumber: 'P4', tableName: 'Patio 4', capacity: 4, section: 'Patio', status: 'reserved', posX: 700, posY: 100 },
];

export async function seedTables(restaurantIds: string[]) {
  console.log('\n🪑 Seeding tables...');

  for (const restaurantId of restaurantIds) {
    const existing = await prisma.restaurantTable.count({ where: { restaurantId } });
    if (existing > 0) {
      console.log(`   ⚠️  Tables already exist for restaurant ${restaurantId}, skipping...`);
      continue;
    }

    for (const table of tables) {
      await prisma.restaurantTable.create({
        data: {
          restaurantId,
          tableNumber: table.tableNumber,
          tableName: table.tableName,
          capacity: table.capacity,
          section: table.section,
          status: table.status,
          posX: table.posX,
          posY: table.posY,
        },
      });
    }
    console.log(`   ✅ Created ${tables.length} tables for restaurant ${restaurantId}`);
  }

  const total = await prisma.restaurantTable.count();
  console.log(`   📊 Total tables in database: ${total}`);
}

// Allow standalone execution
if (require.main === module) {
  (async () => {
    const restaurants = await prisma.restaurant.findMany({
      where: { slug: { in: ['taipa-kendall', 'taipa-coral-gables'] } },
      select: { id: true, slug: true },
    });
    console.log(`Found ${restaurants.length} Taipa restaurants`);
    await seedTables(restaurants.map(r => r.id));
  })()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
}
