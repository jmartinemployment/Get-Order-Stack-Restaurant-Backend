interface MenuTemplateItem {
  name: string;
  description: string | null;
  price: number;
  sortOrder: number;
  prepTimeMinutes: number | null;
  sku: string | null;
  durationMinutes: number | null;
}

interface MenuTemplateCategory {
  name: string;
  sortOrder: number;
  items: MenuTemplateItem[];
}

export interface MenuTemplate {
  id: string;
  vertical: string;
  name: string;
  description: string;
  categories: MenuTemplateCategory[];
  itemCount: number;
}

function countItems(categories: MenuTemplateCategory[]): number {
  return categories.reduce((sum, cat) => sum + cat.items.length, 0);
}

// --- Food & Drink Templates ---

const coffeeShopCategories: MenuTemplateCategory[] = [
  {
    name: 'Hot Drinks', sortOrder: 1,
    items: [
      { name: 'Drip Coffee', description: 'Fresh brewed house blend', price: 3.50, sortOrder: 1, prepTimeMinutes: 2, sku: null, durationMinutes: null },
      { name: 'Americano', description: 'Espresso with hot water', price: 4, sortOrder: 2, prepTimeMinutes: 3, sku: null, durationMinutes: null },
      { name: 'Latte', description: 'Espresso with steamed milk', price: 5.50, sortOrder: 3, prepTimeMinutes: 4, sku: null, durationMinutes: null },
      { name: 'Cappuccino', description: 'Espresso with foam', price: 5.50, sortOrder: 4, prepTimeMinutes: 4, sku: null, durationMinutes: null },
      { name: 'Mocha', description: 'Espresso, chocolate, steamed milk', price: 6, sortOrder: 5, prepTimeMinutes: 5, sku: null, durationMinutes: null },
      { name: 'Hot Tea', description: 'Selection of loose leaf teas', price: 3.50, sortOrder: 6, prepTimeMinutes: 2, sku: null, durationMinutes: null },
    ],
  },
  {
    name: 'Cold Drinks', sortOrder: 2,
    items: [
      { name: 'Iced Coffee', description: 'Cold brewed over ice', price: 4.50, sortOrder: 1, prepTimeMinutes: 2, sku: null, durationMinutes: null },
      { name: 'Iced Latte', description: 'Espresso over ice with milk', price: 6, sortOrder: 2, prepTimeMinutes: 3, sku: null, durationMinutes: null },
      { name: 'Cold Brew', description: '20-hour steeped cold brew', price: 5, sortOrder: 3, prepTimeMinutes: 1, sku: null, durationMinutes: null },
      { name: 'Smoothie', description: 'Blended fruit smoothie', price: 7, sortOrder: 4, prepTimeMinutes: 4, sku: null, durationMinutes: null },
    ],
  },
  {
    name: 'Pastries', sortOrder: 3,
    items: [
      { name: 'Croissant', description: 'Butter croissant', price: 3.50, sortOrder: 1, prepTimeMinutes: 1, sku: null, durationMinutes: null },
      { name: 'Muffin', description: 'Blueberry or chocolate chip', price: 3.50, sortOrder: 2, prepTimeMinutes: 1, sku: null, durationMinutes: null },
      { name: 'Bagel with Cream Cheese', description: 'Toasted with cream cheese', price: 4.50, sortOrder: 3, prepTimeMinutes: 3, sku: null, durationMinutes: null },
      { name: 'Scone', description: 'Fresh baked daily', price: 3.50, sortOrder: 4, prepTimeMinutes: 1, sku: null, durationMinutes: null },
    ],
  },
];

