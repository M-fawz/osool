/**
 * The Phase 1 demonstration register.
 *
 *   npm run seed:phase1
 *
 * Creates the accounts and then *walks* twelve applications through
 * REQ-REG-050 — through `src/lib/applications/workflow.ts`, the same functions
 * the Server Actions call. Nothing here inserts an application row at a chosen
 * status: the state machine moves every one of them, so every file in the
 * demonstration carries a real event trail with real actors, real timestamps,
 * and real audit events hash-chained into the same trail as everything else.
 *
 * That is not thoroughness for its own sake. The Phase 1 proof point is "a
 * complete application travels from a broker's phone to an issued registration
 * card, with every hand it passed through named and timestamped" — and a seed
 * that faked the states would have demonstrated a screenshot.
 *
 * Idempotent and additive. It refuses to run outside development or against a
 * non-local database, checked in code rather than documented.
 */

import { parseArgs } from 'node:util'
import type { ApplicantCapacity, ApplicationStatus, Role, User } from '@prisma/client'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { recordAuditEvent } from '@/lib/audit'
import { checkNationalIdStructure, encryptPii, piiFingerprint } from '@/lib/crypto/pii'
import { submitApplication } from '@/lib/applications/draft'
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
} from '@/lib/applications/workflow'
import type { ActorContext } from '@/lib/applications/transition'
import { ruleSet } from '@/lib/rules'
import { resolveDeclarations } from '@/lib/rules/declarations'
import { resolveDocumentChecklist } from '@/lib/rules/documents'
import { putDocument, sha256, storageKeyFor } from '@/lib/storage'
import { renderPng } from '@/lib/pdf/render'
import { closePdfBrowser } from '@/lib/pdf/render'
import { DEMO_BROKERS, DEMO_COMPLETIONS, DEMO_OFFICIALS, type DemoBroker } from './lib/demo-data'
import { announceDemonstrationTarget, requireSeedableTarget } from './lib/demonstration-gate'

const DEV_PASSWORD = 'DevOnly!Osool2026'

/**
 * The administrator account the project owner signs in with.
 *
 * Its password is set directly rather than through the activation-email path,
 * which is the one deliberate deviation from the real provisioning flow in this
 * script. It exists so a demonstration can begin without a mail round trip, and
 * it must never exist on a deployed system — hence the refusals below, and the
 * warning printed at the end.
 */
const OWNER_ADMIN = {
  email: 'mahmoud.fawzy@osool.gov.eg',
  name: 'MahmoudFawzy',
  nameAr: 'محمود فوزي',
  password: 'MahmoudFawzy@123',
  role: 'SYSTEM_ADMIN' as const,
}

/**
 * Where this may run. See scripts/lib/demonstration-gate.ts for why a hosted
 * deployment is allowed at all and what it takes to unlock one.
 */
function checkTarget(flagGiven: boolean): { hosted: boolean } {
  return requireSeedableTarget({ script: 'seed:phase1', flagGiven })
}

function actorFor(user: User): ActorContext {
  return {
    userId: user.id,
    role: user.role,
    name: user.name,
    brokerEntityId: user.brokerEntityId,
    ipAddress: '127.0.0.1',
    userAgent: 'osool-seed/phase-1',
  }
}

