import { PrismaClient } from '@prisma/client';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { toErrorMessage } from '../src/utils/errors';

const prisma = new PrismaClient();

// Specify the backup folder to restore from
const BACKUP_FOLDER = 'backup-2026-01-26T16-03-56-499Z';

const backupPath = path.join(__dirname, '../backups', BACKUP_FOLDER);

if (!fs.existsSync(backupPath)) {
  console.error(`❌ Backup folder not found: ${backupPath}`);
  process.exit(1);
}

console.log(`📦 Restoring data from: ${backupPath}\n`);

// --- Generic restore helper ---

interface RestoreConfig {
  fileName: string;
  label: string;
  findUnique: (id: string) => Promise<unknown>;
  create: (record: any) => Promise<unknown>;
}

async function restoreTable(config: RestoreConfig): Promise<void> {
  const filePath = path.join(backupPath, config.fileName);
  if (!fs.existsSync(filePath)) return;

  const records = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  let count = 0;
  for (const record of records) {
    const existing = await config.findUnique(record.id);
    if (!existing) {
      await config.create(record);
      count++;
    }
  }
  console.log(`✅ ${config.label}: ${count} new records (${records.length - count} already exist)`);
}

function optionalDate(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

// --- Data mappers for each table ---

function restaurantConfig(): RestoreConfig {
  return {
    fileName: 'restaurants.json',
    label: 'Restaurants',
    findUnique: (id) => prisma.restaurant.findUnique({ where: { id } }),
    create: (r) => prisma.restaurant.create({
      data: {
        id: r.id, slug: r.slug, name: r.name, description: r.description,
        logo: r.logo, phone: r.phone, email: r.email, address: r.address,
        city: r.city, state: r.state, zip: r.zip, location: r.location,
        latitude: r.latitude, longitude: r.longitude, cuisineType: r.cuisineType,
        tier: r.tier, monthlyRevenue: r.monthlyRevenue, deliveryPercent: r.deliveryPercent,
        platformsUsed: r.platformsUsed || [], posSystem: r.posSystem, taxRate: r.taxRate,
        deliveryEnabled: r.deliveryEnabled, pickupEnabled: r.pickupEnabled,
        dineInEnabled: r.dineInEnabled, active: r.active,
        createdAt: new Date(r.createdAt), updatedAt: new Date(r.updatedAt),
      },
    }),
  };
}

function primaryCategoryConfig(): RestoreConfig {
  return {
    fileName: 'primary-categories.json',
    label: 'Primary Categories',
    findUnique: (id) => prisma.primaryCategory.findUnique({ where: { id } }),
    create: (pc) => prisma.primaryCategory.create({
      data: {
        id: pc.id, restaurantId: pc.restaurantId, slug: pc.slug,
        name: pc.name, nameEn: pc.nameEn, icon: pc.icon,
        displayOrder: pc.displayOrder, active: pc.active,
        createdAt: new Date(pc.createdAt), updatedAt: new Date(pc.updatedAt),
      },
    }),
  };
}

function menuCategoryConfig(): RestoreConfig {
  return {
    fileName: 'categories.json',
    label: 'Categories',
    findUnique: (id) => prisma.menuCategory.findUnique({ where: { id } }),
    create: (cat) => prisma.menuCategory.create({
      data: {
        id: cat.id, restaurantId: cat.restaurantId, primaryCategoryId: cat.primaryCategoryId,
        slug: cat.slug, name: cat.name, nameEn: cat.nameEn,
        description: cat.description, descriptionEn: cat.descriptionEn,
        image: cat.image, displayOrder: cat.displayOrder, active: cat.active,
        createdAt: new Date(cat.createdAt), updatedAt: new Date(cat.updatedAt),
      },
    }),
  };
}

function menuItemConfig(): RestoreConfig {
  return {
    fileName: 'menu-items.json',
    label: 'Menu Items',
    findUnique: (id) => prisma.menuItem.findUnique({ where: { id } }),
    create: (item) => prisma.menuItem.create({
      data: {
        id: item.id, restaurantId: item.restaurantId, categoryId: item.categoryId,
        slug: item.slug, name: item.name, nameEn: item.nameEn,
        description: item.description, descriptionEn: item.descriptionEn,
        price: item.price, image: item.image, dietary: item.dietary || [],
        popular: item.popular, available: item.available,
        eightySixed: item.eightySixed, eightySixReason: item.eightySixReason,
        displayOrder: item.displayOrder, prepTimeMinutes: item.prepTimeMinutes,
        taxCategory: item.taxCategory, aiSuggestedPrice: item.aiSuggestedPrice,
        aiEstimatedCost: item.aiEstimatedCost, aiProfitMargin: item.aiProfitMargin,
        aiConfidence: item.aiConfidence,
        aiLastUpdated: optionalDate(item.aiLastUpdated),
        createdAt: new Date(item.createdAt), updatedAt: new Date(item.updatedAt),
      },
    }),
  };
}

function modifierGroupConfig(): RestoreConfig {
  return {
    fileName: 'modifier-groups.json',
    label: 'Modifier Groups',
    findUnique: (id) => prisma.modifierGroup.findUnique({ where: { id } }),
    create: (mg) => prisma.modifierGroup.create({
      data: {
        id: mg.id, restaurantId: mg.restaurantId, name: mg.name, nameEn: mg.nameEn,
        description: mg.description, descriptionEn: mg.descriptionEn,
        required: mg.required, multiSelect: mg.multiSelect,
        minSelections: mg.minSelections, maxSelections: mg.maxSelections,
        displayOrder: mg.displayOrder,
        createdAt: new Date(mg.createdAt), updatedAt: new Date(mg.updatedAt),
      },
    }),
  };
}

function modifierConfig(): RestoreConfig {
  return {
    fileName: 'modifiers.json',
    label: 'Modifiers',
    findUnique: (id) => prisma.modifier.findUnique({ where: { id } }),
    create: (mod) => prisma.modifier.create({
      data: {
        id: mod.id, modifierGroupId: mod.modifierGroupId, name: mod.name, nameEn: mod.nameEn,
        priceAdjustment: mod.priceAdjustment, isDefault: mod.isDefault,
        available: mod.available, displayOrder: mod.displayOrder,
        createdAt: new Date(mod.createdAt), updatedAt: new Date(mod.updatedAt),
      },
    }),
  };
}

function customerConfig(): RestoreConfig {
  return {
    fileName: 'customers.json',
    label: 'Customers',
    findUnique: (id) => prisma.customer.findUnique({ where: { id } }),
    create: (cust) => prisma.customer.create({
      data: {
        id: cust.id, restaurantId: cust.restaurantId, email: cust.email, phone: cust.phone,
        firstName: cust.firstName, lastName: cust.lastName,
        totalOrders: cust.totalOrders, totalSpent: cust.totalSpent,
        avgOrderValue: cust.avgOrderValue,
        lastOrderDate: optionalDate(cust.lastOrderDate),
        loyaltyPoints: cust.loyaltyPoints,
        createdAt: new Date(cust.createdAt), updatedAt: new Date(cust.updatedAt),
      },
    }),
  };
}

// --- Orders require special handling (nested items + modifiers) ---

async function restoreOrderItemModifiers(itemId: string, modifiers: any[]): Promise<void> {
  for (const mod of modifiers) {
    await prisma.orderItemModifier.create({
      data: {
        id: mod.id, orderItemId: itemId, modifierId: mod.modifierId,
        modifierName: mod.modifierName, priceAdjustment: mod.priceAdjustment,
      },
    });
  }
}

async function restoreOrderItems(orderId: string, orderItems: any[]): Promise<void> {
  for (const item of orderItems) {
    await prisma.orderItem.create({
      data: {
        id: item.id, orderId, menuItemId: item.menuItemId,
        menuItemName: item.menuItemName, quantity: item.quantity,
        unitPrice: item.unitPrice, modifiersPrice: item.modifiersPrice,
        totalPrice: item.totalPrice, specialInstructions: item.specialInstructions,
        status: item.status,
        sentToKitchenAt: optionalDate(item.sentToKitchenAt),
        completedAt: optionalDate(item.completedAt),
        createdAt: new Date(item.createdAt),
      },
    });

    if (item.modifiers && item.modifiers.length > 0) {
      await restoreOrderItemModifiers(item.id, item.modifiers);
    }
  }
}

async function restoreOrders(): Promise<void> {
  const filePath = path.join(backupPath, 'orders.json');
  if (!fs.existsSync(filePath)) return;

  const orders = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  let count = 0;
  for (const order of orders) {
    const existing = await prisma.order.findUnique({ where: { id: order.id } });
    if (existing) continue;

    await prisma.order.create({
      data: {
        id: order.id, restaurantId: order.restaurantId, customerId: order.customerId,
        tableId: order.tableId, serverId: order.serverId,
        orderNumber: order.orderNumber, orderType: order.orderType, orderSource: order.orderSource,
        status: order.status, subtotal: order.subtotal, tax: order.tax, tip: order.tip, total: order.total,
        paymentMethod: order.paymentMethod, paymentStatus: order.paymentStatus,
        stripePaymentIntentId: order.stripePaymentIntentId,
        specialInstructions: order.specialInstructions,
        scheduledTime: optionalDate(order.scheduledTime),
        deliveryAddress: order.deliveryAddress, deliveryLat: order.deliveryLat,
        deliveryLng: order.deliveryLng, deliveryFee: order.deliveryFee,
        deliveryProvider: order.deliveryProvider, deliveryTrackingUrl: order.deliveryTrackingUrl,
        sentToKitchenAt: optionalDate(order.sentToKitchenAt),
        confirmedAt: optionalDate(order.confirmedAt),
        preparingAt: optionalDate(order.preparingAt),
        readyAt: optionalDate(order.readyAt),
        completedAt: optionalDate(order.completedAt),
        cancelledAt: optionalDate(order.cancelledAt),
        cancelledBy: order.cancelledBy, cancellationReason: order.cancellationReason,
        createdAt: new Date(order.createdAt), updatedAt: new Date(order.updatedAt),
      },
    });
    count++;

    if (order.orderItems && order.orderItems.length > 0) {
      await restoreOrderItems(order.id, order.orderItems);
    }
  }
  console.log(`✅ Orders: ${count} new records (${orders.length - count} already exist)`);
}

// --- Main execution ---

try {
  // Restore in dependency order
  await restoreTable(restaurantConfig());
  await restoreTable(primaryCategoryConfig());
  await restoreTable(menuCategoryConfig());
  await restoreTable(menuItemConfig());
  await restoreTable(modifierGroupConfig());
  await restoreTable(modifierConfig());
  await restoreTable(customerConfig());
  await restoreOrders();

  console.log(`\n🎉 Restore complete!`);

} catch (error: unknown) {
  console.error('Script failed:', toErrorMessage(error));
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
