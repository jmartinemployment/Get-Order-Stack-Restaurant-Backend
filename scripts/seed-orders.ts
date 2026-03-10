/**
 * Seed script for Orders + Order Items
 * Creates ~40 orders per Taipa location (80 total) spanning the last 14 days
 * Mix of statuses, order types, sources, payment states, and special instructions
 */

import { PrismaClient } from '@prisma/client';
import { toErrorMessage } from '../src/utils/errors';

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

function randomTip(): number {
  return Math.random() < 0.7 ? Math.floor(Math.random() * 21) : 0;
}

function randomOrderType(): string {
  const roll = Math.random();
  if (roll < 0.6) return 'dine_in';
  return roll < 0.85 ? 'pickup' : 'delivery';
}

function randomOrderSource(): string {
  const roll = Math.random();
  if (roll < 0.7) return 'pos';
  return roll < 0.9 ? 'online' : 'kds';
}

function paymentStatusForOrder(status: string): string {
  if (status === 'pending' || status === 'preparing') return 'pending';
  if (status === 'cancelled') return Math.random() < 0.5 ? 'refunded' : 'cancelled';
  return 'paid';
}

function daysAgoForStatus(status: string): number {
  if (status === 'pending' || status === 'preparing') return 0;
  if (status === 'cancelled') return Math.floor(Math.random() * 7) + 1;
  return Math.floor(Math.random() * 14);
}

function generateOrderPlans(count: number): OrderPlan[] {
  const statuses: string[] = [
    ...new Array(30).fill('completed'),
    ...new Array(5).fill('preparing'),
    ...new Array(3).fill('pending'),
    ...new Array(2).fill('cancelled'),
  ];

  return Array.from({ length: count }, (_, i) => {
    const status = statuses[i] ?? 'completed';
    return {
      status,
      orderType: randomOrderType(),
      orderSource: randomOrderSource(),
      paymentStatus: paymentStatusForOrder(status),
      daysAgo: daysAgoForStatus(status),
      itemCount: 2 + Math.floor(Math.random() * 4),
      hasSpecialInstructions: Math.random() < 0.2,
      tipPercent: status === 'cancelled' ? 0 : randomTip(),
    };
  });
}

interface OrderItemData {
  menuItemId: string;
  menuItemName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  specialInstructions: string | null;
  status: string;
}

function buildOrderItems(selectedItems: Array<{ id: string; name: string; price: any }>, status: string): { items: OrderItemData[]; subtotal: number } {
  let subtotal = 0;
  const items: OrderItemData[] = [];

  for (const item of selectedItems) {
    const qty = Math.random() < 0.3 ? 2 : 1;
    const unitPrice = Number(item.price);
    const totalPrice = unitPrice * qty;
    subtotal += totalPrice;
    items.push({
      menuItemId: item.id,
      menuItemName: item.name,
      quantity: qty,
      unitPrice,
      totalPrice,
      specialInstructions: null,
      status,
    });
  }

  return { items, subtotal };
}

interface OrderTimestamps {
  confirmedAt: Date | null;
  preparingAt: Date | null;
  readyAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
}

function computeTimestamps(status: string, createdAt: Date): OrderTimestamps {
  const ts: OrderTimestamps = { confirmedAt: null, preparingAt: null, readyAt: null, completedAt: null, cancelledAt: null };

  if (status !== 'pending') {
    ts.confirmedAt = new Date(createdAt.getTime() + 2 * 60000);
  }
  if (status === 'preparing' || status === 'completed') {
    ts.preparingAt = new Date(createdAt.getTime() + 5 * 60000);
  }
  if (status === 'completed') {
    ts.readyAt = new Date(createdAt.getTime() + 18 * 60000);
    ts.completedAt = new Date(createdAt.getTime() + 25 * 60000);
  }
  if (status === 'cancelled') {
    ts.cancelledAt = new Date(createdAt.getTime() + 3 * 60000);
  }

  return ts;
}

function computeTotals(subtotal: number, plan: OrderPlan) {
  const tax = Math.round(subtotal * 0.075 * 100) / 100;
  const tip = plan.tipPercent > 0 ? Math.round(subtotal * (plan.tipPercent / 100) * 100) / 100 : 0;
  const deliveryFee = plan.orderType === 'delivery' ? 5.99 : 0;
  const total = Math.round((subtotal + tax + tip + deliveryFee) * 100) / 100;
  return { tax, tip, deliveryFee, total };
}

async function seedRestaurantOrders(
  restaurantId: string,
  rIdx: number,
  menuItems: Array<{ id: string; name: string; price: any }>,
  tables: Array<{ id: string }>,
  customerList: Array<{ id: string }>,
): Promise<void> {
  const plans = generateOrderPlans(40);

  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i];
    const createdAt = daysAgo(plan.daysAgo);
    const { items: itemsData, subtotal } = buildOrderItems(pickN(menuItems, plan.itemCount), plan.status);
    const { tax, tip, deliveryFee, total } = computeTotals(subtotal, plan);
    const timestamps = computeTimestamps(plan.status, createdAt);

    const tableId = plan.orderType === 'dine_in' && tables.length > 0 ? pick(tables).id : null;
    const customerId = customerList.length > 0 && Math.random() < 0.8 ? pick(customerList).id : null;

    await prisma.order.create({
      data: {
        restaurantId,
        customerId,
        tableId,
        orderNumber: generateOrderNumber(i, rIdx),
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
        specialInstructions: plan.hasSpecialInstructions ? pick(specialInstructions) : null,
        deliveryAddress: plan.orderType === 'delivery' ? '123 Sample St, Miami, FL 33155' : null,
        ...timestamps,
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

export async function seedOrders(restaurantIds: string[]) {
  console.log('\n🧾 Seeding orders...');

  for (let rIdx = 0; rIdx < restaurantIds.length; rIdx++) {
    const restaurantId = restaurantIds[rIdx];

    const existingOrders = await prisma.order.count({ where: { restaurantId } });
    if (existingOrders > 0) {
      console.log(`   ⚠️  Orders already exist for restaurant ${restaurantId}, skipping...`);
      continue;
    }

    const menuItems = await prisma.menuItem.findMany({ where: { restaurantId, available: true } });
    const tables = await prisma.restaurantTable.findMany({ where: { restaurantId } });
    const customerList = await prisma.customer.findMany({ where: { restaurantId } });

    if (menuItems.length === 0) {
      console.log(`   ⚠️  No menu items for restaurant ${restaurantId}, skipping orders...`);
      continue;
    }

    await seedRestaurantOrders(restaurantId, rIdx, menuItems, tables, customerList);
  }

  const totalOrders = await prisma.order.count();
  const totalItems = await prisma.orderItem.count();
  console.log(`   📊 Total orders: ${totalOrders}, order items: ${totalItems}`);
}

// Allow standalone execution
if (require.main === module) {
  try {
    const restaurants = await prisma.restaurant.findMany({
      where: { slug: { in: ['taipa-kendall', 'taipa-coral-gables'] } },
      select: { id: true, slug: true },
    });
    console.log(`Found ${restaurants.length} Taipa restaurants`);
    await seedOrders(restaurants.map(r => r.id));
  } catch (error: unknown) {
    console.error('Script failed:', toErrorMessage(error));
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}
