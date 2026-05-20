-- Per-ping device-reported activity, sampled from Google Activity Recognition
-- (Android) or CMMotionActivityManager (iOS). Used as a tiebreaker in the
-- speed-based mode classifier when GPS speed alone is ambiguous (≈ 1.5–12 km/h).

ALTER TABLE guard_locations
  ADD COLUMN IF NOT EXISTS activity_type       text,
  ADD COLUMN IF NOT EXISTS activity_confidence smallint;

-- activity_type values produced by the mobile plugin:
--   'still' | 'walking' | 'running' | 'vehicle' | 'bicycle' | 'unknown'
-- activity_confidence: 0..100 on Android, 25/50/75 mapped from iOS low/med/high.