/** Create or reconcile an account. Accounts are never deleted (rule 2). */
async function ensureAccount(input: {
  email: string
  name: string
  nameAr: string
  role: Role
  password: string
  resetPassword: boolean
}): Promise<User> {
  const existing = await db.user.findUnique({ where: { email: input.email } })

  if (existing) {
    const updated = await db.user.update({
      where: { id: existing.id },
      // The name is reconciled too, so an account left over from an earlier
      // seed does not keep showing as "Dev Examiner" in the event trail.
      data: {
        role: input.role,
        status: 'ACTIVE',
        name: input.name,
        nameAr: input.nameAr,
        emailVerified: true,
      },
    })

    if (input.resetPassword) {
      const ctx = await auth.$context
      await ctx.internalAdapter.updatePassword(existing.id, await ctx.password.hash(input.password))
    }

    return updated
  }

  // Through Better Auth's ordinary sign-up, so the password is hashed exactly
  // as a real one would be. There is no back door here.
  const created = await auth.api.signUpEmail({
    body: { email: input.email, password: input.password, name: input.name },
  })

  if (!created?.user?.id) throw new Error(`Could not create ${input.email}`)

  const user = await db.user.update({
    where: { id: created.user.id },
    data: { role: input.role, status: 'ACTIVE', nameAr: input.nameAr, emailVerified: true },
  })

  await recordAuditEvent({
    action: 'DEV_ACCOUNT_SEEDED',
    entityType: 'User',
    entityId: user.id,
    actorLabel: 'phase-1 demonstration seed (command line)',
    toState: 'ACTIVE',
    reason: `Development account created for ${input.email}. Not a production path.`,
    payload: { email: input.email, role: input.role },
  })

  return user
}

/**
 * A stand-in scanned document.
 *
 * Rendered once per checklist item and reused across every application. Because
 * storage is content-addressed, identical bytes are written exactly once
 * however many files reference them — which is also a small demonstration of
 * why the storage layer is built that way.
 *
 * Rendered rather than a 1×1 pixel: the examiner's screen shows the document
 * beside the data, and a blank square would make that screen impossible to
 * evaluate.
 */
const documentCache = new Map<string, { bytes: Buffer; hash: string }>()

async function scannedDocument(labelAr: string, labelEn: string, subjectAr: string) {
  const key = `${labelAr}::${subjectAr}`
  const cached = documentCache.get(key)
  if (cached) return cached

  const html = `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><!--FONTS--><style>
  body { margin:0; font-family:'Plex Arabic','Plex Latin',sans-serif; background:#fbfaf6; color:#16181d; }
  .sheet { padding:28px 32px; border:1px solid #ddd; }
  .stamp { display:inline-block; border:2px solid #0F2D53; color:#0F2D53; padding:6px 14px;
           font-size:12px; letter-spacing:.04em; transform:rotate(-3deg); }
  h1 { font-size:20px; margin:18px 0 4px; color:#0C2444; }
  .en { font-size:12px; color:#4A5261; direction:ltr; unicode-bidi:isolate; }
  .rule { height:2px; background:#A7844E; margin:14px 0 18px; }
  dl { display:grid; grid-template-columns:34% 66%; row-gap:8px; font-size:13px; margin:0; }
  dt { color:#4A5261; } dd { margin:0; font-weight:500; }
  .note { margin-top:22px; font-size:11px; color:#6B7383; border-top:1px solid #ddd; padding-top:10px; }
</style></head><body><div class="sheet">
  <span class="stamp">جمهورية مصر العربية — صورة مستند</span>
  <h1>${labelAr}</h1>
  <div class="en">${labelEn}</div>
  <div class="rule"></div>
  <dl>
    <dt>الجهة المصدرة</dt><dd>${subjectAr}</dd>
    <dt>حالة المستند</dt><dd>صورة ضوئية للاطلاع</dd>
    <dt>ملاحظة</dt><dd>مستند تجريبي لأغراض العرض فقط، وليس مستنداً رسمياً.</dd>
  </dl>
  <p class="note">This is a placeholder document generated for the Phase 1 demonstration register.
  It is not an official document and carries no legal effect.</p>
</div></body></html>`

  const bytes = await renderPng(html, 760)
  const value = { bytes, hash: sha256(bytes) }
  documentCache.set(key, value)
  return value
}

