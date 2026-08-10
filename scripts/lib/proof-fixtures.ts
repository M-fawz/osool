import type { Role, User } from '@prisma/client'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { recordAuditEvent } from '@/lib/audit'
import { encryptPii, piiFingerprint } from '@/lib/crypto/pii'
import { resolveDeclarations } from '@/lib/rules/declarations'
import { resolveDocumentChecklist } from '@/lib/rules/documents'
import { putDocument, sha256, storageKeyFor } from '@/lib/storage'

/**
 * The fixtures the Phase 1 proof needs, and nothing more.
 *
 * Two brokers whose applications the proof walks from end to end, and one
 * official who is first an examiner and then a reviewer, which is the shape
 * REQ-REG-052 actually has to defend against.
 *
 * A *fresh* draft is prepared on every run rather than reusing the last one.
 * Re-walking a file that has already reached ACTIVE would append events for
 * movements that never happened, and the whole value of the proof is that the
 * trail it prints is real. Nothing is deleted to make room: the register simply
 * gains one more application each time the proof is run, which is exactly what
 * "nothing is ever deleted" means in practice.
 */

const PROOF_PASSWORD = 'DevOnly!Osool2026'

async function ensure(input: {
  email: string
  name: string
  nameAr: string
  role: Role
}): Promise<User> {
  const existing = await db.user.findUnique({ where: { email: input.email } })

  if (existing) {
    return db.user.update({
      where: { id: existing.id },
      data: { role: input.role, status: 'ACTIVE', name: input.name, nameAr: input.nameAr },
    })
  }

  const created = await auth.api.signUpEmail({
    body: { email: input.email, password: PROOF_PASSWORD, name: input.name },
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
    actorLabel: 'phase-1 proof fixtures (command line)',
    toState: 'ACTIVE',
    reason: `Proof fixture account created for ${input.email}.`,
    payload: { email: input.email, role: input.role },
  })

  return user
}

/** A one-pixel-free stand-in scan. Content-addressed, so it is stored once. */
const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

