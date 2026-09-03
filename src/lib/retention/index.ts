import { db, type Tx } from '@/lib/db'
import { recordAuditEvent } from '@/lib/audit'
import { roleLabel } from '@/lib/auth/roles'
import { ruleSet } from '@/lib/rules'
import { precondition } from '@/lib/applications/refusals'
import type { RuleViolation } from '@/lib/rules/violation'
import type { ActorContext } from '@/lib/applications/transition'

/**
 * Retention lock and legal hold — REQ-AML-030, REQ-AML-031, REQ-DPA-003.
 *
 * CLAUDE.md rule 2 names three operations and this product had one of them.
 * `archivedAt` was read in forty-one places and written in one; `retentionUntil`
 * and `legalHold` existed as columns on every table and were never read and
 * never written by anything. Two thirds of the stated retention posture was
 * schema. A documented control that does not exist is worse than no control,
 * because everyone downstream builds on the belief that it is there.
 *
 * 02-SYSTEM-ARCHITECTURE §7 defines the three:
 *
 *   · Archive        — out of working views, fully retrievable, clock running
 *   · Retention lock — cannot be archived or altered until the eligibility date
 *   · Legal hold     — cannot be archived at all, whatever the date, until it
 *                      is lifted *with a reason*
 *
 * ── Where the periods come from ───────────────────────────────────────────
 *
 * The `RETENTION` rule set, which was already seeded and already correct: six
 * record classes with six *different* clocks, because end of relationship, end
 * of operation, date of report, date of sending, date of the shelving decision
 * and end of the training programme are six different moments. Nothing here
 * hard-codes five years — CLAUDE.md rule 4.
 *
 * Row د is open-ended: five years *or until a final decision or judgment is
 * issued, whichever is longer*. That is not computable from a date, so this
 * module refuses to pretend it is. `requiresAuthorityRelease` records that the
 * five-year mark is a *floor* and not an eligibility date, and a record of that
 * class stays ineligible until a person releases it. Returning a computed date
 * there would present an open legal obligation as a settled one, which is the
 * precise failure mode the brief warns about.
 *
 * ── One writer ────────────────────────────────────────────────────────────
 *
 * `archive()` is the only thing in this codebase that may set `archivedAt`, in
 * the same way `transition()` is the only writer of `application.status`. That
 * is deliberate: F-03/F-04 were caused by a control living at the call sites,
 * where it was reliably forgotten. `npm run audit:one-archiver` fails the build
 * if a stray `archivedAt:` write appears outside this file.
 */

/** The rule set's six record classes. */
export type RecordClass =
  | 'CDD_RECORDS'
  | 'OPERATION_RECORDS'
  | 'UNUSUAL_OPERATION_REPORTS'
  | 'SUSPICIOUS_OPERATION_RECORDS'
  | 'SHELVED_REPORT_RECORDS'
  | 'TRAINING_RECORDS'

interface RetentionPayload {
  minimumYears?: number
  clockStarts?: string
  clockStartsEn?: string
  requiresAuthorityRelease?: boolean
  labelAr?: string
  labelEn?: string
  heldByPlatform?: boolean
  openEndedNote?: string
}

export interface RetentionEligibility {
  recordClass: RecordClass
  /** When the minimum period elapses. Never null — but see `eligible`. */
  minimumUntil: Date
  /**
   * Whether the record may be archived *as far as retention is concerned*.
   *
   * False while the minimum period runs. Also false, permanently, for a class
   * whose end is set by an authority rather than by arithmetic: for those the
   * date above is a floor, and `requiresAuthorityRelease` says so.
   */
  eligible: boolean
  requiresAuthorityRelease: boolean
  minimumYears: number
  clockStartedAt: Date
  ruleSetVersion: number
  labelEn: string
}

/**
 * When a record of this class, whose clock started then, becomes eligible.
 *
 * `asOf` dates the *rule lookup*, not the record: a retention decision taken
 * today is judged under the periods in force today, and one replayed for an
 * inspector is judged under the periods in force when it was taken.
 */
