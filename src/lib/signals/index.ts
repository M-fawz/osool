import type { Signal, SignalState } from '@prisma/client'
import { db } from '@/lib/db'
import { recordAuditEvent } from '@/lib/audit'
import { roleLabel } from '@/lib/auth/roles'
import { ruleSet } from '@/lib/rules'
import { notify } from '@/lib/notifications'
import { log } from '@/lib/observability/logger'
import type { ActorContext } from '@/lib/applications/transition'
import { precondition } from '@/lib/applications/refusals'
import type { RuleViolation } from '@/lib/rules/violation'
import { applicationSubject } from '@/lib/notifications/subjects'
import { DETECTORS } from './detectors'
import type { DetectorContext, SignalCandidate } from './types'

/**
 * The signals engine.
 *
 * 02-SYSTEM-ARCHITECTURE §8, and it is worth quoting because the sentence is
 * the specification: "A signal is never an accusation and never triggers an
 * automatic action. Dismissal requires a written reason. Escalation creates a
 * case. Both are audited. The interface must say this in words, on the screen —
 * not just in documentation."
 *
 * Everything in this module follows from that:
 *
 *   · **Nothing acts on a signal.** No status changes, no refusals, no
 *     restrictions. A signal is written to a table and put in front of a
 *     person. CLAUDE.md rule 8.
 *   · **Disposal needs a reason**, enforced by the signature: there is no way
 *     to call `disposeSignal` without one.
 *   · **The routing respects REQ-AML-021.** Signals about the supervised
 *     population go to the AML supervisor; signals about the Authority's own
 *     process go to the internal auditor. Neither ever reaches a broker, and
 *     no message about a signal names what was found — the detail is inside the
 *     authenticated system only.
 *
 * ── Raising the same finding twice ───────────────────────────────────────
 *
 * A detector runs on a schedule and will find the same thing every time until
 * somebody deals with it. Re-raising would bury the queue in duplicates and
 * make "seventeen signals" mean "one signal, seventeen sweeps".
 *
 * So a candidate is matched against any *live* signal — OPEN or UNDER_REVIEW —
 * of the same type on the same subject. A dismissed signal does not suppress a
 * fresh one: if the facts recur after an officer has written them off, that is
 * new information and the officer should see it again.
 */

export interface SweepResult {
  ranAt: Date
  ruleSetVersion: number
  raised: number
  alreadyOpen: number
  byDetector: Array<{ key: string; found: number; raised: number; ms: number }>
}

/**
 * Run every detector and raise what is new.
 *
 * A detector that throws does not stop the sweep. They are independent
 * questions, and one broken query should not mean the other ten findings go
 * unreported — that is how a supervisory system quietly stops supervising.
 */
export async function sweepSignals(
  options: { now?: Date; notifySupervisors?: boolean } = {},
): Promise<SweepResult> {
  const now = options.now ?? new Date()
  const notifySupervisors = options.notifySupervisors ?? true

  const parameters = await ruleSet<Record<string, unknown>>('INTEGRITY_SIGNALS', { asOf: now })

  const context: DetectorContext = {
    now,
    parameters: new Map(parameters.items.map((item) => [item.key, item.payload])),
    ruleSetId: parameters.id,
    ruleSetVersion: parameters.version,
  }

  const result: SweepResult = {
    ranAt: now,
    ruleSetVersion: parameters.version,
    raised: 0,
    alreadyOpen: 0,
    byDetector: [],
  }

  for (const detector of DETECTORS) {
    const started = Date.now()
    let candidates: SignalCandidate[] = []

    try {
      candidates = await detector.run(context)
    } catch (error) {
      log.error({
        event: 'signals.detector.failed',
        detector: detector.key,
        outcome: 'failed',
        error: (error as Error).message,
      })
      result.byDetector.push({ key: detector.key, found: 0, raised: 0, ms: Date.now() - started })
      continue
    }

    let raised = 0
    for (const candidate of candidates) {
      const outcome = await raiseSignal(candidate, context, { notifySupervisors })
      if (outcome === 'RAISED') raised += 1
      else result.alreadyOpen += 1
    }

    result.raised += raised
    result.byDetector.push({
      key: detector.key,
      found: candidates.length,
      raised,
      ms: Date.now() - started,
    })
  }

  log.info({
    event: 'signals.swept',
    outcome: 'ok',
    raised: result.raised,
    alreadyOpen: result.alreadyOpen,
    ruleSetVersion: result.ruleSetVersion,
  })

  return result
}

