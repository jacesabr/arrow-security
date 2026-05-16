#!/usr/bin/env bash
# provision-tenant.sh — Bootstrap a new tenant on the platform
# Usage: ./provision-tenant.sh --name "Acme Security" --slug acme --tier silver
# Requires: frappe-bench on same host, minio-client (mc), API running

set -euo pipefail

# ── Parse args ────────────────────────────────────────────────────────────────
TENANT_NAME=""
TENANT_SLUG=""
TIER="bronze"
FRAPPE_BENCH_DIR="${FRAPPE_BENCH_DIR:-/opt/frappe/bench}"
API_URL="${API_URL:-http://localhost:4000}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"
MINIO_URL="${MINIO_URL:-http://localhost:9000}"
MINIO_ALIAS="${MINIO_ALIAS:-local}"
ZAMMAD_URL="${ZAMMAD_URL:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name) TENANT_NAME="$2"; shift 2 ;;
    --slug) TENANT_SLUG="$2"; shift 2 ;;
    --tier) TIER="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [[ -z "$TENANT_NAME" || -z "$TENANT_SLUG" ]]; then
  echo "Usage: $0 --name 'Company Name' --slug company-slug [--tier bronze|silver|gold]"
  exit 1
fi

echo "──────────────────────────────────────────────"
echo "Provisioning tenant: $TENANT_NAME ($TENANT_SLUG)"
echo "Tier: $TIER"
echo "──────────────────────────────────────────────"

# ── Step 1: Create Frappe site ────────────────────────────────────────────────
FRAPPE_SITE="${TENANT_SLUG}.localhost"
echo "[1/6] Creating Frappe site: $FRAPPE_SITE"
cd "$FRAPPE_BENCH_DIR"
bench new-site "$FRAPPE_SITE" \
  --mariadb-root-password "${MARIADB_ROOT_PASSWORD:-}" \
  --admin-password "$(openssl rand -base64 16)" \
  --install-app hrms \
  --install-app erpnext || echo "Frappe site may already exist, continuing..."

FRAPPE_SITE_URL="http://${FRAPPE_SITE}:8000"

# ── Step 2: Create MinIO bucket ───────────────────────────────────────────────
echo "[2/6] Creating MinIO bucket: secureops-${TENANT_SLUG}"
mc alias set "$MINIO_ALIAS" "$MINIO_URL" "${MINIO_ROOT_USER:-secureops}" "${MINIO_ROOT_PASSWORD:-secureops123}" 2>/dev/null || true
mc mb "${MINIO_ALIAS}/secureops-${TENANT_SLUG}" 2>/dev/null || echo "Bucket may already exist"
mc anonymous set private "${MINIO_ALIAS}/secureops-${TENANT_SLUG}"

# ── Step 3: Create CompreFace app (API call) ──────────────────────────────────
echo "[3/6] Creating CompreFace app..."
COMPREFACE_URL="${COMPREFACE_URL:-http://localhost:8080}"
CF_RESPONSE=$(curl -s -X POST "${COMPREFACE_URL}/api/v1/admin/applications" \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${COMPREFACE_ADMIN_KEY:-}" \
  -d "{\"name\": \"${TENANT_SLUG}\"}" 2>/dev/null || echo '{"apiKey":""}')
CF_APP_KEY=$(echo "$CF_RESPONSE" | grep -o '"apiKey":"[^"]*"' | cut -d'"' -f4)
echo "CompreFace app key: ${CF_APP_KEY:0:8}..."

# ── Step 4: Register tenant in platform DB ────────────────────────────────────
echo "[4/6] Registering tenant in platform database..."
TENANT_PAYLOAD="{
  \"name\": \"$TENANT_NAME\",
  \"slug\": \"$TENANT_SLUG\",
  \"tier\": \"$TIER\",
  \"frappeSiteUrl\": \"$FRAPPE_SITE_URL\",
  \"zammadUrl\": \"${ZAMMAD_URL:-http://zammad.localhost}\",
  \"minioBucket\": \"secureops-${TENANT_SLUG}\",
  \"compreFaceAppKey\": \"${CF_APP_KEY}\"
}"

TENANT_RESPONSE=$(curl -s -X POST "${API_URL}/api/tenants" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d "$TENANT_PAYLOAD")

TENANT_ID=$(echo "$TENANT_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Tenant ID: $TENANT_ID"

# ── Step 5: Create admin user for tenant ──────────────────────────────────────
echo "[5/6] Creating tenant admin user..."
ADMIN_EMAIL="admin@${TENANT_SLUG}.secureops.in"
ADMIN_PASS=$(openssl rand -base64 12)

curl -s -X POST "${API_URL}/api/users" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d "{
    \"email\": \"$ADMIN_EMAIL\",
    \"name\": \"${TENANT_NAME} Admin\",
    \"role\": \"tenant_admin\",
    \"password\": \"$ADMIN_PASS\"
  }" > /dev/null

# ── Step 6: Activate tenant ───────────────────────────────────────────────────
echo "[6/6] Activating tenant..."
curl -s -X PATCH "${API_URL}/api/tenants/${TENANT_ID}/status" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"status":"active"}' > /dev/null

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "✅ Tenant provisioned successfully!"
echo "──────────────────────────────────────────────"
echo "  Tenant ID:      $TENANT_ID"
echo "  Admin URL:      https://${TENANT_SLUG}.secureops.in"
echo "  Admin Email:    $ADMIN_EMAIL"
echo "  Admin Password: $ADMIN_PASS"
echo "  Frappe:         $FRAPPE_SITE_URL"
echo "  MinIO bucket:   secureops-${TENANT_SLUG}"
echo "──────────────────────────────────────────────"
echo "⚠️  Save the admin password — it won't be shown again."
