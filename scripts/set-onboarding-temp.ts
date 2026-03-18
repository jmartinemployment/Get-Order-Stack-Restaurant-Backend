import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const RESTAURANT_ID = 'f2cfe8dd-48f3-4596-ab1e-22a28b23ad38';

async function main() {
  await prisma.restaurant.update({
    where: { id: RESTAURANT_ID },
    data: {
      merchantProfile: {
        onboardingComplete: true,
        businessName: 'Taipa',
        primaryVertical: 'food_and_drink',
        defaultDeviceMode: 'restaurant',
      },
    },
  });
  console.log('merchantProfile updated');
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
