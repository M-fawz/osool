import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

/**
 * Vercel builds this project too, and its builder produces its own output from
 * `.next`. `output: 'standalone'` is for a host that has to run `node
 * server.js` itself; asking for it on Vercel adds a second copy of the traced
 * dependency tree to the build for nobody to run.
 */
const onVercel = Boolean(process.env.VERCEL)

/*
 * Whether this build is `next dev`.
 *
 * Read here rather than at request time because `headers()` runs once, at
 * build/start. `next dev` sets NODE_ENV=development; every build — including
 * the one a developer runs locally before `npm start` — sets production. That
 * is exactly the asymmetry the HSTS note below warns about.
 */

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // The architecture is host-agnostic on purpose (02-SYSTEM-ARCHITECTURE §10,
  // decision 1): a government deployment may require in-country hosting, so no
  // Vercel-only primitive is used anywhere and the app must still build to a
  // plain Node server in a container. That is what this line preserves — the
  // container build is unchanged, and Vercel simply does not need it.
  ...(onVercel ? {} : { output: 'standalone' as const }),

  // Version and framework belong in the deployment record, not in a response
  // header on every request.
  poweredByHeader: false,

  /**
   * Chromium renders the Arabic on registration cards (see src/lib/pdf/render.ts).
   * Neither the browser nor its launcher can be bundled: they resolve real
   * binaries out of node_modules at runtime, and a bundler that rewrites those
   * paths produces "Executable doesn't exist" at the moment a card is issued.
   */
  serverExternalPackages: ['playwright', 'playwright-core', '@sparticuz/chromium'],

  /**
   * …and the browser itself has to be carried with the function that launches
   * it, along with the fonts it has to shape Arabic with.
   *
   * Dependency tracing follows `import`s, and neither of these is imported.
   *
   *   · `@sparticuz/chromium` does not import its Chromium: the browser is a
   *     64 MB brotli archive in the package's `bin/` directory that the library
   *     reads at runtime and unpacks into `/tmp`.
   *   · The typefaces are read off disk by `fontCss()` in src/lib/pdf/render.ts
   *     and inlined as data URIs, so the tracer sees a `readFile` of a path it
   *     has no reason to believe is a dependency.
   *
   * The tracer cannot see a file that nothing imports, so without both entries
   * the deployment contains the launcher and not the browser, or the browser
   * and not the fonts — and either way the failure waits until the first
   * registration card, the one flow a smoke test does not reach. The font case
   * fails as `ENOENT … public/fonts/plex-arabic-400-arabic.woff2` at the moment
   * an issuer clicks Issue, which is both the worst moment to discover it and
   * the least obvious message to discover it from.
   *
   * Both routes, because `src/components/gov/issuance-forms.tsx` registers
   * `issueCardAction` on each of them. Every other function stays small.
   */
  outputFileTracingIncludes: {
    '/[locale]/issuance/[id]': [
      './node_modules/@sparticuz/chromium/bin/**',
      './public/fonts/**',
    ],
    '/[locale]/applications/[id]': [
      './node_modules/@sparticuz/chromium/bin/**',
      './public/fonts/**',
    ],
  },

  eslint: {
    // Lint is run as its own step, not folded into the production build.
    ignoreDuringBuilds: true,
  },

  // Security headers. The full review against 02-SYSTEM-ARCHITECTURE §4/§10 lands in
  // Phase 5; these are the baseline that should never have been absent.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            // The broker portal needs the camera: document capture happens on a phone.
            value: 'camera=(self), microphone=(), geolocation=()',
          },
          /*
           * HSTS, only where TLS is guaranteed.
           *
           * The condition is the host and deliberately not NODE_ENV: this
           * function runs during `next build`, where NODE_ENV is *always*
           * production — including the build a developer runs before
           * `npm start`. Keyed on NODE_ENV this header would be baked into
           * that build and pin `localhost` to https in the developer's browser
           * for two years, which is a browser-profile-level mess to undo.
           *
           * Vercel terminates TLS on every deployment, so there it is safe. A
           * container deployment sits behind a reverse proxy that owns TLS;
           * HSTS belongs on that proxy, where the operator can see the
           * certificate it is making a two-year promise about.
           */
          ...(onVercel
            ? [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=63072000; includeSubDomains; preload',
                },
              ]
            : []),

          /*
           * Content Security Policy — set in src/middleware.ts, not here.
           *
           * It used to be a static header on this block, and in production it
           * read `script-src 'self'` on the reasoning that only `next dev`
           * emits inline scripts. The App Router's production output emits a
           * great many — the `self.__next_f.push(...)` calls carrying the RSC
           * payload, and the ones that move streamed content out of the hidden
           * templates it is first written into. The policy blocked all of them,
           * and every page in the product rendered blank in every browser while
           * the server answered 200 with correct HTML.
           *
           * A static header cannot carry a nonce, and a nonce is what lets
           * Next's own scripts run without also admitting an injected one. So
           * the policy is built per request in the middleware, which is the
           * only place that can generate one.
           *
           * This block keeps the headers that are genuinely static. The API
           * routes, which the middleware matcher deliberately excludes, get
           * their own policy below — they return JSON and need nothing at all.
           */
        ],
      },
      {
        // JSON, and nothing else. An API response has no scripts, no styles
        // and no images of its own, so the policy that fits it is the empty
        // one — and if a route ever starts returning HTML, this is what makes
        // that visible immediately rather than quietly.
        source: '/api/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
          },
        ],
      },
    ]
  },
}

export default withNextIntl(nextConfig)
