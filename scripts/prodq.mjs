/**
 * Ad-hoc read-only query against the production register.
 *
 *   node scripts/prodq.mjs "select count(*) from application;"
 *   node scripts/prodq.mjs -f path/to/queries.sql
 *
 * Statements are separated by `;`.
 *
 * Two things about this file are load-bearing:
 *
 *   1. It reads `.env.prod.pulled` — written by `vercel env pull`, gitignored —
 *      rather than `.env`, so it can never report on the local database while
 *      claiming to describe production.
 *   2. `@prisma/client` is imported *dynamically*, after the environment is
 *      set. A static import is hoisted above the whole module body, and the
 *      Prisma runtime reads `.env` the moment it is imported — which put the
 *      local `localhost:5433` back and produced a confident "can't reach the
 *      database server" against a database that was never being addressed.
 *
 * Most of this project's own Vercel variables are marked Sensitive, so the pull
 * returns the literal `[SENSITIVE]` for them. The Supabase integration's
 * variables are not, and carry the same credentials. Session mode (5432), not
 * transaction mode (6543), because Prisma uses prepared statements.
 */
import { existsSync, readFileSync } from 'node:fs'

const ENV_FILE = '.env.prod.pulled'
if (!existsSync(ENV_FILE)) {
  console.error(
    `${ENV_FILE} is missing. Run:\n  npx vercel env pull ${ENV_FILE} --environment=production --yes`,
  )
  process.exit(1)
}
process.loadEnvFile(ENV_FILE)

const usable = (v) => Boolean(v) && v !== '[SENSITIVE]' && v.startsWith('post')
const url = [
  process.env.DATABASE_URL,
  process.env.POSTGRES_URL_NON_POOLING,
  process.env.POSTGRES_PRISMA_URL,
].find(usable)

if (!url) {
  console.error('No usable production connection string in the pulled environment.')
  process.exit(1)
}
process.env.DATABASE_URL = url

const args = process.argv.slice(2)
const sql = args[0] === '-f' ? readFileSync(args[1], 'utf8') : args.join(' ')

const { PrismaClient } = await import('@prisma/client')
const db = new PrismaClient({ datasourceUrl: url })

const json = (rows) => JSON.stringify(rows, (_k, v) => (typeof v === 'bigint' ? Number(v) : v), 2)

let failed = false
try {
  for (const statement of sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('--'))) {
    console.log(`\n── ${statement.replace(/\s+/g, ' ').slice(0, 120)}`)
    try {
      console.log(json(await db.$queryRawUnsafe(statement)))
    } catch (error) {
      failed = true
      // The message, not the 40 KB of minified runtime Prisma prints with it.
      console.log(
        `   ERROR: ${String(error.message).split('\n').filter(Boolean).slice(-3).join(' ')}`,
      )
    }
  }
} finally {
  await db.$disconnect()
}
process.exit(failed ? 1 : 0)
