'use server'

import type { Application, Prisma } from '@prisma/client'
import { z } from 'zod'
import { db } from '@/lib/db'
import { recordAuditEvent } from '@/lib/audit'
import { BROKER_ROLES, roleLabel } from '@/lib/auth/roles'
import { requireRole, type Session } from '@/lib/auth/session'
import { encryptPii, piiFingerprint } from '@/lib/crypto/pii'
import { submitApplication, withdrawApplication } from '@/lib/applications/draft'
import { notYourApplication, precondition } from '@/lib/applications/refusals'
import type { ActorContext } from '@/lib/applications/transition'
import { resolveDeclarations } from '@/lib/rules/declarations'
import type { RuleViolation } from '@/lib/rules/violation'
import {
  CapacitySchema,
  CategorySchema,
  ContractDataSchema,
  EntityDataSchema,
  PowerOfAttorneySchema,
  fieldErrors,
} from '@/lib/validation/application'

/**
 * The broker portal's Server Actions.
 *
 * Every one of them starts the same way and it is not an accident: the role is
 * checked, then the application is loaded, then ownership is checked, then the
 * application's own status is checked, and only then is the input parsed. The
 * order matters — parsing first would let a signed-out visitor discover which
 * fields exist by watching which ones a malformed request complains about.
 *
 * 02-SYSTEM-ARCHITECTURE §2: "Authorisation, validation, and every regulatory
 * rule execute on the server. Without exception." The client runs the same Zod
 * schemas for speed of feedback and its verdict is never consulted.
 */

export type StepResult =
  | { ok: true; next?: string }
  | { ok: false; kind: 'validation'; errors: Record<string, string> }
  | { ok: false; kind: 'refused'; violation: RuleViolation }

function validationFailure(errors: Record<string, string>): StepResult {
  return { ok: false, kind: 'validation', errors }
}

