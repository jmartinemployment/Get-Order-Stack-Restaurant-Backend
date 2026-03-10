import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { toErrorMessage } from '../src/utils/errors';

const prisma = new PrismaClient();

const email = 'admin@orderstack.com';
const password = 'admin123'; // NOSONAR - seed script credential

try {
  // Check if user exists
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() }
  });

  if (user) {
    console.log('✅ User found:');
    console.log('   ID:', user.id);
    console.log('   Email:', user.email);
    console.log('   Role:', user.role);
    console.log('   isActive:', user.isActive);
    console.log('   passwordHash:', user.passwordHash.substring(0, 20) + '...');

    // Test password verification
    const isValid = await bcrypt.compare(password, user.passwordHash);
    console.log('\n🔑 Password verification:', isValid ? '✅ VALID' : '❌ INVALID');
  } else {
    console.log('❌ User not found in database');
  }
} catch (error: unknown) {
  console.error('Script failed:', toErrorMessage(error));
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
