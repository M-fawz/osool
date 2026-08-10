import { z } from 'zod'

/**
 * Environment validation.
 *
 * The process refuses to start on a bad configuration rather than failing at
 * the first request that happens to need the missing value. A government
 * deployment that silently ran with a default secret would be worse than one
 * that would not boot.
 */

/**
 * `next build` runs with NODE_ENV=production even when the build is happening
 * on a developer's laptop, so "are we in production?" and "are we compiling a
 * production bundle?" are different questions. Checking the wrong one makes a
 * local build demand a Resend key and an S3 bucket to compile code it is not
 * going to run.
 *
 * The runtime guards below therefore apply when the server is actually
 * serving, not while it is being built.
 */
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build'
const isProduction = process.env.NODE_ENV === 'production' && !isBuildPhase

const PLACEHOLDER = 'replace-me-with-a-generated-32-byte-secret'

/**
 * Which deployment this is — a third question, distinct from the two above.
 *
 * A Vercel *preview* runs with NODE_ENV=production and is not production: it
 * answers on a different hostname, it must never share a database with the
 * live register, and its seeded data is disposable. Anything that has to
 * distinguish "live" from "a branch someone opened" reads this, not NODE_ENV.
 */
export type DeploymentEnvironment = 'development' | 'preview' | 'production'

function readDeployment(): DeploymentEnvironment {
  const vercel = process.env.VERCEL_ENV
  if (vercel === 'production' || vercel === 'preview' || vercel === 'development') return vercel
  return process.env.NODE_ENV === 'production' ? 'production' : 'development'
}

export const deployment: DeploymentEnvironment = readDeployment()

/** A bare hostname from the platform, normalised to an origin. */
function origin(host: string | undefined | null): string | null {
  const trimmed = host?.trim().replace(/\/+$/, '')
  if (!trimmed) return null
  return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`
}

/**
 * The address this deployment answers on, when nobody has said.
 *
 * A hosted deployment knows its own hostname and it changes per deployment, so
 * hard-coding it in a variable is how a preview ends up sending activation
 * links that point at production. These are the platform's own values:
 *
 *   · `VERCEL_PROJECT_PRODUCTION_URL` — the production domain, preferring the
 *     custom domain over the *.vercel.app one, and stable across deployments.
 *   · `VERCEL_BRANCH_URL` — a preview's per-branch address, stable while the
 *     branch lives, which is the one a reviewer is given.
 *   · `VERCEL_URL` — this exact deployment, unique and immutable.
 *
 * An explicit `APP_URL` always wins, because a deployment behind its own
 * domain or reverse proxy knows better than the platform does.
 */
function inferredBaseUrl(): string | null {
  if (deployment === 'production') {
    return origin(process.env.VERCEL_PROJECT_PRODUCTION_URL) ?? origin(process.env.VERCEL_URL)
  }
  return origin(process.env.VERCEL_BRANCH_URL) ?? origin(process.env.VERCEL_URL)
}

const inferredUrl = inferredBaseUrl()
const appUrl = process.env.APP_URL?.trim() || inferredUrl || 'http://localhost:3000'

const schema = z.object({
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL connection URL.'),

  /**
   * A direct, unpooled connection to the same database. Only migrations use it.
   *
   * A transaction-mode pooler (PgBouncer, Supabase's 6543, Neon's `-pooler`
   * host) is what a serverless runtime needs and is exactly what schema
   * migrations cannot run through: DDL and Prisma's advisory lock need one
   * session that stays put. Optional — where it is unset, migrations use
   * `DATABASE_URL`, which is correct for a plain unpooled Postgres.
   */
  DIRECT_DATABASE_URL: z.string().url().optional(),

  APP_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  BETTER_AUTH_SECRET: z
    .string()
    .min(32, 'BETTER_AUTH_SECRET must be at least 32 characters.')
    .refine((v) => v !== PLACEHOLDER, {
      message:
        'BETTER_AUTH_SECRET is still the placeholder from .env.example. Generate one: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64url\'))"',
    }),
  BETTER_AUTH_URL: z.string().url(),

  /**
   * Extra origins the browser may legitimately be on, comma-separated. Needed
   * only for an address the platform does not report — a second custom domain,
   * say. Preview and production addresses are derived, not configured.
   */
  EXTRA_TRUSTED_ORIGINS: z.string().default(''),

  EMAIL_PROVIDER: z.enum(['console', 'resend']).default('console'),
  RESEND_API_KEY: z.string().optional().default(''),
  EMAIL_FROM: z.string().min(3).default('Osool <no-reply@osool.gov.eg>'),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_PATH: z.string().default('./.storage'),
  S3_ENDPOINT: z.string().optional().default(''),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().optional().default(''),
  S3_ACCESS_KEY_ID: z.string().optional().default(''),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(''),

  /**
   * A session token, for providers that issue temporary credentials.
   *
   * On AWS this is what STS hands back with an assumed role. Supabase Storage
   * uses the same field differently: its S3 endpoint accepts the project ref as
   * the key id, the anon key as the secret, and a JWT here — which is how a
   * deployment can be provisioned end to end without a human creating a key
   * pair in a dashboard. Empty everywhere else, and omitted from the client
   * when empty, because passing an empty token is not the same as passing none.
   */
  S3_SESSION_TOKEN: z.string().optional().default(''),

  /**
   * The largest request body the host in front of this process will pass
   * through, in megabytes. A platform ceiling, not a regulatory one — the
   * per-document limits are versioned rule data in DOC_CHECKLIST and are
   * unaffected. See `uploadRequestCeilingMb` below.
   */
  UPLOAD_MAX_REQUEST_MB: z.coerce.number().positive().optional(),

  PII_ENCRYPTION_KEY: z
    .string()
    .min(32, 'PII_ENCRYPTION_KEY must be at least 32 characters.')
    .refine((v) => v !== PLACEHOLDER, {
      message: 'PII_ENCRYPTION_KEY is still the placeholder from .env.example. Generate one.',
    }),

  DEFAULT_LOCALE: z.enum(['ar', 'en']).default('ar'),
})

const parsed = schema.safeParse({
  ...process.env,
  APP_URL: appUrl,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL?.trim() || appUrl,
})

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  · ${i.path.join('.')}: ${i.message}`).join('\n')
  throw new Error(
    `Environment configuration is not valid:\n${issues}\n\n` +
      'Copy .env.example to .env and fill it in. See README.md and docs/DEPLOYMENT.md.',
  )
}

