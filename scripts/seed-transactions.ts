/**
 * Seed script for Transaction History
 * Creates 15 completed+paid orders on the first active device for each Taipa restaurant.
 * Orders have varied payment methods (cash, card, stripe, paypal), tip amounts,
 * and timestamps spanning today, yesterday, and this week.
 *
 * Usage: npx tsx scripts/seed-transactions.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PAYMENT_METHODS = ['cash', 'card', 'stripe', 'paypal'];
const ORDER_TYPES = ['dine_in', 'dine_in', 'dine_in', 'pickup', 'delivery'];

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
    { hoursAgo: 0.5, paymentMethod: 'card',   subtotal: 42.50, tipPercent: 20, orderType: 'dine_in' },
    { hoursAgo: 1,   paymentMethod: 'cash',   subtotal: 18.00, tipPercent: 15, orderType: 'pickup' },
    { hoursAgo: 2,   paymentMethod: 'stripe', subtotal: 67.25, tipPercent: 18, orderType: 'dine_in' },
    { hoursAgo: 3,   paymentMethod: 'card',   subtotal: 24.00, tipPercent: 0,  orderType: 'pickup' },
    { hoursAgo: 4,   paymentMethod: 'paypal', subtotal: 31.50, tipPercent: 20, orderType: 'delivery' },
    { hoursAgo: 5,   paymentMethod: 'cash',   subtotal: 55.75, tipPercent: 22, orderType: 'dine_in' },
    // Yesterday — 5 transactions
    { hoursAgo: 26,  paymentMethod: 'card',   subtotal: 89.00, tipPercent: 18, orderType: 'dine_in' },
    { hoursAgo: 28,  paymentMethod: 'stripe', subtotal: 15.50, tipPercent: 0,  orderType: 'pickup' },
    { hoursAgo: 30,  paymentMethod: 'cash',   subtotal: 38.25, tipPercent: 15, orderType: 'dine_in' },
    { hoursAgo: 32,  paymentMethod: 'card',   subtotal: 72.00, tipPercent: 20, orderType: 'dine_in' },
    { hoursAgo: 34,  paymentMethod: 'paypal', subtotal: 22.75, tipPercent: 10, orderType: 'delivery' },
    // Earlier this week — 4 transactions
    { hoursAgo: 72,  paymentMethod: 'stripe', subtotal: 105.00, tipPercent: 18, orderType: 'dine_in' },
    { hoursAgo: 96,  paymentMethod: 'card',   subtotal: 46.50, tipPercent: 15, orderType: 'dine_in' },
    { hoursAgo: 120, paymentMethod: 'cash',   subtotal: 28.00, tipPercent: 20, orderType: 'pickup' },
    { hoursAgo: 144, paymentMethod: 'card',   subtotal: 63.75, tipPercent: 0,  orderType: 'dine_in' },
  ];
}

async function seedTransactions() {
  console.log('\n💳 Seeding transaction history...');

  const restaurants = await prisma.restaurant.findMany({
    where: { slug: { in: ['taipa-kendall', 'taipa-coral-gables'] } },
    select: { id: true, slug: true },
  });

  if (restaurants.length === 0) {
    console.log('   ⚠️  No Taipa restaurants found. Run seed:reset first.');
    return;
  }

  for (const restaurant of restaurants) {
    // Find the first active device for this restaurant
    const device = await prisma.device.findFirst({
      where: { restaurantId: restaurant.id, status: 'active' },
      select: { id: true, deviceName: true },
    });

    if (!device) {
      console.log(`   ⚠️  No active device for ${restaurant.slug} — skipping`);
      continue;
    }

    // Find a server (team member) for the order
    const server = await prisma.teamMember.findFirst({
      where: { restaurantId: restaurant.id },
      select: { id: true },
    });

    // Get menu items for order items
    const menuItems = await prisma.menuItem.findMany({
      where: { restaurantId: restaurant.id, available: true },
      take: 20,
    });

    if (menuItems.length === 0) {
      console.log(`   ⚠️  No menu items for ${restaurant.slug} — skipping`);
      continue;
    }

    // Get a table for dine-in orders
    const table = await prisma.restaurantTable.findFirst({
      where: { restaurantId: restaurant.id },
      select: { id: true },
    });

    const plans = generatePlans();
    let created = 0;

    for (let i = 0; i < plans.length; i++) {
      const plan = plans[i];
      const orderDate = hoursAgo(plan.hoursAgo);
      const orderNumber = `TX-${restaurant.slug === 'taipa-kendall' ? 'K' : 'G'}${String(i + 1).padStart(3, '0')}`;

      // Check if order number already exists
      const exists = await prisma.order.findUnique({ where: { orderNumber } });
      if (exists) continue;

      // Pick 2-4 random menu items
      const itemCount = 2 + Math.floor(Math.random() * 3);
      const shuffled = [...menuItems].sort(() => Math.random() - 0.5);
      const selectedItems = shuffled.slice(0, itemCount);

      let subtotal = plan.subtotal;
      const tax = Math.round(subtotal * 0.075 * 100) / 100;
      const tip = plan.tipPercent > 0 ? Math.round(subtotal * (plan.tipPercent / 100) * 100) / 100 : 0;
      const deliveryFee = plan.orderType === 'delivery' ? 5.99 : 0;
      const total = Math.round((subtotal + tax + tip + deliveryFee) * 100) / 100;

      const completedAt = new Date(orderDate.getTime() + 25 * 60000);

      await prisma.order.create({
        data: {
          restaurantId: restaurant.id,
          sourceDeviceId: device.id,
          serverId: server?.id ?? null,
          tableId: plan.orderType === 'dine_in' && table ? table.id : null,
          orderNumber,
          orderType: plan.orderType,
          orderSource: 'pos',
          status: 'completed',
          subtotal,
          tax,
          tip,
          discount: 0,
          deliveryFee,
          total,
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

      created++;
    }

    console.log(`   ✅ Created ${created} transaction orders for ${restaurant.slug} (device: ${device.deviceName})`);
  }

  const totalPaid = await prisma.order.count({
    where: { paymentStatus: 'paid', status: 'completed', sourceDeviceId: { not: null } },
  });
  console.log(`   📊 Total paid device-linked orders: ${totalPaid}`);
}

seedTransactions()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
