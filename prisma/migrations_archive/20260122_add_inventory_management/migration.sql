-- Add Inventory Management Tables
-- Note: restaurants.id and menu_items.id are TEXT, not UUID

-- Inventory Items table
CREATE TABLE IF NOT EXISTS inventory_items (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    name_en VARCHAR(255),
    unit VARCHAR(50) NOT NULL DEFAULT 'units',
    current_stock DECIMAL(10,2) NOT NULL DEFAULT 0,
    min_stock DECIMAL(10,2) NOT NULL DEFAULT 0,
    max_stock DECIMAL(10,2) NOT NULL DEFAULT 100,
    cost_per_unit DECIMAL(10,4) NOT NULL DEFAULT 0,
    supplier VARCHAR(255),
    category VARCHAR(100) NOT NULL DEFAULT 'general',
    last_restocked TIMESTAMP,
    last_count_date TIMESTAMP,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Inventory Log table (tracks all stock changes)
CREATE TABLE IF NOT EXISTS inventory_logs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    previous_stock DECIMAL(10,2) NOT NULL,
    new_stock DECIMAL(10,2) NOT NULL,
    change_amount DECIMAL(10,2) NOT NULL,
    reason VARCHAR(255),
    created_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Recipe Ingredients (links menu items to inventory)
CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    menu_item_id TEXT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    quantity DECIMAL(10,4) NOT NULL,
    unit VARCHAR(50) NOT NULL,
    notes VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(menu_item_id, inventory_item_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_inventory_items_restaurant ON inventory_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_category ON inventory_items(restaurant_id, category);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_item ON inventory_logs(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_date ON inventory_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_menu_item ON recipe_ingredients(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_inventory ON recipe_ingredients(inventory_item_id);
