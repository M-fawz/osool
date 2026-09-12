/**
 * Which demonstration accounts exist, what role they hold, and what state the
 * register is in.
 *
 *   node scripts/qa/accounts.mjs
 *
 * Read-only, and deliberately over the wire rather than through Prisma: this
 * has to be runnable when the application will not start, which is exactly the
 * moment somebody needs to know whether the accounts are there. `pg` is already
 * a dependency of the toolchain.
 *
 * It prints nothing but `.test` accounts. A real administrator's address is not
 * this script's business and would end up pasted into a report.
 */

import pg from 'pg'
import { readFileSync } from 'node:fs'

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const env = readFileSync('.env', 'utf8')
  const line = env.split('\n').find((l) => l.startsWith('DATABASE_URL='))
  if (!line) throw new Error('No DATABASE_URL in the environment or in .env')
  return line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '')
}

const client = new pg.Client({ connectionString: databaseUrl() })
await client.connect()

const { rows: users } = await client.query(`
  SELECT u.email, u.role, u.status, u."emailVerified", u."brokerEntityId",
         (SELECT count(*) FROM "account" a WHERE a."userId" = u.id AND a."providerId" = 'credential') AS creds
  FROM "user" u
  WHERE u.email LIKE '%@osool.test'
  ORDER BY u.role, u.email
`)

console.log(`\nDemonstration accounts on this database (${users.length})\n`)
console.log('  ' + 'email'.padEnd(28) + 'role'.padEnd(17) + 'status'.padEnd(10) + 'verified  password  entity')
console.log('  ' + '─'.repeat(84))
for (const u of users) {
  console.log(
    '  ' +
      u.email.padEnd(28) +
      u.role.padEnd(17) +
      u.status.padEnd(10) +
      (u.emailVerified ? 'yes' : 'NO ').padEnd(10) +
      (Number(u.creds) > 0 ? 'set' : 'NONE').padEnd(10) +
      (u.brokerEntityId ? 'yes' : '—'),
  )
}

const tables = [
  ['user', 'accounts'],
  ['application', 'applications'],
  ['registration', 'registrations'],
  ['appointment', 'appointments'],
  ['document', 'documents'],
  ['audit_event', 'audit events'],
  ['notification', 'notifications'],
]

console.log('\nRegister contents\n')
for (const [table, label] of tables) {
  const { rows } = await client
    .query(`SELECT count(*)::int AS n FROM "${table}"`)
    .catch(() => ({ rows: [{ n: null }] }))
  console.log(`  ${label.padEnd(16)} ${rows[0].n ?? 'table not found under this name'}`)
}

// Applications by status: the shape of the demonstration dataset, which is
// what makes a walkthrough worth watching. An empty column is a stage the
// script cannot show.
const { rows: byStatus } = await client.query(
  `SELECT status, count(*)::int AS n FROM "application" GROUP BY status ORDER BY n DESC`,
)
console.log('\nApplications by stage\n')
for (const r of byStatus) console.log(`  ${r.status.padEnd(22)} ${r.n}`)

const { rows: migrations } = await client.query(
  `SELECT migration_name, finished_at, rolled_back_at
   FROM "_prisma_migrations" ORDER BY started_at DESC LIMIT 5`,
)
console.log('\nMost recent migrations\n')
for (const m of migrations) {
  const state = m.rolled_back_at ? 'ROLLED BACK' : m.finished_at ? 'applied' : 'UNFINISHED'
  console.log(`  ${state.padEnd(12)} ${m.migration_name}`)
}
const { rows: bad } = await client.query(
  `SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL`,
)
console.log(`\n  failed or unfinished migrations: ${bad[0].n}`)

await client.end()
