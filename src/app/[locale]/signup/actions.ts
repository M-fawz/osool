'use server'

import { headers } from 'next/headers'
import { fieldErrors } from '@/lib/validation/application'
import { RegistrationInput, registerBroker } from '@/lib/auth/self-registration'
import { consume } from '@/lib/security/rate-limit'

/**
 * Opening a broker account.
 *
 * A Server Action rather than a call to `/api/auth/sign-up` from the browser,
 * because a firm's account is not only a user row: it is a `Party`, a
 * `BrokerEntity` and a `User` that have to be created together and audited as
 * one event. Doing that from the client would mean three round trips with two
 * windows in which the browser could walk away and leave the register holding
 * half a firm.
 *
 * The trade is that this path does not pass through `/api/auth/[...all]`, so
 * the rate limit that route applies to sign-up does not apply here. It is
 * therefore applied below, on the same `sign-up` budget, so the two doors into
 * the same operation share one counter rather than each having their own.
 */

export type SignUpOutcome =
  | { ok: true; email: string; verificationLink: string | null }
  | { ok: false; kind: 'validation'; errors: Record<string, string> }
  | { ok: false; kind: 'refused'; code: string; message: string }

export async function signUpBroker(
  _previous: SignUpOutcome | null,
  formData: FormData,
): Promise<SignUpOutcome> {
  const value = (name: string) => String(formData.get(name) ?? '')

  const parsed = RegistrationInput.safeParse({
    ownerNameAr: value('ownerNameAr'),
    ownerNameEn: value('ownerNameEn'),
    email: value('email'),
    password: value('password'),
    tradeNameAr: value('tradeNameAr'),
    tradeNameEn: value('tradeNameEn'),
    governorate: value('governorate'),
    headOfficeAddress: value('headOfficeAddress'),
  })

  /*
   * Validation before the rate limit, deliberately. A misspelled address is
   * the commonest thing that happens on this form and it must not consume a
   * budget that is there to stop automated account creation — five typos would
   * otherwise lock a genuine applicant out for an hour.
   */
  if (!parsed.success) return { ok: false, kind: 'validation', errors: fieldErrors(parsed.error) }

  const h = await headers()
  const forwarded = h.get('x-forwarded-for')
  const ipAddress = forwarded?.split(',')[0]?.trim() ?? h.get('x-real-ip')

  const limit = await consume('sign-up', ipAddress ?? 'unknown')
  if (!limit.allowed) {
    return {
      ok: false,
      kind: 'refused',
      code: 'RATE_LIMITED',
      message: `Too many accounts have been opened from this connection. Try again after ${limit.resetAt.toISOString()}.`,
    }
  }

  const result = await registerBroker(parsed.data, {
    ipAddress,
    userAgent: h.get('user-agent'),
  })

  if (!result.ok) {
    return { ok: false, kind: 'refused', code: result.code, message: result.message }
  }

  return { ok: true, email: result.email, verificationLink: result.verificationLink }
}
