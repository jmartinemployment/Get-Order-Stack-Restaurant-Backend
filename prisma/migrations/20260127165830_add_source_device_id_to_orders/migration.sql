-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "source_device_id" TEXT;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
