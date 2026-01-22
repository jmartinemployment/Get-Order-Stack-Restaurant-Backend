-- Add location, latitude, and longitude fields to restaurants table
ALTER TABLE "restaurants" ADD COLUMN "location" TEXT;
ALTER TABLE "restaurants" ADD COLUMN "latitude" DECIMAL(10, 7);
ALTER TABLE "restaurants" ADD COLUMN "longitude" DECIMAL(10, 7);
