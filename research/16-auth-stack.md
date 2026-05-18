# Investigation 16 — Auth Stack: Multi-Tenant Identity & Authorization

**Date:** 2026-05-17  
**Scope:** Evaluate Keycloak, Ory, ZITADEL, Casbin, and Better Auth for a security guard operations platform (Fastify 4 + Node.js, PostgreSQL + Drizzle ORM, Next.js 16, Ionic/Capacitor PWA).

---

## Summary

Our current auth is a thin custom layer: `@fastify/jwt` signs `{ sub, tenantId, role }` tokens that live 24 hours; passwords are hashed with SHA-256 + a salt env var (not bcrypt); there is no refresh-token rotation, no MFA, no SSO, and no tamper-evident audit log. For a single-company deployment serving guards, supervisors, and admins, it works. For a growing platform where enterprise clients will demand SAML SSO, auditors will ask for tamper-evident logs, and guards on Android will need silent token refresh, the current stack has four critical gaps:

1. **Password hashing** — SHA-256 + salt is not slow enough; brute-force attacks are cheap.
2. **No refresh tokens** — a stolen 24-hour token is valid until expiry; there is no revocation path.
3. **No MFA** — required by enterprise security buyers.
4. **No audit trail** — no record of who logged in, when, from where, or what they changed.

Among the five options evaluated, **ZITADEL** is the strongest fit because it shares our PostgreSQL dependency, is built specifically for multi-tenant SaaS, ships event-sourced audit out of the box, and has an OIDC-native mobile story compatible with Capacitor webviews. The recommended path is a **phased adoption**: fix password hashing immediately (in-place migration), then integrate ZITADEL as the IdP for SSO/MFA tenants while keeping our Fastify JWT middleware as the API access layer — so the bulk of our route code does not change.

---

## Stack & Dependencies

### Current (Arrow Security)

| Component | Technology | License |
|-----------|-----------|---------|
| Runtime | Node.js 20, Fastify 4 | MIT |
| JWT plugin | `@fastify/jwt` 8 (wraps `fast-jwt`) | MIT |
| Password hash | Node.js built-in `crypto.createHash('sha256')` | N/A (Node core) |
| Authorization | Custom `requireRole()` helpers in `apps/api/src/lib/auth.ts` | — |
| Token storage (web) | `localStorage` (`td_token`) | — |
| Token storage (mobile) | Implicit (Capacitor webview `localStorage`) | — |

### Keycloak

| Item | Detail |
|------|--------|
| Language | Java / Quarkus |
| License | Apache 2.0 |
| Database | PostgreSQL, MySQL, Oracle (configurable) |
| Key dependencies | Quarkus, Infinispan (session cache), WildFly subsystems |
| Docker image size | ~600 MB |
| Version evaluated | 24.x |

### Ory (Kratos + Hydra + Keto + Oathkeeper)

| Item | Detail |
|------|--------|
| Language | Go |
| License | Apache 2.0 |
| Database | PostgreSQL, MySQL, SQLite |
| Components needed | Kratos (identity), Hydra (OAuth2/OIDC), Keto (permissions), Oathkeeper (proxy) |
| Deployment | 4 separate services; each is individually small (~30 MB) |
| Version evaluated | Kratos 1.x / Hydra 2.x |

### ZITADEL

| Item | Detail |
|------|--------|
| Language | Go |
| License | Apache 2.0 |
| Database | **PostgreSQL only** — CockroachDB also supported |
| Architecture | Single binary, event-sourced |
| Docker image size | ~90 MB |
| Version evaluated | 2.x (latest stable 2026-05) |

### Casbin

| Item | Detail |
|------|--------|
| Language | Go core; `node-casbin` is the Node.js port |
| License | Apache 2.0 |
| npm package | `casbin` (3.x) |
| Nature | Embeddable RBAC/ABAC/ReBAC library — **not an identity system** |
| Database | Adapters for PostgreSQL, MongoDB, Redis, etc. |

### Better Auth