function refusal(violation: RuleViolation): StepResult {
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

/**
 * The states in which the applicant may still change their own file.
 *
 * DRAFT is obvious. AWAITING_COMPLETION is the one worth stating: the Authority
 * has asked for something, and an applicant who cannot edit their file cannot
 * answer. Everything else is read-only to the broker, because a file under
 * examination that changes underneath the examiner is a file whose examination
 * means nothing.
 */
const EDITABLE_STATES = new Set(['DRAFT', 'AWAITING_COMPLETION'])

async function openForEditing(applicationId: string): Promise<
  { ok: true; session: Session; application: Application } | { ok: false; result: StepResult }
> {
  const session = await requireRole(BROKER_ROLES)

  const application = await db.application.findUnique({ where: { id: applicationId } })

  if (
    !application ||
    !session.brokerEntityId ||
    application.brokerEntityId !== session.brokerEntityId
  ) {
    return { ok: false, result: refusal(notYourApplication()) }
  }

  if (!EDITABLE_STATES.has(application.status)) {
    return {
      ok: false,
      result: refusal(
        precondition({
          code: 'APPLICATION_NOT_EDITABLE',
          requirementIds: ['REQ-REG-050'],
          legalSource: 'GOEIC workflow, REQ-REG-050',
          evidence: { status: application.status },
          ar: {
            blocked: 'لا يمكن تعديل هذا الطلب الآن.',
            why: 'الطلب قيد النظر لدى الهيئة، والبيانات تُجمَّد أثناء الفحص حتى يفحص الموظف ما قُدِّم بالفعل.',
            nextStep:
              'انتظر نتيجة الفحص. إذا طلبت الهيئة استيفاءً، سيُفتح الطلب للتعديل في البنود المطلوبة.',
          },
          en: {
            blocked: 'This application cannot be edited now.',
            why: 'It is with the Authority, and the details are frozen during examination so that the officer examines what was actually submitted.',
            nextStep:
              'Wait for the outcome. If the Authority requests a completion, the application reopens for the items it asks about.',
          },
        }),
      ),
    }
  }

  return { ok: true, session, application }
}

/** Every draft edit is an audited write. REQ-DPA-002 and §7. */
async function auditDraftWrite(
  session: Session,
  applicationId: string,
  step: string,
  payload: Prisma.InputJsonValue,
  tx?: Parameters<typeof recordAuditEvent>[1],
) {
  await recordAuditEvent(
    {
      action: 'APPLICATION_DRAFT_UPDATED',
      entityType: 'Application',
      entityId: applicationId,
      actorUserId: session.userId,
      actorRole: session.role,
      actorLabel: `${session.name} (${roleLabel(session.role).en})`,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      reason: `Applicant updated the "${step}" step of their draft.`,
      payload,
    },
    tx,
  )
}

// ── Starting an application ─────────────────────────────────────────────────

/**
 * Start a new application, creating the firm's record if this is the first one.
 *
 * A self-registered broker has an account and nothing else. The BrokerEntity
 * and its Party are created here rather than at sign-up because at sign-up
 * there is nothing true to put in them — a firm record whose trade name is a
 * copy of somebody's email address is worse than no firm record. The entity
 * step fills in the real names, and issuance projects them onto the register.
 */
export async function startApplicationAction(): Promise<
  { ok: true; applicationId: string } | { ok: false; kind: 'refused'; violation: RuleViolation }
> {
  const session = await requireRole(BROKER_ROLES)

  const existingDraft = session.brokerEntityId
    ? await db.application.findFirst({
        where: { brokerEntityId: session.brokerEntityId, status: 'DRAFT', archivedAt: null },
        orderBy: { updatedAt: 'desc' },
        select: { id: true },
      })
    : null

  // One draft at a time. A broker who presses "start" twice should land back in
  // the application they already began, not accumulate empty files that the
  // register can never delete.
  if (existingDraft) return { ok: true, applicationId: existingDraft.id }

  const applicationId = await db.$transaction(async (tx) => {
    let brokerEntityId = session.brokerEntityId

    if (!brokerEntityId) {
      const party = await tx.party.create({
        data: {
          type: 'NATURAL_PERSON',
          // A placeholder that says what it is. Replaced at the entity step.
          nameAr: session.nameAr ?? session.name,
          nameEn: session.name,
          email: session.email,
        },
      })

      const entity = await tx.brokerEntity.create({
        data: { partyId: party.id, tradeNameAr: party.nameAr, tradeNameEn: party.nameEn },
      })

      await tx.user.update({
        where: { id: session.userId },
        data: { brokerEntityId: entity.id },
      })

      brokerEntityId = entity.id

      await recordAuditEvent(
        {
          action: 'BROKER_ENTITY_CREATED',
          entityType: 'BrokerEntity',
          entityId: entity.id,
          actorUserId: session.userId,
          actorRole: session.role,
          actorLabel: `${session.name} (${roleLabel(session.role).en})`,
          ipAddress: session.ipAddress,
          userAgent: session.userAgent,
          reason: 'First registration application started by this account.',
          payload: { partyId: party.id },
        },
        tx,
      )
    }

    const application = await tx.application.create({
      data: { brokerEntityId, kind: 'NEW_REGISTRATION', status: 'DRAFT' },
    })

    await recordAuditEvent(
      {
        action: 'APPLICATION_STARTED',
        entityType: 'Application',
        entityId: application.id,
        actorUserId: session.userId,
        actorRole: session.role,
        actorLabel: `${session.name} (${roleLabel(session.role).en})`,
        toState: 'DRAFT',
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        payload: { brokerEntityId, kind: 'NEW_REGISTRATION' },
      },
      tx,
    )

    return application.id
  })

  return { ok: true, applicationId }
}

// ── Step 1 — capacity and applicant identity ────────────────────────────────

export async function saveCapacityAction(
  _previous: StepResult | null,
  formData: FormData,
): Promise<StepResult> {
  const applicationId = String(formData.get('applicationId') ?? '')
  const opened = await openForEditing(applicationId)
  if (!opened.ok) return opened.result

  const parsed = CapacitySchema.safeParse({
    applicantCapacity: formData.get('applicantCapacity'),
    applicantNameAr: formData.get('applicantNameAr'),
    applicantNameEn: formData.get('applicantNameEn'),
    applicantNationalId: formData.get('applicantNationalId'),
    applicantNationality: formData.get('applicantNationality') || undefined,
  })

  if (!parsed.success) return validationFailure(fieldErrors(parsed.error))

  const { session, application } = opened
  const data = parsed.data

  await db.$transaction(async (tx) => {
    // Two columns, one number, and the reason is in src/lib/crypto/pii.ts: the
    // ciphertext is what a cleared officer can read, and the keyed fingerprint
    // is what makes "the same person is the responsible manager of nine firms"
    // computable without the plaintext ever being comparable.
    const partyData = {
      type: 'NATURAL_PERSON' as const,
      nameAr: data.applicantNameAr,
      nameEn: data.applicantNameEn,
      nationality: data.applicantNationality,
      nationalIdEnc: encryptPii(data.applicantNationalId),
      nationalIdHash: piiFingerprint(data.applicantNationalId),
    }

    const partyId = application.applicantPartyId
      ? (await tx.party.update({ where: { id: application.applicantPartyId }, data: partyData })).id
      : (await tx.party.create({ data: partyData })).id

    await tx.application.update({
      where: { id: application.id },
      data: { applicantCapacity: data.applicantCapacity, applicantPartyId: partyId },
    })

    // The capacity has changed away from agent: the power of attorney is no
    // longer part of this application. The POA record itself stays — nothing is
    // deleted — but the link is cleared so the checklist and the step count
    // stop asking about it.
    if (data.applicantCapacity !== 'AGENT_UNDER_POA' && application.powerOfAttorneyId) {
      await tx.application.update({
        where: { id: application.id },
        data: { powerOfAttorneyId: null },
      })
    }

    await auditDraftWrite(
      session,
      application.id,
      'capacity',
      {
        applicantCapacity: data.applicantCapacity,
        // The fingerprint, never the number. The trail evidences that an
        // identity was recorded; it is not a second copy of it.
        applicantNationalIdFingerprint: partyData.nationalIdHash,
      },
      tx,
    )
  })

  const next =
    data.applicantCapacity === 'AGENT_UNDER_POA' ? 'power-of-attorney' : 'entity'

  return { ok: true, next: `/application/${application.id}/${next}` }
}

// ── Step 2 — power of attorney, REQ-REG-041 ─────────────────────────────────

export async function savePowerOfAttorneyAction(
  _previous: StepResult | null,
  formData: FormData,
): Promise<StepResult> {
  const applicationId = String(formData.get('applicationId') ?? '')
  const opened = await openForEditing(applicationId)
  if (!opened.ok) return opened.result

  const parsed = PowerOfAttorneySchema.safeParse({
    poaType: formData.get('poaType'),
    number: formData.get('number'),
    year: formData.get('year'),
    notarisationOffice: formData.get('notarisationOffice'),
    notarisedOn: formData.get('notarisedOn') || undefined,
    declaresStillValid: formData.get('declaresStillValid') === 'on',
    declaresPrincipalAlive: formData.get('declaresPrincipalAlive') === 'on',
  })

  if (!parsed.success) return validationFailure(fieldErrors(parsed.error))

  const { session, application } = opened
  const data = parsed.data
  const declaredAt = new Date()

  await db.$transaction(async (tx) => {
    // REQ-REG-041 — number + year + office is the composite key, so the same
    // instrument used across unrelated applicants resolves to one row and the
    // reuse becomes visible instead of being invisible in three copies.
    const poa = await tx.powerOfAttorney.upsert({
      where: {
        number_year_notarisationOffice: {
          number: data.number,
          year: data.year,
          notarisationOffice: data.notarisationOffice,
        },
      },
      create: {
        poaType: data.poaType,
        number: data.number,
        year: data.year,
        notarisationOffice: data.notarisationOffice,
        notarisedOn: data.notarisedOn,
        stillValidDeclaredAt: declaredAt,
        principalAliveDeclaredAt: declaredAt,
      },
      update: {
        poaType: data.poaType,
        notarisedOn: data.notarisedOn,
        stillValidDeclaredAt: declaredAt,
        principalAliveDeclaredAt: declaredAt,
      },
    })

    await tx.application.update({
      where: { id: application.id },
      data: { powerOfAttorneyId: poa.id },
    })

    await auditDraftWrite(
      session,
      application.id,
      'power-of-attorney',
      {
        powerOfAttorneyId: poa.id,
        number: data.number,
        year: data.year,
        notarisationOffice: data.notarisationOffice,
        declaredStillValidAt: declaredAt.toISOString(),
        declaredPrincipalAliveAt: declaredAt.toISOString(),
      },
      tx,
    )
  })

  return { ok: true, next: `/application/${application.id}/entity` }
}

// ── Step 3 — entity data, REQ-REG-030 ───────────────────────────────────────

export async function saveEntityAction(
  _previous: StepResult | null,
  formData: FormData,
): Promise<StepResult> {
  const applicationId = String(formData.get('applicationId') ?? '')
  const opened = await openForEditing(applicationId)
  if (!opened.ok) return opened.result

  const parsed = EntityDataSchema.safeParse({
    establishmentType: formData.get('establishmentType'),
    legalForm: formData.get('legalForm'),
    tradeNameAr: formData.get('tradeNameAr'),
    tradeNameEn: formData.get('tradeNameEn'),
    tradeStyleAr: formData.get('tradeStyleAr'),
    tradeStyleEn: formData.get('tradeStyleEn'),
    headOfficeAddress: formData.get('headOfficeAddress'),
    governorate: formData.get('governorate'),
    poBox: formData.get('poBox'),
    telephone: formData.get('telephone'),
    email: formData.get('email'),
    commercialRegisterNo: formData.get('commercialRegisterNo'),
    commercialRegisterOffice: formData.get('commercialRegisterOffice'),
    commercialRegisterDate: formData.get('commercialRegisterDate'),
    commercialRegisterRenewalDate: formData.get('commercialRegisterRenewalDate') || undefined,
    taxRegistrationNo: formData.get('taxRegistrationNo'),
    taxOffice: formData.get('taxOffice'),
  })

  if (!parsed.success) return validationFailure(fieldErrors(parsed.error))

  const { session, application } = opened
  const data = parsed.data

  await db.$transaction(async (tx) => {
    await tx.applicationEntityData.upsert({
      where: { applicationId: application.id },
      create: { applicationId: application.id, ...data },
      update: data,
    })

    await auditDraftWrite(
      session,
      application.id,
      'entity',
      {
        tradeNameAr: data.tradeNameAr,
        establishmentType: data.establishmentType,
        commercialRegisterNo: data.commercialRegisterNo,
        commercialRegisterOffice: data.commercialRegisterOffice,
        taxRegistrationNo: data.taxRegistrationNo,
        governorate: data.governorate,
      },
      tx,
    )
  })

  return { ok: true, next: `/application/${application.id}/category` }
}

// ── Step 4 — types, category, capital. REQ-REG-010 · 020 · 021 ──────────────

export async function saveCategoryAction(
  _previous: StepResult | null,
  formData: FormData,
): Promise<StepResult> {
  const applicationId = String(formData.get('applicationId') ?? '')
  const opened = await openForEditing(applicationId)
  if (!opened.ok) return opened.result

  const parsed = CategorySchema.safeParse({
    requestedTypes: formData.getAll('requestedTypes').map(String),
    requestedCategory: formData.get('requestedCategory'),
    paidUpCapital: formData.get('paidUpCapital'),
  })

  if (!parsed.success) return validationFailure(fieldErrors(parsed.error))

  const { session, application } = opened
  const data = parsed.data

  // The capital/category rule is *not* enforced here, and that is deliberate.
  // REQ-REG-021 refuses the *application*, not the keystroke — a broker who
  // types Category C before correcting their capital figure must be able to
  // save and come back. The refusal is computed on every screen from this point
  // on, shown in full on the review step, and enforced at submission where the
  // rule actually bites.
  await db.$transaction(async (tx) => {
    await tx.application.update({
      where: { id: application.id },
      data: {
        requestedTypes: data.requestedTypes,
        requestedCategory: data.requestedCategory,
        paidUpCapital: data.paidUpCapital,
      },
    })

    await auditDraftWrite(
      session,
      application.id,
      'category',
      {
        requestedTypes: data.requestedTypes,
        requestedCategory: data.requestedCategory,
        paidUpCapital: data.paidUpCapital,
      },
      tx,
    )
  })

  return { ok: true, next: `/application/${application.id}/contracts` }
}

// ── Step 5 — brokerage contract data, REQ-REG-030 ───────────────────────────

export async function saveContractAction(
  _previous: StepResult | null,
  formData: FormData,
): Promise<StepResult> {
  const applicationId = String(formData.get('applicationId') ?? '')
  const opened = await openForEditing(applicationId)
  if (!opened.ok) return opened.result

  const contractId = String(formData.get('contractId') ?? '')

  const parsed = ContractDataSchema.safeParse({
    clientNameAr: formData.get('clientNameAr'),
    clientNameEn: formData.get('clientNameEn'),
    clientNationality: formData.get('clientNationality'),
    authenticationBody: formData.get('authenticationBody'),
    authenticationNumber: formData.get('authenticationNumber'),
    validFrom: formData.get('validFrom'),
    validTo: formData.get('validTo'),
    capacityActedIn: formData.get('capacityActedIn'),
    contractValue: formData.get('contractValue'),
    subjectDescription: formData.get('subjectDescription'),
    subjectAddress: formData.get('subjectAddress'),
    governorate: formData.get('governorate') || null,
  })

  if (!parsed.success) return validationFailure(fieldErrors(parsed.error))

  const { session, application } = opened
  const data = parsed.data

  await db.$transaction(async (tx) => {
    if (contractId) {
      const existing = await tx.applicationContractData.findFirst({
        where: { id: contractId, applicationId: application.id },
      })
      if (existing) {
        await tx.applicationContractData.update({ where: { id: existing.id }, data })
      }
    } else {
      const highest = await tx.applicationContractData.aggregate({
        where: { applicationId: application.id },
        _max: { position: true },
      })
      await tx.applicationContractData.create({
        data: { applicationId: application.id, position: (highest._max.position ?? 0) + 1, ...data },
      })
    }

    await auditDraftWrite(
      session,
      application.id,
      'contracts',
      {
        contractId: contractId || null,
        clientNameAr: data.clientNameAr,
        capacityActedIn: data.capacityActedIn,
        authenticationBody: data.authenticationBody,
      },
      tx,
    )
  })

  return { ok: true, next: `/application/${application.id}/contracts` }
}

/**
 * "Remove" a contract from the application.
 *
 * Archived, never deleted — CLAUDE.md rule 2, and the database would refuse a
 * delete anyway. What the applicant means by "remove" is "this is not part of
 * what I am asking for", and archiving says exactly that while keeping the row
 * the Authority may later need to explain why the file looks as it does.
 */
export async function archiveContractAction(
  _previous: StepResult | null,
  formData: FormData,
): Promise<StepResult> {
  const applicationId = String(formData.get('applicationId') ?? '')
  const contractId = String(formData.get('contractId') ?? '')
  const opened = await openForEditing(applicationId)
  if (!opened.ok) return opened.result

  const { session, application } = opened

  await db.$transaction(async (tx) => {
    const existing = await tx.applicationContractData.findFirst({
      where: { id: contractId, applicationId: application.id, archivedAt: null },
    })
    if (!existing) return

    await tx.applicationContractData.update({
      where: { id: existing.id },
      data: { archivedAt: new Date() },
    })

    await auditDraftWrite(
      session,
      application.id,
      'contracts',
      { archivedContractId: existing.id, clientNameAr: existing.clientNameAr },
      tx,
    )
  })

  return { ok: true, next: `/application/${application.id}/contracts` }
}

// ── Step 7 — declarations, REQ-REG-040 ──────────────────────────────────────

const DeclarationActionSchema = z.object({
  applicationId: z.string().min(1),
  declarationKey: z.string().regex(/^DECL-\d{2}$/),
  affirmed: z.boolean(),
  qualification: z.string().trim().max(400).optional(),
})

/**
 * Record one declaration.
 *
 * One at a time, each with its own timestamp, because REQ-REG-040 requires a
 * discrete individually recorded assertion and a batch write would stamp
 * fifteen identical times on fifteen supposedly separate acts. The wording is
 * copied onto the row as it is asserted, so the register can always show what
 * the applicant actually signed rather than what the rule set says today.
 */
export async function setDeclarationAction(input: {
  applicationId: string
  declarationKey: string
  affirmed: boolean
  qualification?: string
}): Promise<StepResult> {
  const parsedInput = DeclarationActionSchema.safeParse(input)
  if (!parsedInput.success) return validationFailure(fieldErrors(parsedInput.error))

  const opened = await openForEditing(parsedInput.data.applicationId)
  if (!opened.ok) return opened.result

  const { session, application } = opened
  const { declarationKey, affirmed, qualification } = parsedInput.data

  const asOf = new Date()
  const declarations = await resolveDeclarations({ asOf })
  const item = declarations.items.find((i) => i.key === declarationKey)

  if (!item) {
    return refusal(
      precondition({
        code: 'DECLARATION_NOT_IN_FORCE',
        requirementIds: ['REQ-REG-040'],
        legalSource: 'GOEIC forms CR-CA-QR-07-31 and cr-ca-QR 07-030',
        evidence: { declarationKey },
        ar: {
          blocked: 'لم يُسجَّل هذا الإقرار.',
          why: 'البند المطلوب ليس ضمن الإقرارات السارية في هذا التاريخ.',
          nextStep: 'أعد تحميل الصفحة لعرض الإقرارات السارية.',
        },
        en: {
          blocked: 'This declaration was not recorded.',
          why: 'The item is not among the declarations in force on this date.',
          nextStep: 'Reload the page to see the declarations currently in force.',
        },
      }),
    )
  }

  await db.$transaction(async (tx) => {
    await tx.declaration.upsert({
      where: {
        applicationId_declarationKey: { applicationId: application.id, declarationKey },
      },
      create: {
        applicationId: application.id,
        declarationKey,
        // The wording asserted, captured at the moment of assertion.
        textAr: item.payload.textAr,
        textEn: item.payload.textEn,
        affirmed,
        qualification: qualification?.trim() || null,
        assertedAt: new Date(),
        ipAddress: session.ipAddress,
        ruleSetId: declarations.ruleSetId,
      },
      update: {
        textAr: item.payload.textAr,
        textEn: item.payload.textEn,
        affirmed,
        qualification: qualification?.trim() || null,
        assertedAt: new Date(),
        ipAddress: session.ipAddress,
        ruleSetId: declarations.ruleSetId,
      },
    })

    await recordAuditEvent(
      {
        action: affirmed ? 'DECLARATION_AFFIRMED' : 'DECLARATION_QUALIFIED',
        entityType: 'Application',
        entityId: application.id,
        actorUserId: session.userId,
        actorRole: session.role,
        actorLabel: `${session.name} (${roleLabel(session.role).en})`,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        ruleSetVersions: { DECLARATIONS: declarations.ruleSetVersion },
        payload: {
          declarationKey,
          affirmed,
          hasQualification: Boolean(qualification?.trim()),
        },
      },
      tx,
    )
  })

  return { ok: true }
}

// ── Step 8 — submission ─────────────────────────────────────────────────────

/**
 * Submit, or refuse and say exactly why.
 *
 * The completeness evaluation runs here again, on the server, against a fresh
 * read. The review screen has already shown the applicant the same answer, and
 * that is a courtesy; this is the control. A submission arriving by `curl` with
 * no documents and no declarations meets exactly the same wall.
 */
export async function submitApplicationAction(
  _previous: StepResult | null,
  formData: FormData,
): Promise<StepResult> {
  const applicationId = String(formData.get('applicationId') ?? '')
  const opened = await openForEditing(applicationId)
  if (!opened.ok) return opened.result

  const result = await submitApplication(actorFrom(opened.session), applicationId)
  if (!result.ok) return refusal(result.violation)

  return { ok: true, next: `/application/${applicationId}/review` }
}

/** Withdraw. The file stops being considered; it is never removed. */
export async function withdrawApplicationAction(
  _previous: StepResult | null,
  formData: FormData,
): Promise<StepResult> {
  const applicationId = String(formData.get('applicationId') ?? '')
  const session = await requireRole(BROKER_ROLES)

  const result = await withdrawApplication(actorFrom(session), applicationId)
  if (!result.ok) return refusal(result.violation)

  return { ok: true, next: '/application' }
}
