import type { Config } from 'drizzle-kit'

export default {
  schema: './src/schema/index.ts',
  out: './src/migrations',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL ?? 'postgresql://secureops:secureops@localhost:5432/secureops',
  },
} satisfies Config
