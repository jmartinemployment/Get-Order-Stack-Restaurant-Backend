-- CreateTable
CREATE TABLE "tax_jurisdictions" (
    "id" TEXT NOT NULL,
    "zip_code" TEXT NOT NULL,
    "city" TEXT,
    "county" TEXT,
    "state" TEXT NOT NULL DEFAULT 'FL',
    "tax_rate" DECIMAL(5,4) NOT NULL,
    "breakdown" JSONB,
    "source" TEXT NOT NULL DEFAULT 'ai',
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_jurisdictions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tax_jurisdictions_zip_code_state_key" ON "tax_jurisdictions"("zip_code", "state");
