import type { Prisma } from '@prisma/client'
import { db, type Tx } from '@/lib/db'
import { evaluateCategoryAgainstCapital } from '@/lib/rules/category'
import { attachDocuments, resolveDocumentChecklist } from '@/lib/rules/documents'
import { resolveDeclarations } from '@/lib/rules/declarations'
import type { RuleViolation } from '@/lib/rules/violation'
import { stepsFor, type ApplicationStep } from './steps'

/**
 * What is still missing, and where to go to fix it.
 *
 * This is the single computation behind four different things the broker sees:
 * the progress indicator, the tick beside each step, the red list on the review
 * screen, and the server's refusal to accept a submission. They agree because
 * they are the same function — an interface that says "2 items missing" while
 * the server refuses for a third reason is an interface that trains people to
 * distrust it.
 *
 * Two categories of finding, kept apart on purpose:
 *
 *   · **gaps** — something has not been filled in yet. Ordinary, expected, and
 *     phrased as a task: "أضف بيانات عقد وساطة واحد على الأقل".
 *   · **violations** — something has been filled in and a regulatory rule
 *     refuses it. REQ-REG-021's capital floor is the one that matters in
 *     Phase 1. These carry the full four-part refusal from the rules engine.
 *
 * Both block submission. Only the second is a refusal, and reading them as one
 * list would either make an empty field sound like a legal finding or make a
 * legal finding sound like an empty field.
 */

export interface Gap {
  /** Stable key, used for the anchor on the review screen. */
  key: string
  step: ApplicationStep
  ar: string
  en: string
}

export interface StepState {
  step: ApplicationStep
  /** Nothing outstanding on this step. */
  complete: boolean
  /** Gaps belonging to this step. */
  gapCount: number
  /** True once the applicant has entered anything at all here. */
  started: boolean
}

export interface Completeness {
  /** True when the application may be submitted. */
  ok: boolean
  gaps: Gap[]
  violations: RuleViolation[]
  steps: StepState[]
  /** Whole steps finished, of the steps this application has. */
  completedSteps: number
  totalSteps: number
  /** Required documents supplied, of those required. */
  documentsSupplied: number
  documentsRequired: number
  /** Declarations affirmed, of those in force. */
  declarationsAffirmed: number
  declarationsTotal: number
}

/** Everything the evaluation needs, in one query. */
export const applicationForCompleteness = {
  entityData: true,
  // Archived rows are the register's answer to "delete" (CLAUDE.md rule 2). A
  // contract the applicant removed is still in the file and still provable; it
  // is simply no longer part of what they are asking for.
  contractData: { where: { archivedAt: null }, orderBy: { position: 'asc' } },
  declarations: true,
  powerOfAttorney: true,
  applicantParty: true,
  documents: {
    where: { archivedAt: null, kind: 'APPLICANT_UPLOAD' as const },
    include: { supersededBy: { select: { id: true } } },
  },
} satisfies Prisma.ApplicationInclude

export type ApplicationWithDetail = Prisma.ApplicationGetPayload<{
  include: typeof applicationForCompleteness
}>

export async function loadApplicationDetail(
  applicationId: string,
  client: Tx | typeof db = db,
): Promise<ApplicationWithDetail | null> {
  return client.application.findUnique({
    where: { id: applicationId },
    include: applicationForCompleteness,
  })
}

/**
 * Evaluate an application against everything that must be true to submit it.
 *
 * `asOf` is the moment the rules are read at. For a live draft that is now; for
 * a submitted application being re-explained later it is `submittedAt`, so the
 * file is always judged by the rules that were in force when it was filed.
 */
