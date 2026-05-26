-- Drop the incidents, incident-form, and leave-request tables — the features
-- have been removed end-to-end. shift_site_visits.incident_id is removed first
-- so the FK doesn't block the incidents-table drop.

ALTER TABLE "shift_site_visits" DROP COLUMN IF EXISTS "incident_id";
--> statement-breakpoint
DROP TABLE IF EXISTS "incident_form_responses" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "incident_form_templates" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "incidents" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "leave_requests" CASCADE;
--> statement-breakpoint
DROP TYPE IF EXISTS "incident_severity";
--> statement-breakpoint
DROP TYPE IF EXISTS "incident_status";
--> statement-breakpoint
DROP TYPE IF EXISTS "leave_status";
--> statement-breakpoint
DROP TYPE IF EXISTS "leave_type";
