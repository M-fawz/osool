import { toNextJsHandler } from 'better-auth/next-js'
import { auth } from '@/lib/auth'
import { callerAddress, consume, tooManyRequests, type RateLimitScope } from '@/lib/security/rate-limit'

/**
 * Better Auth's HTTP surface: sign-in, sign-out, email verification, password
 * reset, and the activation link's token exchange.
 *
 * This is a Route Handler rather than a Server Action because these are
 * genuinely HTTP concerns — links arrive from an email client, not from the
 * application — which is the distinction 02-SYSTEM-ARCHITECTURE §2 draws.
 *
 * Note that sign-*up* through this handler can only ever produce a broker
 * account: `role` is `input: false` in the Better Auth configuration, so a
 * request body cannot carry one, and the User model defaults to the
 * least-privileged role. Government accounts are provisioned server-side.
 *
 * ── The rate limit, and why it is here rather than in middleware ─────────
 *
 * These are the only unauthenticated write endpoints in the product. Without a
 * limit, the sign-in path is an unmetered password oracle and the reset path is
 * an unmetered way to send mail to any address someone cares to name.
 *
 * The limit sits in front of the handler rather than in `middleware.ts` because
 * middleware runs on the Edge runtime, where there is no database connection —
 * and a counter that is not shared between instances is not a counter. See
 * src/lib/security/rate-limit.ts.
 */

const handler = toNextJsHandler(auth)

/** Which budget a path draws on. Anything unlisted is not limited. */
function scopeFor(pathname: string): RateLimitScope | null {
  if (pathname.includes('/sign-in')) return 'sign-in'
  if (pathname.includes('/sign-up')) return 'sign-up'
  if (pathname.includes('/forget-password') || pathname.includes('/reset-password')) {
    return 'password-reset'
  }
  return null
}

export const GET = handler.GET

export async function POST(request: Request): Promise<Response> {
  const scope = scopeFor(new URL(request.url).pathname)

  if (!scope) return handler.POST(request)

  const result = await consume(scope, callerAddress(request))
  if (!result.allowed) return tooManyRequests(result, scope)

  /*
   * Sign-in is counted twice: once per network, once per account.
   *
   * The reasoning is in RATE_LIMITS. The address budget is office-sized and
   * stops a flood; the account budget is small and is what actually stops a
   * password being guessed, however many addresses the guessing comes from.
   *
   * The address is checked first, deliberately. Reading the body to find the
   * email costs a clone of the request, and a flood should be turned away
   * before that work is done.
   */
  if (scope === 'sign-in') {
    const email = await emailFromBody(request)
    if (email) {
      const perAccount = await consume('sign-in-account', email)
      if (!perAccount.allowed) return tooManyRequests(perAccount, 'sign-in-account')
    }
  }

  return handler.POST(request)
}

/**
 * The address being signed in to, if the body names one.
 *
 * Reads a clone, so the original stream is still intact for Better Auth. A
 * malformed body is not this function's problem — it returns null and the
 * handler produces its own error, which is a better message than anything a
 * rate limiter could invent.
 */
async function emailFromBody(request: Request): Promise<string | null> {
  try {
    const body = (await request.clone().json()) as { email?: unknown }
    return typeof body.email === 'string' && body.email.length > 0 ? body.email : null
  } catch {
    return null
  }
}
