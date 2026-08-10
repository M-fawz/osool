#!/usr/bin/env node
/**
 * Local development database control.
 *
 *   npm run db:start    start PostgreSQL
 *   npm run db:stop     stop it
 *   npm run db:status   is it up, and what is in it
 *
 * Two paths, chosen automatically:
 *
 *   1. Docker  — the documented path. `docker compose up -d` against
 *                docker-compose.yml. Used whenever Docker is installed and its
 *                daemon is running.
 *   2. Embedded — a self-contained PostgreSQL that npm already downloaded as a
 *                dependency. No Docker, no admin rights, no system install. The
 *                data directory lives in ./.postgres and is gitignored.
 *
 * Both listen on 127.0.0.1:5433 with identical credentials, so DATABASE_URL is
 * the same either way and nothing downstream can tell the difference.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import net from 'node:net'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const DATA_DIR = join(ROOT, '.postgres')
const PID_FILE = join(DATA_DIR, 'osool-embedded.pid')

export const DB = {
  host: '127.0.0.1',
  port: 5433,
  user: 'osool',
  password: 'osool_dev_password',
  database: 'osool',
}

const command = process.argv[2] ?? 'status'

// ── helpers ─────────────────────────────────────────────────────────────────

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', shell: process.platform === 'win32', ...opts })
}

function dockerAvailable() {
  const probe = run('docker', ['info', '--format', '{{.ServerVersion}}'])
  return probe.status === 0 && Boolean(probe.stdout?.trim())
}

function portOpen(port = DB.port, host = DB.host, timeout = 1000) {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    const done = (result) => {
      socket.destroy()
      resolve(result)
    }
    socket.setTimeout(timeout)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
    socket.connect(port, host)
  })
}

async function waitForPort(open, label, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    if ((await portOpen()) === open) return true
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`Timed out waiting for the database to ${label}.`)
}

async function embedded() {
  const { default: EmbeddedPostgres } = await import('embedded-postgres')
  return new EmbeddedPostgres({
    databaseDir: join(DATA_DIR, 'data'),
    user: DB.user,
    password: DB.password,
    port: DB.port,
    persistent: true,
    // UTF8 is not optional and not a default worth trusting. On Windows,
    // initdb otherwise derives the encoding from the system locale and lands on
    // WIN1252, which cannot represent a single Arabic character. This register
    // is Arabic-first; a WIN1252 cluster would fail on the first trade name.
    // C.UTF-8 collation keeps sorting deterministic across machines — Arabic
    // name ordering is handled in the query layer, not by the OS locale.
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
  })
}

// ── commands ────────────────────────────────────────────────────────────────

async function start() {
  if (await portOpen()) {
    console.log(`PostgreSQL is already listening on ${DB.host}:${DB.port}.`)
    return
  }

  if (dockerAvailable()) {
    console.log('Docker detected — starting PostgreSQL via docker compose.')
    const up = run('docker', ['compose', 'up', '-d'], { cwd: ROOT, stdio: 'inherit' })
    if (up.status !== 0) throw new Error('docker compose up failed.')
    await waitForPort(true, 'accept connections')
    console.log(`PostgreSQL is up on ${DB.host}:${DB.port} (Docker).`)
    return
  }

  console.log('Docker is not available — starting the embedded PostgreSQL instead.')
  mkdirSync(DATA_DIR, { recursive: true })

  const pg = await embedded()
  const firstRun = !existsSync(join(DATA_DIR, 'data', 'PG_VERSION'))

  if (firstRun) {
    console.log('Initialising the data directory (first run only, this takes a moment)...')
    await pg.initialise()
  }

  await pg.start()

  if (firstRun) {
    await pg.createDatabase(DB.database)
    console.log(`Created database "${DB.database}".`)
  }

  writeFileSync(PID_FILE, String(process.pid), 'utf8')
  console.log(`PostgreSQL is up on ${DB.host}:${DB.port} (embedded).`)
  console.log('This process stays in the foreground. Leave it running; Ctrl+C stops the database.')

  const shutdown = async () => {
    console.log('\nStopping PostgreSQL...')
    try {
      await pg.stop()
    } catch {
      /* already gone */
    }
    rmSync(PID_FILE, { force: true })
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  // Hold the process open so the server keeps running.
  await new Promise(() => {})
}

async function stop() {
  if (dockerAvailable()) {
    const ps = run('docker', ['compose', 'ps', '-q', 'postgres'], { cwd: ROOT })
    if (ps.stdout?.trim()) {
      run('docker', ['compose', 'down'], { cwd: ROOT, stdio: 'inherit' })
      console.log('PostgreSQL stopped (Docker).')
      return
    }
  }

  if (existsSync(PID_FILE)) {
    const pid = Number(readFileSync(PID_FILE, 'utf8').trim())
    try {
      process.kill(pid, 'SIGTERM')
      console.log(`Signalled the embedded PostgreSQL process (pid ${pid}) to stop.`)
    } catch {
      console.log('The embedded PostgreSQL process is no longer running.')
      rmSync(PID_FILE, { force: true })
    }
    return
  }

  console.log('No database managed by this script appears to be running.')
}

async function status() {
  const up = await portOpen()
  const mode = dockerAvailable() ? 'Docker available' : 'Docker not installed — embedded path'
  console.log(`Endpoint : ${DB.host}:${DB.port}`)
  console.log(`Listening: ${up ? 'yes' : 'no'}`)
  console.log(`Mode     : ${mode}`)
  if (!up) {
    console.log('\nStart it with:  npm run db:start')
    process.exitCode = 1
  }
}

const commands = { start, stop, status }

if (!commands[command]) {
  console.error(`Unknown command "${command}". Use one of: ${Object.keys(commands).join(', ')}`)
  process.exit(1)
}

commands[command]().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
