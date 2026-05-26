-- site_routes: cache of Mapbox Directions API results between every ordered
-- pair of sites a tenant uses. Backs the supervisor gas-reimbursement column
-- on /accounting — for each pair of consecutive supervisor shifts within 4h
-- we sum the cached driving duration. One Mapbox call per unique site pair,
-- ever (refreshed by the app when computed_at ages past ~6 months).
CREATE TABLE IF NOT EXISTS "site_routes" (
  "tenant_id"        text    NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "from_site_id"     text    NOT NULL REFERENCES "sites"("id")   ON DELETE CASCADE,
  "to_site_id"       text    NOT NULL REFERENCES "sites"("id")   ON DELETE CASCADE,
  "duration_seconds" integer NOT NULL,
  "distance_meters"  integer NOT NULL,
  "computed_at"      timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "site_routes_pkey" PRIMARY KEY ("from_site_id", "to_site_id")
);
