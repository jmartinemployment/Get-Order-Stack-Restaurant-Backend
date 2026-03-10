/**
 * Seed script for Transaction History
 * Creates 15 completed+paid orders on EVERY active device for each Taipa restaurant.
 * Also ensures a "Browser" device exists so browser-based testing works immediately.
 *
 * Re-running deletes existing TX-* orders and re-creates with fresh timestamps.
 *
 * Usage: npx tsx scripts/seed-transactions.ts
 */

import { PrismaClient } from '@prisma/client';
import { toErrorMessage } from '../src/utils/errors';

const prisma = new PrismaClient();

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

interface TransactionPlan {
  hoursAgo: number;
  paymentMethod: string;
  subtotal: number;
  tipPercent: number;
  orderType: string;
}

function generatePlans(): TransactionPlan[] {
  return [
    // Today — 6 transactions
    { hoursAgo: 0.5, paymentMethod: 'card',   subtotal: 42.5,  tipPercent: 20, orderType: 'dine_in' },
    { hoursAgo: 1,   paymentMethod: 'cash',   subtotal: 18,    tipPercent: 15, orderType: 'pickup' },
    { hoursAgo: 2,   paymentMethod: 'stripe', subtotal: 67.25, tipPercent: 18, orderType: 'dine_in' },
    { hoursAgo: 3,   paymentMethod: 'card',   subtotal: 24,    tipPercent: 0,  orderType: 'pickup' },
    { hoursAgo: 4,   paymentMethod: 'paypal', subtotal: 31.5,  tipPercent: 20, orderType: 'delivery' },
    { hoursAgo: 5,   paymentMethod: 'cash',   subtotal: 55.75, tipPercent: 22, orderType: 'dine_in' },
    // Yesterday — 5 transactions
    { hoursAgo: 26,  paymentMethod: 'card',   subtotal: 89,    tipPercent: 18, orderType: 'dine_in' },
    { hoursAgo: 28,  paymentMethod: 'stripe', subtotal: 15.5,  tipPercent: 0,  orderType: 'pickup' },
    { hoursAgo: 30,  paymentMethod: 'cash',   subtotal: 38.25, tipPercent: 15, orderType: 'dine_in' },
    { hoursAgo: 32,  paymentMethod: 'card',   subtotal: 72,    tipPercent: 20, orderType: 'dine_in' },
    { hoursAgo: 34,  paymentMethod: 'paypal', subtotal: 22.75, tipPercent: 10, orderType: 'delivery' },
    // Earlier this week — 4 transactions
    { hoursAgo: 72,  paymentMethod: 'stripe', subtotal: 105,    tipPercent: 18, orderType: 'dine_in' },
    { hoursAgo: 96,  paymentMethod: 'card',   subtotal: 46.5,  tipPercent: 15, orderType: 'dine_in' },
    { hoursAgo: 120, paymentMethod: 'cash',   subtotal: 28,    tipPercent: 20, orderType: 'pickup' },
    { hoursAgo: 144, paymentMethod: 'card',   subtotal: 63.75, tipPercent: 0,  orderType: 'dine_in' },
  ];
}

async function ensureBrowserDevice(restaurantId: string, slug: string): Promise<Array<{ id: string; deviceName: string }>> {
  let devices = await prisma.device.findMany({
    where: { restaurantId, status: 'active' },
    select: { id: true, deviceName: true },
  });

  const hasBrowserDevice = devices.some(d => d.deviceName === 'Browser');
  if (!hasBrowserDevice) {
    const browserDevice = await prisma.device.create({
      data: {
        restaurantId,
        deviceName: 'Browser',
        deviceType: 'terminal',
        posMode: 'full_service',
        status: 'active',
        pairedAt: new Date(),
        hardwareInfo: { platform: 'Browser' },
      },
      select: { id: true, deviceName: true },
    });
    devices = [...devices, browserDevice];
    console.log(`   🖥️  Created Browser device for ${slug} (${browserDevice.id.slice(0, 8)}...)`);
  }

  return devices;
}

function buildTransactionTotals(plan: TransactionPlan) {
  const subtotal = plan.subtotal;
  const tax = Math.round(subtotal * 0.075 * 100) / 100;
  const tip = plan.tipPercent > 0 ? Math.round(subtotal * (plan.tipPercent / 100) * 100) / 100 : 0;
  const deliveryFee = plan.orderType === 'delivery' ? 5.99 : 0;
  const total = Math.round((subtotal + tax + tip + deliveryFee) * 100) / 100;
  return { subtotal, tax, tip, deliveryFee, total };
}

interface OrderContext {
  restaurantId: string;
  deviceId: string;
  serverId: string | null;
  tableId: string | null;
  menuItems: Awaited<ReturnType<typeof prisma.menuItem.findMany>>;
}

