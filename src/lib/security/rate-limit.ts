import { createHmac } from 'node:crypto'
import { db } from '@/lib/db'
import { env } from '@/lib/env'

/**
 * Rate limiting, in the database.
 *
 * The obvious implementation is a `Map` in module scope. On this deployment
 * target that is not a rate limit at all: Vercel runs however many function
 * instances it likes, each with its own module scope, so a limit of five
 * attempts becomes five attempts *per instance* and an attacker gets as many
 * multiples of it as the platform feels like giving them. Worse, it looks
 * right in development, where there is exactly one process.
 *
 * So the counter lives in one row per caller per protected route, and every
 * instance increments the same row.
 *
 * ── Why the identifier is hashed ─────────────────────────────────────────
 *
 * The natural key is an IP address, or an email address for the credential
 * routes. Storing either in the clear would turn this table into a log of who
 * tried to sign in and from where — a new category of personal data, created as
 * a side effect of a security control, with no retention rule and no purpose
 * under Law 151. A keyed hash gives the same counting behaviour and holds
 * nothing readable: it answers "has *this* caller been here before" and cannot
 * answer "who has been here".
 *
 * ── Why nothing is ever deleted ──────────────────────────────────────────
 *
 * CLAUDE.md rule 2 admits no exceptions, so a window that has expired is not
 * dropped — it is reset in place. The table is bounded by the number of
 * distinct callers ever seen rather than by traffic, and it needs no sweeper.
 */

export interface RateLimitRule {
  /** How many attempts are allowed inside one window. */
  limit: number
  /** The window, in seconds. */
  windowSeconds: number
}

/**
 * The protected routes and their budgets.
 *
 * Set from what a real person plausibly does, not from what feels strict. A
 * clerk who mistypes a password four times in a minute is ordinary; forty
 * attempts in a minute is not a person. The verification page is public and
 * legitimately hit by banks and notaries checking several brokers at once, so
 * its budget is much wider — the thing being defended there is enumeration of
 * the whole register, not a single lookup.
 */
export const RATE_LIMITS = {
  /*
   * Two budgets on sign-in, not one, and the pair is the whole design.
   *
   * A single per-address budget cannot be set correctly. Tight enough to stop
   * someone guessing one broker's password, and it locks out a GOEIC office
   * where twenty clerks arrive at eight o'clock behind one NAT address —
   * turning a control meant to protect the register into a denial of service
   * against the people running it. Loose enough for the office, and it is no
   * longer a meaningful brute-force defence.
   *
   * So: the address gets an office-sized budget, which stops a flood; and each
   * *account* gets a small one, which is what actually stops a password being
   * guessed. An attacker with one target hits the account budget after a
   * handful of tries however many addresses they come from; the office never
   * meets either.
   */
  'sign-in': { limit: 40, windowSeconds: 300 },
  'sign-in-account': { limit: 8, windowSeconds: 900 },
  'sign-up': { limit: 5, windowSeconds: 3600 },
  'password-reset': { limit: 5, windowSeconds: 3600 },
  'verify-public': { limit: 60, windowSeconds: 300 },
  'document-upload': { limit: 60, windowSeconds: 3600 },
  'appointment-booking': { limit: 20, windowSeconds: 3600 },
} as const satisfies Record<string, RateLimitRule>

export type RateLimitScope = keyof typeof RATE_LIMITS

export interface RateLimitResult {
  allowed: boolean
  /** Attempts left in the current window, after this one. */
  remaining: number
  /** When the current window ends, so the caller can say "try again at". */
  resetAt: Date
  /** Seconds until the window ends. What goes in `Retry-After`. */
  retryAfterSeconds: number
}

/**
 * Hash the caller's identity with the deployment secret.
 *
 * Keyed, not a bare SHA-256: an address space small enough to enumerate — every
 * IPv4 address, or a list of likely email addresses — is trivially reversible
 * from an unkeyed digest. With the key it is not.
 */
function fingerprint(scope: string, identifier: string): string {
  return createHmac('sha256', env.BETTER_AUTH_SECRET)
    .update(`ratelimit:${scope}:${identifier.trim().toLowerCase()}`)
    .digest('base64url')
}

/**
 * Count one attempt against a budget, and say whether it is allowed.
 *
 * The whole decision is one upsert and one conditional update inside a
 * transaction that locks the bucket row, so two instances counting the same
 * caller at the same moment serialise rather than both reading the same count.
 *
 * Fails **open**. A rate limiter that refuses everybody when the database is
 * briefly unavailable has turned a degraded database into a total outage, and
 * for a government register that is the worse failure — the control exists to
 * slow an attacker down, not to be the thing that takes the service off the
 * air. The failure is logged.
 */
