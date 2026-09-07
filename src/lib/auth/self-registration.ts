import { z } from 'zod'
import type { Governorate } from '@prisma/client'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { recordAuditEvent } from '@/lib/audit'
import { captureIssuedLinks, type IssuedLink } from '@/lib/auth/link-capture'
import { deployment } from '@/lib/env'
import { governorateLabels } from '@/lib/reference/governorates'

/**
 * A broker firm registering itself.
 *
 * 00-VISION §3 puts the supervised population in the tens of thousands and
 * requires them to onboard without contacting the Authority; `provisioning.ts`
 * says so in as many words — "Broker accounts self-register." Every part of the
 * mechanism was built for it and the entry point never was: `User.role` already
 * defaults to `BROKER_OWNER`, `role` and `status` are `input: false` so a
 * sign-up body cannot mint an administrator, `emailVerification.sendOnSignUp`
 * is on, `brokerVerificationEmail` exists, and `RATE_LIMITS` has carried a
 * `sign-up` budget the whole time. Until this module there was no way for a
 * broker to obtain an account at all — every one in the database was made by a
 * seed script.
 *
 * ── Why the account is ACTIVE and not PENDING_ACTIVATION ─────────────────
 *
 * `PENDING_ACTIVATION` means, in this system's own words on the enum, "created
 * by an administrator, activation email sent, password not yet set". None of
 * that describes a firm that has just chosen its own password. Leaving a
 * self-registered broker in that state would also strand them permanently:
 * `requireSession` refuses `PENDING_ACTIVATION`, and the only transition out of
 * it runs on a password *reset*, which this account has no reason to perform.
 *
 * The control that actually matters here is unchanged and is not this field:
 * `requireEmailVerification` refuses the sign-in until the address is proved.
 * So the account is ACTIVE with an unverified address — it exists, and it
 * cannot be used yet.
 *
 * ── Order of writes ──────────────────────────────────────────────────────
 *
 * Party and BrokerEntity first, the user second. The reverse order looks
 * tidier and is wrong: `signUpEmail` sends the verification message as a side
 * effect, so a failure after it would leave a person holding a live link to an
 * account with no firm attached — and since nothing in this system is ever
 * deleted (02-SYSTEM-ARCHITECTURE §7), that state could not be cleaned up. A
 * firm row with no user is inert by comparison, and the retry is idempotent
 * from the applicant's point of view because the email is what gates progress.
 */

export const RegistrationInput = z.object({
  ownerNameAr: z.string().trim().min(3, 'ownerNameArRequired').max(120),
  ownerNameEn: z.string().trim().min(3, 'ownerNameEnRequired').max(120),
  email: z.string().trim().toLowerCase().email('emailInvalid').max(200),
  // Better Auth is configured for a twelve-character minimum; saying so here
  // means the applicant is told before the round trip rather than after it.
  password: z.string().min(12, 'passwordTooShort').max(128, 'passwordTooLong'),
  tradeNameAr: z.string().trim().min(2, 'tradeNameArRequired').max(200),
  tradeNameEn: z.string().trim().max(200).optional().or(z.literal('')),
  governorate: z.string().refine((v) => v in governorateLabels, 'governorateRequired'),
  headOfficeAddress: z.string().trim().min(5, 'addressRequired').max(300),
})

export type RegistrationInput = z.infer<typeof RegistrationInput>

export type RegistrationResult =
  | {
      ok: true
      userId: string
      brokerEntityId: string
      email: string
      /**
       * The verification link, on deployments where no mail provider delivers.
       *
       * Null in production, always — see `demonstrationLink` below.
       */
      verificationLink: string | null
    }
  | { ok: false; code: 'EMAIL_ALREADY_REGISTERED' | 'SIGNUP_FAILED'; message: string }

/**
 * The link, but only where showing it discloses nothing.
 *
 * On a development or preview deployment the mailer is `console` or `capture`,
 * so the verification link exists for the duration of one function call and is
 * then gone — which makes the product impossible to demonstrate and impossible
 * to test by hand. Showing it on the confirmation screen solves that.
 *
 * In production it is never shown, under any configuration. The link is a
 * bearer token for the account: printing it on a page would mean anyone who
 * could reach the sign-up form could verify an address they do not control, by
 * registering it themselves. The check is on the deployment rather than on the
 * mail driver, so misconfiguring production to `console` cannot leak it either.
 */
