-- ============================================================
-- guard_locations: convert to range partition by recorded_at
-- Run ONCE in a maintenance window (requires pg_partman or manual monthly partition creation)
-- ============================================================

-- Step 1: rename existing table
ALTER TABLE guard_locations RENAME TO guard_locations_old;

-- Step 2: create partitioned parent (same schema + battery column)
CREATE TABLE guard_locations (
  id           TEXT         NOT NULL,
  tenant_id    TEXT         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  guard_id     TEXT         NOT NULL REFERENCES users(id),
  shift_id     TEXT         REFERENCES shifts(id),
  latitude     DOUBLE PRECISION NOT NULL,
  longitude    DOUBLE PRECISION NOT NULL,
  accuracy     DOUBLE PRECISION,
  heading      DOUBLE PRECISION,
  speed        DOUBLE PRECISION,
  altitude     DOUBLE PRECISION,
  battery      INTEGER,
  h3_res8      TEXT,
  recorded_at  TIMESTAMP    NOT NULL DEFAULT now()
) PARTITION BY RANGE (recorded_at);

-- Step 3: create initial monthly partitions (2025-01 through 2026-12)
CREATE TABLE guard_locations_2025_01 PARTITION OF guard_locations
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE guard_locations_2025_02 PARTITION OF guard_locations
  FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
CREATE TABLE guard_locations_2025_03 PARTITION OF guard_locations
  FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');
CREATE TABLE guard_locations_2025_04 PARTITION OF guard_locations
  FOR VALUES FROM ('2025-04-01') TO ('2025-05-01');
CREATE TABLE guard_locations_2025_05 PARTITION OF guard_locations
  FOR VALUES FROM ('2025-05-01') TO ('2025-06-01');
CREATE TABLE guard_locations_2025_06 PARTITION OF guard_locations
  FOR VALUES FROM ('2025-06-01') TO ('2025-07-01');
CREATE TABLE guard_locations_2025_07 PARTITION OF guard_locations
  FOR VALUES FROM ('2025-07-01') TO ('2025-08-01');
CREATE TABLE guard_locations_2025_08 PARTITION OF guard_locations
  FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');
CREATE TABLE guard_locations_2025_09 PARTITION OF guard_locations
  FOR VALUES FROM ('2025-09-01') TO ('2025-10-01');
CREATE TABLE guard_locations_2025_10 PARTITION OF guard_locations
  FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');
CREATE TABLE guard_locations_2025_11 PARTITION OF guard_locations
  FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');
CREATE TABLE guard_locations_2025_12 PARTITION OF guard_locations
  FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');
CREATE TABLE guard_locations_2026_01 PARTITION OF guard_locations
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE guard_locations_2026_02 PARTITION OF guard_locations
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE guard_locations_2026_03 PARTITION OF guard_locations
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE guard_locations_2026_04 PARTITION OF guard_locations
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE guard_locations_2026_05 PARTITION OF guard_locations
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE guard_locations_2026_06 PARTITION OF guard_locations
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE guard_locations_2026_07 PARTITION OF guard_locations
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE guard_locations_2026_08 PARTITION OF guard_locations
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE guard_locations_2026_09 PARTITION OF guard_locations
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE guard_locations_2026_10 PARTITION OF guard_locations
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE guard_locations_2026_11 PARTITION OF guard_locations
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE guard_locations_2026_12 PARTITION OF guard_locations
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

-- Step 4: copy existing rows
INSERT INTO guard_locations SELECT *, NULL AS battery FROM guard_locations_old;

-- Step 5: drop old table
DROP TABLE guard_locations_old;

-- Step 6: partial GiST index for live-map queries (last 8 hours)
-- Requires PostGIS. If PostGIS not available, use the btree index below instead.
-- CREATE INDEX guard_locations_geom_recent ON guard_locations USING GIST (point(longitude, latitude))
--   WHERE recorded_at > now() - interval '8 hours';

-- Step 6b: btree index for tenant+guard lookups (works without PostGIS)
CREATE INDEX guard_locations_tenant_guard_recorded
  ON guard_locations (tenant_id, guard_id, recorded_at DESC);

-- Step 7: add primary key to partitioned table
ALTER TABLE guard_locations ADD PRIMARY KEY (id, recorded_at);
