import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const GROUP_ID = 'eecc4f5b-3a76-4d37-bf43-e7413091aeb7';
const RESTAURANT_ID = 'f2cfe8dd-48f3-4596-ab1e-22a28b23ad38';

async function main() {
  const hash = await bcrypt.hash('owner123', 10);

  const member = await prisma.teamMember.create({
    data: {
      email: 'owner@taipa.com',
      firstName: 'Carlos',
      lastName: 'Mendoza',
      displayName: 'Carlos Mendoza',
      role: 'owner',
      isActive: true,
      passwordHash: hash,
      restaurantGroupId: GROUP_ID,
      restaurantId: RESTAURANT_ID,
      restaurantAccess: {
        create: { restaurantId: RESTAURANT_ID, role: 'owner' },
      },
    },
  });
  console.log('Created owner:', member.id, member.email);

  // Verify login works by comparing
  const ok = await bcrypt.compare('owner123', hash);
  console.log('Password verify test:', ok);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