/** Raise one candidate, unless the same finding is already live. */
async function raiseSignal(
  candidate: SignalCandidate,
  context: DetectorContext,
  options: { notifySupervisors: boolean },
): Promise<'RAISED' | 'ALREADY_OPEN'> {
  const existing = await db.signal.findFirst({
    where: {
      signalType: candidate.signalType,
      state: { in: ['OPEN', 'UNDER_REVIEW'] },
      archivedAt: null,
      ...(candidate.applicationId ? { applicationId: candidate.applicationId } : {}),
      ...(candidate.subjectId ? { subjectId: candidate.subjectId } : {}),
    },
    select: { id: true },
  })

  if (existing) return 'ALREADY_OPEN'

  const signal = await db.signal.create({
    data: {
      signalType: candidate.signalType,
      family: candidate.family,
      severity: candidate.severity,
      state: 'OPEN',
      applicationId: candidate.applicationId ?? null,
      brokerageContractId: candidate.brokerageContractId ?? null,
      subjectType: candidate.subjectType ?? null,
      subjectId: candidate.subjectId ?? null,
      evidence: {
        ...candidate.evidence,
        summaryAr: candidate.summaryAr,
        summaryEn: candidate.summaryEn,
      },
      ruleSetId: context.ruleSetId,
    },
  })

  await recordAuditEvent({
    action: 'SIGNAL_RAISED',
    entityType: 'Signal',
    entityId: signal.id,
    // No user acted. The sweep says so rather than borrowing a name.
    actorLabel: 'Integrity signals sweep (no person acted)',
    toState: 'OPEN',
    reason: candidate.summaryEn,
    ruleSetVersions: { INTEGRITY_SIGNALS: context.ruleSetVersion },
    payload: {
      signalType: candidate.signalType,
      family: candidate.family,
      severity: candidate.severity,
      applicationId: candidate.applicationId ?? null,
    },
  })

  if (options.notifySupervisors) {
    await notify({
      // REQ-AML-021 in the routing: the supervised-population family goes to
      // the AML supervisor, the process family to the internal auditor, and
      // neither ever reaches a broker.
      event:
        candidate.family === 'SUPERVISED_POPULATION'
          ? 'SUPERVISORY_CONCERN_RAISED'
          : 'PROCESS_INTEGRITY_CONCERN_RAISED',
      subject: {
        signal: {
          id: signal.id,
          signalType: candidate.signalType,
          severity: candidate.severity,
          family: candidate.family,
          titleAr: String(context.parameters.get(candidate.signalType)?.labelAr ?? candidate.signalType),
          titleEn: String(context.parameters.get(candidate.signalType)?.labelEn ?? candidate.signalType),
          summaryAr: candidate.summaryAr,
          summaryEn: candidate.summaryEn,
        },
        application: candidate.applicationId
          ? await applicationSubject(candidate.applicationId)
          : undefined,
      },
    })
  }

  return 'RAISED'
}

// ── What a person does about one ───────────────────────────────────────────

export type SignalOutcome = { ok: true } | { ok: false; violation: RuleViolation }

function notLive(state: SignalState): RuleViolation {
  return precondition({
    code: 'SIGNAL_NOT_LIVE',
    requirementIds: ['REQ-AML-013'],
    legalSource: '02-SYSTEM-ARCHITECTURE §8 — the signal lifecycle',
    evidence: { state },
    ar: {
      blocked: 'تعذّر تحديث هذه الإشارة.',
      why: `حالة الإشارة الآن «${state}»، وقد سبق البتّ فيها. لا تُعاد الإشارات المغلقة إلى الفحص؛ يُفتح بدلاً منها فحص جديد إن تكررت الوقائع.`,
      nextStep: 'أعد تحميل قائمة الإشارات لعرض حالتها الحالية.',
    },
    en: {
      blocked: 'This signal could not be updated.',
      why: `It currently stands as "${state}" and has already been disposed of. Closed signals are not reopened; if the facts recur, a fresh signal is raised.`,
      nextStep: 'Reload the signals queue to see the current state.',
    },
  })
}

/** Take a signal for review. A claim, not a conclusion. */
export async function takeSignalForReview(
  actor: ActorContext,
  signalId: string,
): Promise<SignalOutcome> {
  const signal = await db.signal.findUnique({ where: { id: signalId }, select: { state: true } })
  if (!signal || signal.state !== 'OPEN') return { ok: false, violation: notLive(signal?.state ?? 'DISMISSED_WITH_REASON') }

  await db.$transaction(async (tx) => {
    await tx.signal.update({ where: { id: signalId }, data: { state: 'UNDER_REVIEW' } })
    await recordAuditEvent(
      {
        action: 'SIGNAL_TAKEN_FOR_REVIEW',
        entityType: 'Signal',
        entityId: signalId,
        actorUserId: actor.userId,
        actorRole: actor.role,
        actorLabel: `${actor.name} (${roleLabel(actor.role).en})`,
        fromState: 'OPEN',
        toState: 'UNDER_REVIEW',
        reason: 'Taken for review.',
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      },
      tx,
    )
  })

  return { ok: true }
}

