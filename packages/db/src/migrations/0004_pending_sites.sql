-- pending_sites: sites can now start in a `pending` state when a guard
-- checks in at a GPS that doesn't match any known site. Admin reviews on
-- /sites/:id, edits the geofence radius on the map, assigns a client +
-- supervisor + metadata, then flips the status to `active`.

-- 1) Extend site_status enum
ALTER TYPE "site_status" ADD VALUE IF NOT EXISTS 'pending' BEFORE 'active';

-- 2) clientId becomes nullable — admin picks one at confirmation time.
ALTER TABLE "sites" ALTER COLUMN "client_id" DROP NOT NULL;

-- 3) Briefing / metadata columns captured at confirmation.
ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "access_instructions" text;
ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "gate_code"           text;
ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "contact_phone"       text;
ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "hazards"             text;
