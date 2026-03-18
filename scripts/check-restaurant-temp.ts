import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const RESTAURANT_ID = 'f2cfe8dd-48f3-4596-ab1e-22a28b23ad38';

async function main() {
  const r = await prisma.restaurant.findUnique({
    where: { id: RESTAURANT_ID },
    select: { id: true, name: true, merchantProfile: true },
  });
  const profile = r?.merchantProfile as Record<string, unknown>;
  console.log('onboardingComplete:', profile?.['onboardingComplete']);
  console.log('profile keys:', profile ? Object.keys(profile) : 'null');
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
