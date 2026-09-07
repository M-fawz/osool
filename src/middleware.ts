import { NextRequest, NextResponse } from 'next/server'
import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

/**
 * Locale negotiation, and the Content Security Policy.
 *
 * This file has to live under `src/`, not at the repository root. Next looks for
 * middleware beside the `app` directory, so with `src/app` present a root-level
 * `middleware.ts` is silently ignored — and the symptom is subtle: `/ar` and
 * `/en` keep working, while the unprefixed Arabic routes that are supposed to be
 * the canonical ones 404.
 *
 * ── Why the CSP moved here ───────────────────────────────────────────────
 *
 * It was a static header in `next.config.ts`, and in production it read
 * `script-src 'self'` with a comment explaining that `'unsafe-inline'` was
 * needed in development only because "`next dev` injects inline bootstrapping
 * and the React refresh runtime; the production bundle does not".
 *
 * That premise is wrong. The App Router's production output is full of inline
 * scripts — the `self.__next_f.push(...)` calls that carry the React Server
 * Component payload, and the ones that move streamed Suspense content out of
 * the hidden templates it is first written into. Blocking them does not
 * degrade the page; it stops it existing. Every route rendered a blank screen
 * in every browser, while the server was answering 200 with correct HTML the
 * whole time.
 *
 * That combination is exactly why it survived so long: development was fine,
 * the HTTP harness that signs in as ten roles and probes fourteen routes was
 * fine, and both were fine because neither one is a browser. It was found by
 * opening the production build in Playwright and reading the console.
 *
 * ── The fix, and why it is a nonce rather than `'unsafe-inline'` ─────────
 *
 * Adding `'unsafe-inline'` to `script-src` would take one line and would give
 * up the control that makes the header worth sending: with it, an injected
 * `<script>` executes. A per-request nonce lets Next's own scripts run and
 * nothing else. Next.js looks for a nonce in the `Content-Security-Policy`
 * header **on the request** and stamps it onto every script tag it emits, so
 * the policy is set on the request as well as the response.
 *
 * The cost is that a page carrying a nonce cannot be statically cached — the
 * nonce has to differ per request or it is not a nonce. Nearly every page in
 * this product already renders dynamically because it reads a session, so what
 * this actually changes is the handful of public screens.
 */

const handleI18n = createMiddleware(routing)

/**
 * A fresh nonce per request.
 *
 * `crypto.randomUUID` rather than a counter or a timestamp: the value has to be
 * unguessable, because anyone who can predict it can write a script tag that
 * the policy will then admit.
 */
function makeNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString('base64')
}

/**
 * `next dev` evaluates strings as JavaScript — React Refresh and the hot-reload
 * client both do it — so development needs `'unsafe-eval'` and production must
 * not have it.
 *
 * Keyed on NODE_ENV, which is safe here in a way it is not for HSTS: `next dev`
 * is the only thing that sets it to development, and every build — including
 * one a developer runs before `npm start` — sets production. So the looser
 * policy cannot be baked into a production bundle. Getting it wrong makes
 * development inconvenient, not a deployment insecure.
 *
 * This was dropped when the policy moved out of `next.config.ts`, and the
 * symptom was narrow but real: the page rendered, and the console carried
 * "Evaluating a string as JavaScript violates the following Content Security
 * Policy directive" on every load while hot reload quietly stopped working.
 */
const DEV_SCRIPT_SOURCES = process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''

function policy(nonce: string): string {
  return [
    "default-src 'self'",
    /*
     * `'strict-dynamic'` is what makes this workable. Next's bootstrap script
     * carries the nonce and then loads the rest of the bundle itself; without
     * `'strict-dynamic'` every chunk it injects would need its own nonce,
     * which nothing can arrange. With it, the trust flows from the nonced
     * script to what that script loads, and `'self'` remains as the fallback
     * for browsers too old to understand it.
     */
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${DEV_SCRIPT_SOURCES}`,
    // Styles keep `'unsafe-inline'`: Next and Tailwind emit inline styles for
    // streamed segments and there is no nonce path for them in the App Router
    // today. It is the one concession, and it is on styles rather than
    // scripts, which is the difference between a defacement and a takeover.
    "style-src 'self' 'unsafe-inline'",
    // `data:` and `blob:` because the upload screens preview a chosen scan
    // before it is sent, and a phone camera capture arrives as a blob URL.
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'none'",
    'upgrade-insecure-requests',
  ].join('; ')
}

export default function middleware(request: NextRequest): NextResponse {
  const nonce = makeNonce()
  const csp = policy(nonce)

  /*
   * On the request, so Next can find the nonce and put it on its own scripts,
   * and on the response, so the browser enforces the same policy. Both are
   * required and they must carry the same nonce.
   */
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('content-security-policy', csp)

  /*
   * next-intl decides the locale and may rewrite or redirect. Its answer is
   * taken as given and the headers are threaded through it rather than around
   * it: a redirect must not be turned into a `next()`, or the unprefixed
   * Arabic routes stop resolving.
   *
   * `NextResponse.next({ request })` is the only way to make modified request
   * headers visible to the route that eventually renders, so the plain
   * pass-through case is rebuilt that way, and the rewrite case is reissued
   * with the same headers. A redirect renders nothing, so it only needs the
   * response header.
   */
  const response = handleI18n(
    new NextRequest(request.url, {
      headers: requestHeaders,
      method: request.method,
      // A middleware request has no body to forward.
    } as ConstructorParameters<typeof NextRequest>[1]),
  )

  const rewritten = response.headers.get('x-middleware-rewrite')
  const redirected = response.headers.get('location')

  let out: NextResponse
  if (redirected) {
    out = response
  } else if (rewritten) {
    out = NextResponse.rewrite(new URL(rewritten), { request: { headers: requestHeaders } })
    // Keep whatever next-intl set — the locale cookie, chiefly.
    response.headers.forEach((value, key) => {
      if (key !== 'x-middleware-rewrite') out.headers.set(key, value)
    })
    for (const cookie of response.cookies.getAll()) out.cookies.set(cookie)
  } else {
    out = NextResponse.next({ request: { headers: requestHeaders } })
    response.headers.forEach((value, key) => out.headers.set(key, value))
    for (const cookie of response.cookies.getAll()) out.cookies.set(cookie)
  }

  out.headers.set('content-security-policy', csp)
  return out
}

export const config = {
  /*
   * Everything except API routes, Next internals, and any path containing a
   * dot — which is how static files are distinguished from pages.
   *
   * The `\\.` matters: written as a single backslash in a JavaScript string it
   * collapses to a bare `.`, the lookahead becomes "any path of one character
   * or more", and the middleware then excludes virtually every route it was
   * meant to handle.
   */
  matcher: ['/((?!api|_next|_vercel|fonts|logo|.*\\..*).*)'],
}
