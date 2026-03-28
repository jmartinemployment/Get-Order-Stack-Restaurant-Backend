-- Add onboarding fields to team_members
ALTER TABLE "team_members" ADD COLUMN IF NOT EXISTS "onboarding_status" TEXT NOT NULL DEFAULT 'not_started';
ALTER TABLE "team_members" ADD COLUMN IF NOT EXISTS "temp_password_expires_at" TIMESTAMPTZ;
ALTER TABLE "team_members" ADD COLUMN IF NOT EXISTS "temp_password_set_by" TEXT;

-- Create onboarding_checklists table
CREATE TABLE IF NOT EXISTS "onboarding_checklists" (
  "id" TEXT NOT NULL,
  "team_member_id" TEXT NOT NULL,
  "step" TEXT NOT NULL,
  "is_complete" BOOLEAN NOT NULL DEFAULT false,
  "completed_at" TIMESTAMPTZ,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,

  CONSTRAINT "onboarding_checklists_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one row per team member per step
CREATE UNIQUE INDEX IF NOT EXISTS "onboarding_checklists_team_member_id_step_key"
  ON "onboarding_checklists"("team_member_id", "step");

-- Performance index
CREATE INDEX IF NOT EXISTS "onboarding_checklists_team_member_id_idx"
  ON "onboarding_checklists"("team_member_id");

-- Foreign key
ALTER TABLE "onboarding_checklists"
  ADD CONSTRAINT "onboarding_checklists_team_member_id_fkey"
  FOREIGN KEY ("team_member_id") REFERENCES "team_members"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
