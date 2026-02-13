/**
 * Seed script for Reservations
 * Creates 12 reservations per Taipa location (24 total)
 * Mix: 3 today, 4 upcoming, 3 past, 2 cancelled
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface ReservationDef {
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  partySize: number;
  status: string;
  dayOffset: number; // negative = past, 0 = today, positive = future
  hour: number;
  specialRequests: string | null;
  tableNumber: string | null;
}

const reservations: ReservationDef[] = [
  // Today (3): 1 confirmed upcoming, 1 seated in progress, 1 completed earlier
  {
    customerName: 'Carlos Mendoza',
    customerPhone: '305-555-0101',
    customerEmail: 'carlos.mendoza@gmail.com',
    partySize: 4,
    status: 'confirmed',
    dayOffset: 0,
    hour: 19, // 7pm tonight
    specialRequests: 'Birthday celebration',
    tableNumber: '6',
  },
  {
    customerName: 'Maria Rodriguez',
    customerPhone: '305-555-0102',
    customerEmail: 'maria.rod@yahoo.com',
    partySize: 2,
    status: 'seated',
    dayOffset: 0,
    hour: 12, // noon today
    specialRequests: 'Window seat please',
    tableNumber: '3',
  },
  {
    customerName: 'Ana Gutierrez',
    customerPhone: '305-555-0201',
    customerEmail: 'ana.g@gmail.com',
    partySize: 3,
    status: 'completed',
    dayOffset: 0,
    hour: 11, // 11am today, already done
    specialRequests: null,
    tableNumber: '2',
  },

  // Upcoming (4): spread over next 3 days
  {
    customerName: 'David Chen',
    customerPhone: '305-555-0103',
    customerEmail: 'dchen@outlook.com',
    partySize: 6,
    status: 'confirmed',
    dayOffset: 1,
    hour: 18,
    specialRequests: 'High chair needed',
    tableNumber: null,
  },
  {
    customerName: 'James Thompson',
    customerPhone: '305-555-0202',
    customerEmail: 'jthompson@gmail.com',
    partySize: 2,
    status: 'pending',
    dayOffset: 1,
    hour: 20,
    specialRequests: null,
    tableNumber: null,
  },
  {
    customerName: 'Sofia Vargas',
    customerPhone: '305-555-0203',
    customerEmail: 'sofia.vargas@hotmail.com',
    partySize: 8,
    status: 'confirmed',
    dayOffset: 2,
    hour: 19,
    specialRequests: 'Anniversary dinner, quiet table please',
    tableNumber: 'P3',
  },
  {
    customerName: 'Isabella Lopez',
    customerPhone: '305-555-0301',
    customerEmail: 'isabella.l@gmail.com',
    partySize: 4,
    status: 'pending',
    dayOffset: 3,
    hour: 13,
    specialRequests: null,
    tableNumber: null,
  },

  // Past (3): 2 completed, 1 no-show
  {
    customerName: 'Michael Johnson',
    customerPhone: '305-555-0204',
    customerEmail: 'mjohnson@work.com',
    partySize: 4,
    status: 'completed',
    dayOffset: -1,
    hour: 19,
    specialRequests: null,
    tableNumber: '5',
  },
  {
    customerName: 'Robert Williams',
    customerPhone: '305-555-0302',
    customerEmail: 'rwilliams@gmail.com',
    partySize: 2,
    status: 'completed',
    dayOffset: -2,
    hour: 20,
    specialRequests: 'Gluten-free options needed',
    tableNumber: '1',
  },
  {
    customerName: 'Kevin Brown',
    customerPhone: '305-555-0402',
    customerEmail: 'kbrown@outlook.com',
    partySize: 3,
    status: 'no_show',
    dayOffset: -1,
    hour: 18,
    specialRequests: null,
    tableNumber: '4',
  },

  // Cancelled (2)
  {
    customerName: 'Patricia Morales',
    customerPhone: '305-555-0401',
    customerEmail: 'pmorales@gmail.com',
    partySize: 5,
    status: 'cancelled',
    dayOffset: -3,
    hour: 19,
    specialRequests: 'Large party, may need extra seating',
    tableNumber: null,
  },
  {
    customerName: 'Steven Martinez',
    customerPhone: '305-555-0502',
    customerEmail: 'smartinez@yahoo.com',
    partySize: 2,
    status: 'cancelled',
    dayOffset: 1,
    hour: 20,
    specialRequests: null,
    tableNumber: null,
  },
];

function getReservationTime(dayOffset: number, hour: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d;
}

export async function seedReservations(restaurantIds: string[]) {
  console.log('\n📅 Seeding reservations...');

  for (const restaurantId of restaurantIds) {
    const existing = await prisma.reservation.count({ where: { restaurantId } });
    if (existing > 0) {
      console.log(`   ⚠️  Reservations already exist for restaurant ${restaurantId}, skipping...`);
      continue;
    }

    // Try to match customers by name for the customerId link
    const customerList = await prisma.customer.findMany({
      where: { restaurantId },
      select: { id: true, firstName: true, lastName: true },
    });
    const customerNameMap = new Map<string, string>();
    for (const c of customerList) {
      if (c.firstName && c.lastName) {
        customerNameMap.set(`${c.firstName} ${c.lastName}`, c.id);
      }
    }

    for (const res of reservations) {
      const customerId = customerNameMap.get(res.customerName) ?? null;
      const confirmationSent = res.status !== 'pending';
      const reminderSent = res.status === 'completed' || res.status === 'seated' || res.status === 'no_show';

      await prisma.reservation.create({
        data: {
          restaurantId,
          customerId,
          customerName: res.customerName,
          customerPhone: res.customerPhone,
          customerEmail: res.customerEmail,
          partySize: res.partySize,
          reservationTime: getReservationTime(res.dayOffset, res.hour),
          tableNumber: res.tableNumber,
          status: res.status,
          specialRequests: res.specialRequests,
          confirmationSent,
          reminderSent,
        },
      });
    }

    console.log(`   ✅ Created ${reservations.length} reservations for restaurant ${restaurantId}`);
  }

  const total = await prisma.reservation.count();
  console.log(`   📊 Total reservations in database: ${total}`);
}

// Allow standalone execution
if (require.main === module) {
  (async () => {
    const restaurants = await prisma.restaurant.findMany({
      where: { slug: { in: ['taipa-kendall', 'taipa-coral-gables'] } },
      select: { id: true, slug: true },
    });
    console.log(`Found ${restaurants.length} Taipa restaurants`);
    await seedReservations(restaurants.map(r => r.id));
  })()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
}
