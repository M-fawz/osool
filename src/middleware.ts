import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

/**
 * Locale negotiation.
 *
 * This file has to live under `src/`, not at the repository root. Next looks for
 * middleware beside the `app` directory, so with `src/app` present a root-level
 * `middleware.ts` is silently ignored — and the symptom is subtle: `/ar` and
 * `/en` keep working, while the unprefixed Arabic routes that are supposed to be
 * the canonical ones 404.
 */
export default createMiddleware(routing)

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
