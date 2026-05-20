-- Guard's plaintext reason for checking in/out outside the site geofence.
-- Required by mobile when isWithinGeofence = false; shown on the guard's attendance logsheet.
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS out_of_zone_reason text;
