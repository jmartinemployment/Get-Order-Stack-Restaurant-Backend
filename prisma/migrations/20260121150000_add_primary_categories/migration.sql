-- CreateTable
CREATE TABLE "primary_categories" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "slug" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "name_en" VARCHAR(100),
    "icon" VARCHAR(50),
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "primary_categories_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Add primary_category_id to menu_categories
ALTER TABLE "menu_categories" ADD COLUMN "primary_category_id" TEXT;

-- CreateIndex: Unique constraint on restaurant_id + slug
CREATE UNIQUE INDEX "primary_categories_restaurant_id_slug_key" ON "primary_categories"("restaurant_id", "slug");

-- CreateIndex: Performance index on restaurant_id
CREATE INDEX "primary_categories_restaurant_id_idx" ON "primary_categories"("restaurant_id");

-- CreateIndex: Performance index on menu_categories.primary_category_id
CREATE INDEX "menu_categories_primary_category_id_idx" ON "menu_categories"("primary_category_id");

-- AddForeignKey: primary_categories -> restaurants
ALTER TABLE "primary_categories" ADD CONSTRAINT "primary_categories_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: menu_categories -> primary_categories
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_primary_category_id_fkey" FOREIGN KEY ("primary_category_id") REFERENCES "primary_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
