#!/usr/bin/env node
/**
 * The build Vercel runs.
 *
 * npm looks for a `vercel-build` script before `build`, so this file is the
 * hosted build and `npm run build` stays exactly what it was: a plain
 * `next build` that a container image or a developer's laptop can run without
 * inheriting any hosting-specific behaviour. 02-SYSTEM-ARCHITECTURE §10
 * decision 1 — host-agnostic on purpose.
 *
 * Three steps, in this order, and the order matters:
 *
 *   1. **Check the configuration** before anything expensive. A missing
 *      variable found here prints one line naming it; found later, it surfaces
 *      as a Zod dump from inside a webpack worker, halfway through a page
 *      build, which is a much worse thing to read at four in the afternoon.
 *
 *   2. **Generate the Prisma client.** `postinstall` already does this, so this
 *      is belt and braces — cheap, and it removes any dependence on whether a
 *      cached `node_modules` caused the install step to be skipped.
 *
 *   3. **Apply migrations, on production only.** See the note below.
 *
 * Then `next build`. If any step fails, the build fails, the deployment is not
 * promoted, and the deployment already serving traffic is untouched.
 */

import { spawnSync } from 'node:child_process'
import { loadEnvFile } from './lib/load-env.mjs'

// A no-op on a host, where these are real environment variables. It is here so
// that running `npm run vercel-build` locally reproduces the hosted build
// instead of failing on configuration it could have read from `.env`.
loadEnvFile()

const step = (text) => `--- ${text}`

function run(label, command, args, env = {}) {
  console.log(`\n${step(`▸ ${label}`)}`)
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
  })
  if (result.status !== 0) {
    console.error(`\n✗ ${label} failed. The build stops here; nothing was deployed.\n`)
    process.exit(result.status ?? 1)
  }
}

// ── 1. Configuration ────────────────────────────────────────────────────────
//
// Only the variables without a safe default. Everything else is validated by
// src/lib/env.ts when the server actually starts, which is the right place for
// it — this is here to turn the commonest deployment mistake into one sentence.
const REQUIRED = ['DATABASE_URL', 'BETTER_AUTH_SECRET', 'PII_ENCRYPTION_KEY']
const missing = REQUIRED.filter((name) => !process.env[name]?.trim())

if (missing.length) {
  console.error(
    `\n✗ Cannot build: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not set.\n\n` +
      '  Vercel → your project → Settings → Environment Variables.\n' +
      '  The full list, and which environment each one belongs to, is in docs/DEPLOYMENT.md.\n',
  )
  process.exit(1)
}

const target = process.env.VERCEL_ENV ?? 'local'
console.log(`Osool build — target environment: ${target}`)

// ── 2. Prisma client ────────────────────────────────────────────────────────
run('Generating the Prisma client', 'npx', ['prisma', 'generate'])

// ── 3. Migrations ───────────────────────────────────────────────────────────
//
// Production migrates itself, so a push to main is genuinely all that a schema
// change needs. `migrate deploy` is additive: it applies what has not been
// applied and never resets — see scripts/db-deploy.mjs.
//
// A preview does not, by default. A preview whose DATABASE_URL has been left
// pointing at the live register would otherwise apply an unreviewed branch's
// migration to production the moment someone opened a pull request. Give
// Preview its own database and set RUN_MIGRATIONS_ON_BUILD=true there to turn
// this on; leave it off and a preview simply reads whatever schema it is
// pointed at.
const explicit = process.env.RUN_MIGRATIONS_ON_BUILD
const shouldMigrate = explicit === 'true' || (explicit !== 'false' && target === 'production')

if (shouldMigrate) {
  run('Applying database migrations', 'node', ['scripts/db-deploy.mjs'])
} else {
  console.log(
    `\n▸ Skipping migrations (environment: ${target}).` +
      '\n  Set RUN_MIGRATIONS_ON_BUILD=true for this environment to apply them here.',
  )
}

// ── 4. The build ────────────────────────────────────────────────────────────
//
// NODE_ENV is stated rather than inherited. `next build` sets it to production
// when it is unset, but *respects* it when it is set — so anything upstream
// that leaked a development NODE_ENV would silently produce a development
// build. See the note in scripts/lib/load-env.mjs.
run('Building', 'npx', ['next', 'build'], { NODE_ENV: 'production' })

console.log('\n✓ Build complete.\n')
