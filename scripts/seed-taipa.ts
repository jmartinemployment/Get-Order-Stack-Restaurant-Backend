/**
 * Seed script for Taipa Peruvian Restaurant
 * Creates both locations (Kendall & Coral Gables) with full menu
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const restaurants = [
  {
    name: 'Taipa',
    slug: 'taipa-kendall',
    description: "Taipa became a local favorite, known for its authentic Peruvian cuisine and generous portions, living up to the meaning of its name: 'Well Served.'",
    phone: '305.480.0808',
    address: '3855 SW 137th Ave',
    city: 'Miami',
    state: 'FL',
    zip: '33175',
    cuisineType: 'Peruvian',
    tier: 2,
    platformsUsed: ['DoorDash', 'Uber Eats', 'GetSauce'],
    posSystem: 'Toast',
  },
  {
    name: 'Taipa',
    slug: 'taipa-coral-gables',
    description: "Taipa became a local favorite, known for its authentic Peruvian cuisine and generous portions, living up to the meaning of its name: 'Well Served.'",
    phone: '305.661.1462',
    address: '5751 Bird Rd',
    city: 'Miami',
    state: 'FL',
    zip: '33155',
    cuisineType: 'Peruvian',
    tier: 2,
    platformsUsed: ['DoorDash', 'Uber Eats', 'GetSauce'],
    posSystem: 'Toast',
  },
];

const categories = [
  { name: 'Para Empezar a Enamorarte', description: 'Appetizers', displayOrder: 1 },
  { name: 'Del Mar Su Encanto', description: 'Seafood Entrees', displayOrder: 2 },
  { name: 'In Ceviche We Trust', description: 'Ceviches', displayOrder: 3 },
  { name: 'Las Sopas', description: 'Soups', displayOrder: 4 },
  { name: 'Grill Me Up', description: 'Grilled dishes', displayOrder: 5 },
  { name: 'Wok Me Up', description: 'Stir-fry dishes', displayOrder: 6 },
  { name: 'Saving The Tradition', description: 'Traditional Peruvian', displayOrder: 7 },
  { name: 'Veggie Lovers', description: 'Vegetarian options', displayOrder: 8 },
  { name: 'Sides', description: 'Side dishes', displayOrder: 9 },
  { name: 'Desserts', description: 'Postres', displayOrder: 10 },
  { name: 'Beverages', description: 'Drinks', displayOrder: 11 },
  { name: 'Coffee & Tea', description: 'Hot drinks', displayOrder: 12 },
  { name: 'Beer', description: 'Beer selection', displayOrder: 13 },
  { name: 'Wine', description: 'Wine selection', displayOrder: 14 },
  { name: 'Cocktails', description: 'Mixed drinks', displayOrder: 15 },
];

interface MenuItem {
  name: string;
  description: string;
  price: number;
  category: string;
  dietary?: string[];
}

const menuItems: MenuItem[] = [
  // APPETIZERS
  { name: 'Causa de Pulpo Anticuchero', description: 'Three mini causas topped with octopus marinated in panca spices and chalaca sauce.', price: 17, category: 'Para Empezar a Enamorarte' },
  { name: 'Causa - Chicken', description: 'Whipped potatoes blended with yellow peppers, salt and lime, filled with chicken.', price: 11, category: 'Para Empezar a Enamorarte' },
  { name: 'Causa - Tuna', description: 'Whipped potatoes blended with yellow peppers, salt and lime, filled with tuna.', price: 12, category: 'Para Empezar a Enamorarte' },
  { name: 'Causa - Lomo Saltado', description: 'Whipped potatoes blended with yellow peppers, salt and lime, filled with lomo saltado.', price: 14, category: 'Para Empezar a Enamorarte' },
  { name: 'Causa Carretillera', description: 'Two layers of causa filled with leche tigre. Topped with fried calamari.', price: 15, category: 'Para Empezar a Enamorarte' },
  { name: 'Papa a la Huancaina', description: 'Boiled potatoes topped with a creamy yellow pepper sauce made with white cheese and milk.', price: 11, category: 'Para Empezar a Enamorarte', dietary: ['vegetarian'] },
  { name: 'Yuca a la Huancaina', description: 'Fried yuca served with huancaina sauce.', price: 10, category: 'Para Empezar a Enamorarte', dietary: ['vegetarian'] },
  { name: 'Leche de Tigre', description: 'Chopped fish, onions and cilantro in ceviche juice.', price: 12, category: 'Para Empezar a Enamorarte' },
  { name: 'Vuelve a la Vida', description: 'Chopped seafood, onions and cilantro in ceviche juice.', price: 13, category: 'Para Empezar a Enamorarte' },
  { name: 'Choritos a la Chalaca', description: 'Steamed mussels topped with corn, onions, tomatoes and cilantro in lime juice.', price: 14, category: 'Para Empezar a Enamorarte' },
  { name: 'Tigre Bravo - Fish', description: 'Chopped fish marinated in our three ceviche flavors topped with fried calamari.', price: 18, category: 'Para Empezar a Enamorarte' },
  { name: 'Tigre Bravo - Seafood', description: 'Chopped seafood marinated in our three ceviche flavors topped with fried calamari.', price: 20, category: 'Para Empezar a Enamorarte' },
  { name: 'Conchitas a la Parmesana', description: 'Baked scallops seasoned with lime juice, butter, and grated parmesan cheese.', price: 18, category: 'Para Empezar a Enamorarte' },
  
  // SEAFOOD ENTREES
  { name: 'Jalea Mixta', description: 'Crispy fried fish and mixed seafood with fried yuca, tartar sauce and criolla onions.', price: 22, category: 'Del Mar Su Encanto' },
  { name: 'Pescado a lo Macho - Fish', description: 'Fried fish fillet topped with seafood in our secret sauce. With rice and fried yuca.', price: 23, category: 'Del Mar Su Encanto' },
  { name: 'Pescado a lo Macho - Corvina', description: 'Fried corvina fillet topped with seafood in our secret sauce. With rice and fried yuca.', price: 26, category: 'Del Mar Su Encanto' },
  { name: 'Pescado a la Chorrillana - Fish', description: 'Fried fish fillet with sautéed onions and tomatoes. With rice and fried yuca.', price: 23, category: 'Del Mar Su Encanto' },
  { name: 'Pescado a la Chorrillana - Corvina', description: 'Fried corvina fillet with sautéed onions and tomatoes. With rice and fried yuca.', price: 26, category: 'Del Mar Su Encanto' },
  { name: 'Pescado Frito - Fish', description: 'Fried fish fillet with rice, french fries and criolla onions.', price: 18, category: 'Del Mar Su Encanto' },
  { name: 'Pescado Frito - Corvina', description: 'Fried corvina fillet with rice, french fries and criolla onions.', price: 21, category: 'Del Mar Su Encanto' },
  { name: 'Arroz con Mariscos', description: 'Rice and vegetables cooked with seafood in peruvian spices.', price: 21, category: 'Del Mar Su Encanto' },
  { name: 'Arroz con Mariscos al Cilantro', description: 'Green rice and vegetables cooked with seafood in cilantro and peruvian spices.', price: 23, category: 'Del Mar Su Encanto' },
  { name: 'Sudado de Pescado - Fish', description: 'Boiled fish with onions and tomatoes in peruvian spices. With rice and fried yuca.', price: 18, category: 'Del Mar Su Encanto' },
  { name: 'Sudado de Pescado - Corvina', description: 'Boiled corvina with onions and tomatoes in peruvian spices. With rice and fried yuca.', price: 21, category: 'Del Mar Su Encanto' },
  { name: 'Chicharron de Pescado', description: 'Fried pieces of fish with fried yuca, criolla onions and tartar sauce.', price: 15, category: 'Del Mar Su Encanto' },
  { name: 'Chicharron de Calamari', description: 'Fried pieces of calamari with fried yuca, criolla onions and tartar sauce.', price: 16, category: 'Del Mar Su Encanto' },
  { name: 'Pasta a lo Macho', description: 'Creamy linguine noodles topped with seafood mix in our secret sauce.', price: 23, category: 'Del Mar Su Encanto' },

  // CEVICHES
  { name: 'Ceviche Clásico - Fish', description: 'Fish chunks, onions, and cilantro marinated in fresh lime juice.', price: 15, category: 'In Ceviche We Trust' },
  { name: 'Ceviche Clásico - Seafood', description: 'Seafood, onions, and cilantro marinated in fresh lime juice.', price: 17, category: 'In Ceviche We Trust' },
  { name: 'Ceviche Clásico - Shrimp', description: 'Shrimp, onions, and cilantro marinated in fresh lime juice.', price: 17, category: 'In Ceviche We Trust' },
  { name: 'Ceviche Clásico - Corvina', description: 'Corvina, onions, and cilantro marinated in fresh lime juice.', price: 18, category: 'In Ceviche We Trust' },
  { name: 'Ceviche Aji Amarillo - Fish', description: 'Fish in creamy yellow pepper and fresh lime juice.', price: 17, category: 'In Ceviche We Trust' },
  { name: 'Ceviche Aji Amarillo - Seafood', description: 'Seafood in creamy yellow pepper and fresh lime juice.', price: 18, category: 'In Ceviche We Trust' },
  { name: 'Ceviche Aji Amarillo - Shrimp', description: 'Shrimp in creamy yellow pepper and fresh lime juice.', price: 19, category: 'In Ceviche We Trust' },
  { name: 'Ceviche Aji Amarillo - Corvina', description: 'Corvina in creamy yellow pepper and fresh lime juice.', price: 20, category: 'In Ceviche We Trust' },
  { name: 'Ceviche Rocoto - Fish', description: 'Fish in creamy red pepper and fresh lime juice.', price: 17, category: 'In Ceviche We Trust' },
  { name: 'Ceviche Rocoto - Seafood', description: 'Seafood in creamy red pepper and fresh lime juice.', price: 18, category: 'In Ceviche We Trust' },
  { name: 'Ceviche Rocoto - Shrimp', description: 'Shrimp in creamy red pepper and fresh lime juice.', price: 19, category: 'In Ceviche We Trust' },
  { name: 'Ceviche Rocoto - Corvina', description: 'Corvina in creamy red pepper and fresh lime juice.', price: 20, category: 'In Ceviche We Trust' },
  { name: 'Ceviche Maracuya - Fish', description: 'Fish in passion fruit and fresh lime juice.', price: 17, category: 'In Ceviche We Trust' },
  { name: 'Ceviche Maracuya - Seafood', description: 'Seafood in passion fruit and fresh lime juice.', price: 18, category: 'In Ceviche We Trust' },
  { name: 'Ceviche Maracuya - Shrimp', description: 'Shrimp in passion fruit and fresh lime juice.', price: 19, category: 'In Ceviche We Trust' },
  { name: 'Ceviche Maracuya - Corvina', description: 'Corvina in passion fruit and fresh lime juice.', price: 20, category: 'In Ceviche We Trust' },
  { name: 'Ceviche Trio - Fish', description: 'Clásico, aji amarillo and rocoto ceviche in one dish with fish.', price: 26, category: 'In Ceviche We Trust' },
  { name: 'Ceviche Trio - Seafood', description: 'Clásico, aji amarillo and rocoto ceviche in one dish with seafood.', price: 28, category: 'In Ceviche We Trust' },
  { name: 'Ceviche Trio - Corvina', description: 'Clásico, aji amarillo and rocoto ceviche in one dish with corvina.', price: 29, category: 'In Ceviche We Trust' },
  { name: 'Ceviche Carretillero - Fish', description: 'Ceviche clásico topped with fried calamari.', price: 22, category: 'In Ceviche We Trust' },
  { name: 'Ceviche Carretillero - Seafood', description: 'Seafood ceviche clásico topped with fried calamari.', price: 25, category: 'In Ceviche We Trust' },
  { name: 'Ceviche Carretillero - Corvina', description: 'Corvina ceviche clásico topped with fried calamari.', price: 24, category: 'In Ceviche We Trust' },
  { name: 'Ceviche Bravo - Fish', description: 'Fish marinated in a mix of our three ceviche flavors.', price: 17, category: 'In Ceviche We Trust' },
  { name: 'Ceviche Bravo - Seafood', description: 'Seafood marinated in a mix of our three ceviche flavors.', price: 19, category: 'In Ceviche We Trust' },
  { name: 'Ceviche Bravo - Corvina', description: 'Corvina marinated in a mix of our three ceviche flavors.', price: 21, category: 'In Ceviche We Trust' },

  // SOUPS
  { name: 'Chupe de Camarones', description: 'Shrimp chowder with vegetables, poached eggs, white cheese, rice, potatoes and shrimp tails.', price: 19, category: 'Las Sopas' },
  { name: 'Aguadito de Pollo', description: 'Chicken breast in cilantro broth with peas, carrots, red peppers, rice and peruvian corn.', price: 17, category: 'Las Sopas' },
  { name: 'Chilcano de Pescado', description: 'Fish broth with green onions, cilantro and lime.', price: 14, category: 'Las Sopas' },
  { name: 'Chilcano Achorado', description: 'Fish and green mussel broth with green onions, cilantro and lime.', price: 16, category: 'Las Sopas' },
  { name: 'Parihuela', description: 'Rich seafood soup with mixed seafood in a flavorful broth.', price: 19, category: 'Las Sopas' },

  // GRILL
  { name: 'Pulpo a la Parrilla', description: 'Grilled Spanish octopus marinated in panca with Peruvian corn and fried potatoes.', price: 18, category: 'Grill Me Up' },
  { name: 'Churrasco a lo Pobre', description: 'With rice, french fries and sweet plantains topped with a fried egg.', price: 22, category: 'Grill Me Up' },
  { name: 'Anticucho', description: 'Grilled beef heart marinated in panca spice with fried potato and peruvian corn.', price: 15, category: 'Grill Me Up' },
  { name: 'Pollo a lo Pobre', description: 'With rice, french fries and sweet plantains topped with a fried egg.', price: 19, category: 'Grill Me Up' },
  { name: 'Rachi', description: 'Grilled tripe marinated in panca spice with fried potato and peruvian corn.', price: 15, category: 'Grill Me Up' },
  { name: 'Mixto (Anticucho + Rachi)', description: 'Grilled beef heart and tripe marinated in panca with fried potato and peruvian corn.', price: 18, category: 'Grill Me Up' },
  { name: 'Parrillada de Mariscos', description: 'Grilled seafood mix with peppers and potatoes in anticuchera sauce. With rice.', price: 25, category: 'Grill Me Up' },

  // WOK
  { name: 'Lomo Saltado', description: 'Beef, onions, tomatoes sauteed in soy sauce. With rice and french fries.', price: 22, category: 'Wok Me Up' },
  { name: 'Pollo Saltado', description: 'Chicken, onions, tomatoes, snow peas sautéed in soy sauce. With rice and french fries.', price: 18, category: 'Wok Me Up' },
  { name: 'Saltado Mixto', description: 'Beef and chicken sauteed in soy sauce. With rice and french fries.', price: 23, category: 'Wok Me Up' },
  { name: 'Pescado Saltado - Fish', description: 'Fried fish with vegetables sautéed in soy sauce. With rice and french fries.', price: 18, category: 'Wok Me Up' },
  { name: 'Pescado Saltado - Corvina', description: 'Fried corvina with vegetables sautéed in soy sauce. With rice and french fries.', price: 21, category: 'Wok Me Up' },
  { name: 'Saltado de Mariscos', description: 'Seafood with vegetables sautéed in soy sauce. With rice and french fries.', price: 21, category: 'Wok Me Up' },
  { name: 'Chaufa de Pollo', description: 'Fried rice with vegetables and scrambled eggs with chicken.', price: 18, category: 'Wok Me Up' },
  { name: 'Chaufa de Carne', description: 'Fried rice with vegetables and scrambled eggs with beef.', price: 21, category: 'Wok Me Up' },
  { name: 'Chaufa Mixto', description: 'Fried rice with vegetables and scrambled eggs with chicken and beef.', price: 22, category: 'Wok Me Up' },
  { name: 'Chaufa de Mariscos', description: 'Fried rice with vegetables and scrambled eggs with seafood.', price: 21, category: 'Wok Me Up' },
  { name: 'Tallarin Saltado de Pollo', description: 'Linguine noodles with vegetables sautéed in soy sauce with chicken.', price: 19, category: 'Wok Me Up' },
  { name: 'Tallarin Saltado de Carne', description: 'Linguine noodles with vegetables sautéed in soy sauce with beef.', price: 21, category: 'Wok Me Up' },
  { name: 'Tallarin Saltado Mixto', description: 'Linguine noodles with vegetables sautéed in soy sauce with chicken and beef.', price: 22, category: 'Wok Me Up' },
  { name: 'Tallarin Saltado de Mariscos', description: 'Linguine noodles with vegetables sautéed in soy sauce with seafood.', price: 21, category: 'Wok Me Up' },

  // TRADITIONAL
  { name: 'Tallarines Verdes con Pollo', description: 'Linguine in creamy pesto sauce with potatoes and grilled chicken.', price: 20, category: 'Saving The Tradition' },
  { name: 'Tallarines Verdes con Lomo Saltado', description: 'Linguine in creamy pesto sauce with potatoes and lomo saltado.', price: 22, category: 'Saving The Tradition' },
  { name: 'Tallarines Verdes con Churrasco', description: 'Linguine in creamy pesto sauce with potatoes and churrasco.', price: 23, category: 'Saving The Tradition' },
  { name: 'Tallarines a la Huancaina con Pollo', description: 'Linguine in huancaina sauce with potatoes and grilled chicken.', price: 20, category: 'Saving The Tradition' },
  { name: 'Tallarines a la Huancaina con Lomo', description: 'Linguine in huancaina sauce with potatoes and lomo saltado.', price: 22, category: 'Saving The Tradition' },
  { name: 'Tallarines a la Huancaina con Churrasco', description: 'Linguine in huancaina sauce with potatoes and churrasco.', price: 23, category: 'Saving The Tradition' },
  { name: 'Aji de Gallina', description: 'Shredded chicken in creamy aji amarillo sauce with egg and olive. With rice and potatoes.', price: 16, category: 'Saving The Tradition' },
  { name: 'Seco de Res', description: 'Beef stew with vegetables, beer and cilantro. With rice, beans and criolla sauce.', price: 20, category: 'Saving The Tradition' },
  { name: 'Tacu Tacu con Pollo Saltado', description: 'Rice and beans patty with pollo saltado.', price: 20, category: 'Saving The Tradition' },
  { name: 'Tacu Tacu con Lomo Saltado', description: 'Rice and beans patty with lomo saltado.', price: 22, category: 'Saving The Tradition' },
  { name: 'Tacu Tacu con Churrasco', description: 'Rice and beans patty with churrasco.', price: 23, category: 'Saving The Tradition' },
  { name: 'Tacu Tacu con Seco', description: 'Rice and beans patty with seco de res.', price: 24, category: 'Saving The Tradition' },
  { name: 'Duo Marino', description: 'Clásico fish ceviche and jalea mixta in one dish.', price: 27, category: 'Saving The Tradition' },
  { name: 'Trio Marino', description: 'Fish Ceviche, Jalea Mixta and Arroz con Mariscos in one dish.', price: 38, category: 'Saving The Tradition' },
  { name: 'La Combi con Churrasco', description: 'Pesto noodles with churrasco and papa a la huancaina.', price: 24, category: 'Saving The Tradition' },
  { name: 'La Combi con Anticuchos', description: 'Pesto noodles with anticuchos and papa a la huancaina.', price: 22, category: 'Saving The Tradition' },
  { name: 'Salchipapa', description: 'Beef hot dogs on french fries with dipping sauces.', price: 11, category: 'Saving The Tradition' },
  { name: 'Salchipollo', description: 'Beef hot dogs and chicken on french fries with dipping sauces.', price: 12, category: 'Saving The Tradition' },

  // VEGGIE
  { name: 'Veggie Saltado', description: 'Vegetables sautéed in soy sauce. With rice and french fries.', price: 17, category: 'Veggie Lovers', dietary: ['vegetarian'] },
  { name: 'Veggie Chaufa', description: 'Fried rice with vegetables and scrambled eggs.', price: 16, category: 'Veggie Lovers', dietary: ['vegetarian'] },
  { name: 'Veggie Tallarin Saltado', description: 'Linguine noodles with vegetables sautéed in soy sauce.', price: 17, category: 'Veggie Lovers', dietary: ['vegetarian'] },

  // SIDES
  { name: 'White Rice', description: 'Side of white rice.', price: 3, category: 'Sides', dietary: ['vegetarian', 'vegan', 'gluten-free'] },
  { name: 'French Fries', description: 'Side of french fries.', price: 7, category: 'Sides', dietary: ['vegetarian', 'vegan', 'gluten-free'] },
  { name: 'Tostones', description: 'Fried green plantains.', price: 6, category: 'Sides', dietary: ['vegetarian', 'vegan', 'gluten-free'] },
  { name: 'Sweet Plantains', description: 'Sweet plantains.', price: 6, category: 'Sides', dietary: ['vegetarian', 'vegan', 'gluten-free'] },
  { name: 'Salad', description: 'Side salad.', price: 6, category: 'Sides', dietary: ['vegetarian', 'vegan', 'gluten-free'] },
  { name: 'Fried Yuca', description: 'Fried yuca.', price: 6, category: 'Sides', dietary: ['vegetarian', 'vegan', 'gluten-free'] },

  // DESSERTS
  { name: 'Chocolate Cake', description: '3 layers of chocolate cake with dulce de leche and fudge.', price: 6, category: 'Desserts' },
  { name: 'La Prima', description: 'Chocolate cake, vanilla ice cream, fudge, whipped cream and Doña Pepa cookies.', price: 14, category: 'Desserts' },
  { name: 'Alfajor', description: '4 layers of crumbly cookies with dulce de leche.', price: 6, category: 'Desserts' },
  { name: 'Lucuma Mousse', description: 'Sweet lucuma fruit mousse with chocolate crisps.', price: 6, category: 'Desserts' },
  { name: 'Suspiro Limeño', description: 'Creamy dulce de leche pudding topped with meringue.', price: 6, category: 'Desserts' },
  { name: 'Maracuya Cake', description: 'Passion fruit mousse on sponge cake.', price: 8, category: 'Desserts' },
  { name: '4 Leches Lucuma', description: 'Sponge cake soaked in dulce de leche, lucuma, evaporated and condensed milk.', price: 7, category: 'Desserts' },
  { name: 'Picarones', description: 'Crispy doughnuts topped with homemade syrup.', price: 8, category: 'Desserts' },
  { name: 'La Picarona', description: 'Picarones, vanilla ice cream, fudge, whipped cream and Doña Pepa cookies.', price: 13, category: 'Desserts' },

  // BEVERAGES
  { name: 'Inca Kola', description: 'Classic Peruvian soda.', price: 3.50, category: 'Beverages' },
  { name: 'Inca Diet', description: 'Diet Inca Kola.', price: 3.50, category: 'Beverages' },
  { name: 'Kola Inglesa', description: 'Peruvian red soda.', price: 4, category: 'Beverages' },
  { name: 'Fiji Water', description: 'Premium bottled water.', price: 3.75, category: 'Beverages' },
  { name: 'Pellegrino', description: 'Sparkling water.', price: 4, category: 'Beverages' },
  { name: 'Coca Cola', description: 'Classic Coca Cola.', price: 3, category: 'Beverages' },
  { name: 'Coke Zero', description: 'Zero sugar Coca Cola.', price: 3, category: 'Beverages' },
  { name: 'Sprite', description: 'Lemon-lime soda.', price: 3, category: 'Beverages' },
  { name: 'Chicha Morada - Glass', description: 'Traditional purple corn drink.', price: 6, category: 'Beverages' },
  { name: 'Chicha Morada - Pitcher', description: 'Traditional purple corn drink. Pitcher.', price: 13, category: 'Beverages' },
  { name: 'Lemonade', description: 'Fresh lemonade.', price: 5, category: 'Beverages' },
  { name: 'Hierbabuena Lemonade', description: 'Lemonade with mint.', price: 6, category: 'Beverages' },
  { name: 'Passion Fruit Juice', description: 'Fresh passion fruit juice.', price: 6, category: 'Beverages' },

  // COFFEE & TEA
  { name: 'Espresso', description: 'Single shot espresso.', price: 3, category: 'Coffee & Tea' },
  { name: 'Cortadito', description: 'Espresso with a splash of milk.', price: 3, category: 'Coffee & Tea' },
  { name: 'Cafe con Leche', description: 'Coffee with milk.', price: 4, category: 'Coffee & Tea' },
  { name: 'Manzanilla', description: 'Chamomile tea.', price: 3, category: 'Coffee & Tea' },
  { name: 'Anis', description: 'Anise tea.', price: 3, category: 'Coffee & Tea' },
  { name: 'Green Tea', description: 'Green tea.', price: 3, category: 'Coffee & Tea' },

  // BEER
  { name: 'Cusqueña', description: 'Peruvian lager. Bottled.', price: 7, category: 'Beer' },
  { name: 'Cristal', description: 'Peruvian lager. Bottled.', price: 6, category: 'Beer' },
  { name: 'Pilsen', description: 'Peruvian pilsner. Bottled.', price: 7, category: 'Beer' },
  { name: 'Stella Artois', description: 'Belgium light lager 5%. Draft.', price: 6, category: 'Beer' },
  { name: 'Michelob Ultra', description: 'Light Lager 4.5%. Draft.', price: 5, category: 'Beer' },
  { name: 'Estrella', description: 'Spain Euro Pale Lager 4.6%. Draft.', price: 5, category: 'Beer' },
  { name: 'IPA', description: 'Rotating draft. Ask Server.', price: 7, category: 'Beer' },

  // WINE
  { name: 'Cabernet Sauvignon - Glass', description: 'Red wine. Glass.', price: 7, category: 'Wine' },
  { name: 'Cabernet Sauvignon - Bottle', description: 'Red wine. Bottle.', price: 23, category: 'Wine' },
  { name: 'Malbec - Glass', description: 'Red wine. Glass.', price: 7, category: 'Wine' },
  { name: 'Malbec - Bottle', description: 'Red wine. Bottle.', price: 23, category: 'Wine' },
  { name: 'Pinot Grigio - Glass', description: 'White wine. Glass.', price: 8, category: 'Wine' },
  { name: 'Pinot Grigio - Bottle', description: 'White wine. Bottle.', price: 23, category: 'Wine' },
  { name: 'Sauvignon Blanc - Glass', description: 'White wine. Glass.', price: 8, category: 'Wine' },
  { name: 'Sauvignon Blanc - Bottle', description: 'White wine. Bottle.', price: 26, category: 'Wine' },

  // COCKTAILS
  { name: 'Mojito', description: 'Classic mojito.', price: 11, category: 'Cocktails' },
  { name: 'Chicha Sour', description: 'Pisco sour with chicha morada.', price: 13, category: 'Cocktails' },
  { name: 'Peru Sour', description: 'Classic Peruvian pisco sour.', price: 12, category: 'Cocktails' },
  { name: 'Maracuya Sour', description: 'Passion fruit pisco sour.', price: 13, category: 'Cocktails' },
  { name: 'Red Sangria - Glass', description: 'Red sangria. Glass.', price: 8, category: 'Cocktails' },
  { name: 'Red Sangria - Pitcher', description: 'Red sangria. Pitcher.', price: 21, category: 'Cocktails' },
];

async function seed() {
  console.log('🌱 Starting Taipa seed...\n');

  try {
    for (const restaurantData of restaurants) {
      console.log(`\n📍 Creating restaurant: ${restaurantData.name} (${restaurantData.slug})`);
      
      const existing = await prisma.restaurant.findUnique({
        where: { slug: restaurantData.slug }
      });

      if (existing) {
        console.log(`   ⚠️  Restaurant ${restaurantData.slug} already exists, skipping...`);
        continue;
      }

      const restaurant = await prisma.restaurant.create({
        data: restaurantData,
      });
      console.log(`   ✅ Created restaurant: ${restaurant.id}`);

      const categoryMap = new Map<string, string>();
      
      for (const categoryData of categories) {
        const category = await prisma.menuCategory.create({
          data: {
            restaurantId: restaurant.id,
            ...categoryData,
          },
        });
        categoryMap.set(categoryData.name, category.id);
        console.log(`   📂 Created category: ${category.name}`);
      }

      let itemCount = 0;
      for (const itemData of menuItems) {
        const categoryId = categoryMap.get(itemData.category);
        if (!categoryId) {
          console.warn(`   ⚠️  Category not found: ${itemData.category}`);
          continue;
        }

        await prisma.menuItem.create({
          data: {
            restaurantId: restaurant.id,
            categoryId: categoryId,
            name: itemData.name,
            description: itemData.description,
            price: itemData.price,
            dietary: itemData.dietary || [],
            available: true,
            eightySixed: false,
            displayOrder: itemCount,
          },
        });
        itemCount++;
      }
      console.log(`   🍽️  Created ${itemCount} menu items`);
    }

    console.log('\n✅ Taipa seed completed!\n');

    const restaurantCount = await prisma.restaurant.count();
    const categoryCount = await prisma.menuCategory.count();
    const itemCount = await prisma.menuItem.count();

    console.log('�� Database Summary:');
    console.log(`   Restaurants: ${restaurantCount}`);
    console.log(`   Categories: ${categoryCount}`);
    console.log(`   Menu Items: ${itemCount}`);

  } catch (error) {
    console.error('❌ Seed failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seed();