async function createTransactionOrder(
  ctx: OrderContext,
  plan: TransactionPlan,
  orderNumber: string,
  orderDate: Date,
): Promise<void> {
  const totals = buildTransactionTotals(plan);
  const completedAt = new Date(orderDate.getTime() + 25 * 60000);
  const itemCount = 2 + Math.floor(Math.random() * 3);
  const selectedItems = [...ctx.menuItems].sort(() => Math.random() - 0.5).slice(0, itemCount);

  await prisma.order.create({
    data: {
      restaurantId: ctx.restaurantId,
      sourceDeviceId: ctx.deviceId,
      serverId: ctx.serverId,
      tableId: plan.orderType === 'dine_in' ? ctx.tableId : null,
      orderNumber,
      orderType: plan.orderType,
      orderSource: 'pos',
      status: 'completed',
      ...totals,
      discount: 0,
      paymentMethod: plan.paymentMethod,
      paymentStatus: 'paid',
      deliveryAddress: plan.orderType === 'delivery' ? '456 Coral Way, Miami, FL 33145' : null,
      confirmedAt: new Date(orderDate.getTime() + 2 * 60000),
      preparingAt: new Date(orderDate.getTime() + 5 * 60000),
      readyAt: new Date(orderDate.getTime() + 18 * 60000),
      completedAt,
      createdAt: orderDate,
      orderItems: {
        create: selectedItems.map(item => {
          const qty = Math.random() < 0.3 ? 2 : 1;
          const unitPrice = Number(item.price);
          return {
            menuItemId: item.id,
            menuItemName: item.name,
            quantity: qty,
            unitPrice,
            modifiersPrice: 0,
            totalPrice: unitPrice * qty,
            status: 'completed',
          };
        }),
      },
    },
  });
}

async function seedDeviceTransactions(
  device: { id: string; deviceName: string },
  deviceIndex: number,
  plans: TransactionPlan[],
  ctx: Omit<OrderContext, 'deviceId'> & { slug: string; slugPrefix: string },
): Promise<void> {
  let created = 0;
  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i];
    const orderDate = hoursAgo(plan.hoursAgo);
    const deviceSuffix = deviceIndex > 0 ? `D${deviceIndex}-` : '';
    const orderNumber = `TX-${ctx.slugPrefix}${deviceSuffix}${String(i + 1).padStart(3, '0')}`;
    await createTransactionOrder(
      { restaurantId: ctx.restaurantId, deviceId: device.id, serverId: ctx.serverId, tableId: ctx.tableId, menuItems: ctx.menuItems },
      plan,
      orderNumber,
      orderDate,
    );
    created++;
  }
  console.log(`   ✅ Created ${created} transactions for ${ctx.slug} → ${device.deviceName} (${device.id.slice(0, 8)}...)`);
}

async function seedRestaurantTransactions(restaurant: { id: string; slug: string }): Promise<void> {
  const devices = await ensureBrowserDevice(restaurant.id, restaurant.slug);
  if (devices.length === 0) {
    console.log(`   ⚠️  No active devices for ${restaurant.slug} — skipping`);
    return;
  }

  const server = await prisma.teamMember.findFirst({
    where: { restaurantId: restaurant.id },
    select: { id: true },
  });
  const menuItems = await prisma.menuItem.findMany({
    where: { restaurantId: restaurant.id, available: true },
    take: 20,
  });
  if (menuItems.length === 0) {
    console.log(`   ⚠️  No menu items for ${restaurant.slug} — skipping`);
    return;
  }
  const table = await prisma.restaurantTable.findFirst({
    where: { restaurantId: restaurant.id },
    select: { id: true },
  });

  const plans = generatePlans();
  const slugPrefix = restaurant.slug === 'taipa-kendall' ? 'K' : 'G';

  for (let d = 0; d < devices.length; d++) {
    await seedDeviceTransactions(devices[d], d, plans, {
      restaurantId: restaurant.id,
      slug: restaurant.slug,
      slugPrefix,
      serverId: server?.id ?? null,
      tableId: table?.id ?? null,
      menuItems,
    });
  }
}

console.log('\n💳 Seeding transaction history...');

try {
  // Delete existing TX-* orders (and their items) so we can re-seed with fresh timestamps
  const existingTx = await prisma.order.findMany({
    where: { orderNumber: { startsWith: 'TX-' } },
    select: { id: true },
  });

  if (existingTx.length > 0) {
    const ids = existingTx.map(o => o.id);
    await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
    console.log(`   🗑️  Deleted ${existingTx.length} existing TX orders`);
  }

  const restaurants = await prisma.restaurant.findMany({
    where: { slug: { in: ['taipa-kendall', 'taipa-coral-gables'] } },
    select: { id: true, slug: true },
  });

  if (restaurants.length === 0) {
    console.log('   ⚠️  No Taipa restaurants found. Run seed:reset first.');
  } else {
    for (const restaurant of restaurants) {
      await seedRestaurantTransactions(restaurant);
    }

    const totalPaid = await prisma.order.count({
      where: { paymentStatus: 'paid', status: 'completed', sourceDeviceId: { not: null } },
    });
    console.log(`   📊 Total paid device-linked orders: ${totalPaid}`);
  }
} catch (error: unknown) {
  console.error('Script failed:', toErrorMessage(error));
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