const pizzaCategories: MenuTemplateCategory[] = [
  {
    name: 'Pizzas', sortOrder: 1,
    items: [
      { name: 'Margherita', description: 'San Marzano tomato, mozzarella, basil', price: 14, sortOrder: 1, prepTimeMinutes: 12, sku: null, durationMinutes: null },
      { name: 'Pepperoni', description: 'Classic pepperoni with mozzarella', price: 16, sortOrder: 2, prepTimeMinutes: 12, sku: null, durationMinutes: null },
      { name: 'Supreme', description: 'Pepperoni, sausage, peppers, onions, olives', price: 18, sortOrder: 3, prepTimeMinutes: 15, sku: null, durationMinutes: null },
      { name: 'BBQ Chicken', description: 'BBQ sauce, chicken, red onion, cilantro', price: 17, sortOrder: 4, prepTimeMinutes: 14, sku: null, durationMinutes: null },
      { name: 'Veggie', description: 'Mushrooms, peppers, onions, olives, tomatoes', price: 15, sortOrder: 5, prepTimeMinutes: 12, sku: null, durationMinutes: null },
    ],
  },
  {
    name: 'Sides', sortOrder: 2,
    items: [
      { name: 'Garlic Bread', description: 'Toasted with garlic butter and herbs', price: 6, sortOrder: 1, prepTimeMinutes: 8, sku: null, durationMinutes: null },
      { name: 'Caesar Salad', description: 'Romaine, parmesan, croutons', price: 9, sortOrder: 2, prepTimeMinutes: 5, sku: null, durationMinutes: null },
      { name: 'Wings', description: 'Choice of buffalo or BBQ', price: 12, sortOrder: 3, prepTimeMinutes: 15, sku: null, durationMinutes: null },
    ],
  },
  {
    name: 'Drinks', sortOrder: 3,
    items: [
      { name: 'Soda', description: 'Coke, Sprite, or Fanta', price: 3, sortOrder: 1, prepTimeMinutes: 1, sku: null, durationMinutes: null },
      { name: 'Iced Tea', description: 'Sweet or unsweetened', price: 3, sortOrder: 2, prepTimeMinutes: 1, sku: null, durationMinutes: null },
    ],
  },
];

const barAndGrillCategories: MenuTemplateCategory[] = [
  {
    name: 'Appetizers', sortOrder: 1,
    items: [
      { name: 'Nachos', description: 'Loaded with cheese, jalapeños, sour cream', price: 12, sortOrder: 1, prepTimeMinutes: 10, sku: null, durationMinutes: null },
      { name: 'Mozzarella Sticks', description: 'Served with marinara', price: 10, sortOrder: 2, prepTimeMinutes: 8, sku: null, durationMinutes: null },
      { name: 'Loaded Fries', description: 'Cheese, bacon, green onion', price: 11, sortOrder: 3, prepTimeMinutes: 10, sku: null, durationMinutes: null },
    ],
  },
  {
    name: 'Burgers', sortOrder: 2,
    items: [
      { name: 'Classic Burger', description: 'Beef patty, lettuce, tomato, pickles', price: 14, sortOrder: 1, prepTimeMinutes: 12, sku: null, durationMinutes: null },
      { name: 'Bacon Cheeseburger', description: 'Cheddar, bacon, all the fixings', price: 16, sortOrder: 2, prepTimeMinutes: 14, sku: null, durationMinutes: null },
      { name: 'Mushroom Swiss', description: 'Sautéed mushrooms, Swiss cheese', price: 16, sortOrder: 3, prepTimeMinutes: 14, sku: null, durationMinutes: null },
    ],
  },
  {
    name: 'Beer', sortOrder: 3,
    items: [
      { name: 'Draft Beer', description: 'Ask about rotating taps', price: 7, sortOrder: 1, prepTimeMinutes: 1, sku: null, durationMinutes: null },
      { name: 'Bottled Beer', description: 'Domestic and import selection', price: 6, sortOrder: 2, prepTimeMinutes: 1, sku: null, durationMinutes: null },
      { name: 'Craft Cocktail', description: 'Seasonal cocktail menu', price: 13, sortOrder: 3, prepTimeMinutes: 4, sku: null, durationMinutes: null },
    ],
  },
];

const tacoTruckCategories: MenuTemplateCategory[] = [
  {
    name: 'Tacos', sortOrder: 1,
    items: [
      { name: 'Carne Asada Taco', description: 'Grilled steak, onion, cilantro', price: 4.50, sortOrder: 1, prepTimeMinutes: 5, sku: null, durationMinutes: null },
      { name: 'Al Pastor Taco', description: 'Marinated pork, pineapple, onion', price: 4.50, sortOrder: 2, prepTimeMinutes: 5, sku: null, durationMinutes: null },
      { name: 'Chicken Taco', description: 'Grilled chicken, salsa verde', price: 4, sortOrder: 3, prepTimeMinutes: 5, sku: null, durationMinutes: null },
      { name: 'Fish Taco', description: 'Battered fish, cabbage slaw, chipotle', price: 5, sortOrder: 4, prepTimeMinutes: 6, sku: null, durationMinutes: null },
    ],
  },
  {
    name: 'Burritos', sortOrder: 2,
    items: [
      { name: 'Carne Asada Burrito', description: 'Rice, beans, cheese, salsa', price: 12, sortOrder: 1, prepTimeMinutes: 7, sku: null, durationMinutes: null },
      { name: 'Chicken Burrito', description: 'Rice, beans, cheese, salsa', price: 11, sortOrder: 2, prepTimeMinutes: 7, sku: null, durationMinutes: null },
    ],
  },
  {
    name: 'Sides & Drinks', sortOrder: 3,
    items: [
      { name: 'Chips & Guac', description: 'Fresh tortilla chips, house guacamole', price: 6, sortOrder: 1, prepTimeMinutes: 3, sku: null, durationMinutes: null },
      { name: 'Horchata', description: 'Traditional rice drink', price: 4, sortOrder: 2, prepTimeMinutes: 1, sku: null, durationMinutes: null },
      { name: 'Mexican Soda', description: 'Jarritos assorted flavors', price: 3, sortOrder: 3, prepTimeMinutes: 1, sku: null, durationMinutes: null },
    ],
  },
];

