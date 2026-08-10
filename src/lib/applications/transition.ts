import type { Application, ApplicationStatus, Prisma, Role } from '@prisma/client'
import { db, type Tx } from '@/lib/db'
import { recordAuditEvent } from '@/lib/audit'
import { isBrokerRole, roleLabel } from '@/lib/auth/roles'
import { ruleSetVersionsInForce } from '@/lib/rules'
import type { RuleViolation } from '@/lib/rules/violation'
import {
  notYourApplication,
  roleCannotPerform,
  segregationOfDuties,
  stepNotAvailable,
} from './refusals'

/**
 * The one way an application's status ever changes.
 *
 * 02-SYSTEM-ARCHITECTURE §5: "Allowed transitions live in one table,
 * `application_transitions`, and are checked server-side. A status is never
 * assignable directly."
 *
 * That sentence is only true if there is exactly one function that can write
 * the column, and this is it. Nothing else in the codebase sets
 * `application.status`; every step of REQ-REG-050 goes through here, which is
 * what makes "every transition writes an event" a property of the system
 * rather than a habit of whoever wrote the last Server Action.
 *
 * Five things happen, in this order, inside one database transaction:
 *
 *   1. the row is locked, so two officers clicking at once cannot both move it;
 *   2. the move is looked up in the transitions table — an absent row is a
 *      refusal, not an error;
 *   3. the acting role is checked against that row's `allowedRoles`, and a
 *      broker is checked against the application's own firm;
 *   4. REQ-REG-052 is enforced where a decision is being taken;
 *   5. the caller's own writes run, then the status changes, then an
 *      ApplicationEvent and an AuditEvent are appended.
 *
 * If any of it fails, none of it happened.
 */

export interface ActorContext {
  userId: string
  role: Role
  name: string
  brokerEntityId: string | null
  ipAddress: string | null
  userAgent: string | null
}

/** Thrown from inside a caller's `apply` callback to refuse the whole move. */
export class TransitionRefused extends Error {
  constructor(readonly violation: RuleViolation) {
    super(violation.en.blocked)
    this.name = 'TransitionRefused'
  }
}

export type TransitionResult =
  | { ok: true; fromState: ApplicationStatus; toState: ApplicationStatus; applicationId: string }
  | { ok: false; violation: RuleViolation }

export interface TransitionInput {
  applicationId: string
  /** The `action` column in application_transition: 'submit', 'approve', … */
  action: string
  actor: ActorContext
  /** Written onto the ApplicationEvent. Required by some steps; see callers. */
  reason?: string | null
  /** SCREAMING_SNAKE verb for the audit trail, e.g. APPLICATION_APPROVED. */
  auditAction: string
  /** Extra evidence for the audit event. Never document content. */
  auditPayload?: Prisma.InputJsonValue
  /**
   * The step's own writes, run inside the same transaction and before the
   * status moves. Return fields to set on the application in the same update —
   * `examinerId`, `temporaryNumber`, and so on. Throw `TransitionRefused` to
   * refuse the whole move with a four-part explanation.
   */
  apply?: (context: {
    tx: Tx
    application: Application
    toState: ApplicationStatus
  }) => Promise<Prisma.ApplicationUpdateInput | void>
}

/** The rule sets whose versions are stamped on every workflow event. */
const STAMPED_RULE_SETS = ['BROKER_CATEGORY', 'DOC_CHECKLIST', 'DECLARATIONS', 'OBLIGATION_PERIODS']

/**
 * Steps at which the acting officer becomes the decision-maker, and so must not
 * be the person who examined the file. REQ-REG-052.
 *
 * Held as a list rather than checked inline at `approve`, because `reject` is
 * a decision too — a system that only guarded approval would let one person
 * examine a file and then refuse it, which is the same concentration of power
 * pointed the other way.
 */
const DECISION_ACTIONS = new Set(['approve', 'reject'])

