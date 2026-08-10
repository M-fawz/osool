import { headers } from 'next/headers'
import { cache } from 'react'
import type { Role, UserStatus } from '@prisma/client'
import { auth } from './index'
import { db } from '@/lib/db'
import { canSeeCaseData, roleLabel } from './roles'
import { recordAuditEvent } from '@/lib/audit'

/**
 * Session resolution and authorisation.
 *
 * 02-SYSTEM-ARCHITECTURE §4, control 3:
 *
 *   "Role changes take effect immediately, including on live sessions. Session
 *    state is re-validated against the database on every request — never
 *    trusted from a cookie for the session's lifetime."
 *
 * So the role and status returned here always come from a fresh read of the
 * user row, not from the session token's contents. `cache()` deduplicates that
 * read within a single request — several Server Components on one page share
 * one query — but it does not persist across requests, which is exactly the
 * boundary the rule cares about.
 */

export interface Session {
  userId: string
  sessionId: string
  email: string
  name: string
  nameAr: string | null
  role: Role
  status: UserStatus
  brokerEntityId: string | null
  ipAddress: string | null
  userAgent: string | null
}

export class NotAuthenticatedError extends Error {
  constructor() {
    super('No active session.')
    this.name = 'NotAuthenticatedError'
  }
}

export class AccountSuspendedError extends Error {
  constructor(readonly reason: string | null) {
    super('This account is suspended.')
    this.name = 'AccountSuspendedError'
  }
}

export class NotAuthorisedError extends Error {
  constructor(
    readonly held: Role,
    readonly required: Role[],
  ) {
    super(`Role ${held} is not permitted here. Required: ${required.join(', ')}.`)
    this.name = 'NotAuthorisedError'
  }
}

/** The client's IP, as far forward as the deployment's proxy reports it. */
function clientIp(h: Headers): string | null {
  const forwarded = h.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? null
  return h.get('x-real-ip')
}

/**
 * The current session, or null.
 *
 * Returns null rather than throwing for a suspended account only in the sense
 * that `requireSession` is the gate — see below. Callers wanting the raw
 * answer should use `requireSession`.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const h = await headers()
  const result = await auth.api.getSession({ headers: h })
  if (!result?.session || !result.user) return null

  // The authoritative read. Everything role-dependent downstream uses these
  // values, not the ones carried on the session object.
  const user = await db.user.findUnique({
    where: { id: result.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      nameAr: true,
      role: true,
      status: true,
      brokerEntityId: true,
      archivedAt: true,
    },
  })

  if (!user || user.archivedAt) return null

  return {
    userId: user.id,
    sessionId: result.session.id,
    email: user.email,
    name: user.name,
    nameAr: user.nameAr,
    role: user.role,
    status: user.status,
    brokerEntityId: user.brokerEntityId,
    ipAddress: clientIp(h),
    userAgent: h.get('user-agent'),
  }
})

/** A session, or a thrown error. Suspension is checked here, on every request. */
export async function requireSession(): Promise<Session> {
  const session = await getSession()
  if (!session) throw new NotAuthenticatedError()

  if (session.status === 'SUSPENDED') {
    const record = await db.user.findUnique({
      where: { id: session.userId },
      select: { suspendedReason: true },
    })
    throw new AccountSuspendedError(record?.suspendedReason ?? null)
  }

  if (session.status === 'PENDING_ACTIVATION') {
    throw new NotAuthenticatedError()
  }

  return session
}

/**
 * Require one of a set of roles.
 *
 * The authorisation check every Server Action and protected Server Component
 * starts with. It reads the live role, so an examiner suspended thirty seconds
 * ago is refused on their next action rather than at their next sign-in.
 */
export async function requireRole(allowed: Role[]): Promise<Session> {
  const session = await requireSession()
  if (!allowed.includes(session.role)) {
    throw new NotAuthorisedError(session.role, allowed)
  }
  return session
}

/**
 * Require a role that is permitted to see case data.
 *
 * §4: administration is not access. SYSTEM_ADMIN passes `requireSession` and
 * fails here, which is the intended shape — the administrator can reach the
 * account screens and nothing else.
 */
export async function requireCaseAccess(allowed: Role[]): Promise<Session> {
  const session = await requireRole(allowed)
  if (!canSeeCaseData(session.role)) {
    throw new NotAuthorisedError(session.role, allowed.filter(canSeeCaseData))
  }
  return session
}

/**
 * Read a record and audit the read. REQ-DPA-002.
 *
 * Reads are frequent, and an auditing step a developer has to remember is one
 * they will eventually forget. This makes the audited read the shortest path.
 */
export async function auditedRead<T>(
  session: Session,
  descriptor: { entityType: string; entityId: string; action?: string; reason?: string },
  read: () => Promise<T>,
): Promise<T> {
  const value = await read()
  await recordAuditEvent({
    accessType: 'READ',
    action: descriptor.action ?? `${descriptor.entityType.toUpperCase()}_VIEWED`,
    entityType: descriptor.entityType,
    entityId: descriptor.entityId,
    actorUserId: session.userId,
    actorRole: session.role,
    actorLabel: `${session.name} (${roleLabel(session.role).en})`,
    reason: descriptor.reason ?? null,
    ipAddress: session.ipAddress,
    userAgent: session.userAgent,
  })
  return value
}