// --- Retail Templates ---

const clothingBoutiqueCategories: MenuTemplateCategory[] = [
  {
    name: 'Tops', sortOrder: 1,
    items: [
      { name: 'Cotton T-Shirt', description: 'Classic fit, assorted colors', price: 28, sortOrder: 1, prepTimeMinutes: null, sku: 'TOP-001', durationMinutes: null },
      { name: 'Blouse', description: 'Lightweight, button-front', price: 45, sortOrder: 2, prepTimeMinutes: null, sku: 'TOP-002', durationMinutes: null },
      { name: 'Sweater', description: 'Knit pullover', price: 55, sortOrder: 3, prepTimeMinutes: null, sku: 'TOP-003', durationMinutes: null },
    ],
  },
  {
    name: 'Bottoms', sortOrder: 2,
    items: [
      { name: 'Jeans', description: 'Slim fit denim', price: 65, sortOrder: 1, prepTimeMinutes: null, sku: 'BOT-001', durationMinutes: null },
      { name: 'Skirt', description: 'A-line midi', price: 48, sortOrder: 2, prepTimeMinutes: null, sku: 'BOT-002', durationMinutes: null },
    ],
  },
  {
    name: 'Accessories', sortOrder: 3,
    items: [
      { name: 'Scarf', description: 'Lightweight seasonal scarf', price: 22, sortOrder: 1, prepTimeMinutes: null, sku: 'ACC-001', durationMinutes: null },
      { name: 'Hat', description: 'Assorted styles', price: 18, sortOrder: 2, prepTimeMinutes: null, sku: 'ACC-002', durationMinutes: null },
    ],
  },
];

// --- Beauty & Wellness Templates ---

const hairSalonCategories: MenuTemplateCategory[] = [
  {
    name: 'Haircuts', sortOrder: 1,
    items: [
      { name: 'Women\'s Haircut', description: 'Shampoo, cut, and style', price: 55, sortOrder: 1, prepTimeMinutes: null, sku: null, durationMinutes: 60 },
      { name: 'Men\'s Haircut', description: 'Cut and style', price: 35, sortOrder: 2, prepTimeMinutes: null, sku: null, durationMinutes: 30 },
      { name: 'Kids Haircut', description: 'Ages 12 and under', price: 25, sortOrder: 3, prepTimeMinutes: null, sku: null, durationMinutes: 25 },
    ],
  },
  {
    name: 'Color', sortOrder: 2,
    items: [
      { name: 'Single Process Color', description: 'All-over color application', price: 85, sortOrder: 1, prepTimeMinutes: null, sku: null, durationMinutes: 90 },
      { name: 'Highlights', description: 'Partial or full highlights', price: 120, sortOrder: 2, prepTimeMinutes: null, sku: null, durationMinutes: 120 },
      { name: 'Balayage', description: 'Hand-painted highlights', price: 150, sortOrder: 3, prepTimeMinutes: null, sku: null, durationMinutes: 150 },
    ],
  },
  {
    name: 'Treatments', sortOrder: 3,
    items: [
      { name: 'Deep Conditioning', description: 'Hydrating hair treatment', price: 30, sortOrder: 1, prepTimeMinutes: null, sku: null, durationMinutes: 30 },
      { name: 'Blowout', description: 'Shampoo and professional blowout', price: 45, sortOrder: 2, prepTimeMinutes: null, sku: null, durationMinutes: 45 },
    ],
  },
];

// --- Professional Services Templates ---

