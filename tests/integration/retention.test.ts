import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import {
  activeHolds,
  archive,
  assertArchivable,
  liftLegalHold,
  placeLegalHold,
  retentionEligibility,
} from '@/lib/retention'
import { actor, makeBrokerEntity, makeUser, ns } from '../support/fixtures'

/**
 * Retention lock and legal hold — REQ-AML-030, REQ-AML-031.
 *
 * CLAUDE.md rule 2 names three operations: archive, retention lock, legal hold.
 * Before this work only the first existed. `retentionUntil` and `legalHold` were
 * columns on every table with zero reads and zero writes anywhere in the code —
 * a documented control that did not exist, which is worse than no control,
 * because everything downstream is built on the belief that it is there.
 *
 * These tests hold the three to what 02-SYSTEM-ARCHITECTURE §7 says they do.
 */

let auditor: Awaited<ReturnType<typeof makeUser>>

beforeEach(async () => {
  auditor = await makeUser({ role: 'AUDITOR' })
})

async function aRecord(): Promise<{ entityType: string; entityId: string }> {
  const entity = await makeBrokerEntity()
  return { entityType: 'BrokerEntity', entityId: entity.id }
}

describe('the retention clock', () => {
  it('reads its periods from the rule set, not from a constant', async () => {
    const eligibility = await retentionEligibility({
      recordClass: 'CDD_RECORDS',
      clockStartedAt: new Date('2020-01-01T00:00:00Z'),
    })

    // Five years, from REQ-AML-030 row أ — asserted through the resolved rule
    // set so that amending the decree amends this, as rule 4 requires.
    expect(eligibility.minimumYears).toBe(5)
    expect(eligibility.minimumUntil.toISOString().slice(0, 10)).toBe('2025-01-01')
    expect(eligibility.ruleSetVersion).toBeGreaterThan(0)
  })

  it('holds a record whose period has not elapsed', async () => {
    const eligibility = await retentionEligibility({
      recordClass: 'TRAINING_RECORDS',
      clockStartedAt: new Date('2026-01-01T00:00:00Z'),
      asOf: new Date('2027-06-01T00:00:00Z'),
    })
    expect(eligibility.eligible).toBe(false)
  })

  it('releases a record whose period has elapsed', async () => {
    const eligibility = await retentionEligibility({
      recordClass: 'TRAINING_RECORDS',
      clockStartedAt: new Date('2015-01-01T00:00:00Z'),
      asOf: new Date('2026-01-01T00:00:00Z'),
    })
    expect(eligibility.eligible).toBe(true)
  })

  it('runs each class on its own clock', async () => {
    // The point of holding this as data: six record types, six different
    // start-points. A single "five years from now" would be wrong for five.
    const start = new Date('2020-06-01T00:00:00Z')
    const cdd = await retentionEligibility({ recordClass: 'CDD_RECORDS', clockStartedAt: start })
    const training = await retentionEligibility({
      recordClass: 'TRAINING_RECORDS',
      clockStartedAt: start,
    })
    expect(cdd.minimumUntil).toEqual(training.minimumUntil)
    // …but they are answering about different clocks, and say so.
    expect(cdd.labelEn).not.toBe(training.labelEn)
  })

  it('never computes an eligibility date for the open-ended class', async () => {
    /*
     * REQ-AML-030 row د is "five years **or until a final decision or judgment
     * is issued, whichever is longer**". Treating the five-year mark as an
     * eligibility date would present an open legal obligation as a settled one.
     * Long-elapsed or not, it stays ineligible until a person releases it.
     */
    const longElapsed = await retentionEligibility({
      recordClass: 'SUSPICIOUS_OPERATION_RECORDS',
      clockStartedAt: new Date('1990-01-01T00:00:00Z'),
      asOf: new Date('2026-01-01T00:00:00Z'),
    })

    expect(longElapsed.requiresAuthorityRelease).toBe(true)
    expect(longElapsed.eligible).toBe(false)
  })
})