export async function transition(input: TransitionInput): Promise<TransitionResult> {
  try {
    return await db.$transaction(async (tx) => {
      // 1 — Lock the row for the rest of this transaction. Without it, two
      // examiners recommending the same file simultaneously both read
      // UNDER_EXAMINATION, both pass the check, and the file gets two events
      // claiming to be the same move.
      await tx.$executeRaw`SELECT id FROM "application" WHERE id = ${input.applicationId} FOR UPDATE`

      const application = await tx.application.findUnique({ where: { id: input.applicationId } })

      if (!application) {
        return {
          ok: false as const,
          violation: stepNotAvailable({ action: input.action, currentState: 'DRAFT' }),
        }
      }

      // 2 — Is this move permitted at all, from where the file stands?
      const permitted = await tx.applicationTransition.findFirst({
        where: { fromState: application.status, action: input.action, archivedAt: null },
      })

      if (!permitted) {
        return {
          ok: false as const,
          violation: stepNotAvailable({ action: input.action, currentState: application.status }),
        }
      }

      // 3 — Does the acting role perform this step?
      if (!permitted.allowedRoles.includes(input.actor.role)) {
        return {
          ok: false as const,
          violation: roleCannotPerform({
            action: input.action,
            role: input.actor.role,
            allowedRoles: permitted.allowedRoles,
          }),
        }
      }

      // …and if a broker is acting, is this their own firm's file? A role check
      // alone would let any signed-in broker submit any draft in the register.
      if (isBrokerRole(input.actor.role)) {
        if (
          !input.actor.brokerEntityId ||
          input.actor.brokerEntityId !== application.brokerEntityId
        ) {
          return { ok: false as const, violation: notYourApplication() }
        }
      }

      // 4 — REQ-REG-052. The database CHECK constraint refuses the write as
      // well; this exists so the officer gets an explanation instead of a
      // constraint violation, and so the control holds even if the constraint
      // is ever dropped by a careless migration.
      if (DECISION_ACTIONS.has(input.action) && application.examinerId === input.actor.userId) {
        return { ok: false as const, violation: segregationOfDuties({ role: input.actor.role }) }
      }

      const toState = permitted.toState

      // 5 — The step's own writes.
      let updates: Prisma.ApplicationUpdateInput = {}
      if (input.apply) {
        const returned = await input.apply({ tx, application, toState })
        if (returned) updates = returned
      }

      const ruleSetVersions = await ruleSetVersionsInForce(STAMPED_RULE_SETS, {
        asOf: new Date(),
        tx,
      })

      await tx.application.update({
        where: { id: application.id },
        data: { ...updates, status: toState },
      })

      await tx.applicationEvent.create({
        data: {
          applicationId: application.id,
          actorUserId: input.actor.userId,
          actorRole: input.actor.role,
          action: input.action,
          fromState: application.status,
          toState,
          reason: input.reason ?? null,
          ipAddress: input.actor.ipAddress,
          userAgent: input.actor.userAgent,
          ruleSetVersions,
        },
      })

      await recordAuditEvent(
        {
          action: input.auditAction,
          entityType: 'Application',
          entityId: application.id,
          actorUserId: input.actor.userId,
          actorRole: input.actor.role,
          actorLabel: `${input.actor.name} (${roleLabel(input.actor.role).en})`,
          fromState: application.status,
          toState,
          reason: input.reason ?? null,
          ipAddress: input.actor.ipAddress,
          userAgent: input.actor.userAgent,
          ruleSetVersions,
          payload: input.auditPayload,
        },
        tx,
      )

      return {
        ok: true as const,
        fromState: application.status,
        toState,
        applicationId: application.id,
      }
    })
  } catch (error) {
    // A refusal raised from inside `apply` has already rolled the transaction
    // back. It is a refusal for the user, not a fault, so it comes back as one.
    if (error instanceof TransitionRefused) {
      return { ok: false, violation: error.violation }
    }
    throw error
  }
}

/**
 * The moves available to this actor on this application, right now.
 *
 * Used to draw the buttons. It is a courtesy and not a control: `transition()`
 * re-checks everything on the server whether or not a button was ever
 * rendered — CLAUDE.md rule 1.
 */
export async function availableActions(
  application: { id: string; status: ApplicationStatus; brokerEntityId: string },
  actor: Pick<ActorContext, 'role' | 'brokerEntityId'>,
): Promise<string[]> {
  if (isBrokerRole(actor.role) && actor.brokerEntityId !== application.brokerEntityId) return []

  const rows = await db.applicationTransition.findMany({
    where: { fromState: application.status, archivedAt: null, allowedRoles: { has: actor.role } },
    select: { action: true },
  })

  return [...new Set(rows.map((r) => r.action))]
}
