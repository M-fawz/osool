'use server'

import { z } from 'zod'
import { authoriseAction } from '@/lib/auth/guard'
import { type Session } from '@/lib/auth/session'
import type { ActorContext } from '@/lib/applications/transition'
import { disposeSignal, takeSignalForReview } from '@/lib/signals'
import { fieldErrors } from '@/lib/validation/application'
import type { RuleViolation } from '@/lib/rules/violation'

/**
 * What a supervisor does about a signal.
 *
 * Restricted to the two roles §4 gives a supervisory function — the AML
 * supervisor over the supervised population, the internal auditor over the
 * Authority's own process. `ANALYST` is deliberately absent: §4 gives that role
 * aggregates, and disposing of a signal is a decision about a specific broker
 * or a specific officer.
 *
 * The reason travels as a required field on the schema *and* as a required
 * parameter of `disposeSignal`. Belt and braces on purpose: §8 is unambiguous
 * that "dismissal requires a written reason", and a control expressed only in a
 * form is one the next entry point forgets.
 */

export type SupervisionResult =
  | { ok: true }
  | { ok: false; kind: 'validation'; errors: Record<string, string> }
  | { ok: false; kind: 'refused'; violation: RuleViolation }

const SUPERVISORY_ROLES = ['AML_SUPERVISOR', 'AUDITOR'] as const

function refused(violation: RuleViolation): SupervisionResult {
  return { ok: false, kind: 'refused', violation }
}

function actorFrom(session: Session): ActorContext {
  return {
    userId: session.userId,
    role: session.role,
    name: session.name,
    brokerEntityId: session.brokerEntityId,
    ipAddress: session.ipAddress,
    userAgent: session.userAgent,
  }
}

const TakeSchema = z.object({ signalId: z.string().min(1, { message: 'required' }) })

const DisposeSchema = z.object({
  signalId: z.string().min(1, { message: 'required' }),
  disposition: z.enum(['DISMISS', 'ESCALATE'], { message: 'required' }),
  reason: z
    .string()
    .trim()
    .min(10, { message: 'dispositionReasonRequired' })
    .max(2000, { message: 'tooLong' }),
})

export async function takeSignalAction(
  _previous: SupervisionResult | null,
  formData: FormData,
): Promise<SupervisionResult> {
  const auth = await authoriseAction([...SUPERVISORY_ROLES])
  if (!auth.ok) return refused(auth.violation)
  const session = auth.session

  const parsed = TakeSchema.safeParse({ signalId: formData.get('signalId') })
  if (!parsed.success) return { ok: false, kind: 'validation', errors: fieldErrors(parsed.error) }

  const result = await takeSignalForReview(actorFrom(session), parsed.data.signalId)
  return result.ok ? { ok: true } : { ok: false, kind: 'refused', violation: result.violation }
}

export async function disposeSignalAction(
  _previous: SupervisionResult | null,
  formData: FormData,
): Promise<SupervisionResult> {
  const auth = await authoriseAction([...SUPERVISORY_ROLES])
  if (!auth.ok) return refused(auth.violation)
  const session = auth.session

  const parsed = DisposeSchema.safeParse({
    signalId: formData.get('signalId'),
    disposition: formData.get('disposition'),
    reason: formData.get('reason'),
  })
  if (!parsed.success) return { ok: false, kind: 'validation', errors: fieldErrors(parsed.error) }

  const result = await disposeSignal(actorFrom(session), parsed.data)
  return result.ok ? { ok: true } : { ok: false, kind: 'refused', violation: result.violation }
}
