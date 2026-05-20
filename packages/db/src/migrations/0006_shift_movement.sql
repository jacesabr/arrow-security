-- Per-shift movement breakdown computed from guard_locations on shift completion.
-- *_meters = distance covered while in that mode.
-- *_seconds = elapsed time in segments classified as that mode.
-- idle_baseline_ms = the per-shift adaptive stationary threshold (25th percentile of
-- smoothed speed). Kept so the audit graph can show why pings were classified the way
-- they were.

ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS walking_meters       integer,
  ADD COLUMN IF NOT EXISTS driving_meters       integer,
  ADD COLUMN IF NOT EXISTS walking_seconds      integer,
  ADD COLUMN IF NOT EXISTS driving_seconds      integer,
  ADD COLUMN IF NOT EXISTS stationary_seconds   integer,
  ADD COLUMN IF NOT EXISTS mean_speed_ms        real,
  ADD COLUMN IF NOT EXISTS idle_baseline_ms     real,
  ADD COLUMN IF NOT EXISTS movement_computed_at timestamp;
