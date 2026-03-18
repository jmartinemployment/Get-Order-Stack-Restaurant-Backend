import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const groups = await prisma.restaurantGroup.findMany({ select: { id: true, name: true } });
  console.log('Groups:', JSON.stringify(groups));
  const restaurants = await prisma.restaurant.findMany({ select: { id: true, name: true, slug: true } });
  console.log('Restaurants:', JSON.stringify(restaurants));
  const members = await prisma.teamMember.findMany({ select: { id: true, email: true, role: true, restaurantGroupId: true } });
  console.log('Members:', JSON.stringify(members, null, 2));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
