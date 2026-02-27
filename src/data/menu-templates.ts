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

interface MenuTemplateModifier {
  name: string;
  priceAdjustment: number;
  isDefault: boolean;
  sortOrder: number;
}

interface MenuTemplateModifierGroup {
  name: string;
  required: boolean;
  multiSelect: boolean;
  minSelections: number;
  maxSelections: number;
  sortOrder: number;
  modifiers: MenuTemplateModifier[];
  applyTo: 'all' | string[]; // 'all' or array of item names
}

export interface MenuTemplate {
  id: string;
  vertical: string;
  name: string;
  description: string;
  categories: MenuTemplateCategory[];
  modifierGroups: MenuTemplateModifierGroup[];
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

const americanGrillCategories: MenuTemplateCategory[] = [
  {
    name: 'Starters', sortOrder: 1,
    items: [
      { name: 'Fried Chicken Tenders', description: 'Hand-breaded tenders with honey mustard', price: 11, sortOrder: 1, prepTimeMinutes: 10, sku: null, durationMinutes: null },
      { name: 'Loaded Potato Skins', description: 'Cheddar, bacon, sour cream, chives', price: 10, sortOrder: 2, prepTimeMinutes: 12, sku: null, durationMinutes: null },
      { name: 'Mac & Cheese Bites', description: 'Crispy fried mac and cheese', price: 9, sortOrder: 3, prepTimeMinutes: 8, sku: null, durationMinutes: null },
    ],
  },
  {
    name: 'Mains', sortOrder: 2,
    items: [
      { name: 'Grilled Ribeye', description: '12 oz ribeye with garlic butter, seasonal vegetables', price: 28, sortOrder: 1, prepTimeMinutes: 15, sku: null, durationMinutes: null },
      { name: 'Southern Fried Chicken', description: 'Half chicken, collard greens, cornbread', price: 18, sortOrder: 2, prepTimeMinutes: 15, sku: null, durationMinutes: null },
      { name: 'Smothered Pork Chops', description: 'Pan-fried chops with onion gravy, mashed potatoes', price: 19, sortOrder: 3, prepTimeMinutes: 14, sku: null, durationMinutes: null },
      { name: 'Shrimp & Grits', description: 'Sautéed shrimp, creamy stone-ground grits', price: 17, sortOrder: 4, prepTimeMinutes: 12, sku: null, durationMinutes: null },
    ],
  },
  {
    name: 'Drinks', sortOrder: 3,
    items: [
      { name: 'Sweet Tea', description: 'Southern-style sweet iced tea', price: 3, sortOrder: 1, prepTimeMinutes: 1, sku: null, durationMinutes: null },
      { name: 'Lemonade', description: 'Fresh-squeezed lemonade', price: 4, sortOrder: 2, prepTimeMinutes: 2, sku: null, durationMinutes: null },
    ],
  },
];

const bbqCategories: MenuTemplateCategory[] = [
  {
    name: 'Platters', sortOrder: 1,
    items: [
      { name: 'Brisket Platter', description: 'Slow-smoked beef brisket with two sides', price: 22, sortOrder: 1, prepTimeMinutes: 5, sku: null, durationMinutes: null },
      { name: 'Pulled Pork Platter', description: 'Hickory-smoked pulled pork with two sides', price: 18, sortOrder: 2, prepTimeMinutes: 5, sku: null, durationMinutes: null },
      { name: 'Smoked Ribs (Half Rack)', description: 'St. Louis-style ribs, dry rub or sauced', price: 24, sortOrder: 3, prepTimeMinutes: 5, sku: null, durationMinutes: null },
      { name: 'Combo Platter', description: 'Choose two meats with two sides', price: 26, sortOrder: 4, prepTimeMinutes: 5, sku: null, durationMinutes: null },
    ],
  },
  {
    name: 'Sides', sortOrder: 2,
    items: [
      { name: 'Coleslaw', description: 'Creamy house-made coleslaw', price: 4, sortOrder: 1, prepTimeMinutes: 1, sku: null, durationMinutes: null },
      { name: 'Baked Beans', description: 'Smoky slow-cooked beans', price: 4, sortOrder: 2, prepTimeMinutes: 1, sku: null, durationMinutes: null },
      { name: 'Cornbread', description: 'Honey butter cornbread', price: 3, sortOrder: 3, prepTimeMinutes: 1, sku: null, durationMinutes: null },
    ],
  },
  {
    name: 'Drinks', sortOrder: 3,
    items: [
      { name: 'Sweet Tea', description: 'Southern-style sweet iced tea', price: 3, sortOrder: 1, prepTimeMinutes: 1, sku: null, durationMinutes: null },
      { name: 'Craft Lager', description: 'Local craft beer on draft', price: 6, sortOrder: 2, prepTimeMinutes: 1, sku: null, durationMinutes: null },
    ],
  },
];

const asianKitchenCategories: MenuTemplateCategory[] = [
  {
    name: 'Appetizers', sortOrder: 1,
    items: [
      { name: 'Spring Rolls', description: 'Crispy vegetable spring rolls with sweet chili', price: 8, sortOrder: 1, prepTimeMinutes: 6, sku: null, durationMinutes: null },
      { name: 'Edamame', description: 'Steamed and salted soybeans', price: 6, sortOrder: 2, prepTimeMinutes: 3, sku: null, durationMinutes: null },
      { name: 'Pork Dumplings', description: 'Pan-fried dumplings with soy dipping sauce', price: 10, sortOrder: 3, prepTimeMinutes: 8, sku: null, durationMinutes: null },
    ],
  },
  {
    name: 'Entrees', sortOrder: 2,
    items: [
      { name: 'Pad Thai', description: 'Rice noodles, shrimp, peanuts, bean sprouts', price: 16, sortOrder: 1, prepTimeMinutes: 12, sku: null, durationMinutes: null },
      { name: 'General Tso\'s Chicken', description: 'Crispy chicken in sweet-spicy sauce with rice', price: 15, sortOrder: 2, prepTimeMinutes: 12, sku: null, durationMinutes: null },
      { name: 'Beef Bulgogi', description: 'Marinated grilled beef with steamed rice', price: 18, sortOrder: 3, prepTimeMinutes: 14, sku: null, durationMinutes: null },
      { name: 'Chicken Teriyaki', description: 'Grilled chicken with teriyaki glaze and vegetables', price: 15, sortOrder: 4, prepTimeMinutes: 12, sku: null, durationMinutes: null },
    ],
  },
  {
    name: 'Drinks', sortOrder: 3,
    items: [
      { name: 'Thai Iced Tea', description: 'Sweet creamy Thai tea over ice', price: 5, sortOrder: 1, prepTimeMinutes: 2, sku: null, durationMinutes: null },
      { name: 'Hot Green Tea', description: 'Traditional brewed green tea', price: 3, sortOrder: 2, prepTimeMinutes: 2, sku: null, durationMinutes: null },
    ],
  },
];

const indianCategories: MenuTemplateCategory[] = [
  {
    name: 'Starters', sortOrder: 1,
    items: [
      { name: 'Samosas', description: 'Crispy pastry filled with spiced potatoes and peas', price: 8, sortOrder: 1, prepTimeMinutes: 6, sku: null, durationMinutes: null },
      { name: 'Onion Bhaji', description: 'Spiced onion fritters with mint chutney', price: 7, sortOrder: 2, prepTimeMinutes: 6, sku: null, durationMinutes: null },
      { name: 'Chicken Tikka', description: 'Tandoori-spiced chicken skewers', price: 12, sortOrder: 3, prepTimeMinutes: 10, sku: null, durationMinutes: null },
    ],
  },
  {
    name: 'Curries & Mains', sortOrder: 2,
    items: [
      { name: 'Butter Chicken', description: 'Tandoori chicken in creamy tomato sauce with naan', price: 17, sortOrder: 1, prepTimeMinutes: 12, sku: null, durationMinutes: null },
      { name: 'Lamb Rogan Josh', description: 'Slow-cooked lamb in aromatic Kashmiri spices', price: 19, sortOrder: 2, prepTimeMinutes: 14, sku: null, durationMinutes: null },
      { name: 'Palak Paneer', description: 'Spinach and cottage cheese curry', price: 15, sortOrder: 3, prepTimeMinutes: 10, sku: null, durationMinutes: null },
      { name: 'Chicken Biryani', description: 'Fragrant basmati rice with spiced chicken', price: 18, sortOrder: 4, prepTimeMinutes: 15, sku: null, durationMinutes: null },
    ],
  },
  {
    name: 'Drinks', sortOrder: 3,
    items: [
      { name: 'Mango Lassi', description: 'Creamy yogurt mango smoothie', price: 5, sortOrder: 1, prepTimeMinutes: 2, sku: null, durationMinutes: null },
      { name: 'Masala Chai', description: 'Spiced Indian tea with milk', price: 4, sortOrder: 2, prepTimeMinutes: 3, sku: null, durationMinutes: null },
    ],
  },
];

const mediterraneanCategories: MenuTemplateCategory[] = [
  {
    name: 'Mezze', sortOrder: 1,
    items: [
      { name: 'Hummus & Pita', description: 'Classic chickpea hummus with warm pita bread', price: 9, sortOrder: 1, prepTimeMinutes: 3, sku: null, durationMinutes: null },
      { name: 'Falafel', description: 'Crispy chickpea fritters with tahini sauce', price: 10, sortOrder: 2, prepTimeMinutes: 8, sku: null, durationMinutes: null },
      { name: 'Greek Salad', description: 'Tomato, cucumber, olives, red onion, feta', price: 11, sortOrder: 3, prepTimeMinutes: 5, sku: null, durationMinutes: null },
    ],
  },
  {
    name: 'Mains', sortOrder: 2,
    items: [
      { name: 'Chicken Shawarma Plate', description: 'Marinated chicken, rice, salad, garlic sauce', price: 17, sortOrder: 1, prepTimeMinutes: 10, sku: null, durationMinutes: null },
      { name: 'Lamb Kofta', description: 'Grilled lamb skewers with tzatziki and rice', price: 19, sortOrder: 2, prepTimeMinutes: 12, sku: null, durationMinutes: null },
      { name: 'Grilled Salmon', description: 'Lemon herb salmon with couscous and vegetables', price: 22, sortOrder: 3, prepTimeMinutes: 14, sku: null, durationMinutes: null },
      { name: 'Lamb Gyro Wrap', description: 'Seasoned lamb, tomato, onion, tzatziki in pita', price: 14, sortOrder: 4, prepTimeMinutes: 8, sku: null, durationMinutes: null },
    ],
  },
  {
    name: 'Drinks', sortOrder: 3,
    items: [
      { name: 'Fresh Mint Lemonade', description: 'Lemonade with fresh mint leaves', price: 5, sortOrder: 1, prepTimeMinutes: 2, sku: null, durationMinutes: null },
      { name: 'Turkish Coffee', description: 'Traditional finely ground coffee', price: 4, sortOrder: 2, prepTimeMinutes: 4, sku: null, durationMinutes: null },
    ],
  },
];

const seafoodCategories: MenuTemplateCategory[] = [
  {
    name: 'Raw Bar', sortOrder: 1,
    items: [
      { name: 'Oysters (Half Dozen)', description: 'East coast oysters on the half shell', price: 18, sortOrder: 1, prepTimeMinutes: 5, sku: null, durationMinutes: null },
      { name: 'Shrimp Cocktail', description: 'Chilled jumbo shrimp with cocktail sauce', price: 16, sortOrder: 2, prepTimeMinutes: 3, sku: null, durationMinutes: null },
      { name: 'Tuna Poke', description: 'Ahi tuna, sesame, soy, avocado, wonton chips', price: 15, sortOrder: 3, prepTimeMinutes: 5, sku: null, durationMinutes: null },
    ],
  },
  {
    name: 'Entrees', sortOrder: 2,
    items: [
      { name: 'Fish & Chips', description: 'Beer-battered cod with fries and tartar sauce', price: 18, sortOrder: 1, prepTimeMinutes: 12, sku: null, durationMinutes: null },
      { name: 'Grilled Salmon', description: 'Atlantic salmon with lemon butter and asparagus', price: 26, sortOrder: 2, prepTimeMinutes: 14, sku: null, durationMinutes: null },
      { name: 'Lobster Roll', description: 'Maine lobster, butter, toasted split-top roll', price: 28, sortOrder: 3, prepTimeMinutes: 10, sku: null, durationMinutes: null },
      { name: 'Seafood Pasta', description: 'Shrimp, mussels, clams in white wine garlic sauce', price: 24, sortOrder: 4, prepTimeMinutes: 15, sku: null, durationMinutes: null },
    ],
  },
  {
    name: 'Drinks', sortOrder: 3,
    items: [
      { name: 'White Wine', description: 'Glass of house Sauvignon Blanc', price: 10, sortOrder: 1, prepTimeMinutes: 1, sku: null, durationMinutes: null },
      { name: 'Sparkling Water', description: 'Pellegrino or Perrier', price: 4, sortOrder: 2, prepTimeMinutes: 1, sku: null, durationMinutes: null },
    ],
  },
];

const iceCreamCategories: MenuTemplateCategory[] = [
  {
    name: 'Scoops & Cups', sortOrder: 1,
    items: [
      { name: 'Single Scoop', description: 'One scoop in a cup or cone', price: 4, sortOrder: 1, prepTimeMinutes: 2, sku: null, durationMinutes: null },
      { name: 'Double Scoop', description: 'Two scoops in a cup or waffle cone', price: 6, sortOrder: 2, prepTimeMinutes: 2, sku: null, durationMinutes: null },
      { name: 'Waffle Bowl', description: 'Two scoops in a fresh waffle bowl', price: 8, sortOrder: 3, prepTimeMinutes: 3, sku: null, durationMinutes: null },
      { name: 'Pint To Go', description: 'Take home a pint of any flavor', price: 9, sortOrder: 4, prepTimeMinutes: 1, sku: null, durationMinutes: null },
    ],
  },
  {
    name: 'Specialty', sortOrder: 2,
    items: [
      { name: 'Sundae', description: 'Two scoops with hot fudge, whipped cream, cherry', price: 8, sortOrder: 1, prepTimeMinutes: 4, sku: null, durationMinutes: null },
      { name: 'Banana Split', description: 'Three scoops, banana, toppings, whipped cream', price: 10, sortOrder: 2, prepTimeMinutes: 5, sku: null, durationMinutes: null },
      { name: 'Milkshake', description: 'Hand-spun milkshake, any flavor', price: 7, sortOrder: 3, prepTimeMinutes: 4, sku: null, durationMinutes: null },
    ],
  },
  {
    name: 'Drinks', sortOrder: 3,
    items: [
      { name: 'Root Beer Float', description: 'Vanilla ice cream in root beer', price: 6, sortOrder: 1, prepTimeMinutes: 2, sku: null, durationMinutes: null },
      { name: 'Bottled Water', description: 'Still or sparkling', price: 2, sortOrder: 2, prepTimeMinutes: 1, sku: null, durationMinutes: null },
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

// --- Modifier Group Definitions ---

const coffeeShopModifiers: MenuTemplateModifierGroup[] = [
  {
    name: 'Size', required: true, multiSelect: false, minSelections: 1, maxSelections: 1, sortOrder: 1,
    modifiers: [
      { name: 'Small (12 oz)', priceAdjustment: 0, isDefault: true, sortOrder: 1 },
      { name: 'Medium (16 oz)', priceAdjustment: 0.75, isDefault: false, sortOrder: 2 },
      { name: 'Large (20 oz)', priceAdjustment: 1.50, isDefault: false, sortOrder: 3 },
    ],
    applyTo: ['Drip Coffee', 'Americano', 'Latte', 'Cappuccino', 'Mocha', 'Hot Tea', 'Iced Coffee', 'Iced Latte', 'Cold Brew', 'Smoothie'],
  },
  {
    name: 'Milk', required: false, multiSelect: false, minSelections: 0, maxSelections: 1, sortOrder: 2,
    modifiers: [
      { name: 'Whole Milk', priceAdjustment: 0, isDefault: true, sortOrder: 1 },
      { name: 'Oat Milk', priceAdjustment: 0.75, isDefault: false, sortOrder: 2 },
      { name: 'Almond Milk', priceAdjustment: 0.75, isDefault: false, sortOrder: 3 },
      { name: 'Soy Milk', priceAdjustment: 0.50, isDefault: false, sortOrder: 4 },
    ],
    applyTo: ['Latte', 'Cappuccino', 'Mocha', 'Iced Latte', 'Smoothie'],
  },
  {
    name: 'Extras', required: false, multiSelect: true, minSelections: 0, maxSelections: 3, sortOrder: 3,
    modifiers: [
      { name: 'Extra Shot', priceAdjustment: 1, isDefault: false, sortOrder: 1 },
      { name: 'Vanilla Syrup', priceAdjustment: 0.50, isDefault: false, sortOrder: 2 },
      { name: 'Caramel Syrup', priceAdjustment: 0.50, isDefault: false, sortOrder: 3 },
      { name: 'Whipped Cream', priceAdjustment: 0.50, isDefault: false, sortOrder: 4 },
    ],
    applyTo: ['Drip Coffee', 'Americano', 'Latte', 'Cappuccino', 'Mocha', 'Iced Coffee', 'Iced Latte', 'Cold Brew'],
  },
];

const pizzaModifiers: MenuTemplateModifierGroup[] = [
  {
    name: 'Size', required: true, multiSelect: false, minSelections: 1, maxSelections: 1, sortOrder: 1,
    modifiers: [
      { name: 'Small (10")', priceAdjustment: 0, isDefault: false, sortOrder: 1 },
      { name: 'Medium (12")', priceAdjustment: 2, isDefault: true, sortOrder: 2 },
      { name: 'Large (16")', priceAdjustment: 4, isDefault: false, sortOrder: 3 },
    ],
    applyTo: ['Margherita', 'Pepperoni', 'Supreme', 'BBQ Chicken', 'Veggie'],
  },
  {
    name: 'Crust', required: true, multiSelect: false, minSelections: 1, maxSelections: 1, sortOrder: 2,
    modifiers: [
      { name: 'Hand Tossed', priceAdjustment: 0, isDefault: true, sortOrder: 1 },
      { name: 'Thin Crust', priceAdjustment: 0, isDefault: false, sortOrder: 2 },
      { name: 'Deep Dish', priceAdjustment: 2, isDefault: false, sortOrder: 3 },
    ],
    applyTo: ['Margherita', 'Pepperoni', 'Supreme', 'BBQ Chicken', 'Veggie'],
  },
  {
    name: 'Extra Toppings', required: false, multiSelect: true, minSelections: 0, maxSelections: 5, sortOrder: 3,
    modifiers: [
      { name: 'Extra Cheese', priceAdjustment: 1.50, isDefault: false, sortOrder: 1 },
      { name: 'Mushrooms', priceAdjustment: 1, isDefault: false, sortOrder: 2 },
      { name: 'Jalapeños', priceAdjustment: 1, isDefault: false, sortOrder: 3 },
      { name: 'Bacon', priceAdjustment: 1.50, isDefault: false, sortOrder: 4 },
    ],
    applyTo: ['Margherita', 'Pepperoni', 'Supreme', 'BBQ Chicken', 'Veggie'],
  },
  {
    name: 'Wing Sauce', required: true, multiSelect: false, minSelections: 1, maxSelections: 1, sortOrder: 4,
    modifiers: [
      { name: 'Buffalo', priceAdjustment: 0, isDefault: true, sortOrder: 1 },
      { name: 'BBQ', priceAdjustment: 0, isDefault: false, sortOrder: 2 },
      { name: 'Garlic Parmesan', priceAdjustment: 0, isDefault: false, sortOrder: 3 },
    ],
    applyTo: ['Wings'],
  },
];

const barAndGrillModifiers: MenuTemplateModifierGroup[] = [
  {
    name: 'Burger Temperature', required: true, multiSelect: false, minSelections: 1, maxSelections: 1, sortOrder: 1,
    modifiers: [
      { name: 'Medium Rare', priceAdjustment: 0, isDefault: false, sortOrder: 1 },
      { name: 'Medium', priceAdjustment: 0, isDefault: true, sortOrder: 2 },
      { name: 'Medium Well', priceAdjustment: 0, isDefault: false, sortOrder: 3 },
      { name: 'Well Done', priceAdjustment: 0, isDefault: false, sortOrder: 4 },
    ],
    applyTo: ['Classic Burger', 'Bacon Cheeseburger', 'Mushroom Swiss'],
  },
  {
    name: 'Side Choice', required: true, multiSelect: false, minSelections: 1, maxSelections: 1, sortOrder: 2,
    modifiers: [
      { name: 'French Fries', priceAdjustment: 0, isDefault: true, sortOrder: 1 },
      { name: 'Onion Rings', priceAdjustment: 1, isDefault: false, sortOrder: 2 },
      { name: 'Side Salad', priceAdjustment: 0, isDefault: false, sortOrder: 3 },
      { name: 'Coleslaw', priceAdjustment: 0, isDefault: false, sortOrder: 4 },
    ],
    applyTo: ['Classic Burger', 'Bacon Cheeseburger', 'Mushroom Swiss'],
  },
  {
    name: 'Add-Ons', required: false, multiSelect: true, minSelections: 0, maxSelections: 4, sortOrder: 3,
    modifiers: [
      { name: 'Extra Cheese', priceAdjustment: 1, isDefault: false, sortOrder: 1 },
      { name: 'Avocado', priceAdjustment: 1.50, isDefault: false, sortOrder: 2 },
      { name: 'Fried Egg', priceAdjustment: 1.50, isDefault: false, sortOrder: 3 },
    ],
    applyTo: ['Classic Burger', 'Bacon Cheeseburger', 'Mushroom Swiss'],
  },
];

const tacoTruckModifiers: MenuTemplateModifierGroup[] = [
  {
    name: 'Tortilla', required: true, multiSelect: false, minSelections: 1, maxSelections: 1, sortOrder: 1,
    modifiers: [
      { name: 'Corn', priceAdjustment: 0, isDefault: true, sortOrder: 1 },
      { name: 'Flour', priceAdjustment: 0, isDefault: false, sortOrder: 2 },
    ],
    applyTo: ['Carne Asada Taco', 'Al Pastor Taco', 'Chicken Taco', 'Fish Taco'],
  },
  {
    name: 'Salsa', required: false, multiSelect: true, minSelections: 0, maxSelections: 3, sortOrder: 2,
    modifiers: [
      { name: 'Salsa Verde', priceAdjustment: 0, isDefault: false, sortOrder: 1 },
      { name: 'Salsa Roja', priceAdjustment: 0, isDefault: false, sortOrder: 2 },
      { name: 'Pico de Gallo', priceAdjustment: 0, isDefault: false, sortOrder: 3 },
      { name: 'Habanero', priceAdjustment: 0, isDefault: false, sortOrder: 4 },
    ],
    applyTo: 'all',
  },
  {
    name: 'Extras', required: false, multiSelect: true, minSelections: 0, maxSelections: 3, sortOrder: 3,
    modifiers: [
      { name: 'Extra Meat', priceAdjustment: 2, isDefault: false, sortOrder: 1 },
      { name: 'Sour Cream', priceAdjustment: 0.75, isDefault: false, sortOrder: 2 },
      { name: 'Guacamole', priceAdjustment: 1.50, isDefault: false, sortOrder: 3 },
      { name: 'Cheese', priceAdjustment: 1, isDefault: false, sortOrder: 4 },
    ],
    applyTo: ['Carne Asada Taco', 'Al Pastor Taco', 'Chicken Taco', 'Fish Taco', 'Carne Asada Burrito', 'Chicken Burrito'],
  },
];

const americanGrillModifiers: MenuTemplateModifierGroup[] = [
  {
    name: 'Steak Temperature', required: true, multiSelect: false, minSelections: 1, maxSelections: 1, sortOrder: 1,
    modifiers: [
      { name: 'Rare', priceAdjustment: 0, isDefault: false, sortOrder: 1 },
      { name: 'Medium Rare', priceAdjustment: 0, isDefault: true, sortOrder: 2 },
      { name: 'Medium', priceAdjustment: 0, isDefault: false, sortOrder: 3 },
      { name: 'Medium Well', priceAdjustment: 0, isDefault: false, sortOrder: 4 },
      { name: 'Well Done', priceAdjustment: 0, isDefault: false, sortOrder: 5 },
    ],
    applyTo: ['Grilled Ribeye'],
  },
  {
    name: 'Side Choice', required: true, multiSelect: false, minSelections: 1, maxSelections: 1, sortOrder: 2,
    modifiers: [
      { name: 'Mashed Potatoes', priceAdjustment: 0, isDefault: true, sortOrder: 1 },
      { name: 'Fries', priceAdjustment: 0, isDefault: false, sortOrder: 2 },
      { name: 'Collard Greens', priceAdjustment: 0, isDefault: false, sortOrder: 3 },
      { name: 'Mac & Cheese', priceAdjustment: 1, isDefault: false, sortOrder: 4 },
    ],
    applyTo: ['Grilled Ribeye', 'Southern Fried Chicken', 'Smothered Pork Chops'],
  },
];

const bbqModifiers: MenuTemplateModifierGroup[] = [
  {
    name: 'First Meat', required: true, multiSelect: false, minSelections: 1, maxSelections: 1, sortOrder: 1,
    modifiers: [
      { name: 'Brisket', priceAdjustment: 0, isDefault: true, sortOrder: 1 },
      { name: 'Pulled Pork', priceAdjustment: 0, isDefault: false, sortOrder: 2 },
      { name: 'Ribs', priceAdjustment: 2, isDefault: false, sortOrder: 3 },
      { name: 'Smoked Sausage', priceAdjustment: 0, isDefault: false, sortOrder: 4 },
    ],
    applyTo: ['Combo Platter'],
  },
  {
    name: 'Second Meat', required: true, multiSelect: false, minSelections: 1, maxSelections: 1, sortOrder: 2,
    modifiers: [
      { name: 'Brisket', priceAdjustment: 0, isDefault: false, sortOrder: 1 },
      { name: 'Pulled Pork', priceAdjustment: 0, isDefault: true, sortOrder: 2 },
      { name: 'Ribs', priceAdjustment: 2, isDefault: false, sortOrder: 3 },
      { name: 'Smoked Sausage', priceAdjustment: 0, isDefault: false, sortOrder: 4 },
    ],
    applyTo: ['Combo Platter'],
  },
  {
    name: 'Sauce', required: false, multiSelect: false, minSelections: 0, maxSelections: 1, sortOrder: 3,
    modifiers: [
      { name: 'Original BBQ', priceAdjustment: 0, isDefault: true, sortOrder: 1 },
      { name: 'Spicy', priceAdjustment: 0, isDefault: false, sortOrder: 2 },
      { name: 'Carolina Mustard', priceAdjustment: 0, isDefault: false, sortOrder: 3 },
      { name: 'No Sauce (Dry Rub)', priceAdjustment: 0, isDefault: false, sortOrder: 4 },
    ],
    applyTo: ['Brisket Platter', 'Pulled Pork Platter', 'Smoked Ribs (Half Rack)', 'Combo Platter'],
  },
  {
    name: 'Side Choice', required: true, multiSelect: true, minSelections: 2, maxSelections: 2, sortOrder: 4,
    modifiers: [
      { name: 'Coleslaw', priceAdjustment: 0, isDefault: true, sortOrder: 1 },
      { name: 'Baked Beans', priceAdjustment: 0, isDefault: true, sortOrder: 2 },
      { name: 'Cornbread', priceAdjustment: 0, isDefault: false, sortOrder: 3 },
      { name: 'Mac & Cheese', priceAdjustment: 1, isDefault: false, sortOrder: 4 },
      { name: 'Fries', priceAdjustment: 0, isDefault: false, sortOrder: 5 },
    ],
    applyTo: ['Brisket Platter', 'Pulled Pork Platter', 'Smoked Ribs (Half Rack)', 'Combo Platter'],
  },
];

const asianKitchenModifiers: MenuTemplateModifierGroup[] = [
  {
    name: 'Protein', required: true, multiSelect: false, minSelections: 1, maxSelections: 1, sortOrder: 1,
    modifiers: [
      { name: 'Chicken', priceAdjustment: 0, isDefault: true, sortOrder: 1 },
      { name: 'Shrimp', priceAdjustment: 3, isDefault: false, sortOrder: 2 },
      { name: 'Tofu', priceAdjustment: 0, isDefault: false, sortOrder: 3 },
      { name: 'Beef', priceAdjustment: 2, isDefault: false, sortOrder: 4 },
    ],
    applyTo: ['Pad Thai', 'Chicken Teriyaki'],
  },
  {
    name: 'Spice Level', required: false, multiSelect: false, minSelections: 0, maxSelections: 1, sortOrder: 2,
    modifiers: [
      { name: 'Mild', priceAdjustment: 0, isDefault: false, sortOrder: 1 },
      { name: 'Medium', priceAdjustment: 0, isDefault: true, sortOrder: 2 },
      { name: 'Spicy', priceAdjustment: 0, isDefault: false, sortOrder: 3 },
      { name: 'Extra Spicy', priceAdjustment: 0, isDefault: false, sortOrder: 4 },
    ],
    applyTo: ['Pad Thai', 'General Tso\'s Chicken', 'Beef Bulgogi', 'Chicken Teriyaki'],
  },
  {
    name: 'Add Rice', required: false, multiSelect: false, minSelections: 0, maxSelections: 1, sortOrder: 3,
    modifiers: [
      { name: 'Steamed White Rice', priceAdjustment: 0, isDefault: true, sortOrder: 1 },
      { name: 'Brown Rice', priceAdjustment: 0.50, isDefault: false, sortOrder: 2 },
      { name: 'Fried Rice', priceAdjustment: 2, isDefault: false, sortOrder: 3 },
    ],
    applyTo: ['General Tso\'s Chicken', 'Chicken Teriyaki'],
  },
];

const indianModifiers: MenuTemplateModifierGroup[] = [
  {
    name: 'Spice Level', required: true, multiSelect: false, minSelections: 1, maxSelections: 1, sortOrder: 1,
    modifiers: [
      { name: 'Mild', priceAdjustment: 0, isDefault: false, sortOrder: 1 },
      { name: 'Medium', priceAdjustment: 0, isDefault: true, sortOrder: 2 },
      { name: 'Hot', priceAdjustment: 0, isDefault: false, sortOrder: 3 },
      { name: 'Extra Hot', priceAdjustment: 0, isDefault: false, sortOrder: 4 },
    ],
    applyTo: ['Butter Chicken', 'Lamb Rogan Josh', 'Palak Paneer', 'Chicken Biryani'],
  },
  {
    name: 'Bread', required: false, multiSelect: false, minSelections: 0, maxSelections: 1, sortOrder: 2,
    modifiers: [
      { name: 'Naan', priceAdjustment: 0, isDefault: true, sortOrder: 1 },
      { name: 'Garlic Naan', priceAdjustment: 1, isDefault: false, sortOrder: 2 },
      { name: 'Roti', priceAdjustment: 0, isDefault: false, sortOrder: 3 },
      { name: 'Paratha', priceAdjustment: 1.50, isDefault: false, sortOrder: 4 },
    ],
    applyTo: ['Butter Chicken', 'Lamb Rogan Josh', 'Palak Paneer'],
  },
  {
    name: 'Rice', required: false, multiSelect: false, minSelections: 0, maxSelections: 1, sortOrder: 3,
    modifiers: [
      { name: 'Basmati Rice', priceAdjustment: 0, isDefault: true, sortOrder: 1 },
      { name: 'Jeera Rice', priceAdjustment: 1, isDefault: false, sortOrder: 2 },
      { name: 'No Rice', priceAdjustment: 0, isDefault: false, sortOrder: 3 },
    ],
    applyTo: ['Butter Chicken', 'Lamb Rogan Josh', 'Palak Paneer'],
  },
];

const mediterraneanModifiers: MenuTemplateModifierGroup[] = [
  {
    name: 'Protein', required: false, multiSelect: false, minSelections: 0, maxSelections: 1, sortOrder: 1,
    modifiers: [
      { name: 'Chicken', priceAdjustment: 3, isDefault: false, sortOrder: 1 },
      { name: 'Lamb', priceAdjustment: 4, isDefault: false, sortOrder: 2 },
      { name: 'Falafel', priceAdjustment: 2, isDefault: false, sortOrder: 3 },
    ],
    applyTo: ['Hummus & Pita', 'Greek Salad'],
  },
  {
    name: 'Sauce', required: false, multiSelect: true, minSelections: 0, maxSelections: 2, sortOrder: 2,
    modifiers: [
      { name: 'Tzatziki', priceAdjustment: 0, isDefault: true, sortOrder: 1 },
      { name: 'Tahini', priceAdjustment: 0, isDefault: false, sortOrder: 2 },
      { name: 'Garlic Sauce', priceAdjustment: 0, isDefault: false, sortOrder: 3 },
      { name: 'Hot Sauce', priceAdjustment: 0, isDefault: false, sortOrder: 4 },
    ],
    applyTo: ['Chicken Shawarma Plate', 'Lamb Kofta', 'Lamb Gyro Wrap', 'Falafel'],
  },
];

const seafoodModifiers: MenuTemplateModifierGroup[] = [
  {
    name: 'Preparation', required: true, multiSelect: false, minSelections: 1, maxSelections: 1, sortOrder: 1,
    modifiers: [
      { name: 'Grilled', priceAdjustment: 0, isDefault: true, sortOrder: 1 },
      { name: 'Blackened', priceAdjustment: 0, isDefault: false, sortOrder: 2 },
      { name: 'Pan-Seared', priceAdjustment: 0, isDefault: false, sortOrder: 3 },
    ],
    applyTo: ['Grilled Salmon'],
  },
  {
    name: 'Side Choice', required: true, multiSelect: false, minSelections: 1, maxSelections: 1, sortOrder: 2,
    modifiers: [
      { name: 'Fries', priceAdjustment: 0, isDefault: true, sortOrder: 1 },
      { name: 'Coleslaw', priceAdjustment: 0, isDefault: false, sortOrder: 2 },
      { name: 'Asparagus', priceAdjustment: 1, isDefault: false, sortOrder: 3 },
      { name: 'Rice Pilaf', priceAdjustment: 0, isDefault: false, sortOrder: 4 },
    ],
    applyTo: ['Fish & Chips', 'Grilled Salmon', 'Lobster Roll'],
  },
];

const iceCreamModifiers: MenuTemplateModifierGroup[] = [
  {
    name: 'Flavor', required: true, multiSelect: false, minSelections: 1, maxSelections: 1, sortOrder: 1,
    modifiers: [
      { name: 'Vanilla', priceAdjustment: 0, isDefault: true, sortOrder: 1 },
      { name: 'Chocolate', priceAdjustment: 0, isDefault: false, sortOrder: 2 },
      { name: 'Strawberry', priceAdjustment: 0, isDefault: false, sortOrder: 3 },
      { name: 'Cookies & Cream', priceAdjustment: 0, isDefault: false, sortOrder: 4 },
      { name: 'Mint Chip', priceAdjustment: 0, isDefault: false, sortOrder: 5 },
    ],
    applyTo: ['Single Scoop', 'Double Scoop', 'Waffle Bowl', 'Pint To Go', 'Sundae', 'Milkshake'],
  },
  {
    name: 'Toppings', required: false, multiSelect: true, minSelections: 0, maxSelections: 3, sortOrder: 2,
    modifiers: [
      { name: 'Hot Fudge', priceAdjustment: 0.75, isDefault: false, sortOrder: 1 },
      { name: 'Sprinkles', priceAdjustment: 0.50, isDefault: false, sortOrder: 2 },
      { name: 'Crushed Oreos', priceAdjustment: 0.75, isDefault: false, sortOrder: 3 },
      { name: 'Caramel Sauce', priceAdjustment: 0.75, isDefault: false, sortOrder: 4 },
      { name: 'Whipped Cream', priceAdjustment: 0.50, isDefault: false, sortOrder: 5 },
    ],
    applyTo: ['Single Scoop', 'Double Scoop', 'Waffle Bowl'],
  },
  {
    name: 'Cone Type', required: true, multiSelect: false, minSelections: 1, maxSelections: 1, sortOrder: 3,
    modifiers: [
      { name: 'Cup', priceAdjustment: 0, isDefault: true, sortOrder: 1 },
      { name: 'Sugar Cone', priceAdjustment: 0, isDefault: false, sortOrder: 2 },
      { name: 'Waffle Cone', priceAdjustment: 1, isDefault: false, sortOrder: 3 },
    ],
    applyTo: ['Single Scoop', 'Double Scoop'],
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
    modifierGroups: coffeeShopModifiers,
    itemCount: countItems(coffeeShopCategories),
  },
  {
    id: 'tmpl-pizza-restaurant',
    vertical: 'food_and_drink',
    name: 'Pizza Restaurant',
    description: 'Pizzas, sides, and beverages',
    categories: pizzaCategories,
    modifierGroups: pizzaModifiers,
    itemCount: countItems(pizzaCategories),
  },
  {
    id: 'tmpl-bar-and-grill',
    vertical: 'food_and_drink',
    name: 'Bar & Grill',
    description: 'Appetizers, burgers, and drinks',
    categories: barAndGrillCategories,
    modifierGroups: barAndGrillModifiers,
    itemCount: countItems(barAndGrillCategories),
  },
  {
    id: 'tmpl-taco-truck',
    vertical: 'food_and_drink',
    name: 'Taco Truck',
    description: 'Street tacos, burritos, and Mexican beverages',
    categories: tacoTruckCategories,
    modifierGroups: tacoTruckModifiers,
    itemCount: countItems(tacoTruckCategories),
  },
  {
    id: 'tmpl-american-grill',
    vertical: 'food_and_drink',
    name: 'American Grill',
    description: 'Southern-inspired starters, hearty mains, and classic drinks',
    categories: americanGrillCategories,
    modifierGroups: americanGrillModifiers,
    itemCount: countItems(americanGrillCategories),
  },
  {
    id: 'tmpl-bbq',
    vertical: 'food_and_drink',
    name: 'BBQ Restaurant',
    description: 'Smoked meat platters, classic sides, and cold drinks',
    categories: bbqCategories,
    modifierGroups: bbqModifiers,
    itemCount: countItems(bbqCategories),
  },
  {
    id: 'tmpl-asian',
    vertical: 'food_and_drink',
    name: 'Asian Kitchen',
    description: 'Appetizers, pan-Asian entrees, and hot and iced teas',
    categories: asianKitchenCategories,
    modifierGroups: asianKitchenModifiers,
    itemCount: countItems(asianKitchenCategories),
  },
  {
    id: 'tmpl-indian',
    vertical: 'food_and_drink',
    name: 'Indian Restaurant',
    description: 'Tandoori starters, curries, and traditional drinks',
    categories: indianCategories,
    modifierGroups: indianModifiers,
    itemCount: countItems(indianCategories),
  },
  {
    id: 'tmpl-mediterranean',
    vertical: 'food_and_drink',
    name: 'Mediterranean Kitchen',
    description: 'Mezze, grilled mains, and refreshing drinks',
    categories: mediterraneanCategories,
    modifierGroups: mediterraneanModifiers,
    itemCount: countItems(mediterraneanCategories),
  },
  {
    id: 'tmpl-seafood',
    vertical: 'food_and_drink',
    name: 'Seafood Restaurant',
    description: 'Raw bar, fresh seafood entrees, and wine',
    categories: seafoodCategories,
    modifierGroups: seafoodModifiers,
    itemCount: countItems(seafoodCategories),
  },
  {
    id: 'tmpl-ice-cream',
    vertical: 'food_and_drink',
    name: 'Ice Cream Shop',
    description: 'Scoops, sundaes, shakes, and floats',
    categories: iceCreamCategories,
    modifierGroups: iceCreamModifiers,
    itemCount: countItems(iceCreamCategories),
  },
  {
    id: 'tmpl-clothing-boutique',
    vertical: 'retail',
    name: 'Clothing Boutique',
    description: 'Tops, bottoms, and accessories',
    categories: clothingBoutiqueCategories,
    modifierGroups: [],
    itemCount: countItems(clothingBoutiqueCategories),
  },
  {
    id: 'tmpl-hair-salon',
    vertical: 'beauty_wellness',
    name: 'Hair Salon',
    description: 'Cuts, color, and treatments',
    categories: hairSalonCategories,
    modifierGroups: [],
    itemCount: countItems(hairSalonCategories),
  },
  {
    id: 'tmpl-consulting',
    vertical: 'professional_services',
    name: 'Consulting Firm',
    description: 'Consultations and service packages',
    categories: consultingCategories,
    modifierGroups: [],
    itemCount: countItems(consultingCategories),
  },
  {
    id: 'tmpl-fitness-studio',
    vertical: 'sports_fitness',
    name: 'Fitness Studio',
    description: 'Classes, personal training, and memberships',
    categories: fitnessStudioCategories,
    modifierGroups: [],
    itemCount: countItems(fitnessStudioCategories),
  },
];
