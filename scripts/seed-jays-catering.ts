/**
 * Seed script for Jay's Catering Number 3
 * Creates a catering-mode restaurant with American-style menu,
 * catering events with full financial data (packages, milestones,
 * dietary, delivery logistics), customers, team members, and capacity settings.
 *
 * Run: npx tsx scripts/seed-jays-catering.ts
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { toErrorMessage } from '../src/utils/errors';

const prisma = new PrismaClient();
const SALT_ROUNDS = 12;

// ============================================================
// RESTAURANT
// ============================================================

const RESTAURANT = {
  name: "Jay's Catering",
  slug: 'jays-catering-3',
  description: "Jay's Catering Number 3 — South Florida's go-to for weddings, corporate events, and backyard BBQs. American comfort food with a Southern flair.",
  phone: '954-555-0103',
  address: '1200 E Sunrise Blvd',
  city: 'Fort Lauderdale',
  state: 'FL',
  zip: '33304',
  cuisineType: 'American',
  businessCategory: 'catering',
  tier: 2,
  taxRate: 0.07,
  deliveryEnabled: true,
  pickupEnabled: false,
  dineInEnabled: false,
};

const MERCHANT_PROFILE = {
  id: crypto.randomUUID(),
  businessName: "Jay's Catering Number 3",
  address: {
    street: '1200 E Sunrise Blvd',
    city: 'Fort Lauderdale',
    state: 'FL',
    zip: '33304',
    phone: '954-555-0103',
  },
  verticals: ['food_and_drink'] as string[],
  primaryVertical: 'food_and_drink',
  complexity: 'full',
  enabledModules: [
    'menu_management',
    'invoicing',
    'customer_management',
    'reporting',
    'team_management',
    'marketing',
  ],
  defaultDeviceMode: 'catering',
  taxLocale: {
    taxRate: 7,
    taxInclusive: false,
    currency: 'USD',
    defaultLanguage: 'en',
  },
  businessHours: [],
  businessCategory: 'catering',
  onboardingComplete: true,
  createdAt: new Date().toISOString(),
};

// ============================================================
// MENU — American Catering (per-person and per-tray pricing)
// ============================================================

const CATEGORIES = [
  { name: 'Appetizer Platters', description: 'Starters and passed hors d\'oeuvres', displayOrder: 1 },
  { name: 'Salads', description: 'Fresh salads by the tray', displayOrder: 2 },
  { name: 'BBQ & Smoked Meats', description: 'Low and slow smoked proteins', displayOrder: 3 },
  { name: 'Entrees', description: 'Main course options', displayOrder: 4 },
  { name: 'Comfort Sides', description: 'Classic American sides', displayOrder: 5 },
  { name: 'Sandwiches & Wraps', description: 'Lunch platters', displayOrder: 6 },
  { name: 'Breakfast & Brunch', description: 'Morning event menus', displayOrder: 7 },
  { name: 'Desserts', description: 'Sweets and pastries', displayOrder: 8 },
  { name: 'Beverages', description: 'Drinks and beverage service', displayOrder: 9 },
  { name: 'Kids Menu', description: 'Options for young guests', displayOrder: 10 },
];

interface SeedMenuItem {
  name: string;
  description: string;
  price: number;
  category: string;
  dietary?: string[];
}

const MENU_ITEMS: SeedMenuItem[] = [
  // APPETIZER PLATTERS
  { name: 'Deviled Egg Platter', description: 'Classic deviled eggs with paprika. Serves 20.', price: 45, category: 'Appetizer Platters' },
  { name: 'Chicken Wings Tray', description: 'Buffalo, BBQ, or garlic parmesan. 50 pieces.', price: 75, category: 'Appetizer Platters' },
  { name: 'Spinach & Artichoke Dip', description: 'Warm dip with tortilla chips and crostini. Serves 25.', price: 55, category: 'Appetizer Platters' },
  { name: 'Shrimp Cocktail Display', description: 'Chilled jumbo shrimp with cocktail sauce. 50 pieces.', price: 120, category: 'Appetizer Platters' },
  { name: 'Bruschetta Platter', description: 'Toasted baguette with fresh tomato-basil topping. 40 pieces.', price: 50, category: 'Appetizer Platters' },
  { name: 'Meatball Slider Tray', description: 'Beef meatballs in marinara on mini buns. 30 sliders.', price: 65, category: 'Appetizer Platters' },
  { name: 'Cheese & Charcuterie Board', description: 'Artisan cheeses, cured meats, crackers, fruit. Serves 20.', price: 85, category: 'Appetizer Platters' },
  { name: 'Veggie Crudite Platter', description: 'Seasonal vegetables with ranch and hummus. Serves 25.', price: 40, category: 'Appetizer Platters', dietary: ['vegetarian'] },
  { name: 'Pigs in a Blanket', description: 'Mini franks wrapped in puff pastry. 50 pieces.', price: 55, category: 'Appetizer Platters' },
  { name: 'Caprese Skewers', description: 'Fresh mozzarella, cherry tomato, basil with balsamic glaze. 40 skewers.', price: 60, category: 'Appetizer Platters', dietary: ['vegetarian'] },

  // SALADS
  { name: 'Caesar Salad Tray', description: 'Romaine, parmesan, croutons, house Caesar. Serves 15.', price: 45, category: 'Salads' },
  { name: 'Garden Salad Tray', description: 'Mixed greens, tomatoes, cucumbers, carrots. Serves 15.', price: 35, category: 'Salads', dietary: ['vegetarian', 'vegan'] },
  { name: 'Southern Potato Salad', description: 'Creamy mustard potato salad. Serves 20.', price: 40, category: 'Salads' },
  { name: 'Classic Coleslaw', description: 'Creamy coleslaw with cabbage and carrots. Serves 20.', price: 30, category: 'Salads', dietary: ['vegetarian'] },
  { name: 'Pasta Salad', description: 'Rotini with Italian dressing, olives, peppers, cheese. Serves 15.', price: 35, category: 'Salads', dietary: ['vegetarian'] },
  { name: 'Fruit Salad Bowl', description: 'Seasonal fresh fruit. Serves 20.', price: 45, category: 'Salads', dietary: ['vegetarian', 'vegan', 'gluten-free'] },

  // BBQ & SMOKED MEATS
  { name: 'Smoked Brisket', description: 'Texas-style beef brisket, 12-hour smoke. Per pound.', price: 28, category: 'BBQ & Smoked Meats' },
  { name: 'Pulled Pork', description: 'Hickory-smoked pulled pork with Carolina sauce. Per pound.', price: 18, category: 'BBQ & Smoked Meats' },
  { name: 'Baby Back Ribs', description: 'Full rack glazed with house BBQ. Per rack.', price: 32, category: 'BBQ & Smoked Meats' },
  { name: 'Smoked Chicken Halves', description: 'Whole chickens smoked with herb rub. Per half.', price: 14, category: 'BBQ & Smoked Meats' },
  { name: 'Smoked Sausage Links', description: 'Beef and pork sausage. Per pound.', price: 16, category: 'BBQ & Smoked Meats' },
  { name: 'BBQ Burnt Ends', description: 'Brisket point cubed and glazed. Per pound.', price: 32, category: 'BBQ & Smoked Meats' },

  // ENTREES
  { name: 'Herb Roasted Chicken', description: 'Bone-in chicken with rosemary jus. Per person.', price: 16, category: 'Entrees' },
  { name: 'Grilled Salmon', description: 'Atlantic salmon with lemon-dill butter. Per person.', price: 24, category: 'Entrees', dietary: ['gluten-free'] },
  { name: 'Beef Tenderloin', description: 'Roasted beef tenderloin with horseradish cream. Per person.', price: 38, category: 'Entrees', dietary: ['gluten-free'] },
  { name: 'Chicken Marsala', description: 'Pan-seared chicken in mushroom marsala sauce. Per person.', price: 18, category: 'Entrees' },
  { name: 'Shrimp & Grits', description: 'Sauteed shrimp over stone-ground cheddar grits. Per person.', price: 20, category: 'Entrees' },
  { name: 'Pasta Primavera', description: 'Penne with roasted vegetables in garlic cream sauce. Per person.', price: 14, category: 'Entrees', dietary: ['vegetarian'] },
  { name: 'Chicken Parmesan', description: 'Breaded chicken with marinara and mozzarella. Per person.', price: 16, category: 'Entrees' },
  { name: 'Meatloaf', description: 'Classic glazed meatloaf with gravy. Per person.', price: 14, category: 'Entrees' },

  // COMFORT SIDES
  { name: 'Mac & Cheese', description: 'Three-cheese baked mac. Serves 15.', price: 40, category: 'Comfort Sides', dietary: ['vegetarian'] },
  { name: 'Cornbread', description: 'Honey butter cornbread. 24 pieces.', price: 30, category: 'Comfort Sides', dietary: ['vegetarian'] },
  { name: 'Baked Beans', description: 'Smoky brown sugar baked beans. Serves 15.', price: 35, category: 'Comfort Sides' },
  { name: 'Collard Greens', description: 'Slow-braised collard greens with smoked ham hock. Serves 15.', price: 35, category: 'Comfort Sides' },
  { name: 'Mashed Potatoes & Gravy', description: 'Yukon gold mashed potatoes with turkey gravy. Serves 15.', price: 35, category: 'Comfort Sides', dietary: ['vegetarian'] },
  { name: 'Roasted Seasonal Vegetables', description: 'Chef\'s selection roasted veggies. Serves 15.', price: 35, category: 'Comfort Sides', dietary: ['vegetarian', 'vegan', 'gluten-free'] },
  { name: 'Green Bean Casserole', description: 'Classic green bean casserole with crispy onions. Serves 15.', price: 30, category: 'Comfort Sides', dietary: ['vegetarian'] },
  { name: 'Jalapeño Cheddar Grits', description: 'Creamy stone-ground grits. Serves 15.', price: 30, category: 'Comfort Sides', dietary: ['vegetarian'] },
  { name: 'Dinner Rolls', description: 'Warm butter rolls. 24 count.', price: 18, category: 'Comfort Sides', dietary: ['vegetarian'] },

  // SANDWICHES & WRAPS
  { name: 'Pulled Pork Sliders', description: 'BBQ pulled pork on brioche with slaw. 24 sliders.', price: 65, category: 'Sandwiches & Wraps' },
  { name: 'Turkey Club Wraps', description: 'Turkey, bacon, lettuce, tomato in flour tortilla. 12 wraps.', price: 55, category: 'Sandwiches & Wraps' },
  { name: 'Chicken Salad Croissants', description: 'House chicken salad on butter croissants. 12 count.', price: 60, category: 'Sandwiches & Wraps' },
  { name: 'Italian Sub Platter', description: 'Salami, capicola, provolone, hot peppers. 12 halves.', price: 65, category: 'Sandwiches & Wraps' },
  { name: 'Veggie Wrap Platter', description: 'Hummus, roasted peppers, greens, feta. 12 wraps.', price: 50, category: 'Sandwiches & Wraps', dietary: ['vegetarian'] },
  { name: 'Burger Bar', description: 'Angus patties with buns, cheese, and all the fixings. Per person.', price: 12, category: 'Sandwiches & Wraps' },

  // BREAKFAST & BRUNCH
  { name: 'Scrambled Eggs Tray', description: 'Fluffy scrambled eggs. Serves 15.', price: 30, category: 'Breakfast & Brunch', dietary: ['vegetarian', 'gluten-free'] },
  { name: 'Bacon & Sausage Platter', description: 'Crispy bacon and breakfast sausage links. Serves 15.', price: 45, category: 'Breakfast & Brunch', dietary: ['gluten-free'] },
  { name: 'French Toast Casserole', description: 'Baked cinnamon french toast with maple syrup. Serves 15.', price: 40, category: 'Breakfast & Brunch', dietary: ['vegetarian'] },
  { name: 'Biscuits & Gravy', description: 'Buttermilk biscuits with sausage gravy. Serves 15.', price: 35, category: 'Breakfast & Brunch' },
  { name: 'Fruit & Yogurt Parfait Cups', description: 'Layered granola, yogurt, fresh berries. 20 cups.', price: 50, category: 'Breakfast & Brunch', dietary: ['vegetarian'] },
  { name: 'Bagel & Lox Platter', description: 'Assorted bagels, cream cheese, smoked salmon, capers. Serves 12.', price: 75, category: 'Breakfast & Brunch' },
  { name: 'Breakfast Burrito Tray', description: 'Eggs, cheese, peppers, sausage in flour tortillas. 12 burritos.', price: 55, category: 'Breakfast & Brunch' },

  // DESSERTS
  { name: 'Chocolate Brownie Bites', description: 'Fudge brownie squares. 36 pieces.', price: 40, category: 'Desserts', dietary: ['vegetarian'] },
  { name: 'Mini Cheesecake Assortment', description: 'New York, strawberry, and key lime. 24 pieces.', price: 60, category: 'Desserts', dietary: ['vegetarian'] },
  { name: 'Cookie Platter', description: 'Chocolate chip, oatmeal raisin, snickerdoodle. 36 cookies.', price: 35, category: 'Desserts', dietary: ['vegetarian'] },
  { name: 'Banana Pudding', description: 'Southern banana pudding with vanilla wafers. Serves 20.', price: 45, category: 'Desserts', dietary: ['vegetarian'] },
  { name: 'Peach Cobbler', description: 'Warm peach cobbler with buttery crumble. Serves 15.', price: 40, category: 'Desserts', dietary: ['vegetarian'] },
  { name: 'Custom Sheet Cake', description: 'Vanilla or chocolate with buttercream. Serves 40.', price: 85, category: 'Desserts', dietary: ['vegetarian'] },
  { name: 'Key Lime Pie', description: 'Traditional Florida key lime pie. Serves 8.', price: 28, category: 'Desserts', dietary: ['vegetarian'] },

  // BEVERAGES
  { name: 'Sweet Tea (3 gal)', description: 'Southern sweet iced tea. Serves 40.', price: 25, category: 'Beverages', dietary: ['vegan'] },
  { name: 'Lemonade (3 gal)', description: 'Fresh-squeezed lemonade. Serves 40.', price: 30, category: 'Beverages', dietary: ['vegan'] },
  { name: 'Coffee Service', description: 'Regular and decaf with cream, sugar. Serves 25.', price: 45, category: 'Beverages', dietary: ['vegan'] },
  { name: 'Water & Soda Package', description: 'Bottled water and assorted cans. Per person.', price: 4, category: 'Beverages' },
  { name: 'Arnold Palmer (3 gal)', description: 'Half sweet tea, half lemonade. Serves 40.', price: 28, category: 'Beverages', dietary: ['vegan'] },

  // KIDS MENU
  { name: 'Chicken Tenders & Fries', description: 'Crispy chicken strips with fries and ketchup. Per child.', price: 8, category: 'Kids Menu' },
  { name: 'Mini Corn Dogs', description: 'Bite-size corn dogs. 24 pieces.', price: 30, category: 'Kids Menu' },
  { name: 'PB&J Sandwiches', description: 'Classic peanut butter and jelly on white bread. 12 halves.', price: 20, category: 'Kids Menu' },
  { name: 'Mac & Cheese Cups', description: 'Individual mac and cheese cups. 12 count.', price: 25, category: 'Kids Menu', dietary: ['vegetarian'] },
  { name: 'Juice Box Pack', description: 'Assorted juice boxes. 24 count.', price: 18, category: 'Kids Menu' },
];

// ============================================================
// CUSTOMERS
// ============================================================

const CUSTOMERS = [
  { firstName: 'Jennifer', lastName: 'Walsh', email: 'jwalsh@browardcorp.com', phone: '954-555-0201', company: 'Broward Corp' },
  { firstName: 'Marcus', lastName: 'Thompson', email: 'marcus.t@eventspro.com', phone: '954-555-0202', company: 'Events Pro International' },
  { firstName: 'Sarah', lastName: 'Chen', email: 'schen@sunriseschools.edu', phone: '954-555-0203', company: 'Sunrise Academy' },
  { firstName: 'David', lastName: 'Martinez', email: 'dmartinez@gmail.com', phone: '954-555-0204', company: null },
  { firstName: 'Rachel', lastName: 'Green', email: 'rachel@plantationweddings.com', phone: '954-555-0205', company: 'Plantation Wedding Co' },
  { firstName: 'Michael', lastName: 'Roberts', email: 'mroberts@ftltech.io', phone: '954-555-0206', company: 'FTL Tech' },
  { firstName: 'Lisa', lastName: 'Nguyen', email: 'lisa.n@nonprofitalliance.org', phone: '954-555-0207', company: 'Nonprofit Alliance of Broward' },
  { firstName: 'James', lastName: 'O\'Brien', email: 'jobrien@coastalre.com', phone: '954-555-0208', company: 'Coastal Real Estate' },
  { firstName: 'Patricia', lastName: 'Hernandez', email: 'phernandez@pompanobiz.com', phone: '954-555-0209', company: 'Pompano Business Association' },
  { firstName: 'Robert', lastName: 'Kim', email: 'rkim@hollywoodfl.gov', phone: '954-555-0210', company: 'City of Hollywood' },
  { firstName: 'Amanda', lastName: 'Taylor', email: 'amanda@taylorevents.com', phone: '954-555-0211', company: 'Taylor Events' },
  { firstName: 'Chris', lastName: 'Jackson', email: 'cjackson@bocaresort.com', phone: '954-555-0212', company: 'Boca Resort & Spa' },
];

// ============================================================
// HELPERS
// ============================================================

function randomFloat(): number {
  return crypto.randomBytes(4).readUInt32BE(0) / 0xFFFFFFFF;
}

function futureDate(daysFromNow: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(0, 0, 0, 0);
  return d;
}

function pastDate(daysAgo: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(0, 0, 0, 0);
  return d;
}

function milestoneId(): string {
  return crypto.randomUUID();
}

function packageId(): string {
  return crypto.randomUUID();
}

function calculateFees(subtotalCents: number, serviceChargePercent: number, taxPercent: number, gratuityPercent: number) {
  const serviceChargeCents = Math.round(subtotalCents * serviceChargePercent / 100);
  const taxCents = Math.round(subtotalCents * taxPercent / 100);
  const gratuityCents = Math.round(subtotalCents * gratuityPercent / 100);
  const totalCents = subtotalCents + serviceChargeCents + taxCents + gratuityCents;
  return { serviceChargeCents, taxCents, gratuityCents, totalCents };
}

// ============================================================
// CATERING EVENTS — with full financial data
// ============================================================

interface SeedCateringEvent {
  title: string;
  eventType: string;
  status: string;
  fulfillmentDate: Date;
  bookingDate: Date;
  startTime: string;
  endTime: string;
  headcount: number;
  locationType: string;
  locationAddress?: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  companyName?: string;
  notes?: string;
  subtotalCents: number;
  serviceChargePercent: number;
  taxPercent: number;
  gratuityPercent: number;
  paidCents: number;
  packages: unknown[];
  selectedPackageId?: string;
  milestones: unknown[];
  dietaryRequirements?: unknown;
  deliveryDetails?: unknown;
  tastings?: unknown[];
}

function buildEvents(): SeedCateringEvent[] {
  // ---- Event 1: Broward Corp Annual Gala (COMPLETED, fully paid) ----
  const galaStdId = packageId();
  const galaPremId = packageId();
  const galaSubtotal = 150 * 6500; // 150 guests x $65/person = $9,750
  const galaFees = calculateFees(galaSubtotal, 20, 7, 18);
  const galaMilestone1Id = milestoneId();
  const galaMilestone2Id = milestoneId();

  // ---- Event 2: Sunrise Academy Graduation (COMPLETED, fully paid) ----
  const gradPkgId = packageId();
  const gradSubtotal = 200 * 2200; // 200 guests x $22/person = $4,400
  const gradFees = calculateFees(gradSubtotal, 18, 7, 0);
  const gradM1 = milestoneId();
  const gradM2 = milestoneId();

  // ---- Event 3: FTL Tech Product Launch (IN_PROGRESS, deposit paid) ----
  const techPkgId = packageId();
  const techSubtotal = 80 * 4500; // 80 guests x $45/person = $3,600
  const techFees = calculateFees(techSubtotal, 20, 7, 0);
  const techM1 = milestoneId();
  const techM2 = milestoneId();

  // ---- Event 4: Martinez-Johnson Wedding (DEPOSIT_RECEIVED) ----
  const wedStdId = packageId();
  const wedPremId = packageId();
  const wedCustomId = packageId();
  const wedSubtotal = 120 * 6500; // 120 guests x $65/person premium = $7,800
  const wedFees = calculateFees(wedSubtotal, 22, 7, 20);
  const wedM1 = milestoneId();
  const wedM2 = milestoneId();
  const wedM3 = milestoneId();

  // ---- Event 5: Nonprofit Fundraiser (PROPOSAL_SENT) ----
  const npStdId = packageId();
  const npPremId = packageId();
  const npSubtotal = 250 * 4500; // estimated if standard chosen
  const npFees = calculateFees(npSubtotal, 18, 7, 0);

  // ---- Event 6: Coastal RE Open House (PROPOSAL_SENT) ----
  const reStdId = packageId();
  const reSubtotal = 60 * 3500; // 60 guests x $35/person brunch
  const reFees = calculateFees(reSubtotal, 15, 7, 0);

  // ---- Event 7: Pompano Business Awards (INQUIRY) ----
  // ---- Event 8: Hollywood City Picnic (INQUIRY) ----
  // ---- Event 9: Taylor Sweet 16 (INQUIRY) ----
  // ---- Event 10: Boca Resort Holiday Party (CONTRACT_SIGNED) ----
  const bocaPkgId = packageId();
  const bocaSubtotal = 100 * 8500; // 100 guests x $85/person premium
  const bocaFees = calculateFees(bocaSubtotal, 20, 7, 20);
  const bocaM1 = milestoneId();
  const bocaM2 = milestoneId();

  // ---- Event 11: Events Pro Conference Lunch (IN_PROGRESS) ----
  const confPkgId = packageId();
  const confSubtotal = 90 * 2800; // 90 guests x $28/person
  const confFees = calculateFees(confSubtotal, 18, 7, 0);
  const confM1 = milestoneId();
  const confM2 = milestoneId();

  // ---- Event 12: Plantation Wedding Tasting (DEPOSIT_RECEIVED) ----
  const tastePkgId = packageId();
  const tasteSubtotal = 8 * 8500; // 8 guests tasting, premium pricing
  const tasteFees = calculateFees(tasteSubtotal, 0, 7, 0);

  return [
    // 1. Broward Corp Annual Gala — COMPLETED, fully paid
    {
      title: 'Broward Corp Annual Gala',
      eventType: 'corporate',
      status: 'completed',
      fulfillmentDate: pastDate(30),
      bookingDate: pastDate(90),
      startTime: '18:00',
      endTime: '22:00',
      headcount: 150,
      locationType: 'off_site',
      locationAddress: 'Broward Convention Center, 1950 Eisenhower Blvd, Fort Lauderdale, FL 33316',
      clientName: 'Jennifer Walsh',
      clientPhone: '954-555-0201',
      clientEmail: 'jwalsh@browardcorp.com',
      companyName: 'Broward Corp',
      notes: 'Formal sit-down dinner. Open bar separate vendor. Dietary cards at each place setting. Gold linens requested.',
      subtotalCents: galaSubtotal,
      serviceChargePercent: 20,
      taxPercent: 7,
      gratuityPercent: 18,
      paidCents: galaFees.totalCents,
      packages: [
        { id: galaStdId, name: 'Standard Dinner', tier: 'standard', pricingModel: 'per_person', pricePerUnit: 4500, minHeadcount: 50, description: 'Herb roasted chicken, 2 sides, salad, rolls, dessert, beverage service' },
        { id: galaPremId, name: 'Premium Gala', tier: 'premium', pricingModel: 'per_person', pricePerUnit: 6500, minHeadcount: 50, description: 'Beef tenderloin or salmon, 3 sides, Caesar salad, shrimp cocktail app, cheesecake, full beverage service' },
      ],
      selectedPackageId: galaPremId,
      milestones: [
        { id: galaMilestone1Id, label: 'Deposit (50%)', percentage: 50, amountCents: Math.round(galaFees.totalCents / 2), dueDate: pastDate(75).toISOString(), paidAt: pastDate(74).toISOString() },
        { id: galaMilestone2Id, label: 'Final Payment (50%)', percentage: 50, amountCents: galaFees.totalCents - Math.round(galaFees.totalCents / 2), dueDate: pastDate(31).toISOString(), paidAt: pastDate(31).toISOString() },
      ],
      dietaryRequirements: { vegetarian: 15, vegan: 5, glutenFree: 12, nutAllergy: 3, dairyFree: 2, kosher: 0, halal: 4, other: '' },
      deliveryDetails: {
        driverName: 'Tyrone',
        driverPhone: '954-555-0107',
        loadTime: '15:00',
        departureTime: '15:30',
        arrivalTime: '16:15',
        vehicleDescription: 'White Ford Transit van — Jay\'s Catering logo',
        equipmentChecklist: ['Chafing dishes (12)', 'Sternos (24)', 'Serving utensils set', 'White linens (16 tables)', 'Gold table runners (16)', 'Beverage dispenser (3)'],
        routeNotes: 'Use service entrance on south side. Loading dock available. Contact venue manager Mike at 954-555-9999.',
        setupTime: '16:30',
        breakdownTime: '22:30',
      },
    },

    // 2. Sunrise Academy Graduation — COMPLETED, fully paid
    {
      title: 'Sunrise Academy Graduation Lunch',
      eventType: 'school',
      status: 'completed',
      fulfillmentDate: pastDate(15),
      bookingDate: pastDate(60),
      startTime: '11:00',
      endTime: '14:00',
      headcount: 200,
      locationType: 'off_site',
      locationAddress: 'Sunrise Academy, 3200 N Federal Hwy, Fort Lauderdale, FL 33306',
      clientName: 'Sarah Chen',
      clientPhone: '954-555-0203',
      clientEmail: 'schen@sunriseschools.edu',
      companyName: 'Sunrise Academy',
      notes: 'Outdoor buffet under tents. Nut-free environment mandatory. School provides tables and chairs.',
      subtotalCents: gradSubtotal,
      serviceChargePercent: 18,
      taxPercent: 7,
      gratuityPercent: 0,
      paidCents: gradFees.totalCents,
      packages: [
        { id: gradPkgId, name: 'School Buffet', tier: 'standard', pricingModel: 'per_person', pricePerUnit: 2200, minHeadcount: 100, description: 'Chicken tenders, pulled pork sliders, mac & cheese, garden salad, fruit, cookies, lemonade & water' },
      ],
      selectedPackageId: gradPkgId,
      milestones: [
        { id: gradM1, label: 'Deposit (50%)', percentage: 50, amountCents: Math.round(gradFees.totalCents / 2), dueDate: pastDate(45).toISOString(), paidAt: pastDate(44).toISOString() },
        { id: gradM2, label: 'Final Payment', percentage: 50, amountCents: gradFees.totalCents - Math.round(gradFees.totalCents / 2), dueDate: pastDate(16).toISOString(), paidAt: pastDate(15).toISOString() },
      ],
      dietaryRequirements: { vegetarian: 20, vegan: 8, glutenFree: 10, nutAllergy: 15, dairyFree: 5, kosher: 0, halal: 3, other: 'Strictly nut-free — no peanuts, tree nuts, or cross-contamination' },
      deliveryDetails: {
        driverName: 'Tyrone',
        driverPhone: '954-555-0107',
        loadTime: '08:30',
        departureTime: '09:00',
        arrivalTime: '09:30',
        vehicleDescription: 'White Ford Transit van',
        equipmentChecklist: ['Chafing dishes (8)', 'Sternos (16)', 'Serving utensils', 'Disposable plates/napkins/utensils for 200', 'Beverage dispensers (4)'],
        routeNotes: 'Pull up to gymnasium rear entrance. Unload on grass next to tent area.',
        setupTime: '09:45',
        breakdownTime: '14:30',
      },
    },

    // 3. FTL Tech Product Launch — IN_PROGRESS, deposit paid
    {
      title: 'FTL Tech Product Launch Party',
      eventType: 'corporate',
      status: 'in_progress',
      fulfillmentDate: futureDate(5),
      bookingDate: pastDate(45),
      startTime: '17:00',
      endTime: '21:00',
      headcount: 80,
      locationType: 'off_site',
      locationAddress: 'FTL Tech HQ, 200 E Las Olas Blvd, Suite 1400, Fort Lauderdale, FL 33301',
      clientName: 'Michael Roberts',
      clientPhone: '954-555-0206',
      clientEmail: 'mroberts@ftltech.io',
      companyName: 'FTL Tech',
      notes: 'Cocktail-style with passed appetizers. Vegan and GF options mandatory. AV setup by client. Modern upscale vibe.',
      subtotalCents: techSubtotal,
      serviceChargePercent: 20,
      taxPercent: 7,
      gratuityPercent: 0,
      paidCents: Math.round(techFees.totalCents / 2),
      packages: [
        { id: techPkgId, name: 'Cocktail Reception', tier: 'premium', pricingModel: 'per_person', pricePerUnit: 4500, minHeadcount: 40, description: 'Passed apps (shrimp cocktail, caprese skewers, bruschetta, sliders), charcuterie station, dessert bites, full beverage service' },
      ],
      selectedPackageId: techPkgId,
      milestones: [
        { id: techM1, label: 'Deposit (50%)', percentage: 50, amountCents: Math.round(techFees.totalCents / 2), dueDate: pastDate(30).toISOString(), paidAt: pastDate(29).toISOString() },
        { id: techM2, label: 'Final Payment', percentage: 50, amountCents: techFees.totalCents - Math.round(techFees.totalCents / 2), dueDate: futureDate(4).toISOString() },
      ],
      dietaryRequirements: { vegetarian: 12, vegan: 8, glutenFree: 10, nutAllergy: 2, dairyFree: 5, kosher: 0, halal: 0, other: '' },
      deliveryDetails: {
        driverName: 'Tyrone',
        driverPhone: '954-555-0107',
        loadTime: '14:00',
        departureTime: '14:30',
        arrivalTime: '15:00',
        vehicleDescription: 'White Ford Transit van',
        equipmentChecklist: ['Chafing dishes (6)', 'Sternos (12)', 'Serving trays (8)', 'Cocktail napkins (200)', 'Dessert plates (100)'],
        routeNotes: 'Building has freight elevator. Park in loading zone on SE 2nd St. Security will escort to 14th floor.',
        setupTime: '15:30',
        breakdownTime: '21:30',
      },
      tastings: [
        { id: crypto.randomUUID(), scheduledDate: pastDate(20).toISOString(), completedAt: pastDate(20).toISOString(), attendees: 'Michael Roberts + VP of Marketing', notes: 'Loved the shrimp cocktail and caprese. Requested extra vegan options. Added bruschetta to menu.', menuChangesRequested: 'Add vegan bruschetta variation with balsamic glaze' },
      ],
    },

    // 4. Martinez-Johnson Wedding — DEPOSIT_RECEIVED
    {
      title: 'Martinez-Johnson Wedding Reception',
      eventType: 'wedding',
      status: 'deposit_received',
      fulfillmentDate: futureDate(14),
      bookingDate: pastDate(120),
      startTime: '16:00',
      endTime: '23:00',
      headcount: 120,
      locationType: 'off_site',
      locationAddress: 'Plantation Preserve Golf Course, 7050 W Broward Blvd, Plantation, FL 33317',
      clientName: 'David Martinez',
      clientPhone: '954-555-0204',
      clientEmail: 'dmartinez@gmail.com',
      notes: 'Plated dinner service. 3-course meal. Cake cutting by bride. White/gold linens. Need 8 servers for plated service.',
      subtotalCents: wedSubtotal,
      serviceChargePercent: 22,
      taxPercent: 7,
      gratuityPercent: 20,
      paidCents: Math.round(wedFees.totalCents * 0.5),
      packages: [
        { id: wedStdId, name: 'Classic Wedding', tier: 'standard', pricingModel: 'per_person', pricePerUnit: 4500, minHeadcount: 80, description: 'Herb roasted chicken or pasta primavera, 2 sides, salad, rolls, sheet cake, tea & lemonade' },
        { id: wedPremId, name: 'Premium Wedding', tier: 'premium', pricingModel: 'per_person', pricePerUnit: 6500, minHeadcount: 80, description: 'Dual entree (beef tenderloin + salmon), 3 sides, Caesar salad, shrimp cocktail, cheesecake, full beverage' },
        { id: wedCustomId, name: 'Grand Wedding', tier: 'custom', pricingModel: 'per_person', pricePerUnit: 8500, minHeadcount: 80, description: 'Chef-attended carving station, raw bar, 4 passed apps, dual entree, custom dessert table, espresso bar' },
      ],
      selectedPackageId: wedPremId,
      milestones: [
        { id: wedM1, label: 'Booking Deposit (30%)', percentage: 30, amountCents: Math.round(wedFees.totalCents * 0.3), dueDate: pastDate(90).toISOString(), paidAt: pastDate(89).toISOString() },
        { id: wedM2, label: 'Mid Payment (20%)', percentage: 20, amountCents: Math.round(wedFees.totalCents * 0.2), dueDate: pastDate(14).toISOString(), paidAt: pastDate(14).toISOString() },
        { id: wedM3, label: 'Final Balance (50%)', percentage: 50, amountCents: wedFees.totalCents - Math.round(wedFees.totalCents * 0.3) - Math.round(wedFees.totalCents * 0.2), dueDate: futureDate(7).toISOString() },
      ],
      dietaryRequirements: { vegetarian: 18, vegan: 6, glutenFree: 8, nutAllergy: 2, dairyFree: 4, kosher: 3, halal: 0, other: 'Bride is dairy-free — ensure plated entree has dairy-free option' },
      deliveryDetails: {
        driverName: 'Tyrone',
        driverPhone: '954-555-0107',
        loadTime: '12:00',
        departureTime: '12:30',
        arrivalTime: '13:15',
        vehicleDescription: 'White Ford Transit van + rented refrigerated trailer',
        equipmentChecklist: ['Chafing dishes (10)', 'Sternos (20)', 'Plate chargers (120)', 'White linens (15 tables)', 'Gold runners (15)', 'Centerpiece risers (15)', 'Cake cutting set', 'Espresso machine'],
        routeNotes: 'Use service road behind clubhouse. Coordinate with venue coordinator Rachel Green (954-555-0205).',
        setupTime: '14:00',
        breakdownTime: '23:30',
      },
      tastings: [
        { id: crypto.randomUUID(), scheduledDate: pastDate(60).toISOString(), completedAt: pastDate(60).toISOString(), attendees: 'David + fiancee Maria + both moms', notes: 'Loved beef tenderloin. Maria wants salmon as alternative. Moms prefer cheesecake over custom cake.', menuChangesRequested: 'Add salmon as dual entree option, switch from sheet cake to mini cheesecake assortment' },
        { id: crypto.randomUUID(), scheduledDate: pastDate(30).toISOString(), completedAt: pastDate(30).toISOString(), attendees: 'David + Maria', notes: 'Final tasting. Approved revised menu. Added shrimp cocktail appetizer upgrade.', menuChangesRequested: null },
      ],
    },

    // 5. Nonprofit Fundraiser — PROPOSAL_SENT
    {
      title: 'Nonprofit Alliance Fundraiser',
      eventType: 'fundraiser',
      status: 'proposal_sent',
      fulfillmentDate: futureDate(30),
      bookingDate: pastDate(14),
      startTime: '18:00',
      endTime: '21:00',
      headcount: 250,
      locationType: 'off_site',
      locationAddress: 'Broward Center for the Performing Arts, 201 SW 5th Ave, Fort Lauderdale, FL 33312',
      clientName: 'Lisa Nguyen',
      clientPhone: '954-555-0207',
      clientEmail: 'lisa.n@nonprofitalliance.org',
      companyName: 'Nonprofit Alliance of Broward',
      notes: 'Budget conscious — need Standard and Premium package options. Silent auction during dinner. Table for 8 layout.',
      subtotalCents: npSubtotal,
      serviceChargePercent: 18,
      taxPercent: 7,
      gratuityPercent: 0,
      paidCents: 0,
      packages: [
        { id: npStdId, name: 'Standard Buffet', tier: 'standard', pricingModel: 'per_person', pricePerUnit: 4500, minHeadcount: 100, description: 'Herb chicken, pasta primavera, 3 sides, salad, rolls, cookie platter, beverage service' },
        { id: npPremId, name: 'Premium Plated', tier: 'premium', pricingModel: 'per_person', pricePerUnit: 6500, minHeadcount: 100, description: 'Beef tenderloin or salmon, 3 sides, Caesar salad, cheesecake, full beverage service' },
      ],
      milestones: [
        { id: milestoneId(), label: 'Deposit (50%)', percentage: 50, amountCents: Math.round(npFees.totalCents / 2), dueDate: futureDate(10).toISOString() },
        { id: milestoneId(), label: 'Final Payment', percentage: 50, amountCents: npFees.totalCents - Math.round(npFees.totalCents / 2), dueDate: futureDate(28).toISOString() },
      ],
      dietaryRequirements: { vegetarian: 30, vegan: 15, glutenFree: 20, nutAllergy: 5, dairyFree: 10, kosher: 8, halal: 5, other: '' },
    },

    // 6. Coastal RE Open House — PROPOSAL_SENT
    {
      title: 'Coastal RE Open House Brunch',
      eventType: 'corporate',
      status: 'proposal_sent',
      fulfillmentDate: futureDate(21),
      bookingDate: pastDate(7),
      startTime: '10:00',
      endTime: '13:00',
      headcount: 60,
      locationType: 'off_site',
      locationAddress: '2500 E Commercial Blvd, Fort Lauderdale, FL 33308',
      clientName: 'James O\'Brien',
      clientPhone: '954-555-0208',
      clientEmail: 'jobrien@coastalre.com',
      companyName: 'Coastal Real Estate',
      notes: 'Light brunch spread. Upscale but casual. Champagne toast provided by client. Display-style.',
      subtotalCents: reSubtotal,
      serviceChargePercent: 15,
      taxPercent: 7,
      gratuityPercent: 0,
      paidCents: 0,
      packages: [
        { id: reStdId, name: 'Brunch Display', tier: 'standard', pricingModel: 'per_person', pricePerUnit: 3500, minHeadcount: 30, description: 'Bagel & lox, fruit parfaits, scrambled eggs tray, bacon platter, french toast casserole, coffee & juice' },
      ],
      milestones: [
        { id: milestoneId(), label: 'Full Payment', percentage: 100, amountCents: reFees.totalCents, dueDate: futureDate(14).toISOString() },
      ],
    },

    // 7. Pompano Business Awards — INQUIRY (no financial data)
    {
      title: 'Pompano Business Awards Banquet',
      eventType: 'corporate',
      status: 'inquiry',
      fulfillmentDate: futureDate(45),
      bookingDate: pastDate(3),
      startTime: '18:00',
      endTime: '22:00',
      headcount: 175,
      locationType: 'off_site',
      locationAddress: 'Pompano Beach Civic Center',
      clientName: 'Patricia Hernandez',
      clientPhone: '954-555-0209',
      clientEmail: 'phernandez@pompanobiz.com',
      companyName: 'Pompano Business Association',
      notes: 'Need full proposal with 3 tiers. Audio/visual podium setup included? Awards ceremony with plated dinner.',
      subtotalCents: 0,
      serviceChargePercent: 0,
      taxPercent: 7,
      gratuityPercent: 0,
      paidCents: 0,
      packages: [],
      milestones: [],
    },

    // 8. Hollywood City Picnic — INQUIRY
    {
      title: 'Hollywood City Employee Picnic',
      eventType: 'picnic',
      status: 'inquiry',
      fulfillmentDate: futureDate(60),
      bookingDate: pastDate(2),
      startTime: '11:00',
      endTime: '15:00',
      headcount: 300,
      locationType: 'off_site',
      locationAddress: 'TY Park, Hollywood, FL',
      clientName: 'Robert Kim',
      clientPhone: '954-555-0210',
      clientEmail: 'rkim@hollywoodfl.gov',
      companyName: 'City of Hollywood',
      notes: 'Outdoor park venue. Full BBQ spread. Kids area needed. Government PO process — invoice must reference PO# (pending).',
      subtotalCents: 0,
      serviceChargePercent: 0,
      taxPercent: 7,
      gratuityPercent: 0,
      paidCents: 0,
      packages: [],
      milestones: [],
    },

    // 9. Taylor Sweet 16 — INQUIRY
    {
      title: 'Taylor Sweet 16 Party',
      eventType: 'birthday',
      status: 'inquiry',
      fulfillmentDate: futureDate(35),
      bookingDate: pastDate(1),
      startTime: '14:00',
      endTime: '18:00',
      headcount: 50,
      locationType: 'on_site',
      clientName: 'Amanda Taylor',
      clientPhone: '954-555-0211',
      clientEmail: 'amanda@taylorevents.com',
      companyName: 'Taylor Events',
      notes: 'Teen party. Finger food focus. Custom cake order separate. Pink/gold theme. DJ separate.',
      subtotalCents: 0,
      serviceChargePercent: 0,
      taxPercent: 7,
      gratuityPercent: 0,
      paidCents: 0,
      packages: [],
      milestones: [],
    },

    // 10. Boca Resort Holiday Party — CONTRACT_SIGNED
    {
      title: 'Boca Resort Staff Holiday Party',
      eventType: 'holiday',
      status: 'contract_signed',
      fulfillmentDate: futureDate(50),
      bookingDate: pastDate(21),
      startTime: '19:00',
      endTime: '23:00',
      headcount: 100,
      locationType: 'off_site',
      locationAddress: 'Boca Resort & Spa, Grand Ballroom, 501 E Camino Real, Boca Raton, FL 33432',
      clientName: 'Chris Jackson',
      clientPhone: '954-555-0212',
      clientEmail: 'cjackson@bocaresort.com',
      companyName: 'Boca Resort & Spa',
      notes: 'Premium package. Open bar (their venue provides). DJ separate. Need dance floor clear by 8pm for first dance.',
      subtotalCents: bocaSubtotal,
      serviceChargePercent: 20,
      taxPercent: 7,
      gratuityPercent: 20,
      paidCents: 0,
      packages: [
        { id: bocaPkgId, name: 'Premium Holiday', tier: 'premium', pricingModel: 'per_person', pricePerUnit: 8500, minHeadcount: 50, description: 'Chef-attended carving station (brisket & tenderloin), shrimp & grits, 4 sides, raw bar appetizer, custom dessert table, espresso bar' },
      ],
      selectedPackageId: bocaPkgId,
      milestones: [
        { id: bocaM1, label: 'Deposit (50%)', percentage: 50, amountCents: Math.round(bocaFees.totalCents / 2), dueDate: futureDate(7).toISOString() },
        { id: bocaM2, label: 'Final Payment', percentage: 50, amountCents: bocaFees.totalCents - Math.round(bocaFees.totalCents / 2), dueDate: futureDate(48).toISOString() },
      ],
      dietaryRequirements: { vegetarian: 10, vegan: 5, glutenFree: 8, nutAllergy: 2, dairyFree: 3, kosher: 0, halal: 0, other: '' },
      deliveryDetails: {
        driverName: 'Tyrone',
        driverPhone: '954-555-0107',
        loadTime: '15:00',
        departureTime: '15:30',
        arrivalTime: '16:30',
        vehicleDescription: 'White Ford Transit van + refrigerated trailer',
        equipmentChecklist: ['Chafing dishes (10)', 'Sternos (20)', 'Carving station setup', 'Raw bar ice display', 'Dessert table risers', 'Espresso machine + cart'],
        routeNotes: 'Use I-95 South to Palmetto exit. Resort service entrance on west side of building. Valet will direct.',
        setupTime: '17:00',
        breakdownTime: '23:30',
      },
    },

    // 11. Events Pro Conference Lunch — IN_PROGRESS, deposit paid
    {
      title: 'Events Pro Annual Conference Lunch',
      eventType: 'conference',
      status: 'in_progress',
      fulfillmentDate: futureDate(10),
      bookingDate: pastDate(30),
      startTime: '11:30',
      endTime: '13:30',
      headcount: 90,
      locationType: 'off_site',
      locationAddress: 'Marriott Harbor Beach, 3030 Holiday Dr, Fort Lauderdale, FL 33316',
      clientName: 'Marcus Thompson',
      clientPhone: '954-555-0202',
      clientEmail: 'marcus.t@eventspro.com',
      companyName: 'Events Pro International',
      notes: 'Working lunch — buffet style. 15 vegetarian, 5 vegan, 3 gluten-free. Need by 11:15 for setup before attendees arrive.',
      subtotalCents: confSubtotal,
      serviceChargePercent: 18,
      taxPercent: 7,
      gratuityPercent: 0,
      paidCents: Math.round(confFees.totalCents / 2),
      packages: [
        { id: confPkgId, name: 'Conference Buffet', tier: 'standard', pricingModel: 'per_person', pricePerUnit: 2800, minHeadcount: 50, description: 'Chicken marsala, pasta primavera (V), 2 sides, Caesar salad, rolls, cookies, coffee & tea service' },
      ],
      selectedPackageId: confPkgId,
      milestones: [
        { id: confM1, label: 'Deposit (50%)', percentage: 50, amountCents: Math.round(confFees.totalCents / 2), dueDate: pastDate(20).toISOString(), paidAt: pastDate(19).toISOString() },
        { id: confM2, label: 'Final Payment', percentage: 50, amountCents: confFees.totalCents - Math.round(confFees.totalCents / 2), dueDate: futureDate(8).toISOString() },
      ],
      dietaryRequirements: { vegetarian: 15, vegan: 5, glutenFree: 3, nutAllergy: 0, dairyFree: 2, kosher: 0, halal: 0, other: '' },
      deliveryDetails: {
        driverName: 'Tyrone',
        driverPhone: '954-555-0107',
        loadTime: '09:00',
        departureTime: '09:30',
        arrivalTime: '10:00',
        vehicleDescription: 'White Ford Transit van',
        equipmentChecklist: ['Chafing dishes (6)', 'Sternos (12)', 'Serving utensils', 'Coffee urns (2)', 'Disposable for 90'],
        routeNotes: 'Marriott convention center entrance — use service hallway behind Ballroom C.',
        setupTime: '10:15',
        breakdownTime: '14:00',
      },
    },

    // 12. Plantation Wedding Tasting — DEPOSIT_RECEIVED
    {
      title: 'Green-Williams Wedding Tasting',
      eventType: 'tasting',
      status: 'deposit_received',
      fulfillmentDate: futureDate(3),
      bookingDate: pastDate(14),
      startTime: '15:00',
      endTime: '17:00',
      headcount: 8,
      locationType: 'on_site',
      clientName: 'Rachel Green',
      clientPhone: '954-555-0205',
      clientEmail: 'rachel@plantationweddings.com',
      companyName: 'Plantation Wedding Co',
      notes: 'Menu tasting for June wedding (200 guests). Bride + groom + 6 family. Bring samples of 3 entree options + 2 desserts.',
      subtotalCents: tasteSubtotal,
      serviceChargePercent: 0,
      taxPercent: 7,
      gratuityPercent: 0,
      paidCents: tasteFees.totalCents,
      packages: [
        { id: tastePkgId, name: 'Tasting Menu', tier: 'custom', pricingModel: 'per_person', pricePerUnit: 8500, minHeadcount: 1, description: 'Chef-prepared sampling: beef tenderloin, salmon, chicken marsala, mini cheesecakes, peach cobbler' },
      ],
      selectedPackageId: tastePkgId,
      milestones: [
        { id: milestoneId(), label: 'Tasting Fee', percentage: 100, amountCents: tasteFees.totalCents, dueDate: pastDate(7).toISOString(), paidAt: pastDate(7).toISOString() },
      ],
      tastings: [
        { id: crypto.randomUUID(), scheduledDate: futureDate(3).toISOString(), attendees: 'Rachel Green + groom Tyler Williams + both sets of parents', notes: 'Sampling 3 entrees + 2 desserts for June wedding (200 guests, estimated $130k job)' },
      ],
    },
  ];
}

// ============================================================
// TEAM MEMBERS (POS Staff)
// ============================================================

const STAFF_PINS = [
  { displayName: 'Jay', pin: '1234', role: 'owner', jobTitle: 'Owner / Head Chef', hourlyRate: 0, isTipEligible: false },
  { displayName: 'Kim', pin: '5678', role: 'manager', jobTitle: 'Operations Manager', hourlyRate: 2800, isTipEligible: false },
  { displayName: 'Derek', pin: '1111', role: 'staff', jobTitle: 'Sous Chef', hourlyRate: 2200, isTipEligible: false },
  { displayName: 'Tanya', pin: '2222', role: 'staff', jobTitle: 'Event Coordinator', hourlyRate: 2000, isTipEligible: false },
  { displayName: 'Marcus', pin: '3333', role: 'staff', jobTitle: 'Lead Server', hourlyRate: 1500, isTipEligible: true },
  { displayName: 'Rosa', pin: '4444', role: 'staff', jobTitle: 'Prep Cook', hourlyRate: 1600, isTipEligible: false },
  { displayName: 'Tyrone', pin: '5555', role: 'staff', jobTitle: 'Driver / Setup', hourlyRate: 1400, isTipEligible: true },
  { displayName: 'Ashley', pin: '6666', role: 'staff', jobTitle: 'Server', hourlyRate: 1200, isTipEligible: true },
];

// ============================================================
// HELPER: Seed catering activity entries based on event status
// ============================================================

const STATUS_PROGRESSION = ['proposal_sent', 'contract_signed', 'deposit_received', 'in_progress', 'completed'] as const;

function statusReachedOrPassed(status: string, target: string): boolean {
  const idx = STATUS_PROGRESSION.indexOf(target as typeof STATUS_PROGRESSION[number]);
  const current = STATUS_PROGRESSION.indexOf(status as typeof STATUS_PROGRESSION[number]);
  return idx >= 0 && current >= idx;
}

async function seedCateringActivities(jobId: string, title: string, status: string): Promise<void> {
  await prisma.cateringActivity.create({
    data: { jobId, action: 'created', description: `Job "${title}" created`, actorType: 'operator' },
  });

  if (statusReachedOrPassed(status, 'proposal_sent')) {
    await prisma.cateringActivity.create({
      data: { jobId, action: 'status_changed', description: 'Proposal sent to client', metadata: { from: 'inquiry', to: 'proposal_sent' }, actorType: 'operator' },
    });
  }

  if (statusReachedOrPassed(status, 'contract_signed')) {
    await prisma.cateringActivity.create({
      data: { jobId, action: 'package_selected', description: 'Client selected package', actorType: 'client' },
    });
    await prisma.cateringActivity.create({
      data: { jobId, action: 'status_changed', description: 'Contract signed by client', metadata: { from: 'proposal_sent', to: 'contract_signed' }, actorType: 'client' },
    });
  }

  if (statusReachedOrPassed(status, 'deposit_received')) {
    await prisma.cateringActivity.create({
      data: { jobId, action: 'milestone_paid', description: 'Deposit received', actorType: 'system' },
    });
    await prisma.cateringActivity.create({
      data: { jobId, action: 'status_changed', description: 'Deposit received — job confirmed', metadata: { from: 'contract_signed', to: 'deposit_received' }, actorType: 'system' },
    });
  }

  if (statusReachedOrPassed(status, 'in_progress')) {
    await prisma.cateringActivity.create({
      data: { jobId, action: 'status_changed', description: 'Job moved to in progress', metadata: { from: 'deposit_received', to: 'in_progress' }, actorType: 'operator' },
    });
  }

  if (status === 'completed') {
    await prisma.cateringActivity.create({
      data: { jobId, action: 'milestone_paid', description: 'Final payment received', actorType: 'system' },
    });
    await prisma.cateringActivity.create({
      data: { jobId, action: 'status_changed', description: 'Job completed', metadata: { from: 'in_progress', to: 'completed' }, actorType: 'operator' },
    });
  }
}

// ============================================================
// HELPER: Link restaurant to Taipa group
// ============================================================

function resolveGroupRole(email: string | null): string {
  if (email === 'admin@orderstack.com' || email === 'owner@taipa.com') return 'owner';
  if (email === 'manager@taipa.com') return 'manager';
  return 'staff';
}

async function linkToTaipaGroup(restaurantId: string): Promise<void> {
  const group = await prisma.restaurantGroup.findFirst({ where: { slug: 'taipa-group' } });
  if (!group) return;

  await prisma.restaurant.update({
    where: { id: restaurantId },
    data: { restaurantGroupId: group.id },
  });
  console.log(`   Linked to restaurant group: ${group.name}`);

  const existingMembers = await prisma.teamMember.findMany({
    where: { email: { in: ['admin@orderstack.com', 'owner@taipa.com', 'manager@taipa.com', 'staff@taipa.com'] } },
    select: { id: true, email: true },
  });

  for (const m of existingMembers) {
    const role = resolveGroupRole(m.email);
    await prisma.userRestaurantAccess.upsert({
      where: { teamMemberId_restaurantId: { teamMemberId: m.id, restaurantId } },
      update: { role },
      create: { teamMemberId: m.id, restaurantId, role },
    });
  }
  console.log(`   ${existingMembers.length} existing users linked`);
}

// ============================================================
// HELPER: Seed staff PINs + team members
// ============================================================

async function seedStaffPins(restaurantId: string): Promise<void> {
  console.log('   Creating staff...');
  await prisma.staffPin.deleteMany({ where: { restaurantId } });

  const existingStaff = await prisma.teamMember.findMany({
    where: { restaurantId },
    select: { id: true },
  });
  if (existingStaff.length > 0) {
    await prisma.teamMemberJob.deleteMany({
      where: { teamMemberId: { in: existingStaff.map(m => m.id) } },
    });
  }

  for (const sp of STAFF_PINS) {
    let teamMember = await prisma.teamMember.findFirst({
      where: { restaurantId, displayName: sp.displayName },
    });

    if (!teamMember) {
      teamMember = await prisma.teamMember.create({
        data: {
          displayName: sp.displayName,
          firstName: sp.displayName,
          role: sp.role,
          restaurantId,
          status: 'active',
        },
      });
    }

    await prisma.teamMemberJob.create({
      data: {
        teamMemberId: teamMember.id,
        jobTitle: sp.jobTitle,
        hourlyRate: sp.hourlyRate,
        isTipEligible: sp.isTipEligible,
        isPrimary: true,
        overtimeEligible: sp.role === 'staff',
      },
    });

    const pinHash = await bcrypt.hash(sp.pin, SALT_ROUNDS);
    await prisma.staffPin.create({
      data: {
        restaurantId,
        name: sp.displayName,
        pin: pinHash,
        role: sp.role,
        teamMemberId: teamMember.id,
      },
    });
  }
  console.log(`   ${STAFF_PINS.length} staff PINs`);
}

// ============================================================
// SEED FUNCTION
// ============================================================

console.log("\n  Seeding Jay's Catering Number 3...\n");

try {

  // 1. Create or find restaurant
  let restaurant = await prisma.restaurant.findUnique({
    where: { slug: RESTAURANT.slug },
  });

  if (restaurant) {
    console.log(`   Restaurant ${RESTAURANT.slug} already exists — updating...`);
    restaurant = await prisma.restaurant.update({
      where: { slug: RESTAURANT.slug },
      data: {
        ...RESTAURANT,
        merchantProfile: MERCHANT_PROFILE,
      },
    });
  } else {
    restaurant = await prisma.restaurant.create({
      data: {
        ...RESTAURANT,
        merchantProfile: MERCHANT_PROFILE,
      },
    });
  }
  console.log(`   Restaurant: ${restaurant.name} (${restaurant.id})`);

  const restaurantId = restaurant.id;

  // 2. Link to Taipa group (so same login accounts work)
  await linkToTaipaGroup(restaurantId);

  // 3. Menu categories & items
  console.log('   Creating menu...');
  await prisma.menuItem.deleteMany({ where: { restaurantId } });
  await prisma.menuCategory.deleteMany({ where: { restaurantId } });

  const categoryMap = new Map<string, string>();
  for (const cat of CATEGORIES) {
    const created = await prisma.menuCategory.create({
      data: { restaurantId, ...cat },
    });
    categoryMap.set(cat.name, created.id);
  }
  console.log(`   ${CATEGORIES.length} categories`);

  let itemCount = 0;
  for (const item of MENU_ITEMS) {
    const categoryId = categoryMap.get(item.category);
    if (!categoryId) continue;
    await prisma.menuItem.create({
      data: {
        restaurantId,
        categoryId,
        name: item.name,
        description: item.description,
        price: item.price,
        dietary: item.dietary ?? [],
        available: true,
        eightySixed: false,
        displayOrder: itemCount,
      },
    });
    itemCount++;
  }
  console.log(`   ${itemCount} menu items`);

  // 4. Customers
  console.log('   Creating customers...');
  await prisma.customer.deleteMany({ where: { restaurantId } });

  for (const c of CUSTOMERS) {
    const totalOrders = Math.floor(randomFloat() * 8) + 1;
    const totalSpent = Math.floor(randomFloat() * 15000) + 500;
    await prisma.customer.create({
      data: {
        restaurantId,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone,
        tags: c.company ? [c.company] : [],
        totalOrders,
        totalSpent,
        avgOrderValue: totalOrders > 0 ? totalSpent / totalOrders : 0,
        lastOrderDate: pastDate(Math.floor(randomFloat() * 60)),
      },
    });
  }
  console.log(`   ${CUSTOMERS.length} customers`);

  // 5. Catering events — with full financial data
  console.log('   Creating catering events...');
  // Clean existing events and related data
  await prisma.cateringActivity.deleteMany({
    where: { job: { restaurantId } },
  });
  await prisma.cateringProposalToken.deleteMany({
    where: { job: { restaurantId } },
  });
  await prisma.cateringEvent.deleteMany({ where: { restaurantId } });

  const events = buildEvents();
  for (const evt of events) {
    const fees = calculateFees(evt.subtotalCents, evt.serviceChargePercent, evt.taxPercent, evt.gratuityPercent);
    const created = await prisma.cateringEvent.create({
      data: {
        restaurantId,
        title: evt.title,
        eventType: evt.eventType,
        status: evt.status,
        fulfillmentDate: evt.fulfillmentDate,
        bookingDate: evt.bookingDate,
        startTime: evt.startTime,
        endTime: evt.endTime,
        headcount: evt.headcount,
        locationType: evt.locationType,
        locationAddress: evt.locationAddress,
        clientName: evt.clientName,
        clientPhone: evt.clientPhone,
        clientEmail: evt.clientEmail,
        companyName: evt.companyName,
        notes: evt.notes,
        subtotalCents: evt.subtotalCents,
        serviceChargePercent: evt.serviceChargePercent,
        serviceChargeCents: fees.serviceChargeCents,
        taxPercent: evt.taxPercent,
        taxCents: fees.taxCents,
        gratuityPercent: evt.gratuityPercent,
        gratuityCents: fees.gratuityCents,
        totalCents: fees.totalCents,
        paidCents: evt.paidCents,
        packages: evt.packages,
        selectedPackageId: evt.selectedPackageId,
        milestones: evt.milestones,
        dietaryRequirements: evt.dietaryRequirements ?? undefined,
        tastings: evt.tastings ?? undefined,
        deliveryDetails: evt.deliveryDetails ?? undefined,
      },
    });

    if (evt.status !== 'inquiry') {
      await seedCateringActivities(created.id, evt.title, evt.status);
    }
  }
  console.log(`   ${events.length} catering events with financial data`);

  // 6. Catering capacity settings
  await prisma.cateringCapacitySettings.upsert({
    where: { restaurantId },
    update: { maxEventsPerDay: 4, maxHeadcountPerDay: 500, conflictAlertsEnabled: true },
    create: { restaurantId, maxEventsPerDay: 4, maxHeadcountPerDay: 500, conflictAlertsEnabled: true },
  });
  console.log('   Capacity settings (4 events/day, 500 headcount/day)');

  // 7. Staff PINs + Team Members
  await seedStaffPins(restaurantId);

  // Summary
  console.log('\n' + '='.repeat(55));
  console.log("  JAY'S CATERING SEED COMPLETE");
  console.log('='.repeat(55));
  console.log(`   Restaurant:      ${restaurant.name} (${restaurantId})`);
  console.log(`   Mode:            catering`);
  console.log(`   Menu Categories: ${CATEGORIES.length}`);
  console.log(`   Menu Items:      ${itemCount}`);
  console.log(`   Customers:       ${CUSTOMERS.length}`);
  console.log(`   Catering Events: ${events.length} (with packages, milestones, dietary, delivery)`);
  console.log(`   Staff:           ${STAFF_PINS.length}`);
  console.log('');
  console.log('   Financial summary:');
  console.log('   - 2 completed (fully paid)');
  console.log('   - 2 in_progress (deposit paid, final due soon)');
  console.log('   - 2 deposit_received');
  console.log('   - 1 contract_signed');
  console.log('   - 2 proposal_sent');
  console.log('   - 3 inquiries (no financial data)');
  console.log('');
  console.log('   Login with owner@taipa.com / owner123');
  console.log("   Select 'Jay's Catering' from restaurant picker\n");
} catch (error: unknown) {
  console.error('Script failed:', toErrorMessage(error));
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
