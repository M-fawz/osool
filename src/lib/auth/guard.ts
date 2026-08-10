import type { Role } from '@prisma/client'
import { canSeeCaseData } from './roles'
import {
  AccountSuspendedError,
  NotAuthenticatedError,
  NotAuthorisedError,
  requireSession,
  type Session,
} from './session'

/**
 * Page-level authorisation that produces a *page*, not a stack trace.
 *
 * `requireRole` throws, which is right for a Server Action — the caller wants
 * the exception. For a page it is wrong: an uncaught throw renders a 500, and a
 * 500 is exactly the bare error that 03-DESIGN-DIRECTION §6 forbids. A
 * government employee who opens the wrong screen should be told what is
 * blocked, why, what to do next, and who to ask.
 *
 * So a page calls `guard()` and renders the refusal it hands back.
 */

export type GuardResult =
  | { ok: true; session: Session }
  | { ok: false; kind: 'unauthenticated' }
  | { ok: false; kind: 'suspended'; reason: string | null }
  | { ok: false; kind: 'forbidden'; role: Role }

export async function guard(
  allowed: Role[],
  options: { caseData?: boolean } = {},
): Promise<GuardResult> {
  let session: Session
  try {
    session = await requireSession()
  } catch (error) {
    if (error instanceof AccountSuspendedError) {
      return { ok: false, kind: 'suspended', reason: error.reason }
    }
    if (error instanceof NotAuthenticatedError) {
      return { ok: false, kind: 'unauthenticated' }
    }
    throw error
  }

  if (!allowed.includes(session.role)) {
    return { ok: false, kind: 'forbidden', role: session.role }
  }

  // §4 — administration is not access. Checked separately from role membership
  // so that adding a role to a page's `allowed` list can never accidentally
  // hand case data to an administrative role.
  if (options.caseData && !canSeeCaseData(session.role)) {
    return { ok: false, kind: 'forbidden', role: session.role }
  }

  return { ok: true, session }
}

export { NotAuthorisedError }
