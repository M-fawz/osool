import { randomBytes } from 'node:crypto'
import type { Application, BrokerEntity, Role, User } from '@prisma/client'
import { db } from '@/lib/db'
import { recordAuditEvent } from '@/lib/audit'
import { encryptPii, piiFingerprint } from '@/lib/crypto/pii'
import { resolveDeclarations } from '@/lib/rules/declarations'
import { resolveDocumentChecklist } from '@/lib/rules/documents'
import { putDocument, sha256, storageKeyFor } from '@/lib/storage'
import type { ActorContext } from '@/lib/applications/transition'

/**
 * Fixtures for the integration suite.
 *
 * Everything here is *appended*. Nothing is torn down, because this product has
 * no delete — the statement-level guards installed by the Phase 0 migrations
 * refuse a DELETE on every case table, and a test suite that tried to clean up
 * after itself would fail on its own first teardown. So each run gets its own
 * namespace (`t-<random>`) and simply leaves its rows behind, exactly as a real
 * register accumulates them.
 *
 * Users are created with a direct insert rather than through Better Auth's
 * sign-up endpoint: these fixtures never sign in, they only act as an
 * `ActorContext`, and going through the HTTP layer to get a row would make
 * every test depend on the auth stack being configured.
 */

export function ns(): string {
  return randomBytes(4).toString('hex')
}

export async function makeUser(input: {
  role: Role
  name?: string
  nameAr?: string
  status?: 'ACTIVE' | 'SUSPENDED' | 'PENDING_ACTIVATION'
  brokerEntityId?: string | null
}): Promise<User> {
  const tag = ns()
  return db.user.create({
    data: {
      email: `test.${input.role.toLowerCase()}.${tag}@osool.test`,
      name: input.name ?? `Test ${input.role} ${tag}`,
      nameAr: input.nameAr ?? `اختبار ${tag}`,
      emailVerified: true,
      role: input.role,
      status: input.status ?? 'ACTIVE',
      brokerEntityId: input.brokerEntityId ?? null,
    },
  })
}

export function actor(user: User, overrides: Partial<ActorContext> = {}): ActorContext {
  return {
    userId: user.id,
    role: user.role,
    name: user.name,
    brokerEntityId: user.brokerEntityId,
    ipAddress: '127.0.0.1',
    userAgent: 'vitest',
    ...overrides,
  }
}

export async function makeBrokerEntity(input: { tradeNameAr?: string } = {}): Promise<BrokerEntity> {
  const tag = ns()
  const party = await db.party.create({
    data: {
      type: 'LEGAL_PERSON',
      nameAr: input.tradeNameAr ?? `منشأة اختبار ${tag}`,
      nameEn: `Test Firm ${tag}`,
      nationality: 'مصرية',
    },
  })

  return db.brokerEntity.create({
    data: {
      partyId: party.id,
      tradeNameAr: input.tradeNameAr ?? `منشأة اختبار ${tag}`,
      tradeNameEn: `Test Firm ${tag}`,
      headOfficeAddress: '١ شارع الاختبار، القاهرة',
      governorate: 'CAIRO',
    },
  })
}

/** A broker owner with their own firm, which is the pair every case needs. */
export async function makeBroker(): Promise<{ user: User; entity: BrokerEntity }> {
  const entity = await makeBrokerEntity()
  const user = await makeUser({ role: 'BROKER_OWNER', brokerEntityId: entity.id })
  return { user, entity }
}

/**
 * A draft application with enough on it to be submitted.
 *
 * Category C against 90,000 EGP clears the REQ-REG-021 capital floor in the
 * seeded BROKER_CATEGORY rule set, so a completeness evaluation of this
 * application fails on documents and declarations, never on capital.
 */
