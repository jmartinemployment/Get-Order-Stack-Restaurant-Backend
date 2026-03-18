import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.auditLog.deleteMany({
    where: {
      action: 'login_failed',
      metadata: { path: ['email'], equals: 'owner@taipa.com' },
    },
  });
  console.log(`Cleared ${result.count} login_failed entries`);

  // Verify lockout is clear
  const recent = await prisma.auditLog.count({
    where: {
      action: 'login_failed',
      metadata: { path: ['email'], equals: 'owner@taipa.com' },
      createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
    },
  });
  console.log(`Recent login_failed count (last 15min): ${recent}`);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
