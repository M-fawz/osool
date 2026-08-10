#!/usr/bin/env node
/**
 * Apply pending migrations to a deployed database.
 *
 *   npm run db:deploy
 *
 * This is the only command that is ever pointed at a live register, so it does
 * exactly one thing: `prisma migrate deploy`. That command applies migrations
 * that have not been applied yet and does nothing else — it never drops, never
 * resets, never rewrites an applied migration, and it stops rather than guess
 * if the recorded history and the files disagree.
 *
 * The commands that *would* destroy data — `migrate reset`, `db push
 * --force-reset`, `migrate dev` (which offers to reset on drift) — are not
 * reachable from here and must never be pointed at a deployed database.
 * CLAUDE.md rule 2 and 02-SYSTEM-ARCHITECTURE §7.
 *
 * Two things are worth knowing about how this runs.
 *
 * **It uses a direct connection where one is configured.** A transaction-mode
 * pooler is what a serverless runtime needs and is exactly what a migration
 * cannot use: DDL and Prisma's advisory lock need a session that stays put.
 * `DIRECT_DATABASE_URL` is that session; where it is unset, `DATABASE_URL` is
 * used, which is right for a plain unpooled Postgres.
 *
 * **It fails loudly.** Run from the build, a failure here fails the build, the
 * deployment is not promoted, and the previous one keeps serving. A half-migrated
 * register that is live is a worse outcome than a deployment that did not land.
 */

import { spawnSync } from 'node:child_process'
import { loadEnvFile } from './lib/load-env.mjs'

// The Prisma CLI reads `.env` itself, but this script reads process.env before
// it gets there. Real environment variables still win — see load-env.mjs.
loadEnvFile()

/** The host, for the log. Never the credentials. */
function describe(url) {
  try {
    const parsed = new URL(url)
    return `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}${parsed.pathname}`
  } catch {
    return '(unparseable URL)'
  }
}

const databaseUrl = process.env.DATABASE_URL
const directUrl = process.env.DIRECT_DATABASE_URL

if (!databaseUrl) {
  console.error(
    '\nDATABASE_URL is not set, so there is no database to migrate.\n' +
      'Locally: run `npm run setup`. On Vercel: Settings → Environment Variables.\n',
  )
  process.exit(1)
}

const target = directUrl || databaseUrl

console.log('Applying migrations')
console.log('────────────────────────────────────────────────────────')
console.log(`Target      : ${describe(target)}`)
console.log(`Connection  : ${directUrl ? 'DIRECT_DATABASE_URL (unpooled)' : 'DATABASE_URL'}`)
console.log('Command     : prisma migrate deploy  (additive only, never resets)')
console.log('────────────────────────────────────────────────────────\n')

const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, DATABASE_URL: target },
})

if (result.status !== 0) {
  console.error(
    '\nMigrations did not apply. Nothing was rolled back and nothing was destroyed —\n' +
      '`migrate deploy` applies one migration at a time inside a transaction and stops\n' +
      'at the first failure. Read the error above before re-running.\n',
  )
  process.exit(result.status ?? 1)
}

console.log('\nMigrations are up to date.\n')