function demonstrationLink(links: IssuedLink[]): string | null {
  if (deployment === 'production') return null
  return links.find((l) => l.kind === 'verification')?.url ?? null
}

export async function registerBroker(
  input: RegistrationInput,
  context: { ipAddress?: string | null; userAgent?: string | null } = {},
): Promise<RegistrationResult> {
  const email = input.email.trim().toLowerCase()

  /*
   * The existing-account answer is deliberately explicit here, unlike on the
   * password-reset screen where a uniform answer is what stops the form being
   * an account-enumeration oracle. The trade is different on sign-up: the form
   * cannot silently succeed, because the applicant would sit waiting for an
   * email that is never coming, and any implementation that refuses duplicates
   * is distinguishable by timing anyway. Telling them plainly, and pointing at
   * sign-in and password reset, is the honest and more useful answer.
   */
  const existing = await db.user.findUnique({ where: { email }, select: { id: true } })
  if (existing) {
    return {
      ok: false,
      code: 'EMAIL_ALREADY_REGISTERED',
      message: `An account already exists for ${email}.`,
    }
  }

  const tradeNameEn = input.tradeNameEn?.trim() || null

  // The firm first. See the note on ordering above.
  const entity = await db.$transaction(async (tx) => {
    const party = await tx.party.create({
      data: {
        // The registrant is the firm. A sole trader is still a registered
        // commercial name here; the natural-person detail belongs to the
        // application's own CDD step, not to opening an account.
        type: 'LEGAL_PERSON',
        nameAr: input.tradeNameAr,
        nameEn: tradeNameEn,
        nationality: 'مصرية',
      },
    })

    return tx.brokerEntity.create({
      data: {
        partyId: party.id,
        tradeNameAr: input.tradeNameAr,
        tradeNameEn,
        headOfficeAddress: input.headOfficeAddress,
        governorate: input.governorate as Governorate,
      },
    })
  })

  /*
   * Through Better Auth's ordinary sign-up, so the password is hashed exactly
   * as every other password in the system is. There is no back door here, and
   * `role` cannot arrive from this body even though the body is ours.
   *
   * The capture scope is what lets the confirmation screen show the link on a
   * deployment with no mail provider. It is a no-op when nothing reads it.
   */
  const { value: created, links } = await captureIssuedLinks(() =>
    auth.api.signUpEmail({
      body: { email, password: input.password, name: input.ownerNameEn },
    }),
  )

  if (!created?.user?.id) {
    return { ok: false, code: 'SIGNUP_FAILED', message: 'The account could not be created.' }
  }

  const userId = created.user.id

  // Set server-side, together with the fields Better Auth does not know about.
  // Until this runs the account holds the least-privileged default and has no
  // firm, which is the safe direction for the window to fail in.
  await db.user.update({
    where: { id: userId },
    data: {
      role: 'BROKER_OWNER',
      status: 'ACTIVE',
      nameAr: input.ownerNameAr,
      brokerEntityId: entity.id,
    },
  })

  await recordAuditEvent({
    action: 'BROKER_SELF_REGISTERED',
    entityType: 'User',
    entityId: userId,
    actorUserId: userId,
    actorRole: 'BROKER_OWNER',
    actorLabel: `${input.ownerNameEn} (${input.tradeNameAr})`,
    toState: 'ACTIVE',
    reason:
      'A brokerage firm opened its own account. The address is not yet verified, so the account cannot be used until the holder proves control of the mailbox.',
    ipAddress: context.ipAddress ?? null,
    userAgent: context.userAgent ?? null,
    // The password is not here, and neither is the link. What an inspector
    // needs is that the account was opened, by whom, for which firm, and when.
    payload: {
      email,
      brokerEntityId: entity.id,
      tradeNameAr: input.tradeNameAr,
      governorate: input.governorate,
      emailVerified: false,
    },
  })

  return {
    ok: true,
    userId,
    brokerEntityId: entity.id,
    email,
    verificationLink: demonstrationLink(links),
  }
}