async function prepareBroker(input: {
  email: string
  name: string
  nameAr: string
  nationalId: string
  tradeNameAr: string
  tradeNameEn: string
}) {
  const owner = await ensure({
    email: input.email,
    name: input.name,
    nameAr: input.nameAr,
    role: 'BROKER_OWNER',
  })

  let brokerEntityId = owner.brokerEntityId

  if (!brokerEntityId) {
    const party = await db.party.create({
      data: {
        type: 'NATURAL_PERSON',
        nameAr: input.tradeNameAr,
        nameEn: input.tradeNameEn,
        nationality: 'مصرية',
      },
    })
    const entity = await db.brokerEntity.create({
      data: {
        partyId: party.id,
        tradeNameAr: input.tradeNameAr,
        tradeNameEn: input.tradeNameEn,
        headOfficeAddress: '٥ شارع البستان، وسط البلد، القاهرة',
        governorate: 'CAIRO',
      },
    })
    await db.user.update({ where: { id: owner.id }, data: { brokerEntityId: entity.id } })
    brokerEntityId = entity.id
  }

  // Already has a draft waiting? Reuse it — the proof has not run yet, or the
  // last run stopped before submitting.
  const waiting = await db.application.findFirst({
    where: { brokerEntityId, status: 'DRAFT', archivedAt: null },
  })
  if (waiting) return { owner: { ...owner, brokerEntityId }, applicationId: waiting.id }

  const applicantParty = await db.party.create({
    data: {
      type: 'NATURAL_PERSON',
      nameAr: input.nameAr,
      nameEn: input.name,
      nationality: 'مصري',
      nationalIdEnc: encryptPii(input.nationalId),
      nationalIdHash: piiFingerprint(input.nationalId),
    },
  })

  const application = await db.application.create({
    data: {
      brokerEntityId,
      kind: 'NEW_REGISTRATION',
      status: 'DRAFT',
      applicantCapacity: 'SOLE_TRADER',
      applicantPartyId: applicantParty.id,
      requestedCategory: 'C',
      requestedTypes: ['SELL'],
      paidUpCapital: 90_000,
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
    reason: 'Prepared for the Phase 1 proof.',
    payload: { proofFixture: true },
  })

  await db.applicationEntityData.create({
    data: {
      applicationId: application.id,
      establishmentType: 'NATURAL_PERSON',
      tradeNameAr: input.tradeNameAr,
      tradeNameEn: input.tradeNameEn,
      headOfficeAddress: '٥ شارع البستان، وسط البلد، القاهرة',
      governorate: 'CAIRO',
      telephone: '01099887766',
      commercialRegisterNo: '204118',
      commercialRegisterOffice: 'مكتب سجل تجاري وسط القاهرة',
      commercialRegisterDate: new Date('2024-05-06T00:00:00.000Z'),
      commercialRegisterRenewalDate: new Date('2029-05-06T00:00:00.000Z'),
      taxRegistrationNo: '771-204-338',
      taxOffice: 'مأمورية ضرائب وسط القاهرة',
    },
  })

  await db.applicationContractData.create({
    data: {
      applicationId: application.id,
      position: 1,
      clientNameAr: 'شركة البستان للتطوير العقاري',
      clientNameEn: 'El Bostan Real Estate Development',
      clientNationality: 'مصرية',
      authenticationBody: 'REAL_ESTATE_PUBLICITY',
      authenticationNumber: '6611/2026',
      validFrom: new Date('2026-03-01T00:00:00.000Z'),
      validTo: new Date('2027-02-28T00:00:00.000Z'),
      capacityActedIn: 'SELL',
      contractValue: 9_400_000,
      subjectDescription: 'وحدات سكنية بمشروع البستان، المرحلة الأولى',
      subjectAddress: '٥ شارع البستان، وسط البلد، القاهرة',
      governorate: 'CAIRO',
    },
  })

  const asOf = new Date()
  const checklist = await resolveDocumentChecklist(
    { establishmentType: 'NATURAL_PERSON', capacity: 'SOLE_TRADER' },
    { asOf },
  )

  const hash = sha256(PLACEHOLDER_PNG)
  await putDocument({
    bytes: PLACEHOLDER_PNG,
    mimeType: 'image/png',
    originalFilename: 'proof-scan.png',
  })

  for (const item of checklist.required) {
    await db.document.create({
      data: {
        kind: 'APPLICANT_UPLOAD',
        checklistItemKey: item.key,
        applicationId: application.id,
        sha256: hash,
        storageKey: storageKeyFor(hash),
        sizeBytes: PLACEHOLDER_PNG.byteLength,
        mimeType: 'image/png',
        originalFilename: `${item.key.toLowerCase()}.png`,
        uploadedByUserId: owner.id,
      },
    })
  }

  const declarations = await resolveDeclarations({ asOf })
  for (const item of declarations.items) {
    await db.declaration.create({
      data: {
        applicationId: application.id,
        declarationKey: item.key,
        textAr: item.payload.textAr,
        textEn: item.payload.textEn,
        affirmed: true,
        assertedAt: new Date(),
        ipAddress: '127.0.0.1',
        ruleSetId: declarations.ruleSetId,
      },
    })
  }

  return { owner: { ...owner, brokerEntityId }, applicationId: application.id }
}

export default async function prepareProofFixtures() {
  await ensure({
    email: 'proof-dual@osool.test',
    name: 'Proof Dual-Role Officer',
    nameAr: 'موظف الاختبار مزدوج الصلاحية',
    role: 'EXAMINER',
  })

  await prepareBroker({
    email: 'proof-broker@osool.test',
    name: 'Proof Broker Owner',
    nameAr: 'صاحب منشأة الاختبار',
    nationalId: '28801150134567',
    tradeNameAr: 'مؤسسة البستان للوساطة العقارية',
    tradeNameEn: 'El Bostan Real Estate Brokerage',
  })

  await prepareBroker({
    email: 'proof-sod@osool.test',
    name: 'Proof SoD Broker',
    nameAr: 'منشأة اختبار فصل الاختصاصات',
    nationalId: '28304200121198',
    tradeNameAr: 'مؤسسة الاختبار لفصل الاختصاصات',
    tradeNameEn: 'Segregation Test Brokerage',
  })
}
