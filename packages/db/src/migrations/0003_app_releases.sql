CREATE TABLE IF NOT EXISTS app_releases (
  id         text PRIMARY KEY,
  version    text NOT NULL UNIQUE,
  bundle_data text NOT NULL,
  bundle_size integer NOT NULL,
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now()
);
