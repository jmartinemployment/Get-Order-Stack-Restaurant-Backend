/**
 * Seed script for authentication data
 * Creates restaurant group, links team members to restaurants, creates staff PINs
 *
 * Run: npx tsx scripts/seed-auth.ts
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const SALT_ROUNDS = 12;

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, SALT_ROUNDS);
}

export async function seedAuth() {
  console.log('\n🔐 Seeding auth data...');

  // Find Taipa restaurants
  const restaurants = await prisma.restaurant.findMany({
    where: { slug: { in: ['taipa-kendall', 'taipa-coral-gables'] } },
    select: { id: true, slug: true, name: true },
  });

  if (restaurants.length === 0) {
    console.error('❌ No Taipa restaurants found! Run seed-taipa.ts first.');
    return;
  }

  // 1. Create restaurant group
  console.log('   📋 Creating restaurant group...');
  const group = await prisma.restaurantGroup.upsert({
    where: { slug: 'taipa-group' },
    update: {},
    create: {
      name: 'Taipa Restaurant Group',
      slug: 'taipa-group',
      description: 'Taipa Peruvian Restaurant — Kendall & Coral Gables locations',
    },
  });

  // Link restaurants to group
  for (const r of restaurants) {
    await prisma.restaurant.update({
      where: { id: r.id },
      data: { restaurantGroupId: group.id },
    });
  }
  console.log(`   ✅ Group: ${group.name} — ${restaurants.length} restaurants linked`);

  // 2. Upsert team members (dashboard login accounts)
  console.log('   👤 Setting up team members...');
  const memberDefs = [
    { email: 'admin@orderstack.com', password: 'admin123', firstName: 'Admin', lastName: 'User', role: 'super_admin', accessRole: 'owner' },
    { email: 'owner@taipa.com', password: 'owner123', firstName: 'Carlos', lastName: 'Mendoza', role: 'owner', accessRole: 'owner' },
    { email: 'manager@taipa.com', password: 'manager123', firstName: 'Maria', lastName: 'Garcia', role: 'manager', accessRole: 'manager' },
    { email: 'staff@taipa.com', password: 'staff123', firstName: 'Luis', lastName: 'Rodriguez', role: 'staff', accessRole: 'staff' },
  ];

  const createdMembers: Array<{ id: string; email: string; accessRole: string }> = [];

  for (const m of memberDefs) {
    const hash = await hashPassword(m.password);
    const member = await prisma.teamMember.upsert({
      where: { email: m.email },
      update: { restaurantGroupId: group.id, passwordHash: hash },
      create: {
        email: m.email,
        passwordHash: hash,
        firstName: m.firstName,
        lastName: m.lastName,
        displayName: `${m.firstName} ${m.lastName}`,
        role: m.role,
        restaurantGroupId: group.id,
      },
    });
    createdMembers.push({ id: member.id, email: member.email ?? m.email, accessRole: m.accessRole });
    console.log(`   ✅ ${m.email} / ${m.password} (${m.role})`);
  }

  // 3. Link all team members to all restaurants
  for (const r of restaurants) {
    for (const m of createdMembers) {
      await prisma.userRestaurantAccess.upsert({
        where: { teamMemberId_restaurantId: { teamMemberId: m.id, restaurantId: r.id } },
        update: { role: m.accessRole },
        create: { teamMemberId: m.id, restaurantId: r.id, role: m.accessRole },
      });
    }
  }
  console.log(`   ✅ ${createdMembers.length * restaurants.length} access records created`);

  // 4. Create staff PINs per restaurant, each linked to a TeamMember
  //
  // Each staff PIN gets a corresponding TeamMember record in the same restaurant.
  // The StaffPin.teamMemberId FK links them so posLogin() can create a UserSession
  // (which requires a valid TeamMember.id as userId).
  const staffPins = [
    { displayName: 'Carlos (Owner)', pin: '1234', role: 'owner' },
    { displayName: 'Maria (Manager)', pin: '5678', role: 'manager' },
    { displayName: 'Luis (Server)', pin: '1111', role: 'staff' },
    { displayName: 'Ana (Server)', pin: '2222', role: 'staff' },
    { displayName: 'Diego (Bartender)', pin: '3333', role: 'staff' },
    { displayName: 'Sofia (Host)', pin: '4444', role: 'staff' },
    { displayName: 'Miguel (Kitchen)', pin: '5555', role: 'staff' },
    { displayName: 'Isabella (Expo)', pin: '6666', role: 'staff' },
    { displayName: 'Carmen', pin: '7777', role: 'staff' },
    { displayName: 'Elena', pin: '8888', role: 'staff' },
    { displayName: 'Pablo', pin: '9999', role: 'staff' },
    { displayName: 'Roberto', pin: '0000', role: 'staff' },
  ];

  // Clean up existing StaffPins (and unlink any TeamMember.staffPin references)
  for (const r of restaurants) {
    await prisma.staffPin.deleteMany({ where: { restaurantId: r.id } });
  }

  for (const r of restaurants) {
    for (const sp of staffPins) {
      // Upsert a TeamMember for this staff person in this restaurant.
      // Use displayName + restaurantId to find existing records.
      let teamMember = await prisma.teamMember.findFirst({
        where: { displayName: sp.displayName, restaurantId: r.id },
      });

      if (!teamMember) {
        // Extract first name from displayName (strip parenthetical like "Diego (Bartender)")
        const nameParts = sp.displayName.replaceAll(/\s*\(.*?\)/g, '').trim().split(/\s+/);
        teamMember = await prisma.teamMember.create({
          data: {
            displayName: sp.displayName,
            firstName: nameParts[0],
            lastName: nameParts.length > 1 ? nameParts.at(-1) : null,
            role: sp.role,
            restaurantId: r.id,
            status: 'active',
          },
        });
      }

      const pinHash = await hashPin(sp.pin);
      await prisma.staffPin.create({
        data: {
          restaurantId: r.id,
          name: sp.displayName,
          pin: pinHash,
          role: sp.role,
          teamMemberId: teamMember.id,
        },
      });
    }
  }
  console.log(`   ✅ ${staffPins.length * restaurants.length} staff PINs created (linked to TeamMembers)`);

  // 5. Create kitchen stations
  const stations = [
    { name: 'Grill', displayOrder: 1, isExpo: false, color: '#e74c3c' },
    { name: 'Fry', displayOrder: 2, isExpo: false, color: '#f39c12' },
    { name: 'Cold', displayOrder: 3, isExpo: false, color: '#3498db' },
    { name: 'Sauté', displayOrder: 4, isExpo: false, color: '#2ecc71' },
    { name: 'Expo', displayOrder: 5, isExpo: true, color: '#9b59b6' },
  ];

  for (const r of restaurants) {
    for (const s of stations) {
      await prisma.station.upsert({
        where: { restaurantId_name: { restaurantId: r.id, name: s.name } },
        update: { displayOrder: s.displayOrder, isExpo: s.isExpo, color: s.color },
        create: { restaurantId: r.id, ...s },
      });
    }
  }
  console.log(`   ✅ ${stations.length * restaurants.length} stations created`);

  const totalMembers = await prisma.teamMember.count();
  const totalAccess = await prisma.userRestaurantAccess.count();
  const totalPins = await prisma.staffPin.count();
  const totalStations = await prisma.station.count();
  console.log(`   📊 Totals: ${totalMembers} team members, ${totalAccess} access, ${totalPins} PINs, ${totalStations} stations`);
}

// Allow standalone execution
if (require.main === module) {
  seedAuth()
    .catch((error) => {
      console.error('❌ Seed failed:', error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