const consultingCategories: MenuTemplateCategory[] = [
  {
    name: 'Consultations', sortOrder: 1,
    items: [
      { name: 'Initial Consultation', description: '1-hour discovery session', price: 150, sortOrder: 1, prepTimeMinutes: null, sku: null, durationMinutes: 60 },
      { name: 'Follow-Up Session', description: '30-minute check-in', price: 75, sortOrder: 2, prepTimeMinutes: null, sku: null, durationMinutes: 30 },
    ],
  },
  {
    name: 'Packages', sortOrder: 2,
    items: [
      { name: 'Monthly Retainer', description: '10 hours/month of support', price: 1500, sortOrder: 1, prepTimeMinutes: null, sku: null, durationMinutes: null },
      { name: 'Project Assessment', description: 'Full project scope and plan', price: 500, sortOrder: 2, prepTimeMinutes: null, sku: null, durationMinutes: 120 },
    ],
  },
];

// --- Fitness Templates ---

const fitnessStudioCategories: MenuTemplateCategory[] = [
  {
    name: 'Classes', sortOrder: 1,
    items: [
      { name: 'Yoga Class', description: '60-minute all levels', price: 25, sortOrder: 1, prepTimeMinutes: null, sku: null, durationMinutes: 60 },
      { name: 'HIIT Class', description: '45-minute high intensity', price: 25, sortOrder: 2, prepTimeMinutes: null, sku: null, durationMinutes: 45 },
      { name: 'Spin Class', description: '50-minute indoor cycling', price: 28, sortOrder: 3, prepTimeMinutes: null, sku: null, durationMinutes: 50 },
    ],
  },
  {
    name: 'Personal Training', sortOrder: 2,
    items: [
      { name: '1-on-1 Session', description: 'Personal training session', price: 75, sortOrder: 1, prepTimeMinutes: null, sku: null, durationMinutes: 60 },
      { name: 'Partner Session', description: 'Train with a friend', price: 100, sortOrder: 2, prepTimeMinutes: null, sku: null, durationMinutes: 60 },
    ],
  },
  {
    name: 'Memberships', sortOrder: 3,
    items: [
      { name: 'Monthly Membership', description: 'Unlimited classes', price: 99, sortOrder: 1, prepTimeMinutes: null, sku: null, durationMinutes: null },
      { name: '10-Class Pack', description: 'Use anytime within 3 months', price: 200, sortOrder: 2, prepTimeMinutes: null, sku: null, durationMinutes: null },
    ],
  },
];

// --- Assemble all templates ---

export const MENU_TEMPLATES: MenuTemplate[] = [
  {
    id: 'tmpl-coffee-shop',
    vertical: 'food_and_drink',
    name: 'Coffee Shop',
    description: 'Hot & cold drinks, pastries, and light bites',
    categories: coffeeShopCategories,
    itemCount: countItems(coffeeShopCategories),
  },
  {
    id: 'tmpl-pizza-restaurant',
    vertical: 'food_and_drink',
    name: 'Pizza Restaurant',
    description: 'Pizzas, sides, and beverages',
    categories: pizzaCategories,
    itemCount: countItems(pizzaCategories),
  },
  {
    id: 'tmpl-bar-and-grill',
    vertical: 'food_and_drink',
    name: 'Bar & Grill',
    description: 'Appetizers, burgers, and drinks',
    categories: barAndGrillCategories,
    itemCount: countItems(barAndGrillCategories),
  },
  {
    id: 'tmpl-taco-truck',
    vertical: 'food_and_drink',
    name: 'Taco Truck',
    description: 'Street tacos, burritos, and Mexican beverages',
    categories: tacoTruckCategories,
    itemCount: countItems(tacoTruckCategories),
  },
  {
    id: 'tmpl-clothing-boutique',
    vertical: 'retail',
    name: 'Clothing Boutique',
    description: 'Tops, bottoms, and accessories',
    categories: clothingBoutiqueCategories,
    itemCount: countItems(clothingBoutiqueCategories),
  },
  {
    id: 'tmpl-hair-salon',
    vertical: 'beauty_wellness',
    name: 'Hair Salon',
    description: 'Cuts, color, and treatments',
    categories: hairSalonCategories,
    itemCount: countItems(hairSalonCategories),
  },
  {
    id: 'tmpl-consulting',
    vertical: 'professional_services',
    name: 'Consulting Firm',
    description: 'Consultations and service packages',
    categories: consultingCategories,
    itemCount: countItems(consultingCategories),
  },
  {
    id: 'tmpl-fitness-studio',
    vertical: 'sports_fitness',
    name: 'Fitness Studio',
    description: 'Classes, personal training, and memberships',
    categories: fitnessStudioCategories,
    itemCount: countItems(fitnessStudioCategories),
  },
];
