-- Migration: Merge User into TeamMember (Square model)
-- Every person is a TeamMember. Dashboard login (email/password) and POS login (passcode)
-- are both fields on TeamMember. The separate "users" table is removed.

-- Step 1: Add new columns to team_members
ALTER TABLE "team_members" ADD COLUMN IF NOT EXISTS "password_hash" TEXT;
ALTER TABLE "team_members" ADD COLUMN IF NOT EXISTS "first_name" TEXT;
ALTER TABLE "team_members" ADD COLUMN IF NOT EXISTS "last_name" TEXT;
ALTER TABLE "team_members" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "team_members" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'staff';
ALTER TABLE "team_members" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "team_members" ADD COLUMN IF NOT EXISTS "last_login_at" TIMESTAMPTZ;
ALTER TABLE "team_members" ADD COLUMN IF NOT EXISTS "restaurant_group_id" TEXT;

-- Step 2: Make restaurant_id nullable (signup creates TeamMember before restaurant exists)
ALTER TABLE "team_members" ALTER COLUMN "restaurant_id" DROP NOT NULL;

-- Step 3: Add unique constraint on email
CREATE UNIQUE INDEX IF NOT EXISTS "team_members_email_key" ON "team_members" ("email");

-- Step 4: Add FK for restaurant_group_id
ALTER TABLE "team_members"
  ADD CONSTRAINT "team_members_restaurant_group_id_fkey"
  FOREIGN KEY ("restaurant_group_id") REFERENCES "restaurant_groups"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 5: Create index on restaurant_group_id
CREATE INDEX IF NOT EXISTS "team_members_restaurant_group_id_idx" ON "team_members" ("restaurant_group_id");

-- Step 6: Migrate User data into TeamMember
-- For each User, insert a TeamMember if no TeamMember with that email exists
INSERT INTO "team_members" (
  "id",
  "restaurant_id",
  "display_name",
  "email",
  "password_hash",
  "first_name",
  "last_name",
  "role",
  "is_active",
  "last_login_at",
  "restaurant_group_id",
  "created_at",
  "updated_at"
)
SELECT
  u."id",
  (SELECT ura."restaurant_id" FROM "user_restaurant_access" ura WHERE ura."user_id" = u."id" LIMIT 1),
  COALESCE(u."first_name", '') || ' ' || COALESCE(u."last_name", ''),
  u."email",
  u."password_hash",
  u."first_name",
  u."last_name",
  u."role",
  u."is_active",
  u."last_login_at",
  u."restaurant_group_id",
  u."created_at",
  u."updated_at"
FROM "users" u
WHERE NOT EXISTS (
  SELECT 1 FROM "team_members" tm WHERE tm."email" = u."email"
)
ON CONFLICT ("id") DO NOTHING;

-- Step 7: For Users that DO have a matching TeamMember by email,
-- update the TeamMember with the User's password_hash and login fields
UPDATE "team_members" tm
SET
  "password_hash" = u."password_hash",
  "first_name" = COALESCE(tm."first_name", u."first_name"),
  "last_name" = COALESCE(tm."last_name", u."last_name"),
  "role" = u."role",
  "last_login_at" = u."last_login_at",
  "restaurant_group_id" = COALESCE(tm."restaurant_group_id", u."restaurant_group_id")
FROM "users" u
WHERE tm."email" = u."email"
  AND tm."id" != u."id";

-- Step 8: Update user_sessions to point to TeamMember IDs
-- For sessions referencing a User ID that was migrated as-is (same ID), no change needed.
-- For sessions referencing a User ID where the TeamMember has a different ID (email merge),
-- update to the TeamMember ID.
UPDATE "user_sessions" us
SET "user_id" = tm."id"
FROM "users" u
JOIN "team_members" tm ON tm."email" = u."email"
WHERE us."user_id" = u."id"
  AND us."user_id" != tm."id";

-- Step 9: Update user_restaurant_access to use teamMemberId
-- For access rows referencing a User ID that was inserted as-is, no change needed.
-- For access rows referencing a User ID where TeamMember has different ID (email merge),
-- update to TeamMember ID.
UPDATE "user_restaurant_access" ura
SET "user_id" = tm."id"
FROM "users" u
JOIN "team_members" tm ON tm."email" = u."email"
WHERE ura."user_id" = u."id"
  AND ura."user_id" != tm."id";

-- Step 10: Drop FK constraints from user_sessions and user_restaurant_access that reference users table
ALTER TABLE "user_sessions" DROP CONSTRAINT IF EXISTS "user_sessions_user_id_fkey";
ALTER TABLE "user_restaurant_access" DROP CONSTRAINT IF EXISTS "user_restaurant_access_user_id_fkey";

-- Step 11: Add new FK constraints pointing to team_members
ALTER TABLE "user_sessions"
  ADD CONSTRAINT "user_sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "team_members"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_restaurant_access"
  ADD CONSTRAINT "user_restaurant_access_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "team_members"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 12: Drop the users table
DROP TABLE IF EXISTS "users" CASCADE;
