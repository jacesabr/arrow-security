DO $$ BEGIN
  CREATE TYPE selfie_review_status AS ENUM ('pending', 'approved', 'flagged');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS selfie_review_status selfie_review_status,
  ADD COLUMN IF NOT EXISTS selfie_review_note text,
  ADD COLUMN IF NOT EXISTS selfie_reviewed_by text REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS selfie_reviewed_at timestamp;