export async function makeApplication(input: {
  brokerEntityId: string
  status?: Application['status']
  examinerId?: string | null
  reviewerId?: string | null
}): Promise<Application> {
  const tag = ns()
  const applicantParty = await db.party.create({
    data: {
      type: 'NATURAL_PERSON',
      nameAr: `مقدم الطلب ${tag}`,
      nameEn: `Applicant ${tag}`,
      nationality: 'مصري',
      nationalIdEnc: encryptPii(`2${randomBytes(7).toString('hex').replace(/\D/g, '0').padEnd(13, '5')}`),
      nationalIdHash: piiFingerprint(`test-${tag}`),
    },
  })

  return db.application.create({
    data: {
      brokerEntityId: input.brokerEntityId,
      kind: 'NEW_REGISTRATION',
      status: input.status ?? 'DRAFT',
      applicantCapacity: 'SOLE_TRADER',
      applicantPartyId: applicantParty.id,
      requestedCategory: 'C',
      requestedTypes: ['SELL'],
      paidUpCapital: 90_000,
      examinerId: input.examinerId ?? null,
      reviewerId: input.reviewerId ?? null,
      submittedAt: input.status && input.status !== 'DRAFT' ? new Date() : null,
    },
  })
}

/** Silences the audit trail's expectation of an actor for fixture-only writes. */
export async function noteFixture(entityId: string, what: string): Promise<void> {
  await recordAuditEvent({
    action: 'TEST_FIXTURE_CREATED',
    entityType: 'Application',
    entityId,
    actorLabel: 'vitest fixtures',
    reason: what,
  })
}

/** A one-pixel PNG. Content-addressed, so every fixture stores it exactly once. */
export const PLACEHOLDER_SCAN = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/**
 * A draft carried all the way to submittable.
 *
 * Entity data, one brokerage contract, every required document on the
 * DOC_CHECKLIST, and all fifteen declarations affirmed — which is what
 * `evaluateCompleteness` needs to return no gaps. Built by asking the same
 * resolvers the evaluator asks, so the fixture cannot drift from the rule sets:
 * add a document to the checklist and this keeps producing a submittable draft.
 */
export async function makeSubmittableApplication(): Promise<{
  user: User
  entity: BrokerEntity
  application: Application
}> {
  const { user, entity } = await makeBroker()
  const application = await makeApplication({ brokerEntityId: entity.id, status: 'DRAFT' })
  const asOf = new Date()
  const tag = ns()

  await db.applicationEntityData.create({
    data: {
      applicationId: application.id,
      tradeNameAr: `منشأة اختبار ${tag}`,
      tradeNameEn: `Test Firm ${tag}`,
      establishmentType: 'NATURAL_PERSON',
      headOfficeAddress: '١ شارع الاختبار، القاهرة',
      governorate: 'CAIRO',
      commercialRegisterNo: `CR-${tag}`,
      commercialRegisterOffice: 'القاهرة',
      commercialRegisterDate: new Date('2024-01-01'),
      taxRegistrationNo: `TX-${tag}`,
      taxOffice: 'وسط القاهرة',
      telephone: '0223456789',
      email: `firm.${tag}@osool.test`,
    },
  })

  await db.applicationContractData.create({
    data: {
      applicationId: application.id,
      position: 1,
      clientNameAr: 'عميل الاختبار',
      clientNameEn: 'Test Client',
      clientNationality: 'مصري',
      authenticationNumber: `AUTH-${tag}`,
      authenticationBody: 'REAL_ESTATE_PUBLICITY',
      validFrom: new Date('2026-01-01'),
      validTo: new Date('2027-01-01'),
      capacityActedIn: 'SELL',
      contractValue: 500_000,
      subjectDescription: 'شقة سكنية',
      subjectAddress: '٢ شارع الاختبار',
      governorate: 'CAIRO',
    },
  })

  const checklist = await resolveDocumentChecklist(
    { establishmentType: 'NATURAL_PERSON', capacity: 'SOLE_TRADER' },
    { asOf },
  )
  const hash = sha256(PLACEHOLDER_SCAN)
  await putDocument({
    bytes: PLACEHOLDER_SCAN,
    mimeType: 'image/png',
    originalFilename: 'scan.png',
  })

  for (const item of checklist.items.filter((i) => i.required)) {
    await db.document.create({
      data: {
        kind: 'APPLICANT_UPLOAD',
        checklistItemKey: item.key,
        applicationId: application.id,
        sha256: hash,
        storageKey: storageKeyFor(hash),
        sizeBytes: PLACEHOLDER_SCAN.byteLength,
        mimeType: 'image/png',
        originalFilename: `${item.key}.png`,
        uploadedByUserId: user.id,
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
        textEn: item.payload.textEn ?? null,
        affirmed: true,
      },
    })
  }

  return { user, entity, application }
}
