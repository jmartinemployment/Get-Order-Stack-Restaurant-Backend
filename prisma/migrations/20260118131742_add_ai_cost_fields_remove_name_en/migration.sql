/*
  Warnings:

  - You are about to drop the column `name_en` on the `menu_categories` table. All the data in the column will be lost.
  - You are about to drop the column `name_en` on the `menu_items` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "menu_categories" DROP COLUMN "name_en";

-- AlterTable
ALTER TABLE "menu_items" DROP COLUMN "name_en",
ADD COLUMN     "ai_confidence" TEXT,
ADD COLUMN     "ai_estimated_cost" DECIMAL(10,2),
ADD COLUMN     "ai_last_updated" TIMESTAMP(3),
ADD COLUMN     "ai_profit_margin" DECIMAL(5,2),
ADD COLUMN     "ai_suggested_price" DECIMAL(10,2);
