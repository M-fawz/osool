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

const schema = z.object({
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL connection URL.'),

  APP_URL: z.string().url().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  BETTER_AUTH_SECRET: z
    .string()
    .min(32, 'BETTER_AUTH_SECRET must be at least 32 characters.')
    .refine((v) => v !== PLACEHOLDER, {
      message:
        'BETTER_AUTH_SECRET is still the placeholder from .env.example. Generate one: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64url\'))"',
    }),
  BETTER_AUTH_URL: z.string().url().default('http://localhost:3000'),

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

  PII_ENCRYPTION_KEY: z
    .string()
    .min(32, 'PII_ENCRYPTION_KEY must be at least 32 characters.')
    .refine((v) => v !== PLACEHOLDER, {
      message: 'PII_ENCRYPTION_KEY is still the placeholder from .env.example. Generate one.',
    }),

  DEFAULT_LOCALE: z.enum(['ar', 'en']).default('ar'),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  · ${i.path.join('.')}: ${i.message}`).join('\n')
  throw new Error(
    `Environment configuration is not valid:\n${issues}\n\n` +
      'Copy .env.example to .env and fill it in. See README.md.',
  )
}

export const env = parsed.data

// Production refuses the developer conveniences outright. Emails that only
// reach a console, and uploads that only reach a local disk, are correct in
// development and unacceptable in a live register.
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
      'STORAGE_DRIVER=local in production: uploaded documents would not survive a redeploy.',
    )
  }
  if (productionFaults.length) {
    throw new Error(`Refusing to start in production:\n${productionFaults.map((f) => `  · ${f}`).join('\n')}`)
  }
}

export const isDev = env.NODE_ENV === 'development'
