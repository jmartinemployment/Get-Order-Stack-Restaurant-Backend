-- Manual migration: Add Printer and PrintJob tables
-- Generated: 2026-02-12

-- Create printers table
CREATE TABLE IF NOT EXISTS "printers" (
  "id" TEXT PRIMARY KEY,
  "restaurant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "mac_address" TEXT NOT NULL UNIQUE,
  "ip_address" TEXT,
  "cloudprnt_id" TEXT,
  "registration_token" TEXT NOT NULL UNIQUE,
  "print_width" INTEGER NOT NULL DEFAULT 48,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "last_poll_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "printers_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "printers_restaurant_id_idx" ON "printers"("restaurant_id");

-- Create print_jobs table
CREATE TABLE IF NOT EXISTS "print_jobs" (
  "id" TEXT PRIMARY KEY,
  "order_id" TEXT NOT NULL,
  "printer_id" TEXT,
  "job_type" TEXT NOT NULL DEFAULT 'receipt',
  "status" TEXT NOT NULL DEFAULT 'queued',
  "text_data" TEXT NOT NULL,
  "markup_data" TEXT,
  "retries" INTEGER NOT NULL DEFAULT 0,
  "error_msg" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sent_at" TIMESTAMP(3),
  "printed_at" TIMESTAMP(3),
  CONSTRAINT "print_jobs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "print_jobs_printer_id_fkey" FOREIGN KEY ("printer_id") REFERENCES "printers"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "print_jobs_order_id_idx" ON "print_jobs"("order_id");
CREATE INDEX "print_jobs_printer_id_idx" ON "print_jobs"("printer_id");
CREATE INDEX "print_jobs_status_idx" ON "print_jobs"("status");
