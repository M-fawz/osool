import { db } from '@/lib/db'
import type { RuleViolation } from '@/lib/rules/violation'
import { evaluateCompleteness, loadApplicationDetail } from './completeness'
import { notYourApplication, precondition } from './refusals'
import { transition, type ActorContext } from './transition'
import type { StepOutcome } from './workflow'

/**
 * Submission, and the refusal that is Phase 1's proof point.
 *
 * Extracted from the Server Action for the same reason the government steps
 * are: the proof scripts and the demonstration seed have to submit an
 * application through the code an applicant submits through, or the register
 * they produce evidences nothing.
 *
 * Two kinds of finding, kept apart because they are different things:
 *
 *   · a **violation** — a regulatory rule refuses what was submitted. The
 *     capital-below-floor refusal under REQ-REG-021 is this, and it comes back
 *     with the decree named and the figures interpolated from the rule set.
 *   · a **gap** — a required field or document has not been supplied. Not a
 *     legal finding; a list of things to do.
 *
 * Both stop the submission. Only the first is a refusal.
 */
export async function submitApplication(
  actor: ActorContext,
  applicationId: string,
): Promise<StepOutcome> {
  const application = await db.application.findUnique({ where: { id: applicationId } })

  if (
    !application ||
    !actor.brokerEntityId ||
    application.brokerEntityId !== actor.brokerEntityId
  ) {
    return { ok: false, violation: notYourApplication() }
  }

  const detail = await loadApplicationDetail(applicationId)
  if (!detail) return { ok: false, violation: notYourApplication() }

  const now = new Date()
  const completeness = await evaluateCompleteness(detail, { asOf: now })

  const blocking = completeness.violations.find((v) => v.severity === 'BLOCKING')
  if (blocking) return { ok: false, violation: blocking }

  if (completeness.gaps.length > 0) {
    const listAr = completeness.gaps.slice(0, 4).map((g) => `• ${g.ar}`).join('\n')
    const listEn = completeness.gaps.slice(0, 4).map((g) => `• ${g.en}`).join('\n')
    const more = completeness.gaps.length - 4

    return {
      ok: false,
      violation: precondition({
        code: 'APPLICATION_INCOMPLETE',
        requirementIds: ['REQ-REG-030', 'REQ-REG-040'],
        legalSource: 'GOEIC form CR-CA-QR7--01; REQ-REG-030 and REQ-REG-040',
        evidence: {
          gapCount: completeness.gaps.length,
          gaps: completeness.gaps.map((g) => g.key),
        },
        ar: {
          blocked: 'لا يمكن إرسال هذا الطلب بعد.',
          why: `ما زال ناقصاً ${completeness.gaps.length} بنداً من البيانات أو المستندات التي يطلبها نموذج الهيئة:\n${listAr}${more > 0 ? `\n• و${more} بنداً آخر` : ''}`,
          nextStep:
            'ارجع إلى صفحة المراجعة؛ كل بند ناقص مذكور فيها ويأخذك الضغط عليه إلى مكانه مباشرة.',
        },
        en: {
          blocked: 'This application cannot be submitted yet.',
          why: `${completeness.gaps.length} of the details or documents the Authority's form requires are still missing:\n${listEn}${more > 0 ? `\n• and ${more} more` : ''}`,
          nextStep:
            'Go back to the review page; every missing item is listed there and selecting one takes you straight to it.',
        },
      }),
    }
  }

  const resubmitting = application.status === 'AWAITING_COMPLETION'

  const result = await transition({
    applicationId,
    action: resubmitting ? 'resubmit' : 'submit',
    actor,
    auditAction: resubmitting ? 'APPLICATION_RESUBMITTED' : 'APPLICATION_SUBMITTED',
    reason: resubmitting ? 'The applicant answered the requested completions.' : null,
    auditPayload: {
      requestedCategory: application.requestedCategory,
      requestedTypes: application.requestedTypes,
      paidUpCapital: application.paidUpCapital?.toString() ?? null,
      documentsSupplied: completeness.documentsSupplied,
      declarationsAffirmed: completeness.declarationsAffirmed,
    },
    apply: async ({ tx }) => {
      if (!resubmitting) {
        // The rule-set versions this submission was judged under, frozen onto
        // the application, so a decision taken in March stays explainable after
        // October's amendment.
        const stamped: Record<string, number> = {}
        for (const violation of completeness.violations) {
          if (violation.ruleSetCode && violation.ruleSetVersion !== undefined) {
            stamped[violation.ruleSetCode] = violation.ruleSetVersion
          }
        }
        return { submittedAt: now, submittedUnderRuleSetIds: stamped }
      }

      // Answering completions closes the outstanding items. Whether they are
      // actually satisfied is the examiner's judgement; this records that the
      // applicant responded.
      await tx.completion.updateMany({
        where: { applicationId, status: 'REQUESTED' },
        data: { status: 'SATISFIED', resolvedAt: now, resolvedByUserId: actor.userId },
      })

      return {}
    },
  })

  return result.ok ? { ok: true } : { ok: false, violation: result.violation }
}

/** Withdrawal. The file stops being considered; it is never removed. */
export async function withdrawApplication(
  actor: ActorContext,
  applicationId: string,
): Promise<StepOutcome> {
  const result = await transition({
    applicationId,
    action: 'withdraw',
    actor,
    auditAction: 'APPLICATION_WITHDRAWN',
    reason: 'Withdrawn by the applicant.',
  })

  return result.ok ? { ok: true } : { ok: false, violation: result.violation }
}

export type { RuleViolation }
