/**
 * Seed: Jay's Catering (merchant eea8763a-4933-4080-9881-77e95886c3c0 / jayscatering@gmail.com)
 *
 * Creates:
 *   4  MenuCategory (Proteins, Sides, Desserts, Beverages)
 *   18 MenuItem     (menuType: 'catering')
 *   3  CateringPackageTemplate
 *   8  CateringEvent (one per workflow status)
 *   3  Campaign
 *
 * Safe to re-run — all records use upsert with deterministic IDs.
 * Prerequisite: restaurant eea8763a-4933-4080-9881-77e95886c3c0 must exist.
 *
 * Run: npx tsx prisma/seed-catering.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Merchant ────────────────────────────────────────────────────────────────

const RESTAURANT_ID = 'eea8763a-4933-4080-9881-77e95886c3c0';

// ─── Deterministic UUIDs ─────────────────────────────────────────────────────
// All use valid UUID format (hex only). Prefixes chosen for readability:
//   cafe = categories, feed = menu items, beef = package templates,
//   dead = catering events, face = campaigns

// Menu Categories
const CAT_PROTEINS  = 'cafe0001-0000-4000-8000-000000000001';
const CAT_SIDES     = 'cafe0002-0000-4000-8000-000000000002';
const CAT_DESSERTS  = 'cafe0003-0000-4000-8000-000000000003';
const CAT_BEVERAGES = 'cafe0004-0000-4000-8000-000000000004';

// Menu Items — Proteins
const ITEM_CHICKEN    = 'feed0001-0000-4000-8000-000000000001';
const ITEM_BEEF       = 'feed0002-0000-4000-8000-000000000002';
const ITEM_SALMON     = 'feed0003-0000-4000-8000-000000000003';
const ITEM_PORK       = 'feed0004-0000-4000-8000-000000000004';
const ITEM_PORTOBELLO = 'feed0005-0000-4000-8000-000000000005';
const ITEM_SHRIMP     = 'feed0006-0000-4000-8000-000000000006';

// Menu Items — Sides
const ITEM_MASHED    = 'feed0007-0000-4000-8000-000000000007';
const ITEM_VEGMEDLEY = 'feed0008-0000-4000-8000-000000000008';
const ITEM_CAESAR    = 'feed0009-0000-4000-8000-000000000009';
const ITEM_ROLLS     = 'feed000a-0000-4000-8000-00000000000a';
const ITEM_PASTA     = 'feed000b-0000-4000-8000-00000000000b';
const ITEM_WILDRICE  = 'feed000c-0000-4000-8000-00000000000c';

// Menu Items — Desserts
const ITEM_MINIDESSERTS = 'feed000d-0000-4000-8000-00000000000d';
const ITEM_WEDDINGCAKE  = 'feed000e-0000-4000-8000-00000000000e';
const ITEM_CHOCFOUNTAIN = 'feed000f-0000-4000-8000-00000000000f';

// Menu Items — Beverages
const ITEM_NONALC   = 'feed0010-0000-4000-8000-000000000010';
const ITEM_COFFEE   = 'feed0011-0000-4000-8000-000000000011';
const ITEM_LEMONADE = 'feed0012-0000-4000-8000-000000000012';

// Package Templates
const PKG_CORPORATE = 'beef0001-0000-4000-8000-000000000001';
const PKG_WEDDING   = 'beef0002-0000-4000-8000-000000000002';
const PKG_CUSTOM    = 'beef0003-0000-4000-8000-000000000003';

// Catering Events (Jobs)
const JOB_1 = 'dead0001-0000-4000-8000-000000000001';
const JOB_2 = 'dead0002-0000-4000-8000-000000000002';
const JOB_3 = 'dead0003-0000-4000-8000-000000000003';
const JOB_4 = 'dead0004-0000-4000-8000-000000000004';
const JOB_5 = 'dead0005-0000-4000-8000-000000000005';
const JOB_6 = 'dead0006-0000-4000-8000-000000000006';
const JOB_7 = 'dead0007-0000-4000-8000-000000000007';
const JOB_8 = 'dead0008-0000-4000-8000-000000000008';

// Campaigns
const CAMPAIGN_1 = 'face0001-0000-4000-8000-000000000001';
const CAMPAIGN_2 = 'face0002-0000-4000-8000-000000000002';
const CAMPAIGN_3 = 'face0003-0000-4000-8000-000000000003';

// ─── Date helpers ────────────────────────────────────────────────────────────

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

// ─── Milestone builder ───────────────────────────────────────────────────────

interface Milestone {
  id: string;
  label: string;
  percentage: number;
  amountCents: number;
  dueDate: string;
  paidAt?: string;
  status?: string;
}

interface MilestoneOpts {
  depositPaidDaysAgo?: number;
  midPaidDaysAgo?: number;
  finalPaidDaysAgo?: number;
  finalDueDaysFromNow?: number;
}

function buildMilestones(prefix: string, totalCents: number, opts: MilestoneOpts = {}): Milestone[] {
  const deposit = Math.round(totalCents * 0.25);
  const mid = Math.round(totalCents * 0.5);
  const final = totalCents - deposit - mid;

  const ms: Milestone[] = [
    {
      id: `${prefix}-ms-deposit`,
      label: 'Deposit (25%)',
      percentage: 25,
      amountCents: deposit,
      dueDate: daysFromNow(-30).toISOString(),
    },
    {
      id: `${prefix}-ms-mid`,
      label: 'Mid-Event Payment (50%)',
      percentage: 50,
      amountCents: mid,
      dueDate: daysFromNow(-14).toISOString(),
    },
    {
      id: `${prefix}-ms-final`,
      label: 'Final Payment (25%)',
      percentage: 25,
      amountCents: final,
      dueDate: daysFromNow(opts.finalDueDaysFromNow ?? 7).toISOString(),
    },
  ];

  if (opts.depositPaidDaysAgo !== undefined) {
    ms[0].paidAt = daysFromNow(-opts.depositPaidDaysAgo).toISOString();
  }
  if (opts.midPaidDaysAgo !== undefined) {
    ms[1].paidAt = daysFromNow(-opts.midPaidDaysAgo).toISOString();
  }
  if (opts.finalPaidDaysAgo !== undefined) {
    ms[2].paidAt = daysFromNow(-opts.finalPaidDaysAgo).toISOString();
  }

  return ms;
}

// ─── Package entry builder ───────────────────────────────────────────────────
// pricePerUnit is in CENTS (e.g. 3800 = $38/person)

interface PackageEntry {
  id: string;
  name: string;
  tier: string;
  pricingModel: string;
  pricePerUnit: number;
  minHeadcount: number;
  description: string;
  headcount?: number;
  quotedTotal?: number;
}

function pkgEntry(
  id: string,
  name: string,
  tier: string,
  pricingModel: string,
  pricePerUnitCents: number,
  minHeadcount: number,
  description: string,
  headcount?: number,
): PackageEntry {
  const entry: PackageEntry = { id, name, tier, pricingModel, pricePerUnit: pricePerUnitCents, minHeadcount, description };
  if (headcount !== undefined) {
    entry.headcount = headcount;
    entry.quotedTotal = pricingModel === 'flat' ? pricePerUnitCents : pricePerUnitCents * headcount;
  }
  return entry;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("🌱 Jay's Catering seed starting...");
  console.log(`   Merchant: ${RESTAURANT_ID}\n`);

  // ── Step 1: Menu Categories ─────────────────────────────────────────────────
  console.log('Step 1 — Menu categories...');

  await prisma.menuCategory.upsert({
    where: { id: CAT_PROTEINS },
    update: {},
    create: { id: CAT_PROTEINS, restaurantId: RESTAURANT_ID, name: 'Catering — Proteins', displayOrder: 10, active: true },
  });
  await prisma.menuCategory.upsert({
    where: { id: CAT_SIDES },
    update: {},
    create: { id: CAT_SIDES, restaurantId: RESTAURANT_ID, name: 'Catering — Sides', displayOrder: 11, active: true },
  });
  await prisma.menuCategory.upsert({
    where: { id: CAT_DESSERTS },
    update: {},
    create: { id: CAT_DESSERTS, restaurantId: RESTAURANT_ID, name: 'Catering — Desserts', displayOrder: 12, active: true },
  });
  await prisma.menuCategory.upsert({
    where: { id: CAT_BEVERAGES },
    update: {},
    create: { id: CAT_BEVERAGES, restaurantId: RESTAURANT_ID, name: 'Catering — Beverages', displayOrder: 13, active: true },
  });
  console.log('  ✓ 4 categories\n');

  // ── Step 2: Menu Items ──────────────────────────────────────────────────────
  console.log('Step 2 — Menu items (18)...');

  type ItemSeed = {
    id: string;
    catId: string;
    name: string;
    price: number;   // dollars (Decimal in DB)
    model: string;
    desc: string;
  };

  const itemSeeds: ItemSeed[] = [
    // Proteins
    {
      id: ITEM_CHICKEN, catId: CAT_PROTEINS,
      name: 'Roasted Chicken Breast', price: 12, model: 'per_person',
      desc: 'Herb-seasoned roasted chicken breast with natural pan jus. Priced per person.',
    },
    {
      id: ITEM_BEEF, catId: CAT_PROTEINS,
      name: 'Beef Tenderloin Carved Station', price: 28, model: 'per_person',
      desc: 'Premium carved beef tenderloin station with au jus and horseradish cream. Per person.',
    },
    {
      id: ITEM_SALMON, catId: CAT_PROTEINS,
      name: 'Salmon Filet with Lemon Dill', price: 22, model: 'per_person',
      desc: 'Atlantic salmon filet with lemon dill cream sauce. Priced per person.',
    },
    {
      id: ITEM_PORK, catId: CAT_PROTEINS,
      name: 'BBQ Pulled Pork Tray', price: 85, model: 'per_tray',
      desc: 'Slow-smoked pulled pork in house BBQ sauce. Full tray serves 20.',
    },
    {
      id: ITEM_PORTOBELLO, catId: CAT_PROTEINS,
      name: 'Vegetarian Stuffed Portobello', price: 14, model: 'per_person',
      desc: 'Portobello caps stuffed with roasted vegetables and goat cheese. Per person.',
    },
    {
      id: ITEM_SHRIMP, catId: CAT_PROTEINS,
      name: 'Shrimp Cocktail Display', price: 195, model: 'flat',
      desc: 'Large chilled shrimp cocktail display with cocktail sauce and lemon. Flat rate.',
    },
    // Sides
    {
      id: ITEM_MASHED, catId: CAT_SIDES,
      name: 'Roasted Garlic Mashed Potatoes', price: 55, model: 'per_tray',
      desc: 'Creamy roasted garlic mashed potatoes. Full tray serves 20.',
    },
    {
      id: ITEM_VEGMEDLEY, catId: CAT_SIDES,
      name: 'Seasonal Vegetable Medley', price: 45, model: 'per_tray',
      desc: "Chef's seasonal vegetable medley, herb-roasted. Full tray serves 20.",
    },
    {
      id: ITEM_CAESAR, catId: CAT_SIDES,
      name: 'Caesar Salad Station', price: 7, model: 'per_person',
      desc: 'Classic Caesar salad with house-made dressing, croutons, and parmesan. Per person.',
    },
    {
      id: ITEM_ROLLS, catId: CAT_SIDES,
      name: 'Artisan Bread Rolls', price: 3, model: 'per_person',
      desc: 'Fresh-baked artisan rolls served with whipped butter. Per person.',
    },
    {
      id: ITEM_PASTA, catId: CAT_SIDES,
      name: 'Pasta Primavera', price: 65, model: 'per_tray',
      desc: 'Penne with seasonal vegetables in marinara or alfredo sauce. Full tray serves 25.',
    },
    {
      id: ITEM_WILDRICE, catId: CAT_SIDES,
      name: 'Wild Rice Pilaf', price: 50, model: 'per_tray',
      desc: 'Wild rice pilaf with toasted almonds and dried cranberries. Full tray serves 20.',
    },
    // Desserts
    {
      id: ITEM_MINIDESSERTS, catId: CAT_DESSERTS,
      name: 'Assorted Mini Desserts', price: 9, model: 'per_person',
      desc: "Chef's mini dessert selection: cheesecakes, brownies, fruit tarts. Per person.",
    },
    {
      id: ITEM_WEDDINGCAKE, catId: CAT_DESSERTS,
      name: 'Wedding Cake Cutting Service', price: 150, model: 'flat',
      desc: 'Professional wedding cake cutting and plating service. Flat rate.',
    },
    {
      id: ITEM_CHOCFOUNTAIN, catId: CAT_DESSERTS,
      name: 'Chocolate Fountain with Dippers', price: 275, model: 'flat',
      desc: 'Belgian chocolate fountain with strawberries, marshmallows, pretzels, pound cake. Flat rate.',
    },
    // Beverages
    {
      id: ITEM_NONALC, catId: CAT_BEVERAGES,
      name: 'Non-Alcoholic Beverage Station', price: 6, model: 'per_person',
      desc: 'Assorted soft drinks, sparkling water, and juice station. Per person.',
    },
    {
      id: ITEM_COFFEE, catId: CAT_BEVERAGES,
      name: 'Coffee & Tea Service', price: 5, model: 'per_person',
      desc: 'Full coffee and tea service with cream, sugar, and sweeteners. Per person.',
    },
    {
      id: ITEM_LEMONADE, catId: CAT_BEVERAGES,
      name: 'Lemonade Pitcher', price: 35, model: 'flat',
      desc: 'Fresh-squeezed lemonade, one pitcher serves 8–10. Flat rate.',
    },
  ];

  for (const item of itemSeeds) {
    await prisma.menuItem.upsert({
      where: { id: item.id },
      update: {
        name: item.name,
        price: item.price,
        description: item.desc,
        menuType: 'catering',
        cateringPricingModel: item.model,
      },
      create: {
        id: item.id,
        restaurantId: RESTAURANT_ID,
        categoryId: item.catId,
        name: item.name,
        description: item.desc,
        price: item.price,
        menuType: 'catering',
        cateringPricingModel: item.model,
        cateringPricing: [],
        available: true,
        displayOrder: 0,
      },
    });
  }
  console.log(`  ✓ ${itemSeeds.length} menu items\n`);

  // ── Step 3: Package Templates ───────────────────────────────────────────────
  console.log('Step 3 — Catering package templates (3)...');

  const corpMenuItemIds = [
    ITEM_CHICKEN, ITEM_PASTA, ITEM_CAESAR, ITEM_ROLLS, ITEM_VEGMEDLEY, ITEM_NONALC, ITEM_COFFEE,
  ];
  const weddingMenuItemIds = [
    ITEM_BEEF, ITEM_SALMON, ITEM_MASHED, ITEM_VEGMEDLEY, ITEM_CAESAR,
    ITEM_ROLLS, ITEM_MINIDESSERTS, ITEM_WEDDINGCAKE, ITEM_NONALC, ITEM_COFFEE,
  ];
  const allMenuItemIds = itemSeeds.map((i) => i.id);

  await prisma.cateringPackageTemplate.upsert({
    where: { id: PKG_CORPORATE },
    update: { name: 'Corporate Lunch Buffet', pricePerUnitCents: 3800, minimumHeadcount: 20, menuItemIds: corpMenuItemIds },
    create: {
      id: PKG_CORPORATE,
      merchantId: RESTAURANT_ID,
      name: 'Corporate Lunch Buffet',
      tier: 'standard',
      pricingModel: 'per_person',
      pricePerUnitCents: 3800,
      minimumHeadcount: 20,
      description: 'A professional lunch buffet ideal for corporate meetings and training days. Includes protein, two sides, salad, and beverages.',
      menuItemIds: corpMenuItemIds,
      isActive: true,
    },
  });

  await prisma.cateringPackageTemplate.upsert({
    where: { id: PKG_WEDDING },
    update: { name: 'Wedding Reception Plated', pricePerUnitCents: 8500, minimumHeadcount: 50, menuItemIds: weddingMenuItemIds },
    create: {
      id: PKG_WEDDING,
      merchantId: RESTAURANT_ID,
      name: 'Wedding Reception Plated',
      tier: 'premium',
      pricingModel: 'per_person',
      pricePerUnitCents: 8500,
      minimumHeadcount: 50,
      description: 'Elegant plated service for weddings. Choice of two proteins, two sides, salad, dessert, and full beverage service.',
      menuItemIds: weddingMenuItemIds,
      isActive: true,
    },
  });

  await prisma.cateringPackageTemplate.upsert({
    where: { id: PKG_CUSTOM },
    update: { name: 'Custom Event Package', pricePerUnitCents: 0, minimumHeadcount: 10, menuItemIds: allMenuItemIds },
    create: {
      id: PKG_CUSTOM,
      merchantId: RESTAURANT_ID,
      name: 'Custom Event Package',
      tier: 'custom',
      pricingModel: 'flat',
      pricePerUnitCents: 0,
      minimumHeadcount: 10,
      description: 'Fully customizable package. Work with our team to select exactly what you need for your unique event.',
      menuItemIds: allMenuItemIds,
      isActive: true,
    },
  });
  console.log('  ✓ 3 package templates\n');

  // ── Step 4: Catering Events (8 jobs) ───────────────────────────────────────
  console.log('Step 4 — Catering events (8)...');

  // Job 1 — inquiry: Smith Wedding
  await prisma.cateringEvent.upsert({
    where: { id: JOB_1 },
    update: {},
    create: {
      id: JOB_1,
      restaurantId: RESTAURANT_ID,
      title: 'Smith Wedding Inquiry',
      eventType: 'wedding',
      status: 'inquiry',
      fulfillmentDate: daysFromNow(75),
      bookingDate: daysFromNow(-2),
      startTime: '17:00',
      endTime: '22:00',
      headcount: 120,
      locationType: 'off_site',
      locationAddress: 'The Gardens at Miramar, 500 Miramar Blvd, Miramar FL 33025',
      clientName: 'Sarah Smith',
      clientEmail: 'sarah.smith@email.com',
      companyName: null,
      notes: 'Client inquired about wedding reception for 120 guests. Prefers outdoor setup.',
      packages: [],
      milestones: [],
      totalCents: 0,
      paidCents: 0,
    },
  });

  // Job 2 — proposal_sent: Meridian Tech Q2 All-Hands
  const job2Packages: PackageEntry[] = [
    pkgEntry(PKG_CORPORATE, 'Corporate Lunch Buffet', 'standard', 'per_person', 3800, 20,
      'A professional lunch buffet ideal for corporate meetings and training days. Includes protein, two sides, salad, and beverages.', 85),
    pkgEntry(PKG_CUSTOM, 'Custom Event Package', 'custom', 'flat', 480000, 10,
      'Fully customizable package. Work with our team to select exactly what you need for your unique event.'),
  ];
  await prisma.cateringEvent.upsert({
    where: { id: JOB_2 },
    update: {},
    create: {
      id: JOB_2,
      restaurantId: RESTAURANT_ID,
      title: 'Meridian Tech Q2 All-Hands',
      eventType: 'corporate',
      status: 'proposal_sent',
      fulfillmentDate: daysFromNow(45),
      bookingDate: daysFromNow(-5),
      startTime: '11:30',
      endTime: '13:30',
      headcount: 85,
      locationType: 'off_site',
      locationAddress: 'Meridian Tech HQ, 1200 Brickell Ave, Miami FL 33131',
      clientName: 'David Chen',
      clientEmail: 'd.chen@meridiantech.com',
      companyName: 'Meridian Technology Group',
      packages: job2Packages,
      selectedPackageId: null,
      milestones: buildMilestones('job2', 323000),
      totalCents: 323000,
      paidCents: 0,
    },
  });

  // Job 3 — contract_signed: Rivera Quinceañera
  const job3Packages: PackageEntry[] = [
    pkgEntry(PKG_WEDDING, 'Wedding Reception Plated', 'premium', 'per_person', 8500, 50,
      'Elegant plated service for weddings. Choice of two proteins, two sides, salad, dessert, and full beverage service.', 65),
  ];
  await prisma.cateringEvent.upsert({
    where: { id: JOB_3 },
    update: {},
    create: {
      id: JOB_3,
      restaurantId: RESTAURANT_ID,
      title: 'Rivera Quinceañera',
      eventType: 'birthday',
      status: 'contract_signed',
      fulfillmentDate: daysFromNow(30),
      bookingDate: daysFromNow(-12),
      startTime: '18:00',
      endTime: '23:00',
      headcount: 65,
      locationType: 'on_site',
      locationAddress: null,
      clientName: 'Maria Rivera',
      clientEmail: 'mrivera@gmail.com',
      companyName: null,
      contractSignedAt: daysFromNow(-8),
      packages: job3Packages,
      selectedPackageId: PKG_WEDDING,
      milestones: buildMilestones('job3', 552500),
      totalCents: 552500,
      paidCents: 0,
    },
  });

  // Job 4 — deposit_received: Broward County Bar Association Annual Dinner
  const job4Packages: PackageEntry[] = [
    pkgEntry(PKG_WEDDING, 'Wedding Reception Plated', 'premium', 'per_person', 8500, 50,
      'Elegant plated service for weddings. Choice of two proteins, two sides, salad, dessert, and full beverage service.', 200),
  ];
  await prisma.cateringEvent.upsert({
    where: { id: JOB_4 },
    update: {},
    create: {
      id: JOB_4,
      restaurantId: RESTAURANT_ID,
      title: 'Broward County Bar Association Annual Dinner',
      eventType: 'corporate',
      status: 'deposit_received',
      fulfillmentDate: daysFromNow(60),
      bookingDate: daysFromNow(-20),
      startTime: '19:00',
      endTime: '23:30',
      headcount: 200,
      locationType: 'off_site',
      locationAddress: 'Ft. Lauderdale Marriott, 1881 SE 17th St, Fort Lauderdale FL 33316',
      clientName: 'James Whitmore',
      clientEmail: 'jwhitmore@bcba.org',
      companyName: 'Broward County Bar Association',
      contractSignedAt: daysFromNow(-16),
      packages: job4Packages,
      selectedPackageId: PKG_WEDDING,
      milestones: buildMilestones('job4', 1700000, { depositPaidDaysAgo: 10 }),
      totalCents: 1700000,
      paidCents: 425000,
    },
  });

  // Job 5 — in_progress: Palm Beach Charity Gala
  const job5Packages: PackageEntry[] = [
    pkgEntry(PKG_WEDDING, 'Wedding Reception Plated', 'premium', 'per_person', 8500, 50,
      'Elegant plated service for weddings. Choice of two proteins, two sides, salad, dessert, and full beverage service.', 150),
    pkgEntry('feed000f-addon-choc-0000-000000000001', 'Chocolate Fountain with Dippers', 'addon', 'flat', 27500, 1,
      'Belgian chocolate fountain with dippers. Add-on.'),
    pkgEntry('feed0006-addon-shrimp-000-000000000001', 'Shrimp Cocktail Display', 'addon', 'flat', 19500, 1,
      'Large chilled shrimp cocktail display. Add-on.'),
  ];
  await prisma.cateringEvent.upsert({
    where: { id: JOB_5 },
    update: {},
    create: {
      id: JOB_5,
      restaurantId: RESTAURANT_ID,
      title: 'Palm Beach Charity Gala',
      eventType: 'fundraiser',
      status: 'in_progress',
      fulfillmentDate: daysFromNow(4),
      bookingDate: daysFromNow(-35),
      startTime: '18:30',
      endTime: '22:30',
      headcount: 150,
      locationType: 'off_site',
      locationAddress: 'The Breakers Palm Beach, 1 South County Rd, Palm Beach FL 33480',
      clientName: 'Patricia Holloway',
      clientEmail: 'pholloway@pbcharity.org',
      companyName: "Palm Beach Children's Foundation",
      contractSignedAt: daysFromNow(-30),
      packages: job5Packages,
      selectedPackageId: PKG_WEDDING,
      milestones: buildMilestones('job5', 1420000, { depositPaidDaysAgo: 28, midPaidDaysAgo: 7 }),
      totalCents: 1420000,
      paidCents: 1065000,
    },
  });

  // Job 6 — final_payment: Goldstein Bar Mitzvah
  const job6Packages: PackageEntry[] = [
    pkgEntry(PKG_CUSTOM, 'Custom Event Package', 'custom', 'flat', 0, 10,
      'Fully customizable package. Work with our team to select exactly what you need for your unique event.'),
    pkgEntry('feed000f-addon-choc-0000-000000000002', 'Chocolate Fountain with Dippers', 'addon', 'flat', 27500, 1,
      'Belgian chocolate fountain with dippers. Add-on.'),
    pkgEntry('feed0011-addon-coffee-000-000000000001', 'Coffee & Tea Service', 'addon', 'per_person', 500, 1,
      'Full coffee and tea service. Per person.', 90),
  ];
  await prisma.cateringEvent.upsert({
    where: { id: JOB_6 },
    update: {},
    create: {
      id: JOB_6,
      restaurantId: RESTAURANT_ID,
      title: 'Goldstein Bar Mitzvah',
      eventType: 'social',
      status: 'final_payment',
      fulfillmentDate: daysFromNow(-3),
      bookingDate: daysFromNow(-60),
      startTime: '16:00',
      endTime: '21:00',
      headcount: 90,
      locationType: 'off_site',
      locationAddress: 'Temple Beth El, 1351 S 14th Ave, Hollywood FL 33020',
      clientName: 'Robert Goldstein',
      clientEmail: 'rgoldstein@email.com',
      companyName: null,
      contractSignedAt: daysFromNow(-55),
      packages: job6Packages,
      selectedPackageId: PKG_CUSTOM,
      milestones: buildMilestones('job6', 875000, { depositPaidDaysAgo: 55, midPaidDaysAgo: 21, finalDueDaysFromNow: 7 }),
      totalCents: 875000,
      paidCents: 656250,
    },
  });

  // Job 7 — completed: FPL Executive Offsite Luncheon
  const job7Packages: PackageEntry[] = [
    pkgEntry(PKG_CORPORATE, 'Corporate Lunch Buffet', 'standard', 'per_person', 3800, 20,
      'A professional lunch buffet ideal for corporate meetings and training days. Includes protein, two sides, salad, and beverages.', 45),
  ];
  await prisma.cateringEvent.upsert({
    where: { id: JOB_7 },
    update: {},
    create: {
      id: JOB_7,
      restaurantId: RESTAURANT_ID,
      title: 'FPL Executive Offsite Luncheon',
      eventType: 'corporate',
      status: 'completed',
      fulfillmentDate: daysFromNow(-14),
      bookingDate: daysFromNow(-90),
      startTime: '12:00',
      endTime: '15:00',
      headcount: 45,
      locationType: 'off_site',
      locationAddress: 'Jungle Island, 1111 Parrot Jungle Trail, Miami FL 33132',
      clientName: 'Angela Torres',
      clientEmail: 'atorres@fpl.com',
      companyName: 'Florida Power & Light',
      contractSignedAt: daysFromNow(-85),
      packages: job7Packages,
      selectedPackageId: PKG_CORPORATE,
      milestones: buildMilestones('job7', 171000, { depositPaidDaysAgo: 80, midPaidDaysAgo: 40, finalPaidDaysAgo: 10 }),
      totalCents: 171000,
      paidCents: 171000,
    },
  });

  // Job 8 — cancelled: Downtown Boca Networking Event
  const job8Packages: PackageEntry[] = [
    pkgEntry(PKG_CORPORATE, 'Corporate Lunch Buffet', 'standard', 'per_person', 3800, 20,
      'A professional lunch buffet ideal for corporate meetings and training days. Includes protein, two sides, salad, and beverages.', 60),
  ];
  const job8Milestones: Milestone[] = [
    {
      id: 'job8-ms-deposit',
      label: 'Deposit (25%)',
      percentage: 25,
      amountCents: 57000,
      dueDate: daysFromNow(-25).toISOString(),
      paidAt: daysFromNow(-25).toISOString(),
    },
    {
      id: 'job8-ms-mid',
      label: 'Mid-Event Payment (50%)',
      percentage: 50,
      amountCents: 114000,
      dueDate: daysFromNow(-7).toISOString(),
      status: 'cancelled',
    },
    {
      id: 'job8-ms-final',
      label: 'Final Payment (25%)',
      percentage: 25,
      amountCents: 57000,
      dueDate: daysFromNow(17).toISOString(),
      status: 'cancelled',
    },
  ];
  await prisma.cateringEvent.upsert({
    where: { id: JOB_8 },
    update: {},
    create: {
      id: JOB_8,
      restaurantId: RESTAURANT_ID,
      title: 'Downtown Boca Networking Event',
      eventType: 'corporate',
      status: 'cancelled',
      fulfillmentDate: daysFromNow(10),
      bookingDate: daysFromNow(-30),
      startTime: '11:30',
      endTime: '13:30',
      headcount: 60,
      locationType: 'on_site',
      locationAddress: null,
      clientName: 'Kevin Walsh',
      clientEmail: 'kwalsh@bocachamber.com',
      companyName: 'Boca Raton Chamber of Commerce',
      packages: job8Packages,
      selectedPackageId: PKG_CORPORATE,
      milestones: job8Milestones,
      notes: 'Client cancelled due to venue flooding. Deposit retained per contract.',
      totalCents: 228000,
      paidCents: 57000,
    },
  });
  console.log('  ✓ 8 catering events\n');

  // ── Step 5: Campaigns ───────────────────────────────────────────────────────
  console.log('Step 5 — Campaigns (3)...');

  await prisma.campaign.upsert({
    where: { id: CAMPAIGN_1 },
    update: {},
    create: {
      id: CAMPAIGN_1,
      restaurantId: RESTAURANT_ID,
      name: 'Spring Wedding Season 2025',
      channel: 'email',
      type: 'event',
      status: 'scheduled',
      subject: 'Book Your Spring Wedding — Limited Dates Available',
      body: "Spring is the perfect time for weddings in South Florida. Jay's Catering is booking April–June 2025. Our Wedding Reception Plated package starts at $85/person. Contact us today to secure your date.",
      audienceSegment: 'wedding',
      estimatedRecipients: 450,
      scheduledAt: daysFromNow(3),
    },
  });

  await prisma.campaign.upsert({
    where: { id: CAMPAIGN_2 },
    update: {},
    create: {
      id: CAMPAIGN_2,
      restaurantId: RESTAURANT_ID,
      name: 'Corporate Catering Promo — 10% Off',
      channel: 'email',
      type: 'promotion',
      status: 'scheduled',
      subject: 'Exclusive Offer: 10% Off Corporate Events This Quarter',
      body: 'Planning a corporate lunch, offsite, or training day? Book by end of quarter and receive 10% off our Corporate Lunch Buffet package. Minimum 20 guests. Use code CORP10 when booking.',
      audienceSegment: 'corporate',
      estimatedRecipients: 280,
      scheduledAt: daysFromNow(7),
    },
  });

  await prisma.campaign.upsert({
    where: { id: CAMPAIGN_3 },
    update: {},
    create: {
      id: CAMPAIGN_3,
      restaurantId: RESTAURANT_ID,
      name: 'Follow-Up: Completed Events',
      channel: 'email',
      type: 're-engagement',
      status: 'sent',
      subject: 'Thank You — We Hope Your Event Was Memorable',
      body: "Thank you for choosing Jay's Catering for your recent event. We hope everything exceeded your expectations. We'd love to hear your feedback and help plan your next celebration.",
      audienceSegment: 'completed_events',
      estimatedRecipients: 12,
      sentAt: daysFromNow(-5),
    },
  });
  console.log('  ✓ 3 campaigns\n');

  // ── Step 6: Staff Scheduling (skipped) ─────────────────────────────────────
  console.log('Step 6 — Staff scheduling: SKIPPED');
  console.log('  ⚠ No StaffSchedule model tied to CateringEvent. Shift model requires StaffPin FK, not a CateringEvent FK.\n');

  // ── Step 7: Delivery records (skipped) ─────────────────────────────────────
  console.log('Step 7 — Delivery records: SKIPPED');
  console.log('  ⚠ No Delivery model in schema tied to CateringEvent. Delivery logistics are stored as deliveryDetails JSON on CateringEvent.\n');

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('✅ Seed complete!\n');
  console.log('  MenuCategory:            4');
  console.log('  MenuItem:               18');
  console.log('  CateringPackageTemplate: 3');
  console.log('  CateringEvent:           8');
  console.log('  Campaign:                3');
  console.log('  Total records:          36\n');
}

main()
  .catch((err: unknown) => {
    console.error('❌ Seed failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