export async function retentionEligibility(input: {
  recordClass: RecordClass
  clockStartedAt: Date
  asOf?: Date
  tx?: Tx
}): Promise<RetentionEligibility> {
  const asOf = input.asOf ?? new Date()
  const set = await ruleSet<RetentionPayload>('RETENTION', { asOf, tx: input.tx })
  const item = set.byKey.get(input.recordClass)

  if (!item) {
    throw new Error(
      `RETENTION rule set version ${set.version} has no class ${input.recordClass}. ` +
        'A retention period cannot be invented here — add it to the rule set.',
    )
  }

  const minimumYears = item.payload.minimumYears ?? 5
  const requiresAuthorityRelease = item.payload.requiresAuthorityRelease === true

  const minimumUntil = new Date(input.clockStartedAt)
  minimumUntil.setUTCFullYear(minimumUntil.getUTCFullYear() + minimumYears)

  return {
    recordClass: input.recordClass,
    minimumUntil,
    // The open-ended classes never become eligible by the passage of time
    // alone. Saying otherwise would turn "whichever is longer" into "five
    // years", which is not what the instrument says.
    eligible: requiresAuthorityRelease ? false : asOf >= minimumUntil,
    requiresAuthorityRelease,
    minimumYears,
    clockStartedAt: input.clockStartedAt,
    ruleSetVersion: set.version,
    labelEn: item.payload.labelEn ?? input.recordClass,
  }
}

// ── Legal hold ──────────────────────────────────────────────────────────────

export interface HoldRef {
  entityType: string
  entityId: string
}

/** Every hold on this record that has not been lifted. */
export async function activeHolds(ref: HoldRef, tx?: Tx) {
  return (tx ?? db).legalHold.findMany({
    where: { entityType: ref.entityType, entityId: ref.entityId, liftedAt: null },
    orderBy: { placedAt: 'asc' },
  })
}

/**
 * Place a hold. The reason is required by the type, not by a convention.
 *
 * A hold with no stated reason cannot be reviewed, cannot be lifted with
 * confidence by anyone but its author, and is indistinguishable from a mistake
 * once that person leaves.
 */
export async function placeLegalHold(input: {
  ref: HoldRef
  reason: string
  actor: ActorContext
}): Promise<{ ok: true; holdId: string } | { ok: false; violation: RuleViolation }> {
  const reason = input.reason.trim()
  if (reason.length < 10) {
    return { ok: false, violation: holdNeedsReason('placed') }
  }

  const hold = await db.legalHold.create({
    data: {
      entityType: input.ref.entityType,
      entityId: input.ref.entityId,
      reason,
      placedByUserId: input.actor.userId,
    },
  })

  await recordAuditEvent({
    action: 'LEGAL_HOLD_PLACED',
    entityType: input.ref.entityType,
    entityId: input.ref.entityId,
    actorUserId: input.actor.userId,
    actorRole: input.actor.role,
    actorLabel: `${input.actor.name} (${roleLabel(input.actor.role).en})`,
    reason,
    ipAddress: input.actor.ipAddress,
    userAgent: input.actor.userAgent,
    payload: { holdId: hold.id },
  })

  return { ok: true, holdId: hold.id }
}

/**
 * Lift a hold, with a written reason — 02-SYSTEM-ARCHITECTURE §7.
 *
 * The row is not removed. It gains `liftedAt` and `liftedReason`, so the
 * register can always answer why a record stopped being held, which is the
 * question an inspector actually asks.
 */
export async function liftLegalHold(input: {
  holdId: string
  reason: string
  actor: ActorContext
}): Promise<{ ok: true } | { ok: false; violation: RuleViolation }> {
  const reason = input.reason.trim()
  if (reason.length < 10) {
    return { ok: false, violation: holdNeedsReason('lifted') }
  }

  const hold = await db.legalHold.findUnique({ where: { id: input.holdId } })
  if (!hold || hold.liftedAt) {
    return { ok: false, violation: holdNotOpen() }
  }

  await db.legalHold.update({
    where: { id: hold.id },
    data: { liftedAt: new Date(), liftedReason: reason },
  })

  await recordAuditEvent({
    action: 'LEGAL_HOLD_LIFTED',
    entityType: hold.entityType,
    entityId: hold.entityId,
    actorUserId: input.actor.userId,
    actorRole: input.actor.role,
    actorLabel: `${input.actor.name} (${roleLabel(input.actor.role).en})`,
    reason,
    ipAddress: input.actor.ipAddress,
    userAgent: input.actor.userAgent,
    payload: { holdId: hold.id, placedAt: hold.placedAt.toISOString() },
  })

  return { ok: true }
}

