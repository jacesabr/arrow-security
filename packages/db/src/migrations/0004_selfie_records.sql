CREATE TABLE selfie_records (
  id                  text PRIMARY KEY,
  tenant_id           text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  guard_id            text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id             text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  attendance_record_id text REFERENCES attendance_records(id) ON DELETE SET NULL,
  check_type          attendance_type NOT NULL,
  image_data          text NOT NULL,
  latitude            double precision,
  longitude           double precision,
  captured_at         timestamp NOT NULL DEFAULT now(),
  review_status       selfie_review_status NOT NULL DEFAULT 'pending',
  review_note         text,
  reviewed_by         text REFERENCES users(id),
  reviewed_at         timestamp
);

CREATE INDEX idx_selfie_records_tenant       ON selfie_records(tenant_id);
CREATE INDEX idx_selfie_records_guard        ON selfie_records(guard_id);
CREATE INDEX idx_selfie_records_captured_at  ON selfie_records(captured_at DESC);
CREATE INDEX idx_selfie_records_review       ON selfie_records(review_status) WHERE review_status = 'pending';
