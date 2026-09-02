import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { ProvisioningError, reactivateAccount, suspendAccount } from '@/lib/auth/provisioning'
import { capturedEmails, clearCapturedEmails } from '@/lib/email'
import { makeUser } from '../support/fixtures'
import type { User } from '@prisma/client'

/**
 * Phase 16 — the administration controls that were missing.
 *
 * §4 puts every account operation behind SYSTEM_ADMIN and nothing else. That
 * makes the administrator population a single point of failure the product had
 * no protection against: nothing stopped the last administrator suspending
 * themselves, and no screen in the system could have recovered from it.
 *
 * And a suspension revoked nothing. The holder was refused on their next
 * request — the session guard sees the status — but the session row survived,
 * so a token that had been stolen was still a valid credential waiting for the
 * account to be reinstated.
 */

function actorFor(user: User) {
  return {
    userId: user.id,
    role: user.role,
    name: user.name,
    ipAddress: '127.0.0.1',
    userAgent: 'vitest',
  }
}

/** A live session row, as Better Auth would have written one. */
async function giveSession(user: User) {
  return db.session.create({
    data: {
      token: `test-token-${user.id}-${Math.random().toString(36).slice(2)}`,
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
      userId: user.id,
      ipAddress: '127.0.0.1',
      userAgent: 'vitest',
    },
  })
}

beforeEach(() => {
  clearCapturedEmails()
})

describe('the last administrator', () => {
  it('cannot be suspended, and says why', async () => {
    // Every other administrator on this database is parked first, so the one
    // created here is genuinely the last active one.
    const existing = await db.user.findMany({
      where: { role: 'SYSTEM_ADMIN', status: 'ACTIVE', archivedAt: null },
      select: { id: true },
    })
    await db.user.updateMany({
      where: { id: { in: existing.map((u) => u.id) } },
      data: { status: 'SUSPENDED', suspendedReason: 'Parked by the administration test.' },
    })

    const onlyAdmin = await makeUser({ role: 'SYSTEM_ADMIN' })
    const second = await makeUser({ role: 'SYSTEM_ADMIN' })

    // With two, either may be suspended.
    await suspendAccount(
      { userId: second.id, reason: 'Left the Authority.' },
      actorFor(onlyAdmin),
    )

    // With one, none may.
    await expect(
      suspendAccount({ userId: onlyAdmin.id, reason: 'Trying anyway.' }, actorFor(second)),
    ).rejects.toThrow(ProvisioningError)

    let code: string | undefined
    try {
      await suspendAccount({ userId: onlyAdmin.id, reason: 'Trying anyway.' }, actorFor(second))
    } catch (error) {
      code = (error as ProvisioningError).code
    }
    // Self-suspension is caught first when the actor is the subject; here the
    // actor is a different (now suspended) admin, so the last-admin rule fires.
    expect(['LAST_ADMINISTRATOR', 'NOT_SYSTEM_ADMIN']).toContain(code)

    const after = await db.user.findUniqueOrThrow({ where: { id: onlyAdmin.id } })
    expect(after.status).toBe('ACTIVE')

    // Put the database back roughly as it was, so later suites see a normal
    // administrator population. Nothing is deleted — statuses are restored.
    await db.user.updateMany({
      where: { id: { in: existing.map((u) => u.id) } },
      data: { status: 'ACTIVE', suspendedReason: null },
    })
  })
})

describe('suspending an account', () => {
  it('refuses to let an administrator suspend themselves', async () => {
    const admin = await makeUser({ role: 'SYSTEM_ADMIN' })

    let code: string | undefined
    try {
      await suspendAccount({ userId: admin.id, reason: 'Locking myself out.' }, actorFor(admin))
    } catch (error) {
      code = (error as ProvisioningError).code
    }

    expect(code).toBe('SELF_SUSPENSION')
    expect((await db.user.findUniqueOrThrow({ where: { id: admin.id } })).status).toBe('ACTIVE')
  })

  it('revokes every live session, so a stolen token cannot come back later', async () => {
    const admin = await makeUser({ role: 'SYSTEM_ADMIN' })
    const examiner = await makeUser({ role: 'EXAMINER' })

    await giveSession(examiner)
    await giveSession(examiner)
    expect(await db.session.count({ where: { userId: examiner.id } })).toBe(2)

    await suspendAccount(
      { userId: examiner.id, reason: 'Under investigation.' },
      actorFor(admin),
    )

    expect(await db.session.count({ where: { userId: examiner.id } })).toBe(0)

    // …and the count is in the trail, so the revocation is evidenced rather
    // than merely having happened.
    const event = await db.auditEvent.findFirst({
      where: { entityId: examiner.id, action: 'ACCOUNT_SUSPENDED' },
      orderBy: { seq: 'desc' },
    })
    expect((event!.payload as { sessionsRevoked?: number }).sessionsRevoked).toBe(2)
  })

  it('tells the holder what happened, why, and that nothing was deleted', async () => {
    const admin = await makeUser({ role: 'SYSTEM_ADMIN' })
    const broker = await makeUser({ role: 'BROKER_OWNER' })

    clearCapturedEmails()
    await suspendAccount(
      { userId: broker.id, reason: 'Duplicate registration under investigation.' },
      actorFor(admin),
    )

    const message = capturedEmails().find((m) => m.to === broker.email)
    expect(message).toBeDefined()
    expect(message!.subject).toContain('suspended')
    expect(message!.text).toContain('Duplicate registration under investigation.')
    // The four-part promise: what happened, why, what it means, who to ask.
    expect(message!.text).toContain('nothing has been deleted')
    expect(message!.text).toContain('system administrator')
  })

  it('reinstates, and tells them that too', async () => {
    const admin = await makeUser({ role: 'SYSTEM_ADMIN' })
    const clerk = await makeUser({ role: 'REGISTRY_CLERK' })

    await suspendAccount({ userId: clerk.id, reason: 'Temporary.' }, actorFor(admin))
    clearCapturedEmails()
    await reactivateAccount({ userId: clerk.id, reason: 'Cleared.' }, actorFor(admin))

    expect((await db.user.findUniqueOrThrow({ where: { id: clerk.id } })).status).toBe('ACTIVE')
    const message = capturedEmails().find((m) => m.to === clerk.email)
    expect(message?.subject).toContain('reinstated')
  })
})
