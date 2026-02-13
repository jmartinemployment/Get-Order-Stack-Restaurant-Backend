/**
 * Seed script for Orders + Order Items
 * Creates ~40 orders per Taipa location (80 total) spanning the last 14 days
 * Mix of statuses, order types, sources, payment states, and special instructions
 */

import { PrismaClient, MenuItem, RestaurantTable, Customer } from '@prisma/client';

const prisma = new PrismaClient();

const specialInstructions: string[] = [
  'No onions please',
  'Extra spicy',
  'Allergy: no nuts',
  'This was amazing thank you!',
  'Food was cold when it arrived',
  'Rush order please',
  'Gluten-free if possible',
  'Light on the salt',
  'Extra lime on the side',
  'Birthday celebration - can you write Happy Birthday on the plate?',
  'Allergy: shellfish - please be careful',
  'No cilantro',
  'Make it extra hot please!!!',
  'Everything was perfect, will be back!',
  'Waited too long for the food',
  'Can you add extra sauce?',
];

function daysAgo(days: number, hour?: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const h = hour ?? (11 + Math.floor(Math.random() * 10)); // 11am-9pm
  d.setHours(h, Math.floor(Math.random() * 60), Math.floor(Math.random() * 60), 0);
  return d;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function generateOrderNumber(index: number, restaurantIndex: number): string {
  const prefix = restaurantIndex === 0 ? 'TK' : 'TCG';
  return `${prefix}-${String(index + 1).padStart(4, '0')}`;
}

interface OrderPlan {
  status: string;
  orderType: string;
  orderSource: string;
  paymentStatus: string;
  daysAgo: number;
  itemCount: number;
  hasSpecialInstructions: boolean;
  tipPercent: number;
}

function generateOrderPlans(count: number): OrderPlan[] {
  const plans: OrderPlan[] = [];

  // Status distribution: 30 completed, 5 preparing, 3 pending, 2 cancelled
  const statuses: string[] = [
    ...Array(30).fill('completed'),
    ...Array(5).fill('preparing'),
    ...Array(3).fill('pending'),
    ...Array(2).fill('cancelled'),
  ];

  for (let i = 0; i < count; i++) {
    const status = statuses[i] ?? 'completed';

    // Order type: 60% dine-in, 25% pickup, 15% delivery
    const typeRoll = Math.random();
    const orderType = typeRoll < 0.60 ? 'dine_in' : typeRoll < 0.85 ? 'pickup' : 'delivery';

    // Order source: 70% pos, 20% online, 10% kds
    const sourceRoll = Math.random();
    const orderSource = sourceRoll < 0.70 ? 'pos' : sourceRoll < 0.90 ? 'online' : 'kds';

    // Payment status — mostly paid for completed, pending for in-progress
    let paymentStatus = 'paid';
    if (status === 'pending' || status === 'preparing') paymentStatus = 'pending';
    if (status === 'cancelled') paymentStatus = Math.random() < 0.5 ? 'refunded' : 'cancelled';

    // Spread over 14 days — more recent orders have active statuses
    let orderDaysAgo: number;
    if (status === 'pending' || status === 'preparing') {
      orderDaysAgo = 0; // Active orders are today
    } else if (status === 'cancelled') {
      orderDaysAgo = Math.floor(Math.random() * 7) + 1;
    } else {
      orderDaysAgo = Math.floor(Math.random() * 14);
    }

    plans.push({
      status,
      orderType,
      orderSource,
      paymentStatus,
      daysAgo: orderDaysAgo,
      itemCount: 2 + Math.floor(Math.random() * 4), // 2-5 items
      hasSpecialInstructions: Math.random() < 0.20, // ~20%
      tipPercent: status === 'cancelled' ? 0 : Math.random() < 0.7 ? Math.floor(Math.random() * 21) : 0, // 0-20%
    });
  }

  return plans;
}

export async function seedOrders(restaurantIds: string[]) {
  console.log('\n🧾 Seeding orders...');

  for (let rIdx = 0; rIdx < restaurantIds.length; rIdx++) {
    const restaurantId = restaurantIds[rIdx];

    const existingOrders = await prisma.order.count({ where: { restaurantId } });
    if (existingOrders > 0) {
      console.log(`   ⚠️  Orders already exist for restaurant ${restaurantId}, skipping...`);
      continue;
    }

    // Load menu items, tables, and customers for this restaurant
    const menuItems = await prisma.menuItem.findMany({
      where: { restaurantId, available: true },
    });
    const tables = await prisma.restaurantTable.findMany({
      where: { restaurantId },
    });
    const customerList = await prisma.customer.findMany({
      where: { restaurantId },
    });

    if (menuItems.length === 0) {
      console.log(`   ⚠️  No menu items for restaurant ${restaurantId}, skipping orders...`);
      continue;
    }

    const plans = generateOrderPlans(40);

    for (let i = 0; i < plans.length; i++) {
      const plan = plans[i];
      const orderNumber = generateOrderNumber(i, rIdx);
      const orderDate = daysAgo(plan.daysAgo);

      // Pick random items
      const selectedItems = pickN(menuItems, plan.itemCount);
      let subtotal = 0;
      const itemsData: Array<{
        menuItemId: string;
        menuItemName: string;
        quantity: number;
        unitPrice: number;
        totalPrice: number;
        specialInstructions: string | null;
        status: string;
      }> = [];

      for (const item of selectedItems) {
        const qty = Math.random() < 0.3 ? 2 : 1; // 30% chance of quantity 2
        const unitPrice = Number(item.price);
        const totalPrice = unitPrice * qty;
        subtotal += totalPrice;

        itemsData.push({
          menuItemId: item.id,
          menuItemName: item.name,
          quantity: qty,
          unitPrice,
          totalPrice,
          specialInstructions: null,
          status: plan.status === 'cancelled' ? 'cancelled' : plan.status === 'completed' ? 'completed' : plan.status,
        });
      }

      const tax = Math.round(subtotal * 0.075 * 100) / 100; // 7.5%
      const tip = plan.tipPercent > 0 ? Math.round(subtotal * (plan.tipPercent / 100) * 100) / 100 : 0;
      const deliveryFee = plan.orderType === 'delivery' ? 5.99 : 0;
      const total = Math.round((subtotal + tax + tip + deliveryFee) * 100) / 100;

      // Assign table for dine-in orders
      const tableId = plan.orderType === 'dine_in' && tables.length > 0
        ? pick(tables).id
        : null;

      // Assign customer (80% of orders have a customer)
      const customerId = customerList.length > 0 && Math.random() < 0.8
        ? pick(customerList).id
        : null;

      // Special instructions on the order itself
      const orderInstructions = plan.hasSpecialInstructions ? pick(specialInstructions) : null;

      // Timestamps based on status
      const createdAt = orderDate;
      let confirmedAt: Date | null = null;
      let preparingAt: Date | null = null;
      let readyAt: Date | null = null;
      let completedAt: Date | null = null;
      let cancelledAt: Date | null = null;

      if (plan.status !== 'pending') {
        confirmedAt = new Date(createdAt.getTime() + 2 * 60000); // +2 min
      }
      if (plan.status === 'preparing' || plan.status === 'completed') {
        preparingAt = new Date(createdAt.getTime() + 5 * 60000); // +5 min
      }
      if (plan.status === 'completed') {
        readyAt = new Date(createdAt.getTime() + 18 * 60000); // +18 min
        completedAt = new Date(createdAt.getTime() + 25 * 60000); // +25 min
      }
      if (plan.status === 'cancelled') {
        cancelledAt = new Date(createdAt.getTime() + 3 * 60000); // +3 min
      }

      await prisma.order.create({
        data: {
          restaurantId,
          customerId,
          tableId,
          orderNumber,
          orderType: plan.orderType,
          orderSource: plan.orderSource,
          status: plan.status,
          subtotal,
          tax,
          tip,
          discount: 0,
          deliveryFee,
          total,
          paymentMethod: plan.paymentStatus === 'paid' ? 'card' : null,
          paymentStatus: plan.paymentStatus,
          specialInstructions: orderInstructions,
          deliveryAddress: plan.orderType === 'delivery' ? '123 Sample St, Miami, FL 33155' : null,
          confirmedAt,
          preparingAt,
          readyAt,
          completedAt,
          cancelledAt,
          cancellationReason: plan.status === 'cancelled' ? 'Customer requested cancellation' : null,
          createdAt,
          orderItems: {
            create: itemsData.map(item => ({
              menuItemId: item.menuItemId,
              menuItemName: item.menuItemName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              modifiersPrice: 0,
              totalPrice: item.totalPrice,
              specialInstructions: item.specialInstructions,
              status: item.status,
            })),
          },
        },
      });
    }

    console.log(`   ✅ Created 40 orders with items for restaurant ${restaurantId}`);
  }

  const totalOrders = await prisma.order.count();
  const totalItems = await prisma.orderItem.count();
  console.log(`   📊 Total orders: ${totalOrders}, order items: ${totalItems}`);
}

// Allow standalone execution
if (require.main === module) {
  (async () => {
    const restaurants = await prisma.restaurant.findMany({
      where: { slug: { in: ['taipa-kendall', 'taipa-coral-gables'] } },
      select: { id: true, slug: true },
    });
    console.log(`Found ${restaurants.length} Taipa restaurants`);
    await seedOrders(restaurants.map(r => r.id));
  })()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
}
