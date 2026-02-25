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
    id: 'tmpl-american-grill',
    vertical: 'food_and_drink',
    name: 'American Grill',
    description: 'Southern-inspired starters, hearty mains, and classic drinks',
    categories: americanGrillCategories,
    itemCount: countItems(americanGrillCategories),
  },
  {
    id: 'tmpl-bbq',
    vertical: 'food_and_drink',
    name: 'BBQ Restaurant',
    description: 'Smoked meat platters, classic sides, and cold drinks',
    categories: bbqCategories,
    itemCount: countItems(bbqCategories),
  },
  {
    id: 'tmpl-asian',
    vertical: 'food_and_drink',
    name: 'Asian Kitchen',
    description: 'Appetizers, pan-Asian entrees, and hot and iced teas',
    categories: asianKitchenCategories,
    itemCount: countItems(asianKitchenCategories),
  },
  {
    id: 'tmpl-indian',
    vertical: 'food_and_drink',
    name: 'Indian Restaurant',
    description: 'Tandoori starters, curries, and traditional drinks',
    categories: indianCategories,
    itemCount: countItems(indianCategories),
  },
  {
    id: 'tmpl-mediterranean',
    vertical: 'food_and_drink',
    name: 'Mediterranean Kitchen',
    description: 'Mezze, grilled mains, and refreshing drinks',
    categories: mediterraneanCategories,
    itemCount: countItems(mediterraneanCategories),
  },
  {
    id: 'tmpl-seafood',
    vertical: 'food_and_drink',
    name: 'Seafood Restaurant',
    description: 'Raw bar, fresh seafood entrees, and wine',
    categories: seafoodCategories,
    itemCount: countItems(seafoodCategories),
  },
  {
    id: 'tmpl-ice-cream',
    vertical: 'food_and_drink',
    name: 'Ice Cream Shop',
    description: 'Scoops, sundaes, shakes, and floats',
    categories: iceCreamCategories,
    itemCount: countItems(iceCreamCategories),
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
