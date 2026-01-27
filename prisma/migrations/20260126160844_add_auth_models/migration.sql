-- DropForeignKey
ALTER TABLE "inventory_items" DROP CONSTRAINT "inventory_items_restaurant_id_fkey";

-- DropForeignKey
ALTER TABLE "inventory_logs" DROP CONSTRAINT "inventory_logs_inventory_item_id_fkey";

-- DropForeignKey
ALTER TABLE "recipe_ingredients" DROP CONSTRAINT "recipe_ingredients_inventory_item_id_fkey";

-- DropForeignKey
ALTER TABLE "recipe_ingredients" DROP CONSTRAINT "recipe_ingredients_menu_item_id_fkey";

-- AlterTable
ALTER TABLE "inventory_items" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "last_restocked" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "last_count_date" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "inventory_logs" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "recipe_ingredients" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_logs" ADD CONSTRAINT "inventory_logs_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "idx_inventory_items_category" RENAME TO "inventory_items_restaurant_id_category_idx";

-- RenameIndex
ALTER INDEX "idx_inventory_items_restaurant" RENAME TO "inventory_items_restaurant_id_idx";

-- RenameIndex
ALTER INDEX "idx_inventory_logs_date" RENAME TO "inventory_logs_created_at_idx";

-- RenameIndex
ALTER INDEX "idx_inventory_logs_item" RENAME TO "inventory_logs_inventory_item_id_idx";

-- RenameIndex
ALTER INDEX "idx_recipe_ingredients_inventory" RENAME TO "recipe_ingredients_inventory_item_id_idx";

-- RenameIndex
ALTER INDEX "idx_recipe_ingredients_menu_item" RENAME TO "recipe_ingredients_menu_item_id_idx";
