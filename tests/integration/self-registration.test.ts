import { describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { registerBroker, RegistrationInput } from '@/lib/auth/self-registration'
import { ns } from '../support/fixtures'

/**
 * A brokerage firm opening its own account.
 *
 * Until this existed there was no way for a broker to obtain an account at all.
 * `auth.api.signUpEmail` was called from exactly one place —
 * `provisioning.ts`, which is administrator-only and creates *government*
 * accounts — and the sign-in screen offered no route to registration. Every
 * broker in the seeded database was made by a script. The supervised population
 * is in the tens of thousands (00-VISION §3) and cannot be onboarded by hand.
 *
 * What these tests hold down is the part that is easy to get wrong and
 * invisible when it is: the account has to end up in a state it can actually be
 * used from, it must not be usable *before* the address is proved, and a public
 * sign-up endpoint must not be a way to mint privilege.
 */

function input(overrides: Partial<RegistrationInput> = {}): RegistrationInput {
  const tag = ns()
  return {
    ownerNameAr: 'محمود فوزي',
    ownerNameEn: 'Mahmoud Fawzy',
    email: `firm-${tag}@example.test`,
    password: 'a-sufficiently-long-password',
    tradeNameAr: `منشأة ${tag} للوساطة العقارية`,
    tradeNameEn: `Firm ${tag} Real Estate`,
    governorate: 'CAIRO',
    headOfficeAddress: '١٢ شارع قصر النيل، القاهرة',
    ...overrides,
  }
}

describe('a firm registering itself', () => {
  it('creates the firm, the party and the owner together', async () => {
    const values = input()
    const result = await registerBroker(values)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const user = await db.user.findUnique({
      where: { id: result.userId },
      include: { brokerEntity: { include: { party: true } } },
    })

    expect(user?.brokerEntityId).toBe(result.brokerEntityId)
    expect(user?.brokerEntity?.tradeNameAr).toBe(values.tradeNameAr)
    expect(user?.brokerEntity?.governorate).toBe('CAIRO')
    // The firm is a party in its own right, because the register supervises
    // firms and the CDD cascade hangs off Party, not off the user row.
    expect(user?.brokerEntity?.party.nameAr).toBe(values.tradeNameAr)
  })

  /**
   * The state question, and the reason it is not `PENDING_ACTIVATION`.
   *
   * That status means "an administrator created this and the holder has not set
   * a password", which does not describe a firm that has just chosen one. It
   * would also strand the account: `requireSession` refuses
   * `PENDING_ACTIVATION`, and the only transition out of it runs on a password
   * reset the holder has no reason to perform.
   */
  it('leaves the account usable in principle but unverified in fact', async () => {
    const result = await registerBroker(input())
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const user = await db.user.findUnique({ where: { id: result.userId } })

    expect(user?.status).toBe('ACTIVE')
    expect(user?.emailVerified).toBe(false)
  })

  /**
   * The control that actually gates the account. This is asserted against the
   * real Better Auth call rather than against the configuration object, because
   * what matters is the behaviour and `requireEmailVerification` is one flag
   * away from being off.
   */
  it('refuses the sign-in until the address is confirmed', async () => {
    const values = input()
    const result = await registerBroker(values)
    expect(result.ok).toBe(true)

    await expect(
      auth.api.signInEmail({ body: { email: values.email, password: values.password } }),
    ).rejects.toThrow()
  })

  /**
   * The privilege question. `role` is `input: false` in the Better Auth
   * configuration, and this asserts the property that flag exists to give: a
   * body posted at sign-up cannot choose a role. The cast is the point — it is
   * what a caller trying to escalate would send.
   */
  it('cannot be used to mint a government role', async () => {
    const values = input()
    const result = await registerBroker({
      ...values,
      ...({ role: 'SYSTEM_ADMIN', status: 'ACTIVE' } as Partial<RegistrationInput>),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const user = await db.user.findUnique({ where: { id: result.userId } })
    expect(user?.role).toBe('BROKER_OWNER')
  })

  it('records an audit event naming the firm', async () => {
    const values = input()
    const result = await registerBroker(values, { ipAddress: '203.0.113.9' })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const event = await db.auditEvent.findFirst({
      where: { action: 'BROKER_SELF_REGISTERED', entityId: result.userId },
    })

    expect(event).not.toBeNull()
    expect(event?.actorRole).toBe('BROKER_OWNER')
    expect(event?.toState).toBe('ACTIVE')
    expect(event?.ipAddress).toBe('203.0.113.9')
    // The password is never in the trail, and neither is the one-time link.
    const payload = JSON.stringify(event?.payload)
    expect(payload).not.toContain(values.password)
  })

  it('refuses a second account on the same address rather than shadowing the first', async () => {
    const values = input()
    const first = await registerBroker(values)
    expect(first.ok).toBe(true)

    const second = await registerBroker({ ...values, tradeNameAr: 'منشأة أخرى' })

    expect(second.ok).toBe(false)
    if (second.ok) return
    expect(second.code).toBe('EMAIL_ALREADY_REGISTERED')
  })

  /**
   * The address is the account's identity, and addresses are not
   * case-sensitive. Two rows differing only in case would be two accounts one
   * person believes is one account, and the second would never be verifiable.
   */
  it('treats the address case-insensitively', async () => {
    const values = input()
    await registerBroker(values)

    const again = await registerBroker({ ...values, email: values.email.toUpperCase() })

    expect(again.ok).toBe(false)
  })
})

describe('what the form will accept', () => {
  it.each([
    ['a password under twelve characters', { password: 'short' }],
    ['no Arabic trade name', { tradeNameAr: '' }],
    ['an address that is not one', { email: 'not-an-address' }],
    ['a governorate that does not exist', { governorate: 'ATLANTIS' }],
    ['no head office', { headOfficeAddress: '' }],
  ])('refuses %s', (_label, overrides) => {
    expect(RegistrationInput.safeParse(input(overrides as Partial<RegistrationInput>)).success).toBe(
      false,
    )
  })

  it('accepts a firm with no English trade name, which is lawful', () => {
    expect(RegistrationInput.safeParse(input({ tradeNameEn: '' })).success).toBe(true)
  })
})
