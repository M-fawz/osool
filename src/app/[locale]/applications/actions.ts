'use server'

import type { BrokerType, ExaminerRecommendation } from '@prisma/client'
import { requireRole, type Session } from '@/lib/auth/session'
import type { ActorContext } from '@/lib/applications/transition'
import {
  performArchive,
  performAssignExaminer,
  performDataExtraction,
  performDecision,
  performIntake,
  performIssueCard,
  performRecommend,
  performRecordDelivery,
  performRecordFees,
  performRequestCompletions,
  saveExaminationRecord,
  type StepOutcome,
} from '@/lib/applications/workflow'
import type { RuleViolation } from '@/lib/rules/violation'
import {
  ArchiveSchema,
  DataExtractionSchema,
  DeliverySchema,
  ExaminationSchema,
  FeeRecordSchema,
  IntakeSchema,
  RequestCompletionsSchema,
  ReviewDecisionSchema,
  fieldErrors,
} from '@/lib/validation/application'

/**
 * The Authority's eight steps, as Server Actions.
 *
 * Each one does exactly three things, in this order: authorise, parse, delegate.
 * The work itself lives in `src/lib/applications/workflow.ts`, which is what
 * lets the proof scripts and the demonstration seed walk a file through the
 * *same* code an official walks it through — a seed that inserted rows directly
 * would produce a register whose event trail was fiction, and the trail is the
 * Phase 1 proof point.
 *
 * 02-SYSTEM-ARCHITECTURE §2: authorisation and validation execute on the
 * server, without exception. The order matters — parsing before authorising
 * would let an unauthenticated caller map the fields by watching which ones a
 * malformed request complains about.
 */

export type WorkflowResult =
  | { ok: true; next?: string }
  | { ok: false; kind: 'validation'; errors: Record<string, string> }
  | { ok: false; kind: 'refused'; violation: RuleViolation }

function validationFailure(errors: Record<string, string>): WorkflowResult {
  return { ok: false, kind: 'validation', errors }
}

