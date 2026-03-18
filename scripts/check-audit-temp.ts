import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const recent = await prisma.auditLog.findMany({
    where: { action: 'login_failed', createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  console.log(`Recent login_failed (last 30min): ${recent.length}`);
  for (const entry of recent.slice(0, 5)) {
    console.log(' -', JSON.stringify(entry.metadata));
  }
  
  // Also count for specific email pattern
  const count = await prisma.auditLog.count({
    where: { action: 'login_failed', createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) } },
  });
  console.log(`All login_failed last 15min: ${count}`);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