/** Fill in every step of a broker's draft, exactly as the portal would. */
async function fillDraft(broker: DemoBroker, applicationId: string, owner: User) {
  const check = checkNationalIdStructure(broker.nationalId)
  if (!check.ok) {
    throw new Error(
      `Demo national ID for ${broker.email} is not structurally valid (${check.reason}). ` +
        'Fix scripts/lib/demo-data.ts rather than relaxing the check.',
    )
  }

  const applicantParty = await db.party.create({
    data: {
      type: 'NATURAL_PERSON',
      nameAr: broker.ownerNameAr,
      nameEn: broker.ownerNameEn,
      nationality: 'مصري',
      nationalIdEnc: encryptPii(broker.nationalId),
      nationalIdHash: piiFingerprint(broker.nationalId),
      dateOfBirth: check.dateOfBirth,
    },
  })

  let powerOfAttorneyId: string | null = null
  if (broker.poa) {
    const declaredAt = new Date()
    const poa = await db.powerOfAttorney.upsert({
      where: {
        number_year_notarisationOffice: {
          number: broker.poa.number,
          year: broker.poa.year,
          notarisationOffice: broker.poa.office,
        },
      },
      create: {
        poaType: broker.poa.type,
        number: broker.poa.number,
        year: broker.poa.year,
        notarisationOffice: broker.poa.office,
        notarisedOn: new Date(`${broker.poa.year}-01-15T00:00:00.000Z`),
        stillValidDeclaredAt: declaredAt,
        principalAliveDeclaredAt: declaredAt,
      },
      update: { stillValidDeclaredAt: declaredAt, principalAliveDeclaredAt: declaredAt },
    })
    powerOfAttorneyId = poa.id
  }

  await db.application.update({
    where: { id: applicationId },
    data: {
      applicantCapacity: broker.capacity as ApplicantCapacity,
      applicantPartyId: applicantParty.id,
      powerOfAttorneyId,
      requestedCategory: broker.category,
      requestedTypes: broker.types,
      paidUpCapital: broker.capital,
    },
  })

  await db.applicationEntityData.upsert({
    where: { applicationId },
    create: {
      applicationId,
      establishmentType: broker.establishmentType,
      legalForm: broker.legalForm,
      tradeNameAr: broker.tradeNameAr,
      tradeNameEn: broker.tradeNameEn,
      tradeStyleAr: broker.tradeStyleAr,
      headOfficeAddress: broker.address,
      governorate: broker.governorate,
      poBox: broker.poBox,
      telephone: broker.telephone,
      email: broker.email,
      commercialRegisterNo: broker.commercialRegisterNo,
      commercialRegisterOffice: broker.commercialRegisterOffice,
      commercialRegisterDate: new Date(`${broker.commercialRegisterDate}T00:00:00.000Z`),
      commercialRegisterRenewalDate: new Date(`${broker.commercialRegisterRenewalDate}T00:00:00.000Z`),
      taxRegistrationNo: broker.taxRegistrationNo,
      taxOffice: broker.taxOffice,
    },
    update: {},
  })

  const existingContract = await db.applicationContractData.findFirst({ where: { applicationId } })
  if (!existingContract) {
    await db.applicationContractData.create({
      data: {
        applicationId,
        position: 1,
        clientNameAr: broker.contract.clientNameAr,
        clientNameEn: broker.contract.clientNameEn,
        clientNationality: broker.contract.nationality,
        authenticationBody: broker.contract.authenticationBody,
        authenticationNumber: broker.contract.authenticationNumber,
        validFrom: new Date(`${broker.contract.validFrom}T00:00:00.000Z`),
        validTo: new Date(`${broker.contract.validTo}T00:00:00.000Z`),
        capacityActedIn: broker.contract.capacityActedIn,
        contractValue: broker.contract.value,
        subjectDescription: broker.contract.subjectDescription,
        subjectAddress: broker.contract.subjectAddress,
        governorate: broker.contract.governorate,
      },
    })
  }

  // ── Documents, from the checklist that actually applies ──────────────────
  const asOf = new Date()
  const checklist = await resolveDocumentChecklist(
    { establishmentType: broker.establishmentType, capacity: broker.capacity },
    { asOf },
  )

  for (const item of checklist.required) {
    const already = await db.document.findFirst({
      where: { applicationId, checklistItemKey: item.key, archivedAt: null },
    })
    if (already) continue

    const scan = await scannedDocument(
      item.payload.labelAr,
      item.payload.labelEn,
      broker.tradeNameAr,
    )

    await putDocument({
      bytes: scan.bytes,
      mimeType: 'image/png',
      originalFilename: `${item.key.toLowerCase()}.png`,
    })

    await db.document.create({
      data: {
        kind: 'APPLICANT_UPLOAD',
        checklistItemKey: item.key,
        applicationId,
        sha256: scan.hash,
        storageKey: storageKeyFor(scan.hash),
        sizeBytes: scan.bytes.byteLength,
        mimeType: 'image/png',
        originalFilename: `${item.key.toLowerCase()}.png`,
        uploadedByUserId: owner.id,
      },
    })
  }

  // ── The fifteen declarations, each with its own timestamp ────────────────
  const declarations = await resolveDeclarations({ asOf })
  for (const item of declarations.items) {
    await db.declaration.upsert({
      where: { applicationId_declarationKey: { applicationId, declarationKey: item.key } },
      create: {
        applicationId,
        declarationKey: item.key,
        textAr: item.payload.textAr,
        textEn: item.payload.textEn,
        affirmed: true,
        assertedAt: new Date(),
        ipAddress: '127.0.0.1',
        ruleSetId: declarations.ruleSetId,
      },
      update: {},
    })
    // A distinct timestamp per assertion, which is the whole point of
    // REQ-REG-040's "individually recorded". A batch write would stamp fifteen
    // identical times on fifteen supposedly separate acts.
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
}

interface Officials {
  clerk: User
  examiner: User
  examiner2: User
  reviewer: User
  reviewer2: User
  issuer: User
  data: User
  files: User
}
/**
 * The status each demonstration stage is meant to end at.
 *
 * An explicit table rather than a chain of early returns. The first version of
 * this walk decided when to stop by checking the stage name at each step, and
 * two files quietly ran past their intended state — the failure mode of every
 * "walk until it looks right" loop. Naming the destination makes overshooting
 * impossible: the loop runs while the file is not there yet, and then stops.
 */
const TARGET_STATUS: Record<DemoBroker['stage'], ApplicationStatus> = {
  DRAFT_INCOMPLETE: 'DRAFT',
  DRAFT_CAPITAL_SHORTFALL: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  UNDER_INTAKE: 'UNDER_INTAKE',
  UNDER_EXAMINATION: 'UNDER_EXAMINATION',
  AWAITING_COMPLETION: 'AWAITING_COMPLETION',
  UNDER_REVIEW: 'UNDER_REVIEW',
  APPROVED: 'APPROVED',
  AWAITING_PAYMENT: 'AWAITING_PAYMENT',
  CARD_ISSUED: 'CARD_ISSUED',
  ACTIVE: 'ACTIVE',
  REJECTED: 'REJECTED',
}

/**
 * Walk one file to its target status, through the real state machine.
 *
 * Resumable and idempotent: it reads the file's actual status each time round
 * and performs the one step that moves it closer. A file already at its target
 * does nothing at all, which is what makes re-running the seed safe.
 */
async function walk(
  broker: DemoBroker,
  applicationId: string,
  owner: User,
  officials: Officials,
): Promise<string[]> {
  const trail: string[] = []
  const target = TARGET_STATUS[broker.stage]

  const statusOf = async (): Promise<ApplicationStatus> =>
    (await db.application.findUnique({ where: { id: applicationId }, select: { status: true } }))
      ?.status ?? 'DRAFT'

  const clerk = actorFor(officials.clerk)
  const issuer = actorFor(officials.issuer)

  // A bound rather than `while (true)`: nine steps is the longest path, and a
  // loop that cannot terminate is worse than one that gives up.
  for (let guard = 0; guard < 12; guard += 1) {
    const status = await statusOf()
    if (status === target) break

    if (status === 'DRAFT') {
      const result = await submitApplication(actorFor(owner), applicationId)
      if (!result.ok) {
        trail.push(`SUBMIT REFUSED — ${result.violation.code}`)
        return trail
      }
      trail.push('submitted')
      continue
    }

    if (status === 'SUBMITTED') {
      const result = await performIntake(clerk, { applicationId, pageCount: 14 })
      if (!result.ok) {
        trail.push(`INTAKE REFUSED — ${result.violation.code}`)
        return trail
      }
      trail.push('intake')
      continue
    }

    if (status === 'UNDER_INTAKE') {
      // Spread the files across the two examiners, so REQ-REG-052 has something
      // to enforce and neither queue belongs to one person.
      const examinerUser = broker.capital % 2 === 0 ? officials.examiner : officials.examiner2
      const result = await performAssignExaminer(clerk, {
        applicationId,
        examinerId: examinerUser.id,
      })
      if (!result.ok) {
        trail.push(`ASSIGN REFUSED — ${result.violation.code}`)
        return trail
      }
      trail.push(`assigned to ${examinerUser.name}`)
      continue
    }

    if (status === 'UNDER_EXAMINATION') {
      const result = await examine(broker, applicationId, officials, target)
      trail.push(...result)
      if (result.some((line) => line.includes('REFUSED'))) return trail
      continue
    }

    if (status === 'UNDER_REVIEW') {
      const result = await decide(broker, applicationId, officials)
      trail.push(...result)
      if (result.some((line) => line.includes('REFUSED'))) return trail
      continue
    }

    if (status === 'APPROVED') {
      const result = await recordFees(applicationId, issuer)
      trail.push(...result)
      if (result.some((line) => line.includes('REFUSED'))) return trail
      continue
    }

    if (status === 'AWAITING_PAYMENT') {
      const result = await performIssueCard(issuer, { applicationId })
      if (!result.ok) {
        trail.push(`ISSUANCE REFUSED — ${result.violation.code}`)
        return trail
      }
      trail.push('card issued')
      continue
    }

    if (status === 'CARD_ISSUED') {
      const result = await performRecordDelivery(issuer, {
        applicationId,
        deliveredToName: broker.ownerNameAr,
        renewalDateAcknowledged: true,
        numberObligationAcknowledged: true,
      })
      if (!result.ok) {
        trail.push(`DELIVERY REFUSED — ${result.violation.code}`)
        return trail
      }
      trail.push('delivered')
      continue
    }

    // AWAITING_COMPLETION waits on the applicant; REJECTED, WITHDRAWN, and
    // ACTIVE are terminal for this walk. None of them is something the seed
    // should pretend moved.
    break
  }

  // Steps 7 and 8 do not change the status, so they sit outside the loop.
  if ((await statusOf()) === 'ACTIVE' && target === 'ACTIVE') {
    const handled = await db.fileHandlingRecord.findUnique({ where: { applicationId } })

    if (!handled?.dataExtractedAt) {
      const extracted = await performDataExtraction(actorFor(officials.data), {
        applicationId,
        dataNote: 'استُخرجت بيانات الملف وقُيدت بقاعدة البيانات.',
      })
      trail.push(extracted.ok ? 'data extracted' : `DATA REFUSED — ${extracted.violation.code}`)
    }

    if (!handled?.filedAt) {
      const archived = await performArchive(actorFor(officials.files), {
        applicationId,
        pageCount: 14,
        serialRegisterNo: `S-${(Math.abs(hash(applicationId)) % 900) + 100}`,
        alphabeticalIndex: broker.tradeNameAr.slice(0, 12),
        fileReference: `F/${new Date().getUTCFullYear()}/${(Math.abs(hash(applicationId)) % 900) + 100}`,
      })
      trail.push(archived.ok ? 'archived' : `ARCHIVE REFUSED — ${archived.violation.code}`)
    }
  }

  return trail
}

/** Step 2 — either request completions, or complete the form and sign it. */
async function examine(
  broker: DemoBroker,
  applicationId: string,
  officials: Officials,
  target: ApplicationStatus,
): Promise<string[]> {
  const application = await db.application.findUnique({
    where: { id: applicationId },
    select: { examinerId: true },
  })

  const examinerUser =
    application?.examinerId === officials.examiner2.id ? officials.examiner2 : officials.examiner
  const examiner = actorFor(examinerUser)

  if (target === 'AWAITING_COMPLETION') {
    const requested = await performRequestCompletions(examiner, {
      applicationId,
      items: DEMO_COMPLETIONS.map((item) => ({
        checklistItemKey: item.checklistItemKey,
        descriptionAr: item.descriptionAr,
        descriptionEn: item.descriptionEn,
      })),
    })
    return [
      requested.ok ? 'completions requested' : `COMPLETIONS REFUSED — ${requested.violation.code}`,
    ]
  }

  const asOf = new Date()
  const validFrom = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()))
  const validTo = new Date(
    Date.UTC(validFrom.getUTCFullYear() + 5, validFrom.getUTCMonth(), validFrom.getUTCDate()),
  )
  const form = await ruleSet('EXAMINATION_FORM', { asOf })
  const refusing = broker.stage === 'REJECTED'

  const saved = await saveExaminationRecord(examiner, {
    applicationId,
    originalCount: 1,
    copyCount: 2,
    brokerageNature: broker.types,
    proposedValidFrom: validFrom,
    proposedValidTo: validTo,
    recommendation: refusing ? 'RECOMMEND_REFUSAL' : 'RECOMMEND_APPROVAL',
    examinerNote: refusing
      ? 'المستندات المقدمة لا تثبت مقر مزاولة النشاط، وصورة السجل التجاري غير مقروءة.'
      : 'روجعت المستندات أمام البيانات المقدمة ولم يظهر ما يخالفها.',
    // Every line except the copies count, which the examiner fills in rather
    // than verifies. A file with every box ticked and nothing to show for it is
    // the pattern Phase 4 looks for, so the seed does not manufacture one.
    verifiedFieldKeys: form.items.map((item) => item.key).filter((key) => key !== 'COPIES_COUNT'),
  })

  if (!saved.ok) return [`EXAMINATION REFUSED — ${saved.violation.code}`]

  const recommended = await performRecommend(examiner, { applicationId })
  if (!recommended.ok) {
    return ['review form completed', `RECOMMEND REFUSED — ${recommended.violation.code}`]
  }

  return ['review form completed', 'signed and passed for review']
}

