import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * One fresh PostgreSQL schema per run, for the whole run.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * Nothing in this product is ever deleted, and the guards that enforce that are
 * installed on the development database too. So an integration suite cannot
 * tear down after itself, and every row every run has ever created stays. That
 * is the correct behaviour for the product and a slow poison for the tests: the
 * fixtures accumulate without bound, and assertions that were true on a young
 * database stop being true on an old one.
 *
 * Two failures had already come from it, with different mechanisms and the same
 * cause:
 *
 *   · The numbering tests drew a "far future" year at random from a 900-year
 *     range. Each run burned about five of them permanently, so the chance of
 *     landing on a year an earlier run had already counted in rose with every
 *     run the database had ever seen. (Fixed separately, in ADR 0001 — the
 *     reservation helper is still the right thing and stays.)
 *
 *   · The notification tests assert that a broker was told their file arrived.
 *     Role-addressed notices go to every officer holding the role, and the
 *     fixture users accumulated until there were 603 registry clerks. One
 *     submission then pushed 603 messages into the capture driver's 500-message
 *     buffer, silently evicting the broker's notice — which is sent first — and
 *     the assertion became false. It passed on runs 1 to 15 of a twenty-run
 *     sequence and has failed every run since, permanently.
 *
 * The second one is the important one, because it is not flaky. It crossed a
 * threshold and stayed there. No amount of re-running recovers it, and the next
 * threshold is somewhere ahead of whatever the current fixtures are.
 *
 * ── What this does ────────────────────────────────────────────────────────
 *
 * Creates one schema per run and migrates into it, so every run starts from an
 * empty register and accumulation cannot cross runs.
 *
 * Per *run*, deliberately, not per file. `fileParallelism: false` exists so the
 * integration files share one database and contend on the same rows and
 * advisory locks — that contention is what makes the concurrency tests mean
 * anything. A schema per file would remove it. A schema per run keeps the
 * contention inside a run and removes the accumulation between runs, which is
 * the combination we actually want.
 *
 * The schema is dropped at the end of the run. That is not a breach of the
 * no-delete rule: it removes scaffolding this run created, not records. The
 * delete and truncate guards are installed inside the schema and are in force
 * for every test that runs against it — a test that tried to delete a row still
 * fails, exactly as production would.
 */

const PREFIX = 'osool_test_'

function baseUrl(): string {
  // The plain-Node scripts read `.env`; Vitest does not, so do it here — before
  // anything imports the Prisma client and freezes the URL it saw.
  const envPath = join(process.cwd(), '.env')
  if (!process.env.DATABASE_URL && existsSync(envPath)) process.loadEnvFile(envPath)

  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Integration tests need a database.\nLocally:  npm run db:start',
    )
  }
  // Drop any schema already pinned in the URL; this run supplies its own.
  return url.split('?')[0]!
}

export async function setup(): Promise<void> {
  const schema = `${PREFIX}${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`
  const url = `${baseUrl()}?schema=${schema}`

  process.env.OSOOL_TEST_SCHEMA = schema
  process.env.DATABASE_URL = url

  // Workers are forked after this returns and inherit the environment, so the
  // assignment above is what puts every test file on the new schema.
  const run = (command: string, args: string[]) =>
    execFileSync(command, args, {
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
      shell: process.platform === 'win32',
    })

  run('npx', ['prisma', 'migrate', 'deploy'])

  // The reference data, not fixtures: the transition table, the rule sets and
  // their effective dates. Without it every workflow test fails on an empty
  // state machine rather than on whatever it meant to assert.
  run('npx', ['tsx', 'prisma/seed.ts'])

  console.log(`\n  test schema: ${schema}\n`)
}

export async function teardown(): Promise<void> {
  const schema = process.env.OSOOL_TEST_SCHEMA
  // Guarded on the prefix this file owns. Nothing outside `osool_test_*` can be
  // reached from here even if the variable is set to something unexpected.
  if (!schema || !schema.startsWith(PREFIX)) return

  const { PrismaClient } = await import('@prisma/client')
  const client = new PrismaClient({ datasources: { db: { url: baseUrl() } } })
  try {
    await client.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
  } finally {
    await client.$disconnect()
  }
}
