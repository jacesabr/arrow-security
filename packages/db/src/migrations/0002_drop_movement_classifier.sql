-- Drop the dormant per-shift movement aggregates left over from the abandoned
-- walking/driving/stationary classifier. Geofence-anchored shift_site_visits
-- replaces this entirely; nothing reads these columns anymore.
ALTER TABLE "shifts"
  DROP COLUMN IF EXISTS "walking_meters",
  DROP COLUMN IF EXISTS "driving_meters",
  DROP COLUMN IF EXISTS "walking_seconds",
  DROP COLUMN IF EXISTS "driving_seconds",
  DROP COLUMN IF EXISTS "stationary_seconds",
  DROP COLUMN IF EXISTS "mean_speed_ms",
  DROP COLUMN IF EXISTS "idle_baseline_ms",
  DROP COLUMN IF EXISTS "movement_computed_at";
--> statement-breakpoint
-- guard_locations.activity_type / activity_confidence were captured for the
-- classifier and aren't read by anything in the new on-site/off-site model.
ALTER TABLE "guard_locations"
  DROP COLUMN IF EXISTS "activity_type",
  DROP COLUMN IF EXISTS "activity_confidence";