| Item | Detail |
|------|--------|
| Language | TypeScript |
| License | MIT |
| npm package | `better-auth` (1.x) |
| Nature | Node.js library — runs inside your existing server process |
| Fastify support | Official Fastify adapter (`better-auth/fastify`) |
| Database | Drizzle adapter exists (`better-auth/adapters/drizzle`) |

---

## Data Model

### Our current model (relevant fields)

```
tenants: { id, name, slug, status }
users:   { id, tenantId (FK → tenants), email, role (enum), passwordHash, faceEnrolled, fcmToken, lastLoginAt }
```

JWT payload: `{ sub: userId, tenantId, role, iat, exp }`  
No refresh token table. No session table. No MFA table. No audit_log table.

### What each option adds / replaces

**Keycloak**  
Replaces the entire identity layer with its own internal user store per realm. Realms are the isolation boundary. If we use Keycloak as a federated IdP, our `users` table becomes a shadow copy synchronized via post-login webhook or kept as the authoritative source of `guardId` / `tenantId` / `role`, with Keycloak only handling password and MFA. User data lives in two places — a synchronization burden.

**Ory Kratos**  
Kratos owns a separate `identities` table (its own DB schema). Like Keycloak, it creates a split: identity credentials and traits (email, phone) live in Kratos; business fields (tenantId, role) live in our DB. Connecting them requires using Kratos's `metadata_public` trait to store our `userId` and `tenantId`, then a webhook or session hook to mint our own JWT. Non-trivial.

**ZITADEL**  
Organizations map to our `tenants`. Each organization gets its own OIDC issuer and can enforce its own MFA policy. ZITADEL issues OIDC ID tokens; we trust those tokens in Fastify instead of minting our own. The `tenantId` claim can be sourced from the ZITADEL organization ID or added via a custom claim action. Our `users` table remains authoritative for guard-specific fields (site assignments, face enrollment); we add a `zitadelUserId` column to link records.

Minimal schema change:
```sql
ALTER TABLE users ADD COLUMN zitadel_user_id text UNIQUE;
```

**Casbin**  
Adds no identity data model — it only reads principals and objects to evaluate policies. A `casbin_rule` table is added (via the PostgreSQL adapter) to store `(ptype, v0, v1, v2, v3, v4, v5)` tuples. Our JWT stays as-is; Casbin middleware reads `payload.role` and `payload.tenantId` to enforce fine-grained policies beyond our current role check.

**Better Auth**  
Creates its own tables inside our PostgreSQL database: `ba_users`, `ba_sessions`, `ba_accounts`, `ba_verifications`. With the Drizzle adapter it generates these as Drizzle schema files that we control. Sessions are server-stored and revocable. Better Auth can co-exist with our `users` table if we configure it to reference our existing table rather than its own — requires manual Drizzle adapter mapping.

---

## API / Interface Surface

### Current surface (what route handlers actually call)

```typescript
// Middleware
await request.jwtVerify()                    // verifies signature + expiry
const payload = request.user as { sub, tenantId, role }

// Helpers (apps/api/src/lib/auth.ts)
requireAuth(request, reply)                  // 401 if no valid token
requireRole(...roles)(request, reply)        // 403 if role not in list
requireTenantAdmin(request, reply)           // shorthand: platform_admin | tenant_admin
requireSupervisor(request, reply)            // shorthand: + supervisor
```

All DB queries use `eq(table.tenantId, payload.tenantId)` — the tenantId embedded in the JWT is the sole isolation mechanism. No query uses a session ID or a row-level security policy.

### Keycloak API surface

- REST Admin API (Java) for realm/user/client management
- OIDC `.well-known/openid-configuration` endpoint
- Token introspection endpoint
- SAML 2.0 IdP-initiated / SP-initiated flows
- Admin events API for audit logs (not tamper-evident by default)

Integration with Fastify: replace `@fastify/jwt` with `@fastify/jwt` configured to use Keycloak's JWKS URI for signature verification. Our `requireAuth` stays almost identical; only the JWT payload shape changes from `{ sub, tenantId, role }` to Keycloak's `{ sub, realm_access.roles[], custom_claims }`.

