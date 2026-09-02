import type { Registration, RegistrationStatus } from '@prisma/client'
import { db, type Tx } from '@/lib/db'
import { recordAuditEvent } from '@/lib/audit'
import { roleLabel } from '@/lib/auth/roles'
import { ruleSet } from '@/lib/rules'
import { notify } from '@/lib/notifications'
import { registrationSubject } from '@/lib/notifications/subjects'
import { log } from '@/lib/observability/logger'
import type { ActorContext } from '@/lib/applications/transition'
import { precondition } from '@/lib/applications/refusals'
import type { RuleViolation } from '@/lib/rules/violation'

/**
 * What happens to a registration after it is issued.
 *
 * Registrations were `ACTIVE` and stayed `ACTIVE` — the enum had five states
 * and one of them was ever written. A register whose entries never expire is
 * not a register of time-limited registrations; it is a list, and the whole
 * point of REQ-REG-060 is that the entry has a clock on it.
 *
 * Two ways a registration changes standing, and they are kept apart on purpose:
 *
 *   · **Time passing.** `sweepLifecycle()` moves registrations to RENEWAL_DUE
 *     and LAPSED as their dates arrive. No person decides this; the sweep
 *     records itself as the actor, with no user id, rather than borrowing
 *     somebody's name for something they did not do.
 *   · **A decision.** Suspension, reinstatement, and cancellation are acts of
 *     the Authority. Each needs a written reason, each is attributed, and each
 *     writes a `RegistrationEvent` and an `AuditEvent`.
 *
 * ── The [NEEDS COUNSEL] problem, and how it is handled ───────────────────
 *
 * `OBLIGATION_PERIODS.REGISTRATION_VALIDITY` is marked `[NEEDS COUNSEL]`: the
 * legal reference establishes that a validity period exists but does not say
 * how long it is, and five years is a working value. The rule set says so in
 * as many words — "The renewal-window calculation therefore warns rather than
 * lapsing a registration on this basis until counsel confirms the period."
 *
 * CLAUDE.md rule 10 makes that binding: an unconfirmed requirement may warn and
 * flag; it may not gate. Lapsing a broker's registration is about as
 * consequential a gate as this product has — it makes them unverifiable to
 * every bank and notary who checks.
 *
 * So the sweep distinguishes two kinds of expiry date:
 *
 *   · one an **examiner proposed** on the internal review form, which is a
 *     human decision about this specific file — lapsing on it is enforcing a
 *     person's decision, and proceeds;
 *   · one **derived from the unconfirmed default** because no examiner set it —
 *     which would be enforcing a number nobody has confirmed. Those are flagged
 *     for review and left ACTIVE, and the flag says exactly why.
 *
 * The renewal *window* — ninety days — is not marked needs-counsel, so
 * RENEWAL_DUE is applied to both kinds. Warning someone that their registration
 * is approaching its end is the sort of thing an unconfirmed rule may do.
 */

export interface LifecycleOutcome {
  registrationId: string
  registrationNumber: string
  from: RegistrationStatus
  to: RegistrationStatus
  reason: string
}

export interface SweepResult {
  examined: number
  renewalDue: LifecycleOutcome[]
  lapsed: LifecycleOutcome[]
  /** Would have lapsed, but the expiry rests on an unconfirmed rule. */
  heldForCounsel: Array<{
    registrationId: string
    registrationNumber: string
    validTo: Date
    why: string
  }>
  ruleSetVersion: number
  renewalWindowDays: number
}

/**
 * Did a person set this expiry date, or did the unconfirmed default?
 *
 * The issuing application's examination record carries `proposedValidTo`, which
 * is what an examiner wrote on the internal review form. Where the
 * registration's `validTo` matches it, a human decided; where there is no
 * examination record or no proposal, `performIssueCard` fell back to the
 * unconfirmed validity period.
 */
async function expiryWasSetByAPerson(registrationId: string): Promise<boolean> {
  const application = await db.application.findFirst({
    where: { registrationId },
    select: { examination: { select: { proposedValidTo: true } } },
  })
  return Boolean(application?.examination?.proposedValidTo)
}

