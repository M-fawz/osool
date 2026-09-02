import { describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { disposeSignal, sweepSignals, takeSignalForReview } from '@/lib/signals'
import { DETECTORS } from '@/lib/signals/detectors'
import { performDecision, performRecommend, saveExaminationRecord } from '@/lib/applications/workflow'
import { actor, makeApplication, makeBroker, makeUser } from '../support/fixtures'

/**
 * Phase 2 — the integrity signals engine.
 *
 * Two things have to be true and they pull in opposite directions:
 *
 *   · the detectors have to actually fire on the shapes 00-VISION §5 names —
 *     a supervisory system whose detectors never find anything reads on a
 *     dashboard as "nothing wrong";
 *   · nothing may *follow* from a signal automatically. CLAUDE.md rule 8 and
 *     §8: "A signal is never an accusation and never triggers an automatic
 *     action."
 *
 * So every test below checks both: that the finding was raised, and that the
 * subject of it was left exactly as it stood.
 */

describe('the detector catalogue', () => {
  it('names what each detector looks for, so the QA matrix can print it', () => {
    expect(DETECTORS.length).toBeGreaterThan(0)
    for (const detector of DETECTORS) {
      expect(detector.key, 'every detector has a rule-item key').toBeTruthy()
      expect(detector.looksFor, `${detector.key} does not say what it looks for`).toBeTruthy()
    }
  })

  it('is configured entirely from the versioned rule set, with no constants in code', async () => {
    const ruleSet = await db.ruleSet.findFirstOrThrow({
      where: { code: 'INTEGRITY_SIGNALS' },
      include: { items: true },
    })

    const configured = new Set(ruleSet.items.map((i) => i.key))
    for (const detector of DETECTORS) {
      expect(configured.has(detector.key), `${detector.key} has no rule item`).toBe(true)
    }
  })

  it('marks every operational parameter as operational, never as law', async () => {
    const items = await db.ruleItem.findMany({
      where: { ruleSet: { code: 'INTEGRITY_SIGNALS' } },
    })

    for (const item of items) {
      const payload = item.payload as { basis?: string; legalSource?: string }
      expect(['LEGAL', 'OPERATIONAL']).toContain(payload.basis)
      // Only the one signal whose rule genuinely comes from a decree may cite
      // one. Everything else must not, and this is the assertion that stops a
      // future edit quietly dressing a chosen number as a requirement.
      if (payload.basis === 'OPERATIONAL') {
        expect(payload.legalSource).toBeUndefined()
      }
    }
  })
})

describe('signal 14 — an attempt to decide a file you examined', () => {
  it('records the attempt, refuses the act, and raises a signal', async () => {
    const { entity } = await makeBroker()
    const bothHats = await makeUser({ role: 'REVIEWER' })

    const application = await makeApplication({
      brokerEntityId: entity.id,
      status: 'UNDER_REVIEW',
      examinerId: bothHats.id,
    })

    const refusal = await performDecision(actor(bothHats), {
      applicationId: application.id,
      decision: 'APPROVE',
      note: 'Trying to approve my own examination.',
    })

    // Refused, and nothing moved.
    expect(refusal.ok).toBe(false)
    if (!refusal.ok) expect(refusal.violation.code).toBe('SEGREGATION_OF_DUTIES')
    const after = await db.application.findUniqueOrThrow({ where: { id: application.id } })
    expect(after.status).toBe('UNDER_REVIEW')
    expect(after.reviewerId).toBeNull()

    // The attempt is in the trail — which is the part the refusal alone does
    // not give anybody.
    const attempt = await db.auditEvent.findFirst({
      where: { entityId: application.id, action: 'SEGREGATION_OF_DUTIES_REFUSED' },
    })
    expect(attempt).not.toBeNull()

    await sweepSignals({ notifySupervisors: false })

    const signal = await db.signal.findFirst({
      where: { applicationId: application.id, signalType: 'SEGREGATION_OF_DUTIES_ATTEMPT' },
    })
    expect(signal).not.toBeNull()
    expect(signal!.family).toBe('PROCESS_INTEGRITY')
    expect(signal!.state).toBe('OPEN')
  })
})

describe('signal 12 — an implausibly fast decision', () => {
  it('raises on a decision taken seconds after the file arrived, and changes nothing', async () => {
    const { entity } = await makeBroker()
    const examiner = await makeUser({ role: 'EXAMINER' })
    const reviewer = await makeUser({ role: 'REVIEWER' })

    const application = await makeApplication({
      brokerEntityId: entity.id,
      status: 'UNDER_EXAMINATION',
      examinerId: examiner.id,
    })

    await saveExaminationRecord(actor(examiner), {
      applicationId: application.id,
      originalCount: 1,
      copyCount: 1,
      brokerageNature: ['SELL'],
      proposedValidFrom: new Date('2026-01-01'),
      proposedValidTo: new Date('2031-01-01'),
      recommendation: 'RECOMMEND_APPROVAL',
      examinerNote: null,
      verifiedFieldKeys: [],
    })

    // Sign off and decide immediately — the shape the signal exists to see.
    await performRecommend(actor(examiner), { applicationId: application.id })
    await performDecision(actor(reviewer), {
      applicationId: application.id,
      decision: 'APPROVE',
      note: 'Approved.',
    })

    await sweepSignals({ notifySupervisors: false })

    const signal = await db.signal.findFirst({
      where: { applicationId: application.id, signalType: 'IMPLAUSIBLE_DECISION_SPEED' },
    })
    expect(signal).not.toBeNull()
    expect(signal!.severity).toBe('HIGH')

    const evidence = signal!.evidence as { minutesOnDesk: number; parameterMinutes: number }
    expect(evidence.minutesOnDesk).toBeLessThan(evidence.parameterMinutes)

    // The approval stands. A signal never undoes a decision. CLAUDE.md rule 8.
    const after = await db.application.findUniqueOrThrow({ where: { id: application.id } })
    expect(after.status).toBe('APPROVED')
    expect(after.reviewerId).toBe(reviewer.id)
  })
})

describe('raising the same finding twice', () => {
  it('does not duplicate a signal that is still live', async () => {
    const { entity } = await makeBroker()
    const reviewer = await makeUser({ role: 'REVIEWER' })
    const application = await makeApplication({
      brokerEntityId: entity.id,
      status: 'UNDER_REVIEW',
      examinerId: reviewer.id,
    })

    await performDecision(actor(reviewer), {
      applicationId: application.id,
      decision: 'APPROVE',
      note: 'Attempt.',
    })

    await sweepSignals({ notifySupervisors: false })
    await sweepSignals({ notifySupervisors: false })
    await sweepSignals({ notifySupervisors: false })

    const signals = await db.signal.findMany({
      where: { applicationId: application.id, signalType: 'SEGREGATION_OF_DUTIES_ATTEMPT' },
    })
    expect(signals).toHaveLength(1)
  })
})

describe('what a person does about a signal', () => {
  it('refuses to close one without a written reason', async () => {
    const supervisor = await makeUser({ role: 'AML_SUPERVISOR' })
    const signal = await db.signal.create({
      data: {
        signalType: 'DORMANT_REGISTRATION',
        family: 'SUPERVISED_POPULATION',
        severity: 'LOW',
        state: 'OPEN',
        subjectType: 'Registration',
        subjectId: `test-${Date.now()}`,
        evidence: { test: true },
      },
    })

    const bare = await disposeSignal(actor(supervisor), {
      signalId: signal.id,
      disposition: 'DISMISS',
      reason: 'ok',
    })

    expect(bare.ok).toBe(false)
    if (!bare.ok) {
      expect(bare.violation.code).toBe('DISPOSITION_REASON_REQUIRED')
      expect(bare.violation.ar.why).toBeTruthy()
      expect(bare.violation.en.nextStep).toBeTruthy()
    }

    const untouched = await db.signal.findUniqueOrThrow({ where: { id: signal.id } })
    expect(untouched.state).toBe('OPEN')
  })

  it('records who dismissed it, when, and why', async () => {
    const supervisor = await makeUser({ role: 'AML_SUPERVISOR' })
    const signal = await db.signal.create({
      data: {
        signalType: 'DORMANT_REGISTRATION',
        family: 'SUPERVISED_POPULATION',
        severity: 'LOW',
        state: 'OPEN',
        subjectType: 'Registration',
        subjectId: `test-${Date.now()}-${Math.random()}`,
        evidence: { test: true },
      },
    })

    expect(await takeSignalForReview(actor(supervisor), signal.id)).toEqual({ ok: true })

    const reason =
      'Checked the firm against the contract register: the two contracts were registered under the predecessor entity before the merger.'
    expect(
      await disposeSignal(actor(supervisor), {
        signalId: signal.id,
        disposition: 'DISMISS',
        reason,
      }),
    ).toEqual({ ok: true })

    const closed = await db.signal.findUniqueOrThrow({ where: { id: signal.id } })
    expect(closed.state).toBe('DISMISSED_WITH_REASON')
    expect(closed.disposedByUserId).toBe(supervisor.id)
    expect(closed.dispositionReason).toBe(reason)
    expect(closed.disposedAt).not.toBeNull()

    const audited = await db.auditEvent.findFirst({
      where: { entityId: signal.id, action: 'SIGNAL_DISMISSED' },
    })
    expect(audited).not.toBeNull()
    expect(audited!.reason).toBe(reason)

    // Closed signals are not reopened.
    const again = await takeSignalForReview(actor(supervisor), signal.id)
    expect(again.ok).toBe(false)
  })

  it('escalates with a reason, and records that too', async () => {
    const supervisor = await makeUser({ role: 'AML_SUPERVISOR' })
    const signal = await db.signal.create({
      data: {
        signalType: 'IDENTITY_REUSE_ACROSS_ENTITIES',
        family: 'SUPERVISED_POPULATION',
        severity: 'MEDIUM',
        state: 'OPEN',
        subjectType: 'PartyIdentity',
        subjectId: `test-${Date.now()}-${Math.random()}`,
        evidence: { distinctFirms: 6 },
      },
    })

    expect(
      await disposeSignal(actor(supervisor), {
        signalId: signal.id,
        disposition: 'ESCALATE',
        reason: 'Six unrelated firms with one signatory and no disclosed relationship. Referred for inspection.',
      }),
    ).toEqual({ ok: true })

    const closed = await db.signal.findUniqueOrThrow({ where: { id: signal.id } })
    expect(closed.state).toBe('ESCALATED')
  })
})

describe('the sweep itself', () => {
  it('runs every detector and reports what each one did', async () => {
    const result = await sweepSignals({ notifySupervisors: false })

    expect(result.byDetector).toHaveLength(DETECTORS.length)
    expect(result.ruleSetVersion).toBeGreaterThanOrEqual(1)
    for (const entry of result.byDetector) {
      expect(entry.found).toBeGreaterThanOrEqual(0)
      expect(entry.raised).toBeLessThanOrEqual(entry.found)
    }
  })

  it('never changes an application it raised a signal about', async () => {
    const before = await db.application.findMany({
      select: { id: true, status: true },
      orderBy: { createdAt: 'desc' },
      take: 40,
    })

    await sweepSignals({ notifySupervisors: false })

    const after = await db.application.findMany({
      where: { id: { in: before.map((a) => a.id) } },
      select: { id: true, status: true },
    })

    const byId = new Map(after.map((a) => [a.id, a.status]))
    for (const application of before) {
      expect(byId.get(application.id)).toBe(application.status)
    }
  })
})
