import { randomBytes } from 'node:crypto'
import type { Role } from '@prisma/client'
import { auth } from './index'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { recordAuditEvent } from '@/lib/audit'
import { GOVERNMENT_ROLES, isGovernmentRole, roleLabel } from './roles'

/**
 * Account provisioning. 02-SYSTEM-ARCHITECTURE §4.
 *
 * "Government accounts are created only by SYSTEM_ADMIN. No self-registration.
 *  The admin creates the account with a role and an activation link; the
 *  employee sets their own password."
 *
 * The employee setting their own password is not a convenience. An
 * administrator who could set — or read — an employee's password could act as
 * that employee, and every attribution in the audit trail downstream would be
 * worth less for it. So provisioning creates the account with a random
 * password that is generated, used once to satisfy the account row, and
 * immediately discarded unread; the employee then sets their own through a
 * one-time link delivered by real email.
 */

export interface ProvisionInput {
  email: string
  name: string
  nameAr?: string | null
  role: Role
}

export interface ProvisionActor {
  userId: string
  role: Role
  name: string
  ipAddress?: string | null
  userAgent?: string | null
}

export interface ProvisionResult {
  userId: string
  email: string
  role: Role
  emailDriver: 'console' | 'resend'
  emailId: string | null
}

export class ProvisioningError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message)
    this.name = 'ProvisioningError'
  }
}

/**
 * Create a government account and send its activation email.
 *
 * Authorisation is the caller's responsibility via `requireRole(['SYSTEM_ADMIN'])`,
 * but it is checked again here. A rule enforced in one place is a rule that
 * stops being enforced the first time someone adds a second call site.
 */
export async function provisionGovernmentAccount(
  input: ProvisionInput,
  actor: ProvisionActor,
): Promise<ProvisionResult> {
  if (actor.role !== 'SYSTEM_ADMIN') {
    throw new ProvisioningError(
      'Only a system administrator can create a government account.',
      'NOT_SYSTEM_ADMIN',
    )
  }

  if (!isGovernmentRole(input.role)) {
    throw new ProvisioningError(
      `${input.role} is not a government role. Government accounts may hold: ${GOVERNMENT_ROLES.join(', ')}. Broker accounts self-register.`,
      'NOT_A_GOVERNMENT_ROLE',
    )
  }

  const email = input.email.trim().toLowerCase()

  const existing = await db.user.findUnique({ where: { email }, select: { id: true } })
  if (existing) {
    throw new ProvisioningError(
      `An account already exists for ${email}. Accounts are never deleted — suspend or reactivate the existing one instead.`,
      'EMAIL_ALREADY_REGISTERED',
    )
  }

  // Generated, never shown, never stored in the clear, and immediately
  // superseded by the password the employee chooses.
  const throwawayPassword = randomBytes(32).toString('base64url')

  const created = await auth.api.signUpEmail({
    body: { email, password: throwawayPassword, name: input.name },
  })

  if (!created?.user?.id) {
    throw new ProvisioningError('The account could not be created.', 'SIGNUP_FAILED')
  }

  const userId = created.user.id

  // `role` cannot arrive through the sign-up body by design (input: false), so
  // it is set here, server-side, together with the fields Better Auth does not
  // know about. Until this runs the account holds the least-privileged default.
  await db.user.update({
    where: { id: userId },
    data: {
      role: input.role,
      status: 'PENDING_ACTIVATION',
      nameAr: input.nameAr ?? null,
      createdByUserId: actor.userId,
      // A government account is not tied to a broker entity, ever.
      brokerEntityId: null,
    },
  })

  await recordAuditEvent({
    action: 'GOVERNMENT_ACCOUNT_PROVISIONED',
    entityType: 'User',
    entityId: userId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    actorLabel: `${actor.name} (${roleLabel(actor.role).en})`,
    toState: 'PENDING_ACTIVATION',
    reason: `Account created for ${email} with role ${input.role}.`,
    ipAddress: actor.ipAddress ?? null,
    userAgent: actor.userAgent ?? null,
    payload: { email, role: input.role, name: input.name, nameAr: input.nameAr ?? null },
  })

  // The activation link. Better Auth's reset-password flow issues the one-time
  // token; src/lib/auth/index.ts notices the PENDING_ACTIVATION status and
  // sends the activation wording rather than the reset wording.
  await auth.api.requestPasswordReset({
    body: { email, redirectTo: `${env.APP_URL}/activate` },
  })

  await recordAuditEvent({
    action: 'ACTIVATION_EMAIL_SENT',
    entityType: 'User',
    entityId: userId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    actorLabel: `${actor.name} (${roleLabel(actor.role).en})`,
    reason: `Activation link sent to ${email} by real email (driver: ${env.EMAIL_PROVIDER}).`,
    ipAddress: actor.ipAddress ?? null,
    userAgent: actor.userAgent ?? null,
    payload: { email, driver: env.EMAIL_PROVIDER },
  })

  return {
    userId,
    email,
    role: input.role,
    emailDriver: env.EMAIL_PROVIDER,
    emailId: null,
  }
}