### Ory API surface

- Kratos: browser/native self-service flows (login, registration, recovery, settings) via REST + SPA SDK
- Hydra: OAuth2 authorize / token / introspect endpoints
- Keto: permission check API (`POST /relation-tuples/check`)
- Oathkeeper: reverse-proxy rule engine (replaces our `requireAuth` middleware entirely)

Integration point: complex. Oathkeeper sits in front of Fastify and injects a `X-User` header; our routes read that instead of `request.user`. Alternatively, skip Oathkeeper and call the Keto check endpoint from within our `requireAuth` helper.

### ZITADEL API surface

- OIDC discovery + JWKS endpoint
- gRPC management API (user, org, policy management)
- REST management API (same operations, HTTP/JSON)
- SAML 2.0 SP-initiated flow built-in
- Token introspection + UserInfo endpoints
- Custom claim actions (JavaScript executed server-side to inject custom claims into tokens)
- Audit events via event store API

Integration with Fastify: identical change to Keycloak approach — configure `@fastify/jwt` to verify against ZITADEL's JWKS URI. Add a custom claim action in ZITADEL to embed `tenantId` and `role` into the access token. Our route code does not change.

### Casbin API surface

```typescript
import { newEnforcer } from 'casbin'
const enforcer = await newEnforcer('model.conf', adapter)

// In middleware
const allowed = await enforcer.enforce(userId, resource, action)
```

Casbin has no HTTP API — it is a library called synchronously (or async with DB adapter) from within our middleware. It replaces the `requireRole()` helpers with a more expressive policy check.

### Better Auth API surface

```typescript
// apps/api/src/lib/betterAuth.ts
import { betterAuth } from 'better-auth'
import { fastifyAuth } from 'better-auth/fastify'
export const auth = betterAuth({ database: drizzleAdapter(db), ... })

// server.ts
await app.register(fastifyAuth(auth))

// In routes
const session = await auth.api.getSession({ headers: request.headers })
```

Better Auth exposes its own route handlers at `/api/auth/**` (login, logout, session, OAuth callback). Our existing `/api/auth/login` would be replaced by Better Auth's handler.

---

## Algorithms / Techniques Worth Borrowing

### 1. Refresh-token rotation (ZITADEL / Keycloak / Better Auth)

All three implement refresh-token rotation: when a refresh token is used, it is immediately invalidated and a new pair (access + refresh) is issued. Detection of reuse (replay attack) triggers revocation of the entire token family. We should implement this regardless of which option we adopt:

```
access_token  → short-lived (15 min)
refresh_token → longer-lived (7 days), single-use, stored server-side hash
```

Our current 24-hour access token with no refresh path is a significant operational risk for a security platform where guards use the app from potentially shared devices.

### 2. PKCE for mobile (ZITADEL / Keycloak / Better Auth)

PKCE (Proof Key for Code Exchange) — RFC 7636 — allows the Capacitor mobile app to complete an OAuth2 authorization code flow without embedding a client secret. This is the correct pattern for a public client (mobile app):

1. App generates `code_verifier` (random 43–128 chars) and `code_challenge = BASE64URL(SHA256(verifier))`
2. App sends `code_challenge` with the authorization request
3. IdP returns authorization code
4. App sends `code_verifier` with the token request; IdP verifies the hash
5. No client secret is ever stored in the app bundle

ZITADEL and Keycloak support this natively. We can implement it ourselves with Better Auth or keep it custom.

### 3. Event-sourced audit (ZITADEL)

ZITADEL stores every state change as an immutable event in a PostgreSQL `eventstore` table:

```sql
-- Simplified ZITADEL eventstore schema
CREATE TABLE eventstore.events (
  id          UUID DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_type  TEXT NOT NULL,         -- e.g. 'user.human.signed.in'
  aggregate_type TEXT NOT NULL,      -- e.g. 'user'
  aggregate_id   TEXT NOT NULL,      -- userId
  instance_id    TEXT NOT NULL,      -- our tenantId equivalent
  sequence       BIGINT NOT NULL,    -- monotonically increasing per aggregate
  payload        JSONB,
  editor_user    TEXT,
  PRIMARY KEY (instance_id, aggregate_type, aggregate_id, sequence)
);
```