/** Step 3 — the decision, by somebody who is not the examiner. REQ-REG-052. */
async function decide(
  broker: DemoBroker,
  applicationId: string,
  officials: Officials,
): Promise<string[]> {
  const application = await db.application.findUnique({
    where: { id: applicationId },
    select: { examinerId: true },
  })

  // With two reviewers in the register there is always one who did not examine
  // the file. The check is here so the seed cannot quietly produce a file that
  // breaks the rule it exists to demonstrate.
  const reviewerUser =
    officials.reviewer.id === application?.examinerId ? officials.reviewer2 : officials.reviewer

  const refusing = broker.stage === 'REJECTED'

  const decided = await performDecision(actorFor(reviewerUser), {
    applicationId,
    decision: refusing ? 'REJECT' : 'APPROVE',
    note: refusing
      ? 'رُفض الطلب لعدم إثبات مقر مزاولة النشاط ولعدم وضوح مستخرج السجل التجاري. يمكن التقدم بطلب جديد بعد استكمال المستندات.'
      : 'روجع الطلب ووُجد مستوفياً لشروط القيد.',
  })

  if (!decided.ok) return [`DECISION REFUSED — ${decided.violation.code}`]
  return [refusing ? 'refused' : 'approved']
}

/** Step 4 — the treasury receipt. */
async function recordFees(applicationId: string, issuer: ActorContext): Promise<string[]> {
  const fees = await ruleSet<{ mandatory: boolean }>('FEE_SCHEDULE', { asOf: new Date() })

  const result = await performRecordFees(issuer, {
    applicationId,
    paymentMethod: 'CASH',
    receiptNumber: `R-${new Date().getUTCFullYear()}/${(Math.abs(hash(applicationId)) % 9000) + 1000}`,
    bankName: null,
    bankBranch: null,
    chequeNumber: null,
    // Amounts as they would come off a treasury receipt. FEE_SCHEDULE carries
    // the headings and no tariff, because the legal reference states none —
    // see prisma/rule-sets/fee-schedule.ts.
    lines: fees.items
      .filter((item) => item.payload.mandatory)
      .map((item, index) => ({ feeKey: item.key, amount: [500, 1500, 300, 200, 100][index] ?? 100 })),
  })

  if (!result.ok) return [`FEES REFUSED — ${result.violation.code}`]
  return ['fees recorded']
}