export async function evaluateCompleteness(
  application: ApplicationWithDetail,
  options: { asOf?: Date; tx?: Tx } = {},
): Promise<Completeness> {
  const asOf = options.asOf ?? application.submittedAt ?? new Date()
  const lookup = { asOf, tx: options.tx }

  const gaps: Gap[] = []
  const violations: RuleViolation[] = []

  // ── Step 1 — applicant capacity and identity, REQ-REG-030, CDD §5.1 ──────
  if (!application.applicantCapacity) {
    gaps.push({
      key: 'capacity',
      step: 'capacity',
      ar: 'اختر الصفة التي تقدّم بها الطلب.',
      en: 'Choose the capacity you are applying in.',
    })
  }

  if (!application.applicantParty?.nameAr) {
    gaps.push({
      key: 'applicant-name',
      step: 'capacity',
      ar: 'أدخل اسم مقدّم الطلب بالعربية.',
      en: 'Enter the applicant’s name in Arabic.',
    })
  }

  if (!application.applicantParty?.nationalIdHash) {
    gaps.push({
      key: 'applicant-national-id',
      step: 'capacity',
      ar: 'أدخل الرقم القومي لمقدّم الطلب.',
      en: 'Enter the applicant’s national ID number.',
    })
  }

  // ── Step 2 — power of attorney, REQ-REG-041, only for an agent ───────────
  if (application.applicantCapacity === 'AGENT_UNDER_POA') {
    const poa = application.powerOfAttorney

    if (!poa) {
      gaps.push({
        key: 'poa',
        step: 'power-of-attorney',
        ar: 'أدخل بيانات التوكيل: رقمه وسنته ومكتب التوثيق.',
        en: 'Enter the power of attorney: its number, year, and notarisation office.',
      })
    } else if (!poa.stillValidDeclaredAt || !poa.principalAliveDeclaredAt) {
      gaps.push({
        key: 'poa-declaration',
        step: 'power-of-attorney',
        ar: 'أقرّ بأن التوكيل ما زال ساري المفعول وأن الموكِّل على قيد الحياة.',
        en: 'Declare that the power of attorney remains in force and the principal remains alive.',
      })
    }
  }

  // ── Step 3 — entity data, REQ-REG-030 ───────────────────────────────────
  const entity = application.entityData
  if (!entity) {
    gaps.push({
      key: 'entity',
      step: 'entity',
      ar: 'أدخل بيانات المنشأة: الاسم التجاري والعنوان والسجل التجاري والبطاقة الضريبية.',
      en: 'Enter the firm’s data: trade name, address, commercial register, and tax registration.',
    })
  }

  // ── Step 4 — types, category, and capital. REQ-REG-010, 020, 021 ─────────
  if (application.requestedTypes.length === 0) {
    gaps.push({
      key: 'types',
      step: 'category',
      ar: 'اختر نوع القيد أو أكثر.',
      en: 'Choose at least one registration type.',
    })
  }

  if (!application.requestedCategory) {
    gaps.push({
      key: 'category',
      step: 'category',
      ar: 'اختر فئة القيد.',
      en: 'Choose a registration category.',
    })
  }

  if (application.paidUpCapital === null) {
    gaps.push({
      key: 'capital',
      step: 'category',
      ar: 'أدخل رأس المال المدفوع.',
      en: 'Enter the paid-up capital.',
    })
  }

  // REQ-REG-021 — the refusal itself, evaluated as of the submission date and
  // read from the versioned rule set, never a constant.
  if (application.requestedCategory && application.paidUpCapital !== null) {
    const evaluation = await evaluateCategoryAgainstCapital(
      {
        category: application.requestedCategory,
        paidUpCapital: Number(application.paidUpCapital),
      },
      lookup,
    )
    violations.push(...evaluation.violations)
  }

  // ── Step 5 — brokerage contract data, REQ-REG-030 ───────────────────────
  if (application.contractData.length === 0) {
    gaps.push({
      key: 'contracts',
      step: 'contracts',
      ar: 'أضف بيانات عقد وساطة واحد على الأقل.',
      en: 'Add at least one brokerage contract.',
    })
  }

  // ── Step 6 — documents, driven by DOC_CHECKLIST ─────────────────────────
  const checklist = await resolveDocumentChecklist(
    {
      establishmentType: entity?.establishmentType ?? 'NATURAL_PERSON',
      capacity: application.applicantCapacity,
    },
    lookup,
  )

  const withDocuments = attachDocuments(checklist, application.documents)
  const requiredItems = withDocuments.filter((i) => i.required)
  const suppliedItems = requiredItems.filter((i) => i.document)

  for (const item of requiredItems) {
    if (item.document) continue
    gaps.push({
      key: `document:${item.key}`,
      step: 'documents',
      ar: `ارفع «${item.payload.labelAr}».`,
      en: `Upload "${item.payload.labelEn}".`,
    })
  }

  // ── Step 7 — the fifteen declarations, REQ-REG-040 ──────────────────────
  const declarations = await resolveDeclarations(lookup)
  const affirmed = new Map(application.declarations.map((d) => [d.declarationKey, d]))

  let affirmedCount = 0
  for (const item of declarations.items) {
    const record = affirmed.get(item.key)

    // Declaration 10 is not a yes/no. REQ-REG-040 item 10 offers two lawful
    // answers — "the agent is not a public employee", or "here is the employer,
    // and I consent to their being notified" — and treating the second as an
    // unanswered question would force an honest applicant to lie to proceed.
    const answeredByQualification =
      item.payload.requiresQualificationWhenNegative === true &&
      record !== undefined &&
      !record.affirmed &&
      Boolean(record.qualification?.trim())

    if (record?.affirmed || answeredByQualification) {
      affirmedCount += 1
      continue
    }

    gaps.push({
      key: `declaration:${item.key}`,
      step: 'declarations',
      ar: `أقرّ بالبند رقم ${item.position} من التعهدات.`,
      en: `Affirm undertaking ${item.position}.`,
    })
  }

  // ── Roll up per step ────────────────────────────────────────────────────
  const steps = stepsFor(application.applicantCapacity)
  const stepStates: StepState[] = steps.map((step) => {
    const stepGaps = gaps.filter((g) => g.step === step)
    return {
      step,
      complete: stepGaps.length === 0,
      gapCount: stepGaps.length,
      started: hasStarted(step, application, suppliedItems.length, affirmedCount),
    }
  })

  return {
    ok: gaps.length === 0 && violations.every((v) => v.severity !== 'BLOCKING'),
    gaps,
    violations,
    steps: stepStates,
    completedSteps: stepStates.filter((s) => s.complete && s.step !== 'review').length,
    totalSteps: steps.length - 1, // 'review' is not a step you complete
    documentsSupplied: suppliedItems.length,
    documentsRequired: requiredItems.length,
    declarationsAffirmed: affirmedCount,
    declarationsTotal: declarations.items.length,
  }
}

/**
 * Has the applicant touched this step at all?
 *
 * Distinct from "complete", because the three states a step can be in — not
 * started, started but incomplete, finished — need three different marks. A
 * step showing an empty circle when the broker has already typed half of it
 * reads as work lost, which is the one impression a save-and-resume form cannot
 * afford to give.
 */
function hasStarted(
  step: ApplicationStep,
  application: ApplicationWithDetail,
  documentsSupplied: number,
  declarationsAffirmed: number,
): boolean {
  switch (step) {
    case 'capacity':
      return Boolean(application.applicantCapacity ?? application.applicantPartyId)
    case 'power-of-attorney':
      return Boolean(application.powerOfAttorneyId)
    case 'entity':
      return Boolean(application.entityData)
    case 'category':
      return (
        application.requestedTypes.length > 0 ||
        Boolean(application.requestedCategory) ||
        application.paidUpCapital !== null
      )
    case 'contracts':
      return application.contractData.length > 0
    case 'documents':
      return documentsSupplied > 0
    case 'declarations':
      return declarationsAffirmed > 0
    case 'review':
      return true
  }
}