No row is ever updated or deleted. Audit queries are just range scans on `event_type`. This is directly portable as a pattern for our own `audit_log` table if we do not adopt ZITADEL fully.

### 4. Row-level security via PostgreSQL policies (alternative to JWT tenantId filter)

Rather than relying on every query handler to include `eq(table.tenantId, payload.tenantId)`, PostgreSQL RLS lets the database enforce isolation:

```sql
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON incidents
  USING (tenant_id = current_setting('app.tenant_id'));
```

Then at the start of each DB transaction:
```typescript
await db.execute(sql`SET LOCAL app.tenant_id = ${payload.tenantId}`)
```

This eliminates the category of bugs where a developer forgets to add the tenant filter. Worth implementing independently of which IdP is chosen.

### 5. Argon2id for password hashing (any option)

The current SHA-256 + salt is equivalent to a fast hash — it does roughly 10 million operations per second on commodity hardware. Argon2id (RFC 9106) is the 2023 Password Hashing Competition winner, designed to be memory-hard:

```typescript
import { hash, verify } from '@node-rs/argon2'  // NAPI binding, no native compile needed

const passwordHash = await hash(password, {
  memoryCost: 65536,   // 64 MB
  timeCost: 3,         // iterations
  parallelism: 4,
})
```

Migration: on next successful login with the old SHA-256 hash, re-hash with Argon2id and update the record. Zero-downtime migration.

---

## What's Missing for Our Security App

### 1. MFA (critical for enterprise clients)

Our current stack has zero MFA. Security industry clients — banks, hospitals, malls — will require TOTP or hardware key MFA for supervisor and admin accounts at minimum. None of our five options is worse than the status quo here, but ZITADEL and Keycloak provide it out of the box with per-organization (per-tenant) enforcement policies. Better Auth has a TOTP plugin. Ory Kratos has MFA via lookup secrets and authenticator apps.

### 2. Session revocation

A terminated guard still has a valid token for up to 24 hours. There is no `/logout` endpoint that actually invalidates the token (our current `/logout` returns 200 without revoking anything). For a security operations platform where guards may be fired mid-shift, this is an operational gap. Solutions:

- Short-lived access tokens (15 min) + refresh token rotation → revoke refresh token on termination
- Token blocklist in Redis (fast lookup, matches our existing Redis container)
- Switch to server-stored sessions (Better Auth approach)

### 3. SSO / SAML for enterprise clients

Enterprise clients (a hospital chain, a port authority) will arrive with their own Azure AD or Okta. They will expect single sign-on: their employees who have `client_viewer` role should be able to log in with their corporate credentials. Implementing SAML SP-initiated flow from scratch in Fastify is a significant undertaking. ZITADEL and Keycloak handle this as a built-in federation feature.

### 4. Tamper-evident audit log

There is currently no audit log. A security platform will face compliance questions: "Show me every login attempt for Site X guards in the last 90 days." ZITADEL's event store is the strongest answer — it is append-only by architectural constraint. Keycloak's admin events are stored in its DB but can be deleted. Better Auth and Casbin have no built-in audit capability.

### 5. Fine-grained authorization beyond flat roles

The current role hierarchy (`platform_admin > tenant_admin > supervisor > guard > client_viewer`) is flat. Realistic scenarios that already exist in the codebase: a client_viewer should only see incidents for their own sites, not all sites in the tenant. A guard should only be able to read their own attendance records, not other guards'. Casbin is purpose-built for this. ZITADEL has an authorization service (in beta). This gap becomes painful at scale.

### 6. Face verification not connected to auth flow

`users.faceEnrolled` and `users.faceEmbeddingId` exist in the schema but the face check-in flow is not tied to the login token. If a guard badges in with GPS+QR but the face enrollment check fails, there is no mechanism to flag the session or step up the token's assurance level. OIDC has a standard claim for this: `acr` (Authentication Context Class Reference). Worth designing for.

