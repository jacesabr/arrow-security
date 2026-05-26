-- shift_site_visits: materialised on-site / off-site segments per shift.
-- Written by the geofence state machine as pings arrive in event-time order.
-- siteId NULL means the guard was off-site (outside all known geofences).

CREATE TABLE IF NOT EXISTS "shift_site_visits" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL,
  "shift_id" text NOT NULL,
  "guard_id" text NOT NULL,
  "site_id" text,
  "entered_at" timestamp NOT NULL,
  "exited_at" timestamp,
  "entered_lat" double precision,
  "entered_lng" double precision,
  "exited_lat" double precision,
  "exited_lng" double precision,
  "incident_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shift_site_visits" ADD CONSTRAINT "shift_site_visits_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shift_site_visits" ADD CONSTRAINT "shift_site_visits_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shift_site_visits" ADD CONSTRAINT "shift_site_visits_guard_id_users_id_fk" FOREIGN KEY ("guard_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shift_site_visits" ADD CONSTRAINT "shift_site_visits_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shift_site_visits" ADD CONSTRAINT "shift_site_visits_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shift_site_visits_shift_entered_idx" ON "shift_site_visits" ("shift_id","entered_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shift_site_visits_tenant_guard_entered_idx" ON "shift_site_visits" ("tenant_id","guard_id","entered_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shift_site_visits_tenant_site_entered_idx" ON "shift_site_visits" ("tenant_id","site_id","entered_at");
--> statement-breakpoint
-- Partial index for the hot "find the currently open visit for this shift" lookup
-- that runs on every incoming ping.
CREATE INDEX IF NOT EXISTS "shift_site_visits_open_idx" ON "shift_site_visits" ("shift_id") WHERE "exited_at" IS NULL;
--> statement-breakpoint
-- Add the 'abandoned' status used when a guard is auto-logged-out after going
-- off-site during their shift. Distinct from 'completed' (clean clock-out) and
-- 'missed' (never started). ADD VALUE IF NOT EXISTS is PG 12+ and safe to re-run.
ALTER TYPE "shift_status" ADD VALUE IF NOT EXISTS 'abandoned';