export async function consume(
  scope: RateLimitScope,
  identifier: string,
  now = new Date(),
): Promise<RateLimitResult> {
  const rule = RATE_LIMITS[scope]
  const windowMs = rule.windowSeconds * 1000
  const key = fingerprint(scope, identifier)

  try {
    return await db.$transaction(async (tx) => {
      const existing = await tx.rateLimitBucket.findUnique({
        where: { scope_identifier: { scope, identifier: key } },
        select: { id: true, windowStartedAt: true, count: true },
      })

      if (!existing) {
        await tx.rateLimitBucket.create({
          data: { scope, identifier: key, windowStartedAt: now, count: 1 },
        })
        return allowedResult(rule, 1, now)
      }

      // Lock, then re-read: two callers arriving together must not both see the
      // pre-increment count.
      await tx.$executeRaw`SELECT id FROM "rate_limit_bucket" WHERE id = ${existing.id} FOR UPDATE`
      const bucket = await tx.rateLimitBucket.findUniqueOrThrow({
        where: { id: existing.id },
        select: { windowStartedAt: true, count: true },
      })

      const windowAge = now.getTime() - bucket.windowStartedAt.getTime()

      if (windowAge >= windowMs) {
        // Reset in place. Nothing is deleted; the row is reused.
        await tx.rateLimitBucket.update({
          where: { id: existing.id },
          data: { windowStartedAt: now, count: 1 },
        })
        return allowedResult(rule, 1, now)
      }

      const next = bucket.count + 1

      if (next > rule.limit) {
        await tx.rateLimitBucket.update({
          where: { id: existing.id },
          data: { lastRefusedAt: now, refusedCount: { increment: 1 } },
        })
        const resetAt = new Date(bucket.windowStartedAt.getTime() + windowMs)
        return {
          allowed: false,
          remaining: 0,
          resetAt,
          retryAfterSeconds: Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1000)),
        }
      }

      await tx.rateLimitBucket.update({ where: { id: existing.id }, data: { count: next } })
      return allowedResult(rule, next, bucket.windowStartedAt)
    })
  } catch (error) {
    console.error(
      `[osool] rate limit for ${scope} could not be evaluated; allowing the request`,
      (error as Error).message,
    )
    return {
      allowed: true,
      remaining: rule.limit,
      resetAt: new Date(now.getTime() + windowMs),
      retryAfterSeconds: rule.windowSeconds,
    }
  }
}

function allowedResult(rule: RateLimitRule, used: number, windowStartedAt: Date): RateLimitResult {
  const resetAt = new Date(windowStartedAt.getTime() + rule.windowSeconds * 1000)
  return {
    allowed: true,
    remaining: Math.max(0, rule.limit - used),
    resetAt,
    retryAfterSeconds: rule.windowSeconds,
  }
}

/**
 * The refusal, as a Response.
 *
 * 03-DESIGN-DIRECTION §6 applies to a 429 exactly as it applies to a screen:
 * what is blocked, why in plain language, the exact next step, who to ask. A
 * bare "Too Many Requests" tells a broker who mistyped their password nothing
 * at all, and they will simply try again immediately.
 */
export function tooManyRequests(result: RateLimitResult, scope: RateLimitScope): Response {
  const minutes = Math.max(1, Math.ceil(result.retryAfterSeconds / 60))

  const messages: Record<RateLimitScope, { ar: string; en: string }> = {
    'sign-in': {
      ar: 'جرى عدد كبير من محاولات تسجيل الدخول من هذه الشبكة.',
      en: 'There have been too many sign-in attempts from this network.',
    },
    'sign-in-account': {
      ar: 'جرى عدد كبير من محاولات الدخول إلى هذا الحساب.',
      en: 'There have been too many sign-in attempts on this account.',
    },
    'sign-up': {
      ar: 'جرى عدد كبير من محاولات إنشاء الحسابات من هذا الجهاز.',
      en: 'There have been too many account-creation attempts from this device.',
    },
    'password-reset': {
      ar: 'جرى عدد كبير من طلبات إعادة تعيين كلمة المرور.',
      en: 'There have been too many password-reset requests.',
    },
    'verify-public': {
      ar: 'جرى عدد كبير من عمليات التحقق من هذا الجهاز.',
      en: 'There have been too many verification lookups from this device.',
    },
    'document-upload': {
      ar: 'جرى رفع عدد كبير من الملفات في وقت قصير.',
      en: 'Too many files have been uploaded in a short time.',
    },
    'appointment-booking': {
      ar: 'جرى عدد كبير من محاولات حجز المواعيد.',
      en: 'There have been too many appointment-booking attempts.',
    },
  }

  const body = [
    'تعذّر تنفيذ الطلب مؤقتاً.',
    `${messages[scope].ar} هذا الحد موجود لحماية السجل من المحاولات الآلية، ولا يعني أن حسابك أُوقف.`,
    `أعد المحاولة بعد ${minutes} دقيقة تقريباً.`,
    'إذا تكرّر الأمر ولم تكن أنت مصدر المحاولات، تواصل مع الإدارة المركزية للسجلات التجارية بالهيئة.',
    '',
    'This request cannot be completed right now.',
    `${messages[scope].en} The limit protects the register from automated attempts; it does not mean your account has been suspended.`,
    `Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    'If this keeps happening and the attempts are not yours, contact the Central Administration for Commercial Registrations at GOEIC.',
  ].join('\n')

  return new Response(body, {
    status: 429,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Retry-After': String(result.retryAfterSeconds),
      'Cache-Control': 'no-store',
    },
  })
}

/** The caller's address, as far forward as the deployment's proxy reports it. */
export function callerAddress(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown'
  return request.headers.get('x-real-ip') ?? 'unknown'
}