---

## Verdict

| Option | Verdict | Rationale |
|--------|---------|-----------|
| **Current JWT** | IMPROVE | Fix password hashing immediately; add refresh tokens; add session revocation in Redis |
| **Keycloak** | AUGMENT (future) | Best SSO breadth; Java overhead; realms work but are less native than ZITADEL orgs |
| **Ory** | SKIP (now) | Most powerful but four services to operate; complexity-to-benefit ratio too high for current team size |
| **ZITADEL** | AUGMENT (Phase 2) | PostgreSQL-native, Go binary, OIDC-first, event-sourced audit — best architectural fit |
| **Casbin** | PORT (now) | Embeddable, zero new services; add fine-grained authorization on top of existing JWT now |
| **Better Auth** | REPLACE (if no SSO needed) | Best DX for TypeScript teams; eliminates custom auth code; Drizzle adapter is clean — but lacks SAML without plugins |

**Recommended path (three phases):**

**Phase 1 — Immediate (in-codebase, no new services):**
1. Replace SHA-256 with Argon2id (`@node-rs/argon2`) — migrate on next login
2. Add a `refresh_tokens` table (id, userId, tokenHash, expiresAt, revokedAt) and implement 15-min access + 7-day refresh token rotation
3. Add a Redis-backed token blocklist for immediate revocation on guard termination
4. Add `audit_log` table (append-only) and log every login, token refresh, and role-change event
5. Add Casbin with PostgreSQL adapter for fine-grained authorization (client_viewer → own sites only)

**Phase 2 — When first enterprise SSO requirement arrives:**
- Deploy ZITADEL as a sidecar service (single Docker container, same PostgreSQL instance)
- Configure ZITADEL organization per tenant; migrate `users.passwordHash` to ZITADEL credentials
- Reconfigure `@fastify/jwt` to verify against ZITADEL's JWKS endpoint; add custom claim action to inject `tenantId` + `role`
- Zero changes to route handlers — `payload.tenantId` and `payload.role` remain available

**Phase 3 — Hardening:**
- Implement PostgreSQL RLS (`SET LOCAL app.tenant_id`) as a second isolation layer
- Wire face check-in into OIDC `acr` step-up flow

---

## Concrete Extracts

### A: Argon2id drop-in for `apps/api/src/routes/auth.ts`

```typescript
// Replace the existing hashPassword function
import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2'

const ARGON2_OPTIONS = {
  memoryCost: 65536,  // 64 MB — tune down to 19456 on resource-constrained servers
  timeCost: 3,
  parallelism: 4,
}

async function hashPassword(pw: string): Promise<string> {
  return argon2Hash(pw, ARGON2_OPTIONS)
}

async function verifyPassword(hash: string, pw: string): Promise<boolean> {
  // Detect legacy SHA-256 hashes (hex, 64 chars) vs Argon2id hashes ($argon2id$...)
  if (hash.startsWith('$argon2')) {
    return argon2Verify(hash, pw, ARGON2_OPTIONS)
  }
  // Legacy path: SHA-256 + salt
  const legacy = createHash('sha256').update(pw + process.env.PASSWORD_SALT!).digest('hex')
  const matches = legacy === hash
  // Upgrade on successful legacy login
  if (matches) {
    const newHash = await argon2Hash(pw, ARGON2_OPTIONS)
    await db.update(users).set({ passwordHash: newHash }).where(eq(users.passwordHash, hash))
  }
  return matches
}
```

### B: Refresh token table (Drizzle schema)

