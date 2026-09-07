import { timingSafeEqual } from 'node:crypto'
import { sweepLifecycle } from '@/lib/registry/lifecycle'
import { sweepSignals } from '@/lib/signals'
import { sweepAppointmentReminders } from '@/lib/notifications/reminders'
import { verifyChainSince } from '@/lib/audit'
import { log, requestIdFrom } from '@/lib/observability/logger'

/**
 * The scheduled sweeps, over HTTP.
 *
 * Three things in this product happen because time passed rather than because
 * somebody clicked: a registration reaches its expiry, an appointment comes
 * round tomorrow, and a detector notices a shape in the data. None has an actor
 * and none can be driven from a screen, so something has to call them — and
 * until now nothing did. `vercel.json` carried no `crons` key, which meant
 * every time-based obligation in the register was dormant on the deployment.
 *
 * ── Why this route is thin ───────────────────────────────────────────────
 *
 * 02-SYSTEM-ARCHITECTURE §10 decision 1: "Build host-agnostic … Do not adopt
 * Vercel-only primitives." So no sweep logic lives here. Each one is a library
 * function that `scripts/sweep.ts` also calls, and this route is one of two
 * entry points to the same code. Moving off Vercel costs this file and nothing
 * else; a cron, a systemd timer or a Kubernetes CronJob can keep running the
 * command instead.
 *
 * ── Why it is authenticated by a shared secret ───────────────────────────
 *
 * The caller is a scheduler, not a person, so there is no session to require.
 * `CRON_SECRET` is the platform's own convention: Vercel sends it as a bearer
 * token on scheduled invocations. Compared in constant time, because a token
 * compared with `===` leaks its prefix to anyone willing to time the responses.
 *
 * With no secret configured the route refuses everything rather than running
 * openly. An unauthenticated endpoint that writes registration lifecycle
 * transitions would let anyone on the internet advance the register's clock.
 */

export const dynamic = 'force-dynamic'
/** Long enough for a full signal sweep on a large register. */
export const maxDuration = 300

const SWEEPS = ['lifecycle', 'signals', 'reminders', 'audit-since'] as const
type Sweep = (typeof SWEEPS)[number]

function authorised(request: Request): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false

  const header = request.headers.get('authorization') ?? ''
  const offered = header.startsWith('Bearer ') ? header.slice(7) : header

  const a = Buffer.from(offered)
  const b = Buffer.from(expected)
  // `timingSafeEqual` throws on a length mismatch, which would itself be a
  // disclosure; the length check is done first and the comparison still runs.
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function GET(request: Request): Promise<Response> {
  const requestId = requestIdFrom(request)

  if (!authorised(request)) {
    log.warn({ event: 'cron.refused', requestId, outcome: 'refused' })
    return Response.json({ error: 'unauthorised' }, { status: 401 })
  }

  const url = new URL(request.url)
  const dry = url.searchParams.has('dry')
  const requested = url.searchParams.getAll('only').filter((s): s is Sweep =>
    (SWEEPS as readonly string[]).includes(s),
  )
  const wanted = (name: Sweep) => requested.length === 0 || requested.includes(name)

  const started = Date.now()
  const results: Record<string, unknown> = {}
  const failed: string[] = []

  /**
   * One failing sweep must not stop the others.
   *
   * They are independent obligations. A signal detector that throws on one
   * malformed row should not be the reason nobody is reminded of tomorrow's
   * appointment, and the response has to say which of the four failed rather
   * than only that something did.
   */
  async function run<T>(name: Sweep, fn: () => Promise<T>): Promise<void> {
    if (!wanted(name)) return
    const at = Date.now()
    try {
      results[name] = { ok: true, ms: Date.now() - at, ...(await fn()) }
    } catch (error) {
      failed.push(name)
      results[name] = { ok: false, ms: Date.now() - at, error: (error as Error).message }
    }
  }

  await run('lifecycle', async () =>
    dry ? { skipped: 'dry' } : { ...(await sweepLifecycle()) },
  )
  await run('signals', async () => (dry ? { skipped: 'dry' } : { ...(await sweepSignals()) }))
  await run('reminders', async () => sweepAppointmentReminders({ dry }))
  await run('audit-since', async () => {
    const result = await verifyChainSince({ writeCheckpoint: !dry })
    // A broken chain is the one result that must not be reported as a success
    // with a flag buried in the body — it is why this endpoint is monitored.
    if (!result.ok) throw new Error(`the audit chain did not verify: ${result.breaks.length} break(s)`)
    return { eventsChecked: result.eventsChecked, scope: result.scope }
  })

  const ok = failed.length === 0
  const durationMs = Date.now() - started

  log[ok ? 'info' : 'error']({
    event: 'cron.swept',
    requestId,
    outcome: ok ? 'ok' : 'failed',
    durationMs,
    failing: failed.join(',') || undefined,
  })

  return Response.json(
    { status: ok ? 'ok' : 'degraded', dry, durationMs, sweeps: results },
    { status: ok ? 200 : 500, headers: { 'Cache-Control': 'no-store' } },
  )
}
