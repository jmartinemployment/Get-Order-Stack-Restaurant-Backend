import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function resetPasswords() {
  const accounts = [
    { email: 'owner@taipa.com', password: 'owner123' },
    { email: 'manager@taipa.com', password: 'manager123' },
    { email: 'admin@orderstack.com', password: 'admin123' },
    { email: 'staff@taipa.com', password: 'staff123' },
  ];
  
  for (const acct of accounts) {
    const hash = await bcrypt.hash(acct.password, 10);
    const result = await prisma.teamMember.updateMany({
      where: { email: acct.email },
      data: { passwordHash: hash },
    });
    console.log(`${acct.email}: updated ${result.count} row(s)`);
  }
  
  // Also check if account exists
  const owner = await prisma.teamMember.findUnique({
    where: { email: 'owner@taipa.com' },
    select: { id: true, email: true, passwordHash: true, isActive: true, mustChangePassword: true },
  });
  console.log('Owner account:', JSON.stringify(owner, null, 2));
}

resetPasswords()
  .then(() => process.exit(0))
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
