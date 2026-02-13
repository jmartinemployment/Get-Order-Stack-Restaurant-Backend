/**
 * Seed script for Customer Records
 * Creates 15 customers per Taipa location (30 total)
 * Mix of segments: VIP, regular, new, at-risk, dormant
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface CustomerDef {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  segment: 'vip' | 'regular' | 'new' | 'at-risk' | 'dormant';
  totalOrders: number;
  totalSpent: number;
  loyaltyPoints: number;
  lastOrderDaysAgo: number;
  tags: string[];
}

const customers: CustomerDef[] = [
  // VIP customers (3) — $500+ spent, 20+ orders
  { firstName: 'Carlos', lastName: 'Mendoza', email: 'carlos.mendoza@gmail.com', phone: '305-555-0101', segment: 'vip', totalOrders: 28, totalSpent: 842, loyaltyPoints: 680, lastOrderDaysAgo: 2, tags: ['vip', 'lunch-regular', 'birthday-march'] },
  { firstName: 'Maria', lastName: 'Rodriguez', email: 'maria.rod@yahoo.com', phone: '305-555-0102', segment: 'vip', totalOrders: 35, totalSpent: 1120, loyaltyPoints: 920, lastOrderDaysAgo: 1, tags: ['vip', 'dinner-regular', 'ceviche-lover'] },
  { firstName: 'David', lastName: 'Chen', email: 'dchen@outlook.com', phone: '305-555-0103', segment: 'vip', totalOrders: 22, totalSpent: 685, loyaltyPoints: 540, lastOrderDaysAgo: 3, tags: ['vip', 'weekend-regular'] },

  // Regular customers (4) — $100-400, 5-15 orders
  { firstName: 'Ana', lastName: 'Gutierrez', email: 'ana.g@gmail.com', phone: '305-555-0201', segment: 'regular', totalOrders: 12, totalSpent: 345, loyaltyPoints: 280, lastOrderDaysAgo: 5, tags: ['lunch-regular'] },
  { firstName: 'James', lastName: 'Thompson', email: 'jthompson@gmail.com', phone: '305-555-0202', segment: 'regular', totalOrders: 8, totalSpent: 256, loyaltyPoints: 190, lastOrderDaysAgo: 7, tags: ['delivery-preferred'] },
  { firstName: 'Sofia', lastName: 'Vargas', email: 'sofia.vargas@hotmail.com', phone: '305-555-0203', segment: 'regular', totalOrders: 15, totalSpent: 398, loyaltyPoints: 320, lastOrderDaysAgo: 4, tags: ['family-dinners'] },
  { firstName: 'Michael', lastName: 'Johnson', email: 'mjohnson@work.com', phone: '305-555-0204', segment: 'regular', totalOrders: 6, totalSpent: 178, loyaltyPoints: 120, lastOrderDaysAgo: 10, tags: ['pickup-preferred'] },

  // New customers (3) — 1-2 orders
  { firstName: 'Isabella', lastName: 'Lopez', email: 'isabella.l@gmail.com', phone: '305-555-0301', segment: 'new', totalOrders: 1, totalSpent: 42, loyaltyPoints: 30, lastOrderDaysAgo: 3, tags: ['new'] },
  { firstName: 'Robert', lastName: 'Williams', email: 'rwilliams@gmail.com', phone: '305-555-0302', segment: 'new', totalOrders: 2, totalSpent: 68, loyaltyPoints: 50, lastOrderDaysAgo: 6, tags: ['new', 'online-order'] },
  { firstName: 'Carmen', lastName: 'Diaz', email: 'carmen.d@icloud.com', phone: '305-555-0303', segment: 'new', totalOrders: 1, totalSpent: 35, loyaltyPoints: 20, lastOrderDaysAgo: 1, tags: ['new'] },

  // At-risk customers (2) — last order 30-60 days ago
  { firstName: 'Patricia', lastName: 'Morales', email: 'pmorales@gmail.com', phone: '305-555-0401', segment: 'at-risk', totalOrders: 10, totalSpent: 312, loyaltyPoints: 240, lastOrderDaysAgo: 35, tags: ['at-risk', 'was-regular'] },
  { firstName: 'Kevin', lastName: 'Brown', email: 'kbrown@outlook.com', phone: '305-555-0402', segment: 'at-risk', totalOrders: 7, totalSpent: 198, loyaltyPoints: 150, lastOrderDaysAgo: 52, tags: ['at-risk'] },

  // Dormant customers (3) — 90+ days ago
  { firstName: 'Rosa', lastName: 'Fernandez', email: 'rosa.f@gmail.com', phone: '305-555-0501', segment: 'dormant', totalOrders: 4, totalSpent: 135, loyaltyPoints: 80, lastOrderDaysAgo: 95, tags: ['dormant'] },
  { firstName: 'Steven', lastName: 'Martinez', email: 'smartinez@yahoo.com', phone: '305-555-0502', segment: 'dormant', totalOrders: 3, totalSpent: 92, loyaltyPoints: 60, lastOrderDaysAgo: 120, tags: ['dormant'] },
  { firstName: 'Elena', lastName: 'Cruz', email: 'elena.cruz@gmail.com', phone: '305-555-0503', segment: 'dormant', totalOrders: 5, totalSpent: 156, loyaltyPoints: 100, lastOrderDaysAgo: 105, tags: ['dormant', 'was-regular'] },
];

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(12, 0, 0, 0);
  return d;
}

export async function seedCustomers(restaurantIds: string[]): Promise<Map<string, string[]>> {
  console.log('\n👥 Seeding customers...');
  const customerIdMap = new Map<string, string[]>();

  for (const restaurantId of restaurantIds) {
    const existing = await prisma.customer.count({ where: { restaurantId } });
    if (existing > 0) {
      console.log(`   ⚠️  Customers already exist for restaurant ${restaurantId}, skipping...`);
      const existingCustomers = await prisma.customer.findMany({
        where: { restaurantId },
        select: { id: true },
      });
      customerIdMap.set(restaurantId, existingCustomers.map(c => c.id));
      continue;
    }

    const ids: string[] = [];
    for (const cust of customers) {
      const avgOrderValue = cust.totalOrders > 0
        ? Math.round((cust.totalSpent / cust.totalOrders) * 100) / 100
        : 0;

      const customer = await prisma.customer.create({
        data: {
          restaurantId,
          firstName: cust.firstName,
          lastName: cust.lastName,
          email: cust.email,
          phone: cust.phone,
          totalOrders: cust.totalOrders,
          totalSpent: cust.totalSpent,
          avgOrderValue,
          lastOrderDate: daysAgo(cust.lastOrderDaysAgo),
          loyaltyPoints: cust.loyaltyPoints,
          tags: cust.tags,
        },
      });
      ids.push(customer.id);
    }
    customerIdMap.set(restaurantId, ids);
    console.log(`   ✅ Created ${customers.length} customers for restaurant ${restaurantId}`);
  }

  const total = await prisma.customer.count();
  console.log(`   📊 Total customers in database: ${total}`);
  return customerIdMap;
}

// Allow standalone execution
if (require.main === module) {
  (async () => {
    const restaurants = await prisma.restaurant.findMany({
      where: { slug: { in: ['taipa-kendall', 'taipa-coral-gables'] } },
      select: { id: true, slug: true },
    });
    console.log(`Found ${restaurants.length} Taipa restaurants`);
    await seedCustomers(restaurants.map(r => r.id));
  })()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
}
