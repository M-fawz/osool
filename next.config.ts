import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // The architecture is host-agnostic on purpose (02-SYSTEM-ARCHITECTURE §10, decision 1):
  // a government deployment may require in-country hosting, so no Vercel-only primitive
  // is used anywhere and the app must build to a plain Node server in a container.
  output: 'standalone',

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
        ],
      },
    ]
  },
}

export default withNextIntl(nextConfig)
