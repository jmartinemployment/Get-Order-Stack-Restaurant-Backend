import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const CATERING_RESTAURANT_ID = '817f7605-f175-4f31-8801-b6b7ec263560'; // Jays Catering
const TAIPA_GROUP_ID = 'eecc4f5b-3a76-4d37-bf43-e7413091aeb7';
const OWNER_ID = '4401527e-c2b1-4753-aa2b-d83fe4af8a6e'; // owner@taipa.com

async function main() {
  // 1. Set onboardingComplete + catering mode for Jays Catering
  await prisma.restaurant.update({
    where: { id: CATERING_RESTAURANT_ID },
    data: {
      merchantProfile: {
        onboardingComplete: true,
        businessName: 'Jays Catering',
        primaryVertical: 'catering',
        defaultDeviceMode: 'catering',
      },
    },
  });
  console.log('Jays Catering merchantProfile updated');

  // 2. Grant owner@taipa.com access to Jays Catering restaurant
  const existing = await prisma.userRestaurantAccess.findFirst({
    where: { teamMemberId: OWNER_ID, restaurantId: CATERING_RESTAURANT_ID },
  });
  if (!existing) {
    await prisma.userRestaurantAccess.create({
      data: { teamMemberId: OWNER_ID, restaurantId: CATERING_RESTAURANT_ID, role: 'owner' },
    });
    console.log('Added Jays Catering access for owner@taipa.com');
  } else {
    console.log('Access already exists');
  }

  // Also update restaurantGroupId on Jays Catering restaurant if needed
  const cateringRestaurant = await prisma.restaurant.findUnique({
    where: { id: CATERING_RESTAURANT_ID },
    select: { id: true, name: true, merchantProfile: true },
  });
  const profile = cateringRestaurant?.merchantProfile as Record<string, unknown>;
  console.log('Jays Catering profile:', JSON.stringify(profile));
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
