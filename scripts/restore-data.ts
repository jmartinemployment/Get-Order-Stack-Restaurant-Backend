import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// Specify the backup folder to restore from
const BACKUP_FOLDER = 'backup-2026-01-26T16-03-56-499Z';

async function restoreData() {
  const backupPath = path.join(__dirname, '../backups', BACKUP_FOLDER);

  if (!fs.existsSync(backupPath)) {
    console.error(`❌ Backup folder not found: ${backupPath}`);
    process.exit(1);
  }

  console.log(`📦 Restoring data from: ${backupPath}\n`);

  try {
    // 1. Restore Restaurants (must be first - other tables reference it)
    const restaurantsFile = path.join(backupPath, 'restaurants.json');
    if (fs.existsSync(restaurantsFile)) {
      const restaurants = JSON.parse(fs.readFileSync(restaurantsFile, 'utf-8'));
      let count = 0;
      for (const r of restaurants) {
        const existing = await prisma.restaurant.findUnique({ where: { id: r.id } });
        if (!existing) {
          await prisma.restaurant.create({
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
          });
          count++;
        }
      }
      console.log(`✅ Restaurants: ${count} new records (${restaurants.length - count} already exist)`);
    }

    // 2. Restore Primary Categories
    const primaryCategoriesFile = path.join(backupPath, 'primary-categories.json');
    if (fs.existsSync(primaryCategoriesFile)) {
      const items = JSON.parse(fs.readFileSync(primaryCategoriesFile, 'utf-8'));
      let count = 0;
      for (const pc of items) {
        const existing = await prisma.primaryCategory.findUnique({ where: { id: pc.id } });
        if (!existing) {
          await prisma.primaryCategory.create({
            data: {
              id: pc.id, restaurantId: pc.restaurantId, slug: pc.slug,
              name: pc.name, nameEn: pc.nameEn, icon: pc.icon,
              displayOrder: pc.displayOrder, active: pc.active,
              createdAt: new Date(pc.createdAt), updatedAt: new Date(pc.updatedAt),
            },
          });
          count++;
        }
      }
      console.log(`✅ Primary Categories: ${count} new records (${items.length - count} already exist)`);
    }

    // 3. Restore Categories (MenuCategory)
    const categoriesFile = path.join(backupPath, 'categories.json');
    if (fs.existsSync(categoriesFile)) {
      const items = JSON.parse(fs.readFileSync(categoriesFile, 'utf-8'));
      let count = 0;
      for (const cat of items) {
        const existing = await prisma.menuCategory.findUnique({ where: { id: cat.id } });
        if (!existing) {
          await prisma.menuCategory.create({
            data: {
              id: cat.id, restaurantId: cat.restaurantId, primaryCategoryId: cat.primaryCategoryId,
              slug: cat.slug, name: cat.name, nameEn: cat.nameEn,
              description: cat.description, descriptionEn: cat.descriptionEn,
              image: cat.image, displayOrder: cat.displayOrder, active: cat.active,
              createdAt: new Date(cat.createdAt), updatedAt: new Date(cat.updatedAt),
            },
          });
          count++;
        }
      }
      console.log(`✅ Categories: ${count} new records (${items.length - count} already exist)`);
    }

    // 4. Restore Menu Items
    const menuItemsFile = path.join(backupPath, 'menu-items.json');
    if (fs.existsSync(menuItemsFile)) {
      const items = JSON.parse(fs.readFileSync(menuItemsFile, 'utf-8'));
      let count = 0;
      for (const item of items) {
        const existing = await prisma.menuItem.findUnique({ where: { id: item.id } });
        if (!existing) {
          await prisma.menuItem.create({
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
              aiLastUpdated: item.aiLastUpdated ? new Date(item.aiLastUpdated) : null,
              createdAt: new Date(item.createdAt), updatedAt: new Date(item.updatedAt),
            },
          });
          count++;
        }
      }
      console.log(`✅ Menu Items: ${count} new records (${items.length - count} already exist)`);
    }

    // 5. Restore Modifier Groups
    const modifierGroupsFile = path.join(backupPath, 'modifier-groups.json');
    if (fs.existsSync(modifierGroupsFile)) {
      const items = JSON.parse(fs.readFileSync(modifierGroupsFile, 'utf-8'));
      let count = 0;
      for (const mg of items) {
        const existing = await prisma.modifierGroup.findUnique({ where: { id: mg.id } });
        if (!existing) {
          await prisma.modifierGroup.create({
            data: {
              id: mg.id, restaurantId: mg.restaurantId, name: mg.name, nameEn: mg.nameEn,
              description: mg.description, descriptionEn: mg.descriptionEn,
              required: mg.required, multiSelect: mg.multiSelect,
              minSelections: mg.minSelections, maxSelections: mg.maxSelections,
              displayOrder: mg.displayOrder,
              createdAt: new Date(mg.createdAt), updatedAt: new Date(mg.updatedAt),
            },
          });
          count++;
        }
      }
      console.log(`✅ Modifier Groups: ${count} new records (${items.length - count} already exist)`);
    }

    // 6. Restore Modifiers
    const modifiersFile = path.join(backupPath, 'modifiers.json');
    if (fs.existsSync(modifiersFile)) {
      const items = JSON.parse(fs.readFileSync(modifiersFile, 'utf-8'));
      let count = 0;
      for (const mod of items) {
        const existing = await prisma.modifier.findUnique({ where: { id: mod.id } });
        if (!existing) {
          await prisma.modifier.create({
            data: {
              id: mod.id, modifierGroupId: mod.modifierGroupId, name: mod.name, nameEn: mod.nameEn,
              priceAdjustment: mod.priceAdjustment, isDefault: mod.isDefault,
              available: mod.available, displayOrder: mod.displayOrder,
              createdAt: new Date(mod.createdAt), updatedAt: new Date(mod.updatedAt),
            },
          });
          count++;
        }
      }
      console.log(`✅ Modifiers: ${count} new records (${items.length - count} already exist)`);
    }

    // 7. Restore Customers
    const customersFile = path.join(backupPath, 'customers.json');
    if (fs.existsSync(customersFile)) {
      const items = JSON.parse(fs.readFileSync(customersFile, 'utf-8'));
      let count = 0;
      for (const cust of items) {
        const existing = await prisma.customer.findUnique({ where: { id: cust.id } });
        if (!existing) {
          await prisma.customer.create({
            data: {
              id: cust.id, restaurantId: cust.restaurantId, email: cust.email, phone: cust.phone,
              firstName: cust.firstName, lastName: cust.lastName,
              totalOrders: cust.totalOrders, totalSpent: cust.totalSpent,
              avgOrderValue: cust.avgOrderValue,
              lastOrderDate: cust.lastOrderDate ? new Date(cust.lastOrderDate) : null,
              loyaltyPoints: cust.loyaltyPoints,
              createdAt: new Date(cust.createdAt), updatedAt: new Date(cust.updatedAt),
            },
          });
          count++;
        }
      }
      console.log(`✅ Customers: ${count} new records (${items.length - count} already exist)`);
    }

    // 8. Restore Orders (with items and modifiers)
    const ordersFile = path.join(backupPath, 'orders.json');
    if (fs.existsSync(ordersFile)) {
      const orders = JSON.parse(fs.readFileSync(ordersFile, 'utf-8'));
      let count = 0;
      for (const order of orders) {
        const existing = await prisma.order.findUnique({ where: { id: order.id } });
        if (!existing) {
          await prisma.order.create({
            data: {
              id: order.id, restaurantId: order.restaurantId, customerId: order.customerId,
              tableId: order.tableId, serverId: order.serverId,
              orderNumber: order.orderNumber, orderType: order.orderType, orderSource: order.orderSource,
              status: order.status, subtotal: order.subtotal, tax: order.tax, tip: order.tip, total: order.total,
              paymentMethod: order.paymentMethod, paymentStatus: order.paymentStatus,
              stripePaymentIntentId: order.stripePaymentIntentId,
              specialInstructions: order.specialInstructions,
              scheduledTime: order.scheduledTime ? new Date(order.scheduledTime) : null,
              deliveryAddress: order.deliveryAddress, deliveryLat: order.deliveryLat,
              deliveryLng: order.deliveryLng, deliveryFee: order.deliveryFee,
              deliveryProvider: order.deliveryProvider, deliveryTrackingUrl: order.deliveryTrackingUrl,
              sentToKitchenAt: order.sentToKitchenAt ? new Date(order.sentToKitchenAt) : null,
              confirmedAt: order.confirmedAt ? new Date(order.confirmedAt) : null,
              preparingAt: order.preparingAt ? new Date(order.preparingAt) : null,
              readyAt: order.readyAt ? new Date(order.readyAt) : null,
              completedAt: order.completedAt ? new Date(order.completedAt) : null,
              cancelledAt: order.cancelledAt ? new Date(order.cancelledAt) : null,
              cancelledBy: order.cancelledBy, cancellationReason: order.cancellationReason,
              createdAt: new Date(order.createdAt), updatedAt: new Date(order.updatedAt),
            },
          });
          count++;

          // Create order items
          if (order.orderItems && order.orderItems.length > 0) {
            for (const item of order.orderItems) {
              await prisma.orderItem.create({
                data: {
                  id: item.id, orderId: order.id, menuItemId: item.menuItemId,
                  menuItemName: item.menuItemName, quantity: item.quantity,
                  unitPrice: item.unitPrice, modifiersPrice: item.modifiersPrice,
                  totalPrice: item.totalPrice, specialInstructions: item.specialInstructions,
                  status: item.status,
                  sentToKitchenAt: item.sentToKitchenAt ? new Date(item.sentToKitchenAt) : null,
                  completedAt: item.completedAt ? new Date(item.completedAt) : null,
                  createdAt: new Date(item.createdAt),
                },
              });

              // Create order item modifiers
              if (item.modifiers && item.modifiers.length > 0) {
                for (const mod of item.modifiers) {
                  await prisma.orderItemModifier.create({
                    data: {
                      id: mod.id, orderItemId: item.id, modifierId: mod.modifierId,
                      modifierName: mod.modifierName, priceAdjustment: mod.priceAdjustment,
                    },
                  });
                }
              }
            }
          }
        }
      }
      console.log(`✅ Orders: ${count} new records (${orders.length - count} already exist)`);
    }

    console.log(`\n🎉 Restore complete!`);

  } catch (error) {
    console.error('❌ Restore failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

restoreData();