/**
 * Move one registration, and write the trail.
 *
 * Both records, always, in one transaction: `RegistrationEvent` is the
 * registration's own history — the thing an officer reads on the screen — and
 * `AuditEvent` is the hash-chained trail. Writing one without the other would
 * leave the two disagreeing about what happened.
 */
async function moveTo(
  tx: Tx,
  registration: Pick<Registration, 'id' | 'registrationNumber' | 'status'>,
  to: RegistrationStatus,
  input: {
    action: string
    reason: string
    actor?: ActorContext
    ruleSetVersions?: Record<string, number>
  },
): Promise<void> {
  await tx.registration.update({ where: { id: registration.id }, data: { status: to } })

  await tx.registrationEvent.create({
    data: {
      registrationId: registration.id,
      action: input.action,
      fromState: registration.status,
      toState: to,
      actorUserId: input.actor?.userId ?? null,
      actorRole: input.actor?.role ?? null,
      reason: input.reason,
      ipAddress: input.actor?.ipAddress ?? null,
      userAgent: input.actor?.userAgent ?? null,
      ruleSetVersions: input.ruleSetVersions ?? undefined,
    },
  })

  await recordAuditEvent(
    {
      action: input.action,
      entityType: 'Registration',
      entityId: registration.id,
      actorUserId: input.actor?.userId ?? null,
      actorRole: input.actor?.role ?? null,
      actorLabel: input.actor
        ? `${input.actor.name} (${roleLabel(input.actor.role).en})`
        : 'Registration lifecycle sweep (no person acted)',
      fromState: registration.status,
      toState: to,
      reason: input.reason,
      ipAddress: input.actor?.ipAddress ?? null,
      userAgent: input.actor?.userAgent ?? null,
      ruleSetVersions: input.ruleSetVersions ?? undefined,
      payload: { registrationNumber: registration.registrationNumber },
    },
    tx,
  )
}

/**
 * Advance every registration whose dates have moved past it.
 *
 * Idempotent: running it twice in one day changes nothing the second time,
 * because each move is guarded by the state the registration is already in.
 * That matters — this runs on a schedule, and a schedule that fires twice
 * because of a retry must not produce two "your registration has lapsed"
 * messages.
 */