```typescript
// packages/db/src/schema/refresh_tokens.ts
import { pgTable, text, timestamp, boolean } from 'drizzle-orm/pg-core'
import { users } from './users'
import { createId } from '../lib/id'

export const refreshTokens = pgTable('refresh_tokens', {
  id: text('id').primaryKey().$defaultFn(createId),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),  // SHA-256 of the raw token (fast lookup)
  familyId: text('family_id').notNull(),             // all rotations of one login session
  expiresAt: timestamp('expires_at').notNull(),
  revokedAt: timestamp('revoked_at'),                // null = valid
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

### C: ZITADEL custom claim action (injects tenantId + role)

```javascript
// Paste this into ZITADEL Console → Actions → post-token trigger
function setCustomClaims(ctx, api) {
  // ctx.v1.user.id is the ZITADEL userId mapped to our users.zitadel_user_id
  // We call our own API to look up tenantId + role, or store them in ZITADEL metadata
  const metadata = api.v1.user.claimsFromMetadata()
  api.v1.claims.setClaim('tenantId', metadata['tenantId'])
  api.v1.claims.setClaim('role', metadata['role'])
}
```

Our Fastify route handlers continue to read `payload.tenantId` and `payload.role` with no code changes.

### D: Casbin model for our existing roles + tenant isolation

```ini
# model.conf
[request_definition]
r = sub, tenant, obj, act

[policy_definition]
p = role, tenant, obj, act

[role_definition]
g = _, _   # role inheritance

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = g(r.sub, p.role) && r.tenant == p.tenant && r.obj == p.obj && r.act == p.act
```

Sample policies in `casbin_rule` table:
```
p, guard,          acme, attendance:own, read
p, guard,          acme, incidents,      create
p, supervisor,     acme, incidents,      read
p, supervisor,     acme, incidents,      update_status
p, tenant_admin,   acme, users,          create
p, client_viewer,  acme, incidents,      read     # but enforcer also filters by siteId
```

### E: Redis blocklist for revocation (minimal)

```typescript
// apps/api/src/lib/tokenBlocklist.ts
import Redis from 'ioredis'
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379')

export async function revokeToken(jti: string, ttlSeconds: number) {
  await redis.set(`blocklist:${jti}`, '1', 'EX', ttlSeconds)
}

export async function isRevoked(jti: string): Promise<boolean> {
  return (await redis.exists(`blocklist:${jti}`)) === 1
}

// In requireAuth:
// Add jti to JWT sign options, then check isRevoked(payload.jti) before allowing request
```

---

## Open Questions for Synthesis

1. **Timeline for first enterprise client?** ZITADEL is the right end-state for SSO, but if no enterprise deal is imminent, Phase 1 (Argon2id + refresh tokens + Redis blocklist) buys 12–18 months without new infrastructure.

2. **ZITADEL cloud vs self-hosted?** ZITADEL offers a managed cloud tier (free up to 25,000 MAU as of 2025). For Arrow Security's current single-tenant deployment, cloud eliminates the ops burden entirely. Self-hosted gives data residency control — important if clients are in regulated industries (banking, government).

3. **Casbin policy store: DB or file?** For a multi-tenant platform, the PostgreSQL adapter is required (policies are per-tenant). The file adapter is fine for local dev but cannot be hot-reloaded in production safely.

4. **`client_viewer` SSO priority?** If enterprise clients want their employees to have `client_viewer` access using corporate credentials, SAML federation must be per-organization. ZITADEL supports this natively (each organization can configure its own SAML IdP). Keycloak requires a separate realm or an identity broker per client — more configuration surface.

5. **Face check-in + OIDC `acr`:** If we add step-up authentication for high-security sites (face required to start patrol), we need to decide whether the face check passes through the IdP (ZITADEL/Keycloak have custom authenticator hooks) or remains a separate application-layer check stored in `attendance_records`. Application-layer is simpler now; IdP-level is more auditable.

6. **Multi-server SSE fan-out:** The live guard location SSE already notes that it is in-process memory. If ZITADEL is deployed separately, all token verification becomes a JWKS network call — add JWKS caching (`jwks-rsa` or `@fastify/jwt`'s built-in cache) to avoid latency on every request.

7. **Better Auth viability if no SAML:** If the product stays internal (no enterprise SSO requirement for 2+ years), Better Auth's Drizzle adapter is a faster migration path than ZITADEL — it is pure TypeScript, installs as an npm package, needs no new container, and its session model gives us immediate revocation. Revisit if an enterprise client with SAML arrives.
