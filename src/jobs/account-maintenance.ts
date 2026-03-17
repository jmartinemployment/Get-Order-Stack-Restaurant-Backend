import { PrismaClient } from '@prisma/client';
import { auditLog } from '../utils/audit';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export async function disableInactiveAccounts(): Promise<number> {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const affected = await prisma.teamMember.findMany({
    where: {
      isActive: true,
      passwordHash: { not: null },
      OR: [
        { lastLoginAt: { lt: cutoff } },
        { lastLoginAt: null, createdAt: { lt: cutoff } },
      ],
    },
    select: { id: true, email: true },
  });

  if (affected.length === 0) return 0;

  await prisma.teamMember.updateMany({
    where: { id: { in: affected.map(m => m.id) } },
    data: { isActive: false },
  });

  for (const member of affected) {
    await auditLog('account_auto_disabled', {
      userId: member.id,
      metadata: { email: member.email, reason: '90_day_inactivity' },
    });
  }

  logger.info('Disabled inactive accounts', { count: affected.length });
  return affected.length;
}
