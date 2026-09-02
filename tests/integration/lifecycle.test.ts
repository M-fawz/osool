import { describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import {
  cancelRegistration,
  registrationHistory,
  reinstateRegistration,
  suspendRegistration,
  sweepLifecycle,
} from '@/lib/registry/lifecycle'
import { actor, makeApplication, makeBroker, makeUser } from '../support/fixtures'

/**
 * Phase 8 — a registration that does not stay ACTIVE forever.
 *
 * The interesting test here is not that a date in the past produces LAPSED. It
 * is CLAUDE.md rule 10: `OBLIGATION_PERIODS.REGISTRATION_VALIDITY` is marked
 * `[NEEDS COUNSEL]`, and the rule set says in as many words that the calculation
 * "warns rather than lapsing a registration on this basis until counsel confirms
 * the period."
 *
 * So an expiry an examiner chose may lapse a registration, and an expiry the
 * unconfirmed default produced may not. Both cases are below, because the
 * second is the one a well-meaning implementation gets wrong.
 */

async function registrationExpiring(input: {
  validTo: Date
  examinerProposed: boolean
  status?: 'ACTIVE' | 'RENEWAL_DUE' | 'SUSPENDED'
}) {
  const { entity } = await makeBroker()
  const examiner = await makeUser({ role: 'EXAMINER' })

  const registration = await db.registration.create({
    data: {
      brokerEntityId: entity.id,
      registrationNumber: `LC/${Date.now()}${Math.floor(Math.random() * 1000)}`,
      category: 'C',
      types: ['SELL'],
      paidUpCapital: 90_000,
      validFrom: new Date('2021-01-01'),
      validTo: input.validTo,
      status: input.status ?? 'ACTIVE',
    },
  })

  const application = await makeApplication({
    brokerEntityId: entity.id,
    status: 'ACTIVE',
    examinerId: examiner.id,
  })
  await db.application.update({
    where: { id: application.id },
    data: { registrationId: registration.id },
  })

  if (input.examinerProposed) {
    await db.examinationRecord.create({
      data: {
        applicationId: application.id,
        examinerUserId: examiner.id,
        originalCount: 1,
        copyCount: 1,
        brokerageNature: ['SELL'],
        proposedValidFrom: new Date('2021-01-01'),
        proposedValidTo: input.validTo,
        recommendation: 'RECOMMEND_APPROVAL',
      },
    })
  }

  return { registration, entity }
}

const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000)

describe('time passing', () => {
  it('moves a registration inside the renewal window to RENEWAL_DUE', async () => {
    const { registration } = await registrationExpiring({
      validTo: daysFromNow(30),
      examinerProposed: true,
    })

    const result = await sweepLifecycle({ notifyBrokers: false })
    expect(result.renewalWindowDays).toBe(90)

    const after = await db.registration.findUniqueOrThrow({ where: { id: registration.id } })
    expect(after.status).toBe('RENEWAL_DUE')

    const history = await registrationHistory(registration.id)
    expect(history.at(-1)?.action).toBe('REGISTRATION_RENEWAL_DUE')
    // The sweep is not a person, and does not pretend to be one.
    expect(history.at(-1)?.actorUserId).toBeNull()
  })

  it('lapses a registration whose expiry an examiner actually set', async () => {
    const { registration } = await registrationExpiring({
      validTo: daysFromNow(-5),
      examinerProposed: true,
    })

    await sweepLifecycle({ notifyBrokers: false })

    const after = await db.registration.findUniqueOrThrow({ where: { id: registration.id } })
    expect(after.status).toBe('LAPSED')
  })

  it('refuses to lapse on an unconfirmed rule, and says so — CLAUDE.md rule 10', async () => {
    const { registration } = await registrationExpiring({
      validTo: daysFromNow(-5),
      examinerProposed: false,
    })

    const result = await sweepLifecycle({ notifyBrokers: false })

    const after = await db.registration.findUniqueOrThrow({ where: { id: registration.id } })
    expect(after.status).not.toBe('LAPSED')

    const held = result.heldForCounsel.find((h) => h.registrationId === registration.id)
    expect(held).toBeDefined()
    expect(held!.why).toContain('NEEDS COUNSEL')

    // …and the decision not to act is itself in the trail. An officer must be
    // able to find the registrations the sweep deliberately left alone.
    const event = await db.auditEvent.findFirst({
      where: { entityId: registration.id, action: 'REGISTRATION_LAPSE_HELD_FOR_COUNSEL' },
    })
    expect(event).not.toBeNull()
  })

  it('is idempotent — running it twice does not move anything twice', async () => {
    const { registration } = await registrationExpiring({
      validTo: daysFromNow(45),
      examinerProposed: true,
    })

    await sweepLifecycle({ notifyBrokers: false })
    await sweepLifecycle({ notifyBrokers: false })

    const moves = await db.registrationEvent.findMany({
      where: { registrationId: registration.id, action: 'REGISTRATION_RENEWAL_DUE' },
    })
    expect(moves).toHaveLength(1)
  })

  it('leaves a suspended registration where a person put it', async () => {
    const { registration } = await registrationExpiring({
      validTo: daysFromNow(-30),
      examinerProposed: true,
      status: 'SUSPENDED',
    })

    await sweepLifecycle({ notifyBrokers: false })

    const after = await db.registration.findUniqueOrThrow({ where: { id: registration.id } })
    expect(after.status).toBe('SUSPENDED')
  })
})

