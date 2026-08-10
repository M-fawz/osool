#!/usr/bin/env node
/**
 * One-command setup from a cold machine.
 *
 *   npm run setup
 *
 * Written for someone with no backend background: every step says what it is
 * doing and why, and stops with an explanation rather than a stack trace. It is
 * safe to run more than once — nothing here destroys existing data, and the
 * database refuses destructive statements anyway.
 */

import { spawn, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import net from 'node:net'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const step = (n, total, text) => console.log(`\n[${n}/${total}] ${text}`)
const info = (text) => console.log(`      ${text}`)
const TOTAL = 5

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...opts,
  })
}

function portOpen(port, host = '127.0.0.1', timeout = 1000) {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    const done = (r) => {
      socket.destroy()
      resolve(r)
    }
    socket.setTimeout(timeout)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
    socket.connect(port, host)
  })
}

function fail(message) {
  console.error(`\n${message}\n`)
  process.exit(1)
}

async function main() {
  console.log('Osool — setup')
  console.log('═'.repeat(62))

  // ── 1. Node ──────────────────────────────────────────────────────────────
  step(1, TOTAL, 'Checking Node')
  const [major, minor] = process.versions.node.split('.').map(Number)
  if (major < 22 || (major === 22 && minor < 12)) {
    fail(
      `Node ${process.versions.node} is too old. This project needs 22.12 or later.\n` +
        'Install it from https://nodejs.org and run this again.',
    )
  }
  info(`Node ${process.versions.node} — fine.`)

  // ── 2. .env ──────────────────────────────────────────────────────────────
  step(2, TOTAL, 'Preparing .env')
  const envPath = join(ROOT, '.env')
  const examplePath = join(ROOT, '.env.example')

  if (!existsSync(envPath)) {
    copyFileSync(examplePath, envPath)
    info('Created .env from .env.example.')
  } else {
    info('.env already exists — leaving it alone.')
  }

  // Replace the placeholder secrets with real ones. Never touch a value the
  // developer has already set.
  let envText = readFileSync(envPath, 'utf8')
  const placeholder = 'replace-me-with-a-generated-32-byte-secret'
  let generated = 0
  while (envText.includes(placeholder)) {
    envText = envText.replace(placeholder, randomBytes(32).toString('base64url'))
    generated++
  }
  if (generated > 0) {
    writeFileSync(envPath, envText)
    info(`Generated ${generated} secret(s). .env is gitignored and never committed.`)
  } else {
    info('Secrets already set.')
  }

  // ── 3. Database ──────────────────────────────────────────────────────────
  step(3, TOTAL, 'Starting PostgreSQL')

  const already = await portOpen(5433)
  if (already) {
    info('Something is already listening on 127.0.0.1:5433 — using it.')
  } else {
    const dockerProbe = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
    })
    const hasDocker = dockerProbe.status === 0 && Boolean(dockerProbe.stdout?.trim())

    if (hasDocker) {
      info('Docker found — starting the container from docker-compose.yml.')
      const up = run('docker', ['compose', 'up', '-d'])
      if (up.status !== 0) fail('docker compose up failed. Is Docker Desktop running?')
      for (let i = 0; i < 60; i++) {
        if (await portOpen(5433)) break
        await new Promise((r) => setTimeout(r, 500))
      }
    } else {
      info('Docker is not installed. Starting the bundled PostgreSQL in the background instead.')
      info('(No Docker and no system install needed — npm already downloaded it.)')
      const child = spawn(process.execPath, [join(ROOT, 'scripts', 'db.mjs'), 'start'], {
        cwd: ROOT,
        detached: true,
        stdio: 'ignore',
      })
      child.unref()
      for (let i = 0; i < 90; i++) {
        if (await portOpen(5433)) break
        await new Promise((r) => setTimeout(r, 500))
      }
    }
  }

  if (!(await portOpen(5433))) {
    fail(
      'PostgreSQL did not come up on 127.0.0.1:5433.\n' +
        'Try starting it on its own to see the error:\n\n  npm run db:start\n',
    )
  }
  info('PostgreSQL is accepting connections on 127.0.0.1:5433.')

  // ── 4. Schema and seed ───────────────────────────────────────────────────
  step(4, TOTAL, 'Creating the schema and seeding the rule sets')
  info('This applies the migrations, which also install the database guardrails')
  info('that make DELETE and TRUNCATE impossible on every table of record.')

  if (run('npx', ['prisma', 'migrate', 'deploy']).status !== 0) {
    fail('The migrations did not apply. The error is above.')
  }
  if (run('npx', ['prisma', 'generate']).status !== 0) {
    fail('Prisma client generation failed. The error is above.')
  }
  if (run('npm', ['run', 'db:seed']).status !== 0) {
    fail('Seeding failed. The error is above.')
  }

  // ── 5. Chromium for PDFs ─────────────────────────────────────────────────
  step(5, TOTAL, 'Installing Chromium, used to render Arabic PDFs')
  info('Registration cards and statutory letters are rendered by Chromium, because')
  info('its text engine shapes Arabic correctly. This is a one-time download.')
  const chromium = run('npx', ['playwright', 'install', 'chromium'])
  if (chromium.status !== 0) {
    info('Chromium install failed. Everything except PDF generation will still work.')
    info('Retry later with: npx playwright install chromium')
  }

  console.log(`\n${'═'.repeat(62)}`)
  console.log('Setup finished.\n')
  console.log('Next:')
  console.log('  1. Start the app:            npm run dev')
  console.log('  2. Create the first admin:   npm run admin:create -- --email you@example.com --name "Your Name"')
  console.log('     The activation link is printed in the terminal running the app.')
  console.log('  3. Open:                     http://localhost:3000\n')
  console.log('To see the whole thing proved end to end, with the app running:')
  console.log('  npm run proof:phase0\n')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
