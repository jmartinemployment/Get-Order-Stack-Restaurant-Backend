/**
 * Seed script for Jay's Catering Number 3
 * Creates a catering-mode restaurant with American-style menu,
 * catering events, customers, team members, and capacity settings.
 *
 * Run: npx tsx scripts/seed-jays-catering.ts
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

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
// CATERING EVENTS
// ============================================================

function futureDate(daysFromNow: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d;
}

function pastDate(daysAgo: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d;
}

const CATERING_EVENTS = [
  // Completed events
  {
    title: 'Broward Corp Annual Gala',
    eventType: 'corporate',
    status: 'completed',
    eventDate: pastDate(30),
    startTime: '18:00',
    endTime: '22:00',
    headcount: 150,
    contactName: 'Jennifer Walsh',
    contactPhone: '954-555-0201',
    contactEmail: 'jwalsh@browardcorp.com',
    notes: 'Formal sit-down dinner. Open bar separate vendor. Dietary cards at each place setting.',
  },
  {
    title: 'Sunrise Academy Graduation',
    eventType: 'school',
    status: 'completed',
    eventDate: pastDate(15),
    startTime: '11:00',
    endTime: '14:00',
    headcount: 200,
    contactName: 'Sarah Chen',
    contactPhone: '954-555-0203',
    contactEmail: 'schen@sunriseschools.edu',
    notes: 'Outdoor buffet. Need serving staff. Nut-free required.',
  },
  // In progress
  {
    title: 'FTL Tech Product Launch Party',
    eventType: 'corporate',
    status: 'confirmed',
    eventDate: futureDate(5),
    startTime: '17:00',
    endTime: '21:00',
    headcount: 80,
    contactName: 'Michael Roberts',
    contactPhone: '954-555-0206',
    contactEmail: 'mroberts@ftltech.io',
    notes: 'Cocktail-style with passed appetizers. Vegan and GF options mandatory. AV setup by client.',
  },
  {
    title: 'Martinez-Johnson Wedding Reception',
    eventType: 'wedding',
    status: 'confirmed',
    eventDate: futureDate(14),
    startTime: '16:00',
    endTime: '23:00',
    headcount: 120,
    contactName: 'David Martinez',
    contactPhone: '954-555-0204',
    contactEmail: 'dmartinez@gmail.com',
    notes: 'Plated dinner service. 3-course meal. Cake cutting by bride. Need linens (white/gold).',
  },
  // Proposals sent
  {
    title: 'Nonprofit Alliance Fundraiser',
    eventType: 'fundraiser',
    status: 'proposal_sent',
    eventDate: futureDate(30),
    startTime: '18:00',
    endTime: '21:00',
    headcount: 250,
    contactName: 'Lisa Nguyen',
    contactPhone: '954-555-0207',
    contactEmail: 'lisa.n@nonprofitalliance.org',
    notes: 'Budget conscious — need Standard and Premium package options. Silent auction during dinner.',
  },
  {
    title: 'Coastal RE Open House',
    eventType: 'corporate',
    status: 'proposal_sent',
    eventDate: futureDate(21),
    startTime: '10:00',
    endTime: '13:00',
    headcount: 60,
    contactName: 'James O\'Brien',
    contactPhone: '954-555-0208',
    contactEmail: 'jobrien@coastalre.com',
    notes: 'Light brunch spread. Upscale but casual. Champagne toast provided by client.',
  },
  // Inquiries
  {
    title: 'Pompano Business Awards Banquet',
    eventType: 'corporate',
    status: 'inquiry',
    eventDate: futureDate(45),
    startTime: '18:00',
    endTime: '22:00',
    headcount: 175,
    contactName: 'Patricia Hernandez',
    contactPhone: '954-555-0209',
    contactEmail: 'phernandez@pompanobiz.com',
    notes: 'Need full proposal with 3 tiers. Audio/visual podium setup included?',
  },
  {
    title: 'Hollywood City Employee Picnic',
    eventType: 'picnic',
    status: 'inquiry',
    eventDate: futureDate(60),
    startTime: '11:00',
    endTime: '15:00',
    headcount: 300,
    contactName: 'Robert Kim',
    contactPhone: '954-555-0210',
    contactEmail: 'rkim@hollywoodfl.gov',
    notes: 'Outdoor park venue. Full BBQ spread. Kids area needed. Government PO process.',
  },
  {
    title: 'Taylor Sweet 16',
    eventType: 'birthday',
    status: 'inquiry',
    eventDate: futureDate(35),
    startTime: '14:00',
    endTime: '18:00',
    headcount: 50,
    contactName: 'Amanda Taylor',
    contactPhone: '954-555-0211',
    contactEmail: 'amanda@taylorevents.com',
    notes: 'Teen party. Finger food focus. Custom cake order separate. Pink/gold theme.',
  },
  {
    title: 'Boca Resort Staff Holiday Party',
    eventType: 'holiday',
    status: 'proposal_sent',
    eventDate: futureDate(50),
    startTime: '19:00',
    endTime: '23:00',
    headcount: 100,
    contactName: 'Chris Jackson',
    contactPhone: '954-555-0212',
    contactEmail: 'cjackson@bocaresort.com',
    notes: 'Premium package. Open bar (their venue provides). DJ separate. Need dance floor clear by 8pm.',
  },
  {
    title: 'Events Pro Annual Conference Lunch',
    eventType: 'conference',
    status: 'confirmed',
    eventDate: futureDate(10),
    startTime: '11:30',
    endTime: '13:30',
    headcount: 90,
    contactName: 'Marcus Thompson',
    contactPhone: '954-555-0202',
    contactEmail: 'marcus.t@eventspro.com',
    notes: 'Working lunch — boxed option OR buffet. 15 vegetarian, 5 vegan, 3 gluten-free.',
  },
  {
    title: 'Plantation Wedding Tasting',
    eventType: 'tasting',
    status: 'confirmed',
    eventDate: futureDate(3),
    startTime: '15:00',
    endTime: '17:00',
    headcount: 8,
    contactName: 'Rachel Green',
    contactPhone: '954-555-0205',
    contactEmail: 'rachel@plantationweddings.com',
    notes: 'Menu tasting for June wedding. Bride + groom + 6 family. Bring samples of 3 entree options.',
  },
];

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
// SEED FUNCTION
// ============================================================

async function seedJaysCatering() {
  console.log("\n🍖 Seeding Jay's Catering Number 3...\n");

  // 1. Create or find restaurant
  let restaurant = await prisma.restaurant.findUnique({
    where: { slug: RESTAURANT.slug },
  });

  if (restaurant) {
    console.log(`   ⚠️  Restaurant ${RESTAURANT.slug} already exists — updating...`);
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
  console.log(`   ✅ Restaurant: ${restaurant.name} (${restaurant.id})`);

  const restaurantId = restaurant.id;

  // 2. Link to Taipa group (so same login accounts work)
  const group = await prisma.restaurantGroup.findFirst({
    where: { slug: 'taipa-group' },
  });
  if (group) {
    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { restaurantGroupId: group.id },
    });
    console.log(`   ✅ Linked to restaurant group: ${group.name}`);

    // Link existing team members (owner/manager/staff@taipa.com) to this restaurant
    const existingMembers = await prisma.teamMember.findMany({
      where: { email: { in: ['admin@orderstack.com', 'owner@taipa.com', 'manager@taipa.com', 'staff@taipa.com'] } },
      select: { id: true, email: true },
    });

    for (const m of existingMembers) {
      const role = m.email === 'admin@orderstack.com' || m.email === 'owner@taipa.com' ? 'owner'
        : m.email === 'manager@taipa.com' ? 'manager' : 'staff';
      await prisma.userRestaurantAccess.upsert({
        where: { teamMemberId_restaurantId: { teamMemberId: m.id, restaurantId } },
        update: { role },
        create: { teamMemberId: m.id, restaurantId, role },
      });
    }
    console.log(`   ✅ ${existingMembers.length} existing users linked`);
  }

  // 3. Menu categories & items
  console.log('   📂 Creating menu...');
  // Clean existing menu for this restaurant
  await prisma.menuItem.deleteMany({ where: { restaurantId } });
  await prisma.menuCategory.deleteMany({ where: { restaurantId } });

  const categoryMap = new Map<string, string>();
  for (const cat of CATEGORIES) {
    const created = await prisma.menuCategory.create({
      data: { restaurantId, ...cat },
    });
    categoryMap.set(cat.name, created.id);
  }
  console.log(`   ✅ ${CATEGORIES.length} categories`);

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
  console.log(`   ✅ ${itemCount} menu items`);

  // 4. Customers
  console.log('   👥 Creating customers...');
  // Clean existing
  await prisma.customer.deleteMany({ where: { restaurantId } });

  for (const c of CUSTOMERS) {
    const totalOrders = Math.floor(Math.random() * 8) + 1;
    const totalSpent = Math.floor(Math.random() * 15000) + 500;
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
        lastOrderDate: pastDate(Math.floor(Math.random() * 60)),
      },
    });
  }
  console.log(`   ✅ ${CUSTOMERS.length} customers`);

  // 5. Catering events
  console.log('   📅 Creating catering events...');
  await prisma.cateringEvent.deleteMany({ where: { restaurantId } });

  for (const evt of CATERING_EVENTS) {
    await prisma.cateringEvent.create({
      data: {
        restaurantId,
        title: evt.title,
        eventType: evt.eventType,
        status: evt.status,
        eventDate: evt.eventDate,
        startTime: evt.startTime,
        endTime: evt.endTime,
        headcount: evt.headcount,
        contactName: evt.contactName,
        contactPhone: evt.contactPhone,
        contactEmail: evt.contactEmail,
        notes: evt.notes,
      },
    });
  }
  console.log(`   ✅ ${CATERING_EVENTS.length} catering events`);

  // 6. Catering capacity settings
  await prisma.cateringCapacitySettings.upsert({
    where: { restaurantId },
    update: { maxEventsPerDay: 4, maxHeadcountPerDay: 500, conflictAlertsEnabled: true },
    create: { restaurantId, maxEventsPerDay: 4, maxHeadcountPerDay: 500, conflictAlertsEnabled: true },
  });
  console.log('   ✅ Capacity settings (4 events/day, 500 headcount/day)');

  // 7. Staff PINs + Team Members
  console.log('   👤 Creating staff...');
  await prisma.staffPin.deleteMany({ where: { restaurantId } });

  // Clean up existing per-restaurant team members
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
  console.log(`   ✅ ${STAFF_PINS.length} staff PINs`);

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log("📊 JAY'S CATERING SEED COMPLETE");
  console.log('='.repeat(50));
  console.log(`   Restaurant:      ${restaurant.name} (${restaurantId})`);
  console.log(`   Mode:            catering`);
  console.log(`   Menu Categories: ${CATEGORIES.length}`);
  console.log(`   Menu Items:      ${itemCount}`);
  console.log(`   Customers:       ${CUSTOMERS.length}`);
  console.log(`   Catering Events: ${CATERING_EVENTS.length}`);
  console.log(`   Staff:           ${STAFF_PINS.length}`);
  console.log('\n   Login with owner@taipa.com / owner123');
  console.log("   Select 'Jay's Catering' from restaurant picker\n");
}

seedJaysCatering()
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