/**
 * Suspend an account. §4 control 3 — this takes effect on the suspended user's
 * next request, not at their next sign-in, because the session guard re-reads
 * status from the database every time.
 *
 * Note what this does *not* do: it does not delete the account, and there is no
 * function in this module that does. A suspended employee's past decisions
 * remain attributed to a real, findable person.
 */
export async function suspendAccount(
  input: { userId: string; reason: string },
  actor: ProvisionActor,
): Promise<void> {
  if (actor.role !== 'SYSTEM_ADMIN') {
    throw new ProvisioningError('Only a system administrator can suspend an account.', 'NOT_SYSTEM_ADMIN')
  }
  if (!input.reason?.trim()) {
    throw new ProvisioningError('A suspension must state a reason.', 'REASON_REQUIRED')
  }

  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: { status: true, email: true, role: true },
  })
  if (!user) throw new ProvisioningError('No such account.', 'NOT_FOUND')

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: input.userId },
      data: { status: 'SUSPENDED', suspendedAt: new Date(), suspendedReason: input.reason },
    })

    await recordAuditEvent(
      {
        action: 'ACCOUNT_SUSPENDED',
        entityType: 'User',
        entityId: input.userId,
        actorUserId: actor.userId,
        actorRole: actor.role,
        actorLabel: `${actor.name} (${roleLabel(actor.role).en})`,
        fromState: user.status,
        toState: 'SUSPENDED',
        reason: input.reason,
        ipAddress: actor.ipAddress ?? null,
        userAgent: actor.userAgent ?? null,
        payload: { email: user.email, role: user.role },
      },
      tx,
    )
  })
}

/** Reactivate a suspended account. Also audited, also requires a reason. */
export async function reactivateAccount(
  input: { userId: string; reason: string },
  actor: ProvisionActor,
): Promise<void> {
  if (actor.role !== 'SYSTEM_ADMIN') {
    throw new ProvisioningError('Only a system administrator can reactivate an account.', 'NOT_SYSTEM_ADMIN')
  }
  if (!input.reason?.trim()) {
    throw new ProvisioningError('A reactivation must state a reason.', 'REASON_REQUIRED')
  }

  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: { status: true, email: true, role: true, emailVerified: true },
  })
  if (!user) throw new ProvisioningError('No such account.', 'NOT_FOUND')

  // An account suspended before it was ever activated returns to
  // PENDING_ACTIVATION, not to ACTIVE — reactivation must not skip the step
  // where the employee sets their own password.
  const restoredStatus = user.emailVerified ? 'ACTIVE' : 'PENDING_ACTIVATION'

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: input.userId },
      data: { status: restoredStatus, suspendedAt: null, suspendedReason: null },
    })

    await recordAuditEvent(
      {
        action: 'ACCOUNT_REACTIVATED',
        entityType: 'User',
        entityId: input.userId,
        actorUserId: actor.userId,
        actorRole: actor.role,
        actorLabel: `${actor.name} (${roleLabel(actor.role).en})`,
        fromState: user.status,
        toState: restoredStatus,
        reason: input.reason,
        ipAddress: actor.ipAddress ?? null,
        userAgent: actor.userAgent ?? null,
        payload: { email: user.email, role: user.role },
      },
      tx,
    )
  })
}