/**
 * Dispose of a signal — dismiss it, or escalate it.
 *
 * The reason is a required parameter of the function, not a validated field on
 * a form. §8: "Dismissal requires a written reason." A control expressed in the
 * type system cannot be forgotten by the next caller.
 */
export async function disposeSignal(
  actor: ActorContext,
  input: {
    signalId: string
    disposition: 'DISMISS' | 'ESCALATE'
    reason: string
  },
): Promise<SignalOutcome> {
  const trimmed = input.reason.trim()

  if (trimmed.length < 10) {
    return {
      ok: false,
      violation: precondition({
        code: 'DISPOSITION_REASON_REQUIRED',
        requirementIds: ['REQ-AML-013'],
        legalSource: '02-SYSTEM-ARCHITECTURE §8 — "Dismissal requires a written reason"',
        ar: {
          blocked: 'تعذّر إغلاق الإشارة.',
          why: 'إغلاق الإشارة يستلزم سبباً مكتوباً يوضّح ما فُحص وما انتهى إليه الفحص. السبب المكتوب هو ما يجعل قرار الحفظ قابلاً للمراجعة لاحقاً.',
          nextStep: 'اكتب سبباً موجزاً ومحدداً — ما الذي راجعته، وما الذي وجدته — ثم أعد المحاولة.',
        },
        en: {
          blocked: 'The signal could not be closed.',
          why: 'Closing a signal requires a written reason stating what was examined and what was concluded. The written reason is what makes the decision reviewable later.',
          nextStep: 'Write a short, specific reason — what you checked and what you found — and try again.',
        },
      }),
    }
  }

  const signal = await db.signal.findUnique({
    where: { id: input.signalId },
    select: { state: true, signalType: true, family: true, applicationId: true },
  })

  if (!signal || (signal.state !== 'OPEN' && signal.state !== 'UNDER_REVIEW')) {
    return { ok: false, violation: notLive(signal?.state ?? 'DISMISSED_WITH_REASON') }
  }

  const toState: SignalState = input.disposition === 'DISMISS' ? 'DISMISSED_WITH_REASON' : 'ESCALATED'

  await db.$transaction(async (tx) => {
    await tx.signal.update({
      where: { id: input.signalId },
      data: {
        state: toState,
        disposedByUserId: actor.userId,
        disposedAt: new Date(),
        dispositionReason: trimmed,
      },
    })

    await recordAuditEvent(
      {
        action: input.disposition === 'DISMISS' ? 'SIGNAL_DISMISSED' : 'SIGNAL_ESCALATED',
        entityType: 'Signal',
        entityId: input.signalId,
        actorUserId: actor.userId,
        actorRole: actor.role,
        actorLabel: `${actor.name} (${roleLabel(actor.role).en})`,
        fromState: signal.state,
        toState,
        reason: trimmed,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        payload: { signalType: signal.signalType, family: signal.family },
      },
      tx,
    )
  })

  return { ok: true }
}

// ── Reading the queue ──────────────────────────────────────────────────────

export interface SignalFilters {
  state?: SignalState | null
  family?: Signal['family'] | null
  severity?: Signal['severity'] | null
}

export async function loadSignals(input: {
  filters: SignalFilters
  page?: { skip: number; take: number }
}) {
  const where = {
    archivedAt: null,
    ...(input.filters.state ? { state: input.filters.state } : {}),
    ...(input.filters.family ? { family: input.filters.family } : {}),
    ...(input.filters.severity ? { severity: input.filters.severity } : {}),
  }

  const [total, rows] = await Promise.all([
    db.signal.count({ where }),
    db.signal.findMany({
      where,
      // Most severe first, then oldest — a HIGH signal from last week outranks
      // a LOW one from this morning, and within a severity the one that has
      // been waiting longest is the one to look at.
      orderBy: [{ severity: 'desc' }, { detectedAt: 'asc' }],
      skip: input.page?.skip ?? 0,
      take: input.page?.take ?? 50,
      include: {
        application: {
          select: {
            id: true,
            temporaryNumber: true,
            entityData: { select: { tradeNameAr: true } },
            brokerEntity: { select: { tradeNameAr: true } },
          },
        },
        disposedBy: { select: { name: true, nameAr: true } },
      },
    }),
  ])

  return { rows, total }
}

export { DETECTORS } from './detectors'
export type { SignalCandidate } from './types'
