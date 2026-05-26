/**
 * Intentional no-op.
 *
 * This project no longer ships dummy/test guard data. Real tenants, sites,
 * and users are created through normal flows — the registration / signup
 * endpoint, the tenant-portal admin pages, and the mobile app — so a fresh
 * database is genuinely empty until a real signup happens.
 *
 * The `pnpm db:seed` and `pnpm db:setup` scripts still exist for muscle
 * memory; they run this file and return immediately. Re-purpose if you ever
 * need a bootstrap step (e.g. creating a platform-admin user from env vars
 * during first deploy) — but never re-introduce fake guards / sites /
 * incidents here. Those should be created the same way customers create them.
 */
export async function seed(_connectionString?: string): Promise<void> {
  console.log(
    '🚫 seed: no-op by design. Create real tenants/users via signup, not fixtures.'
  )
}

if (require.main === module) {
  seed().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
