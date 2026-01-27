import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function createTestUser() {
  const email = 'admin@orderstack.com';
  const password = 'admin123'; // Change this in production!
  const SALT_ROUNDS = 10;

  try {
    // Check if user already exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      console.log(`⚠️  User ${email} already exists`);
      return;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Create super_admin user
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: 'Admin',
        lastName: 'User',
        role: 'super_admin',
        isActive: true,
      },
    });

    console.log(`✅ Created super_admin user:`);
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}`);
    console.log(`   Role: super_admin`);
    console.log(`   ID: ${user.id}`);
    console.log(`\n⚠️  Remember to change the password in production!`);

  } catch (error) {
    console.error('❌ Failed to create user:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestUser();