// ── The guard, and the one writer ───────────────────────────────────────────

export interface ArchiveCheck {
  ref: HoldRef
  /** Omit where the record carries no statutory retention class. */
  retention?: { recordClass: RecordClass; clockStartedAt: Date }
  asOf?: Date
  tx?: Tx
}

/**
 * May this record be archived right now?
 *
 * Legal hold is checked first and wins outright: §7 says a held record cannot
 * be archived *at all, regardless of date*, so an elapsed retention period does
 * not release it.
 */
export async function assertArchivable(
  check: ArchiveCheck,
): Promise<{ ok: true } | { ok: false; violation: RuleViolation }> {
  const asOf = check.asOf ?? new Date()

  const holds = await activeHolds(check.ref, check.tx)
  if (holds.length > 0) {
    return { ok: false, violation: underLegalHold(holds.length) }
  }

  if (check.retention) {
    const eligibility = await retentionEligibility({
      ...check.retention,
      asOf,
      tx: check.tx,
    })
    if (!eligibility.eligible) {
      return { ok: false, violation: underRetention(eligibility) }
    }
  }

  return { ok: true }
}

/**
 * Archive a record. The only writer of `archivedAt` in this codebase.
 *
 * `update` receives a transaction handle and does the model-specific write —
 * Prisma has no polymorphic update, and a switch over forty models here would
 * be worse than passing the one line that differs.
 */
export async function archive(input: {
  ref: HoldRef
  retention?: { recordClass: RecordClass; clockStartedAt: Date }
  actor: ActorContext
  reason: string
  update: (tx: Tx, archivedAt: Date) => Promise<unknown>
}): Promise<{ ok: true } | { ok: false; violation: RuleViolation }> {
  const permitted = await assertArchivable({ ref: input.ref, retention: input.retention })
  if (!permitted.ok) return permitted

  const archivedAt = new Date()
  await db.$transaction(async (tx) => {
    await input.update(tx, archivedAt)
  })

  await recordAuditEvent({
    action: 'RECORD_ARCHIVED',
    entityType: input.ref.entityType,
    entityId: input.ref.entityId,
    actorUserId: input.actor.userId,
    actorRole: input.actor.role,
    actorLabel: `${input.actor.name} (${roleLabel(input.actor.role).en})`,
    reason: input.reason,
    ipAddress: input.actor.ipAddress,
    userAgent: input.actor.userAgent,
    payload: { recordClass: input.retention?.recordClass ?? null },
  })

  return { ok: true }
}

// ── Refusals ────────────────────────────────────────────────────────────────

const LEGAL_SOURCE = 'Regulatory Controls for Real Estate Brokers, §خامساً (REQ-AML-030)'

function underLegalHold(count: number): RuleViolation {
  return precondition({
    code: 'RECORD_UNDER_LEGAL_HOLD',
    requirementIds: ['REQ-AML-030', 'REQ-AML-031'],
    legalSource: LEGAL_SOURCE,
    ar: {
      blocked: 'لا يمكن أرشفة هذا السجل.',
      why: 'السجل خاضع لحفظ قانوني، والحفظ القانوني يمنع الأرشفة أياً كانت مدة الاحتفاظ المنقضية.',
      nextStep: 'إذا انتهت دواعي الحفظ، يُرفع الحفظ القانوني أولاً بسبب مكتوب، ثم تُعاد المحاولة.',
    },
    en: {
      blocked: 'This record cannot be archived.',
      why: 'It is under a legal hold, and a hold prevents archiving whatever retention period has elapsed.',
      nextStep:
        'If the hold is no longer needed, lift it first with a written reason, then try again.',
    },
    evidence: { activeHolds: count },
  })
}