function outcome(result: StepOutcome, next: string): WorkflowResult {
  return result.ok ? { ok: true, next } : { ok: false, kind: 'refused', violation: result.violation }
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

/** Parse a JSON payload carried in a hidden field by a composer component. */
function parseJsonField(formData: FormData, name: string): unknown {
  try {
    return JSON.parse(String(formData.get(name) ?? '[]'))
  } catch {
    return null
  }
}

// ── Step 1 — intake, كاتب القيد ─────────────────────────────────────────────

export async function recordIntakeAction(
  _previous: WorkflowResult | null,
  formData: FormData,
): Promise<WorkflowResult> {
  const session = await requireRole(['REGISTRY_CLERK'])
  const applicationId = String(formData.get('applicationId') ?? '')

  const parsed = IntakeSchema.safeParse({ pageCount: formData.get('pageCount') })
  if (!parsed.success) return validationFailure(fieldErrors(parsed.error))

  return outcome(
    await performIntake(actorFrom(session), { applicationId, pageCount: parsed.data.pageCount }),
    `/applications/${applicationId}`,
  )
}

export async function assignExaminerAction(
  _previous: WorkflowResult | null,
  formData: FormData,
): Promise<WorkflowResult> {
  const session = await requireRole(['REGISTRY_CLERK'])
  const applicationId = String(formData.get('applicationId') ?? '')
  const examinerId = String(formData.get('examinerId') ?? '')

  if (!examinerId) return validationFailure({ examinerId: 'required' })

  return outcome(
    await performAssignExaminer(actorFrom(session), { applicationId, examinerId }),
    '/intake',
  )
}

// ── Step 2 — examination, الفاحص ────────────────────────────────────────────

export async function saveExaminationAction(
  _previous: WorkflowResult | null,
  formData: FormData,
): Promise<WorkflowResult> {
  const session = await requireRole(['EXAMINER'])
  const applicationId = String(formData.get('applicationId') ?? '')

  const parsed = ExaminationSchema.safeParse({
    originalCount: formData.get('originalCount'),
    copyCount: formData.get('copyCount'),
    brokerageNature: formData.getAll('brokerageNature').map(String),
    proposedValidFrom: formData.get('proposedValidFrom'),
    proposedValidTo: formData.get('proposedValidTo'),
    recommendation: formData.get('recommendation'),
    examinerNote: formData.get('examinerNote'),
    verifiedFieldKeys: formData.getAll('verifiedFieldKeys').map(String),
  })

  if (!parsed.success) return validationFailure(fieldErrors(parsed.error))

  return outcome(
    await saveExaminationRecord(actorFrom(session), {
      applicationId,
      originalCount: parsed.data.originalCount,
      copyCount: parsed.data.copyCount,
      brokerageNature: parsed.data.brokerageNature as BrokerType[],
      proposedValidFrom: parsed.data.proposedValidFrom,
      proposedValidTo: parsed.data.proposedValidTo,
      recommendation: parsed.data.recommendation as ExaminerRecommendation,
      examinerNote: parsed.data.examinerNote,
      verifiedFieldKeys: parsed.data.verifiedFieldKeys,
    }),
    `/examination/${applicationId}`,
  )
}

export async function requestCompletionsAction(
  _previous: WorkflowResult | null,
  formData: FormData,
): Promise<WorkflowResult> {
  const session = await requireRole(['EXAMINER'])
  const applicationId = String(formData.get('applicationId') ?? '')

  const items = parseJsonField(formData, 'items')
  if (items === null) return validationFailure({ items: 'atLeastOneCompletion' })

  const parsed = RequestCompletionsSchema.safeParse({ items })
  if (!parsed.success) return validationFailure(fieldErrors(parsed.error))

  return outcome(
    await performRequestCompletions(actorFrom(session), {
      applicationId,
      items: parsed.data.items.map((item) => ({
        checklistItemKey: item.checklistItemKey,
        descriptionAr: item.descriptionAr,
        descriptionEn: item.descriptionEn,
      })),
    }),
    '/examination',
  )
}

export async function recommendAction(
  _previous: WorkflowResult | null,
  formData: FormData,
): Promise<WorkflowResult> {
  const session = await requireRole(['EXAMINER'])
  const applicationId = String(formData.get('applicationId') ?? '')

  return outcome(await performRecommend(actorFrom(session), { applicationId }), '/examination')
}

// ── Step 3 — review, المراجع. REQ-REG-052 ───────────────────────────────────

export async function decideAction(
  _previous: WorkflowResult | null,
  formData: FormData,
): Promise<WorkflowResult> {
  const session = await requireRole(['REVIEWER'])
  const applicationId = String(formData.get('applicationId') ?? '')

  const parsed = ReviewDecisionSchema.safeParse({
    decision: formData.get('decision'),
    note: formData.get('note'),
  })
  if (!parsed.success) return validationFailure(fieldErrors(parsed.error))

  return outcome(
    await performDecision(actorFrom(session), {
      applicationId,
      decision: parsed.data.decision,
      note: parsed.data.note,
    }),
    '/review',
  )
}

// ── Step 4 — fees, أمين الخزينة ─────────────────────────────────────────────

export async function recordFeesAction(
  _previous: WorkflowResult | null,
  formData: FormData,
): Promise<WorkflowResult> {
  const session = await requireRole(['CARD_ISSUER', 'DATA_MANAGER'])
  const applicationId = String(formData.get('applicationId') ?? '')

  const lines = parseJsonField(formData, 'lines')
  if (lines === null) return validationFailure({ lines: 'atLeastOneFeeLine' })

  const parsed = FeeRecordSchema.safeParse({
    paymentMethod: formData.get('paymentMethod'),
    receiptNumber: formData.get('receiptNumber'),
    bankName: formData.get('bankName'),
    bankBranch: formData.get('bankBranch'),
    chequeNumber: formData.get('chequeNumber'),
    lines,
  })

  if (!parsed.success) return validationFailure(fieldErrors(parsed.error))

  return outcome(
    await performRecordFees(actorFrom(session), { applicationId, ...parsed.data }),
    `/issuance/${applicationId}`,
  )
}

// ── Steps 5 and 6 — issuance and delivery ───────────────────────────────────

export async function issueCardAction(
  _previous: WorkflowResult | null,
  formData: FormData,
): Promise<WorkflowResult> {
  const session = await requireRole(['CARD_ISSUER'])
  const applicationId = String(formData.get('applicationId') ?? '')

  return outcome(
    await performIssueCard(actorFrom(session), { applicationId }),
    `/issuance/${applicationId}`,
  )
}

export async function recordDeliveryAction(
  _previous: WorkflowResult | null,
  formData: FormData,
): Promise<WorkflowResult> {
  const session = await requireRole(['CARD_ISSUER'])
  const applicationId = String(formData.get('applicationId') ?? '')

  const parsed = DeliverySchema.safeParse({
    deliveredToName: formData.get('deliveredToName'),
    renewalDateAcknowledged: formData.get('renewalDateAcknowledged') === 'on',
    numberObligationAcknowledged: formData.get('numberObligationAcknowledged') === 'on',
  })

  if (!parsed.success) return validationFailure(fieldErrors(parsed.error))

  return outcome(
    await performRecordDelivery(actorFrom(session), { applicationId, ...parsed.data }),
    '/issuance',
  )
}

// ── Steps 7 and 8 — data extraction and archiving ───────────────────────────

export async function recordDataExtractionAction(
  _previous: WorkflowResult | null,
  formData: FormData,
): Promise<WorkflowResult> {
  const session = await requireRole(['DATA_MANAGER'])
  const applicationId = String(formData.get('applicationId') ?? '')

  const parsed = DataExtractionSchema.safeParse({ dataNote: formData.get('dataNote') })
  if (!parsed.success) return validationFailure(fieldErrors(parsed.error))

  return outcome(
    await performDataExtraction(actorFrom(session), { applicationId, dataNote: parsed.data.dataNote }),
    '/records',
  )
}

export async function recordArchiveAction(
  _previous: WorkflowResult | null,
  formData: FormData,
): Promise<WorkflowResult> {
  const session = await requireRole(['FILES_HEAD'])
  const applicationId = String(formData.get('applicationId') ?? '')

  const parsed = ArchiveSchema.safeParse({
    pageCount: formData.get('pageCount'),
    serialRegisterNo: formData.get('serialRegisterNo'),
    alphabeticalIndex: formData.get('alphabeticalIndex'),
    fileReference: formData.get('fileReference'),
  })

  if (!parsed.success) return validationFailure(fieldErrors(parsed.error))

  return outcome(
    await performArchive(actorFrom(session), { applicationId, ...parsed.data }),
    '/archive',
  )
}
