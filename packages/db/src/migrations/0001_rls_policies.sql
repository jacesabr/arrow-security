-- Enable Row Level Security on all tenant-scoped tables
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE patrols ENABLE ROW LEVEL SECURITY;
ALTER TABLE patrol_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cameras ENABLE ROW LEVEL SECURITY;

-- Create app role for API connections (not superuser)
DO $$ BEGIN
  CREATE ROLE secureops_app;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO secureops_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO secureops_app;

-- Helper function: get current tenant from session
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS text AS $$
  SELECT current_setting('app.tenant_id', true)
$$ LANGUAGE sql STABLE;

-- Helper function: get current user role from session
CREATE OR REPLACE FUNCTION current_user_role() RETURNS text AS $$
  SELECT current_setting('app.user_role', true)
$$ LANGUAGE sql STABLE;

-- ── clients ──────────────────────────────────────────────────────────────────
CREATE POLICY clients_tenant_isolation ON clients
  USING (tenant_id = current_tenant_id() OR current_user_role() = 'platform_admin');

-- ── sites ────────────────────────────────────────────────────────────────────
CREATE POLICY sites_tenant_isolation ON sites
  USING (tenant_id = current_tenant_id() OR current_user_role() = 'platform_admin');

-- ── users ────────────────────────────────────────────────────────────────────
-- Platform admin sees all; tenant users see their tenant
CREATE POLICY users_tenant_isolation ON users
  USING (
    current_user_role() = 'platform_admin'
    OR tenant_id = current_tenant_id()
  );

-- ── attendance_records ───────────────────────────────────────────────────────
CREATE POLICY attendance_tenant_isolation ON attendance_records
  USING (tenant_id = current_tenant_id() OR current_user_role() = 'platform_admin');

-- ── checkpoints ──────────────────────────────────────────────────────────────
CREATE POLICY checkpoints_tenant_isolation ON checkpoints
  USING (tenant_id = current_tenant_id() OR current_user_role() = 'platform_admin');

-- ── patrols ──────────────────────────────────────────────────────────────────
CREATE POLICY patrols_tenant_isolation ON patrols
  USING (tenant_id = current_tenant_id() OR current_user_role() = 'platform_admin');

-- ── patrol_scans ─────────────────────────────────────────────────────────────
CREATE POLICY patrol_scans_tenant_isolation ON patrol_scans
  USING (tenant_id = current_tenant_id() OR current_user_role() = 'platform_admin');

-- ── incidents ────────────────────────────────────────────────────────────────
CREATE POLICY incidents_tenant_isolation ON incidents
  USING (tenant_id = current_tenant_id() OR current_user_role() = 'platform_admin');

-- Guard can only see their own incidents on client_viewer role
CREATE POLICY incidents_client_viewer ON incidents
  FOR SELECT
  USING (
    current_user_role() = 'client_viewer'
    AND tenant_id = current_tenant_id()
  );

-- ── shifts ───────────────────────────────────────────────────────────────────
CREATE POLICY shifts_tenant_isolation ON shifts
  USING (tenant_id = current_tenant_id() OR current_user_role() = 'platform_admin');

-- ── cameras ──────────────────────────────────────────────────────────────────
CREATE POLICY cameras_tenant_isolation ON cameras
  USING (tenant_id = current_tenant_id() OR current_user_role() = 'platform_admin');

-- Indexes for tenant_id columns (critical for RLS performance)
CREATE INDEX IF NOT EXISTS idx_clients_tenant ON clients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sites_tenant ON sites(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sites_client ON sites(client_id);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_attendance_tenant ON attendance_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_attendance_guard ON attendance_records(guard_id);
CREATE INDEX IF NOT EXISTS idx_attendance_verified_at ON attendance_records(verified_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkpoints_tenant ON checkpoints(tenant_id);
CREATE INDEX IF NOT EXISTS idx_checkpoints_site ON checkpoints(site_id);
CREATE INDEX IF NOT EXISTS idx_patrols_tenant ON patrols(tenant_id);
CREATE INDEX IF NOT EXISTS idx_patrol_scans_tenant ON patrol_scans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_incidents_tenant ON incidents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
CREATE INDEX IF NOT EXISTS idx_shifts_tenant ON shifts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shifts_guard ON shifts(guard_id);
CREATE INDEX IF NOT EXISTS idx_shifts_starts_at ON shifts(starts_at);
CREATE INDEX IF NOT EXISTS idx_cameras_tenant ON cameras(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cameras_site ON cameras(site_id);