describe('legal hold', () => {
  it('refuses to be placed without a written reason', async () => {
    const ref = await aRecord()
    const result = await placeLegalHold({ ref, reason: 'x', actor: actor(auditor) })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.violation.code).toBe('LEGAL_HOLD_REASON_REQUIRED')
      // The four-part refusal, all parts present in both languages.
      for (const copy of [result.violation.ar, result.violation.en]) {
        expect(copy.blocked).toBeTruthy()
        expect(copy.why).toBeTruthy()
        expect(copy.nextStep).toBeTruthy()
        expect(copy.whoToAsk).toBeTruthy()
      }
    }
  })

  it('blocks archiving outright, whatever the retention period says', async () => {
    const ref = await aRecord()
    const placed = await placeLegalHold({
      ref,
      reason: `Held for inspection ${ns()} — records requested by the Authority.`,
      actor: actor(auditor),
    })
    expect(placed.ok).toBe(true)

    // A period that elapsed years ago. §7: a hold prevents archiving "at all,
    // regardless of date", so this must still refuse.
    const result = await assertArchivable({
      ref,
      retention: {
        recordClass: 'CDD_RECORDS',
        clockStartedAt: new Date('2000-01-01T00:00:00Z'),
      },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.violation.code).toBe('RECORD_UNDER_LEGAL_HOLD')
  })

  it('is lifted with a reason, and the row survives the lifting', async () => {
    const ref = await aRecord()
    const placed = await placeLegalHold({
      ref,
      reason: `Held pending review ${ns()} for the purposes of this test.`,
      actor: actor(auditor),
    })
    if (!placed.ok) throw new Error('the hold should have been placed')

    expect(await liftLegalHold({ holdId: placed.holdId, reason: 'no', actor: actor(auditor) })).toMatchObject({
      ok: false,
    })

    const lifted = await liftLegalHold({
      holdId: placed.holdId,
      reason: 'The Authority confirmed the records are no longer required.',
      actor: actor(auditor),
    })
    expect(lifted.ok).toBe(true)

    // Nothing is deleted: the hold is still there, carrying why it ended.
    const row = await db.legalHold.findUnique({ where: { id: placed.holdId } })
    expect(row).not.toBeNull()
    expect(row!.liftedAt).not.toBeNull()
    expect(row!.liftedReason).toContain('no longer required')

    expect(await activeHolds(ref)).toEqual([])
  })

  it('records the placing and the lifting in the audit trail', async () => {
    const ref = await aRecord()
    const placed = await placeLegalHold({
      ref,
      reason: `Audit trail check ${ns()} — this reason must appear in the trail.`,
      actor: actor(auditor),
    })
    if (!placed.ok) throw new Error('the hold should have been placed')

    await liftLegalHold({
      holdId: placed.holdId,
      reason: 'Lifted for the purposes of this test, with a stated reason.',
      actor: actor(auditor),
    })

    const events = await db.auditEvent.findMany({
      where: { entityType: ref.entityType, entityId: ref.entityId },
      orderBy: { seq: 'asc' },
    })
    const actions = events.map((e) => e.action)

    expect(actions).toContain('LEGAL_HOLD_PLACED')
    expect(actions).toContain('LEGAL_HOLD_LIFTED')
    // The reason is the point — a hold nobody can explain cannot be reviewed.
    expect(events.find((e) => e.action === 'LEGAL_HOLD_PLACED')!.reason).toContain('Audit trail check')
  })
})

describe('archive()', () => {
  it('refuses a record still inside its retention period', async () => {
    const ref = await aRecord()
    let written = false

    const result = await archive({
      ref,
      retention: { recordClass: 'CDD_RECORDS', clockStartedAt: new Date() },
      actor: actor(auditor),
      reason: 'Attempting to archive a record whose clock started today.',
      update: async () => {
        written = true
      },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.violation.code).toBe('RECORD_WITHIN_RETENTION_PERIOD')
    // The refusal must happen *before* the write, not be reported after it.
    expect(written).toBe(false)
  })

  it('archives a record whose period has elapsed, and audits it', async () => {
    const ref = await aRecord()

    const result = await archive({
      ref,
      retention: {
        recordClass: 'CDD_RECORDS',
        clockStartedAt: new Date('2001-01-01T00:00:00Z'),
      },
      actor: actor(auditor),
      reason: 'The retention period elapsed and no hold is in place.',
      update: async (tx, archivedAt) => {
        await tx.brokerEntity.update({ where: { id: ref.entityId }, data: { archivedAt } })
      },
    })

    expect(result.ok).toBe(true)

    const entity = await db.brokerEntity.findUnique({ where: { id: ref.entityId } })
    expect(entity!.archivedAt).not.toBeNull()

    const events = await db.auditEvent.findMany({
      where: { entityType: ref.entityType, entityId: ref.entityId },
    })
    expect(events.map((e) => e.action)).toContain('RECORD_ARCHIVED')
  })

  it('archives a record that carries no statutory class at all', async () => {
    // A draft line the applicant removed before submitting: none of the six
    // clocks has started, because there is no relationship to have ended.
    const ref = await aRecord()

    const result = await archive({
      ref,
      actor: actor(auditor),
      reason: 'A record with no retention class, and no hold.',
      update: async (tx, archivedAt) => {
        await tx.brokerEntity.update({ where: { id: ref.entityId }, data: { archivedAt } })
      },
    })

    expect(result.ok).toBe(true)
  })
})