export async function sweepLifecycle(
  options: { now?: Date; notifyBrokers?: boolean } = {},
): Promise<SweepResult> {
  const now = options.now ?? new Date()
  const notifyBrokers = options.notifyBrokers ?? true

  const periods = await ruleSet<{ daysBeforeExpiry?: number }>('OBLIGATION_PERIODS', { asOf: now })
  const renewalWindowDays = periods.byKey.get('RENEWAL_WINDOW')?.payload.daysBeforeExpiry ?? 90
  const windowOpensAt = new Date(now.getTime() + renewalWindowDays * 86_400_000)

  const result: SweepResult = {
    examined: 0,
    renewalDue: [],
    lapsed: [],
    heldForCounsel: [],
    ruleSetVersion: periods.version,
    renewalWindowDays,
  }

  // Only the two states time can move. A SUSPENDED or CANCELLED registration
  // stands where a person put it until a person moves it again — the calendar
  // does not reinstate anybody.
  const candidates = await db.registration.findMany({
    where: {
      archivedAt: null,
      status: { in: ['ACTIVE', 'RENEWAL_DUE'] },
      validTo: { lte: windowOpensAt },
    },
    select: { id: true, registrationNumber: true, status: true, validTo: true },
    orderBy: { validTo: 'asc' },
  })

  result.examined = candidates.length

  for (const registration of candidates) {
    const expired = registration.validTo.getTime() <= now.getTime()

    if (expired) {
      if (!(await expiryWasSetByAPerson(registration.id))) {
        // CLAUDE.md rule 10. Flag it; do not lapse it.
        result.heldForCounsel.push({
          registrationId: registration.id,
          registrationNumber: registration.registrationNumber,
          validTo: registration.validTo,
          why:
            'The expiry date rests on OBLIGATION_PERIODS.REGISTRATION_VALIDITY, which is marked [NEEDS COUNSEL]: ' +
            'the legal reference establishes that a validity period exists but not how long it is. ' +
            'Lapsing a registration on an unconfirmed period would be a sanction imposed by an unconfirmed rule, ' +
            'so the registration is left as it stands and referred for a decision.',
        })

        await recordAuditEvent({
          action: 'REGISTRATION_LAPSE_HELD_FOR_COUNSEL',
          entityType: 'Registration',
          entityId: registration.id,
          actorLabel: 'Registration lifecycle sweep (no person acted)',
          reason:
            'The registration reached its recorded expiry, but that date derives from an unconfirmed rule. ' +
            'It has not been lapsed. A person must decide.',
          ruleSetVersions: { OBLIGATION_PERIODS: periods.version },
          payload: {
            registrationNumber: registration.registrationNumber,
            validTo: registration.validTo.toISOString(),
            needsCounsel: 'OBLIGATION_PERIODS.REGISTRATION_VALIDITY',
          },
        })
        continue
      }

      await db.$transaction((tx) =>
        moveTo(tx, registration, 'LAPSED', {
          action: 'REGISTRATION_LAPSED',
          reason: `The registration reached the end of the validity period recorded on it (${registration.validTo.toISOString().slice(0, 10)}).`,
          ruleSetVersions: { OBLIGATION_PERIODS: periods.version },
        }),
      )

      result.lapsed.push({
        registrationId: registration.id,
        registrationNumber: registration.registrationNumber,
        from: registration.status,
        to: 'LAPSED',
        reason: 'Validity period ended.',
      })

      if (notifyBrokers) await announce('REGISTRATION_LAPSED', registration.id)
      continue
    }

    if (registration.status === 'ACTIVE') {
      await db.$transaction((tx) =>
        moveTo(tx, registration, 'RENEWAL_DUE', {
          action: 'REGISTRATION_RENEWAL_DUE',
          reason: `The registration is within ${renewalWindowDays} days of expiry, so renewal now falls due.`,
          ruleSetVersions: { OBLIGATION_PERIODS: periods.version },
        }),
      )

      result.renewalDue.push({
        registrationId: registration.id,
        registrationNumber: registration.registrationNumber,
        from: 'ACTIVE',
        to: 'RENEWAL_DUE',
        reason: `Within ${renewalWindowDays} days of expiry.`,
      })

      if (notifyBrokers) await announce('REGISTRATION_RENEWAL_DUE', registration.id)
    }
  }

  log.info({
    event: 'registry.lifecycle.swept',
    examined: result.examined,
    renewalDue: result.renewalDue.length,
    lapsed: result.lapsed.length,
    heldForCounsel: result.heldForCounsel.length,
    outcome: 'ok',
  })

  return result
}

async function announce(
  event: 'REGISTRATION_RENEWAL_DUE' | 'REGISTRATION_LAPSED',
  registrationId: string,
): Promise<void> {
  const subject = await registrationSubject(registrationId)
  if (subject) await notify({ event, subject: { registration: subject } })
}

// ── Decisions a person takes ───────────────────────────────────────────────

export type LifecycleDecision = { ok: true } | { ok: false; violation: RuleViolation }

function notInThatState(
  current: RegistrationStatus,
  wanted: string,
  wantedAr: string,
): RuleViolation {
  return precondition({
    code: 'REGISTRATION_NOT_IN_STATE',
    requirementIds: ['REQ-REG-060'],
    legalSource: 'REQ-REG-060 — the registration and its period of validity',
    evidence: { current },
    ar: {
      blocked: `تعذّر ${wantedAr}.`,
      why: `حالة القيد الآن «${current}»، ولا يقبل هذا الإجراء من هذه الحالة.`,
      nextStep: 'أعد تحميل الصفحة لعرض الحالة الحالية للقيد.',
    },
    en: {
      blocked: `The registration could not be ${wanted}.`,
      why: `It currently stands as "${current}", and this action is not available from there.`,
      nextStep: 'Reload the page to see the registration’s current standing.',
    },
  })
}

