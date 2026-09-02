import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll } from 'vitest'

/**
 * Integration-test bootstrap.
 *
 * Loads `.env` the same way the plain-Node scripts do — Vitest does not read it
 * — and then proves the database is actually reachable before a single test
 * runs. A suite that fails forty times with `ECONNREFUSED` tells you nothing;
 * one that fails once with "start it with npm run db:start" tells you what to do.
 *
 * A real environment variable always wins over the file, so CI (which sets
 * DATABASE_URL itself and has no `.env`) is unaffected.
 */
const root = process.cwd()
const envPath = join(root, '.env')

if (existsSync(envPath)) {
  const before = { ...process.env }
  process.loadEnvFile(envPath)
  for (const [key, value] of Object.entries(before)) {
    if (value !== undefined) process.env[key] = value
  }
}

process.env.PII_ENCRYPTION_KEY ??= 'test-only-pii-key-not-used-in-any-deployment0'
process.env.BETTER_AUTH_SECRET ??= 'test-only-auth-secret-not-used-in-deployment'

/*
 * Forced, not defaulted.
 *
 * `.env` on a developer's machine says `console`, which would make every
 * notification test assert against an empty capture buffer while the real
 * messages scrolled past in the output — a suite that passes nothing and
 * complains about nothing. The driver a test runs on is a property of the test,
 * not of whoever's laptop it is running on.
 */
process.env.EMAIL_PROVIDER = 'capture'

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not set. Integration tests need a database.\n' +
        'Locally:  npm run db:start',
    )
  }

  const { db } = await import('@/lib/db')
  try {
    await db.$queryRaw`SELECT 1`
  } catch (error) {
    throw new Error(
      `Cannot reach the database at ${process.env.DATABASE_URL?.replace(/:[^:@]*@/, ':***@')}.\n` +
        'Start it with:  npm run db:start\n' +
        `Underlying error: ${(error as Error).message.split('\n')[0]}`,
    )
  }

  const transitions = await db.applicationTransition.count()
  if (transitions === 0) {
    throw new Error(
      'The transition table is empty, so no workflow test can pass.\n' +
        'Seed it with:  npm run db:seed',
    )
  }
}, 60_000)
