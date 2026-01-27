import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function backupData() {
  const backupDir = path.join(__dirname, '../backups');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `backup-${timestamp}`);

  // Create backup directory
  if (!fs.existsSync(backupPath)) {
    fs.mkdirSync(backupPath, { recursive: true });
  }

  console.log(`📦 Backing up data to: ${backupPath}\n`);

  try {
    // Backup Restaurants
    const restaurants = await prisma.restaurant.findMany();
    fs.writeFileSync(
      path.join(backupPath, 'restaurants.json'),
      JSON.stringify(restaurants, null, 2)
    );
    console.log(`✅ Restaurants: ${restaurants.length} records`);

    // Backup Primary Categories
    const primaryCategories = await prisma.primaryCategory.findMany();
    fs.writeFileSync(
      path.join(backupPath, 'primary-categories.json'),
      JSON.stringify(primaryCategories, null, 2)
    );
    console.log(`✅ Primary Categories: ${primaryCategories.length} records`);

    // Backup Categories (MenuCategory in current schema)
    const categories = await prisma.menuCategory.findMany();
    fs.writeFileSync(
      path.join(backupPath, 'categories.json'),
      JSON.stringify(categories, null, 2)
    );
    console.log(`✅ Categories: ${categories.length} records`);

    // Backup Menu Items
    const menuItems = await prisma.menuItem.findMany();
    fs.writeFileSync(
      path.join(backupPath, 'menu-items.json'),
      JSON.stringify(menuItems, null, 2)
    );
    console.log(`✅ Menu Items: ${menuItems.length} records`);

    // Backup Modifier Groups
    const modifierGroups = await prisma.modifierGroup.findMany();
    fs.writeFileSync(
      path.join(backupPath, 'modifier-groups.json'),
      JSON.stringify(modifierGroups, null, 2)
    );
    console.log(`✅ Modifier Groups: ${modifierGroups.length} records`);

    // Backup Modifiers
    const modifiers = await prisma.modifier.findMany();
    fs.writeFileSync(
      path.join(backupPath, 'modifiers.json'),
      JSON.stringify(modifiers, null, 2)
    );
    console.log(`✅ Modifiers: ${modifiers.length} records`);

    // Backup Orders (if you want to keep order history)
    const orders = await prisma.order.findMany({
      include: {
        orderItems: {
          include: {
            modifiers: true
          }
        }
      }
    });
    fs.writeFileSync(
      path.join(backupPath, 'orders.json'),
      JSON.stringify(orders, null, 2)
    );
    console.log(`✅ Orders: ${orders.length} records`);

    // Backup Customers
    const customers = await prisma.customer.findMany();
    fs.writeFileSync(
      path.join(backupPath, 'customers.json'),
      JSON.stringify(customers, null, 2)
    );
    console.log(`✅ Customers: ${customers.length} records`);

    // Backup Tables
    const tables = await prisma.restaurantTable.findMany();
    fs.writeFileSync(
      path.join(backupPath, 'tables.json'),
      JSON.stringify(tables, null, 2)
    );
    console.log(`✅ Tables: ${tables.length} records`);

    console.log(`\n🎉 Backup complete! Files saved to: ${backupPath}`);

  } catch (error) {
    console.error('❌ Backup failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

backupData();