function underRetention(eligibility: RetentionEligibility): RuleViolation {
  const until = eligibility.minimumUntil.toISOString().slice(0, 10)

  if (eligibility.requiresAuthorityRelease) {
    return precondition({
      code: 'RETENTION_REQUIRES_AUTHORITY_RELEASE',
      requirementIds: ['REQ-AML-030'],
      legalSource: LEGAL_SOURCE,
      ar: {
        blocked: 'لا يمكن أرشفة هذا السجل.',
        why: `مدة الاحتفاظ لهذه الفئة هي ${eligibility.minimumYears} سنوات أو حتى صدور قرار أو حكم نهائي، أيهما أطول، فلا يكفي مضيّ المدة وحدها.`,
        nextStep: 'يلزم إفادة من الجهة المختصة بانتهاء الحاجة إلى السجل قبل الأرشفة.',
      },
      en: {
        blocked: 'This record cannot be archived.',
        why: `Its class is retained for ${eligibility.minimumYears} years or until a final decision or judgment is issued, whichever is longer, so the passage of time alone does not release it.`,
        nextStep:
          'A release from the competent authority is required before this record can be archived.',
      },
      evidence: {
        recordClass: eligibility.recordClass,
        minimumUntil: until,
        ruleSetVersion: eligibility.ruleSetVersion,
      },
    })
  }

  return precondition({
    code: 'RECORD_WITHIN_RETENTION_PERIOD',
    requirementIds: ['REQ-AML-030'],
    legalSource: LEGAL_SOURCE,
    ar: {
      blocked: 'لا يمكن أرشفة هذا السجل بعد.',
      why: `مدة الاحتفاظ لهذه الفئة ${eligibility.minimumYears} سنوات ولم تنقضِ بعد؛ تنتهي في ${until}.`,
      nextStep: `يمكن أرشفة السجل اعتباراً من ${until}.`,
    },
    en: {
      blocked: 'This record cannot be archived yet.',
      why: `Its class is retained for ${eligibility.minimumYears} years and that period has not elapsed; it ends on ${until}.`,
      nextStep: `The record can be archived from ${until}.`,
    },
    evidence: {
      recordClass: eligibility.recordClass,
      minimumUntil: until,
      ruleSetVersion: eligibility.ruleSetVersion,
    },
  })
}

function holdNeedsReason(action: 'placed' | 'lifted'): RuleViolation {
  return precondition({
    code: 'LEGAL_HOLD_REASON_REQUIRED',
    requirementIds: ['REQ-AML-031'],
    legalSource: '02-SYSTEM-ARCHITECTURE §7',
    ar: {
      blocked: action === 'placed' ? 'لم يُوضع الحفظ القانوني.' : 'لم يُرفع الحفظ القانوني.',
      why: 'كل وضع أو رفع للحفظ القانوني يستلزم سبباً مكتوباً يُقيَّد في سجل المراجعة.',
      nextStep: 'اكتب سبباً واضحاً لا يقل عن عشرة أحرف ثم أعد المحاولة.',
    },
    en: {
      blocked: action === 'placed' ? 'The legal hold was not placed.' : 'The legal hold was not lifted.',
      why: 'Placing or lifting a hold requires a written reason, which is recorded in the audit trail.',
      nextStep: 'Write a reason of at least ten characters and try again.',
    },
  })
}

function holdNotOpen(): RuleViolation {
  return precondition({
    code: 'LEGAL_HOLD_NOT_OPEN',
    requirementIds: ['REQ-AML-031'],
    legalSource: '02-SYSTEM-ARCHITECTURE §7',
    ar: {
      blocked: 'لم يُرفع الحفظ القانوني.',
      why: 'لا يوجد حفظ قانوني قائم بهذا الرقم، أو أنه رُفع بالفعل.',
      nextStep: 'راجع قائمة حالات الحفظ القائمة على هذا السجل.',
    },
    en: {
      blocked: 'The legal hold was not lifted.',
      why: 'There is no open hold with that reference, or it has already been lifted.',
      nextStep: 'Check the list of holds currently open on this record.',
    },
  })
}
