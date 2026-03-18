import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const CATERING_RESTAURANT_ID = '817f7605-f175-4f31-8801-b6b7ec263560'; // Jays Catering

async function main() {
  await prisma.restaurant.update({
    where: { id: CATERING_RESTAURANT_ID },
    data: {
      merchantProfile: {
        onboardingComplete: true,
        businessName: 'Jays Catering',
        primaryVertical: 'food_and_drink',
        verticals: ['food_and_drink'],
        defaultDeviceMode: 'catering',
        enabledModules: [
          'menu_management', 'table_management', 'kds', 'bookings',
          'catering', 'online_ordering', 'inventory', 'marketing', 'loyalty',
          'delivery', 'gift_cards', 'staff_scheduling', 'payroll',
          'reports', 'crm', 'multi_location',
        ],
      },
    },
  });
  console.log('Jays Catering merchantProfile fixed');
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
