import { describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { makeUser } from '../support/fixtures'
import type { User } from '@prisma/client'

/**
 * Resetting a forgotten password.
 *
 * The capability existed from Phase 0 — Better Auth issued the token and the
 * bilingual mail went out — but nothing in the interface could reach it: no
 * link on the sign-in screen and no page behind one. Closing that loop made two
 * things matter that had not mattered while the flow was unreachable.
 *
 * **Sessions.** The reason somebody resets a password they cannot remember is
 * frequently that another person has been using it. A reset that leaves the
 * existing sessions alive changes the lock while the intruder is still inside.
 *
 * **Standing.** The same callback is what activates a newly provisioned
 * officer, so it is the one place where a status transition is written without
 * an administrator present. It must move PENDING_ACTIVATION to ACTIVE and must
 * move nothing else — in particular a SUSPENDED account must not be able to
 * reinstate itself by way of the mailbox its holder still controls.
 */

/** A live session row, as Better Auth would have written one. */
async function giveSession(user: User) {
  return db.session.create({
    data: {
      token: `reset-test-${user.id}-${Math.random().toString(36).slice(2)}`,
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
      userId: user.id,
      ipAddress: '127.0.0.1',
      userAgent: 'vitest',
    },
  })
}

/**
 * Drive the real callback rather than a copy of it.
 *
 * `onPasswordReset` is configured on the Better Auth instance, so the test
 * reaches through the built options to the same function the framework calls.
 * Asserting against a re-implementation would prove only that the test agrees
 * with itself.
 */
async function runPasswordReset(user: User) {
  const handler = (auth.options as {
    emailAndPassword?: { onPasswordReset?: (ctx: { user: User }) => Promise<void> }
  }).emailAndPassword?.onPasswordReset

  expect(handler, 'onPasswordReset is configured on the auth instance').toBeTypeOf('function')
  await handler!({ user })
}

describe('a password reset', () => {
  it('ends every session the account had', async () => {
    const officer = await makeUser({ role: 'EXAMINER' })
    await giveSession(officer)
    await giveSession(officer)

    expect(await db.session.count({ where: { userId: officer.id } })).toBe(2)

    await runPasswordReset(officer)

    expect(await db.session.count({ where: { userId: officer.id } })).toBe(0)
  })

  it('records the reset, and how many sessions it ended', async () => {
    const officer = await makeUser({ role: 'REVIEWER' })
    await giveSession(officer)

    await runPasswordReset(officer)

    const event = await db.auditEvent.findFirst({
      where: { entityType: 'User', entityId: officer.id, action: 'ACCOUNT_PASSWORD_RESET' },
      orderBy: { seq: 'desc' },
    })

    expect(event, 'a reset is a credential change and must be audited').not.toBeNull()
    expect((event!.payload as { sessionsRevoked?: number }).sessionsRevoked).toBe(1)
    // The holder acted, proving control of the mailbox. Attributing this to an
    // administrator who was not present would be a false record.
    expect(event!.actorUserId).toBe(officer.id)
  })

  it('does not reinstate a suspended account', async () => {
    const parked = await makeUser({ role: 'REGISTRY_CLERK', status: 'SUSPENDED' })

    await runPasswordReset(parked)

    const after = await db.user.findUniqueOrThrow({ where: { id: parked.id } })
    expect(
      after.status,
      'a suspension is an administrative decision; the holder cannot lift it from their inbox',
    ).toBe('SUSPENDED')
  })

  it('activates an account that was waiting for its holder to set a password', async () => {
    const provisioned = await makeUser({ role: 'CARD_ISSUER', status: 'PENDING_ACTIVATION' })

    await runPasswordReset(provisioned)

    const after = await db.user.findUniqueOrThrow({ where: { id: provisioned.id } })
    expect(after.status).toBe('ACTIVE')
    expect(after.emailVerified).toBe(true)
  })
})