describe('decisions a person takes', () => {
  it('suspends with a written reason and records who did it', async () => {
    const { registration } = await registrationExpiring({
      validTo: daysFromNow(400),
      examinerProposed: true,
    })
    const supervisor = await makeUser({ role: 'AML_SUPERVISOR' })

    expect(
      await suspendRegistration(actor(supervisor), {
        registrationId: registration.id,
        reason: 'Supervisory finding pending remediation.',
      }),
    ).toEqual({ ok: true })

    const after = await db.registration.findUniqueOrThrow({ where: { id: registration.id } })
    expect(after.status).toBe('SUSPENDED')

    const history = await registrationHistory(registration.id)
    const last = history.at(-1)!
    expect(last.action).toBe('REGISTRATION_SUSPENDED')
    expect(last.actorUserId).toBe(supervisor.id)
    expect(last.reason).toContain('remediation')
  })

  it('does not hand back time that ran out during a suspension', async () => {
    const { registration } = await registrationExpiring({
      validTo: daysFromNow(-10),
      examinerProposed: true,
      status: 'SUSPENDED',
    })
    const supervisor = await makeUser({ role: 'AML_SUPERVISOR' })

    expect(
      await reinstateRegistration(actor(supervisor), {
        registrationId: registration.id,
        reason: 'Finding closed.',
      }),
    ).toEqual({ ok: true })

    // Reinstated to what the dates actually say, not to ACTIVE.
    const after = await db.registration.findUniqueOrThrow({ where: { id: registration.id } })
    expect(after.status).toBe('LAPSED')
  })

  it('reinstates into the renewal window where that is what the dates say', async () => {
    const { registration } = await registrationExpiring({
      validTo: daysFromNow(20),
      examinerProposed: true,
      status: 'SUSPENDED',
    })
    const supervisor = await makeUser({ role: 'AML_SUPERVISOR' })

    await reinstateRegistration(actor(supervisor), {
      registrationId: registration.id,
      reason: 'Finding closed.',
    })

    const after = await db.registration.findUniqueOrThrow({ where: { id: registration.id } })
    expect(after.status).toBe('RENEWAL_DUE')
  })

  it('cancels terminally, and deletes nothing', async () => {
    const { registration } = await registrationExpiring({
      validTo: daysFromNow(400),
      examinerProposed: true,
    })
    const supervisor = await makeUser({ role: 'AML_SUPERVISOR' })

    await cancelRegistration(actor(supervisor), {
      registrationId: registration.id,
      reason: 'The firm has ceased brokerage activity and asked to be removed.',
    })

    const after = await db.registration.findUnique({ where: { id: registration.id } })
    // Still there. CLAUDE.md rule 2.
    expect(after).not.toBeNull()
    expect(after!.status).toBe('CANCELLED')

    // And it cannot be cancelled a second time.
    const again = await cancelRegistration(actor(supervisor), {
      registrationId: registration.id,
      reason: 'Again.',
    })
    expect(again.ok).toBe(false)
  })
})

describe('the registration event log', () => {
  it('is append-only at the database, not merely by convention', async () => {
    const { registration } = await registrationExpiring({
      validTo: daysFromNow(400),
      examinerProposed: true,
    })
    const supervisor = await makeUser({ role: 'AML_SUPERVISOR' })
    await suspendRegistration(actor(supervisor), {
      registrationId: registration.id,
      reason: 'Test suspension.',
    })

    const event = await db.registrationEvent.findFirstOrThrow({
      where: { registrationId: registration.id },
    })

    await expect(
      db.registrationEvent.update({ where: { id: event.id }, data: { reason: 'rewritten' } }),
    ).rejects.toThrow()
  })
})