/** A stable small integer from an id, so re-running produces the same numbers. */
function hash(value: string): number {
  let out = 0
  for (const ch of value) out = (out * 31 + ch.charCodeAt(0)) | 0
  return out
}

async function main() {
  const { values } = parseArgs({
    options: {
      reset: { type: 'boolean', default: false },
      'demonstration-deployment': { type: 'boolean', default: false },
    },
    allowPositionals: true,
  })

  const { hosted } = checkTarget(values['demonstration-deployment'])
  announceDemonstrationTarget(hosted)

  console.log('\nOsool — Phase 1 demonstration register\n')

  // ── Accounts ────────────────────────────────────────────────────────────
  console.log('Accounts')
  const admin = await ensureAccount({ ...OWNER_ADMIN, resetPassword: values.reset })
  console.log(`  ${admin.email.padEnd(30)} SYSTEM_ADMIN    (password set directly)`)

  const officialsByEmail = new Map<string, User>()
  for (const official of DEMO_OFFICIALS) {
    const user = await ensureAccount({
      email: official.email,
      name: official.name,
      nameAr: official.nameAr,
      role: official.role,
      password: DEV_PASSWORD,
      resetPassword: values.reset,
    })
    officialsByEmail.set(official.email, user)
    console.log(`  ${official.email.padEnd(30)} ${official.role.padEnd(15)} ${official.note}`)
  }

  const officials: Officials = {
    clerk: officialsByEmail.get('clerk@osool.test')!,
    examiner: officialsByEmail.get('examiner@osool.test')!,
    examiner2: officialsByEmail.get('examiner2@osool.test')!,
    reviewer: officialsByEmail.get('reviewer@osool.test')!,
    reviewer2: officialsByEmail.get('reviewer2@osool.test')!,
    issuer: officialsByEmail.get('issuer@osool.test')!,
    data: officialsByEmail.get('data@osool.test')!,
    files: officialsByEmail.get('files@osool.test')!,
  }

  // ── Brokers and their applications ──────────────────────────────────────
  console.log('\nApplications')

  for (const broker of DEMO_BROKERS) {
    let owner = await ensureAccount({
      email: broker.email,
      name: broker.ownerNameEn,
      nameAr: broker.ownerNameAr,
      role: 'BROKER_OWNER',
      password: DEV_PASSWORD,
      resetPassword: values.reset,
    })

    // Already seeded: leave it exactly as it stands. Re-walking a file would
    // append a second set of events describing movements that never happened.
    const existing = owner.brokerEntityId
      ? await db.application.findFirst({
          where: { brokerEntityId: owner.brokerEntityId },
          select: { id: true, status: true },
        })
      : null

    if (existing) {
      // Already present. Resume rather than skip, so an interrupted run leaves
      // no file stranded — and re-walking is safe because every step below
      // checks whether it has already happened.
      const resumed = await walk(broker, existing.id, owner, officials)
      const now = await db.application.findUnique({
        where: { id: existing.id },
        select: { status: true, temporaryNumber: true },
      })
      console.log(
        `  = ${broker.email.padEnd(26)} ${(now?.status ?? '?').padEnd(20)} ${
          now?.temporaryNumber ?? '—'
        }  ${resumed.length ? resumed.join(' → ') : 'already at its stage'}`,
      )
      continue
    }

    if (!owner.brokerEntityId) {
      const party = await db.party.create({
        data: {
          type: broker.establishmentType,
          nameAr: broker.tradeNameAr,
          nameEn: broker.tradeNameEn,
          nationality: 'مصرية',
        },
      })
      const entity = await db.brokerEntity.create({
        data: {
          partyId: party.id,
          tradeNameAr: broker.tradeNameAr,
          tradeNameEn: broker.tradeNameEn,
          tradeStyleAr: broker.tradeStyleAr,
          headOfficeAddress: broker.address,
          governorate: broker.governorate,
        },
      })
      owner = await db.user.update({
        where: { id: owner.id },
        data: { brokerEntityId: entity.id },
      })
    }

    const application = await db.application.create({
      data: {
        brokerEntityId: owner.brokerEntityId!,
        kind: 'NEW_REGISTRATION',
        status: 'DRAFT',
      },
    })

    await recordAuditEvent({
      action: 'APPLICATION_STARTED',
      entityType: 'Application',
      entityId: application.id,
      actorUserId: owner.id,
      actorRole: 'BROKER_OWNER',
      actorLabel: `${owner.name} (Broker owner)`,
      toState: 'DRAFT',
      ipAddress: '127.0.0.1',
      payload: { seeded: true, stage: broker.stage },
    })

    // The deliberately incomplete draft stops here: no entity data, no
    // documents, no declarations. It is what an abandoned application looks
    // like, and the portal has to handle it.
    if (broker.stage !== 'DRAFT_INCOMPLETE') {
      await fillDraft(broker, application.id, owner)
    }

    const trail = await walk(broker, application.id, owner, officials)
    const final = await db.application.findUnique({
      where: { id: application.id },
      select: { status: true, temporaryNumber: true },
    })

    console.log(
      `  + ${broker.email.padEnd(26)} ${(final?.status ?? '?').padEnd(20)} ${
        final?.temporaryNumber ?? '—'
      }  ${trail.join(' → ')}`,
    )
  }

  const [applications, registrations, events, documents] = await Promise.all([
    db.application.count(),
    db.registration.count(),
    db.applicationEvent.count(),
    db.document.count(),
  ])

  console.log('\nRegister now holds')
  console.log(`  applications      ${applications}`)
  console.log(`  registrations     ${registrations}`)
  console.log(`  workflow events   ${events}`)
  console.log(`  documents         ${documents}`)

  console.log('\n─────────────────────────────────────────────────────────────────────')
  console.log('DEMONSTRATION ACCOUNTS — PUBLISHED PASSWORDS. NOT A REGISTER OF RECORD.')
  console.log(`  ${OWNER_ADMIN.email}  /  ${OWNER_ADMIN.password}`)
  console.log(`  every other account below  /  ${DEV_PASSWORD}`)
  console.log('─────────────────────────────────────────────────────────────────────')
  console.log(`\nSign in at ${hosted ? (process.env.APP_URL ?? '<APP_URL>') : 'http://localhost:3000'}\n`)

  await closePdfBrowser()
  await db.$disconnect()
}

main().catch(async (error) => {
  console.error(`\n${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`)
  await closePdfBrowser().catch(() => {})
  await db.$disconnect()
  process.exit(1)
})
