import type { BrokerType, ExaminerRecommendation, PaymentMethod, Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { recordAuditEvent } from '@/lib/audit'
import { roleLabel } from '@/lib/auth/roles'
import { ruleSet } from '@/lib/rules'
import { governorateLabels } from '@/lib/reference/governorates'
import { registrationCardHtml } from '@/lib/pdf/registration-card'
import { renderPdf } from '@/lib/pdf/render'
import { putDocument, sha256, storageKeyFor } from '@/lib/storage'
import type { RuleViolation } from '@/lib/rules/violation'
import {
  allocateDeliverySerial,
  allocateRegistrationNumber,
  allocateTemporaryNumber,
} from './numbering'
import { precondition, segregationOfDuties } from './refusals'
import { TransitionRefused, transition, type ActorContext } from './transition'

/**
 * REQ-REG-050, as functions.
 *
 * The Server Actions in `src/app/[locale]/applications/actions.ts` authorise
 * and parse; everything they then *do* lives here. The split is not tidiness —
 * it is what lets the proof scripts and the demonstration seed walk a file
 * through the real workflow rather than through a second implementation of it.
 * A seed that inserted rows directly would produce a register whose event trail
 * was fiction, and the Phase 1 proof point is precisely that the trail is not.
 *
 * Every function here takes an `ActorContext` — who is acting, in what role,
 * from what address — and goes through `transition()`, which is still the only
 * writer of `application.status`.
 */

export type StepOutcome = { ok: true } | { ok: false; violation: RuleViolation }

function refused(violation: RuleViolation): StepOutcome {
  return { ok: false, violation }
}

// ── Step 1 — intake ─────────────────────────────────────────────────────────

export async function performIntake(
  actor: ActorContext,
  input: { applicationId: string; pageCount: number },
): Promise<StepOutcome> {
  const result = await transition({
    applicationId: input.applicationId,
    action: 'intake',
    actor,
    auditAction: 'APPLICATION_INTAKE_RECORDED',
    reason: 'Entered in the incoming register.',
    apply: async ({ tx }) => ({
      temporaryNumber: await allocateTemporaryNumber(tx),
      pageCount: input.pageCount,
      intakeClerk: { connect: { id: actor.userId } },
    }),
    auditPayload: { pageCount: input.pageCount },
  })

  return result.ok ? { ok: true } : refused(result.violation)
}

export async function performAssignExaminer(
  actor: ActorContext,
  input: { applicationId: string; examinerId: string },
): Promise<StepOutcome> {
  const result = await transition({
    applicationId: input.applicationId,
    action: 'assign',
    actor,
    auditAction: 'APPLICATION_ASSIGNED_TO_EXAMINER',
    reason: 'Assigned for examination.',
    apply: async ({ tx }) => {
      const examiner = await tx.user.findFirst({
        where: { id: input.examinerId, role: 'EXAMINER', status: 'ACTIVE', archivedAt: null },
        select: { id: true },
      })

      if (!examiner) {
        throw new TransitionRefused(
          precondition({
            code: 'EXAMINER_NOT_AVAILABLE',
            requirementIds: ['REQ-REG-050'],
            legalSource: 'GOEIC workflow, REQ-REG-050 step 2',
            ar: {
              blocked: 'تعذّرت إحالة الطلب.',
              why: 'الموظف المختار ليس فاحصاً نشطاً في النظام الآن.',
              nextStep: 'اختر فاحصاً آخر من القائمة، أو أعد تحميل الصفحة لتحديثها.',
            },
            en: {
              blocked: 'The application could not be assigned.',
              why: 'The person selected is not an active examiner in the system.',
              nextStep: 'Choose another examiner from the list, or reload the page to refresh it.',
            },
          }),
        )
      }

      return { examiner: { connect: { id: examiner.id } } }
    },
    auditPayload: { examinerId: input.examinerId },
  })

  return result.ok ? { ok: true } : refused(result.violation)
}

// ── Step 2 — examination ────────────────────────────────────────────────────

export interface ExaminationInput {
  applicationId: string
  originalCount: number
  copyCount: number
  brokerageNature: BrokerType[]
  proposedValidFrom: Date
  proposedValidTo: Date
  recommendation: ExaminerRecommendation
  examinerNote: string | null
  verifiedFieldKeys: string[]
}

/** Saves the internal review form. Not a transition: signing it is. */
export async function saveExaminationRecord(
  actor: ActorContext,
  input: ExaminationInput,
): Promise<StepOutcome> {
  const application = await db.application.findUnique({ where: { id: input.applicationId } })

  if (!application || application.examinerId !== actor.userId) {
    return refused(
      precondition({
        code: 'NOT_THE_ASSIGNED_EXAMINER',
        requirementIds: ['REQ-REG-050', 'REQ-REG-052'],
        legalSource: 'GOEIC workflow, REQ-REG-050 step 2',
        ar: {
          blocked: 'لا يمكنك تحرير نموذج المراجعة لهذا الطلب.',
          why: 'هذا الطلب محال إلى فاحص آخر، والنموذج يحرره الفاحص المختص وحده.',
          nextStep: 'ارجع إلى قائمة عملك واختر طلباً محالاً إليك.',
        },
        en: {
          blocked: 'You cannot complete the review form for this application.',
          why: 'It is assigned to another examiner, and the form is completed by the assigned examiner alone.',
          nextStep: 'Return to your queue and open an application assigned to you.',
        },
      }),
    )
  }

  const asOf = application.submittedAt ?? new Date()
  const form = await ruleSet('EXAMINATION_FORM', { asOf })
  const validKeys = form.items.map((item) => item.key)

  await db.$transaction(async (tx) => {
    const record = await tx.examinationRecord.upsert({
      where: { applicationId: input.applicationId },
      create: {
        applicationId: input.applicationId,
        examinerUserId: actor.userId,
        originalCount: input.originalCount,
        copyCount: input.copyCount,
        brokerageNature: input.brokerageNature,
        proposedValidFrom: input.proposedValidFrom,
        proposedValidTo: input.proposedValidTo,
        recommendation: input.recommendation,
        examinerNote: input.examinerNote,
      },
      update: {
        originalCount: input.originalCount,
        copyCount: input.copyCount,
        brokerageNature: input.brokerageNature,
        proposedValidFrom: input.proposedValidFrom,
        proposedValidTo: input.proposedValidTo,
        recommendation: input.recommendation,
        examinerNote: input.examinerNote,
      },
    })

    // One row per line, always. Unticking records that a line is *not*
    // verified rather than removing the evidence it was considered — a line
    // that vanished would be indistinguishable from one never on the form.
    for (const key of validKeys) {
      await tx.examinationFieldCheck.upsert({
        where: { examinationRecordId_fieldKey: { examinationRecordId: record.id, fieldKey: key } },
        create: {
          examinationRecordId: record.id,
          fieldKey: key,
          verified: input.verifiedFieldKeys.includes(key),
        },
        update: { verified: input.verifiedFieldKeys.includes(key) },
      })
    }

    await recordAuditEvent(
      {
        action: 'EXAMINATION_FORM_SAVED',
        entityType: 'Application',
        entityId: input.applicationId,
        actorUserId: actor.userId,
        actorRole: actor.role,
        actorLabel: `${actor.name} (${roleLabel(actor.role).en})`,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        ruleSetVersions: { EXAMINATION_FORM: form.version },
        payload: {
          verifiedCount: input.verifiedFieldKeys.filter((k) => validKeys.includes(k)).length,
          totalFields: validKeys.length,
          recommendation: input.recommendation,
        },
      },
      tx,
    )
  })

  return { ok: true }
}

export interface CompletionItemInput {
  checklistItemKey: string | null
  descriptionAr: string
  descriptionEn: string | null
}

export async function performRequestCompletions(
  actor: ActorContext,
  input: { applicationId: string; items: CompletionItemInput[] },
): Promise<StepOutcome> {
  const result = await transition({
    applicationId: input.applicationId,
    action: 'request_completions',
    actor,
    auditAction: 'COMPLETIONS_REQUESTED',
    reason: `${input.items.length} completion item(s) requested.`,
    apply: async ({ tx, application }) => {
      const [highestNumber, highestRound] = await Promise.all([
        tx.completion.aggregate({
          where: { applicationId: application.id },
          _max: { itemNumber: true },
        }),
        tx.completion.aggregate({ where: { applicationId: application.id }, _max: { round: true } }),
      ])

      let itemNumber = highestNumber._max.itemNumber ?? 0
      const round = (highestRound._max.round ?? 0) + 1

      for (const item of input.items) {
        itemNumber += 1
        await tx.completion.create({
          data: {
            applicationId: application.id,
            itemNumber,
            round,
            checklistItemKey: item.checklistItemKey,
            descriptionAr: item.descriptionAr,
            descriptionEn: item.descriptionEn,
            requestedByUserId: actor.userId,
          },
        })
      }

      return {}
    },
    auditPayload: {
      itemCount: input.items.length,
      // 00-VISION §5's "completions with no basis in the documented
      // requirements" signal is computed from exactly this.
      citedChecklistItems: input.items.map((i) => i.checklistItemKey).filter(Boolean),
      uncitedCount: input.items.filter((i) => !i.checklistItemKey).length,
    },
  })

  return result.ok ? { ok: true } : refused(result.violation)
}

export async function performRecommend(
  actor: ActorContext,
  input: { applicationId: string },
): Promise<StepOutcome> {
  const result = await transition({
    applicationId: input.applicationId,
    action: 'recommend',
    actor,
    auditAction: 'EXAMINATION_SIGNED',
    reason: 'The examiner signed the internal review form and passed the file for review.',
    apply: async ({ tx }) => {
      const record = await tx.examinationRecord.findUnique({
        where: { applicationId: input.applicationId },
      })

      if (!record?.recommendation) {
        throw new TransitionRefused(
          precondition({
            code: 'EXAMINATION_FORM_INCOMPLETE',
            requirementIds: ['REQ-REG-051'],
            legalSource: 'GOEIC form CR-CA-QR-31',
            ar: {
              blocked: 'لا يمكن إحالة الطلب إلى المراجعة.',
              why: 'نموذج المراجعة الداخلية لم يُستكمل بعد؛ التوصية مطلوبة قبل التوقيع.',
              nextStep: 'استكمل النموذج وحدّد التوصية، ثم وقّع وأحل الطلب.',
            },
            en: {
              blocked: 'The application cannot be passed for review.',
              why: 'The internal review form is not complete; a recommendation is required before signing.',
              nextStep: 'Complete the form, set the recommendation, then sign and pass it on.',
            },
          }),
        )
      }

      await tx.examinationRecord.update({
        where: { applicationId: input.applicationId },
        data: { signedAt: new Date() },
      })

      return {}
    },
  })

  return result.ok ? { ok: true } : refused(result.violation)
}

// ── Step 3 — review. REQ-REG-052 ────────────────────────────────────────────

export async function performDecision(
  actor: ActorContext,
  input: { applicationId: string; decision: 'APPROVE' | 'REJECT'; note: string | null },
): Promise<StepOutcome> {
  const approving = input.decision === 'APPROVE'

  const result = await transition({
    applicationId: input.applicationId,
    action: approving ? 'approve' : 'reject',
    actor,
    auditAction: approving ? 'APPLICATION_APPROVED' : 'APPLICATION_REJECTED',
    reason: input.note,
    apply: async ({ tx, application }) => {
      // The third of three independent enforcements of REQ-REG-052: the
      // transition engine refuses it, the database CHECK constraint refuses the
      // write, and this refuses it at the point the two ids would meet.
      if (application.examinerId === actor.userId) {
        throw new TransitionRefused(segregationOfDuties({ role: actor.role }))
      }

      await tx.examinationRecord.updateMany({
        where: { applicationId: application.id },
        data: {
          reviewerUserId: actor.userId,
          reviewerNote: input.note,
          reviewSignedAt: new Date(),
        },
      })

      return {
        reviewer: { connect: { id: actor.userId } },
        decidedAt: new Date(),
        rejectionReason: approving ? null : input.note,
      }
    },
    auditPayload: { decision: input.decision },
  })

  return result.ok ? { ok: true } : refused(result.violation)
}

// ── Step 4 — fees ───────────────────────────────────────────────────────────

export interface FeeInput {
  applicationId: string
  paymentMethod: PaymentMethod
  receiptNumber: string
  bankName: string | null
  bankBranch: string | null
  chequeNumber: string | null
  lines: Array<{ feeKey: string; amount: number }>
}

export async function performRecordFees(actor: ActorContext, input: FeeInput): Promise<StepOutcome> {
  const total = input.lines.reduce((sum, line) => sum + line.amount, 0)

  const result = await transition({
    applicationId: input.applicationId,
    action: 'record_fees',
    actor,
    auditAction: 'FEES_RECORDED',
    reason: `Fees recorded against receipt ${input.receiptNumber}.`,
    apply: async ({ tx, application }) => {
      const record = await tx.feeRecord.upsert({
        where: { applicationId: application.id },
        create: {
          applicationId: application.id,
          paymentMethod: input.paymentMethod,
          receiptNumber: input.receiptNumber,
          bankName: input.bankName,
          bankBranch: input.bankBranch,
          chequeNumber: input.chequeNumber,
          totalAmount: total,
          recordedByUserId: actor.userId,
        },
        update: {
          paymentMethod: input.paymentMethod,
          receiptNumber: input.receiptNumber,
          bankName: input.bankName,
          bankBranch: input.bankBranch,
          chequeNumber: input.chequeNumber,
          totalAmount: total,
        },
      })

      for (const line of input.lines) {
        await tx.feeLine.upsert({
          where: { feeRecordId_feeKey: { feeRecordId: record.id, feeKey: line.feeKey } },
          create: { feeRecordId: record.id, feeKey: line.feeKey, amount: line.amount },
          update: { amount: line.amount },
        })
      }

      return {}
    },
    auditPayload: {
      receiptNumber: input.receiptNumber,
      paymentMethod: input.paymentMethod,
      totalAmount: total,
      lineCount: input.lines.length,
    },
  })

  return result.ok ? { ok: true } : refused(result.violation)
}

// ── Step 5 — card issuance ──────────────────────────────────────────────────

/**
 * Issue the card.
 *
 * Three objects are created together because they only make sense together: the
 * Registration with its permanent number, the rendered card as an immutable
 * hashed Document, and the CardIssuance tying them to the application. The
 * contracts declared with the application become BrokerageContract rows here,
 * because until now there was no Registration for them to belong to —
 * REQ-REG-063.
 *
 * The PDF is rendered before the transaction opens: Chromium takes a second or
 * two, and holding a row lock across it would block the queue.
 */
export async function performIssueCard(
  actor: ActorContext,
  input: { applicationId: string },
): Promise<StepOutcome> {
  const application = await db.application.findUnique({
    where: { id: input.applicationId },
    include: {
      entityData: true,
      contractData: { where: { archivedAt: null }, orderBy: { position: 'asc' } },
      examination: true,
      brokerEntity: { select: { id: true, partyId: true } },
    },
  })

  if (
    !application?.entityData ||
    !application.requestedCategory ||
    application.paidUpCapital === null
  ) {
    return refused(
      precondition({
        code: 'APPLICATION_NOT_READY_FOR_ISSUANCE',
        requirementIds: ['REQ-REG-050'],
        legalSource: 'GOEIC workflow, REQ-REG-050 step 5',
        ar: {
          blocked: 'لا يمكن إصدار البطاقة.',
          why: 'بيانات المنشأة أو الفئة أو رأس المال غير مكتملة في هذا الطلب.',
          nextStep: 'راجع الملف مع الفاحص قبل الإصدار.',
        },
        en: {
          blocked: 'The card cannot be issued.',
          why: 'The firm’s details, the category, or the capital are incomplete on this application.',
          nextStep: 'Refer the file back to the examiner before issuing.',
        },
      }),
    )
  }

  const asOf = application.submittedAt ?? new Date()
  const [categories, types, obligations] = await Promise.all([
    ruleSet<{ labelAr: string; labelEn: string }>('BROKER_CATEGORY', { asOf }),
    ruleSet<{ labelAr: string; labelEn: string }>('BROKER_TYPE', { asOf }),
    ruleSet<{ validityYears?: number }>('OBLIGATION_PERIODS', { asOf }),
  ])

  const issuedOn = new Date()
  const validFrom = application.examination?.proposedValidFrom ?? issuedOn
  // REGISTRATION_VALIDITY is marked [NEEDS COUNSEL], so it warns and never
  // blocks — CLAUDE.md rule 10. The examiner's proposal wins where there is
  // one; the unconfirmed default only fills the gap, and the audit event
  // records which of the two was used.
  const validityYears = obligations.byKey.get('REGISTRATION_VALIDITY')?.payload.validityYears ?? 5
  const validTo =
    application.examination?.proposedValidTo ??
    new Date(
      Date.UTC(validFrom.getUTCFullYear() + validityYears, validFrom.getUTCMonth(), validFrom.getUTCDate()),
    )

  const registrationNumber = await db.$transaction((tx) => allocateRegistrationNumber(tx, issuedOn))

  const entity = application.entityData
  const pdf = await renderPdf(
    registrationCardHtml({
      registrationNumber,
      tradeNameAr: entity.tradeNameAr,
      tradeNameEn: entity.tradeNameEn,
      categoryLabelAr:
        categories.byKey.get(application.requestedCategory)?.payload.labelAr ??
        application.requestedCategory,
      typeLabelsAr: application.requestedTypes.map(
        (type) => types.byKey.get(type)?.payload.labelAr ?? type,
      ),
      paidUpCapital: Number(application.paidUpCapital),
      validFrom,
      validTo,
      governorateAr: governorateLabels[entity.governorate].ar,
      addressAr: entity.headOfficeAddress,
      commercialRegisterNo: entity.commercialRegisterNo,
      issuedOn,
    }),
  )

  const hash = sha256(pdf)
  const filename = `registration-card-${registrationNumber.replace('/', '-')}.pdf`

  await putDocument({ bytes: pdf, mimeType: 'application/pdf', originalFilename: filename })

  const result = await transition({
    applicationId: input.applicationId,
    action: 'issue_card',
    actor,
    auditAction: 'REGISTRATION_CARD_ISSUED',
    reason: `Registration card issued under number ${registrationNumber}.`,
    apply: async ({ tx }) => {
      const registration = await tx.registration.create({
        data: {
          brokerEntityId: application.brokerEntityId,
          registrationNumber,
          category: application.requestedCategory!,
          types: application.requestedTypes,
          paidUpCapital: application.paidUpCapital!,
          validFrom,
          validTo,
          status: 'ACTIVE',
          decidedUnderRuleSetId: categories.id,
        },
      })

      const document = await tx.document.create({
        data: {
          kind: 'ISSUED_CARD',
          applicationId: application.id,
          sha256: hash,
          storageKey: storageKeyFor(hash),
          sizeBytes: pdf.byteLength,
          mimeType: 'application/pdf',
          originalFilename: filename,
          uploadedByUserId: actor.userId,
        },
      })

      await tx.cardIssuance.create({
        data: {
          applicationId: application.id,
          registrationId: registration.id,
          documentId: document.id,
          issuedByUserId: actor.userId,
          issuedAt: issuedOn,
        },
      })

      // REQ-REG-063 — the declared contracts become registered contracts.
      for (const contract of application.contractData) {
        await tx.brokerageContract.create({
          data: {
            brokerEntityId: application.brokerEntityId,
            registrationId: registration.id,
            clientNameAr: contract.clientNameAr,
            clientNameEn: contract.clientNameEn,
            clientNationality: contract.clientNationality,
            authenticationNumber: contract.authenticationNumber,
            authenticationBody: contract.authenticationBody,
            validFrom: contract.validFrom,
            validTo: contract.validTo,
            capacityActedIn: contract.capacityActedIn,
            contractValue: contract.contractValue,
            subjectDescription: contract.subjectDescription,
            subjectAddress: contract.subjectAddress,
            governorate: contract.governorate,
          },
        })
      }

      // The register's record of the firm catches up with what was approved.
      // One direction only: the application is never rewritten from the entity.
      await tx.brokerEntity.update({
        where: { id: application.brokerEntityId },
        data: {
          tradeNameAr: entity.tradeNameAr,
          tradeNameEn: entity.tradeNameEn,
          tradeStyleAr: entity.tradeStyleAr,
          tradeStyleEn: entity.tradeStyleEn,
          headOfficeAddress: entity.headOfficeAddress,
          governorate: entity.governorate,
        },
      })

      await tx.party.update({
        where: { id: application.brokerEntity.partyId },
        data: {
          nameAr: entity.tradeNameAr,
          nameEn: entity.tradeNameEn,
          type: entity.establishmentType,
          legalForm: entity.legalForm,
          commercialRegisterNo: entity.commercialRegisterNo,
          commercialRegisterOffice: entity.commercialRegisterOffice,
          commercialRegisterDate: entity.commercialRegisterDate,
          commercialRegisterRenewalDate: entity.commercialRegisterRenewalDate,
          taxRegistrationNo: entity.taxRegistrationNo,
          taxOffice: entity.taxOffice,
          addressLine: entity.headOfficeAddress,
          governorate: entity.governorate,
          poBox: entity.poBox,
          telephone: entity.telephone,
          email: entity.email,
        },
      })

      return {
        registration: { connect: { id: registration.id } },
        cardIssuer: { connect: { id: actor.userId } },
      }
    },
    auditPayload: {
      registrationNumber,
      validFrom: validFrom.toISOString(),
      validTo: validTo.toISOString(),
      cardSha256: hash,
      contractsRegistered: application.contractData.length,
      validityYearsSource: application.examination?.proposedValidTo
        ? 'EXAMINER'
        : 'OBLIGATION_PERIODS_DEFAULT',
    },
  })

  return result.ok ? { ok: true } : refused(result.violation)
}

// ── Step 6 — delivery ───────────────────────────────────────────────────────

export async function performRecordDelivery(
  actor: ActorContext,
  input: {
    applicationId: string
    deliveredToName: string
    renewalDateAcknowledged: boolean
    numberObligationAcknowledged: boolean
  },
): Promise<StepOutcome> {
  const result = await transition({
    applicationId: input.applicationId,
    action: 'deliver',
    actor,
    auditAction: 'REGISTRATION_CARD_DELIVERED',
    reason: `Delivered to ${input.deliveredToName}.`,
    apply: async ({ tx }) => {
      const serial = await allocateDeliverySerial(tx)
      await tx.cardIssuance.update({
        where: { applicationId: input.applicationId },
        data: {
          deliverySerial: serial,
          deliveredToName: input.deliveredToName,
          deliveredAt: new Date(),
          deliveredByUserId: actor.userId,
          renewalDateAcknowledged: input.renewalDateAcknowledged,
          numberObligationAcknowledged: input.numberObligationAcknowledged,
        },
      })
      return {}
    },
  })

  return result.ok ? { ok: true } : refused(result.violation)
}

// ── Steps 7 and 8 — data extraction and archiving ───────────────────────────

export async function performDataExtraction(
  actor: ActorContext,
  input: { applicationId: string; dataNote: string | null },
): Promise<StepOutcome> {
  const guarded = await requireActiveRegistration(input.applicationId, 'data extraction')
  if (!guarded.ok) return refused(guarded.violation)

  await db.$transaction(async (tx) => {
    await tx.fileHandlingRecord.upsert({
      where: { applicationId: input.applicationId },
      create: {
        applicationId: input.applicationId,
        dataExtractedByUserId: actor.userId,
        dataExtractedAt: new Date(),
        dataNote: input.dataNote,
      },
      update: {
        dataExtractedByUserId: actor.userId,
        dataExtractedAt: new Date(),
        dataNote: input.dataNote,
      },
    })

    await auditFileHandling(tx, actor, input.applicationId, 'FILE_DATA_EXTRACTED', {
      hasNote: Boolean(input.dataNote),
    })
  })

  return { ok: true }
}

export async function performArchive(
  actor: ActorContext,
  input: {
    applicationId: string
    pageCount: number
    serialRegisterNo: string
    alphabeticalIndex: string
    fileReference: string | null
  },
): Promise<StepOutcome> {
  const guarded = await requireActiveRegistration(input.applicationId, 'archiving')
  if (!guarded.ok) return refused(guarded.violation)

  await db.$transaction(async (tx) => {
    await tx.fileHandlingRecord.upsert({
      where: { applicationId: input.applicationId },
      create: {
        applicationId: input.applicationId,
        archivedByUserId: actor.userId,
        filedAt: new Date(),
        pageCount: input.pageCount,
        serialRegisterNo: input.serialRegisterNo,
        alphabeticalIndex: input.alphabeticalIndex,
        fileReference: input.fileReference,
      },
      update: {
        archivedByUserId: actor.userId,
        filedAt: new Date(),
        pageCount: input.pageCount,
        serialRegisterNo: input.serialRegisterNo,
        alphabeticalIndex: input.alphabeticalIndex,
        fileReference: input.fileReference,
      },
    })

    await auditFileHandling(tx, actor, input.applicationId, 'FILE_ARCHIVED', {
      pageCount: input.pageCount,
      // The intake count, so a discrepancy lives in the trail rather than only
      // on the screen that happened to notice it.
      intakePageCount: guarded.pageCount,
      pageCountMatchesIntake:
        guarded.pageCount === null || guarded.pageCount === input.pageCount,
      serialRegisterNo: input.serialRegisterNo,
    })
  })

  return { ok: true }
}

async function auditFileHandling(
  tx: Parameters<typeof recordAuditEvent>[1],
  actor: ActorContext,
  applicationId: string,
  action: string,
  payload: Prisma.InputJsonValue,
) {
  await recordAuditEvent(
    {
      action,
      entityType: 'Application',
      entityId: applicationId,
      actorUserId: actor.userId,
      actorRole: actor.role,
      actorLabel: `${actor.name} (${roleLabel(actor.role).en})`,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      payload,
    },
    tx,
  )
}

/**
 * The status gate for the two steps that do not transition.
 *
 * `transition()` performs this check for every other step as a side effect of
 * looking the move up in the transitions table. Steps 7 and 8 have no move, so
 * it has to be explicit — without it a file could be archived while it was
 * still under examination.
 */
async function requireActiveRegistration(
  applicationId: string,
  step: string,
): Promise<{ ok: true; pageCount: number | null } | { ok: false; violation: RuleViolation }> {
  const application = await db.application.findUnique({
    where: { id: applicationId },
    select: { status: true, pageCount: true },
  })

  if (!application || application.status !== 'ACTIVE') {
    return {
      ok: false,
      violation: precondition({
        code: 'FILE_NOT_AT_THIS_STEP',
        requirementIds: ['REQ-REG-050'],
        legalSource: 'GOEIC workflow, REQ-REG-050',
        evidence: { step, status: application?.status ?? null },
        ar: {
          blocked: 'لا يمكن تسجيل هذه الخطوة الآن.',
          why: 'الملف لم يصل بعد إلى المرحلة التي تُسجَّل فيها هذه الخطوة.',
          nextStep: 'انتظر حتى تُسلَّم البطاقة ويصبح القيد سارياً، ثم أعد المحاولة.',
        },
        en: {
          blocked: 'This step cannot be recorded yet.',
          why: 'The file has not yet reached the stage at which this step is recorded.',
          nextStep:
            'Wait until the card has been delivered and the registration is active, then try again.',
        },
      }),
    }
  }

  return { ok: true, pageCount: application.pageCount }
}
