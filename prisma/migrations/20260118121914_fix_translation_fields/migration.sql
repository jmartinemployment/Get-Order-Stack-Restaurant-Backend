/*
  Warnings:

  - You are about to drop the column `description_en` on the `restaurants` table. All the data in the column will be lost.
  - You are about to drop the column `name_en` on the `restaurants` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "menu_categories" ADD COLUMN     "description_en" TEXT,
ADD COLUMN     "name_en" TEXT;

-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN     "description_en" TEXT,
ADD COLUMN     "name_en" TEXT;

-- AlterTable
ALTER TABLE "restaurants" DROP COLUMN "description_en",
DROP COLUMN "name_en";