export const env = parsed.data

/** The canonical address of this deployment. Never a literal in application code. */
export const baseUrl = env.APP_URL

/**
 * Every origin a browser talking to this deployment may legitimately be on.
 *
 * On a hosted platform this is not one value. A preview answers on its branch
 * address *and* on its immutable per-deployment address, and a sign-in posted
 * from either is genuine. Listing only one of them produces the least
 * debuggable failure in this whole file: sign-in returning 403 on the preview
 * link a colleague was sent, and working on the link the deploy log printed.
 */
export const trustedOrigins: string[] = Array.from(
  new Set(
    [
      env.APP_URL,
      env.BETTER_AUTH_URL,
      origin(process.env.VERCEL_PROJECT_PRODUCTION_URL),
      origin(process.env.VERCEL_BRANCH_URL),
      origin(process.env.VERCEL_URL),
      ...env.EXTRA_TRUSTED_ORIGINS.split(',').map((o) => origin(o)),
    ].filter((o): o is string => Boolean(o)),
  ),
)

/**
 * The largest upload this deployment can physically receive.
 *
 * Vercel's serverless functions reject a request body over 4.5 MB before any
 * application code runs, so a broker photographing a commercial register on a
 * phone — routinely six megabytes — would get an opaque platform error page
 * instead of the four-part refusal 03-DESIGN-DIRECTION §6 requires. Knowing the
 * ceiling lets the upload step say so in Arabic, before the request leaves the
 * phone. A container deployment has no such ceiling and uses the wider default.
 */
export const uploadRequestCeilingMb =
  env.UPLOAD_MAX_REQUEST_MB ?? (process.env.VERCEL ? 4.5 : 25)

/** The connection migrations run over. See DIRECT_DATABASE_URL above. */
export const migrationDatabaseUrl = env.DIRECT_DATABASE_URL ?? env.DATABASE_URL

export const isDev = env.NODE_ENV === 'development'

// Production refuses the developer conveniences outright. Emails that only
// reach a console, and uploads that only reach a local disk, are correct in
// development and unacceptable in a live register.
//
// A Vercel preview is included deliberately. It runs with NODE_ENV=production
// on a read-only filesystem, so `local` storage there does not degrade — it
// throws on the first upload, later and less legibly than this does.
if (isProduction) {
  const productionFaults: string[] = []
  if (env.EMAIL_PROVIDER === 'console') {
    productionFaults.push(
      'EMAIL_PROVIDER=console in production: activation emails would never reach anyone.',
    )
  }
  if (env.EMAIL_PROVIDER === 'resend' && !env.RESEND_API_KEY) {
    productionFaults.push('EMAIL_PROVIDER=resend but RESEND_API_KEY is empty.')
  }
  if (env.STORAGE_DRIVER === 'local') {
    productionFaults.push(
      'STORAGE_DRIVER=local in production: uploaded documents would not survive a redeploy, ' +
        'and on a serverless host the filesystem is read-only. Set STORAGE_DRIVER=s3.',
    )
  }
  /*
   * A localhost address in a *hosted* deployment means every activation link
   * points at the recipient's own machine. That is worth refusing to start over.
   *
   * It is not worth refusing over on a laptop, where `npm run build && npm start`
   * against localhost is how a developer checks the production bundle before
   * pushing it, and where nothing is going to be emailed to anyone. So the
   * refusal is keyed on being on a host; off a host it is a warning, which is
   * all the situation warrants.
   */
  const hosted = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)
  for (const [name, value] of [
    ['APP_URL', env.APP_URL],
    ['BETTER_AUTH_URL', env.BETTER_AUTH_URL],
  ] as const) {
    if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(value)) continue
    if (hosted) {
      productionFaults.push(`${name} is ${value} in a hosted deployment. It must be the public address.`)
    } else {
      console.warn(
        `[osool] ${name} is ${value} in a production build. Correct for a local check of the ` +
          'production bundle; wrong for anything anyone else will open.',
      )
    }
  }
  if (productionFaults.length) {
    throw new Error(`Refusing to start in production:\n${productionFaults.map((f) => `  · ${f}`).join('\n')}`)
  }
}