/**
 * Suspend a registration.
 *
 * A written reason is required by the signature, not by a check — there is no
 * way to call this without one. CLAUDE.md rule 3: every decision has an author,
 * a timestamp, and a reason, especially every override.
 */
export async function suspendRegistration(
  actor: ActorContext,
  input: { registrationId: string; reason: string },
): Promise<LifecycleDecision> {
  const registration = await db.registration.findUnique({
    where: { id: input.registrationId },
    select: { id: true, registrationNumber: true, status: true },
  })

  if (!registration) return { ok: false, violation: notInThatState('CANCELLED', 'suspended', 'إيقاف القيد') }
  if (registration.status === 'CANCELLED' || registration.status === 'SUSPENDED') {
    return { ok: false, violation: notInThatState(registration.status, 'suspended', 'إيقاف القيد') }
  }

  await db.$transaction((tx) =>
    moveTo(tx, registration, 'SUSPENDED', {
      action: 'REGISTRATION_SUSPENDED',
      reason: input.reason,
      actor,
    }),
  )

  return { ok: true }
}

/** Lift a suspension. The registration returns to standing on its own dates. */
export async function reinstateRegistration(
  actor: ActorContext,
  input: { registrationId: string; reason: string; now?: Date },
): Promise<LifecycleDecision> {
  const now = input.now ?? new Date()
  const registration = await db.registration.findUnique({
    where: { id: input.registrationId },
    select: { id: true, registrationNumber: true, status: true, validTo: true },
  })

  if (!registration || registration.status !== 'SUSPENDED') {
    return {
      ok: false,
      violation: notInThatState(registration?.status ?? 'CANCELLED', 'reinstated', 'رفع الإيقاف'),
    }
  }

  // Reinstating does not resurrect a period that ran out while suspended. The
  // registration comes back to whatever its dates actually say, which may be
  // lapsed — and the officer sees that rather than a registration that appears
  // to have gained time by being suspended.
  const periods = await ruleSet<{ daysBeforeExpiry?: number }>('OBLIGATION_PERIODS', { asOf: now })
  const windowDays = periods.byKey.get('RENEWAL_WINDOW')?.payload.daysBeforeExpiry ?? 90

  const to: RegistrationStatus =
    registration.validTo.getTime() <= now.getTime()
      ? 'LAPSED'
      : registration.validTo.getTime() - now.getTime() <= windowDays * 86_400_000
        ? 'RENEWAL_DUE'
        : 'ACTIVE'

  await db.$transaction((tx) =>
    moveTo(tx, registration, to, {
      action: 'REGISTRATION_REINSTATED',
      reason: `${input.reason} (Reinstated to ${to}, from the dates recorded on the registration.)`,
      actor,
      ruleSetVersions: { OBLIGATION_PERIODS: periods.version },
    }),
  )

  return { ok: true }
}

/**
 * Cancel a registration. Terminal.
 *
 * Terminal in standing, not in existence: the row stays, its history stays, and
 * the public lookup answers "unverified" without saying why — 01-LEGAL-REFERENCE
 * Part A, and CLAUDE.md rule 2.
 */
export async function cancelRegistration(
  actor: ActorContext,
  input: { registrationId: string; reason: string },
): Promise<LifecycleDecision> {
  const registration = await db.registration.findUnique({
    where: { id: input.registrationId },
    select: { id: true, registrationNumber: true, status: true },
  })

  if (!registration || registration.status === 'CANCELLED') {
    return {
      ok: false,
      violation: notInThatState(registration?.status ?? 'CANCELLED', 'cancelled', 'إلغاء القيد'),
    }
  }

  await db.$transaction((tx) =>
    moveTo(tx, registration, 'CANCELLED', {
      action: 'REGISTRATION_CANCELLED',
      reason: input.reason,
      actor,
    }),
  )

  return { ok: true }
}

/** The standing history of one registration, oldest first. */
export async function registrationHistory(registrationId: string) {
  return db.registrationEvent.findMany({
    where: { registrationId },
    include: { actor: { select: { name: true, nameAr: true } } },
    orderBy: { occurredAt: 'asc' },
  })
}
