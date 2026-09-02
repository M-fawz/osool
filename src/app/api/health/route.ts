import { db } from '@/lib/db'
import { deployment, env } from '@/lib/env'
import { log, requestIdFrom } from '@/lib/observability/logger'
import { storage } from '@/lib/storage'

/**
 * Is this deployment actually working?
 *
 * Not "is the process running" — a Next.js process answers 200 on a static
 * route with no database at all, which is exactly how the production
 * deployment could sit there looking healthy while its Supabase project no
 * longer existed and `/verify` returned 500 to every citizen who tried it.
 *
 * So this checks the dependencies a request actually needs, and reports each
 * one separately. A monitor pointed at `/` learns nothing; a monitor pointed
 * here learns which piece is down.
 *
 * ── What it deliberately does not say ────────────────────────────────────
 *
 * The endpoint is unauthenticated, because a health check that needs a session
 * is useless to the thing that watches for the session service being down. That
 * makes its response a public document, so it carries no hostname, no
 * connection string, no key, no version of anything, and no count of any
 * record. It answers "does this work", never "what is this".
 *
 * The `?deep` form additionally reads one row and one object, which costs a
 * round trip to each dependency; the plain form only opens a connection. Point
 * a frequent monitor at the plain form and a slower one at the deep form.
 */

export const dynamic = 'force-dynamic'

interface Check {
  name: string
  ok: boolean
  ms: number
  detail?: string
}

async function check(name: string, run: () => Promise<void>): Promise<Check> {
  const started = Date.now()
  try {
    await run()
    return { name, ok: true, ms: Date.now() - started }
  } catch (error) {
    return {
      name,
      ok: false,
      ms: Date.now() - started,
      // The class of failure, not the connection string. "connect ECONNREFUSED"
      // is what an operator needs; the host and port it was refused from are
      // not theirs to have from an unauthenticated endpoint.
      detail: (error as Error).message.split('\n')[0]?.slice(0, 120),
    }
  }
}

export async function GET(request: Request): Promise<Response> {
  const deep = new URL(request.url).searchParams.has('deep')
  const requestId = requestIdFrom(request)
  const started = Date.now()

  const checks: Check[] = []

  checks.push(
    await check('database', async () => {
      await db.$queryRaw`SELECT 1`
    }),
  )

  // The register cannot take a decision it cannot record. A reachable database
  // whose migrations have not run is a different failure from an unreachable
  // one, and the difference matters at three in the morning.
  if (deep) {
    checks.push(
      await check('schema', async () => {
        const transitions = await db.applicationTransition.count()
        if (transitions === 0) throw new Error('the transition table is empty')
      }),
    )

    checks.push(
      await check('storage', async () => {
        // A HEAD on a key that will not exist. It proves the driver can talk to
        // the bucket and is authorised, without writing anything.
        await storage().head('documents/health/probe')
      }),
    )
  }

  const ok = checks.every((c) => c.ok)
  const durationMs = Date.now() - started

  log[ok ? 'info' : 'error']({
    event: 'health.checked',
    requestId,
    outcome: ok ? 'ok' : 'failed',
    durationMs,
    failing: checks.filter((c) => !c.ok).map((c) => c.name).join(',') || undefined,
  })

  return Response.json(
    {
      status: ok ? 'ok' : 'degraded',
      deployment,
      // Which drivers are configured, not how they are configured. That an
      // operator can tell "this preview is still on the console mailer" from
      // the outside is worth more than the nothing it discloses.
      drivers: { email: env.EMAIL_PROVIDER, storage: env.STORAGE_DRIVER },
      checks,
      durationMs,
      checkedAt: new Date().toISOString(),
    },
    {
      status: ok ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'X-Request-Id': requestId,
      },
    },
  )
}
